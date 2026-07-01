/**
 * Provider Store — 参考 Hermes Agent v0.17.0 架构
 * 供应商与模型分离：Provider = 端点+认证, Model = 具体LLM
 * 支持: 别名系统、Credential Pool、Fallback 链、实时模型发现
 */
import { defineStore } from 'pinia'
import { ref, computed, reactive } from 'vue'
import { invoke } from '@tauri-apps/api/core'
import { fetchModelsDev, getProviderMeta, getModelMeta, lookupContextLength, type ModelMeta, PROVIDER_TO_MODELS_DEV } from '../utils/models-dev'
import { resolveModelAlias, getAllAliases } from '../utils/model-aliases-resolve'
import { getEffortConfig, getEffectiveEffort, type EffortLevel } from '../utils/effort-levels'
import { CircuitBreaker } from '../utils/circuit-breaker'
import { getTransport, getTransportForProvider, unifiedChat, unifiedChatStream } from '../utils/transport'
import { QueueGuard, globalQueueGuard, installQueueGuard } from '../utils/queue-guard'
import { EFFORT_PRESETS, formatEffort } from '../utils/effort-levels'

// ══════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════

export type TransportType = 'openai_chat' | 'anthropic_messages' | 'codex_responses' | 'bedrock_converse'
export type AuthType = 'api_key' | 'oauth_device_code' | 'oauth_external' | 'external_process'

export interface ProviderDef {
  id: string              // 唯一标识 (如 'anthropic', 'openai', 'xiaomi')
  name: string            // 显示名称
  base_url: string        // API 端点
  api_key?: string        // API 密钥 (safeStorage 加密)
  transport: TransportType
  auth_type: AuthType
  env_var?: string        // 环境变量名
  aliases: string[]       // 别名列表
  is_builtin: boolean     // 是否内置
  is_active: boolean      // 是否激活
  status: 'connected' | 'error' | 'unknown' | 'testing'
  last_tested?: number
  error_message?: string
}

export interface ModelDef {
  id: string              // 模型ID (如 'claude-sonnet-4')
  name: string            // 显示名称
  provider_id: string     // 所属供应商
  aliases: string[]       // 别名 (如 ['sonnet', 'claude-sonnet'])
  context_length?: number
  supports_vision?: boolean
  supports_tools?: boolean
  input_cost?: number     // 每百万 token 成本
  output_cost?: number
}

export interface CredentialEntry {
  api_key: string
  label?: string
  is_exhausted: boolean
  last_used?: number
  error_count: number
}

export interface FallbackEntry {
  provider_id: string
  model_id?: string
  base_url?: string
}

// ══════════════════════════════════════════════
// 内置供应商 (参考 Hermes 20+ 供应商)
// ══════════════════════════════════════════════

