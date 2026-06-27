/**
 * Workflow store — DAG-based workflow editor with topological execution.
 */
import { ref, reactive } from 'vue';
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

let nodeCounter = 0;
let edgeCounter = 0;

function genNodeId(): string {
  return `node_${++nodeCounter}_${Date.now()}`;
}

function genEdgeId(): string {
  return `edge_${++edgeCounter}_${Date.now()}`;
}

export const useWorkflowStore = defineStore('workflow', () => {
  const workflows = ref<Workflow[]>([]);
  const activeWorkflowId = ref<string | null>(null);
  const nodeStatuses = reactive<Record<string, NodeStatus>>({});

  /** Get the currently active workflow */
  const activeWorkflow = ref<Workflow | null>(null);

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
    return wf;
  }

  function setActiveWorkflow(id: string) {
    activeWorkflowId.value = id;
    activeWorkflow.value = workflows.value.find(w => w.id === id) ?? null;
  }

  function addNode(type: WorkflowNodeData['nodeType'], position: { x: number; y: number }, label?: string) {
    const wf = activeWorkflow.value;
    if (!wf) return;

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
    return node;
  }

  function removeNode(nodeId: string) {
    const wf = activeWorkflow.value;
    if (!wf) return;

    wf.nodes = wf.nodes.filter(n => n.id !== nodeId);
    wf.edges = wf.edges.filter(e => e.source !== nodeId && e.target !== nodeId);
    delete nodeStatuses[nodeId];
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
    return edge;
  }

  function removeEdge(edgeId: string) {
    const wf = activeWorkflow.value;
    if (!wf) return;
    wf.edges = wf.edges.filter(e => e.id !== edgeId);
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
