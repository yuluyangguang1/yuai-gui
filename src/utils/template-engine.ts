/**
 * 提示词模板引擎
 * 支持 {{var}} 和 {{var|default=value}} 语法
 */

export interface TemplateVariable {
  name: string
  hasDefault: boolean
  defaultValue: string
  fullMatch: string
  index: number
}

export interface TemplateContext {
  selection?: string
  clipboard?: string
  current_file?: string
  file_content?: string
  current_date?: string
  user_name?: string
  [key: string]: string | undefined
}

/**
 * 解析模板字符串，提取变量
 */
export function parseTemplate(template: string): TemplateVariable[] {
  const regex = /\{\{(\w+)(?:\|default=([^}]*))?\}\}/g
  const variables: TemplateVariable[] = []
  let match

  while ((match = regex.exec(template)) !== null) {
    variables.push({
      name: match[1],
      hasDefault: match[2] !== undefined,
      defaultValue: match[2] ?? '',
      fullMatch: match[0],
      index: match.index,
    })
  }

  return variables
}

/**
 * 渲染模板，替换变量
 */
export function renderTemplate(template: string, context: TemplateContext): string {
  return template.replace(
    /\{\{(\w+)(?:\|default=([^}]*))?\}\}/g,
    (match, name, defaultValue) => {
      const value = context[name]
      if (value !== undefined && value !== '') return value
      if (defaultValue !== undefined) return defaultValue
      return match // 保留未解析的变量
    }
  )
}

/**
 * 获取未解析的变量
 */
export function getUnresolvedVariables(template: string, context: TemplateContext): TemplateVariable[] {
  const variables = parseTemplate(template)
  return variables.filter(v => {
    const value = context[v.name]
    return (value === undefined || value === '') && !v.hasDefault
  })
}

/**
 * 自动获取上下文变量
 */
export async function getAutoContext(): Promise<TemplateContext> {
  const context: TemplateContext = {
    current_date: new Date().toISOString().split('T')[0],
    current_time: new Date().toLocaleTimeString(),
  }

  // 尝试读取剪贴板
  try {
    context.clipboard = await navigator.clipboard.readText()
  } catch {
    // 剪贴板访问被拒绝
  }

  return context
}
