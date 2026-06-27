# Master Project Analysis: 15 Projects → yuai-gui Integration

**Generated:** 2026-06-28  
**Target:** yuai-gui (Tauri v2 + Vue 3 + Pinia, multi-agent desktop app)  
**Stack:** Rust backend (Tauri commands), Vue 3 frontend, @vue-flow/core, Monaco Editor, xterm.js

---

## Part 1: Project-by-Project Analysis

---

### 1. FanBox (`/tmp/fanbox-inspect`)

**What it does:** Electron-based file manager with agent launcher sidebar. Provides file browsing, project detection, and quick-launch for coding agents.

**Key Architecture Patterns:**
- Electron main/renderer process split
- File system watchers (chokidar) with debounced updates
- Agent process spawning with PTY management
- IPC bridge between renderer and Node.js backend

**Code Patterns Worth Porting:**
- File tree traversal with lazy loading (children loaded on expand)
- Agent launcher with process lifecycle management (spawn/kill/restart)
- Project root detection (walks up looking for .git, package.json, etc.)

**Integration Priority:** P1  
**Estimated Effort:** 2-3 days  
**Already Implemented?** Partial — yuai-gui has `FileTreeNode.vue`, agent spawning via PTY, but lacks project root detection and file watchers.

---

### 2. Hermes Studio (`/tmp/hermes-studio`)

**What it does:** Multi-agent platform with session management, skill system, device bridging (LAN peers), and coding agent orchestration. The backend powering this very session.

**Key Architecture Patterns:**
- RESTful API with session/message CRUD
- Skill system with SKILL.md discovery and hot-reload
- Agent bridge protocol (Python bridge_server, bridge_pool, bridge_broker)
- LAN device discovery and peer-to-peer terminal/file transfer
- OpenAPI-first design with auto-generated client

**Code Patterns Worth Porting:**
- Session lifecycle: create → message → stream → complete
- Skill manifest format (SKILL.md with frontmatter)
- Agent bridge broker pattern: pool → transport → runtime
- Device pairing and connection management
- Usage statistics tracking per-model per-session

**Integration Priority:** P0  
**Estimated Effort:** 5-7 days  
**Already Implemented?** Partial — yuai-gui has `skills.ts` store, `mcp.ts` store, agent sessions, but lacks LAN bridging, skill hot-reload, and the bridge broker pattern.

---

### 3. itshover (GitHub: itshover/itshover)

**What it does:** Collection of animated SVG icons with hover-triggered micro-animations using CSS transitions and motion paths.

**Key Architecture Patterns:**
- SVG path-based icon definitions with animation metadata
- CSS transition/transform-based animations (no JS runtime)
- Hover-triggered state changes with CSS classes

**Code Patterns Worth Porting:**
- Icon definition format: `{ viewBox, paths[], animation }` 
- CSS animation keyframes per icon type
- Vue composable pattern for hover state management

**Integration Priority:** P2  
**Estimated Effort:** 1 day  
**Already Implemented?** **Yes** — `animatedIcons.ts` and `AnimatedIcon.vue` already implement this pattern with 11 icons (arrow, star, search, settings, close, check, refresh, loader, folder, file).

---

### 4. Taste Skill (GitHub: Leonxlnx/taste-skill)

**What it does:** Anti-slop design rules for AI coding agents — a SKILL.md that teaches agents to write production-quality code with proper patterns, not generic boilerplate.

**Key Architecture Patterns:**
- Skill-as-document: markdown files that agents read as system prompts
- Design rule categories: architecture, naming, error handling, testing
- Concrete code examples (good vs bad) for each rule

**Code Patterns Worth Porting:**
- Skill template format with categorized rules
- Code example blocks (✅ good / ❌ bad pattern pairs)
- Rule enforcement via agent prompt injection

**Integration Priority:** P1  
**Estimated Effort:** 1-2 days  
**Already Implemented?** Partial — yuai-gui has `SkillsPanel.vue` and `skills.ts` store for managing skills, but lacks the taste-skill style rule templates and the "good vs bad" code example format.

---

### 5. CanIRun.ai

