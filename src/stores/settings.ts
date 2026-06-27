import { defineStore } from "pinia";
import { ref, watch } from "vue";

export type ThemeMode = "dark" | "light" | "volt" | "warm" | "editorial";

const ALL_THEMES: ThemeMode[] = ["dark", "light", "volt", "warm", "editorial"];

export const useSettingsStore = defineStore("settings", () => {
  const theme = ref<ThemeMode>("dark");

  // Load from localStorage
  function load() {
    try {
      const saved = localStorage.getItem("yuai-theme");
      if (saved && ALL_THEMES.includes(saved as ThemeMode)) {
        theme.value = saved as ThemeMode;
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
    const idx = ALL_THEMES.indexOf(theme.value);
    theme.value = ALL_THEMES[(idx + 1) % ALL_THEMES.length];
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
