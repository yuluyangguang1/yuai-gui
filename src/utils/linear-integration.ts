/**
 * Linear 集成系统
 * 参考 Orca 的 Linear Integration
 * 从任务直接创建 worktree，Agent 完成后自动更新状态
 */

export interface LinearConfig {
  token?: string
  teamId: string
}

export interface LinearIssue {
  id: string
  identifier: string
  title: string
  description: string
  state: 'backlog' | 'todo' | 'in_progress' | 'done' | 'cancelled'
  priority: 'none' | 'urgent' | 'high' | 'medium' | 'low'
  assignees: string[]
  labels: string[]
  createdAt: string
  updatedAt: string
}

export interface LinearProject {
  id: string
  name: string
  description: string
  state: 'planned' | 'started' | 'completed' | 'canceled'
  issues: LinearIssue[]
}

/**
 * Linear 集成管理器
 * 管理 Linear 项目和任务
 */
export class LinearIntegrationManager {
  private config: LinearConfig
  private baseUrl = 'https://api.linear.app/graphql'

  constructor(config: LinearConfig) {
    this.config = config
  }

  /** 获取 Issues */
  async getIssues(state?: string): Promise<LinearIssue[]> {
    try {
      const query = `
        query Issues($teamId: String!, $state: String) {
          issues(filter: { team: { id: { eq: $teamId } }, state: { name: { eq: $state } } }) {
            nodes {
              id
              identifier
              title
              description
              state { name }
              priority
              assignees { nodes { name } }
              labels { nodes { name } }
              createdAt
              updatedAt
            }
          }
        }
      `

      const response = await this.request(query, { teamId: this.config.teamId, state })
      const data = await response.json()
      return data.data.issues.nodes.map(this.mapIssue)
    } catch (error) {
      console.error('[Linear] Failed to get issues:', error)
      return []
    }
  }

  /** 获取单个 Issue */
  async getIssue(issueId: string): Promise<LinearIssue | null> {
    try {
      const query = `
        query Issue($id: String!) {
          issue(id: $id) {
            id
            identifier
            title
            description
            state { name }
            priority
            assignees { nodes { name } }
            labels { nodes { name } }
            createdAt
            updatedAt
          }
        }
      `

      const response = await this.request(query, { id: issueId })
      const data = await response.json()
      return this.mapIssue(data.data.issue)
    } catch (error) {
      console.error('[Linear] Failed to get issue:', error)
      return null
    }
  }

  /** 更新 Issue 状态 */
  async updateIssueState(issueId: string, state: string): Promise<boolean> {
    try {
      const mutation = `
        mutation UpdateIssue($id: String!, $state: String!) {
          issueUpdate(id: $id, input: { state: $state }) {
            success
          }
        }
      `

      const response = await this.request(mutation, { id: issueId, state })
      const data = await response.json()
      return data.data.issueUpdate.success
    } catch (error) {
      console.error('[Linear] Failed to update issue:', error)
      return false
    }
  }

  /** 创建 Issue */
  async createIssue(title: string, description?: string, priority?: string): Promise<LinearIssue | null> {
    try {
      const mutation = `
        mutation CreateIssue($teamId: String!, $title: String!, $description: String, $priority: String) {
          issueCreate(input: { teamId: $teamId, title: $title, description: $description, priority: $priority }) {
            issue {
              id
              identifier
              title
              description
              state { name }
              priority
            }
          }
        }
      `

      const response = await this.request(mutation, {
        teamId: this.config.teamId,
        title,
        description,
        priority,
      })
      const data = await response.json()
      return this.mapIssue(data.data.issueCreate.issue)
    } catch (error) {
      console.error('[Linear] Failed to create issue:', error)
      return null
    }
  }

  /** 获取项目 */
  async getProjects(): Promise<LinearProject[]> {
    try {
      const query = `
        query Projects($teamId: String!) {
          projects(filter: { team: { id: { eq: $teamId } } }) {
            nodes {
              id
              name
              description
              state
              issues {
                nodes {
                  id
                  identifier
                  title
                  state { name }
                }
              }
            }
          }
        }
      `

      const response = await this.request(query, { teamId: this.config.teamId })
      const data = await response.json()
      return data.data.projects.nodes.map(this.mapProject)
    } catch (error) {
      console.error('[Linear] Failed to get projects:', error)
      return []
    }
  }

  /** 发送 GraphQL 请求 */
  private async request(query: string, variables: Record<string, unknown>): Promise<Response> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }

    if (this.config.token) {
      headers['Authorization'] = `Bearer ${this.config.token}`
    }

    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ query, variables }),
    })

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '')
      throw new Error(`Linear API ${response.status}: ${errorBody}`)
    }

    return response
  }

  /** 映射 Issue */
  private mapIssue(raw: Record<string, unknown>): LinearIssue {
    return {
      id: raw.id,
      identifier: raw.identifier,
      title: raw.title,
      description: raw.description || '',
      state: raw.state?.name?.toLowerCase() || 'backlog',
      priority: raw.priority?.toLowerCase() || 'none',
      assignees: raw.assignees?.nodes?.map((a: Record<string, unknown>) => a.name as string) || [],
      labels: raw.labels?.nodes?.map((l: Record<string, unknown>) => l.name as string) || [],
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    }
  }

  /** 映射 Project */
  private mapProject(raw: Record<string, unknown>): LinearProject {
    return {
      id: raw.id,
      name: raw.name,
      description: raw.description || '',
      state: raw.state?.toLowerCase() || 'planned',
      issues: raw.issues?.nodes?.map(this.mapIssue) || [],
    }
  }

  /** 检查连接 */
  async testConnection(): Promise<boolean> {
    try {
      const query = '{ viewer { id } }'
      const response = await this.request(query, {})
      return response.ok
    } catch {
      return false
    }
  }
}

// 全局 Linear 集成管理器实例
export const globalLinearIntegrationManager = new LinearIntegrationManager({
  teamId: '',
})
