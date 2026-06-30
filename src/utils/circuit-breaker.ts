/**
 * Circuit Breaker — 参考 LiteLLM deployment cooldown
 * 失败自动隔离 + 冷却期后恢复
 */

// ══════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════

export type CircuitState = 'closed' | 'open' | 'half_open'

export interface CircuitBreakerConfig {
  /** 失败阈值: 连续失败多少次后打开熔断器 */
  failure_threshold: number
  /** 冷却时间 ms */
  cooldown_ms: number
  /** 半开状态允许的试探请求数 */
  half_open_max_requests: number
  /** 失败百分比阈值 (基于滑动窗口) */
  failure_percentage_threshold: number
  /** 滑动窗口大小 (最近 N 个请求) */
  sliding_window_size: number
}

export interface CircuitStateEntry {
  state: CircuitState
  failure_count: number
  success_count: number
  last_failure_time: number
  last_failure_reason: string
  half_open_requests: number
  /** 滑动窗口: 最近 N 个请求的结果 */
  window: boolean[] // true=success, false=failure
  window_index: number
}

// ══════════════════════════════════════════════
// 默认配置
// ══════════════════════════════════════════════

export const DEFAULT_CONFIG: CircuitBreakerConfig = {
  failure_threshold: 5,
  cooldown_ms: 60_000, // 1分钟
  half_open_max_requests: 1,
  failure_percentage_threshold: 50,
  sliding_window_size: 10,
}

// ══════════════════════════════════════════════
// Circuit Breaker 实现
// ══════════════════════════════════════════════

export class CircuitBreaker {
  private circuits = new Map<string, CircuitStateEntry>()
  private config: CircuitBreakerConfig

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /** 获取供应商的熔断器状态 */
  getState(providerId: string): CircuitStateEntry {
    if (!this.circuits.has(providerId)) {
      this.circuits.set(providerId, {
        state: 'closed',
        failure_count: 0,
        success_count: 0,
        last_failure_time: 0,
        last_failure_reason: '',
        half_open_requests: 0,
        window: [],
        window_index: 0,
      })
    }
    return this.circuits.get(providerId)!
  }

  /** 检查是否允许请求 */
  canExecute(providerId: string): boolean {
    const entry = this.getState(providerId)

    switch (entry.state) {
      case 'closed':
        return true

      case 'open': {
        // 检查冷却期是否结束
        const now = Date.now()
        if (now - entry.last_failure_time >= this.config.cooldown_ms) {
          // 冷却期结束, 进入半开状态
          entry.state = 'half_open'
          entry.half_open_requests = 0
          return true
        }
        return false
      }

      case 'half_open': {
        // 半开状态允许有限的试探请求
        return entry.half_open_requests < this.config.half_open_max_requests
      }

      default:
        return true
    }
  }

  /** 记录成功 */
  recordSuccess(providerId: string): void {
    const entry = this.getState(providerId)

    // 更新滑动窗口
    this.addToWindow(entry, true)

    entry.success_count++

    if (entry.state === 'half_open') {
      // 半开状态成功 → 关闭熔断器
      entry.state = 'closed'
      entry.failure_count = 0
      entry.half_open_requests = 0
    }
  }

  /** 记录失败 */
  recordFailure(providerId: string, reason: string = ''): void {
    const entry = this.getState(providerId)

    // 更新滑动窗口
    this.addToWindow(entry, false)

    entry.failure_count++
    entry.last_failure_time = Date.now()
    entry.last_failure_reason = reason

    if (entry.state === 'half_open') {
      // 半开状态失败 → 重新打开熔断器
      entry.state = 'open'
      entry.half_open_requests = 0
      return
    }

    // 检查是否达到阈值
    if (entry.failure_count >= this.config.failure_threshold) {
      entry.state = 'open'
      return
    }

    // 检查失败百分比
    const failurePct = this.getFailurePercentage(entry)
    if (failurePct >= this.config.failure_percentage_threshold && entry.window.length >= 3) {
      entry.state = 'open'
    }
  }

  /** 获取剩余冷却时间 ms */
  getRemainingCooldown(providerId: string): number {
    const entry = this.getState(providerId)
    if (entry.state !== 'open') return 0
    const elapsed = Date.now() - entry.last_failure_time
    return Math.max(0, this.config.cooldown_ms - elapsed)
  }

  /** 手动重置熔断器 */
  reset(providerId: string): void {
    this.circuits.delete(providerId)
  }

  /** 获取所有熔断器状态 */
  getAllStates(): Record<string, { state: CircuitState; failures: number; cooldown_remaining: number }> {
    const result: Record<string, { state: CircuitState; failures: number; cooldown_remaining: number }> = {}
    for (const [id, entry] of this.circuits.entries()) {
      result[id] = {
        state: entry.state,
        failures: entry.failure_count,
        cooldown_remaining: this.getRemainingCooldown(id),
      }
    }
    return result
  }

  /** 获取失败百分比 (基于滑动窗口) */
  private getFailurePercentage(entry: CircuitStateEntry): number {
    if (entry.window.length === 0) return 0
    const failures = entry.window.filter(r => !r).length
    return (failures / entry.window.length) * 100
  }

  /** 添加到滑动窗口 */
  private addToWindow(entry: CircuitStateEntry, success: boolean): void {
    const size = this.config.sliding_window_size
    if (entry.window.length < size) {
      entry.window.push(success)
    } else {
      entry.window[entry.window_index] = success
    }
    entry.window_index = (entry.window_index + 1) % size
  }
}

// ══════════════════════════════════════════════
// 全局实例
// ══════════════════════════════════════════════

export const globalCircuitBreaker = new CircuitBreaker()

// ══════════════════════════════════════════════
// 预检管道 (参考 LiteLLM pre-call checks)
// ══════════════════════════════════════════════

export type PreCallCheckResult = { allowed: true } | { allowed: false; reason: string }

export interface PreCallCheck {
  name: string
  check: (providerId: string, modelId: string) => PreCallCheckResult | Promise<PreCallCheckResult>
}

/** 熔断器预检 */
export function createCircuitBreakerCheck(breaker: CircuitBreaker): PreCallCheck {
  return {
    name: 'circuit-breaker',
    check: (providerId) => {
      if (!breaker.canExecute(providerId)) {
        const remaining = breaker.getRemainingCooldown(providerId)
        const entry = breaker.getState(providerId)
        return {
          allowed: false,
          reason: `熔断器打开: ${entry.last_failure_reason} (冷却 ${Math.ceil(remaining / 1000)}s)`,
        }
      }
      return { allowed: true }
    },
  }
}

/** 速率限制预检 */
export function createRateLimitCheck(maxPerMinute: number): PreCallCheck {
  const timestamps: number[] = []
  return {
    name: 'rate-limit',
    check: () => {
      const now = Date.now()
      // 清理过期
      while (timestamps.length > 0 && timestamps[0] < now - 60_000) {
        timestamps.shift()
      }
      if (timestamps.length >= maxPerMinute) {
        return { allowed: false, reason: `速率限制: ${maxPerMinute}/分钟` }
      }
      timestamps.push(now)
      return { allowed: true }
    },
  }
}

/** 预检管道执行器 */
export async function runPreCallChecks(
  checks: PreCallCheck[],
  providerId: string,
  modelId: string,
): Promise<{ passed: true } | { passed: false; failed_check: string; reason: string }> {
  for (const check of checks) {
    const result = await check.check(providerId, modelId)
    if (!result.allowed) {
      return { passed: false, failed_check: check.name, reason: result.reason }
    }
  }
  return { passed: true }
}
