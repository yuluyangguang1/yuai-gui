<template>
  <div class="agent-browser">
    <!-- 搜索栏 -->
    <div class="browser-search">
      <TIcon name="search" :size="16" />
      <input
        v-model="searchQuery"
        class="search-input"
        placeholder="搜索 232 个专业 Agent..."
        @input="onSearch"
      />
      <span class="search-count">{{ filteredAgents.length }} 个</span>
    </div>

    <!-- 部门过滤 -->
    <div class="browser-divisions">
      <button
        class="division-btn"
        :class="{ active: selectedDivision === 'all' }"
        @click="selectedDivision = 'all'"
      >全部</button>
      <button
        v-for="div in divisions"
        :key="div.id"
        class="division-btn"
        :class="{ active: selectedDivision === div.id }"
        @click="selectedDivision = div.id"
      >{{ div.label }} ({{ div.count }})</button>
    </div>

    <!-- Agent 列表 -->
    <div class="browser-list">
      <div
        v-for="agent in displayedAgents"
        :key="agent.id"
        class="agent-card"
        @click="selectAgent(agent)"
      >
        <div class="card-header">
          <span class="agent-emoji">{{ agent.emoji }}</span>
          <div class="agent-info">
            <span class="agent-name">{{ agent.name }}</span>
            <span class="agent-division">{{ getDivisionLabel(agent.division) }}</span>
          </div>
          <span class="agent-color" :style="{ background: agent.color }"></span>
        </div>
        <p class="agent-vibe">{{ agent.vibe }}</p>
        <p class="agent-desc">{{ agent.description }}</p>
      </div>
    </div>

    <!-- 加载更多 -->
    <button
      v-if="displayedAgents.length < filteredAgents.length"
      class="load-more"
      @click="loadMore"
    >
      <TIcon name="chevronDown" :size="14" />
      加载更多 ({{ filteredAgents.length - displayedAgents.length }} 个)
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { TIcon } from '../utils/icons'
import { searchBuiltinAgents, type BuiltinAgent, type BuiltinAgentIndex } from '../utils/builtin-agents'

const emit = defineEmits<{
  select: [agent: BuiltinAgent]
}>()

const index = ref<BuiltinAgentIndex | null>(null)
const searchQuery = ref('')
const selectedDivision = ref('all')
const pageSize = 20
const currentPage = ref(1)

// 加载索引
onMounted(async () => {
  try {
    const response = await fetch('/agency/index.json')
    index.value = await response.json()
  } catch (e) {
    console.error('Failed to load builtin agents:', e)
  }
})

// 部门列表
const divisions = computed(() => index.value?.divisions ?? [])

// 搜索结果
const filteredAgents = computed(() => {
  if (!index.value) return []

  let agents = index.value.agents

  // 按部门过滤
  if (selectedDivision.value !== 'all') {
    agents = agents.filter(a => a.div === selectedDivision.value)
  }

  // 按搜索词过滤
  if (searchQuery.value.trim()) {
    agents = searchBuiltinAgents(agents, searchQuery.value)
  }

  return agents
})

// 显示的 Agent（分页）
const displayedAgents = computed(() => {
  return filteredAgents.value.slice(0, currentPage.value * pageSize)
})

function getDivisionLabel(division: string): string {
  return index.value?.divisions.find(d => d.id === division)?.label ?? division
}

function onSearch() {
  currentPage.value = 1
}

function loadMore() {
  currentPage.value++
}

function selectAgent(agent: BuiltinAgent) {
  emit('select', agent)
}
</script>

<style scoped>
.agent-browser {
  display: flex;
  flex-direction: column;
  gap: 12px;
  height: 100%;
  overflow-y: auto;
}

.browser-search {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--bg-surface);
  border: 1px solid var(--border-light);
  border-radius: 8px;
}

.search-input {
  flex: 1;
  background: none;
  border: none;
  color: var(--text-primary);
  font-size: 13px;
  outline: none;
}

.search-count {
  font-size: 11px;
  color: var(--text-muted);
  white-space: nowrap;
}

.browser-divisions {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.division-btn {
  padding: 4px 8px;
  font-size: 11px;
  background: var(--bg-surface);
  border: 1px solid var(--border-light);
  border-radius: 4px;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s;
}

.division-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.division-btn.active {
  background: var(--accent);
  color: var(--text-inverse);
  border-color: var(--accent);
}

.browser-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.agent-card {
  padding: 10px 12px;
  background: var(--bg-surface);
  border: 1px solid var(--border-light);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s;
}

.agent-card:hover {
  border-color: var(--accent);
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.agent-emoji {
  font-size: 20px;
}

.agent-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.agent-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.agent-division {
  font-size: 10px;
  color: var(--text-muted);
}

.agent-color {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.agent-vibe {
  font-size: 11px;
  color: var(--accent);
  margin: 0 0 4px 0;
  font-style: italic;
}

.agent-desc {
  font-size: 11px;
  color: var(--text-muted);
  margin: 0;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.load-more {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 8px;
  background: var(--bg-surface);
  border: 1px solid var(--border-light);
  border-radius: 8px;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 12px;
}

.load-more:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}
</style>
