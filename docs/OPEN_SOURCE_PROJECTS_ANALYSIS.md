# Deep Study: Open Source Projects for yuai-gui

## Executive Summary

Analysis of 5 major open-source projects to extract patterns for yuai-gui (Tauri v2 + Vue 3 + Pinia). Projects cloned to `/Users/ylyg/study-projects/`.

---

## 1. LANGFLOW (Visual Workflow Editor)

**Location:** `/Users/ylyg/study-projects/langflow/`

### Architecture
- **Frontend:** React + TypeScript + Zustand + @xyflow/react (React Flow)
- **Backend:** Python/FastAPI with SQLAlchemy
- **Graph Engine:** Backend graph execution with topological ordering

### Key Patterns

#### Node Type System
```
Nodes have:
- type: "genericNode" | "noteNode" | etc.
- data.node.template: Record<string, TemplateField>
- data.node.outputs: OutputFieldType[]
- handles: left (inputs) + right (outputs) with JSON-encoded IDs
```

**Handle ID Encoding (CRITICAL PATTERN):**
```typescript
// Handles use JSON-encoded IDs for type matching
sourceHandle = JSON.stringify({ dataType, name, id, output_types })
targetHandle = JSON.stringify({ type, fieldName, id, inputTypes })
```

**Edge Validation Algorithm:**
```typescript
function validateEdge(edge, nodes) {
  // 1. Parse source/target handle IDs
  // 2. Check type compatibility (inputTypes vs output_types)
  // 3. Check for proxy fields (bidirectional)
  // 4. Check for loop connections
  // 5. Validate no self-connections
}
```

#### State Management (Zustand)
```
Stores:
- flowStore.ts (1516 lines) - nodes, edges, build status, ReactFlow instance
- flowsManagerStore.ts - multi-flow management, snapshots, undo/redo
- typesStore.ts - component templates/types registry
- alertStore.ts - global alerts
- darkStore.ts - theme
- playgroundStore.ts - chat playground
- sessionManagerStore.ts - session management
- tweaksStore.ts - parameter tweaks
- utilityStore.ts - misc utilities
```

**Pattern: Snapshot-based Undo/Redo**
```typescript
// In flowsManagerStore
takeSnapshot() {
  // Deep clone current state
  // Push to history stack
}
// On undo: restore from snapshot
```

**Pattern: Pending Node Updates with Timeout**
```typescript
const pendingNodeUpdates = new Map<string, { promise, resolve }>();
registerNodeUpdate(nodeId)  // Create promise
completeNodeUpdate(nodeId)  // Resolve promise
waitForNodeUpdates(timeoutMs) // Await all with timeout
```

#### UI Component Patterns

**GenericNode (Main Workflow Node):**
```tsx
// Memoized sub-components for performance
const MemoizedRenderInputParameters = memo(RenderInputParameters);
const MemoizedNodeIcon = memo(NodeIcon);
const MemoizedNodeName = memo(NodeName);

// Uses useShallow for selective Zustand subscriptions
const componentUpdate = useFlowStore(
  useShallow(state => state.componentsToUpdate.find(c => c.id === data.id))
);
```

**Layout Algorithm:**
```typescript
// Uses dagre for automatic layout
import { getLayoutedNodes } from "./layoutUtils";
// Hierarchical layout with configurable direction
```

#### Performance Optimizations
1. `memo()` on all node sub-components
2. `useShallow` for Zustand selector optimization
3. Position dictionary for collision detection
4. Lazy validation with `waitForNodeUpdates`
5. Component code validity checking (outdated/blocked detection)

### Patterns to Port for yuai-gui

| Pattern | Priority | Complexity |
|---------|----------|------------|
| Handle ID JSON encoding | HIGH | LOW |
| Edge validation algorithm | HIGH | MEDIUM |
| Zustand → Pinia store structure | MEDIUM | LOW |
| Snapshot undo/redo | HIGH | MEDIUM |
| Dagre layout integration | MEDIUM | LOW |
| GenericNode component structure | HIGH | MEDIUM |

---

## 2. MICROSOFT AUTOGEN (Multi-Agent Orchestration)

