/**
 * 成本顾问系统
 * 参考 Omnigent 的 CostAdvisor
 * Token 成本追踪和预算限制
 */

export interface ModelPricing {
  model: string
  inputPricePer1k: number  // 每 1K 输入 token 价格
  outputPricePer1k: number // 每 1K 输出 token 价格
  currency: string
}

export interface CostRecord {
  id: string
  agentId: string
  model: string
  inputTokens: number
  outputTokens: number
  cost: number
  timestamp: number
  sessionId?: string
}

export interface BudgetConfig {
  dailyLimit: number
  monthlyLimit: number
  alertThreshold: number // 0-1, 触发警告的阈值
}

/**
 * 成本顾问
 * 追踪 Token 使用量和成本
 */
export class CostAdvisor {
  private records: CostRecord[] = []
  private pricing: Map<string, ModelPricing> = new Map()
  private budget: BudgetConfig

  constructor(budget: BudgetConfig) {
    this.budget = budget
    this.initDefaultPricing()
  }

  /** 初始化默认定价 */
  private initDefaultPricing() {
    const defaults: ModelPricing[] = [
      { model: 'gpt-4o', inputPricePer1k: 0.0025, outputPricePer1k: 0.01, currency: 'USD' },
      { model: 'gpt-4o-mini', inputPricePer1k: 0.00015, outputPricePer1k: 0.0006, currency: 'USD' },
      { model: 'claude-sonnet-4', inputPricePer1k: 0.003, outputPricePer1k: 0.015, currency: 'USD' },
      { model: 'claude-haiku', inputPricePer1k: 0.00025, outputPricePer1k: 0.00125, currency: 'USD' },
      { model: 'deepseek-chat', inputPricePer1k: 0.00014, outputPricePer1k: 0.00028, currency: 'USD' },
    ]

    for (const pricing of defaults) {
      this.pricing.set(pricing.model, pricing)
    }
  }

  /** 记录成本 */
  recordCost(agentId: string, model: string, inputTokens: number, outputTokens: number, sessionId?: string): CostRecord {
    const pricing = this.pricing.get(model)
    const cost = pricing
      ? (inputTokens * pricing.inputPricePer1k + outputTokens * pricing.outputPricePer1k) / 1000
      : 0

    const record: CostRecord = {
      id: crypto.randomUUID(),
      agentId,
      model,
      inputTokens,
      outputTokens,
      cost,
      timestamp: Date.now(),
      sessionId,
    }

    this.records.push(record)
    return record
  }

  /** 获取今日成本 */
  getTodayCost(): number {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayTimestamp = today.getTime()

    return this.records
      .filter(r => r.timestamp >= todayTimestamp)
      .reduce((sum, r) => sum + r.cost, 0)
  }

  /** 获取本月成本 */
  getMonthCost(): number {
    const now = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime()

    return this.records
      .filter(r => r.timestamp >= monthStart)
      .reduce((sum, r) => sum + r.cost, 0)
  }

  /** 获取总成本 */
  getTotalCost(): number {
    return this.records.reduce((sum, r) => sum + r.cost, 0)
  }

  /** 检查是否超出预算 */
  checkBudget(): { exceeded: boolean; warning: boolean; message: string } {
    const todayCost = this.getTodayCost()
    const monthCost = this.getMonthCost()

    if (todayCost >= this.budget.dailyLimit) {
      return {
        exceeded: true,
        warning: false,
        message: `今日成本已超出限制: $${todayCost.toFixed(2)} / $${this.budget.dailyLimit}`,
      }
    }

    if (monthCost >= this.budget.monthlyLimit) {
      return {
        exceeded: true,
        warning: false,
        message: `本月成本已超出限制: $${monthCost.toFixed(2)} / $${this.budget.monthlyLimit}`,
      }
    }

    if (todayCost >= this.budget.dailyLimit * this.budget.alertThreshold) {
      return {
        exceeded: false,
        warning: true,
        message: `今日成本接近限制: $${todayCost.toFixed(2)} / $${this.budget.dailyLimit}`,
      }
    }

    if (monthCost >= this.budget.monthlyLimit * this.budget.alertThreshold) {
      return {
        exceeded: false,
        warning: true,
        message: `本月成本接近限制: $${monthCost.toFixed(2)} / $${this.budget.monthlyLimit}`,
      }
    }

    return { exceeded: false, warning: false, message: '' }
  }

  /** 获取按 Agent 分组的成本统计 */
  getCostByAgent(): Map<string, number> {
    const costByAgent = new Map<string, number>()
    for (const record of this.records) {
      const current = costByAgent.get(record.agentId) ?? 0
      costByAgent.set(record.agentId, current + record.cost)
    }
    return costByAgent
  }

  /** 获取按模型分组的成本统计 */
  getCostByModel(): Map<string, number> {
    const costByModel = new Map<string, number>()
    for (const record of this.records) {
      const current = costByModel.get(record.model) ?? 0
      costByModel.set(record.model, current + record.cost)
    }
    return costByModel
  }

  /** 获取记录 */
  getRecords(limit?: number): CostRecord[] {
    const sorted = [...this.records].sort((a, b) => b.timestamp - a.timestamp)
    return limit ? sorted.slice(0, limit) : sorted
  }

  /** 清空记录 */
  clearRecords(): void {
    this.records = []
  }
}

// 默认预算配置
export const DEFAULT_BUDGET_CONFIG: BudgetConfig = {
  dailyLimit: 10,    // $10/天
  monthlyLimit: 100, // $100/月
  alertThreshold: 0.8, // 80% 时警告
}

// 全局成本顾问实例
export const globalCostAdvisor = new CostAdvisor(DEFAULT_BUDGET_CONFIG)
