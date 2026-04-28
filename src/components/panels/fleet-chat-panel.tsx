'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

interface Message {
  timestamp: string
  sender: string
  type: 'msg' | 'ack' | 'chat'
  content: string
  mention: string | null
}

const AGENTS = ['白起','王翦','丞相','xiangbang','俊秀','雪莹','红婳','萱萱']

export function FleetChatPanel() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [atMenu, setAtMenu] = useState(false)
  const [atFilter, setAtFilter] = useState('')
  const [sending, setSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const fetchMessages = useCallback(async () => {
    try {
      const r = await fetch('/api/board')
      const d = await r.json()
      setMessages(d.messages || [])
    } catch {}
  }, [])

  useEffect(() => {
    fetchMessages()
    const t = setInterval(fetchMessages, 10000)
    return () => clearInterval(t)
  }, [fetchMessages])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  // @ autocomplete
  const cursorPos = input.lastIndexOf('@')
  const showAtMenu = cursorPos >= 0 && cursorPos === input.length - 1 - input.slice(cursorPos + 1).length
  const atText = input.slice(cursorPos + 1)
  const filteredAgents = AGENTS.filter(a => a.toLowerCase().includes((atFilter || atText).toLowerCase()))

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value
    setInput(v)
    const pos = v.lastIndexOf('@')
    if (pos >= 0) {
      setAtFilter(v.slice(pos + 1))
      setAtMenu(true)
    } else {
      setAtMenu(false)
    }
  }

  const insertAt = (agent: string) => {
    const pos = input.lastIndexOf('@')
    setInput(input.slice(0, pos) + '@' + agent + ' ')
    setAtMenu(false)
    inputRef.current?.focus()
  }

  const send = async () => {
    if (!input.trim() || sending) return
    setSending(true)
    try {
      await fetch('/api/board', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: input.trim() })
      })
      setInput('')
      fetchMessages()
    } catch {}
    setSending(false)
  }

  const formatTime = (ts: string) => {
    try {
      const d = new Date(ts)
      return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
    } catch { return ts }
  }

  return (
    <div className="fleet-chat-panel h-full flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div>
          <h2 className="text-sm font-semibold text-foreground">舰队大厅</h2>
          <p className="text-xs text-muted-foreground">Agent 群聊 · 输入 @ 点名</p>
        </div>
        <button
          onClick={fetchMessages}
          className="text-xs px-2 py-1 rounded bg-surface-1 text-muted-foreground hover:text-foreground"
        >
          刷新
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
        {messages.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-8">暂无消息</p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex gap-2 text-sm ${m.type === 'ack' ? 'opacity-60' : ''}`}>
            <span className="text-xs text-muted-foreground w-10 shrink-0 text-right">
              {formatTime(m.timestamp)}
            </span>
            <span className={`font-medium shrink-0 ${
              m.type === 'msg' ? 'text-blue-400' : 
              m.type === 'ack' ? 'text-green-400' : 'text-foreground'
            }`}>
              {m.sender}
            </span>
            <span className={`flex-1 min-w-0 break-words ${
              m.mention ? 'text-yellow-400/90' : 'text-foreground'
            }`}>
              {m.content}
            </span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t border-border shrink-0 relative">
        {showAtMenu && filteredAgents.length > 0 && (
          <div className="absolute bottom-14 left-3 right-3 bg-surface-1 border border-border rounded-lg shadow-lg z-10 max-h-32 overflow-y-auto">
            {filteredAgents.map(a => (
              <button
                key={a}
                onClick={() => insertAt(a)}
                className="block w-full text-left px-3 py-2 text-sm text-foreground hover:bg-surface-2"
              >
                @{a}
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <input
            ref={inputRef}
            value={input}
            onChange={handleInput}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            placeholder="输入消息，@ 点名 agent..."
            className="flex-1 bg-surface-1 border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <button
            onClick={send}
            disabled={!input.trim() || sending}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-40"
          >
            {sending ? '...' : '发送'}
          </button>
        </div>
      </div>
    </div>
  )
}
