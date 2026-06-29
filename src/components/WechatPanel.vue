<template>
  <div class="wechat-panel">
    <!-- Header -->
    <div class="wechat-header">
      <span class="wechat-title">微信 ClawBot</span>
      <span class="wechat-status" :class="{ connected: wechatStore.connected }">
        {{ wechatStore.statusText }}
      </span>
      <button
        v-if="wechatStore.connected"
        class="wechat-disconnect-btn"
        @click="wechatStore.disconnect()"
        title="断开连接"
      >✕</button>
    </div>

    <!-- Login View -->
    <div v-if="!wechatStore.connected" class="wechat-login">
      <div v-if="wechatStore.loginStatus === 'idle'" class="wechat-login-idle">
        <TIcon name="messageCircle" :size="32" />
        <p class="wechat-login-hint">连接微信 ClawBot</p>
        <button class="wechat-login-btn" @click="wechatStore.login()">
          扫码登录
        </button>
        <p v-if="wechatStore.error" class="wechat-login-error">{{ wechatStore.error }}</p>
      </div>

      <div v-else-if="wechatStore.loginStatus === 'waiting'" class="wechat-login-qr">
        <div class="wechat-qr-container">
          <div v-if="wechatStore.qrCode" class="wechat-qr-img">
            <img :src="'data:image/png;base64,' + wechatStore.qrCode" alt="QR Code" />
          </div>
          <div v-else class="wechat-qr-placeholder">
            <span>加载中...</span>
          </div>
        </div>
        <p class="wechat-qr-hint">请使用微信扫描二维码</p>
      </div>

      <div v-else-if="wechatStore.loginStatus === 'scanned'" class="wechat-login-scanned">
        <div class="wechat-scanned-icon"><TIcon name="check" :size="20" /></div>
        <p class="wechat-scanned-hint">已扫码，请在手机上确认登录</p>
      </div>

      <div v-else-if="wechatStore.loginStatus === 'expired'" class="wechat-login-expired">
        <div class="wechat-expired-icon">⟳</div>
        <p class="wechat-expired-hint">二维码已过期</p>
        <button class="wechat-login-btn" @click="wechatStore.login()">
          重新扫码
        </button>
      </div>
    </div>

    <!-- Connected View -->
    <div v-else class="wechat-connected">
      <!-- Conversation List -->
      <div class="wechat-conversations">
        <div
          v-for="conv in wechatStore.conversationList"
          :key="conv.id"
          class="wechat-conv-item"
          :class="{ active: conv.id === wechatStore.activeCid }"
          @click="wechatStore.activeCid = conv.id"
        >
          <span class="wechat-conv-name">{{ conv.label }}</span>
          <span class="wechat-conv-time">{{ formatConvTime(conv.updatedAt) }}</span>
          <span v-if="conv.messages.length > 0" class="wechat-conv-badge">
            {{ conv.messages.length }}
          </span>
        </div>
        <div v-if="wechatStore.conversationList.length === 0" class="wechat-conv-empty">
          暂无对话
        </div>
      </div>

      <!-- Chat Area -->
      <div class="wechat-chat">
        <!-- Messages -->
        <div class="wechat-messages" ref="messagesRef">
          <template v-if="activeConv">
            <div
              v-for="msg in activeConv.messages"
              :key="msg.id"
              class="wechat-msg"
              :class="msg.role"
            >
              <span class="wechat-msg-meta">
                {{ msg.role === 'user' ? '你' : msg.role === 'assistant' ? 'AI' : '系统' }}
                · {{ msg.time }}
              </span>
              <div class="wechat-msg-bubble">{{ msg.text }}</div>
              <div v-if="msg.images && msg.images.length > 0" class="wechat-msg-images">
                <div v-for="(img, i) in msg.images" :key="i" class="wechat-msg-img">
                  <img :src="img" alt="Media" />
                </div>
              </div>
            </div>
          </template>
          <div v-else class="wechat-chat-empty">
            <TIcon name="messageCircle" :size="48" />
            <span class="wechat-empty-hint">选择一个对话开始</span>
          </div>
        </div>

        <!-- Input -->
        <div class="wechat-input-area">
          <textarea
            ref="inputRef"
            class="wechat-input"
            v-model="inputText"
            placeholder="输入消息..."
            rows="1"
            @keydown.enter.exact.prevent="handleSend"
            @dragover.prevent="handleDragOver"
            @drop.prevent="handleDrop"
          />
          <button
            class="wechat-send-btn"
            :disabled="!inputText.trim()"
            @click="handleSend"
          ><TIcon name="play" :size="14" /></button>
        </div>
      </div>

      <!-- Settings Panel (toggle) -->
      <div v-if="showSettings" class="wechat-settings">
        <div class="wechat-settings-header">
          <span>设置</span>
          <button class="wechat-settings-close" @click="showSettings = false">✕</button>
        </div>

        <div class="wechat-settings-group">
          <label class="wechat-settings-label">目标 Agent</label>
          <select v-model="wechatStore.target" class="wechat-settings-select">
            <option value="claude">Claude (梅)</option>
            <option value="codex">Codex (兰)</option>
          </select>
        </div>

        <div class="wechat-settings-group">
          <label class="wechat-settings-label">人格提示词</label>
          <textarea
            v-model="wechatStore.persona"
            class="wechat-settings-textarea"
            rows="3"
            placeholder="定义 AI 的性格..."
          />
        </div>

        <div class="wechat-settings-group">
          <label class="wechat-settings-label">工作目录</label>
          <input
            v-model="wechatStore.agentCwd"
            class="wechat-settings-input"
            placeholder="/Users/..."
          />
        </div>

        <button class="wechat-settings-save" @click="wechatStore.saveState(); showSettings = false">
          保存设置
        </button>
      </div>

      <!-- Toolbar -->
      <div class="wechat-toolbar">
        <button
          class="wechat-toolbar-btn"
          :class="{ active: showSettings }"
          @click="showSettings = !showSettings"
          title="设置"
        >⚙</button>
        <button
          class="wechat-toolbar-btn"
          @click="wechatStore.checkConnection()"
          title="检查连接"
        >↻</button>
        <span class="wechat-toolbar-status" :class="{ connected: wechatStore.connected }">
          {{ wechatStore.connected ? '在线' : '离线' }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { TIcon } from "../utils/icons";
import { useWechatStore } from '../stores/wechat'

const wechatStore = useWechatStore()

const messagesRef = ref<HTMLElement | null>(null)
const inputRef = ref<HTMLTextAreaElement | null>(null)
const inputText = ref('')
const showSettings = ref(false)

const activeConv = computed(() => wechatStore.activeConversation)

// Auto-scroll on new messages
watch(
  () => activeConv.value?.messages.length,
  async () => {
    await nextTick()
    if (messagesRef.value) {
      messagesRef.value.scrollTop = messagesRef.value.scrollHeight
    }
  }
)

function formatConvTime(ts?: number): string {
  if (!ts) return ''
  const d = new Date(ts)
  return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}

async function handleSend() {
  const text = inputText.value.trim()
  if (!text) return

  inputText.value = ''
  await wechatStore.sendMessage(text)

  await nextTick()
  if (messagesRef.value) {
    messagesRef.value.scrollTop = messagesRef.value.scrollHeight
  }
}

function handleDragOver(e: DragEvent) {
  e.preventDefault()
}

async function handleDrop(e: DragEvent) {
  e.preventDefault()

  const files = e.dataTransfer?.files
  if (!files || files.length === 0) return

  const cid = wechatStore.activeCid
  const account = wechatStore.account

  if (!account) {
    wechatStore.pushMessage(cid, 'system', '⚠ 请先连接微信')
    return
  }

  for (const file of files) {
    try {
      // Read file via browser FileReader API
      const arrayBuffer = await file.arrayBuffer()
      const data = new Uint8Array(arrayBuffer)

      // Import sendMedia from the composable
      const { sendMedia } = await import('../composables/useWechat')
      const contextToken = wechatStore.activeConversation?.messages.find(m => m.contextToken)?.contextToken

      await sendMedia(account, cid, file.name, file.name, data, contextToken)
      wechatStore.pushMessage(cid, 'system', `📎 已发送: ${file.name}`)
    } catch (err) {
      wechatStore.pushMessage(cid, 'system', `⚠ 发送失败 ${file.name}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
}

onMounted(() => {
  // Focus input on mount
  inputRef.value?.focus()
})
</script>

<style scoped>
.wechat-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-secondary);
  border-left: 1px solid var(--border-light);
  color: var(--text-primary);
  font-family: var(--font-body);
  overflow: hidden;
}

/* ── Header ── */
.wechat-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--bg-tertiary);
  border-bottom: 1px solid var(--border-light);
  flex-shrink: 0;
}

.wechat-title {
  font-family: var(--font-brush);
  font-size: 16px;
  color: var(--gold);
  letter-spacing: 1px;
}

.wechat-status {
  font-size: 11px;
  color: var(--text-muted);
  margin-left: auto;
}

.wechat-status.connected {
  color: var(--accent);
}

.wechat-disconnect-btn {
  background: none;
  border: 1px solid var(--border);
  color: var(--text-muted);
  cursor: pointer;
  padding: 2px 6px;
  border-radius: var(--radius-sm);
  font-size: 11px;
  transition: all var(--transition-fast);
}

.wechat-disconnect-btn:hover {
  color: var(--vermilion-glow);
  border-color: color-mix(in srgb, var(--vermilion-glow) 40%, transparent);
}

/* ── Login ── */
.wechat-login {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.wechat-login-idle {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  text-align: center;
}

.wechat-login-icon {
  font-family: var(--font-brush);
  font-size: 3rem;
  color: var(--accent);
  opacity: 0.6;
}

.wechat-login-hint {
  color: var(--text-secondary);
  font-size: 13px;
}

.wechat-login-btn {
  background: var(--accent);
  color: var(--text-inverse);
  border: none;
  padding: 8px 24px;
  border-radius: var(--radius-md);
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: background var(--transition-fast);
}

.wechat-login-btn:hover {
  background: var(--accent-hover);
}

.wechat-login-error {
  color: var(--vermilion-glow);
  font-size: 12px;
  margin-top: 4px;
}

/* QR Code */
.wechat-login-qr {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.wechat-qr-container {
  width: 200px;
  height: 200px;
  background: white;
  border-radius: var(--radius-md);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.wechat-qr-img img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.wechat-qr-placeholder {
  color: var(--text-primary);
  font-size: 13px;
}

.wechat-qr-hint {
  color: var(--text-secondary);
  font-size: 12px;
}

/* Scanned */
.wechat-login-scanned {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.wechat-scanned-icon {
  font-size: 3rem;
  color: var(--accent);
}

.wechat-scanned-hint {
  color: var(--text-secondary);
  font-size: 13px;
}

/* Expired */
.wechat-login-expired {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.wechat-expired-icon {
  font-size: 3rem;
  color: var(--text-muted);
}

.wechat-expired-hint {
  color: var(--text-secondary);
  font-size: 13px;
}

/* ── Connected View ── */
.wechat-connected {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ── Conversations List ── */
.wechat-conversations {
  max-height: 120px;
  overflow-y: auto;
  border-bottom: 1px solid var(--border-light);
  flex-shrink: 0;
}

.wechat-conv-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  cursor: pointer;
  transition: background var(--transition-fast);
}

.wechat-conv-item:hover {
  background: var(--bg-hover);
}

.wechat-conv-item.active {
  background: var(--bg-elevated);
  border-left: 2px solid var(--accent);
}

.wechat-conv-name {
  font-size: 12px;
  color: var(--text-primary);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.wechat-conv-time {
  font-size: 10px;
  color: var(--text-muted);
}

.wechat-conv-badge {
  font-size: 10px;
  background: var(--accent-muted);
  color: var(--text-inverse);
  padding: 1px 6px;
  border-radius: 8px;
}

.wechat-conv-empty {
  padding: 16px;
  text-align: center;
  color: var(--text-muted);
  font-size: 12px;
}

/* ── Chat Area ── */
.wechat-chat {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.wechat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.wechat-msg {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.wechat-msg.user {
  align-items: flex-end;
}

.wechat-msg.assistant {
  align-items: flex-start;
}

.wechat-msg.system {
  align-items: center;
}

.wechat-msg-meta {
  font-size: 10px;
  color: var(--text-muted);
  padding: 0 4px;
}

.wechat-msg-bubble {
  max-width: 85%;
  padding: 6px 10px;
  border-radius: var(--radius-md);
  font-size: 13px;
  line-height: 1.4;
  word-break: break-word;
  white-space: pre-wrap;
}

.wechat-msg.user .wechat-msg-bubble {
  background: var(--accent-muted);
  color: var(--text-primary);
  border-bottom-right-radius: var(--radius-sm);
}

.wechat-msg.assistant .wechat-msg-bubble {
  background: var(--bg-surface);
  color: var(--text-primary);
  border-bottom-left-radius: var(--radius-sm);
}

.wechat-msg.system .wechat-msg-bubble {
  background: transparent;
  color: var(--text-muted);
  font-size: 11px;
  padding: 4px 8px;
}

.wechat-msg-images {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  margin-top: 4px;
}

.wechat-msg-img {
  width: 80px;
  height: 80px;
  border-radius: var(--radius-sm);
  overflow: hidden;
  background: var(--bg-surface);
}

.wechat-msg-img img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.wechat-chat-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  opacity: 0.5;
}

.wechat-empty-glyph {
  font-family: var(--font-brush);
  font-size: 2.5rem;
  color: var(--accent);
}

.wechat-empty-hint {
  font-size: 12px;
  color: var(--text-muted);
}

/* ── Input Area ── */
.wechat-input-area {
  display: flex;
  gap: 6px;
  padding: 8px 12px;
  border-top: 1px solid var(--border-light);
  background: var(--bg-tertiary);
  flex-shrink: 0;
}

.wechat-input {
  flex: 1;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  padding: 6px 10px;
  font-size: 13px;
  font-family: var(--font-body);
  resize: none;
  outline: none;
  transition: border-color var(--transition-fast);
}

.wechat-input:focus {
  border-color: var(--accent-muted);
}

.wechat-input::placeholder {
  color: var(--text-muted);
}

.wechat-send-btn {
  background: var(--accent);
  color: var(--text-inverse);
  border: none;
  border-radius: var(--radius-md);
  padding: 6px 12px;
  cursor: pointer;
  font-size: 12px;
  transition: background var(--transition-fast);
}

.wechat-send-btn:hover:not(:disabled) {
  background: var(--accent-hover);
}

.wechat-send-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* ── Settings Panel ── */
.wechat-settings {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 280px;
  background: var(--bg-tertiary);
  border-left: 1px solid var(--border-light);
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
  z-index: 10;
}

.wechat-settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
}

.wechat-settings-close {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 14px;
}

.wechat-settings-close:hover {
  color: var(--text-primary);
}

.wechat-settings-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.wechat-settings-label {
  font-size: 11px;
  color: var(--text-muted);
}

.wechat-settings-select,
.wechat-settings-input {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  padding: 6px 8px;
  font-size: 12px;
  font-family: var(--font-body);
  outline: none;
}

.wechat-settings-textarea {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  padding: 6px 8px;
  font-size: 12px;
  font-family: var(--font-body);
  resize: vertical;
  outline: none;
}

.wechat-settings-save {
  background: var(--accent);
  color: var(--text-inverse);
  border: none;
  border-radius: var(--radius-sm);
  padding: 8px;
  cursor: pointer;
  font-size: 12px;
  transition: background var(--transition-fast);
}

.wechat-settings-save:hover {
  background: var(--accent-hover);
}

/* ── Toolbar ── */
.wechat-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-top: 1px solid var(--border-light);
  background: var(--bg-tertiary);
  flex-shrink: 0;
}

.wechat-toolbar-btn {
  background: none;
  border: 1px solid var(--border);
  color: var(--text-muted);
  cursor: pointer;
  padding: 4px 8px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  transition: all var(--transition-fast);
}

.wechat-toolbar-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.wechat-toolbar-btn.active {
  background: var(--bg-elevated);
  border-color: var(--accent-muted);
  color: var(--accent);
}

.wechat-toolbar-status {
  margin-left: auto;
  font-size: 10px;
  color: var(--text-muted);
}

.wechat-toolbar-status.connected {
  color: var(--accent);
}
</style>
