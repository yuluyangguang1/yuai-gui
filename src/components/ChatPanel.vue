<template>
  <BeamPanel v-if="chatStore.chatMode === 'beam'" />
  <div v-else class="chat-panel">
    <div class="chat-header">
      <span
        class="chat-agent-indicator"
        :style="{ background: chatStore.chatMode === 'group' ? 'var(--gold)' : currentAgent.color }"
      />
      <span class="chat-agent-name">
        {{ chatStore.chatMode === 'group' ? ICONS.group : currentAgent.glyph }}
      </span>
      <span class="chat-mode-label">
        {{ chatStore.chatMode === 'group' ? '群聊' : currentAgent.chinese_name }}
      </span>
      <!-- Agent status display -->
      <span v-if="chatStore.chatMode !== 'group'" class="chat-agent-status" :class="'status-' + currentAgent.status">
        {{ statusLabel(currentAgent.status) }}
      </span>
      <span v-else class="chat-agent-status status-group">
        {{ agentsStore.enabledAgents.length }}/{{ agentsStore.agents.length }} 在线
      </span>
      <!-- Phase + round display -->
      <span v-if="chatStore.phase !== 'idle'" class="chat-phase">
        {{ phaseText }}
        <span v-if="chatStore.round > 0" class="chat-round">· 第{{ chatStore.round }}轮</span>
        <span v-if="chatStore.streamingMessage" class="chat-speaking">
          · {{ getAgentGlyph(chatStore.streamingMessage.agentId) }} 发言中
        </span>
      </span>
      <span class="chat-spacer" />
      <!-- Beam mode toggle -->
      <button class="chat-mode-btn" :class="{ active: chatStore.chatMode === 'beam' }" @click="chatStore.setChatMode(chatStore.chatMode === 'beam' ? 'single' : 'beam')" title="并行提问模式">
        {{ ICONS.beam }}
      </button>
      <!-- Room manager toggle (only in group mode) -->
      <button v-if="chatStore.chatMode === 'group'" class="room-toggle-btn" @click="showRoomManager = !showRoomManager" title="讨论组管理">
        {{ showRoomManager ? ICONS.collapse : ICONS.expand }} 组
      </button>
      <ContextPanel />
    </div>

    <!-- Room Manager Panel -->
    <RoomManager v-if="showRoomManager" />

    <!-- Messages -->
    <div class="chat-messages" ref="messagesRef">
      <!-- Load more button for virtual scrolling -->
      <div v-if="hasMoreMessages" class="chat-load-more">
        <button class="load-more-btn" @click="loadMoreMessages">
          加载更多消息 ({{ hiddenMessageCount }} 条隐藏)
        </button>
      </div>
      <template v-if="visibleMessages.length > 0">
        <div
          v-for="msg in visibleMessages"
          :key="msg.id"
          class="chat-message"
          :class="msg.role"
        >
          <span class="chat-msg-meta" v-if="msg.role !== 'system'">
            {{ msg.role === "user" ? "你" : getAgentGlyph(msg.agentId || 'hermes') }}
            · {{ formatTime(msg.timestamp) }}
          </span>
          <div class="chat-msg-bubble">{{ msg.content }}</div>
        </div>
      </template>

      <!-- Streaming message bubble -->
      <div
        v-if="chatStore.streamingMessage"
        class="chat-message assistant streaming"
      >
        <span class="chat-msg-meta">
          {{ getAgentGlyph(chatStore.streamingMessage.agentId) }}
          · <span class="typing-indicator">输入中...</span>
        </span>
        <div class="chat-msg-bubble streaming-bubble">
          {{ chatStore.streamingMessage.content }}<span class="cursor-blink">▌</span>
        </div>
      </div>

      <div v-else-if="chatStore.messages.length === 0" class="chat-empty">
        <span class="chat-empty-glyph">{{ agentsStore.activeAgent.glyph }}</span>
        <span class="chat-empty-hint">
          与 {{ agentsStore.activeAgent.chinese_name }}（{{ agentsStore.activeAgent.specialty }}）对话
        </span>
      </div>
    </div>

    <!-- @Mention Dropdown -->
    <div
      v-if="mentionDropdown.visible"
      class="mention-dropdown"
      :style="dropdownPosition"
    >
      <div
        v-for="(agent, index) in mentionDropdown.filteredAgents"
        :key="agent.id"
        class="mention-item"
        :class="{ active: index === mentionDropdown.selectedIndex }"
        @click="selectMention(agent)"
        @mouseenter="mentionDropdown.selectedIndex = index"
      >
        <span class="mention-glyph" :style="{ color: agent.color }">{{ agent.glyph }}</span>
        <span class="mention-name">{{ agent.name }}</span>
        <span class="mention-chinese">{{ agent.chinese_name }}</span>
      </div>
    </div>

    <!-- Abort button during discussion -->
    <div v-if="chatStore.phase !== 'idle' && chatStore.round > 0" class="abort-bar">
      <button class="abort-btn" @click="chatStore.abortDiscussion">中断讨论</button>
    </div>

    <!-- Decision panel after discussion -->
    <div v-if="chatStore.showDecision || chatStore.execStatus !== 'idle'" class="decision-panel">
      <div v-if="chatStore.execStatus === 'idle'" class="decision-content">
        <div class="decision-title">讨论完成 · 第 {{ chatStore.round }} 轮</div>
        <div class="decision-actions">
          <button class="decision-btn confirm" @click="handleConfirmExec">确认执行</button>
          <button class="decision-btn reject" @click="chatStore.rejectExecution">取消</button>
        </div>
      </div>
      <div v-else-if="chatStore.execStatus === 'running'" class="decision-content">
        <div class="decision-title">执行中...</div>
        <div class="exec-spinner" />
      </div>
      <div v-else-if="chatStore.execStatus === 'done'" class="decision-content">
        <div class="decision-title">执行完成</div>
        <button class="decision-btn reject" @click="chatStore.dismissExec">关闭</button>
      </div>
      <div v-else-if="chatStore.execStatus === 'error'" class="decision-content">
        <div class="decision-title exec-error">执行失败</div>
        <button class="decision-btn reject" @click="chatStore.dismissExec">关闭</button>
      </div>
    </div>

    <!-- Input -->
    <div class="chat-input-area">
      <div class="chat-input-wrapper">
        <textarea
          ref="inputRef"
          class="chat-input"
          v-model="chatStore.inputText"
          placeholder="输入消息... (输入 @ 提及代理)"
          rows="1"
          @keydown="handleKeydown"
          @input="handleInput"
        />
        <button
          class="chat-send-btn"
          :disabled="!chatStore.inputText.trim()"
          @click="handleSend"
        >
          {{ ICONS.play }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, nextTick, watch, onMounted, onUnmounted } from "vue";
