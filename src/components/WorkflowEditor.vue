<script setup lang="ts">
import { computed, shallowRef, triggerRef, reactive } from 'vue';
import { VueFlow, useVueFlow } from '@vue-flow/core';
import { Background } from '@vue-flow/background';
import { Controls } from '@vue-flow/controls';
import { MiniMap } from '@vue-flow/minimap';
import type { Node, Edge, Connection } from '@vue-flow/core';
import type { WorkflowNodeData } from '../stores/workflow';
import { useWorkflowStore } from '../stores/workflow';
import { useAgentsStore } from '../stores/agents';
import { nodeTypes } from './workflow/nodeTypes';
import { WorkflowEngine } from './workflow/engine';

const store = useWorkflowStore();
const agentsStore = useAgentsStore();
const engine = shallowRef(new WorkflowEngine(store));

// 运行状态（节点双向绑定）
type RunStatus = 'idle' | 'running' | 'done' | 'failed';
const ranNodes = shallowRef<Record<string, RunStatus>>({});
const logs = shallowRef<string[]>([]);
triggerRef(ranNodes);

const agents = computed(() => agentsStore.agents.filter((a) => a.enabled));
const validation = computed(() => store.validate());
const { onConnect } = useVueFlow();

// ── 右键菜单 ──
const contextMenu = reactive({ visible: false, x: 0, y: 0, nodeId: '' });

function onNodeContextMenu(e: MouseEvent, nodeId: string) {
  e.preventDefault();
  contextMenu.visible = true;
  contextMenu.x = e.clientX;
  contextMenu.y = e.clientY;
  contextMenu.nodeId = nodeId;
}
function closeContextMenu() { contextMenu.visible = false; }
function ctxDuplicate() {
  const src = store.nodes.find(n => n.id === contextMenu.nodeId);
  if (src) {
    store.addNode(src.data.kind, { x: src.position.x + 40, y: src.position.y + 40 });
  }
  closeContextMenu();
}
function ctxDelete() {
  store.removeNode(contextMenu.nodeId);
  closeContextMenu();
}

// ── Undo / Redo 键盘快捷键 ──
function handleKeydown(e: KeyboardEvent) {
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key === 'z' && !e.shiftKey) {
    e.preventDefault();
    store.undo();
  } else if (mod && (e.key === 'Z' || (e.key === 'z' && e.shiftKey))) {
    e.preventDefault();
    store.redo();
  }
}

function addNode(kind: WorkflowNodeData['kind']) {
  const id = `${kind}-${Date.now()}`;
  const node: Node<WorkflowNodeData> = {
    id,
    type: kind,
    position: { x: 240 + Math.random() * 40, y: 80 + Math.random() * 40 },
    data: {
      label: kind.toUpperCase(),
      kind,
      agentId: kind === 'agent' ? '' : undefined,
      prompt: kind === 'prompt' ? '' : undefined,
      condition: kind === 'condition' ? '' : undefined,
      trueLabel: kind === 'condition' ? '成立' : undefined,
      falseLabel: kind === 'condition' ? '不成立' : undefined,
      description: kind === 'output' ? '结果输出' : undefined,
      status: 'idle',
    },
  };
  store.nodes.value.push(node);
}

function clear() {
  if (confirm('确定清空工作流？')) store.clear();
}

async function save() {
  const { valid, errors } = store.validate();
  if (!valid) {
    alert(errors.join('\n'));
    return;
  }
  const raw = store.serialize();
  console.log('[WorkflowEditor] saved', raw);
}

async function run() {
  try {
    ranNodes.value = {};
    logs.value = ['---------- 开始执行 ----------'];
    await engine.value.run(ranNodes, logs);
  } catch (e) {
    logs.value.push(`❌ 执行失败：${(e as Error).message}`);
  }
}

function stop() {
  engine.value.cancel();
  logs.value.push('⚠ 已要求终止...');
}

onConnect((edge: Connection) => {
  if (edge.source === edge.target) return;
  store.edges.value.push({
    id: `${edge.source}-${edge.sourceHandle ?? 'default'}-${edge.target}-${edge.targetHandle ?? 'default'}`,
    source: edge.source,
    target: edge.target,
    sourceHandle: edge.sourceHandle ?? undefined,
    targetHandle: edge.targetHandle ?? undefined,
    animated: false,
  } as Edge);
});
</script>

