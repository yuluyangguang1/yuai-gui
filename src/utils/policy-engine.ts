/**
 * 策略引擎
 * 参考 Omnigent PolicySystem
 * 工具调用前的审批/限制机制
 */

export type PolicyResult = 'ALLOW' | 'DENY' | 'ASK'
export type PolicyPhase = 'REQUEST' | 'RESPONSE' | 'TOOL_CALL' | 'TOOL_RESULT'

export interface PolicyContext {
  userId?: string
  agentId?: string
  toolName?: string
  toolParams?: Record<string, unknown>
  message?: string
  phase: PolicyPhase
}

export interface Policy {
  id: string
  name: string
  description: string
  phase: PolicyPhase
  evaluate: (context: PolicyContext) => PolicyResult | Promise<PolicyResult>
}

/**
 * 策略引擎
 * 管理和执行策略规则
 */
export class PolicyEngine {
  private policies: Map<string, Policy> = new Map()

  /** 注册策略 */
  register(policy: Policy): void {
    this.policies.set(policy.id, policy)
  }

  /** 注销策略 */
  unregister(policyId: string): void {
    this.policies.delete(policyId)
  }

  /** 获取所有策略 */
  getAllPolicies(): Policy[] {
    return Array.from(this.policies.values())
  }

  /** 获取指定阶段的策略 */
  getPoliciesForPhase(phase: PolicyPhase): Policy[] {
    return Array.from(this.policies.values()).filter(p => p.phase === phase)
  }

  /** 执行所有策略检查 */
  async evaluate(context: PolicyContext): Promise<{ result: PolicyResult; reason?: string }> {
    const policies = this.getPoliciesForPhase(context.phase)

    for (const policy of policies) {
      const result = await policy.evaluate(context)
      if (result === 'DENY') {
        return { result: 'DENY', reason: `策略 ${policy.name} 拒绝` }
      }
      if (result === 'ASK') {
        return { result: 'ASK', reason: `策略 ${policy.name} 需要确认` }
      }
    }

    return { result: 'ALLOW' }
  }
}

// 预定义策略
export const COST_POLICY: Policy = {
  id: 'cost-limit',
  name: '成本限制',
  description: '检查工具调用是否超出预算',
  phase: 'TOOL_CALL',
  evaluate: (context) => {
    // TODO: 实现成本检查逻辑
    return 'ALLOW'
  },
}

export const SAFETY_POLICY: Policy = {
  id: 'safety-check',
  name: '安全检查',
  description: '检查工具调用是否安全',
  phase: 'TOOL_CALL',
  evaluate: (context) => {
    // TODO: 实现安全检查逻辑
    return 'ALLOW'
  },
}

export const RATE_LIMIT_POLICY: Policy = {
  id: 'rate-limit',
  name: '速率限制',
  description: '限制工具调用频率',
  phase: 'TOOL_CALL',
  evaluate: (context) => {
    // TODO: 实现速率限制逻辑
    return 'ALLOW'
  },
}

// 全局策略引擎实例
export const globalPolicyEngine = new PolicyEngine()

// 注册默认策略
globalPolicyEngine.register(COST_POLICY)
globalPolicyEngine.register(SAFETY_POLICY)
globalPolicyEngine.register(RATE_LIMIT_POLICY)
