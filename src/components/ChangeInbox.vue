<template>
  <div class="change-inbox" v-if="workspaceStore.changeHistory.length > 0">
    <div class="change-inbox-header">
      <span class="change-inbox-title">收 变更收件箱</span>
      <span class="change-inbox-count">{{ workspaceStore.inboxCount }}</span>
      <button class="change-inbox-clear" @click="workspaceStore.clearInbox()"><TIcon name="close" :size="14" /></button>
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
import { timeAgo } from "../utils/format";

const workspaceStore = useWorkspaceStore();

function typeIcon(type: string): string {
  switch (type) {
    case "created": return "+";
    case "modified": return "改";
    case "deleted": return "close";
    default: return "•";
  }
}

function handleClick(filePath: string) {
  workspaceStore.selectFile(filePath);
}
</script>
