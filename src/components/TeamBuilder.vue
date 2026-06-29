<template>
  <div class="team-builder">
    <!-- Header -->
    <div class="tb-header">
      <span class="tb-title">队 团队协作</span>
      <div class="tb-header-actions">
        <button class="tb-btn" @click="showTemplates = !showTemplates">
          <TIcon name="close" :size="14" /> {{ showTemplates ? '关闭' : '模板' }}
        </button>
        <button class="tb-btn tb-btn-primary" @click="createNewTeam">+ 新团队</button>
      </div>
    </div>

    <!-- Templates Panel -->
    <div v-if="showTemplates" class="tb-templates">
      <div class="tb-templates-title">快速创建</div>
      <div class="tb-templates-grid">
        <div
          v-for="tpl in teamsStore.templates"
          :key="tpl.id"
          class="tb-template-card"
          @click="handleCreateFromTemplate(tpl.id)"
        >
          <div class="tb-template-name">{{ tpl.name }}</div>
          <div class="tb-template-desc">{{ tpl.description }}</div>
          <div class="tb-template-meta">
            <span class="tb-process-tag">{{ tpl.process }}</span>
            <span>{{ tpl.members.length }} 成员</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Team List -->
    <div v-if="teamsStore.teams.length === 0 && !editingTeam" class="tb-empty">
      <TIcon name="users" :size="32" />
      <div class="tb-empty-text">暂无团队</div>
      <div class="tb-empty-hint">使用模板快速创建，或手动新建团队</div>
    </div>

    <div class="tb-teams-list">
      <div
        v-for="team in teamsStore.teams"
        :key="team.id"
        class="tb-team-card"
        :class="{ active: teamsStore.activeTeamId === team.id }"
        @click="teamsStore.setActiveTeam(team.id)"
      >
        <div class="tb-team-header">
          <span class="tb-team-name">{{ team.name }}</span>
          <span class="tb-process-tag">{{ team.process }}</span>
        </div>
        <div class="tb-team-desc" v-if="team.description">{{ team.description }}</div>
        <div class="tb-team-members">
          <span
            v-for="member in team.members"
            :key="member.agentId"
            class="tb-member-badge"
            :class="'role-' + member.role"
            :title="member.agentId + ' (' + member.role + ')'"
          >
            {{ getAgentGlyph(member.agentId) }}
            <span class="tb-member-role">{{ member.role }}</span>
          </span>
        </div>
        <div class="tb-team-actions">
          <button class="tb-btn-sm" @click.stop="startEdit(team)">编辑</button>
          <button
            class="tb-btn-sm tb-btn-run"
            @click.stop="handleExecute(team)"
            :disabled="executionRunning || team.members.length === 0"
          >
            {{ executionRunning ? '运行中...' : '运行' }}
          </button>
          <button class="tb-btn-sm tb-btn-danger" @click.stop="handleDelete(team.id)">删除</button>
        </div>
      </div>
    </div>

    <!-- Editor Panel -->
    <div v-if="editingTeam" class="tb-editor">
      <div class="tb-editor-header">
        <span>{{ isNewTeam ? '新建团队' : '编辑团队' }}</span>
        <button class="tb-btn-sm" @click="cancelEdit">✕</button>
      </div>

      <!-- Team Info -->
      <div class="tb-editor-section">
        <label class="tb-label">团队名称</label>
        <input v-model="editForm.name" class="tb-input" placeholder="输入团队名称" />
      </div>

      <div class="tb-editor-section">
        <label class="tb-label">描述</label>
        <input v-model="editForm.description" class="tb-input" placeholder="团队描述（可选）" />
      </div>

      <div class="tb-editor-section">
        <label class="tb-label">执行模式</label>
        <div class="tb-process-selector">
          <button
            class="tb-process-btn"
            :class="{ active: editForm.process === 'sequential' }"
            @click="editForm.process = 'sequential'"
          >
            顺序执行
          </button>
          <button
            class="tb-process-btn"
            :class="{ active: editForm.process === 'hierarchical' }"
            @click="editForm.process = 'hierarchical'"
          >
            层级协作
          </button>
        </div>
      </div>

      <!-- Members -->
      <div class="tb-editor-section">
        <label class="tb-label">成员 ({{ editForm.members.length }})</label>

        <!-- Available agents to add -->
        <div class="tb-available-agents">
          <span class="tb-label-sm">可添加：</span>
          <button
            v-for="agent in availableAgents"
            :key="agent.id"
            class="tb-agent-chip"
            :style="{ borderColor: agent.color }"
            @click="addAgentToTeam(agent.id)"
          >
            <span :style="{ color: agent.color }">{{ agent.glyph }}</span>
            {{ agent.chinese_name }}
          </button>
          <span v-if="availableAgents.length === 0" class="tb-hint">所有代理已添加</span>
        </div>

        <!-- Current members (draggable list) -->
        <div class="tb-members-list">
          <div
            v-for="(member, idx) in editForm.members"
            :key="member.agentId"
            class="tb-member-row"
            draggable="true"
            @dragstart="handleDragStart($event, idx)"
            @dragover.prevent
            @drop="handleDrop($event, idx)"
          >
            <span class="tb-drag-handle">⠿</span>
            <span class="tb-member-glyph" :style="{ color: getAgentColor(member.agentId) }">
              {{ getAgentGlyph(member.agentId) }}
            </span>
            <span class="tb-member-name">{{ getAgentName(member.agentId) }}</span>
            <select v-model="member.role" class="tb-role-select">
              <option value="lead">负责人</option>
              <option value="member">成员</option>
              <option value="reviewer">审查者</option>
            </select>
            <button class="tb-btn-sm tb-btn-danger" @click="removeAgentFromTeam(member.agentId)">✕</button>
          </div>
          <div v-if="editForm.members.length === 0" class="tb-hint">
            点击上方代理标签添加成员，拖拽调整顺序
          </div>
        </div>
      </div>

      <!-- Save -->
      <div class="tb-editor-actions">
        <button class="tb-btn" @click="cancelEdit">取消</button>
        <button class="tb-btn tb-btn-primary" @click="saveEdit">保存</button>
      </div>
    </div>

    <!-- Execution Task Input -->
    <div v-if="teamsStore.activeTeam && !editingTeam" class="tb-task-input">
      <input
        v-model="taskText"
        class="tb-input"
        placeholder="输入任务描述，回车执行团队协作..."
        @keydown.enter="handleExecuteActive"
      />
      <button
        class="tb-btn tb-btn-primary"
        @click="handleExecuteActive"
        :disabled="!taskText.trim() || executionRunning"
      >
        {{ executionRunning ? '执行中...' : '执行' }}
      </button>
    </div>

    <!-- Execution Result -->
    <div v-if="executionResult" class="tb-result">
      <div class="tb-result-header">
        <span>执行结果</span>
        <span class="tb-result-status" :class="executionResult.status">
          {{ executionResult.status === 'done' ? '✅ 完成' : executionResult.status === 'error' ? '❌ 错误' : '⏳ 运行中' }}
        </span>
      </div>
      <div
        v-for="(ar, idx) in executionResult.agentResults"
        :key="idx"
        class="tb-result-agent"
      >
        <div class="tb-result-agent-header">
          <span class="tb-result-agent-name">{{ getAgentName(ar.agentId) }}</span>
          <span class="tb-result-agent-role">({{ ar.role }})</span>
          <span v-if="ar.durationMs" class="tb-result-duration">{{ (ar.durationMs / 1000).toFixed(1) }}s</span>
        </div>
        <pre class="tb-result-output">{{ ar.output.slice(0, 500) }}{{ ar.output.length > 500 ? '...' : '' }}</pre>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive } from 'vue';
