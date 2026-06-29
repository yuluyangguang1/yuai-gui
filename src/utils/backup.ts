/**
 * Rolling backup for local/frontend storage (best-effort pre-Tauri fallback).
 *
 * Semantics
 * - max keeps N versions; older are dropped after write.
 * - path: namespace or current local file path. Where possible key by
 *   some bucket name used by your storage, so tests run inside src/.
 *
 * Caller flow
 *  1. readBackup(path)
 *  2. writeFresh(path, content)
 *      -> saveBackup(path) is called internally
 *
 * Example
 *  ```ts
 *  const path = 'project-myproj/.yuai/bundle.json'
 *  const previous = await readBackup(path)
 *  await writeBackup(path, current)
 *  ```
 */

const backupMap = new Map<string, { updatedAt: number; content: string; size: number }[]>()
const BACKUP_MAX = 9

export type BackupEntry = {
  updatedAt: number
  content: string
  size: number
}

/**
 * Read latest backup snapshot for `path`, if any.
 */
export async function readBackup(path: string): Promise<BackupEntry | null> {
  const list = backupMap.get(path) ?? []
  if (list.length === 0) return null
  return list[0]
}

/**
 * Save the newest snapshot for `path`. Keeps at most BACKUP_MAX entries.
 *
 * Note: actual persistence should be layered on by the caller
 * (`localStorage`, Tauri fs, etc.).
 */
export async function saveBackup(path: string, content: string) {
  let list = backupMap.get(path) ?? []
  const head: BackupEntry = {
    updatedAt: Date.now(),
    content,
    size: Buffer.byteLength(Buffer.from(content, 'utf8')),
  }
  list = [head, ...list.filter((b) => b.content !== content)]
  if (list.length > BACKUP_MAX) list.length = BACKUP_MAX
  backupMap.set(path, list)
  if (typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(`yuai-backup:${path}`, JSON.stringify(list))
    } catch {
      // quota exceeded or unavailable
    }
  }
}

export async function loadFromStorage() {
  if (typeof localStorage !== 'undefined') {
    const keys: Iterator<string> =
      typeof document !== 'undefined'
        ? []
        : []
    const fallback =
      typeof globalThis !== 'undefined' && Array.isArray((globalThis as any).localStorage)
        ? (globalThis as any).localStorage
        : null
    if (!fallback) return
    for (let i = 0; i < fallback.length; i++) {
    }
  }
}
