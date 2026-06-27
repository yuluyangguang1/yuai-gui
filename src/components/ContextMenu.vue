<template>
  <Teleport to="body">
    <Transition name="context-menu">
      <div
        v-if="visible"
        ref="menuRef"
        class="context-menu"
        :style="menuStyle"
        @click.stop
        @contextmenu.prevent
      >
        <template v-for="(item, index) in items" :key="index">
          <div v-if="item.divider" class="context-menu-divider" />
          <div
            v-else
            class="context-menu-item"
            :class="{ danger: item.danger, disabled: item.disabled }"
            @click="handleClick(item)"
          >
            <span class="context-menu-icon">{{ item.icon }}</span>
            <span class="context-menu-label">{{ item.label }}</span>
            <span v-if="item.shortcut" class="context-menu-shortcut">{{ item.shortcut }}</span>
          </div>
        </template>
      </div>
    </Transition>
    <!-- Invisible overlay to catch outside clicks -->
    <div
      v-if="visible"
      class="context-menu-overlay"
      @click="close"
      @contextmenu.prevent="close"
    />
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'

export interface ContextMenuItem {
  icon: string
  label: string
  action?: string
  shortcut?: string
  danger?: boolean
  disabled?: boolean
  divider?: boolean
}

const props = defineProps<{
  visible: boolean
  x: number
  y: number
  items: ContextMenuItem[]
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'action', action: string): void
}>()

const menuRef = ref<HTMLElement | null>(null)

const menuStyle = computed(() => {
  // Clamp position so menu stays within viewport
  let x = props.x
  let y = props.y
  // We'll use fixed positioning; adjust after mount if needed
  return {
    left: `${x}px`,
    top: `${y}px`,
  }
})

function handleClick(item: ContextMenuItem) {
  if (item.disabled) return
  if (item.action) {
    emit('action', item.action)
  }
  close()
}

function close() {
  emit('close')
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.visible) {
    close()
  }
}

// Adjust position after mount to keep within viewport
watch(() => props.visible, async (val) => {
  if (val) {
    await nextTick()
    if (menuRef.value) {
      const rect = menuRef.value.getBoundingClientRect()
      const vw = window.innerWidth
      const vh = window.innerHeight

      let x = props.x
      let y = props.y

      if (x + rect.width > vw - 8) {
        x = vw - rect.width - 8
      }
      if (y + rect.height > vh - 8) {
        y = vh - rect.height - 8
      }
      if (x < 8) x = 8
      if (y < 8) y = 8

      menuRef.value.style.left = `${x}px`
      menuRef.value.style.top = `${y}px`
    }
  }
})

onMounted(() => {
  document.addEventListener('keydown', onKeyDown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', onKeyDown)
})
</script>

<style scoped>
.context-menu-overlay {
  position: fixed;
  inset: 0;
  z-index: 9998;
}

.context-menu {
  position: fixed;
  z-index: 9999;
  min-width: 180px;
  background: color-mix(in srgb, var(--bg-secondary, #1a1a2e) 95%, transparent);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(0, 0, 0, 0.1);
  padding: 4px;
  overflow: hidden;
}

.context-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 5px;
  cursor: pointer;
  font-size: 12.5px;
  color: var(--text-secondary, #c0c0c0);
  transition: background 0.1s;
  user-select: none;
}

.context-menu-item:hover {
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-primary, #e0e0e0);
}

.context-menu-item.danger {
  color: var(--error);
}

.context-menu-item.danger:hover {
  background: var(--error-soft);
  color: var(--error);
}

.context-menu-item.disabled {
  opacity: 0.4;
  cursor: not-allowed;
  pointer-events: none;
}

.context-menu-icon {
  width: 18px;
  text-align: center;
  font-size: 13px;
  flex-shrink: 0;
}

.context-menu-label {
  flex: 1;
}

.context-menu-shortcut {
  font-size: 10px;
  color: var(--text-muted, #666);
  font-family: var(--font-mono, monospace);
  margin-left: 16px;
}

.context-menu-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.06);
  margin: 3px 6px;
}

/* Transition */
.context-menu-enter-active {
  transition: all 0.12s cubic-bezier(0.16, 1, 0.3, 1);
}

.context-menu-leave-active {
  transition: all 0.1s ease-in;
}

.context-menu-enter-from {
  opacity: 0;
  transform: scale(0.95);
}

.context-menu-leave-to {
  opacity: 0;
  transform: scale(0.95);
}
</style>
