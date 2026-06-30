/**
 * Provider CRUD — 参考 Hermes Studio providers controller
 * 预设 + OAuth + 自定义供应商管理
 */

import type { ProviderDef, TransportType, AuthType } from '../stores/provider'

// ══════════════════════════════════════════════
// Provider Preset (参考 Hermes Studio PROVIDER_PRESETS)
// ══════════════════════════════════════════════

export interface ProviderPreset {
  value: string           // 供应商 ID
  label: string           // 显示名称
  base_url: string        // API 端点
  models: string[]        // 预设模型列表
  env_key?: string        // API Key 环境变量名
  transport: TransportType
  auth_type: AuthType
  builtin: boolean        // 是否内置
  api_mode?: string       // API 模式
  oauth_supported?: boolean
}

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    value: 'anthropic', label: 'Anthropic', base_url: 'https://api.anthropic.com',
    models: ['claude-sonnet-4', 'claude-opus-4', 'claude-haiku-4'],
    env_key: 'ANTHROPIC_API_KEY', transport: 'anthropic_messages', auth_type: 'api_key', builtin: true,
    oauth_supported: true,
  },
  {
    value: 'openai', label: 'OpenAI', base_url: 'https://api.openai.com/v1',
    models: ['gpt-5', 'gpt-4o', 'gpt-4-turbo'],
    env_key: 'OPENAI_API_KEY', transport: 'openai_chat', auth_type: 'api_key', builtin: true,
  },
  {
    value: 'deepseek', label: 'DeepSeek', base_url: 'https://api.deepseek.com/v1',
    models: ['deepseek-chat', 'deepseek-coder'],
    env_key: 'DEEPSEEK_API_KEY', transport: 'openai_chat', auth_type: 'api_key', builtin: true,
  },
  {
    value: 'google', label: 'Google Gemini', base_url: 'https://generativelanguage.googleapis.com/v1beta',
    models: ['gemini-2.5-pro', 'gemini-2.5-flash'],
    env_key: 'GOOGLE_API_KEY', transport: 'openai_chat', auth_type: 'api_key', builtin: true,
    oauth_supported: true,
  },
  {
    value: 'xai', label: 'xAI / Grok', base_url: 'https://api.x.ai/v1',
    models: ['grok-3'],
    env_key: 'XAI_API_KEY', transport: 'openai_chat', auth_type: 'api_key', builtin: true,
    oauth_supported: true,
  },
  {
    value: 'openrouter', label: 'OpenRouter', base_url: 'https://openrouter.ai/api/v1',
    models: ['anthropic/claude-sonnet-4', 'openai/gpt-4o', 'google/gemini-2.5-pro'],
    env_key: 'OPENROUTER_API_KEY', transport: 'openai_chat', auth_type: 'api_key', builtin: true,
  },
  {
    value: 'xiaomi', label: '小米 MiMo', base_url: 'https://api.xiaomimimo.com/v1',
    models: ['mimo-v2.5-pro', 'mimo-v2.5'],
    env_key: 'XIAOMI_API_KEY', transport: 'openai_chat', auth_type: 'api_key', builtin: true,
  },
  {
    value: 'moonshot', label: 'Kimi / Moonshot', base_url: 'https://api.moonshot.cn/v1',
    models: ['moonshot-v1-128k', 'moonshot-v1-32k'],
    env_key: 'KIMI_API_KEY', transport: 'openai_chat', auth_type: 'api_key', builtin: true,
  },
  {
    value: 'dashscope', label: '通义千问', base_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: ['qwen-max', 'qwen-plus', 'qwen-turbo'],
    env_key: 'DASHSCOPE_API_KEY', transport: 'openai_chat', auth_type: 'api_key', builtin: true,
  },
  {
    value: 'zhipu', label: '智谱 GLM', base_url: 'https://open.bigmodel.cn/api/paas/v4',
    models: ['glm-4-flash', 'glm-4'],
    env_key: 'GLM_API_KEY', transport: 'openai_chat', auth_type: 'api_key', builtin: true,
  },
  {
    value: 'mistral', label: 'Mistral', base_url: 'https://api.mistral.ai/v1',
    models: ['mistral-large-latest'],
    env_key: 'MISTRAL_API_KEY', transport: 'openai_chat', auth_type: 'api_key', builtin: true,
  },
  {
    value: 'groq', label: 'Groq', base_url: 'https://api.groq.com/openai/v1',
    models: ['llama-3.3-70b-versatile'],
    env_key: 'GROQ_API_KEY', transport: 'openai_chat', auth_type: 'api_key', builtin: true,
  },
]

// ══════════════════════════════════════════════
// Custom Provider (参考 Hermes Studio custom_providers)
// ══════════════════════════════════════════════

export interface CustomProviderConfig {
  name: string
  base_url: string
  api_key: string
  model?: string
  api_mode?: TransportType
  context_length?: number
  discover_models?: boolean
  models?: string[]
}

/**
 * 创建供应商 (参考 Hermes Studio POST /api/hermes/config/providers)
 */
export function createProviderFromPreset(
  preset: ProviderPreset,
  apiKey: string,
  model?: string,
): ProviderDef {
  return {
    id: preset.value,
    name: preset.label,
    base_url: preset.base_url,
    api_key: apiKey,
    transport: preset.transport,
    auth_type: preset.auth_type,
    env_var: preset.env_key,
    aliases: [],
    is_builtin: preset.builtin,
    is_active: true,
    status: 'unknown',
  }
}

/**
 * 创建自定义供应商
 */
export function createCustomProvider(config: CustomProviderConfig): ProviderDef {
  return {
    id: `custom:${config.name.toLowerCase().replace(/\s+/g, '-')}`,
    name: config.name,
    base_url: config.base_url,
    api_key: config.api_key,
    transport: config.api_mode ?? 'openai_chat',
    auth_type: 'api_key',
    aliases: [],
    is_builtin: false,
    is_active: true,
    status: 'unknown',
  }
}

/**
 * 更新供应商
 */
export function updateProvider(
  provider: ProviderDef,
  updates: Partial<Pick<ProviderDef, 'base_url' | 'api_key' | 'is_active'>>,
): ProviderDef {
  return { ...provider, ...updates }
}

/**
 * 检查供应商是否支持 OAuth
 */
export function supportsOAuth(providerId: string): boolean {
  const preset = PROVIDER_PRESETS.find(p => p.value === providerId)
  return preset?.oauth_supported ?? false
}

/**
 * 获取供应商的预设
 */
export function getPreset(providerId: string): ProviderPreset | undefined {
  return PROVIDER_PRESETS.find(p => p.value === providerId)
}

/**
 * 构建供应商→模型映射 (参考 Hermes Studio buildProviderModelMap)
 */
export function buildProviderModelMap(): Record<string, string[]> {
  const map: Record<string, string[]> = {}
  for (const preset of PROVIDER_PRESETS) {
    map[preset.value] = preset.models
  }
  return map
}