const BUILTIN_PROVIDERS: ProviderDef[] = [
  {
    id: 'anthropic', name: 'Anthropic', base_url: 'https://api.anthropic.com',
    transport: 'anthropic_messages', auth_type: 'api_key', env_var: 'ANTHROPIC_API_KEY',
    aliases: ['claude'], is_builtin: true, is_active: false, status: 'unknown',
  },
  {
    id: 'openai', name: 'OpenAI', base_url: 'https://api.openai.com/v1',
    transport: 'openai_chat', auth_type: 'api_key', env_var: 'OPENAI_API_KEY',
    aliases: ['gpt'], is_builtin: true, is_active: false, status: 'unknown',
  },
  {
    id: 'deepseek', name: 'DeepSeek', base_url: 'https://api.deepseek.com/v1',
    transport: 'openai_chat', auth_type: 'api_key', env_var: 'DEEPSEEK_API_KEY',
    aliases: [], is_builtin: true, is_active: false, status: 'unknown',
  },
  {
    id: 'google', name: 'Google Gemini', base_url: 'https://generativelanguage.googleapis.com/v1beta',
    transport: 'openai_chat', auth_type: 'api_key', env_var: 'GOOGLE_API_KEY',
    aliases: ['gemini'], is_builtin: true, is_active: false, status: 'unknown',
  },
  {
    id: 'xai', name: 'xAI / Grok', base_url: 'https://api.x.ai/v1',
    transport: 'openai_chat', auth_type: 'api_key', env_var: 'XAI_API_KEY',
    aliases: ['grok'], is_builtin: true, is_active: false, status: 'unknown',
  },
  {
    id: 'openrouter', name: 'OpenRouter', base_url: 'https://openrouter.ai/api/v1',
    transport: 'openai_chat', auth_type: 'api_key', env_var: 'OPENROUTER_API_KEY',
    aliases: [], is_builtin: true, is_active: false, status: 'unknown',
  },
  {
    id: 'xiaomi', name: '小米 MiMo', base_url: 'https://api.xiaomimimo.com/v1',
    transport: 'openai_chat', auth_type: 'api_key', env_var: 'XIAOMI_API_KEY',
    aliases: ['mimo'], is_builtin: true, is_active: false, status: 'unknown',
  },
  {
    id: 'moonshot', name: 'Kimi / Moonshot', base_url: 'https://api.moonshot.cn/v1',
    transport: 'openai_chat', auth_type: 'api_key', env_var: 'KIMI_API_KEY',
    aliases: ['kimi'], is_builtin: true, is_active: false, status: 'unknown',
  },
  {
    id: 'dashscope', name: '通义千问', base_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    transport: 'openai_chat', auth_type: 'api_key', env_var: 'DASHSCOPE_API_KEY',
    aliases: ['qwen', 'tongyi'], is_builtin: true, is_active: false, status: 'unknown',
  },
  {
    id: 'zhipu', name: '智谱 GLM', base_url: 'https://open.bigmodel.cn/api/paas/v4',
    transport: 'openai_chat', auth_type: 'api_key', env_var: 'GLM_API_KEY',
    aliases: ['glm'], is_builtin: true, is_active: false, status: 'unknown',
  },
  {
    id: 'baichuan', name: '百川', base_url: 'https://api.baichuan-ai.com/v1',
    transport: 'openai_chat', auth_type: 'api_key', env_var: 'BAICHUAN_API_KEY',
    aliases: [], is_builtin: true, is_active: false, status: 'unknown',
  },
  {
    id: 'doubao', name: '豆包', base_url: 'https://ark.cn-beijing.volces.com/api/v3',
    transport: 'openai_chat', auth_type: 'api_key', env_var: 'DOUBAO_API_KEY',
    aliases: [], is_builtin: true, is_active: false, status: 'unknown',
  },
  {
    id: 'baidu', name: '百度千帆', base_url: 'https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop',
    transport: 'openai_chat', auth_type: 'api_key', env_var: 'BAIDU_API_KEY',
    aliases: ['ernie'], is_builtin: true, is_active: false, status: 'unknown',
  },
  {
    id: 'spark', name: '讯飞星火', base_url: 'https://spark-api-open.xf-yun.com/v1',
    transport: 'openai_chat', auth_type: 'api_key', env_var: 'SPARK_API_KEY',
    aliases: [], is_builtin: true, is_active: false, status: 'unknown',
  },
  {
    id: 'minimax', name: 'MiniMax', base_url: 'https://api.minimax.chat/v1',
    transport: 'openai_chat', auth_type: 'api_key', env_var: 'MINIMAX_API_KEY',
    aliases: [], is_builtin: true, is_active: false, status: 'unknown',
  },
  {
    id: 'huggingface', name: 'Hugging Face', base_url: 'https://api-inference.huggingface.co/v1',
    transport: 'openai_chat', auth_type: 'api_key', env_var: 'HF_TOKEN',
    aliases: ['hf'], is_builtin: true, is_active: false, status: 'unknown',
  },
  {
    id: 'mistral', name: 'Mistral', base_url: 'https://api.mistral.ai/v1',
    transport: 'openai_chat', auth_type: 'api_key', env_var: 'MISTRAL_API_KEY',
    aliases: [], is_builtin: true, is_active: false, status: 'unknown',
  },
  {
    id: 'groq', name: 'Groq', base_url: 'https://api.groq.com/openai/v1',
    transport: 'openai_chat', auth_type: 'api_key', env_var: 'GROQ_API_KEY',
    aliases: [], is_builtin: true, is_active: false, status: 'unknown',
  },
  {
    id: 'together', name: 'Together AI', base_url: 'https://api.together.xyz/v1',
    transport: 'openai_chat', auth_type: 'api_key', env_var: 'TOGETHER_API_KEY',
    aliases: [], is_builtin: true, is_active: false, status: 'unknown',
  },
  {
    id: 'siliconflow', name: 'SiliconFlow', base_url: 'https://api.siliconflow.cn/v1',
    transport: 'openai_chat', auth_type: 'api_key', env_var: 'SILICONFLOW_API_KEY',
    aliases: [], is_builtin: true, is_active: false, status: 'unknown',
  },
  {
    id: 'stepfun', name: '阶跃星辰', base_url: 'https://api.stepfun.com/v1',
    transport: 'openai_chat', auth_type: 'api_key', env_var: 'STEPFUN_API_KEY',
    aliases: [], is_builtin: true, is_active: false, status: 'unknown',
  },
  {
    id: 'yi', name: '零一万物', base_url: 'https://api.lingyiwanwu.com/v1',
    transport: 'openai_chat', auth_type: 'api_key', env_var: 'YI_API_KEY',
    aliases: [], is_builtin: true, is_active: false, status: 'unknown',
  },
]

