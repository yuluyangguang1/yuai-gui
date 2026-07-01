/**
 * Tool Surface — 参考 Cotal cotalToolSpecs() 单一工具表面
 * define once, render per host
 * 不会跨适配器漂移
 */

// ══════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════

export type ToolCategory = 'core' | 'communication' | 'file' | 'git' | 'search' | 'system'

export interface ToolSpec {
  /** 工具名称 */
  name: string
  /** 描述 */
  description: string
  /** 分类 */
  category: ToolCategory
  /** 参数 JSON Schema */
  parameters: Record<string, unknown>
  /** 是否需要确认 */
  requiresConfirmation: boolean
  /** 权限要求 */
  requiredPermission: 'ask' | 'auto_edit' | 'full_access'
  /** 适用的 Agent 角色 */
  applicableRoles: string[] // ['*'] = 所有角色
}

// ══════════════════════════════════════════════
// 单一工具表面 (define once)
// ══════════════════════════════════════════════

export const TOOL_SPECS: ToolSpec[] = [
  // ─── 核心工具 ───
  {
    name: 'read_file',
    description: '读取文件内容',
    category: 'file',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '文件路径' },
        offset: { type: 'number', description: '起始行号 (1-indexed)' },
        limit: { type: 'number', description: '最大行数' },
      },
      required: ['path'],
    },
    requiresConfirmation: false,
    requiredPermission: 'ask',
    applicableRoles: ['*'],
  },
  {
    name: 'write_file',
    description: '写入文件内容 (完全覆盖)',
    category: 'file',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '文件路径' },
        content: { type: 'string', description: '文件内容' },
      },
      required: ['path', 'content'],
    },
    requiresConfirmation: true,
    requiredPermission: 'auto_edit',
    applicableRoles: ['*'],
  },
  {
    name: 'patch',
    description: '查找替换编辑文件',
    category: 'file',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '文件路径' },
        old_string: { type: 'string', description: '要替换的文本' },
        new_string: { type: 'string', description: '替换后的文本' },
      },
      required: ['path', 'old_string', 'new_string'],
    },
    requiresConfirmation: true,
    requiredPermission: 'auto_edit',
    applicableRoles: ['*'],
  },
  {
    name: 'search_files',
    description: '搜索文件内容或按名称查找文件',
    category: 'search',
    parameters: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: '搜索模式 (正则或 glob)' },
        target: { type: 'string', enum: ['content', 'files'], description: '搜索目标' },
        path: { type: 'string', description: '搜索目录' },
      },
      required: ['pattern'],
    },
    requiresConfirmation: false,
    requiredPermission: 'ask',
    applicableRoles: ['*'],
  },
  {
    name: 'terminal',
    description: '执行终端命令',
    category: 'system',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string', description: '要执行的命令' },
        timeout: { type: 'number', description: '超时秒数' },
        workdir: { type: 'string', description: '工作目录' },
      },
      required: ['command'],
    },
    requiresConfirmation: true,
    requiredPermission: 'auto_edit',
    applicableRoles: ['*'],
  },

  // ─── 通信工具 (Cotal 风格) ───
  {
    name: 'send_message',
    description: '发送消息到频道或直接消息',
    category: 'communication',
    parameters: {
      type: 'object',
      properties: {
        target: { type: 'string', description: '频道名或 Agent 名' },
        content: { type: 'string', description: '消息内容' },
        type: { type: 'string', enum: ['channel', 'direct', 'anycast'], description: '消息类型' },
      },
      required: ['target', 'content'],
    },
    requiresConfirmation: false,
    requiredPermission: 'ask',
    applicableRoles: ['*'],
  },
  {
    name: 'list_peers',
    description: '列出同行 Agent 及其状态',
    category: 'communication',
    parameters: { type: 'object', properties: {} },
    requiresConfirmation: false,
    requiredPermission: 'ask',
    applicableRoles: ['*'],
  },
  {
    name: 'set_attention',
    description: '设置注意力模式',
    category: 'communication',
    parameters: {
      type: 'object',
      properties: {
        mode: { type: 'string', enum: ['open', 'dnd', 'focus'], description: '注意力模式' },
        channel: { type: 'string', description: '频道覆盖 (可选)' },
      },
      required: ['mode'],
    },
    requiresConfirmation: false,
    requiredPermission: 'ask',
    applicableRoles: ['*'],
  },

  // ─── Git 工具 ───
  {
    name: 'git_status',
    description: '查看 Git 状态',
    category: 'git',
    parameters: { type: 'object', properties: {} },
    requiresConfirmation: false,
    requiredPermission: 'ask',
    applicableRoles: ['*'],
  },
  {
    name: 'git_diff',
    description: '查看 Git 差异',
    category: 'git',
    parameters: {
      type: 'object',
      properties: {
        file: { type: 'string', description: '文件路径 (可选)' },
        staged: { type: 'boolean', description: '是否查看暂存区' },
      },
    },
    requiresConfirmation: false,
    requiredPermission: 'ask',
    applicableRoles: ['*'],
  },
  {
    name: 'git_commit',
    description: '创建 Git 提交',
    category: 'git',
    parameters: {
      type: 'object',
      properties: {
        message: { type: 'string', description: '提交信息' },
        files: { type: 'array', items: { type: 'string' }, description: '文件列表 (可选)' },
      },
      required: ['message'],
    },
    requiresConfirmation: true,
    requiredPermission: 'auto_edit',
    applicableRoles: ['coder', 'planner'],
  },

  // ─── 任务工具 ───
  {
    name: 'create_task',
    description: '创建新任务',
    category: 'core',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: '任务标题' },
        description: { type: 'string', description: '任务描述' },
        priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'], description: '优先级' },
        assignee: { type: 'string', description: '分配给谁 (可选)' },
      },
      required: ['title'],
    },
    requiresConfirmation: false,
    requiredPermission: 'ask',
    applicableRoles: ['*'],
  },
  {
    name: 'update_task',
    description: '更新任务状态',
    category: 'core',
    parameters: {
      type: 'object',
      properties: {
        task_id: { type: 'string', description: '任务 ID' },
        state: { type: 'string', description: '新状态' },
        result: { type: 'string', description: '结果 (可选)' },
      },
      required: ['task_id', 'state'],
    },
    requiresConfirmation: false,
    requiredPermission: 'ask',
    applicableRoles: ['*'],
  },

  // ─── 系统工具 ───
  {
    name: 'orientation',
    description: '获取当前上下文快照 (Orientation Card)',
    category: 'system',
    parameters: { type: 'object', properties: {} },
    requiresConfirmation: false,
    requiredPermission: 'ask',
    applicableRoles: ['*'],
  },
]