import { TIcon } from "../utils/icons";
import { useTeamsStore, type Team, type AgentRole, type ProcessType, type TeamExecutionResult } from '../stores/teams';
import { useAgentsStore } from '../stores/agents';

const teamsStore = useTeamsStore();
const agentsStore = useAgentsStore();

const showTemplates = ref(false);
const taskText = ref('');
const executionRunning = ref(false);
const executionResult = ref<TeamExecutionResult | null>(null);

// Editor state
interface EditForm {
  teamId: string | null;
  name: string;
  description: string;
  process: ProcessType;
  members: Array<{ agentId: string; role: AgentRole; order: number }>;
}
const editingTeam = ref(false);
const isNewTeam = ref(false);
const editForm = reactive<EditForm>({
  teamId: null,
  name: '',
  description: '',
  process: 'sequential',
  members: [],
});

// Drag state
let dragIndex = -1;

function getAgentGlyph(agentId: string): string {
  return agentsStore.agents.find(a => a.id === agentId)?.glyph ?? '?';
}

function getAgentName(agentId: string): string {
  return agentsStore.agents.find(a => a.id === agentId)?.chinese_name ?? agentId;
}

function getAgentColor(agentId: string): string {
  return agentsStore.agents.find(a => a.id === agentId)?.color ?? '#888';
}