// ══════════════════════════════════════════════
// 模型别名系统 (参考 Hermes model_switch.py)
// ══════════════════════════════════════════════

const MODEL_ALIASES: Record<string, { provider: string; model: string }> = {
  // Anthropic
  'sonnet': { provider: 'anthropic', model: 'claude-sonnet-4' },
  'opus': { provider: 'anthropic', model: 'claude-opus-4' },
  'haiku': { provider: 'anthropic', model: 'claude-haiku-4' },
  'claude': { provider: 'anthropic', model: 'claude-sonnet-4' },
  // OpenAI
  'gpt5': { provider: 'openai', model: 'gpt-5' },
  'gpt4o': { provider: 'openai', model: 'gpt-4o' },
  'gpt4': { provider: 'openai', model: 'gpt-4-turbo' },
  'gpt': { provider: 'openai', model: 'gpt-4o' },
  // DeepSeek
  'deepseek': { provider: 'deepseek', model: 'deepseek-chat' },
  'deepseek-coder': { provider: 'deepseek', model: 'deepseek-coder' },
  // Google
  'gemini': { provider: 'google', model: 'gemini-2.5-pro' },
  'gemini-flash': { provider: 'google', model: 'gemini-2.5-flash' },
  // xAI
  'grok': { provider: 'xai', model: 'grok-3' },
  // Xiaomi
  'mimo': { provider: 'xiaomi', model: 'mimo-v2.5-pro' },
  // Kimi
  'kimi': { provider: 'moonshot', model: 'moonshot-v1-128k' },
  // Qwen
  'qwen': { provider: 'dashscope', model: 'qwen-max' },
  'qwen-plus': { provider: 'dashscope', model: 'qwen-plus' },
  'qwen-turbo': { provider: 'dashscope', model: 'qwen-turbo' },
  // GLM
  'glm': { provider: 'zhipu', model: 'glm-4-flash' },
  'glm4': { provider: 'zhipu', model: 'glm-4' },
}

// ══════════════════════════════════════════════
// 预设模型列表
// ══════════════════════════════════════════════

