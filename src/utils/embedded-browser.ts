/**
 * 嵌入式浏览器系统
 * 参考 Orca 的 Embedded Browser
 * 内置 Chromium 浏览器用于 web 预览
 */

export interface BrowserConfig {
  startUrl?: string
  width?: number
  height?: number
  enableDevTools?: boolean
}

export interface BrowserTab {
  id: string
  url: string
  title: string
  isLoading: boolean
  createdAt: number
}

export interface BrowserEvent {
  type: 'navigation' | 'load' | 'error' | 'console'
  tabId: string
  data: unknown
  timestamp: number
}

/**
 * 嵌入式浏览器管理器
 * 管理内置浏览器实例
 */
export class EmbeddedBrowserManager {
  private tabs: Map<string, BrowserTab> = new Map()
  private activeTabId: string | null = null
  private eventHandlers: Map<string, ((event: BrowserEvent) => void)[]> = new Map()
  private config: BrowserConfig
  private history: Map<string, string[]> = new Map() // tabId → url history stack
  private historyIndex: Map<string, number> = new Map() // tabId → current position

  constructor(config: BrowserConfig) {
    this.config = config
  }

  /** 创建新标签页 */
  createTab(url?: string): BrowserTab {
    const tab: BrowserTab = {
      id: crypto.randomUUID(),
      url: url || this.config.startUrl || 'about:blank',
      title: 'New Tab',
      isLoading: true,
      createdAt: Date.now(),
    }

    this.tabs.set(tab.id, tab)
    this.activeTabId = tab.id
    this.history.set(tab.id, [tab.url])
    this.historyIndex.set(tab.id, 0)

    return tab
  }

  /** 导航到 URL */
  async navigate(tabId: string, url: string): Promise<boolean> {
    const tab = this.tabs.get(tabId)
    if (!tab) return false

    tab.url = url
    tab.isLoading = true

    // Push to navigation history (truncate forward history)
    const hist = this.history.get(tabId) ?? []
    const idx = this.historyIndex.get(tabId) ?? 0
    const trimmed = hist.slice(0, idx + 1)
    trimmed.push(url)
    this.history.set(tabId, trimmed)
    this.historyIndex.set(tabId, trimmed.length - 1)

    this.emitEvent({
      type: 'navigation',
      tabId,
      data: { url },
      timestamp: Date.now(),
    })

    // 模拟加载
    setTimeout(() => {
      tab.isLoading = false
      tab.title = this.extractTitle(url)
      this.emitEvent({
        type: 'load',
        tabId,
        data: { url, title: tab.title },
        timestamp: Date.now(),
      })
    }, 1000)

    return true
  }

  /** 切换标签页 */
  switchTab(tabId: string): boolean {
    if (!this.tabs.has(tabId)) return false
    this.activeTabId = tabId
    return true
  }

  /** 关闭标签页 */
  closeTab(tabId: string): boolean {
    if (!this.tabs.has(tabId)) return false

    this.tabs.delete(tabId)
    this.history.delete(tabId)
    this.historyIndex.delete(tabId)

    if (this.activeTabId === tabId) {
      const remaining = Array.from(this.tabs.keys())
      this.activeTabId = remaining[0] || null
    }

    return true
  }

  /** 获取活动标签页 */
  getActiveTab(): BrowserTab | undefined {
    return this.activeTabId ? this.tabs.get(this.activeTabId) : undefined
  }

  /** 获取所有标签页 */
  getAllTabs(): BrowserTab[] {
    return Array.from(this.tabs.values())
  }

  /** 后退 */
  goBack(tabId: string): boolean {
    const tab = this.tabs.get(tabId)
    if (!tab) return false
    const idx = this.historyIndex.get(tabId) ?? 0
    if (idx <= 0) return false
    const newIdx = idx - 1
    this.historyIndex.set(tabId, newIdx)
    const url = this.history.get(tabId)![newIdx]
    tab.url = url
    tab.isLoading = true
    setTimeout(() => { tab.isLoading = false; tab.title = this.extractTitle(url) }, 500)
    return true
  }

  /** 前进 */
  goForward(tabId: string): boolean {
    const tab = this.tabs.get(tabId)
    if (!tab) return false
    const hist = this.history.get(tabId) ?? []
    const idx = this.historyIndex.get(tabId) ?? 0
    if (idx >= hist.length - 1) return false
    const newIdx = idx + 1
    this.historyIndex.set(tabId, newIdx)
    const url = hist[newIdx]
    tab.url = url
    tab.isLoading = true
    setTimeout(() => { tab.isLoading = false; tab.title = this.extractTitle(url) }, 500)
    return true
  }

  /** 刷新 */
  refresh(tabId: string): Promise<boolean> {
    const tab = this.tabs.get(tabId)
    if (!tab) return Promise.resolve(false)

    return this.navigate(tabId, tab.url)
  }

  /** 监听事件 */
  on(eventType: string, handler: (event: BrowserEvent) => void): void {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, [])
    }
    this.eventHandlers.get(eventType)!.push(handler)
  }

  /** 移除监听 */
  off(eventType: string, handler: (event: BrowserEvent) => void): void {
    const handlers = this.eventHandlers.get(eventType)
    if (handlers) {
      const index = handlers.indexOf(handler)
      if (index !== -1) {
        handlers.splice(index, 1)
      }
    }
  }

  /** 触发事件 */
  private emitEvent(event: BrowserEvent): void {
    const handlers = this.eventHandlers.get(event.type) ?? []
    for (const handler of handlers) {
      try {
        handler(event)
      } catch (error) {
        console.error('[Browser] Event handler error:', error)
      }
    }
  }

  /** 提取标题 */
  private extractTitle(url: string): string {
    try {
      const urlObj = new URL(url)
      return urlObj.hostname
    } catch {
      return url
    }
  }

  /** 检查是否支持 */
  isSupported(): boolean {
    // 在 Tauri 中，需要检查 WebView 是否支持
    return true
  }
}

// 默认浏览器配置
export const DEFAULT_BROWSER_CONFIG: BrowserConfig = {
  startUrl: 'about:blank',
  width: 1200,
  height: 800,
  enableDevTools: false,
}

// 全局嵌入式浏览器管理器实例
export const globalEmbeddedBrowserManager = new EmbeddedBrowserManager(DEFAULT_BROWSER_CONFIG)
