import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { invoke, Channel } from '@tauri-apps/api/core'
import {
  fetchQrcode,
  pollQrStatus,
  getUpdates,
  sendText,
  sendTyping,
  sendMedia,
  ping,
  contentFromMsg,
  downloadMedia,
} from '../composables/useWechat'
import type { WechatAccount, WechatMessage } from '../composables/useWechat'
import { useAgentsStore } from './agents'
import { useWorkspaceStore } from './workspace'

// ── Types ──

export interface WechatMsg {
  id: string
  role: 'user' | 'assistant' | 'system'
  text: string
  time: string
  images?: string[]
  fromUserId?: string
  contextToken?: string
}

export interface WechatConversation {
  id: string
  label: string
  messages: WechatMsg[]
  updatedAt?: number
}

// ── WeChat Protocol Constants ──

const WX_FILE_PROTOCOL = `如果要你把某个文件或图片发到微信，在回复的最末尾追加：<wxfile>文件的绝对路径</wxfile>`
const WX_TERM_PROTOCOL = `要往某个终端输入内容，在回复末尾追加：<term n="编号">要输入的文本</term>`

// ── Tag Parsing Helpers ──

/** Strip ANSI escape sequences from a string. */
function cleanAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').replace(/\x1b\][^\x07]*\x07/g, '')
}

/** Wait for stable output — resolves when no new data arrives for `idleMs`. */
function waitForStableOutput(
  getBuffer: () => string,
  idleMs: number,
  timeoutMs: number,
): Promise<string> {
  return new Promise((resolve) => {
    let lastLen = getBuffer().length
    let elapsed = 0
    const interval = 200
    const timer = setInterval(() => {
      elapsed += interval
      const curLen = getBuffer().length
      if (curLen > lastLen) {
        lastLen = curLen
        elapsed = 0
      }
      if (elapsed >= idleMs || elapsed >= timeoutMs) {
        clearInterval(timer)
        resolve(getBuffer())
      }
    }, interval)
  })
}

interface ExtractedFile {
  path: string
}

interface TermOp {
  n: string
  data: string
}

/**
 * Parse <wxfile>...</wxfile> tags from reply text.
 * Returns cleaned text and list of file paths.
 */
function extractFiles(reply: string): { clean: string; files: ExtractedFile[] } {
  const files: ExtractedFile[] = []
  const clean = reply.replace(/<wxfile>([\s\S]*?)<\/wxfile>/g, (_, path) => {
    const trimmed = path.trim()
    if (trimmed) files.push({ path: trimmed })
    return ''
  }).trim()
  return { clean, files }
}

/**
 * Parse <term n="N">...</term> tags from reply text.
 * Returns cleaned text and list of terminal operations.
 */
function extractTermOps(reply: string): { clean: string; ops: TermOp[] } {
  const ops: TermOp[] = []
  const clean = reply.replace(/<term\s+n="(\d+)">([\s\S]*?)<\/term>/g, (_, n, data) => {
    ops.push({ n, data: data.trim() })
    return ''
  }).trim()
  return { clean, ops }
}

/** Write commands to other PTY sessions by agent index. */
async function runTermOps(ops: TermOp[]): Promise<void> {
  for (const op of ops) {
    try {
      // Get list of active PTY sessions
      const sessions: { id: number }[] = await invoke('pty_list').catch(() => [])
      const targetSession = sessions[parseInt(op.n)]
      if (targetSession) {
        await invoke('pty_write', { id: targetSession.id, data: op.data + '\n' })
      }
    } catch (err) {
      console.warn(`Term op ${op.n} failed:`, err)
    }
  }
}

/** Send extracted file paths to WeChat via sendMedia. */
async function sendFiles(
  account: WechatAccount,
  cid: string,
  files: ExtractedFile[],
  contextToken?: string,
): Promise<void> {
  for (const f of files) {
    try {
      const fileName = f.path.split('/').pop() ?? f.path
      // Read file via Tauri FS
      const b64: string = await invoke('read_file_bytes', { path: f.path })
      const binaryStr = atob(b64)
      const uint8 = new Uint8Array(binaryStr.length)
      for (let i = 0; i < binaryStr.length; i++) uint8[i] = binaryStr.charCodeAt(i)
      await sendMedia(account, cid, f.path, fileName, uint8, contextToken)
    } catch (err) {
      console.warn(`sendFiles ${f.path} failed:`, err)
    }
  }
}

