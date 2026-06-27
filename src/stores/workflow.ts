/**
 * Workflow store — DAG-based workflow editor with topological execution.
 * Phase 2: Snapshot undo/redo + Auto-layout.
 */
import { ref, reactive, computed } from 'vue';
import { defineStore } from 'pinia';

export type NodeStatus = 'idle' | 'running' | 'done' | 'failed';

export interface WorkflowNodeData {
  label: string;
  nodeType: 'agent' | 'input' | 'output' | 'condition';
  config?: Record<string, unknown>;
}

export interface WorkflowNode {
  id: string;
  type: WorkflowNodeData['nodeType'];
  position: { x: number; y: number };
  data: WorkflowNodeData;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  sourceType?: WorkflowNodeData['nodeType'];
  targetType?: WorkflowNodeData['nodeType'];
  animated?: boolean;
}

export interface Workflow {
  id: string;
  name: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

interface Snapshot {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

let nodeCounter = 0;
let edgeCounter = 0;

function genNodeId(): string {
  return `node_${++nodeCounter}_${Date.now()}`;
}

function genEdgeId(): string {
  return `edge_${++edgeCounter}_${Date.now()}`;
}

const MAX_SNAPSHOTS = 50;

export const useWorkflowStore = defineStore('workflow', () => {
  const workflows = ref<Workflow[]>([]);
  const activeWorkflowId = ref<string | null>(null);
  const nodeStatuses = reactive<Record<string, NodeStatus>>({});

  /** Get the currently active workflow */
  const activeWorkflow = ref<Workflow | null>(null);

  // ══════════════════════════════════════════════
  // Snapshot Undo/Redo (inspired by Langflow)
  // ══════════════════════════════════════════════

  const historyStack = ref<Snapshot[]>([]);
  const historyIndex = ref(-1);

  const canUndo = computed(() => historyIndex.value > 0);
  const canRedo = computed(() => historyIndex.value < historyStack.value.length - 1);

  /** Deep clone nodes + edges and push to history stack. */
  function takeSnapshot() {
    const wf = activeWorkflow.value;
    if (!wf) return;

    const snapshot: Snapshot = {
      nodes: JSON.parse(JSON.stringify(wf.nodes)),
      edges: JSON.parse(JSON.stringify(wf.edges)),
    };

    // If we're not at the end of the stack, truncate forward history
    if (historyIndex.value < historyStack.value.length - 1) {
      historyStack.value = historyStack.value.slice(0, historyIndex.value + 1);
    }

    historyStack.value.push(snapshot);

    // Enforce max snapshots
    if (historyStack.value.length > MAX_SNAPSHOTS) {
      historyStack.value = historyStack.value.slice(historyStack.value.length - MAX_SNAPSHOTS);
    }

    historyIndex.value = historyStack.value.length - 1;
  }

  /** Restore previous snapshot. */
  function undo() {
    if (!canUndo.value) return;
    historyIndex.value--;
    restoreSnapshot(historyStack.value[historyIndex.value]);
  }

  /** Restore next snapshot. */
  function redo() {
    if (!canRedo.value) return;
    historyIndex.value++;
    restoreSnapshot(historyStack.value[historyIndex.value]);
  }

  function restoreSnapshot(snapshot: Snapshot) {
    const wf = activeWorkflow.value;
    if (!wf) return;
    wf.nodes = JSON.parse(JSON.stringify(snapshot.nodes));
    wf.edges = JSON.parse(JSON.stringify(snapshot.edges));
  }

  // ══════════════════════════════════════════════
  // Auto-layout (inspired by Langflow)
  // ══════════════════════════════════════════════

  const HORIZONTAL_SPACING = 200;
  const VERTICAL_SPACING = 100;

  /**
   * Auto-layout nodes using topological sort.
   * Position nodes in columns (layers), center-aligned.
   */
  function autoLayout() {
    const wf = activeWorkflow.value;
    if (!wf || wf.nodes.length === 0) return;

    takeSnapshot(); // Save state before layout

    // Build adjacency and in-degree
    const inDegree = new Map<string, number>();
    const adjList = new Map<string, string[]>();
    const nodeMap = new Map<string, WorkflowNode>();

    for (const n of wf.nodes) {
      inDegree.set(n.id, 0);
      adjList.set(n.id, []);
      nodeMap.set(n.id, n);
    }

    for (const e of wf.edges) {
      adjList.get(e.source)?.push(e.target);
      inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1);
    }

    // BFS-based layer assignment (Kahn's algorithm variant)
    const layers: string[][] = [];
    const assigned = new Set<string>();
    const queue: string[] = [];

    // Start with root nodes (in-degree 0)
    for (const [id, deg] of inDegree) {
      if (deg === 0) queue.push(id);
    }

    let currentLayer = [...queue];
    for (const id of queue) assigned.add(id);

    while (currentLayer.length > 0) {
      layers.push(currentLayer);
      const nextLayer: string[] = [];

      for (const id of currentLayer) {
        for (const neighbor of adjList.get(id) ?? []) {
          if (!assigned.has(neighbor)) {
            // Check if all predecessors are assigned
            const preds = wf.edges.filter(e => e.target === neighbor).map(e => e.source);
            if (preds.every(p => assigned.has(p))) {
              nextLayer.push(neighbor);
              assigned.add(neighbor);
            }
          }
        }
      }

      currentLayer = nextLayer;
    }

    // Handle unassigned nodes (orphaned or in cycles)
    const unassigned = wf.nodes.filter(n => !assigned.has(n.id));
    if (unassigned.length > 0) {
      layers.push(unassigned.map(n => n.id));
    }

    // Position nodes: columns for layers, center-aligned
    for (let col = 0; col < layers.length; col++) {
      const layer = layers[col];
      const layerHeight = layer.length * VERTICAL_SPACING;
      const startY = -layerHeight / 2;

      for (let row = 0; row < layer.length; row++) {
        const node = nodeMap.get(layer[row]);
        if (node) {
          node.position = {
            x: col * HORIZONTAL_SPACING,
            y: startY + row * VERTICAL_SPACING,
          };
        }
      }
    }

    takeSnapshot(); // Save state after layout
  }

  // ══════════════════════════════════════════════
  // Edge Validation (inspired by Langflow)
  // ══════════════════════════════════════════════

  type EdgeValidationError =
    | 'self-loop'
    | 'duplicate'
    | 'no-active-workflow'
    | 'missing-source'
    | 'missing-target'
    | 'type-incompatible'
    | 'cycle-detected';

  interface EdgeValidationResult {
    valid: boolean;
    error?: EdgeValidationError;
    message?: string;
  }

  /** Type compatibility matrix — which node types can connect to which */
  const TYPE_COMPAT: Record<string, string[]> = {
    input: ['agent', 'output', 'condition'],
    agent: ['agent', 'output', 'condition'],
    condition: ['agent', 'output'],
    output: [],
  };

  /**
   * Validate a proposed edge between two nodes.
   * Returns { valid: true } if the edge is allowed.
   */
  function validateEdge(source: string, target: string): EdgeValidationResult {
    // Self-loop check
    if (source === target) {
      return { valid: false, error: 'self-loop', message: '不能连接自身' };
    }

    const wf = activeWorkflow.value;
    if (!wf) {
      return { valid: false, error: 'no-active-workflow', message: '没有活跃工作流' };
    }

    // Node existence check
    const sourceNode = wf.nodes.find(n => n.id === source);
    const targetNode = wf.nodes.find(n => n.id === target);
    if (!sourceNode) {
      return { valid: false, error: 'missing-source', message: '源节点不存在' };
    }
    if (!targetNode) {
      return { valid: false, error: 'missing-target', message: '目标节点不存在' };
    }

    // Duplicate check
    if (wf.edges.some(e => e.source === source && e.target === target)) {
      return { valid: false, error: 'duplicate', message: '连接已存在' };
    }

    // Type compatibility check
    const allowed = TYPE_COMPAT[sourceNode.type] ?? [];
    if (!allowed.includes(targetNode.type)) {
      return {
        valid: false,
        error: 'type-incompatible',
        message: `${sourceNode.type} 不能连接到 ${targetNode.type}`,
      };
    }

    // Cycle detection (would adding this edge create a cycle?)
    const wouldCycle = detectCycle(wf, source, target);
    if (wouldCycle) {
      return { valid: false, error: 'cycle-detected', message: '会产生循环依赖' };
    }

    return { valid: true };
  }

  /** Quick cycle detection using DFS from target to source */
  function detectCycle(wf: Workflow, newSource: string, newTarget: string): boolean {
    const adj = new Map<string, string[]>();
    for (const n of wf.nodes) adj.set(n.id, []);
    for (const e of wf.edges) adj.get(e.source)?.push(e.target);
    // Add the proposed edge
    adj.get(newSource)?.push(newTarget);

    // DFS: can we reach newSource from newTarget?
    const visited = new Set<string>();
    const stack = [newTarget];
    while (stack.length > 0) {
      const current = stack.pop()!;
      if (current === newSource) return true;
      if (visited.has(current)) continue;
      visited.add(current);
      for (const neighbor of adj.get(current) ?? []) {
        stack.push(neighbor);
      }
    }
    return false;
  }

  function createWorkflow(name: string): Workflow {
    const wf: Workflow = {
      id: `wf_${Date.now()}`,
      name,
      nodes: [],
      edges: [],
    };
    workflows.value.push(wf);
    activeWorkflowId.value = wf.id;
    activeWorkflow.value = wf;
    historyStack.value = [];
    historyIndex.value = -1;
    return wf;
  }

  function setActiveWorkflow(id: string) {
    activeWorkflowId.value = id;
    activeWorkflow.value = workflows.value.find(w => w.id === id) ?? null;
    // Reset history for the new workflow
    historyStack.value = [];
    historyIndex.value = -1;
  }

  function addNode(type: WorkflowNodeData['nodeType'], position: { x: number; y: number }, label?: string) {
    const wf = activeWorkflow.value;
    if (!wf) return;

    takeSnapshot();

    const defaultLabels: Record<string, string> = {
      agent: 'Agent',
      input: '输入',
      output: '输出',
      condition: '条件',
    };

    const id = genNodeId();
    const node: WorkflowNode = {
      id,
      type,
      position,
      data: {
        label: label ?? defaultLabels[type] ?? type,
        nodeType: type,
      },
    };
    wf.nodes.push(node);
    nodeStatuses[id] = 'idle';

    takeSnapshot();
    return node;
  }

  function removeNode(nodeId: string) {
    const wf = activeWorkflow.value;
    if (!wf) return;

    takeSnapshot();

    wf.nodes = wf.nodes.filter(n => n.id !== nodeId);
    wf.edges = wf.edges.filter(e => e.source !== nodeId && e.target !== nodeId);
    delete nodeStatuses[nodeId];

    takeSnapshot();
  }

  function addEdge(source: string, target: string): WorkflowEdge | undefined {
    const wf = activeWorkflow.value;
    if (!wf) return undefined;

    // Full validation (replaces old duplicate/self-loop checks)
    const validation = validateEdge(source, target);
    if (!validation.valid) {
      console.warn(`[Workflow] Edge rejected: ${validation.message}`);
      return undefined;
    }

    takeSnapshot();

    const id = genEdgeId();
    const sourceNode = wf.nodes.find(n => n.id === source);
    const targetNode = wf.nodes.find(n => n.id === target);
    const edge: WorkflowEdge = {
      id,
      source,
      target,
      sourceType: sourceNode?.type,
      targetType: targetNode?.type,
      animated: true,
    };
    wf.edges.push(edge);

    takeSnapshot();
    return edge;
  }

  function removeEdge(edgeId: string) {
    const wf = activeWorkflow.value;
    if (!wf) return;

    takeSnapshot();

    wf.edges = wf.edges.filter(e => e.id !== edgeId);

    takeSnapshot();
  }

  /** Topological sort (Kahn's algorithm) */
  function topologicalSort(nodes: WorkflowNode[], edges: WorkflowEdge[]): WorkflowNode[] | null {
    const inDegree = new Map<string, number>();
    const adjList = new Map<string, string[]>();

    for (const n of nodes) {
      inDegree.set(n.id, 0);
      adjList.set(n.id, []);
    }

    for (const e of edges) {
      adjList.get(e.source)?.push(e.target);
      inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1);
    }

    const queue: string[] = [];
    for (const [id, deg] of inDegree) {
      if (deg === 0) queue.push(id);
    }

    const sorted: WorkflowNode[] = [];
    const nodeMap = new Map(nodes.map(n => [n.id, n]));

    while (queue.length > 0) {
      const id = queue.shift()!;
      sorted.push(nodeMap.get(id)!);
      for (const neighbor of adjList.get(id) ?? []) {
        const newDeg = (inDegree.get(neighbor) ?? 1) - 1;
        inDegree.set(neighbor, newDeg);
        if (newDeg === 0) queue.push(neighbor);
      }
    }

    // Cycle detection
    if (sorted.length !== nodes.length) return null;
    return sorted;
  }

