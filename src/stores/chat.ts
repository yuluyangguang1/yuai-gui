import { defineStore } from "pinia";
import { ref, computed, watch } from "vue";
import { invoke, Channel } from "@tauri-apps/api/core";
import { useAgentsStore } from "./agents";
import { cleanAnsi } from "../utils/format";

export type ChatPhase = "idle" | "thinking" | "generating" | "tool_call" | "error";

export interface StreamingMessage {
  id: string;
  content: string;
  agentId: string;
}

// ══════════════════════════════════════════════
// Thread Grouping (inspired by Codex Tracker)
// ══════════════════════════════════════════════

export interface ThreadInfo {
  threadId: string;
  parentThreadId: string | null;
  childThreadIds: string[];
  title: string;
  createdAt: number;
}

export const useChatStore = defineStore("chat", () => {
  type ChatMode = 'single' | 'group' | 'beam';
  const chatMode = ref<ChatMode>('single');
  const chatTarget = ref<string>('hermes'); // agentId for single mode

  function setChatMode(mode: ChatMode) {
    chatMode.value = mode;
    // Reset group chat state when switching modes
    showDecision.value = false;
    execStatus.value = 'idle';
    round.value = 0;
    streamingMessage.value = null;
    phase.value = 'idle';
  }

  function setChatTarget(agentId: string) {
    chatTarget.value = agentId;
    chatMode.value = 'single';
  }

  const phase = ref<ChatPhase>("idle");
  const round = ref(0);
  const inputText = ref("");
  const discussionAborted = ref(false);
  const showDecision = ref(false);
  const compressedSummary = ref<string>("");
  const TOKEN_THRESHOLD = 100_000;
  let compressionTriggered = false;

  // Execution status: idle | running | done | error
  type ExecStatus = "idle" | "running" | "done" | "error";
  const execStatus = ref<ExecStatus>("idle");

  // Streaming message state
  const streamingMessage = ref<StreamingMessage | null>(null);
  let streamingStableTimer: ReturnType<typeof setTimeout> | null = null;

  // Persistent agent sessions: agentId → ptyId
  const agentSessions = ref<Map<string, number>>(new Map());
  // Per-agent output buffers
  const agentBuffers: Record<string, string> = {};

  const agentsStore = useAgentsStore();

  const messages = computed(() => agentsStore.activeMessages);

  // ── Thread Grouping ──
  const currentThreadId = ref<string>('default');
  const threads = ref<Map<string, ThreadInfo>>(new Map());

  /** Create a new thread, optionally linked to a parent. */
  function createThread(title: string, parentThreadId?: string): string {
    const threadId = `thread_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const thread: ThreadInfo = {
      threadId,
      parentThreadId: parentThreadId ?? null,
      childThreadIds: [],
      title,
      createdAt: Date.now(),
    };
    threads.value.set(threadId, thread);

    // Link to parent
    if (parentThreadId) {
      const parent = threads.value.get(parentThreadId);
      if (parent) {
        parent.childThreadIds = [...parent.childThreadIds, threadId];
      }
    }

    return threadId;
  }

  /** Switch to a different thread. */
  function switchThread(threadId: string) {
    if (threads.value.has(threadId)) {
      currentThreadId.value = threadId;
    }
  }

  /** Get messages grouped by thread. */
  function getThreadMessages(threadId: string) {
    return messages.value.filter((m) => (m as Record<string, unknown>).threadId === threadId);
  }

  /** Navigate to parent thread. */
  function navigateToParent() {
    const current = threads.value.get(currentThreadId.value);
    if (current?.parentThreadId) {
      switchThread(current.parentThreadId);
    }
  }

  /** Navigate to a child thread. */
  function navigateToChild(index: number) {
    const current = threads.value.get(currentThreadId.value);
    if (current?.childThreadIds[index]) {
      switchThread(current.childThreadIds[index]);
    }
  }

  /** Get the current thread info. */
  const currentThread = computed(() => threads.value.get(currentThreadId.value) ?? null);

  /** Get all threads. */
  const allThreads = computed(() => Array.from(threads.value.values()));

  /** Get child threads of current thread. */
  const childThreads = computed(() => {
    const current = threads.value.get(currentThreadId.value);
    if (!current) return [];
    return current.childThreadIds
      .map(id => threads.value.get(id))
      .filter((t): t is ThreadInfo => t !== undefined);
  });

  // Token estimate: approximate tokens as character count / 4
  const tokenEstimate = computed(() => {
    let totalChars = 0;
    for (const msg of messages.value) {
      totalChars += msg.content.length;
    }
    return Math.ceil(totalChars / 4);
  });

  // Watch for threshold exceeded and auto-compress
  watch(tokenEstimate, async (tokens) => {
    if (tokens > TOKEN_THRESHOLD && !compressionTriggered) {
      compressionTriggered = true;
      try {
        const summary: string = await invoke("compress_context", {
          roomId: workspacePath ?? 'default',
          messages: messages.value.map(m => m.content),
        });
        compressedSummary.value = summary;
      } catch (e) {
        console.warn("Context compression failed:", e);
      }
    }
    if (tokens <= TOKEN_THRESHOLD) {
      compressionTriggered = false;
    }
  });

  async function manualCompress() {
    try {
      const summary: string = await invoke("compress_context", {
        roomId: workspacePath ?? 'default',
        messages: messages.value.map(m => m.content),
      });
      compressedSummary.value = summary;
      return summary;
    } catch (e) {
      console.warn("Manual compression failed:", e);
      return null;
    }
  }

  function addMessage(role: "user" | "assistant" | "system", content: string, agentId?: string) {
    const from = role === "user" ? "user" : (agentId ?? agentsStore.activeAgentId);
    // Auto-persist when workspace is set
    if (workspacePath) {
      persistMessage({ from, content, type: "chat", timestamp: Date.now() }, workspacePath);
    }
    agentsStore.addMessage({
      role,
      content,
      agentId: agentId ?? agentsStore.activeAgentId,
    });
  }

  /**
   * Finalize streaming: move the current streamingMessage into the messages array,
   * then clear the streaming ref.
   */
  function finalizeStreaming() {
    if (!streamingMessage.value) return;
    const sm = streamingMessage.value;
    if (sm.content.trim()) {
      addMessage("assistant", sm.content, sm.agentId);
    }
    streamingMessage.value = null;
    if (streamingStableTimer) {
      clearTimeout(streamingStableTimer);
      streamingStableTimer = null;
    }
  }

  /**
   * Schedule finalization after idle period (2s with no new data).
   */
  function scheduleFinalize() {
    if (streamingStableTimer) clearTimeout(streamingStableTimer);
    streamingStableTimer = setTimeout(() => {
      finalizeStreaming();
    }, 2000);
  }

  /**
   * Spawn an agent PTY session if not already running. Returns the ptyId.
   */
  async function spawnAgentIfNeeded(agentId: string): Promise<number> {
    if (agentSessions.value.has(agentId)) return agentSessions.value.get(agentId)!;

    const on_data = new Channel<string>();
    agentBuffers[agentId] = "";
    on_data.onmessage = (data: string) => {
      agentBuffers[agentId] += data;
      // Also update streaming message if this agent is active
      if (streamingMessage.value?.agentId === agentId) {
        streamingMessage.value = {
          ...streamingMessage.value,
          content: streamingMessage.value.content + cleanAnsi(data),
        };
        scheduleFinalize();
      }
    };

    const ptyId: number = await invoke("spawn_agent", {
      agentId,
      cwd: workspacePath,
      cols: 120,
      rows: 40,
      onData: on_data,
    });
    agentSessions.value.set(agentId, ptyId);
    // Wait for agent ready signal: poll buffer every 500ms up to 5s for
    // first non-empty output, then clear init noise.
    const READY_POLL_MS = 500;
    const READY_MAX_MS = 5000;
    let waited = 0;
    while (waited < READY_MAX_MS) {
      if (agentBuffers[agentId] && agentBuffers[agentId].length > 0) break;
      await new Promise((r) => setTimeout(r, READY_POLL_MS));
      waited += READY_POLL_MS;
    }
    agentBuffers[agentId] = ""; // clear init output
    return ptyId;
  }

  /**
   * Capture an agent's response by monitoring its buffer.
   * Uses 2-second stable detection (buffer stops changing for 2 checks × 1s).
   * Supports abort detection and process-exit detection.
   */
  async function captureAgentResponse(agentId: string, timeoutMs: number): Promise<string> {
    agentBuffers[agentId] = "";
    return new Promise((resolve) => {
      let lastLen = 0;
      let stableCount = 0;
      let settled = false;

      const settle = (value: string) => {
        if (settled) return;
        settled = true;
        clearInterval(abortCheck);
        clearInterval(iv);
        clearTimeout(timeout);
        resolve(value);
      };

      const abortCheck = setInterval(() => {
        if (discussionAborted.value) {
          settle(agentBuffers[agentId] ? cleanAnsi(agentBuffers[agentId]) : "（已中断）");
        }
      }, 500);

      const iv = setInterval(() => {
        const buf = agentBuffers[agentId] || "";
        if (buf.includes("[process exited]")) {
          settle(cleanAnsi(buf.replace("[process exited]", "").trim()) || "（进程已退出）");
          return;
        }
        if (buf.length === lastLen && buf.length > 0) {
          stableCount++;
          if (stableCount >= 2) {
            settle(cleanAnsi(buf));
          }
        } else {
          stableCount = 0;
          lastLen = buf.length;
        }
      }, 1000);

      const timeout = setTimeout(() => {
        settle(agentBuffers[agentId] ? cleanAnsi(agentBuffers[agentId]) : "（无响应）");
      }, timeoutMs);
    });
  }

  // Workspace path reference (updated from ChatPanel)
  let workspacePath: string | null = null;

  function setWorkspacePath(p: string) {
    workspacePath = p;
  }

  async function sendMessage(content?: string) {
    const text = content ?? inputText.value.trim();
    if (!text) return;

    addMessage("user", text);
    inputText.value = "";

    // ─── Beam mode: delegate to beam store ───
    if (chatMode.value === "beam") {
      try {
        const { useBeamStore } = await import("./beam");
        const beamStore = useBeamStore();
        await beamStore.sendQuestion(text);
      } catch (e) {
        console.error("beam send error:", e);
        addMessage("system", `Beam 发送失败: ${String(e).slice(0, 300)}`);
      }
      return;
    }

    // ─── Single mode: directly spawn target agent ───
    if (chatMode.value === "single") {
      phase.value = "generating";
      const agentId = chatTarget.value;
      const agent = agentsStore.agents.find((a) => a.id === agentId);

      streamingMessage.value = {
        id: crypto.randomUUID(),
        content: "",
        agentId,
      };

      try {
        const ptyId = await spawnAgentIfNeeded(agentId);
        agentBuffers[agentId] = "";
        await invoke("pty_write", { id: ptyId, data: text + "\n" });

        const response = await captureAgentResponse(agentId, 30_000);
        finalizeStreaming();

        // Update the last assistant message content to the clean response
        const session = agentsStore.activeSession;
        if (session && session.messages.length > 0) {
          const lastMsg = session.messages[session.messages.length - 1];
          if (lastMsg.role === "assistant" && lastMsg.agentId === agentId) {
            lastMsg.content = response;
          }
        }
      } catch (e) {
        console.error("single send error:", e);
        finalizeStreaming();
        addMessage("system", `${agentId}: ${String(e).slice(0, 200)}`);
      } finally {
        phase.value = "idle";
      }
      return;
    }

    // ─── Group mode: multi-agent discussion ───
    round.value = 0;
    discussionAborted.value = false;
    phase.value = "thinking";
    showDecision.value = false;

    try {
      // 1. Send to group chat, get speakers
      const speakers = await invoke<{ agent_id: string; reason: string }[] | null>("group_send", {
        content: text,
      });

      if (!speakers || speakers.length === 0) {
        phase.value = "idle";
        return;
      }

      // 2. Discussion loop — max 6 rounds
      const maxRounds = 6;

      for (let r = 0; r < maxRounds && !discussionAborted.value; r++) {
        round.value = r + 1;
        const isFirstRound = r === 0;
        const timeoutMs = isFirstRound ? 30_000 : 20_000;

        // Get next speaker for this round
        let speaker: { agent_id: string; reason: string } | null = null;
        if (r === 0) {
          speaker = speakers[0] ?? null;
        } else {
          try { speaker = await invoke<{ agent_id: string; reason: string }>("group_next_speaker"); } catch { /* null */ }
        }
        if (!speaker) break;

        phase.value = "generating";
        const agentId = speaker.agent_id;
        const agent = agentsStore.agents.find((a) => a.id === agentId);
        if (!agent) continue;

        const startTime = Date.now();

        // Initialize streaming message for this agent
        streamingMessage.value = {
          id: crypto.randomUUID(),
          content: "",
          agentId,
        };

        try {
          // 2a. Spawn agent PTY if needed
          const ptyId = await spawnAgentIfNeeded(agentId);

          // 2b. Build prompt for this agent
          const prompt: string = await invoke("group_build_prompt", { agentId });

          // 2c. Clear buffer and write prompt
          agentBuffers[agentId] = "";
          await invoke("pty_write", { id: ptyId, data: prompt + "\n" });

          // 2d. Wait for stable output
          const response = await captureAgentResponse(agentId, timeoutMs);
          const durationMs = Date.now() - startTime;

          // 2e. Check convergence
          let converged = false;
          try { converged = await invoke<boolean>("group_check_convergence", { message: response }); } catch { /* false */ }

          // 2f. Record response in backend
          await invoke("group_agent_response", {
            agentId,
            content: response,
            tokens: null,
            model: null,
            durationMs,
          });

          // 2g. Finalize streaming — move to messages
          finalizeStreaming();

          // Ensure message content is the clean response
          const session = agentsStore.activeSession;
          if (session && session.messages.length > 0) {
            const lastMsg = session.messages[session.messages.length - 1];
            if (lastMsg.role === "assistant" && lastMsg.agentId === agentId) {
              lastMsg.content = response;
            }
          }

          if (converged) {
            addMessage("system", "讨论已收敛");
            showDecision.value = true;
            return;
          }
        } catch (e) {
          console.error(`Agent ${agentId} error:`, e);
          finalizeStreaming();
          streamingMessage.value = null;
          const agentName = agentsStore.agents.find(a => a.id === agentId)?.chinese_name || agentId;
          addMessage("system", `${agentName} 无法响应: ${String(e).slice(0, 100)}`);
        }
      }

      // Discussion ended normally
      showDecision.value = true;
    } catch (e) {
      console.error("sendMessage error:", e);
      addMessage("system", `发送失败: ${String(e).slice(0, 300)}`);
      finalizeStreaming();
    } finally {
      phase.value = "idle";
    }
  }

  function abortDiscussion() {
    discussionAborted.value = true;
  }

  async function confirmExecution() {
    showDecision.value = false;
    execStatus.value = "running";

    try {
      // Tell backend to set up execution queue
      await invoke("group_confirm_exec");

      // Drain the execution queue: get each executor and run it
      let completed = 0;
      let failed = 0;
      let maxIterations = 100; // 防止无限循环

      while (maxIterations-- > 0) {
        const executor = await invoke<string | null>("group_next_executor");
        if (!executor) break;

        const agentId = executor;
        addMessage("system", `⏳ ${agentId} 开始执行...`);

        streamingMessage.value = {
          id: crypto.randomUUID(),
          content: "",
          agentId,
        };

        try {
          const ptyId = await spawnAgentIfNeeded(agentId);

          // Build execution prompt
          const execPrompt: string = await invoke("group_build_prompt", { agentId });
          agentBuffers[agentId] = "";
          await invoke("pty_write", { id: ptyId, data: execPrompt + "\n" });

          // Wait for response
          const response = await captureAgentResponse(agentId, 120_000);
          finalizeStreaming();

          // Record result in group chat
          await invoke("group_agent_response", {
            agentId,
            content: response,
            tokens: null,
            model: null,
            durationMs: null,
          });

          // Update the last assistant message
          const session = agentsStore.activeSession;
          if (session && session.messages.length > 0) {
            const lastMsg = session.messages[session.messages.length - 1];
            if (lastMsg.role === "assistant" && lastMsg.agentId === agentId) {
              lastMsg.content = response;
            }
          }

          completed++;
          addMessage("system", `✅ ${agentId} 执行完成`);
        } catch (e) {
          failed++;
          finalizeStreaming();
          addMessage("system", `❌ ${agentId} 执行失败: ${String(e).slice(0, 200)}`);
        }
      }

      if (completed === 0 && failed === 0) {
        addMessage("system", "无执行任务");
      } else {
        addMessage("system", `执行完成: ${completed} 成功, ${failed} 失败`);
      }
      execStatus.value = "done";
    } catch (e) {
      execStatus.value = "error";
      addMessage("system", `执行失败: ${String(e).slice(0, 200)}`);
    }
  }

  function rejectExecution() {
    showDecision.value = false;
    execStatus.value = "idle";
    addMessage("system", "已取消执行");
  }

  function dismissExec() {
    execStatus.value = "idle";
  }

  function setPhase(p: ChatPhase) {
    phase.value = p;
  }

  function clearMessages() {
    const session = agentsStore.activeSession;
    if (session) {
      session.messages = [];
    }
    streamingMessage.value = null;
    if (streamingStableTimer) {
      clearTimeout(streamingStableTimer);
      streamingStableTimer = null;
    }
  }

  /** Cleanup: release all timers and PTY sessions to prevent memory leaks. */
  function cleanup() {
    if (streamingStableTimer) {
      clearTimeout(streamingStableTimer);
      streamingStableTimer = null;
    }
    streamingMessage.value = null;
    // Clear agent buffers
    for (const key of Object.keys(agentBuffers)) {
      delete agentBuffers[key];
    }
    agentSessions.value.clear();
  }

  async function loadHistory(workspacePathArg: string) {
    workspacePath = workspacePathArg;
    try {
      const history: Array<{ id: number; timestamp: number; from: string; content: string; msg_type: string }> =
        await invoke('load_chat_history', { workspace: workspacePathArg });
      if (history && history.length > 0) {
        // Set messages on the active session directly
        const session = agentsStore.activeSession;
        if (session) {
          session.messages = history.reverse().map(m => ({
            id: `msg_${m.id}`,
            role: (m.from === 'user' ? 'user' : m.from === 'system' ? 'system' : 'assistant') as 'user' | 'assistant' | 'system',
            content: m.content,
            timestamp: m.timestamp,
          }));
        }
      }
    } catch (e) { console.error('loadHistory:', e); }
  }

  async function persistMessage(msg: { from: string; content: string; type: string; timestamp: number }, workspacePathArg: string) {
    try {
      await invoke('save_chat_message', {
        record: { id: null, timestamp: msg.timestamp, from: msg.from, content: msg.content, msg_type: msg.type, workspace: workspacePathArg },
      });
    } catch (e) { console.error('persistMessage:', e); }
  }

  // Get current group chat phase
  async function getPhase() {
    try {
      return await invoke('group_get_phase');
    } catch { return 'idle'; }
  }

  // ══════════════════════════════════════════════
  // Selector Speaker Algorithm (from AutoGen)
  // ══════════════════════════════════════════════

  /** Override for forced speaker selection */
  const forcedSpeaker = ref<string | null>(null);

  /** Index for round-robin fallback */
  let roundRobinIndex = 0;

  /**
   * Select the next speaker based on conversation context.
   * Strategy: LLM-based selection → fallback to round-robin.
   * @param candidates - list of agent ids to choose from
   * @param forcedOverride - force a specific speaker (user override)
   */
  async function selectNextSpeaker(
    candidates?: string[],
    forcedOverride?: string
  ): Promise<string | null> {
    // User override takes top priority
    if (forcedOverride) {
      forcedSpeaker.value = null; // clear after use
      return forcedOverride;
    }
    // Persistent forced speaker
    if (forcedSpeaker.value) {
      const sp = forcedSpeaker.value;
      forcedSpeaker.value = null;
      return sp;
    }

    const available = candidates ?? agentsStore.enabledAgents.map(a => a.id);
    if (available.length === 0) return null;
    if (available.length === 1) return available[0];

    // Try LLM-based selection
    try {
      const session = agentsStore.activeSession;
      const recentMessages = (session?.messages ?? []).slice(-10).map(m => ({
        role: m.role,
        agentId: m.agentId,
        content: m.content.slice(0, 200), // truncate for context
      }));

      const agentInfo = available.map(id => {
        const agent = agentsStore.agents.find(a => a.id === id);
        return {
          id,
          name: agent?.chinese_name ?? id,
          specialty: agent?.specialty ?? '',
        };
      });

      const result: { agent_id: string; reason: string } = await invoke('select_next_speaker', {
        candidates: available,
        agentInfo,
        recentMessages,
        round: round.value,
      });

      if (result.agent_id && available.includes(result.agent_id)) {
        roundRobinIndex = (available.indexOf(result.agent_id) + 1) % available.length;
        return result.agent_id;
      }
    } catch (e) {
      // LLM selection failed — fall through to round-robin
      console.warn('[Speaker] LLM selection failed, using round-robin:', e);
    }

    // Round-robin fallback
    const speaker = available[roundRobinIndex % available.length];
    roundRobinIndex = (roundRobinIndex + 1) % available.length;
    return speaker;
  }

  /**
   * Set a forced speaker for the next round.
   */
  function setForcedSpeaker(agentId: string | null) {
    forcedSpeaker.value = agentId;
  }

  // Get all messages from group chat
  async function getMessages() {
    try {
      return await invoke('group_get_messages');
    } catch { return []; }
  }

  // Get next executor
  async function getNextExecutor() {
    try {
      return await invoke('group_next_executor');
    } catch { return null; }
  }

  return {
    chatMode,
    chatTarget,
    setChatMode,
    setChatTarget,
    phase,
    round,
    inputText,
    messages,
    discussionAborted,
    showDecision,
    compressedSummary,
    tokenEstimate,
    TOKEN_THRESHOLD,
    streamingMessage,
    execStatus,
    // Thread grouping
    currentThreadId,
    threads,
    currentThread,
    allThreads,
    childThreads,
    createThread,
    switchThread,
    getThreadMessages,
    navigateToParent,
    navigateToChild,
    // Existing
    manualCompress,
    addMessage,
    sendMessage,
    abortDiscussion,
    confirmExecution,
    rejectExecution,
    dismissExec,
    setPhase,
    setWorkspacePath,
    clearMessages,
    cleanup,
    loadHistory,
    persistMessage,
    // Speaker selection (Phase 3)
    forcedSpeaker,
    selectNextSpeaker,
    setForcedSpeaker,
  };
});
