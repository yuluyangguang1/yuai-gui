/**
 * Goal-based Token Budget — 参考 Codex CLI thread_goals
 * 按目标限制 token 消耗, 超限自动停止
 */

// ══════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════

export type GoalStatus = 'active' | 'paused' | 'blocked' | 'usage_limited' | 'budget_limited' | 'complete'

export interface TokenBudget {
  goal_id: string
  objective: string
  status: GoalStatus
  token_budget: number | null // null = 无限制
  tokens_used: number
  time_budget_ms: number | null // null = 无限制
  time_used_ms: number
  created_at: number
  updated_at: number
}

export interface BudgetCheckResult {
  allowed: boolean
  reason?: string
  remaining_tokens?: number
  remaining_time_ms?: number
  usage_pct?: number
}

// ══════════════════════════════════════════════
// Budget Manager
// ══════════════════════════════════════════════

export class TokenBudgetManager {
  private goals = new Map<string, TokenBudget>()
  private warnings: Array<{ goal_id: string; message: string; timestamp: number }> = []

  /** 创建目标预算 */
  createGoal(
    goalId: string,
    objective: string,
    options: { token_budget?: number; time_budget_ms?: number } = {},
  ): TokenBudget {
    const budget: TokenBudget = {
      goal_id: goalId,
      objective,
      status: 'active',
      token_budget: options.token_budget ?? null,
      tokens_used: 0,
      time_budget_ms: options.time_budget_ms ?? null,
      time_used_ms: 0,
      created_at: Date.now(),
      updated_at: Date.now(),
    }
    this.goals.set(goalId, budget)
    return budget
  }

  /** 记录 token 使用 */
  recordUsage(goalId: string, tokens: number): BudgetCheckResult {
    const goal = this.goals.get(goalId)
    if (!goal) return { allowed: true }

    goal.tokens_used += tokens
    goal.updated_at = Date.now()

    // 检查 token 预算
    if (goal.token_budget !== null) {
      const usage_pct = goal.tokens_used / goal.token_budget
      const remaining = goal.token_budget - goal.tokens_used

      if (remaining <= 0) {
        goal.status = 'usage_limited'
        this.addWarning(goalId, `Token 预算耗尽: ${goal.tokens_used}/${goal.token_budget}`)
        return { allowed: false, reason: 'Token 预算耗尽', remaining_tokens: 0, usage_pct: 1 }
      }

      // 90% 预警
      if (usage_pct >= 0.9) {
        this.addWarning(goalId, `Token 预算即将耗尽: ${Math.round(usage_pct * 100)}%`)
      }

      return { allowed: true, remaining_tokens: remaining, usage_pct }
    }

    return { allowed: true }
  }

  /** 记录时间使用 */
  recordTime(goalId: string, durationMs: number): BudgetCheckResult {
    const goal = this.goals.get(goalId)
    if (!goal) return { allowed: true }

    goal.time_used_ms += durationMs
    goal.updated_at = Date.now()

    if (goal.time_budget_ms !== null) {
      const remaining = goal.time_budget_ms - goal.time_used_ms
      if (remaining <= 0) {
        goal.status = 'budget_limited'
        this.addWarning(goalId, `时间预算耗尽: ${Math.round(goal.time_used_ms / 1000)}s`)
        return { allowed: false, reason: '时间预算耗尽', remaining_time_ms: 0 }
      }
      return { allowed: true, remaining_time_ms: remaining }
    }

    return { allowed: true }
  }

  /** 检查是否允许继续 */
  checkBudget(goalId: string): BudgetCheckResult {
    const goal = this.goals.get(goalId)
    if (!goal) return { allowed: true }
    if (goal.status !== 'active') return { allowed: false, reason: `目标状态: ${goal.status}` }

    const tokenCheck = goal.token_budget !== null
      ? { remaining: goal.token_budget - goal.tokens_used, pct: goal.tokens_used / goal.token_budget }
      : null

    const timeCheck = goal.time_budget_ms !== null
      ? { remaining: goal.time_budget_ms - goal.time_used_ms }
      : null

    if (tokenCheck && tokenCheck.remaining <= 0) {
      return { allowed: false, reason: 'Token 预算耗尽', usage_pct: 1 }
    }
    if (timeCheck && timeCheck.remaining <= 0) {
      return { allowed: false, reason: '时间预算耗尽' }
    }

    return {
      allowed: true,
      remaining_tokens: tokenCheck?.remaining,
      remaining_time_ms: timeCheck?.remaining,
      usage_pct: tokenCheck?.pct,
    }
  }

  /** 暂停目标 */
  pauseGoal(goalId: string): void {
    const goal = this.goals.get(goalId)
    if (goal && goal.status === 'active') {
      goal.status = 'paused'
      goal.updated_at = Date.now()
    }
  }

  /** 恢复目标 */
  resumeGoal(goalId: string): void {
    const goal = this.goals.get(goalId)
    if (goal && goal.status === 'paused') {
      goal.status = 'active'
      goal.updated_at = Date.now()
    }
  }

  /** 完成目标 */
  completeGoal(goalId: string): void {
    const goal = this.goals.get(goalId)
    if (goal) {
      goal.status = 'complete'
      goal.updated_at = Date.now()
    }
  }

  /** 获取目标 */
  getGoal(goalId: string): TokenBudget | undefined {
    return this.goals.get(goalId)
  }

  /** 获取所有目标 */
  getAllGoals(): TokenBudget[] {
    return Array.from(this.goals.values())
  }

  /** 获取活跃目标 */
  getActiveGoals(): TokenBudget[] {
    return Array.from(this.goals.values()).filter(g => g.status === 'active')
  }

  /** 获取警告 */
  getWarnings(goalId?: string): Array<{ goal_id: string; message: string; timestamp: number }> {
    if (goalId) return this.warnings.filter(w => w.goal_id === goalId)
    return [...this.warnings]
  }

  /** 清除警告 */
  clearWarnings(goalId?: string): void {
    if (goalId) {
      this.warnings = this.warnings.filter(w => w.goal_id !== goalId)
    } else {
      this.warnings = []
    }
  }

  private addWarning(goalId: string, message: string): void {
    this.warnings.push({ goal_id: goalId, message, timestamp: Date.now() })
    // 保留最近 100 条警告
    if (this.warnings.length > 100) {
      this.warnings = this.warnings.slice(-100)
    }
  }
}

// ══════════════════════════════════════════════
// 持久化
// ══════════════════════════════════════════════

const STORAGE_KEY = 'yuai-token-budgets'

export function saveBudgets(manager: TokenBudgetManager): void {
  try {
    const data = manager.getAllGoals()
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  } catch { /* ignore */ }
}

export function loadBudgets(manager: TokenBudgetManager): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const goals: TokenBudget[] = JSON.parse(raw)
    for (const goal of goals) {
      // 恢复活跃目标, 其他标记为 paused
      if (goal.status === 'active') {
        goal.status = 'paused'
      }
      manager.createGoal(goal.goal_id, goal.objective, {
        token_budget: goal.token_budget ?? undefined,
        time_budget_ms: goal.time_budget_ms ?? undefined,
      })
    }
  } catch { /* ignore */ }
}
