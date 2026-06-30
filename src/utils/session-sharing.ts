/**
 * 会话共享系统
 * 参考 Omnigent 的 Session Sharing
 * 会话的导入/导出和分享
 */

export interface SharedSession {
  id: string
  name: string
  description: string
  messages: Array<{
    role: string
    content: string
    timestamp: number
  }>
  metadata: {
    createdAt: number
    updatedAt: number
    agentId?: string
    tags?: string[]
  }
  shareConfig: {
    isPublic: boolean
    expiresAt?: number
    maxViews?: number
    currentViews: number
  }
}

export interface ShareLink {
  id: string
  sessionId: string
  url: string
  createdAt: number
  expiresAt?: number
}

/**
 * 会话共享管理器
 * 管理会话的导入/导出和分享
 */
export class SessionSharingManager {
  private sharedSessions: Map<string, SharedSession> = new Map()
  private shareLinks: Map<string, ShareLink> = new Map()

  /** 导出会话 */
  exportSession(sessionId: string, messages: Array<{ role: string; content: string; timestamp: number }>, name: string): SharedSession {
    const session: SharedSession = {
      id: sessionId,
      name,
      description: '',
      messages,
      metadata: {
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      shareConfig: {
        isPublic: false,
        currentViews: 0,
      },
    }

    this.sharedSessions.set(sessionId, session)
    return session
  }

  /** 导入会话 */
  importSession(sharedSession: SharedSession): boolean {
    if (this.sharedSessions.has(sharedSession.id)) {
      return false
    }

    this.sharedSessions.set(sharedSession.id, sharedSession)
    return true
  }

  /** 创建分享链接 */
  createShareLink(sessionId: string, expiresAt?: number): ShareLink | null {
    const session = this.sharedSessions.get(sessionId)
    if (!session) return null

    const link: ShareLink = {
      id: crypto.randomUUID(),
      sessionId,
      url: `https://yuai.app/share/${sessionId}`,
      createdAt: Date.now(),
      expiresAt,
    }

    this.shareLinks.set(link.id, link)
    session.shareConfig.isPublic = true

    return link
  }

  /** 获取分享链接 */
  getShareLink(linkId: string): ShareLink | undefined {
    return this.shareLinks.get(linkId)
  }

  /** 通过链接访问会话 */
  accessSharedSession(linkId: string): SharedSession | null {
    const link = this.shareLinks.get(linkId)
    if (!link) return null

    // 检查是否过期
    if (link.expiresAt && Date.now() > link.expiresAt) {
      return null
    }

    const session = this.sharedSessions.get(link.sessionId)
    if (!session) return null

    // 检查访问次数
    if (session.shareConfig.maxViews && session.shareConfig.currentViews >= session.shareConfig.maxViews) {
      return null
    }

    session.shareConfig.currentViews++
    return session
  }

  /** 停止分享 */
  stopSharing(sessionId: string): boolean {
    const session = this.sharedSessions.get(sessionId)
    if (!session) return false

    session.shareConfig.isPublic = false

    // 删除相关分享链接
    for (const [id, link] of this.shareLinks) {
      if (link.sessionId === sessionId) {
        this.shareLinks.delete(id)
      }
    }

    return true
  }

  /** 获取共享会话 */
  getSharedSession(sessionId: string): SharedSession | undefined {
    return this.sharedSessions.get(sessionId)
  }

  /** 获取所有共享会话 */
  getAllSharedSessions(): SharedSession[] {
    return Array.from(this.sharedSessions.values())
  }

  /** 删除共享会话 */
  deleteSharedSession(sessionId: string): boolean {
    // 删除相关分享链接
    for (const [id, link] of this.shareLinks) {
      if (link.sessionId === sessionId) {
        this.shareLinks.delete(id)
      }
    }

    return this.sharedSessions.delete(sessionId)
  }

  /** 导出为 JSON */
  exportToJson(sessionId: string): string | null {
    const session = this.sharedSessions.get(sessionId)
    if (!session) return null

    return JSON.stringify(session, null, 2)
  }

  /** 从 JSON 导入 */
  importFromJson(json: string): boolean {
    try {
      const session = JSON.parse(json) as SharedSession
      return this.importSession(session)
    } catch {
      return false
    }
  }
}

// 全局会话共享管理器实例
export const globalSessionSharingManager = new SessionSharingManager()
