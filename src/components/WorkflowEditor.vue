<template>
  <div class="workflow-editor">
    <div class="workflow-toolbar">
      <span class="workflow-title">工作流</span>
      <div class="workflow-node-palette">
        <button
          v-for="nt in nodeTypes"
          :key="nt.type"
          class="palette-node"
          :style="{ borderColor: nt.color + '60' }"
          draggable="true"
          @dragstart="onDragStart($event, nt.type)"
        >
          <span class="palette-icon" :style="{ color: nt.color }">{{ nt.glyph }}</span>
          <span class="palette-label">{{ nt.label }}</span>
        </button>
      </div>
      <span class="toolbar-spacer" />
      <button class="workflow-btn execute" :disabled="isExecuting" @click="handleExecute">
        {{ isExecuting ? '执行中...' : '▶ 执行' }}
      </button>
      <button class="workflow-btn" @click="handleReset">↻ 重置</button>
    </div>

    <div class="workflow-canvas">
      <VueFlow
        :nodes="flowNodes"
        :edges="flowEdges"
        :default-viewport="{ zoom: 1, x: 0, y: 0 }"
        :min-zoom="0.3"
        :max-zoom="2"
        :snap-to-grid="true"
        :snap-grid="[16, 16]"
        @nodes-change="onNodesChange"
        @edges-change="onEdgesChange"
        @connect="onConnect"
        @drop="onDrop"
        @dragover="onDragOver"
      >
        <template #node-agent="nodeProps">
          <WorkflowNode v-bind="nodeProps" status-color="#5ccfb8" />
        </template>
        <template #node-input="nodeProps">
          <WorkflowNode v-bind="nodeProps" status-color="#7aa2f7" />
        </template>
        <template #node-output="nodeProps">
          <WorkflowNode v-bind="nodeProps" status-color="#e0af68" />
        </template>
        <template #node-condition="nodeProps">
          <WorkflowNode v-bind="nodeProps" status-color="#f7768e" />
        </template>

        <Background :gap="16" :size="1" pattern-color="rgba(255,255,255,0.03)" />
        <Controls />
      </VueFlow>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { VueFlow, type NodeChange, type EdgeChange, type Connection } from '@vue-flow/core';
import { Background } from '@vue-flow/background';
import { Controls } from '@vue-flow/controls';
import { useWorkflowStore, type WorkflowNodeData } from '../stores/workflow';
import WorkflowNode from './workflow/WorkflowNode.vue';

// Ensure vue-flow styles are loaded
import '@vue-flow/core/dist/style.css';
import '@vue-flow/core/dist/theme-default.css';
import '@vue-flow/controls/dist/style.css';

const store = useWorkflowStore();
const isExecuting = ref(false);

// Auto-create a default workflow if none exists
if (!store.activeWorkflow) {
  store.createWorkflow('默认工作流');
}

const nodeTypes = [
  { type: 'agent' as const, label: 'Agent', glyph: '智', color: '#5ccfb8' },
  { type: 'input' as const, label: '输入', glyph: '入', color: '#7aa2f7' },
  { type: 'output' as const, label: '输出', glyph: '出', color: '#e0af68' },
  { type: 'condition' as const, label: '条件', glyph: '?', color: '#f7768e' },
];

/** Convert store nodes to VueFlow format */
const flowNodes = computed(() => {
  const wf = store.activeWorkflow;
  if (!wf) return [];
  return wf.nodes.map(n => ({
    id: n.id,
    type: n.type,
    position: n.position,
    data: { ...n.data, status: store.nodeStatuses[n.id] ?? 'idle' },
  }));
});

const flowEdges = computed(() => {
  const wf = store.activeWorkflow;
  if (!wf) return [];
  return wf.edges.map(e => ({
    id: e.id,
    source: e.source,
    target: e.target,
    animated: e.animated ?? true,
    style: { stroke: 'var(--jade, #5ccfb8)', strokeWidth: 2 },
  }));
});

function onNodesChange(changes: NodeChange[]) {
  for (const change of changes) {
    if (change.type === 'position' && change.position) {
      const wf = store.activeWorkflow;
      if (!wf) continue;
      const node = wf.nodes.find(n => n.id === change.id);
      if (node) {
        node.position = change.position;
      }
    } else if (change.type === 'remove') {
      store.removeNode(change.id);
    }
  }
}

function onEdgesChange(changes: EdgeChange[]) {
  for (const change of changes) {
    if (change.type === 'remove') {
      store.removeEdge(change.id);
    }
  }
}

function onConnect(connection: Connection) {
  if (connection.source && connection.target) {
    store.addEdge(connection.source, connection.target);
  }
}

function onDragStart(event: DragEvent, nodeType: WorkflowNodeData['nodeType']) {
  if (event.dataTransfer) {
    event.dataTransfer.setData('application/workflow-node-type', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  }
}

function onDragOver(event: DragEvent) {
  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move';
  }
}

function onDrop(event: DragEvent) {
  const nodeType = event.dataTransfer?.getData('application/workflow-node-type') as WorkflowNodeData['nodeType'];
  if (!nodeType) return;

  // Get position relative to the flow canvas
  const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
  const position = {
    x: event.clientX - bounds.left - 60,
    y: event.clientY - bounds.top - 20,
  };

  store.addNode(nodeType, position);
}

async function handleExecute() {
  isExecuting.value = true;
  try {
    await store.executeWorkflow();
  } finally {
    isExecuting.value = false;
  }
}

function handleReset() {
  store.resetStatuses();
}
</script>

<style scoped>
.workflow-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-primary, #1a1b26);
}

.workflow-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  flex-shrink: 0;
}

.workflow-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--ink, #c0caf5);
  margin-right: 8px;
}

.workflow-node-palette {
  display: flex;
  gap: 4px;
}

.palette-node {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border: 1px solid;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.03);
  cursor: grab;
  font-size: 11px;
  color: var(--silver, #a9b1d6);
  transition: background 0.15s;
}

.palette-node:hover {
  background: rgba(255, 255, 255, 0.06);
}

.palette-node:active {
  cursor: grabbing;
}

.palette-icon {
  font-family: var(--font-brush, inherit);
  font-size: 14px;
}

.palette-label {
  font-size: 11px;
}

.toolbar-spacer {
  flex: 1;
}

.workflow-btn {
  padding: 5px 14px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.04);
  color: var(--silver, #a9b1d6);
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.workflow-btn:hover {
  background: rgba(255, 255, 255, 0.08);
}

.workflow-btn.execute {
  background: rgba(92, 207, 184, 0.15);
  border-color: rgba(92, 207, 184, 0.3);
  color: #5ccfb8;
}

.workflow-btn.execute:hover {
  background: rgba(92, 207, 184, 0.25);
}

.workflow-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.workflow-canvas {
  flex: 1;
  min-height: 0;
}
</style>
