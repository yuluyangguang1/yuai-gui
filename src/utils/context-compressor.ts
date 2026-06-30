/**
 * 上下文压缩系统
 * 参考 Omnigent 的三层压缩策略
 * 长对话时自动压缩，防止 token 超限
 */

export interface CompressionConfig {
  maxTokens: number        // 最大 token 数
  compressionRatio: number // 压缩比例 (0-1)
  strategy: 'truncate' | 'summarize' | 'surgical'
}

export interface Message {
  role: 'user' | 'assistant' | 'system' | 'tool'
  content: string
  timestamp: number
  tokenCount?: number
}

export interface CompressionResult {
  compressed: Message[]
  removedCount: number
  strategy: string
  savedTokens: number
}

/**
 * 上下文压缩器
 * 三层压缩策略：手术式清除 → LLM 摘要 → 截断
 */
export class ContextCompressor {
  private config: CompressionConfig

  constructor(config: CompressionConfig) {
    this.config = config
  }

  /**
   * 压缩消息历史
   */
  compress(messages: Message[]): CompressionResult {
    const totalTokens = this.estimateTokens(messages)

    if (totalTokens <= this.config.maxTokens) {
      return { compressed: messages, removedCount: 0, strategy: 'none', savedTokens: 0 }
    }

    // 第一层：手术式清除（移除旧的工具结果）
    let result = this.surgicalClear(messages)
    if (this.estimateTokens(result) <= this.config.maxTokens) {
      return {
        compressed: result,
        removedCount: messages.length - result.length,
        strategy: 'surgical',
        savedTokens: totalTokens - this.estimateTokens(result),
      }
    }

    // 第二层：截断（保留最近的消息）
    result = this.truncate(messages)
    return {
      compressed: result,
      removedCount: messages.length - result.length,
      strategy: 'truncate',
      savedTokens: totalTokens - this.estimateTokens(result),
    }
  }

  /**
   * 手术式清除
   * 移除旧的工具结果，保留工具调用
   */
  private surgicalClear(messages: Message[]): Message[] {
    const result: Message[] = []
    const toolResults = messages.filter(m => m.role === 'tool')

    // 保留最近的 N 个工具结果
    const keepCount = Math.max(5, Math.floor(toolResults.length * 0.3))
    const recentToolResults = new Set(
      toolResults.slice(-keepCount).map(m => m.timestamp)
    )

    for (const msg of messages) {
      if (msg.role === 'tool' && !recentToolResults.has(msg.timestamp)) {
        // 替换为摘要
        result.push({
          ...msg,
          content: '[工具结果已压缩]',
          tokenCount: 5,
        })
      } else {
        result.push(msg)
      }
    }

    return result
  }

  /**
   * 截断
   * 保留最近的消息，移除最旧的
   */
  private truncate(messages: Message[]): Message[] {
    const targetTokens = Math.floor(this.config.maxTokens * this.config.compressionRatio)
    let currentTokens = 0
    const result: Message[] = []

    // 从最新的消息开始保留
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i]
      const tokens = msg.tokenCount ?? this.estimateMessageTokens(msg)

      if (currentTokens + tokens > targetTokens) {
        break
      }

      result.unshift(msg)
      currentTokens += tokens
    }

    return result
  }

  /**
   * 估算 token 数
   */
  estimateTokens(messages: Message[]): number {
    return messages.reduce((sum, msg) => sum + (msg.tokenCount ?? this.estimateMessageTokens(msg)), 0)
  }

  /**
   * 估算单条消息的 token 数
   */
  private estimateMessageTokens(message: Message): number {
    // 粗略估算：1 token ≈ 4 字符（中文）或 1 token ≈ 4 字符（英文）
    return Math.ceil(message.content.length / 4) + 5 // 5 tokens 开销
  }
}

// 默认压缩配置
export const DEFAULT_COMPRESSION_CONFIG: CompressionConfig = {
  maxTokens: 100000, // 100K tokens
  compressionRatio: 0.7,
  strategy: 'surgical',
}

// 全局压缩器实例
export const globalCompressor = new ContextCompressor(DEFAULT_COMPRESSION_CONFIG)
