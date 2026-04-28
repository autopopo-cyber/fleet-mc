'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useTranslations } from 'next-intl'
import { useMissionControl } from '@/store'

// ── Types ────────────────────────────────────────────────────

interface PlanNode {
  id: number
  title: string
  description?: string
  status: string
  priority: string
  assigned_to: string | null
  project_id: number | null
  parent_id: number | null
  created_at: number
  updated_at: number
  gantt_start?: string
  gantt_end?: string
  module_tree?: string
  step_count?: number
  completed_steps?: number
  // Parsed from module_tree convention: "M1 > NAV > R2"
  milestone?: string
  module?: string
}

interface Project {
  id: number
  name: string
  slug: string
  status: string
  color?: string
}

interface Milestone {
  key: string
  label: string
  date: Date
  nodes: PlanNode[]
}

interface Dependency {
  from: number
  to: number
  parent?: boolean
}

// ── Constants ─────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  done: '#22c55e',
  completed: '#22c55e',
  in_progress: '#3b82f6',
  review: '#8b5cf6',
  quality_review: '#8b5cf6',
  assigned: '#f59e0b',
  inbox: '#6b7280',
  awaiting_owner: '#6b7280',
  failed: '#ef4444',
  blocked: '#ef4444',
}

const STATUS_LABELS: Record<string, string> = {
  done: '✅',
  completed: '✅',
  in_progress: '🔄',
  review: '🔍',
  quality_review: '🔍',
  assigned: '⏳',
  inbox: '📥',
  awaiting_owner: '⏳',
  failed: '⏸',
  blocked: '⏸',
}

// ── Helpers ───────────────────────────────────────────────────

