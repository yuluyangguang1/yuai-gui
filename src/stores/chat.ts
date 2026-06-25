import { defineStore } from "pinia";
import { ref, computed, watch } from "vue";
import { invoke, Channel } from "@tauri-apps/api/core";
import { useAgentsStore } from "./agents";

export type ChatPhase = "idle" | "thinking" | "generating" | "tool_call" | "error";

/** Strip ANSI escape sequences from a string. */
function cleanAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "").replace(/\x1b\][^\x07]*\x07/g, "");
}

/** Wait for stable output — resolves when no new data arrives for `idleMs`. */
function waitForStableOutput(
  getBuffer: () => string,
  idleMs: number,
  timeoutMs: number,
): Promise<string> {
  return new Promise((resolve) => {
    let lastLen = getBuffer().length;
    let elapsed = 0;
    const interval = 200;
    const timer = setInterval(() => {
      elapsed += interval;
      const curLen = getBuffer().length;
      if (curLen > lastLen) {
        // still receiving data, reset idle clock
        lastLen = curLen;
        elapsed = 0;
      }
      if (elapsed >= idleMs || elapsed >= timeoutMs) {
        clearInterval(timer);
        resolve(getBuffer());
      }
    }, interval);
  });
}

export const useChatStore = defineStore("chat", () => {
  const phase = ref<ChatPhase>("idle");
  const round = ref(0);
  const inputText = ref("");
  const discussionAborted = ref(false);
  const compressedSummary = ref<string>("");
  const TOKEN_THRESHOLD = 100_000;
  let compressionTriggered = false;

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
    agentsStore.addMessage({
      role,
      content,
      agentId: agentId ?? agentsStore.activeAgentId,
    });
  }

  async function sendMessage(content?: string) {
    const text = content ?? inputText.value.trim();
    if (!text) return;

    addMessage("user", text);
    inputText.value = "";
    round.value = 0;
    discussionAborted.value = false;
    phase.value = "thinking";

    try {
      // 1. Send to group chat, get speakers
      const speakers: { agent_id: string; reason: string }[] = await invoke("group_send", {
        content: text,
      });

      if (!speakers || speakers.length === 0) {
        phase.value = "idle";
        return;
      }

      // 2. Discussion loop — max 6 rounds
      const maxRounds = 6;
      let currentSpeakers = speakers;

      for (let r = 0; r < maxRounds && !discussionAborted.value; r++) {
        round.value = r + 1;
        const isFirstRound = r === 0;
        const timeoutMs = isFirstRound ? 30_000 : 20_000;

        for (const speaker of currentSpeakers) {
          if (discussionAborted.value) break;

          phase.value = "generating";
          const agentId = speaker.agent_id;
          const startTime = Date.now();

          try {
            // 2a. Build prompt for this agent
            const prompt: string = await invoke("group_build_prompt", { agentId });

            // 2b. Create PTY channel, spawn agent, write prompt, capture response
            const on_data = new Channel<string>();
            let buffer = "";

            on_data.onmessage = (data: string) => {
              buffer += data;
            };

            // Spawn agent
            const ptyId: number = await invoke("spawn_agent", {
              agentId,
              cwd: null,
              cols: 120,
              rows: 40,
              onData: on_data,
            });

            // Write the prompt
            await invoke("pty_write", { id: ptyId, data: prompt + "\n" });

            // Wait for stable output (2s idle, or timeout)
            const rawOutput = await waitForStableOutput(() => buffer, 2000, timeoutMs);

            // Clean up PTY
            await invoke("pty_kill", { id: ptyId }).catch(() => {});

            // Clean ANSI
            const responseText = cleanAnsi(rawOutput).trim();

            if (!responseText) continue;

            const durationMs = Date.now() - startTime;

            // 2c. Record response in backend
            await invoke("group_agent_response", {
              agentId,
              content: responseText,
              tokens: null,
              model: null,
              durationMs,
            });

            // 2d. Add message to UI
            addMessage("assistant", responseText, agentId);

            // 2e. Check convergence
            const converged: boolean = await invoke("group_check_convergence", {
              message: responseText,
            });
            if (converged) {
              addMessage("system", "讨论收敛，停止迭代。");
              phase.value = "idle";
              return;
            }
          } catch (e) {
            console.error(`Agent ${agentId} error:`, e);
            addMessage("system", `代理 ${agentId} 出错: ${e}`);
          }
        }

        // 3. Get next speakers for next round
        if (discussionAborted.value) break;

        try {
          const next: { agent_id: string; reason: string } | null = await invoke(
            "group_next_speaker",
          );
          if (!next) {
            // All agents have spoken this round, discussion complete
            break;
          }
          currentSpeakers = [next];
        } catch {
          break;
        }
      }
    } catch (e) {
      console.error("sendMessage error:", e);
      phase.value = "error";
      addMessage("system", `发送失败: ${e}`);
      return;
    }

    phase.value = "idle";
  }

  function abortDiscussion() {
    discussionAborted.value = true;
    phase.value = "idle";
    addMessage("system", "讨论已中止。");
  }

  function setPhase(p: ChatPhase) {
    phase.value = p;
  }

  function clearMessages() {
    const session = agentsStore.activeSession;
    if (session) {
      session.messages = [];
    }
  }

  async function loadHistory(workspacePath: string) {
    try {
      const history: Array<{ id: number; timestamp: number; from: string; content: string; msg_type: string }> =
        await invoke('load_chat_history', { workspace: workspacePath });
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

  async function persistMessage(msg: { from: string; content: string; type: string; timestamp: number }, workspacePath: string) {
    try {
      await invoke('save_chat_message', {
        record: { id: null, timestamp: msg.timestamp, from: msg.from, content: msg.content, msg_type: msg.type, workspace: workspacePath },
      });
    } catch (e) { console.error('persistMessage:', e); }
  }

  return {
    phase,
    round,
    inputText,
    messages,
    discussionAborted,
    compressedSummary,
    tokenEstimate,
    TOKEN_THRESHOLD,
    manualCompress,
    addMessage,
    sendMessage,
    abortDiscussion,
    setPhase,
    clearMessages,
    loadHistory,
    persistMessage,
  };
});
