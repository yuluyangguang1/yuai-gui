<template>
  <BeamPanel v-if="chatStore.chatMode === 'beam'" />
  <div v-else class="chat-panel">
    <div class="chat-header">
      <span
        class="chat-agent-indicator"
        :style="{ background: chatStore.chatMode === 'group' ? 'var(--gold)' : currentAgent.color }"
      />
      <span class="chat-agent-name">
        <TIcon v-if="chatStore.chatMode === 'group'" name="users" :size="16" /><span v-else>{{ currentAgent.glyph }}</span>
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
      <!-- Model Selector (参考 Hermes Studio ModelSelector.vue) -->
      <ModelSelector />
      <!-- Beam mode toggle -->
      <button class="chat-mode-btn" :class="{ active: chatStore.chatMode === 'beam' }" @click="chatStore.setChatMode(chatStore.chatMode === 'beam' ? 'single' : 'beam')" title="并行提问模式">
        <TIcon name="bolt" :size="16" />
      </button>
      <!-- Room manager toggle (only in group mode) -->
      <button v-if="chatStore.chatMode === 'group'" class="room-toggle-btn" @click="showRoomManager = !showRoomManager" title="讨论组管理">
        <TIcon :name="showRoomManager ? 'chevronDown' : 'chevronRight'" :size="14" /> 组
      </button>
      <ContextPanel />
    </div>

    <!-- Room Manager Panel -->
    <RoomManager v-if="showRoomManager" />

    <!-- Messages -->
    <div class="chat-messages" role="log" aria-live="polite" ref="messagesRef">
      <!-- Load more button for virtual scrolling -->
      <div v-if="hasMoreMessages" class="chat-load-more">
        <button class="load-more-btn" aria-label="加载更多消息" @click="loadMoreMessages">
          加载更多消息 ({{ hiddenMessageCount }} 条隐藏)
        </button>
      </div>
      <template v-if="visibleMessages.length > 0">
        <TransitionGroup name="msg-stagger" tag="div">
          <div
            v-for="(msg, idx) in visibleMessages"
            :key="msg.id"
            class="chat-message"
            :class="msg.role"
            :style="{ transitionDelay: `${idx * 35}ms` }"
          >
            <span class="chat-msg-meta" v-if="msg.role !== 'system'">
              {{ msg.role === "user" ? "你" : getAgentGlyph(msg.agentId || 'hermes') }}
              · {{ formatTime(msg.timestamp) }}
            </span>
            <div class="chat-msg-bubble">{{ msg.content }}</div>
          </div>
        </TransitionGroup>
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

    <!-- Command Suggest (slash commands / flags) -->
    <CommandSuggest
      ref="commandSuggestRef"
      :agent-id="currentAgent.id"
      :textarea="inputRef"
      @select="handleCommandSelect"
    />

    <!-- Abort button during discussion -->
    <div v-if="chatStore.phase !== 'idle' && chatStore.round > 0" class="abort-bar">
      <button class="abort-btn" aria-label="停止生成" @click="chatStore.abortDiscussion">中断讨论</button>
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
      <!-- 内置 Agent 浏览面板 -->
      <Transition name="slide-up">
        <div v-if="showAgentBrowser" class="agent-browser-overlay">
          <div class="browser-header">
            <span class="browser-title"><TIcon name="users" :size="16" /> 内置 Agent 人格库</span>
            <button class="browser-close" @click="showAgentBrowser = false">
              <TIcon name="close" :size="14" />
            </button>
          </div>
          <AgentBrowser @select="handleAgentSelect" />
        </div>
      </Transition>

      <div class="chat-input-wrapper">
        <PromptSuggest
          v-if="suggestVisible"
          :suggestions="promptSuggestions"
          @close="suggestVisible = false"
          @apply="handleApplySuggestion"
          @autoFix="handleAutoFix"
          @enhance="handleEnhance"
        />
        <SlashCommandMenu
          v-model:visible="slashMenuVisible"
          :commands="promptStore.allCommands"
          :position="slashMenuPosition"
          @select="handleSlashSelect"
          @close="slashMenuVisible = false"
        />
        <textarea
          ref="inputRef"
          class="chat-input"
          v-model="chatStore.inputText"
          aria-label="消息输入" placeholder="输入消息... (输入 @ 提及代理)"
          rows="1"
          @keydown="handleKeydown"
          @input="handleInput"
        ></textarea>
        <button
          class="chat-agent-btn"
          :class="{ active: showAgentBrowser }"
          @click="showAgentBrowser = !showAgentBrowser"
          title="内置 Agent 人格库"
        >
          <TIcon name="users" :size="14" />
        </button>
        <button
          class="chat-send-btn"
          :disabled="!chatStore.inputText.trim()"
          aria-label="发送消息"
          @click="handleSend"
        >
          <TIcon name="play" :size="14" />
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, nextTick, watch, onMounted, onUnmounted } from "vue";
import { TIcon } from "../utils/icons";
import { useChatStore } from "../stores/chat";
import { useAgentsStore } from "../stores/agents";
import { useProviderStore } from "../stores/provider";
import ModelSelector from "./ModelSelector.vue";
import { useWorkspaceStore } from "../stores/workspace";
import { usePromptStore } from "../stores/prompt";
import ContextPanel from "./ContextPanel.vue";
import RoomManager from "./RoomManager.vue";
import BeamPanel from "./BeamPanel.vue";
import CommandSuggest from "./CommandSuggest.vue";
import SlashCommandMenu from "./SlashCommandMenu.vue";
import PromptSuggest from "./PromptSuggest.vue";
import AgentBrowser from "./AgentBrowser.vue";
import type { AgentDef } from "../stores/agents";
import type { SlashCommand } from "../utils/slash-commands";
import { analyzePrompt, autoEnhancePrompt, type PromptSuggestion } from "../utils/prompt-enhancer";
import { AttentionManager, type AttentionMode } from "../utils/attention-system";
import { CompactionEngine, createToolOutputTrimHook } from "../utils/compaction";
import { TokenBudgetManager, loadBudgets } from "../utils/token-budget";
import { HookManager, createLoggingHook, createNotificationHook } from "../utils/hook-events";
import { globalAgentHooks } from "../utils/agent-hooks";
import { globalSessionRecovery } from "../utils/session-recovery";
import { DirectAgent } from "../utils/direct-agent";
import { globalFileChangeTracker } from "../utils/file-change-tracker";
import { globalSessionReplay } from "../utils/session-replay-manager";
import { globalBriefMode } from "../utils/brief-mode";
import { globalSecretResolver } from "../utils/secret-ref";
import { globalConfigHotReload } from "../utils/config-hot-reload";
import { OrientationGenerator } from "../utils/orientation-card";
import { getToolsForRole } from "../utils/tool-surface";