const availableAgents = computed(() => {
  const memberIds = new Set(editForm.members.map(m => m.agentId));
  return agentsStore.agents.filter(a => a.enabled && !memberIds.has(a.id));
});

function createNewTeam() {
  isNewTeam.value = true;
  editForm.teamId = null;
  editForm.name = '';
  editForm.description = '';
  editForm.process = 'sequential';
  editForm.members = [];
  editingTeam.value = true;
}

function startEdit(team: Team) {
  isNewTeam.value = false;
  editForm.teamId = team.id;
  editForm.name = team.name;
  editForm.description = team.description;
  editForm.process = team.process;
  editForm.members = team.members.map(m => ({ ...m }));
  editingTeam.value = true;
}

function cancelEdit() {
  editingTeam.value = false;
}

function saveEdit() {
  if (!editForm.name.trim()) return;

  if (isNewTeam.value) {
    const team = teamsStore.createTeam(editForm.name, editForm.description, editForm.process);
    for (const m of editForm.members) {
      teamsStore.addMember(team.id, m.agentId, m.role);
    }
    teamsStore.reorderMembers(team.id, editForm.members.map(m => m.agentId));
    teamsStore.setActiveTeam(team.id);
  } else if (editForm.teamId) {
    teamsStore.updateTeam(editForm.teamId, {
      name: editForm.name,
      description: editForm.description,
      process: editForm.process,
    });
    // Sync members: remove all, re-add in order
    const team = teamsStore.teams.find(t => t.id === editForm.teamId);
    if (team) {
      const currentIds = team.members.map(m => m.agentId);
      for (const id of currentIds) {
        teamsStore.removeMember(editForm.teamId!, id);
      }
      for (const m of editForm.members) {
        teamsStore.addMember(editForm.teamId!, m.agentId, m.role);
      }
      teamsStore.reorderMembers(editForm.teamId!, editForm.members.map(m => m.agentId));
    }
  }

  editingTeam.value = false;
}

function addAgentToTeam(agentId: string) {
  editForm.members.push({ agentId, role: 'member', order: editForm.members.length });
}

function removeAgentFromTeam(agentId: string) {
  const idx = editForm.members.findIndex(m => m.agentId === agentId);
  if (idx >= 0) editForm.members.splice(idx, 1);
}

function handleDragStart(event: DragEvent, idx: number) {
  dragIndex = idx;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
  }
}

function handleDrop(event: DragEvent, dropIdx: number) {
  event.preventDefault();
  if (dragIndex < 0 || dragIndex === dropIdx) return;
  const [moved] = editForm.members.splice(dragIndex, 1);
  editForm.members.splice(dropIdx, 0, moved);
  dragIndex = -1;
}

function handleCreateFromTemplate(templateId: string) {
  const team = teamsStore.createFromTemplate(templateId);
  if (team) {
    teamsStore.setActiveTeam(team.id);
    showTemplates.value = false;
  }
}

function handleDelete(teamId: string) {
  teamsStore.deleteTeam(teamId);
  executionResult.value = null;
}

async function handleExecute(team: Team) {
  teamsStore.setActiveTeam(team.id);
  if (!taskText.value.trim()) {
    taskText.value = '请执行团队任务';
  }
  await runTeam(taskText.value);
}

async function handleExecuteActive() {
  if (!taskText.value.trim()) return;
  await runTeam(taskText.value);
}

