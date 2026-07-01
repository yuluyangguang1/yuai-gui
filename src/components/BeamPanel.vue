<template>
  <div class="beam-panel">
    <!-- Header -->
    <div class="beam-header">
      <TIcon name="bolt" :size="28" />
      <div class="beam-header-text">
        <span class="beam-title">并行提问</span>
        <span class="beam-desc">同时向所有 Agent 发送问题，对比方案</span>
      </div>
    </div>

    <!-- Agent tags -->
    <div class="beam-agents">
      <span
        v-for="agent in enabledAgents"
        :key="agent.id"
        class="beam-agent-tag"
        :style="{ borderColor: agent.color + '60', color: agent.color }"
      >
        <span class="beam-agent-dot" :style="{ background: agent.color }" />
        {{ agent.glyph }}
      </span>
    </div>

    <!-- Messages area -->
    <div class="beam-messages" ref="messagesRef">
      <template v-if="beamStore.messages.length > 0">
        <div
          v-for="(msg, i) in beamStore.messages"
          :key="i"
          class="beam-msg"
          :class="msg.role"
        >
          <span class="beam-msg-role">{{ msg.role === 'user' ? '你' : '系统' }}</span>
          <div class="beam-msg-bubble">{{ msg.content }}</div>
        </div>
      </template>
      <div v-else class="beam-empty">
        <TIcon name="bolt" :size="48" />
        <span class="beam-empty-hint">输入问题，并行发送给所有 Agent</span>
      </div>

      <!-- Thinking placeholders -->
      <template v-if="beamStore.isRunning">
       <div
         v-for="result in beamStore.results"
         :key="result.agentId"
         class="beam-thinking"
         :class="result.status"
       >
         <span
           class="beam-thinking-dot"
           :style="{ background: getAgentColor(result.agentId) }"
         />
         <span class="beam-thinking-name">{{ getAgentGlyph(result.agentId) }}</span>
         <span v-if="result.status === 'thinking'" class="beam-thinking-text">思考中...</span>
         <span v-else-if="result.status === 'done'" class="beam-thinking-text done">完成 · {{ result.duration }}ms</span>
         <span v-else-if="result.status === 'error'" class="beam-thinking-text error">错误</span>
       </div>
      </template>
    </div>

    <!-- Comparison panel -->
    <div v-if="beamStore.showComparison" class="beam-comparison">
      <div class="beam-comparison-header">方案对比</div>
      <div class="beam-cards">
        <div
          v-for="result in beamStore.results"
          :key="result.agentId"
          class="beam-card"
          :style="{ borderColor: getAgentColor(result.agentId) + '40' }"
        >
          <div class="beam-card-header">
            <span
              class="beam-card-dot"
              :style="{ background: getAgentColor(result.agentId) }"
            />
            <span class="beam-card-name">{{ getAgentGlyph(result.agentId) }}</span>
            <span class="beam-card-time">{{ result.duration }}ms</span>
          </div>
          <div class="beam-card-body">{{ result.response }}</div>
          <button
            class="beam-pick-btn"
            :style="{ borderColor: getAgentColor(result.agentId) + '60', color: getAgentColor(result.agentId) }"
            @click="handlePick(result.agentId)"
          >
            选择此方案
          </button>
        </div>
      </div>
    </div>

    <!-- Input area -->
    <div class="beam-input-area">
      <div class="beam-input-wrapper">
        <textarea
          ref="inputRef"
          class="beam-input"
          v-model="inputText"
          placeholder="输入问题... (Enter 发送)"
          rows="1"
          @keydown="handleKeydown"
          :disabled="beamStore.isRunning"
        />
        <button
          class="beam-send-btn"
          :disabled="!inputText.trim() || beamStore.isRunning"
          @click="handleSend"
        >
          {{ beamStore.isRunning ? '...' : '并行发送' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, watch } from 'vue';
import { TIcon } from "../utils/icons";
import { useBeamStore } from '../stores/beam';
import { useAgentsStore } from '../stores/agents';

const beamStore = useBeamStore();
const agentsStore = useAgentsStore();

const inputText = ref('');
const inputRef = ref<HTMLTextAreaElement | null>(null);
const messagesRef = ref<HTMLElement | null>(null);

const enabledAgents = computed(() => agentsStore.agents.filter(a => a.enabled));

function getAgentColor(agentId: string): string {
  return agentsStore.agents.find(a => a.id === agentId)?.color ?? '#5ccfb8';
}

function getAgentGlyph(agentId: string): string {
  return agentsStore.agents.find(a => a.id === agentId)?.glyph ?? agentId;
}

async function handleSend() {
  const q = inputText.value.trim();
  if (!q || beamStore.isRunning) return;
  inputText.value = '';
  try {
    await beamStore.sendQuestion(q);
  } catch (e) {
    console.error('Beam send failed:', e);
  }
  scrollToBottom();
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    handleSend();
  }
}