**What it does:** Web-based hardware detection tool that identifies GPU, CPU, RAM, and storage to determine if a system can run specific AI models.

**Key Architecture Patterns:**
- WebGL-based GPU detection (`WEBGL_debug_renderer_info`)
- Navigator API for CPU cores and device memory
- Capability scoring matrix (hardware → model compatibility)

**Code Patterns Worth Porting:**
- GPU vendor/renderer extraction from WebGL context
- Hardware capability scoring for model recommendations
- Storage estimation patterns

**Integration Priority:** P1  
**Estimated Effort:** 1-2 days  
**Already Implemented?** **Yes** — `hardware.ts` store and `HardwarePanel.vue` already implement GPU (WebGL), CPU cores, and RAM detection. Could be extended with storage detection and model compatibility scoring.

---

### 6. Craft Agents (GitHub: craft-ai-agents/craft-agents-oss)

**What it does:** Agent-native workspace where agents have persistent context, tool access, and can collaborate on files with humans in real-time.

**Key Architecture Patterns:**
- Agent workspace isolation (each agent has own file context)
- Tool registry with permission scoping
- Real-time collaboration protocol (agent + human editing same file)
- Context window management with automatic summarization

**Code Patterns Worth Porting:**
- Tool registry: `{ name, description, parameters, permissions }`
- Workspace isolation per agent (scoped file access)
- Context budget management (track tokens, auto-summarize when over budget)
- Collaboration state machine (idle → agent_editing → human_reviewing → merged)

**Integration Priority:** P2  
**Estimated Effort:** 3-4 days  
**Already Implemented?** Partial — yuai-gui has `chat.ts` with token estimation and context compression, `writeGate.ts` for write gating. Lacks per-agent workspace isolation and tool registry.

---

### 7. Odysseus (GitHub: pewdiepie-archdaemon/odysseus)

**What it does:** Self-hosted AI workspace with integrated chat, file management, and terminal — a local-first alternative to cloud AI IDEs.

**Key Architecture Patterns:**
- Local-first architecture (all data on disk, no cloud dependency)
- Integrated terminal with shell detection
- File tree with real-time sync via filesystem watchers
- Project-level configuration (.odysseus/ config directory)

**Code Patterns Worth Porting:**
- Project config directory pattern (.yuai/ or similar)
- Shell detection and terminal profile management
- Filesystem watcher integration for live tree updates
- Local-first data model (SQLite or JSON on disk)

**Integration Priority:** P2  
**Estimated Effort:** 2-3 days  
**Already Implemented?** Partial — yuai-gui has terminal integration (`Terminal.vue`), file tree, and Tauri-based local storage. Could benefit from project-level config and filesystem watchers.

---

### 8. Orca (GitHub: stablyai/orca)

**What it does:** Parallel agent IDE that runs multiple AI agents simultaneously on the same codebase with visual diff and merge capabilities.

**Key Architecture Patterns:**
- Parallel agent execution with isolated git worktrees
- Visual diff overlay showing each agent's changes
- Merge conflict resolution UI
- Agent result comparison and selection

**Code Patterns Worth Porting:**
- Git worktree management for parallel agent isolation
- Side-by-side diff comparison between agent outputs
- Agent result scoring/comparison UI
- Worktree lifecycle: create → agent_work → review → merge_or_discard

**Integration Priority:** P2  
**Estimated Effort:** 4-5 days  
**Already Implemented?** No — yuai-gui has `DiffViewer.vue` for single diffs, but lacks parallel agent execution with worktree isolation and multi-agent diff comparison.

---

### 9. Ripplix (https://ripplix.com/)

**What it does:** UI animation library providing ripple effects, transition presets, and micro-interaction patterns for modern web applications.

**Key Architecture Patterns:**
- Declarative animation API (define animations as data, not imperative code)
- Ripple/feedback effects on interactive elements
- Transition presets (fade, slide, scale, spring)
- Performance-optimized with requestAnimationFrame batching

**Code Patterns Worth Porting:**
- Ripple effect directive for buttons/clickable elements
- Transition preset library (enter/leave animations)
- Spring physics utility for natural-feeling animations
- Animation queue with RAF batching

