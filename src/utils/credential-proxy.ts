/**
 * 凭证代理系统
 * 参考 Omnigent 的 Credential Proxy (Secretless)
 * 沙箱内零凭证，出口代理注入
 */

export interface Credential {
  id: string
  name: string
  type: 'api_key' | 'token' | 'password' | 'certificate'
  value: string
  expiresAt?: number
  metadata?: Record<string, unknown>
}

export interface CredentialRequest {
  credentialId: string
  targetUrl?: string
  purpose?: string
}

export interface CredentialResponse {
  success: boolean
  credential?: Credential
  error?: string
}

/**
 * 凭证代理管理器
 * 管理敏感凭证，提供安全的访问方式
 */
export class CredentialProxyManager {
  private credentials: Map<string, Credential> = new Map()
  private accessLog: Array<{ credentialId: string; timestamp: number; purpose?: string }> = []

  /** 存储凭证 */
  storeCredential(credential: Credential): void {
    this.credentials.set(credential.id, credential)
  }

  /** 获取凭证 */
  getCredential(request: CredentialRequest): CredentialResponse {
    const credential = this.credentials.get(request.credentialId)

    if (!credential) {
      return { success: false, error: 'Credential not found' }
    }

    // 检查是否过期
    if (credential.expiresAt && Date.now() > credential.expiresAt) {
      return { success: false, error: 'Credential expired' }
    }

    // 记录访问
    this.accessLog.push({
      credentialId: request.credentialId,
      timestamp: Date.now(),
      purpose: request.purpose,
    })

    return { success: true, credential }
  }

  /** 删除凭证 */
  deleteCredential(credentialId: string): boolean {
    return this.credentials.delete(credentialId)
  }

  /** 获取所有凭证名称（不包含值） */
  listCredentials(): Array<{ id: string; name: string; type: string; expiresAt?: number }> {
    return Array.from(this.credentials.values()).map(c => ({
      id: c.id,
      name: c.name,
      type: c.type,
      expiresAt: c.expiresAt,
    }))
  }

  /** 获取访问日志 */
  getAccessLog(credentialId?: string): Array<{ credentialId: string; timestamp: number; purpose?: string }> {
    if (credentialId) {
      return this.accessLog.filter(log => log.credentialId === credentialId)
    }
    return [...this.accessLog]
  }

  /** 清空访问日志 */
  clearAccessLog(): void {
    this.accessLog = []
  }

  /** 检查凭证是否存在且有效 */
  isCredentialValid(credentialId: string): boolean {
    const credential = this.credentials.get(credentialId)
    if (!credential) return false
    if (credential.expiresAt && Date.now() > credential.expiresAt) return false
    return true
  }

  /** 更新凭证 */
  updateCredential(credentialId: string, updates: Partial<Credential>): boolean {
    const credential = this.credentials.get(credentialId)
    if (!credential) return false

    Object.assign(credential, updates)
    return true
  }

  /** 清空所有凭证 */
  clearAll(): void {
    this.credentials.clear()
    this.accessLog = []
  }
}

// 全局凭证代理管理器实例
export const globalCredentialProxyManager = new CredentialProxyManager()
