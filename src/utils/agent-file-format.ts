/**
 * Agent File Format — 参考 Cotal .cotal/agents/<name>.md
 * YAML 前置 + Markdown 人格
 * 项目级 > 用户级分层
 */

// ══════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════

export interface AgentFile {
  /** 文件路径 */
  path: string
  /** 来源层级 */
  layer: 'project' | 'user'
  /** YAML 前置元数据 */
  meta: AgentMeta
  /** Markdown 人格正文 */
  persona: string
  /** 原始内容 */
  raw: string
}

export interface AgentMeta {
  /** Agent 唯一名称 */
  name: string
  /** 角色 (anycast 地址) */
  role: string
  /** 描述 */
  description: string
  /** 标签 */
  tags: string[]
  /** 订阅的频道 */
  subscribe: string[]
  /** 允许订阅的频道 (ACL) */
  allowSubscribe: string[]
  /** 允许发布的频道 (ACL) */
  allowPublish: string[]
  /** 模型覆盖 */
  model: string | null
  /** 能力声明 */
  capabilities: string[]
  /** 图标 (Tabler icon 名或自定义 SVG) */
  icon: string | null
  /** 颜色 */
  color: string | null
  /** 是否启用 */
  enabled: boolean
  /** 权限模式 */
  permission: 'ask' | 'auto_edit' | 'full_access'
  /** 注意力模式 */
  attention: 'open' | 'dnd' | 'focus'
}

// ══════════════════════════════════════════════
// 解析器
// ══════════════════════════════════════════════

/** 解析 Agent 文件 (YAML 前置 + Markdown 人格) */
export function parseAgentFile(content: string, path: string, layer: 'project' | 'user'): AgentFile {
  const frontmatterRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/
  const match = content.match(frontmatterRegex)

  if (!match) {
    // 没有前置, 整个文件是人格
    return {
      path,
      layer,
      meta: getDefaultMeta(path),
      persona: content.trim(),
      raw: content,
    }
  }

  const yamlContent = match[1]
  const persona = match[2].trim()

  const meta = parseYamlFrontmatter(yamlContent)
  // 用文件名作为 fallback name
  if (!meta.name) {
    const filename = path.split('/').pop()?.replace('.md', '') ?? 'unknown'
    meta.name = filename
  }

  return { path, layer, meta, persona, raw: content }
}

/** 简单 YAML 前置解析 (不依赖 yaml 库) */
function parseYamlFrontmatter(yaml: string): AgentMeta {
  const meta = getDefaultMeta('')
  const lines = yaml.split('\n')

  for (const line of lines) {
    const colonIndex = line.indexOf(':')
    if (colonIndex === -1) continue

    const key = line.slice(0, colonIndex).trim()
    const value = line.slice(colonIndex + 1).trim()

    switch (key) {
      case 'name': meta.name = unquote(value); break
      case 'role': meta.role = unquote(value); break
      case 'description': meta.description = unquote(value); break
      case 'model': meta.model = unquote(value) || null; break
      case 'icon': meta.icon = unquote(value) || null; break
      case 'color': meta.color = unquote(value) || null; break
      case 'enabled': meta.enabled = value !== 'false'; break
      case 'permission': meta.permission = unquote(value) as AgentMeta['permission']; break
      case 'attention': meta.attention = unquote(value) as AgentMeta['attention']; break
      case 'tags': meta.tags = parseYamlArray(value); break
      case 'subscribe': meta.subscribe = parseYamlArray(value); break
      case 'allowSubscribe': meta.allowSubscribe = parseYamlArray(value); break
      case 'allowPublish': meta.allowPublish = parseYamlArray(value); break
      case 'capabilities': meta.capabilities = parseYamlArray(value); break
    }
  }

  return meta
}

function unquote(s: string): string {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1)
  }
  return s
}

function parseYamlArray(s: string): string[] {
  // [a, b, c] 格式
  if (s.startsWith('[') && s.endsWith(']')) {
    return s.slice(1, -1).split(',').map(item => unquote(item.trim())).filter(Boolean)
  }
  // 空值
  if (!s || s === '[]') return []
  // 单值
  return [unquote(s)]
}

