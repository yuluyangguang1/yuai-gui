/**
 * Agent 间消息队列
 * 参考 Omnigent MessageQueue + Orca Relay
 * 解耦 Agent 之间的通信
 */

export type MessageType = 'command' | 'event' | 'request' | 'response' | 'error' | 'heartbeat'

export interface Message {
  id: string
  type: MessageType
  from: string      // 发送者 Agent ID
  to: string        // 接收者 Agent ID
  topic: string     // 消息主题
  payload: unknown  // 消息内容
  timestamp: number
  replyTo?: string  // 回复目标消息 ID
  ttl?: number      // 消息存活时间（毫秒）
}

export type MessageHandler = (message: Message) => void | Promise<void>

interface Subscription {
  id: string
  topic: string
  handler: MessageHandler
  agentId?: string
}

/**
 * Agent 间消息队列
 * 支持发布/订阅、点对点、请求/响应模式
 */
export class MessageQueue {
  private maxQueue = 200
  private queue: Message[] = []
  private subscriptions: Subscription[] = []
  private history: Message[] = []
  private maxHistory = 1000
  private pendingRequests: Map<string, { resolve: (value: unknown) => void; timeout: ReturnType<typeof setTimeout> }> = new Map()

  /** 发布消息 */
  async publish(message: Omit<Message, 'id' | 'timestamp'>): Promise<string> {
    const fullMessage: Message = {
      ...message,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    }

    // 添加到队列
    this.queue.push(fullMessage)
    this.history.push(fullMessage)

    // 限制历史记录大小
    if (this.history.length > this.maxHistory) {
      this.history.shift()
    }

    // 分发给订阅者
    await this.dispatch(fullMessage)

    return fullMessage.id
  }

  /** 订阅主题 */
  subscribe(topic: string, handler: MessageHandler, agentId?: string): string {
    const id = crypto.randomUUID()
    this.subscriptions.push({ id, topic, handler, agentId })
    return id
  }

  /** 取消订阅 */
  unsubscribe(subscriptionId: string): void {
    this.subscriptions = this.subscriptions.filter(s => s.id !== subscriptionId)
  }

  /** 请求/响应模式 */
  async request(to: string, topic: string, payload: unknown, timeoutMs = 30000): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const messageId = crypto.randomUUID()

      // 设置超时
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(messageId)
        reject(new Error(`Request timeout: ${topic}`))
      }, timeoutMs)

      // 记录待处理请求
      this.pendingRequests.set(messageId, { resolve, timeout })

      // 发布请求
      this.publish({
        type: 'request',
        from: 'system',
        to,
        topic,
        payload,
        replyTo: messageId,
      })
    })
  }

  /** 回复请求 */
  async reply(originalMessage: Message, payload: unknown): Promise<void> {
    if (!originalMessage.replyTo) return

    await this.publish({
      type: 'response',
      from: originalMessage.to,
      to: originalMessage.from,
      topic: originalMessage.topic,
      payload,
      replyTo: originalMessage.replyTo,
    })
  }

  /** 分发消息给订阅者 */
  private async dispatch(message: Message): Promise<void> {
    const matchingSubscriptions = this.subscriptions.filter(s => {
      // 主题匹配（支持通配符）
      if (s.topic === '*') return true
      if (s.topic === message.topic) return true
      if (s.topic.endsWith('*') && message.topic.startsWith(s.topic.slice(0, -1))) return true
      return false
    })

    for (const subscription of matchingSubscriptions) {
      try {
        await subscription.handler(message)
      } catch (error) {
        console.error(`Message handler error for topic ${message.topic}:`, error)
      }
    }

    // 处理请求/响应
    if (message.type === 'response' && message.replyTo) {
      const pending = this.pendingRequests.get(message.replyTo)
      if (pending) {
        clearTimeout(pending.timeout)
        this.pendingRequests.delete(message.replyTo)
        pending.resolve(message.payload)
      }
    }
  }

  /** 获取队列中的消息 */
  getQueue(): Message[] {
    return [...this.queue]
  }

  /** 获取历史消息 */
  getHistory(topic?: string): Message[] {
    if (topic) {
      return this.history.filter(m => m.topic === topic)
    }
    return [...this.history]
  }

  /** 清空队列 */
  clearQueue(): void {
    this.queue = []
  }

  /** 清空历史 */
  clearHistory(): void {
    this.history = []
  }

  /** 获取队列大小 */
  getQueueSize(): number {
    return this.queue.length
  }

  /** 获取订阅数量 */
  getSubscriptionCount(): number {
    return this.subscriptions.length
  }
}

// 全局消息队列实例
export const globalMessageQueue = new MessageQueue()
