import { NextRequest, NextResponse } from 'next/server'
import { getDatabase } from '@/lib/db'
import { requireRole } from '@/lib/auth'
import { execSync } from 'child_process'

/**
 * POST /api/agents/[id]/gateway-restart
 * Restart the gateway for a specific agent via SSH + systemctl.
 * Body: none (uses agent's ssh_host + ssh_user from DB).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = requireRole(request, 'operator')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const db = getDatabase()
  const workspaceId = auth.user.workspace_id ?? 1
  const resolvedParams = await params
  const agentId = resolvedParams.id

  // Resolve agent by global_id or name
  let agent: any
  if (/^\d+$/.test(agentId)) {
    agent = db.prepare(
      'SELECT global_id, name, ssh_host, ssh_user, gateway_port FROM agents WHERE global_id = ? AND workspace_id = ?'
    ).get(agentId, workspaceId)
  } else {
    agent = db.prepare(
      'SELECT global_id, name, ssh_host, ssh_user, gateway_port FROM agents WHERE name = ? AND workspace_id = ?'
    ).get(agentId, workspaceId)
  }

  if (!agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
  }

  if (!agent.ssh_host || !agent.ssh_user) {
    return NextResponse.json({ error: 'Agent has no SSH configuration' }, { status: 400 })
  }

  // Determine service name from global_id
  const serviceMap: Record<string, string> = {
    '105': 'hermes-gateway-xuanxuan',
    '106': 'hermes-gateway-junxiu',
    '107': 'hermes-gateway-xueying',
    '108': 'hermes-gateway-honghua',
  }
  const serviceName = serviceMap[agent.global_id] || 'hermes-gateway'

  try {
    const cmd = `ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no ${agent.ssh_user}@${agent.ssh_host} "systemctl --user restart ${serviceName}.service 2>&1 || systemctl --user start ${serviceName}.service 2>&1"`
    const output = execSync(cmd, { timeout: 15000, encoding: 'utf8' })
    return NextResponse.json({
      success: true,
      agent: agent.global_id,
      name: agent.name,
      service: serviceName,
      output: output.trim(),
    })
  } catch (err: any) {
    return NextResponse.json({
      success: false,
      agent: agent.global_id,
      name: agent.name,
      service: serviceName,
      error: err.stderr || err.message || 'SSH failed',
    }, { status: 500 })
  }
}