import { useChatStore } from "../stores/chat";
import { useAgentsStore } from "../stores/agents";
import { useWorkspaceStore } from "../stores/workspace";
import ContextPanel from "./ContextPanel.vue";
import RoomManager from "./RoomManager.vue";
import BeamPanel from "./BeamPanel.vue";
import type { AgentDef } from "../stores/agents";
import { ICONS } from "../utils/icons";

const chatStore = useChatStore();
const agentsStore = useAgentsStore();

// Current agent for single mode (uses chatTarget)
const currentAgent = computed(() => {
  if (chatStore.chatMode === 'group') return agentsStore.activeAgent;
  return agentsStore.agents.find(a => a.id === chatStore.chatTarget) ?? agentsStore.activeAgent;
});
const workspaceStore = useWorkspaceStore();
const showRoomManager = ref(false);

async function handleConfirmExec() {
  await chatStore.confirmExecution();
}

// Load history when workspace changes
onMounted(() => {
  if (workspaceStore.path) chatStore.loadHistory(workspaceStore.path);
});
watch(() => workspaceStore.path, (p) => {
  if (p) chatStore.loadHistory(p);
});

const messagesRef = ref<HTMLElement | null>(null);
const inputRef = ref<HTMLTextAreaElement | null>(null);

// ── Virtual scroll: message windowing ──
const MESSAGE_WINDOW = ref(50);
const visibleMessages = computed(() => {
  const msgs = chatStore.messages;
  if (msgs.length <= MESSAGE_WINDOW.value) return msgs;
  return msgs.slice(msgs.length - MESSAGE_WINDOW.value);
});
const hasMoreMessages = computed(() => chatStore.messages.length > MESSAGE_WINDOW.value);
const hiddenMessageCount = computed(() => Math.max(0, chatStore.messages.length - MESSAGE_WINDOW.value));
function loadMoreMessages() {
  MESSAGE_WINDOW.value += 50;
}

