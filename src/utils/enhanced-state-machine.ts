/**
 * 增强状态机
 * 参考 Orca Coordinator + Omnigent AgentStateMachine
 * 支持 DAG 依赖 + 心跳检测 + 决策门
 */

export type EnhancedState = 'idle' | 'decomposing' | 'dispatching' | 'monitoring' | 'merging' | 'completed' | 'failed' | 'paused' | 'cancelled'

export interface TaskNode {
  id: string
  agentId: string
  state: EnhancedState
  dependencies: string[] // 依赖的任务 ID
  result?: unknown
  error?: string
  startedAt?: number
  completedAt?: number
}

export interface DecisionGate {
  id: string
  condition: (results: Map<string, unknown>) => boolean
  trueBranch: string
  falseBranch: string
}

export interface EnhancedStateMachineOptions {
  onStateChange?: (taskId: string, from: EnhancedState, to: EnhancedState) => void
  onTaskComplete?: (taskId: string, result: unknown) => void
  onTaskFailed?: (taskId: string, error: string) => void
  heartbeatInterval?: number // 心跳间隔（毫秒）
  heartbeatTimeout?: number // 心跳超时（毫秒）
}

/**
 * 增强状态机
 * 支持 DAG 任务图 + 心跳检测 + 决策门
 */
export class EnhancedStateMachine {
  private maxTasks = 500
  private tasks: Map<string, TaskNode> = new Map()
  private decisionGates: Map<string, DecisionGate> = new Map()
  private options: EnhancedStateMachineOptions
  private heartbeatTimers: Map<string, ReturnType<typeof setTimeout>> = new Map()

  constructor(options: EnhancedStateMachineOptions = {}) {
    this.options = options
  }

  /** 添加任务节点 */
  addTask(task: TaskNode): void {
    this.tasks.set(task.id, task)
  }

  /** 添加决策门 */
  addDecisionGate(gate: DecisionGate): void {
    this.decisionGates.set(gate.id, gate)
  }

  /** 获取任务状态 */
  getTaskState(taskId: string): EnhancedState | undefined {
    return this.tasks.get(taskId)?.state
  }

  /** 获取所有任务 */
  getAllTasks(): TaskNode[] {
    return Array.from(this.tasks.values())
  }

  /** 获取就绪的任务（所有依赖都已完成） */
  getReadyTasks(): TaskNode[] {
    return Array.from(this.tasks.values()).filter(task => {
      if (task.state !== 'idle') return false
      return task.dependencies.every(depId => {
        const dep = this.tasks.get(depId)
        return dep?.state === 'completed'
      })
    })
  }

  /** 开始任务 */
  startTask(taskId: string): boolean {
    const task = this.tasks.get(taskId)
    if (!task || task.state !== 'idle') return false

    // 检查依赖
    const ready = task.dependencies.every(depId => {
      const dep = this.tasks.get(depId)
      return dep?.state === 'completed'
    })
    if (!ready) return false

    task.state = 'dispatching'
    task.startedAt = Date.now()
    this.options.onStateChange?.(taskId, 'idle', 'dispatching')

    // 启动心跳检测
    if (this.options.heartbeatInterval) {
      this.startHeartbeat(taskId)
    }

    return true
  }

  /** 任务执行中 */
  taskRunning(taskId: string): boolean {
    const task = this.tasks.get(taskId)
    if (!task || task.state !== 'dispatching') return false

    task.state = 'monitoring'
    this.options.onStateChange?.(taskId, 'dispatching', 'monitoring')
    return true
  }

  /** 任务完成 */
  completeTask(taskId: string, result: unknown): boolean {
    const task = this.tasks.get(taskId)
    if (!task || task.state !== 'monitoring') return false

    task.state = 'completed'
    task.result = result
    task.completedAt = Date.now()
    this.stopHeartbeat(taskId)
    this.options.onStateChange?.(taskId, 'monitoring', 'completed')
    this.options.onTaskComplete?.(taskId, result)

    return true
  }

  /** 任务失败 */
  failTask(taskId: string, error: string): boolean {
    const task = this.tasks.get(taskId)
    if (!task || task.state !== 'monitoring') return false

    task.state = 'failed'
    task.error = error
    task.completedAt = Date.now()
    this.stopHeartbeat(taskId)
    this.options.onStateChange?.(taskId, 'monitoring', 'failed')
    this.options.onTaskFailed?.(taskId, error)

    return true
  }

  /** 暂停任务 */
  pauseTask(taskId: string): boolean {
    const task = this.tasks.get(taskId)
    if (!task || task.state !== 'monitoring') return false

    task.state = 'paused'
    this.stopHeartbeat(taskId)
    this.options.onStateChange?.(taskId, 'monitoring', 'paused')
    return true
  }

  /** 恢复任务 */
  resumeTask(taskId: string): boolean {
    const task = this.tasks.get(taskId)
    if (!task || task.state !== 'paused') return false

    task.state = 'monitoring'
    this.options.onStateChange?.(taskId, 'paused', 'monitoring')
    return true
  }

  /** 取消任务 */
  cancelTask(taskId: string): boolean {
    const task = this.tasks.get(taskId)
    if (!task || task.state === 'completed' || task.state === 'failed' || task.state === 'cancelled') return false

    task.state = 'cancelled'
    this.stopHeartbeat(taskId)
    this.options.onStateChange?.(taskId, task.state, 'cancelled')
    return true
  }

  /** 检查所有任务是否完成 */
  isAllCompleted(): boolean {
    return Array.from(this.tasks.values()).every(t =>
      t.state === 'completed' || t.state === 'failed' || t.state === 'cancelled'
    )
  }

  /** 获取结果汇总 */
  getResults(): Map<string, unknown> {
    const results = new Map<string, unknown>()
    for (const task of this.tasks.values()) {
      if (task.state === 'completed' && task.result !== undefined) {
        results.set(task.id, task.result)
      }
    }
    return results
  }

  /** 启动心跳检测 */
  private startHeartbeat(taskId: string): void {
    const interval = this.options.heartbeatInterval ?? 30000
    const timeout = this.options.heartbeatTimeout ?? 300000 // 5分钟

    const timer = setTimeout(() => {
      const task = this.tasks.get(taskId)
      if (task?.state === 'monitoring') {
        this.failTask(taskId, '心跳超时')
      }
    }, timeout)

    this.heartbeatTimers.set(taskId, timer)
  }

  /** 停止心跳检测 */
  private stopHeartbeat(taskId: string): void {
    const timer = this.heartbeatTimers.get(taskId)
    if (timer) {
      clearTimeout(timer)
      this.heartbeatTimers.delete(taskId)
    }
  }
}

// 全局状态机实例
export const globalEnhancedStateMachine = new EnhancedStateMachine({
  heartbeatInterval: 30000,
  heartbeatTimeout: 300000,
})
