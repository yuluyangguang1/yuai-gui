<template>
  <div class="skills-panel" @dragover.prevent @drop="handleDrop">
    <!-- Header -->
    <div class="skills-header">
      <span class="skills-title">技 技能管理</span>
      <button class="skills-refresh" @click="skillsStore.loadSkills()" :disabled="skillsStore.loading">
        <TIcon name="refresh" :size="14" :class="{ 'spin': skillsStore.loading }" /> {{ skillsStore.loading ? '加载中...' : '刷新' }}
      </button>
    </div>

    <!-- Search -->
    <div class="skills-search-bar">
      <TIcon name="search" :size="14" />
      <input
        v-model="searchQuery"
        class="skills-search-input"
        placeholder="搜索技能名称或描述..."
        spellcheck="false"
      />
      <button v-if="searchQuery" class="skills-search-clear" @click="searchQuery = ''"><TIcon name="close" :size="12" /></button>
    </div>

    <!-- Stats Cards -->
    <div class="skills-stats">
      <div class="skills-stat-card">
        <span class="skills-stat-value">{{ overview.total }}</span>
        <span class="skills-stat-label">总计</span>
      </div>
      <div class="skills-stat-card">
        <span class="skills-stat-value">{{ overview.unique }}</span>
        <span class="skills-stat-label">唯一</span>
      </div>
      <div class="skills-stat-card">
        <span class="skills-stat-value skills-stat-ok">{{ overview.active }}</span>
        <span class="skills-stat-label">活跃</span>
      </div>
      <div class="skills-stat-card">
        <span class="skills-stat-value skills-stat-warn">{{ overview.dust }}</span>
        <span class="skills-stat-label">尘封</span>
      </div>
      <div class="skills-stat-card">
        <span class="skills-stat-value skills-stat-bad">{{ overview.issues }}</span>
        <span class="skills-stat-label">问题</span>
      </div>
      <div class="skills-stat-card skills-budget">
        <div class="skills-budget-bar">
          <div class="skills-budget-fill" :style="{ width: budgetPct + '%' }" />
        </div>
        <span class="skills-stat-label">{{ formatChars(overview.budget_chars) }} / {{ formatChars(overview.budget_limit) }}</span>
      </div>
    </div>

    <!-- Filters & Sort -->
    <div class="skills-toolbar">
      <div class="skills-filters">
        <button
          v-for="f in filters"
          :key="f.id"
          class="skills-filter-chip"
          :class="{ active: skillsStore.filter === f.id }"
          @click="skillsStore.filter = f.id"
        >{{ f.label }}</button>
      </div>
      <select class="skills-sort" v-model="skillsStore.sort">
        <option value="hits">触发次数</option>
        <option value="recent">最近触发</option>
        <option value="health">健康度</option>
        <option value="name">名称</option>
      </select>
    </div>

    <!-- Table -->
    <div class="skills-table">
      <div
        v-for="skill in displayItems"
        :key="skill.dir"
        class="skills-row"
        :class="{ disabled: skill.disabled, expanded: skillsStore.isRowOpen(skill.dir) }"
        draggable="true"
        @dragstart="handleDragStart($event, skill)"
      >
        <!-- Main Row -->
        <div class="skills-row-main" @click="skillsStore.toggleRow(skill.dir)">
          <span class="skills-dot" :class="skillsStore.healthDot(skill)" />
          <span class="skills-name">{{ skill.name }}</span>
          <span class="skills-desc">{{ skill.description || '无描述' }}</span>
          <span class="skills-source-tag" :class="'source-' + skill.source">{{ skill.label }}</span>
          <span class="skills-hits" :title="'触发 ' + skill.hits + ' 次'">{{ skill.hits }}</span>
          <span class="skills-last">{{ skillsStore.formatLastTriggered(skill.last) }}</span>
          <button
            class="skills-toggle"
            :class="{ off: skill.disabled }"
            @click.stop="handleToggle(skill)"
            :title="skill.disabled ? '启用此技能' : '禁用此技能'"
          >
            <span class="skills-toggle-dot" />
          </button>
          <span class="skills-chevron" :class="{ open: skillsStore.isRowOpen(skill.dir) }"><TIcon name="chevronRight" :size="14" /></span>
        </div>

        <!-- Expanded Content -->
        <div v-if="skillsStore.isRowOpen(skill.dir)" class="skills-row-detail">
          <div v-if="skill.description" class="skills-detail-desc">
            <strong>描述：</strong>{{ skill.description }}
          </div>
          <div v-if="skill.issues.length" class="skills-detail-issues">
            <strong>问题：</strong>
            <span v-for="issue in skill.issues" :key="issue" class="skills-issue-tag">{{ issue }}</span>
          </div>
          <div v-if="skill.copies.length > 1" class="skills-detail-copies">
            <strong>重复：</strong>
            <span v-for="copy in skill.copies" :key="copy" class="skills-copy-tag">{{ copy }}</span>
          </div>
          <div class="skills-detail-content">
            <strong>内容预览：</strong>
            <pre class="skills-content-preview">{{ skill.content.slice(0, 500) }}{{ skill.content.length > 500 ? '...' : '' }}</pre>
          </div>
          <div class="skills-detail-stats">
            <span class="skills-stat-item">触发 <b>{{ skill.hits }}</b> 次</span>
            <span class="skills-stat-item">最近 <b>{{ skillsStore.formatLastTriggered(skill.last) }}</b></span>
            <span class="skills-stat-item">来源 <b>{{ skill.label }}</b></span>
            <span class="skills-stat-item">大小 <b>{{ formatChars(skill.content.length) }}</b></span>
          </div>
          <div class="skills-detail-actions">
            <button class="skills-action-btn" @click.stop="handleTrash(skill)"><TIcon name="close" :size="14" /> 删除</button>
            <span class="skills-detail-dir">{{ skill.dir }}</span>
          </div>
        </div>
      </div>

      <div v-if="displayItems.length === 0" class="skills-empty">
        {{ skillsStore.loading ? '加载中...' : (searchQuery ? '未找到匹配的技能' : '没有找到技能') }}
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import { TIcon } from "../utils/icons";
import { useSkillsStore, type SkillInfo } from "../stores/skills";
import { ICONS } from "../utils/icons";