// @Mention state
const mentionDropdown = reactive({
  visible: false,
  query: "",
  selectedIndex: 0,
  filteredAgents: [] as AgentDef[],
  startPos: 0, // position of '@' in text
});

const dropdownPosition = ref<Record<string, string>>({});

const phaseText = computed(() => {
  switch (chatStore.phase) {
    case "thinking": return "思考中...";
    case "generating": return "生成中...";
    case "tool_call": return "工具调用...";
    case "error": return "错误";
    default: return "";
  }
});

function getAgentGlyph(agentId: string): string {
  const agent = agentsStore.agents.find(a => a.id === agentId);
  return agent?.glyph ?? agentId;
}

function statusLabel(status: string): string {
  switch (status) {
    case 'running': return '运行中';
    case 'error': return '错误';
    case 'disabled': return '已禁用';
    default: return '就绪';
  }
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

async function scrollToBottom() {
  await nextTick();
  if (messagesRef.value) {
    messagesRef.value.scrollTop = messagesRef.value.scrollHeight;
  }
}

function handleInput() {
  checkMentionTrigger();
}

function checkMentionTrigger() {
  const textarea = inputRef.value;
  if (!textarea) return;

  const text = textarea.value;
  const cursorPos = textarea.selectionStart;

  // Find '@' before cursor
  const textBeforeCursor = text.substring(0, cursorPos);
  const atIndex = textBeforeCursor.lastIndexOf("@");

  if (atIndex === -1) {
    closeMentionDropdown();
    return;
  }

  // Check there's no space between '@' and cursor (simple mention detection)
  const queryAfterAt = textBeforeCursor.substring(atIndex + 1);
  if (/\s/.test(queryAfterAt)) {
    closeMentionDropdown();
    return;
  }

  mentionDropdown.startPos = atIndex;
  mentionDropdown.query = queryAfterAt.toLowerCase();
  mentionDropdown.selectedIndex = 0;
  mentionDropdown.filteredAgents = agentsStore.agents.filter(a =>
    a.enabled && (
      a.name.toLowerCase().includes(mentionDropdown.query) ||
      a.chinese_name.includes(mentionDropdown.query)
    )
  );
  mentionDropdown.visible = mentionDropdown.filteredAgents.length > 0;

  // Position dropdown above input
  if (mentionDropdown.visible) {
    dropdownPosition.value = {
      position: "absolute",
      bottom: "70px",
      left: "12px",
    };
  }
}

function closeMentionDropdown() {
  mentionDropdown.visible = false;
  mentionDropdown.query = "";
  mentionDropdown.filteredAgents = [];
}

function selectMention(agent: AgentDef) {
  const textarea = inputRef.value;
  if (!textarea) return;

  const text = textarea.value;
  const before = text.substring(0, mentionDropdown.startPos);
  const after = text.substring(textarea.selectionStart);
  chatStore.inputText = before + "@" + agent.name + " " + after;
  closeMentionDropdown();

  nextTick(() => {
    const newPos = mentionDropdown.startPos + agent.name.length + 2;
    textarea.setSelectionRange(newPos, newPos);
    textarea.focus();
  });
}

function handleKeydown(e: KeyboardEvent) {
  if (mentionDropdown.visible) {
    const items = mentionDropdown.filteredAgents;
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        mentionDropdown.selectedIndex = (mentionDropdown.selectedIndex + 1) % items.length;
        return;
      case "ArrowUp":
        e.preventDefault();
        mentionDropdown.selectedIndex = (mentionDropdown.selectedIndex - 1 + items.length) % items.length;
        return;
      case "Enter":
      case "Tab":
        if (items[mentionDropdown.selectedIndex]) {
          e.preventDefault();
          selectMention(items[mentionDropdown.selectedIndex]);
          return;
        }
        break;
      case "Escape":
        e.preventDefault();
        closeMentionDropdown();
        return;
    }
  }

  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    handleSend();
  }
}

