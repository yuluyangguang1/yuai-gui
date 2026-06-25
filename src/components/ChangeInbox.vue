<template>
  <div class="change-inbox" v-if="workspaceStore.changeHistory.length > 0">
    <div class="change-inbox-header">
      <span class="change-inbox-title">📬 变更收件箱</span>
      <span class="change-inbox-count">{{ workspaceStore.inboxCount }}</span>
      <button class="change-inbox-clear" @click="workspaceStore.clearInbox()">✕</button>
    </div>
    <div class="change-inbox-list">
      <div
        v-for="entry in workspaceStore.changeHistory"
        :key="`${entry.filePath}-${entry.timestamp}`"
        class="change-inbox-item"
        :class="entry.changeType"
        @click="handleClick(entry.filePath)"
      >
        <span class="change-inbox-type">{{ typeIcon(entry.changeType) }}</span>
        <span class="change-inbox-name">{{ entry.fileName }}</span>
        <span class="change-inbox-time">{{ timeAgo(entry.timestamp) }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useWorkspaceStore } from "../stores/workspace";

const workspaceStore = useWorkspaceStore();

function typeIcon(type: string): string {
  switch (type) {
    case "created": return "✨";
    case "modified": return "📝";
    case "deleted": return "🗑";
    default: return "•";
  }
}

function timeAgo(ts: number): string {
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 5) return "刚刚";
  if (seconds < 60) return `${seconds}秒前`;
  return `${Math.floor(seconds / 60)}分钟前`;
}

function handleClick(filePath: string) {
  workspaceStore.selectFile(filePath);
}
</script>