const chatStore = useChatStore();
const attentionManager = new AttentionManager();
const hookManager = new HookManager();
hookManager.register(createLoggingHook());
hookManager.register(createNotificationHook());

// Agent hooks — detect state from PTY output
const agentHooksUnsub = globalAgentHooks.on((event) => {
  // Update agent status in store
  agentsStore.updateStatus(event.agentId, event.state === "working" ? "running" : event.state === "error" ? "error" : "idle");
});
const orientationGen = new OrientationGenerator();
const compactionEngine = new CompactionEngine();
compactionEngine.registerHook(createToolOutputTrimHook());
const tokenBudgetManager = new TokenBudgetManager();
loadBudgets(tokenBudgetManager);
const agentsStore = useAgentsStore();
const providerStore = useProviderStore();
const promptStore = usePromptStore();
const currentAgent = computed(() => {
  if (chatStore.chatMode === 'group') return agentsStore.activeAgent;
  return agentsStore.agents.find(a => a.id === chatStore.chatTarget) ?? agentsStore.activeAgent;
});
const workspaceStore = useWorkspaceStore();
const showRoomManager = ref(false);
const commandSuggestRef = ref<InstanceType<typeof CommandSuggest> | null>(null);

// ── Slash Command 状态 ──
const slashMenuVisible = ref(false);
const slashMenuPosition = ref({ top: 0, left: 0 });
const slashTrigger = ref<{ startIndex: number } | null>(null);