async function runTeam(task: string) {
  executionRunning.value = true;
  executionResult.value = null;
  try {
    const result = await teamsStore.executeTeam(task);
    executionResult.value = result;
  } catch (e) {
    console.error('Team execution failed:', e);
  } finally {
    executionRunning.value = false;
  }
}
</script>

<style scoped>
.team-builder {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  padding: 0;
  color: var(--text-primary);
}

.tb-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-light);
  flex-shrink: 0;
}

.tb-title {
  font-family: var(--font-brush);
  font-size: 1.1rem;
  color: var(--gold);
}

.tb-header-actions {
  display: flex;
  gap: 6px;
}

.tb-btn {
  padding: 4px 12px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  font-size: 0.72rem;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.tb-btn:hover {
  background: var(--bg-hover);
  border-color: var(--accent-muted);
}

.tb-btn-primary {
  background: rgba(92, 207, 184, 0.15);
  border-color: var(--accent);
  color: var(--accent);
}

.tb-btn-primary:hover {
  background: rgba(92, 207, 184, 0.25);
}

.tb-btn-sm {
  padding: 2px 8px;
  border: 1px solid var(--border);
  border-radius: 3px;
  background: var(--bg-tertiary);
  color: var(--text-muted);
  font-size: 0.66rem;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.tb-btn-sm:hover {
  color: var(--text-primary);
  border-color: var(--accent-muted);
}

.tb-btn-run {
  color: var(--accent);
  border-color: var(--accent-muted);
}

.tb-btn-danger {
  color: var(--error);
  border-color: transparent;
}

.tb-btn-danger:hover {
  border-color: var(--error);
  background: rgba(255, 100, 100, 0.1);
}

/* Templates */
.tb-templates {
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-light);
}

.tb-templates-title {
  font-size: 0.72rem;
  color: var(--text-muted);
  margin-bottom: 8px;
}

.tb-templates-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 8px;
}

.tb-template-card {
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-tertiary);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.tb-template-card:hover {
  border-color: var(--accent);
  background: var(--bg-hover);
}

.tb-template-name {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 4px;
}

.tb-template-desc {
  font-size: 0.66rem;
  color: var(--text-muted);
  margin-bottom: 6px;
  line-height: 1.4;
}

.tb-template-meta {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 0.6rem;
  color: var(--text-muted);
}

/* Empty */
.tb-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 16px;
  gap: 8px;
}

.tb-empty-icon {
  font-family: var(--font-brush);
  font-size: 2rem;
  color: var(--text-muted);
  opacity: 0.5;
}

.tb-empty-text {
  font-size: 0.82rem;
  color: var(--text-secondary);
}

.tb-empty-hint {
  font-size: 0.66rem;
  color: var(--text-muted);
}

/* Team list */
.tb-teams-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.tb-team-card {
  padding: 12px 14px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-tertiary);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.tb-team-card:hover {
  border-color: var(--accent-muted);
  background: var(--bg-hover);
}

.tb-team-card.active {
  border-color: var(--accent);
  background: rgba(92, 207, 184, 0.05);
}

.tb-team-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.tb-team-name {
  font-weight: 600;
  font-size: 0.82rem;
  color: var(--text-primary);
}

.tb-process-tag {
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 0.56rem;
  background: var(--bg-primary);
  color: var(--text-muted);
  border: 1px solid var(--border);
}

.tb-team-desc {
  font-size: 0.66rem;
  color: var(--text-muted);
  margin-bottom: 6px;
}

.tb-team-members {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 6px;
}

.tb-member-badge {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 6px;
  border-radius: 3px;
  font-size: 0.66rem;
  background: var(--bg-primary);
  border: 1px solid var(--border);
}

.tb-member-role {
  font-size: 0.56rem;
  color: var(--text-muted);
}

.role-lead .tb-member-role { color: var(--gold); }
.role-reviewer .tb-member-role { color: var(--accent); }

.tb-team-actions {
  display: flex;
  gap: 4px;
}

/* Editor */
.tb-editor {
  padding: 12px 16px;
  border-top: 1px solid var(--border-light);
  background: var(--bg-secondary);
  flex-shrink: 0;
  max-height: 60%;
  overflow-y: auto;
}