function handlePick(agentId: string) {
  beamStore.pickResponse(agentId);
}

async function scrollToBottom() {
  await nextTick();
  if (messagesRef.value) {
    messagesRef.value.scrollTop = messagesRef.value.scrollHeight;
  }
}

watch(() => beamStore.results.length, scrollToBottom);
watch(() => beamStore.showComparison, scrollToBottom);
</script>

<style scoped>
.beam-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-secondary);
  color: var(--text-primary);
}

.beam-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border-light);
}

.beam-glyph {
  font-family: var(--font-brush);
  font-size: 1.6rem;
  color: var(--jade);
  opacity: 0.7;
}

.beam-header-text {
  display: flex;
  flex-direction: column;
}

.beam-title {
  font-size: 14px;
  font-weight: 600;
}

.beam-desc {
  font-size: 11px;
  color: var(--text-muted, #888);
}

.beam-agents {
  display: flex;
  gap: 6px;
  padding: 8px 14px;
  flex-wrap: wrap;
}

.beam-agent-tag {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border: 1px solid;
  border-radius: 10px;
  font-size: var(--text-sm);
}

.beam-agent-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}

.beam-messages {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.beam-msg {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.beam-msg.user .beam-msg-bubble {
  background: color-mix(in srgb, var(--gold) 12%, transparent);
  align-self: flex-end;
  max-width: 80%;
}

.beam-msg.system .beam-msg-bubble {
  background: rgba(255, 165, 0, 0.08);
  color: var(--text-muted, #888);
  font-size: var(--text-sm);
  text-align: center;
}

.beam-msg-role {
  font-size: 11px;
  color: var(--text-muted, #888);
}

.beam-msg-bubble {
  padding: 8px 12px;
  border-radius: 8px;
  font-size: var(--text-base);
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.beam-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--text-muted, #888);
}

.beam-empty-glyph {
  font-family: var(--font-brush);
  font-size: 32px;
  opacity: 0.5;
}

.beam-empty-hint {
  font-size: var(--text-base);
}

.beam-thinking {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.03);
}

.beam-thinking-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  animation: pulse 1.5s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

.beam-thinking-name {
  font-size: var(--text-base);
  font-weight: 500;
}

.beam-thinking-text {
  font-size: 11px;
  color: var(--text-muted, #888);
  margin-left: auto;
}

.beam-thinking-text.done { color: var(--jade, #5ccfb8); }
.beam-thinking-text.error { color: var(--error, #ff6464); }

/* Comparison */
.beam-comparison {
  border-top: 1px solid var(--border-light);
  padding: 12px;
  max-height: 50%;
  overflow-y: auto;
}

.beam-comparison-header {
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--text-muted, #888);
  margin-bottom: 10px;
}

.beam-cards {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.beam-card {
  border: 1px solid;
  border-radius: 8px;
  padding: 10px;
  background: rgba(255, 255, 255, 0.02);
}

.beam-card-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}

.beam-card-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.beam-card-name {
  font-size: var(--text-base);
  font-weight: 600;
}

.beam-card-time {
  font-size: var(--text-xs);
  color: var(--text-muted, #888);
  margin-left: auto;
}

.beam-card-body {
  font-size: var(--text-sm);
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  margin-bottom: 8px;
  max-height: 120px;
  overflow-y: auto;
}

.beam-pick-btn {
  background: transparent;
  border: 1px solid;
  border-radius: 4px;
  padding: 4px 12px;
  font-size: 11px;
  cursor: pointer;
  transition: background 0.15s;
}

.beam-pick-btn:hover {
  background: rgba(255, 255, 255, 0.06);
}

/* Input */
.beam-input-area {
  padding: 10px 12px;
  border-top: 1px solid var(--border-light);
}

.beam-input-wrapper {
  display: flex;
  gap: 8px;
  align-items: flex-end;
}

.beam-input {
  flex: 1;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 8px 10px;
  color: var(--text-primary);
  font-size: var(--text-base);
  resize: none;
  font-family: inherit;
  outline: none;
}

.beam-input:focus {
  border-color: var(--jade, #5ccfb8);
}

.beam-input:disabled {
  opacity: 0.5;
}

.beam-send-btn {
  background: color-mix(in srgb, var(--jade) 20%, transparent);
  border: 1px solid var(--jade, #5ccfb8);
  border-radius: 6px;
  padding: 8px 14px;
  color: var(--jade, #5ccfb8);
  font-size: var(--text-sm);
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.15s;
}

.beam-send-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--jade) 30%, transparent);
}

.beam-send-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
</style>