**Location:** `/Users/ylyg/study-projects/autogen/`

### Architecture

#### Core Agent Protocol
```python
class Agent(Protocol):
    metadata: AgentMetadata
    id: AgentId
    
    async def on_message(self, message: Any, ctx: MessageContext) -> Any
    async def save_state(self) -> Mapping[str, Any]
    async def load_state(self, state: Mapping[str, Any]) -> None
    async def close(self) -> None
```

#### Agent Runtime Protocol
```python
class AgentRuntime(Protocol):
    async def send_message(message, recipient: AgentId, sender=None) -> Any
    async def publish_message(message, topic_id: TopicId) -> None
    async def register_factory(type: str, agent_factory: Callable) -> AgentType
    async def register_agent_instance(agent: Agent, agent_id: AgentId) -> AgentId
```

**Key Concept: Topic-based Pub/Sub**
```python
# Agents subscribe to topics
# Messages published to topics are delivered to all subscribers
# Supports point-to-point (send_message) and broadcast (publish_message)
```

#### Group Chat Orchestration Patterns

**BaseGroupChat Architecture:**
```
Team
├── participants: List[ChatAgent | Team]
├── group_chat_manager (sequential routed agent)
├── output_message_queue: asyncio.Queue
├── topic_types:
│   ├── group_topic_{team_id}      # broadcast
│   ├── manager_{team_id}          # manager direct
│   ├── participant_{name}_{team_id}  # each agent
│   └── output_topic_{team_id}     # streaming output
└── runtime: AgentRuntime
```

**Group Chat Manager Types:**
1. **SelectorGroupChat** - LLM-based speaker selection
2. **RoundRobinGroupChat** - Rotating turns
3. **SwarmGroupChat** - Handoff-based
4. **MagenticOneGroupChat** - Complex orchestration
5. **DiGraphGroupChat** - DAG-based execution

**Selector Algorithm (Key Pattern):**
```python
async def select_speaker(thread):
    # 1. Check custom selector function
    if self._selector_func:
        speaker = self._selector_func(thread)
        if speaker: return [speaker]
    
    # 2. Filter candidates
    if self._candidate_func:
        participants = self._candidate_func(thread)
    elif not self._allow_repeated_speaker:
        participants = [p for p in all if p != previous_speaker]
    
    # 3. LLM-based selection with prompt
    model_context = self._model_context
    prompt = self._selector_prompt.format(
        participants=participant_descriptions,
        thread=thread
    )
    result = await self._model_client.create([SystemMessage(prompt)])
    # Parse agent name from response
```

#### State Management
```python
# Serializable state for persistence
class SelectorManagerState(BaseModel):
    message_thread: List[SerializedMessage]
    current_turn: int
    previous_speaker: str | None
```

#### WebSocket Streaming (AutoGen Studio)
```python
class WebSocketManager:
    async def start_stream(self, run_id, task, team_config):
        async for message in team_manager.run_stream(task, team_config):
            formatted = self._format_message(message)
            await self._send_message(run_id, formatted)
            if isinstance(message, (TextMessage, ToolCallRequestEvent)):
                await self._save_message(run_id, message)
```

### Patterns to Port for yuai-gui

| Pattern | Priority | Complexity |
|---------|----------|------------|
| Agent protocol (on_message, save/load state) | HIGH | MEDIUM |
| Topic-based pub/sub messaging | HIGH | HIGH |
| Group chat manager abstraction | HIGH | HIGH |
| Selector speaker algorithm | MEDIUM | MEDIUM |
| WebSocket streaming manager | HIGH | MEDIUM |
| Serializable agent state | HIGH | LOW |

---

## 3. CREWAI (Role-Based Agents)

**Location:** `/Users/ylyg/study-projects/crewAI/`

### Architecture

#### Crew Definition (Pydantic Models)
```python
class Crew(FlowTrackable, BaseModel):
    tasks: list[Task]
    agents: list[BaseAgent]
    process: Process  # sequential | hierarchical
    memory: bool | Memory | MemoryScope
    manager_llm: str | BaseLLM
    manager_agent: BaseAgent | None
    
    # Callbacks
    step_callback: Callable
    task_callback: Callable
    before_kickoff_callbacks: list[Callable]
    after_kickoff_callbacks: list[Callable]
```

