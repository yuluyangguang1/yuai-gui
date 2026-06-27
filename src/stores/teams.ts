/**
 * Team Builder store (inspired by CrewAI)
 * Define teams of agents with roles, process types, and execute tasks.
 */
import { ref, computed, readonly } from 'vue';
import { defineStore } from 'pinia';
import { useAgentsStore, type AgentDef } from './agents';

// ── Types ──

export type AgentRole = 'lead' | 'member' | 'reviewer';
export type ProcessType = 'sequential' | 'hierarchical';

export interface TeamMember {
  agentId: string;
  role: AgentRole;
  order: number; // execution order for sequential process
}

export interface Team {
  id: string;
  name: string;
  description: string;
  members: TeamMember[];
  process: ProcessType;
  createdAt: number;
  updatedAt: number;
}

export type TeamStatus = 'idle' | 'running' | 'done' | 'error';

export interface TeamExecutionResult {
  teamId: string;
  task: string;
  status: TeamStatus;
  startedAt: number;
  finishedAt?: number;
  agentResults: Array<{
    agentId: string;
    role: AgentRole;
    output: string;
    durationMs?: number;
  }>;
  finalOutput: string;
}

export interface TeamTemplate {
  id: string;
  name: string;
  description: string;
  process: ProcessType;
  members: Array<{ role: AgentRole; specialty: string; agentIdHint?: string }>;
}

// ── Built-in Templates ──

const BUILTIN_TEMPLATES: TeamTemplate[] = [
  {
    id: 'code-review',
    name: '代码审查团队',
    description: '对代码进行多角度审查：架构、质量、安全性',
    process: 'sequential',
    members: [
      { role: 'lead', specialty: '编程、架构设计', agentIdHint: 'claude' },
      { role: 'member', specialty: '编程、快速原型', agentIdHint: 'codex' },
      { role: 'reviewer', specialty: '记忆、学习', agentIdHint: 'hermes' },
    ],
  },
  {
    id: 'research',
    name: '研究团队',
    description: '深度研究某个主题，汇总分析并给出建议',
    process: 'hierarchical',
    members: [
      { role: 'lead', specialty: '记忆、学习、任务编排', agentIdHint: 'hermes' },
      { role: 'member', specialty: '编程、架构设计', agentIdHint: 'claude' },
      { role: 'member', specialty: '内容生成', agentIdHint: 'openclaw' },
      { role: 'reviewer', specialty: '编程、快速原型', agentIdHint: 'codex' },
    ],
  },
  {
    id: 'content',
    name: '内容创作团队',
    description: '协作创建高质量内容：草稿、润色、审核',
    process: 'sequential',
    members: [
      { role: 'lead', specialty: '内容生成、渠道运营', agentIdHint: 'openclaw' },
      { role: 'member', specialty: '编程、架构设计', agentIdHint: 'claude' },
      { role: 'reviewer', specialty: '记忆、学习', agentIdHint: 'hermes' },
    ],
  },
];

// ── Store ──

