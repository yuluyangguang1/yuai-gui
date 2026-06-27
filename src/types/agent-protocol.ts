/**
 * Agent Protocol Interface — inspired by AutoGen
 * Defines a standard contract every agent must implement.
 */

// ══════════════════════════════════════════════
// Message Types
// ══════════════════════════════════════════════

export enum MessageType {
  User = 'user',
  Assistant = 'assistant',
  Tool = 'tool',
  Error = 'error',
  Status = 'status',
  Info = 'info',
  Warning = 'warning',
  Plan = 'plan',
}

// ══════════════════════════════════════════════
// Tool Call
// ══════════════════════════════════════════════

export type ToolCallStatus = 'pending' | 'running' | 'success' | 'error' | 'cancelled';

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result?: unknown;
  status: ToolCallStatus;
  startedAt?: number;
  finishedAt?: number;
  error?: string;
}

// ══════════════════════════════════════════════
// Agent Message
// ══════════════════════════════════════════════

export interface AgentMessage {
  id: string;
  type: MessageType;
  content: string;
  timestamp: number;
  agentId?: string;
  toolCalls?: ToolCall[];
  metadata?: Record<string, unknown>;
}

// ══════════════════════════════════════════════
// Agent State
// ══════════════════════════════════════════════

export interface AgentState {
  agentId: string;
  status: 'idle' | 'thinking' | 'executing' | 'error';
  currentTask?: string;
  messageCount: number;
  toolCallCount: number;
  lastActiveAt: number;
  metadata?: Record<string, unknown>;
}

// ══════════════════════════════════════════════
// Agent Protocol Interface
// ══════════════════════════════════════════════

export interface AgentProtocol {
  /** Unique agent identifier */
  readonly id: string;

  /** Display name */
  readonly name: string;

  /** Handle an incoming message and optionally produce a response */
  onMessage(message: AgentMessage): Promise<AgentMessage | null>;

  /** Persist agent state to durable storage */
  saveState(): Promise<AgentState>;

  /** Restore agent state from durable storage */
  loadState(state: AgentState): Promise<void>;

  /** Optional: get current state without persisting */
  getState?(): AgentState;

  /** Optional: dispose resources */
  dispose?(): Promise<void>;
}