**Integration Priority:** P3  
**Estimated Effort:** 1-2 days  
**Already Implemented?** No — yuai-gui uses basic CSS transitions. Could enhance with ripple effects and spring physics for a more polished feel.

---

### 10. Kinetics (https://kinetics.colorion.co/)

**What it does:** Spring physics animation engine providing natural-feeling motion with configurable tension, friction, and mass parameters.

**Key Architecture Patterns:**
- Spring physics simulation (Hooke's law + damping)
- Configurable spring presets (stiff, gentle, wobbly, etc.)
- Frame-by-frame animation stepping with RAF
- Interpolation between values (number, color, transform)

**Code Patterns Worth Porting:**
- Spring physics engine (reusable utility)
- Spring preset definitions: `{ tension, friction, mass }`
- Value interpolator supporting multiple types
- `useSpring()` composable for reactive spring animations

**Integration Priority:** P3  
**Estimated Effort:** 2-3 days  
**Already Implemented?** No — could replace CSS transitions with spring physics for more natural UI feel in panels, sidebar, and modal transitions.

---

### 11. Langflow (GitHub: langflow-ai/langflow)

**What it does:** Visual workflow editor for building LLM-powered applications using drag-and-drop nodes connected by typed edges, with backend graph execution.

**Key Architecture Patterns:**
- Node type system with typed input/output ports
- JSON-encoded handle IDs for edge validation
- Backend graph execution with topological ordering
- Snapshot-based undo/redo
- Dagre-based automatic layout algorithm

**Code Patterns Worth Porting:**
- Handle ID encoding: `JSON.stringify({ dataType, name, id, output_types })`
- Edge validation: type compatibility + proxy fields + loop detection
- Snapshot undo/redo with deep clone + history stack
- Pending node updates with timeout-based batching
- Memoized node sub-components with selective store subscriptions

**Integration Priority:** P0  
**Estimated Effort:** 3-4 days  
**Already Implemented?** Partial — yuai-gui has `workflow.ts` store with topological sort and `WorkflowEditor.vue` with Vue Flow, but lacks handle type encoding, edge validation, snapshot undo/redo, and dagre layout.

---

### 12. AutoGen (GitHub: microsoft/autogen)

**What it does:** Microsoft's multi-agent orchestration framework supporting group chat, topic-based pub/sub, and multiple orchestration strategies (selector, round-robin, swarm, DAG).

**Key Architecture Patterns:**
- Agent protocol: `on_message()`, `save_state()`, `load_state()`, `close()`
- Agent runtime with topic-based pub/sub messaging
- Group chat manager abstraction (5 strategies)
- LLM-based speaker selection algorithm
- WebSocket streaming for real-time agent output
- Serializable agent state for persistence

**Code Patterns Worth Porting:**
- Agent TypeScript interface (protocol adaptation from Python)
- Topic pub/sub message bus (composable)
- Group chat manager pattern (selector, round-robin, swarm)
- Speaker selection algorithm with LLM-based routing
- Serializable state pattern

**Integration Priority:** P0  
**Estimated Effort:** 4-5 days  
**Already Implemented?** Partial — yuai-gui has `agents.ts` with agent definitions, `chat.ts` with group chat mode and speaker selection via Tauri backend. Lacks formal agent protocol, topic pub/sub, and multiple orchestration strategies.

---

### 13. CrewAI (GitHub: crewAIInc/crewAI)

**What it does:** Role-based agent framework where agents have defined roles, goals, and backstories, organized into crews with sequential or hierarchical execution processes.

**Key Architecture Patterns:**
- Pydantic-based agent/crew/task definitions
- Flow DSL with decorator-based routing (@start, @listen, @router)
- Sequential and hierarchical process types
- Tool execution with finality checking
- Callback system (before/after kickoff)

**Code Patterns Worth Porting:**
- Agent definition: `{ role, goal, backstory, tools, llm }`
- Process types: sequential | hierarchical
- Flow DSL adaptation to Vue composables or TypeScript decorators
- Tool execution loop: call → check_finality → loop_or_finish
- Callback hooks: beforeKickoff, afterKickoff, stepCallback, taskCallback

**Integration Priority:** P1  
**Estimated Effort:** 3-4 days  
**Already Implemented?** Partial — yuai-gui has agent definitions with specialties and group discussion mode. Lacks formal role/goal/backstory model, flow DSL, and hierarchical processes.

---

### 14. Void (GitHub: voideditor/void)

**What it does:** Open-source AI IDE (VS Code fork) with inline diff editing, chat threads with checkpoints, and Ctrl+K inline AI editing.

**Key Architecture Patterns:**
- Diff algorithm: line-by-line comparison with "streak" tracking
- Inline diff visualization with accept/reject per hunk
- Search/replace block extraction from LLM responses
- Chat thread with checkpoint tracking and staging selections
- Discriminated union for stream state (idle | LLM | tool | awaiting_user)

**Code Patterns Worth Porting:**
- `findDiffs()` algorithm (framework-agnostic TypeScript)
- Inline diff zones with accept/reject actions
- `extractSearchReplaceBlocks()` for parsing LLM code output
- Thread state: `{ currCheckpointIdx, stagingSelections, focusedMessageIdx }`
- Stream state discriminated union pattern

**Integration Priority:** P0  
**Estimated Effort:** 3-4 days  
**Already Implemented?** Partial — yuai-gui has `DiffViewer.vue` and `chat.ts` with `ChatPhase` type. Lacks inline diff zones, search/replace extraction, checkpoint system, and proper stream state union.

---

### 15. GPT-Runner (GitHub: nicepkg/gpt-runner)

**What it does:** Tauri-based AI tool with file tree management, Monaco editor integration, and LLM chat — originally React but with patterns applicable to Vue.

**Key Architecture Patterns:**
- File tree with checkbox cascading (parent-child sync)
- Material Design file icons per extension
- Zustand slice pattern (global/temp/editor/context separation)
- Editor tab management with dirty state tracking
- WebSocket-based storage sync

**Code Patterns Worth Porting:**
- `cascadeCheck()` function for tree checkbox propagation
- `travelTreeDeepFirst()` recursive traversal utility
- File icon component with extension → icon mapping
- Tab management: open, close, dirty tracking, unsaved prompts
- Store separation: global (persistent) vs temp (transient) state

**Integration Priority:** P1  
**Estimated Effort:** 2-3 days  
**Already Implemented?** Partial — yuai-gui has `FileTreeNode.vue`, `fileIcons.ts`, and `MonacoEditor.vue`. Lacks checkbox cascading, tab management with dirty state, and store separation pattern.

---

## Part 2: Feature Categories

### Category A: Agent Infrastructure
| Feature | Source | Priority | Effort | Status |
|---------|--------|----------|--------|--------|
| Agent Protocol (interface) | AutoGen | P0 | 2d | Partial |
| Topic-based Pub/Sub | AutoGen | P0 | 2d | No |
| Agent Orchestration Strategies | AutoGen + CrewAI | P1 | 3d | Partial |
| Role/Goal/Backstory Model | CrewAI | P1 | 1d | Partial |
| Tool Registry + Permissions | Craft Agents | P2 | 2d | No |
| Agent Workspace Isolation | Craft Agents | P2 | 2d | No |
| Serializable Agent State | AutoGen | P1 | 1d | No |
| Flow DSL (@start/@listen/@router) | CrewAI | P2 | 3d | No |

### Category B: Chat & Streaming
| Feature | Source | Priority | Effort | Status |
|---------|--------|----------|--------|--------|
| Stream State Discriminated Union | Void | P0 | 1d | Partial |
| Chat Thread with Checkpoints | Void | P0 | 2d | No |
| Search/Replace Block Extraction | Void | P0 | 1d | No |
| Context Compression | Hermes Studio | P0 | 1d | Yes |
| WebSocket/Tauri Event Streaming | AutoGen Studio | P0 | 1d | Partial |
| Token Estimation & Budget | Craft Agents | P1 | 1d | Yes |
| Agent Response Capture (PTY) | FanBox | P0 | 1d | Yes |

### Category C: Workflow Editor
| Feature | Source | Priority | Effort | Status |
|---------|--------|----------|--------|--------|
| Handle Type Encoding | Langflow | P0 | 1d | No |
| Edge Validation Algorithm | Langflow | P0 | 1d | No |
| Snapshot Undo/Redo | Langflow + AutoGen Studio | P1 | 2d | No |
| Dagre Auto-Layout | Langflow | P1 | 1d | No |
| Visual Team Builder (DnD) | AutoGen Studio | P2 | 3d | No |
| Node Type Registry | Langflow | P0 | 1d | Partial |
| Topological Execution | Langflow | P0 | 1d | Yes |

### Category D: Diff & Code Editing
| Feature | Source | Priority | Effort | Status |
|---------|--------|----------|--------|--------|
| findDiffs Algorithm | Void | P0 | 1d | No |
| Inline Diff Zones (accept/reject) | Void | P0 | 2d | Partial |
| Multi-Agent Diff Comparison | Orca | P2 | 3d | No |
| Git Worktree Management | Orca | P2 | 2d | No |

### Category E: File Management
| Feature | Source | Priority | Effort | Status |
|---------|--------|----------|--------|--------|
| File Tree with Checkbox Cascading | GPT-Runner | P1 | 1d | No |
| Project Root Detection | FanBox | P1 | 1d | No |
| Filesystem Watchers | Odysseus | P2 | 2d | No |
| File Icon System | GPT-Runner | P1 | 0.5d | Yes |
| Editor Tab Management | GPT-Runner | P1 | 2d | No |
| Project Config Directory | Odysseus | P2 | 1d | No |

### Category F: UI Polish & Animation
| Feature | Source | Priority | Effort | Status |
|---------|--------|----------|--------|--------|
| Animated SVG Icons | itshover | P2 | 1d | Yes |
| Ripple Effects | Ripplix | P3 | 1d | No |
| Spring Physics Animations | Kinetics | P3 | 2d | No |
| Transition Presets | Ripplix | P3 | 1d | No |

### Category G: Platform & Device
| Feature | Source | Priority | Effort | Status |
|---------|--------|----------|--------|--------|
| Hardware Detection | CanIRun.ai | P1 | 1d | Yes |
| Model Compatibility Scoring | CanIRun.ai | P2 | 1d | No |
| LAN Device Discovery | Hermes Studio | P2 | 2d | No |
| Peer Terminal/File Transfer | Hermes Studio | P3 | 3d | No |
| Skill Hot-Reload | Hermes Studio | P1 | 1d | No |
| Anti-Slop Skill Templates | Taste Skill | P1 | 1d | No |

---

## Part 3: Priority × Impact Matrix

### Scoring: Impact (1-5) × Inverse Effort (1-5) = Score

| Rank | Feature | Impact | Effort | Score | Phase |
|------|---------|--------|--------|-------|-------|
| 1 | Agent Protocol Interface | 5 | 4 | 20 | 1 |
| 2 | Stream State Union | 5 | 5 | 25 | 1 |
| 3 | Handle Type Encoding | 4 | 5 | 20 | 1 |
| 4 | Edge Validation | 4 | 5 | 20 | 1 |
| 5 | findDiffs Algorithm | 5 | 5 | 25 | 1 |
| 6 | Search/Replace Extraction | 5 | 5 | 25 | 1 |
| 7 | Chat Checkpoints | 4 | 4 | 16 | 1 |
| 8 | Topic Pub/Sub | 5 | 4 | 20 | 2 |
| 9 | Snapshot Undo/Redo | 4 | 4 | 16 | 2 |
| 10 | Inline Diff Zones | 4 | 4 | 16 | 2 |
| 11 | File Checkbox Cascade | 3 | 5 | 15 | 2 |
| 12 | Project Root Detection | 3 | 5 | 15 | 2 |
| 13 | Role/Goal/Backstory | 4 | 5 | 20 | 2 |
| 14 | Serializable Agent State | 4 | 5 | 20 | 2 |
| 15 | Dagre Auto-Layout | 3 | 5 | 15 | 2 |
| 16 | Editor Tab Management | 3 | 4 | 12 | 2 |
| 17 | Skill Hot-Reload | 3 | 5 | 15 | 3 |
| 18 | Anti-Slop Templates | 3 | 5 | 15 | 3 |
| 19 | Orchestration Strategies | 4 | 3 | 12 | 3 |
| 20 | Context Budget Mgmt | 3 | 4 | 12 | 3 |
| 21 | Visual Team Builder | 3 | 3 | 9 | 3 |
| 22 | Tool Registry | 3 | 4 | 12 | 4 |
| 23 | Multi-Agent Diff | 3 | 3 | 9 | 4 |
| 24 | Git Worktree Mgmt | 3 | 4 | 12 | 4 |
| 25 | Agent Workspace Isolation | 3 | 4 | 12 | 4 |
| 26 | Filesystem Watchers | 2 | 4 | 8 | 4 |
| 27 | Flow DSL | 3 | 3 | 9 | 4 |
| 28 | Model Compatibility | 2 | 5 | 10 | 5 |
| 29 | LAN Device Discovery | 2 | 4 | 8 | 5 |
| 30 | Spring Physics | 2 | 4 | 8 | 5 |
| 31 | Ripple Effects | 1 | 5 | 5 | 5 |
| 32 | Peer Transfer | 2 | 3 | 6 | 5 |

---

## Part 4: Phased Roadmap

### Phase 1: Core Foundation (Week 1-2) — 8-10 days

**Goal:** Establish the agent protocol, workflow engine, and diff system foundations.

| Task | Source | Effort | Files to Create/Modify |
|------|--------|--------|----------------------|
| Agent Protocol Interface | AutoGen | 2d | `src/types/agent.ts` |
| Stream State Discriminated Union | Void | 1d | `src/types/stream.ts` |
| Handle Type Encoding for Workflow | Langflow | 1d | `src/stores/workflow.ts` |
| Edge Validation Algorithm | Langflow | 1d | `src/composables/useWorkflowValidation.ts` |
| findDiffs Algorithm | Void | 1d | `src/composables/useDiff.ts` |
| Search/Replace Block Extraction | Void | 1d | `src/utils/codeExtraction.ts` |
| Chat Thread Checkpoints | Void | 2d | `src/stores/chat.ts` (extend) |

**Deliverables:**
- `Agent` TypeScript interface with onMessage/saveState/loadState/close
- `StreamState` discriminated union replacing ChatPhase
- Workflow edges with type-validated handle connections
- Diff algorithm producing typed edit/insertion/deletion hunks
- Chat messages with checkpoint indices and staging selections

---

### Phase 2: Enhanced Workflows & Files (Week 3-4) — 8-10 days

**Goal:** Complete the workflow editor, improve file management, and add agent orchestration.

| Task | Source | Effort | Files to Create/Modify |
|------|--------|--------|----------------------|
| Snapshot Undo/Redo | Langflow | 2d | `src/composables/useSnapshotHistory.ts` |
| Inline Diff Zones (accept/reject) | Void | 2d | `src/components/DiffViewer.vue` (enhance) |
| Dagre Auto-Layout | Langflow | 1d | `src/composables/useAutoLayout.ts` |
| File Checkbox Cascading | GPT-Runner | 1d | `src/components/FileTreeNode.vue` (enhance) |
| Project Root Detection | FanBox | 1d | `src/utils/projectDetection.ts` |
| Role/Goal/Backstory Model | CrewAI | 1d | `src/stores/agents.ts` (extend) |
| Serializable Agent State | AutoGen | 1d | `src/stores/agents.ts` (extend) |
| Editor Tab Management | GPT-Runner | 2d | `src/stores/editor.ts` |

**Deliverables:**
- Undo/redo in workflow editor with Ctrl+Z/Ctrl+Shift+Z
- Inline diff viewer with accept/reject per hunk in Monaco
- Auto-layout button in workflow editor
- File tree with checkbox parent-child sync
- Agent definitions with role, goal, backstory fields
- Tab management with dirty state tracking

---

### Phase 3: Advanced Agent Features (Week 5-6) — 8-10 days

**Goal:** Topic-based messaging, orchestration strategies, and skill system enhancements.

| Task | Source | Effort | Files to Create/Modify |
|------|--------|--------|----------------------|
| Topic-based Pub/Sub | AutoGen | 2d | `src/composables/useMessageBus.ts` |
| Orchestration Strategies | AutoGen + CrewAI | 3d | `src/stores/orchestration.ts` |
| Skill Hot-Reload | Hermes Studio | 1d | `src/stores/skills.ts` (enhance) |
| Anti-Slop Skill Templates | Taste Skill | 1d | `src/templates/tasteRules.ts` |
| Visual Team Builder (DnD) | AutoGen Studio | 3d | `src/components/TeamBuilder.vue` |

**Deliverables:**
- Message bus composable for agent-to-agent communication
- 3 orchestration modes: sequential, selector, round-robin
- Live skill reloading when SKILL.md files change
- Pre-built anti-slop skill templates
- Drag-and-drop team builder using Vue Flow

---

### Phase 4: Polish & Power Features (Week 7-8) — 8-10 days

**Goal:** Multi-agent comparison, tool registry, workspace isolation.

| Task | Source | Effort | Files to Create/Modify |
|------|--------|--------|----------------------|
| Multi-Agent Diff Comparison | Orca | 3d | `src/components/MultiDiffViewer.vue` |
| Git Worktree Management | Orca | 2d | `src/stores/worktrees.ts` |
| Tool Registry + Permissions | Craft Agents | 2d | `src/stores/tools.ts` |
| Agent Workspace Isolation | Craft Agents | 2d | `src/stores/workspace.ts` (enhance) |
| Filesystem Watchers | Odysseus | 2d | `src/composables/useFileWatcher.ts` |

**Deliverables:**
- Side-by-side diff comparison of multiple agent outputs
- Git worktree lifecycle management for parallel agents
- Tool registry with permission scoping per agent
- Per-agent file access isolation
- Live file tree updates via Tauri filesystem events

---

### Phase 5: Device & UI Polish (Week 9-10) — 6-8 days

**Goal:** Device integration, model intelligence, and UI animation polish.

| Task | Source | Effort | Files to Create/Modify |
|------|--------|--------|----------------------|
| Model Compatibility Scoring | CanIRun.ai | 1d | `src/utils/modelScoring.ts` |
| LAN Device Discovery | Hermes Studio | 2d | `src/stores/devices.ts` |
| Flow DSL (composable-based) | CrewAI | 3d | `src/composables/useFlow.ts` |
| Spring Physics Animations | Kinetics | 2d | `src/utils/spring.ts` |
| Ripple Effects | Ripplix | 1d | `src/directives/vRipple.ts` |
| Project Config Directory (.yuai/) | Odysseus | 1d | `src/utils/projectConfig.ts` |

**Deliverables:**
- Hardware → model recommendation engine
- LAN device panel showing paired devices
- Decorator-like flow DSL using Vue composables
- Spring physics composable for natural animations
- Ripple directive for interactive elements
- `.yuai/` project configuration directory

---

## Part 5: Effort Summary

| Phase | Duration | Effort (days) | Key Deliverables |
|-------|----------|---------------|------------------|
| Phase 1 | Week 1-2 | 8-10d | Agent protocol, stream state, workflow validation, diff engine |
| Phase 2 | Week 3-4 | 8-10d | Undo/redo, inline diff, auto-layout, file cascade, tabs |
| Phase 3 | Week 5-6 | 8-10d | Pub/sub, orchestration, skill reload, team builder |
| Phase 4 | Week 7-8 | 8-10d | Multi-agent diff, worktrees, tool registry, workspace isolation |
| Phase 5 | Week 9-10 | 6-8d | Device integration, flow DSL, animations |
| **Total** | **10 weeks** | **38-48 days** | **32 features across 7 categories** |

---

## Part 6: Tech Stack Mapping

| Pattern Source | Original Tech | yuai-gui Adaptation |
|---------------|---------------|---------------------|
| Langflow stores | Zustand (React) | Pinia (Vue 3) |
| Langflow nodes | @xyflow/react | @vue-flow/core |
| AutoGen agents | Python Protocol | TypeScript Interface |
| AutoGen topics | Python asyncio | Vue composables + Tauri events |
| AutoGen Studio | React Flow + DnD | @vue-flow/core + vue-draggable |
| CrewAI Pydantic | Python Pydantic | Zod or TypeBox |
| CrewAI decorators | Python decorators | Vue composables |
| Void diff | Monaco Editor | Monaco Editor (same!) |
| Void stream state | TypeScript union | TypeScript discriminated union |
| GPT-Runner tree | React + Zustand | Vue 3 + Pinia |
| Kinetics springs | Standalone JS | TypeScript utility |
| itshover SVGs | CSS transitions | CSS transitions (same!) |

---

## Part 7: Key Takeaways

1. **Phase 1 is critical** — Agent protocol + stream state + workflow validation + diff engine form the foundation everything else builds on.

2. **Void's patterns are directly portable** — `findDiffs()`, stream state unions, and checkpoint tracking are framework-agnostic TypeScript. Copy and adapt.

3. **Langflow's workflow patterns are proven** — Handle encoding, edge validation, and snapshot undo/redo are battle-tested in production. Port directly to Vue Flow.

4. **AutoGen's architecture is the agent backbone** — The protocol, pub/sub, and group chat manager patterns define how multi-agent coordination works.

5. **Already done = 6/32 features** — itshover icons, hardware detection, context compression, file icons, topological execution, and PTY capture are already implemented. Focus effort on the 26 remaining features.

6. **Tauri events replace WebSockets** — Use `app_handle.emit()` / `listen()` instead of WebSocket for streaming. This is already the pattern in yuai-gui.

7. **Vue composables replace Python decorators** — CrewAI's `@start/@listen/@router` becomes `useFlow()` composable with method chaining.

8. **Total effort: ~40 developer-days** — Feasible for a focused 10-week sprint, or 5 weeks with 2 developers.

---

## Appendix: Files Referenced in yuai-gui

### Stores (Pinia)
- `src/stores/agents.ts` — Agent definitions, sessions, status
- `src/stores/chat.ts` — Chat mode (single/group/beam), streaming, PTY
- `src/stores/workflow.ts` — DAG nodes/edges, topological execution
- `src/stores/hardware.ts` — GPU/CPU/RAM detection
- `src/stores/skills.ts` — Skill discovery, filtering, management
- `src/stores/beam.ts` — Beam (parallel agent) mode
- `src/stores/mcp.ts` — MCP server management
- `src/stores/kanban.ts` — Kanban board state
- `src/stores/writeGate.ts` — Write permission gating
- `src/stores/workspace.ts` — Workspace/project state

### Components
- `src/components/ChatPanel.vue` — Main chat interface
- `src/components/WorkflowEditor.vue` — Vue Flow workflow editor
- `src/components/DiffViewer.vue` — Diff display
- `src/components/MonacoEditor.vue` — Code editor
- `src/components/Terminal.vue` — xterm.js terminal
- `src/components/FileTreeNode.vue` — File tree node
- `src/components/HardwarePanel.vue` — Hardware info display
- `src/components/SkillsPanel.vue` — Skills management
- `src/components/CommandPalette.vue` — Command palette (Ctrl+K)

### Utilities
- `src/utils/animatedIcons.ts` — SVG icon animations (from itshover)
- `src/utils/fileIcons.ts` — File type icons
- `src/utils/format.ts` — Formatting helpers
- `src/utils/icons.ts` — Icon utilities
- `src/utils/agentCommands.ts` — Agent command helpers

### Composables
- `src/composables/useKeyboard.ts` — Keyboard shortcuts
- `src/composables/useAutoSave.ts` — Auto-save logic
- `src/composables/useProjectMemory.ts` — Project memory persistence
- `src/composables/useAgentUsage.ts` — Agent usage tracking