#### Flow DSL (Decorator-Based)
```python
class Flow(FlowTrackable, RuntimeFlow[T]):
    pass

# Decorators for flow definition
@start()           # Entry point
@listen(trigger)   # React to events
@router(trigger)   # Conditional routing
@or_(a, b)         # Either condition
@and_(a, b)        # Both conditions
```

**Listen Implementation:**
```python
def listen(condition: FlowTrigger) -> FlowMethodDecorator:
    def decorator(func):
        wrapper = ListenMethod(func)
        _merge_flow_method_definition(wrapper, FlowMethodDefinition(
            do=_method_action(func),
            listen=_to_definition_condition(condition),
        ))
        return wrapper
    return decorator
```

**Router Implementation:**
```python
def router(condition=None, *, emit=None):
    def decorator(func):
        wrapper = RouterMethod(func)
        # Extract return type annotations for emit events
        router_events = _get_router_return_events(func) or []
        _merge_flow_method_definition(wrapper, FlowMethodDefinition(
            do=_method_action(func),
            router=True,
            emit=router_events or None,
        ))
        return wrapper
    return decorator
```

#### Agent Execution Loop
```python
class LiteAgent(FlowTrackable, BaseModel):
    role: str
    goal: str
    backstory: str
    tools: list[BaseTool]
    llm: str | BaseLLM
    
    async def kickoff(self, messages, response_format=None):
        # 1. Format messages for LLM
        # 2. Get tool descriptions
        # 3. Call LLM with tools
        # 4. Parse response (AgentAction or AgentFinish)
        # 5. If AgentAction: execute tool, loop
        # 6. If AgentFinish: return output
```

**Tool Execution Pattern:**
```python
async def execute_tool_and_check_finality(tool, tool_input, agent):
    # Execute tool
    result = await tool.arun(tool_input)
    # Check if result indicates final answer
    # Return (result, is_final)
```

### Patterns to Port for yuai-gui

| Pattern | Priority | Complexity |
|---------|----------|------------|
| Pydantic-based crew/agent definition | HIGH | MEDIUM |
| Flow DSL (@start, @listen, @router) | HIGH | HIGH |
| Sequential/hierarchical process | HIGH | MEDIUM |
| Tool execution with finality check | MEDIUM | LOW |
| Callback system (before/after) | MEDIUM | LOW |
| Memory/knowledge integration | LOW | HIGH |

---

## 4. VOID EDITOR (AI IDE with Monaco)

**Location:** `/Users/ylyg/study-projects/void/`

### Architecture
- **Base:** VS Code fork (Electron + Monaco)
- **AI Layer:** Services injected into VS Code DI container
- **UI:** React components mounted into Monaco view zones

### Key Patterns

#### Diff System (findDiffs.ts)
```typescript
function findDiffs(oldStr: string, newStr: string): ComputedDiff[] {
    // Uses diff library for line-by-line comparison
    const lineByLineChanges = diffLines(oldStr + '\n', newStr + '\n');
    
    // Track "streaks" of additions/removals
    let streakStartInNewFile: number | undefined;
    let streakStartInOldFile: number | undefined;
    
    for (const line of lineByLineChanges) {
        if (!line.added && !line.removed) {
            // End streak, create diff entry
            if (streakStartInNewFile !== undefined) {
                const type = determineType(startLine, endLine, origStart, origEnd);
                replacements.push({ type, startLine, endLine, originalCode, code });
            }
        }
        // Track additions/removals
    }
    return replacements;
    // Returns: { type: 'edit'|'insertion'|'deletion', startLine, endLine, ... }
}
```

#### EditCodeService (Inline Diff Application)
```typescript
class EditCodeService extends Disposable {
    // Tracks diff areas per URI
    diffAreasOfURI: Record<string, Set<string>> = {};
    diffAreaOfId: Record<string, DiffArea> = {};
    
    // Events for UI updates
    onDidAddOrDeleteDiffZones: Event<{ uri: URI }>;
    onDidChangeDiffsInDiffZoneNotStreaming: Event<{ uri, diffareaid }>;
    onDidChangeStreamingInDiffZone: Event<{ uri, diffareaid }>;
    
    // Key operations:
    // - findTextInCode() - locate text in file (with whitespace fallback)
    // - applyDiff() - apply AI-generated changes
    // - accept/reject diff zones
    // - Stream partial completions
}
```

