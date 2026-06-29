<template>
  <div class="kb-panel">
    <div class="kb-header">
      <span class="kb-title">板 看板</span>
      <button class="kb-add-btn" @click="showCreate = !showCreate">+ 新建</button>
    </div>

    <!-- Create card form -->
    <div v-if="showCreate" class="kb-create-form">
      <input v-model="newTitle" class="kb-input" placeholder="任务标题" @keydown.enter="createCard" />
      <input v-model="newAssignee" class="kb-input" placeholder="负责人（可选）" />
      <select v-model="newPriority" class="kb-select">
        <option :value="0">普通</option>
        <option :value="1">低</option>
        <option :value="2">中</option>
        <option :value="3">高</option>
      </select>
      <button class="kb-create-btn" :disabled="!newTitle.trim()" @click="createCard">创建</button>
    </div>

    <!-- Columns -->
    <div class="kb-columns">
      <div
        v-for="col in displayColumns"
        :key="col.status"
        class="kb-column"
        @dragover.prevent
        @drop="onDrop($event, col.status)"
      >
        <div class="kb-col-header">
          <span class="kb-col-icon" :style="{ color: col.color }">{{ col.icon }}</span>
          <span class="kb-col-label">{{ col.label }}</span>
          <span class="kb-col-count">{{ (store.tasksByStatus[col.status] || []).length }}</span>
        </div>
        <div class="kb-col-body">
          <div
            v-for="task in store.tasksByStatus[col.status]"
            :key="task.id"
            class="kb-card"
            :class="{ 'kb-card-selected': store.selectedTaskId === task.id }"
            draggable="true"
            @dragstart="onDragStart($event, task)"
            @click="store.selectedTaskId = task.id"
          >
            <div class="kb-card-title">{{ task.title }}</div>
            <div v-if="task.body" class="kb-card-desc">{{ task.body }}</div>
            <div class="kb-card-meta">
              <span v-if="task.assignee" class="kb-assignee">{{ task.assignee }}</span>
              <span v-if="task.priority > 0" class="kb-priority" :class="'kb-priority-' + task.priority">
                {{ task.priority === 3 ? '高' : task.priority === 2 ? '中' : '低' }}
              </span>
              <span class="kb-card-time">{{ store.timeAgo(task.created_at) }}</span>
            </div>
          </div>
          <div v-if="!(store.tasksByStatus[col.status] || []).length" class="kb-col-empty">暂无</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { useKanbanStore, KANBAN_STATUS_LABELS, KANBAN_STATUS_ICONS, KANBAN_STATUS_COLORS } from '../stores/kanban';
import type { KanbanTask, KanbanTaskStatus } from '../stores/kanban';

const store = useKanbanStore();

const showCreate = ref(false);
const newTitle = ref('');
const newAssignee = ref('');
const newPriority = ref(0);

// Display only the 4 requested columns
const displayColumns = [
  { status: 'todo' as KanbanTaskStatus, label: '待办', icon: 'circle', color: KANBAN_STATUS_COLORS.todo },
  { status: 'running' as KanbanTaskStatus, label: '进行中', icon: 'loader', color: KANBAN_STATUS_COLORS.running },
  { status: 'review' as KanbanTaskStatus, label: '审查', icon: 'eye', color: KANBAN_STATUS_COLORS.review },
  { status: 'done' as KanbanTaskStatus, label: '完成', icon: 'check', color: KANBAN_STATUS_COLORS.done },
];

onMounted(() => store.refreshAll());

async function createCard() {
  if (!newTitle.value.trim()) return;
  await store.createTask({
    title: newTitle.value.trim(),
    assignee: newAssignee.value.trim() || undefined,
    priority: newPriority.value,
  });
  newTitle.value = '';
  newAssignee.value = '';
  newPriority.value = 0;
  showCreate.value = false;
}

function onDragStart(e: DragEvent, task: KanbanTask) {
  e.dataTransfer?.setData('text/plain', task.id);
  e.dataTransfer?.setDragImage(e.target as HTMLElement, 0, 0);
}

