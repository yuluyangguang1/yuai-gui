/**
 * Agent 人格模板系统
 * 参考 agency-agents 的 YAML frontmatter + Markdown body 格式
 * 支持自定义 Agent 人格定义
 */

export interface AgentTemplate {
  // 元数据 (YAML frontmatter)
  name: string
  description: string
  color: string
  emoji: string
  vibe: string
  division?: string
  services?: { name: string; url: string; tier: string }[]

  // 人格内容 (Markdown body)
  identity: {
    role: string
    personality: string
    memory: string
    experience: string
  }
  mission: string[] // 核心使命列表
  rules: string[] // 关键规则
  deliverables: string[] // 技术交付物
  workflow: string[] // 工作流程
  communication: {
    style: string
    examples: string[]
  }
  metrics: string[] // 成功指标
}

/**
 * 从 YAML frontmatter + Markdown body 解析 Agent 模板
 */
export function parseAgentTemplate(content: string): AgentTemplate | null {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/)
  if (!frontmatterMatch) return null

  const frontmatter = parseYaml(frontmatterMatch[1])
  const body = content.slice(frontmatterMatch[0].length).trim()

  return {
    name: frontmatter.name || 'Unknown',
    description: frontmatter.description || '',
    color: frontmatter.color || 'gray',
    emoji: frontmatter.emoji || '🤖',
    vibe: frontmatter.vibe || '',
    division: frontmatter.division,
    services: frontmatter.services,
    identity: parseIdentity(body),
    mission: parseSection(body, '🎯 Your Core Mission'),
    rules: parseSection(body, '🚨 Critical Rules'),
    deliverables: parseSection(body, '📋 Your Technical Deliverables'),
    workflow: parseSection(body, '🔄 Your Workflow Process'),
    communication: parseCommunication(body),
    metrics: parseSection(body, '🎯 Your Success Metrics'),
  }
}

/**
 * 简单的 YAML 解析（只支持 key: value 格式）
 */
function parseYaml(yaml: string): Record<string, any> {
  const result: Record<string, any> = {}
  for (const line of yaml.split('\n')) {
    const colonIndex = line.indexOf(':')
    if (colonIndex === -1) continue
    const key = line.slice(0, colonIndex).trim()
    const value = line.slice(colonIndex + 1).trim()
    result[key] = value
  }
  return result
}

/**
 * 解析 Identity 部分
 */
function parseIdentity(body: string): AgentTemplate['identity'] {
  const identitySection = parseSection(body, '🧠 Your Identity & Memory')
  return {
    role: extractField(identitySection, 'Role'),
    personality: extractField(identitySection, 'Personality'),
    memory: extractField(identitySection, 'Memory'),
    experience: extractField(identitySection, 'Experience'),
  }
}

/**
 * 解析 Communication 部分
 */
function parseCommunication(body: string): AgentTemplate['communication'] {
  const commSection = parseSection(body, '💭 Your Communication Style')
  return {
    style: commSection[0] || '',
    examples: commSection.filter(line => line.startsWith('- ')).map(line => line.slice(2)),
  }
}

/**
 * 解析章节内容
 */
function parseSection(body: string, sectionTitle: string): string[] {
  const lines = body.split('\n')
  const result: string[] = []
  let inSection = false

  for (const line of lines) {
    if (line.includes(sectionTitle)) {
      inSection = true
      continue
    }
    if (inSection && line.startsWith('## ')) {
      break // 新章节开始
    }
    if (inSection && line.trim()) {
      result.push(line.trim())
    }
  }

  return result
}

/**
 * 从章节中提取字段值
 */
function extractField(section: string[], fieldName: string): string {
  for (const line of section) {
    if (line.includes(fieldName + ':')) {
      return line.split(':').slice(1).join(':').trim() || ''
    }
  }
  return ''
}

/**
 * 生成 Agent 的 system prompt
 */
export function generateAgentPrompt(template: AgentTemplate, userInput: string): string {
  return `你是 ${template.name}，${template.description}

## 你的身份
- 角色: ${template.identity.role}
- 性格: ${template.identity.personality}
- 记忆: ${template.identity.memory}
- 经验: ${template.identity.experience}

## 你的核心使命
${template.mission.map(m => '- ' + m).join('\n')}

## 关键规则
${template.rules.map(r => '- ' + r).join('\n')}

## 工作流程
${template.workflow.map((w, i) => (i + 1) + '. ' + w).join('\n')}

## 沟通风格
${template.communication.style}

---

用户请求: ${userInput}`
}
