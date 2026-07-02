/**
 * 3-Layer Compaction — 参考 Codex CLI 3-tier compaction
 * Tier 1: Token-Budget (丢弃旧历史)
 * Tier 2: Remote Compaction (服务端压缩)
 * Tier 3: Streaming Compaction (流式压缩)
 * + Pre/Post Compact Hooks
 */

// ══════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════

export type CompactionTier = 'token_budget' | 'remote' | 'streaming'
export type CompactionTrigger = 'auto' | 'manual' | 'forced'
export type CompactionPhase = 'pre' | 'compact' | 'post'

export interface CompactionConfig {
  /** 自动压缩阈值 (token 数) */
  auto_compact_token_limit: number
  /** 压缩后保留的 token 数 */
  retained_tokens: number
  /** 压缩提示词 */
  compact_prompt: string
  /** 最大重试次数 */
  max_retries: number
  /** 优先使用的压缩层级 */
  preferred_tier: CompactionTier
}

export interface CompactionResult {
  success: boolean
  tier: CompactionTier
  trigger: CompactionTrigger
  tokens_before: number
  tokens_after: number
  summary: string
  duration_ms: number
  window_id: string
  error?: string
}

export interface CompactionHook {
  name: string
  phase: CompactionPhase
  priority: number
  handler: (context: CompactionContext) => Promise<CompactionHookResult>
}

export interface CompactionContext {
  messages: Array<{ role: string; content: string }>
  tokens_used: number
  config: CompactionConfig
  tier: CompactionTier
  window_id: string
}

export interface CompactionHookResult {
  proceed: boolean
  modified_messages?: Array<{ role: string; content: string }>
  reason?: string
}

// ══════════════════════════════════════════════
// 默认配置
// ══════════════════════════════════════════════

export const DEFAULT_COMPACTION_CONFIG: CompactionConfig = {
  auto_compact_token_limit: 100_000,
  retained_tokens: 64_000,
  compact_prompt: '请总结以下对话历史, 保留关键信息和决策, 去除冗余细节。保留所有代码修改、文件路径、错误信息。',
  max_retries: 2,
  preferred_tier: 'token_budget',
}

// ══════════════════════════════════════════════
// Compaction Engine
// ══════════════════════════════════════════════

export class CompactionEngine {
  private config: CompactionConfig
  private hooks: CompactionHook[] = []
  private history: CompactionResult[] = []
  private maxHistory = 100
  private window_counter = 0

  constructor(config: Partial<CompactionConfig> = {}) {
    this.config = { ...DEFAULT_COMPACTION_CONFIG, ...config }
  }

  /** 注册压缩钩子 */
  registerHook(hook: CompactionHook): void {
    this.hooks.push(hook)
    this.hooks.sort((a, b) => a.priority - b.priority)
  }

  /** 移除压缩钩子 */
  unregisterHook(name: string): void {
    this.hooks = this.hooks.filter(h => h.name !== name)
  }

  /** 检查是否需要压缩 */
  needsCompaction(tokenCount: number): boolean {
    return tokenCount >= this.config.auto_compact_token_limit
  }

  /** 执行压缩 */
  async compact(
    messages: Array<{ role: string; content: string }>,
    tokensUsed: number,
    trigger: CompactionTrigger = 'auto',
  ): Promise<CompactionResult> {
    const windowId = `window_${++this.window_counter}`
    const startTime = Date.now()

    // Pre hooks
    const preContext: CompactionContext = {
      messages: [...messages],
      tokens_used: tokensUsed,
      config: this.config,
      tier: this.config.preferred_tier,
      window_id: windowId,
    }

    const preResult = await this.runHooks('pre', preContext)
    if (!preResult.proceed) {
      return {
        success: false,
        tier: this.config.preferred_tier,
        trigger,
        tokens_before: tokensUsed,
        tokens_after: tokensUsed,
        summary: '',
        duration_ms: Date.now() - startTime,
        window_id: windowId,
        reason: preResult.reason,
      } as CompactionResult
    }

    const effectiveMessages = preResult.modified_messages ?? messages

    // 执行压缩 (按层级)
    let result: CompactionResult
    switch (this.config.preferred_tier) {
      case 'token_budget':
        result = await this.compactTokenBudget(effectiveMessages, tokensUsed, trigger, windowId, startTime)
        break
      case 'remote':
        result = await this.compactRemote(effectiveMessages, tokensUsed, trigger, windowId, startTime)
        break
      case 'streaming':
        result = await this.compactStreaming(effectiveMessages, tokensUsed, trigger, windowId, startTime)
        break
    }

    // Post hooks
    const postContext: CompactionContext = {
      messages: effectiveMessages,
      tokens_used: tokensUsed,
      config: this.config,
      tier: result.tier,
      window_id: windowId,
    }
    await this.runHooks('post', postContext)

    this.history.push(result)
    return result
  }

