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

    <!-- Compression result -->
    <div v-if="compressedPrefix" class="context-prefix">
      <div class="context-prefix-header">
        <span class="context-prefix-label">上下文前缀</span>
        <button class="context-prefix-close" @click="compressedPrefix = ''">✕</button>
      </div>
      <div class="context-prefix-text">{{ compressedPrefix }}</div>
    </div>

    <!-- Store confirmation -->
    <div v-if="storeStatus" class="context-store-status" :class="storeStatus">
      {{ storeStatusText }}
    </div>

    <!-- Existing summary -->
    <div v-if="chatStore.compressedSummary" class="context-summary">
      <span class="context-summary-label">摘要:</span>
      <span class="context-summary-text">{{ chatStore.compressedSummary }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { useChatStore } from "../stores/chat";

const chatStore = useChatStore();
const compressedPrefix = ref("");
const storeStatus = ref<"" | "storing" | "success" | "error">("");

const storeStatusText = computed(() => {
  switch (storeStatus.value) {
    case "storing": return "保存中...";
    case "success": return "已保存压缩摘要";
    case "error": return "保存失败";
    default: return "";
  }
});

const progressPercent = computed(() => {
  return Math.min(100, (chatStore.tokenEstimate / chatStore.TOKEN_THRESHOLD) * 100);
});

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

async function handleCompress() {
  // Get context prefix
  try {
    const prefix: string = await invoke("get_context_prefix");
    if (prefix) {
      compressedPrefix.value = prefix;
    }
  } catch {
    // get_context_prefix not available, fall through to manual compress
  }

  // Run compression
  const summary = await chatStore.manualCompress();
  if (summary) {
    // Store the compressed summary
    storeStatus.value = "storing";
    try {
      await invoke("store_compressed_summary", { summary });
      storeStatus.value = "success";
      setTimeout(() => { storeStatus.value = ""; }, 3000);
    } catch {
      storeStatus.value = "error";
      setTimeout(() => { storeStatus.value = ""; }, 3000);
    }
  }
}
</script>

<style scoped>
.context-panel {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.context-bar {
  display: flex;
  align-items: center;
  gap: 8px;
}

.context-label {
  font-size: 11px;
  color: var(--text-muted, #888);
  white-space: nowrap;
}

.context-progress-track {
  flex: 1;
  height: 4px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 2px;
  overflow: hidden;
  min-width: 40px;
}

.context-progress-fill {
  height: 100%;
  background: var(--jade, #5ccfb8);
  border-radius: 2px;
  transition: width 0.3s;
}

.context-progress-fill.warning {
  background: #c9a85c;
}

.context-progress-fill.danger {
  background: #ff6464;
}

.context-tokens {
  font-size: 10px;
  color: var(--text-muted, #888);
  white-space: nowrap;
}

.context-compress-btn {
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-muted, #888);
  font-size: 10px;
  padding: 2px 8px;
  cursor: pointer;
  transition: background 0.15s;
  white-space: nowrap;
}

.context-compress-btn:hover:not(:disabled) {
  background: rgba(224, 176, 255, 0.1);
  color: var(--text-primary);
}

.context-compress-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.context-prefix {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 6px 8px;
  font-size: 11px;
}

.context-prefix-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.context-prefix-label {
  font-size: 10px;
  color: var(--text-muted, #888);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.context-prefix-close {
  background: none;
  border: none;
  color: var(--text-muted, #666);
  cursor: pointer;
  font-size: 10px;
  padding: 0 2px;
}

.context-prefix-close:hover {
  color: var(--text-primary);
}

.context-prefix-text {
  color: var(--text-primary);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 120px;
  overflow-y: auto;
  line-height: 1.4;
}

.context-store-status {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 3px;
  text-align: center;
}

.context-store-status.storing {
  color: var(--gold, #e0b0ff);
  background: rgba(224, 176, 255, 0.1);
}

.context-store-status.success {
  color: #50c878;
  background: rgba(80, 200, 120, 0.1);
}

.context-store-status.error {
  color: #ff6464;
  background: rgba(255, 100, 100, 0.1);
}

.context-summary {
  display: flex;
  align-items: flex-start;
  gap: 4px;
  font-size: 11px;
  padding: 4px 0;
}

.context-summary-label {
  color: var(--text-muted, #888);
  white-space: nowrap;
}

.context-summary-text {
  color: var(--text-primary);
  opacity: 0.8;
  line-height: 1.4;
  max-height: 80px;
  overflow-y: auto;
}
</style>
