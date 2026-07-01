/**
 * Manager Privileges — 参考 Cotal manager 特权层级
 * self-service / privileged / admin
 * 单例租约 + 并发上限 + 冷却下限
 */

// ══════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════

export type PrivilegeLevel = 'self_service' | 'privileged' | 'admin'

export interface ManagerConfig {
  /** 最大并发 Agent 数 */
  maxAgents: number
  /** 冷却下限 (ms) — 防止 fork-bomb */
  minLifetimeMs: number
  /** 单例租约 TTL (ms) */
  leaseTtlMs: number
  /** 是否启用单例租约 */
  singletonLease: boolean
}

export interface AgentProcess {
  /** Agent ID */
  id: string
  /** Agent 名称 */
  name: string
  /** 启动时间 */
  started_at: number
  /** 谁启动的 */
  spawned_by: string
  /** 特权层级 */
  privilege: PrivilegeLevel
  /** 状态 */
  status: 'starting' | 'running' | 'stopping' | 'stopped'
  /** PID (如果适用) */
  pid: number | null
}

// ══════════════════════════════════════════════
// 默认配置
// ══════════════════════════════════════════════

export const DEFAULT_MANAGER_CONFIG: ManagerConfig = {
  maxAgents: 10,
  minLifetimeMs: 10_000, // 10s 冷却
  leaseTtlMs: 30_000,    // 30s 租约
  singletonLease: true,
}

// ══════════════════════════════════════════════
// 权限矩阵
// ══════════════════════════════════════════════

export const PRIVILEGE_MATRIX: Record<PrivilegeLevel, {
  can_spawn: boolean
  can_stop_own: boolean
  can_stop_others: boolean
  can_define_persona: boolean
  can_purge: boolean
  can_change_attention: boolean
  can_manage_channels: boolean
}> = {
  self_service: {
    can_spawn: false,
    can_stop_own: true,   // 仅自己
    can_stop_others: false,
    can_define_persona: false,
    can_purge: false,
    can_change_attention: true, // 仅自己
    can_manage_channels: false,
  },
  privileged: {
    can_spawn: true,
    can_stop_own: true,
    can_stop_others: false, // 仅自己的子 Agent
    can_define_persona: true,
    can_purge: false,
    can_change_attention: true,
    can_manage_channels: false,
  },
  admin: {
    can_spawn: true,
    can_stop_own: true,
    can_stop_others: true,
    can_define_persona: true,
    can_purge: true,
    can_change_attention: true,
    can_manage_channels: true,
  },
}

// ══════════════════════════════════════════════
// Manager
// ══════════════════════════════════════════════

export class Manager {
  private config: ManagerConfig
  private processes = new Map<string, AgentProcess>()
  private leaseHolder: string | null = null
  private leaseExpiry = 0
  private spawnLedger = new Map<string, string[]>() // parentId → childIds[]

  constructor(config: Partial<ManagerConfig> = {}) {
    this.config = { ...DEFAULT_MANAGER_CONFIG, ...config }
  }

  /** 获取单例租约 */
  acquireLease(managerId: string): boolean {
    if (!this.config.singletonLease) return true

    const now = Date.now()
    if (this.leaseHolder === null || now > this.leaseExpiry) {
      this.leaseHolder = managerId
      this.leaseExpiry = now + this.config.leaseTtlMs
      return true
    }
    return this.leaseHolder === managerId
  }

  /** 续租 */
  renewLease(managerId: string): boolean {
    if (this.leaseHolder !== managerId) return false
    this.leaseExpiry = Date.now() + this.config.leaseTtlMs
    return true
  }

  /** 释放租约 */
  releaseLease(managerId: string): void {
    if (this.leaseHolder === managerId) {
      this.leaseHolder = null
      this.leaseExpiry = 0
    }
  }

  /** 启动 Agent */
  spawn(
    agentName: string,
    spawnedBy: string,
    privilege: PrivilegeLevel,
  ): { success: boolean; process?: AgentProcess; error?: string } {
    // 检查权限
    if (!PRIVILEGE_MATRIX[privilege].can_spawn) {
      return { success: false, error: `${privilege} 无权 spawn` }
    }

    // 检查并发上限
    const running = Array.from(this.processes.values()).filter(p => p.status === 'running')
    if (running.length >= this.config.maxAgents) {
      return { success: false, error: `达到并发上限 ${this.config.maxAgents}` }
    }

    const process: AgentProcess = {
      id: crypto.randomUUID(),
      name: agentName,
      started_at: Date.now(),
      spawned_by: spawnedBy,
      privilege,
      status: 'starting',
      pid: null,
    }

    this.processes.set(process.id, process)

    // 记录 spawn 关系
    if (!this.spawnLedger.has(spawnedBy)) {
      this.spawnLedger.set(spawnedBy, [])
    }
    this.spawnLedger.get(spawnedBy)!.push(process.id)

    // 模拟启动完成 (检查是否已被停止)
    setTimeout(() => {
      const p = this.processes.get(process.id)
      if (p && p.status === 'starting') p.status = 'running'
    }, 100)

    return { success: true, process }
  }

  /** 停止 Agent */
  stop(
    processId: string,
    requestedBy: string,
    privilege: PrivilegeLevel,
  ): { success: boolean; error?: string } {
    const process = this.processes.get(processId)
    if (!process) return { success: false, error: '进程不存在' }

    // 自停
    if (requestedBy === processId) {
      if (!PRIVILEGE_MATRIX[privilege].can_stop_own) {
        return { success: false, error: `${privilege} 无权自停` }
      }
      process.status = 'stopping'
      setTimeout(() => { process.status = 'stopped' }, 100)
      return { success: true }
    }

    // 停止他人
    if (!PRIVILEGE_MATRIX[privilege].can_stop_others) {
      // 检查是否是自己的子 Agent
      const children = this.spawnLedger.get(requestedBy) ?? []
      if (!children.includes(processId)) {
        return { success: false, error: `${privilege} 无权停止非子 Agent` }
      }
    }

    process.status = 'stopping'
    setTimeout(() => { process.status = 'stopped' }, 100)
    return { success: true }
  }

  /** 获取进程列表 */
  getProcesses(): AgentProcess[] {
    return Array.from(this.processes.values())
  }

  /** 获取运行中的进程 */
  getRunningProcesses(): AgentProcess[] {
    return Array.from(this.processes.values()).filter(p => p.status === 'running')
  }

  /** 清理已停止的进程 */
  purge(): number {
    const stopped = Array.from(this.processes.entries()).filter(([, p]) => p.status === 'stopped')
    for (const [id] of stopped) {
      this.processes.delete(id)
      // 清理 spawn 关系
      for (const [parent, children] of this.spawnLedger.entries()) {
        this.spawnLedger.set(parent, children.filter(c => c !== id))
      }
    }
    return stopped.length
  }

  /** 获取 spawn 关系图 */
  getSpawnGraph(): Record<string, string[]> {
    const result: Record<string, string[]> = {}
    for (const [parent, children] of this.spawnLedger.entries()) {
      result[parent] = children
    }
    return result
  }
}
