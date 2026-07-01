/**
 * Task State Machine — 参考 Nezha TaskManager
 * 10个状态覆盖所有边界: todo/pending/running/input_required/done/failed/cancelled/interrupted/detached
 */

// ══════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════

export type TaskState =
  | 'todo'            // 待办
  | 'pending'         // 等待执行
  | 'running'         // 执行中
  | 'input_required'  // 需要用户输入
  | 'done'            // 完成
  | 'failed'          // 失败
  | 'cancelled'       // 已取消
  | 'interrupted'     // 被中断
  | 'detached'        // 进程断开

export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'

export interface Task {
  id: string
  title: string
  description: string
  state: TaskState
  priority: TaskPriority
  agent_id: string | null      // 执行此任务的 Agent
  project_id: string | null    // 所属项目
  session_id: string | null    // 关联的会话 ID
  worktree_branch: string | null // Git worktree 分支
  parent_task_id: string | null  // 父任务 (子任务支持)
  child_task_ids: string[]
  tags: string[]
  created_at: number
  updated_at: number
  started_at: number | null
  completed_at: number | null
  error: string | null
  result: string | null
  /** 用户故事标签 (参考 spec-kit) */
  user_story: string | null
  /** 是否可并行 (参考 spec-kit [P] 标记) */
  parallel: boolean
  /** 依赖的任务 ID 列表 */
  depends_on: string[]
}

// ══════════════════════════════════════════════
// 状态转换规则
// ══════════════════════════════════════════════

const VALID_TRANSITIONS: Record<TaskState, TaskState[]> = {
  todo:            ['pending', 'cancelled'],
  pending:         ['running', 'cancelled'],
  running:         ['input_required', 'done', 'failed', 'interrupted', 'detached'],
  input_required:  ['running', 'cancelled'],
  done:            [], // 终态
  failed:          ['pending', 'cancelled'], // 可重试
  cancelled:       [], // 终态
  interrupted:     ['pending', 'cancelled'], // 可重试
  detached:        ['pending', 'cancelled'], // 可重试
}

export function canTransition(from: TaskState, to: TaskState): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false
}

export function transition(task: Task, to: TaskState): Task {
  if (!canTransition(task.state, to)) {
    console.warn(`[Task] Invalid transition: ${task.state} → ${to} (task: ${task.id})`)
    return task
  }

  const now = Date.now()
  const updated: Task = { ...task, state: to, updated_at: now }

  switch (to) {
    case 'running':
      updated.started_at = updated.started_at ?? now
      break
    case 'done':
    case 'failed':
    case 'cancelled':
      updated.completed_at = now
      break
  }

  return updated
}

// ══════════════════════════════════════════════
// 状态标签
// ══════════════════════════════════════════════

export const TASK_STATE_LABELS: Record<TaskState, string> = {
  todo: '待办',
  pending: '等待中',
  running: '执行中',
  input_required: '需要输入',
  done: '已完成',
  failed: '失败',
  cancelled: '已取消',
  interrupted: '已中断',
  detached: '已断开',
}

export const TASK_STATE_ICONS: Record<TaskState, string> = {
  todo: 'circle',
  pending: 'clock',
  running: 'loader',
  input_required: 'alertCircle',
  done: 'check',
  failed: 'x',
  cancelled: 'ban',
  interrupted: 'pause',
  detached: 'plug',
}

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: '低',
  medium: '中',
  high: '高',
  urgent: '紧急',
}

// ══════════════════════════════════════════════
// Task Manager
// ══════════════════════════════════════════════

export class TaskManager {
  private maxTasks = 500
  private tasks = new Map<string, Task>()
  private listeners: Array<(task: Task, oldState: TaskState) => void> = []

