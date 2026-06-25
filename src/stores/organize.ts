import { defineStore } from "pinia";
import { ref } from "vue";

export interface OrganizeHistoryEntry {
  timestamp: number;
  action: string;
  result: string;
}

const STORAGE_PREFS = "yuai-organize-preferences";
const STORAGE_HISTORY = "yuai-organize-history";

export const useOrganizeStore = defineStore("organize", () => {
  const preferences = ref<string[]>([]);
  const history = ref<OrganizeHistoryEntry[]>([]);

  function loadPreferences() {
    try {
      const saved = localStorage.getItem(STORAGE_PREFS);
      if (saved) {
        preferences.value = JSON.parse(saved);
      }
    } catch {
      // ignore
    }
    try {
      const saved = localStorage.getItem(STORAGE_HISTORY);
      if (saved) {
        history.value = JSON.parse(saved);
      }
    } catch {
      // ignore
    }
  }

  function savePreferences() {
    try {
      localStorage.setItem(STORAGE_PREFS, JSON.stringify(preferences.value));
    } catch {
      // ignore
    }
    try {
      localStorage.setItem(STORAGE_HISTORY, JSON.stringify(history.value));
    } catch {
      // ignore
    }
  }

  function addPreference(pref: string) {
    if (pref.trim() && !preferences.value.includes(pref.trim())) {
      preferences.value.push(pref.trim());
      savePreferences();
    }
  }

  function removePreference(index: number) {
    preferences.value.splice(index, 1);
    savePreferences();
  }

  function clearPreferences() {
    preferences.value = [];
    savePreferences();
  }

  function addHistory(entry: OrganizeHistoryEntry) {
    history.value.unshift(entry);
    // Keep last 10
    if (history.value.length > 10) {
      history.value = history.value.slice(0, 10);
    }
    savePreferences();
  }

  function clearHistory() {
    history.value = [];
    savePreferences();
  }

  function buildOrganizePrompt(workspacePath: string): string {
    let prompt = `请整理工作区: ${workspacePath}\n`;

    if (preferences.value.length > 0) {
      prompt += "\n用户偏好:\n";
      for (const pref of preferences.value) {
        prompt += `- ${pref}\n`;
      }
    }

    if (history.value.length > 0) {
      prompt += "\n历史操作:\n";
      for (const entry of history.value.slice(0, 5)) {
        const date = new Date(entry.timestamp).toLocaleDateString();
        prompt += `- [${date}] ${entry.action}: ${entry.result}\n`;
      }
    }

    return prompt;
  }

  // Initialize
  loadPreferences();

  return {
    preferences,
    history,
    addPreference,
    removePreference,
    clearPreferences,
    addHistory,
    clearHistory,
    loadPreferences,
    savePreferences,
    buildOrganizePrompt,
  };
});
