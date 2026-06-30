/**
 * Model Aliases — 参考 Claude Code model aliases
 * sonnet → 自动解析到最新版本 (如 claude-sonnet-4-6)
 * opus → 自动解析到最新版本
 */

// ══════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════

export interface ModelAlias {
  alias: string
  /** 解析到的模型 ID (可能是正则或具体 ID) */
  resolve_to: string
  /** 供应商 */
  provider_id: string
  /** 描述 */
  description: string
  /** 是否为最新版本标记 */
  is_latest: boolean
  /** 版本号 (用于排序) */
  version?: string
}

export interface AliasResolutionResult {
  alias: string
  resolved_model_id: string
  provider_id: string
  confidence: 'exact' | 'pattern' | 'fallback'
}

// ══════════════════════════════════════════════
// 内置别名 (参考 Claude Code)
// ══════════════════════════════════════════════

export const BUILTIN_ALIASES: ModelAlias[] = [
  // Anthropic
  { alias: 'sonnet', resolve_to: 'claude-sonnet-4', provider_id: 'anthropic', description: 'Claude Sonnet (最新)', is_latest: true },
  { alias: 'opus', resolve_to: 'claude-opus-4', provider_id: 'anthropic', description: 'Claude Opus (最新)', is_latest: true },
  { alias: 'haiku', resolve_to: 'claude-haiku-4', provider_id: 'anthropic', description: 'Claude Haiku (最新)', is_latest: true },
  { alias: 'claude', resolve_to: 'claude-sonnet-4', provider_id: 'anthropic', description: 'Claude 默认', is_latest: true },

  // OpenAI
  { alias: 'gpt5', resolve_to: 'gpt-5', provider_id: 'openai', description: 'GPT-5', is_latest: true },
  { alias: 'gpt4o', resolve_to: 'gpt-4o', provider_id: 'openai', description: 'GPT-4o', is_latest: true },
  { alias: 'gpt4', resolve_to: 'gpt-4-turbo', provider_id: 'openai', description: 'GPT-4 Turbo', is_latest: true },
  { alias: 'gpt', resolve_to: 'gpt-4o', provider_id: 'openai', description: 'GPT 默认', is_latest: true },

  // DeepSeek
  { alias: 'deepseek', resolve_to: 'deepseek-chat', provider_id: 'deepseek', description: 'DeepSeek Chat', is_latest: true },
  { alias: 'deepseek-coder', resolve_to: 'deepseek-coder', provider_id: 'deepseek', description: 'DeepSeek Coder', is_latest: true },

  // Google
  { alias: 'gemini', resolve_to: 'gemini-2.5-pro', provider_id: 'google', description: 'Gemini Pro (最新)', is_latest: true },
  { alias: 'gemini-flash', resolve_to: 'gemini-2.5-flash', provider_id: 'google', description: 'Gemini Flash (最新)', is_latest: true },

  // xAI
  { alias: 'grok', resolve_to: 'grok-3', provider_id: 'xai', description: 'Grok 3', is_latest: true },

  // Xiaomi
  { alias: 'mimo', resolve_to: 'mimo-v2.5-pro', provider_id: 'xiaomi', description: 'MiMo v2.5 Pro', is_latest: true },

  // Kimi
  { alias: 'kimi', resolve_to: 'moonshot-v1-128k', provider_id: 'moonshot', description: 'Kimi 128K', is_latest: true },

  // Qwen
  { alias: 'qwen', resolve_to: 'qwen-max', provider_id: 'dashscope', description: '通义千问 Max', is_latest: true },
  { alias: 'qwen-plus', resolve_to: 'qwen-plus', provider_id: 'dashscope', description: '通义千问 Plus', is_latest: true },
  { alias: 'qwen-turbo', resolve_to: 'qwen-turbo', provider_id: 'dashscope', description: '通义千问 Turbo', is_latest: true },

  // GLM
  { alias: 'glm', resolve_to: 'glm-4-flash', provider_id: 'zhipu', description: 'GLM-4 Flash', is_latest: true },
  { alias: 'glm4', resolve_to: 'glm-4', provider_id: 'zhipu', description: 'GLM-4', is_latest: true },
]

// ══════════════════════════════════════════════
// 用户自定义别名
// ══════════════════════════════════════════════

const USER_ALIASES_KEY = 'yuai-model-aliases-custom'

