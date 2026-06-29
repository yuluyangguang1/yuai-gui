import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type { Node, Edge } from "@vue-flow/core";

export interface WorkflowNodeData {
  label: string;
  kind: "agent" | "prompt" | "condition" | "output";
  agentId?: string;
  prompt?: string;
  condition?: string;
  trueLabel?: string;
  falseLabel?: string;
  model?: string;
  description?: string;
}

export interface WorkflowEdgeData {
  sourceHandle?: string;
  targetHandle?: string;
}

export interface WorkflowSchema {
  version: 1;
  kind: "workflow/v1";
  meta?: { name?: string; createdAt?: number; updatedAt?: number };
  nodes: Node<WorkflowNodeData>[];
  edges: Edge<WorkflowEdgeData>[];
}

export const useWorkflowStore = defineStore("workflow", () => {
  // -------------------- State --------------------
  const schemaVersion = ref<number>(1);
  const meta = ref<WorkflowSchema["meta"]>({});
  const nodes = ref<Node<WorkflowNodeData>[]>([]);
  const edges = ref<Edge<WorkflowEdgeData>[]>([]);
  const readOnly = ref(false);
  const history = ref<WorkflowSchema[]>([]);
  const historyIndex = ref(-1);
  const MAX_HISTORY = 40;

  const dirty = computed(() => nodes.value.length > 0 || edges.value.length > 0);

  // -------------------- Undo/Redo (snapshot-based) --------------------
  function snapshot() {
    // 截断前进栈，压入当前状态
    history.value = history.value.slice(0, historyIndex.value + 1);
    history.value.push(toJSON());
    if (history.value.length > MAX_HISTORY) history.value.shift();
    historyIndex.value = history.value.length - 1;
  }

  function undo() {
    if (historyIndex.value > 0) {
      historyIndex.value -= 1;
      loadJSON(history.value[historyIndex.value]);
    }
  }

  function redo() {
    if (historyIndex.value < history.value.length - 1) {
      historyIndex.value += 1;
      loadJSON(history.value[historyIndex.value]);
    }
  }

  function canUndo(): boolean {
    return historyIndex.value > 0;
  }
  function canRedo(): boolean {
    return historyIndex.value < history.value.length - 1;
  }

  // -------------------- Schema / I/O --------------------
  function toJSON(): WorkflowSchema {
    return {
      version: schemaVersion.value,
      kind: "workflow/v1",
      meta: { ...meta.value, updatedAt: Date.now() },
      nodes: structuredClone(nodes.value),
      edges: structuredClone(edges.value),
    };
  }

  function loadJSON(schema: WorkflowSchema) {
    schemaVersion.value = schema.version;
    meta.value = { ...schema.meta };
    nodes.value = schema.nodes.map((n) => ({
      ...n,
      data: { ...n.data },
    }));
    edges.value = schema.edges.map((e) => ({
      ...e,
      data: { ...e.data },
    }));
  }

  function serialize(): string {
    return JSON.stringify(toJSON(), null, 2);
  }

  function deserialize(raw: string): boolean {
    try {
      const parsed = JSON.parse(raw) as Partial<WorkflowSchema>;
      if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) return false;
      loadJSON({
        version: parsed.version ?? 1,
        kind: parsed.kind ?? "workflow/v1",
        meta: parsed.meta,
        nodes: parsed.nodes as Node<WorkflowNodeData>[],
        edges: parsed.edges as Edge<WorkflowEdgeData>[],
      });
      snapshot();
      return true;
    } catch {
      return false;
    }
  }

  // -------------------- Mutation --------------------
  function addNode(kind: WorkflowNodeData["kind"], position?: { x: number; y: number }) {
    const id = `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const node: Node<WorkflowNodeData> = {
      id,
      type: kind,
      position: position ?? { x: 220 + Math.random() * 60, y: 80 + Math.random() * 60 },
      data: {
        label: kind.toUpperCase(),
        kind,
        agentId: kind === "agent" ? "" : undefined,
        prompt: kind === "prompt" ? "" : undefined,
        condition: kind === "condition" ? "" : undefined,
        trueLabel: kind === "condition" ? "成立" : undefined,
        falseLabel: kind === "condition" ? "不成立" : undefined,
        description: kind === "output" ? "结果输出" : undefined,
      },
    };
    nodes.value.push(node);
    snapshot();
  }

  function removeNode(id: string) {
    nodes.value = nodes.value.filter((n) => n.id !== id);
    edges.value = edges.value.filter((e) => e.source !== id && e.target !== id);
    snapshot();
  }

  function setNodes(next: Node<WorkflowNodeData>[]) {
    nodes.value = next;
    snapshot();
  }

  function setEdges(next: Edge<WorkflowEdgeData>[]) {
    edges.value = next;
    snapshot();
  }

  function clear() {
    nodes.value = [];
    edges.value = [];
    meta.value = {};
    snapshot();
  }

  // -------------------- Validation (分两层) --------------------
  interface ValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
  }

  function validateStructure(): Pick<ValidationResult, "errors" | "warnings"> {
    const errors: string[] = [];
    const warnings: string[] = [];
    if (schemaVersion.value !== 1) {
      warnings.push(`非预期 schema 版本：${schemaVersion.value}`);
    }
    if (nodes.value.length === 0) errors.push("至少需要一个节点");
    for (const n of nodes.value) {
      if (!n.id) errors.push("存在未命名节点");
      if (n.data.kind === "agent" && !n.data.agentId) errors.push(`节点 ${n.id} 未选择 Agent`);
      if (n.data.kind === "prompt" && !n.data.prompt?.trim()) errors.push(`节点 ${n.id} 的提示词为空`);
      if (n.data.kind === "condition" && !n.data.condition?.trim()) {
        warnings.push(`条件节点 ${n.id} 条件为空`);
      }
    }
    const ids = new Set(nodes.value.map((n) => n.id));
    for (const e of edges.value) {
      if (!ids.has(e.source)) errors.push(`连线起点不存在: ${e.source}`);
      if (!ids.has(e.target)) errors.push(`连线终点不存在: ${e.target}`);
      if (e.source === e.target) errors.push(`自环连接: ${e.source}`);
    }
    return { errors, warnings };
  }

  function validateExecutable(): Pick<ValidationResult, "errors" | "warnings"> {
    const errors: string[] = [];
    const warnings: string[] = [];
    if (nodes.value.length === 0) {
      errors.push("空白工作流无法执行");
      return { errors, warnings };
    }

    // 至少一个输出节点
    if (!nodes.value.some((n) => n.data.kind === "output")) {
      warnings.push("未检测到 Output 节点，执行结果将不落地");
    }

    // 条件节点必须有两个出口
    for (const n of nodes.value) {
      if (n.data.kind === "condition") {
        const outs = edges.value.filter((e) => e.source === n.id);
        if (outs.length === 0) errors.push(`条件节点 ${n.id} 无出口`);
        if (outs.length === 1) warnings.push(`条件节点 ${n.id} 仅有一个出口，建议 true/false 均连接`);
      }
    }

    // 检测是否为 DAG（简单环检测）
    const visited = new Set<string>();
    const stack = new Set<string>();
    const adj = new Map<string, string[]>();
    for (const n of nodes.value) adj.set(n.id, []);
    for (const e of edges.value) {
      if (adj.has(e.source) && adj.has(e.target)) adj.get(e.source)!.push(e.target);
    }

    function dfs(id: string): boolean {
      visited.add(id);
      stack.add(id);
      for (const child of adj.get(id) || []) {
        if (stack.has(child)) return true;
        if (!visited.has(child) && dfs(child)) return true;
      }
      stack.delete(id);
      return false;
    }

    for (const n of nodes.value) {
      if (!visited.has(n.id) && dfs(n.id)) {
        errors.push("工作流存在环路，无法执行");
        break;
      }
    }

    return { errors, warnings };
  }

  function validate() {
    const structure = validateStructure();
    const executable = validateExecutable();
    return {
      valid: structure.errors.length === 0 && executable.errors.length === 0,
      errors: [...structure.errors, ...executable.errors],
      warnings: [...structure.warnings, ...executable.warnings],
    } as ValidationResult;
  }

  return {
    schemaVersion,
    meta,
    nodes,
    edges,
    readOnly,
    dirty,
    history,
    historyIndex,
    undo,
    redo,
    canUndo,
    canRedo,
    snapshot,
    toJSON,
    loadJSON,
    serialize,
    deserialize,
    addNode,
    removeNode,
    setNodes,
    setEdges,
    clear,
    validate,
  };
});
