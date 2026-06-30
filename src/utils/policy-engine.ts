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
    const toolName = context.toolName ?? ''
    // Expensive tools that should be gated
    const expensiveTools = ['code_interpreter', 'web_search', 'browser', 'file_write', 'deploy']
    if (expensiveTools.some(t => toolName.includes(t))) {
      return 'ASK' // Ask user to confirm expensive operations
    }
    return 'ALLOW'
  },
}

export const SAFETY_POLICY: Policy = {
  id: 'safety-check',
  name: '安全检查',
  description: '检查工具调用是否安全',
  phase: 'TOOL_CALL',
  evaluate: (context) => {
    const toolName = context.toolName ?? ''
    const params = context.toolParams ?? {}
    // Block dangerous shell commands
    if (toolName === 'terminal' || toolName === 'shell') {
      const cmd = String(params.command ?? params.cmd ?? '')
      const dangerous = ['rm -rf /', 'mkfs', 'dd if=', ':(){:|:&};:', 'chmod 777 /', 'curl|bash', 'wget|sh']
      if (dangerous.some(d => cmd.includes(d))) {
        return 'DENY'
      }
      // Destructive commands need confirmation
      const risky = ['rm ', 'rm\t', 'git push --force', 'git reset --hard', 'docker rm', 'DROP TABLE', 'DELETE FROM']
      if (risky.some(r => cmd.includes(r))) {
        return 'ASK'
      }
    }
    // Block network tools from accessing internal IPs
    if (toolName === 'web_request' || toolName === 'fetch') {
      const url = String(params.url ?? '')
      if (/^(https?:\/\/)?(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|0\.|localhost)/i.test(url)) {
        return 'ASK'
      }
    }
    return 'ALLOW'
  },
}

export const RATE_LIMIT_POLICY: Policy = {
  id: 'rate-limit',
  name: '速率限制',
  description: '限制工具调用频率',
  phase: 'TOOL_CALL',
  evaluate: (() => {
    const callLog: Map<string, number[]> = new Map()
    const WINDOW_MS = 60_000 // 1 minute
    const MAX_CALLS_PER_MINUTE = 30

    return (context) => {
      const toolName = context.toolName ?? 'unknown'
      const now = Date.now()
      const timestamps = callLog.get(toolName) ?? []
      // Prune old entries
      const recent = timestamps.filter(t => now - t < WINDOW_MS)
      recent.push(now)
      callLog.set(toolName, recent)

      if (recent.length > MAX_CALLS_PER_MINUTE) {
        return 'DENY'
      }
      if (recent.length > MAX_CALLS_PER_MINUTE * 0.8) {
        return 'ASK'
      }
      return 'ALLOW'
    }
  })(),
}

// 全局策略引擎实例
export const globalPolicyEngine = new PolicyEngine()

// 注册默认策略
globalPolicyEngine.register(COST_POLICY)
globalPolicyEngine.register(SAFETY_POLICY)
globalPolicyEngine.register(RATE_LIMIT_POLICY)
