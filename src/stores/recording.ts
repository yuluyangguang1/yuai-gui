import { defineStore } from "pinia";
import { ref } from "vue";
import { invoke } from "@tauri-apps/api/core";

export interface RecordingInfo {
  path: string;
  timestamp: string;
  duration: number;
  sessionId: string;
}

export const useRecordingStore = defineStore("recording", () => {
  const recordings = ref<RecordingInfo[]>([]);
  const loading = ref(false);

  async function loadRecordings() {
    loading.value = true;
    try {
      const list: RecordingInfo[] = await invoke("list_recordings");
      recordings.value = list;
    } catch (e) {
      console.warn("loadRecordings failed:", e);
    } finally {
      loading.value = false;
    }
  }

  async function deleteRecording(path: string) {
    try {
      await invoke("delete_recording", { path });
      recordings.value = recordings.value.filter((r) => r.path !== path);
    } catch (e) {
      console.warn("deleteRecording failed:", e);
    }
  }

  async function readRecording(path: string): Promise<string> {
    return await invoke("read_recording", { path });
  }

  return {
    recordings,
    loading,
    loadRecordings,
    deleteRecording,
    readRecording,
  };
});
