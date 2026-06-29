<template>
  <Teleport to="body">
    <!-- Slash command suggestions (/) -->
    <Transition name="suggest-fade">
      <div
        v-if="commandState.visible"
        class="command-suggest"
        :style="commandState.position"
      >
        <div class="suggest-header">
          <TIcon name="command" :size="12" />
          <span class="suggest-title">命令</span>
          <span class="suggest-count">{{ commandState.items.length }}</span>
        </div>
        <div class="suggest-list" ref="commandListRef">
          <div
            v-for="(item, index) in commandState.items"
            :key="item.name"
            class="suggest-item"
            :class="{ active: index === commandState.selectedIndex }"
            @click="selectCommand(item)"
            @mouseenter="commandState.selectedIndex = index"
          >
            <span class="suggest-item-name">/{{ item.name }}</span>
            <span class="suggest-item-args" v-if="item.argsHint">{{ item.argsHint }}</span>
            <span class="suggest-item-desc">{{ item.description }}</span>
            <span class="suggest-item-aliases" v-if="item.aliases?.length">
              {{ item.aliases.map(a => '/' + a).join(' ') }}
            </span>
          </div>
        </div>
        <div class="suggest-footer">
          <span class="suggest-key">↑↓</span> 导航
          <span class="suggest-key">Tab</span> 补全
          <span class="suggest-key">Enter</span> 选择
          <span class="suggest-key">Esc</span> 关闭
        </div>
      </div>
    </Transition>

    <!-- Flag suggestions (--) -->
    <Transition name="suggest-fade">
      <div
        v-if="flagState.visible"
        class="command-suggest flag-suggest"
        :style="flagState.position"
      >
        <div class="suggest-header">
          <TIcon name="flag" :size="12" />
          <span class="suggest-title">标志</span>
        </div>
        <div class="suggest-list">
          <div
            v-for="(item, index) in flagState.items"
            :key="item.name"
            class="suggest-item"
            :class="{ active: index === flagState.selectedIndex }"
            @click="selectFlag(item)"
            @mouseenter="flagState.selectedIndex = index"
          >
            <span class="suggest-item-name">--{{ item.name }}</span>
            <span class="suggest-item-short" v-if="item.short">-{{ item.short }}</span>
            <span class="suggest-item-type">{{ item.type }}</span>
            <span class="suggest-item-desc">{{ item.description }}</span>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Subcommand suggestions -->
    <Transition name="suggest-fade">
      <div
        v-if="subState.visible"
        class="command-suggest sub-suggest"
        :style="subState.position"
      >
        <div class="suggest-header">
          <span class="suggest-icon"><TIcon name="chevronRight" :size="12" /></span>
          <span class="suggest-title">/{{ subState.commandName }}</span>
          <span class="suggest-item-desc">{{ subState.commandDesc }}</span>
        </div>
        <div class="suggest-list">
          <div
            v-for="(sub, index) in subState.items"
            :key="sub"
            class="suggest-item"
            :class="{ active: index === subState.selectedIndex }"
            @click="selectSubcommand(sub)"
            @mouseenter="subState.selectedIndex = index"
          >
            <span class="suggest-item-name">{{ sub }}</span>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { reactive, ref, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { TIcon } from "../utils/icons";
import type { AgentId, CommandDef, FlagDef } from '../utils/agentCommands'
import {
  filterCommands, filterFlags, findCommand, allCommands, allFlags
} from '../utils/agentCommands'

// ── Props ──

const props = defineProps<{
  /** Current agent for filtering commands */
  agentId: AgentId
  /** The textarea element to attach to */
  textarea?: HTMLTextAreaElement | null
}>()

const emit = defineEmits<{
  /** Emitted when a command/flag/subcommand is selected */
  (e: 'select', value: string): void
  /** Emitted when suggestion is dismissed */
  (e: 'dismiss'): void
}>()

// ── State ──

const commandListRef = ref<HTMLElement | null>(null)

interface SuggestState<T> {
  visible: boolean
  items: T[]
  selectedIndex: number
  position: Record<string, string>
  query: string
  startPos: number
}

const commandState = reactive<SuggestState<CommandDef>>({
  visible: false,
  items: [],
  selectedIndex: 0,
  position: {},
  query: '',
  startPos: 0,
})

const flagState = reactive<SuggestState<FlagDef>>({
  visible: false,
  items: [],
  selectedIndex: 0,
  position: {},
  query: '',
  startPos: 0,
})

const subState = reactive({
  visible: false,
  items: [] as string[],
  selectedIndex: 0,
  position: {} as Record<string, string>,
  commandName: '',
  commandDesc: '',
  query: '',
  startPos: 0,
})

// ── Positioning ──

function calcPosition(textarea: HTMLTextAreaElement): Record<string, string> {
  const rect = textarea.getBoundingClientRect()
  // Position above the textarea
  return {
    position: 'fixed',
    bottom: `${window.innerHeight - rect.top + 4}px`,
    left: `${rect.left}px`,
    minWidth: `${Math.min(rect.width, 420)}px`,
    maxWidth: '480px',
  }
}

// ── Input analysis ──

interface TriggerInfo {
  type: 'command' | 'flag' | 'subcommand'
  query: string
  startPos: number
  commandName?: string
}

function analyzeInput(textarea: HTMLTextAreaElement): TriggerInfo | null {
  const text = textarea.value
  const cursor = textarea.selectionStart
  const before = text.substring(0, cursor)

  // Check for slash command at start of line or after newline
  const slashMatch = before.match(/(?:^|\n)\/([a-z][a-z0-9_-]*)$/i)
  if (slashMatch) {
    return {
      type: 'command',
      query: slashMatch[1],
      startPos: cursor - slashMatch[0].length + (slashMatch[0].startsWith('\n') ? 1 : 0),
    }
  }

  // Check for subcommand: /cmd subcmd
  const subMatch = before.match(/(?:^|\n)\/([a-z][a-z0-9_-]+)\s+([a-z][a-z0-9_-]*)$/i)
  if (subMatch) {
    const cmdDef = findCommand(props.agentId, subMatch[1])
    if (cmdDef?.subcommands?.length) {
      return {
        type: 'subcommand',
        query: subMatch[2],
        startPos: cursor - subMatch[2].length,
        commandName: subMatch[1],
      }
    }
  }

  // Check for flag: --flag or -f
  const flagMatch = before.match(/(?:^|\s)--([a-z][a-z0-9-]*)$/i)
  if (flagMatch) {
    return {
      type: 'flag',
      query: flagMatch[1],
      startPos: cursor - flagMatch[0].length,
    }
  }

  // Check for short flag
  const shortFlagMatch = before.match(/(?:^|\s)-([a-z])$/i)
  if (shortFlagMatch) {
    return {
      type: 'flag',
      query: shortFlagMatch[1],
      startPos: cursor - shortFlagMatch[0].length,
    }
  }

  return null
}

// ── Update suggestions ──

function updateSuggestions(textarea: HTMLTextAreaElement) {
  const trigger = analyzeInput(textarea)
  const pos = calcPosition(textarea)

  // Hide all first
  commandState.visible = false
  flagState.visible = false
  subState.visible = false

  if (!trigger) return

  switch (trigger.type) {
    case 'command': {
      const items = filterCommands(props.agentId, trigger.query)
      if (items.length === 0) return
      commandState.items = items
      commandState.selectedIndex = 0
      commandState.position = pos
      commandState.query = trigger.query
      commandState.startPos = trigger.startPos
      commandState.visible = true
      break
    }
    case 'flag': {
      const items = filterFlags(props.agentId, trigger.query)
      if (items.length === 0) return
      flagState.items = items
      flagState.selectedIndex = 0
      flagState.position = pos
      flagState.query = trigger.query
      flagState.startPos = trigger.startPos
      flagState.visible = true
      break
    }
    case 'subcommand': {
      const cmdDef = findCommand(props.agentId, trigger.commandName || '')
      if (!cmdDef?.subcommands?.length) return
      const subs = trigger.query
        ? cmdDef.subcommands.filter(s => s.startsWith(trigger.query.toLowerCase()))
        : cmdDef.subcommands
      if (subs.length === 0) return
      subState.items = subs
      subState.selectedIndex = 0
      subState.position = pos
      subState.commandName = trigger.commandName || ''
      subState.commandDesc = cmdDef.description
      subState.query = trigger.query
      subState.startPos = trigger.startPos
      subState.visible = true
      break
    }
  }
}

// ── Selection handlers ──

function selectCommand(cmd: CommandDef) {
  const textarea = props.textarea
  if (!textarea) return

  const text = textarea.value
  const cursor = textarea.selectionStart
  const before = text.substring(0, commandState.startPos)
  const after = text.substring(cursor)

  const replacement = `/${cmd.name}${cmd.argsHint ? ' ' : ''}`
  const newText = before + replacement + after
  emit('select', newText)

  commandState.visible = false
  emit('dismiss')
}

function selectFlag(flag: FlagDef) {
  const textarea = props.textarea
  if (!textarea) return

  const text = textarea.value
  const cursor = textarea.selectionStart
  const before = text.substring(0, flagState.startPos)
  const after = text.substring(cursor)

  const replacement = `--${flag.name}${flag.type === 'boolean' ? '' : '='}`
  const newText = before + replacement + after
  emit('select', newText)

  flagState.visible = false
  emit('dismiss')
}

function selectSubcommand(sub: string) {
  const textarea = props.textarea
  if (!textarea) return

  const text = textarea.value
  const cursor = textarea.selectionStart
  const before = text.substring(0, subState.startPos)
  const after = text.substring(cursor)

  const newText = before + sub + ' ' + after
  emit('select', newText)

  subState.visible = false
  emit('dismiss')
}

// ── Keyboard navigation ──

function handleKeydown(e: KeyboardEvent): boolean {
  const activeState = commandState.visible ? commandState
    : flagState.visible ? flagState
    : subState.visible ? subState
    : null

  if (!activeState) return false

  switch (e.key) {
    case 'ArrowDown':
      e.preventDefault()
      activeState.selectedIndex = (activeState.selectedIndex + 1) % activeState.items.length
      scrollToSelected()
      return true

    case 'ArrowUp':
      e.preventDefault()
      activeState.selectedIndex = (activeState.selectedIndex - 1 + activeState.items.length) % activeState.items.length
      scrollToSelected()
      return true

    case 'Tab':
      e.preventDefault()
      if (commandState.visible && commandState.items[commandState.selectedIndex]) {
        selectCommand(commandState.items[commandState.selectedIndex])
      } else if (flagState.visible && flagState.items[flagState.selectedIndex]) {
        selectFlag(flagState.items[flagState.selectedIndex])
      } else if (subState.visible && subState.items[subState.selectedIndex]) {
        selectSubcommand(subState.items[subState.selectedIndex])
      }
      return true

    case 'Enter':
      if (commandState.visible || flagState.visible || subState.visible) {
        e.preventDefault()
        if (commandState.visible && commandState.items[commandState.selectedIndex]) {
          selectCommand(commandState.items[commandState.selectedIndex])
        } else if (flagState.visible && flagState.items[flagState.selectedIndex]) {
          selectFlag(flagState.items[flagState.selectedIndex])
        } else if (subState.visible && subState.items[subState.selectedIndex]) {
          selectSubcommand(subState.items[subState.selectedIndex])
        }
        return true
      }
      return false

    case 'Escape':
      e.preventDefault()
      dismissAll()
      return true
  }

  return false
}

function scrollToSelected() {
  nextTick(() => {
    const list = commandListRef.value
    if (!list) return
    const active = list.querySelector('.suggest-item.active')
    if (active) {
      active.scrollIntoView({ block: 'nearest' })
    }
  })
}

function dismissAll() {
  commandState.visible = false
  flagState.visible = false
  subState.visible = false
  emit('dismiss')
}

// ── Watch for input changes ──

let debounceTimer: ReturnType<typeof setTimeout> | null = null

function onInput() {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    if (props.textarea) {
      updateSuggestions(props.textarea)
    }
  }, 50)
}

