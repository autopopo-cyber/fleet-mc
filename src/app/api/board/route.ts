import { NextRequest, NextResponse } from 'next/server'
import { readFile, appendFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { homedir } from 'os'

const BOARD = join(homedir(), '.xianqin', 'msgs', 'board.log')

async function ensureBoard() {
  await mkdir(join(homedir(), '.xianqin', 'msgs'), { recursive: true })
}

function parseBoard(raw: string) {
  const lines = raw.trim().split('\n').filter(Boolean)
  return lines.map(line => {
    const match = line.match(/^\[([^\]]+)\]\s+(\S+)\s+(.+)/)
    if (!match) return null
    const [, ts, sender, content] = match
    const atMatch = content.match(/@(\S+)/)
    return {
      timestamp: ts,
      sender: sender.replace(/[📨✅💬]/g, '').trim(),
      type: sender.includes('📨') ? 'msg' : sender.includes('✅') ? 'ack' : 'chat',
      content,
      mention: atMatch ? atMatch[1] : null,
    }
  }).filter(Boolean)
}

export async function GET() {
  await ensureBoard()
  try {
    const raw = await readFile(BOARD, 'utf-8')
    const messages = parseBoard(raw)
    return NextResponse.json({ messages: messages.slice(-50) })
  } catch {
    return NextResponse.json({ messages: [] })
  }
}

export async function POST(request: NextRequest) {
  await ensureBoard()
  try {
    const { content } = await request.json()
    if (!content) return NextResponse.json({ error: 'content required' }, { status: 400 })
    const ts = new Date().toISOString()
    const line = `[${ts}] 💬 Operator: ${content}\n`
    await appendFile(BOARD, line)
    return NextResponse.json({ success: true })
  } catch {
    return NextResponse.json({ error: 'Failed to post' }, { status: 500 })
  }
}
