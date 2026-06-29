<template>
  <nav class="app-rail">
    <!-- Top: Agent buttons (梅兰竹菊) -->
    <div class="rail-section rail-section-top stagger-container">
      <div class="rail-section-label">四友</div>
      <button
        v-for="agent in agentsStore.agents"
        :key="agent.id"
        class="rail-agent-btn"
        :class="{
          active: agentsStore.activeAgentId === agent.id,
          disabled: !agent.enabled
        }"
        :style="{
          '--agent-color': agent.color,
          color: agent.enabled ? agent.color : 'var(--silver)'
        }"
        :title="
          agent.chinese_name +
          ' — ' +
          agent.specialty +
          (agent.enabled ? '' : ' (已禁用)')
        "
        @click="handleAgentClick(agent)"
      >
        <Plum v-if="agent.id === 'claude'" :size="28" :color="agent.enabled ? agent.color : 'var(--silver)'" />
        <Orchid v-else-if="agent.id === 'codex'" :size="28" :color="agent.enabled ? agent.color : 'var(--silver)'" />
        <Bamboo v-else-if="agent.id === 'openclaw'" :size="28" :color="agent.enabled ? agent.color : 'var(--silver)'" />
        <Chrysanthemum v-else-if="agent.id === 'hermes'" :size="28" :color="agent.enabled ? agent.color : 'var(--silver)'" />
        <span class="agent-en-name">{{ agent.name }}</span>
        <span
          class="agent-dot"
          :class="{
            'dot-idle': agent.enabled && agent.status === 'idle',
            'dot-running': agent.enabled && agent.status === 'running',
            'dot-error': agent.enabled && agent.status === 'error',
            'dot-disabled':
              !agent.enabled || agent.status === 'disabled'
          }"
        />
      </button>
    </div>

    <div class="rail-divider" />

    <!-- Middle: 合束技 buttons -->
    <div class="rail-section rail-section-middle">
      <div class="rail-section-label">合束技</div>
      <button
        class="rail-nav-btn"
        :class="{ active: chatStore.chatMode === 'group' }"
        title="群聊模式 — 多 Agent 协作讨论，轮流发言"
        @click="chatStore.setChatMode('group')"
      >
        <span class="rail-glyph">{{ ICONS.group }}</span>
        <span class="rail-label">合</span>
      </button>
      <button
        class="rail-nav-btn"
        :class="{ active: chatStore.chatMode === 'beam' }"
        title="并行提问 — 同时向所有 Agent 发送，对比方案"
        @click="chatStore.setChatMode('beam')"
      >
        <span class="rail-glyph">{{ ICONS.beam }}</span>
        <span class="rail-label">束</span>
      </button>
      <button
        class="rail-nav-btn"
        :class="{ active: skillsPanelOpen }"
        title="技能管理 — 查看、搜索、启停 Agent 技能"
        @click="openSkills"
      >
        <span class="rail-glyph">{{ ICONS.skills }}</span>
        <span class="rail-label">技</span>
      </button>
    </div>

    <div class="rail-spacer" />

    <!-- Bottom: tools, workspace, settings -->
    <div class="rail-section rail-section-tools">
      <button
        class="rail-nav-btn"
        title="设备 — 局域网发现与配对"
        @click="emit('open-lan')"
      >
        <span class="rail-glyph">{{ ICONS.devices }}</span>
        <span class="rail-label">设</span>
      </button>
    </div>

    <div class="rail-spacer" />
    <div class="rail-section rail-section-bottom">
      <button
        class="rail-nav-btn"
        :class="{ active: workspace.showWorkspace }"
        title="工作区 — 文件浏览与管理"
        @click="workspace.toggleWorkspace()"
      >
        <span class="rail-glyph">{{ ICONS.folder }}</span>
        <span class="rail-label">区</span>
        <span v-if="workspace.inboxCount > 0" class="rail-badge">
          {{ workspace.inboxCount }}
        </span>
      </button>
      <button
        class="rail-nav-btn"
        title="配置 — API 密钥、Agent 设置"
        @click="emit('open-settings')"
      >
        <span class="rail-glyph">{{ ICONS.settings }}</span>
        <span class="rail-label">置</span>
      </button>
    </div>
  </nav>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useAgentsStore } from "../../stores/agents";
