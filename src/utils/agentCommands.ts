/**
 * agentCommands.ts
 *
 * Command and flag definitions for the slash-command suggest system.
 * Each agent can register commands; the suggest component filters them
 * based on the current agent and user input.
 */

export type AgentId = string

export interface CommandDef {
  name: string
  description: string
  aliases?: string[]
  argsHint?: string
  subcommands?: string[]
  /** Agent IDs this command is available for; undefined = all */
  agents?: AgentId[]
}

export interface FlagDef {
  name: string
  short?: string
  type: 'boolean' | 'string' | 'number'
  description: string
  /** Agent IDs this flag is available for; undefined = all */
  agents?: AgentId[]
}

// ── Command registry ──

export const allCommands: CommandDef[] = [
  {
    name: 'help',
    description: '显示帮助信息',
    aliases: ['h', '?'],
  },
  {
    name: 'clear',
    description: '清空当前会话',
    aliases: ['cls'],
  },
  {
    name: 'model',
    description: '切换模型',
    argsHint: '<model-name>',
    subcommands: ['list', 'set', 'current'],
  },
  {
    name: 'agent',
    description: '切换代理',
    argsHint: '<agent-id>',
    subcommands: ['list', 'switch', 'info'],
  },
  {
    name: 'memory',
    description: '管理项目记忆',
    subcommands: ['show', 'clear', 'add', 'search'],
  },
  {
    name: 'workflow',
    description: '工作流操作',
    subcommands: ['run', 'list', 'create', 'edit'],
  },
  {
    name: 'beam',
    description: '并行提问模式',
    subcommands: ['on', 'off', 'config'],
  },
  {
    name: 'context',
    description: '上下文管理',
    subcommands: ['show', 'add', 'remove', 'clear'],
  },
  {
    name: 'export',
    description: '导出会话',
    argsHint: '<format>',
    subcommands: ['markdown', 'json', 'html'],
  },
  {
    name: 'skill',
    description: '技能管理',
    subcommands: ['list', 'run', 'install'],
  },
]

// ── Flag registry ──

export const allFlags: FlagDef[] = [
  {
    name: 'think',
    short: 't',
    type: 'boolean',
    description: '启用深度思考',
  },
  {
    name: 'verbose',
    short: 'v',
    type: 'boolean',
    description: '详细输出',
  },
  {
    name: 'model',
    short: 'm',
    type: 'string',
    description: '指定模型',
  },
  {
    name: 'agent',
    short: 'a',
    type: 'string',
    description: '指定代理',
  },
  {
    name: 'temperature',
    type: 'number',
    description: '温度参数 (0-2)',
  },
  {
    name: 'max-tokens',
    type: 'number',
    description: '最大 token 数',
  },
  {
    name: 'system',
    short: 's',
    type: 'string',
    description: '自定义系统提示',
  },
  {
    name: 'no-stream',
    type: 'boolean',
    description: '禁用流式输出',
  },
  {
    name: 'json',
    short: 'j',
    type: 'boolean',
    description: 'JSON 格式输出',
  },
]

// ── Filter functions ──

export function filterCommands(agentId: AgentId, query: string): CommandDef[] {
  const q = query.toLowerCase()
  return allCommands.filter(cmd => {
    // Agent scoping
    if (cmd.agents && !cmd.agents.includes(agentId)) return false
    // Query matching: name, aliases
    if (!q) return true
    if (cmd.name.toLowerCase().startsWith(q)) return true
    if (cmd.aliases?.some(a => a.toLowerCase().startsWith(q))) return true
    return false
  })
}

export function filterFlags(agentId: AgentId, query: string): FlagDef[] {
  const q = query.toLowerCase()
  return allFlags.filter(flag => {
    if (flag.agents && !flag.agents.includes(agentId)) return false
    if (!q) return true
    if (flag.name.toLowerCase().startsWith(q)) return true
    if (flag.short?.toLowerCase().startsWith(q)) return true
    return false
  })
}

export function findCommand(agentId: AgentId, name: string): CommandDef | undefined {
  const q = name.toLowerCase()
  return allCommands.find(cmd => {
    if (cmd.agents && !cmd.agents.includes(agentId)) return false
    if (cmd.name.toLowerCase() === q) return true
    if (cmd.aliases?.some(a => a.toLowerCase() === q)) return true
    return false
  })
}
