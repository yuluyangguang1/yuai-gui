/**
 * Models.dev Registry Integration — 参考 Hermes Agent models_dev.py
 * 从 models.dev/api.json 获取 4000+ 模型的丰富元数据
 * 缓存层级: 内存(1h) → localStorage(1h) → 网络 → localStorage(降级)
 */

// ══════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════

export interface ModelMeta {
  id: string
  name: string
  family: string
  provider_id: string

  // Capabilities
  reasoning: boolean
  tool_call: boolean
  attachment: boolean // vision
  temperature: boolean
  structured_output: boolean
  open_weights: boolean

  // Modalities
  input_modalities: string[] // 'text', 'image', 'pdf', 'audio'
  output_modalities: string[]

  // Limits
  context_window: number
  max_output: number
  max_input?: number

  // Cost (per million tokens, USD)
  cost_input: number
  cost_output: number
  cost_cache_read?: number
  cost_cache_write?: number

  // Metadata
  knowledge_cutoff: string
  release_date: string
  status: string // 'alpha', 'beta', 'deprecated', ''
}

export interface ProviderMeta {
  id: string
  name: string
  env: string[] // env var names for API key
  api: string // base URL
  doc: string
  model_count: number
  models: Record<string, ModelMeta>
}

// ══════════════════════════════════════════════
// Hermes Provider ID → models.dev Provider ID 映射
// ══════════════════════════════════════════════

export const PROVIDER_TO_MODELS_DEV: Record<string, string> = {
  openrouter: 'openrouter',
  anthropic: 'anthropic',
  openai: 'openai',
  deepseek: 'deepseek',
  google: 'google',
  gemini: 'google',
  xai: 'xai',
  xiaomi: 'xiaomi',
  moonshot: 'kimi-for-coding',
  kimi: 'kimi-for-coding',
  dashscope: 'alibaba',
  alibaba: 'alibaba',
  zhipu: 'zhipu',
  minimax: 'minimax',
  mistral: 'mistral',
  groq: 'groq',
  togetherai: 'togetherai',
  together: 'togetherai',
  huggingface: 'huggingface',
  hf: 'huggingface',
  fireworks: 'fireworks-ai',
  nvidia: 'nvidia',
  perplexity: 'perplexity',
  cohere: 'cohere',
  stepfun: 'stepfun',
  baichuan: 'baichuan',
  baidu: 'baidu',
  spark: 'spark',
  yi: 'yi',
  siliconflow: 'siliconflow',
  doubao: 'doubao',
}

// ══════════════════════════════════════════════
// Cache
// ══════════════════════════════════════════════

const MODELS_DEV_URL = 'https://models.dev/api.json'
const CACHE_TTL = 3600_000 // 1 hour in ms
const CACHE_KEY = 'yuai-models-dev-cache'
const CACHE_TIME_KEY = 'yuai-models-dev-cache-time'

let memoryCache: Record<string, ProviderMeta> | null = null
let memoryCacheTime = 0

// ══════════════════════════════════════════════
// Cache层级: 内存 → localStorage → 网络
// ══════════════════════════════════════════════

function loadLocalStorageCache(): Record<string, ProviderMeta> | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    const time = localStorage.getItem(CACHE_TIME_KEY)
    if (!raw || !time) return null
    const age = Date.now() - parseInt(time, 10)
    if (age > CACHE_TTL) return null // 过期
    return JSON.parse(raw)
  } catch { return null }
}

function saveLocalStorageCache(data: Record<string, ProviderMeta>): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data))
    localStorage.setItem(CACHE_TIME_KEY, String(Date.now()))
  } catch { /* quota exceeded, ignore */ }
}

/**
 * 获取 models.dev 注册表
 * 缓存层级: 内存(1h) → localStorage(1h) → 网络 → localStorage(降级)
 */
export async function fetchModelsDev(forceRefresh = false): Promise<Record<string, ProviderMeta>> {
  const now = Date.now()

  // Stage 1: 内存缓存
  if (!forceRefresh && memoryCache && (now - memoryCacheTime) < CACHE_TTL) {
    return memoryCache
  }

  // Stage 2: localStorage 缓存
  if (!forceRefresh) {
    const cached = loadLocalStorageCache()
    if (cached) {
      memoryCache = cached
      memoryCacheTime = now
      return cached
    }
  }

  // Stage 3: 网络获取
  try {
    const resp = await fetch(MODELS_DEV_URL, {
      signal: AbortSignal.timeout(15000),
    })
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    const raw = await resp.json()

    // 解析为 ProviderMeta 格式
    const providers: Record<string, ProviderMeta> = {}
    for (const [pid, pdata] of Object.entries(raw)) {
      const p = pdata as Record<string, unknown>
      const models: Record<string, ModelMeta> = {}
      for (const [mid, mdata] of Object.entries(p.models ?? {})) {
        const m = mdata as Record<string, unknown>
        models[mid] = {
          id: mid,
          name: m.name ?? mid,
          family: m.family ?? '',
          provider_id: pid,
          reasoning: !!m.reasoning,
          tool_call: !!m.tool_call,
          attachment: !!m.attachment,
          temperature: !!m.temperature,
          structured_output: !!m.structured_output,
          open_weights: !!m.open_weights,
          input_modalities: m.modalities?.input ?? ['text'],
          output_modalities: m.modalities?.output ?? ['text'],
          context_window: m.limit?.context ?? 0,
          max_output: m.limit?.output ?? 0,
          max_input: m.limit?.input ?? undefined,
          cost_input: m.cost?.input ?? 0,
          cost_output: m.cost?.output ?? 0,
          cost_cache_read: m.cost?.cache_read ?? undefined,
          cost_cache_write: m.cost?.cache_write ?? undefined,
          knowledge_cutoff: m.knowledge_cutoff ?? '',
          release_date: m.release_date ?? '',
          status: m.status ?? '',
        }
      }

      providers[pid] = {
        id: pid,
        name: p.name ?? pid,
        env: p.env ?? [],
        api: p.api ?? '',
        doc: p.doc ?? '',
        model_count: Object.keys(models).length,
        models,
      }
    }

    memoryCache = providers
    memoryCacheTime = now
    saveLocalStorageCache(providers)
    console.log(`[ModelsDev] Fetched ${Object.keys(providers).length} providers, ${Object.values(providers).reduce((s, p) => s + p.model_count, 0)} models`)
    return providers
  } catch (e) {
    console.warn('[ModelsDev] Network fetch failed, falling back to cache:', e)

    // Stage 4: 降级到任意 localStorage 缓存 (即使过期)
    try {
      const raw = localStorage.getItem(CACHE_KEY)
      if (raw) {
        const data = JSON.parse(raw)
        memoryCache = data
        memoryCacheTime = now - CACHE_TTL + 300_000 // 5min 后重试网络
        return data
      }
    } catch { /* ignore */ }

    return {}
  }
}