**Search/Replace Block Extraction:**
```typescript
// Extract code from LLM responses
extractSearchReplaceBlocks(response) -> ExtractedSearchReplaceBlock[]
// Supports: FIM completion, regular completion, search/replace format
```

#### Chat Thread Service
```typescript
type ThreadType = {
    id: string;
    messages: ChatMessage[];
    state: {
        currCheckpointIdx: number | null;
        stagingSelections: StagingSelectionItem[];
        focusedMessageIdx: number | undefined;
        linksOfMessageIdx: Record<number, Record<string, CodespanLocationLink>>;
    };
}

type IsRunningType = 'LLM' | 'tool' | 'awaiting_user' | 'idle' | undefined;
```

**Thread Stream State (Discriminated Union):**
```typescript
type ThreadStreamState = 
    | { isRunning: undefined; error?: { message, fullError } }
    | { isRunning: 'LLM'; llmInfo: { displayContentSoFar, reasoningSoFar, toolCallSoFar } }
    | { isRunning: 'tool'; toolInfo: { toolName, toolParams, id, content } }
    | { isRunning: 'awaiting_user' }
    | { isRunning: 'idle' };
```

#### Sidebar Integration
```typescript
// Mount React into VS Code view pane
class SidebarViewPane extends ViewPane {
    renderBody(parent: HTMLElement) {
        const disposeFn = mountSidebar(parent, accessor)?.dispose;
        this._register(toDisposable(() => disposeFn?.()));
    }
}
```

### Patterns to Port for yuai-gui

| Pattern | Priority | Complexity |
|---------|----------|------------|
| findDiffs algorithm | HIGH | LOW |
| Inline diff visualization | HIGH | HIGH |
| Search/replace block extraction | HIGH | MEDIUM |
| Chat thread with checkpoints | HIGH | MEDIUM |
| Discriminated union stream state | HIGH | LOW |
| Ctrl+K inline edit pattern | MEDIUM | HIGH |

---

## 5. GPT-RUNNER (Tauri+Vue3 AI Tool)

**Location:** `/Users/ylyg/study-projects/gpt-runner/`

### Architecture
- **Frontend:** React + styled-components + Zustand (NOT Vue as expected)
- **Backend:** Express.js server with WebSocket
- **Editor:** Monaco via VS Code webview toolkit
- **Config:** gptr.config.ts files

### Key Patterns

#### File Tree Component
```tsx
const FileTree: FC<FileTreeProps> = memo(({ rootPath, reverseTreeUi }) => {
    const { filesTree, fullPathFileMap, updateFilesTree } = useTempStore();
    const { checkedFilePaths, updateCheckedFilePaths } = useGlobalStore();
    
    // Recursive tree traversal
    travelTreeDeepFirst(filesTree, (item) => {
        if (item.isLeaf) return item;
        const childrenAllChecked = children.every(c => c.otherInfo?.checked);
        item.otherInfo!.checked = childrenAllChecked;
    });
    
    // Checkbox cascading (parent-child sync)
    const handleCheckedChange = (checked: boolean) => {
        if (!checked) {
            // Uncheck all children
            travelTree(children, (child) => {
                child.otherInfo!.checked = false;
            });
        } else {
            // Check all children
            travelTree(children, (child) => {
                child.otherInfo!.checked = true;
            });
        }
    };
});
```

**File Icons System:**
```typescript
// Material Design icons per file extension
const MaterialSvgComponent = getIconComponent({
    isFolder: !isLeaf,
    isOpen: isExpanded,
    name: otherInfo?.name || '',
});
```

#### Store Structure (Zustand)
```
store/zustand/
├── global/          # Global state slices
│   ├── file-tree.slice.ts
│   └── ...
├── temp/            # Temporary/transient state
│   └── filesTree, fullPathFileMap
├── file-editor/     # Editor state
│   └── addFileEditorItem
└── context/         # React contexts
    ├── modal-context.tsx
    ├── loading-context.tsx
    └── confetti-context.tsx
```

