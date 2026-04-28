'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { useTranslations } from 'next-intl'

// ── Types ────────────────────────────────────────────────────

interface Task {
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
  completed_at: number | null
}

interface Project {
  id: number
  name: string
  slug: string
  status: string
  color?: string
}

interface TreeNode {
  task: Task
  children: TreeNode[]
  level: number
}

// ── Status config ─────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  done:        { label: '✅', color: '#22c55e', bg: 'rgba(34,197,94,0.1)' },
  completed:   { label: '✅', color: '#22c55e', bg: 'rgba(34,197,94,0.1)' },
  in_progress: { label: '🔄', color: '#3b82f6', bg: 'rgba(59,130,246,0.1)' },
  assigned:    { label: '⏳', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
  awaiting_owner: { label: '⏳', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' },
  inbox:       { label: '📥', color: '#6b7280', bg: 'rgba(107,114,128,0.1)' },
  review:      { label: '🔍', color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)' },
  quality_review: { label: '🔍', color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)' },
  failed:      { label: '⏸', color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
  blocked:     { label: '⏸', color: '#ef4444', bg: 'rgba(239,68,68,0.1)' },
}

const PRIORITY_COLORS: Record<string, string> = {
  critical: '#ef4444',
  high: '#f59e0b',
  medium: '#3b82f6',
  low: '#6b7280',
}

// ── Helpers ───────────────────────────────────────────────────

function buildTree(tasks: Task[], parentId: number | null, level: number): TreeNode[] {
  return tasks
    .filter(t => t.parent_id === parentId)
    .sort((a, b) => (a.created_at || 0) - (b.created_at || 0))
    .map(task => ({
      task,
      children: buildTree(tasks, task.id, level + 1),
      level,
    }))
}

function formatDate(ts: number | null): string {
  if (!ts || ts < 100000) return ''
  const d = new Date(ts * 1000)
  return `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}

function taskBg(status: string): string {
  const bg = STATUS_CONFIG[status]?.bg
  // Strip any inline alpha since we use Tailwind opacity classes instead
  return ''
}

// ── Component ─────────────────────────────────────────────────

export function TaskTreePanel() {
  const t = useTranslations('taskBoard')
  const [tasks, setTasks] = useState<Task[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set())
  const [, forceUpdate] = useState(0)

  useEffect(() => {
    async function load() {
      try {
        const [tRes, pRes] = await Promise.all([
          fetch('/api/tasks', { credentials: 'include' }),
          fetch('/api/projects', { credentials: 'include' }),
        ])
        const tData = tRes.ok ? await tRes.json() : {}
        const pData = pRes.ok ? await pRes.json() : {}
        setTasks(tData.tasks || [])
        setProjects(pData.projects || [])
        forceUpdate(n => n + 1)
      } catch (e) { /* silently use empty state */ }
    }
    load()
  }, [])

  // DEBUG: always show something
  const displayProjects = projects.length > 0 ? projects : [
    { id: 0, name: '加载中...', slug: 'loading', status: 'active', color: '#6b7280' }
  ]

  const [selectedTask, setSelectedTask] = useState<number | null>(null)

  const toggle = (id: number) => {
    setCollapsed(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const selectTask = (id: number) => {
    setSelectedTask(prev => prev === id ? null : id)
  }

  // Group tasks by project
  const projectGroups = useMemo(() => {
    const grouped: Map<number | null, Task[]> = new Map()
    for (const task of tasks) {
      const pid = task.project_id
      if (!grouped.has(pid)) grouped.set(pid, [])
      grouped.get(pid)!.push(task)
    }
    return grouped
  }, [tasks])


  return (
    <div className="task-tree-panel h-full overflow-auto">
      {/* Horizontal scroll wrapper */}
      <div className="min-w-max p-4">
        {displayProjects.map(project => {
          const projectTasks = projectGroups.get(project.id) || []
          const rootNodes = buildTree(projectTasks, null, 0)
          if (rootNodes.length === 0 && project.id !== 0) return null

          const doneCount = projectTasks.filter(t => t.status === 'done' || t.status === 'completed').length
          const totalCount = projectTasks.length
          const progressPct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0

          return (
            <div key={project.id} className="mb-6">
              {/* Project header */}
              <div className="flex items-center gap-2 mb-2 pl-1">
                <span
                  className="inline-block w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: project.color || '#6b7280' }}
                />
                <span className="font-semibold text-sm text-foreground">
                  {project.name}
                </span>
                <span className="text-xs text-muted-foreground">
                  {doneCount}/{totalCount}
                </span>
                {/* Mini progress bar */}
                <div className="flex-1 max-w-[80px] h-1.5 bg-surface-1 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-500 rounded-full transition-all"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>

              {/* Tree nodes */}
              <div className="ml-1">
                {rootNodes.map(node => (
                  <TreeNodeRow
                    key={node.task.id}
                    node={node}
                    collapsed={collapsed}
                    onToggle={toggle}
                    selectedTask={selectedTask}
                    onSelect={selectTask}
                  />
                ))}
              </div>
            </div>
          )
        })}

        {/* Orphan tasks (no project) */}
        {(() => {
          const orphans = projectGroups.get(null) || []
          if (orphans.length === 0) return null
          const rootNodes = buildTree(orphans, null, 0)
          return (
            <div className="mb-6">
              <div className="flex items-center gap-2 mb-2 pl-1">
                <span className="inline-block w-3 h-3 rounded-full bg-muted-foreground flex-shrink-0" />
                <span className="font-semibold text-sm text-foreground">未分类</span>
                <span className="text-xs text-muted-foreground">{orphans.length} 任务</span>
              </div>
              <div className="ml-1">
                {rootNodes.map(node => (
                  <TreeNodeRow key={node.task.id} node={node} collapsed={collapsed} onToggle={toggle} selectedTask={selectedTask} onSelect={selectTask} />
                ))}
              </div>
            </div>
          )
        })()}
      </div>
    </div>
  )
}

// ── Tree Node Row ─────────────────────────────────────────────

function TreeNodeRow({
  node,
  collapsed,
  onToggle,
  selectedTask,
  onSelect,
}: {
  node: TreeNode
  collapsed: Set<number>
  onToggle: (id: number) => void
  selectedTask: number | null
  onSelect: (id: number) => void
}) {
  const { task, children, level } = node
  const status = STATUS_CONFIG[task.status] || { label: '❓', color: '#6b7280', bg: 'transparent' }
  const hasChildren = children.length > 0
  const isCollapsed = collapsed.has(task.id)
  const priorityColor = PRIORITY_COLORS[task.priority] || '#6b7280'
  const indent = level * 24

  return (
    <>
      <div
        className="flex items-center gap-1.5 py-1 px-2 rounded-md hover:bg-surface-1/50 cursor-pointer transition-colors text-sm group"
        style={{ paddingLeft: `${12 + indent}px`, minWidth: `${400 + indent}px` }}
        onClick={() => onToggle(task.id)}
        onDoubleClick={() => onSelect(task.id)}
      >
        {/* Expand/collapse toggle */}
        <span className="w-4 h-4 flex items-center justify-center flex-shrink-0">
          {hasChildren ? (
            <svg
              className={`w-3 h-3 transition-transform ${isCollapsed ? '' : 'rotate-90'}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          ) : (
            <span className="text-[8px] text-muted-foreground/40">●</span>
          )}
        </span>

        {/* Status icon */}
        <span className="flex-shrink-0 w-5 text-center" title={task.status}>
          {status.label}
        </span>

        {/* Priority dot */}
        <span
          className="flex-shrink-0 w-1.5 h-1.5 rounded-full"
          style={{ backgroundColor: priorityColor }}
        />

        {/* Title */}
        <span className="truncate flex-1 min-w-0 text-foreground">
          <span className="text-[10px] text-muted-foreground/50 font-mono mr-1 select-none">#{task.id}</span>
          {task.title}
        </span>

        {/* Agent */}
        {task.assigned_to && (
          <span className="flex-shrink-0 text-xs px-1.5 py-0.5 rounded bg-surface-1 text-muted-foreground max-w-[80px] truncate">
            {task.assigned_to}
          </span>
        )}

        {/* Time */}
        <span className="flex-shrink-0 text-xs text-muted-foreground/60 w-[72px] text-right">
          {formatDate(task.created_at)}
        </span>

        {/* Completed check */}
        {task.completed_at && (
          <span className="flex-shrink-0 text-xs text-green-500">
            {formatDate(task.completed_at)}
          </span>
        )}
      </div>

      {/* Detail panel — shown on double-click */}
      {selectedTask === task.id && (
        <div
          className="ml-4 my-1 p-3 rounded-lg border border-border/50 bg-surface-1/30 text-xs"
          style={{ marginLeft: `${32 + indent}px` }}
        >
          {task.description && (
            <p className="text-muted-foreground mb-2 leading-relaxed whitespace-pre-wrap">{task.description}</p>
          )}
          <div className="flex gap-4 text-muted-foreground/70">
            <span>状态: <span className="text-foreground/90">{task.status}</span></span>
            <span>优先级: <span className="text-foreground/90">{task.priority}</span></span>
            {task.assigned_to && <span>负责人: <span className="text-foreground/90">{task.assigned_to}</span></span>}
            <span>创建: {formatDate(task.created_at)}</span>
          </div>
        </div>
      )}

      {/* Children */}
      {hasChildren && !isCollapsed && (
        <div className="border-l border-border/30 ml-4">
          {children.map(child => (
            <TreeNodeRow
              key={child.task.id}
              node={{ ...child, level: child.level }}
              collapsed={collapsed}
              onToggle={onToggle}
              selectedTask={selectedTask}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </>
  )
}
