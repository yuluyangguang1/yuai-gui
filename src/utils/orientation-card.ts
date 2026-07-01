/**
 * Orientation Card — 参考 Cotal cotal_orientation
 * 每个 Agent 启动时获取的结构化上下文快照
 * 身份/访问权限/能力/分组工具/同行/状态/未读数
 */

// ══════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════

export interface OrientationCard {
  /** Agent 身份 */
  identity: {
    id: string
    name: string
    role: string
    model: string | null
  }
  /** 访问权限 */
  access: {
    channels: string[]
    can_publish: string[]
    can_subscribe: string[]
    permission_mode: string
  }
  /** 能力声明 */
  capabilities: string[]
  /** 可用工具 (分组) */
  tools: {
    core: string[]   // 核心循环工具
    more: string[]   // 更多工具
  }
  /** 同行 Agent */
  peers: Array<{
    id: string
    name: string
    role: string
    status: string
    model: string | null
  }>
  /** 当前状态 */
  status: {
    attention_mode: string
    active_tasks: number
    unread_messages: number
    uptime_ms: number
  }
  /** 项目上下文 */
  project: {
    name: string
    path: string
    workspace_files: number
    git_branch: string | null
  }
  /** 生成时间 */
  generated_at: number
}

// ══════════════════════════════════════════════
// Orientation Generator
// ══════════════════════════════════════════════

export class OrientationGenerator {
  /** 生成 Orientation Card */
  generate(params: {
    agentId: string
    agentName: string
    agentRole: string
    model: string | null
    channels: string[]
    capabilities: string[]
    tools: { core: string[]; more: string[] }
    peers: OrientationCard['peers']
    attentionMode: string
    activeTasks: number
    unreadMessages: number
    uptimeMs: number
    projectName: string
    projectPath: string
    workspaceFiles: number
    gitBranch: string | null
    permissionMode: string
  }): OrientationCard {
    return {
      identity: {
        id: params.agentId,
        name: params.agentName,
        role: params.agentRole,
        model: params.model,
      },
      access: {
        channels: params.channels,
        can_publish: params.channels, // 简化: 所有订阅频道都可发布
        can_subscribe: params.channels,
        permission_mode: params.permissionMode,
      },
      capabilities: params.capabilities,
      tools: params.tools,
      peers: params.peers,
      status: {
        attention_mode: params.attentionMode,
        active_tasks: params.activeTasks,
        unread_messages: params.unreadMessages,
        uptime_ms: params.uptimeMs,
      },
      project: {
        name: params.projectName,
        path: params.projectPath,
        workspace_files: params.workspaceFiles,
        git_branch: params.gitBranch,
      },
      generated_at: Date.now(),
    }
  }

  /** 格式化为 Markdown (注入系统提示) */
  formatAsMarkdown(card: OrientationCard): string {
    const lines: string[] = []

    lines.push(`# Orientation — ${card.identity.name}`)
    lines.push('')
    lines.push(`**身份:** ${card.identity.name} (${card.identity.role})`)
    if (card.identity.model) {
      lines.push(`**模型:** ${card.identity.model}`)
    }
    lines.push('')

    // 访问权限
    lines.push('## 访问权限')
    lines.push(`- 频道: ${card.access.channels.join(', ')}`)
    lines.push(`- 权限: ${card.access.permission_mode}`)
    lines.push('')

    // 能力
    if (card.capabilities.length > 0) {
      lines.push('## 能力')
      for (const cap of card.capabilities) {
        lines.push(`- ${cap}`)
      }
      lines.push('')
    }

    // 工具
    lines.push('## 可用工具')
    lines.push('**核心:** ' + card.tools.core.join(', '))
    if (card.tools.more.length > 0) {
      lines.push('**更多:** ' + card.tools.more.join(', '))
    }
    lines.push('')

    // 同行
    if (card.peers.length > 0) {
      lines.push('## 同行 Agent')
      for (const peer of card.peers) {
        const statusIcon = peer.status === 'idle' ? '○' : peer.status === 'working' ? '●' : peer.status === 'offline' ? '⊘' : '◐'
        lines.push(`- ${statusIcon} **${peer.name}** (${peer.role})${peer.model ? ` [${peer.model}]` : ''}`)
      }
      lines.push('')
    }

    // 状态
    lines.push('## 当前状态')
    lines.push(`- 注意力: ${card.status.attention_mode}`)
    lines.push(`- 活跃任务: ${card.status.active_tasks}`)
    lines.push(`- 未读消息: ${card.status.unread_messages}`)
    lines.push('')

    // 项目
    lines.push('## 项目上下文')
    lines.push(`- 项目: ${card.project.name}`)
    lines.push(`- 路径: ${card.project.path}`)
    lines.push(`- 文件数: ${card.project.workspace_files}`)
    if (card.project.git_branch) {
      lines.push(`- Git 分支: ${card.project.git_branch}`)
    }

    return lines.join('\n')
  }
}