function onClickOutside(e: MouseEvent) {
  const target = e.target as HTMLElement
  if (!target.closest('.command-suggest')) {
    dismissAll()
  }
}

// ── Lifecycle ──

defineExpose({ handleKeydown, onInput, dismissAll })

onMounted(() => {
  document.addEventListener('click', onClickOutside)
})
onUnmounted(() => {
  document.removeEventListener('click', onClickOutside)
  if (debounceTimer) clearTimeout(debounceTimer)
})
</script>

<style scoped>
.command-suggest {
  z-index: 1000;
  background: var(--bg-primary, #1a1b26);
  border: 1px solid var(--border-light, rgba(255, 255, 255, 0.08));
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.04);
  overflow: hidden;
  font-size: 12px;
  backdrop-filter: blur(12px);
}

.suggest-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--border-light, rgba(255, 255, 255, 0.06));
  color: var(--text-muted, #565f89);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.suggest-icon {
  font-size: 12px;
  opacity: 0.6;
}

.suggest-count {
  margin-left: auto;
  background: rgba(255, 255, 255, 0.06);
  padding: 1px 5px;
  border-radius: 3px;
  font-size: 9px;
}

.suggest-list {
  max-height: 240px;
  overflow-y: auto;
  padding: 4px;
}

.suggest-list::-webkit-scrollbar {
  width: 4px;
}