import { useChatStore } from "../../stores/chat";
import { useWorkspaceStore } from "../../stores/workspace";
import { ICONS } from "../../utils/icons";
import { Plum, Orchid, Bamboo, Chrysanthemum } from "../../utils/agent-icons";
import type { AgentDef } from "../../stores/agents";

const emit = defineEmits<{
  "open-settings": [];
  "open-skills": [];
  "open-lan": [];
}>();

const agentsStore = useAgentsStore();
const chatStore = useChatStore();
const workspace = useWorkspaceStore();
const skillsPanelOpen = ref(false);
const lanPanelOpen = ref(false);

function handleAgentClick(agent: AgentDef) {
  if (!agent.enabled) {
    agentsStore.toggleAgent(agent.id);
    return;
  }
  agentsStore.setActiveAgent(agent.id);
  chatStore.setChatTarget(agent.id);
}
</script>

<style scoped>
.app-rail {
  display: flex;
  flex-direction: column;
  width: 56px;
  background: var(--bg-primary);
  border-right: 1px solid var(--border-light);
  padding: 8px 0;
  align-items: center;
  gap: 2px;
  -webkit-app-region: drag;
}

.rail-section {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  -webkit-app-region: no-drag;
}

.rail-section-label {
  font-size: 8px;
  letter-spacing: 1px;
  color: var(--text-muted, #666);
  padding: 2px 0 4px;
  opacity: 0.6;
  font-family: var(--font-mono, monospace);
}

.rail-divider {
  width: 28px;
  height: 1px;
  background: var(--border-light);
  margin: 4px 0;
}

.rail-spacer {
  flex: 1;
}

.agent-glyph-char {
  font-family: var(--font-brush, 'Ma Shan Zheng', cursive);
  font-size: 14px;
  line-height: 1;
  margin-top: 2px;
}

.agent-en-name {
  font-size: 7px;
  font-family: var(--font-mono, monospace);
  color: var(--text-muted, #666);
  letter-spacing: 0.5px;
  margin-top: 1px;
  opacity: 0.7;
}

.rail-agent-btn,
.rail-nav-btn {
  position: relative;
  width: 42px;
  height: 42px;
  border-radius: 8px;
  border: none;
  background: transparent;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  transition: all 0.15s;
}

.rail-agent-btn {
  font-family: var(--font-brush, serif);
  font-size: 18px;
}

.rail-agent-btn:hover {
  background: rgba(255, 255, 255, 0.05);
}

.rail-agent-btn.active {
  background: color-mix(in srgb, var(--agent-color) 15%, transparent);
}

.rail-agent-btn.disabled {
  opacity: 0.35;
}

.rail-agent-btn.disabled:hover {
  opacity: 0.6;
}

.agent-dot {
  position: absolute;
  bottom: 4px;
  right: 4px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  border: 1px solid var(--bg-primary);
}

.dot-idle {
  background: #888;
}

.dot-running {
  background: #4caf50;
  animation: pulse-green 1.5s ease-in-out infinite;
}

.dot-error {
  background: #f44336;
}

.dot-disabled {
  background: #555;
  opacity: 0.5;
}

@keyframes pulse-green {
  0%, 100% {
    box-shadow: 0 0 0 0 rgba(76, 175, 80, 0.4);
  }
  50% {
    box-shadow: 0 0 4px 2px rgba(76, 175, 80, 0.2);
  }
}

.rail-nav-btn {
  color: var(--text-muted, #888);
}

.rail-nav-btn:hover {
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.05);
}

.rail-nav-btn.active {
  color: var(--gold, #e0b0ff);
  background: color-mix(in srgb, var(--gold, #e0b0ff) 10%, transparent);
}

.rail-glyph {
  font-family: var(--font-brush, serif);
  font-size: 16px;
  line-height: 1;
}

.rail-label {
  font-size: 8px;
  opacity: 0.6;
  line-height: 1;
  letter-spacing: 0.5px;
}

.rail-badge {
  position: absolute;
  top: 2px;
  right: 2px;
  font-size: 9px;
  background: var(--vermilion-glow, #ff5050);
  color: #fff;
  border-radius: 50%;
  min-width: 14px;
  height: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 3px;
}
</style>
