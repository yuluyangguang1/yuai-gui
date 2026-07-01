<template>
  <div class="task-panel" role="region" aria-label="任务">
    <h2 class="task-title">任务</h2>

    <!-- Stats -->
    <div class="task-stats">
      <div class="stat-item" v-for="(count, state) in stats" :key="state">
        <span class="stat-dot" :class="'dot-' + state" />
        <span class="stat-label">{{ TASK_STATE_LABELS[state as TaskState] || state }}</span>
        <span class="stat-count">{{ count }}</span>
      </div>
    </div>

    <!-- Task list -->
    <div class="task-list">
      <div v-for="task in tasks" :key="task.id" class="task-card" :class="'task-' + task.state">
        <div class="task-header">
          <TIcon :name="TASK_STATE_ICONS[task.state]" :size="14" class="task-state-icon" />
          <span class="task-card-title">{{ task.title }}</span>
          <span class="task-priority" :class="'priority-' + task.priority">{{ TASK_PRIORITY_LABELS[task.priority] }}</span>
        </div>
        <div v-if="task.description" class="task-desc">{{ task.description }}</div>
        <div class="task-meta">
          <span v-if="task.agent_id" class="task-agent">{{ task.agent_id }}</span>
          <span v-if="task.user_story" class="task-story">{{ task.user_story }}</span>
          <span class="task-time">{{ formatTime(task.created_at) }}</span>
        </div>
      </div>
      <div v-if="tasks.length === 0" class="task-empty">暂无任务</div>
    </div>

    <!-- Create task -->
    <div class="task-create">
      <input v-model="newTitle" class="task-input" placeholder="新任务标题..." @keydown.enter="createTask" />
      <button class="task-btn" @click="createTask" :disabled="!newTitle.trim()">
        <TIcon name="plus" :size="14" />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { TIcon } from '../utils/icons';
import { TaskManager, TASK_STATE_LABELS, TASK_STATE_ICONS, TASK_PRIORITY_LABELS, type TaskState } from '../utils/task-machine';
import { ProjectManager } from '../utils/project-manager';

const taskManager = new TaskManager();

const tasks = computed(() => taskManager.getAll());
const stats = computed(() => taskManager.getStats());
const newTitle = ref('');

function createTask() {
  if (!newTitle.value.trim()) return;
  taskManager.create({ title: newTitle.value.trim() });
  newTitle.value = '';
  // Persist
  try { localStorage.setItem('yuai-tasks', JSON.stringify(taskManager.getAll())); } catch {}
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

onMounted(() => {
  try {
    const raw = localStorage.getItem('yuai-tasks');
    if (raw) {
      const saved = JSON.parse(raw);
      for (const t of saved) {
        // Use internal set to preserve IDs
        (taskManager as unknown as { tasks: Map<string, unknown> }).tasks.set(t.id, { ...t, updated_at: t.updated_at || t.created_at });
      }
    }
  } catch { /* ignore */ }
});
</script>

<style scoped>
.task-panel { padding: 16px; height: 100%; overflow-y: auto; font-family: var(--font-body); }
.task-title { font-family: var(--font-serif); font-size: .9rem; color: var(--text-primary); margin-bottom: 12px; }

.task-stats { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
.stat-item { display: flex; align-items: center; gap: 4px; font-size: .62rem; color: var(--silver); }
.stat-dot { width: 6px; height: 6px; border-radius: 50%; }
.dot-todo { background: var(--silver); }
.dot-pending { background: var(--gold); }
.dot-running { background: var(--accent); }
.dot-done { background: var(--accent); }
.dot-failed { background: var(--error); }
.stat-count { font-family: var(--font-mono); }

.task-list { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; }
.task-card { padding: 10px; border-radius: 8px; background: var(--bg-surface); border: 1px solid var(--border-light); }
.task-card.task-running { border-left: 3px solid var(--accent); }
.task-card.task-done { opacity: .7; }
.task-card.task-failed { border-left: 3px solid var(--error); }
.task-header { display: flex; align-items: center; gap: 6px; margin-bottom: 4px; }
.task-state-icon { flex-shrink: 0; }
.task-card-title { font-size: .72rem; color: var(--text-primary); flex: 1; }
.task-priority { font-size: var(--text-xs); padding: 1px 6px; border-radius: 4px; }
.priority-low { background: var(--bg-active); color: var(--silver); }
.priority-medium { background: var(--bg-active); color: var(--gold); }
.priority-high { background: rgba(92,207,184,.15); color: var(--accent); }
.priority-urgent { background: rgba(239,68,68,.15); color: var(--error); }
.task-desc { font-size: .62rem; color: var(--silver); margin-bottom: 4px; }
.task-meta { display: flex; gap: 8px; font-size: var(--text-xs); color: var(--silver); }
.task-agent { font-family: var(--font-mono); }
.task-story { color: var(--gold); }
.task-empty { text-align: center; color: var(--silver); font-size: var(--text-sm); padding: 20px; }

.task-create { display: flex; gap: 6px; }
.task-input { flex: 1; padding: 6px 10px; border-radius: 6px; border: 1px solid var(--border-light); background: var(--bg-input, var(--bg-surface)); color: var(--text-primary); font-size: var(--text-sm); font-family: var(--font-body); }
.task-btn { padding: 6px 10px; border-radius: 6px; border: 1px solid var(--border-light); background: transparent; color: var(--accent); cursor: pointer; }
.task-btn:hover { background: var(--bg-active); }
</style>