// ══════════════════════════════════════════════
// 查询函数
// ══════════════════════════════════════════════

/**
 * 获取 Hermes 供应商对应的 models.dev 元数据
 */
export function getProviderMeta(hermesProviderId: string): ProviderMeta | null {
  const mdevId = PROVIDER_TO_MODELS_DEV[hermesProviderId]
  if (!mdevId || !memoryCache) return null
  return memoryCache[mdevId] ?? null
}

/**
 * 获取模型的丰富元数据
 */
export function getModelMeta(hermesProviderId: string, modelId: string): ModelMeta | null {
  const provider = getProviderMeta(hermesProviderId)
  if (!provider) return null

  // 精确匹配
  const exact = provider.models[modelId]
  if (exact) return exact

  // 大小写不敏感匹配
  const lower = modelId.toLowerCase()
  for (const [mid, mdata] of Object.entries(provider.models)) {
    if (mid.toLowerCase() === lower) return mdata
  }

  // 后缀感知: :cloud / -cloud
  for (const suffix of [':cloud', '-cloud']) {
    const suffixed = provider.models[modelId + suffix]
    if (suffixed) return suffixed
  }

  return null
}

/**
 * 查询模型上下文窗口
 */
export function lookupContextLength(hermesProviderId: string, modelId: string): number | null {
  const meta = getModelMeta(hermesProviderId, modelId)
  return meta?.context_window ?? null
}

/**
 * 查询模型能力
 */
export function getModelCapabilities(hermesProviderId: string, modelId: string) {
  const meta = getModelMeta(hermesProviderId, modelId)
  if (!meta) return null
  return {
    supports_tools: meta.tool_call,
    supports_vision: meta.attachment || meta.input_modalities.includes('image'),
    supports_reasoning: meta.reasoning,
    context_window: meta.context_window,
    max_output_tokens: meta.max_output,
    model_family: meta.family,
  }
}

/**
 * 格式化成本显示
 */
export function formatCost(meta: ModelMeta): string {
  if (meta.cost_input === 0 && meta.cost_output === 0) return '未知'
  const parts = [`$${meta.cost_input.toFixed(2)}/M入`, `$${meta.cost_output.toFixed(2)}/M出`]
  if (meta.cost_cache_read != null) parts.push(`缓存读$${meta.cost_cache_read.toFixed(2)}/M`)
  return parts.join(', ')
}

/**
 * 格式化能力显示
 */
export function formatCapabilities(meta: ModelMeta): string {
  const caps: string[] = []
  if (meta.reasoning) caps.push('推理')
  if (meta.tool_call) caps.push('工具')
  if (meta.attachment || meta.input_modalities.includes('image')) caps.push('视觉')
  if (meta.input_modalities.includes('pdf')) caps.push('PDF')
  if (meta.input_modalities.includes('audio')) caps.push('音频')
  if (meta.structured_output) caps.push('结构化')
  if (meta.open_weights) caps.push('开源')
  return caps.length > 0 ? caps.join(', ') : '基础'
}

/**
 * 搜索模型 (跨供应商)
 */
export function searchModels(query: string, limit = 20): Array<ModelMeta & { provider_name: string }> {
  if (!memoryCache) return []
  const q = query.toLowerCase().trim()
  const results: Array<ModelMeta & { provider_name: string }> = []

  for (const provider of Object.values(memoryCache)) {
    for (const model of Object.values(provider.models)) {
      if (
        model.id.toLowerCase().includes(q) ||
        model.name.toLowerCase().includes(q) ||
        model.family.toLowerCase().includes(q)
      ) {
        results.push({ ...model, provider_name: provider.name })
        if (results.length >= limit) return results
      }
    }
  }
  return results
}

/**
 * 获取所有供应商的模型数量统计
 */
export function getRegistryStats() {
  if (!memoryCache) return { providers: 0, models: 0 }
  return {
    providers: Object.keys(memoryCache).length,
    models: Object.values(memoryCache).reduce((s, p) => s + p.model_count, 0),
  }
}
