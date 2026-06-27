/**
 * Usage Store — inspired by Codex Tracker
 * Aggregate-only usage tracking via Tauri invoke to SQLite backend.
 * Never stores message content — only token counts, costs, and durations.
 */

import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { estimateCost } from '../utils/pricing';

// ══════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════

export interface UsageSession {
  id?: number;
  session_id: string;
  model: string;
  provider: string;
  input_tokens: number;
  output_tokens: number;
  cost: number;
  duration_ms: number;
  timestamp: number;
}

export interface ModelAggregate {
  model: string;
  provider: string;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cost: number;
  session_count: number;
}

export interface ProviderAggregate {
  provider: string;
  total_tokens: number;
  total_cost: number;
  session_count: number;
}

export interface UsageStats {
  total_input_tokens: number;
  total_output_tokens: number;
  total_cost: number;
  total_sessions: number;
  by_model: ModelAggregate[];
  by_provider: ProviderAggregate[];
}

// ══════════════════════════════════════════════
// Store
// ══════════════════════════════════════════════

export const useUsageStore = defineStore('usage', () => {
  const stats = ref<UsageStats | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  const totalCost = computed(() => stats.value?.total_cost ?? 0);
  const totalTokens = computed(() =>
    (stats.value?.total_input_tokens ?? 0) + (stats.value?.total_output_tokens ?? 0)
  );
  const totalSessions = computed(() => stats.value?.total_sessions ?? 0);

  /**
   * Record usage for a completed session.
   * Cost is calculated automatically if not provided.
   */
  async function recordUsage(params: {
    sessionId: string;
    model: string;
    provider: string;
    inputTokens: number;
    outputTokens: number;
    durationMs: number;
    cost?: number;
  }): Promise<void> {
    const cost = params.cost ?? estimateCost(params.inputTokens, params.outputTokens, params.model, params.provider).totalCost;

    try {
      await invoke('record_usage', {
        record: {
          session_id: params.sessionId,
          model: params.model,
          provider: params.provider,
          input_tokens: params.inputTokens,
          output_tokens: params.outputTokens,
          cost,
          duration_ms: params.durationMs,
          timestamp: Date.now(),
        },
      });
    } catch (e) {
      error.value = String(e);
      console.error('[Usage] Failed to record:', e);
    }
  }

  /**
   * Fetch aggregate stats from backend.
   */
  async function fetchStats(): Promise<void> {
    loading.value = true;
    error.value = null;
    try {
      const result = await invoke<UsageStats>('get_usage_stats');
      stats.value = result;
    } catch (e) {
      error.value = String(e);
      console.error('[Usage] Failed to fetch stats:', e);
    } finally {
      loading.value = false;
    }
  }

  /**
   * Fetch per-model breakdown.
   */
  async function fetchByModel(): Promise<ModelAggregate[]> {
    try {
      return await invoke<ModelAggregate[]>('get_usage_by_model');
    } catch (e) {
      error.value = String(e);
      return [];
    }
  }

  /**
   * Fetch per-provider breakdown.
   */
  async function fetchByProvider(): Promise<ProviderAggregate[]> {
    try {
      return await invoke<ProviderAggregate[]>('get_usage_by_provider');
    } catch (e) {
      error.value = String(e);
      return [];
    }
  }

  return {
    stats,
    loading,
    error,
    totalCost,
    totalTokens,
    totalSessions,
    recordUsage,
    fetchStats,
    fetchByModel,
    fetchByProvider,
  };
});
