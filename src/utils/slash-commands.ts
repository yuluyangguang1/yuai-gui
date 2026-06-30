/**
 * 内置 Slash Commands
 * 参考 Continue、Cursor、Open WebUI 的设计
 */

export interface SlashCommand {
  id: string
  name: string
  description: string
  icon: string // Tabler icon name
  category: 'code' | 'writing' | 'analysis' | 'tool'
  template: string
  variables?: VariableDef[]
  shortcut?: string
}

export interface VariableDef {
  name: string
  type: 'text' | 'file' | 'selection' | 'clipboard' | 'date' | 'input'
  description: string
  required: boolean
  default?: string
}

export const BUILT_IN_COMMANDS: SlashCommand[] = [
  // ── 代码类 ──
  {
    id: 'explain',
    name: 'explain',
    description: '解释代码或文本',
    icon: 'infoCircle',
    category: 'code',
    template: '请详细解释以下内容：\n\n{{selection}}',
    variables: [{ name: 'selection', type: 'selection', required: true, description: '选中的文本' }],
  },
  {
    id: 'improve',
    name: 'improve',
    description: '改进建议',
    icon: 'arrowUp',
    category: 'code',
    template: '请对以下内容提出改进建议：\n\n{{selection}}\n\n重点关注：{{focus|default=代码质量、可读性、性能}}',
    variables: [
      { name: 'selection', type: 'selection', required: true, description: '选中的文本' },
      { name: 'focus', type: 'input', required: false, default: '代码质量、可读性、性能', description: '改进重点' },
    ],
  },
  {
    id: 'fix',
    name: 'fix',
    description: '修复错误',
    icon: 'bug',
    category: 'code',
    template: '请修复以下代码中的错误：\n\n{{selection}}\n\n错误信息：{{error|default=无}}',
    variables: [
      { name: 'selection', type: 'selection', required: true, description: '选中的代码' },
      { name: 'error', type: 'input', required: false, default: '无', description: '错误信息' },
    ],
  },
  {
    id: 'test',
    name: 'test',
    description: '生成测试',
    icon: 'check',
    category: 'code',
    template: '请为以下代码生成单元测试：\n\n{{selection}}\n\n测试框架：{{framework|default=当前项目使用的框架}}',
    variables: [
      { name: 'selection', type: 'selection', required: true, description: '选中的代码' },
      { name: 'framework', type: 'input', required: false, default: '当前项目使用的框架', description: '测试框架' },
    ],
  },
  {
    id: 'refactor',
    name: 'refactor',
    description: '重构代码',
    icon: 'refresh',
    category: 'code',
    template: '请重构以下代码，提高可读性和可维护性：\n\n{{selection}}\n\n重构方向：{{direction|default=提取函数、简化逻辑、命名优化}}',
    variables: [
      { name: 'selection', type: 'selection', required: true, description: '选中的代码' },
      { name: 'direction', type: 'input', required: false, default: '提取函数、简化逻辑、命名优化', description: '重构方向' },
    ],
  },

  // ── 写作类 ──
  {
    id: 'translate',
    name: 'translate',
    description: '翻译文本',
    icon: 'language',
    category: 'writing',
    template: '请将以下内容翻译为 {{target_lang|default=中文}}：\n\n{{selection}}',
    variables: [
      { name: 'selection', type: 'selection', required: true, description: '待翻译文本' },
      { name: 'target_lang', type: 'input', required: false, default: '中文', description: '目标语言' },
    ],
  },
  {
    id: 'summarize',
    name: 'summarize',
    description: '总结内容',
    icon: 'fileText',
    category: 'writing',
    template: '请用 {{format|default=要点列表}} 的方式总结以下内容：\n\n{{content}}',
    variables: [
      { name: 'content', type: 'selection', required: true, description: '待总结内容' },
      { name: 'format', type: 'input', required: false, default: '要点列表', description: '输出格式' },
    ],
  },
  {
    id: 'polish',
    name: 'polish',
    description: '润色文字',
    icon: 'sparkles',
    category: 'writing',
    template: '请润色以下文字，使其更流畅自然：\n\n{{selection}}\n\n风格要求：{{style|default=正式、简洁}}',
    variables: [
      { name: 'selection', type: 'selection', required: true, description: '待润色文字' },
      { name: 'style', type: 'input', required: false, default: '正式、简洁', description: '风格要求' },
    ],
  },

  // ── 分析类 ──
  {
    id: 'review',
    name: 'review',
    description: '代码审查',
    icon: 'eye',
    category: 'analysis',
    template: '请审查以下代码，指出潜在问题：\n\n{{selection}}\n\n审查重点：{{focus|default=安全性、性能、可维护性}}',
    variables: [
      { name: 'selection', type: 'selection', required: true, description: '待审查代码' },
      { name: 'focus', type: 'input', required: false, default: '安全性、性能、可维护性', description: '审查重点' },
    ],
  },
  {
    id: 'compare',
    name: 'compare',
    description: '对比分析',
    icon: 'arrowsLeftRight',
    category: 'analysis',
    template: '请对比分析以下内容的异同：\n\n{{content_a}}\n\nVS\n\n{{content_b}}',
    variables: [
      { name: 'content_a', type: 'input', required: true, description: '内容 A' },
      { name: 'content_b', type: 'input', required: true, description: '内容 B' },
    ],
  },

  // ── 工具类 ──
  {
    id: 'code',
    name: 'code',
    description: '生成代码',
    icon: 'code',
    category: 'tool',
    template: '请用 {{lang|default=TypeScript}} 编写以下功能：\n\n{{description}}\n\n要求：{{requirements|default=类型安全、有注释}}',
    variables: [
      { name: 'description', type: 'input', required: true, description: '功能描述' },
      { name: 'lang', type: 'input', required: false, default: 'TypeScript', description: '编程语言' },
      { name: 'requirements', type: 'input', required: false, default: '类型安全、有注释', description: '额外要求' },
    ],
  },
  {
    id: 'shell',
    name: 'shell',
    description: '生成 Shell 命令',
    icon: 'terminal',
    category: 'tool',
    template: '请生成完成以下任务的 Shell 命令：\n\n{{task}}\n\n操作系统：{{os|default=macOS}}',
    variables: [
      { name: 'task', type: 'input', required: true, description: '任务描述' },
      { name: 'os', type: 'input', required: false, default: 'macOS', description: '操作系统' },
    ],
  },
  {
    id: 'doc',
    name: 'doc',
    description: '生成文档',
    icon: 'book',
    category: 'tool',
    template: '请为以下代码生成文档：\n\n{{selection}}\n\n文档格式：{{format|default=JSDoc}}',
    variables: [
      { name: 'selection', type: 'selection', required: true, description: '选中的代码' },
      { name: 'format', type: 'input', required: false, default: 'JSDoc', description: '文档格式' },
    ],
  },
]
