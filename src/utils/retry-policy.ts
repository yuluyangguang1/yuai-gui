/**
 * 重试策略系统
 * 参考 Omnigent 的 RetryPolicy
 * 统一的重试机制
 */

export type RetryStrategy = 'fixed' | 'exponential' | 'linear' | 'fibonacci'

export interface RetryConfig {
  maxAttempts: number
  strategy: RetryStrategy
  baseDelay: number
  maxDelay: number
  backoffMultiplier: number
  jitter: boolean
  retryableErrors?: string[]
}

export interface RetryState {
  attempt: number
  lastError?: string
  totalDelay: number
  nextDelay: number
}

/**
 * 重试策略管理器
 * 统一的重试机制，支持多种策略
 */
export class RetryPolicyManager {
  private configs: Map<string, RetryConfig> = new Map()
  private states: Map<string, RetryState> = new Map()

  /** 注册重试配置 */
  registerConfig(id: string, config: RetryConfig): void {
    this.configs.set(id, config)
  }

  /** 获取重试配置 */
  getConfig(id: string): RetryConfig | undefined {
    return this.configs.get(id)
  }

  /** 初始化重试状态 */
  initState(id: string): void {
    this.states.set(id, {
      attempt: 0,
      totalDelay: 0,
      nextDelay: 0,
    })
  }

  /** 获取重试状态 */
  getState(id: string): RetryState | undefined {
    return this.states.get(id)
  }

  /** 检查是否应该重试 */
  shouldRetry(id: string, error?: string): boolean {
    const config = this.configs.get(id)
    const state = this.states.get(id)

    if (!config || !state) return false

    // 检查是否超过最大尝试次数
    if (state.attempt >= config.maxAttempts) return false

    // 检查错误是否可重试
    if (config.retryableErrors && error) {
      if (!config.retryableErrors.some(e => error.includes(e))) {
        return false
      }
    }

    return true
  }

  /** 计算下次重试延迟 */
  calculateDelay(id: string): number {
    const config = this.configs.get(id)
    const state = this.states.get(id)

    if (!config || !state) return 0

    let delay: number

    switch (config.strategy) {
      case 'fixed':
        delay = config.baseDelay
        break
      case 'exponential':
        delay = config.baseDelay * Math.pow(config.backoffMultiplier, state.attempt)
        break
      case 'linear':
        delay = config.baseDelay * (state.attempt + 1)
        break
      case 'fibonacci':
        delay = config.baseDelay * this.fibonacci(state.attempt + 1)
        break
      default:
        delay = config.baseDelay
    }

    // 应用最大延迟限制
    delay = Math.min(delay, config.maxDelay)

    // 应用抖动
    if (config.jitter) {
      delay = delay * (0.5 + Math.random() * 0.5)
    }

    return Math.round(delay)
  }

  /** 执行重试 */
  async executeWithRetry<T>(
    id: string,
    fn: () => Promise<T>,
    onError?: (error: Error, attempt: number) => void
  ): Promise<T> {
    this.initState(id)

    while (true) {
      const state = this.states.get(id)!
      const config = this.configs.get(id)!

      try {
        const result = await fn()
        return result
      } catch (error) {
        state.attempt++
        state.lastError = error instanceof Error ? error.message : 'Unknown error'

        if (!this.shouldRetry(id, state.lastError)) {
          throw error
        }

        const delay = this.calculateDelay(id)
        state.nextDelay = delay
        state.totalDelay += delay

        onError?.(error instanceof Error ? error : new Error(String(error)), state.attempt)

        await this.sleep(delay)
      }
    }
  }

  /** 斐波那契数列 */
  private fibonacci(n: number): number {
    if (n <= 1) return n
    let a = 0, b = 1
    for (let i = 2; i <= n; i++) {
      [a, b] = [b, a + b]
    }
    return b
  }

  /** 睡眠 */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /** 重置状态 */
  resetState(id: string): void {
    this.states.delete(id)
  }

  /** 清空所有状态 */
  clearAllStates(): void {
    this.states.clear()
  }
}

// 默认重试配置
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  strategy: 'exponential',
  baseDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
  jitter: true,
}

// 全局重试策略管理器实例
export const globalRetryPolicyManager = new RetryPolicyManager()

// 注册默认配置
globalRetryPolicyManager.registerConfig('default', DEFAULT_RETRY_CONFIG)
