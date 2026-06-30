/**
 * TUI 安装向导
 * 参考 agency-agents 的 TUI Install Wizard
 * 交互式 checkbox 选择器
 */

export interface InstallOption {
  id: string
  name: string
  description: string
  category: string
  size?: number
  isSelected: boolean
}

export interface InstallWizardState {
  currentStep: number
  totalSteps: number
  options: InstallOption[]
  selectedOptions: string[]
  isInstalling: boolean
  installProgress: number
}

/**
 * TUI 安装向导管理器
 * 管理交互式安装流程
 */
export class TUIInstallWizardManager {
  private state: InstallWizardState
  private onComplete?: (selectedOptions: string[]) => void
  private onCancel?: () => void

  constructor() {
    this.state = {
      currentStep: 0,
      totalSteps: 3,
      options: [],
      selectedOptions: [],
      isInstalling: false,
      installProgress: 0,
    }
  }

  /** 初始化选项 */
  initOptions(options: InstallOption[]): void {
    this.state.options = options
    this.state.selectedOptions = options.filter(o => o.isSelected).map(o => o.id)
  }

  /** 切换选项选择 */
  toggleOption(optionId: string): void {
    const index = this.state.selectedOptions.indexOf(optionId)
    if (index === -1) {
      this.state.selectedOptions.push(optionId)
    } else {
      this.state.selectedOptions.splice(index, 1)
    }

    // 更新选项状态
    const option = this.state.options.find(o => o.id === optionId)
    if (option) {
      option.isSelected = this.state.selectedOptions.includes(optionId)
    }
  }

  /** 全选 */
  selectAll(): void {
    this.state.selectedOptions = this.state.options.map(o => o.id)
    this.state.options.forEach(o => o.isSelected = true)
  }

  /** 全不选 */
  selectNone(): void {
    this.state.selectedOptions = []
    this.state.options.forEach(o => o.isSelected = false)
  }

  /** 下一步 */
  nextStep(): boolean {
    if (this.state.currentStep < this.state.totalSteps - 1) {
      this.state.currentStep++
      return true
    }
    return false
  }

  /** 上一步 */
  prevStep(): boolean {
    if (this.state.currentStep > 0) {
      this.state.currentStep--
      return true
    }
    return false
  }

  /** 开始安装 */
  async startInstall(): Promise<void> {
    if (this.state.selectedOptions.length === 0) return

    this.state.isInstalling = true
    this.state.installProgress = 0

    const total = this.state.selectedOptions.length
    let completed = 0

    for (const optionId of this.state.selectedOptions) {
      // 模拟安装
      await new Promise(resolve => setTimeout(resolve, 500))
      completed++
      this.state.installProgress = Math.round((completed / total) * 100)
    }

    this.state.isInstalling = false
    this.onComplete?.(this.state.selectedOptions)
  }

  /** 取消安装 */
  cancel(): void {
    this.state.isInstalling = false
    this.state.installProgress = 0
    this.onCancel?.()
  }

  /** 获取状态 */
  getState(): InstallWizardState {
    return { ...this.state }
  }

  /** 获取选中的选项 */
  getSelectedOptions(): InstallOption[] {
    return this.state.options.filter(o => this.state.selectedOptions.includes(o.id))
  }

  /** 设置完成回调 */
  setOnComplete(callback: (selectedOptions: string[]) => void): void {
    this.onComplete = callback
  }

  /** 设置取消回调 */
  setOnCancel(callback: () => void): void {
    this.onCancel = callback
  }

  /** 重置 */
  reset(): void {
    this.state = {
      currentStep: 0,
      totalSteps: 3,
      options: [],
      selectedOptions: [],
      isInstalling: false,
      installProgress: 0,
    }
  }
}

// 全局 TUI 安装向导管理器实例
export const globalTUIInstallWizardManager = new TUIInstallWizardManager()
