/**
 * Cost Estimation Pipeline — inspired by Codex Tracker
 * Estimates cost from token counts using known rate cards.
 */

// ══════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════

export type Confidence = 'exact' | 'estimated' | 'unknown';

export interface RateCard {
  model: string;
  provider: string;
  /** Cost per 1K input tokens (USD) */
  inputPer1k: number;
  /** Cost per 1K output tokens (USD) */
  outputPer1k: number;
  /** Context window in tokens */
  contextWindow?: number;
}

export interface CostEstimate {
  inputCost: number;
  outputCost: number;
  totalCost: number;
  confidence: Confidence;
  model: string;
  provider: string;
}

export interface PricingConfig {
  customRates: RateCard[];
  overrideExisting: boolean;
}

// ══════════════════════════════════════════════
// Built-in Rate Cards (USD per 1K tokens)
// ══════════════════════════════════════════════

const BUILTIN_RATES: RateCard[] = [
  // OpenAI
  { model: 'gpt-4o',           provider: 'openai',    inputPer1k: 0.0025,  outputPer1k: 0.01,    contextWindow: 128_000 },
  { model: 'gpt-4o-mini',      provider: 'openai',    inputPer1k: 0.00015, outputPer1k: 0.0006,  contextWindow: 128_000 },
  { model: 'gpt-4-turbo',      provider: 'openai',    inputPer1k: 0.01,    outputPer1k: 0.03,    contextWindow: 128_000 },
  { model: 'gpt-4',            provider: 'openai',    inputPer1k: 0.03,    outputPer1k: 0.06,    contextWindow: 8_192 },
  { model: 'gpt-3.5-turbo',    provider: 'openai',    inputPer1k: 0.0005,  outputPer1k: 0.0015,  contextWindow: 16_385 },
  { model: 'o1',               provider: 'openai',    inputPer1k: 0.015,   outputPer1k: 0.06,    contextWindow: 200_000 },
  { model: 'o1-mini',          provider: 'openai',    inputPer1k: 0.003,   outputPer1k: 0.012,   contextWindow: 128_000 },
  { model: 'o3',               provider: 'openai',    inputPer1k: 0.01,    outputPer1k: 0.04,    contextWindow: 200_000 },
  { model: 'o3-mini',          provider: 'openai',    inputPer1k: 0.0011,  outputPer1k: 0.0044,  contextWindow: 200_000 },
  // Anthropic
  { model: 'claude-sonnet-4-20250514',    provider: 'anthropic', inputPer1k: 0.003,   outputPer1k: 0.015,   contextWindow: 200_000 },
  { model: 'claude-3-5-sonnet-20241022',  provider: 'anthropic', inputPer1k: 0.003,   outputPer1k: 0.015,   contextWindow: 200_000 },
  { model: 'claude-3-5-haiku-20241022',   provider: 'anthropic', inputPer1k: 0.001,   outputPer1k: 0.005,   contextWindow: 200_000 },
  { model: 'claude-3-opus-20240229',      provider: 'anthropic', inputPer1k: 0.015,   outputPer1k: 0.075,   contextWindow: 200_000 },
  // DeepSeek
  { model: 'deepseek-chat',    provider: 'deepseek',  inputPer1k: 0.00014, outputPer1k: 0.00028, contextWindow: 128_000 },
  { model: 'deepseek-reasoner',provider: 'deepseek',  inputPer1k: 0.00055, outputPer1k: 0.00219, contextWindow: 128_000 },
  // Google
  { model: 'gemini-2.5-pro',   provider: 'google',    inputPer1k: 0.00125, outputPer1k: 0.01,    contextWindow: 1_000_000 },
  { model: 'gemini-2.5-flash', provider: 'google',    inputPer1k: 0.00015, outputPer1k: 0.0006,  contextWindow: 1_000_000 },
  // Qwen
  { model: 'qwen-max',         provider: 'qwen',      inputPer1k: 0.0016,  outputPer1k: 0.0064,  contextWindow: 131_072 },
  { model: 'qwen-plus',        provider: 'qwen',      inputPer1k: 0.0004,  outputPer1k: 0.0012,  contextWindow: 131_072 },
  { model: 'qwen-turbo',       provider: 'qwen',      inputPer1k: 0.00006, outputPer1k: 0.00024, contextWindow: 131_072 },
];

