/**
 * Session Recovery — 参考 Orca SleepingAgentSessionRecord
 * 保存/恢复 agent 会话状态, 支持关闭后重新打开
 */

// ══════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════

export type SessionState = 'idle' | 'working' | 'blocked' | 'waiting' | 'done' | 'error';

export interface AgentSessionRecord {
  /** Agent ID (e.g. 'claude', 'codex') */
  agentId: string;
  /** Agent type (e.g. 'anthropic_env', 'codex_toml') */
  agentType: string;
  /** Workspace path */
  workspacePath: string;
  /** Session ID for resume */
  sessionId?: string;
  /** Current state */
  state: SessionState;
  /** Last user message */
  lastUserMessage?: string;
  /** Last assistant message */
  lastAssistantMessage?: string;
  /** Terminal scrollback (last N lines) */
  scrollback?: string[];
  /** When the session was captured */
  capturedAt: number;
  /** When the session was last updated */
  updatedAt: number;
  /** How the record was captured */
  origin: 'normal' | 'sleep' | 'crash';
}

// ══════════════════════════════════════════════
// Session Recovery Manager
// ══════════════════════════════════════════════

const STORAGE_KEY = 'yuai-session-records';
const MAX_SCROLLBACK_LINES = 50;  // Reduced from 200 to prevent localStorage quota exhaustion
const MAX_RECORDS = 50;

export class SessionRecoveryManager {
  private records = new Map<string, AgentSessionRecord>();

  constructor() {
    this.loadFromStorage();
  }

  /** Save session state for an agent */
  save(record: AgentSessionRecord): void {
    const key = this.getKey(record.agentId, record.workspacePath);
    const existing = this.records.get(key);

    this.records.set(key, {
      ...record,
      updatedAt: Date.now(),
      capturedAt: existing?.capturedAt ?? Date.now(),
    });

    // Prune old records
    if (this.records.size > MAX_RECORDS) {
      const sorted = Array.from(this.records.entries())
        .sort((a, b) => a[1].updatedAt - b[1].updatedAt);
      for (let i = 0; i < sorted.length - MAX_RECORDS; i++) {
        this.records.delete(sorted[i][0]);
      }
    }

    this.saveToStorage();
  }

  /** Get saved session for an agent */
  get(agentId: string, workspacePath: string): AgentSessionRecord | undefined {
    return this.records.get(this.getKey(agentId, workspacePath));
  }

  /** Get all saved sessions */
  getAll(): AgentSessionRecord[] {
    return Array.from(this.records.values())
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /** Get sessions that can be resumed */
  getResumable(): AgentSessionRecord[] {
    return this.getAll().filter(r =>
      r.state === 'working' || r.state === 'blocked' || r.state === 'waiting'
    );
  }

  /** Delete a saved session */
  delete(agentId: string, workspacePath: string): void {
    this.records.delete(this.getKey(agentId, workspacePath));
    this.saveToStorage();
  }

  /** Update scrollback for an agent */
  updateScrollback(agentId: string, workspacePath: string, lines: string[]): void {
    const key = this.getKey(agentId, workspacePath);
    const record = this.records.get(key);
    if (!record) return;

    record.scrollback = lines.slice(-MAX_SCROLLBACK_LINES);
    record.updatedAt = Date.now();
    this.saveToStorage();
  }

  /** Update state for an agent */
  updateState(agentId: string, workspacePath: string, state: SessionState, message?: string): void {
    const key = this.getKey(agentId, workspacePath);
    const record = this.records.get(key);
    if (!record) return;

    record.state = state;
    record.updatedAt = Date.now();
    if (message) record.lastAssistantMessage = message;
    this.saveToStorage();
  }

  private getKey(agentId: string, workspacePath: string): string {
    return `${agentId}:${workspacePath}`;
  }

  private loadFromStorage(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw) as AgentSessionRecord[];
      for (const record of data) {
        this.records.set(this.getKey(record.agentId, record.workspacePath), record);
      }
    } catch { /* ignore */ }
  }

  private saveToStorage(): void {
    try {
      const data = Array.from(this.records.values());
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch { /* ignore */ }
  }
}

// Singleton
export const globalSessionRecovery = new SessionRecoveryManager();