// ── 内置 Agent 浏览 ──
const showAgentBrowser = ref(false);

// ── 提示词优化建议状态 ──
const promptSuggestions = ref<PromptSuggestion[]>([]);
const suggestVisible = ref(false);
let suggestDebounce: ReturnType<typeof setTimeout> | null = null;

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
  checkSlashTrigger();
  checkPromptSuggestions();
  commandSuggestRef.value?.onInput();
}

function checkSlashTrigger() {
  const textarea = inputRef.value;
  if (!textarea) return;

  const text = textarea.value;
  const cursorPos = textarea.selectionStart;

  const trigger = promptStore.detectSlashTrigger(text, cursorPos);
  if (trigger) {
    // 计算菜单位置（在输入框上方）
    const rect = textarea.getBoundingClientRect();
    slashMenuPosition.value = {
      top: rect.height,
      left: 8,
    };
    slashTrigger.value = trigger;
    slashMenuVisible.value = true;
  } else {
    slashMenuVisible.value = false;
    slashTrigger.value = null;
  }
}

async function handleSlashSelect(command: SlashCommand) {
  const textarea = inputRef.value;
  if (!textarea) return;

  const text = textarea.value;
  const cursorPos = textarea.selectionStart;

  // 移除 /command 部分
  const before = text.slice(0, slashTrigger.value?.startIndex ?? 0);
  const after = text.slice(cursorPos);

  // 执行命令，获取渲染后的文本
  const result = await promptStore.executeCommand(command.id);
  if (result) {
    chatStore.inputText = before + result.text + after;
    slashMenuVisible.value = false;
    slashTrigger.value = null;

    // 聚焦到输入框末尾
    await nextTick();
    const newPos = before.length + result.text.length;
    textarea.setSelectionRange(newPos, newPos);
    textarea.focus();
  }
}

async function handleAgentSelect(agent: { id: string; name: string; emoji: string }) {
  // 加载 Agent 内容并注入到输入框
  try {
    const response = await fetch(`/agency/${agent.id}.md`);
    const text = await response.text();
    chatStore.inputText = `[使用 ${agent.emoji} ${agent.name} 人格]\n\n${text}\n\n---\n\n`;
    showAgentBrowser.value = false;
  } catch (e) {
    console.error('Failed to load agent:', e);
  }
}

function checkPromptSuggestions() {
  // 防抖：输入停止 800ms 后才分析
  if (suggestDebounce) clearTimeout(suggestDebounce);
  suggestDebounce = setTimeout(() => {
    const text = chatStore.inputText.trim();
    if (text.length > 5) {
      const suggestions = analyzePrompt(text);
      promptSuggestions.value = suggestions;
      suggestVisible.value = suggestions.length > 0;
    } else {
      suggestVisible.value = false;
    }
  }, 800);
}

function handleApplySuggestion(s: PromptSuggestion) {
  // 显示建议的修复文本
  const textarea = inputRef.value;
  if (!textarea) return;
  // 在输入框末尾追加提示
  chatStore.inputText += '\n' + s.fix;
  suggestVisible.value = false;
  nextTick(() => {
    textarea.scrollTop = textarea.scrollHeight;
    textarea.focus();
  });
}

function handleAutoFix(s: PromptSuggestion) {
  if (s.autoFix) {
    chatStore.inputText = s.autoFix(chatStore.inputText);
    // 重新分析
    const suggestions = analyzePrompt(chatStore.inputText);
    promptSuggestions.value = suggestions;
    suggestVisible.value = suggestions.length > 0;
  }
}