function getDefaultMeta(path: string): AgentMeta {
  const name = path.split('/').pop()?.replace('.md', '') ?? 'unknown'
  return {
    name,
    role: 'assistant',
    description: '',
    tags: [],
    subscribe: ['general'],
    allowSubscribe: ['general'],
    allowPublish: ['general'],
    model: null,
    capabilities: [],
    icon: null,
    color: null,
    enabled: true,
    permission: 'ask',
    attention: 'open',
  }
}

// ══════════════════════════════════════════════
// 序列化器
// ══════════════════════════════════════════════

/** 生成 Agent 文件内容 */
export function serializeAgentFile(meta: AgentMeta, persona: string): string {
  const lines: string[] = ['---']

  const write = (key: string, value: unknown) => {
    if (value === null || value === undefined) return
    if (Array.isArray(value)) {
      if (value.length === 0) return
      lines.push(`${key}: [${value.map(v => `'${v}'`).join(', ')}]`)
    } else if (typeof value === 'string') {
      lines.push(`${key}: '${value}'`)
    } else if (typeof value === 'boolean') {
      lines.push(`${key}: ${value}`)
    }
  }

  write('name', meta.name)
  write('role', meta.role)
  write('description', meta.description)
  write('tags', meta.tags)
  write('subscribe', meta.subscribe)
  write('allowSubscribe', meta.allowSubscribe)
  write('allowPublish', meta.allowPublish)
  write('model', meta.model)
  write('capabilities', meta.capabilities)
  write('icon', meta.icon)
  write('color', meta.color)
  write('enabled', meta.enabled)
  write('permission', meta.permission)
  write('attention', meta.attention)

  lines.push('---')
  lines.push('')
  lines.push(persona)

  return lines.join('\n')
}

// ══════════════════════════════════════════════
// 内置 Agent 定义 (梅兰竹菊)
// ══════════════════════════════════════════════

export const BUILTIN_AGENTS: AgentMeta[] = [
  {
    name: 'plum',
    role: 'coder',
    description: '梅 — 主力编码 Agent, 擅长代码生成和重构',
    tags: ['code', 'refactor', 'typescript'],
    subscribe: ['general', 'code'],
    allowSubscribe: ['general', 'code', 'review'],
    allowPublish: ['general', 'code'],
    model: null,
    capabilities: ['code_generation', 'refactoring', 'testing'],
    icon: 'plum',
    color: '#e8a0bf',
    enabled: true,
    permission: 'auto_edit',
    attention: 'open',
  },
  {
    name: 'orchid',
    role: 'reviewer',
    description: '兰 — 代码审查 Agent, 擅长 Code Review 和质量检查',
    tags: ['review', 'quality', 'security'],
    subscribe: ['general', 'review'],
    allowSubscribe: ['general', 'review', 'code'],
    allowPublish: ['general', 'review'],
    model: null,
    capabilities: ['code_review', 'security_audit', 'quality_check'],
    icon: 'orchid',
    color: '#8bc4a0',
    enabled: true,
    permission: 'ask',
    attention: 'focus',
  },
  {
    name: 'bamboo',
    role: 'researcher',
    description: '竹 — 研究 Agent, 擅长文档分析和技术调研',
    tags: ['research', 'docs', 'analysis'],
    subscribe: ['general', 'research'],
    allowSubscribe: ['general', 'research'],
    allowPublish: ['general', 'research'],
    model: null,
    capabilities: ['research', 'documentation', 'analysis'],
    icon: 'bamboo',
    color: '#7ba7c9',
    enabled: true,
    permission: 'ask',
    attention: 'open',
  },
  {
    name: 'chrysanthemum',
    role: 'planner',
    description: '菊 — 规划 Agent, 擅长任务分解和架构设计',
    tags: ['plan', 'architecture', 'design'],
    subscribe: ['general', 'plan'],
    allowSubscribe: ['general', 'plan', 'code', 'review'],
    allowPublish: ['general', 'plan'],
    model: null,
    capabilities: ['planning', 'architecture', 'task_decomposition'],
    icon: 'chrysanthemum',
    color: '#d4a84b',
    enabled: true,
    permission: 'ask',
    attention: 'open',
  },
]
