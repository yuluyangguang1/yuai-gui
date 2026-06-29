import type { Node, Edge } from '@vue-flow/core';
import type { WorkflowNodeData } from '../../stores/workflow.ts';

type RunStatus = 'idle' | 'running' | 'done' | 'failed';

/**
 * 简单条件表达式求值器
 * 支持: output.contains("x"), status == "done", result > 0, !empty(x)
 */
export function evalCondition(expr: string, context: Record<string, unknown>): boolean {
  if (!expr?.trim()) return true;

  const trimmed = expr.trim();

  // !expr
  if (trimmed.startsWith('!')) {
    return !evalCondition(trimmed.slice(1), context);
  }

  // output.contains("x")
  const containsMatch = trimmed.match(/^(\w+)\.contains\(["'](.+?)["']\)$/);
  if (containsMatch) {
    const [, key, substr] = containsMatch;
    const val = String(context[key] ?? '');
    return val.includes(substr);
  }

  // key == "value" or key == 'value'
  const eqStrMatch = trimmed.match(/^(\w+)\s*==\s*["'](.+?)["']$/);
  if (eqStrMatch) {
    return String(context[eqStrMatch[1]] ?? '') === eqStrMatch[2];
  }

  // key != "value"
  const neqStrMatch = trimmed.match(/^(\w+)\s*!=\s*["'](.+?)["']$/);
  if (neqStrMatch) {
    return String(context[neqStrMatch[1]] ?? '') !== neqStrMatch[2];
  }

  // key == number
  const eqNumMatch = trimmed.match(/^(\w+)\s*==\s*(\d+)$/);
  if (eqNumMatch) {
    return Number(context[eqNumMatch[1]] ?? 0) === Number(eqNumMatch[2]);
  }

  // key > number / key < number
  const cmpMatch = trimmed.match(/^(\w+)\s*([><])\s*(\d+)$/);
  if (cmpMatch) {
    const val = Number(context[cmpMatch[1]] ?? 0);
    return cmpMatch[2] === '>' ? val > Number(cmpMatch[3]) : val < Number(cmpMatch[3]);
  }

  // empty(key) / !empty(key)
  const emptyMatch = trimmed.match(/^empty\((\w+)\)$/);
  if (emptyMatch) {
    const val = context[emptyMatch[1]];
    return val === undefined || val === null || val === '';
  }

  // truthy fallback: check if context key is truthy
  if (/^\w+$/.test(trimmed)) {
    return !!context[trimmed];
  }

  // Unrecognized expression — default true with warning
  console.warn(`[WorkflowEngine] 无法解析条件表达式: ${expr}`);
  return true;
}

export class WorkflowEngine {
  private cancelToken = false;
  private timer: number | null = null;

  constructor(private store: {
    nodes: Node<WorkflowNodeData>[];
    edges: Edge[];
    validate: () => { valid: boolean; errors: string[] };
  }) {}

  cancel() {
    this.cancelToken = true;
  }

  async run(
    ranNodes: Record<string, RunStatus>,
    logs: { value: string[] },
  ) {
    this.cancelToken = false;
    const { valid, errors } = this.store.validate();
    if (!valid) throw new Error(errors.join('\n'));

    // 拓扑排序 + DAG 自动调度
    const indeg = new Map<string, number>();
    const adj = new Map<string, string[]>();
    const results: Record<string, unknown> = {}; // node outputs

    for (const n of this.store.nodes) {
      ranNodes[n.id] = 'idle';
      indeg.set(n.id, 0);
      adj.set(n.id, []);
    }

    // 构建依赖图
    for (const e of this.store.edges) {
      if (adj.has(e.source) && adj.has(e.target)) {
        adj.get(e.source)!.push(e.target);
        indeg.set(e.target, (indeg.get(e.target) || 0) + 1);
      }
    }

    if (this.store.edges.some((e) => e.source === e.target)) {
      throw new Error('发现自环 (self-loop)，请移除再执行');
    }

    const done = new Set<string>();
    const running = new Set<string>();

    // 初始节点（入度 = 0）
    const queue: string[] = [];
    for (const n of this.store.nodes) {
      if ((indeg.get(n.id) || 0) === 0) queue.push(n.id);
    }

    while (true) {
      // 1）出队可执行节点（最多 4 并行）
      while (running.size < 4 && queue.length > 0) {
        const next = queue.shift()!;
        ranNodes[next] = 'running';
        running.add(next);
        this.kick(next, ranNodes, logs, results);
      }

      // 2）检查结束
      if (running.size === 0 && queue.length === 0) break;

      // 3）等待任一并检查推进
      await new Promise((r) => {
        this.timer = window.setTimeout(r, 120);
      });
      if (this.cancelToken) break;

      // 4）从新完成的节点推进拓扑状态
      for (const n of this.store.nodes) {
        if (ranNodes[n.id] === 'done' && !done.has(n.id)) {
          done.add(n.id);
          running.delete(n.id);

          // 条件节点：只推进匹配的分支
          if (n.data.kind === 'condition') {
            const conditionResult = !!results[n.id];
            const label = conditionResult ? (n.data.trueLabel || 'true') : (n.data.falseLabel || 'false');
            logs.value.push(`  ↪ 条件 ${n.data.condition} → ${label}`);

            // 找到匹配 sourceHandle 的边
            const handleId = conditionResult ? 'true' : 'false';
            for (const child of adj.get(n.id) || []) {
              const edge = this.store.edges.find(e => e.source === n.id && e.target === child);
              // 如果有条件边且不匹配，跳过
              if (edge?.sourceHandle && edge.sourceHandle !== handleId) continue;
              // 如果没有指定 handle，两种结果都推进
              const newDeg = (indeg.get(child) || 1) - 1;
              indeg.set(child, newDeg);
              if (newDeg === 0) queue.push(child);
            }
          } else {
            for (const child of adj.get(n.id) || []) {
              const newDeg = (indeg.get(child) || 1) - 1;
              indeg.set(child, newDeg);
              if (newDeg === 0) queue.push(child);
            }
          }
        }
      }
    }
    logs.value.push('---------- 执行结束 ----------');
  }

  private kick(
    id: string,
    ranNodes: Record<string, RunStatus>,
    logs: { value: string[] },
    results: Record<string, unknown>,
  ) {
    const node = this.store.nodes.find((n) => n.id === id)!;
    logs.value.push(`▶ [${node.data.label}] 开始`);
    const duration = 220 + Math.floor(Math.random() * 380);
    const t = window.setTimeout(() => {
      if (this.cancelToken) {
        ranNodes[id] = 'failed';
        logs.value.push(`× [${node.data.label}] 终止`);
        finish(this, id, ranNodes, logs);
      } else {
        ranNodes[id] = 'done';

        // 生成节点输出结果
        if (node.data.kind === 'condition') {
          results[id] = evalCondition(node.data.condition || '', results);
        } else if (node.data.kind === 'agent') {
          results[id] = `[${node.data.agentId || 'agent'}] 模拟响应输出`;
        } else if (node.data.kind === 'prompt') {
          results[id] = `[prompt] ${node.data.prompt?.slice(0, 50) || ''}...`;
        } else {
          results[id] = `done`;
        }

        logs.value.push(`✓ [${node.data.label}] 完成`);
        finish(this, id, ranNodes, logs);
      }
    }, duration);

    function finish(engine: WorkflowEngine, nid: string, rn: Record<string, RunStatus>, lg: { value: string[] }) {
      if (engine.timer) {
        clearTimeout(engine.timer);
        engine.timer = null;
      }
    }
  }
}
