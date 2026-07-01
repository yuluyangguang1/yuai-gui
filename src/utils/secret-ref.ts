/**
 * SecretRef — 参考 OpenClaw SecretRef 模式
 * API key 来源: env (环境变量) / file (文件) / exec (外部命令如 Vault)
 */

// ══════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════

export type SecretSource = 'env' | 'file' | 'exec' | 'literal';

export interface SecretRef {
  /** Where to find the secret */
  source: SecretSource;
  /** For 'env': environment variable name
   *  For 'file': file path containing the secret
   *  For 'exec': command to execute
   *  For 'literal': the actual value (not recommended) */
  value: string;
  /** Optional provider ID for context */
  providerId?: string;
}

export interface ResolvedSecret {
  /** The resolved secret value */
  value: string;
  /** Where it came from */
  source: SecretSource;
  /** Whether the resolution was successful */
  ok: boolean;
  /** Error message if resolution failed */
  error?: string;
}

// ══════════════════════════════════════════════
// Secret Resolver
// ══════════════════════════════════════════════

export class SecretResolver {
  private cache = new Map<string, ResolvedSecret>();

  /**
   * Resolve a secret from a SecretRef.
   * Results are cached for the session.
   */
  async resolve(ref: SecretRef): Promise<ResolvedSecret> {
    const cacheKey = `${ref.source}:${ref.value}`;
    const cached = this.cache.get(cacheKey);
    if (cached) return cached;

    let result: ResolvedSecret;

    switch (ref.source) {
      case 'env':
        result = this.resolveEnv(ref.value);
        break;
      case 'file':
        result = await this.resolveFile(ref.value);
        break;
      case 'exec':
        result = await this.resolveExec(ref.value);
        break;
      case 'literal':
        result = { value: ref.value, source: 'literal', ok: true };
        break;
      default:
        result = { value: '', source: ref.source, ok: false, error: `Unknown source: ${ref.source}` };
    }

    if (result.ok) {
      this.cache.set(cacheKey, result);
    }

    return result;
  }

  /**
   * Resolve from environment variable.
   * Supports $NAME, ${NAME}, and plain NAME formats.
   */
  private resolveEnv(name: string): ResolvedSecret {
    const cleanName = name.replace(/^\$?{?([^}]+)}?$/, '$1');
    const value = import.meta.env?.[cleanName] || undefined;
    if (value) {
      return { value, source: 'env', ok: true };
    }
    // Try runtime env (Tauri)
    return { value: '', source: 'env', ok: false, error: `Env var ${cleanName} not set` };
  }

  /**
   * Resolve from file.
   * File content is trimmed. Supports JSON files with a key path.
   */
  private async resolveFile(path: string): Promise<ResolvedSecret> {
    try {
      const { readTextFile, exists } = await import('@tauri-apps/plugin-fs');

      // Try JSON with key path (e.g., "/path/to/file.json:key.name")
      if (path.includes(':')) {
        const colonIdx = path.indexOf(':');
        const filePath = path.slice(0, colonIdx);
        const keyPath = path.slice(colonIdx + 1);
        if (!(await exists(filePath))) {
          return { value: '', source: 'file', ok: false, error: `File not found: ${filePath}` };
        }
        try {
          const json = JSON.parse(await readTextFile(filePath));
          const value = this.getNestedValue(json, keyPath);
          if (value) return { value: String(value), source: 'file', ok: true };
        } catch {
          return { value: '', source: 'file', ok: false, error: `Failed to parse JSON from ${filePath}` };
        }
      }

      if (!(await exists(path))) {
        return { value: '', source: 'file', ok: false, error: `File not found: ${path}` };
      }
      const content = await readTextFile(path);
      return { value: content.trim(), source: 'file', ok: true };
    } catch (e) {
      return { value: '', source: 'file', ok: false, error: String(e) };
    }
  }

  /**
   * Resolve by executing a command.
   * stdout is trimmed and used as the secret value.
   */
  private async resolveExec(command: string): Promise<ResolvedSecret> {
    try {
      const { Command } = await import('@tauri-apps/plugin-shell');
      const parts = command.split(/\s+/);
      const cmd = new Command(parts[0], parts.slice(1));
      const output = await cmd.execute();
      if (output.code === 0 && output.stdout.trim()) {
        return { value: output.stdout.trim(), source: 'exec', ok: true };
      }
      return { value: '', source: 'exec', ok: false, error: output.stderr || 'Empty output' };
    } catch (e) {
      return { value: '', source: 'exec', ok: false, error: String(e) };
    }
  }

  /**
   * Get nested value from object by dot-separated key path.
   */
  private getNestedValue(obj: unknown, path: string): unknown {
    const keys = path.split('.');
    let current = obj;
    for (const key of keys) {
      if (current === null || current === undefined || typeof current !== 'object') return undefined;
      current = (current as Record<string, unknown>)[key];
    }
    return current;
  }

  /** Clear the cache */
  clearCache(): void {
    this.cache.clear();
  }
}

// Singleton
export const globalSecretResolver = new SecretResolver();

// ══════════════════════════════════════════════
// Helpers
// ══════════════════════════════════════════════

/**
 * Create a SecretRef from an environment variable name.
 */
export function envRef(name: string): SecretRef {
  return { source: 'env', value: name };
}

/**
 * Create a SecretRef from a file path.
 */
export function fileRef(path: string): SecretRef {
  return { source: 'file', value: path };
}

/**
 * Create a SecretRef from an external command.
 */
export function execRef(command: string): SecretRef {
  return { source: 'exec', value: command };
}

/**
 * Create a SecretRef from a literal value (not recommended for production).
 */
export function literalRef(value: string): SecretRef {
  return { source: 'literal', value };
}
