/**
 * Spec-Driven Engine — 参考 github/spec-kit
 * 规格→计划→任务→实现 全流程
 */

// ══════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════

export type SpecPhase = 'constitution' | 'specify' | 'clarify' | 'plan' | 'tasks' | 'implement' | 'converge'

export interface SpecProject {
  id: string
  name: string
  path: string
  phase: SpecPhase
  constitution: string | null
  spec: SpecDocument | null
  plan: PlanDocument | null
  tasks: TaskDocument | null
  created_at: number
  updated_at: number
}

export interface SpecDocument {
  title: string
  user_stories: UserStory[]
  functional_requirements: FunctionalRequirement[]
  key_entities: string[]
  success_criteria: SuccessCriterion[]
  assumptions: string[]
  clarifications: Clarification[]
}

export interface UserStory {
  id: string
  priority: 'P1' | 'P2' | 'P3'
  description: string
  acceptance_scenarios: AcceptanceScenario[]
}

export interface AcceptanceScenario {
  given: string
  when: string
  then: string
}

export interface FunctionalRequirement {
  id: string // FR-001, FR-002...
  description: string
  testable: boolean
}

export interface SuccessCriterion {
  id: string // SC-001, SC-002...
  description: string
  measurable: boolean
}

export interface Clarification {
  question: string
  answer: string | null
  resolved: boolean
}

export interface PlanDocument {
  tech_stack: string
  architecture: string
  data_model: string
  api_contracts: string
  research_notes: string
  complexity_tracking: ComplexityEntry[]
}

export interface ComplexityEntry {
  component: string
  justification: string
  violates: string // 哪条原则
}

export interface TaskDocument {
  phases: TaskPhase[]
}

export interface TaskPhase {
  name: string
  user_story: string | null
  tasks: SpecTask[]
}

export interface SpecTask {
  id: string
  description: string
  parallel: boolean // [P] 标记
  depends_on: string[]
  user_story: string | null // [US1] 标记
  implemented: boolean
}

// ══════════════════════════════════════════════
// Spec Engine
// ══════════════════════════════════════════════

export class SpecEngine {
  private maxProjects = 10
  private projects = new Map<string, SpecProject>()

  /** 创建规格项目 */
  createProject(name: string, path: string): SpecProject {
    const project: SpecProject = {
      id: crypto.randomUUID(),
      name,
      path,
      phase: 'constitution',
      constitution: null,
      spec: null,
      plan: null,
      tasks: null,
      created_at: Date.now(),
      updated_at: Date.now(),
    }
    this.projects.set(project.id, project)
    return project
  }

  /** 设置宪法 (项目治理原则) */
  setConstitution(projectId: string, constitution: string): void {
    const project = this.projects.get(projectId)
    if (project) {
      project.constitution = constitution
      project.phase = 'specify'
      project.updated_at = Date.now()
    }
  }

  /** 设置规格 */
  setSpec(projectId: string, spec: SpecDocument): void {
    const project = this.projects.get(projectId)
    if (project) {
      project.spec = spec
      project.phase = 'plan'
      project.updated_at = Date.now()
    }
  }

  /** 设置计划 */
  setPlan(projectId: string, plan: PlanDocument): void {
    const project = this.projects.get(projectId)
    if (project) {
      project.plan = plan
      project.phase = 'tasks'
      project.updated_at = Date.now()
    }
  }

  /** 设置任务 */
  setTasks(projectId: string, tasks: TaskDocument): void {
    const project = this.projects.get(projectId)
    if (project) {
      project.tasks = tasks
      project.phase = 'implement'
      project.updated_at = Date.now()
    }
  }

  /** 标记任务完成 */
  markTaskDone(projectId: string, taskId: string): void {
    const project = this.projects.get(projectId)
    if (!project?.tasks) return
    for (const phase of project.tasks.phases) {
      const task = phase.tasks.find(t => t.id === taskId)
      if (task) {
        task.implemented = true
        project.updated_at = Date.now()
        break
      }
    }
  }

