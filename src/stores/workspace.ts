import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";

/** Extract the file name from a cross-platform path (handles both / and \). */
function getFileName(filePath: string): string {
  return filePath.split(/[\/\\]/).pop() ?? filePath;
}

export interface FileNode {
  name: string;
  path: string;
  is_dir: boolean;
  children?: FileNode[];
}

// ══════════════════════════════════════════════
// Editor Tab Management (inspired by GPT-Runner)
// ══════════════════════════════════════════════

export interface EditorTab {
  path: string;
  name: string;
  modified: boolean;
}

export const useWorkspaceStore = defineStore("workspace", () => {
  const path = ref<string>("");
  const fileTree = ref<FileNode[]>([]);
  const currentFile = ref<string>("");
  const currentFileContent = ref<string>("");
  const changedFiles = ref<Set<string>>(new Set());
  let clearTimers: Map<string, ReturnType<typeof setTimeout>> | null = null;
  const loading = ref(false);
  const showWorkspace = ref(true);
  let unlistenFileChanged: (() => void) | null = null;

  // ── Agent Workspace Isolation (from Orca) ──
  /** Per-agent isolated file changes. Each agent sees its own changes. */
  const agentFileChanges = ref<Map<string, Set<string>>>(new Map()); // agentId -> changed file paths
  /** Shared files visible to all agents. */
  const sharedFiles = ref<Set<string>>(new Set());
  /** Active isolation mode. */
  const isolationMode = ref<'shared' | 'isolated'>('shared');
  /** The agent whose workspace is currently being viewed (null = shared view). */
  const viewingAgentId = ref<string | null>(null);
  // ── Sorting & Filtering ──
  const sortBy = ref<'name' | 'mtime' | 'size'>('name');
  const filterText = ref('');
  const showHidden = ref(false);
  const viewMode = ref<'list' | 'grid'>('list');

  // ── Editor Tabs ──
  const openTabs = ref<EditorTab[]>([]);
  const activeTabPath = computed(() => currentFile.value);

  /** Open a file in a new tab (or activate existing tab). */
  function openTab(filePath: string) {
    const existing = openTabs.value.find(t => t.path === filePath);
    if (existing) {
      // Already open, just activate it
      selectFile(filePath);
      return;
    }
    openTabs.value.push({
      path: filePath,
      name: getFileName(filePath),
      modified: false,
    });
    selectFile(filePath);
  }

  /** Close a tab by path. */
  function closeTab(filePath: string) {
    const idx = openTabs.value.findIndex(t => t.path === filePath);
    if (idx === -1) return;
    openTabs.value.splice(idx, 1);

    // If closing the active tab, switch to adjacent tab
    if (currentFile.value === filePath) {
      if (openTabs.value.length > 0) {
        const newIdx = Math.min(idx, openTabs.value.length - 1);
        selectFile(openTabs.value[newIdx].path);
      } else {
        currentFile.value = "";
        currentFileContent.value = "";
      }
    }
  }

  /** Close all tabs. */
  function closeAllTabs() {
    openTabs.value = [];
    currentFile.value = "";
    currentFileContent.value = "";
  }

  /** Close all tabs except the given path. */
  function closeOtherTabs(keepPath: string) {
    openTabs.value = openTabs.value.filter(t => t.path === keepPath);
    if (!openTabs.value.find(t => t.path === keepPath)) {
      currentFile.value = "";
      currentFileContent.value = "";
    }
  }

  /** Mark a tab as modified. */
  function markTabModified(filePath: string) {
    const tab = openTabs.value.find(t => t.path === filePath);
    if (tab) tab.modified = true;
  }

  /** Clear the modified indicator for a tab. */
  function clearTabModified(filePath: string) {
    const tab = openTabs.value.find(t => t.path === filePath);
    if (tab) tab.modified = false;
  }

  function sortEntries(entries: FileNode[]): FileNode[] {
    const sorted = [...entries];
    // Always directories first
    sorted.sort((a, b) => {
      if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1;
      switch (sortBy.value) {
        case 'name':
          return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
        case 'mtime':
          // If we had mtime data we'd sort by it; fall back to name
          return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
        case 'size':
          // If we had size data we'd sort by it; fall back to name
          return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
        default:
          return 0;
      }
    });
    return sorted;
  }

  function filterEntries(entries: FileNode[]): FileNode[] {
    let result = entries;
    // Hide hidden files (starting with .)
    if (!showHidden.value) {
      result = result.filter((e) => !e.name.startsWith('.'));
    }
    // Filter by text
    if (filterText.value.trim()) {
      const q = filterText.value.toLowerCase();
      result = result.filter((e) => e.name.toLowerCase().includes(q));
    }
    return result;
  }

  function processTree(entries: FileNode[]): FileNode[] {
    const filtered = filterEntries(entries);
    const sorted = sortEntries(filtered);
    // Recursively process children of directories
    return sorted.map((node) => {
      if (node.is_dir && node.children) {
        return { ...node, children: processTree(node.children) };
      }
      return node;
    });
  }

  const displayTree = computed(() => processTree(fileTree.value));


  // ── Favorites & Recent Files ──
  const favorites = ref<string[]>([]);
  const recentFiles = ref<{ path: string; timestamp: number }[]>([]);

  // Load from localStorage
  function loadFavoritesAndRecent() {
    try {
      const favStr = localStorage.getItem("yuai-favorites");
      if (favStr) favorites.value = JSON.parse(favStr);

      const recentStr = localStorage.getItem("yuai-recent-files");
      if (recentStr) recentFiles.value = JSON.parse(recentStr);
    } catch {
      // ignore
    }
  }

  function saveFavorites() {
    try {
      localStorage.setItem("yuai-favorites", JSON.stringify(favorites.value));
    } catch {
      // ignore
    }
  }

  function saveRecentFiles() {
    try {
      localStorage.setItem("yuai-recent-files", JSON.stringify(recentFiles.value));
    } catch {
      // ignore
    }
  }

  function toggleFavorite(filePath: string) {
    const idx = favorites.value.indexOf(filePath);
    if (idx === -1) {
      favorites.value = [...favorites.value, filePath];
    } else {
      favorites.value = favorites.value.filter((p) => p !== filePath);
    }
    saveFavorites();
  }

  function isFavorite(filePath: string): boolean {
    return favorites.value.includes(filePath);
  }

  function addRecent(filePath: string) {
    // Remove if already exists
    const filtered = recentFiles.value.filter((r) => r.path !== filePath);
    // Add to front
    filtered.unshift({ path: filePath, timestamp: Date.now() });
    // Keep last 20
    recentFiles.value = filtered.slice(0, 20);
    saveRecentFiles();
  }

  // Initialize favorites and recent from localStorage
  loadFavoritesAndRecent();

  // Auto-open home directory as workspace on first load
  async function initWorkspace() {
    if (path.value) return; // already set
    try {
      const home = await invoke<string>("get_home_dir").catch(() => "");
      if (home) {
        await openWorkspace(home);
      }
    } catch {
      // ignore — user can open workspace manually
    }
  }

  // Change Inbox: track timestamps per file and history entries
  const changeTimestamps = ref<Map<string, number>>(new Map());
  interface ChangeEntry {
    filePath: string;
    fileName: string;
    changeType: "created" | "modified" | "deleted";
    timestamp: number;
  }
  const changeHistory = ref<ChangeEntry[]>([]);
  const CHANGE_INBOX_TTL = 30_000; // 30 seconds

  // ── File Follow Mode ──
  const followedAgentId = ref<string | null>(null);
  let followLastSwitchTime = 0;
  let followIsFirstSwitch = true;
  let followUserNavigated = false;

  const currentFileName = computed(() => {
    if (!currentFile.value) return "";
    return currentFile.value.split("/").pop() ?? "";
  });

  const hasWorkspace = computed(() => !!path.value);

  function toggleWorkspace() {
    showWorkspace.value = !showWorkspace.value;
  }

  async function openWorkspace(dirPath?: string) {
    if (dirPath) {
      path.value = dirPath;
    } else {
      try {
        const selected = await open({ directory: true });
        if (selected) {
          path.value = selected as string;
        }
      } catch {
        console.warn("Dialog plugin not available");
        return;
      }
    }

    if (!path.value) return;

    loading.value = true;
    try {
      const tree: FileNode[] = await invoke("read_dir_tree", {
        path: path.value,
        maxDepth: 4,
      });
      fileTree.value = tree;

      // Start the file watcher for this workspace
      await startFileWatcher();
    } catch {
      console.warn("Could not read directory tree from backend");
      fileTree.value = [];
    } finally {
      loading.value = false;
    }
  }

  async function startFileWatcher() {
    try {
      // Stop any previous watcher
      await stopFileWatcher();

      // Start the backend watcher
      await invoke("start_watcher", { path: path.value });

      // Listen for file-changed events from the backend
      unlistenFileChanged = await listen<{
        path: string;
        kind: string;
      }>("file-changed", (event) => {
        const filePath = event.payload.path;
        const kind = event.payload.kind;

        if (kind === "delete") {
          changedFiles.value.delete(filePath);
          // Force reactivity
          changedFiles.value = new Set(changedFiles.value);
          // Add to change history
          addChangeEntry(filePath, "deleted");
        } else {
          // Determine if created or modified before updating timestamp
          const isNew = !changeTimestamps.value.has(filePath) || kind === "create";
          addChangeEntry(filePath, isNew ? "created" : "modified");

          changedFiles.value.add(filePath);
          // Force reactivity
          changedFiles.value = new Set(changedFiles.value);

          // Track timestamp
          changeTimestamps.value.set(filePath, Date.now());
          changeTimestamps.value = new Map(changeTimestamps.value);

          // Auto-clear the changed indicator after 8 seconds
          // 使用 Map 跟踪每个文件的定时器，避免累积
          if (!clearTimers) clearTimers = new Map();
          const existing = clearTimers.get(filePath);
          if (existing) clearTimeout(existing);
          clearTimers.set(filePath, setTimeout(() => {
            changedFiles.value.delete(filePath);
            changedFiles.value = new Set(changedFiles.value);
            changeTimestamps.value.delete(filePath);
            changeTimestamps.value = new Map(changeTimestamps.value);
            clearTimers?.delete(filePath);
          }, 8000));

          // ── File Follow Mode: auto-navigate to changed file ──
          followOnFileChanged(filePath);
        }
      });

    } catch (err) {
      console.warn("Failed to start file watcher:", err);
    }
  }

  function addChangeEntry(filePath: string, changeType: "created" | "modified" | "deleted") {
    const fileName = getFileName(filePath) ?? filePath;
    const entry: ChangeEntry = { filePath, fileName, changeType, timestamp: Date.now() };
    changeHistory.value.unshift(entry);
    // Keep max 50 entries
    if (changeHistory.value.length > 50) {
      changeHistory.value = changeHistory.value.slice(0, 50);
    }
    // Auto-remove after TTL
    setTimeout(() => {
      const idx = changeHistory.value.findIndex(e => e.timestamp === entry.timestamp && e.filePath === entry.filePath);
      if (idx !== -1) {
        changeHistory.value.splice(idx, 1);
        changeHistory.value = [...changeHistory.value];
      }
    }, CHANGE_INBOX_TTL);
  }

  const inboxCount = computed(() => changeHistory.value.length);

  function clearInbox() {
    changeHistory.value = [];
  }

  async function stopFileWatcher() {
    try {
      await invoke("stop_watcher");
    } catch {
      // ignore
    }
    if (unlistenFileChanged) {
      unlistenFileChanged();
      unlistenFileChanged = null;
    }
  }

  async function refreshFileTree() {
    if (!path.value) return;
    try {
      const tree: FileNode[] = await invoke("read_dir_tree", {
        path: path.value,
        maxDepth: 4,
      });
      fileTree.value = tree;
    } catch {
      console.warn("Could not refresh file tree");
    }
  }

  async function selectFile(filePath: string) {
    currentFile.value = filePath;
    // Clear the changed indicator when file is selected
    changedFiles.value.delete(filePath);
    changedFiles.value = new Set(changedFiles.value);

    // Track in recent files
    addRecent(filePath);

    // Notify follow mode that user manually navigated
    followUserNavigated = true;

    try {
      const content: string = await invoke("read_file_content", { path: filePath });
      currentFileContent.value = content;
    } catch {
      currentFileContent.value = `// ${getFileName(filePath)}\n// (file preview not available)`;
    }
  }

  function markChanged(filePath: string) {
    changedFiles.value.add(filePath);
    changedFiles.value = new Set(changedFiles.value);
    markTabModified(filePath);
  }

  function clearChanged(filePath: string) {
    changedFiles.value.delete(filePath);
    changedFiles.value = new Set(changedFiles.value);
    clearTabModified(filePath);
  }

  // ── File Follow Mode ──

  /** Start following files changed by an agent. */
  function followAgent(agentId: string) {
    followedAgentId.value = agentId;
    followUserNavigated = false;
    followIsFirstSwitch = true;
    followLastSwitchTime = 0;
  }

  /** Stop following. */
  function unfollow() {
    followedAgentId.value = null;
  }

  /**
   * Auto-navigate to a file if follow mode is active.
   * Called from the file-changed event handler.
   */
  function followOnFileChanged(filePath: string) {
    if (!followedAgentId.value) return;
    if (followUserNavigated) return;

    const now = Date.now();
    const minInterval = followIsFirstSwitch ? 120 : 900;
    if (now - followLastSwitchTime < minInterval) return;
    followLastSwitchTime = now;
    followIsFirstSwitch = false;

    // Auto-select file
    selectFileFollow(filePath);
  }

  /**
   * Select a file without triggering user-navigation guard.
   * Used by follow mode.
   */
  async function selectFileFollow(filePath: string) {
    currentFile.value = filePath;
    changedFiles.value.delete(filePath);
    changedFiles.value = new Set(changedFiles.value);

    try {
      const content: string = await invoke("read_file_content", { path: filePath });
      currentFileContent.value = content;
    } catch {
      currentFileContent.value = `// ${getFileName(filePath)}\n// (file preview not available)`;
    }
  }

  // ── Agent Workspace Isolation Functions ──

  /** Track a file change for a specific agent. */
  function trackAgentChange(agentId: string, filePath: string) {
    const existing = agentFileChanges.value.get(agentId) ?? new Set();
    existing.add(filePath);
    agentFileChanges.value = new Map(agentFileChanges.value.set(agentId, existing));
  }

  /** Get file changes for a specific agent. */
  function getAgentChanges(agentId: string): string[] {
    const changes = agentFileChanges.value.get(agentId);
    return changes ? [...changes] : [];
  }

  /** Get all changed files visible to the current view. */
  function getVisibleChanges(): string[] {
    if (isolationMode.value === 'shared') {
      return [...sharedFiles.value];
    }
    if (viewingAgentId.value) {
      return getAgentChanges(viewingAgentId.value);
    }
    // Show all agent changes combined
    const all = new Set<string>();
    for (const changes of agentFileChanges.value.values()) {
      for (const f of changes) all.add(f);
    }
    return [...all];
  }

  /** Mark a file as shared (visible to all agents). */
  function markShared(filePath: string) {
    sharedFiles.value.add(filePath);
    sharedFiles.value = new Set(sharedFiles.value);
  }

  /** Remove a file from shared set. */
  function unmarkShared(filePath: string) {
    sharedFiles.value.delete(filePath);
    sharedFiles.value = new Set(sharedFiles.value);
  }

  /** Set the isolation mode. */
  function setIsolationMode(mode: 'shared' | 'isolated') {
    isolationMode.value = mode;
  }

  /** Set which agent's workspace to view. */
  function viewAgentWorkspace(agentId: string | null) {
    viewingAgentId.value = agentId;
    isolationMode.value = agentId ? 'isolated' : 'shared';
  }

  /** Merge an agent's changes into the shared workspace on completion. */
  function mergeAgentWorkspace(agentId: string) {
    const changes = agentFileChanges.value.get(agentId);
    if (!changes) return;
    for (const f of changes) {
      sharedFiles.value.add(f);
    }
    sharedFiles.value = new Set(sharedFiles.value);
    // Clear agent-specific tracking after merge
    agentFileChanges.value.delete(agentId);
    agentFileChanges.value = new Map(agentFileChanges.value);
  }

  /** Clear agent-specific changes. */
  function clearAgentChanges(agentId: string) {
    agentFileChanges.value.delete(agentId);
    agentFileChanges.value = new Map(agentFileChanges.value);
  }

  const agentChangesCount = computed(() => {
    const changes = viewingAgentId.value
      ? agentFileChanges.value.get(viewingAgentId.value)
      : null;
    return changes?.size ?? 0;
  });

  return {
    path,
    fileTree,
    currentFile,
    currentFileContent,
    changedFiles,
    loading,
    showWorkspace,
    currentFileName,
    hasWorkspace,
    changeTimestamps,
    changeHistory,
    inboxCount,
    followedAgentId,
    favorites,
    recentFiles,
    // Editor Tabs
    openTabs,
    activeTabPath,
    openTab,
    closeTab,
    closeAllTabs,
    closeOtherTabs,
    markTabModified,
    clearTabModified,
    // Sorting & Filtering
    sortBy,
    filterText,
    showHidden,
    viewMode,
    displayTree,
    clearInbox,
    toggleWorkspace,
    openWorkspace,
    selectFile,
    markChanged,
    clearChanged,
    refreshFileTree,
    startFileWatcher,
    stopFileWatcher,
    followAgent,
    unfollow,
    toggleFavorite,
    isFavorite,
    addRecent,
    initWorkspace,
    // Agent Workspace Isolation
    agentFileChanges,
    sharedFiles,
    isolationMode,
    viewingAgentId,
    agentChangesCount,
    trackAgentChange,
    getAgentChanges,
    getVisibleChanges,
    markShared,
    unmarkShared,
    setIsolationMode,
    viewAgentWorkspace,
    mergeAgentWorkspace,
    clearAgentChanges,
  };
});
