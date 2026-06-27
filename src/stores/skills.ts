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
    toggleSkill,
    trashSkill,
    updateSkillStats,
    toggleRow,
    isRowOpen,
    healthDot,
    formatLastTriggered,
  };
});
