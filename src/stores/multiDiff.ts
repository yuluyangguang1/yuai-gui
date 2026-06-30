/**
 * Multi-Agent Diff store (inspired by Orca)
 * Track changes per agent, compare across agents, merge selected changes, detect conflicts.
 */
import { defineStore } from 'pinia';
import { ref, computed, readonly } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { useAgentsStore } from './agents';

// ── Types ──

export interface AgentFileChange {
  agentId: string;
  filePath: string;
  content: string;       // The agent's version of the file
  diff: string;          // Unified diff from base
  timestamp: number;
}

export interface FileConflict {
  filePath: string;
  agentChanges: Array<{
    agentId: string;
    content: string;
    diff: string;
  }>;
  selectedAgentId: string | null; // Which agent's version to use
  hasConflict: boolean;
}

export interface MergeResult {
  filePath: string;
  mergedContent: string;
  sourceAgentId: string;
  success: boolean;
  error?: string;
}

export interface MultiDiffSnapshot {
  id: string;
  agents: string[];
  fileChanges: Map<string, AgentFileChange[]>; // filePath -> changes by agents
  conflicts: FileConflict[];
  createdAt: number;
}

// ── Store ──

export const useMultiDiffStore = defineStore('multiDiff', () => {
  const snapshots = ref<MultiDiffSnapshot[]>([]);
  const activeSnapshotId = ref<string | null>(null);
  const selectedChanges = ref<Map<string, string>>(new Map()); // filePath -> selected agentId
  const mergeResults = ref<MergeResult[]>([]);
  const loading = ref(false);

  // ── Computed ──

  const activeSnapshot = computed(() =>
    snapshots.value.find(s => s.id === activeSnapshotId.value) ?? null,
  );

  const conflictFiles = computed(() =>
    activeSnapshot.value?.conflicts.filter(c => c.hasConflict) ?? [],
  );

  const resolvedFiles = computed(() =>
    activeSnapshot.value?.conflicts.filter(c => !c.hasConflict && c.selectedAgentId !== null) ?? [],
  );

  const allFiles = computed(() =>
    activeSnapshot.value?.conflicts.map(c => c.filePath) ?? [],
  );

  const conflictCount = computed(() => conflictFiles.value.length);
  const resolvedCount = computed(() => resolvedFiles.value.length);
  const totalFiles = computed(() => allFiles.value.length);

  // ── Snapshot Management ──

  /** Create a multi-agent diff snapshot from current agent worktrees. */
  async function createSnapshot(agentIds: string[], basePath: string): Promise<string> {
    loading.value = true;
    const snapshotId = `snap_${Date.now()}`;

    try {
      const agentsStore = useAgentsStore();
      const fileChangesMap = new Map<string, AgentFileChange[]>();
      const agentsInSnapshot = agentIds.filter(id =>
        agentsStore.agents.some(a => a.id === id),
      );

      // Collect changes from each agent
      for (const agentId of agentsInSnapshot) {
        try {
          // Get changed files for this agent's worktree
          const changes: Array<{ path: string; status: string }> = await invoke('get_agent_changes', {
            cwd: basePath,
            agentId,
          });

          for (const change of changes) {
            const diff: string = await invoke('get_agent_file_diff', {
              cwd: basePath,
              agentId,
              path: change.path,
            });

            const content: string = await invoke('get_agent_file_content', {
              cwd: basePath,
              agentId,
              path: change.path,
            });

            const agentChange: AgentFileChange = {
              agentId,
              filePath: change.path,
              content,
              diff,
              timestamp: Date.now(),
            };

            const existing = fileChangesMap.get(change.path) ?? [];
            existing.push(agentChange);
            fileChangesMap.set(change.path, existing);
          }
        } catch {
          // Agent might not have a worktree yet — skip
        }
      }

      // Detect conflicts (files changed by multiple agents)
      const conflicts: FileConflict[] = [];
      for (const [filePath, changes] of fileChangesMap) {
        const hasConflict = changes.length > 1 &&
          !changes.every(c => c.content === changes[0].content);

        conflicts.push({
          filePath,
          agentChanges: changes.map(c => ({
            agentId: c.agentId,
            content: c.content,
            diff: c.diff,
          })),
          selectedAgentId: hasConflict ? null : changes[0]?.agentId ?? null,
          hasConflict,
        });
      }

      const snapshot: MultiDiffSnapshot = {
        id: snapshotId,
        agents: agentsInSnapshot,
        fileChanges: fileChangesMap,
        conflicts,
        createdAt: Date.now(),
      };

      snapshots.value.push(snapshot);
      activeSnapshotId.value = snapshotId;
    } finally {
      loading.value = false;
    }

    return snapshotId;
  }

  /** Remove a snapshot. */
  function removeSnapshot(snapshotId: string) {
    const idx = snapshots.value.findIndex(s => s.id === snapshotId);
    if (idx >= 0) {
      snapshots.value.splice(idx, 1);
      if (activeSnapshotId.value === snapshotId) {
        activeSnapshotId.value = snapshots.value.length > 0
          ? snapshots.value[snapshots.value.length - 1].id
          : null;
      }
    }
  }

  // ── Selection & Resolution ──

  /** Select an agent's version for a specific file. */
  function selectChange(filePath: string, agentId: string) {
    selectedChanges.value.set(filePath, agentId);
    selectedChanges.value = new Map(selectedChanges.value);

    // Update conflict status
    const snapshot = activeSnapshot.value;
    if (snapshot) {
      const conflict = snapshot.conflicts.find(c => c.filePath === filePath);
      if (conflict) {
        conflict.selectedAgentId = agentId;
      }
    }
  }

  /** Auto-resolve: pick the agent with the most recent change for each file. */
  function autoResolve() {
    const snapshot = activeSnapshot.value;
    if (!snapshot) return;

    for (const conflict of snapshot.conflicts) {
      if (conflict.hasConflict && !conflict.selectedAgentId) {
        // Pick the last agent (most recent) as default
        const last = conflict.agentChanges[conflict.agentChanges.length - 1];
        if (last) {
          selectChange(conflict.filePath, last.agentId);
        }
      }
    }
  }

  /** Get the selected agent's change for a file. */
  function getSelectedChange(filePath: string): AgentFileChange | null {
    const agentId = selectedChanges.value.get(filePath);
    if (!agentId) return null;
    const snapshot = activeSnapshot.value;
    if (!snapshot) return null;
    const changes = snapshot.fileChanges.get(filePath);
    return changes?.find(c => c.agentId === agentId) ?? null;
  }

  // ── Merge ──

  /** Merge all selected changes into the target directory. */
  async function mergeSelected(basePath: string): Promise<MergeResult[]> {
    const snapshot = activeSnapshot.value;
    if (!snapshot) return [];

    loading.value = true;
    const results: MergeResult[] = [];

    try {
      for (const conflict of snapshot.conflicts) {
        const agentId = conflict.selectedAgentId;
        if (!agentId) {
          results.push({
            filePath: conflict.filePath,
            mergedContent: '',
            sourceAgentId: '',
            success: false,
            error: 'No agent selected for this file',
          });
          continue;
        }

        const change = snapshot.fileChanges.get(conflict.filePath)
          ?.find(c => c.agentId === agentId);

        if (!change) {
          results.push({
            filePath: conflict.filePath,
            mergedContent: '',
            sourceAgentId: agentId,
            success: false,
            error: 'Change not found',
          });
          continue;
        }

        try {
          await invoke('write_file_content', {
            path: `${basePath}/${conflict.filePath}`,
            content: change.content,
          });

          results.push({
            filePath: conflict.filePath,
            mergedContent: change.content,
            sourceAgentId: agentId,
            success: true,
          });
        } catch (e) {
          results.push({
            filePath: conflict.filePath,
            mergedContent: '',
            sourceAgentId: agentId,
            success: false,
            error: String(e),
          });
        }
      }
    } finally {
      loading.value = false;
    }

    mergeResults.value = results;
    return results;
  }

  // ── Comparison ──

  /** Get all agent changes for a specific file. */
  function getFileChanges(filePath: string): AgentFileChange[] {
    const snapshot = activeSnapshot.value;
    if (!snapshot) return [];
    return snapshot.fileChanges.get(filePath) ?? [];
  }

  /** Check if a file has conflicting changes. */
  function hasConflict(filePath: string): boolean {
    const snapshot = activeSnapshot.value;
    if (!snapshot) return false;
    return snapshot.conflicts.find(c => c.filePath === filePath)?.hasConflict ?? false;
  }

  return {
    // State
    snapshots: readonly(snapshots),
    activeSnapshotId,
    selectedChanges,
    mergeResults,
    loading,

    // Computed
    activeSnapshot,
    conflictFiles,
    resolvedFiles,
    allFiles,
    conflictCount,
    resolvedCount,
    totalFiles,

    // Snapshot management
    createSnapshot,
    removeSnapshot,

    // Selection & resolution
    selectChange,
    autoResolve,
    getSelectedChange,
    getFileChanges,
    hasConflict,

    // Merge
    mergeSelected,
  };
});
