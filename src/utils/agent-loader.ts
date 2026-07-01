/**
 * 懒加载路由
 * 参考 agency-agents 的搜索模式
 * 不预加载全部 Agent，按需搜索/加载
 */

export interface LoadableAgent {
  id: string
  name: string
  description: string
  division: string
  score?: number
}

export interface AgentLoader {
  search(query: string): Promise<LoadableAgent[]>
  load(agentId: string): Promise<string>
  getDivisions(): Promise<{ id: string; label: string; count: number }[]>
}

/**
 * 本地 Agent 加载器
 * 从 public/agency/ 目录加载
 */
export class LocalAgentLoader implements AgentLoader {
  private indexCache: { agents: LoadableAgent[]; divisions: { id: string; label: string; count: number }[] } | null = null

  async search(query: string): Promise<LoadableAgent[]> {
    const index = await this.getIndex()
    if (!query.trim()) return index.agents

    const q = query.toLowerCase()
    const tokens = q.split(/\s+/).filter(Boolean)

    return index.agents
      .map(agent => {
        let score = 0
        const haystack = `${agent.name} ${agent.description} ${agent.division}`.toLowerCase()

        if (haystack.includes(q)) score += 10
        for (const token of tokens) {
          if (agent.name.toLowerCase().includes(token)) score += 5
          if (agent.description.toLowerCase().includes(token)) score += 2
          if (agent.division.toLowerCase().includes(token)) score += 3
        }

        return { ...agent, score }
      })
      .filter(r => (r.score ?? 0) > 0)
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
  }

  async load(agentId: string): Promise<string> {
    const response = await fetch(`/agency/${agentId}.md`)
    return await response.text()
  }

  async getDivisions(): Promise<{ id: string; label: string; count: number }[]> {
    const index = await this.getIndex()
    return index.divisions
  }

  private async getIndex() {
    if (this.indexCache) return this.indexCache

    const response = await fetch('/agency/index.json')
    this.indexCache = await response.json()
    return this.indexCache!
  }
}

/**
 * 远程 Agent 加载器（预留）
 * 从远程 API 加载
 */
export class RemoteAgentLoader implements AgentLoader {
  private baseUrl: string

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl
  }

  async search(query: string): Promise<LoadableAgent[]> {
    const response = await fetch(`${this.baseUrl}/api/agents/search?q=${encodeURIComponent(query)}`)
    return await response.json()
  }

  async load(agentId: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/api/agents/${agentId}`)
    const data = await response.json()
    return data.content
  }

  async getDivisions(): Promise<{ id: string; label: string; count: number }[]> {
    const response = await fetch(`${this.baseUrl}/api/divisions`)
    return await response.json()
  }
}

// 全局加载器实例
export const globalAgentLoader: AgentLoader = new LocalAgentLoader()
