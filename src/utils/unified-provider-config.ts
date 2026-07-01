/**
 * Unified Provider Config — 参考 Cline 统一 ProviderConfig
 * 单一配置对象映射所有供应商, handler registry 可扩展
 */

// ══════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════

export type ProviderFamily =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'bedrock'
  | 'mistral'
  | 'ollama'
  | 'custom';

export type Protocol =
  | 'openai-chat'
  | 'anthropic-messages'
  | 'openai-responses'
  | 'google-generative'
  | 'bedrock-converse';

export interface ProviderCapabilities {
  streaming?: boolean;
  vision?: boolean;
  tools?: boolean;
  reasoning?: boolean;
  maxOutputTokens?: number;
  contextLength?: number;
}

export interface UnifiedProviderConfig {
  /** Provider ID (e.g. "openai", "anthropic", "xiaomi") */
  providerId: string;
  /** Display name */
  name: string;
  /** Provider family for protocol selection */
  family: ProviderFamily;
  /** Wire protocol */
  protocol: Protocol;
  /** API Key */
  apiKey?: string;
  /** Base URL */
  baseUrl?: string;
  /** Default model ID */
  defaultModelId?: string;
  /** Provider capabilities */
  capabilities: ProviderCapabilities;
  /** Environment variable names for API key */
  apiKeyEnv: string[];
  /** Custom headers */
  headers?: Record<string, string>;
  /** Timeout in ms */
  timeoutMs?: number;
  /** Whether this is a built-in provider */
  builtin: boolean;
}

// ══════════════════════════════════════════════
// Built-in Provider Specs
// ══════════════════════════════════════════════

export const BUILTIN_PROVIDER_SPECS: UnifiedProviderConfig[] = [
  {
    providerId: 'anthropic',
    name: 'Anthropic',
    family: 'anthropic',
    protocol: 'anthropic-messages',
    defaultModelId: 'claude-sonnet-4',
    capabilities: { streaming: true, vision: true, tools: true, reasoning: true, contextLength: 200000 },
    apiKeyEnv: ['ANTHROPIC_API_KEY'],
    builtin: true,
  },
  {
    providerId: 'openai',
    name: 'OpenAI',
    family: 'openai',
    protocol: 'openai-chat',
    defaultModelId: 'gpt-4o',
    capabilities: { streaming: true, vision: true, tools: true, reasoning: true, contextLength: 128000 },
    apiKeyEnv: ['OPENAI_API_KEY'],
    builtin: true,
  },
  {
    providerId: 'deepseek',
    name: 'DeepSeek',
    family: 'openai',
    protocol: 'openai-chat',
    baseUrl: 'https://api.deepseek.com/v1',
    defaultModelId: 'deepseek-chat',
    capabilities: { streaming: true, tools: true, reasoning: true, contextLength: 64000 },
    apiKeyEnv: ['DEEPSEEK_API_KEY'],
    builtin: true,
  },
  {
    providerId: 'google',
    name: 'Google Gemini',
    family: 'google',
    protocol: 'google-generative',
    defaultModelId: 'gemini-2.0-flash',
    capabilities: { streaming: true, vision: true, tools: true, contextLength: 1000000 },
    apiKeyEnv: ['GOOGLE_API_KEY', 'GEMINI_API_KEY'],
    builtin: true,
  },
  {
    providerId: 'xai',
    name: 'xAI / Grok',
    family: 'openai',
    protocol: 'openai-chat',
    baseUrl: 'https://api.x.ai/v1',
    defaultModelId: 'grok-2',
    capabilities: { streaming: true, vision: true, tools: true, contextLength: 128000 },
    apiKeyEnv: ['XAI_API_KEY'],
    builtin: true,
  },
  {
    providerId: 'openrouter',
    name: 'OpenRouter',
    family: 'openai',
    protocol: 'openai-chat',
    baseUrl: 'https://openrouter.ai/api/v1',
    capabilities: { streaming: true, vision: true, tools: true, contextLength: 200000 },
    apiKeyEnv: ['OPENROUTER_API_KEY'],
    builtin: true,
  },
  {
    providerId: 'xiaomi',
    name: '小米 MiMo',
    family: 'openai',
    protocol: 'openai-chat',
    baseUrl: 'https://api.moonshot.cn/v1',
    defaultModelId: 'mimo-v2.5-pro',
    capabilities: { streaming: true, tools: true, contextLength: 100000 },
    apiKeyEnv: ['XIAOMI_API_KEY', 'KIMI_API_KEY'],
    builtin: true,
  },
  {
    providerId: 'kimi',
    name: 'Kimi / Moonshot',
    family: 'openai',
    protocol: 'openai-chat',
    baseUrl: 'https://api.moonshot.cn/v1',
    defaultModelId: 'moonshot-v1-auto',
    capabilities: { streaming: true, tools: true, contextLength: 128000 },
    apiKeyEnv: ['KIMI_API_KEY'],
    builtin: true,
  },
  {
    providerId: 'dashscope',
    name: '通义千问',
    family: 'openai',
    protocol: 'openai-chat',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    defaultModelId: 'qwen-max',
    capabilities: { streaming: true, tools: true, contextLength: 131072 },
    apiKeyEnv: ['DASHSCOPE_API_KEY'],
    builtin: true,
  },
  {
    providerId: 'zhipu',
    name: '智谱 GLM',
    family: 'openai',
    protocol: 'openai-chat',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    defaultModelId: 'glm-4-plus',
    capabilities: { streaming: true, vision: true, tools: true, contextLength: 128000 },
    apiKeyEnv: ['GLM_API_KEY'],
    builtin: true,
  },
  {
    providerId: 'groq',
    name: 'Groq',
    family: 'openai',
    protocol: 'openai-chat',
    baseUrl: 'https://api.groq.com/openai/v1',
    defaultModelId: 'llama-3.3-70b-versatile',
    capabilities: { streaming: true, tools: true, contextLength: 128000 },
    apiKeyEnv: ['GROQ_API_KEY'],
    builtin: true,
  },
  {
    providerId: 'together',
    name: 'Together AI',
    family: 'openai',
    protocol: 'openai-chat',
    baseUrl: 'https://api.together.xyz/v1',
    capabilities: { streaming: true, tools: true, contextLength: 128000 },
    apiKeyEnv: ['TOGETHER_API_KEY'],
    builtin: true,
  },
  {
    providerId: 'siliconflow',
    name: 'SiliconFlow',
    family: 'openai',
    protocol: 'openai-chat',
    baseUrl: 'https://api.siliconflow.cn/v1',
    capabilities: { streaming: true, tools: true, contextLength: 32000 },
    apiKeyEnv: ['SILICONFLOW_API_KEY'],
    builtin: true,
  },
  {
    providerId: 'mistral',
    name: 'Mistral',
    family: 'openai',
    protocol: 'openai-chat',
    baseUrl: 'https://api.mistral.ai/v1',
    defaultModelId: 'mistral-large-latest',
    capabilities: { streaming: true, vision: true, tools: true, contextLength: 128000 },
    apiKeyEnv: ['MISTRAL_API_KEY'],
    builtin: true,
  },
  {
    providerId: 'huggingface',
    name: 'Hugging Face',
    family: 'openai',
    protocol: 'openai-chat',
    baseUrl: 'https://api-inference.huggingface.co/v1',
    capabilities: { streaming: true, contextLength: 32000 },
    apiKeyEnv: ['HF_TOKEN'],
    builtin: true,
  },
];