#### Server Architecture
```
packages/gpt-runner-web/server/
├── controllers/
│   ├── common-files.controller.ts
│   ├── editor.controller.ts
│   ├── gpt-files.controller.ts
│   ├── llm.controller.ts
│   └── storage.controller.ts
├── services/
│   ├── app-config.service.ts
│   └── llm.service.ts
└── helpers/
    └── app-config/
```

### Patterns to Port for yuai-gui

| Pattern | Priority | Complexity |
|---------|----------|------------|
| File tree with checkbox cascading | HIGH | MEDIUM |
| Material file icons | MEDIUM | LOW |
| Zustand slice pattern → Pinia | MEDIUM | LOW |
| Editor tab management | HIGH | MEDIUM |
| WebSocket storage sync | MEDIUM | MEDIUM |

---

## 6. AUTOGEN STUDIO (Visual Team Builder)

**Location:** `/Users/ylyg/study-projects/autogen/python/packages/autogen-studio/`

### Key Patterns

#### Visual Team Builder (React Flow + DnD)
```tsx
// Node types with icon mapping
const iconMap = {
    team: Users,
    agent: Bot,
    tool: Wrench,
    model: Brain,
    termination: Timer,
    workbench: Package,
};

// BaseNode with droppable zones
const BaseNode = memo(({ id, data, icon: Icon, children }) => {
    const removeNode = useTeamBuilderStore(state => state.removeNode);
    return (
        <div className="bg-white rounded-lg shadow-lg w-72">
            <div className="border-b p-3 bg-gray-50">
                <Icon /> <span>{data.component.label}</span>
                <button onClick={() => setSelectedNode(id)}>Edit</button>
                <button onClick={() => removeNode(id)}>Delete</button>
            </div>
            <DroppableZone accepts={['agent', 'tool']}>
                {children}
            </DroppableZone>
        </div>
    );
});
```

#### Team Builder Store (Zustand)
```typescript
interface TeamBuilderState {
    nodes: CustomNode[];
    edges: CustomEdge[];
    selectedNodeId: string | null;
    history: Array<{ nodes, edges }>;
    currentHistoryIndex: number;
    
    addNode(position, component, targetNodeId): void;
    updateNode(nodeId, updates): void;
    removeNode(nodeId): void;
    syncToJson(): Component<TeamConfig>;
    loadFromJson(config): GraphState;
    undo(): void;
    redo(): void;
}
```

**Build Team from Graph:**
```typescript
function buildTeamComponent(teamNode, nodes, edges) {
    const component = { ...teamNode.data.component };
    // Get participants using edges
    const participantEdges = edges.filter(
        e => e.source === teamNode.id && e.type === 'agent-connection'
    );
    component.config.participants = participantEdges
        .map(edge => nodes.find(n => n.id === edge.target))
        .filter(isAgentComponent);
    return component;
}
```

---

## INTEGRATION PLAN FOR yuai-gui

### Phase 1: Core Agent Infrastructure (Week 1-2)

**1.1 Agent Protocol (from AutoGen)**
```typescript
// Pinia store: agentStore.ts
interface Agent {
    id: string;
    type: string;
    metadata: AgentMetadata;
    
    onMessage(message: any, context: MessageContext): Promise<any>;
    saveState(): Promise<Record<string, any>>;
    loadState(state: Record<string, any>): Promise<void>;
    close(): Promise<void>;
}
```

**1.2 Message Bus (from AutoGen)**
```typescript
// composable: useMessageBus.ts
export function useMessageBus() {
    const subscribers = new Map<string, Set<(msg: any) => void>>();
    
    function publish(topic: string, message: any) { ... }
    function subscribe(topic: string, handler: (msg: any) => void) { ... }
    function unsubscribe(topic: string, handler: (msg: any) => void) { ... }
    
    return { publish, subscribe, unsubscribe };
}
```

