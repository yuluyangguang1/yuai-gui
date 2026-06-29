# Flow DSL / 工作流编辑器最佳实践研究

> 基于 `yuai-gui` 现有 `WorkflowEditor.vue` + `stores/workflow.ts` + VueFlow 依赖现状的调研总结。

---

## 1. 当前实现概览

| 维度 | 现状 | 主要限制 |
|---|---|---|
| **DSL** | 扁平 `nodes`/`edges` JSON；`nodes[].data` 包含 `kind/agent/prompt/condition` | 没有类型约束、版本、元信息、执行运行时字段 |
| **节点** | 4 类内联模板 (`agent`/`prompt`/`condition`/`output`) | 依赖 `WorkflowNode.vue` 未实际接入；没有统一的属性面板 |
| **连线** | `onConnect` 直接 push edge；无 label、条件/校验、样式策略 | 无法表达分支/选择、流控、数据映射 |
| **状态管理** | Pinia `nodes/edges` 双向绑定 | 重操作集中于 store；无历史/撤销；`readOnly`/`dirty` 只做简单推导 |
| **校验** | 轻量字段非空 + 引用存在性 | 无环检测、无执行语义、无 schema/版本校验 |
| **执行** | 无，目前仅保存时打印 raw JSON | 没有状态机、没有状态进度、没有重跑/跳过 |
| **可扩展性** | 硬编码 toolbar | 新增节点类型需修改组件，没有注册机制 |
| **依赖版本** | `@vue-flow/core@1.48.2` + background/controls | 尚未使用 MiniMap/Panel、自定义 edge type、Transform |

---

## 2. 行业参考：主流 Flow DSL 的共性设计

- **基于 DAG + Typed Node**：如 n8n、Pydantic/Airflow、Haystack。
- **将 DSL 与 Runtime State 分离**：`Graph := Nodes + Edges + Schema; Execution := Status + Result + History`。
- **显式 Port（输入/输出口）**：降低连线语义歧义，便于数据映射与分支表达。
- **可执行 DSL + DSL 定义分离**：在保存时做 schema/版本校验；运行时状态不直接持久化进 DSL 根节点。
- **Schema migration & versioning**：设计 `schema_version` + `migrate()`，在有 breaking change 时做无损升级。
- **Branching / fan-out / fan-in**：通过 Handles/Ports 表达多路分发与汇聚，避免 X-Y 乱连。

---

## 3. 建议的 Flow DSL 设计（向后兼容最小化改造）

### 3.1 核心模型（最小可演进谱系）

```ts
// 语义化版本，支持迁移
interface WorkflowMeta {
  id: string;
  title: string;
  schema_version: string; // "1.0.0"
  created_at: string;
  updated_at: string;
  tags?: string[];
}

// 节点：强调“端口化 + 节点类型 + 配置域”
interface WorkflowNode {
  id: string;
  type: "agent" | "prompt" | "condition" | "output"
       | "tool" | "subflow" | "http" | "code"; // 预留扩展
  label: string;
  position?: { x: number; y: number };
  // 可选端口定义（用于严格类型检查和可组合连线）
  ports?: {
    inputs?: { id: string; label: string; type?: string }[];
    outputs?: { id: string; label: string; type?: string }[];
  };
  data: AgentNodeData | PromptNodeData | ConditionNodeData | OutputNodeData | ToolNodeData | /* ... */;
  // 运行时状态可分离，但这里可做镜像字段（执行时填充）避免另建表
  status?: "idle" | "running" | "done" | "failed" | "skipped";
}

interface AgentNodeData {
  kind: "agent";
  agentId: string;
  inputMapping?: Record<string, { from: string; transform?: string }>;
  outputMapping?: Record<string, string>;
  config?: Record<string, unknown>;
}
interface PromptNodeData { kind: "prompt"; prompt: string; }
interface ConditionNodeData { kind: "condition"; expression: string; trueLabel?: string; falseLabel?: string; }
interface OutputNodeData { kind: "output"; format?: "text" | "markdown"; emit?: boolean; }
// ...

interface TypedEdge {
  id: string;
  source: string;
  target: string;
  sourcePort?: string;
  targetPort?: string;
  type?: "default" | "condition" | "data" | "control";
  label?: string;
  // 分支表达式：condition 节点可在此附加守卫表达式
  guardExpression?: string;
  config?: Record<string, unknown>;
}

interface WorkflowGraph {
  meta: WorkflowMeta;
  nodes: WorkflowNode[];
  edges: TypedEdge[];
  // 全局执行参数 / secrets 不直接内嵌；由执行配置层提供
}
```

