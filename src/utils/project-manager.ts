/**
 * Multi-Project Workspace — 参考 Nezha 多项目工作区
 * 左侧项目栏, 快速切换, 每项目独立配置
 */

// ══════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════

export interface Project {
  id: string
  name: string
  path: string
  icon: string | null        // 自定义图标 (emoji 或 Tabler icon 名)
  color: string | null       // 自定义颜色
  last_opened_at: number
  hidden_from_rail: boolean  // 是否从侧栏隐藏
  pinned: boolean            // 是否置顶
  tags: string[]
  /** 每项目独立配置 (参考 Nezha .nezha/config.toml) */
  config: ProjectConfig
}

export interface ProjectConfig {
  default_agent: string | null     // 默认 Agent
  default_permission: string       // 默认权限模式
  prompt_prefix: string            // 提示词前缀
  commit_prompt: string            // Git commit 提示词
  auto_worktree: boolean           // 自动 worktree 隔离
}

export const DEFAULT_PROJECT_CONFIG: ProjectConfig = {
  default_agent: null,
  default_permission: 'ask',
  prompt_prefix: '',
  commit_prompt: '',
  auto_worktree: false,
}

// ══════════════════════════════════════════════
// Project Manager
// ══════════════════════════════════════════════

export class ProjectManager {
  private projects = new Map<string, Project>()
  private activeProjectId: string | null = null
  private mountedProjectIds = new Set<string>() // 已挂载 UI 的项目

  /** 添加项目 */
  add(path: string, name?: string): Project {
    // 检查是否已存在
    const existing = Array.from(this.projects.values()).find(p => p.path === path)
    if (existing) return existing

    const project: Project = {
      id: crypto.randomUUID(),
      name: name ?? path.split('/').pop() ?? path,
      path,
      icon: null,
      color: null,
      last_opened_at: Date.now(),
      hidden_from_rail: false,
      pinned: false,
      tags: [],
      config: { ...DEFAULT_PROJECT_CONFIG },
    }
    this.projects.set(project.id, project)
    return project
  }

  /** 移除项目 */
  remove(projectId: string): void {
    this.projects.delete(projectId)
    this.mountedProjectIds.delete(projectId)
    if (this.activeProjectId === projectId) {
      const remaining = Array.from(this.projects.keys())
      this.activeProjectId = remaining[0] ?? null
    }
  }

  /** 切换项目 */
  switchTo(projectId: string): void {
    if (!this.projects.has(projectId)) return
    this.activeProjectId = projectId
    const project = this.projects.get(projectId)!
    project.last_opened_at = Date.now()
    this.mountedProjectIds.add(projectId)
  }

  /** 获取活跃项目 */
  getActive(): Project | null {
    return this.activeProjectId ? this.projects.get(this.activeProjectId) ?? null : null
  }

  /** 获取所有项目 (按最近打开排序) */
  getAll(): Project[] {
    return Array.from(this.projects.values())
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
        return b.last_opened_at - a.last_opened_at
      })
  }

  /** 获取侧栏显示的项目 */
  getRailProjects(): Project[] {
    return this.getAll().filter(p => !p.hidden_from_rail)
  }

  /** 置顶/取消置顶 */
  togglePin(projectId: string): void {
    const project = this.projects.get(projectId)
    if (project) project.pinned = !project.pinned
  }

  /** 隐藏/显示 */
  toggleHidden(projectId: string): void {
    const project = this.projects.get(projectId)
    if (project) project.hidden_from_rail = !project.hidden_from_rail
  }

  /** 更新项目配置 */
  updateConfig(projectId: string, config: Partial<ProjectConfig>): void {
    const project = this.projects.get(projectId)
    if (project) {
      project.config = { ...project.config, ...config }
    }
  }

  /** 更新项目信息 */
  update(projectId: string, updates: Partial<Pick<Project, 'name' | 'icon' | 'color' | 'tags'>>): void {
    const project = this.projects.get(projectId)
    if (project) {
      Object.assign(project, updates)
    }
  }

  /** 是否已挂载 */
  isMounted(projectId: string): boolean {
    return this.mountedProjectIds.has(projectId)
  }

  /** 获取项目数 */
  get count(): number {
    return this.projects.size
  }
}

// ══════════════════════════════════════════════
// 持久化
// ══════════════════════════════════════════════

const STORAGE_KEY = 'yuai-projects'
const ACTIVE_KEY = 'yuai-active-project'

export function saveProjects(manager: ProjectManager): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(manager.getAll()))
    const active = manager.getActive()
    if (active) localStorage.setItem(ACTIVE_KEY, active.id)
  } catch { /* ignore */ }
}

export function loadProjects(manager: ProjectManager): void {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    const projects: Project[] = JSON.parse(raw)
    for (const p of projects) {
      manager['projects'].set(p.id, p)
    }
    const activeId = localStorage.getItem(ACTIVE_KEY)
    if (activeId && manager['projects'].has(activeId)) {
      manager.switchTo(activeId)
    }
  } catch { /* ignore */ }
}