<template>
  <div class="workflow-host" @keydown="handleKeydown" tabindex="0">
    <div class="workflow-toolbar">
      <button @click="addNode('agent')">+ Agent</button>
      <button @click="addNode('prompt')">+ Prompt</button>
      <button @click="addNode('condition')">+ Condition</button>
      <button @click="addNode('output')">+ Output</button>
      <button @click="store.undo()" :disabled="!store.canUndo()" title="撤销 ⌘Z">↩ 撤销</button>
      <button @click="store.redo()" :disabled="!store.canRedo()" title="重做 ⌘⇧Z">↪ 重做</button>
      <button @click="clear" class="danger">清空</button>
      <button @click="save" class="primary">保存</button>
      <button @click="run" class="primary">执行</button>
      <button @click="stop" class="danger">停止</button>
      <span v-if="store.readOnly" class="badge">只读</span>
    </div>

    <div class="workflow-body">
      <VueFlow
        v-model:nodes="store.nodes"
        v-model:edges="store.edges"
        :node-types="nodeTypes"
        :default-zoom="1.2"
        :min-zoom="0.4"
        :max-zoom="2"
        fit-view-on-init
        @node-context-menu="onNodeContextMenu"
      >
        <Background />
        <Controls />
        <MiniMap />
      </VueFlow>
      <!-- 右键菜单 -->
      <div
        v-if="contextMenu.visible"
        class="ctx-menu"
        :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
        @click.stop
      >
        <div class="ctx-item" @click="ctxDuplicate">复制节点</div>
        <div class="ctx-item danger" @click="ctxDelete">删除节点</div>
      </div>
      <div v-if="contextMenu.visible" class="ctx-overlay" @click="closeContextMenu" @contextmenu.prevent="closeContextMenu" />

      <div class="workflow-log">
        <div class="log-header">执行日志</div>
        <div class="log-body">
          <div v-for="(line, idx) in logs" :key="idx" class="log-line">{{ line }}</div>
        </div>
      </div>
    </div>

    <div class="workflow-status">
      <span>节点: {{ store.nodes.length }} | 连线: {{ store.edges.length }}</span>
      <span v-if="validation.errors.length" class="error-text">{{ validation.errors[0] }}</span>
    </div>
  </div>
</template>

<style scoped>
.workflow-host {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-panel, #0e0f14);
}
.workflow-body {
  flex: 1;
  display: flex;
  min-height: 0;
}
.workflow-log {
  width: 260px;
  min-width: 220px;
  border-left: 1px solid var(--accent-border, #1f212a);
  display: flex;
  flex-direction: column;
  background: var(--bg-panel-elevated, #13141a);
}
.log-header {
  padding: 8px 10px;
  font-size: 11px;
  color: var(--text-muted);
  border-bottom: 1px solid var(--accent-border, #1f212a);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.log-body {
  padding: 8px 10px;
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  line-height: 1.6;
  overflow-y: auto;
  color: var(--text-secondary);
}
.log-line {
  white-space: pre-wrap;
  word-wrap: anywhere;
}
.workflow-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding: 10px 12px;
  background: var(--bg-panel-elevated, #13141a);
  border-bottom: 1px solid var(--accent-border, #1f212a);
}
.workflow-toolbar button {
  background: var(--accent-btn, #1f212a);
  color: var(--text-primary, #e6e8ef);
  border: 1px solid transparent;
  border-radius: 8px;
  padding: 8px 14px;
  cursor: pointer;
  font-size: 12px;
}
.workflow-toolbar button:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.workflow-toolbar button:disabled:hover {
  border-color: transparent;
}
.workflow-toolbar button:hover {
  border-color: var(--accent-primary, #5ccfb8);
}
.workflow-toolbar button.danger {
  background: rgba(255, 70, 70, 0.1);
  color: #ff6b6b;
}
.workflow-toolbar button.primary {
  background: var(--accent-primary, #5ccfb8);
  color: #0a0912;
  font-weight: 700;
}
.badge {
  margin-left: auto;
  align-self: center;
  font-size: 11px;
  color: var(--text-secondary, #8b8d98);
  background: var(--bg-canvas, #0a0912);
  border: 1px solid var(--accent-border, #1f212a);
  border-radius: 999px;
  padding: 4px 10px;
}
.workflow-status {
  padding: 10px 12px;
  font-size: 12px;
  color: var(--text-secondary, #8b8d98);
  border-top: 1px solid var(--accent-border, #1f212a);
  display: flex;
  gap: 12px;
}
.error-text {
  color: #ff6b6b;
}
.custom-node {
  background: var(--bg-panel-elevated, #13141a);
  border: 1px solid var(--accent-border, #1f212a);
  border-radius: 10px;
  padding: 12px;
  min-width: 180px;
  box-shadow: var(--shadow-1, 0 6px 18px rgba(0, 0, 0, 0.25));
  color: var(--text-primary, #e6e8ef);
}
.node-header {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.5px;
  color: var(--text-secondary, #8b8d98);
  margin-bottom: 8px;
  text-transform: uppercase;
}
select,
textarea,
input {
  width: 100%;
  background: var(--bg-input, #0a0912);
  color: var(--text-primary, #e6e8ef);
  border: 1px solid var(--accent-border, #1f212a);
  border-radius: 6px;
  padding: 8px;
  font-size: 12px;
}

.agent-node {
  border-top: 3px solid var(--accent-primary, #5ccfb8);
}
.prompt-node {
  border-top: 3px solid #63b3ed;
}
.condition-node {
  border-top: 3px solid #f6c177;
}
.output-node {
  border-top: 3px solid #eb6f92;
}
.output-placeholder {
  color: var(--text-secondary, #8b8d98);
  font-size: 12px;
}
.ctx-overlay {
  position: fixed;
  inset: 0;
  z-index: 99;
}
.ctx-menu {
  position: fixed;
  z-index: 100;
  background: var(--bg-panel-elevated, #13141a);
  border: 1px solid var(--accent-border, #1f212a);
  border-radius: 8px;
  padding: 4px 0;
  min-width: 120px;
  box-shadow: 0 8px 24px rgba(0,0,0,0.4);
}
.ctx-item {
  padding: 6px 14px;
  font-size: 12px;
  color: var(--text-primary, #e6e8ef);
  cursor: pointer;
  transition: background 0.1s;
}
.ctx-item:hover {
  background: var(--accent-primary, #5ccfb8);
  color: #0a0912;
}
.ctx-item.danger:hover {
  background: #ff6b6b;
}
</style>
