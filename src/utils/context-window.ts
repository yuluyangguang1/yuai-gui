/**
 * Context Window Fallback — 参考 LiteLLM context_window_fallbacks
 * 超长 prompt 自动降级到大上下文模型
 * 用便宜模型压缩旧上下文, 推理用强模型
 */

import type { ModelDef } from '../stores/provider'
import type { ModelRole, RoleAssignments } from './model-roles'
import { getModelForRole } from './model-roles'
import { lookupContextLength } from './models-dev'

// ══════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════

export interface ContextWindowConfig {
  /** 当前模型的上下文窗口 token 数 */
  current_context: number
  /** 安全阈值: 使用多少比例后触发回退 (0.8 = 80%) */
  safety_threshold: number
  /** 压缩阈值: 使用多少比例后触发压缩 (0.5 = 50%) */
  compress_threshold: number
  /** 回退模型列表 (按优先级排序) */
  fallback_models: Array<{ model_id: string; provider_id: string; context_window: number }>
}

export interface TokenEstimate {
  /** 当前消息的 token 数 */
  current_tokens: number
  /** 上下文窗口总大小 */
  context_window: number
  /** 使用比例 */
  usage_ratio: number
  /** 是否需要压缩 */
  needs_compress: boolean
  /** 是否需要回退 */
  needs_fallback: boolean
}

// ══════════════════════════════════════════════
// 默认配置
// ══════════════════════════════════════════════

export const DEFAULT_CONTEXT_CONFIG: ContextWindowConfig = {
  current_context: 128_000,
  safety_threshold: 0.85,
  compress_threshold: 0.50,
  fallback_models: [
    // 大上下文模型作为回退目标
    { model_id: 'gemini-2.5-pro', provider_id: 'google', context_window: 1_000_000 },
    { model_id: 'gemini-2.5-flash', provider_id: 'google', context_window: 1_000_000 },
    { model_id: 'claude-haiku-4', provider_id: 'anthropic', context_window: 200_000 },
    { model_id: 'deepseek-chat', provider_id: 'deepseek', context_window: 64_000 },
  ],
}

// ══════════════════════════════════════════════
// Token 估算
// ══════════════════════════════════════════════

/**
 * 估算消息的 token 数 (粗略: 字符数 / 4)
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

/**
 * 估算消息列表的总 token 数
 */
export function estimateTotalTokens(messages: Array<{ content: string }>): number {
  return messages.reduce((sum, m) => sum + estimateTokens(m.content), 0)
}

/**
 * 检查上下文使用情况
 */
export function checkContextUsage(
  currentTokens: number,
  contextWindow: number,
  config: Partial<ContextWindowConfig> = {},
): TokenEstimate {
  const cfg = { ...DEFAULT_CONTEXT_CONFIG, ...config }
  const usage_ratio = currentTokens / contextWindow

  return {
    current_tokens: currentTokens,
    context_window: contextWindow,
    usage_ratio,
    needs_compress: usage_ratio >= cfg.compress_threshold,
    needs_fallback: usage_ratio >= cfg.safety_threshold,
  }
}

// ══════════════════════════════════════════════
// 回退决策
// ══════════════════════════════════════════════

/**
 * 选择回退模型
 * 当当前模型上下文不够用时, 选择一个大上下文模型
 */
export function selectFallbackModel(
  currentModelId: string,
  currentProviderId: string,
  currentTokens: number,
  models: ModelDef[],
  config: Partial<ContextWindowConfig> = {},
): { model_id: string; provider_id: string } | null {
  const cfg = { ...DEFAULT_CONTEXT_CONFIG, ...config }

  // 从配置的回退列表中找第一个能容纳当前 token 数的模型
  for (const fallback of cfg.fallback_models) {
    // 跳过当前模型
    if (fallback.model_id === currentModelId && fallback.provider_id === currentProviderId) continue

    // 检查模型是否可用
    const model = models.find(m => m.id === fallback.model_id && m.provider_id === fallback.provider_id)
    if (!model) continue

    // 检查上下文窗口是否够大
    const contextLength = model.context_length ?? fallback.context_window
    if (contextLength > 0 && currentTokens < contextLength * cfg.safety_threshold) {
      return { model_id: fallback.model_id, provider_id: fallback.provider_id }
    }
  }

  // 尝试从 models.dev 查找大上下文模型
  for (const model of models) {
    if (model.id === currentModelId && model.provider_id === currentProviderId) continue
    const ctx = model.context_length ?? lookupContextLength(model.provider_id, model.id) ?? 0
    if (ctx > 0 && currentTokens < ctx * cfg.safety_threshold) {
      return { model_id: model.id, provider_id: model.provider_id }
    }
  }

  return null
}

