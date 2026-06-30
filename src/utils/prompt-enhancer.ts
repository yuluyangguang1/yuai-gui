/**
 * 提示词优化建议引擎
 * 分析用户输入，给出优化建议让 agent 更好执行
 */

export interface PromptSuggestion {
  id: string
  type: 'missing-context' | 'vague' | 'too-short' | 'improve' | 'structure'
  icon: string // Tabler icon name
  title: string
  description: string
  fix: string // 修复建议文本
  autoFix?: (input: string) => string // 自动修复函数
}

/**
 * 分析用户输入，返回优化建议
 */
export function analyzePrompt(input: string): PromptSuggestion[] {
  const suggestions: PromptSuggestion[] = []
  const trimmed = input.trim()

  if (trimmed.length === 0) return suggestions

  // 1. 太短的提示词
  if (trimmed.length < 10) {
    suggestions.push({
      id: 'too-short',
      type: 'too-short',
      icon: 'alertTriangle',
      title: '提示词太短',
      description: '详细描述能让 agent 更准确理解你的需求',
      fix: '请添加更多细节：具体做什么、期望结果、约束条件',
    })
  }

  // 2. 缺少具体文件/代码引用
  if (trimmed.length > 20 &&
      !trimmed.includes('/') &&
      !trimmed.includes('.') &&
      !trimmed.includes('```') &&
      !trimmed.includes('@')) {
    suggestions.push({
      id: 'missing-file',
      type: 'missing-context',
      icon: 'file',
      title: '建议指定文件',
      description: '指出相关文件路径，agent 能更精准定位',
      fix: '添加文件路径，如：src/components/xxx.vue',
    })
  }

  // 3. 模糊动词（太笼统）
  const vaguePatterns = [
    { pattern: /^(帮我|帮忙|处理|解决|优化|改进|修复|改一下|弄一下)/, label: '操作太笼统' },
    { pattern: /^(看看|检查|看看有没有|有没有)/, label: '目标不明确' },
  ]
  for (const vp of vaguePatterns) {
    if (vp.pattern.test(trimmed)) {
      suggestions.push({
        id: 'vague-' + vp.label,
        type: 'vague',
        icon: 'target',
        title: vp.label,
        description: '具体描述期望结果，agent 能更高效执行',
        fix: '说明具体目标：修什么 bug、优化哪个指标、改哪个文件',
        autoFix: (s) => s.replace(/^(帮我|帮忙)\s*/, '').replace(/^(处理|解决)\s*/, '修复'),
      })
      break
    }
  }

  // 4. 缺少错误信息（如果是修 bug）
  if (/报错|错误|异常|bug|error|fail|crash|崩/i.test(trimmed) &&
      !trimmed.includes('Error:') &&
      !trimmed.includes('Exception') &&
      !trimmed.includes('```')) {
    suggestions.push({
      id: 'missing-error',
      type: 'missing-context',
      icon: 'bug',
      title: '建议附上错误信息',
      description: '贴上错误日志，agent 能更快定位问题',
      fix: '复制错误信息，用 ``` 包裹',
    })
  }

  // 5. 缺少编程语言/技术栈信息
  if (/写一个|实现|编写|生成.*代码|写.*函数|写.*接口/i.test(trimmed) &&
      !/javascript|typescript|python|rust|java|go|vue|react|html|css|sql|shell|bash/i.test(trimmed)) {
    suggestions.push({
      id: 'missing-lang',
      type: 'missing-context',
      icon: 'code',
      title: '建议指定编程语言',
      description: '明确语言和框架，生成的代码更符合项目',
      fix: '添加：用 TypeScript/Python/Rust 等',
    })
  }

  // 6. 缺少约束条件
  if (trimmed.length > 30 &&
      !/要求|约束|限制|注意|不能|必须|应该|需要/i.test(trimmed)) {
    suggestions.push({
      id: 'missing-constraints',
      type: 'improve',
      icon: 'list',
      title: '可添加约束条件',
      description: '说明限制和要求，结果更符合预期',
      fix: '添加要求：如 类型安全、有注释、向后兼容',
    })
  }

  // 7. 结构化建议（复杂任务）
  if (trimmed.length > 100 && !trimmed.includes('\n')) {
    suggestions.push({
      id: 'structure',
      type: 'structure',
      icon: 'listDetails',
      title: '建议分步骤描述',
      description: '复杂任务拆分为步骤，agent 执行更有条理',
      fix: '用 1. 2. 3. 分步骤描述',
      autoFix: (s) => s + '\n\n请按步骤执行。',
    })
  }

  return suggestions
}

/**
 * 自动优化提示词（应用所有有 autoFix 的建议）
 */
export function autoEnhancePrompt(input: string): string {
  let enhanced = input
  const suggestions = analyzePrompt(input)
  for (const s of suggestions) {
    if (s.autoFix) {
      enhanced = s.autoFix(enhanced)
    }
  }
  return enhanced
}

/**
 * 生成优化后的提示词模板
 */
export function generateEnhancedPrompt(input: string, context?: {
  currentFile?: string
  selectedText?: string
  recentErrors?: string
}): string {
  let enhanced = input.trim()

  // 如果输入太短，添加模板
  if (enhanced.length < 10) {
    enhanced = `请帮我完成以下任务：\n\n${enhanced}\n\n要求：\n- \n- `
  }

  // 如果有当前文件上下文，自动添加
  if (context?.currentFile && !enhanced.includes('/')) {
    enhanced += `\n\n相关文件：${context.currentFile}`
  }

  // 如果有选中文本，自动添加
  if (context?.selectedText && !enhanced.includes('```')) {
    enhanced += `\n\n\`\`\`\n${context.selectedText}\n\`\`\``
  }

  return enhanced
}
