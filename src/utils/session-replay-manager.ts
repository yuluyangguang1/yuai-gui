/**
 * Session Replay — 参考 FanBox/Orca 会话回放
 * 像刷视频一样回放 agent 操作, 支持时间轴拖拽
 */

// ══════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════

export interface ReplayEvent {
  /** Event ID */
  id: string;
  /** When it happened */
  timestamp: number;
  /** Event type */
  type: 'message' | 'tool_call' | 'file_change' | 'state_change' | 'error';
  /** Agent ID */
  agentId: string;
  /** Event data */
  data: {
    content?: string;
    toolName?: string;
    toolInput?: string;
    filePath?: string;
    state?: string;
    error?: string;
  };
}

export interface ReplaySession {
  /** Session ID */
  id: string;
  /** Agent ID */
  agentId: string;
  /** Session title */
  title: string;
  /** Start time */
  startTime: number;
  /** End time */
  endTime: number;
  /** All events in chronological order */
  events: ReplayEvent[];
  /** Total duration in ms */
  duration: number;
}

// ══════════════════════════════════════════════
// Session Replay Manager
// ══════════════════════════════════════════════

const STORAGE_KEY = 'yuai-replay-sessions';
const MAX_EVENTS_PER_SESSION = 5000;
const MAX_SESSIONS = 20;

export class SessionReplayManager {
  private sessions = new Map<string, ReplaySession>();
  private activeRecording: {
    sessionId: string;
    agentId: string;
    title: string;
    startTime: number;
    events: ReplayEvent[];
  } | null = null;

  constructor() {
    this.loadFromStorage();
  }

  /** Start recording a session */
  startRecording(sessionId: string, agentId: string, title: string): void {
    this.activeRecording = {
      sessionId,
      agentId,
      title,
      startTime: Date.now(),
      events: [],
    };
  }

  /** Record an event */
  recordEvent(event: Omit<ReplayEvent, 'id' | 'timestamp'>): void {
    if (!this.activeRecording) return;
    if (this.activeRecording.events.length >= MAX_EVENTS_PER_SESSION) return;

    this.activeRecording.events.push({
      ...event,
      id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
    });
  }

  /** Stop recording and save */
  stopRecording(): ReplaySession | null {
    if (!this.activeRecording) return null;

    const endTime = Date.now();
    const session: ReplaySession = {
      id: this.activeRecording.sessionId,
      agentId: this.activeRecording.agentId,
      title: this.activeRecording.title,
      startTime: this.activeRecording.startTime,
      endTime,
      events: this.activeRecording.events,
      duration: endTime - this.activeRecording.startTime,
    };

    this.sessions.set(session.id, session);
    this.activeRecording = null;

    // Prune old sessions
    if (this.sessions.size > MAX_SESSIONS) {
      const sorted = Array.from(this.sessions.values())
        .sort((a, b) => a.endTime - b.endTime);
      for (let i = 0; i < sorted.length - MAX_SESSIONS; i++) {
        this.sessions.delete(sorted[i].id);
      }
    }

    this.saveToStorage();
    return session;
  }

  /** Get a recorded session */
  getSession(sessionId: string): ReplaySession | undefined {
    return this.sessions.get(sessionId);
  }

  /** Get all recorded sessions */
  getAllSessions(): ReplaySession[] {
    return Array.from(this.sessions.values())
      .sort((a, b) => b.endTime - a.endTime);
  }

  /** Get events at a specific time offset */
  getEventsAtTime(sessionId: string, timeOffsetMs: number): ReplayEvent[] {
    const session = this.sessions.get(sessionId);
    if (!session) return [];

    const targetTime = session.startTime + timeOffsetMs;
    return session.events.filter(e => e.timestamp <= targetTime);
  }

  /** Get events in a time range */
  getEventsInRange(sessionId: string, startMs: number, endMs: number): ReplayEvent[] {
    const session = this.sessions.get(sessionId);
    if (!session) return [];

    const startTime = session.startTime + startMs;
    const endTime = session.startTime + endMs;
    return session.events.filter(e => e.timestamp >= startTime && e.timestamp <= endTime);
  }

  /** Delete a session */
  deleteSession(sessionId: string): void {
    this.sessions.delete(sessionId);
    this.saveToStorage();
  }

  private loadFromStorage(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw) as ReplaySession[];
      for (const s of data) this.sessions.set(s.id, s);
    } catch { /* ignore */ }
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.getAllSessions()));
    } catch { /* ignore */ }
  }
}

// Singleton
export const globalSessionReplay = new SessionReplayManager();
