<template>
  <div class="activation-panel">
    <div class="activation-header">
      <span class="activation-icon"><TIcon :name="activationStore.isActivated ? 'check' : 'circle'" :size="16" /></span>
      <span class="activation-title">{{ activationStore.isActivated ? '已激活' : '未激活' }}</span>
    </div>

    <div v-if="activationStore.isActivated" class="activation-active">
      <div class="activation-code-display">{{ activationStore.activationCode }}</div>
      <button class="deactivate-btn" @click="activationStore.deactivate()">取消激活</button>
    </div>

    <div v-else class="activation-inactive">
      <div v-if="error" class="activation-error">{{ error }}</div>
      <label>激活码</label>
      <input
        v-model="code"
        type="text"
        placeholder="YUAI-XXXX-XXXX-XXXX"
        maxlength="19"
        @input="formatCode"
        @keydown.enter="handleActivate"
      />
      <button class="activate-btn" @click="handleActivate" :disabled="!code.trim()">激活</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { TIcon } from "../utils/icons";
import { useActivationStore } from '../stores/activation';

const activationStore = useActivationStore();
const code = ref('');
const error = ref('');

function formatCode(e: Event) {
  // Auto-format with dashes: YUAI-XXXX-XXXX-XXXX
  let val = (e.target as HTMLInputElement).value.toUpperCase().replace(/[^A-Z0-9-]/g, '');
  // Remove existing dashes then re-add
  const clean = val.replace(/-/g, '');
  const parts = [
    clean.substring(0, 4),
    clean.substring(4, 8),
    clean.substring(8, 12),
    clean.substring(12, 16),
  ].filter(Boolean);
  code.value = parts.join('-');
}

function handleActivate() {
  error.value = '';
  const result = activationStore.activate(code.value);
  if (!result.ok) {
    error.value = result.error || '激活失败';
  } else {
    code.value = '';
  }
}
</script>

<style scoped>
.activation-panel {
  padding: 16px;
}
.activation-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}
.activation-icon {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  font-weight: 600;
  background: var(--jade);
  color: var(--bg-primary);
}
.activation-inactive .activation-icon {
  background: rgba(255,255,255,0.1);
  color: var(--silver);
}
.activation-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--bone);
}

.activation-active {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.activation-code-display {
  padding: 10px 14px;
  background: rgba(92,207,184,0.08);
  border: 1px solid rgba(92,207,184,0.2);
  border-radius: 6px;
  font-family: var(--font-mono);
  font-size: 13px;
  color: var(--jade);
  letter-spacing: 1px;
}
.deactivate-btn {
  align-self: flex-start;
  padding: 6px 14px;
  border: 1px solid rgba(255,80,80,0.3);
  border-radius: 6px;
  background: rgba(255,80,80,0.1);
  color: var(--vermilion-glow, #ff5050);
  font-size: 12px;
  cursor: pointer;
}
.deactivate-btn:hover {
  background: rgba(255,80,80,0.2);
}

.activation-inactive {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.activation-inactive label {
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--silver);
}
.activation-inactive input {
  padding: 8px 12px;
  background: var(--bg-surface);
  border: 1px solid var(--border-light);
  border-radius: 6px;
  color: var(--bone);
  font-family: var(--font-mono);
  font-size: 13px;
  letter-spacing: 1px;
  outline: none;
  transition: border-color 0.2s;
}
.activation-inactive input:focus {
  border-color: var(--jade);
}
.activate-btn {
  margin-top: 8px;
  padding: 8px;
  background: var(--jade-deep);
  border: none;
  border-radius: 6px;
  color: var(--bg-primary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s;
}
.activate-btn:hover:not(:disabled) {
  background: var(--jade);
}
.activate-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.activation-error {
  padding: 8px 12px;
  background: rgba(255,80,80,0.1);
  border: 1px solid rgba(255,80,80,0.2);
  border-radius: 6px;
  color: var(--vermilion-glow, #ff5050);
  font-size: 12px;
}
</style>