// ══════════════════════════════════════════════
// 双模型压缩 (参考 OpenHands)
// ══════════════════════════════════════════════

/**
 * 选择压缩模型
 * 用便宜模型压缩旧上下文, 保持强模型用于推理
 */
export function selectCompressModel(
  chatModelId: string,
  chatProviderId: string,
  assignments: RoleAssignments,
  models: ModelDef[],
): { model_id: string; provider_id: string } {
  // 优先使用专门的 compress 角色模型
  const compressConfig = getModelForRole('compress', assignments)
  if (compressConfig.enabled && compressConfig.model_id !== chatModelId) {
    return { model_id: compressConfig.model_id, provider_id: compressConfig.provider_id }
  }

  // 回退: 选择最便宜的可用模型
  const cheapModels = [
    { model_id: 'claude-haiku-4', provider_id: 'anthropic' },
    { model_id: 'gemini-2.5-flash', provider_id: 'google' },
    { model_id: 'deepseek-chat', provider_id: 'deepseek' },
    { model_id: 'gpt-4o', provider_id: 'openai' },
  ]

  for (const candidate of cheapModels) {
    if (candidate.model_id === chatModelId && candidate.provider_id === chatProviderId) continue
    const model = models.find(m => m.id === candidate.model_id && m.provider_id === candidate.provider_id)
    if (model) return { model_id: model.id, provider_id: model.provider_id }
  }

  // 最终回退: 用当前模型
  return { model_id: chatModelId, provider_id: chatProviderId }
}

// ══════════════════════════════════════════════
// 上下文管理器
// ══════════════════════════════════════════════

export class ContextWindowManager {
  private config: ContextWindowConfig

  constructor(config: Partial<ContextWindowConfig> = {}) {
    this.config = { ...DEFAULT_CONTEXT_CONFIG, ...config }
  }

  /**
   * 检查并决定下一步操作
   */
  analyze(
    currentTokens: number,
    contextWindow: number,
    currentModelId: string,
    currentProviderId: string,
    models: ModelDef[],
    assignments: RoleAssignments,
  ): {
    action: 'continue' | 'compress' | 'fallback'
    reason: string
    target_model?: { model_id: string; provider_id: string }
  } {
    const usage = checkContextUsage(currentTokens, contextWindow, this.config)

    if (usage.needs_fallback) {
      const fallback = selectFallbackModel(currentModelId, currentProviderId, currentTokens, models, this.config)
      if (fallback) {
        return {
          action: 'fallback',
          reason: `上下文使用 ${Math.round(usage.usage_ratio * 100)}% 超过阈值, 降级到 ${fallback.model_id}`,
          target_model: fallback,
        }
      }
    }

    if (usage.needs_compress) {
      const compressModel = selectCompressModel(currentModelId, currentProviderId, assignments, models)
      return {
        action: 'compress',
        reason: `上下文使用 ${Math.round(usage.usage_ratio * 100)}%, 建议压缩`,
        target_model: compressModel,
      }
    }

    return {
      action: 'continue',
      reason: `上下文使用 ${Math.round(usage.usage_ratio * 100)}%, 正常`,
    }
  }

  /** 更新配置 */
  updateConfig(config: Partial<ContextWindowConfig>): void {
    this.config = { ...this.config, ...config }
  }
}

// ══════════════════════════════════════════════
// 持久化
// ══════════════════════════════════════════════

const CONFIG_KEY = 'yuai-context-config'

export function loadContextConfig(): ContextWindowConfig {
  try {
    const raw = localStorage.getItem(CONFIG_KEY)
    if (raw) return { ...DEFAULT_CONTEXT_CONFIG, ...JSON.parse(raw) }
  } catch { /* ignore */ }
  return DEFAULT_CONTEXT_CONFIG
}

export function saveContextConfig(config: ContextWindowConfig): void {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config))
  } catch { /* ignore */ }
}
