<template>
  <div class="disk-usage">
    <div class="disk-header">
      <span class="disk-title">磁盘用量</span>
      <button class="disk-refresh" @click="refresh" :disabled="loading">
        ↻ 刷新
      </button>
    </div>
    <div v-if="loading" class="disk-empty">加载中...</div>
    <div v-else-if="error" class="disk-empty disk-error">{{ error }}</div>
    <template v-else-if="result">
      <div class="disk-total">
        <span class="disk-total-label">总计</span>
        <span class="disk-total-value">{{ formatSize(result.total_kb) }}</span>
      </div>
      <div class="disk-chart">
        <div
          v-for="item in result.items"
          :key="item.path"
          class="disk-bar-row"
        >
          <span class="disk-bar-name" :title="item.path">{{ item.name }}</span>
          <div class="disk-bar-track">
            <div
              class="disk-bar-fill"
              :style="{ width: barWidth(item.size_kb) }"
            />
          </div>
          <span class="disk-bar-size">{{ formatSize(item.size_kb) }}</span>
        </div>
      </div>
    </template>
    <div v-else class="disk-empty">请选择工作目录</div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { useWorkspaceStore } from "../stores/workspace";

interface DiskItem {
  name: string;
  path: string;
  size_kb: number;
}

interface DiskUsageResult {
  total_kb: number;
  items: DiskItem[];
}

const workspace = useWorkspaceStore();
const result = ref<DiskUsageResult | null>(null);
const loading = ref(false);
const error = ref("");

function formatSize(kb: number): string {
  if (kb < 1024) return `${kb} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
}

function barWidth(sizeKb: number): string {
  if (!result.value || result.value.items.length === 0) return "0%";
  const max = result.value.items[0].size_kb;
  if (max === 0) return "0%";
  return `${Math.max(1, (sizeKb / max) * 100)}%`;
}

async function refresh() {
  if (!workspace.path) {
    error.value = "请先打开工作目录";
    return;
  }
  loading.value = true;
  error.value = "";
  try {
    result.value = await invoke("get_disk_usage", { path: workspace.path });
  } catch (e) {
    error.value = String(e);
  } finally {
    loading.value = false;
  }
}

onMounted(() => {
  if (workspace.path) {
    refresh();
  }
});
</script>

<style scoped>
.disk-usage {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-y: auto;
  padding: 0 0 12px;
}

.disk-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.disk-title {
  font-size: 0.72rem;
  color: var(--jade, #5ccfb8);
  font-family: var(--font-brush);
}

.disk-refresh {
  font-size: 0.62rem;
  color: var(--silver, #887868);
  background: none;
  border: 1px solid rgba(255, 255, 255, 0.08);
  padding: 2px 8px;
  border-radius: 4px;
  cursor: pointer;
}

.disk-refresh:disabled {
  opacity: 0.5;
  cursor: default;
}

.disk-empty {
  padding: 24px;
  text-align: center;
  color: var(--silver, #887868);
  font-size: 0.7rem;
}

.disk-error {
  color: var(--vermilion-glow);
}

.disk-total {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.disk-total-label {
  font-size: 0.68rem;
  color: var(--silver, #887868);
}

.disk-total-value {
  font-size: 0.78rem;
  color: var(--jade, #5ccfb8);
  font-family: monospace;
  font-weight: 600;
}

.disk-chart {
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.disk-bar-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.disk-bar-name {
  font-size: 0.6rem;
  color: var(--silver, #887868);
  min-width: 60px;
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.disk-bar-track {
  flex: 1;
  height: 6px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 3px;
  overflow: hidden;
}

.disk-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--jade, #5ccfb8), rgba(92, 207, 184, 0.4));
  border-radius: 3px;
  transition: width 0.3s var(--ease-spring-fast);
  min-width: 2px;
}

.disk-bar-size {
  font-size: 0.58rem;
  color: var(--silver, #887868);
  font-family: monospace;
  min-width: 56px;
  text-align: right;
}
</style>
