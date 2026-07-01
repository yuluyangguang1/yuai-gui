<template>
  <div class="account-panel" role="region" aria-label="账户">
    <h2 class="account-title">账户</h2>

    <div class="account-card">
      <div class="account-avatar">
        <TIcon name="user" :size="32" />
      </div>
      <div class="account-info">
        <div class="account-name">{{ userName || '未设置' }}</div>
        <div class="account-id">设备: {{ deviceId || '未知' }}</div>
      </div>
    </div>

    <div class="account-section">
      <h3 class="account-section-title"><span class="section-icon"><TIcon name="infoCircle" :size="14" /></span><span class="section-label">基本信息</span></h3>
      <div class="account-rows">
        <div class="account-row">
          <span class="row-label">用户名</span>
          <span class="row-value">{{ userName || '未设置' }}</span>
        </div>
        <div class="account-row">
          <span class="row-label">设备 ID</span>
          <span class="row-value row-mono">{{ deviceId || '未知' }}</span>
        </div>
        <div class="account-row">
          <span class="row-label">版本</span>
          <span class="row-value">yuai v0.1.0</span>
        </div>
        <div class="account-row">
          <span class="row-label">操作系统</span>
          <span class="row-value">{{ platform }}</span>
        </div>
      </div>
    </div>

    <div class="account-section">
      <h3 class="account-section-title"><span class="section-icon"><TIcon name="cpu" :size="14" /></span><span class="section-label">系统状态</span></h3>
      <div class="account-rows">
        <div class="account-row">
          <span class="row-label">Agent 数量</span>
          <span class="row-value">{{ agentCount }} 个</span>
        </div>
        <div class="account-row">
          <span class="row-label">已配置供应商</span>
          <span class="row-value">{{ configuredProviders }} 个</span>
        </div>
        <div class="account-row">
          <span class="row-label">活跃任务</span>
          <span class="row-value">{{ activeTasks }} 个</span>
        </div>
        <div class="account-row">
          <span class="row-label">工作区</span>
          <span class="row-value row-path">{{ workspacePath || '未设置' }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { TIcon } from '../utils/icons';
import { invoke } from '@tauri-apps/api/core';
import { useAgentsStore } from '../stores/agents';
import { useWorkspaceStore } from '../stores/workspace';

const agentsStore = useAgentsStore();
const workspaceStore = useWorkspaceStore();

const userName = ref('');
const deviceId = ref('');
const platform = ref(navigator.platform || '未知');
const agentCount = computed(() => agentsStore.agents.length);
const configuredProviders = ref(0);
const activeTasks = ref(0);
const workspacePath = computed(() => workspaceStore.workspacePath || '');

onMounted(async () => {
  try { userName.value = await invoke('get_username') as string; } catch { /* ignore */ }
  try { deviceId.value = await invoke('get_device_id') as string; } catch { /* ignore */ }
});
</script>

<style scoped>
.account-panel {
  padding: 16px; height: 100%; overflow-y: auto;
  font-family: var(--font-body);
}
.account-title {
  font-family: var(--font-serif); font-size: .9rem;
  color: var(--text-primary); margin-bottom: 16px;
}

.account-card {
  display: flex; align-items: center; gap: 12px;
  padding: 16px; border-radius: 10px;
  background: var(--bg-surface); border: 1px solid var(--border-light);
  margin-bottom: 20px;
}
.account-avatar {
  width: 48px; height: 48px; border-radius: 50%;
  background: var(--bg-active); display: flex; align-items: center; justify-content: center;
  color: var(--accent);
}
.account-name {
  font-size: .82rem; color: var(--text-primary); font-weight: 600;
}
.account-id {
  font-size: .62rem; color: var(--silver); font-family: var(--font-mono); margin-top: 2px;
}

.account-section {
  margin-bottom: 20px;
}
.account-section-title {
  font-family: var(--font-serif); font-size: .75rem; color: var(--bone-dim);
  margin-bottom: 10px; display: inline-flex; align-items: center; gap: 6px;
}
.section-icon { display: inline-flex; align-items: center; line-height: 1; }
.section-label { line-height: 1; }

.account-rows {
  display: flex; flex-direction: column; gap: 6px;
  padding: 12px; border-radius: 8px;
  background: var(--bg-surface); border: 1px solid var(--border-light);
}
.account-row {
  display: flex; justify-content: space-between; align-items: center;
  font-size: .68rem; padding: 4px 0;
}
.row-label { color: var(--silver); }
.row-value { color: var(--bone); }
.row-mono { font-family: var(--font-mono); font-size: .62rem; opacity: .8; }
.row-path { font-family: var(--font-mono); font-size: .6rem; opacity: .7; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