function parseDate(s?: string): Date | null {
  if (!s) return null
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

function formatDate(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()}`
}

function formatDateFull(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function daysBetween(a: Date, b: Date): number {
  return Math.max(0, Math.ceil((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24)))
}

function parseModuleTree(moduleTree?: string): { milestone?: string; module?: string } {
  if (!moduleTree) return {}
  // Convention: "M1 > NAV > R2" or "NAV > R2"
  const parts = moduleTree.split('>').map(s => s.trim()).filter(Boolean)
  const milestone = parts.find(p => /^M\d/i.test(p))
  const module = parts.length >= 2 ? parts.slice(0, 2).join(' › ') : parts[0]
  return { milestone, module }
}

function parseDecisions(description?: string): string[] {
  if (!description) return []
  // Extract decisions from YAML-like markers or bullet points
  const decisions: string[] = []
  const lines = description.split('\n')
  let inDecisions = false
  for (const line of lines) {
    if (/^decisions?:/i.test(line.trim())) {
      inDecisions = true
      continue
    }
    if (inDecisions && /^\s*[-*]\s/.test(line)) {
      decisions.push(line.replace(/^\s*[-*]\s*/, '').trim())
    } else if (inDecisions && /^\w/.test(line)) {
      inDecisions = false
    }
    // Also catch "决策:" or "Decision:"
    const dm = line.match(/(?:决策|Decision)[:：]\s*(.+)/i)
    if (dm) decisions.push(dm[1].trim())
  }
  return decisions
}

// ── Main Component ────────────────────────────────────────────

export function PlanTreePanel() {
  const t = useTranslations()
  const mc = useMissionControl()
  const [tasks, setTasks] = useState<PlanNode[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedNode, setSelectedNode] = useState<number | null>(null)
  const [groupBy, setGroupBy] = useState<'project' | 'module' | 'milestone'>('project')
  const [zoomDays, setZoomDays] = useState<number>(0) // 0 = auto
  const containerRef = useRef<HTMLDivElement>(null)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      const [tRes, pRes] = await Promise.all([
        fetch('/api/tasks?limit=300', { credentials: 'include' }),
        fetch('/api/projects', { credentials: 'include' }),
      ])
      const tData = tRes.ok ? await tRes.json() : {}
      const pData = pRes.ok ? await pRes.json() : {}

      const rawTasks: PlanNode[] = (tData.tasks || []).map((t: any) => {
        const parsed = parseModuleTree(t.module_tree)
        return {
          ...t,
          milestone: parsed.milestone || undefined,
          module: parsed.module || undefined,
        }
      })
      setTasks(rawTasks)
      setProjects(pData.projects || [])
    } catch (err) {
      console.error('PlanTree fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData, mc?.lastRefresh])

  // ── Compute time range ────────────────────────────────────

  const timeRange = useMemo(() => {
    const withTime = tasks.filter(t => t.gantt_start || t.created_at)
    if (withTime.length === 0) {
      const now = new Date()
      return { start: new Date(now.getTime() - 7 * 86400000), end: new Date(now.getTime() + 7 * 86400000) }
    }
    let min = Infinity
    let max = -Infinity
    for (const t of withTime) {
      const s = parseDate(t.gantt_start) || new Date((t.created_at || 0) * 1000)
      const e = parseDate(t.gantt_end) || s
      if (s.getTime() < min) min = s.getTime()
      if (e.getTime() > max) max = e.getTime()
    }
    const start = new Date(min - 86400000)
    const end = new Date(max + 86400000)
    return { start, end }
  }, [tasks])

  const totalDays = zoomDays > 0
    ? zoomDays
    : Math.max(7, daysBetween(timeRange.start, timeRange.end))

  // ── Compute milestones ────────────────────────────────────

  const milestones = useMemo(() => {
    const map = new Map<string, Milestone>()
    for (const node of tasks) {
      const mKey = node.milestone
      if (!mKey) continue
      if (!map.has(mKey)) {
        // Estimate milestone date from earliest task
        const d = parseDate(node.gantt_start) || new Date((node.created_at || 0) * 1000)
        map.set(mKey, { key: mKey, label: `M${mKey.replace(/^M/i, '')}`, date: d, nodes: [] })
      }
      map.get(mKey)!.nodes.push(node)
    }
    // Sort by date
    return Array.from(map.values()).sort((a, b) => a.date.getTime() - b.date.getTime())
  }, [tasks])

  // ── Compute dependencies ──────────────────────────────────

  const dependencies = useMemo(() => {
    const deps: Dependency[] = []
    const taskMap = new Map<number, PlanNode>()
    for (const t of tasks) taskMap.set(t.id, t)

    for (const t of tasks) {
      // Parent-child dependencies
      if (t.parent_id && taskMap.has(t.parent_id)) {
        deps.push({ from: t.parent_id, to: t.id, parent: true })
      }
    }
    return deps
  }, [tasks])

  // ── Group nodes ───────────────────────────────────────────

  const groups = useMemo(() => {
    const map = new Map<string, PlanNode[]>()
    for (const node of tasks) {
      let key: string
      switch (groupBy) {
        case 'project':
          const proj = projects.find(p => p.id === node.project_id)
          key = proj?.name || '未分类'
          break
        case 'module':
          key = node.module || node.milestone || '未分类'
          break
        case 'milestone':
          key = node.milestone || '未分配里程碑'
          break
      }
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(node)
    }
    return Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([label, nodes]) => {
        // Sort nodes: by dependency order then by time
        const sorted = [...nodes].sort((a, b) => {
          const aTime = parseDate(a.gantt_start)?.getTime() || (a.created_at || 0) * 1000
          const bTime = parseDate(b.gantt_start)?.getTime() || (b.created_at || 0) * 1000
          return aTime - bTime
        })
        return { label, nodes: sorted, count: sorted.length }
      })
  }, [tasks, projects, groupBy])

  // ── Node position on timeline ─────────────────────────────

  const getNodePosition = (node: PlanNode): { left: number; width: number } | null => {
    const start = parseDate(node.gantt_start) || (node.created_at ? new Date(node.created_at * 1000) : null)
    if (!start) return null
    const end = parseDate(node.gantt_end) || new Date(start.getTime() + 86400000)
    const left = Math.max(0, daysBetween(timeRange.start, start))
    const width = Math.max(1, daysBetween(start, end) + 1)
    return {
      left: (left / totalDays) * 100,
      width: Math.max(1, (width / totalDays) * 100),
    }
  }

  const today = new Date()
  const todayOffsetPct = Math.max(0, Math.min(100, (daysBetween(timeRange.start, today) / totalDays) * 100))

  // ── SVG dependency lines data ─────────────────────────────

  const depLines = useMemo(() => {
    const nodePositions = new Map<number, { x: number; y: number }>()
    // We'll compute actual positions during render, but prepare the data
    return dependencies
  }, [dependencies])

  // ── Render ────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full" ref={containerRef}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div>
          <h2 className="text-lg font-semibold">Plan-Tree 时空作战图</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {tasks.length} 节点 · {milestones.length} 里程碑 · {dependencies.length} 依赖连线
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as any)}
            className="text-xs border border-border rounded px-2 py-1 bg-card"
          >
            <option value="project">按项目</option>
            <option value="module">按模块</option>
            <option value="milestone">按里程碑</option>
          </select>
          <select
            value={zoomDays}
            onChange={(e) => setZoomDays(Number(e.target.value))}
            className="text-xs border border-border rounded px-2 py-1 bg-card"
          >
            <option value="0">自动范围</option>
            <option value="7">7天</option>
            <option value="14">14天</option>
            <option value="30">30天</option>
            <option value="90">90天</option>
          </select>
          <button
            onClick={fetchData}
            className="text-xs border border-border rounded px-2 py-1 hover:bg-accent"
          >
            刷新
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          加载中...
        </div>
      ) : tasks.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-2">
          <span className="text-4xl">🌳</span>
          <p className="text-sm">暂无任务数据</p>
          <p className="text-xs">在 MC 中创建任务后将在此显示时空视图</p>
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          {/* Timeline header */}
          <div className="sticky top-0 z-20 bg-background border-b border-border">
            {/* Milestone row */}
            <div className="flex border-b border-border/30">
              <div className="w-48 shrink-0 px-3 py-1 text-[10px] font-medium text-muted-foreground border-r border-border">
                里程碑
              </div>
              <div className="flex-1 relative py-1" style={{ minHeight: 24 }}>
                {milestones.map((m, i) => {
                  const offset = daysBetween(timeRange.start, m.date)
                  const pct = Math.max(0, Math.min(100, (offset / totalDays) * 100))
                  return (
                    <div
                      key={m.key}
                      className="absolute top-0"
                      style={{ left: `${pct}%` }}
                    >
                      <div className="flex flex-col items-center -translate-x-1/2">
                        <div className="w-0.5 h-3 bg-purple-400" />
                        <span className="text-[9px] text-purple-500 dark:text-purple-400 font-bold whitespace-nowrap">
                          {m.label}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Date header */}
            <div className="flex">
              <div className="w-48 shrink-0 px-3 py-2 text-xs font-medium text-muted-foreground border-r border-border">
                节点 / 产物
              </div>
              <div className="flex-1 flex relative">
                {Array.from({ length: Math.min(totalDays, 60) }, (_, i) => {
                  const step = Math.max(1, Math.ceil(totalDays / 60))
                  const dayIndex = i * step
                  if (dayIndex >= totalDays) return null
                  const d = new Date(timeRange.start.getTime() + dayIndex * 86400000)
                  const isToday = d.toDateString() === today.toDateString()
                  const isWeekend = d.getDay() === 0 || d.getDay() === 6
                  return (
                    <div
                      key={i}
                      className={`flex-1 min-w-[16px] text-center text-[9px] py-2 border-r border-border/20 ${
                        isToday ? 'bg-blue-500/10 font-bold text-blue-600 dark:text-blue-400' : ''
                      } ${isWeekend ? 'text-muted-foreground/40' : 'text-muted-foreground'}`}
                    >
                      {formatDate(d)}
                    </div>
                  )
                })}
                {/* Today line */}
                {todayOffsetPct > 0 && todayOffsetPct < 100 && (
                  <div
                    className="absolute top-0 bottom-0 w-px bg-blue-400/60 z-10"
                    style={{ left: `${todayOffsetPct}%` }}
                  />
                )}
              </div>
            </div>
          </div>

          {/* Groups */}
          {groups.map((group) => (
            <div key={group.label}>
              {/* Group header */}
              <div className="flex items-center px-3 py-1.5 bg-muted/30 border-b border-border sticky left-0">
                <span className="text-xs font-medium text-muted-foreground">
                  {group.label}
                </span>
                <span className="text-[10px] text-muted-foreground/60 ml-2">
                  ({group.count} 节点)
                </span>
                {/* Group progress */}
                <span className="text-[10px] text-muted-foreground/60 ml-auto">
                  {(() => {
                    const done = group.nodes.filter(n => n.status === 'done' || n.status === 'completed').length
                    return `${done}/${group.count} 完成`
                  })()}
                </span>
              </div>

              {/* Nodes */}
              {group.nodes.map((node, nodeIdx) => {
                const pos = getNodePosition(node)
                const color = STATUS_COLORS[node.status] || '#6b7280'
                const statusLabel = STATUS_LABELS[node.status] || '❓'
                const decisions = parseDecisions(node.description)
                const isSelected = selectedNode === node.id
                const progress = node.step_count
                  ? Math.round((node.completed_steps || 0) / node.step_count * 100)
                  : node.status === 'done' ? 100 : 0
                const isParent = dependencies.some(d => d.from === node.id)
                const isChild = dependencies.some(d => d.to === node.id)

                return (
                  <div key={node.id} className="flex border-b border-border/30 hover:bg-accent/20 group">
                    {/* Label column */}
                    <div className="w-48 shrink-0 px-3 py-1.5 border-r border-border flex flex-col justify-center">
                      <div
                        className="text-xs truncate cursor-pointer flex items-center gap-1"
                        onClick={() => setSelectedNode(isSelected ? null : node.id)}
                        title={node.title}
                      >
                        <span>{statusLabel}</span>
                        {isParent && <span className="text-[9px] text-muted-foreground/50">↳</span>}
                        {isChild && <span className="text-[9px] text-muted-foreground/50">↰</span>}
                        <span className="truncate">{node.title}</span>
                        {decisions.length > 0 && (
                          <span className="text-[9px] text-amber-500 ml-0.5 flex-shrink-0" title={`${decisions.length} 决策点`}>
                            ◈
                          </span>
                        )}
                      </div>
                      {node.assigned_to && (
                        <span className="text-[9px] text-muted-foreground/50 truncate mt-0.5">
                          @{node.assigned_to}
                        </span>
                      )}
                    </div>

                    {/* Timeline area */}
                    <div className="flex-1 relative py-1.5" style={{ minHeight: 36 }}>
                      {/* Today line (per row) */}
                      {todayOffsetPct > 0 && todayOffsetPct < 100 && (
                        <div
                          className="absolute top-0 bottom-0 w-px bg-blue-400/20 z-0"
                          style={{ left: `${todayOffsetPct}%` }}
                        />
                      )}

                      {/* Dependency lines from parents (per row) */}
                      {node.parent_id && (() => {
                        // Draw a small connector at the left edge
                        return (
                          <div className="absolute top-1/2 left-0 w-2 border-t border-dashed border-muted-foreground/30" />
                        )
                      })()}

                      {/* Node bar */}
                      {pos && (
                        <div
                          className={`absolute top-1/2 -translate-y-1/2 rounded-sm cursor-pointer transition-all z-10 min-w-[8px] ${
                            isSelected ? 'ring-2 ring-white/50 shadow-lg scale-105' : ''
                          }`}
                          style={{
                            left: `${pos.left}%`,
                            width: `${pos.width}%`,
                            height: 20,
                            backgroundColor: color + '33',
                            borderLeft: `3px solid ${color}`,
                          }}
                          onClick={() => setSelectedNode(isSelected ? null : node.id)}
                          title={`${node.title}\n状态: ${node.status}\n进度: ${progress}%\n里程碑: ${node.milestone || '无'}`}
                        >
                          {/* Progress fill */}
                          <div
                            className="absolute inset-0 rounded-r-sm"
                            style={{
                              width: `${progress}%`,
                              backgroundColor: color + '44',
                            }}
                          />
                          {/* Milestone dot */}
                          {node.milestone && (
                            <div
                              className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-purple-400 border border-background"
                              title={`里程碑: ${node.milestone}`}
                            />
                          )}
                          {/* Label */}
                          <span className="absolute inset-0 flex items-center px-1 text-[9px] text-foreground/80 truncate">
                            {node.step_count ? `${progress}%` : ''}
                          </span>
                        </div>
                      )}

                      {/* No-time fallback: show as small dot */}
                      {!pos && (
                        <div
                          className="absolute top-1/2 -translate-y-1/2 w-2 h-2 rounded-full cursor-pointer z-10"
                          style={{ backgroundColor: color, left: `${nodeIdx * 2 + 1}%` }}
                          onClick={() => setSelectedNode(isSelected ? null : node.id)}
                          title={`${node.title} (无时间数据)`}
                        />
                      )}
                    </div>
                  </div>
                )
              })}

              {/* Dependency SVG overlay for this group */}
            </div>
          ))}

          {/* Detail panel for selected node */}
          {selectedNode && (() => {
            const node = tasks.find(t => t.id === selectedNode)
            if (!node) return null
            const decisions = parseDecisions(node.description)
            const parentTasks = tasks.filter(t => node.parent_id && t.id === node.parent_id)
            const childTasks = tasks.filter(t => t.parent_id === node.id)
            return (
              <div className="border-t border-border bg-muted/20 p-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="text-sm font-semibold flex items-center gap-2">
                      <span>{STATUS_LABELS[node.status]}</span>
                      <span style={{ color: STATUS_COLORS[node.status] }}>
                        #{node.id}
                      </span>
                      <span>{node.title}</span>
                    </h3>
                    <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                      <span>状态: <span className="text-foreground">{node.status}</span></span>
                      <span>优先级: <span className="text-foreground">{node.priority}</span></span>
                      <span>里程碑: <span className="text-foreground">{node.milestone || '未分配'}</span></span>
                      {node.assigned_to && <span>负责人: <span className="text-foreground">{node.assigned_to}</span></span>}
                    </div>
                    {node.description && (
                      <p className="mt-2 text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
                        {node.description}
                      </p>
                    )}
                    {/* Dependencies */}
                    {(parentTasks.length > 0 || childTasks.length > 0) && (
                      <div className="mt-2 flex gap-4 text-xs">
                        {parentTasks.length > 0 && (
                          <span className="text-muted-foreground">
                            依赖上游: {parentTasks.map(t => t.title).join(', ')}
                          </span>
                        )}
                        {childTasks.length > 0 && (
                          <span className="text-muted-foreground">
                            下游任务: {childTasks.map(t => t.title).join(', ')}
                          </span>
                        )}
                      </div>
                    )}
                    {/* Decisions */}
                    {decisions.length > 0 && (
                      <div className="mt-2 p-2 rounded bg-amber-500/10 border border-amber-500/20">
                        <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400">
                          ◈ 决策记录
                        </span>
                        <ul className="mt-1 text-xs text-muted-foreground list-disc list-inside">
                          {decisions.map((d, i) => (
                            <li key={i}>{d}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => setSelectedNode(null)}
                    className="text-muted-foreground hover:text-foreground text-sm"
                  >
                    ✕
                  </button>
                </div>
                {/* Time info */}
                <div className="mt-3 flex gap-4 text-[10px] text-muted-foreground">
                  <span>创建: {node.created_at ? formatDateFull(new Date(node.created_at * 1000)) : '?'}</span>
                  <span>开始: {node.gantt_start ? formatDateFull(new Date(node.gantt_start)) : '未设定'}</span>
                  <span>结束: {node.gantt_end ? formatDateFull(new Date(node.gantt_end)) : '未设定'}</span>
                  {node.step_count && (
                    <span>进度: {node.completed_steps || 0}/{node.step_count}</span>
                  )}
                </div>
              </div>
            )
          })()}
        </div>
      )}

      {/* Footer legend */}
      <div className="flex items-center gap-3 px-4 py-2 border-t border-border text-[10px] text-muted-foreground flex-wrap">
        <span className="font-medium">状态:</span>
        {Object.entries(STATUS_COLORS).filter(([k]) =>
          ['done', 'in_progress', 'review', 'assigned', 'inbox', 'failed'].includes(k)
        ).map(([status, color]) => (
          <span key={status} className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: color, opacity: 0.7 }} />
            {status}
          </span>
        ))}
        <span className="mx-1">|</span>
        <span className="flex items-center gap-1">
          <span className="text-amber-500">◈</span> 决策点
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-purple-400" /> 里程碑
        </span>
        <span className="flex items-center gap-1">
          <span className="w-px h-3 bg-blue-400/60" /> 今天
        </span>
        <span className="ml-auto">模块树约定: M1 › NAV › R2</span>
      </div>
    </div>
  )
}
