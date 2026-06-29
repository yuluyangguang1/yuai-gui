<template>
  <div class="lan-list">
    <div v-if="items.length === 0" class="lan-empty">{{ emptyLabel }}</div>
    <button
      v-for="device in items"
      :key="device.device_id"
      class="lan-item"
      @click="$emit('select', device)"
    >
      <div class="lan-item__glyph">{{ glyphFor(device) }}</div>
      <div class="lan-item__body">
        <div class="lan-item__title">{{ device.name }}</div>
        <div class="lan-item__meta">
          <span>{{ device.ip }}:{{ device.http_port }}</span>
          <span>{{ device.endpoint_kind }}</span>
        </div>
      </div>
      <div class="lan-item__trail">
        <span
          class="lan-dot"
          :class="device.is_online ? 'lan-dot--on' : 'lan-dot--off'"
        />
        <div class="lan-item__age">{{ formatAge(device.last_seen_secs_ago) }}</div>
      </div>
    </button>
  </div>
</template>

<script setup lang="ts">
import type { LanDevice } from "@/stores/useLanStore";

defineProps<{
  items: LanDevice[];
  emptyLabel?: string;
}>();

defineEmits<{ select: [device: LanDevice] }>();

function formatAge(secs: number): string {
  if (secs < 60) return `${secs} 秒`;
  if (secs < 3600) return `${Math.floor(secs / 60)} 分钟`;
  return `${Math.floor(secs / 3600)} 小时`;
}

function glyphFor(device: LanDevice) {
  if (device.paired) return "✓";
  if (device.inbound) return "←";
  return "→";
}
</script>

<style scoped>
.lan-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.lan-empty {
  color: var(--text-muted);
  font-size: 0.75rem;
  opacity: 0.7;
}

.lan-item {
  appearance: none;
  border: 1px solid var(--border);
  background: var(--bg-tertiary);
  color: var(--text-primary);
  border-radius: var(--radius-sm, 8px);
  padding: 10px 12px;
  text-align: left;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 10px;
}

.lan-item__glyph {
  width: 22px;
  text-align: center;
  color: var(--accent);
  font-weight: 700;
}

.lan-item__body {
  flex: 1;
  min-width: 0;
}

.lan-item__title {
  font-size: 0.8rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.lan-item__meta {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  font-size: 0.68rem;
  color: var(--text-muted);
  margin-top: 2px;
}

.lan-item__trail {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}

.lan-item__age {
  font-size: 0.68rem;
  color: var(--text-muted);
  font-family: var(--font-mono);
}

.lan-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--text-muted);
}

.lan-dot--on {
  background: var(--accent);
  box-shadow: 0 0 6px var(--accent);
}

.lan-dot--off {
  background: var(--text-muted);
  opacity: 0.5;
}
</style>
