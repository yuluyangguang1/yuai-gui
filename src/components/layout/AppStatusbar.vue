<template>
  <footer class="app-statusbar" role="status" aria-label="状态栏">
    <span class="statusbar-item">
      <span class="statusbar-dot" :class="statusClass" />
      {{ statusText }}
    </span>

    <span class="statusbar-item" v-if="workspace.hasWorkspace">
      {{ workspace.path }}
    </span>

    <span class="statusbar-spacer" />

    <span
      v-if="updateStore.updateAvailable"
      class="statusbar-item statusbar-update"
      title="点击打开下载页面"
      @click="openUpdateUrl"
    >
      ⬆ 更新可用: {{ updateStore.updateInfo?.latest }}
    </span>

    <span class="statusbar-item" v-if="chatStore.messages.length > 0">
      {{ chatStore.messages.length }} 条消息
    </span>

    <span class="statusbar-item">
      {{ agentsStore.activeAgent.chinese_name }} · {{ agentsStore.activeAgent.specialty }}
    </span>
  </footer>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useChatStore } from "../../stores/chat";
import { useWorkspaceStore } from "../../stores/workspace";
import { useAgentsStore } from "../../stores/agents";
import { useUpdateStore } from "../../stores/update";

const chatStore = useChatStore();
const workspace = useWorkspaceStore();
const agentsStore = useAgentsStore();
const updateStore = useUpdateStore();

const statusClass = computed(() => {
  switch (chatStore.phase) {
    case "thinking":
    case "generating":
    case "tool_call":
      return "busy";
    case "error":
      return "error";
    default:
      return "idle";
  }
});

const statusText = computed(() => {
  switch (chatStore.phase) {
    case "thinking":
      return "思考中...";
    case "generating":
      return "生成中...";
    case "tool_call":
      return "工具调用...";
    case "error":
      return "错误";
    default:
      return "就绪";
  }
});

function openUpdateUrl() {
  const url = updateStore.updateInfo?.url;
  if (url) {
    window.open(url, "_blank");
  }
}
</script>

<style scoped>
.statusbar-update {
  color: var(--jade, #5ccfb8);
  cursor: pointer;
  font-weight: 600;
}

.statusbar-update:hover {
  text-decoration: underline;
}
</style>