const BUILTIN_MODELS: ModelDef[] = [
  // Anthropic
  { id: 'claude-sonnet-4', name: 'Claude Sonnet 4', provider_id: 'anthropic', aliases: ['sonnet'], context_length: 200000, supports_vision: true, supports_tools: true, input_cost: 3, output_cost: 15 },
  { id: 'claude-opus-4', name: 'Claude Opus 4', provider_id: 'anthropic', aliases: ['opus'], context_length: 200000, supports_vision: true, supports_tools: true, input_cost: 15, output_cost: 75 },
  { id: 'claude-haiku-4', name: 'Claude Haiku 4', provider_id: 'anthropic', aliases: ['haiku'], context_length: 200000, supports_vision: true, supports_tools: true, input_cost: 0.25, output_cost: 1.25 },
  // OpenAI
  { id: 'gpt-5', name: 'GPT-5', provider_id: 'openai', aliases: ['gpt5'], context_length: 128000, supports_vision: true, supports_tools: true },
  { id: 'gpt-4o', name: 'GPT-4o', provider_id: 'openai', aliases: ['gpt4o'], context_length: 128000, supports_vision: true, supports_tools: true, input_cost: 2.5, output_cost: 10 },
  { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', provider_id: 'openai', aliases: ['gpt4'], context_length: 128000, supports_vision: true, supports_tools: true, input_cost: 10, output_cost: 30 },
  // DeepSeek
  { id: 'deepseek-chat', name: 'DeepSeek Chat', provider_id: 'deepseek', aliases: ['deepseek'], context_length: 64000, supports_tools: true, input_cost: 0.14, output_cost: 0.28 },
  { id: 'deepseek-coder', name: 'DeepSeek Coder', provider_id: 'deepseek', aliases: ['deepseek-coder'], context_length: 64000, supports_tools: true, input_cost: 0.14, output_cost: 0.28 },
  // Google
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', provider_id: 'google', aliases: ['gemini'], context_length: 1000000, supports_vision: true, supports_tools: true, input_cost: 1.25, output_cost: 5 },
  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider_id: 'google', aliases: ['gemini-flash'], context_length: 1000000, supports_vision: true, supports_tools: true, input_cost: 0.075, output_cost: 0.3 },
  // xAI
  { id: 'grok-3', name: 'Grok 3', provider_id: 'xai', aliases: ['grok'], context_length: 131072, supports_vision: true, supports_tools: true, input_cost: 3, output_cost: 15 },
  // Xiaomi
  { id: 'mimo-v2.5-pro', name: 'MiMo v2.5 Pro', provider_id: 'xiaomi', aliases: ['mimo'], context_length: 128000, supports_tools: true },
  { id: 'mimo-v2.5', name: 'MiMo v2.5', provider_id: 'xiaomi', aliases: [], context_length: 128000, supports_tools: true },
  // Kimi
  { id: 'moonshot-v1-128k', name: 'Kimi 128K', provider_id: 'moonshot', aliases: ['kimi'], context_length: 128000, supports_tools: true },
  // Qwen
  { id: 'qwen-max', name: '通义千问 Max', provider_id: 'dashscope', aliases: ['qwen'], context_length: 32000, supports_tools: true, input_cost: 0.02, output_cost: 0.06 },
  { id: 'qwen-plus', name: '通义千问 Plus', provider_id: 'dashscope', aliases: ['qwen-plus'], context_length: 131072, supports_tools: true },
  // GLM
  { id: 'glm-4-flash', name: 'GLM-4 Flash', provider_id: 'zhipu', aliases: ['glm'], context_length: 128000, supports_tools: true },
  { id: 'glm-4', name: 'GLM-4', provider_id: 'zhipu', aliases: ['glm4'], context_length: 128000, supports_tools: true },
  // Mistral
  { id: 'mistral-large-latest', name: 'Mistral Large', provider_id: 'mistral', aliases: [], context_length: 128000, supports_tools: true, input_cost: 2, output_cost: 6 },
  // Groq
  { id: 'llama-3.3-70b-versatile', name: 'Llama 3.3 70B', provider_id: 'groq', aliases: [], context_length: 128000, supports_tools: true },
]

// ══════════════════════════════════════════════
// Store
// ══════════════════════════════════════════════

