/**
 * Model Roles — 参考 Continue.dev 角色模型分配
 * 不同任务用不同模型: chat(强推理) / autocomplete(快便宜) / edit(代码编辑)
 */

// ══════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════

export type ModelRole = 'chat' | 'autocomplete' | 'edit' | 'embed' | 'rerank' | 'compress'

export interface RoleConfig {
  role: ModelRole
  model_id: string
  provider_id: string
  /** 是否启用此角色 (false 则回退到 chat 模型) */
  enabled: boolean
  /** 最大 token 数 (autocomplete 通常 128, chat 无限制) */
  max_tokens?: number
  /** debounce 延迟 ms (autocomplete 用) */
  debounce_ms?: number
  /** 温度覆盖 */
  temperature?: number
}

export interface RoleAssignments {
  chat: RoleConfig
  autocomplete: RoleConfig
  edit: RoleConfig
  embed: RoleConfig | null
  rerank: RoleConfig | null
  compress: RoleConfig | null
}

// ══════════════════════════════════════════════
// 默认角色配置
// ══════════════════════════════════════════════

export const ROLE_DEFAULTS: Record<ModelRole, Partial<RoleConfig>> = {
  chat: {
    enabled: true,
    max_tokens: undefined, // 无限制
    temperature: undefined,
  },
  autocomplete: {
    enabled: false, // 默认关闭, 需要用户启用
    max_tokens: 128,
    debounce_ms: 300,
    temperature: 0.2,
  },
  edit: {
    enabled: false,
    max_tokens: 4096,
    temperature: 0.3,
  },
  embed: {
    enabled: false,
  },
  rerank: {
    enabled: false,
  },
  compress: {
    enabled: false,
    temperature: 0.3,
  },
}

export const ROLE_LABELS: Record<ModelRole, string> = {
  chat: '聊天',
  autocomplete: '自动补全',
  edit: '代码编辑',
  embed: '嵌入索引',
  rerank: '重排序',
  compress: '上下文压缩',
}

export const ROLE_DESCRIPTIONS: Record<ModelRole, string> = {
  chat: '主对话模型 — 需要强推理能力 (如 Claude Sonnet, GPT-4o)',
  autocomplete: 'Tab 补全 — 需要快速/便宜 (如 DeepSeek Coder, Haiku)',
  edit: '代码编辑 — 应用代码变更 (如 GPT-4o, Claude Sonnet)',
  embed: '嵌入模型 — 代码库索引/RAG (如 Voyage, OpenAI Embeddings)',
  rerank: '重排序 — 搜索结果排序 (如 Cohere Rerank)',
  compress: '上下文压缩 — 用便宜模型总结旧上下文 (如 Haiku, Flash)',
}

// ══════════════════════════════════════════════
// 存储
// ══════════════════════════════════════════════

const STORAGE_KEY = 'yuai-model-roles'

export function loadRoleAssignments(): RoleAssignments {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* ignore */ }
  return getDefaultAssignments()
}

export function saveRoleAssignments(assignments: RoleAssignments): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(assignments))
  } catch { /* ignore */ }
}

function getDefaultAssignments(): RoleAssignments {
  return {
    chat: { role: 'chat', model_id: 'gpt-4o', provider_id: 'openai', ...ROLE_DEFAULTS.chat },
    autocomplete: { role: 'autocomplete', model_id: 'deepseek-chat', provider_id: 'deepseek', ...ROLE_DEFAULTS.autocomplete },
    edit: { role: 'edit', model_id: 'gpt-4o', provider_id: 'openai', ...ROLE_DEFAULTS.edit },
    embed: null,
    rerank: null,
    compress: null,
  }
}

// ══════════════════════════════════════════════
// 角色解析
// ══════════════════════════════════════════════

/**
 * 获取指定角色的模型配置
 * 如果角色未启用, 回退到 chat 模型
 */
export function getModelForRole(
  role: ModelRole,
  assignments: RoleAssignments,
): RoleConfig {
  const config = assignments[role]
  if (config && config.enabled) return config
  // 回退到 chat
  return assignments.chat
}

/**
 * 设置角色模型
 */
export function setRoleModel(
  role: ModelRole,
  modelId: string,
  providerId: string,
  assignments: RoleAssignments,
): RoleAssignments {
  const updated = { ...assignments }
  updated[role] = {
    role,
    model_id: modelId,
    provider_id: providerId,
    enabled: true,
    ...ROLE_DEFAULTS[role],
  }
  saveRoleAssignments(updated)
  return updated
}

/**
 * 禁用角色 (回退到 chat)
 */
export function disableRole(
  role: ModelRole,
  assignments: RoleAssignments,
): RoleAssignments {
  const updated = { ...assignments }
  if (updated[role]) {
    updated[role] = { ...updated[role]!, enabled: false }
  }
  saveRoleAssignments(updated)
  return updated
}

/**
 * 获取所有已启用的角色
 */
export function getEnabledRoles(assignments: RoleAssignments): ModelRole[] {
  const roles: ModelRole[] = ['chat'] // chat 总是启用
  for (const role of ['autocomplete', 'edit', 'embed', 'rerank', 'compress'] as ModelRole[]) {
    if (assignments[role]?.enabled) roles.push(role)
  }
  return roles
}

/**
 * 检查角色是否使用独立模型 (非回退到 chat)
 */
export function hasDedicatedModel(role: ModelRole, assignments: RoleAssignments): boolean {
  return assignments[role]?.enabled === true
}