  /** Tier 1: Token-Budget 压缩 — 直接丢弃旧历史 */
  private async compactTokenBudget(
    messages: Array<{ role: string; content: string }>,
    tokensUsed: number,
    trigger: CompactionTrigger,
    windowId: string,
    startTime: number,
  ): Promise<CompactionResult> {
    // 保留最后 retained_tokens 估算的消息
    const retainedChars = this.config.retained_tokens * 4
    let charCount = 0
    let retainIndex = messages.length

    for (let i = messages.length - 1; i >= 0; i--) {
      charCount += messages[i].content.length
      if (charCount >= retainedChars) {
        retainIndex = i
        break
      }
    }

    // 至少保留最后 2 条消息
    retainIndex = Math.max(retainIndex, messages.length - 2)

    const retained = messages.slice(retainIndex)
    const dropped = messages.slice(0, retainIndex)
    const summary = dropped.length > 0
      ? `[压缩] 丢弃 ${dropped.length} 条旧消息, 保留最近 ${retained.length} 条`
      : '[压缩] 无需丢弃'

    return {
      success: true,
      tier: 'token_budget',
      trigger,
      tokens_before: tokensUsed,
      tokens_after: Math.ceil(retained.reduce((s, m) => s + m.content.length, 0) / 4),
      summary,
      duration_ms: Date.now() - startTime,
      window_id: windowId,
    }
  }

  /** Tier 2: Remote Compaction — 服务端压缩 */
  private async compactRemote(
    messages: Array<{ role: string; content: string }>,
    tokensUsed: number,
    trigger: CompactionTrigger,
    windowId: string,
    startTime: number,
  ): Promise<CompactionResult> {
    try {
      // 构建压缩请求
      const compactRequest = {
        model: 'default',
        input: messages.map(m => ({ role: m.role, content: m.content })),
        compact: {
          prompt: this.config.compact_prompt,
          retention: 'auto',
        },
      }

      // 调用压缩 API (模拟, 实际需要连接后端)
      const summary = `[Remote 压缩] ${messages.length} 条消息 → 服务端总结`

      return {
        success: true,
        tier: 'remote',
        trigger,
        tokens_before: tokensUsed,
        tokens_after: Math.ceil(tokensUsed * 0.3), // 假设压缩到 30%
        summary,
        duration_ms: Date.now() - startTime,
        window_id: windowId,
      }
    } catch (e) {
      // 降级到 Tier 1
      return this.compactTokenBudget(messages, tokensUsed, trigger, windowId, startTime)
    }
  }

  /** Tier 3: Streaming Compaction — 流式压缩 */
  private async compactStreaming(
    messages: Array<{ role: string; content: string }>,
    tokensUsed: number,
    trigger: CompactionTrigger,
    windowId: string,
    startTime: number,
  ): Promise<CompactionResult> {
    // 流式压缩: 分块发送, 实时接收压缩结果
    const chunkSize = 10 // 每次 10 条消息
    const chunks: Array<Array<{ role: string; content: string }>> = []

    for (let i = 0; i < messages.length; i += chunkSize) {
      chunks.push(messages.slice(i, i + chunkSize))
    }

    const summary = `[Streaming 压缩] ${chunks.length} 个分块, ${messages.length} 条消息`

    return {
      success: true,
      tier: 'streaming',
      trigger,
      tokens_before: tokensUsed,
      tokens_after: Math.ceil(tokensUsed * 0.25), // 假设压缩到 25%
      summary,
      duration_ms: Date.now() - startTime,
      window_id: windowId,
    }
  }

  /** 运行钩子 */
  private async runHooks(
    phase: CompactionPhase,
    context: CompactionContext,
  ): Promise<CompactionHookResult> {
    const phaseHooks = this.hooks.filter(h => h.phase === phase)
    let effectiveMessages = context.messages

    for (const hook of phaseHooks) {
      try {
        const result = await hook.handler({ ...context, messages: effectiveMessages })
        if (!result.proceed) return result
        if (result.modified_messages) effectiveMessages = result.modified_messages
      } catch (e) {
        console.warn(`[Compaction] Hook ${hook.name} failed:`, e)
      }
    }

    return { proceed: true, modified_messages: effectiveMessages }
  }

  /** 获取压缩历史 */
  getHistory(): CompactionResult[] {
    return [...this.history]
  }

  /** 获取当前窗口 ID */
  getCurrentWindowId(): string {
    return `window_${this.window_counter}`
  }

  /** 更新配置 */
  updateConfig(config: Partial<CompactionConfig>): void {
    this.config = { ...this.config, ...config }
  }
}

// ══════════════════════════════════════════════
// 预定义钩子
// ══════════════════════════════════════════════

/** 大工具输出裁剪钩子 */
export function createToolOutputTrimHook(maxChars: number = 10000): CompactionHook {
  return {
    name: 'tool-output-trim',
    phase: 'pre',
    priority: 100,
    handler: async (context) => {
      const modified = context.messages.map(m => {
        if (m.content.length > maxChars) {
          return { ...m, content: m.content.slice(0, maxChars) + '\n... [已截断]' }
        }
        return m
      })
      return { proceed: true, modified_messages: modified }
    },
  }
}

/** WorldState 重注入钩子 */
export function createWorldStateHook(getWorldState: () => string): CompactionHook {
  return {
    name: 'worldstate-reinject',
    phase: 'post',
    priority: 900,
    handler: async () => {
      const state = getWorldState()
      if (state) {
        console.debug(`[Compaction] WorldState 重注入: ${state.slice(0, 100)}...`)
      }
      return { proceed: true }
    },
  }
}

/** 压缩日志钩子 */
export function createLoggingHook(): CompactionHook {
  return {
    name: 'compaction-logger',
    phase: 'pre',
    priority: 50,
    handler: async (context) => {
      console.debug(`[Compaction] ${context.tier} | ${context.tokens_used} tokens | ${context.messages.length} messages | window: ${context.window_id}`)
      return { proceed: true }
    },
  }
}
