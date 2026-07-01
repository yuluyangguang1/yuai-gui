/**
 * Per-Session Model Resolution — 参考 Hermes Studio run-chat/model-config
 * 优先级: session model > requested model > profile default
 */

import type { ProviderDef, ModelDef } from '../stores/provider'

export interface SessionModelConfig {
  session_model?: string      // 会话绑定的模型
  requested_model?: string    // 用户请求的模型
  profile_default_model: string
  profile_default_provider: string
}

export interface ResolvedModel {
  model_id: string
  provider_id: string
  source: 'session' | 'request' | 'default'
}

/**
 * 解析会话模型配置
 * 参考 Hermes Studio resolveBridgeRunModelConfig()
 */
export function resolveSessionModel(
  config: SessionModelConfig,
  availableModels: ModelDef[],
  availableProviders: ProviderDef[],
): ResolvedModel {
  const { session_model, requested_model, profile_default_model, profile_default_provider } = config

  // Priority 1: Session model (会话绑定的模型)
  if (session_model) {
    const model = availableModels.find(m => m.id === session_model)
    if (model) {
      return { model_id: model.id, provider_id: model.provider_id, source: 'session' }
    }
  }

  // Priority 2: Requested model (用户请求的模型)
  if (requested_model) {
    const model = availableModels.find(m => m.id === requested_model)
    if (model) {
      return { model_id: model.id, provider_id: model.provider_id, source: 'request' }
    }
    // 尝试别名解析
    const provider = availableProviders.find(p =>
      p.aliases.includes(requested_model.toLowerCase())
    )
    if (provider) {
      const firstModel = availableModels.find(m => m.provider_id === provider.id)
      if (firstModel) {
        return { model_id: firstModel.id, provider_id: provider.id, source: 'request' }
      }
    }
  }

  // Priority 3: Profile default
  return {
    model_id: profile_default_model,
    provider_id: profile_default_provider,
    source: 'default',
  }
}

/**
 * 会话模型管理器
 * 跟踪每个会话的模型绑定
 */
export class SessionModelManager {
  private maxSessions = 100
  private sessionModels = new Map<string, string>() // sessionId → modelId

  /** 绑定会话到模型 */
  bindSession(sessionId: string, modelId: string): void {
    this.sessionModels.set(sessionId, modelId)
  }

  /** 获取会话绑定的模型 */
  getSessionModel(sessionId: string): string | undefined {
    return this.sessionModels.get(sessionId)
  }

  /** 解绑会话 */
  unbindSession(sessionId: string): void {
    this.sessionModels.delete(sessionId)
  }

  /** 清除供应商的所有会话绑定 */
  clearProviderSessions(providerId: string, models: ModelDef[]): void {
    const providerModelIds = new Set(models.filter(m => m.provider_id === providerId).map(m => m.id))
    for (const [sessionId, modelId] of this.sessionModels.entries()) {
      if (providerModelIds.has(modelId)) {
        this.sessionModels.delete(sessionId)
      }
    }
  }

  /** 获取所有绑定 */
  getAllBindings(): Map<string, string> {
    return new Map(this.sessionModels)
  }
}