### 3.2 推荐 DSL 最小增强点

- **顶层 `meta`**：用于标题、版本、标签，便于多文档管理。
- **节点 `ports`**：后续能更精准地做数据映射，当前可以先 `undefined`，不影响现有 UI。
- **`TypedEdge.type/label/guardExpression`**：可落地为 VueFlow `animated` + custom edge label；后续可直接用于执行分支判断。
- **`type` 代替 `kind`**：VueFlow 的 `node.type` 与 Vue component name 绑定，这里保持 `type` 语义一致。

---

## 4. stores/workflow.ts 演进策略

### 4.1 职责分层

建议将现有 store 拆到 2 个 store：
- `useWorkflowStore`：**场景状态**（nodes/edges/selection/readOnly/dirty/snapshot）
- `useWorkflowRuntimeStore`：**执行运行时**（statusByNodeId、executionId、history、outputs）

好处：
- 编辑态与执行态互不干扰；
- 快照更容易基于「编辑器状态」做 undo/redo；
- 执行状态可以做成“临时 overlay”，不影响序列化。

### 4.2 操作记录（Operations / Command Pattern）

```ts
// workflowOperations.ts
export interface WorkflowOp {
  type: "ADD_NODE" | "UPDATE_NODE" | "REMOVE_NODE" | "ADD_EDGE" | "REMOVE_EDGE" | "MOVE_NODE";
  payload: any;
  inverse(): WorkflowOp;
}

class WorkflowHistory {
  private undoStack: WorkflowOp[] = [];
  private redoStack: WorkflowOp[] = [];
  apply(op: WorkflowOp) {
    op.apply(this.store);
    this.undoStack.push(op);
    this.redoStack = [];
  }
  undo() {
    const op = this.undoStack.pop(); if (!op) return;
    op.inverse().apply(this.store);
    this.redoStack.push(op);
  }
  redo() { /* ... */ }
}
```

- 支持 Undo/Redo toolbar 按钮；
- VueFlow 的 `onNodeDragStop` 作为 `MOVE_NODE` 补丁（有节流）。

### 4.3 校验增强（分层）

1. **结构校验**（v1）：
   - 有至少一个节点；
   - 所有边的 source/target 存在；
   - 无自环。

2. **图可执行性校验**（v2）：
   - 连通性检查（可选，要求所有节点可被 weakness reach）。
   - Acyclic：若要求线性流程，需无环；若允许 DAG，则允许分支汇聚，不允许循环。

3. **节点语义校验**（v2）：
   - Agent 节点必须有可用的 `agentId`；
   - Prompt 节点不能空；
   - Condition 节点要有 `trueLabel/falseLabel`（可选）。

4. **Schema 校验**（未来）：
   - 用 zod 定义 `WorkflowGraph` schema：`zod.parse` 快速校验并报具体的 field error；
   - 在 deserialize 时做 strict parse，提供逐字段错误给 UI。

---

## 5. VueFlow 高级用法升级（最低侵入）

### 5.1 组件映射标准化

建议用 `nodeTypes`（`Register map`）而不是内联 slot，这样：
- `WorkflowNode.vue` 可以真正被复用；
- editor 更小；
- 将来每个类型可以拆分到独立目录（HOC + store 注入）。

```ts
import { WorkflowAgentNode, WorkflowPromptNode, WorkflowConditionNode, WorkflowOutputNode } from './workflow-nodes';

const nodeTypes = {
  agent: WorkflowAgentNode,
  prompt: WorkflowPromptNode,
  condition: WorkflowConditionNode,
  output: WorkflowOutputNode,
};
```

然后 editor 统一处理 Handle 与事件：
- `Handle type="target"` 位置 Top；`Handle type="source"` 位置 Bottom；
- `WorkflowAgentNode` 负责渲染 `<select v-model="data.agentId">`。

### 5.2 增强插件启用

