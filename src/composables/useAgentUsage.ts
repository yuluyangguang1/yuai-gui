/**
 * useAgentUsage — Agent Usage Tracking (from FanBox)
 *
 * Parse Claude Code JSONL files for token usage.
 * Aggregate: last 5h, today, this week.
 */
import { ref, watch } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { useWorkspaceStore } from "../stores/workspace";

export interface UsageStats {
  inputTokens: number;
  outputTokens: number;
  cacheCreation: number;
  cacheRead: number;
  costEstimate: number; // in USD
}

export interface UsageData {
  last5h: UsageStats;
  today: UsageStats;
  week: UsageStats;
  loading: boolean;
}

interface DirEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number | null;
  mtime: number | null;
}

function emptyStats(): UsageStats {
  return {
    inputTokens: 0,
    outputTokens: 0,
    cacheCreation: 0,
    cacheRead: 0,
    costEstimate: 0,
  };
}

function addStats(target: UsageStats, source: UsageStats) {
  target.inputTokens += source.inputTokens;
  target.outputTokens += source.outputTokens;
  target.cacheCreation += source.cacheCreation;
  target.cacheRead += source.cacheRead;
  target.costEstimate += source.costEstimate;
}

/**
 * Rough cost estimate based on Claude pricing.
 * Input: $3/M tokens, Output: $15/M tokens
 * Cache creation: $3.75/M, Cache read: $0.30/M
 */
function estimateCost(stats: UsageStats): number {
  return (
    (stats.inputTokens * 3 +
      stats.outputTokens * 15 +
      stats.cacheCreation * 3.75 +
      stats.cacheRead * 0.3) /
    1_000_000
  );
}

/**
 * Parse a single Claude JSONL for usage entries with timestamps.
 */
async function parseJsonlUsage(
  filePath: string
): Promise<{ ts: number; stats: UsageStats }[]> {
  try {
    const content: string = await invoke("read_text_file", { path: filePath });
    const lines = content.split("\n").filter((l) => l.trim());
    const results: { ts: number; stats: UsageStats }[] = [];

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);
        if (entry.type === "assistant" && entry.message?.usage) {
          const u = entry.message.usage;
          const ts = entry.timestamp
            ? new Date(entry.timestamp).getTime()
            : Date.now();
          const stats: UsageStats = {
            inputTokens: u.input_tokens || 0,
            outputTokens: u.output_tokens || 0,
            cacheCreation: u.cache_creation_input_tokens || 0,
            cacheRead: u.cache_read_input_tokens || 0,
            costEstimate: 0,
          };
          stats.costEstimate = estimateCost(stats);
          results.push({ ts, stats });
        }
      } catch {
        // skip malformed lines
      }
    }
    return results;
  } catch {
    return [];
  }
}

/**
 * Munge directory path for Claude project folder.
 */
function mungePath(dir: string): string {
  return dir.replace(/[\/\\]/g, "-");
}

export function useAgentUsage() {
  const last5h = ref<UsageStats>(emptyStats());
  const today = ref<UsageStats>(emptyStats());
  const week = ref<UsageStats>(emptyStats());
  const loading = ref(false);
  const workspace = useWorkspaceStore();

  async function load() {
    if (!workspace.path) {
      last5h.value = emptyStats();
      today.value = emptyStats();
      week.value = emptyStats();
      return;
    }

    loading.value = true;

    try {
      const home =
        (await invoke<string>("get_home_dir").catch(() => "")) || "";
      const munged = mungePath(workspace.path);
      const sessionsDir = `${home}/.claude/projects/${munged}`;

      const entries: DirEntry[] = await invoke("list_dir", { path: sessionsDir });
      const jsonlFiles = entries.filter(
        (e) => !e.is_dir && e.name.endsWith(".jsonl")
      );

      const now = Date.now();
      const fiveHoursAgo = now - 5 * 60 * 60 * 1000;
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayMs = todayStart.getTime();
      const weekStart = new Date(todayStart);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      const weekMs = weekStart.getTime();

      const result5h = emptyStats();
      const resultToday = emptyStats();
      const resultWeek = emptyStats();

      // Parse all files (up to 50)
      for (const file of jsonlFiles.slice(0, 50)) {
        const entries = await parseJsonlUsage(file.path);
        for (const { ts, stats } of entries) {
          if (ts >= fiveHoursAgo) addStats(result5h, stats);
          if (ts >= todayMs) addStats(resultToday, stats);
          if (ts >= weekMs) addStats(resultWeek, stats);
        }
      }

      result5h.costEstimate = estimateCost(result5h);
      resultToday.costEstimate = estimateCost(resultToday);
      resultWeek.costEstimate = estimateCost(resultWeek);

      last5h.value = result5h;
      today.value = resultToday;
      week.value = resultWeek;
    } catch {
      last5h.value = emptyStats();
      today.value = emptyStats();
      week.value = emptyStats();
    } finally {
      loading.value = false;
    }
  }

  // Auto-reload when workspace changes
  watch(() => workspace.path, load, { immediate: true });

  return { last5h, today, week, loading, load };
}