function handleEnhance() {
  chatStore.inputText = autoEnhancePrompt(chatStore.inputText);
  suggestVisible.value = false;
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
  // Forward to CommandSuggest first; if it handles the key, stop here
  if (commandSuggestRef.value?.handleKeydown(e)) return;

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
  if (commandSuggestRef.value) {
    const active = (commandSuggestRef.value as unknown as { commandState?: { visible: boolean } })?.commandState?.visible
      || (commandSuggestRef.value as unknown as { flagState?: { visible: boolean } })?.flagState?.visible
      || (commandSuggestRef.value as unknown as { subState?: { visible: boolean } })?.subState?.visible;
    if (active) return;
  }

  // Emit hook event for user prompt
  hookManager.emit('user_prompt', {
    agent_id: currentAgent.value.id,
    content: chatStore.inputText.slice(0, 200),
  });

  // Check token budget before sending
  const budgetCheck = tokenBudgetManager.checkBudget('chat');
  if (!budgetCheck.allowed) {
    console.warn('[ChatPanel] Token budget exceeded:', budgetCheck.reason);
    // Still allow send but warn
  }

  // Check attention system — should the target agent wake?
  const wakeDecision = attentionManager.shouldWake(
    currentAgent.value.id,
    'direct',
    'chat',
  );
  if (!wakeDecision.should_wake) {
    console.log(`[ChatPanel] Agent ${currentAgent.value.id} in mode ${attentionManager.getGlobalMode(currentAgent.value.id)}, deferred`);
  }

  try {
    await chatStore.sendMessage();
    // Record token usage after send
    tokenBudgetManager.recordUsage('chat', chatStore.messages.length * 100);
  } catch (e) {
    console.error('handleSend failed:', e);
  }
  scrollToBottom();
}

