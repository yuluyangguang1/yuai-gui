<template>
  <Teleport to="body">
    <Transition name="screenshot-toast">
      <div v-if="visible" class="screenshot-toast" @mouseenter="pauseDismiss" @mouseleave="resumeDismiss">
        <div class="screenshot-toast-header">
          <span class="screenshot-toast-icon">📸</span>
          <span class="screenshot-toast-title">截图检测</span>
          <button class="screenshot-toast-close" @click="dismiss">×</button>
        </div>
        <div class="screenshot-toast-body">
          <div class="screenshot-preview" v-if="thumbnailUrl">
            <img :src="thumbnailUrl" alt="screenshot preview" />
          </div>
          <div class="screenshot-info">
            <div class="screenshot-name">{{ info?.name }}</div>
            <div class="screenshot-size">{{ formattedSize }}</div>
          </div>
        </div>
        <div class="screenshot-toast-actions">
          <button class="screenshot-btn primary" @click="feedToTerminal">喂给终端</button>
          <button class="screenshot-btn" @click="saveToMaterial">保存到素材</button>
          <button class="screenshot-btn" @click="dismiss">关闭</button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { useWorkspaceStore } from '../stores/workspace';

interface ScreenshotInfo {
  path: string;
  name: string;
  size: number;
}

const workspace = useWorkspaceStore();

const visible = ref(false);
const info = ref<ScreenshotInfo | null>(null);
const thumbnailUrl = ref<string | null>(null);
let dismissTimer: ReturnType<typeof setTimeout> | null = null;
let unlisten: UnlistenFn | null = null;

const formattedSize = computed(() => {
  if (!info.value) return '';
  const bytes = info.value.size;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
});

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function showToast(screenshotInfo: ScreenshotInfo) {
  info.value = screenshotInfo;
  thumbnailUrl.value = null;
  visible.value = true;

  // Load thumbnail
  try {
    const thumb = await invoke<string | null>('get_thumbnail', {
      path: screenshotInfo.path,
      width: 200,
    });
    thumbnailUrl.value = thumb;
  } catch {
    thumbnailUrl.value = null;
  }

  // Auto-dismiss after 10 seconds
  resetDismissTimer();
}

function resetDismissTimer() {
  if (dismissTimer) clearTimeout(dismissTimer);
  dismissTimer = setTimeout(() => {
    dismiss();
  }, 10000);
}

function pauseDismiss() {
  if (dismissTimer) clearTimeout(dismissTimer);
}

function resumeDismiss() {
  resetDismissTimer();
}

function dismiss() {
  visible.value = false;
  info.value = null;
  thumbnailUrl.value = null;
  if (dismissTimer) {
    clearTimeout(dismissTimer);
    dismissTimer = null;
  }
}

function feedToTerminal() {
  if (!info.value) return;
  // Write the file path to the active terminal
  // We'll use the PTY write mechanism
  invoke('pty_write', {
    id: 0, // active terminal
    data: info.value.path + '\n',
  }).catch(() => {
    // Fallback: copy to clipboard
    navigator.clipboard.writeText(info.value!.path).catch(() => {});
  });
  dismiss();
}

async function saveToMaterial() {
  if (!info.value) return;
  const workspacePath = workspace.path;
  if (!workspacePath) {
    // No workspace open, just copy to clipboard
    navigator.clipboard.writeText(info.value.path).catch(() => {});
    dismiss();
    return;
  }
  try {
    await invoke('copy_file_to_workspace', {
      srcPath: info.value.path,
      destDir: workspacePath + '/素材',
    });
  } catch {
    // Silent fail
  }
  dismiss();
}

onMounted(async () => {
  unlisten = await listen<ScreenshotInfo>('screenshot-detected', (event) => {
    showToast(event.payload);
  });
});

onUnmounted(() => {
  unlisten?.();
  if (dismissTimer) clearTimeout(dismissTimer);
});
</script>

<style scoped>
.screenshot-toast {
  position: fixed;
  bottom: 24px;
  right: 24px;
  width: 320px;
  background: rgba(24, 24, 32, 0.92);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  z-index: 9999;
  overflow: hidden;
  color: var(--silver, #c0c0c0);
  font-size: 13px;
}

.screenshot-toast-header {
  display: flex;
  align-items: center;
  padding: 10px 12px;
  gap: 8px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.screenshot-toast-icon {
  font-size: 16px;
}

.screenshot-toast-title {
  flex: 1;
  font-weight: 500;
  color: var(--jade, #5ccfb8);
  font-size: 12px;
  letter-spacing: 0.04em;
}

.screenshot-toast-close {
  background: none;
  border: none;
  color: var(--ink-muted, #666);
  cursor: pointer;
  font-size: 18px;
  line-height: 1;
  padding: 0 4px;
  transition: color 0.15s;
}

.screenshot-toast-close:hover {
  color: var(--silver, #c0c0c0);
}

.screenshot-toast-body {
  display: flex;
  align-items: center;
  padding: 12px;
  gap: 12px;
}

.screenshot-preview {
  width: 80px;
  height: 60px;
  border-radius: 6px;
  overflow: hidden;
  flex-shrink: 0;
  background: rgba(255, 255, 255, 0.04);
}

.screenshot-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.screenshot-info {
  min-width: 0;
}

.screenshot-name {
  font-weight: 500;
  color: var(--silver, #e0e0e0);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 4px;
}

.screenshot-size {
  font-size: 11px;
  color: var(--ink-muted, #888);
}

.screenshot-toast-actions {
  display: flex;
  gap: 8px;
  padding: 0 12px 12px;
}

.screenshot-btn {
  flex: 1;
  padding: 6px 10px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.04);
  color: var(--silver, #c0c0c0);
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s;
}

.screenshot-btn:hover {
  background: rgba(255, 255, 255, 0.08);
  border-color: rgba(255, 255, 255, 0.16);
}

.screenshot-btn.primary {
  background: rgba(92, 207, 184, 0.15);
  border-color: rgba(92, 207, 184, 0.3);
  color: var(--jade, #5ccfb8);
}

.screenshot-btn.primary:hover {
  background: rgba(92, 207, 184, 0.25);
}

/* Transition: slide up + fade in */
.screenshot-toast-enter-active {
  transition: all 0.35s cubic-bezier(0.16, 1, 0.3, 1);
}

.screenshot-toast-leave-active {
  transition: all 0.25s ease-in;
}

.screenshot-toast-enter-from {
  opacity: 0;
  transform: translateY(24px);
}

.screenshot-toast-leave-to {
  opacity: 0;
  transform: translateY(12px);
}
</style>
