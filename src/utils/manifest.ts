/**
 * Manifest — 参考 Cotal cotal.yaml 声明式团队定义
 * 频道中心 ACL → 反转为每 Agent 最小权限凭证
 */

// ══════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════

export interface Manifest {
  /** API 版本 */
  apiVersion: 'yuai/v1'
  /** 资源类型 */
  kind: 'Mesh'
  /** 空间名称 */
  space: string
  /** 默认 Agent 类型 */
  agent: string
  /** Agent 定义 */
  agents: Record<string, ManifestAgent>
  /** 频道定义 */
  channels: Record<string, ManifestChannel>
  /** 全局设置 */
  settings: ManifestSettings
}

export interface ManifestAgent {
  /** 指令 (附加系统提示) */
  instructions: string
  /** 模型覆盖 */
  model?: string
  /** 角色 */
  role?: string
  /** 能力 */
  capabilities?: string[]
  /** 注意力模式 */
  attention?: 'open' | 'dnd' | 'focus'
  /** 权限模式 */
  permission?: 'ask' | 'auto_edit' | 'full_access'
}

export interface ManifestChannel {
  /** 订阅此频道的 Agent */
  subscribe: string[]
  /** 允许发布到此频道的 Agent */
  allowPublish: string[]
  /** 频道描述 */
  description?: string
  /** 频道指令 */
  instructions?: string
}

export interface ManifestSettings {
  /** 最大并发 Agent 数 */
  maxAgents?: number
  /** 默认注意力模式 */
  defaultAttention?: 'open' | 'dnd' | 'focus'
  /** 默认权限模式 */
  defaultPermission?: 'ask' | 'auto_edit' | 'full_access'
  /** 自动 worktree 隔离 */
  autoWorktree?: boolean
}

// ══════════════════════════════════════════════
// Manifest Manager
// ══════════════════════════════════════════════

export class ManifestManager {
  private manifests = new Map<string, Manifest>()

  /** 解析 Manifest YAML (简化版) */
  parse(yamlContent: string): Manifest {
    // 简化解析, 实际应使用 yaml 库
    const manifest: Manifest = {
      apiVersion: 'yuai/v1',
      kind: 'Mesh',
      space: 'main',
      agent: 'claude',
      agents: {},
      channels: {},
      settings: {},
    }

    // 提取 agents 和 channels
    const agentSection = yamlContent.match(/agents:\s*\n([\s\S]*?)(?=\nchannels:|$)/)
    if (agentSection) {
      const agentLines = agentSection[1].split('\n')
      let currentAgent = ''
      for (const line of agentLines) {
        const agentMatch = line.match(/^  (\w+):\s*$/)
        if (agentMatch) {
          currentAgent = agentMatch[1]
          manifest.agents[currentAgent] = { instructions: '' }
        }
        const instrMatch = line.match(/instructions:\s*['"]?(.+?)['"]?\s*$/)
        if (instrMatch && currentAgent) {
          manifest.agents[currentAgent].instructions = instrMatch[1]
        }
      }
    }

    return manifest
  }

  /** 反转 Manifest 为每 Agent 凭证 */
  invertToAgentPermissions(manifest: Manifest): Map<string, {
    subscribes: string[]
    canPublish: string[]
    instructions: string
  }> {
    const result = new Map<string, {
      subscribes: string[]
      canPublish: string[]
      instructions: string
    }>()

    // 初始化每个 Agent
    for (const [agentName, agentDef] of Object.entries(manifest.agents)) {
      result.set(agentName, {
        subscribes: [],
        canPublish: [],
        instructions: agentDef.instructions,
      })
    }

    // 从频道反转
    for (const [, channelDef] of Object.entries(manifest.channels)) {
      for (const agentName of channelDef.subscribe) {
        const agent = result.get(agentName)
        if (agent && !agent.subscribes.includes(channelDef.subscribe[0])) {
          agent.subscribes.push(...channelDef.subscribe.filter(s => !agent.subscribes.includes(s)))
        }
      }
      for (const agentName of channelDef.allowPublish) {
        const agent = result.get(agentName)
        if (agent && !agent.canPublish.includes(agentName)) {
          agent.canPublish.push(...channelDef.allowPublish.filter(p => !agent.canPublish.includes(p)))
        }
      }
    }

    return result
  }

  /** 生成默认 Manifest */
  generateDefault(): Manifest {
    return {
      apiVersion: 'yuai/v1',
      kind: 'Mesh',
      space: 'main',
      agent: 'claude',
      agents: {
        planner: {
          instructions: '你负责分析需求、分解任务、制定计划。将工作拆分为可执行的步骤。',
          role: 'planner',
          attention: 'open',
        },
        coder: {
          instructions: '你负责编写代码、实现功能。遵循项目规范，编写高质量代码。',
          role: 'coder',
          attention: 'focus',
          permission: 'auto_edit',
        },
        reviewer: {
          instructions: '你负责审查代码质量、检查安全问题、提出改进建议。',
          role: 'reviewer',
          attention: 'dnd',
        },
      },
      channels: {
        general: {
          subscribe: ['planner', 'coder', 'reviewer'],
          allowPublish: ['planner', 'coder', 'reviewer'],
          description: '通用沟通频道',
        },
        code: {
          subscribe: ['planner', 'coder'],
          allowPublish: ['coder'],
          description: '代码实现频道',
        },
        review: {
          subscribe: ['planner', 'reviewer'],
          allowPublish: ['reviewer'],
          description: '代码审查频道',
        },
      },
      settings: {
        maxAgents: 10,
        defaultAttention: 'open',
        defaultPermission: 'ask',
        autoWorktree: false,
      },
    }
  }

  /** 序列化 Manifest 为 YAML */
  serialize(manifest: Manifest): string {
    const lines: string[] = []

    lines.push(`apiVersion: ${manifest.apiVersion}`)
    lines.push(`kind: ${manifest.kind}`)
    lines.push(`space: ${manifest.space}`)
    lines.push(`agent: ${manifest.agent}`)
    lines.push('')

    // Agents
    lines.push('agents:')
    for (const [name, agent] of Object.entries(manifest.agents)) {
      lines.push(`  ${name}:`)
      lines.push(`    instructions: '${agent.instructions}'`)
      if (agent.role) lines.push(`    role: '${agent.role}'`)
      if (agent.model) lines.push(`    model: '${agent.model}'`)
      if (agent.attention) lines.push(`    attention: '${agent.attention}'`)
      if (agent.permission) lines.push(`    permission: '${agent.permission}'`)
      if (agent.capabilities?.length) {
        lines.push(`    capabilities: [${agent.capabilities.map(c => `'${c}'`).join(', ')}]`)
      }
    }
    lines.push('')

    // Channels
    lines.push('channels:')
    for (const [name, channel] of Object.entries(manifest.channels)) {
      lines.push(`  ${name}:`)
      lines.push(`    subscribe: [${channel.subscribe.map(s => `'${s}'`).join(', ')}]`)
      lines.push(`    allowPublish: [${channel.allowPublish.map(p => `'${p}'`).join(', ')}]`)
      if (channel.description) lines.push(`    description: '${channel.description}'`)
    }

    return lines.join('\n')
  }
}
