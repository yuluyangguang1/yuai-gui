<template>
  <Transition name="slash-menu">
    <div v-if="visible" class="slash-menu" :style="menuStyle" role="listbox" aria-label="命令列表">
      <div class="slash-menu-header">
        <TIcon name="terminal" :size="14" />
        <span>Slash Commands</span>
      </div>
      <div class="slash-menu-search">
        <input
          ref="searchInput"
          v-model="searchQuery"
          class="slash-search-input"
          placeholder="搜索命令..."
          @keydown.escape="close"
          @keydown.enter="selectFirst"
          @keydown.up.prevent="navigateUp"
          @keydown.down.prevent="navigateDown"
        />
      </div>
      <div class="slash-menu-list">
        <div
          v-for="(cmd, index) in filteredCommands"
          :key="cmd.id"
          class="slash-menu-item"
          :class="{ active: index === selectedIndex }"
          @click="selectCommand(cmd)"
          @mouseenter="selectedIndex = index"
        >
          <div class="slash-item-icon">
            <TIcon :name="cmd.icon" :size="16" />
          </div>
          <div class="slash-item-info">
            <span class="slash-item-name">/{{ cmd.name }}</span>
            <span class="slash-item-desc">{{ cmd.description }}</span>
          </div>
          <span class="slash-item-category">{{ categoryLabel(cmd.category) }}</span>
        </div>
        <div v-if="filteredCommands.length === 0" class="slash-menu-empty">
          无匹配命令
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { TIcon } from '../utils/icons'
import type { SlashCommand } from '../utils/slash-commands'

const props = defineProps<{
  commands: SlashCommand[]
  position: { top: number; left: number }
}>()

const emit = defineEmits<{
  select: [command: SlashCommand]
  close: []
}>()

const visible = defineModel<boolean>('visible', { default: false })
const searchQuery = ref('')
const selectedIndex = ref(0)
const searchInput = ref<HTMLInputElement>()

const filteredCommands = computed(() => {
  if (!searchQuery.value) return props.commands
  const q = searchQuery.value.toLowerCase()
  return props.commands.filter(
    c => c.name.includes(q) || c.description.includes(q)
  )
})

const menuStyle = computed(() => ({
  bottom: `${props.position.top + 8}px`,
  left: `${props.position.left}px`,
}))

watch(visible, (v) => {
  if (v) {
    searchQuery.value = ''
    selectedIndex.value = 0
    nextTick(() => searchInput.value?.focus())
  }
})

function categoryLabel(cat: string): string {
  const labels: Record<string, string> = {
    code: '代码',
    writing: '写作',
    analysis: '分析',
    tool: '工具',
  }
  return labels[cat] ?? cat
}

function navigateUp() {
  selectedIndex.value = Math.max(0, selectedIndex.value - 1)
}

function navigateDown() {
  selectedIndex.value = Math.min(filteredCommands.value.length - 1, selectedIndex.value + 1)
}

function selectFirst() {
  if (filteredCommands.value.length > 0) {
    selectCommand(filteredCommands.value[selectedIndex.value])
  }
}

function selectCommand(cmd: SlashCommand) {
  emit('select', cmd)
  visible.value = false
}

function close() {
  visible.value = false
  emit('close')
}
</script>

<style scoped>
.slash-menu {
  position: absolute;
  z-index: 1000;
  width: 320px;
  max-height: 360px;
  background: var(--bg-surface);
  border: 1px solid var(--border-light);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.slash-menu-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  font-size: 11px;
  color: var(--text-muted);
  border-bottom: 1px solid var(--border-light);
}

.slash-menu-search {
  padding: 6px 8px;
  border-bottom: 1px solid var(--border-light);
}

.slash-search-input {
  width: 100%;
  padding: 6px 8px;
  background: var(--bg-primary);
  border: 1px solid var(--border-light);
  border-radius: 6px;
  color: var(--text-primary);
  font-size: 12px;
  outline: none;
}

.slash-search-input:focus {
  border-color: var(--accent);
}

.slash-menu-list {
  overflow-y: auto;
  padding: 4px;
}

.slash-menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
}

.slash-menu-item:hover,
.slash-menu-item.active {
  background: var(--bg-hover);
}

.slash-item-icon {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  background: var(--bg-primary);
  color: var(--accent);
  flex-shrink: 0;
}

.slash-item-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.slash-item-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  font-family: var(--font-mono);
}

.slash-item-desc {
  font-size: 11px;
  color: var(--text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.slash-item-category {
  font-size: 10px;
  color: var(--text-muted);
  padding: 2px 6px;
  background: var(--bg-primary);
  border-radius: 4px;
  flex-shrink: 0;
}

.slash-menu-empty {
  padding: 16px;
  text-align: center;
  color: var(--text-muted);
  font-size: 12px;
}

/* 动画 */
.slash-menu-enter-active,
.slash-menu-leave-active {
  transition: opacity 0.15s, transform 0.15s;
}

.slash-menu-enter-from,
.slash-menu-leave-to {
  opacity: 0;
  transform: translateY(4px);
}
</style>