  /** Execute workflow: topological sort then sequential execution with status tracking */
  async function executeWorkflow(): Promise<boolean> {
    const wf = activeWorkflow.value;
    if (!wf || wf.nodes.length === 0) return false;

    // Reset all statuses
    for (const n of wf.nodes) {
      nodeStatuses[n.id] = 'idle';
    }

    const sorted = topologicalSort(wf.nodes, wf.edges);
    if (!sorted) {
      console.error('[Workflow] Cycle detected — cannot execute');
      return false;
    }

    for (const node of sorted) {
      nodeStatuses[node.id] = 'running';
      try {
        // Simulate per-node execution (real implementation would dispatch to agent/runtime)
        await executeNode(node);
        nodeStatuses[node.id] = 'done';
      } catch (err) {
        nodeStatuses[node.id] = 'failed';
        console.error(`[Workflow] Node "${node.data.label}" failed:`, err);
        return false;
      }
    }

    return true;
  }

  async function executeNode(node: WorkflowNode): Promise<void> {
    // Placeholder: real implementation would call Tauri commands per node type
    const delay = 200 + Math.random() * 300;
    await new Promise(resolve => setTimeout(resolve, delay));

    if (node.type === 'condition') {
      // Simulate random condition evaluation
      if (Math.random() < 0.1) {
        throw new Error(`Condition "${node.data.label}" evaluated to false`);
      }
    }
  }

  function resetStatuses() {
    const wf = activeWorkflow.value;
    if (!wf) return;
    for (const n of wf.nodes) {
      nodeStatuses[n.id] = 'idle';
    }
  }

  return {
    workflows,
    activeWorkflowId,
    activeWorkflow,
    nodeStatuses,
    // Undo/Redo
    canUndo,
    canRedo,
    takeSnapshot,
    undo,
    redo,
    // Auto-layout
    autoLayout,
    // Existing
    createWorkflow,
    setActiveWorkflow,
    addNode,
    removeNode,
    addEdge,
    removeEdge,
    executeWorkflow,
    topologicalSort,
    resetStatuses,
    validateEdge,
    detectCycle: (source: string, target: string) =>
      activeWorkflow.value ? detectCycle(activeWorkflow.value, source, target) : false,
  };
});