- `@vue-flow/minimap`：导航大图；
- `@vue-flow/panel`：全局状态/日志 overlay；
- 自定义 `ConnectionLine` 组件；
- 自定义 `edge` 类型（条件分支）：
  - 定义 `ConditionEdge.vue`，基于 Bezier 并通过 `data.condition` 控制颜色或标签；
  - 使用 `markerEnd` 区分成功/失败/控制边。

### 5.3 交互增强

- 拖拽添加节点：
  - 外层包裹 `@drop="onDrop"`，用 `onDragOver` 开启 drop；
  - toolbox 中的类型项做 `draggable="true"`；
  - `onDrop` 将 workflow event 坐标转为 VueFlow 坐标：`const { project } = useVueFlow(); const position = project({ x: event.offsetX, y: event.offsetY });`；
  - 或者使用 `useVueFlow().addNodes()` 内置方法。
- 节点右键菜单：基于 `<ContextMenu>` 覆写（`onNodeContextMenu`）提供复制/删除/固定位置；
- 连线 label：
  - 自定义 edge component 读取 `data.label`；
  - 或者在 `workflow.ts` 的 edge 上挂 `label`（simple text）并自定义 `EdgeLabelRenderer`。

---

## 6. 以「可执行 DAG」为终态的执行模型建议

即使目前只是保存，DSL 也应该**为执行预留语义**，否则未来改造成本极高。

```ts
interface ExecutionNodeState {
  status: "idle" | "queued" | "running" | "done" | "failed" | "skipped" | "timeout";
  startedAt?: number;
  finishedAt?: number;
  output?: unknown;
  logs?: string[];
  error?: string;
  retryCount?: number;
}

// 执行前 clone 一份 graph，运行时只写 execution state overlay
type ExecutableGraph = WorkflowGraph & {
  executionId: string;
  state: Record<string, ExecutionNodeState>;
};
```

运行核心：
- 路径拓扑求序（Kahn's algorithm）；
- 并行 fan-out；
- 汇聚 fan-in：所有前驱完成才继续；
- 跳过/重试策略；
- 中止信号：沿图传播，避免 orphan 执行体。

这样 `WorkflowEditor.vue` 中增加“运行/停止/跳过”三个主按钮即可，底层状态驱动 UI。

---

## 7. 持久化与迁移

```ts
const LATEST_SCHEMA = "1.0.0";

function migrateWorkflow(raw: WorkflowGraph, fromVersion: string): WorkflowGraph {
  // chain of responsibility: "0.9.0" -> "1.0.0" -> ...
}

function save(store: WorkflowStore) {
  const graph: WorkflowGraph = {
    meta: {
      id: store.id,
      title: store.title,
      schema_version: LATEST_SCHEMA,
      created_at: store.createdAt,
      updated_at: new Date().toISOString(),
      tags: store.tags,
    },
    nodes: store.nodes.toJSON(),
    edges: store.edges.toJSON(),
  };
  localStorage.setItem(`workflow-${graph.meta.id}`, JSON.stringify(graph));
}
```

- 编辑器加载从 `localStorage`/Tauri FS/后端 API；
- `schema_version` 在 `deserialize()` 时读取并调用迁移链；
- Git-friendly：格式化输出 `JSON.stringify(value, null, 2)`，并内置 `stable-serializer`（节点字段按固定顺序）以避免 meaningless diff。

---

## 8. 前端工程建议

### 8.1 文件结构

```
src/
├── components/
│   ├── WorkflowEditor.vue          # 宿主：VueFlow <div, 拖拽区, 按钮
│   ├── workflow/
│   │   ├── WorkflowAgentNode.vue
│   │   ├── WorkflowPromptNode.vue
│   │   ├── WorkflowConditionNode.vue
│   │   ├── WorkflowOutputNode.vue
│   │   ├── CustomEdge.vue
│   │   └── ConnectionLine.vue
│   └── properties/
│       └── NodePropertyPanel.vue   # 右侧属性面板（参数/校验摘要）
├── stores/
│   ├── workflow.ts                 # 场景状态（编辑态）
│   └── workflowRuntime.ts          # 执行态（可选）
├── composables/
│   ├── useWorkflowCommands.ts      # AddNode, RemoveNode, MoveNode...
│   └── useWorkflowHistory.ts       # undo/redo
├── types/
│   └── workflow.ts                 # WorkflowGraph, WorkflowNode, TypedEdge, meta
└── utils/
    └── workflowSchema.ts           # WorkflowGraph schema (zod), validate(), migrate()
```