// ══════════════════════════════════════════════
// Provider Config Registry
// ══════════════════════════════════════════════

export class ProviderConfigRegistry {
  private specs = new Map<string, UnifiedProviderConfig>();

  constructor() {
    // Register built-in specs
    for (const spec of BUILTIN_PROVIDER_SPECS) {
      this.specs.set(spec.providerId, spec);
    }
  }

  /** Get a provider spec */
  get(providerId: string): UnifiedProviderConfig | undefined {
    return this.specs.get(providerId);
  }

  /** Get all provider specs */
  getAll(): UnifiedProviderConfig[] {
    return Array.from(this.specs.values());
  }

  /** Register a custom provider */
  register(config: UnifiedProviderConfig): void {
    this.specs.set(config.providerId, config);
  }

  /** Find providers by family */
  getByFamily(family: ProviderFamily): UnifiedProviderConfig[] {
    return this.getAll().filter(s => s.family === family);
  }

  /** Get protocol for a provider */
  getProtocol(providerId: string): Protocol {
    return this.specs.get(providerId)?.protocol ?? 'openai-chat';
  }

  /** Get capabilities for a provider */
  getCapabilities(providerId: string): ProviderCapabilities {
    return this.specs.get(providerId)?.capabilities ?? {};
  }

  /** Resolve API key from env vars */
  resolveApiKey(providerId: string): string | undefined {
    const spec = this.specs.get(providerId);
    if (!spec) return undefined;
    for (const envVar of spec.apiKeyEnv) {
      const key = import.meta.env?.[envVar];
      if (key !== undefined && key !== '') return key;
    }
    return undefined;
  }
}

// Singleton
export const globalProviderRegistry = new ProviderConfigRegistry();
