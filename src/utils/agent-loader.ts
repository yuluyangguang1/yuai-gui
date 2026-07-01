1|/**
2| * 懒加载路由
3| * 参考 agency-agents 的搜索模式
4| * 不预加载全部 Agent，按需搜索/加载
5| */
6|
7|export interface LoadableAgent {
8|  id: string
9|  name: string
10|  description: string
11|  division: string
12|  score?: number
13|}
14|
15|export interface AgentLoader {
16|  search(query: string): Promise<LoadableAgent[]>
17|  load(agentId: string): Promise<string>
18|  getDivisions(): Promise<{ id: string; label: string; count: number }[]>
19|}
20|
21|/**
22| * 本地 Agent 加载器
23| * 从 public/agency/ 目录加载
24| */
25|export class LocalAgentLoader implements AgentLoader {
26|  private indexCache: { agents: LoadableAgent[]; divisions: { id: string; label: string; count: number }[] } | null = null
27|
28|  async search(query: string): Promise<LoadableAgent[]> {
29|    const index = await this.getIndex()
30|    if (!query.trim()) return index.agents
31|
32|    const q = query.toLowerCase()
33|    const tokens = q.split(/\s+/).filter(Boolean)
34|
35|    return index.agents
36|      .map(agent => {
37|        let score = 0
38|        const haystack = `${agent.name} ${agent.description} ${agent.division}`.toLowerCase()
39|
40|        if (haystack.includes(q)) score += 10
41|        for (const token of tokens) {
42|          if (agent.name.toLowerCase().includes(token)) score += 5
43|          if (agent.description.toLowerCase().includes(token)) score += 2
44|          if (agent.division.toLowerCase().includes(token)) score += 3
45|        }
46|
47|        return { ...agent, score }
48|      })
49|      .filter(r => (r.score ?? 0) > 0)
50|      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
51|  }
52|
53|  async load(agentId: string): Promise<string> {
54|    const response = await fetch(`/agency/${agentId}.md`)
55|    return await response.text()
56|  }
57|
58|  async getDivisions(): Promise<{ id: string; label: string; count: number }[]> {
59|    const index = await this.getIndex()
60|    return index.divisions
61|  }
62|
63|  private async getIndex() {
64|    if (this.indexCache) return this.indexCache
65|
66|    const response = await fetch('/agency/index.json')
67|    this.indexCache = await response.json()
68|    return this.indexCache!
69|  }
70|}
71|
72|/**
73| * 远程 Agent 加载器（预留）
74| * 从远程 API 加载
75| */
76|export class RemoteAgentLoader implements AgentLoader {
77|  private baseUrl: string
78|
79|  constructor(baseUrl: string) {
80|    this.baseUrl = baseUrl
81|  }
82|
83|  async search(query: string): Promise<LoadableAgent[]> {
84|    const response = await fetch(`${this.baseUrl}/api/agents/search?q=${encodeURIComponent(query)}`)
85|    return await response.json()
86|  }
87|
88|  async load(agentId: string): Promise<string> {
89|    const response = await fetch(`${this.baseUrl}/api/agents/${agentId}`)
90|    const data = await response.json()
91|    return data.content
92|  }
93|
94|  async getDivisions(): Promise<{ id: string; label: string; count: number }[]> {
95|    const response = await fetch(`${this.baseUrl}/api/divisions`)
96|    return await response.json()
97|  }
98|}
99|
100|// 全局加载器实例
101|export const globalAgentLoader: AgentLoader = new LocalAgentLoader()
102|