### 8.2 类型与 Zod

推荐引入 zod 做运行期 schema：
- 定义 `WorkflowGraph` zod schema；
- `deserialize()` 内 `schema.safeParse(json)`;
- 失败时将 zod error 映射为用户可读提示（path + message）。

若当前不想加 zod，TypeScript interface 优先提供开发期检查；但运行时 validate 仍需要手写（现状的 `validate()` 可以扩为「逐步+结构化错误」。

### 8.3 键常量与默认值

- 将 `Agent`/`Prompt` 等枚举改为 `const WorkflowNodeType = { AGENT: 'agent', ... } as const`；
- 提供 `createAgentNode()`, `createEdge()` factory，减少 `WorkflowEditor.vue` 中的裸字段组合。

---

## 9. DX / UX 增强（低成本）

1. **拖放添加节点**：最符合直觉，减少 toolbar 点击次数。
2. **属性面板**：选中节点后右侧显示完整属性（label/agent/prompt/status），避免在 node 内部塞太多表单。
3. **节点图标 + TypeGlyphs**：继承 `WorkflowNode.vue` 的 glyph 视觉系统，统一状态 dot + hover 效果。
4. **MiniMap**：`@vue-flow/minimap` 开箱即用，大图功效显著。
5. **Fit View + 缩略图**：用于初始状态和“适应内容”按钮。
6. **状态 overlay（模拟）**：用 VueFlow 的 `Background pattern` 表达 idle/running，或节点 class 切换。
7. **右侧 validate errors 列表**：将 `validation.errors` 展开为详单，而不是仅 display `errors[0]`。
8. **Autosave / dirty indicator**：加 `watch(dirty)` 配置 auto-save；toolbar 增加 `save status: saved/saving/unsaved` indicator。

---

## 10. 迁移建议（最小风险）

不要推翻现有实现，在 `stores/workflow.ts` 上层逐项迭代：

1. **Step A**：引入 Zod schema，替换/补充 validate()，给出更细错误。
2. **Step B**：在 `WorkflowNodeData` 统一加 `Meta` + `Env` 预留字段（例如 `env?: Record<string,string>`，向前兼容）。
3. **Step C**：实现 `createAgentNode()/createConditionNode()...` factory，减少 editor 逻辑。
4. **Step D**：改成 `nodeTypes` map，复用 `WorkflowNode.vue` 的 glyph/status pattern。
5. **Step E**：启用 `@vue-flow/minimap` + drag and drop。
6. **Step F**：在 metadata 中加 `schema_version`，在 deserialize 时首读。
7. **Step G**：如果后台需要执行，用 `WorkflowRuntimeStore` direcotry 单独加。

每一步都保证：
- UI 复位可正常工作；
- 现有 JSON (flat nodes/edges) 可反序列化，不会破坏老数据；
- 每个 PR 带有对应单元测试。

---

## 11. 推荐阅读 / 参考实现（可再细化）

- **n8n**：从 node/credentials/workflow 三层剥离可执行模型；前端是 over-complicated，但其 Node Type + Connection Type 概念可借鉴。
- **LangGraph / LangChain**：将 StateGraph 引入 RAG/agent pipeline；node 的 state schema 显式定义。
- **Temporal / Cadence**：将 workflow 看作是有版本的、可通过 code 定义的 DAG；glamorous 更简化版。
- **Airflow**：可做 airflow 风格 UI 草图：每个节点依赖 `upstreams`；DAG 校验 + 可视化。

---

## 12. 结论与下一步

当前 `WorkflowEditor.vue` + `stores/workflow.ts` 虽然可以用，但在以下 3 点最需要立刻改进：

1. **节点 Typed Data Schema**：引入 `WorkflowGraph` 顶层 schema，让 validate 具备可读且可扩展的语义错误。
2. **操作命令化**：用 create factory + command history 实现 undo/redo，减少 `store.nodes.value.push()` 的偶发副作用。
3. **VueFlow 高级能力**：`nodeTypes` map + `@vue-flow/minimap` + drag-and-drop，先把“可操作感”补齐，再演进到执行模型与 DSL versioning。

---

*文档生成日期：2026-06-28*
