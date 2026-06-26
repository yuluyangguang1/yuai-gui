import { ref, onBeforeUnmount } from "vue";
import { invoke } from "@tauri-apps/api/core";

export type SaveStatus = "saved" | "saving" | "dirty" | "conflict" | "error";

export interface WriteFileResult {
  conflict: boolean;
  mtime: number;
}

export function useAutoSave() {
  const dirty = ref(false);
  const saving = ref(false);
  const lastSaved = ref<number | null>(null);
  const saveStatus = ref<SaveStatus>("saved");

  let baselineContent = "";
  let baselineMtime = 0;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  function setBaseline(content: string, mtime: number) {
    baselineContent = content;
    baselineMtime = mtime;
    dirty.value = false;
    saveStatus.value = "saved";
  }

  function markDirty() {
    dirty.value = true;
    if (saveStatus.value !== "saving") {
      saveStatus.value = "dirty";
    }
  }

  async function doSave(
    getContent: () => string,
    path: string,
  ): Promise<boolean> {
    const content = getContent();

    // Check if content actually changed from baseline
    if (content === baselineContent) {
      dirty.value = false;
      saveStatus.value = "saved";
      return true;
    }

    saving.value = true;
    saveStatus.value = "saving";

    try {
      const result: WriteFileResult = await invoke("write_file_content", {
        path,
        content,
        expectedMtime: baselineMtime,
      });

      if (result.conflict) {
        saveStatus.value = "conflict";
        saving.value = false;
        return false;
      }

      // Update baseline to the new state
      baselineContent = content;
      baselineMtime = result.mtime;
      dirty.value = false;
      lastSaved.value = Date.now();
      saveStatus.value = "saved";
      saving.value = false;
      return true;
    } catch (e) {
      console.error("Auto-save failed:", e);
      saveStatus.value = "error";
      saving.value = false;
      return false;
    }
  }

  function queueSave(getContent: () => string, path: string) {
    markDirty();
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      doSave(getContent, path);
    }, 800);
  }

  async function flush(
    getContent: () => string,
    path: string,
  ): Promise<boolean> {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    return doSave(getContent, path);
  }

  onBeforeUnmount(() => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
  });

  return {
    dirty,
    saving,
    lastSaved,
    saveStatus,
    setBaseline,
    markDirty,
    queueSave,
    doSave,
    flush,
  };
}
