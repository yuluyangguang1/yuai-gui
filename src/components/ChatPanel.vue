<template>
  <div class="chat-panel">
    <div class="chat-header">
      <span
        class="chat-agent-indicator"
        :style="{ background: agentsStore.activeAgent.color }"
      />
      <span class="chat-agent-name">{{ agentsStore.activeAgent.glyph }}</span>
      <span v-if="chatStore.phase !== 'idle'" class="chat-phase">
        {{ phaseText }}
      </span>
      <ContextPanel />
    </div>

    <!-- Messages -->
    <div class="chat-messages" ref="messagesRef">
      <template v-if="chatStore.messages.length > 0">
        <div
          v-for="msg in chatStore.messages"
          :key="msg.id"
          class="chat-message"
          :class="msg.role"
        >
          <span class="chat-msg-meta" v-if="msg.role !== 'system'">
            {{ msg.role === "user" ? "你" : agentsStore.activeAgent.glyph }}
            · {{ formatTime(msg.timestamp) }}
          </span>
          <div class="chat-msg-bubble">{{ msg.content }}</div>
        </div>
      </template>

      <div v-else class="chat-empty">
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
          ▶
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
import type { AgentDef } from "../stores/agents";

const chatStore = useChatStore();
const agentsStore = useAgentsStore();
const workspaceStore = useWorkspaceStore();

// Load history when workspace changes
onMounted(() => {
  if (workspaceStore.path) chatStore.loadHistory(workspaceStore.path);
});
watch(() => workspaceStore.path, (p) => {
  if (p) chatStore.loadHistory(p);
});

const messagesRef = ref<HTMLElement | null>(null);
const inputRef = ref<HTMLTextAreaElement | null>(null);

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
  await chatStore.sendMessage();
  // Persist the last user message
  const lastMsg = chatStore.messages[chatStore.messages.length - 1];
  if (lastMsg && workspaceStore.path) {
    chatStore.persistMessage(lastMsg, workspaceStore.path);
  }
  scrollToBottom();
}

watch(() => chatStore.messages.length, scrollToBottom);
</script>