  /** Convergence — 评估代码 vs 规格 */
  converge(projectId: string): { missing: string[]; extra: string[]; violations: string[] } {
    const project = this.projects.get(projectId)
    if (!project?.spec || !project?.tasks) {
      return { missing: [], extra: [], violations: [] }
    }

    const implemented = new Set<string>()
    const pending: string[] = []

    for (const phase of project.tasks.phases) {
      for (const task of phase.tasks) {
        if (task.implemented) {
          implemented.add(task.id)
        } else {
          pending.push(`${task.id}: ${task.description}`)
        }
      }
    }

    // 检查需求覆盖
    const coveredReqs = new Set<string>()
    for (const phase of project.tasks.phases) {
      for (const task of phase.tasks) {
        if (task.implemented && task.user_story) {
          coveredReqs.add(task.user_story)
        }
      }
    }

    const missingReqs = project.spec.user_stories
      .filter(us => !coveredReqs.has(us.id))
      .map(us => `${us.id}: ${us.description}`)

    return {
      missing: [...pending, ...missingReqs],
      extra: [], // 需要实际代码分析
      violations: project.plan?.complexity_tracking.map(c => `${c.component}: ${c.violates}`) ?? [],
    }
  }

  /** 获取项目 */
  getProject(projectId: string): SpecProject | undefined {
    return this.projects.get(projectId)
  }

  /** 获取所有项目 */
  getAllProjects(): SpecProject[] {
    return Array.from(this.projects.values())
  }

  /** 检查是否有 [NEEDS CLARIFICATION] 标记 */
  getUnresolvedClarifications(projectId: string): Clarification[] {
    const project = this.projects.get(projectId)
    if (!project?.spec) return []
    return project.spec.clarifications.filter(c => !c.resolved)
  }
}

// ══════════════════════════════════════════════
// 模板生成器 (参考 spec-kit templates)
// ══════════════════════════════════════════════

export function generateSpecTemplate(title: string): string {
  return `# ${title} — 功能规格

## 用户场景与测试

### P1 — 核心场景
<!-- 每个用户故事独立可测试 -->

**US-001**: [用户故事描述]

**验收场景:**
- Given: [前置条件]
- When: [触发动作]
- Then: [预期结果]

### P2 — 重要场景
<!-- ... -->

### P3 — 可选场景
<!-- ... -->

## 功能需求

| ID | 需求描述 | 可测试 |
|----|---------|--------|
| FR-001 | [需求] | ✓ |

## 关键实体
<!-- 数据概念, 无实现细节 -->

## 成功标准

| ID | 标准 | 可衡量 |
|----|------|--------|
| SC-001 | [标准] | ✓ |

## 假设
<!-- 合理默认值 -->

## 待澄清
<!-- [NEEDS CLARIFICATION: 具体问题] — 最多3个 -->
`
}

export function generatePlanTemplate(): string {
  return `# 实现计划

## 技术栈
<!-- 具体技术选型 -->

## 架构
<!-- 系统架构设计 -->

## 数据模型
<!-- 数据结构定义 -->

## API 契约
<!-- 接口定义 -->

## 复杂度追踪

| 组件 | 理由 | 违反原则 |
|------|------|---------|

## 质量门检查
- [ ] 简洁性门: ≤3个项目? 无未来证明?
- [ ] 反抽象门: 直接用框架? 单一模型表示?
`
}

export function generateTasksTemplate(): string {
  return `# 任务分解

## Phase 1: 基础设施
<!-- 共享基础设施 -->

## Phase 2: 核心功能 (P1)
<!-- 最小可行产品 -->
- [ ] [P] [US1] 任务描述
- [ ] [US1] 依赖任务的任务描述

## Phase 3: 扩展功能 (P2)
<!-- ... -->

## Phase 4: 可选功能 (P3)
<!-- ... -->

## Phase 5: 收尾
<!-- 跨切面任务 -->

> [P] = 可并行 | [USn] = 关联用户故事
`
}
