<script setup lang="ts">
import { computed } from 'vue';
import { TIcon } from "../../utils/icons";
import { Handle, Position } from '@vue-flow/core';

export interface WorkflowNodeData {
  label: string;
  kind: 'agent' | 'prompt' | 'condition' | 'output';
  // 通用
  description?: string;
  color?: string;
  icon?: string;
  // agent
  agentId?: string;
  agentName?: string;
  // prompt
  prompt?: string;
  model?: string;
  // condition
  condition?: string;
  trueLabel?: string;
  falseLabel?: string;
  // 状态运行时
  status?: 'idle' | 'running' | 'done' | 'failed';
}

const props = defineProps<{
  id: string;
  data: WorkflowNodeData;
}>();

const STATUS_COLORS: Record<string, string> = {
  idle: '',
  running: 'var(--accent)',
  done: 'var(--accent)',
  failed: 'var(--error)',
};

const kindGlyphs: Record<string, string> = {
  agent: '智',
  prompt: '文',
  condition: '?',
  output: '出',
};

const kindNames: Record<string, string> = {
  agent: 'Agent',
  prompt: 'Prompt',
  condition: '条件',
  output: '输出',
};

const glyph = computed(() => props.data.icon || kindGlyphs[props.data.kind] || '◈');
const name = computed(() => kindNames[props.data.kind] || props.data.label);
const statusColor = computed(() => {
  if (props.data.color) return props.data.color;
  return STATUS_COLORS[props.data.status || 'idle'] || 'var(--gold)';
});
const cssClass = computed(
  () => `wf-${props.data.kind}${props.data.status ? ` status-${props.data.status}` : ''}`,
);
</script>

<template>
  <div class="workflow-node" :class="cssClass">
    <div class="node-header" :style="{ borderBottomColor: statusColor + '30' }">
      <span class="node-type-icon" :style="{ color: statusColor }">{{ glyph }}</span>
      <span class="node-label">{{ data.label || name }}</span>
      <span v-if="data.status" class="node-status-dot" :class="data.status" />
    </div>

    <div class="node-body">
      <div class="node-type-name">{{ name }}</div>

      <!-- Agent 节点 -->
      <div v-if="data.kind === 'agent'" class="node-field">
        <select v-model="data.agentId" class="node-select">
          <option value="" disabled>选择 Agent...</option>
          <option value="hermes">菊 · Hermes</option>
          <option value="claude">梅 · Claude</option>
          <option value="codex">兰 · Codex</option>
          <option value="openclaw">竹 · OpenClaw</option>
        </select>
      </div>

      <!-- Prompt 节点 -->
      <div v-if="data.kind === 'prompt'" class="node-field">
        <textarea
          v-model="data.prompt"
          class="node-textarea"
          rows="3"
          placeholder="输入提示词..."
        />
        <input
          v-model="data.model"
          class="node-input"
          placeholder="模型（可选，如 claude-4）"
        />
      </div>

      <!-- Condition 节点 -->
      <div v-if="data.kind === 'condition'" class="node-field">
        <input v-model="data.condition" class="node-input" placeholder="if ... else ..." />
        <div class="condition-labels">
          <span class="cond-true"><TIcon name="check" :size="12" /> {{ data.trueLabel || 'true' }}</span>
          <span class="cond-false"><TIcon name="close" :size="12" /> {{ data.falseLabel || 'false' }}</span>
        </div>
      </div>

      <!-- Output 节点 -->
      <div v-if="data.kind === 'output'" class="node-field">
        <div class="output-placeholder">{{ data.description || '结果输出' }}</div>
      </div>
    </div>

    <Handle type="target" :position="Position.Top" />
    <Handle v-if="data.kind !== 'output'" type="source" :position="Position.Bottom" />
    <Handle v-if="data.kind === 'condition'" type="source" :position="Position.Right" id="false" />
  </div>
</template>

<style scoped>
.workflow-node {
  min-width: 160px;
  max-width: 220px;
  background: var(--bg-secondary, #1e293b);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  color: var(--text-primary, #e2e8f0);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.35);
  transition: box-shadow 0.2s, border-color 0.2s;
  font-family: inherit;
}

.workflow-node:hover {
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.5);
  border-color: rgba(255, 255, 255, 0.14);
}

.workflow-node.status-running {
  border-color: rgba(92, 207, 184, 0.5);
  box-shadow: 0 0 14px rgba(92, 207, 184, 0.18);
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
  padding: 7px 10px;
  border-bottom: 1px solid;
  border-bottom-color: rgba(255, 255, 255, 0.06);
}
.node-type-icon {
  font-family: var(--font-brush, inherit);
  font-size: 15px;
  line-height: 1;
}
.node-label {
  font-weight: 600;
  flex: 1;
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.node-status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--silver, #565f89);
  transition: background 0.3s;
}
.node-status-dot.idle { background: var(--silver, #565f89); }
.node-status-dot.running {
  background: var(--accent);
  animation: pulse 1s ease-in-out infinite;
}
.node-status-dot.done { background: var(--accent); }
.node-status-dot.failed { background: var(--error); }

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
}

.node-body {
  padding: 6px 10px 8px;
}
.node-type-name {
  font-size: 10px;
  color: var(--text-muted, #6b7280);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 4px;
}

.node-field {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.node-select,
.node-input,
.node-textarea {
  width: 100%;
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 5px;
  color: var(--text-primary, #e2e8f0);
  font-size: 11px;
  padding: 4px 6px;
  outline: none;
  font-family: inherit;
  box-sizing: border-box;
}
.node-select:focus,
.node-input:focus,
.node-textarea:focus {
  border-color: var(--accent);
}
.node-textarea {
  resize: vertical;
  min-height: 38px;
  font-family: var(--font-mono, monospace);
}

.condition-labels {
  display: flex;
  justify-content: space-between;
  font-size: 10px;
  margin-top: 2px;
}
.cond-true { color: var(--accent); }
.cond-false { color: var(--error); }

.output-placeholder {
  font-size: 11px;
  color: var(--text-muted, #6b7280);
  padding: 4px 0;
}

/* VueFlow Handle 视觉修正 */
:deep(.vue-flow__handle) {
  width: 8px;
  height: 8px;
  background: var(--accent);
  border: 2px solid var(--bg-secondary, #1e293b);
}
</style>