export const useTeamsStore = defineStore('teams', () => {
  const teams = ref<Team[]>([]);
  const activeTeamId = ref<string | null>(null);
  const executionResults = ref<Map<string, TeamExecutionResult>>(new Map());
  const executionStatus = ref<TeamStatus>('idle');
  const templates = ref<TeamTemplate[]>([...BUILTIN_TEMPLATES]);

  // Counters
  let teamCounter = 0;

  // ── Computed ──

  const activeTeam = computed(() =>
    teams.value.find(t => t.id === activeTeamId.value) ?? null
  );

  const teamCount = computed(() => teams.value.length);

  // ── Team CRUD ──

  function createTeam(name: string, description: string = '', process: ProcessType = 'sequential'): Team {
    const team: Team = {
      id: `team_${++teamCounter}_${Date.now()}`,
      name,
      description,
      members: [],
      process,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    teams.value.push(team);
    return team;
  }

  function deleteTeam(teamId: string): boolean {
    const idx = teams.value.findIndex(t => t.id === teamId);
    if (idx >= 0) {
      teams.value.splice(idx, 1);
      if (activeTeamId.value === teamId) activeTeamId.value = null;
      executionResults.value.delete(teamId);
      return true;
    }
    return false;
  }

  function setActiveTeam(teamId: string | null) {
    activeTeamId.value = teamId;
  }

  function updateTeam(teamId: string, updates: Partial<Pick<Team, 'name' | 'description' | 'process'>>): boolean {
    const team = teams.value.find(t => t.id === teamId);
    if (!team) return false;
    if (updates.name !== undefined) team.name = updates.name;
    if (updates.description !== undefined) team.description = updates.description;
    if (updates.process !== undefined) team.process = updates.process;
    team.updatedAt = Date.now();
    return true;
  }

  // ── Member Management ──

  function addMember(teamId: string, agentId: string, role: AgentRole = 'member'): boolean {
    const team = teams.value.find(t => t.id === teamId);
    if (!team) return false;
    // Check for duplicate
    if (team.members.some(m => m.agentId === agentId)) return false;
    const order = team.members.length;
    team.members.push({ agentId, role, order });
    team.updatedAt = Date.now();
    return true;
  }

  function removeMember(teamId: string, agentId: string): boolean {
    const team = teams.value.find(t => t.id === teamId);
    if (!team) return false;
    const idx = team.members.findIndex(m => m.agentId === agentId);
    if (idx < 0) return false;
    team.members.splice(idx, 1);
    // Re-order
    team.members.forEach((m, i) => { m.order = i; });
    team.updatedAt = Date.now();
    return true;
  }

  function updateMemberRole(teamId: string, agentId: string, role: AgentRole): boolean {
    const team = teams.value.find(t => t.id === teamId);
    if (!team) return false;
    const member = team.members.find(m => m.agentId === agentId);
    if (!member) return false;
    member.role = role;
    team.updatedAt = Date.now();
    return true;
  }

  function reorderMembers(teamId: string, agentIds: string[]): boolean {
    const team = teams.value.find(t => t.id === teamId);
    if (!team) return false;
    const newMembers: TeamMember[] = [];
    for (let i = 0; i < agentIds.length; i++) {
      const member = team.members.find(m => m.agentId === agentIds[i]);
      if (member) {
        newMembers.push({ ...member, order: i });
      }
    }
    team.members = newMembers;
    team.updatedAt = Date.now();
    return true;
  }

  // ── Templates ──

  function createFromTemplate(templateId: string, customName?: string): Team | null {
    const template = templates.value.find(t => t.id === templateId);
    if (!template) return null;

    const agentsStore = useAgentsStore();
    const team = createTeam(
      customName ?? template.name,
      template.description,
      template.process
    );

    // Add members from template, matching by agentIdHint
    for (const memberDef of template.members) {
      const agent = agentsStore.agents.find(a => a.id === memberDef.agentIdHint && a.enabled);
      if (agent) {
        addMember(team.id, agent.id, memberDef.role);
      } else {
        // Try to find any enabled agent with matching specialty
        const fallback = agentsStore.agents.find(a =>
          a.enabled && a.specialty.includes(memberDef.specialty.split('、')[0])
        );
        if (fallback) {
          addMember(team.id, fallback.id, memberDef.role);
        }
      }
    }

    return team;
  }

  // ── Team Execution ──

  async function executeTeam(task: string, teamId?: string): Promise<TeamExecutionResult> {
    const team = teamId
      ? teams.value.find(t => t.id === teamId)
      : activeTeam.value;

    if (!team) throw new Error('No team selected');
    if (team.members.length === 0) throw new Error('Team has no members');

    const result: TeamExecutionResult = {
      teamId: team.id,
      task,
      status: 'running',
      startedAt: Date.now(),
      agentResults: [],
      finalOutput: '',
    };

    executionResults.value.set(team.id, result);
    executionStatus.value = 'running';

    try {
      if (team.process === 'sequential') {
        await executeSequential(team, task, result);
      } else {
        await executeHierarchical(team, task, result);
      }

      // Final output = last agent's output or combined summary
      result.finalOutput = result.agentResults.length > 0
        ? result.agentResults[result.agentResults.length - 1].output
        : 'No output produced';
      result.status = 'done';
      executionStatus.value = 'done';
    } catch (e) {
      result.status = 'error';
      result.finalOutput = `Error: ${String(e)}`;
      executionStatus.value = 'error';
    }

    result.finishedAt = Date.now();
    executionResults.value = new Map(executionResults.value);
    return result;
  }

  /**
   * Sequential: agents speak one by one, each building on previous output.
   */
  async function executeSequential(team: Team, task: string, result: TeamExecutionResult): Promise<void> {
    const sorted = [...team.members].sort((a, b) => a.order - b.order);
    let previousOutput = '';

    for (const member of sorted) {
      const startTime = Date.now();
      // Build context from previous outputs
      const context = previousOutput
        ? `Previous output:\n${previousOutput}\n\nOriginal task:\n${task}`
        : task;

      try {
        // Dynamic import to avoid circular dependency
        const { useChatStore } = await import('./chat');
        const chatStore = useChatStore();
        chatStore.addMessage('system', `[Team:${team.name}] ${member.agentId} (${member.role}) 开始工作...`);

        // Use invoke to get agent response
        const { invoke } = await import('@tauri-apps/api/core');
        const output: string = await invoke('agent_think', {
          agentId: member.agentId,
          prompt: context,
        });

        result.agentResults.push({
          agentId: member.agentId,
          role: member.role,
          output,
          durationMs: Date.now() - startTime,
        });
        previousOutput = output;
      } catch (e) {
        result.agentResults.push({
          agentId: member.agentId,
          role: member.role,
          output: `Error: ${String(e)}`,
          durationMs: Date.now() - startTime,
        });
      }
    }
  }

  /**
   * Hierarchical: lead delegates to members, then reviewer consolidates.
   */
  async function executeHierarchical(team: Team, task: string, result: TeamExecutionResult): Promise<void> {
    const lead = team.members.find(m => m.role === 'lead');
    const members = team.members.filter(m => m.role === 'member');
    const reviewer = team.members.find(m => m.role === 'reviewer');

    // 1. Lead analyzes and breaks down the task
    if (lead) {
      const startTime = Date.now();
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const leadOutput: string = await invoke('agent_think', {
          agentId: lead.agentId,
          prompt: `[Hierarchical Team: ${team.name}]\nTask: ${task}\n\nYou are the lead. Analyze this task and break it down into sub-tasks for the team members. Provide your analysis and recommended approach.`,
        });
        result.agentResults.push({
          agentId: lead.agentId,
          role: 'lead',
          output: leadOutput,
          durationMs: Date.now() - startTime,
        });

        // 2. Members work in parallel (simulated sequentially)
        const memberOutputs: string[] = [];
        for (const member of members) {
          const mStartTime = Date.now();
          try {
            const { invoke: invokeFn } = await import('@tauri-apps/api/core');
            const memberOutput: string = await invokeFn('agent_think', {
              agentId: member.agentId,
              prompt: `[Hierarchical Team: ${team.name}]\nTask: ${task}\n\nLead's analysis:\n${leadOutput}\n\nAs a ${member.role}, provide your contribution based on the lead's breakdown.`,
            });
            result.agentResults.push({
              agentId: member.agentId,
              role: 'member',
              output: memberOutput,
              durationMs: Date.now() - mStartTime,
            });
            memberOutputs.push(memberOutput);
          } catch (e) {
            result.agentResults.push({
              agentId: member.agentId,
              role: 'member',
              output: `Error: ${String(e)}`,
              durationMs: Date.now() - mStartTime,
            });
          }
        }

        // 3. Reviewer consolidates
        if (reviewer) {
          const rStartTime = Date.now();
          try {
            const { invoke: invokeFn } = await import('@tauri-apps/api/core');
            const allOutputs = result.agentResults.map(r => `--- ${r.agentId} (${r.role}) ---\n${r.output}`).join('\n\n');
            const reviewOutput: string = await invokeFn('agent_think', {
              agentId: reviewer.agentId,
              prompt: `[Hierarchical Team: ${team.name}]\nTask: ${task}\n\nTeam outputs:\n${allOutputs}\n\nAs the reviewer, consolidate these outputs into a final, coherent result. Identify any issues or improvements.`,
            });
            result.agentResults.push({
              agentId: reviewer.agentId,
              role: 'reviewer',
              output: reviewOutput,
              durationMs: Date.now() - rStartTime,
            });
          } catch (e) {
            result.agentResults.push({
              agentId: reviewer.agentId,
              role: 'reviewer',
              output: `Error: ${String(e)}`,
              durationMs: Date.now() - rStartTime,
            });
          }
        }
      } catch (e) {
        result.agentResults.push({
          agentId: lead.agentId,
          role: 'lead',
          output: `Error: ${String(e)}`,
          durationMs: Date.now() - startTime,
        });
      }
    }
  }

  // ── Misc ──

  function getExecutionResult(teamId: string): TeamExecutionResult | null {
    return executionResults.value.get(teamId) ?? null;
  }

  function resetExecution() {
    executionStatus.value = 'idle';
  }

  return {
    // State
    teams: readonly(teams),
    activeTeamId,
    executionStatus,
    templates: readonly(templates),

    // Computed
    activeTeam,
    teamCount,

    // Team CRUD
    createTeam,
    deleteTeam,
    setActiveTeam,
    updateTeam,

    // Member management
    addMember,
    removeMember,
    updateMemberRole,
    reorderMembers,

    // Templates
    createFromTemplate,

    // Execution
    executeTeam,
    getExecutionResult,
    resetExecution,
  };
});