// ══════════════════════════════════════════════
// 工具表面渲染器
// ══════════════════════════════════════════════

/**
 * 按角色过滤工具
 * define once, render per host
 */
export function getToolsForRole(role: string): ToolSpec[] {
  return TOOL_SPECS.filter(t =>
    t.applicableRoles.includes('*') || t.applicableRoles.includes(role)
  )
}

/**
 * 按分类获取工具
 */
export function getToolsByCategory(category: ToolCategory): ToolSpec[] {
  return TOOL_SPECS.filter(t => t.category === category)
}

/**
 * 获取核心工具 (用于 Orientation Card)
 */
export function getCoreTools(): string[] {
  return TOOL_SPECS.filter(t => t.category === 'core').map(t => t.name)
}

/**
 * 获取所有工具名称
 */
export function getAllToolNames(): string[] {
  return TOOL_SPECS.map(t => t.name)
}

/**
 * 渲染为 MCP 格式 (Claude Code)
 */
export function renderAsMcpTools(role: string): Array<{
  name: string
  description: string
  inputSchema: Record<string, unknown>
}> {
  return getToolsForRole(role).map(t => ({
    name: t.name,
    description: t.description,
    inputSchema: t.parameters,
  }))
}

/**
 * 渲染为 OpenAI function 格式
 */
export function renderAsOpenAiFunctions(role: string): Array<{
  type: 'function'
  function: { name: string; description: string; parameters: Record<string, unknown> }
}> {
  return getToolsForRole(role).map(t => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    },
  }))
}
