/**
 * Effort Levels — 参考 Claude Code --effort 参数
 * 控制推理深度: low/medium/high/xhigh/max
 */

// ══════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════

export type EffortLevel = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export interface EffortConfig {
  level: EffortLevel
  /** 温度覆盖 */
  temperature: number
  /** 最大 token 数 */
  max_tokens: number
  /** 推理预算 (thinking tokens) */
  reasoning_budget: number | null
  /** 是否启用扩展思考 */
  extended_thinking: boolean
  /** 描述 */
  description: string
}

// ══════════════════════════════════════════════
// 预设配置
// ══════════════════════════════════════════════

export const EFFORT_PRESETS: Record<EffortLevel, EffortConfig> = {
  low: {
    level: 'low',
    temperature: 0.3,
    max_tokens: 2048,
    reasoning_budget: null,
    extended_thinking: false,
    description: '快速响应 — 简单问题、自动补全、格式转换',
  },
  medium: {
    level: 'medium',
    temperature: 0.5,
    max_tokens: 4096,
    reasoning_budget: 10000,
    extended_thinking: false,
    description: '标准推理 — 日常对话、代码生成、文档编写',
  },
  high: {
    level: 'high',
    temperature: 0.7,
    max_tokens: 8192,
    reasoning_budget: 30000,
    extended_thinking: true,
    description: '深度推理 — 复杂代码、架构设计、多文件重构',
  },
  xhigh: {
    level: 'xhigh',
    temperature: 0.8,
    max_tokens: 16384,
    reasoning_budget: 60000,
    extended_thinking: true,
    description: '极深推理 — 难题攻关、系统设计、安全审计',
  },
  max: {
    level: 'max',
    temperature: 1.0,
    max_tokens: 32768,
    reasoning_budget: 128000,
    extended_thinking: true,
    description: '最大能力 — 科研论文、数学证明、复杂算法',
  },
}

export const EFFORT_LABELS: Record<EffortLevel, string> = {
  low: '快速',
  medium: '标准',
  high: '深度',
  xhigh: '极深',
  max: '最大',
}

export const EFFORT_ICONS: Record<EffortLevel, string> = {
  low: '⚡',
  medium: '💡',
  high: '🧠',
  xhigh: '🔬',
  max: '🌟',
}

// ══════════════════════════════════════════════
// 存储
// ══════════════════════════════════════════════

const STORAGE_KEY = 'yuai-effort-level'
const SESSION_KEY = 'yuai-session-effort'

/** 获取全局默认 effort */
export function getDefaultEffort(): EffortLevel {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved && saved in EFFORT_PRESETS) return saved as EffortLevel
  } catch { /* ignore */ }
  return 'medium'
}

/** 设置全局默认 effort */
export function setDefaultEffort(level: EffortLevel): void {
  try {
    localStorage.setItem(STORAGE_KEY, level)
  } catch { /* ignore */ }
}

/** 获取当前会话的 effort (覆盖全局) */
export function getSessionEffort(sessionId: string): EffortLevel | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    if (raw) {
      const map = JSON.parse(raw)
      return map[sessionId] ?? null
    }
  } catch { /* ignore */ }
  return null
}

/** 设置当前会话的 effort */
export function setSessionEffort(sessionId: string, level: EffortLevel): void {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    const map = raw ? JSON.parse(raw) : {}
    map[sessionId] = level
    // 只保留最近 50 个会话
    const entries = Object.entries(map)
    if (entries.length > 50) {
      const trimmed = entries.slice(-50)
      localStorage.setItem(SESSION_KEY, JSON.stringify(Object.fromEntries(trimmed)))
    } else {
      localStorage.setItem(SESSION_KEY, JSON.stringify(map))
    }
  } catch { /* ignore */ }
}

/** 获取有效 effort (会话覆盖 > 全局默认) */
export function getEffectiveEffort(sessionId?: string): EffortLevel {
  if (sessionId) {
    const sessionEffort = getSessionEffort(sessionId)
    if (sessionEffort) return sessionEffort
  }
  return getDefaultEffort()
}

/** 获取 effort 配置 */
export function getEffortConfig(level: EffortLevel): EffortConfig {
  return EFFORT_PRESETS[level]
}

/** 获取下一个 effort 级别 (循环切换) */
export function nextEffortLevel(current: EffortLevel): EffortLevel {
  const levels: EffortLevel[] = ['low', 'medium', 'high', 'xhigh', 'max']
  const idx = levels.indexOf(current)
  return levels[(idx + 1) % levels.length]
}

/** 格式化 effort 显示 */
export function formatEffort(level: EffortLevel): string {
  return `${EFFORT_ICONS[level]} ${EFFORT_LABELS[level]}`
}
