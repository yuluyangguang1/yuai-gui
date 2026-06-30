/**
 * Diff 评论系统
 * 参考 Orca 的 Diff Comments
 * 在 AI 生成的 diff 上添加评论反馈给 Agent
 */

export interface DiffComment {
  id: string
  filePath: string
  lineNumber: number
  content: string
  type: 'suggestion' | 'issue' | 'question' | 'approval'
  author: string
  timestamp: number
  resolved: boolean
  parentId?: string // 回复某条评论
}

export interface DiffHunk {
  filePath: string
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  content: string
}

/**
 * Diff 评论管理器
 */
export class DiffCommentManager {
  private comments: Map<string, DiffComment[]> = new Map()

  /** 添加评论 */
  addComment(comment: Omit<DiffComment, 'id' | 'timestamp' | 'resolved'>): DiffComment {
    const fullComment: DiffComment = {
      ...comment,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      resolved: false,
    }

    const key = `${comment.filePath}:${comment.lineNumber}`
    if (!this.comments.has(key)) {
      this.comments.set(key, [])
    }
    this.comments.get(key)!.push(fullComment)

    return fullComment
  }

  /** 获取某行的评论 */
  getComments(filePath: string, lineNumber: number): DiffComment[] {
    const key = `${filePath}:${lineNumber}`
    return this.comments.get(key) ?? []
  }

  /** 获取文件的所有评论 */
  getFileComments(filePath: string): DiffComment[] {
    const result: DiffComment[] = []
    for (const [key, comments] of this.comments) {
      if (key.startsWith(filePath + ':')) {
        result.push(...comments)
      }
    }
    return result.sort((a, b) => a.lineNumber - b.lineNumber)
  }

  /** 解决评论 */
  resolveComment(commentId: string): boolean {
    for (const comments of this.comments.values()) {
      const comment = comments.find(c => c.id === commentId)
      if (comment) {
        comment.resolved = true
        return true
      }
    }
    return false
  }

  /** 回复评论 */
  replyToComment(commentId: string, content: string, author: string): DiffComment | null {
    for (const [key, comments] of this.comments) {
      const parent = comments.find(c => c.id === commentId)
      if (parent) {
        const reply: DiffComment = {
          id: crypto.randomUUID(),
          filePath: parent.filePath,
          lineNumber: parent.lineNumber,
          content,
          type: 'suggestion',
          author,
          timestamp: Date.now(),
          resolved: false,
          parentId: commentId,
        }
        comments.push(reply)
        return reply
      }
    }
    return null
  }

  /** 生成评论摘要（用于发送给 Agent） */
  generateSummary(filePath: string): string {
    const comments = this.getFileComments(filePath)
    if (comments.length === 0) return ''

    const unresolved = comments.filter(c => !c.resolved)
    if (unresolved.length === 0) return ''

    let summary = `## 用户评论 (${filePath})\n\n`
    for (const comment of unresolved) {
      summary += `- **第 ${comment.lineNumber} 行** [${comment.type}]: ${comment.content}\n`
    }

    return summary
  }

  /** 清空评论 */
  clearComments(filePath?: string): void {
    if (filePath) {
      for (const key of this.comments.keys()) {
        if (key.startsWith(filePath + ':')) {
          this.comments.delete(key)
        }
      }
    } else {
      this.comments.clear()
    }
  }
}

// 全局评论管理器实例
export const globalDiffCommentManager = new DiffCommentManager()
