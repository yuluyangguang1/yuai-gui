/**
 * File Change Tracker — 参考 FanBox 文件变更涟漪
 * Agent 写文件时卡片实时发光, 按变更频率呼吸
 */

// ══════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════

export interface FileChangeEvent {
  /** File path that changed */
  path: string;
  /** Agent ID that made the change */
  agentId?: string;
  /** Type of change */
  type: 'created' | 'modified' | 'deleted';
  /** Timestamp */
  timestamp: number;
  /** Size change in bytes */
  sizeDelta?: number;
}

export interface FileChangeState {
  path: string;
  /** Number of changes in the tracking window */
  changeCount: number;
  /** Last change timestamp */
  lastChanged: number;
  /** Whether the file is currently "glowing" */
  glowing: boolean;
  /** Animation intensity (0-1) */
  intensity: number;
  /** Agent that made the changes */
  agentId?: string;
}

export type FileChangeListener = (event: FileChangeEvent) => void;

// ══════════════════════════════════════════════
// File Change Tracker
// ══════════════════════════════════════════════

const TRACKING_WINDOW_MS = 30000; // 30 seconds
const GLOW_DURATION_MS = 5000;    // 5 seconds
const MAX_INTENSITY = 1.0;

export class FileChangeTracker {
  private states = new Map<string, FileChangeState>();
  private listeners: FileChangeListener[] = [];
  private decayTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Decay glow intensity over time
    this.decayTimer = setInterval(() => {
      const now = Date.now();
      for (const [path, state] of this.states) {
        if (state.glowing && now - state.lastChanged > GLOW_DURATION_MS) {
          state.glowing = false;
          state.intensity = 0;
          this.notifyListeners({ path, type: 'modified', timestamp: now });
        }
        // Decay old entries
        if (now - state.lastChanged > TRACKING_WINDOW_MS * 2) {
          this.states.delete(path);
        }
      }
    }, 1000);
  }

  /** Record a file change */
  record(event: FileChangeEvent): void {
    const existing = this.states.get(event.path);
    const now = event.timestamp;

    if (existing) {
      existing.changeCount++;
      existing.lastChanged = now;
      existing.glowing = true;
      existing.intensity = Math.min(MAX_INTENSITY, existing.changeCount / 5);
      existing.agentId = event.agentId;
    } else {
      this.states.set(event.path, {
        path: event.path,
        changeCount: 1,
        lastChanged: now,
        glowing: true,
        intensity: 0.2,
        agentId: event.agentId,
      });
    }

    // Notify listeners
    for (const listener of this.listeners) {
      try { listener(event); } catch { /* ignore */ }
    }
  }

  /** Get change state for a file */
  getState(path: string): FileChangeState | undefined {
    return this.states.get(path);
  }

  /** Get all files that are currently glowing */
  getGlowingFiles(): FileChangeState[] {
    return Array.from(this.states.values()).filter(s => s.glowing);
  }

  /** Get all changed files in the tracking window */
  getRecentChanges(): FileChangeState[] {
    const now = Date.now();
    return Array.from(this.states.values())
      .filter(s => now - s.lastChanged < TRACKING_WINDOW_MS)
      .sort((a, b) => b.lastChanged - a.lastChanged);
  }

  /** Listen for file changes */
  on(listener: FileChangeListener): () => void {
    this.listeners.push(listener);
    return () => {
      const idx = this.listeners.indexOf(listener);
      if (idx >= 0) this.listeners.splice(idx, 1);
    };
  }

  /** Clear all tracking state */
  clear(): void {
    this.states.clear();
  }

  /** Dispose of the tracker */
  dispose(): void {
    if (this.decayTimer) {
      clearInterval(this.decayTimer);
      this.decayTimer = null;
    }
    this.states.clear();
    this.listeners = [];
  }

  private notifyListeners(event: FileChangeEvent): void {
    for (const listener of this.listeners) {
      try { listener(event); } catch { /* ignore */ }
    }
  }
}

// Singleton
export const globalFileChangeTracker = new FileChangeTracker();