.suggest-list::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 2px;
}

.suggest-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 8px;
  border-radius: 5px;
  cursor: pointer;
  transition: background 0.1s;
  line-height: 1.4;
}

.suggest-item:hover,
.suggest-item.active {
  background: rgba(255, 255, 255, 0.06);
}

.suggest-item.active {
  background: rgba(100, 120, 255, 0.12);
}

.suggest-item-name {
  color: var(--jade, #5ccfb8);
  font-family: var(--font-mono, monospace);
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
}

.suggest-item-args {
  color: var(--text-muted, #565f89);
  font-family: var(--font-mono, monospace);
  font-size: 10px;
}

.suggest-item-short {
  color: var(--text-muted, #565f89);
  font-family: var(--font-mono, monospace);
  font-size: 10px;
}

.suggest-item-type {
  color: var(--text-muted, #565f89);
  font-size: 9px;
  padding: 1px 4px;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 3px;
}

.suggest-item-desc {
  color: var(--text-secondary, #a9b1d6);
  font-size: 11px;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.suggest-item-aliases {
  color: var(--text-muted, #565f89);
  font-size: 9px;
  font-family: var(--font-mono, monospace);
  opacity: 0.6;
}

.suggest-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 10px;
  border-top: 1px solid var(--border-light, rgba(255, 255, 255, 0.06));
  color: var(--text-muted, #565f89);
  font-size: 10px;
}

.suggest-key {
  padding: 1px 4px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 3px;
  font-family: var(--font-mono, monospace);
  font-size: 9px;
}

/* Transition */
.suggest-fade-enter-active {
 transition: opacity 0.12s var(--ease-spring-fast), transform 0.12s var(--ease-spring-fast);
}
.suggest-fade-leave-active {
 transition: opacity 0.08s var(--ease-spring-fast);
}
.suggest-fade-enter-from {
  opacity: 0;
  transform: translateY(4px);
}
.suggest-fade-leave-to {
  opacity: 0;
}
</style>
