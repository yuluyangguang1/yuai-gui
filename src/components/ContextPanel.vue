<template>
  <div class="context-panel">
    <div class="context-bar">
      <span class="context-label">上下文</span>
      <div class="context-progress-track">
        <div
          class="context-progress-fill"
          :style="{ width: progressPercent + '%' }"
          :class="{ warning: progressPercent > 70, danger: progressPercent > 90 }"
        />
      </div>
      <span class="context-tokens">{{ formatTokens(chatStore.tokenEstimate) }} / {{ formatTokens(chatStore.TOKEN_THRESHOLD) }}</span>
      <button
        class="context-compress-btn"
        :disabled="chatStore.tokenEstimate < 1000"
        @click="handleCompress"
        title="手动压缩上下文"
      >
        压缩
      </button>
    </div>
    <div v-if="chatStore.compressedSummary" class="context-summary">
      <span class="context-summary-label">摘要:</span>
      <span class="context-summary-text">{{ chatStore.compressedSummary }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useChatStore } from "../stores/chat";

const chatStore = useChatStore();

const progressPercent = computed(() => {
  return Math.min(100, (chatStore.tokenEstimate / chatStore.TOKEN_THRESHOLD) * 100);
});

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

async function handleCompress() {
  await chatStore.manualCompress();
}
</script>
