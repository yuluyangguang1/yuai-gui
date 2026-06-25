import { defineStore } from "pinia";
import { ref, watch } from "vue";

export type ThemeMode = "dark" | "light";

export const useSettingsStore = defineStore("settings", () => {
  const theme = ref<ThemeMode>("dark");

  // Load from localStorage
  function load() {
    try {
      const saved = localStorage.getItem("yuai-theme");
      if (saved === "light" || saved === "dark") {
        theme.value = saved;
      }
    } catch {
      // ignore
    }
    applyTheme();
  }

  function save() {
    try {
      localStorage.setItem("yuai-theme", theme.value);
    } catch {
      // ignore
    }
  }

  function applyTheme() {
    document.documentElement.setAttribute("data-theme", theme.value);
  }

  function toggleTheme() {
    theme.value = theme.value === "dark" ? "light" : "dark";
    applyTheme();
    save();
  }

  function setTheme(t: ThemeMode) {
    theme.value = t;
    applyTheme();
    save();
  }

  // Auto-apply on changes
  watch(theme, () => applyTheme());

  // Initialize
  load();

  return {
    theme,
    toggleTheme,
    setTheme,
    load,
    save,
  };
});
