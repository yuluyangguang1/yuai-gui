/**
 * Agent 状态机
 * 参考 Orca Coordinator + Omnigent AgentStateMachine
 * 管理 Agent 生命周期: idle → running → waiting_tool → completed/failed
 */

export type AgentState = 'idle' | 'running' | 'waiting_tool' | 'completed' | 'failed' | 'paused' | 'cancelled'

export interface AgentStateTransition {
  from: AgentState
  to: AgentState
  timestamp: number
  reason?: string
}

export interface AgentStateMachineOptions {
  agentId: string
  onStateChange?: (transition: AgentStateTransition) => void
  onError?: (error: Error) => void
}

// 合法的状态转换
const VALID_TRANSITIONS: Record<AgentState, AgentState[]> = {
  idle: ['running'],
  running: ['waiting_tool', 'completed', 'failed', 'paused', 'cancelled'],
  waiting_tool: ['running', 'failed', 'cancelled'],
  completed: ['idle', 'running'],
  failed: ['idle', 'running'],
  paused: ['running', 'cancelled'],
  cancelled: ['idle'],
}

export class AgentStateMachine {
  private state: AgentState = 'idle'
  private history: AgentStateTransition[] = []
  private agentId: string
  private onStateChange?: (transition: AgentStateTransition) => void
  private onError?: (error: Error) => void

  constructor(options: AgentStateMachineOptions) {
    this.agentId = options.agentId
    this.onStateChange = options.onStateChange
    this.onError = options.onError
  }

  /** 获取当前状态 */
  getState(): AgentState {
    return this.state
  }

  /** 获取状态历史 */
  getHistory(): AgentStateTransition[] {
    return [...this.history]
  }

  /** 检查是否可以转换到目标状态 */
  canTransition(to: AgentState): boolean {
    return VALID_TRANSITIONS[this.state]?.includes(to) ?? false
  }

  /** 执行状态转换 */
  transition(to: AgentState, reason?: string): boolean {
    if (!this.canTransition(to)) {
      const error = new Error(`Invalid transition: ${this.state} → ${to}`)
      this.onError?.(error)
      return false
    }

    const transition: AgentStateTransition = {
      from: this.state,
      to,
      timestamp: Date.now(),
      reason,
    }

    this.state = to
    this.history.push(transition)
    this.onStateChange?.(transition)

    return true
  }

  /** 重置到 idle */
  reset(): void {
    this.transition('idle', 'manual reset')
  }

  /** 开始执行 */
  start(reason?: string): boolean {
    return this.transition('running', reason ?? 'started')
  }

  /** 等待工具调用 */
  waitForTool(toolName: string): boolean {
    return this.transition('waiting_tool', `waiting for ${toolName}`)
  }

  /** 工具调用完成，继续执行 */
  toolComplete(toolName: string): boolean {
    return this.transition('running', `${toolName} completed`)
  }

  /** 执行完成 */
  complete(reason?: string): boolean {
    return this.transition('completed', reason ?? 'completed')
  }

  /** 执行失败 */
  fail(error: string): boolean {
    return this.transition('failed', error)
  }

  /** 暂停 */
  pause(reason?: string): boolean {
    return this.transition('paused', reason ?? 'paused')
  }

  /** 恢复 */
  resume(): boolean {
    return this.transition('running', 'resumed')
  }

  /** 取消 */
  cancel(reason?: string): boolean {
    return this.transition('cancelled', reason ?? 'cancelled')
  }

  /** 检查是否正在运行 */
  isRunning(): boolean {
    return this.state === 'running' || this.state === 'waiting_tool'
  }

  /** 检查是否已完成 */
  isFinished(): boolean {
    return this.state === 'completed' || this.state === 'failed' || this.state === 'cancelled'
  }

  /** 获取状态持续时间（毫秒） */
  getStateDuration(): number {
    const lastTransition = this.history[this.history.length - 1]
    if (!lastTransition) return 0
    return Date.now() - lastTransition.timestamp
  }
}

/**
 * 多 Agent 状态管理器
 * 管理多个 Agent 的状态机实例
 */
export class MultiAgentStateManager {
  private machines: Map<string, AgentStateMachine> = new Map()

  /** 获取或创建 Agent 状态机 */
  getMachine(agentId: string): AgentStateMachine {
    if (!this.machines.has(agentId)) {
      this.machines.set(agentId, new AgentStateMachine({ agentId }))
    }
    return this.machines.get(agentId)!
  }

  /** 获取所有 Agent 状态 */
  getAllStates(): Record<string, AgentState> {
    const states: Record<string, AgentState> = {}
    for (const [id, machine] of this.machines) {
      states[id] = machine.getState()
    }
    return states
  }

  /** 获取正在运行的 Agent */
  getRunningAgents(): string[] {
    const running: string[] = []
    for (const [id, machine] of this.machines) {
      if (machine.isRunning()) running.push(id)
    }
    return running
  }

  /** 重置所有 Agent */
  resetAll(): void {
    for (const machine of this.machines.values()) {
      machine.reset()
    }
  }
}
