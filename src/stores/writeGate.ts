import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { invoke } from "@tauri-apps/api/core";

export interface PendingWriteRecord {
  id: string;
  subsystem: string; // "memory" | "skills"
  action: string;
  summary: string;
  origin: string;
  created_at: number | null;
  payload: Record<string, any>;
}

export interface PendingWriteReviewNote {
  type: string;
  target_label?: string;
  skill_name?: string;
}

export interface PendingWriteReview {
  subsystem: string;
  target_label: string;
  language: string;
  current: string;
  proposed: string;
  diff: string;
  requested_old_string?: string;
  payload_text?: string;
  notes: PendingWriteReviewNote[];
}

export interface PendingWritesResponse {
  records: PendingWriteRecord[];
  counts: Record<string, number>;
  supported?: boolean;
}

export const useWriteGateStore = defineStore("writeGate", () => {
  const records = ref<PendingWriteRecord[]>([]);
  const counts = ref<Record<string, number>>({});
  const supported = ref(true);
  const loading = ref(false);
  const activeAction = ref(""); // "id:diff" | "id:approve" | "id:reject"
  const expandedReviews = ref<Record<string, PendingWriteReview>>({});

  const pendingCount = computed(() => records.value.length);

  function recordKey(r: PendingWriteRecord): string {
    return `${r.subsystem}:${r.id}`;
  }

  async function fetchPending() {
    loading.value = true;
    try {
      const data: PendingWritesResponse = await invoke("write_gate_list");
      supported.value = data.supported !== false;
      records.value = supported.value ? data.records || [] : [];
      counts.value = data.counts || {};
    } catch (e: any) {
      console.error("Failed to fetch pending writes:", e);
      supported.value = false;
    } finally {
      loading.value = false;
    }
  }

  async function fetchReview(record: PendingWriteRecord): Promise<PendingWriteReview> {
    const key = recordKey(record);
    activeAction.value = `${key}:diff`;
    try {
      const review: PendingWriteReview = await invoke("write_gate_diff", {
        subsystem: record.subsystem,
        id: record.id,
      });
      expandedReviews.value = { ...expandedReviews.value, [key]: review };
      return review;
    } finally {
      activeAction.value = "";
    }
  }

  function toggleReview(record: PendingWriteRecord) {
    const key = recordKey(record);
    if (expandedReviews.value[key]) {
      const next = { ...expandedReviews.value };
      delete next[key];
      expandedReviews.value = next;
    } else {
      fetchReview(record);
    }
  }

  async function approve(record: PendingWriteRecord) {
    const key = recordKey(record);
    activeAction.value = `${key}:approve`;
    try {
      await invoke("write_gate_approve", {
        subsystem: record.subsystem,
        id: record.id,
      });
      // Remove from expanded
      const next = { ...expandedReviews.value };
      delete next[key];
      expandedReviews.value = next;
      await fetchPending();
    } finally {
      activeAction.value = "";
    }
  }

  async function reject(record: PendingWriteRecord) {
    const key = recordKey(record);
    activeAction.value = `${key}:reject`;
    try {
      await invoke("write_gate_reject", {
        subsystem: record.subsystem,
        id: record.id,
      });
      const next = { ...expandedReviews.value };
      delete next[key];
      expandedReviews.value = next;
      await fetchPending();
    } finally {
      activeAction.value = "";
    }
  }

  function formatTime(value: number | null): string {
    if (!value) return "";
    return new Date(value * 1000).toLocaleString([], {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  return {
    records,
    counts,
    supported,
    loading,
    activeAction,
    expandedReviews,
    pendingCount,
    recordKey,
    fetchPending,
    fetchReview,
    toggleReview,
    approve,
    reject,
    formatTime,
  };
});
