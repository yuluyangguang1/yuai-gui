/**
 * Queue Guard — 参考 OpenClaw queue-guard 插件
 * fetch 拦截器, 高并发自动排队, 避免 429 错误
 * fail-open 策略: 排队接口异常时直接放行
 */

// ══════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════

export type QueueState = 'idle' | 'waiting' | 'ready' | 'timeout' | 'error'

export interface QueueConfig {
  /** 是否启用排队 */
  enabled: boolean
  /** 轮询间隔 ms */
  poll_interval_ms: number
  /** 最大等待时间 ms */
  max_wait_ms: number
  /** 最大并发数 */
  max_concurrent: number
  /** 失败策略: 'fail-open' | 'fail-closed' */
  failure_policy: 'fail-open' | 'fail-closed'
}

export interface QueueEntry {
  id: string
  provider_id: string
  model_id: string
  state: QueueState
  position: number
  enqueued_at: number
  started_at?: number
  completed_at?: number
  error?: string
}

export interface QueueStats {
  total_enqueued: number
  total_completed: number
  total_timeout: number
  total_error: number
  current_waiting: number
  current_active: number
  avg_wait_ms: number
}

// ══════════════════════════════════════════════
// 默认配置
// ══════════════════════════════════════════════

export const DEFAULT_QUEUE_CONFIG: QueueConfig = {
  enabled: true,
  poll_interval_ms: 2000,
  max_wait_ms: 120_000, // 2分钟
  max_concurrent: 3,
  failure_policy: 'fail-open',
}

// ══════════════════════════════════════════════
// Queue Guard 实现
// ══════════════════════════════════════════════

export class QueueGuard {
  private config: QueueConfig
  private queue: QueueEntry[] = []
  private active: Map<string, QueueEntry> = new Map()
  private stats: QueueStats = {
    total_enqueued: 0,
    total_completed: 0,
    total_timeout: 0,
    total_error: 0,
    current_waiting: 0,
    current_active: 0,
    avg_wait_ms: 0,
  }
  private wait_times: number[] = []

  constructor(config: Partial<QueueConfig> = {}) {
    this.config = { ...DEFAULT_QUEUE_CONFIG, ...config }
  }

  /** 请求入队 */
  async enqueue(providerId: string, modelId: string): Promise<QueueEntry> {
    if (!this.config.enabled) {
      // 排队未启用, 直接返回 ready
      return {
        id: crypto.randomUUID(),
        provider_id: providerId,
        model_id: modelId,
        state: 'ready',
        position: 0,
        enqueued_at: Date.now(),
        started_at: Date.now(),
      }
    }

    const entry: QueueEntry = {
      id: crypto.randomUUID(),
      provider_id: providerId,
      model_id: modelId,
      state: 'waiting',
      position: this.queue.length,
      enqueued_at: Date.now(),
    }

    this.queue.push(entry)
    this.stats.total_enqueued++
    this.stats.current_waiting = this.queue.length

    // 等待排到
    return this.waitForReady(entry)
  }

  /** 完成请求 */
  complete(entryId: string): void {
    const entry = this.active.get(entryId)
    if (entry) {
      entry.state = 'ready'
      entry.completed_at = Date.now()
      this.active.delete(entryId)

      const waitTime = (entry.started_at ?? entry.completed_at) - entry.enqueued_at
      this.wait_times.push(waitTime)
      if (this.wait_times.length > 100) this.wait_times.shift()

      this.stats.total_completed++
      this.stats.current_active = this.active.size
      this.stats.avg_wait_ms = this.wait_times.reduce((s, w) => s + w, 0) / this.wait_times.length
    }
  }

  /** 标记失败 */
  fail(entryId: string, error: string): void {
    const entry = this.active.get(entryId) ?? this.queue.find(e => e.id === entryId)
    if (entry) {
      entry.state = 'error'
      entry.error = error
      entry.completed_at = Date.now()
      this.active.delete(entryId)
      this.queue = this.queue.filter(e => e.id !== entryId)
      this.stats.total_error++
      this.stats.current_active = this.active.size
      this.stats.current_waiting = this.queue.length
    }
  }

