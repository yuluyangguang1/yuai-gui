/**
 * Worktree Isolation store (inspired by Orca)
 * Track active worktrees, create/remove worktrees, switch active worktree,
 * file changes per worktree.
 */
import { defineStore } from 'pinia';
import { ref, computed, readonly } from 'vue';
import { invoke } from '@tauri-apps/api/core';

// ── Types ──

export interface Worktree {
  id: string;
  agentId: string;
  name: string;
  path: string;
  branch: string;
  createdAt: number;
  active: boolean;
}

export interface WorktreeFileChange {
  filePath: string;
  status: 'modified' | 'added' | 'deleted' | 'untracked';
  timestamp: number;
}

// ── Store ──

export const useWorktreesStore = defineStore('worktrees', () => {
  const worktrees = ref<Worktree[]>([]);
  const activeWorktreeId = ref<string | null>(null);
  const fileChanges = ref<Map<string, WorktreeFileChange[]>>(new Map()); // worktreeId -> changes
  const loading = ref(false);
  const error = ref<string | null>(null);

  // ── Computed ──

  const activeWorktree = computed(() =>
    worktrees.value.find(w => w.id === activeWorktreeId.value) ?? null,
  );

  const agentWorktrees = computed(() => {
    const grouped = new Map<string, Worktree[]>();
    for (const wt of worktrees.value) {
      const existing = grouped.get(wt.agentId) ?? [];
      existing.push(wt);
      grouped.set(wt.agentId, existing);
    }
    return grouped;
  });

  const worktreeCount = computed(() => worktrees.value.length);

  const activeFileChanges = computed(() => {
    if (!activeWorktreeId.value) return [];
    return fileChanges.value.get(activeWorktreeId.value) ?? [];
  });

  // ── Worktree Lifecycle ──

  /** Create a new git worktree for an agent. */
  async function createWorktree(
    repoPath: string,
    agentId: string,
    branchName?: string,
  ): Promise<Worktree | null> {
    loading.value = true;
    error.value = null;

    const name = `${agentId}-${Date.now()}`;
    const branch = branchName ?? `agent/${agentId}/${Date.now()}`;
    const worktreePath = `${repoPath}/.worktrees/${name}`;

    try {
      await invoke('worktree_create', {
        repoPath,
        worktreePath,
        branch,
      });

      const worktree: Worktree = {
        id: `wt_${Date.now()}`,
        agentId,
        name,
        path: worktreePath,
        branch,
        createdAt: Date.now(),
        active: false,
      };

      worktrees.value.push(worktree);
      return worktree;
    } catch (e) {
      error.value = `Failed to create worktree: ${String(e)}`;
      return null;
    } finally {
      loading.value = false;
    }
  }

  /** Remove a git worktree. */
  async function removeWorktree(repoPath: string, worktreeId: string): Promise<boolean> {
    const wt = worktrees.value.find(w => w.id === worktreeId);
    if (!wt) return false;

    loading.value = true;
    error.value = null;

    try {
      await invoke('worktree_remove', {
        repoPath,
        worktreePath: wt.path,
      });

      // Clean up
      const idx = worktrees.value.findIndex(w => w.id === worktreeId);
      if (idx >= 0) worktrees.value.splice(idx, 1);

      fileChanges.value.delete(worktreeId);
      fileChanges.value = new Map(fileChanges.value);

      if (activeWorktreeId.value === worktreeId) {
        activeWorktreeId.value = worktrees.value.length > 0
          ? worktrees.value[0].id
          : null;
      }

      return true;
    } catch (e) {
      error.value = `Failed to remove worktree: ${String(e)}`;
      return false;
    } finally {
      loading.value = false;
    }
  }

  /** List all worktrees in a repository. */
  async function listWorktrees(repoPath: string): Promise<void> {
    loading.value = true;
    error.value = null;

    try {
      const trees: Array<{ path: string; branch: string; head: string }> =
        await invoke('worktree_list', { repoPath });

      // Merge with existing tracked worktrees
      for (const tree of trees) {
        const existing = worktrees.value.find(w => w.path === tree.path);
        if (!existing) {
          // Infer agentId from path
          const agentId = tree.path.split('/').pop()?.split('-')[0] ?? 'unknown';
          worktrees.value.push({
            id: `wt_${tree.path}`,
            agentId,
            name: tree.path.split('/').pop() ?? tree.path,
            path: tree.path,
            branch: tree.branch,
            createdAt: Date.now(),
            active: false,
          });
        }
      }
    } catch (e) {
      error.value = `Failed to list worktrees: ${String(e)}`;
    } finally {
      loading.value = false;
    }
  }

  /** Switch the active worktree. */
  function switchWorktree(worktreeId: string) {
    const wt = worktrees.value.find(w => w.id === worktreeId);
    if (!wt) return;

    // Deactivate all
    for (const w of worktrees.value) w.active = false;

    wt.active = true;
    activeWorktreeId.value = worktreeId;
  }

  /** Get the path of the active worktree (or main repo if none). */
  function getActivePath(repoPath: string): string {
    return activeWorktree.value?.path ?? repoPath;
  }

  // ── File Changes ──

  /** Refresh file changes for a specific worktree. */
  async function refreshChanges(worktreeId: string): Promise<void> {
    const wt = worktrees.value.find(w => w.id === worktreeId);
    if (!wt) return;

    try {
      const changes: Array<{ path: string; status: string }> =
        await invoke('get_changed_files', { cwd: wt.path });

      fileChanges.value.set(
        worktreeId,
        changes.map(c => ({
          filePath: c.path,
          status: c.status as WorktreeFileChange['status'],
          timestamp: Date.now(),
        })),
      );
      fileChanges.value = new Map(fileChanges.value);
    } catch {
      // worktree might not exist anymore
    }
  }

  /** Get file changes for a specific worktree. */
  function getWorktreeChanges(worktreeId: string): WorktreeFileChange[] {
    return fileChanges.value.get(worktreeId) ?? [];
  }

  /** Get worktrees for a specific agent. */
  function getAgentWorktrees(agentId: string): Worktree[] {
    return worktrees.value.filter(w => w.agentId === agentId);
  }

  return {
    // State
    worktrees: readonly(worktrees),
    activeWorktreeId,
    fileChanges,
    loading,
    error,

    // Computed
    activeWorktree,
    agentWorktrees,
    worktreeCount,
    activeFileChanges,

    // Lifecycle
    createWorktree,
    removeWorktree,
    listWorktrees,
    switchWorktree,
    getActivePath,

    // File changes
    refreshChanges,
    getWorktreeChanges,
    getAgentWorktrees,
  };
});
