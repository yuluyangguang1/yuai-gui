<template>
  <Transition name="suggest">
    <div v-if="suggestions.length > 0" class="prompt-suggest">
      <div class="suggest-header">
        <TIcon name="sparkles" :size="14" />
        <span>提示词优化建议</span>
        <button class="suggest-close" @click="$emit('close')">
          <TIcon name="close" :size="12" />
        </button>
      </div>
      <div class="suggest-list">
        <div
          v-for="s in suggestions"
          :key="s.id"
          class="suggest-item"
          :class="s.type"
          @click="applySuggestion(s)"
        >
          <div class="suggest-icon">
            <TIcon :name="s.icon" :size="14" />
          </div>
          <div class="suggest-body">
            <div class="suggest-title">{{ s.title }}</div>
            <div class="suggest-desc">{{ s.description }}</div>
          </div>
          <button v-if="s.autoFix" class="suggest-apply" @click.stop="applyAutoFix(s)">
            <TIcon name="wand" :size="12" /> 自动修复
          </button>
        </div>
      </div>
      <div class="suggest-footer">
        <button class="suggest-enhance-btn" @click="$emit('enhance')">
          <TIcon name="sparkles" :size="14" /> 一键优化
        </button>
      </div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { TIcon } from '../utils/icons'
import type { PromptSuggestion } from '../utils/prompt-enhancer'

const props = defineProps<{
  suggestions: PromptSuggestion[]
}>()

const emit = defineEmits<{
  close: []
  apply: [suggestion: PromptSuggestion]
  enhance: []
  autoFix: [suggestion: PromptSuggestion]
}>()

function applySuggestion(s: PromptSuggestion) {
  emit('apply', s)
}

function applyAutoFix(s: PromptSuggestion) {
  emit('autoFix', s)
}
</script>

<style scoped>
.prompt-suggest {
  position: absolute;
  bottom: 100%;
  left: 0;
  right: 0;
  margin-bottom: 4px;
  background: var(--bg-surface);
  border: 1px solid var(--border-light);
  border-radius: 10px;
  box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.3);
  overflow: hidden;
  max-height: 240px;
  display: flex;
  flex-direction: column;
}

.suggest-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  font-size: 11px;
  color: var(--accent);
  border-bottom: 1px solid var(--border-light);
}

.suggest-close {
  margin-left: auto;
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 2px;
  display: flex;
  align-items: center;
}

.suggest-close:hover {
  color: var(--text-primary);
}

.suggest-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px;
}

.suggest-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
}

.suggest-item:hover {
  background: var(--bg-hover);
}

.suggest-icon {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  flex-shrink: 0;
}

.suggest-item.missing-context .suggest-icon {
  background: rgba(96, 165, 250, 0.15);
  color: #60a5fa;
}

.suggest-item.vague .suggest-icon {
  background: rgba(251, 191, 36, 0.15);
  color: #fbbf24;
}

.suggest-item.too-short .suggest-icon {
  background: rgba(251, 146, 60, 0.15);
  color: #fb923c;
}

.suggest-item.improve .suggest-icon {
  background: rgba(52, 211, 153, 0.15);
  color: #34d399;
}

.suggest-item.structure .suggest-icon {
  background: rgba(167, 139, 250, 0.15);
  color: #a78bfa;
}

.suggest-body {
  flex: 1;
  min-width: 0;
}

.suggest-title {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-primary);
  margin-bottom: 2px;
}

.suggest-desc {
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.4;
}

.suggest-apply {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 8px;
  font-size: 10px;
  background: var(--accent);
  color: var(--text-inverse);
  border: none;
  border-radius: 4px;
  cursor: pointer;
  opacity: 0.8;
  transition: opacity 0.15s;
}

.suggest-apply:hover {
  opacity: 1;
}

.suggest-footer {
  padding: 6px 8px;
  border-top: 1px solid var(--border-light);
  display: flex;
  justify-content: flex-end;
}

.suggest-enhance-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  font-size: 11px;
  background: var(--accent);
  color: var(--text-inverse);
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: opacity 0.15s;
}

.suggest-enhance-btn:hover {
  opacity: 0.9;
}

/* 动画 */
.suggest-enter-active,
.suggest-leave-active {
  transition: opacity 0.15s, transform 0.15s;
}

.suggest-enter-from,
.suggest-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
