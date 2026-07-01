/**
 * SSE 流式渲染系统
 * 参考 Omnigent 的 SSE Streaming
 * 比 WebSocket 更轻量的实时更新方案
 */

export interface SSEEvent {
  id?: string
  event?: string
  data: string
  retry?: number
}

export type SSEEventHandler = (event: SSEEvent) => void

/**
 * SSE 客户端
 * 连接 SSE 端点并接收流式事件
 */
export class SSEClient {
  private url: string
  private eventSource: EventSource | null = null
  private handlers: Map<string, SSEEventHandler[]> = new Map()
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 1000
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null

  constructor(url: string) {
    this.url = url
  }

  /** 连接 */
  connect(): void {
    if (this.eventSource) {
      this.disconnect()
    }

    this.eventSource = new EventSource(this.url)

    this.eventSource.onopen = () => {
      console.log('[SSE] Connected')
      this.reconnectAttempts = 0
    }

    this.eventSource.onmessage = (event) => {
      this.dispatchEvent('message', {
        data: event.data,
        id: event.lastEventId,
      })
    }

    this.eventSource.onerror = (error) => {
      console.error('[SSE] Error:', error)
      this.handleReconnect()
    }

    // 注册自定义事件监听
    for (const [eventName] of this.handlers) {
      if (eventName !== 'message') {
        this.eventSource.addEventListener(eventName, (event: MessageEvent) => {
          this.dispatchEvent(eventName, {
            data: event.data,
            id: event.lastEventId,
            event: eventName,
          })
        })
      }
    }
  }

  /** 断开连接 */
  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
    if (this.eventSource) {
      this.eventSource.close()
      this.eventSource = null
    }
  }

  /** 监听事件 */
  on(eventName: string, handler: SSEEventHandler): void {
    if (!this.handlers.has(eventName)) {
      this.handlers.set(eventName, [])
    }
    this.handlers.get(eventName)!.push(handler)
  }

  /** 移除监听 */
  off(eventName: string, handler: SSEEventHandler): void {
    const handlers = this.handlers.get(eventName)
    if (handlers) {
      const index = handlers.indexOf(handler)
      if (index !== -1) {
        handlers.splice(index, 1)
      }
    }
  }

  /** 分发事件 */
  private dispatchEvent(eventName: string, event: SSEEvent): void {
    const handlers = this.handlers.get(eventName) ?? []
    for (const handler of handlers) {
      try {
        handler(event)
      } catch (error) {
        console.error(`[SSE] Handler error for ${eventName}:`, error)
      }
    }
  }

  /** 处理重连 */
  private handleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[SSE] Max reconnect attempts reached')
      return
    }

    this.reconnectAttempts++
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1)

    console.log(`[SSE] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`)

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, delay)
  }
}

/**
 * BlockStream 渲染器
 * 将 SSE 事件流渲染为 UI 块
 */
export class BlockStreamRenderer {
  private blocks: Map<string, string> = new Map()
  private onUpdate: (blocks: Map<string, string>) => void

  constructor(onUpdate: (blocks: Map<string, string>) => void) {
    this.onUpdate = onUpdate
  }

  /** 处理 SSE 事件 */
  handleEvent(event: SSEEvent): void {
    try {
      const data = JSON.parse(event.data)

      switch (data.type) {
        case 'block_start':
          this.blocks.set(data.blockId, '')
          break
        case 'block_delta':
          const current = this.blocks.get(data.blockId) ?? ''
          this.blocks.set(data.blockId, current + data.content)
          break
        case 'block_end':
          // 块完成
          break
        case 'error':
          console.error('[BlockStream] Error:', data.message)
          break
      }

      this.onUpdate(new Map(this.blocks))
    } catch (error) {
      console.error('[BlockStream] Parse error:', error)
    }
  }

  /** 获取所有块 */
  getBlocks(): Map<string, string> {
    return new Map(this.blocks)
  }

  /** 清空块 */
  clear(): void {
    this.blocks.clear()
    this.onUpdate(new Map())
  }
}

/**
 * 创建 SSE 连接
 */
export function createSSEConnection(url: string): SSEClient {
  return new SSEClient(url)
}