/** Build terminal context string (lists active PTY sessions). */
async function buildTermContext(): Promise<string> {
  try {
    const sessions: { id: number; agentId?: string; title?: string }[] =
      await invoke('pty_list').catch(() => [])
    if (sessions.length === 0) return ''
    const lines = sessions.map((s, i) => `  终端 ${i}: ${s.agentId ?? s.title ?? 'unknown'} (id=${s.id})`)
    return `当前活跃的终端会话:\n${lines.join('\n')}`
  } catch {
    return ''
  }
}

// ── Store ──

export const useWechatStore = defineStore('wechat', () => {
  // State
  const connected = ref(false)
  const expired = ref(false)
  const account = ref<WechatAccount | null>(null)
  const conversations = ref<Record<string, WechatConversation>>({})
  const activeCid = ref('desktop')
  const persona = ref('你是一个 helpful AI assistant。请用中文回复。')
  const target = ref<'claude' | 'codex'>('claude')
  const qrCode = ref('')
  const loginStatus = ref<'idle' | 'waiting' | 'scanned' | 'confirmed' | 'expired'>('idle')
  const pollingActive = ref(false)
  const error = ref('')
  const agentCwd = ref('')

  // Internal
  let pollAbort: AbortController | null = null
  let pollBuf = ''
  let pollTimer: ReturnType<typeof setTimeout> | null = null

  // ── Computed ──

  const activeConversation = computed(() => conversations.value[activeCid.value] ?? null)

  const conversationList = computed(() => {
    return Object.values(conversations.value).sort(
      (a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0)
    )
  })

  const statusText = computed(() => {
    switch (loginStatus.value) {
      case 'waiting': return '等待扫码...'
      case 'scanned': return '已扫码，请确认...'
      case 'confirmed': return '已确认，连接中...'
      case 'expired': return '二维码已过期'
      default: return connected.value ? '已连接' : '未连接'
    }
  })

  // ── Login Flow ──

  async function login(): Promise<void> {
    try {
      error.value = ''
      loginStatus.value = 'waiting'

      const qr = await fetchQrcode()
      qrCode.value = qr.qrcode_img_content
      loginStatus.value = 'waiting'

      // Poll for QR status
      const baseUrl = 'https://ilinkai.weixin.qq.com'
      let attempts = 0
      const maxAttempts = 120 // ~2 minutes

      while (attempts < maxAttempts) {
        attempts++
        await new Promise(resolve => setTimeout(resolve, 1000))

        try {
          const status = await pollQrStatus(baseUrl, qr.qrcode)

          const errcode = status.errcode as number
          const statusVal = status.status as number | undefined

          if (errcode === 0 && statusVal === 1) {
            // Scanned but not confirmed
            loginStatus.value = 'scanned'
          } else if (errcode === 0 && statusVal === 2) {
            // Confirmed
            loginStatus.value = 'confirmed'
            account.value = {
              token: (status.token ?? status.bot_token ?? '') as string,
              baseUrl: (status.base_url ?? baseUrl) as string,
              accountId: (status.bot_uin ?? status.account_id ?? '') as string,
              userId: (status.user_name ?? '') as string,
            }
            connected.value = true
            expired.value = false
            loginStatus.value = 'confirmed'
            saveState()
            startPolling()
            return
          } else if (errcode !== 0) {
            // Error or expired
            loginStatus.value = 'expired'
            error.value = (status.errmsg as string) ?? 'QR code expired'
            return
          }
        } catch {
          // Network error, continue polling
        }
      }

      loginStatus.value = 'expired'
      error.value = '登录超时'
    } catch (err) {
      loginStatus.value = 'idle'
      error.value = err instanceof Error ? err.message : String(err)
    }
  }

  async function disconnect(): Promise<void> {
    stopPolling()
    account.value = null
    connected.value = false
    expired.value = false
    qrCode.value = ''
    loginStatus.value = 'idle'
    error.value = ''
    saveState()
  }

  async function checkConnection(): Promise<boolean> {
    if (!account.value) return false

    try {
      const ok = await ping(account.value)
      if (!ok) {
        connected.value = false
        expired.value = true
      }
      return ok
    } catch {
      connected.value = false
      expired.value = true
      return false
    }
  }

  // ── Message Handling ──

  function pushMessage(
    cid: string,
    role: WechatMsg['role'],
    text: string,
    images?: string[],
    fromUserId?: string,
    contextToken?: string,
  ) {
    if (!conversations.value[cid]) {
      conversations.value[cid] = {
        id: cid,
        label: cid === 'desktop' ? '桌面端' : cid,
        messages: [],
        updatedAt: Date.now(),
      }
    }

    const now = new Date()
    const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`

    conversations.value[cid].messages.push({
      id: crypto.randomUUID(),
      role,
      text,
      time,
      images,
      fromUserId,
      contextToken,
    })

    conversations.value[cid].updatedAt = Date.now()

    // Keep max 500 messages per conversation
    const conv = conversations.value[cid]
    if (conv.messages.length > 500) {
      conv.messages = conv.messages.slice(-500)
    }
  }

  async function sendMessage(text: string): Promise<void> {
    if (!text.trim()) return

    const cid = activeCid.value

    if (cid === 'desktop') {
      // Send to local agent
      pushMessage(cid, 'user', text)
      await runAgent(cid, text)
    } else {
      // Send to WeChat contact
      pushMessage(cid, 'user', text)
      await sendToWechat(cid, text)
    }
  }

  async function sendToWechat(cid: string, text: string): Promise<void> {
    if (!account.value) {
      pushMessage(cid, 'system', '⚠ 未连接到微信')
      return
    }

    try {
      const conv = conversations.value[cid]
      const contextToken = conv?.messages.find(m => m.contextToken)?.contextToken
      await sendText(account.value, cid, text, contextToken)
    } catch (err) {
      pushMessage(cid, 'system', `⚠ 发送失败: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // ── Polling ──

  async function startPolling(): Promise<void> {
    if (!account.value || pollingActive.value) return

    pollingActive.value = true
    pollAbort = new AbortController()
    pollBuf = ''

    pushMessage('desktop', 'system', '✓ 已开始监听微信消息')

    await pollLoop()
  }

  function stopPolling(): void {
    pollingActive.value = false
    pollAbort?.abort()
    pollAbort = null
    if (pollTimer) {
      clearTimeout(pollTimer)
      pollTimer = null
    }
  }

  async function pollLoop(): Promise<void> {
    if (!pollingActive.value || !account.value) return

    try {
      const { messages, buf } = await getUpdates(
        account.value,
        pollBuf,
        35000,
        pollAbort?.signal,
      )

      pollBuf = buf

      for (const msg of messages) {
        await enqueueMsg(msg)
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return // Normal abort
      }
      console.warn('WeChat poll error:', err)

      // Check connection on error
      const ok = await checkConnection()
      if (!ok) {
        pushMessage('desktop', 'system', '⚠ 微信连接已断开')
        stopPolling()
        return
      }
    }

    // Continue polling
    if (pollingActive.value) {
      pollTimer = setTimeout(pollLoop, 100)
    }
  }

  async function enqueueMsg(msg: WechatMessage): Promise<void> {
    const { text, medias } = contentFromMsg(msg)
    const cid = msg.fromUserId || 'unknown'

    // Ensure conversation exists
    if (!conversations.value[cid]) {
      conversations.value[cid] = {
        id: cid,
        label: cid,
        messages: [],
        updatedAt: Date.now(),
      }
    }

    // Handle media downloads
    const images: string[] = []
    for (const media of medias) {
      try {
        const { fileName, data } = await downloadMedia(media, '')
        // Store as base64 for display
        const b64 = btoa(String.fromCharCode(...data))
        images.push(`data:application/octet-stream;base64,${b64}`)
      } catch (err) {
        console.warn('Media download failed:', err)
      }
    }

    if (text || images.length > 0) {
      pushMessage(cid, 'user', text, images.length > 0 ? images : undefined, msg.fromUserId, msg.contextToken)

      // Send typing indicator
      if (account.value) {
        sendTyping(account.value, cid, true).catch(() => {})
      }

      // Forward to agent if auto-reply is enabled
      if (text) {
        await runAgent(cid, text)
      }

      // Stop typing
      if (account.value) {
        sendTyping(account.value, cid, false).catch(() => {})
      }
    }
  }

  // ── Agent Integration ──

  async function runAgent(cid: string, text: string): Promise<void> {
    const conv = conversations.value[cid]
    if (!conv) return

    const agentsStore = useAgentsStore()
    const workspaceStore = useWorkspaceStore()
    const agent = agentsStore.agents.find(a => a.id === target.value) || agentsStore.agents[0]
    const cwd = agentCwd.value || workspaceStore.path || ''

    // Build system prompt (like FanBox bridge.js)
    const sys = [
      persona.value,
      WX_FILE_PROTOCOL,
      WX_TERM_PROTOCOL,
      await buildTermContext(),
    ].filter(Boolean).join('\n\n')

    // Build conversation context from recent messages
    const recentMsgs = conv.messages.slice(-10)
    const context = recentMsgs
      .map(m => `${m.role === 'user' ? '用户' : 'AI'}: ${m.text}`)
      .join('\n')

    const fullPrompt = context ? `${sys}\n\n对话历史:\n${context}\n\n请回复最新消息: ${text}` : `${sys}\n\n${text}`

    try {
      // Create PTY channel, spawn agent, write prompt, capture response
      const on_data = new Channel<string>()
      let buffer = ''

      on_data.onmessage = (data: string) => {
        buffer += data
      }

      // Spawn agent PTY
      const ptyId: number = await invoke('spawn_agent', {
        agentId: agent.id,
        cwd: cwd || null,
        cols: 80,
        rows: 24,
        onData: on_data,
      })

      // Send the full prompt
      await invoke('pty_write', { id: ptyId, data: fullPrompt + '\n' })

      // Wait for stable output (2s idle, or 30s timeout)
      const rawOutput = await waitForStableOutput(() => buffer, 2000, 30_000)

      // Clean up PTY
      await invoke('pty_kill', { id: ptyId }).catch(() => {})

      // Clean ANSI and process response
      const responseText = cleanAnsi(rawOutput).trim()
      if (!responseText) {
        pushMessage(cid, 'assistant', '[无响应]')
        return
      }

      // Parse response tags
      const termResult = extractTermOps(responseText)
      const fileResult = extractFiles(termResult.clean)
      const cleanReply = fileResult.clean

      // Display the cleaned response
      pushMessage(cid, 'assistant', cleanReply)

      // Execute terminal operations (write to other PTY sessions)
      if (termResult.ops.length > 0) {
        await runTermOps(termResult.ops)
        pushMessage(cid, 'system', `⌨ 已执行 ${termResult.ops.length} 个终端操作`)
      }

      // Send files to WeChat if this is a WeChat conversation
      if (fileResult.files.length > 0 && cid !== 'desktop' && account.value) {
        const contextToken = conv.messages.find(m => m.contextToken)?.contextToken
        await sendFiles(account.value, cid, fileResult.files, contextToken)
        pushMessage(cid, 'system', `📎 已发送 ${fileResult.files.length} 个文件`)
      }

      // If this is a WeChat conversation, send reply back
      if (cid !== 'desktop' && account.value && cleanReply) {
        const contextToken = conv.messages.find(m => m.contextToken)?.contextToken
        await sendText(account.value, cid, cleanReply, contextToken)
      }
    } catch (err) {
      console.warn('Agent spawn failed:', err)
      pushMessage(cid, 'assistant', `[${target.value}] 处理失败: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // ── Persistence ──

  function saveState() {
    try {
      localStorage.setItem('yuai-wechat-account', JSON.stringify(account.value))
      localStorage.setItem('yuai-wechat-connected', String(connected.value))
      localStorage.setItem('yuai-wechat-target', target.value)
      localStorage.setItem('yuai-wechat-persona', persona.value)
      localStorage.setItem('yuai-wechat-cwd', agentCwd.value)
    } catch {
      // ignore
    }
  }

  function loadState() {
    try {
      const accStr = localStorage.getItem('yuai-wechat-account')
      if (accStr) {
        account.value = JSON.parse(accStr)
      }

      const connStr = localStorage.getItem('yuai-wechat-connected')
      if (connStr === 'true' && account.value) {
        connected.value = true
      }

      const targetStr = localStorage.getItem('yuai-wechat-target')
      if (targetStr === 'claude' || targetStr === 'codex') {
        target.value = targetStr
      }

      const personaStr = localStorage.getItem('yuai-wechat-persona')
      if (personaStr) {
        persona.value = personaStr
      }

      const cwdStr = localStorage.getItem('yuai-wechat-cwd')
      if (cwdStr) {
        agentCwd.value = cwdStr
      }
    } catch {
      // ignore
    }
  }

  // Auto-save on changes
  function watchAndSave() {
    // Use a simple approach: save periodically
    setInterval(() => {
      if (connected.value) saveState()
    }, 30000)
  }

  // Initialize
  loadState()
  watchAndSave()

  // Auto-reconnect if we have saved credentials
  if (connected.value && account.value) {
    checkConnection().then(ok => {
      if (ok) {
        startPolling()
      } else {
        connected.value = false
        expired.value = true
      }
    })
  }

  return {
    // State
    connected,
    expired,
    account,
    conversations,
    activeCid,
    persona,
    target,
    qrCode,
    loginStatus,
    pollingActive,
    error,
    agentCwd,

    // Computed
    activeConversation,
    conversationList,
    statusText,

    // Actions
    login,
    disconnect,
    checkConnection,
    sendMessage,
    sendToWechat,
    pushMessage,
    startPolling,
    stopPolling,
    runAgent,
    saveState,
    loadState,
  }
})
