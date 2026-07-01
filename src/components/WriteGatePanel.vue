<template>
  <div class="wg-panel">
    <div class="wg-header">
      <span class="wg-title">审 写入审批</span>
      <button class="wg-refresh" :disabled="store.loading" @click="store.fetchPending()">
        <TIcon name="refresh" :size="14" :class="{ 'spin': store.loading }" />
      </button>
    </div>

    <div v-if="!store.supported" class="wg-empty">写入审批未启用</div>
    <div v-else-if="store.loading && !store.records.length" class="wg-empty">加载中…</div>
    <div v-else-if="!store.records.length" class="wg-empty">暂无待审批写入</div>

    <div v-else class="wg-list">
      <div v-for="rec in store.records" :key="store.recordKey(rec)" class="wg-card">
        <div class="wg-card-header" @click="store.toggleReview(rec)">
          <div class="wg-card-info">
            <span class="wg-subsystem">{{ rec.subsystem }}</span>
            <span class="wg-action">{{ rec.action }}</span>
          </div>
          <span class="wg-time">{{ store.formatTime(rec.created_at) }}</span>
        </div>
        <div class="wg-summary">{{ rec.summary }}</div>
        <div class="wg-origin">来源: {{ rec.origin }}</div>

        <!-- Expanded diff review -->
        <div v-if="store.expandedReviews[store.recordKey(rec)]" class="wg-review">
          <div class="wg-diff-label">
            {{ store.expandedReviews[store.recordKey(rec)].target_label }}
          </div>
          <pre class="wg-diff">{{ store.expandedReviews[store.recordKey(rec)].diff }}</pre>
        </div>

        <div class="wg-actions">
          <button
            class="wg-btn wg-btn-approve"
            :disabled="!!store.activeAction"
            @click.stop="store.approve(rec)"
          >
            <TIcon name="check" :size="14" /> 批准
          </button>
          <button
            class="wg-btn wg-btn-reject"
            :disabled="!!store.activeAction"
            @click.stop="store.reject(rec)"
          >
            <TIcon name="close" :size="14" /> 拒绝
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { TIcon } from "../utils/icons";
import { useWriteGateStore } from '../stores/writeGate';

const store = useWriteGateStore();
onMounted(() => store.fetchPending());
</script>

<style scoped>
.wg-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-y: auto;
  padding: 12px;
  gap: 10px;
}

.wg-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.wg-title {
  font-family: var(--font-brush);
  font-size: 1.2rem;
  color: var(--gold);
}

.wg-refresh {
  background: none;
  border: 1px solid var(--border);
  color: var(--text-secondary);
  border-radius: var(--radius-sm);
  padding: 2px 8px;
  cursor: pointer;
  font-size: 0.85rem;
}
.wg-refresh:hover { border-color: var(--accent); color: var(--accent); }

.wg-empty {
  color: var(--text-muted);
  font-size: 0.78rem;
  text-align: center;
  padding: 40px 0;
}

.wg-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.wg-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  padding: 10px 12px;
  transition: border-color var(--transition-fast);
}
.wg-card:hover { border-color: var(--border); }

.wg-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  margin-bottom: 4px;
}

.wg-card-info {
  display: flex;
  gap: 8px;
  align-items: center;
}

.wg-subsystem {
  font-size: 0.68rem;
  background: var(--bg-surface);
  color: var(--accent);
  padding: 1px 6px;
  border-radius: var(--radius-sm);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.wg-action {
  font-size: 0.78rem;
  color: var(--text-primary);
  font-weight: 500;
}

.wg-time {
  font-size: 0.68rem;
  color: var(--text-muted);
}

.wg-summary {
  font-size: 0.75rem;
  color: var(--text-secondary);
  margin-bottom: 2px;
}

.wg-origin {
  font-size: 0.68rem;
  color: var(--text-muted);
  margin-bottom: 6px;
}

.wg-review {
  margin: 6px 0;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.wg-diff-label {
  font-size: 0.68rem;
  color: var(--gold);
  background: var(--bg-surface);
  padding: 4px 8px;
}

.wg-diff {
  font-family: var(--font-mono);
  font-size: 0.7rem;
  color: var(--text-secondary);
  background: var(--bg-primary);
  padding: 8px;
  margin: 0;
  overflow-x: auto;
  white-space: pre;
  max-height: 240px;
  overflow-y: auto;
  line-height: 1.4;
}

.wg-actions {
  display: flex;
  gap: 8px;
  margin-top: 6px;
}

.wg-btn {
  flex: 1;
  padding: 5px 0;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  font-size: 0.75rem;
  cursor: pointer;
  background: var(--bg-surface);
  color: var(--text-primary);
  transition: all var(--transition-fast);
}
.wg-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.wg-btn-approve { border-color: rgba(92, 207, 184, 0.3); color: var(--accent); }
.wg-btn-approve:hover:not(:disabled) { background: rgba(34, 197, 94, 0.15); }

.wg-btn-reject { border-color: rgba(239, 68, 68, 0.3); color: var(--error); }
.wg-btn-reject:hover:not(:disabled) { background: rgba(239, 68, 68, 0.15); }
</style>