// ══════════════════════════════════════════════
// Custom config store
// ══════════════════════════════════════════════

let customConfig: PricingConfig = { customRates: [], overrideExisting: false };

export function setPricingConfig(config: PricingConfig): void {
  customConfig = config;
}

export function getPricingConfig(): PricingConfig {
  return { ...customConfig };
}

// ══════════════════════════════════════════════
// Lookup
// ══════════════════════════════════════════════

function findRateCard(model: string, provider?: string): RateCard | undefined {
  // Check custom rates first
  if (customConfig.overrideExisting) {
    const customMatch = customConfig.customRates.find(
      r => r.model === model || (provider && r.provider === provider && r.model === model)
    );
    if (customMatch) return customMatch;
  }

  // Built-in exact match
  const exact = BUILTIN_RATES.find(
    r => r.model === model || r.model === model.replace(/^(openai|anthropic|deepseek|google|qwen)\//, '')
  );
  if (exact) return exact;

  // Custom fallback
  const customMatch = customConfig.customRates.find(
    r => r.model === model || (provider && r.provider === provider)
  );
  return customMatch;
}

function fuzzyMatchModel(model: string): RateCard | undefined {
  const lower = model.toLowerCase();
  // Try partial matches
  for (const card of BUILTIN_RATES) {
    if (lower.includes(card.model) || card.model.includes(lower)) {
      return card;
    }
  }
  // Try prefix matching
  if (lower.startsWith('gpt-4o')) return BUILTIN_RATES.find(r => r.model === 'gpt-4o');
  if (lower.startsWith('gpt-4')) return BUILTIN_RATES.find(r => r.model === 'gpt-4-turbo');
  if (lower.startsWith('claude-sonnet') || lower.includes('sonnet')) return BUILTIN_RATES.find(r => r.model === 'claude-sonnet-4-20250514');
  if (lower.includes('haiku')) return BUILTIN_RATES.find(r => r.model === 'claude-3-5-haiku-20241022');
  if (lower.includes('opus')) return BUILTIN_RATES.find(r => r.model === 'claude-3-opus-20240229');
  if (lower.includes('deepseek-reasoner') || lower.includes('deepseek-r1')) return BUILTIN_RATES.find(r => r.model === 'deepseek-reasoner');
  if (lower.startsWith('deepseek')) return BUILTIN_RATES.find(r => r.model === 'deepseek-chat');
  if (lower.includes('gemini') && lower.includes('pro')) return BUILTIN_RATES.find(r => r.model === 'gemini-2.5-pro');
  if (lower.includes('gemini')) return BUILTIN_RATES.find(r => r.model === 'gemini-2.5-flash');
  return undefined;
}

// ══════════════════════════════════════════════
// Cost Estimation
// ══════════════════════════════════════════════

export function estimateCost(
  inputTokens: number,
  outputTokens: number,
  model: string,
  provider?: string,
): CostEstimate {
  let card = findRateCard(model, provider);
  let confidence: Confidence = 'exact';

  if (!card) {
    card = fuzzyMatchModel(model);
    confidence = 'estimated';
  }

  if (!card) {
    return {
      inputCost: 0,
      outputCost: 0,
      totalCost: 0,
      confidence: 'unknown',
      model,
      provider: provider ?? 'unknown',
    };
  }

  const inputCost = (inputTokens / 1000) * card.inputPer1k;
  const outputCost = (outputTokens / 1000) * card.outputPer1k;

  return {
    inputCost,
    outputCost,
    totalCost: inputCost + outputCost,
    confidence,
    model: card.model,
    provider: card.provider,
  };
}

export function formatCost(cost: number): string {
  if (cost === 0) return '$0.00';
  if (cost < 0.01) return `$${cost.toFixed(6)}`;
  if (cost < 1) return `$${cost.toFixed(4)}`;
  return `$${cost.toFixed(2)}`;
}

/** List all known rate cards */
export function listRateCards(): RateCard[] {
  return [...BUILTIN_RATES, ...customConfig.customRates];
}
