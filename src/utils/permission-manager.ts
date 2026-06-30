/**
 * 权限控制系统
 * 参考 Omnigent PolicySystem + RBAC
 * 工具级别的访问控制
 */

export type Permission = 'read' | 'write' | 'execute' | 'admin'
export type Resource = 'file' | 'network' | 'database' | 'system' | 'agent' | 'tool'

export interface Role {
  id: string
  name: string
  description: string
  permissions: Permission[]
  resources: Resource[]
}

export interface UserPermission {
  userId: string
  agentId: string
  role: Role
  grantedAt: number
  expiresAt?: number
}

export interface PermissionCheck {
  allowed: boolean
  reason?: string
}

// 预定义角色
export const DEFAULT_ROLES: Role[] = [
  {
    id: 'viewer',
    name: '查看者',
    description: '只能查看，不能执行操作',
    permissions: ['read'],
    resources: ['file', 'agent'],
  },
  {
    id: 'operator',
    name: '操作者',
    description: '可以执行基本操作',
    permissions: ['read', 'execute'],
    resources: ['file', 'network', 'agent', 'tool'],
  },
  {
    id: 'developer',
    name: '开发者',
    description: '可以执行所有操作',
    permissions: ['read', 'write', 'execute'],
    resources: ['file', 'network', 'database', 'agent', 'tool'],
  },
  {
    id: 'admin',
    name: '管理员',
    description: '完全控制权限',
    permissions: ['read', 'write', 'execute', 'admin'],
    resources: ['file', 'network', 'database', 'system', 'agent', 'tool'],
  },
]

/**
 * 权限管理器
 * 基于 RBAC 模型的权限控制
 */
export class PermissionManager {
  private roles: Map<string, Role> = new Map()
  private userPermissions: Map<string, UserPermission[]> = new Map()

  constructor() {
    // 加载默认角色
    for (const role of DEFAULT_ROLES) {
      this.roles.set(role.id, role)
    }
  }

  /** 添加自定义角色 */
  addRole(role: Role): void {
    this.roles.set(role.id, role)
  }

  /** 获取角色 */
  getRole(roleId: string): Role | undefined {
    return this.roles.get(roleId)
  }

  /** 获取所有角色 */
  getAllRoles(): Role[] {
    return Array.from(this.roles.values())
  }

  /** 授予权限 */
  grantPermission(userId: string, agentId: string, roleId: string, expiresAt?: number): void {
    const role = this.roles.get(roleId)
    if (!role) {
      throw new Error(`Role not found: ${roleId}`)
    }

    const permission: UserPermission = {
      userId,
      agentId,
      role,
      grantedAt: Date.now(),
      expiresAt,
    }

    if (!this.userPermissions.has(userId)) {
      this.userPermissions.set(userId, [])
    }
    this.userPermissions.get(userId)!.push(permission)
  }

  /** 撤销权限 */
  revokePermission(userId: string, agentId: string): void {
    const permissions = this.userPermissions.get(userId) || []
    this.userPermissions.set(userId, permissions.filter(p => p.agentId !== agentId))
  }

  /** 检查权限 */
  checkPermission(userId: string, agentId: string, permission: Permission, resource: Resource): PermissionCheck {
    const permissions = this.userPermissions.get(userId) || []
    const userPermission = permissions.find(p => p.agentId === agentId)

    if (!userPermission) {
      return { allowed: false, reason: 'No permission granted' }
    }

    // 检查是否过期
    if (userPermission.expiresAt && Date.now() > userPermission.expiresAt) {
      return { allowed: false, reason: 'Permission expired' }
    }

    const role = userPermission.role

    // 检查权限
    if (!role.permissions.includes(permission)) {
      return { allowed: false, reason: `Permission ${permission} not granted` }
    }

    // 检查资源
    if (!role.resources.includes(resource)) {
      return { allowed: false, reason: `Resource ${resource} not accessible` }
    }

    return { allowed: true }
  }

  /** 获取用户权限 */
  getUserPermissions(userId: string): UserPermission[] {
    return this.userPermissions.get(userId) || []
  }

  /** 获取 Agent 的所有用户权限 */
  getAgentPermissions(agentId: string): UserPermission[] {
    const allPermissions: UserPermission[] = []
    for (const permissions of this.userPermissions.values()) {
      allPermissions.push(...permissions.filter(p => p.agentId === agentId))
    }
    return allPermissions
  }

  /** 清理过期权限 */
  cleanupExpiredPermissions(): void {
    const now = Date.now()
    for (const [userId, permissions] of this.userPermissions) {
      this.userPermissions.set(userId, permissions.filter(p => !p.expiresAt || p.expiresAt > now))
    }
  }
}

// 全局权限管理器实例
export const globalPermissionManager = new PermissionManager()
