/**
 * 渐进式安装系统
 * 参考 agency-agents 的 Progressive Installation
 * 按部门/Agent/工具粒度控制安装
 */

export type InstallScope = 'division' | 'agent' | 'tool'

export interface InstallConfig {
  scope: InstallScope
  id: string
  name: string
  description: string
  size?: number
  dependencies?: string[]
}

export interface InstallPlan {
  items: InstallConfig[]
  totalSize: number
  estimatedTime: number
}

export interface InstallProgress {
  itemId: string
  status: 'pending' | 'installing' | 'completed' | 'failed'
  progress: number
  error?: string
}

/**
 * 渐进式安装管理器
 * 管理按需安装
 */
export class ProgressiveInstallManager {
  private availableItems: Map<string, InstallConfig> = new Map()
  private installedItems: Set<string> = new Set()
  private installProgress: Map<string, InstallProgress> = new Map()

  /** 注册可用项 */
  registerItem(config: InstallConfig): void {
    this.availableItems.set(config.id, config)
  }

  /** 获取可用项 */
  getAvailableItems(scope?: InstallScope): InstallConfig[] {
    const items = Array.from(this.availableItems.values())
    if (scope) {
      return items.filter(item => item.scope === scope)
    }
    return items
  }

  /** 获取已安装项 */
  getInstalledItems(): InstallConfig[] {
    return Array.from(this.installedItems)
      .map(id => this.availableItems.get(id))
      .filter(Boolean) as InstallConfig[]
  }

  /** 检查是否已安装 */
  isInstalled(itemId: string): boolean {
    return this.installedItems.has(itemId)
  }

  /** 创建安装计划 */
  createInstallPlan(itemIds: string[]): InstallPlan {
    const items: InstallConfig[] = []
    let totalSize = 0

    for (const id of itemIds) {
      const item = this.availableItems.get(id)
      if (item && !this.installedItems.has(id)) {
        items.push(item)
        totalSize += item.size || 0
      }
    }

    return {
      items,
      totalSize,
      estimatedTime: items.length * 1000, // 粗略估计
    }
  }

  /** 执行安装 */
  async install(itemId: string): Promise<boolean> {
    if (this.installedItems.has(itemId)) {
      return true
    }

    const item = this.availableItems.get(itemId)
    if (!item) {
      return false
    }

    // 检查依赖
    if (item.dependencies) {
      for (const depId of item.dependencies) {
        if (!this.installedItems.has(depId)) {
          const depInstalled = await this.install(depId)
          if (!depInstalled) {
            return false
          }
        }
      }
    }

    // 开始安装
    this.installProgress.set(itemId, {
      itemId,
      status: 'installing',
      progress: 0,
    })

    try {
      // 模拟安装过程
      await this.simulateInstall(itemId)

      this.installedItems.add(itemId)
      this.installProgress.set(itemId, {
        itemId,
        status: 'completed',
        progress: 100,
      })

      return true
    } catch (error) {
      this.installProgress.set(itemId, {
        itemId,
        status: 'failed',
        progress: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      })

      return false
    }
  }

  /** 批量安装 */
  async installBatch(itemIds: string[]): Promise<{ success: string[]; failed: string[] }> {
    const success: string[] = []
    const failed: string[] = []

    for (const id of itemIds) {
      const installed = await this.install(id)
      if (installed) {
        success.push(id)
      } else {
        failed.push(id)
      }
    }

    return { success, failed }
  }

  /** 卸载 */
  uninstall(itemId: string): boolean {
    if (!this.installedItems.has(itemId)) {
      return false
    }

    // 检查是否有其他项依赖此项
    for (const [id, item] of this.availableItems) {
      if (item.dependencies?.includes(itemId) && this.installedItems.has(id)) {
        return false
      }
    }

    this.installedItems.delete(itemId)
    this.installProgress.delete(itemId)
    return true
  }

  /** 获取安装进度 */
  getProgress(itemId: string): InstallProgress | undefined {
    return this.installProgress.get(itemId)
  }

  /** 获取所有安装进度 */
  getAllProgress(): InstallProgress[] {
    return Array.from(this.installProgress.values())
  }

  /** 模拟安装 */
  private async simulateInstall(itemId: string): Promise<void> {
    return new Promise(resolve => {
      let progress = 0
      const interval = setInterval(() => {
        progress += 10
        const current = this.installProgress.get(itemId)
        if (current) {
          current.progress = progress
        }

        if (progress >= 100) {
          clearInterval(interval)
          resolve()
        }
      }, 100)
    })
  }
}

// 全局渐进式安装管理器实例
export const globalProgressiveInstallManager = new ProgressiveInstallManager()
