import { NextRequest, NextResponse } from 'next/server'
import { getUserFromRequest } from '@/lib/auth'
import { getDatabase } from '@/lib/db'

/**
 * GET /api/whoami
 * Agent self-discovery: returns the calling agent's global_id, display_name, and metadata.
 *
 * Auth: API key (x-api-key or Authorization: Bearer) required.
 * The agent identifies itself via:
 *   1. X-Agent-Name header    → matches agents.name
 *   2. ?hostname=<host>       → matches agents.ssh_host or agents.name
 *
 * Returns 401 if unauthenticated, 404 if agent not found.
 */
export async function GET(request: NextRequest) {
  const user = getUserFromRequest(request)
  if (!user) {
    return NextResponse.json({ error: 'Authentication required — provide API key via x-api-key or Authorization: Bearer' }, { status: 401 })
  }

  const db = getDatabase()
  const workspaceId = user.workspace_id ?? 1
  const { searchParams } = new URL(request.url)

  // Resolve agent: prefer ?name= query param, then X-Agent-Name, then ?hostname=
  let agentName = searchParams.get('name')?.trim() || null

  if (!agentName) {
    agentName = user.agent_name?.trim() || null
  }

  if (!agentName) {
    const hostname = searchParams.get('hostname')?.trim()
    if (hostname) {
      // Try ssh_host first, then name
      const byHost = db.prepare(
        `SELECT name FROM agents WHERE ssh_host = ? AND workspace_id = ? LIMIT 1`
      ).get(hostname, workspaceId) as { name: string } | undefined
      if (byHost) {
        agentName = byHost.name
      } else {
        const byName = db.prepare(
          `SELECT name FROM agents WHERE name = ? AND workspace_id = ? LIMIT 1`
        ).get(hostname, workspaceId) as { name: string } | undefined
        if (byName) agentName = byName.name
      }
    }
  }

  if (!agentName) {
    return NextResponse.json(
      { error: 'Cannot identify agent. Provide X-Agent-Name header or ?hostname= query param.' },
      { status: 404 }
    )
  }

  // Fetch full agent profile
  const agent = db.prepare(
    `SELECT id, name, global_id, display_name, role, status,
            rank_title, rank_score, parent_global_id,
            ssh_host, ssh_user, gateway_port, wiki_repo,
            tags, metadata, session_key, soul_content,
            created_at, updated_at, workspace_id
     FROM agents WHERE name = ? AND workspace_id = ?`
  ).get(agentName, workspaceId) as Record<string, any> | undefined

  if (!agent) {
    return NextResponse.json({ error: `Agent '${agentName}' not found in database` }, { status: 404 })
  }

  // Parse JSON fields
  return NextResponse.json({
    global_id: agent.global_id,
    name: agent.name,
    display_name: agent.display_name || agent.name,
    role: agent.role,
    status: agent.status,
    rank_title: agent.rank_title || null,
    rank_score: agent.rank_score || 0,
    parent_global_id: agent.parent_global_id || null,
    ssh_host: agent.ssh_host || null,
    ssh_user: agent.ssh_user || null,
    gateway_port: agent.gateway_port || null,
    wiki_repo: agent.wiki_repo || null,
    tags: safeJsonParse(agent.tags) || [],
    metadata: safeJsonParse(agent.metadata) || {},
    session_key: agent.session_key || null,
    soul_content: agent.soul_content || null,
    created_at: agent.created_at,
    updated_at: agent.updated_at,
    workspace_id: agent.workspace_id,
  })
}

function safeJsonParse(raw: string | null): any {
  if (!raw) return null
  try { return JSON.parse(raw) } catch { return null }
}
