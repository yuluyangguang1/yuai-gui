import { defineStore } from "pinia";
import { ref } from "vue";
import { invoke } from "@tauri-apps/api/core";

export interface UpdateInfo {
  available: boolean;
  current: string;
  latest: string;
  url: string;
}

export const useUpdateStore = defineStore("update", () => {
  const updateAvailable = ref(false);
  const updateInfo = ref<UpdateInfo | null>(null);
  const checking = ref(false);
  let intervalId: ReturnType<typeof setInterval> | null = null;

  async function checkUpdate() {
    checking.value = true;
    try {
      const info: UpdateInfo = await invoke("check_update");
      updateInfo.value = info;
      updateAvailable.value = info.available;
    } catch (e) {
      console.warn("checkUpdate failed:", e);
    } finally {
      checking.value = false;
    }
  }

  /** Start periodic update checks: immediately + every 2 hours. */
  function startAutoCheck() {
    checkUpdate();
    if (intervalId) clearInterval(intervalId);
    intervalId = setInterval(checkUpdate, 2 * 60 * 60 * 1000);
  }

  function stopAutoCheck() {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }

  return {
    updateAvailable,
    updateInfo,
    checking,
    checkUpdate,
    startAutoCheck,
    stopAutoCheck,
  };
});
