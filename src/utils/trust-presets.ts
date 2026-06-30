/**
 * Agent 信任预设系统
 * 参考 Orca 的 Agent Trust Presets
 * 管理 Agent 的权限和信任级别
 */

export type TrustLevel = 'untrusted' | 'low' | 'medium' | 'high' | 'full'

export interface TrustPreset {
  id: string
  name: string
  description: string
  level: TrustLevel
  permissions: {
    fileRead: boolean
    fileWrite: boolean
    networkAccess: boolean
    systemCommands: boolean
    toolExecution: boolean
    autoApprove: boolean
  }
  restrictions: {
    maxTokens?: number
    maxDuration?: number
    allowedDomains?: string[]
    blockedCommands?: string[]
  }
}

export interface AgentTrustConfig {
  agentId: string
  presetId: string
  customPermissions?: Partial<TrustPreset['permissions']>
  customRestrictions?: Partial<TrustPreset['restrictions']>
}

/**
 * 信任预设管理器
 * 管理 Agent 的权限和信任级别
 */
export class TrustPresetManager {
  private presets: Map<string, TrustPreset> = new Map()
  private agentConfigs: Map<string, AgentTrustConfig> = new Map()

  constructor() {
    this.initDefaultPresets()
  }

  /** 初始化默认预设 */
  private initDefaultPresets() {
    const defaults: TrustPreset[] = [
      {
        id: 'untrusted',
        name: '不信任',
        description: '最低权限，所有操作需要确认',
        level: 'untrusted',
        permissions: {
          fileRead: false,
          fileWrite: false,
          networkAccess: false,
          systemCommands: false,
          toolExecution: false,
          autoApprove: false,
        },
        restrictions: {
          maxTokens: 1000,
          maxDuration: 60000,
        },
      },
      {
        id: 'low',
        name: '低信任',
        description: '基本读取权限，写入需要确认',
        level: 'low',
        permissions: {
          fileRead: true,
          fileWrite: false,
          networkAccess: false,
          systemCommands: false,
          toolExecution: false,
          autoApprove: false,
        },
        restrictions: {
          maxTokens: 5000,
          maxDuration: 300000,
        },
      },
      {
        id: 'medium',
        name: '中等信任',
        description: '读写权限，网络和系统命令需要确认',
        level: 'medium',
        permissions: {
          fileRead: true,
          fileWrite: true,
          networkAccess: false,
          systemCommands: false,
          toolExecution: true,
          autoApprove: false,
        },
        restrictions: {
          maxTokens: 50000,
          maxDuration: 600000,
        },
      },
      {
        id: 'high',
        name: '高信任',
        description: '大部分权限，危险操作需要确认',
        level: 'high',
        permissions: {
          fileRead: true,
          fileWrite: true,
          networkAccess: true,
          systemCommands: false,
          toolExecution: true,
          autoApprove: false,
        },
        restrictions: {
          maxTokens: 200000,
          maxDuration: 1800000,
        },
      },
      {
        id: 'full',
        name: '完全信任',
        description: '完全权限，所有操作自动批准',
        level: 'full',
        permissions: {
          fileRead: true,
          fileWrite: true,
          networkAccess: true,
          systemCommands: true,
          toolExecution: true,
          autoApprove: true,
        },
        restrictions: {
          maxTokens: 1000000,
          maxDuration: 3600000,
        },
      },
    ]

    for (const preset of defaults) {
      this.presets.set(preset.id, preset)
    }
  }

  /** 获取预设 */
  getPreset(presetId: string): TrustPreset | undefined {
    return this.presets.get(presetId)
  }

  /** 获取所有预设 */
  getAllPresets(): TrustPreset[] {
    return Array.from(this.presets.values())
  }

  /** 设置 Agent 信任配置 */
  setAgentTrust(config: AgentTrustConfig): void {
    this.agentConfigs.set(config.agentId, config)
  }

  /** 获取 Agent 信任配置 */
  getAgentTrust(agentId: string): AgentTrustConfig | undefined {
    return this.agentConfigs.get(agentId)
  }

  /** 检查 Agent 是否有权限 */
  hasPermission(agentId: string, permission: keyof TrustPreset['permissions']): boolean {
    const config = this.agentConfigs.get(agentId)
    if (!config) return false

    const preset = this.presets.get(config.presetId)
    if (!preset) return false

    // 检查自定义权限覆盖
    if (config.customPermissions && permission in config.customPermissions) {
      return config.customPermissions[permission] ?? preset.permissions[permission]
    }

    return preset.permissions[permission]
  }

  /** 检查 Agent 是否在限制内 */
  checkRestrictions(agentId: string, usage: { tokens?: number; duration?: number }): { allowed: boolean; reason?: string } {
    const config = this.agentConfigs.get(agentId)
    if (!config) return { allowed: false, reason: 'No trust config' }

    const preset = this.presets.get(config.presetId)
    if (!preset) return { allowed: false, reason: 'Invalid preset' }

    const restrictions = { ...preset.restrictions, ...config.customRestrictions }

    if (usage.tokens && restrictions.maxTokens && usage.tokens > restrictions.maxTokens) {
      return { allowed: false, reason: `Token limit exceeded: ${usage.tokens} > ${restrictions.maxTokens}` }
    }

    if (usage.duration && restrictions.maxDuration && usage.duration > restrictions.maxDuration) {
      return { allowed: false, reason: `Duration limit exceeded: ${usage.duration} > ${restrictions.maxDuration}` }
    }

    return { allowed: true }
  }

  /** 添加自定义预设 */
  addPreset(preset: TrustPreset): void {
    this.presets.set(preset.id, preset)
  }

  /** 删除自定义预设 */
  removePreset(presetId: string): boolean {
    // 不允许删除默认预设
    if (['untrusted', 'low', 'medium', 'high', 'full'].includes(presetId)) {
      return false
    }
    return this.presets.delete(presetId)
  }
}

// 全局信任预设管理器实例
export const globalTrustPresetManager = new TrustPresetManager()