**1.3 Agent Orchestration Store (from CrewAI + AutoGen)**
```typescript
// Pinia store: orchestrationStore.ts
interface OrchestrationState {
    agents: Map<string, Agent>;
    processes: Map<string, Process>;
    activeProcessId: string | null;
    
    // Process types
    addSequentialProcess(agents: Agent[], tasks: Task[]): string;
    addHierarchicalProcess(manager: Agent, agents: Agent[]): string;
    addSelectorProcess(agents: Agent[], selector: Function): string;
    
    // Execution
    runProcess(processId: string, input: any): Promise<any>;
    pauseProcess(processId: string): void;
    resumeProcess(processId: string): void;
}
```

### Phase 2: Visual Workflow Editor (Week 3-4)

**2.1 Node Type System (from Langflow)**
```typescript
// types/workflow.ts
interface WorkflowNode {
    id: string;
    type: 'agent' | 'tool' | 'condition' | 'input' | 'output';
    data: {
        label: string;
        config: Record<string, any>;
        inputs: PortDefinition[];
        outputs: PortDefinition[];
    };
    position: { x: number; y: number };
}

interface PortDefinition {
    name: string;
    type: string;
    multiple: boolean;
}

interface WorkflowEdge {
    id: string;
    source: string;
    sourcePort: string;
    target: string;
    targetPort: string;
}
```

**2.2 Edge Validation (from Langflow)**
```typescript
// composables/useWorkflowValidation.ts
export function useWorkflowValidation() {
    function validateEdge(edge: WorkflowEdge, nodes: WorkflowNode[]): boolean {
        const sourceNode = nodes.find(n => n.id === edge.source);
        const targetNode = nodes.find(n => n.id === edge.target);
        
        // Check ports exist
        const sourcePort = sourceNode.data.outputs.find(p => p.name === edge.sourcePort);
        const targetPort = targetNode.data.inputs.find(p => p.name === edge.targetPort);
        
        // Check type compatibility
        return isTypeCompatible(sourcePort.type, targetPort.type);
    }
    
    function detectCycles(nodes: WorkflowNode[], edges: WorkflowEdge[]): boolean {
        // Topological sort to detect cycles
    }
    
    return { validateEdge, detectCycles };
}
```

**2.3 Vue Flow Integration**
```vue
<!-- components/WorkflowEditor.vue -->
<script setup>
import { VueFlow, useVueFlow } from '@vue-flow/core';
import AgentNode from './nodes/AgentNode.vue';
import ToolNode from './nodes/ToolNode.vue';
import ConditionNode from './nodes/ConditionNode.vue';

const nodeTypes = { agent: AgentNode, tool: ToolNode, condition: ConditionNode };
const { nodes, edges, addNodes, addEdges } = useVueFlow();
</script>
```

### Phase 3: Chat & Streaming (Week 5-6)

**3.1 Chat Thread Service (from Void)**
```typescript
// Pinia store: chatStore.ts
interface ChatThread {
    id: string;
    messages: ChatMessage[];
    checkpoints: Checkpoint[];
    streamState: StreamState;
}

type StreamState = 
    | { status: 'idle' }
    | { status: 'streaming'; agentId: string; contentSoFar: string }
    | { status: 'tool_call'; toolName: string; params: any }
    | { status: 'awaiting_input' }
    | { status: 'error'; message: string };
```

**3.2 WebSocket Manager (from AutoGen Studio)**
```typescript
// Rust side (Tauri command)
#[tauri::command]
async fn stream_agent_response(
    state: State<'_, AppState>,
    process_id: String,
    input: String,
) -> Result<(), String> {
    // Stream messages back to frontend via events
    let mut stream = run_process(process_id, input).await;
    while let Some(message) = stream.next().await {
        app_handle.emit("agent-message", message)?;
    }
    Ok(())
}
```

### Phase 4: Diff Viewer (Week 7)

**4.1 Diff Algorithm (from Void)**
```typescript
// composables/useDiffViewer.ts
export function useDiffViewer() {
    function computeDiffs(oldCode: string, newCode: string): Diff[] {
        const changes = diffLines(oldCode, newCode);
        // Process into streaks of additions/removals
        // Return typed diffs: 'edit' | 'insertion' | 'deletion'
    }
    
    function applyDiff(original: string, diff: Diff): string { ... }
    function rejectDiff(original: string, diff: Diff): string { ... }
    
    return { computeDiffs, applyDiff, rejectDiff };
}
```