// Close mention dropdown on click outside
function handleClickOutside(e: MouseEvent) {
  const target = e.target as HTMLElement;
  if (!target.closest(".mention-dropdown") && !target.closest(".chat-input")) {
    closeMentionDropdown();
  }
}

onMounted(() => {
  document.addEventListener("click", handleClickOutside);
});
onUnmounted(() => {
  document.removeEventListener("click", handleClickOutside);
});

async function handleSend() {
  if (mentionDropdown.visible) return;
  try {
    await chatStore.sendMessage();
  } catch (e) {
    console.error('handleSend failed:', e);
  }
  scrollToBottom();
}

// Auto-scroll when messages change
watch(() => chatStore.messages.length, scrollToBottom);

// Auto-scroll when streaming message updates
watch(
  () => chatStore.streamingMessage?.content,
  () => { scrollToBottom(); },
  { flush: "post" },
);
</script>

<style scoped>
.chat-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-secondary);
  color: var(--text-primary);
}

/* Virtual scroll: load more */
.chat-load-more {
  display: flex;
  justify-content: center;
  padding: 8px;
}

.load-more-btn {
  padding: 4px 16px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.03);
  color: var(--text-muted, #565f89);
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s;
}

.load-more-btn:hover {
  background: rgba(255, 255, 255, 0.06);
  color: var(--silver, #a9b1d6);
}

.chat-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-light);
}

.chat-agent-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.chat-agent-name {
  font-size: 14px;
  font-weight: 600;
}

.chat-agent-status {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 4px;
  font-family: var(--font-mono);
}

.chat-agent-status.status-idle {
  background: rgba(136,136,136,0.15);
  color: #888;
}

.chat-agent-status.status-running {
  background: rgba(76,175,80,0.15);
  color: #4caf50;
}

.chat-agent-status.status-error {
  background: rgba(244,67,54,0.15);
  color: #f44336;
}

.chat-agent-status.status-disabled {
  background: rgba(136,136,136,0.1);
  color: #666;
}

