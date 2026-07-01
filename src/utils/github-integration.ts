/**
 * GitHub 集成系统
 * 参考 Orca 的 GitHub Integration
 * 从任务直接创建 worktree，Agent 完成后自动创建 PR
 */

export interface GitHubConfig {
  token?: string
  owner: string
  repo: string
  baseUrl?: string
}

export interface GitHubIssue {
  id: number
  number: number
  title: string
  body: string
  state: 'open' | 'closed'
  labels: string[]
  assignees: string[]
  createdAt: string
  updatedAt: string
}

export interface GitHubPullRequest {
  id: number
  number: number
  title: string
  body: string
  state: 'open' | 'closed' | 'merged'
  head: string
  base: string
  createdAt: string
  updatedAt: string
}

export interface GitHubBranch {
  name: string
  sha: string
  protected: boolean
}

/**
 * GitHub 集成管理器
 * 管理 GitHub 仓库操作
 */
export class GitHubIntegrationManager {
  private config: GitHubConfig
  private baseUrl: string

  constructor(config: GitHubConfig) {
    this.config = config
    this.baseUrl = config.baseUrl || 'https://api.github.com'
  }

  /** 获取 Issues */
  async getIssues(state: 'open' | 'closed' | 'all' = 'open'): Promise<GitHubIssue[]> {
    try {
      const response = await this.request(`/repos/${this.config.owner}/${this.config.repo}/issues?state=${state}`)
      return await response.json()
    } catch (error) {
      console.error('[GitHub] Failed to get issues:', error)
      return []
    }
  }

  /** 获取单个 Issue */
  async getIssue(issueNumber: number): Promise<GitHubIssue | null> {
    try {
      const response = await this.request(`/repos/${this.config.owner}/${this.config.repo}/issues/${issueNumber}`)
      return await response.json()
    } catch (error) {
      console.error('[GitHub] Failed to get issue:', error)
      return null
    }
  }

  /** 创建 Issue */
  async createIssue(title: string, body: string, labels?: string[]): Promise<GitHubIssue | null> {
    try {
      const response = await this.request(`/repos/${this.config.owner}/${this.config.repo}/issues`, {
        method: 'POST',
        body: JSON.stringify({ title, body, labels }),
      })
      return await response.json()
    } catch (error) {
      console.error('[GitHub] Failed to create issue:', error)
      return null
    }
  }

  /** 获取 Pull Requests */
  async getPullRequests(state: 'open' | 'closed' | 'all' = 'open'): Promise<GitHubPullRequest[]> {
    try {
      const response = await this.request(`/repos/${this.config.owner}/${this.config.repo}/pulls?state=${state}`)
      return await response.json()
    } catch (error) {
      console.error('[GitHub] Failed to get pull requests:', error)
      return []
    }
  }

  /** 创建 Pull Request */
  async createPullRequest(title: string, body: string, head: string, base: string): Promise<GitHubPullRequest | null> {
    try {
      const response = await this.request(`/repos/${this.config.owner}/${this.config.repo}/pulls`, {
        method: 'POST',
        body: JSON.stringify({ title, body, head, base }),
      })
      return await response.json()
    } catch (error) {
      console.error('[GitHub] Failed to create pull request:', error)
      return null
    }
  }

  /** 获取分支 */
  async getBranches(): Promise<GitHubBranch[]> {
    try {
      const response = await this.request(`/repos/${this.config.owner}/${this.config.repo}/branches`)
      return await response.json()
    } catch (error) {
      console.error('[GitHub] Failed to get branches:', error)
      return []
    }
  }

  /** 创建分支 */
  async createBranch(name: string, sha: string): Promise<boolean> {
    try {
      await this.request(`/repos/${this.config.owner}/${this.config.repo}/git/refs`, {
        method: 'POST',
        body: JSON.stringify({
          ref: `refs/heads/${name}`,
          sha,
        }),
      })
      return true
    } catch (error) {
      console.error('[GitHub] Failed to create branch:', error)
      return false
    }
  }

  /** 发送请求 */
  private async request(path: string, options: RequestInit = {}): Promise<Response> {
    const url = `${this.baseUrl}${path}`
    const headers: Record<string, string> = {
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    }

    if (this.config.token) {
      headers['Authorization'] = `Bearer ${this.config.token}`
    }

    const response = await fetch(url, {
      ...options,
      headers: { ...headers, ...options.headers },
    })

    if (!response.ok) {
      const errorBody = await response.text().catch(() => '')
      throw new Error(`GitHub API ${response.status}: ${errorBody}`)
    }

    return response
  }

  /** 检查连接 */
  async testConnection(): Promise<boolean> {
    try {
      const response = await this.request(`/repos/${this.config.owner}/${this.config.repo}`)
      return response.ok
    } catch {
      return false
    }
  }
}

// 全局 GitHub 集成管理器实例
export const globalGitHubIntegrationManager = new GitHubIntegrationManager({
  owner: '',
  repo: '',
})
