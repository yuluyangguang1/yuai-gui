/**
 * Agent 原创性检查系统
 * 参考 agency-agents 的 Agent Originality Check
 * 检查 Agent 定义是否重复或过于相似
 */

export interface AgentDefinition {
  id: string
  name: string
  description: string
  content: string
  division: string
}

export interface OriginalityCheckResult {
  isOriginal: boolean
  similarityScore: number
  similarAgents: Array<{
    id: string
    name: string
    similarity: number
    matchType: 'exact' | 'high' | 'medium' | 'low'
  }>
  suggestions: string[]
}

/**
 * Agent 原创性检查管理器
 * 检查 Agent 定义是否重复或过于相似
 */
export class AgentOriginalityChecker {
  private existingAgents: Map<string, AgentDefinition> = new Map()

  /** 注册现有 Agent */
  registerAgent(agent: AgentDefinition): void {
    this.existingAgents.set(agent.id, agent)
  }

  /** 批量注册 */
  registerAgents(agents: AgentDefinition[]): void {
    for (const agent of agents) {
      this.registerAgent(agent)
    }
  }

  /** 检查原创性 */
  checkOriginality(newAgent: AgentDefinition): OriginalityCheckResult {
    const similarAgents: OriginalityCheckResult['similarAgents'] = []
    let maxSimilarity = 0

    for (const [id, existing] of this.existingAgents) {
      if (id === newAgent.id) continue

      const similarity = this.calculateSimilarity(newAgent, existing)
      maxSimilarity = Math.max(maxSimilarity, similarity)

      if (similarity > 0.3) {
        let matchType: 'exact' | 'high' | 'medium' | 'low'
        if (similarity > 0.9) matchType = 'exact'
        else if (similarity > 0.7) matchType = 'high'
        else if (similarity > 0.5) matchType = 'medium'
        else matchType = 'low'

        similarAgents.push({
          id: existing.id,
          name: existing.name,
          similarity,
          matchType,
        })
      }
    }

    // 按相似度排序
    similarAgents.sort((a, b) => b.similarity - a.similarity)

    // 生成建议
    const suggestions = this.generateSuggestions(newAgent, similarAgents)

    return {
      isOriginal: maxSimilarity < 0.7,
      similarityScore: maxSimilarity,
      similarAgents: similarAgents.slice(0, 5), // 只返回前5个
      suggestions,
    }
  }

  /** 计算相似度 */
  private calculateSimilarity(agent1: AgentDefinition, agent2: AgentDefinition): number {
    // 名称相似度
    const nameSimilarity = this.textSimilarity(agent1.name, agent2.name)

    // 描述相似度
    const descSimilarity = this.textSimilarity(agent1.description, agent2.description)

    // 内容相似度
    const contentSimilarity = this.textSimilarity(agent1.content.slice(0, 500), agent2.content.slice(0, 500))

    // 加权平均
    return nameSimilarity * 0.3 + descSimilarity * 0.3 + contentSimilarity * 0.4
  }

  /** 文本相似度（简化的 Jaccard 相似度） */
  private textSimilarity(text1: string, text2: string): number {
    const tokens1 = this.tokenize(text1)
    const tokens2 = this.tokenize(text2)

    if (tokens1.size === 0 || tokens2.size === 0) return 0

    const intersection = new Set([...tokens1].filter(x => tokens2.has(x)))
    const union = new Set([...tokens1, ...tokens2])

    return intersection.size / union.size
  }

  /** 分词 */
  private tokenize(text: string): Set<string> {
    // 简单的分词：按空格和标点分割，转小写
    const tokens = text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(t => t.length > 1)

    return new Set(tokens)
  }

  /** 生成建议 */
  private generateSuggestions(agent: AgentDefinition, similar: OriginalityCheckResult['similarAgents']): string[] {
    const suggestions: string[] = []

    if (similar.length > 0) {
      const mostSimilar = similar[0]
      if (mostSimilar.similarity > 0.9) {
        suggestions.push(`与 "${mostSimilar.name}" 高度相似，考虑合并或差异化`)
      } else if (mostSimilar.similarity > 0.7) {
        suggestions.push(`与 "${mostSimilar.name}" 有较多重叠，建议明确差异化定位`)
      }
    }

    if (agent.description.length < 50) {
      suggestions.push('描述太短，建议补充更多细节')
    }

    if (agent.content.length < 200) {
      suggestions.push('内容太短，建议补充更多专业知识')
    }

    return suggestions
  }

  /** 获取统计信息 */
  getStats(): { total: number; byDivision: Record<string, number> } {
    const byDivision: Record<string, number> = {}

    for (const agent of this.existingAgents.values()) {
      byDivision[agent.division] = (byDivision[agent.division] || 0) + 1
    }

    return {
      total: this.existingAgents.size,
      byDivision,
    }
  }

  /** 清空 */
  clear(): void {
    this.existingAgents.clear()
  }
}

// 全局 Agent 原创性检查管理器实例
export const globalAgentOriginalityChecker = new AgentOriginalityChecker()