function handleCommandSelect(value: string) {
  chatStore.inputText = value;
  nextTick(() => {
    if (inputRef.value) {
      inputRef.value.focus();
      inputRef.value.setSelectionRange(value.length, value.length);
    }
  });
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
  border: 1px solid var(--border-light);
  border-radius: 6px;
  background: var(--bg-surface);
  color: var(--text-muted, #565f89);
  font-size: 11px;
  cursor: pointer;
  transition: all 0.15s;
}

.load-more-btn:hover {
  background: var(--bg-active);
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
  font-size: var(--text-xs);
  padding: 2px 6px;
  border-radius: 4px;
  font-family: var(--font-mono);
}

.chat-agent-status.status-idle {
  background: rgba(136,136,136,0.15);
  color: var(--silver);
}

.chat-agent-status.status-running {
  background: rgba(92,207,184,0.15);
  color: var(--accent);
}

.chat-agent-status.status-error {
  background: rgba(239,68,68,0.15);
  color: var(--error);
}

.chat-agent-status.status-disabled {
  background: var(--bg-active);
  color: var(--silver);
}

.chat-agent-status.status-group {
  background: rgba(201,168,92,0.1);
  color: var(--gold, #e0b0ff);
}

.chat-phase {
  font-size: 11px;
  color: var(--text-muted, var(--silver));
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 4px;
}

.chat-round {
  font-size: var(--text-xs);
  color: var(--gold, #e0b0ff);
  opacity: 0.8;
}

.chat-speaking {
  font-size: var(--text-xs);
  color: var(--jade, #5ccfb8);
}

.room-toggle-btn {
  background: var(--bg-active);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-muted, var(--silver));
  font-size: 11px;
  padding: 2px 8px;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}

.room-toggle-btn:hover {
  background: color-mix(in srgb, var(--gold) 10%, transparent);
  color: var(--text-primary);
}

/* Model switcher */
.chat-model-btn {
  display: flex; align-items: center; gap: 3px;
  padding: 2px 6px; border-radius: 4px;
  background: transparent; border: 1px solid var(--border-light);
  color: var(--text-muted); font-size: .58rem; font-family: var(--font-mono);
  cursor: pointer; transition: all .15s; white-space: nowrap;
}
.chat-model-btn:hover { border-color: var(--accent); color: var(--accent); }
.model-btn-name { max-width: 80px; overflow: hidden; text-overflow: ellipsis; }

.model-switcher-dropdown {
  position: absolute; top: 100%; right: 8px; z-index: 100;
  width: 280px; max-height: 320px;
  background: var(--bg-surface); border: 1px solid var(--border-light);
  border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,.3);
  overflow: hidden; display: flex; flex-direction: column;
}
.model-switcher-search {
  width: 100%; padding: 8px 10px;
  background: var(--bg-primary); border: none; border-bottom: 1px solid var(--border-light);
  color: var(--bone); font-family: var(--font-mono); font-size: .62rem; outline: none;
}
.model-switcher-search::placeholder { color: var(--silver); }
.model-switcher-list { overflow-y: auto; max-height: 260px; }
.model-switcher-item {
  display: flex; align-items: center; justify-content: space-between;
  width: 100%; padding: 6px 10px; background: transparent; border: none;
  color: var(--bone-dim); font-size: .62rem; cursor: pointer; text-align: left;
  transition: background .1s;
}
.model-switcher-item:hover { background: var(--bg-hover); }
.model-switcher-item.active { color: var(--jade); background: rgba(80,200,120,.06); }
.model-switcher-name { font-family: var(--font-body); }
.model-switcher-provider { font-family: var(--font-mono); font-size: .5rem; color: var(--silver); }

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
  color: var(--text-muted, var(--silver));
}

.chat-msg-bubble {
  padding: 8px 12px;
  border-radius: 8px;
  font-size: var(--text-base);
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
  background: var(--bg-active);
}

.chat-message.system .chat-msg-bubble {
  background: rgba(201,168,92,0.08);
  color: var(--text-muted, var(--silver));
  font-size: var(--text-sm);
  text-align: center;
}

/* Streaming message styles */
.streaming-bubble {
  border: 1px solid rgba(201,168,92,0.2);
  background: rgba(201,168,92,0.06);
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
  color: var(--text-muted, var(--silver));
}

.chat-empty-glyph {
  font-size: 32px;
  opacity: 0.5;
}

.chat-empty-hint {
  font-size: var(--text-base);
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
  font-size: var(--text-base);
}

.mention-item:hover,
.mention-item.active {
  background: var(--bg-active);
}

.mention-glyph {
  font-size: 14px;
}

.mention-name {
  font-weight: 500;
}

.mention-chinese {
  color: var(--text-muted, var(--silver));
  font-size: var(--text-sm);
}

/* Input area */
.chat-input-area {
  padding: 8px 12px;
  border-top: 1px solid var(--border-light);
  position: relative;
}

.chat-input-wrapper {
  display: flex;
  gap: 8px;
  align-items: flex-end;
}

.chat-input {
  flex: 1;
  background: var(--bg-active);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 12px;
  color: var(--text-primary);
  font-size: var(--text-base);
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

.chat-agent-btn {
  background: var(--bg-surface);
  color: var(--text-muted);
  border: 1px solid var(--border-light);
  border-radius: 8px;
  width: 36px;
  height: 36px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s;
}

.chat-agent-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
  border-color: var(--accent);
}

.chat-agent-btn.active {
  background: var(--accent);
  color: var(--text-inverse);
  border-color: var(--accent);
}

.agent-browser-overlay {
  position: absolute;
  bottom: 100%;
  left: 0;
  right: 0;
  max-height: 400px;
  margin-bottom: 4px;
  background: var(--bg-surface);
  border: 1px solid var(--border-light);
  border-radius: 12px;
  box-shadow: 0 -4px 20px var(--shadow-1, var(--shadow-1, rgba(0,0,0,0.3)));
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.browser-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border-light);
  flex-shrink: 0;
}

.browser-title {
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 6px;
}

.browser-close {
  margin-left: auto;
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
}

.browser-close:hover {
  color: var(--text-primary);
}

.slide-up-enter-active,
.slide-up-leave-active {
  transition: opacity 0.2s, transform 0.2s;
}

.slide-up-enter-from,
.slide-up-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

/* Abort bar */
.abort-bar {
  display: flex;
  justify-content: center;
  padding: 8px 12px;
}

.abort-btn {
  background: rgba(239,68,68,0.15);
  color: var(--vermilion-glow);
  border: 1px solid rgba(239,68,68,0.3);
  border-radius: 6px;
  padding: 6px 20px;
  font-size: var(--text-sm);
  cursor: pointer;
  transition: background 0.15s;
}

.abort-btn:hover {
  background: rgba(239,68,68,0.25);
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
  background: var(--bg-active);
  color: var(--text-muted, var(--silver));
  border: 1px solid var(--border);
}

.decision-btn.reject:hover {
  background: var(--border-light);
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
  border: 2px solid rgba(201,168,92,0.2);
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