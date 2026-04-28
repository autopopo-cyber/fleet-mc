import { NextRequest, NextResponse } from 'next/server'
import { getDatabase } from '@/lib/db'
import { requireRole } from '@/lib/auth'

/**
 * GET /api/agents/health
 * Check gateway health for all fleet agents (global_id 101-200).
 * Returns { agent_name, global_id, gateway_alive, latency_ms, error } for each.
 */
export async function GET(request: NextRequest) {
  const auth = requireRole(request, 'viewer')
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const db = getDatabase()
  const workspaceId = auth.user.workspace_id ?? 1

  // Get fleet agents with SSH/gateway info
  const agents = db.prepare(`
    SELECT global_id, name, ssh_host, ssh_user, gateway_port
    FROM agents
    WHERE global_id IS NOT NULL
      AND CAST(global_id AS INTEGER) BETWEEN 101 AND 200
      AND ssh_host IS NOT NULL
      AND gateway_port IS NOT NULL
      AND workspace_id = ?
    ORDER BY CAST(global_id AS INTEGER)
  `).all(workspaceId) as Array<{
    global_id: string
    name: string
    ssh_host: string
    ssh_user: string
    gateway_port: number
  }>

  // Check each gateway in parallel (with timeout)
  const results = await Promise.all(
    agents.map(async (agent) => {
      const start = Date.now()
      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 3000)

        const resp = await fetch(`http://${agent.ssh_host}:${agent.gateway_port}/health`, {
          signal: controller.signal,
        })
        clearTimeout(timeout)

        const latency = Date.now() - start
        const alive = resp.ok
        return {
          global_id: agent.global_id,
          name: agent.name,
          gateway_alive: alive,
          latency_ms: latency,
          port: agent.gateway_port,
        }
      } catch (err: any) {
        return {
          global_id: agent.global_id,
          name: agent.name,
          gateway_alive: false,
          latency_ms: Date.now() - start,
          port: agent.gateway_port,
          error: err.message || 'Connection failed',
        }
      }
    })
  )

  return NextResponse.json({ agents: results, checked_at: Date.now() })
}