export function loadUserAliases(): ModelAlias[] {
  try {
    const raw = localStorage.getItem(USER_ALIASES_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

export function saveUserAliases(aliases: ModelAlias[]): void {
  try {
    localStorage.setItem(USER_ALIASES_KEY, JSON.stringify(aliases))
  } catch { /* ignore */ }
}

export function addUserAlias(alias: ModelAlias): void {
  const aliases = loadUserAliases()
  const existing = aliases.findIndex(a => a.alias === alias.alias)
  if (existing >= 0) {
    aliases[existing] = alias
  } else {
    aliases.push(alias)
  }
  saveUserAliases(aliases)
}

export function removeUserAlias(aliasName: string): void {
  const aliases = loadUserAliases().filter(a => a.alias !== aliasName)
  saveUserAliases(aliases)
}

// ══════════════════════════════════════════════
// 解析引擎
// ══════════════════════════════════════════════

/**
 * 解析模型别名
 * 优先级: 用户别名 > 内置别名 > 精确匹配 > 模式匹配
 */
export function resolveModelAlias(
  input: string,
  availableModels: Array<{ id: string; provider_id: string }>,
): AliasResolutionResult | null {
  const lower = input.toLowerCase().trim()

  // 1. 用户自定义别名 (最高优先级)
  const userAliases = loadUserAliases()
  const userMatch = userAliases.find(a => a.alias === lower)
  if (userMatch) {
    const model = availableModels.find(m => m.id === userMatch.resolve_to && m.provider_id === userMatch.provider_id)
    if (model) {
      return { alias: lower, resolved_model_id: model.id, provider_id: model.provider_id, confidence: 'exact' }
    }
  }

  // 2. 内置别名
  const builtinMatch = BUILTIN_ALIASES.find(a => a.alias === lower)
  if (builtinMatch) {
    const model = availableModels.find(m => m.id === builtinMatch.resolve_to && m.provider_id === builtinMatch.provider_id)
    if (model) {
      return { alias: lower, resolved_model_id: model.id, provider_id: model.provider_id, confidence: 'exact' }
    }
    // 别名存在但模型不在可用列表中, 尝试模式匹配
  }

  // 3. 精确匹配
  const exact = availableModels.find(m => m.id === lower)
  if (exact) {
    return { alias: lower, resolved_model_id: exact.id, provider_id: exact.provider_id, confidence: 'exact' }
  }

  // 4. 模式匹配 (如 "sonnet-4" 匹配 "claude-sonnet-4")
  const patternMatch = availableModels.find(m =>
    m.id.toLowerCase().includes(lower) ||
    m.id.toLowerCase().endsWith(`-${lower}`)
  )
  if (patternMatch) {
    return { alias: lower, resolved_model_id: patternMatch.id, provider_id: patternMatch.provider_id, confidence: 'pattern' }
  }

  // 5. 别名 + 版本号 (如 "sonnet-3.5" → 找最新的 sonnet 3.5)
  for (const alias of BUILTIN_ALIASES) {
    if (lower.startsWith(alias.alias)) {
      const versionPart = lower.slice(alias.alias.length).replace(/^[-\s]/, '')
      if (versionPart) {
        const versionMatch = availableModels.find(m =>
          m.id.toLowerCase().includes(alias.alias) &&
          m.id.toLowerCase().includes(versionPart)
        )
        if (versionMatch) {
          return { alias: lower, resolved_model_id: versionMatch.id, provider_id: versionMatch.provider_id, confidence: 'pattern' }
        }
      }
    }
  }

  // 6. provider/model 格式 (如 "anthropic/sonnet")
  if (lower.includes('/')) {
    const [providerPart, modelPart] = lower.split('/', 2)
    const providerModel = availableModels.find(m =>
      m.provider_id === providerPart && (
        m.id === modelPart ||
        m.id.toLowerCase().includes(modelPart)
      )
    )
    if (providerModel) {
      return { alias: lower, resolved_model_id: providerModel.id, provider_id: providerModel.provider_id, confidence: 'exact' }
    }
  }

  return null
}

/**
 * 获取所有可用别名 (内置 + 用户)
 */
export function getAllAliases(): ModelAlias[] {
  return [...BUILTIN_ALIASES, ...loadUserAliases()]
}

/**
 * 获取别名描述
 */
export function getAliasDescription(alias: string): string | null {
  const all = getAllAliases()
  const match = all.find(a => a.alias === alias.toLowerCase())
  return match?.description ?? null
}
