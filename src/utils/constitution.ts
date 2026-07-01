/**
 * Constitution — 参考 spec-kit /speckit.constitution
 * 项目"宪法" — 约束所有 AI 行为的不可违背原则
 */

// ══════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════

export type PrincipleSeverity = 'MUST' | 'SHOULD' | 'MAY'

export interface Principle {
  id: string
  article: string       // 条款编号 (如 "1", "2.1")
  title: string
  description: string
  severity: PrincipleSeverity
  category: string      // 分类 (如 "架构", "安全", "UI", "性能")
}

export interface Constitution {
  project_id: string
  title: string
  principles: Principle[]
  created_at: number
  updated_at: number
}

// ══════════════════════════════════════════════
// 默认宪法 (yuai 项目)
// ══════════════════════════════════════════════

export const YUAI_CONSTITUTION: Omit<Constitution, 'project_id' | 'created_at' | 'updated_at'> = {
  title: 'yuai 项目宪法',
  principles: [
    // 架构原则
    { id: 'arch-1', article: '1', title: 'Tauri v2 + Vue 3', description: '所有功能必须在 Tauri v2 + Vue 3 + TypeScript 框架内实现', severity: 'MUST', category: '架构' },
    { id: 'arch-2', article: '2', title: '单一数据源', description: 'CSS 变量在 variables.css 定义, 不在其他文件重复', severity: 'MUST', category: '架构' },
    { id: 'arch-3', article: '3', title: 'Pinia Store 模式', description: '状态管理使用 Pinia defineStore, 不使用 Vuex 或全局变量', severity: 'MUST', category: '架构' },
    { id: 'arch-4', article: '4', title: 'Tauri Command 命名', description: '后端命令使用 snake_case, 前端调用使用 camelCase', severity: 'SHOULD', category: '架构' },

    // UI 原则
    { id: 'ui-1', article: '5', title: '零 Emoji', description: 'UI 中不使用 emoji 或 Unicode 字符图标, 使用 Tabler Icons (TIcon)', severity: 'MUST', category: 'UI' },
    { id: 'ui-2', article: '6', title: '青瓷墨玉设计语言', description: '颜色使用 CSS 变量: 翡翠绿 #5ccfb8, 赤金 #c9a85c, 深墨 #0b1a1a', severity: 'MUST', category: 'UI' },
    { id: 'ui-3', article: '7', title: 'TIcon 静态导入', description: 'TIcon 组件必须静态 import, 不使用动态 import()', severity: 'MUST', category: 'UI' },
    { id: 'ui-4', article: '8', title: '字体规范', description: '中文用 LXGW WenKai, 代码用 JetBrains Mono, 标题用 Noto Serif SC', severity: 'SHOULD', category: 'UI' },

    // 安全原则
    { id: 'sec-1', article: '9', title: 'API Key 加密', description: 'API Key 使用 safeStorage AES-256-GCM 加密存储, 不明文保存', severity: 'MUST', category: '安全' },
    { id: 'sec-2', article: '10', title: '密钥文件权限', description: '密钥文件权限必须为 0o600', severity: 'MUST', category: '安全' },
    { id: 'sec-3', article: '11', title: '危险命令拦截', description: '终端命令必须经过策略引擎安全检查', severity: 'MUST', category: '安全' },

    // 性能原则
    { id: 'perf-1', article: '12', title: '组件懒加载', description: '大型组件使用 defineAsyncComponent 懒加载', severity: 'SHOULD', category: '性能' },
    { id: 'perf-2', article: '13', title: 'CSS 变量优先', description: '样式使用 CSS 变量, 不硬编码颜色值', severity: 'MUST', category: '性能' },

    // 客户端部署原则
    { id: 'deploy-1', article: '14', title: '独立部署', description: '客户端项目独立部署, 不依赖本机 Hermes 配置或端口', severity: 'MUST', category: '部署' },
    { id: 'deploy-2', article: '15', title: '默认值', description: '不写死端口/模型/Key, 使用标准默认值', severity: 'MUST', category: '部署' },
  ],
}

// ══════════════════════════════════════════════
// Constitution Manager
// ══════════════════════════════════════════════

export class ConstitutionManager {
  private constitutions = new Map<string, Constitution>()

