import { NextRequest, NextResponse } from 'next/server'
import { getDatabase, db_helpers } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { validateBody, createMessageSchema } from '@/lib/validation'
import { mutationLimiter } from '@/lib/rate-limit'
import { logger } from '@/lib/logger'
import { scanForInjection } from '@/lib/injection-guard'
import { scanForSecrets } from '@/lib/secret-scanner'
import { logSecurityEvent } from '@/lib/security-events'
import { mkdir, appendFile } from 'fs/promises'
import { join } from 'path'
import { homedir } from 'os'

export async function POST(request: NextRequest) {
  const auth = requireRole(request, 'operator')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const rateCheck = mutationLimiter(request)
  if (rateCheck) return rateCheck

  try {
    const result = await validateBody(request, createMessageSchema)
    if ('error' in result) return result.error
    const { to, message } = result.data
    const from = auth.user.display_name || auth.user.username || 'system'

    // Scan message for injection
    const injectionReport = scanForInjection(message, { context: 'prompt' })
    if (!injectionReport.safe) {
      const criticals = injectionReport.matches.filter(m => m.severity === 'critical')
      if (criticals.length > 0) {
        logger.warn({ to, rules: criticals.map(m => m.rule) }, 'Blocked agent message: injection detected')
        return NextResponse.json(
          { error: 'Message blocked: potentially unsafe content detected', injection: criticals.map(m => ({ rule: m.rule, description: m.description })) },
          { status: 422 }
        )
      }
    }

    const secretHits = scanForSecrets(message)
    if (secretHits.length > 0) {
      try { logSecurityEvent({ event_type: 'secret_exposure', severity: 'critical', source: 'agent-message', agent_name: from, detail: JSON.stringify({ count: secretHits.length, types: secretHits.map(s => s.type) }), workspace_id: auth.user.workspace_id ?? 1, tenant_id: 1 }) } catch {}
    }

    const db = getDatabase()
    const workspaceId = auth.user.workspace_id ?? 1;
    const agent = db
      .prepare('SELECT * FROM agents WHERE name = ? AND workspace_id = ?')
      .get(to, workspaceId) as any
    if (!agent) {
      return NextResponse.json({ error: 'Recipient agent not found' }, { status: 404 })
    }

    // 仙秦: 三通道投递 — steer(实时) + inbox(2min兜底) + board(群聊记录)
    const msgsDir = join(homedir(), '.xianqin', 'msgs')
    await mkdir(msgsDir, { recursive: true })
    const timestamp = new Date().toISOString()
    const line = `[${timestamp}] [${from}]: ${message}\n`

    // 通道1: 写入个人 inbox（兜底，下次 cron 必达）
    const inboxFile = join(msgsDir, `${to}.inbox`)
    await appendFile(inboxFile, line)

    // 通道2: 写入公共消息板（群聊记录）
    const boardFile = join(msgsDir, 'board.log')
    await appendFile(boardFile, `[${timestamp}] 📨 ${from}→${to}: ${message.substring(0, 120)}\n`)

    // 通道3: 尝试 /steer 到目标 agent 的活跃 session（best-effort）

    db_helpers.createNotification(
      to, 'message', 'Direct Message',
      `${from}: ${message.substring(0, 200)}${message.length > 200 ? '...' : ''}`,
      'agent', agent.id, workspaceId
    )

    db_helpers.logActivity(
      'agent_message', 'agent', agent.id, from,
      `Sent message to ${to}`, { to }, workspaceId
    )

    return NextResponse.json({ success: true, agent: to })
  } catch (error) {
    logger.error({ err: error as any }, 'POST /api/agents/message error')
    return NextResponse.json({ error: 'Failed to send message' }, { status: 500 })
  }
}
