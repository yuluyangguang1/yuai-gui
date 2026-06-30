<template>
  <div class="model-selector" ref="containerRef">
    <!-- Trigger Button -->
    <button class="selector-trigger" @click="toggleDropdown" :title="currentModelLabel">
      <TIcon name="cpu" :size="12" />
      <span class="trigger-name">{{ currentModelLabel }}</span>
      <TIcon name="chevronDown" :size="10" :class="{ open: isOpen }" />
    </button>

    <!-- Dropdown -->
    <div v-if="isOpen" class="selector-dropdown">
      <!-- Search -->
      <div class="selector-search">
        <TIcon name="search" :size="14" />
        <input
          ref="searchInput"
          v-model="searchQuery"
          placeholder="搜索模型... (支持别名: sonnet, gpt5, mimo)"
          @keydown.escape="isOpen = false"
          @input="onSearchInput"
        />
        <button class="refresh-btn" @click="refreshModels" :disabled="refreshing" title="刷新模型列表">
          <TIcon name="refresh" :size="14" :class="{ spinning: refreshing }" />
        </button>
      </div>

      <!-- Model Groups -->
      <div class="selector-groups">
        <div v-for="group in filteredGroups" :key="group.provider_id" class="model-group">
          <div class="group-header" @click="toggleGroup(group.provider_id)">
            <TIcon :name="expandedGroups.has(group.provider_id) ? 'chevronDown' : 'chevronRight'" :size="12" />
            <span class="group-name">{{ group.provider_name }}</span>
            <span class="group-count">{{ group.models.length }}</span>
            <span v-if="group.provider_id === store.activeProviderId" class="group-active-badge">当前</span>
          </div>
          <div v-if="expandedGroups.has(group.provider_id)" class="group-models">
            <button
              v-for="model in group.models"
              :key="model.id"
              class="model-item"
              :class="{
                active: model.id === store.activeModelId && model.provider_id === store.activeProviderId,
              }"
              @click="selectModel(model)"
            >
              <span class="model-name">{{ model.name }}</span>
              <span v-if="model.aliases.length" class="model-alias">{{ model.aliases[0] }}</span>
              <span v-if="model.context_length" class="model-context">{{ formatContext(model.context_length) }}</span>
              <span v-if="model.supports_vision" class="model-badge vision" title="支持视觉">视觉</span>
              <span v-if="model.supports_tools" class="model-badge tools" title="支持工具调用">工具</span>
            </button>
          </div>
        </div>

        <div v-if="filteredGroups.length === 0 && searchQuery" class="selector-empty">
          无匹配模型
        </div>
      </div>

      <!-- Custom Model Input -->
      <div class="selector-custom">
        <input
          v-model="customModelId"
          placeholder="输入自定义模型 ID..."
          @keydown.enter="addCustomModel"
        />
        <button @click="addCustomModel" :disabled="!customModelId.trim()">
          <TIcon name="plus" :size="14" />
        </button>
      </div>

      <!-- Registry Stats -->
      <div class="selector-footer">
        <span class="registry-stats">models.dev: {{ registryStats.providers }} 供应商, {{ registryStats.models }} 模型</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import { TIcon } from '../utils/icons'
import { useProviderStore } from '../stores/provider'
import { getRegistryStats, searchModels, fetchModelsDev } from '../utils/models-dev'
import type { ModelDef } from '../stores/provider'

const store = useProviderStore()
const containerRef = ref<HTMLElement | null>(null)
const searchInput = ref<HTMLInputElement | null>(null)
const isOpen = ref(false)
const searchQuery = ref('')
const customModelId = ref('')
const refreshing = ref(false)
const expandedGroups = ref(new Set<string>())

// ─── Model Groups ───

interface ModelGroup {
  provider_id: string
  provider_name: string
  models: ModelDef[]
}

const allGroups = computed<ModelGroup[]>(() => {
  const groups = new Map<string, ModelGroup>()
  for (const provider of store.allProviders) {
    const models = store.models.filter(m => m.provider_id === provider.id)
    if (models.length > 0) {
      groups.set(provider.id, {
        provider_id: provider.id,
        provider_name: provider.name,
        models,
      })
    }
  }
  return Array.from(groups.values())
})

const filteredGroups = computed(() => {
  const q = searchQuery.value.toLowerCase().trim()
  if (!q) return allGroups.value

  return allGroups.value
    .map(group => ({
      ...group,
      models: group.models.filter(m =>
        m.id.toLowerCase().includes(q) ||
        m.name.toLowerCase().includes(q) ||
        m.aliases.some(a => a.toLowerCase().includes(q))
      ),
    }))
    .filter(group => group.models.length > 0)
})

const currentModelLabel = computed(() => {
  const model = store.activeModel
  if (!model) return '选择模型'
  return model.name
})

const registryStats = computed(() => getRegistryStats())

// ─── Actions ───

function toggleDropdown() {
  isOpen.value = !isOpen.value
  if (isOpen.value) {
    nextTick(() => searchInput.value?.focus())
    // 默认展开当前供应商的组
    if (store.activeProviderId) {
      expandedGroups.value.add(store.activeProviderId)
    }
  }
}

function toggleGroup(providerId: string) {
  if (expandedGroups.value.has(providerId)) {
    expandedGroups.value.delete(providerId)
  } else {
    expandedGroups.value.add(providerId)
  }
}

function selectModel(model: ModelDef) {
  store.switchModel(model.id)
  isOpen.value = false
  searchQuery.value = ''
}