const emit = defineEmits<{
  "invoke-skill": [content: string];
}>();

const skillsStore = useSkillsStore();
const searchQuery = ref('');

const overview = computed(() => skillsStore.overview);

const budgetPct = computed(() => {
  const o = overview.value;
  return o.budget_limit > 0 ? Math.min(100, (o.budget_chars / o.budget_limit) * 100) : 0;
});

// Combine store filtering with local search
const displayItems = computed(() => {
  const items = skillsStore.filteredItems;
  if (!searchQuery.value.trim()) return items;
  const q = searchQuery.value.toLowerCase();
  return items.filter(s =>
    s.name.toLowerCase().includes(q) ||
    (s.description && s.description.toLowerCase().includes(q)) ||
    s.label.toLowerCase().includes(q)
  );
});

const filters = [
  { id: "all" as const, label: "全部" },
  { id: "claude" as const, label: "Claude" },
  { id: "codex" as const, label: "Codex" },
  { id: "project" as const, label: "项目" },
  { id: "dup" as const, label: "重复" },
  { id: "bad" as const, label: "问题" },
];

function formatChars(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K`;
  return `${n}`;
}

async function handleToggle(skill: SkillInfo) {
  try {
    await skillsStore.toggleSkill(skill.dir, skill.disabled);
  } catch (e) {
    console.error("切换技能状态失败:", e);
  }
}

async function handleTrash(skill: SkillInfo) {
  if (confirm(`确定删除技能「${skill.name}」？`)) {
    try {
      await skillsStore.trashSkill(skill.dir);
    } catch (e) {
      console.error("删除技能失败:", e);
    }
  }
}

function handleDragStart(event: DragEvent, skill: SkillInfo) {
  if (event.dataTransfer) {
    event.dataTransfer.setData("text/plain", skill.content);
    event.dataTransfer.setData("application/x-yuai-skill", skill.dir);
    event.dataTransfer.effectAllowed = "copy";
  }
}

function handleDrop(event: DragEvent) {
  // Handled by Terminal component
  event.preventDefault();
}

onMounted(() => {
  skillsStore.loadSkills();
});
</script>

<style scoped>
.skills-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  padding: 0;
  color: var(--text-primary);
}

.skills-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-light);
  flex-shrink: 0;
}

.skills-title {
  font-family: var(--font-brush);
  font-size: 1.1rem;
  color: var(--gold);
}

.skills-refresh {
  padding: 4px 12px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  font-size: 0.72rem;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.skills-refresh:hover:not(:disabled) {
  background: var(--bg-hover);
  border-color: var(--accent-muted);
  color: var(--accent);
}

.skills-refresh:disabled {
  opacity: 0.5;
  cursor: default;
}

/* Search */
.skills-search-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--border-light);
  flex-shrink: 0;
}

.skills-search-icon {
  color: var(--text-muted);
  font-size: 0.82rem;
  flex-shrink: 0;
}

.skills-search-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: var(--text-primary);
  font-size: 0.72rem;
  font-family: inherit;
  padding: 2px 0;
}

.skills-search-input::placeholder {
  color: var(--text-muted);
}

.skills-search-clear {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 0.72rem;
  padding: 2px 4px;
  border-radius: 3px;
  transition: all var(--transition-fast);
}

.skills-search-clear:hover {
  color: var(--text-primary);
  background: var(--bg-tertiary);
}

/* Stats */
.skills-stats {
  display: flex;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-light);
  flex-shrink: 0;
  overflow-x: auto;
}

.skills-stat-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 8px 14px;
  background: var(--bg-tertiary);
  border: 1px solid var(--border);
  border-radius: 6px;
  min-width: 60px;
}

.skills-stat-value {
  font-size: 1.1rem;
  font-weight: 600;
  font-family: var(--font-mono);
  color: var(--text-primary);
}

.skills-stat-ok { color: var(--accent); }
.skills-stat-warn { color: var(--gold); }
.skills-stat-bad { color: var(--error); }

.skills-stat-label {
  font-size: 0.62rem;
  color: var(--text-muted);
  letter-spacing: 0.5px;
}

.skills-budget {
  flex: 1;
  min-width: 120px;
  justify-content: center;
}

.skills-budget-bar {
  width: 100%;
  height: 4px;
  background: var(--bg-primary);
  border-radius: 2px;
  overflow: hidden;
  margin-bottom: 4px;
}

.skills-budget-fill {
  height: 100%;
  background: var(--accent);
  border-radius: 2px;
  transition: width 0.3s var(--ease-spring-fast);
}

/* Toolbar */
.skills-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  border-bottom: 1px solid var(--border-light);
  flex-shrink: 0;
  gap: 8px;
}

.skills-filters {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}

.skills-filter-chip {
  padding: 3px 10px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: transparent;
  color: var(--text-muted);
  font-size: 0.68rem;
  cursor: pointer;
  transition: all var(--transition-fast);
  white-space: nowrap;
}

.skills-filter-chip:hover {
  border-color: var(--accent-muted);
  color: var(--text-secondary);
}

.skills-filter-chip.active {
  border-color: var(--accent);
  background: rgba(92, 207, 184, 0.1);
  color: var(--accent);
}

.skills-sort {
  padding: 3px 8px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg-tertiary);
  color: var(--text-secondary);
  font-size: 0.68rem;
  cursor: pointer;
  outline: none;
}

.skills-sort:focus {
  border-color: var(--accent-muted);
}

/* Table */
.skills-table {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}

.skills-row {
  border-bottom: 1px solid var(--border-light);
  transition: background var(--transition-fast);
}

.skills-row:hover {
  background: var(--bg-hover);
}

.skills-row.disabled {
  opacity: 0.5;
}

.skills-row-main {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  cursor: pointer;
  user-select: none;
}

.skills-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.skills-dot.ok { background: var(--accent); }
.skills-dot.warn { background: var(--gold); }
.skills-dot.bad { background: var(--error); }

.skills-name {
  font-weight: 600;
  font-size: 0.82rem;
  color: var(--text-primary);
  min-width: 100px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.skills-desc {
  flex: 1;
  font-size: 0.72rem;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.skills-source-tag {
  padding: 1px 6px;
  border-radius: 3px;
  font-size: 0.6rem;
  font-weight: 500;
  white-space: nowrap;
  flex-shrink: 0;
}

.source-claude {
  background: color-mix(in srgb, var(--agent-mei) 15%, transparent);
  color: var(--agent-mei);
  border: 1px solid color-mix(in srgb, var(--agent-mei) 30%, transparent);
}

.source-codex {
  background: color-mix(in srgb, var(--agent-lan) 15%, transparent);
  color: var(--agent-lan);
  border: 1px solid color-mix(in srgb, var(--agent-lan) 30%, transparent);
}

.source-project {
  background: rgba(92, 207, 184, 0.15);
  color: var(--accent);
  border: 1px solid rgba(92, 207, 184, 0.3);
}

.source-plugin {
  background: color-mix(in srgb, var(--agent-ju) 15%, transparent);
  color: var(--agent-ju);
  border: 1px solid color-mix(in srgb, var(--agent-ju) 30%, transparent);
}

.skills-hits {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  color: var(--text-secondary);
  min-width: 36px;
  text-align: right;
  flex-shrink: 0;
}

.skills-last {
  font-size: 0.68rem;
  color: var(--text-muted);
  min-width: 60px;
  text-align: right;
  flex-shrink: 0;
}

.skills-toggle {
  width: 32px;
  height: 18px;
  border-radius: 9px;
  border: 1px solid var(--border);
  background: var(--accent);
  position: relative;
  cursor: pointer;
  transition: all var(--transition-fast);
  flex-shrink: 0;
  padding: 0;
}

.skills-toggle.off {
  background: var(--bg-primary);
  border-color: var(--text-muted);
}

.skills-toggle-dot {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--text-inverse);
  transition: transform var(--transition-fast);
}

.skills-toggle:not(.off) .skills-toggle-dot {
  transform: translateX(14px);
}

.skills-chevron {
  font-size: 0.72rem;
  color: var(--text-muted);
  transition: transform var(--transition-fast);
  flex-shrink: 0;
}

.skills-chevron.open {
  transform: rotate(90deg);
}

/* Expanded Detail */
.skills-row-detail {
  padding: 12px 16px 12px 32px;
  background: var(--bg-tertiary);
  border-top: 1px solid var(--border-light);
  font-size: 0.72rem;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.skills-detail-desc {
  color: var(--text-secondary);
}

.skills-detail-desc strong,
.skills-detail-issues strong,
.skills-detail-copies strong,
.skills-detail-content strong {
  color: var(--text-muted);
  font-weight: 500;
}

.skills-detail-issues {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.skills-issue-tag {
  padding: 1px 6px;
  border-radius: 3px;
  background: var(--error-soft);
  color: var(--error);
  border: 1px solid color-mix(in srgb, var(--error) 30%, transparent);
  font-size: 0.62rem;
}

.skills-detail-copies {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.skills-copy-tag {
  padding: 1px 6px;
  border-radius: 3px;
  background: rgba(201, 168, 92, 0.15);
  color: var(--gold);
  border: 1px solid rgba(201, 168, 92, 0.3);
  font-size: 0.62rem;
}

.skills-detail-content {
  color: var(--text-muted);
}

.skills-content-preview {
  margin-top: 4px;
  padding: 8px;
  background: var(--bg-primary);
  border: 1px solid var(--border);
  border-radius: 4px;
  font-family: var(--font-mono);
  font-size: 0.65rem;
  line-height: 1.5;
  max-height: 120px;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--text-secondary);
}

.skills-detail-stats {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.skills-stat-item {
  font-size: 0.68rem;
  color: var(--text-muted);
}

.skills-stat-item b {
  color: var(--text-secondary);
  font-weight: 600;
}

.skills-detail-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 4px;
}

.skills-action-btn {
  padding: 3px 10px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg-secondary);
  color: var(--text-secondary);
  font-size: 0.68rem;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.skills-action-btn:hover {
  border-color: var(--error);
  color: var(--error);
  background: var(--error-soft);
}

.skills-detail-dir {
  font-family: var(--font-mono);
  font-size: 0.6rem;
  color: var(--text-muted);
  opacity: 0.6;
}

/* Empty */
.skills-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px;
  color: var(--text-muted);
  font-size: 0.82rem;
}
</style>
