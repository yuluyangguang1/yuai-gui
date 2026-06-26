<template>
  <div class="room-manager">
    <div class="room-header">
      <span class="room-title">讨论组</span>
      <span class="room-count">{{ groupAgents.length }} 个代理</span>
    </div>
    <div class="room-agents">
      <div
        v-for="agent in groupAgents"
        :key="agent.id"
        class="room-agent"
      >
        <span class="room-agent-dot" :style="{ background: agent.color }" />
        <span class="room-agent-glyph">{{ agent.glyph }}</span>
        <span class="room-agent-name">{{ agent.chinese_name }}</span>
        <span class="room-agent-status" :class="getAgentStatus(agent.id)">
          {{ getAgentStatusText(agent.id) }}
        </span>
        <button
          v-if="groupAgents.length > 1"
          class="room-agent-remove"
          title="从讨论组移除"
          @click="kickAgent(agent.id)"
        >
          ✕
        </button>
      </div>
    </div>
    <div v-if="availableAgents.length > 0" class="room-add">
      <select v-model="selectedAgentId" class="room-add-select">
        <option value="" disabled>选择代理加入...</option>
        <option v-for="a in availableAgents" :key="a.id" :value="a.id">
          {{ a.glyph }} {{ a.chinese_name }} ({{ a.name }})
        </option>
      </select>
      <button
        class="room-add-btn"
        :disabled="!selectedAgentId"
        @click="inviteAgent"
      >
        邀请
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { useAgentsStore } from "../stores/agents";
import { useChatStore } from "../stores/chat";

const agentsStore = useAgentsStore();
const chatStore = useChatStore();
const selectedAgentId = ref("");

const groupAgents = computed(() => agentsStore.agents.filter(a => a.in_group && a.enabled));
const availableAgents = computed(() => agentsStore.agents.filter(a => !a.in_group && a.enabled));

function getAgentStatus(agentId: string): string {
  if (chatStore.phase === "idle") return "idle";
  if (chatStore.streamingMessage?.agentId === agentId) return "busy";
  return chatStore.phase === "thinking" ? "busy" : "idle";
}

function getAgentStatusText(agentId: string): string {
  const status = getAgentStatus(agentId);
  return status === "busy" ? "忙碌" : "空闲";
}

async function inviteAgent() {
  if (!selectedAgentId.value) return;
  try {
    await invoke("group_invite", { agentId: selectedAgentId.value });
    // Update local state
    const agent = agentsStore.agents.find(a => a.id === selectedAgentId.value);
    if (agent) agent.in_group = true;
    selectedAgentId.value = "";
  } catch (e) {
    console.warn("group_invite failed:", e);
  }
}

async function kickAgent(agentId: string) {
  try {
    await invoke("group_kick", { agentId });
    const agent = agentsStore.agents.find(a => a.id === agentId);
    if (agent) agent.in_group = false;
  } catch (e) {
    console.warn("group_kick failed:", e);
  }
}
</script>

<style scoped>
.room-manager {
  padding: 8px;
  font-size: 12px;
}

.room-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.room-title {
  font-weight: 600;
  font-size: 12px;
  color: var(--text-primary);
}

.room-count {
  font-size: 11px;
  color: var(--text-muted, #888);
}

.room-agents {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.room-agent {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 6px;
  border-radius: 4px;
  transition: background 0.1s;
}

.room-agent:hover {
  background: rgba(255, 255, 255, 0.04);
}

.room-agent-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.room-agent-glyph {
  font-size: 13px;
}

.room-agent-name {
  flex: 1;
  color: var(--text-primary);
}

.room-agent-status {
  font-size: 10px;
  padding: 1px 4px;
  border-radius: 3px;
}

.room-agent-status.idle {
  color: var(--accent);
  background: rgba(80, 200, 120, 0.1);
}

.room-agent-status.busy {
  color: #e0b0ff;
  background: rgba(224, 176, 255, 0.15);
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

.room-agent-remove {
  background: none;
  border: none;
  color: var(--text-muted, #666);
  cursor: pointer;
  font-size: 10px;
  padding: 2px;
  opacity: 0;
  transition: opacity 0.15s, color 0.15s;
}

.room-agent:hover .room-agent-remove {
  opacity: 1;
}

.room-agent-remove:hover {
  color: var(--vermilion-glow);
}

.room-add {
  display: flex;
  gap: 4px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--border-light);
}

.room-add-select {
  flex: 1;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-primary);
  font-size: 11px;
  padding: 4px 6px;
  outline: none;
}

.room-add-btn {
  background: rgba(224, 176, 255, 0.15);
  color: var(--gold, #e0b0ff);
  border: 1px solid rgba(224, 176, 255, 0.2);
  border-radius: 4px;
  padding: 4px 10px;
  font-size: 11px;
  cursor: pointer;
  transition: background 0.15s;
}

.room-add-btn:hover:not(:disabled) {
  background: rgba(224, 176, 255, 0.25);
}

.room-add-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
