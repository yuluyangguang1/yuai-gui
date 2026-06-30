/**
 * Model Visibility & Aliases — 参考 Hermes Studio model-visibility/model-alias
 * 控制哪些模型在 UI 中显示，以及模型的显示名称
 */

// ══════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════

export type VisibilityMode = 'all' | 'include' | 'exclude'

export interface ModelVisibilityConfig {
  mode: VisibilityMode
  models: string[] // 模型 ID 列表
}

export interface ModelAliasConfig {
  [providerId: string]: {
    [modelId: string]: string // 显示名称
  }
}

export interface ModelVisibilityStore {
  [providerId: string]: ModelVisibilityConfig
}

// ══════════════════════════════════════════════
// 存储键
// ══════════════════════════════════════════════

const VISIBILITY_KEY = 'yuai-model-visibility'
const ALIASES_KEY = 'yuai-model-aliases'
const CUSTOM_MODELS_KEY = 'yuai-custom-models'

// ══════════════════════════════════════════════
// 模型可见性 (参考 Hermes Studio PUT /api/hermes/model-visibility)
// ══════════════════════════════════════════════

export function loadVisibility(): ModelVisibilityStore {
  try {
    const raw = localStorage.getItem(VISIBILITY_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

export function saveVisibility(store: ModelVisibilityStore): void {
  try {
    localStorage.setItem(VISIBILITY_KEY, JSON.stringify(store))
  } catch { /* ignore */ }
}

export function setProviderVisibility(
  providerId: string,
  mode: VisibilityMode,
  models: string[],
): void {
  const store = loadVisibility()
  store[providerId] = { mode, models }
  saveVisibility(store)
}

export function getProviderVisibility(providerId: string): ModelVisibilityConfig {
  const store = loadVisibility()
  return store[providerId] ?? { mode: 'all', models: [] }
}

/**
 * 过滤模型列表，只显示可见的模型
 * 参考 Hermes Studio getAvailable controller
 */
export function filterVisibleModels<T extends { id: string; provider_id: string }>(
  models: T[],
): T[] {
  const visibilityCache = new Map<string, ModelVisibilityConfig>()

  return models.filter(model => {
    let config = visibilityCache.get(model.provider_id)
    if (!config) {
      config = getProviderVisibility(model.provider_id)
      visibilityCache.set(model.provider_id, config)
    }

    switch (config.mode) {
      case 'all':
        return true
      case 'include':
        return config.models.includes(model.id)
      case 'exclude':
        return !config.models.includes(model.id)
      default:
        return true
    }
  })
}

// ══════════════════════════════════════════════
// 模型别名 (参考 Hermes Studio PUT /api/hermes/model-alias)
// ══════════════════════════════════════════════

export function loadAliases(): ModelAliasConfig {
  try {
    const raw = localStorage.getItem(ALIASES_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

export function saveAliases(config: ModelAliasConfig): void {
  try {
    localStorage.setItem(ALIASES_KEY, JSON.stringify(config))
  } catch { /* ignore */ }
}

export function setModelAlias(
  providerId: string,
  modelId: string,
  displayName: string,
): void {
  // 原型污染防护 (参考 Hermes Studio)
  if (modelId === '__proto__' || modelId === 'constructor') return

  const config = loadAliases()
  if (!config[providerId]) config[providerId] = {}
  config[providerId][modelId] = displayName
  saveAliases(config)
}

export function getModelAlias(providerId: string, modelId: string): string | null {
  const config = loadAliases()
  return config[providerId]?.[modelId] ?? null
}

export function removeModelAlias(providerId: string, modelId: string): void {
  const config = loadAliases()
  if (config[providerId]) {
    delete config[providerId][modelId]
    if (Object.keys(config[providerId]).length === 0) {
      delete config[providerId]
    }
    saveAliases(config)
  }
}

/**
 * 获取模型的显示名称 (别名优先)
 */
export function getDisplayName(providerId: string, modelId: string, fallback?: string): string {
  return getModelAlias(providerId, modelId) ?? fallback ?? modelId
}

// ══════════════════════════════════════════════
// 自定义模型 (参考 Hermes Studio PUT /api/hermes/custom-model)
// ══════════════════════════════════════════════

export function loadCustomModels(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(CUSTOM_MODELS_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch { return {} }
}

export function saveCustomModels(store: Record<string, string[]>): void {
  try {
    localStorage.setItem(CUSTOM_MODELS_KEY, JSON.stringify(store))
  } catch { /* ignore */ }
}

export function addCustomModel(providerId: string, modelId: string): void {
  const store = loadCustomModels()
  if (!store[providerId]) store[providerId] = []
  if (!store[providerId].includes(modelId)) {
    store[providerId].push(modelId)
    saveCustomModels(store)
  }
}

export function removeCustomModel(providerId: string, modelId: string): void {
  const store = loadCustomModels()
  if (store[providerId]) {
    store[providerId] = store[providerId].filter(id => id !== modelId)
    if (store[providerId].length === 0) delete store[providerId]
    saveCustomModels(store)
  }
}

export function getCustomModels(providerId: string): string[] {
  return loadCustomModels()[providerId] ?? []
}