  /** 创建宪法 */
  create(projectId: string, title: string, principles: Principle[]): Constitution {
    const constitution: Constitution = {
      project_id: projectId,
      title,
      principles,
      created_at: Date.now(),
      updated_at: Date.now(),
    }
    this.constitutions.set(projectId, constitution)
    return constitution
  }

  /** 获取宪法 */
  get(projectId: string): Constitution | undefined {
    return this.constitutions.get(projectId)
  }

  /** 添加原则 */
  addPrinciple(projectId: string, principle: Principle): void {
    const constitution = this.constitutions.get(projectId)
    if (constitution) {
      constitution.principles.push(principle)
      constitution.updated_at = Date.now()
    }
  }

  /** 移除原则 */
  removePrinciple(projectId: string, principleId: string): void {
    const constitution = this.constitutions.get(projectId)
    if (constitution) {
      constitution.principles = constitution.principles.filter(p => p.id !== principleId)
      constitution.updated_at = Date.now()
    }
  }

  /** 生成系统提示词 (注入到 AI 上下文) */
  generateSystemPrompt(projectId: string): string {
    const constitution = this.constitutions.get(projectId)
    if (!constitution) return ''

    const lines = [`# ${constitution.title}\n`]

    const categories = new Map<string, Principle[]>()
    for (const p of constitution.principles) {
      if (!categories.has(p.category)) categories.set(p.category, [])
      categories.get(p.category)!.push(p)
    }

    for (const [category, principles] of categories) {
      lines.push(`## ${category}`)
      for (const p of principles) {
        lines.push(`- **[${p.severity}] 条款 ${p.article}: ${p.title}** — ${p.description}`)
      }
      lines.push('')
    }

    return lines.join('\n')
  }

  /** 验证代码是否符合宪法 */
  validate(projectId: string, code: string): { passed: boolean; violations: string[] } {
    const constitution = this.constitutions.get(projectId)
    if (!constitution) return { passed: true, violations: [] }

    const violations: string[] = []

    for (const p of constitution.principles) {
      if (p.severity !== 'MUST') continue

      // 简单的规则检查
      switch (p.id) {
        case 'ui-1': // 零 Emoji
          if (/[🍎🍊🍋🍇🍉🍓🍑🍒🍈🍌🍐🍍🥝🍅🥑🍆🥔🥕🌽🌶️🥒🍄🥜🍞🥐🧀🍖🍗🍔🍟🍕🌭🌮🌯🥙🥚🥘🍲🥗🍿🍱🍘🍙🍚🍛🍜🍝🍠🍢🍣🍤🍥🍡🥟🥠🥡🍦🍧🍨🍩🍪🎂🍰🍫🍬🍭🍮🍯🍼🥛🍺🍻🥂🍷🥃🍸🍹🍾🥄🍽️🥢]/u.test(code)) {
            violations.push(`条款 ${p.article}: ${p.title} — 检测到 emoji`)
          }
          break
        case 'ui-3': // TIcon 静态导入
          if (code.includes('import(') && code.includes('tabler')) {
            violations.push(`条款 ${p.article}: ${p.title} — 检测到动态 import`)
          }
          break
        case 'sec-1': // API Key 加密
          if (/apiKey.*=.*['"][a-zA-Z0-9]{20,}['"]/.test(code)) {
            violations.push(`条款 ${p.article}: ${p.title} — 检测到硬编码 API Key`)
          }
          break
      }
    }

    return { passed: violations.length === 0, violations }
  }

  /** 初始化 yuai 默认宪法 */
  initYuai(): void {
    this.create('yuai', YUAI_CONSTITUTION.title, YUAI_CONSTITUTION.principles)
  }
}

// ══════════════════════════════════════════════
// 持久化
// ══════════════════════════════════════════════

const STORAGE_KEY = 'yuai-constitutions'

export function saveConstitutions(manager: ConstitutionManager): void {
  try {
    const all = manager.getAllProjects().map(pid => manager.get(pid)).filter(Boolean)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all))
  } catch { /* ignore */ }
}

export function loadConstitutions(manager: ConstitutionManager): void {
  // 默认加载 yuai 宪法
  manager.initYuai()
}
