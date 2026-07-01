<template>
  <Teleport to="body">
    <div class="toast-container" role="status" aria-live="polite" aria-label="通知">
      <TransitionGroup name="toast-slide">
        <div
          v-for="toast in toasts"
          :key="toast.id"
          class="toast-item"
          :class="'toast-' + toast.type"
          @click="dismiss(toast.id)"
        >
          <span class="toast-icon">{{ icons[toast.type] }}</span>
          <span class="toast-message">{{ toast.message }}</span>
          <button class="toast-close" @click.stop="dismiss(toast.id)"><TIcon name="close" :size="14" /></button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { useToast } from '../composables/useToast'
import { TIcon } from "../utils/icons";
import type { ToastType } from '../composables/useToast'

const { toasts, dismiss } = useToast()

const icons: Record<ToastType, string> = {
  success: 'check',
  error: 'close',
  warning: 'warning',
  info: 'info',
}
</script>

<style scoped>
.toast-container {
  position: fixed;
  bottom: 32px;
  right: 24px;
  display: flex;
  flex-direction: column-reverse;
  gap: 8px;
  z-index: 10000;
  pointer-events: none;
}

.toast-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  min-width: 240px;
  max-width: 360px;
  background: color-mix(in srgb, var(--bg-secondary, #1a1a2e) 92%, transparent);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  cursor: pointer;
  pointer-events: auto;
  font-size: 13px;
  color: var(--silver, #c0c0c0);
  transition: all 0.2s var(--ease-spring-fast);
}

.toast-item:hover {
  background: color-mix(in srgb, var(--bg-secondary, #1a1a2e) 96%, transparent);
}

.toast-icon {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  font-size: 12px;
  font-weight: 600;
}

.toast-success .toast-icon {
  background: rgba(92, 207, 184, 0.2);
  color: #5ccfb8;
}

.toast-error .toast-icon {
  background: rgba(255, 107, 107, 0.2);
  color: #ff6b6b;
}

.toast-warning .toast-icon {
  background: rgba(255, 217, 61, 0.2);
  color: #ffd93d;
}

.toast-info .toast-icon {
  background: rgba(130, 177, 255, 0.2);
  color: #82b1ff;
}

.toast-success {
  border-left: 3px solid #5ccfb8;
}

.toast-error {
  border-left: 3px solid #ff6b6b;
}

.toast-warning {
  border-left: 3px solid #ffd93d;
}

.toast-info {
  border-left: 3px solid #82b1ff;
}

.toast-message {
  flex: 1;
  line-height: 1.4;
  word-break: break-word;
}

.toast-close {
  flex-shrink: 0;
  background: none;
  border: none;
  color: var(--text-muted, #666);
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
  padding: 0 2px;
  transition: color 0.15s;
}

.toast-close:hover {
  color: var(--silver, #c0c0c0);
}

/* Transitions */
.toast-slide-enter-active {
  transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
}

.toast-slide-leave-active {
  transition: all 0.2s ease-in;
}

.toast-slide-enter-from {
  opacity: 0;
  transform: translateX(40px) scale(0.95);
}

.toast-slide-leave-to {
  opacity: 0;
  transform: translateX(40px) scale(0.95);
}

.toast-slide-move {
  transition: transform 0.3s var(--ease-spring-normal);
}
</style>
