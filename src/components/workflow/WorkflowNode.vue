<template>
  <div class="workflow-node" :class="['wf-' + data.nodeType, 'status-' + data.status]">
    <div class="node-header" :style="{ borderBottomColor: statusColor + '30' }">
      <span class="node-type-icon" :style="{ color: statusColor }">{{ typeGlyph }}</span>
      <span class="node-label">{{ data.label }}</span>
      <span class="node-status-dot" :class="data.status" />
    </div>
    <div class="node-body">
      <span class="node-type-name">{{ typeName }}</span>
    </div>

    <!-- Handles for connecting edges -->
    <Handle type="target" :position="Position.Top" />
    <Handle type="source" :position="Position.Bottom" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Handle, Position } from '@vue-flow/core';

const props = defineProps<{
  id: string;
  data: {
    label: string;
    nodeType: string;
    status: string;
  };
  statusColor?: string;
}>();

const typeGlyphs: Record<string, string> = {
  agent: '智',
  input: '入',
  output: '出',
  condition: '?',
};

const typeNames: Record<string, string> = {
  agent: 'Agent',
  input: '输入',
  output: '输出',
  condition: '条件',
};

const typeGlyph = computed(() => typeGlyphs[props.data.nodeType] ?? '◆');
const typeName = computed(() => typeNames[props.data.nodeType] ?? props.data.nodeType);
</script>

<style scoped>
.workflow-node {
  min-width: 120px;
  background: var(--bg-secondary, #24283b);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  font-size: 12px;
  color: var(--ink, #c0caf5);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  transition: box-shadow 0.2s, border-color 0.2s;
}

.workflow-node:hover {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
}

.workflow-node.status-running {
  border-color: rgba(92, 207, 184, 0.5);
  box-shadow: 0 0 12px rgba(92, 207, 184, 0.2);
}

.workflow-node.status-done {
  border-color: rgba(158, 206, 106, 0.4);
}

.workflow-node.status-failed {
  border-color: rgba(247, 118, 142, 0.5);
}

.node-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-bottom: 1px solid;
}

.node-type-icon {
  font-family: var(--font-brush, inherit);
  font-size: 16px;
}

.node-label {
  font-weight: 500;
  flex: 1;
  font-size: 12px;
}

.node-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--silver, #565f89);
  transition: background 0.3s;
}

.node-status-dot.idle {
  background: var(--silver, #565f89);
}

.node-status-dot.running {
  background: #5ccfb8;
  animation: pulse 1s ease-in-out infinite;
}

.node-status-dot.done {
  background: #9ece6a;
}

.node-status-dot.failed {
  background: #f7768e;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.node-body {
  padding: 4px 10px 6px;
}

.node-type-name {
  font-size: 10px;
  color: var(--text-muted, #565f89);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
</style>
