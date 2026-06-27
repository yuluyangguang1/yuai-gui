import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { invoke } from "@tauri-apps/api/core";

export interface SkillInfo {
  name: string;
  description: string;
  source: string;
  label: string;
  dir: string;
  content: string;
  hits: number;
  last: number;
  disabled: boolean;
  issues: string[];
  copies: string[];
}

export interface SkillsOverview {
  total: number;
  unique: number;
  active: number;
  dust: number;
  issues: number;
  budget_chars: number;
  budget_limit: number;
}

export interface SkillsData {
  overview: SkillsOverview;
  items: SkillInfo[];
}

export type SkillFilter = "all" | "claude" | "codex" | "project" | "dup" | "bad";
export type SkillSort = "hits" | "recent" | "health" | "name";

export const useSkillsStore = defineStore("skills", () => {
  const skillsData = ref<SkillsData | null>(null);
  const filter = ref<SkillFilter>("all");
  const sort = ref<SkillSort>("hits");
  const openRows = ref<Set<string>>(new Set());
  const loading = ref(false);

  // ── Hot-Reload State ──
  const watching = ref(false);
  const lastReloadAt = ref<number>(0);
  const reloadCount = ref(0);
  const watchError = ref<string | null>(null);
  let unlistenFn: (() => void) | null = null;

  // Preserve skill state across reloads (hits, last triggered)
  const preservedState = ref<Map<string, { hits: number; last: number }>>(new Map());

  const overview = computed(() => skillsData.value?.overview ?? {
    total: 0, unique: 0, active: 0, dust: 0, issues: 0,
    budget_chars: 0, budget_limit: 200000,
  });

  const filteredItems = computed(() => {
    if (!skillsData.value) return [];
    let items = [...skillsData.value.items];

    // Apply filter
    switch (filter.value) {
      case "claude":
        items = items.filter((s) => s.source === "claude");
        break;
      case "codex":
        items = items.filter((s) => s.source === "codex");
        break;
      case "project":
        items = items.filter((s) => s.source === "project");
        break;
      case "dup":
        items = items.filter((s) => s.copies.length > 1);
        break;
      case "bad":
        items = items.filter((s) => s.issues.length > 0);
        break;
    }

    // Apply sort
    switch (sort.value) {
      case "hits":
        items.sort((a, b) => b.hits - a.hits);
        break;
      case "recent":
        items.sort((a, b) => b.last - a.last);
        break;
      case "health":
        items.sort((a, b) => a.issues.length - b.issues.length);
        break;
      case "name":
        items.sort((a, b) => a.name.localeCompare(b.name));
        break;
    }

    return items;
  });

  async function loadSkills() {
    loading.value = true;
    try {
      skillsData.value = await invoke<SkillsData>("get_skills");
    } catch (e) {
      console.error("Failed to load skills:", e);
    } finally {
      loading.value = false;
    }
  }

  /**
   * Reload skills while preserving state (hits, last triggered).
   * Merges preserved state with fresh data from backend.
   */
  async function reloadSkills() {
    // Save current state before reload
    if (skillsData.value) {
      for (const skill of skillsData.value.items) {
        preservedState.value.set(skill.dir, {
          hits: skill.hits,
          last: skill.last,
        });
      }
    }

    loading.value = true;
    try {
      const freshData = await invoke<SkillsData>("get_skills");

      // Merge preserved state: if backend returns 0 hits but we had hits, keep ours
      if (freshData) {
        for (const skill of freshData.items) {
          const prev = preservedState.value.get(skill.dir);
          if (prev) {
            // Preserve higher hit count and more recent timestamp
            skill.hits = Math.max(skill.hits, prev.hits);
            skill.last = Math.max(skill.last, prev.last);
          }
        }
      }

      skillsData.value = freshData;
      lastReloadAt.value = Date.now();
      reloadCount.value++;
      watchError.value = null;
    } catch (e) {
      console.error("Failed to reload skills:", e);
      watchError.value = String(e);
    } finally {
      loading.value = false;
    }
  }

  /**
   * Start watching skill directories for changes using Tauri's fs watcher.
   */
  async function startWatching() {
    if (watching.value) return;
    try {
      // Try using Tauri's fs watch API
      const { watch } = await import("@tauri-apps/plugin-fs");
      const skillDirs = await invoke<string[]>("get_skill_dirs");

      unlistenFn = await watch(
        skillDirs,
        async (event) => {
          // Debounce: don't reload too frequently
          const now = Date.now();
          if (now - lastReloadAt.value < 2000) return;

          console.log("[Skills] File change detected:", event);
          await reloadSkills();
        },
        { recursive: true }
      );

      watching.value = true;
      watchError.value = null;
    } catch (e) {
      // If Tauri fs plugin not available, try fallback approach
      console.warn("Tauri fs watcher not available, using poll fallback:", e);
      watchError.value = "Using poll fallback";
      startPollFallback();
    }
  }

  /**
   * Fallback: poll for skill changes every 30 seconds.
   */
  let pollTimer: ReturnType<typeof setInterval> | null = null;
  function startPollFallback() {
    if (pollTimer) return;
    watching.value = true;
    pollTimer = setInterval(async () => {
      try {
        const data = await invoke<SkillsData>("get_skills");
        // Compare with current data to detect changes
        if (skillsData.value && data) {
          const currentNames = new Set(skillsData.value.items.map(s => s.name));
          const newNames = new Set(data.items.map(s => s.name));
          const hasChanges =
            currentNames.size !== newNames.size ||
            [...newNames].some(n => !currentNames.has(n)) ||
            data.items.some((item, i) => {
              const prev = skillsData.value?.items[i];
              return prev && (prev.hits !== item.hits || prev.content !== item.content);
            });
          if (hasChanges) {
            await reloadSkills();
          }
        } else {
          await reloadSkills();
        }
      } catch (e) {
        console.error("[Skills] Poll error:", e);
      }
    }, 30_000);
  }

  /**
   * Stop watching for skill changes.
   */
  async function stopWatching() {
    if (unlistenFn) {
      unlistenFn();
      unlistenFn = null;
    }
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    watching.value = false;
  }

  async function toggleSkill(dir: string, enable: boolean) {
    try {
      await invoke("toggle_skill", { dir, enable });
      await loadSkills();
    } catch (e) {
      console.error("Failed to toggle skill:", e);
      throw e;
    }
  }

  async function trashSkill(dir: string) {
    try {
      await invoke("trash_skill", { dir });
      await loadSkills();
    } catch (e) {
      console.error("Failed to trash skill:", e);
      throw e;
    }
  }

  async function updateSkillStats(dir: string) {
    try {
      await invoke("update_skill_stats", { dir });
    } catch (e) {
      console.error("Failed to update skill stats:", e);
    }
  }

  function toggleRow(dir: string) {
    if (openRows.value.has(dir)) {
      openRows.value.delete(dir);
    } else {
      openRows.value.add(dir);
    }
    // Force reactivity
    openRows.value = new Set(openRows.value);
  }

  function isRowOpen(dir: string): boolean {
    return openRows.value.has(dir);
  }

  function healthDot(skill: SkillInfo): "ok" | "warn" | "bad" {
    if (skill.disabled) return "warn";
    if (skill.issues.length > 0) return "bad";
    return "ok";
  }

  function formatLastTriggered(ts: number): string {
    if (ts === 0) return "从未";
    const now = Date.now() / 1000;
    const diff = now - ts;
    if (diff < 60) return "刚刚";
    if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
    if (diff < 45 * 86400) return `${Math.floor(diff / 86400)} 天前`;
    return `${Math.floor(diff / (30 * 86400))} 月前`;
  }

  return {
    skillsData,
    filter,
    sort,
    openRows,
    loading,
    overview,
    filteredItems,
    loadSkills,
    reloadSkills,
    toggleSkill,
    trashSkill,
    updateSkillStats,
    toggleRow,
    isRowOpen,
    healthDot,
    formatLastTriggered,
    // Hot-reload
    watching,
    lastReloadAt,
    reloadCount,
    watchError,
    startWatching,
    stopWatching,
  };
});
