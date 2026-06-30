/**
 * 内置 Agent 人格库
 * 232 个专业 Agent，16 个部门
 */

export interface BuiltinAgent {
  id: string
  name: string
  desc: string
  div: string
  color: string
  emoji: string
  vibe: string
}

export interface BuiltinAgentIndex {
  agents: BuiltinAgent[]
  divisions: { id: string; label: string; count: number }[]
  total: number
}

/**
 * 搜索内置 Agent
 */
export function searchBuiltinAgents(
  agents: BuiltinAgent[],
  query: string
): BuiltinAgent[] {
  if (!query.trim()) return agents

  const q = query.toLowerCase()
  const tokens = q.split(/\s+/).filter(Boolean)

  return agents
    .map(agent => {
      let score = 0
      const haystack = `${agent.name} ${agent.desc} ${agent.div} ${agent.vibe}`.toLowerCase()

      if (haystack.includes(q)) score += 10
      for (const token of tokens) {
        if (agent.name.toLowerCase().includes(token)) score += 5
        if (agent.desc.toLowerCase().includes(token)) score += 2
        if (agent.div.toLowerCase().includes(token)) score += 3
        if (agent.vibe.toLowerCase().includes(token)) score += 1
      }

      return { agent, score }
    })
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .map(r => r.agent)
}

/**
 * 加载 Agent 的完整内容
 */
export async function loadAgentContent(agentId: string): Promise<string> {
  try {
    const response = await fetch(`/src/data/agency/${agentId}.md`)
    return await response.text()
  } catch {
    return ''
  }
}
