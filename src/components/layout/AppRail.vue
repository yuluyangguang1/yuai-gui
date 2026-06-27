<template>
  <nav class="app-rail">
    <!-- Agent buttons -->
    <div class="rail-section">
      <button
        v-for="agent in agentsStore.agents"
        :key="agent.id"
        class="rail-agent-btn"
        :class="{ active: agentsStore.activeAgentId === agent.id }"
        :style="{ '--agent-color': agent.color, color: agent.color }"
        :title="agent.chinese_name + ' — ' + agent.specialty"
        @click="agentsStore.setActiveAgent(agent.id); chatStore.setChatTarget(agent.id)" 
      >
        {{ agent.glyph }}
        <span class="agent-dot" />
      </button>
    </div>

    <div class="rail-divider" />

    <!-- Nav buttons -->
    <div class="rail-section">
      <button
        class="rail-nav-btn"
        :class="{ active: workspace.showWorkspace }"
        title="工作区"
        @click="workspace.toggleWorkspace()"
      >
        📂
        <span v-if="workspace.inboxCount > 0" class="rail-badge">{{ workspace.inboxCount }}</span>
      </button>
    </div>

    <div class="rail-spacer" />

    <!-- Bottom nav -->
    <div class="rail-section">
      <button class="rail-nav-btn" title="群聊模式" @click="chatStore.setChatMode('group')" :class="{ active: chatStore.chatMode === 'group' }">
        合
      </button>
      <button class="rail-nav-btn" title="设置" @click="openSettings">
        ⚙
      </button>
    </div>
  </nav>
</template>

<script setup lang="ts">
import { useAgentsStore } from "../../stores/agents";
import { useChatStore } from "../../stores/chat";
import { useWorkspaceStore } from "../../stores/workspace";

const emit = defineEmits<{ 'open-settings': [] }>();

const agentsStore = useAgentsStore();
const chatStore = useChatStore();
const workspace = useWorkspaceStore();

function openSettings() {
  emit('open-settings');
}
</script>
