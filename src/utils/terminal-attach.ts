/**
 * 终端附加系统
 * 参考 Omnigent 的 Terminal Attach
 * 附加到正在运行的终端会话
 */

export interface TerminalSession {
  id: string
  name: string
  agentId?: string
  status: 'active' | 'idle' | 'detached'
  createdAt: number
  lastActivity: number
  pid?: number
}

export interface TerminalAttachConfig {
  maxSessions: number
  idleTimeout: number
  autoDetach: boolean
}

/**
 * 终端附加管理器
 * 管理终端会话的附加和分离
 */
export class TerminalAttachManager {
  private sessions: Map<string, TerminalSession> = new Map()
  private config: TerminalAttachConfig
  private attachedSessionId: string | null = null

  constructor(config: TerminalAttachConfig) {
    this.config = config
  }

  /** 创建终端会话 */
  createSession(name: string, agentId?: string): TerminalSession {
    const session: TerminalSession = {
      id: crypto.randomUUID(),
      name,
      agentId,
      status: 'active',
      createdAt: Date.now(),
      lastActivity: Date.now(),
    }

    this.sessions.set(session.id, session)
    return session
  }

  /** 附加到终端会话 */
  attach(sessionId: string): boolean {
    const session = this.sessions.get(sessionId)
    if (!session) return false

    // 如果已附加到其他会话，先分离
    if (this.attachedSessionId && this.attachedSessionId !== sessionId) {
      this.detach(this.attachedSessionId)
    }

    this.attachedSessionId = sessionId
    session.status = 'active'
    session.lastActivity = Date.now()

    return true
  }

  /** 分离终端会话 */
  detach(sessionId: string): boolean {
    const session = this.sessions.get(sessionId)
    if (!session) return false

    if (this.attachedSessionId === sessionId) {
      this.attachedSessionId = null
    }

    session.status = 'detached'
    return true
  }

  /** 获取当前附加的会话 */
  getAttachedSession(): TerminalSession | undefined {
    return this.attachedSessionId ? this.sessions.get(this.attachedSessionId) : undefined
  }

  /** 获取所有会话 */
  getAllSessions(): TerminalSession[] {
    return Array.from(this.sessions.values())
  }

  /** 获取活跃会话 */
  getActiveSessions(): TerminalSession[] {
    return Array.from(this.sessions.values()).filter(s => s.status === 'active')
  }

  /** 更新会话活动时间 */
  updateActivity(sessionId: string): void {
    const session = this.sessions.get(sessionId)
    if (session) {
      session.lastActivity = Date.now()
    }
  }

  /** 关闭会话 */
  closeSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId)
    if (!session) return false

    if (this.attachedSessionId === sessionId) {
      this.attachedSessionId = null
    }

    return this.sessions.delete(sessionId)
  }

  /** 清理空闲会话 */
  cleanupIdleSessions(): number {
    const now = Date.now()
    let cleaned = 0

    for (const [id, session] of this.sessions) {
      if (session.status === 'detached' && now - session.lastActivity > this.config.idleTimeout) {
        this.sessions.delete(id)
        cleaned++
      }
    }

    return cleaned
  }

  /** 获取会话数量 */
  getSessionCount(): number {
    return this.sessions.size
  }

  /** 检查是否可以创建新会话 */
  canCreateSession(): boolean {
    return this.sessions.size < this.config.maxSessions
  }
}

// 默认终端附加配置
export const DEFAULT_TERMINAL_ATTACH_CONFIG: TerminalAttachConfig = {
  maxSessions: 10,
  idleTimeout: 1800000, // 30分钟
  autoDetach: true,
}

// 全局终端附加管理器实例
export const globalTerminalAttachManager = new TerminalAttachManager(DEFAULT_TERMINAL_ATTACH_CONFIG)