  /** 创建任务 */
  create(params: Partial<Task> & { title: string }): Task {
    const task: Task = {
      id: crypto.randomUUID(),
      title: params.title,
      description: params.description ?? '',
      state: 'todo',
      priority: params.priority ?? 'medium',
      agent_id: params.agent_id ?? null,
      project_id: params.project_id ?? null,
      session_id: params.session_id ?? null,
      worktree_branch: params.worktree_branch ?? null,
      parent_task_id: params.parent_task_id ?? null,
      child_task_ids: params.child_task_ids ?? [],
      tags: params.tags ?? [],
      created_at: Date.now(),
      updated_at: Date.now(),
      started_at: null,
      completed_at: null,
      error: null,
      result: null,
      user_story: params.user_story ?? null,
      parallel: params.parallel ?? false,
      depends_on: params.depends_on ?? [],
    }
    this.tasks.set(task.id, task)
    return task
  }

  /** 状态转换 */
  transitionTo(taskId: string, to: TaskState): Task | null {
    const task = this.tasks.get(taskId)
    if (!task) return null
    const oldState = task.state
    const updated = transition(task, to)
    this.tasks.set(taskId, updated)
    if (updated.state !== oldState) {
      this.notifyListeners(updated, oldState)
    }
    return updated
  }

  /** 获取任务 */
  get(taskId: string): Task | undefined {
    return this.tasks.get(taskId)
  }

  /** 获取所有任务 */
  getAll(): Task[] {
    return Array.from(this.tasks.values())
  }

  /** 按状态筛选 */
  getByState(state: TaskState): Task[] {
    return this.getAll().filter(t => t.state === state)
  }

  /** 按项目筛选 */
  getByProject(projectId: string): Task[] {
    return this.getAll().filter(t => t.project_id === projectId)
  }

  /** 按 Agent 筛选 */
  getByAgent(agentId: string): Task[] {
    return this.getAll().filter(t => t.agent_id === agentId)
  }

  /** 获取可并行执行的任务 */
  getParallelReady(): Task[] {
    return this.getAll().filter(t =>
      t.state === 'todo' &&
      t.parallel &&
      t.depends_on.every(depId => this.tasks.get(depId)?.state === 'done')
    )
  }

  /** 获取需要用户输入的任务 */
  getInputRequired(): Task[] {
    return this.getByState('input_required')
  }

  /** 添加子任务 */
  addChildTask(parentId: string, childId: string): void {
    const parent = this.tasks.get(parentId)
    if (parent && !parent.child_task_ids.includes(childId)) {
      parent.child_task_ids = [...parent.child_task_ids, childId]
      parent.updated_at = Date.now()
    }
    const child = this.tasks.get(childId)
    if (child) {
      child.parent_task_id = parentId
      child.updated_at = Date.now()
    }
  }

  /** 监听状态变化 */
  onStateChange(listener: (task: Task, oldState: TaskState) => void): void {
    this.listeners.push(listener)
  }

  private notifyListeners(task: Task, oldState: TaskState): void {
    for (const listener of this.listeners) {
      try { listener(task, oldState) } catch { /* ignore */ }
    }
  }

  /** 统计 */
  getStats(): Record<TaskState, number> {
    const stats: Record<string, number> = {}
    for (const state of Object.keys(TASK_STATE_LABELS)) {
      stats[state] = this.getByState(state as TaskState).length
    }
    return stats as Record<TaskState, number>
  }
}

// ══════════════════════════════════════════════
// 持久化
// ══════════════════════════════════════════════

const STORAGE_KEY = 'yuai-tasks'

export function saveTasks(manager: TaskManager): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(manager.getAll()))
  } catch { /* ignore */ }
}

export function loadTasks(manager: TaskManager): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const tasks: Task[] = JSON.parse(raw)
    for (const task of tasks) {
      // 恢复时, running/input_required 的任务标记为 interrupted
      if (task.state === 'running' || task.state === 'input_required') {
        task.state = 'interrupted'
      }
      manager['tasks'].set(task.id, task)
    }
  } catch { /* ignore */ }
}