### Phase 5: File Management (Week 8)

**5.1 File Tree (from GPT-Runner)**
```typescript
// Pinia store: fileTreeStore.ts
interface FileTreeNode {
    name: string;
    path: string;
    isDirectory: boolean;
    children?: FileTreeNode[];
    checked?: boolean;
    icon?: string;
}

function cascadeCheck(node: FileTreeNode, checked: boolean) {
    node.checked = checked;
    if (node.children) {
        node.children.forEach(child => cascadeCheck(child, checked));
    }
}
```

---

## PRIORITY MATRIX

| Feature | Source | Priority | Effort | Impact |
|---------|--------|----------|--------|--------|
| Agent Protocol | AutoGen | P0 | 2d | Foundation |
| Message Bus | AutoGen | P0 | 1d | Foundation |
| Edge Validation | Langflow | P0 | 1d | Workflow |
| Diff Algorithm | Void | P0 | 1d | AI Editing |
| Chat Stream State | Void | P0 | 1d | Chat |
| Workflow Nodes | Langflow | P1 | 3d | Workflow |
| Crew/Process Model | CrewAI | P1 | 2d | Orchestration |
| File Tree | GPT-Runner | P1 | 2d | File Mgmt |
| Snapshot Undo/Redo | Langflow | P1 | 2d | UX |
| Selector Algorithm | AutoGen | P2 | 2d | Advanced |
| Inline Diff UI | Void | P2 | 3d | AI Editing |
| Flow DSL | CrewAI | P2 | 3d | Advanced |
| Visual Team Builder | AutoGen Studio | P2 | 4d | Workflow |

**Total estimated effort: ~30 days for core features**

---

## TECH STACK MAPPING

| Pattern Source | Original Tech | yuai-gui Adaptation |
|---------------|---------------|---------------------|
| Langflow stores | Zustand (React) | Pinia (Vue 3) |
| Langflow nodes | @xyflow/react | @vue-flow/core |
| AutoGen agents | Python Protocol | TypeScript Interface |
| AutoGen WebSocket | FastAPI WebSocket | Tauri Events/Commands |
| CrewAI Pydantic | Python Pydantic | Zod/TypeBox |
| CrewAI decorators | Python decorators | Vue composables/TS decorators |
| Void diff | Monaco Editor | Monaco Editor (same!) |
| Void services | VS Code DI | Vue provide/inject |
| GPT-Runner tree | React + Zustand | Vue 3 + Pinia |

---

## KEY TAKEAWAYS

1. **Agent Protocol is universal** — AutoGen's Agent protocol (on_message, save/load state) maps perfectly to TypeScript interfaces. This should be the foundation.

2. **Topic-based messaging is powerful** — AutoGen's pub/sub pattern with topic types is cleaner than direct agent-to-agent calls. Implement early.

3. **Edge validation is critical** — Langflow's JSON-encoded handle IDs and type checking prevents invalid connections. Port this directly.

4. **Diff algorithm is portable** — Void's findDiffs() is framework-agnostic TypeScript. Copy directly.

5. **Discriminated unions for state** — Void's ThreadStreamState pattern prevents impossible states in TypeScript. Use throughout.

6. **Snapshot undo/redo** — Both Langflow and AutoGen Studio use this. Implement with deep clone + history stack.

7. **Vue Flow is the right choice** — @vue-flow/core is the Vue equivalent of @xyflow/react. Same concepts, Vue API.

8. **Tauri events replace WebSockets** — Use Tauri's event system instead of WebSocket for streaming agent responses.

## Files Created
- `/Users/ylyg/Desktop/yuai-gui/docs/OPEN_SOURCE_PROJECTS_ANALYSIS.md` (this file)

## Repositories Cloned
- `/Users/ylyg/study-projects/langflow/`
- `/Users/ylyg/study-projects/autogen/`
- `/Users/ylyg/study-projects/crewAI/`
- `/Users/ylyg/study-projects/void/`
- `/Users/ylyg/study-projects/gpt-runner/`