export const useProviderStore = defineStore('provider', () => {
  const providers = ref<ProviderDef[]>([...BUILTIN_PROVIDERS])
  const models = ref<ModelDef[]>([...BUILTIN_MODELS])
  const credentialPools = reactive<Map<string, CredentialEntry[]>>(new Map())
  const fallbackChain = ref<FallbackEntry[]>([])
  const EXHAUSTED_TTL = 3600_000 // 1h 冷却 (参考 Hermes)
  // ─── Effort Level ───
  const currentEffort = ref<EffortLevel>(getEffectiveEffort())

  // ─── Circuit Breaker (provider failure isolation) ───
  const circuitBreaker = new CircuitBreaker()

  // ─── Queue Guard (install global rate-limiting fetch) ───
  installQueueGuard({ enabled: true, max_concurrent: 3, max_wait_ms: 120_000 })


  // 当前激活的供应商和模型
  const activeProviderId = ref<string>('openai')
  const activeModelId = ref<string>('gpt-4o')

  // 用户自定义供应商
  const userProviders = ref<ProviderDef[]>([])

  // 计算属性
  const activeProvider = computed(() =>
    providers.value.find(p => p.id === activeProviderId.value) ?? null
  )

  const activeModel = computed(() =>
    models.value.find(m => m.id === activeModelId.value) ?? null
  )

  const allProviders = computed(() => [
    ...providers.value,
    ...userProviders.value,
  ])

  const connectedProviders = computed(() =>
    allProviders.value.filter(p => p.status === 'connected')
  )

  // ─── 别名解析 ───
  function resolveAlias(input: string): { provider_id: string; model_id: string } | null {
    const lower = input.toLowerCase().trim()

    // 1. 检查模型别名表
    const alias = MODEL_ALIASES[lower]
    if (alias) {
      return { provider_id: alias.provider, model_id: alias.model }
    }

    // 2. 检查模型 ID 精确匹配
    const exact = models.value.find(m => m.id === lower)
    if (exact) {
      return { provider_id: exact.provider_id, model_id: exact.id }
    }

    // 3. 检查模型别名
    const modelByAlias = models.value.find(m => m.aliases.includes(lower))
    if (modelByAlias) {
      return { provider_id: modelByAlias.provider_id, model_id: modelByAlias.id }
    }

    // 4. 检查供应商别名 + 模型组合 (如 'anthropic/sonnet')
    if (lower.includes('/')) {
      const [providerPart, modelPart] = lower.split('/', 2)
      const provider = allProviders.value.find(p =>
        p.id === providerPart || p.aliases.includes(providerPart)
      )
      if (provider) {
        const model = models.value.find(m =>
          m.provider_id === provider.id && (m.id === modelPart || m.aliases.includes(modelPart))
        )
        if (model) return { provider_id: provider.id, model_id: model.id }
      }
    }

    return null
  }

  // ─── Credential Pool (参考 Hermes credential_pool.py) ───
  const LEASE_TTL = 300_000 // 5min 租借超时
  const activeLeases = reactive<Map<string, number>>(new Map()) // credentialId → count

  function addCredential(providerId: string, apiKey: string, label?: string) {
    const pool = credentialPools.get(providerId) ?? []
    // 避免重复
    if (pool.find(c => c.api_key === apiKey)) return
    pool.push({
      api_key: apiKey,
      label,
      is_exhausted: false,
      error_count: 0,
    })
    credentialPools.set(providerId, pool)
  }

  function getNextCredential(providerId: string): string | null {
    const pool = credentialPools.get(providerId)
    if (!pool || pool.length === 0) return null

    const now = Date.now()
    // 清理过期冷却
    for (const entry of pool) {
      if (entry.is_exhausted && entry.last_used && (now - entry.last_used) > EXHAUSTED_TTL) {
        entry.is_exhausted = false
        entry.error_count = 0
      }
    }

    const available = pool.filter(c => !c.is_exhausted)
    if (available.length === 0) {
      // 全部 exhausted, 强制重置
      pool.forEach(c => { c.is_exhausted = false; c.error_count = 0 })
      return pool[0].api_key
    }

    // least_used 策略: 选择使用次数最少的
    available.sort((a, b) => (a.last_used ?? 0) - (b.last_used ?? 0))
    const chosen = available[0]
    chosen.last_used = now
    return chosen.api_key
  }

  function markCredentialExhausted(providerId: string, apiKey: string) {
    const pool = credentialPools.get(providerId)
    if (!pool) return
    const entry = pool.find(c => c.api_key === apiKey)
    if (entry) {
      entry.error_count++
      if (entry.error_count >= 3) {
        entry.is_exhausted = true
      }
    }
  }

  // 租借机制 (参考 Hermes acquire_lease/release_lease)
  function acquireLease(providerId: string): string | null {
    const pool = credentialPools.get(providerId)
    if (!pool) return null

    const available = pool.filter(c => !c.is_exhausted)
    if (available.length === 0) return null

    // 选择租借数最少的
    const chosen = available.reduce((min, c) => {
      const minLeases = activeLeases.get(min.api_key) ?? 0
      const curLeases = activeLeases.get(c.api_key) ?? 0
      return curLeases < minLeases ? c : min
    }, available[0])

    const current = activeLeases.get(chosen.api_key) ?? 0
    activeLeases.set(chosen.api_key, current + 1)
    return chosen.api_key
  }

  function releaseLease(apiKey: string) {
    const current = activeLeases.get(apiKey) ?? 0
    if (current <= 1) {
      activeLeases.delete(apiKey)
    } else {
      activeLeases.set(apiKey, current - 1)
    }
  }

  // ─── Fallback 链 ───
  function setFallbackChain(chain: FallbackEntry[]) {
    fallbackChain.value = chain
  }

  function addToFallback(providerId: string, modelId?: string) {
    if (!fallbackChain.value.find(f => f.provider_id === providerId)) {
      fallbackChain.value.push({ provider_id: providerId, model_id: modelId })
    }
  }

  function getNextFallback(): FallbackEntry | null {
    return fallbackChain.value[0] ?? null
  }

  // ─── 供应商操作 ───
  async function testProvider(providerId: string): Promise<boolean> {
    const provider = allProviders.value.find(p => p.id === providerId)
    if (!provider) return false

    provider.status = 'testing'
    try {
      const result: string = await invoke('test_connection', {
        baseUrl: provider.base_url,
        apiKey: provider.api_key ?? '',
        appType: providerId,
      })
      const success = result.includes('成功') || result.includes('connected')
      provider.status = success ? 'connected' : 'error'
      if (success) {
        circuitBreaker.recordSuccess(providerId)
      } else {
        circuitBreaker.recordFailure(providerId, result)
      }
      provider.error_message = provider.status === 'error' ? result : undefined
      provider.last_tested = Date.now()
      return provider.status === 'connected'
    } catch (e) {
      provider.status = 'error'
      provider.error_message = String(e)
      circuitBreaker.recordFailure(providerId, String(e))
      return false
    }
  }

  async function testAllProviders() {
    const promises = allProviders.value.map(p => testProvider(p.id))
    await Promise.allSettled(promises)
  }

  function switchProvider(providerId: string) {
    const provider = allProviders.value.find(p => p.id === providerId)
    if (!provider) return
    activeProviderId.value = providerId
    // 自动选择该供应商的第一个模型
    const firstModel = models.value.find(m => m.provider_id === providerId)
    if (firstModel) activeModelId.value = firstModel.id
  }

  function switchModel(modelId: string) {
    const model = models.value.find(m => m.id === modelId)
    if (!model) return
    activeModelId.value = modelId
    activeProviderId.value = model.provider_id
  }

  // ─── 通过别名切换 ───
  function switchByAlias(input: string): boolean {
    const resolved = resolveAlias(input)
    if (!resolved) return false
    activeProviderId.value = resolved.provider_id
    activeModelId.value = resolved.model_id
    return true
  }

  // ─── 实时模型发现 ───
  async function discoverModels(providerId: string): Promise<ModelDef[]> {
    const provider = allProviders.value.find(p => p.id === providerId)
    if (!provider || !provider.api_key) return []

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      }
      if (provider.id === 'anthropic') {
        headers['x-api-key'] = provider.api_key
        headers['anthropic-version'] = '2023-06-01'
      } else {
        headers['Authorization'] = `Bearer ${provider.api_key}`
      }

      const baseUrl = provider.base_url.replace(/\/+$/, '')
      const modelsUrl = provider.id === 'anthropic'
        ? `${baseUrl}/v1/models`
        : `${baseUrl}/models`

      const resp = await fetch(modelsUrl, { headers, signal: AbortSignal.timeout(10000) })
      if (!resp.ok) return []

      const data = await resp.json()
      const modelList = data.data ?? data.models ?? data ?? []

      const discovered: ModelDef[] = modelList.map((m: any) => ({
        id: m.id ?? m.name ?? String(m),
        name: m.id ?? m.name ?? String(m),
        provider_id: providerId,
        aliases: [],
        context_length: m.context_length ?? m.max_context_length ?? undefined,
        supports_vision: m.capabilities?.vision ?? false,
        supports_tools: m.capabilities?.function_calling ?? true,
      }))

      for (const dm of discovered) {
        if (!models.value.find(m => m.id === dm.id && m.provider_id === providerId)) {
          models.value.push(dm)
        }
      }

      return discovered
    } catch (e) {
      console.warn(`[Provider] Model discovery failed for ${providerId}:`, e)
      return []
    }
  }

  // ─── models.dev 元数据同步 ───
  async function syncModelsDev(): Promise<void> {
    try {
      await fetchModelsDev()
      // 用 models.dev 元数据丰富现有模型
      for (const model of models.value) {
        const meta = getModelMeta(model.provider_id, model.id)
        if (meta) {
          if (!model.context_length && meta.context_window > 0) {
            model.context_length = meta.context_window
          }
          if (meta.attachment) model.supports_vision = true
          if (meta.tool_call) model.supports_tools = true
        }
      }
      console.log(`[Provider] Synced models.dev metadata for ${models.value.length} models`)
    } catch (e) {
      console.warn('[Provider] models.dev sync failed:', e)
    }
  }

  // ─── 持久化 ───
  function saveToStorage() {
    try {
      const data = {
        activeProviderId: activeProviderId.value,
        activeModelId: activeModelId.value,
        userProviders: userProviders.value,
        fallbackChain: fallbackChain.value,
        credentials: Object.fromEntries(credentialPools),
      }
      localStorage.setItem('yuai-providers', JSON.stringify(data))
    } catch { /* ignore */ }
  }

  function loadFromStorage() {
    try {
      const raw = localStorage.getItem('yuai-providers')
      if (!raw) return
      const data = JSON.parse(raw)
      if (data.activeProviderId) activeProviderId.value = data.activeProviderId
      if (data.activeModelId) activeModelId.value = data.activeModelId
      if (data.userProviders) userProviders.value = data.userProviders
      if (data.fallbackChain) fallbackChain.value = data.fallbackChain
      if (data.credentials) {
        for (const [k, v] of Object.entries(data.credentials)) {
          credentialPools.set(k, v as CredentialEntry[])
        }
      }
    } catch { /* ignore */ }
  }

  // 初始化
  loadFromStorage()

  // Effort level management
  function setEffort(level: EffortLevel) { currentEffort.value = level }
  function getEffort() { return getEffortConfig(currentEffort.value) }
  function cycleEffort() {
    const levels: EffortLevel[] = ['low', 'medium', 'high', 'xhigh', 'max']
    const idx = levels.indexOf(currentEffort.value)
    currentEffort.value = levels[(idx + 1) % levels.length]
  }

  // ─── Transport-aware send (uses transport + circuit breaker) ───
  async function sendChat(
    request: import('../utils/transport').UnifiedRequest,
  ): Promise<import('../utils/transport').UnifiedResponse> {
    const provider = activeProvider.value
    if (!provider) throw new Error('No active provider')

    // Circuit breaker check
    if (!circuitBreaker.canExecute(provider.id)) {
      const remaining = circuitBreaker.getRemainingCooldown(provider.id)
      throw new Error(`Circuit breaker open for ${provider.id}, cooldown ${Math.ceil(remaining / 1000)}s`)
    }

    // Resolve alias if request model looks like an alias
    const aliasResult = resolveAliasEnhanced(request.model)
    if (aliasResult) {
      request = { ...request, model: aliasResult.model_id }
    }

    try {
      const resp = await unifiedChat(provider, request)
      circuitBreaker.recordSuccess(provider.id)
      return resp
    } catch (e) {
      circuitBreaker.recordFailure(provider.id, String(e))
      throw e
    }
  }

  /** Get transport for a given provider */
  function getProviderTransport(providerId: string) {
    const provider = allProviders.value.find(p => p.id === providerId)
    return provider ? getTransportForProvider(provider) : null
  }

  /** Get circuit breaker states for UI display */
  function getCircuitBreakerStates() {
    return circuitBreaker.getAllStates()
  }

  /** Format current effort for display */
  function formatCurrentEffort(): string {
    return formatEffort(currentEffort.value)
  }

  // Enhanced alias resolution (uses model-aliases-resolve)
  function resolveAliasEnhanced(input: string): { provider_id: string; model_id: string } | null {
    const allModels = models.value.map(m => ({ id: m.id, provider_id: m.provider_id }))
    const result = resolveModelAlias(input, allModels)
    if (result) return { provider_id: result.provider_id, model_id: result.resolved_model_id }
    return null
  }

  return {
    // State
    providers,
    models,
    credentialPools,
    fallbackChain,
    activeProviderId,
    activeModelId,
    userProviders,

    // Computed
    activeProvider,
    activeModel,
    allProviders,
    connectedProviders,

    // Actions
    resolveAlias,
    addCredential,
    getNextCredential,
    markCredentialExhausted,
    acquireLease,
    releaseLease,
    setFallbackChain,
    addToFallback,
    getNextFallback,
    testProvider,
    testAllProviders,
    switchProvider,
    switchModel,
    switchByAlias,
    discoverModels,
    syncModelsDev,
    currentEffort,
    setEffort,
    getEffort,
    cycleEffort,
    resolveAliasEnhanced,
    circuitBreaker,
    saveToStorage,
    loadFromStorage,
    sendChat,
    getProviderTransport,
    getCircuitBreakerStates,
    formatCurrentEffort,
    globalQueueGuard,
    unifiedChat,
    unifiedChatStream,
  }
})
