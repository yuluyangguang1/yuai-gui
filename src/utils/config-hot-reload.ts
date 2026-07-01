/**
 * Config Hot Reload — 参考 Continue 配置热重载
 * 监听配置文件变化, 即时生效
 */

// ══════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════

export type ConfigChangeType = 'provider' | 'model' | 'agent' | 'settings' | 'all';

export interface ConfigChangeEvent {
  type: ConfigChangeType;
  /** What changed */
  key: string;
  /** Old value */
  oldValue: unknown;
  /** New value */
  newValue: unknown;
  /** When it changed */
  timestamp: number;
}

export type ConfigChangeListener = (event: ConfigChangeEvent) => void;

// ══════════════════════════════════════════════
// Config Hot Reload Manager
// ══════════════════════════════════════════════

export class ConfigHotReloadManager {
  private listeners: ConfigChangeListener[] = [];
  private watchers = new Map<string, () => void>();
  private lastValues = new Map<string, unknown>();

  /** Watch a config value for changes */
  watch(key: string, getValue: () => unknown, type: ConfigChangeType = 'settings'): void {
    // Prevent duplicate watchers
    this.unwatch(key);
    // Store initial value
    this.lastValues.set(key, getValue());

    // Poll for changes (browser doesn't have filesystem watchers)
    const interval = setInterval(() => {
      const newValue = getValue();
      const oldValue = this.lastValues.get(key);

      if (JSON.stringify(newValue) !== JSON.stringify(oldValue)) {
        this.lastValues.set(key, newValue);
        this.emit({ type, key, oldValue, newValue, timestamp: Date.now() });
      }
    }, 1000);

    this.watchers.set(key, () => clearInterval(interval));
  }

  /** Watch localStorage for changes */
  watchLocalStorage(storageKey: string, type: ConfigChangeType = 'settings'): void {
    this.watch(
      `localStorage:${storageKey}`,
      () => {
        try {
          const raw = localStorage.getItem(storageKey);
          return raw ? JSON.parse(raw) : null;
        } catch {
          return null;
        }
      },
      type
    );
  }

  /** Manually trigger a change notification */
  notify(key: string, oldValue: unknown, newValue: unknown, type: ConfigChangeType = 'settings'): void {
    this.lastValues.set(key, newValue);
    this.emit({ type, key, oldValue, newValue, timestamp: Date.now() });
  }

  /** Listen for config changes */
  on(listener: ConfigChangeListener): () => void {
    this.listeners.push(listener);
    return () => {
      const idx = this.listeners.indexOf(listener);
      if (idx >= 0) this.listeners.splice(idx, 1);
    };
  }

  /** Stop watching a specific key */
  unwatch(key: string): void {
    const stop = this.watchers.get(key);
    if (stop) {
      stop();
      this.watchers.delete(key);
      this.lastValues.delete(key);
    }
  }

  /** Stop all watchers */
  dispose(): void {
    for (const stop of this.watchers.values()) stop();
    this.watchers.clear();
    this.lastValues.clear();
    this.listeners = [];
  }

  private emit(event: ConfigChangeEvent): void {
    for (const listener of this.listeners) {
      try { listener(event); } catch (e) { console.error('[ConfigHotReload] Listener error:', e); }
    }
  }
}

// Singleton
export const globalConfigHotReload = new ConfigHotReloadManager();