async function onDrop(e: DragEvent, targetStatus: KanbanTaskStatus) {
  const taskId = e.dataTransfer?.getData('text/plain');
  if (!taskId) return;
  const task = store.tasks.find(t => t.id === taskId);
  if (!task || task.status === targetStatus) return;

  // Move task to target column
  if (targetStatus === 'done') {
    await store.completeTasks([taskId]);
  } else if (targetStatus === 'review') {
    // Use invoke directly to move to review
    await invoke('kanban_update_task', { taskId, data: { status: 'review' } });
    task.status = 'review';
    await store.fetchStats();
  } else {
    await invoke('kanban_update_task', { taskId, data: { status: targetStatus } });
    task.status = targetStatus;
    await store.fetchStats();
  }
}
</script>

<style scoped>
.kb-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 12px;
  gap: 10px;
  overflow: hidden;
}

.kb-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}

.kb-title {
  font-family: var(--font-brush);
  font-size: 1.2rem;
  color: var(--gold);
}

.kb-add-btn {
  background: none;
  border: 1px solid var(--border);
  color: var(--accent);
  border-radius: var(--radius-sm);
  padding: 3px 10px;
  font-size: 0.75rem;
  cursor: pointer;
}
.kb-add-btn:hover { border-color: var(--accent); background: rgba(92, 207, 184, 0.1); }

.kb-create-form {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.kb-input {
  flex: 1;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  color: var(--text-primary);
  border-radius: var(--radius-sm);
  padding: 5px 8px;
  font-size: 0.75rem;
  font-family: var(--font-body);
  outline: none;
}
.kb-input:focus { border-color: var(--accent); }

.kb-select {
  background: var(--bg-primary);
  border: 1px solid var(--border);
  color: var(--text-primary);
  border-radius: var(--radius-sm);
  padding: 5px 6px;
  font-size: 0.75rem;
  outline: none;
}

.kb-create-btn {
  background: var(--accent);
  color: var(--text-inverse);
  border: none;
  border-radius: var(--radius-sm);
  padding: 5px 12px;
  font-size: 0.75rem;
  cursor: pointer;
  font-weight: 500;
}
.kb-create-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.kb-columns {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  flex: 1;
  overflow: hidden;
  min-height: 0;
}

.kb-column {
  display: flex;
  flex-direction: column;
  background: var(--bg-secondary);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  overflow: hidden;
  min-height: 0;
}

.kb-col-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border-light);
  flex-shrink: 0;
}

.kb-col-icon { font-size: 0.85rem; }
.kb-col-label { font-size: 0.78rem; color: var(--text-primary); font-weight: 500; }
.kb-col-count {
  margin-left: auto;
  font-size: 0.68rem;
  color: var(--text-muted);
  background: var(--bg-surface);
  padding: 0 5px;
  border-radius: 8px;
}

.kb-col-body {
  flex: 1;
  overflow-y: auto;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.kb-col-empty {
  color: var(--text-muted);
  font-size: 0.7rem;
  text-align: center;
  padding: 16px 0;
  opacity: 0.6;
}

.kb-card {
  background: var(--bg-surface);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  padding: 8px 10px;
  cursor: grab;
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
}
.kb-card:hover { border-color: var(--border); }
.kb-card-selected { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent-muted); }
.kb-card:active { cursor: grabbing; }

.kb-card-title {
  font-size: 0.78rem;
  color: var(--text-primary);
  font-weight: 500;
  margin-bottom: 2px;
  line-height: 1.3;
}

.kb-card-desc {
  font-size: 0.68rem;
  color: var(--text-muted);
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.kb-card-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 0.65rem;
}

.kb-assignee {
  background: var(--bg-hover);
  color: var(--accent);
  padding: 1px 5px;
  border-radius: var(--radius-sm);
}

.kb-priority {
  padding: 1px 4px;
  border-radius: var(--radius-sm);
  font-weight: 500;
}
.kb-priority-1 { color: #60a5fa; }
.kb-priority-2 { color: #f59e0b; }
.kb-priority-3 { color: #ef4444; }

.kb-card-time {
  margin-left: auto;
  color: var(--text-muted);
}
</style>
