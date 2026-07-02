/**
 * 设计模式系统
 * 参考 Orca 的 Design Mode
 * 点击 UI 元素自动捕获 HTML/CSS/截图到 prompt
 */

export interface CapturedElement {
  tagName: string
  className: string
  id: string
  textContent: string
  styles: Record<string, string>
  html: string
  screenshot?: string // base64
  bounds: { x: number; y: number; width: number; height: number }
}

export interface DesignModeConfig {
  enabled: boolean
  captureStyles: boolean
  captureScreenshot: boolean
  maxDepth: number // 向上遍历的层数
}

/**
 * 设计模式管理器
 * 捕获 UI 元素信息用于 prompt
 */
export class DesignModeManager {
  private config: DesignModeConfig
  private isActive = false
  private capturedElements: CapturedElement[] = []

  constructor(config: DesignModeConfig) {
    this.config = config
  }

  /** 激活设计模式 */
  activate(): void {
    this.isActive = true
    this.capturedElements = []
    document.body.style.cursor = 'crosshair'
    document.addEventListener('click', this.handleClick, true)
    console.debug('[DesignMode] Activated')
  }

  /** 停用设计模式 */
  deactivate(): void {
    this.isActive = false
    document.body.style.cursor = ''
    document.removeEventListener('click', this.handleClick, true)
    console.debug('[DesignMode] Deactivated')
  }

  /** 处理点击 */
  private handleClick = (event: MouseEvent): void => {
    if (!this.isActive) return

    event.preventDefault()
    event.stopPropagation()

    const element = event.target as HTMLElement
    const captured = this.captureElement(element)

    if (captured) {
      this.capturedElements.push(captured)
      this.highlightElement(element)
    }
  }

  /** 捕获元素信息 */
  private captureElement(element: HTMLElement): CapturedElement | null {
    if (!element || element === document.body) return null

    const styles = this.config.captureStyles ? this.getComputedStyles(element) : {}
    const bounds = element.getBoundingClientRect()

    return {
      tagName: element.tagName.toLowerCase(),
      className: element.className,
      id: element.id,
      textContent: element.textContent?.slice(0, 200) ?? '',
      styles,
      html: element.outerHTML.slice(0, 1000),
      bounds: {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
      },
    }
  }

  /** 获取计算后的样式 */
  private getComputedStyles(element: HTMLElement): Record<string, string> {
    const computed = window.getComputedStyle(element)
    const important = [
      'color', 'background-color', 'font-size', 'font-family',
      'padding', 'margin', 'border', 'border-radius',
      'display', 'position', 'width', 'height',
    ]

    const styles: Record<string, string> = {}
    for (const prop of important) {
      styles[prop] = computed.getPropertyValue(prop)
    }
    return styles
  }

  /** 高亮元素 */
  private highlightElement(element: HTMLElement): void {
    const overlay = document.createElement('div')
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 99999;
    `

    const highlight = document.createElement('div')
    const bounds = element.getBoundingClientRect()
    highlight.style.cssText = `
      position: absolute;
      top: ${bounds.y}px;
      left: ${bounds.x}px;
      width: ${bounds.width}px;
      height: ${bounds.height}px;
      border: 2px solid #5ccfb8;
      background: rgba(92, 207, 184, 0.1);
      pointer-events: none;
    `

    overlay.appendChild(highlight)
    document.body.appendChild(overlay)

    setTimeout(() => overlay.remove(), 1000)
  }

  /** 获取捕获的元素 */
  getCapturedElements(): CapturedElement[] {
    return [...this.capturedElements]
  }

  /** 生成 prompt 片段 */
  generatePromptFragment(): string {
    if (this.capturedElements.length === 0) return ''

    let fragment = '## 捕获的 UI 元素\n\n'
    for (const element of this.capturedElements) {
      fragment += `### ${element.tagName}${element.id ? '#' + element.id : ''}${element.className ? '.' + element.className.split(' ').join('.') : ''}\n`
      fragment += `- 文本: ${element.textContent}\n`
      fragment += `- 尺寸: ${Math.round(element.bounds.width)}x${Math.round(element.bounds.height)}\n`
      if (Object.keys(element.styles).length > 0) {
        fragment += `- 样式:\n`
        for (const [prop, value] of Object.entries(element.styles)) {
          fragment += `  - ${prop}: ${value}\n`
        }
      }
      fragment += '\n'
    }

    return fragment
  }

  /** 清空捕获 */
  clearCaptures(): void {
    this.capturedElements = []
  }

  /** 检查是否激活 */
  getIsActive(): boolean {
    return this.isActive
  }
}

// 默认配置
export const DEFAULT_DESIGN_MODE_CONFIG: DesignModeConfig = {
  enabled: true,
  captureStyles: true,
  captureScreenshot: false,
  maxDepth: 3,
}

// 全局设计模式管理器实例
export const globalDesignModeManager = new DesignModeManager(DEFAULT_DESIGN_MODE_CONFIG)
