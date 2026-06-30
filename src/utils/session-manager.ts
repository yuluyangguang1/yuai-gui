/**
 * 会话 Fork 系统
 * 参考 Omnigent 的会话 Fork 功能
 * 复制历史继续对话
 */

export interface Session {
  id: string
  parentId?: string // 父会话 ID（fork 来源）
  title: string
  messages: Message[]
  createdAt: number
  updatedAt: number
  metadata: Record<string, unknown>
}

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  timestamp: number
  agentId?: string
  tokenCount?: number
}

/**
 * 会话管理器
 * 支持会话 Fork、历史复制、会话树
 */
export class SessionManager {
  private sessions: Map<string, Session> = new Map()
  private currentSessionId: string | null = null

  /** 创建新会话 */
  createSession(title: string): Session {
    const session: Session = {
      id: crypto.randomUUID(),
      title,
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
      metadata: {},
    }

    this.sessions.set(session.id, session)
    this.currentSessionId = session.id
    return session
  }

  /** Fork 会话 */
  forkSession(sessionId: string, title?: string): Session | null {
    const source = this.sessions.get(sessionId)
    if (!source) return null

    const forked: Session = {
      id: crypto.randomUUID(),
      parentId: sessionId,
      title: title ?? `${source.title} (fork)`,
      messages: [...source.messages], // 复制历史
      createdAt: Date.now(),
      updatedAt: Date.now(),
      metadata: { ...source.metadata },
    }

    this.sessions.set(forked.id, forked)
    return forked
  }

  /** 获取会话 */
  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId)
  }

  /** 获取当前会话 */
  getCurrentSession(): Session | undefined {
    return this.currentSessionId ? this.sessions.get(this.currentSessionId) : undefined
  }

  /** 切换会话 */
  switchSession(sessionId: string): boolean {
    if (!this.sessions.has(sessionId)) return false
    this.currentSessionId = sessionId
    return true
  }

  /** 添加消息 */
  addMessage(sessionId: string, message: Omit<Message, 'id' | 'timestamp'>): Message | null {
    const session = this.sessions.get(sessionId)
    if (!session) return null

    const fullMessage: Message = {
      ...message,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    }

    session.messages.push(fullMessage)
    session.updatedAt = Date.now()
    return fullMessage
  }

  /** 获取会话历史 */
  getHistory(sessionId: string): Message[] {
    return this.sessions.get(sessionId)?.messages ?? []
  }

  /** 获取会话树（父会话 + 所有 fork） */
  getSessionTree(sessionId: string): Session[] {
    const tree: Session[] = []
    const visited = new Set<string>()

    const traverse = (id: string) => {
      if (visited.has(id)) return
      visited.add(id)

      const session = this.sessions.get(id)
      if (!session) return

      tree.push(session)

      // 查找所有 fork
      for (const s of this.sessions.values()) {
        if (s.parentId === id) {
          traverse(s.id)
        }
      }
    }

    // 查找根会话
    let rootId = sessionId
    let current = this.sessions.get(sessionId)
    while (current?.parentId) {
      rootId = current.parentId
      current = this.sessions.get(current.parentId)
    }

    traverse(rootId)
    return tree
  }

  /** 获取所有会话 */
  getAllSessions(): Session[] {
    return Array.from(this.sessions.values())
      .sort((a, b) => b.updatedAt - a.updatedAt)
  }

  /** 删除会话 */
  deleteSession(sessionId: string): boolean {
    const session = this.sessions.get(sessionId)
    if (!session) return false

    // 如果是当前会话，切换到父会话或第一个可用会话
    if (this.currentSessionId === sessionId) {
      if (session.parentId) {
        this.currentSessionId = session.parentId
      } else {
        const remaining = Array.from(this.sessions.keys()).filter(id => id !== sessionId)
        this.currentSessionId = remaining[0] ?? null
      }
    }

    this.sessions.delete(sessionId)
    return true
  }

  /** 清空所有会话 */
  clearAll(): void {
    this.sessions.clear()
    this.currentSessionId = null
  }
}

// 全局会话管理器实例
export const globalSessionManager = new SessionManager()
