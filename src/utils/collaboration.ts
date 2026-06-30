/**
 * 协作系统
 * 参考 Omnigent 的 Collaboration
 * 多人同时观察/操控同一 Agent 会话
 */

export interface Collaborator {
  id: string
  name: string
  avatar?: string
  role: 'owner' | 'editor' | 'viewer'
  cursor?: { x: number; y: number }
  lastActive: number
  isOnline: boolean
}

export interface CollaborationSession {
  id: string
  name: string
  owner: string
  collaborators: Collaborator[]
  createdAt: number
  isActive: boolean
}

export interface CollaborationEvent {
  type: 'join' | 'leave' | 'cursor' | 'message' | 'action'
  userId: string
  data: unknown
  timestamp: number
}

/**
 * 协作管理器
 * 管理多人协作会话
 */
export class CollaborationManager {
  private sessions: Map<string, CollaborationSession> = new Map()
  private currentSessionId: string | null = null
  private eventHandlers: Map<string, ((event: CollaborationEvent) => void)[]> = new Map()

  /** 创建协作会话 */
  createSession(name: string, ownerId: string): CollaborationSession {
    const session: CollaborationSession = {
      id: crypto.randomUUID(),
      name,
      owner: ownerId,
      collaborators: [{
        id: ownerId,
        name: 'Owner',
        role: 'owner',
        lastActive: Date.now(),
        isOnline: true,
      }],
      createdAt: Date.now(),
      isActive: true,
    }

    this.sessions.set(session.id, session)
    this.currentSessionId = session.id
    return session
  }

  /** 加入协作会话 */
  joinSession(sessionId: string, userId: string, userName: string): boolean {
    const session = this.sessions.get(sessionId)
    if (!session || !session.isActive) return false

    // 检查是否已在会话中
    if (session.collaborators.some(c => c.id === userId)) {
      return false
    }

    session.collaborators.push({
      id: userId,
      name: userName,
      role: 'viewer',
      lastActive: Date.now(),
      isOnline: true,
    })

    this.emitEvent({
      type: 'join',
      userId,
      data: { sessionId, userName },
      timestamp: Date.now(),
    })

    return true
  }

  /** 离开协作会话 */
  leaveSession(sessionId: string, userId: string): boolean {
    const session = this.sessions.get(sessionId)
    if (!session) return false

    const index = session.collaborators.findIndex(c => c.id === userId)
    if (index === -1) return false

    session.collaborators.splice(index, 1)

    this.emitEvent({
      type: 'leave',
      userId,
      data: { sessionId },
      timestamp: Date.now(),
    })

    return true
  }

  /** 更新光标位置 */
  updateCursor(sessionId: string, userId: string, x: number, y: number): void {
    const session = this.sessions.get(sessionId)
    if (!session) return

    const collaborator = session.collaborators.find(c => c.id === userId)
    if (collaborator) {
      collaborator.cursor = { x, y }
      collaborator.lastActive = Date.now()

      this.emitEvent({
        type: 'cursor',
        userId,
        data: { x, y },
        timestamp: Date.now(),
      })
    }
  }

  /** 发送消息 */
  sendMessage(sessionId: string, userId: string, message: string): void {
    this.emitEvent({
      type: 'message',
      userId,
      data: { sessionId, message },
      timestamp: Date.now(),
    })
  }

  /** 获取会话 */
  getSession(sessionId: string): CollaborationSession | undefined {
    return this.sessions.get(sessionId)
  }

  /** 获取当前会话 */
  getCurrentSession(): CollaborationSession | undefined {
    return this.currentSessionId ? this.sessions.get(this.currentSessionId) : undefined
  }

  /** 获取在线协作者 */
  getOnlineCollaborators(sessionId: string): Collaborator[] {
    const session = this.sessions.get(sessionId)
    return session?.collaborators.filter(c => c.isOnline) ?? []
  }

  /** 监听事件 */
  on(eventType: string, handler: (event: CollaborationEvent) => void): void {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, [])
    }
    this.eventHandlers.get(eventType)!.push(handler)
  }

  /** 移除监听 */
  off(eventType: string, handler: (event: CollaborationEvent) => void): void {
    const handlers = this.eventHandlers.get(eventType)
    if (handlers) {
      const index = handlers.indexOf(handler)
      if (index !== -1) {
        handlers.splice(index, 1)
      }
    }
  }

  /** 触发事件 */
  private emitEvent(event: CollaborationEvent): void {
    const handlers = this.eventHandlers.get(event.type) ?? []
    for (const handler of handlers) {
      try {
        handler(event)
      } catch (error) {
        console.error('[Collaboration] Event handler error:', error)
      }
    }
  }

  /** 离开当前会话 */
  leaveCurrentSession(): void {
    if (this.currentSessionId) {
      this.leaveSession(this.currentSessionId, 'current-user')
      this.currentSessionId = null
    }
  }

  /** 获取所有会话 */
  getAllSessions(): CollaborationSession[] {
    return Array.from(this.sessions.values())
  }
}

// 全局协作管理器实例
export const globalCollaborationManager = new CollaborationManager()
