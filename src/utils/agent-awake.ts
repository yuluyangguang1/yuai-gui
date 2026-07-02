/**
 * Agent 防休眠服务
 * 参考 Orca 的 Agent Awake Service
 * Agent 工作时阻止系统休眠
 */

export interface AwakeConfig {
  enabled: boolean
  preventDisplaySleep: boolean
  preventSystemSleep: boolean
  checkInterval: number // 检查间隔（毫秒）
}

/**
 * 防休眠服务
 * 监控 Agent 状态，工作时阻止系统休眠
 */
export class AgentAwakeService {
  private config: AwakeConfig
  private isActive = false
  private checkTimer: ReturnType<typeof setInterval> | null = null
  private activeAgents: Set<string> = new Set()

  constructor(config: AwakeConfig) {
    this.config = config
  }

  /** 启动服务 */
  start(): void {
    if (this.isActive) return
    this.isActive = true

    // 定期检查 Agent 状态
    this.checkTimer = setInterval(() => {
      this.checkAndPreventSleep()
    }, this.config.checkInterval)

    console.debug('[AgentAwake] Service started')
  }

  /** 停止服务 */
  stop(): void {
    if (!this.isActive) return
    this.isActive = false

    if (this.checkTimer) {
      clearInterval(this.checkTimer)
      this.checkTimer = null
    }

    this.allowSleep()
    console.debug('[AgentAwake] Service stopped')
  }

  /** 标记 Agent 开始工作 */
  agentStarted(agentId: string): void {
    this.activeAgents.add(agentId)
    if (this.isActive) {
      this.preventSleep()
    }
  }

  /** 标记 Agent 完成工作 */
  agentFinished(agentId: string): void {
    this.activeAgents.delete(agentId)
    if (this.activeAgents.size === 0) {
      this.allowSleep()
    }
  }

  /** 获取活跃 Agent 数量 */
  getActiveCount(): number {
    return this.activeAgents.size
  }

  /** 检查并阻止休眠 */
  private checkAndPreventSleep(): void {
    if (this.activeAgents.size > 0) {
      this.preventSleep()
    } else {
      this.allowSleep()
    }
  }

  /** 阻止休眠 */
  private preventSleep(): void {
    // 在 Tauri 中，可以通过命令调用系统 API
    // 这里先记录日志，实际实现需要调用 Rust 命令
    console.debug(`[AgentAwake] Preventing sleep (${this.activeAgents.size} active agents)`)
  }

  /** 允许休眠 */
  private allowSleep(): void {
    console.debug('[AgentAwake] Allowing sleep')
  }
}

// 默认配置
export const DEFAULT_AWAKE_CONFIG: AwakeConfig = {
  enabled: true,
  preventDisplaySleep: true,
  preventSystemSleep: true,
  checkInterval: 30000, // 30秒
}

// 全局防休眠服务实例
export const globalAgentAwakeService = new AgentAwakeService(DEFAULT_AWAKE_CONFIG)
