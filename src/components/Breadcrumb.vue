<template>
  <div class="breadcrumb">
    <span
      v-for="(seg, index) in segments"
      :key="seg.fullPath"
      class="breadcrumb-segment"
      :class="{ active: index === segments.length - 1 }"
      @click="navigate(seg.fullPath)"
    >
      <span v-if="index > 0" class="breadcrumb-sep">/</span>
      <span class="breadcrumb-label">{{ seg.label }}</span>
    </span>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  path: string
  homePath?: string
}>()

const emit = defineEmits<{
  (e: 'navigate', path: string): void
}>()

interface Segment {
  label: string
  fullPath: string
}

const segments = computed<Segment[]>(() => {
  if (!props.path) return []

  const parts = props.path.split('/').filter(Boolean)
  const result: Segment[] = []

  for (let i = 0; i < parts.length; i++) {
    const fullPath = '/' + parts.slice(0, i + 1).join('/')
    let label = parts[i]

    // Show '~' for home directory
    if (props.homePath && fullPath === props.homePath) {
      label = '~'
    } else if (i === 0 && !props.homePath && parts[i] === 'Users') {
      // Skip /Users segment for cleaner display
      continue
    }

    result.push({ label, fullPath })
  }

  return result
})

function navigate(path: string) {
  emit('navigate', path)
}
</script>

<style scoped>
.breadcrumb {
  display: flex;
  align-items: center;
  flex-wrap: nowrap;
  overflow: hidden;
  font-size: var(--text-xs);
  font-family: var(--font-mono, monospace);
}

.breadcrumb-segment {
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
  cursor: pointer;
  color: var(--text-muted, #888);
  transition: color 0.15s;
}

.breadcrumb-segment:hover {
  color: var(--accent, #82b1ff);
}

.breadcrumb-segment.active {
  color: var(--text-primary, #e0e0e0);
  cursor: default;
}

.breadcrumb-sep {
  margin: 0 2px;
  opacity: 0.4;
  cursor: default;
}

.breadcrumb-label {
  padding: 1px 4px;
  border-radius: 3px;
  transition: background 0.15s;
}

.breadcrumb-segment:hover .breadcrumb-label {
  background: rgba(255, 255, 255, 0.06);
}

.breadcrumb-segment.active .breadcrumb-label {
  background: rgba(255, 255, 255, 0.04);
}

.breadcrumb-segment.active:hover .breadcrumb-label {
  background: rgba(255, 255, 255, 0.04);
}
</style>
