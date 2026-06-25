<template>
  <div class="project-memory" v-if="sessions.length > 0 || loading">
    <div class="project-memory-header">
      <span class="project-memory-title">🧠 AI 历史</span>
      <span class="project-memory-count" v-if="sessions.length > 0">{{ sessions.length }}</span>
    </div>
    <div v-if="loading" class="project-memory-loading">加载中...</div>
    <div v-else class="project-memory-list">
      <div
        v-for="session in visibleSessions"
        :key="session.id"
        class="project-memory-item"
        :class="{ expanded: expandedId === session.id }"
        @click="toggleExpand(session.id)"
      >
        <div class="project-memory-item-row">
          <span class="project-memory-agent" :class="session.agent">
            {{ session.agent === "claude" ? "梅" : "兰" }}
          </span>
          <span class="project-memory-item-title">{{ session.title }}</span>
        </div>
        <div class="project-memory-item-meta">
          <span v-if="session.filesChanged > 0">{{ session.filesChanged }} 文件</span>
          <span>{{ timeAgo(session.timestamp) }}</span>
        </div>
        <div v-if="expandedId === session.id" class="project-memory-detail">
          <div v-if="session.inputTokens > 0" class="project-memory-detail-row">
            <span>输入 Token:</span>
            <span>{{ formatNumber(session.inputTokens) }}</span>
          </div>
          <div v-if="session.outputTokens > 0" class="project-memory-detail-row">
            <span>输出 Token:</span>
            <span>{{ formatNumber(session.outputTokens) }}</span>
          </div>
        </div>
      </div>
      <button
        v-if="sessions.length > maxVisible && !showAll"
        class="project-memory-more"
        @click="showAll = true"
      >
        显示更多 ({{ sessions.length - maxVisible }})
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useProjectMemory } from "../composables/useProjectMemory";

const { sessions, loading } = useProjectMemory();
const expandedId = ref<string | null>(null);
const showAll = ref(false);
const maxVisible = 8;

const visibleSessions = computed(() =>
  showAll.value ? sessions.value : sessions.value.slice(0, maxVisible)
);

function toggleExpand(id: string) {
  expandedId.value = expandedId.value === id ? null : id;
}

function timeAgo(ts: number): string {
  if (!ts) return "";
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 60) return "刚刚";
  if (seconds < 3600) return `${Math.floor(seconds / 60)}分钟前`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}小时前`;
  const days = Math.floor(seconds / 86400);
  if (days < 7) return `${days}天前`;
  return `${Math.floor(days / 7)}周前`;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
</script>
