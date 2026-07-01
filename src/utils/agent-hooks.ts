/**
 * Agent Hooks — 参考 Orca agent-hooks 系统
 * Agent 主动报告状态: working/blocked/waiting/done
 * 比从 PTY 输出推断状态更准确
 */

// ══════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════

export type AgentHookState = 'idle' | 'working' | 'blocked' | 'waiting' | 'done' | 'error';

export interface AgentHookEvent {
  agentId: string;
  state: AgentHookState;
  /** What the agent is currently doing */
  activity?: string;
  /** Tool being used (if working) */
  toolName?: string;
  /** Tool input (if working) */
  toolInput?: string;
  /** Last assistant message */
  lastMessage?: string;
  /** Session ID for resume */
  sessionId?: string;
  /** Timestamp */
  timestamp: number;
}

export type AgentHookListener = (event: AgentHookEvent) => void;

// ══════════════════════════════════════════════
// Hook Patterns — detect agent state from PTY output
// ══════════════════════════════════════════════

interface HookPattern {
  agent: string;
  /** Regex to match in PTY output */
  pattern: RegExp;
  /** State to set when matched */
  state: AgentHookState;
  /** Extract activity from match */
  extractActivity?: (match: RegExpMatchArray) => string;
  /** Extract tool name from match */
  extractTool?: (match: RegExpMatchArray) => string;
}

const HOOK_PATTERNS: HookPattern[] = [
  // Claude Code patterns
  {
    agent: 'claude',
    pattern: /(?:Thinking|Processing|Analyzing|Reading|Writing|Searching)/i,
    state: 'working',
    extractActivity: (m) => m[0],
  },
  {
    agent: 'claude',
    pattern: /(?:Do you want me to|Should I|Would you like|I need confirmation)/i,
    state: 'blocked',
    extractActivity: () => 'Waiting for user confirmation',
  },
  {
    agent: 'claude',
    pattern: /(?:Error|Failed|Cannot|Unable to)/i,
    state: 'error',
    extractActivity: (m) => m[0],
  },

  // Codex patterns
  {
    agent: 'codex',
    pattern: /(?:mimo-v2\.5-pro|gpt-[\d.]+|model:)/i,
    state: 'idle',
  },
  {
    agent: 'codex',
    pattern: /(?:Working on|Processing|Running|Executing)/i,
    state: 'working',
    extractActivity: (m) => m[0],
  },

  // Generic patterns
  {
    agent: '*',
    pattern: /\[process exited\]/,
    state: 'done',
  },
  {
    agent: '*',
    pattern: /\[error:/,
    state: 'error',
    extractActivity: (m) => m[0],
  },
];

// ══════════════════════════════════════════════
// AgentHookManager
// ══════════════════════════════════════════════

export class AgentHookManager {
  private listeners: AgentHookListener[] = [];
  private states = new Map<string, AgentHookState>();
  private activities = new Map<string, string>();

  /** Register a listener for hook events */
  on(listener: AgentHookListener): () => void {
    this.listeners.push(listener);
    return () => {
      const idx = this.listeners.indexOf(listener);
      if (idx >= 0) this.listeners.splice(idx, 1);
    };
  }

  /** Process PTY output and detect state changes */
  processOutput(agentId: string, agentType: string, data: string): void {
    for (const pattern of HOOK_PATTERNS) {
      if (pattern.agent !== '*' && pattern.agent !== agentType) continue;

      const match = data.match(pattern.pattern);
      if (!match) continue;

      const prevState = this.states.get(agentId);
      if (prevState === pattern.state) continue; // No change

      this.states.set(agentId, pattern.state);
      const activity = pattern.extractActivity?.(match) ?? this.activities.get(agentId);
      if (activity) this.activities.set(agentId, activity);

      const event: AgentHookEvent = {
        agentId,
        state: pattern.state,
        activity,
        toolName: pattern.extractTool?.(match),
        timestamp: Date.now(),
      };

      this.emit(event);
    }
  }

  /** Manually set agent state */
  setState(agentId: string, state: AgentHookState, activity?: string): void {
    this.states.set(agentId, state);
    if (activity) this.activities.set(agentId, activity);
    this.emit({ agentId, state, activity, timestamp: Date.now() });
  }

  /** Get current state for an agent */
  getState(agentId: string): AgentHookState {
    return this.states.get(agentId) ?? 'idle';
  }

  /** Get current activity for an agent */
  getActivity(agentId: string): string | undefined {
    return this.activities.get(agentId);
  }

  /** Get all agent states */
  getAllStates(): Map<string, AgentHookState> {
    return new Map(this.states);
  }

  /** Clear states for agents not seen in the last N ms */
  pruneStale(maxAgeMs: number = 300000): void {
    const now = Date.now();
    for (const [id, state] of this.states) {
      if (state === 'idle' || state === 'done' || state === 'error') {
        // Keep terminal states for a while
        continue;
      }
    }
  }

  /** Clear state for an agent (on disconnect) */
  clear(agentId: string): void {
    this.states.delete(agentId);
    this.activities.delete(agentId);
  }

  private emit(event: AgentHookEvent): void {
    for (const listener of this.listeners) {
      try { listener(event); } catch (e) { console.error('[AgentHooks] Listener error:', e); }
    }
  }
}

// Singleton
export const globalAgentHooks = new AgentHookManager();