.tb-editor-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text-primary);
}

.tb-editor-section {
  margin-bottom: 12px;
}

.tb-label {
  display: block;
  font-size: 0.68rem;
  color: var(--text-muted);
  margin-bottom: 4px;
}

.tb-label-sm {
  font-size: 0.62rem;
  color: var(--text-muted);
}

.tb-input {
  width: 100%;
  padding: 6px 10px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg-tertiary);
  color: var(--text-primary);
  font-size: 0.72rem;
  font-family: inherit;
  outline: none;
  transition: border-color var(--transition-fast);
  box-sizing: border-box;
}

.tb-input:focus {
  border-color: var(--accent-muted);
}

.tb-input::placeholder {
  color: var(--text-muted);
}

/* Process selector */
.tb-process-selector {
  display: flex;
  gap: 4px;
}

.tb-process-btn {
  flex: 1;
  padding: 6px 12px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg-tertiary);
  color: var(--text-muted);
  font-size: 0.72rem;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.tb-process-btn.active {
  border-color: var(--accent);
  color: var(--accent);
  background: rgba(92, 207, 184, 0.1);
}

/* Available agents */
.tb-available-agents {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
  margin-bottom: 8px;
}

.tb-agent-chip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 8px;
  border: 1px dashed var(--border);
  border-radius: 3px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 0.66rem;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.tb-agent-chip:hover {
  border-style: solid;
  background: var(--bg-tertiary);
}

/* Members list */
.tb-members-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 4px;
}

.tb-member-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg-tertiary);
  transition: all var(--transition-fast);
}

.tb-member-row[draggable="true"] {
  cursor: grab;
}

.tb-drag-handle {
  color: var(--text-muted);
  cursor: grab;
  font-size: 0.82rem;
  user-select: none;
}

.tb-member-glyph {
  font-weight: 600;
  font-size: 0.82rem;
}

.tb-member-name {
  flex: 1;
  font-size: 0.72rem;
  color: var(--text-primary);
}

.tb-role-select {
  padding: 2px 4px;
  border: 1px solid var(--border);
  border-radius: 3px;
  background: var(--bg-primary);
  color: var(--text-secondary);
  font-size: 0.62rem;
  outline: none;
}

.tb-hint {
  font-size: 0.62rem;
  color: var(--text-muted);
  font-style: italic;
}

/* Editor actions */
.tb-editor-actions {
  display: flex;
  justify-content: flex-end;
  gap: 6px;
  margin-top: 8px;
}

/* Task input */
.tb-task-input {
  display: flex;
  gap: 6px;
  padding: 8px 16px;
  border-top: 1px solid var(--border-light);
  flex-shrink: 0;
}

.tb-task-input .tb-input {
  flex: 1;
}

/* Result */
.tb-result {
  border-top: 1px solid var(--border-light);
  padding: 12px 16px;
  overflow-y: auto;
  flex-shrink: 0;
  max-height: 50%;
}

.tb-result-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
  font-size: 0.82rem;
  font-weight: 600;
}

.tb-result-status {
  font-size: 0.66rem;
  padding: 2px 8px;
  border-radius: 3px;
}

.tb-result-status.done { color: var(--accent); background: rgba(92, 207, 184, 0.1); }
.tb-result-status.error { color: var(--error); background: rgba(255, 100, 100, 0.1); }
.tb-result-status.running { color: var(--gold); background: rgba(255, 200, 100, 0.1); }

.tb-result-agent {
  margin-bottom: 8px;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg-tertiary);
}

.tb-result-agent-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}

.tb-result-agent-name {
  font-weight: 600;
  font-size: 0.72rem;
}

.tb-result-agent-role {
  font-size: 0.62rem;
  color: var(--text-muted);
}

.tb-result-duration {
  font-size: 0.62rem;
  color: var(--text-muted);
  margin-left: auto;
  font-family: var(--font-mono);
}

.tb-result-output {
  font-size: 0.66rem;
  color: var(--text-secondary);
  white-space: pre-wrap;
  word-break: break-word;
  margin: 0;
  font-family: var(--font-mono);
  line-height: 1.5;
  max-height: 200px;
  overflow-y: auto;
}
</style>
