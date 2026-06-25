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

export const useWorkspaceStore = defineStore("workspace", () => {
  const path = ref<string>("");
  const fileTree = ref<FileNode[]>([]);
  const currentFile = ref<string>("");
  const currentFileContent = ref<string>("");
  const changedFiles = ref<Set<string>>(new Set());
  const loading = ref(false);
  const showWorkspace = ref(true);
  let unlistenFileChanged: (() => void) | null = null;

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
          setTimeout(() => {
            changedFiles.value.delete(filePath);
            changedFiles.value = new Set(changedFiles.value);
            changeTimestamps.value.delete(filePath);
            changeTimestamps.value = new Map(changeTimestamps.value);
          }, 8000);

          // ── File Follow Mode: auto-navigate to changed file ──
          followOnFileChanged(filePath);
        }
      });

      console.log("File watcher started for:", path.value);
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
  }

  function clearChanged(filePath: string) {
    changedFiles.value.delete(filePath);
    changedFiles.value = new Set(changedFiles.value);
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
  };
});
