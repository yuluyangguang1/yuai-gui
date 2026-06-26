import { defineStore } from "pinia";
import { ref, computed, watch } from "vue";
import { invoke, Channel } from "@tauri-apps/api/core";
import { useAgentsStore } from "./agents";

export type ChatPhase = "idle" | "thinking" | "generating" | "tool_call" | "error";

export interface StreamingMessage {
  id: string;
  content: string;
  agentId: string;
}

/** Strip ANSI escape sequences from a string. */
function cleanAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "").replace(/\x1b\][^\x07]*\x07/g, "");
}

export const useChatStore = defineStore("chat", () => {
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
        const summary: string = await invoke("compress_context");
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
      const summary: string = await invoke("compress_context");
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
    await new Promise((r) => setTimeout(r, 2000)); // wait for agent to initialize
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

      const abortCheck = setInterval(() => {
        if (discussionAborted.value) {
          clearInterval(abortCheck);
          clearInterval(iv);
          clearTimeout(timeout);
          resolve(agentBuffers[agentId] ? cleanAnsi(agentBuffers[agentId]) : "（已中断）");
        }
      }, 500);

      const iv = setInterval(() => {
        const buf = agentBuffers[agentId] || "";
        if (buf.includes("[process exited]")) {
          clearInterval(iv);
          clearInterval(abortCheck);
          clearTimeout(timeout);
          resolve(cleanAnsi(buf.replace("[process exited]", "").trim()) || "（进程已退出）");
          return;
        }
        if (buf.length === lastLen && buf.length > 0) {
          stableCount++;
          if (stableCount >= 2) {
            clearInterval(iv);
            clearInterval(abortCheck);
            clearTimeout(timeout);
            resolve(cleanAnsi(buf));
          }
        } else {
          stableCount = 0;
          lastLen = buf.length;
        }
      }, 1000);

      const timeout = setTimeout(() => {
        clearInterval(iv);
        clearInterval(abortCheck);
        resolve(agentBuffers[agentId] ? cleanAnsi(agentBuffers[agentId]) : "（无响应）");
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
    round.value = 0;
    discussionAborted.value = false;
    phase.value = "thinking";
    showDecision.value = false;

    try {
      // 1. Send to group chat, get speakers
      const speakers: { agent_id: string; reason: string }[] | null = await invoke("group_send", {
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
        let speaker: { agent_id: string; reason: string } | null;
        if (r === 0) {
          speaker = speakers[0] ?? null;
        } else {
          speaker = await invoke("group_next_speaker").catch(() => null);
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
          const converged: boolean = await invoke("group_check_convergence", {
            message: response,
          }).catch(() => false);

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
          addMessage("system", `${agentId}: ${String(e).slice(0, 200)}`);
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
      await invoke("group_confirm_exec");
      execStatus.value = "done";
      addMessage("system", "执行完成");
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
            role: 'assistant' as const,
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

  return {
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
    loadHistory,
    persistMessage,
  };
});