.chat-agent-status.status-group {
  background: rgba(224,176,255,0.1);
  color: var(--gold, #e0b0ff);
}

.chat-phase {
  font-size: 11px;
  color: var(--text-muted, #888);
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 4px;
}

.chat-round {
  font-size: 10px;
  color: var(--gold, #e0b0ff);
  opacity: 0.8;
}

.chat-speaking {
  font-size: 10px;
  color: var(--jade, #5ccfb8);
}

.room-toggle-btn {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-muted, #888);
  font-size: 11px;
  padding: 2px 8px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.room-toggle-btn:hover {
  background: color-mix(in srgb, var(--gold) 10%, transparent);
  color: var(--text-primary);
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.chat-message {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.chat-msg-meta {
  font-size: 11px;
  color: var(--text-muted, #888);
}

.chat-msg-bubble {
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 13px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
}

.chat-message.user .chat-msg-bubble {
  background: color-mix(in srgb, var(--gold) 12%, transparent);
  align-self: flex-end;
  max-width: 80%;
}

.chat-message.assistant .chat-msg-bubble {
  background: rgba(255, 255, 255, 0.05);
}

.chat-message.system .chat-msg-bubble {
  background: rgba(255, 165, 0, 0.08);
  color: var(--text-muted, #888);
  font-size: 12px;
  text-align: center;
}

/* Streaming message styles */
.streaming-bubble {
  border: 1px solid rgba(224, 176, 255, 0.2);
  background: rgba(224, 176, 255, 0.06);
}

.typing-indicator {
  color: var(--gold, #e0b0ff);
  font-size: 11px;
  animation: typingPulse 1.5s ease-in-out infinite;
}

@keyframes typingPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

.cursor-blink {
  color: var(--gold, #e0b0ff);
  animation: cursorBlink 0.8s step-end infinite;
  margin-left: 1px;
}

@keyframes cursorBlink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}

.chat-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--text-muted, #888);
}

.chat-empty-glyph {
  font-size: 32px;
  opacity: 0.5;
}

.chat-empty-hint {
  font-size: 13px;
}

/* @Mention dropdown */
.mention-dropdown {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 4px;
  max-height: 200px;
  overflow-y: auto;
  z-index: 100;
}

.mention-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 13px;
}

.mention-item:hover,
.mention-item.active {
  background: rgba(255, 255, 255, 0.08);
}

.mention-glyph {
  font-size: 14px;
}

.mention-name {
  font-weight: 500;
}

.mention-chinese {
  color: var(--text-muted, #888);
  font-size: 12px;
}

/* Input area */
.chat-input-area {
  padding: 8px 12px;
  border-top: 1px solid var(--border-light);
}

.chat-input-wrapper {
  display: flex;
  gap: 8px;
  align-items: flex-end;
}

.chat-input {
  flex: 1;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 12px;
  color: var(--text-primary);
  font-size: 13px;
  font-family: inherit;
  resize: none;
  outline: none;
  min-height: 36px;
  max-height: 120px;
}

.chat-input:focus {
  border-color: var(--gold, #e0b0ff);
}

.chat-send-btn {
  background: var(--gold, #e0b0ff);
  color: var(--text-inverse);
  border: none;
  border-radius: 8px;
  width: 36px;
  height: 36px;
  cursor: pointer;
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: opacity 0.15s;
}

.chat-send-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.chat-send-btn:not(:disabled):hover {
  opacity: 0.85;
}

/* Abort bar */
.abort-bar {
  display: flex;
  justify-content: center;
  padding: 8px 12px;
}

.abort-btn {
  background: rgba(255, 80, 80, 0.15);
  color: var(--vermilion-glow);
  border: 1px solid rgba(255, 80, 80, 0.3);
  border-radius: 6px;
  padding: 6px 20px;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.15s;
}

.abort-btn:hover {
  background: rgba(255, 80, 80, 0.25);
}

/* Decision panel */
.decision-panel {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 12px;
  border-top: 1px solid var(--border-light);
}

.decision-title {
  font-size: .78rem;
  color: var(--text-muted);
}

.decision-actions {
  display: flex;
  gap: 8px;
}

.decision-btn {
  border: none;
  border-radius: 6px;
  padding: 8px 20px;
  font-size: .78rem;
  cursor: pointer;
  transition: opacity 0.15s;
}

.decision-btn.confirm {
  background: var(--gold, #e0b0ff);
  color: var(--text-inverse);
}

.decision-btn.confirm:hover {
  opacity: 0.85;
}

.decision-btn.reject {
  background: rgba(255, 255, 255, 0.08);
  color: var(--text-muted, #888);
  border: 1px solid var(--border);
}

.decision-btn.reject:hover {
  background: rgba(255, 255, 255, 0.12);
}

.decision-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  width: 100%;
}

.exec-spinner {
  width: 20px;
  height: 20px;
  border: 2px solid rgba(224, 176, 255, 0.2);
  border-top-color: var(--gold, #e0b0ff);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.exec-error {
  color: var(--vermilion-glow);
}
</style>