function onSearchInput(e: Event) {
  const val = (e.target as HTMLInputElement).value
  // 尝试别名解析
  const resolved = store.resolveAlias(val)
  if (resolved) {
    store.switchProvider(resolved.provider_id)
    store.switchModel(resolved.model_id)
    isOpen.value = false
    searchQuery.value = ''
  }
}

async function refreshModels() {
  refreshing.value = true
  try {
    await fetchModelsDev(true) // force refresh
    await store.syncModelsDev()
  } finally {
    setTimeout(() => { refreshing.value = false }, 600)
  }
}

function addCustomModel() {
  const id = customModelId.value.trim()
  if (!id) return
  // 检查是否已存在
  if (store.models.find(m => m.id === id)) {
    store.switchModel(id)
    isOpen.value = false
    customModelId.value = ''
    return
  }
  // 添加到当前供应商
  store.models.push({
    id,
    name: id,
    provider_id: store.activeProviderId,
    aliases: [],
    supports_vision: false,
    supports_tools: true,
  })
  store.switchModel(id)
  isOpen.value = false
  customModelId.value = ''
}

function formatContext(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`
  if (tokens >= 1_000) return `${Math.round(tokens / 1_000)}K`
  return String(tokens)
}

// ─── Outside Click ───

function handleClickOutside(e: MouseEvent) {
  if (containerRef.value && !containerRef.value.contains(e.target as Node)) {
    isOpen.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
  // 初始化时加载 models.dev
  store.syncModelsDev()
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<style scoped>
.model-selector {
  position: relative;
  display: inline-block;
}

.selector-trigger {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  background: transparent;
  border: 1px solid var(--border-light);
  border-radius: 4px;
  color: var(--text-muted);
  font-size: .58rem;
  font-family: var(--font-mono);
  cursor: pointer;
  transition: all .15s;
  white-space: nowrap;
}
.selector-trigger:hover { border-color: var(--accent); color: var(--accent); }
.trigger-name { max-width: 100px; overflow: hidden; text-overflow: ellipsis; }

.selector-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  z-index: 200;
  width: 360px;
  max-height: 480px;
  background: var(--bg-surface);
  border: 1px solid var(--border-light);
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0,0,0,.4);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* Search */
.selector-search {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border-light);
  color: var(--text-muted);
}
.selector-search input {
  flex: 1;
  background: transparent;
  border: none;
  color: var(--bone);
  font-family: var(--font-mono);
  font-size: .62rem;
  outline: none;
}
.selector-search input::placeholder { color: var(--silver); }
.refresh-btn {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 2px;
  transition: color .15s;
}
.refresh-btn:hover { color: var(--accent); }
.spinning { animation: spin .8s linear infinite; }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

/* Groups */
.selector-groups {
  flex: 1;
  overflow-y: auto;
  max-height: 340px;
}

.model-group { border-bottom: 1px solid var(--border-light); }
.group-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  cursor: pointer;
  color: var(--text-secondary);
  font-size: .62rem;
  font-weight: 500;
  transition: background .1s;
}
.group-header:hover { background: var(--bg-hover); }
.group-name { flex: 1; }
.group-count {
  font-size: .5rem;
  color: var(--silver);
  font-family: var(--font-mono);
}
.group-active-badge {
  font-size: .48rem;
  padding: 1px 4px;
  border-radius: 3px;
  background: rgba(92,200,120,.12);
  color: var(--jade);
}

.group-models { padding: 0 0 4px 0; }
.model-item {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 5px 10px 5px 28px;
  background: transparent;
  border: none;
  color: var(--bone-dim);
  font-size: .6rem;
  cursor: pointer;
  text-align: left;
  transition: background .1s;
}
.model-item:hover { background: var(--bg-hover); }
.model-item.active { color: var(--jade); background: rgba(92,200,120,.06); }
.model-name { flex: 1; font-family: var(--font-body); }
.model-alias { font-size: .5rem; color: var(--silver); }
.model-context { font-size: .5rem; color: var(--silver); font-family: var(--font-mono); }
.model-badge {
  font-size: .45rem;
  padding: 1px 3px;
  border-radius: 2px;
  font-family: var(--font-mono);
}
.model-badge.vision { background: rgba(100,181,246,.12); color: #64b5f6; }
.model-badge.tools { background: rgba(92,200,120,.12); color: var(--jade); }

.selector-empty {
  padding: 16px;
  text-align: center;
  color: var(--silver);
  font-size: .62rem;
}

/* Custom Model */
.selector-custom {
  display: flex;
  gap: 4px;
  padding: 6px 10px;
  border-top: 1px solid var(--border-light);
}
.selector-custom input {
  flex: 1;
  padding: 4px 8px;
  background: var(--bg-primary);
  border: 1px solid var(--border-light);
  border-radius: 4px;
  color: var(--bone);
  font-family: var(--font-mono);
  font-size: .58rem;
  outline: none;
}
.selector-custom input:focus { border-color: var(--accent); }
.selector-custom button {
  padding: 4px 8px;
  background: transparent;
  border: 1px solid var(--border-light);
  border-radius: 4px;
  color: var(--accent);
  cursor: pointer;
  transition: all .15s;
}
.selector-custom button:hover:not(:disabled) { background: rgba(92,200,120,.08); }
.selector-custom button:disabled { opacity: .4; cursor: not-allowed; }

/* Footer */
.selector-footer {
  padding: 4px 10px;
  border-top: 1px solid var(--border-light);
}
.registry-stats {
  font-size: .48rem;
  color: var(--silver);
  font-family: var(--font-mono);
}
</style>
