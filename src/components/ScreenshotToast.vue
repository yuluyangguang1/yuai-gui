<template>
  <Teleport to="body">
    <Transition name="screenshot-toast">
      <div v-if="visible" class="screenshot-toast" @mouseenter="pauseDismiss" @mouseleave="resumeDismiss">
        <div class="screenshot-toast-header">
          <TIcon name="camera" :size="20" />
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
import { formatSize } from '../utils/format';

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
let isHovering = ref(false);

const formattedSize = computed(() => {
  if (!info.value) return '';
  return formatSize(info.value.size);
});

async function showToast(screenshotInfo: ScreenshotInfo) {
  info.value = screenshotInfo;
  thumbnailUrl.value = null;
  visible.value = true;

  try {
    const thumb = await invoke<string | null>('get_thumbnail', {
      path: screenshotInfo.path,
      width: 200,
    });
    thumbnailUrl.value = thumb;
  } catch {
    thumbnailUrl.value = null;
  }

  if (!isHovering.value) {
    resetDismissTimer();
  }
}

function resetDismissTimer() {
  if (dismissTimer) clearTimeout(dismissTimer);
  dismissTimer = setTimeout(() => {
    dismiss();
  }, 10000);
}

function pauseDismiss() {
  isHovering.value = true;
  if (dismissTimer) clearTimeout(dismissTimer);
}

function resumeDismiss() {
  isHovering.value = false;
  if (visible.value) resetDismissTimer();
}

function dismiss() {
  visible.value = false;
  info.value = null;
  thumbnailUrl.value = null;
  isHovering.value = false;
  if (dismissTimer) {
    clearTimeout(dismissTimer);
    dismissTimer = null;
  }
}

function feedToTerminal() {
  if (!info.value) return;
  invoke('pty_write', {
    id: 0,
    data: info.value.path + '\n',
  }).catch(() => {
    navigator.clipboard.writeText(info.value!.path).catch(() => {});
  });
  dismiss();
}

async function saveToMaterial() {
  if (!info.value) return;
  const workspacePath = workspace.path;
  if (!workspacePath) {
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
    // silent
  }
  dismiss();
}

onMounted(async () => {
  unlisten = await listen<ScreenshotInfo>('screenshot-detected', (event) => {
    showToast(event.payload);
  });
});

onUnmounted(() => {
  if (unlisten) unlisten();
  if (dismissTimer) clearTimeout(dismissTimer);
});
</script>

<style scoped>
/* unchanged */
.screenshot-toast {
  position: fixed;
  bottom: 24px;
  right: 24px;
  width: 340px;
  background: var(--bg-elevated, #1a1a2e);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
  overflow: hidden;
  font-size: 13px;
  color: var(--text-secondary, #c0c0c0);
  z-index: 10001;
}
.screenshot-toast-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: rgba(255, 255, 255, 0.04);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}
.screenshot-toast-icon {
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.12);
  border-radius: 6px;
  font-size: 12px;
}
.screenshot-toast-title {
  font-weight: 600;
  flex: 1;
}
.screenshot-toast-close {
  background: none;
  border: none;
  color: inherit;
  font-size: 16px;
  cursor: pointer;
  opacity: 0.7;
}
.screenshot-toast-close:hover {
  opacity: 1;
}
.screenshot-toast-body {
  display: flex;
  gap: 12px;
  padding: 12px;
}
.screenshot-preview img {
  width: 80px;
  height: 60px;
  object-fit: cover;
  border-radius: 6px;
  background: black;
}
.screenshot-info {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
}
.screenshot-name {
  font-weight: 500;
}
.screenshot-size {
  color: var(--text-muted, #888);
  font-size: 12px;
}
.screenshot-toast-actions {
  display: flex;
  gap: 8px;
  padding: 8px 12px 12px;
}
.screenshot-btn {
  flex: 1;
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
  color: inherit;
  cursor: pointer;
  font-size: 12px;
}
.screenshot-btn.primary {
  background: rgba(92, 207, 184, 0.2);
  border-color: rgba(92, 207, 184, 0.4);
}
.screenshot-slide-enter-active,
.screenshot-slide-leave-active {
  transition: opacity 0.2s var(--ease-spring-fast), transform 0.2s var(--ease-spring-fast);
}
.screenshot-slide-enter-from,
.screenshot-slide-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