  /** 获取当前状态 */
  getState(): { queue_length: number; active_count: number; stats: QueueStats } {
    return {
      queue_length: this.queue.length,
      active_count: this.active.size,
      stats: { ...this.stats },
    }
  }

  /** 检查是否可以立即执行 */
  canExecuteImmediately(): boolean {
    return !this.config.enabled || this.active.size < this.config.max_concurrent
  }

  /** 更新配置 */
  updateConfig(config: Partial<QueueConfig>): void {
    this.config = { ...this.config, ...config }
  }

  /** 等待排到 */
  private async waitForReady(entry: QueueEntry): Promise<QueueEntry> {
    const startTime = Date.now()

    return new Promise((resolve) => {
      const check = () => {
        const elapsed = Date.now() - startTime

        // 超时
        if (elapsed >= this.config.max_wait_ms) {
          entry.state = 'timeout'
          this.queue = this.queue.filter(e => e.id !== entry.id)
          this.stats.total_timeout++
          this.stats.current_waiting = this.queue.length

          if (this.config.failure_policy === 'fail-open') {
            entry.state = 'ready'
            entry.started_at = Date.now()
            this.active.set(entry.id, entry)
            this.stats.current_active = this.active.size
            resolve(entry)
          } else {
            resolve(entry)
          }
          return
        }

        // 检查是否可以执行
        if (this.active.size < this.config.max_concurrent) {
          // 排到自己了
          const queueIndex = this.queue.indexOf(entry)
          if (queueIndex === 0 || queueIndex < this.config.max_concurrent - this.active.size) {
            entry.state = 'ready'
            entry.started_at = Date.now()
            entry.position = 0
            this.queue = this.queue.filter(e => e.id !== entry.id)
            this.active.set(entry.id, entry)
            this.stats.current_waiting = this.queue.length
            this.stats.current_active = this.active.size
            resolve(entry)
            return
          }
        }

        // 更新位置
        entry.position = this.queue.indexOf(entry)

        // 继续轮询
        setTimeout(check, this.config.poll_interval_ms)
      }

      check()
    })
  }
}

// ══════════════════════════════════════════════
// Fetch 拦截器
// ══════════════════════════════════════════════

/**
 * 创建排队感知的 fetch 包装器
 * 在发送 LLM 请求前自动排队
 */
export function createQueuedFetch(
  queueGuard: QueueGuard,
  originalFetch: typeof fetch,
): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url

    // 只拦截 LLM API 请求
    const isLLMRequest = url.includes('/v1/chat/completions') ||
      url.includes('/v1/messages') ||
      url.includes('/v1/responses') ||
      url.includes('/v1/completions')

    if (!isLLMRequest) {
      return originalFetch(input, init)
    }

    // 从 URL 推断 provider/model (简化)
    const providerId = 'default'
    const modelId = 'default'

    // 入队等待
    const entry = await queueGuard.enqueue(providerId, modelId)

    if (entry.state === 'timeout' && queueGuard['config'].failure_policy === 'fail-closed') {
      throw new Error('Queue timeout: 请求排队超时')
    }

    try {
      const response = await originalFetch(input, init)

      // 429 速率限制 → 标记失败, 但不阻塞
      if (response.status === 429) {
        queueGuard.fail(entry.id, '429 Rate Limited')
      } else {
        queueGuard.complete(entry.id)
      }

      return response
    } catch (e) {
      queueGuard.fail(entry.id, String(e))
      throw e
    }
  }
}

// ══════════════════════════════════════════════
// 全局实例
// ══════════════════════════════════════════════

export const globalQueueGuard = new QueueGuard()

/**
 * 安装 Queue Guard — 替换 globalThis.fetch
 */
export function installQueueGuard(config: Partial<QueueConfig> = {}): void {
  if (Object.keys(config).length > 0) {
    globalQueueGuard.updateConfig(config)
  }
  const originalFetch = globalThis.fetch
  globalThis.fetch = createQueuedFetch(globalQueueGuard, originalFetch) as typeof fetch
  console.log(`[QueueGuard] 已安装 | 最大并发: ${config.max_concurrent ?? 3} | 最大等待: ${config.max_wait_ms ?? 120000}ms`)
}
