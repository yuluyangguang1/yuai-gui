import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { invoke } from "@tauri-apps/api/core";

export type AgentStatus = 'idle' | 'running' | 'error' | 'disabled';

export interface AgentDef {
  id: string;
  name: string;
  chinese_name: string;
  glyph: string;
  color: string;
  specialty: string;
  binary: string;
  config_type: string;
  enabled: boolean;
  in_group: boolean;
  status: AgentStatus;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  agentId?: string;
  timestamp: number;
}

export interface Session {
  id: string;
  agentId: string;
  messages: ChatMessage[];
  createdAt: number;
}

// The 4 agents: 梅兰竹菊 (built-in defaults matching backend)
const BUILTIN_AGENTS: AgentDef[] = [
  {
    id: "claude", name: "claude", chinese_name: "梅", glyph: "梅", color: "#ff8c32",
    specialty: "编程、架构设计、代码审查", binary: "", config_type: "anthropic_env",
    enabled: true, in_group: true, status: 'idle',
  },
  {
    id: "codex", name: "codex", chinese_name: "兰", glyph: "兰", color: "#50c878",
    specialty: "编程、快速原型、OpenAI 生态", binary: "", config_type: "codex_toml",
    enabled: true, in_group: true, status: 'idle',
  },
  {
    id: "openclaw", name: "openclaw", chinese_name: "竹", glyph: "竹", color: "#ff6464",
    specialty: "内容生成、渠道运营、技能调用", binary: "", config_type: "openai_env",
    enabled: true, in_group: true, status: 'idle',
  },
  {
    id: "hermes", name: "hermes", chinese_name: "菊", glyph: "菊", color: "#a064ff",
    specialty: "记忆、学习、任务编排", binary: "", config_type: "openai_env",
    enabled: true, in_group: true, status: 'idle',
  },
];

const STORAGE_KEY = "yuai-agent-enabled";

function loadEnabledStates(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return {};
}

function saveEnabledStates(states: Record<string, boolean>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(states));
  } catch { /* ignore */ }
}

export const useAgentsStore = defineStore("agents", () => {
  const agents = ref<AgentDef[]>([...BUILTIN_AGENTS]);
  const activeAgentId = ref<string>("hermes");
  const sessions = ref<Map<string, Session>>(new Map());
  const loading = ref(false);

  // Apply persisted enabled states on init
  const savedStates = loadEnabledStates();
  for (const a of agents.value) {
    if (savedStates[a.id] !== undefined) {
      a.enabled = savedStates[a.id];
    }
    a.status = a.enabled ? 'idle' : 'disabled';
  }

  const activeAgent = computed(() =>
    agents.value.find((a) => a.id === activeAgentId.value) ?? agents.value[0]
  );

  const activeSession = computed(() => {
    const key = activeAgentId.value;
    return sessions.value.get(key) ?? null;
  });

  const activeMessages = computed(() => activeSession.value?.messages ?? []);

  const enabledAgents = computed(() => agents.value.filter(a => a.enabled));

  function setActiveAgent(id: string) {
    activeAgentId.value = id;
    // Ensure session exists
    if (!sessions.value.has(id)) {
      sessions.value.set(id, {
        id: crypto.randomUUID(),
        agentId: id,
        messages: [],
        createdAt: Date.now(),
      });
    }
  }

  function toggleAgent(id: string) {
    const agent = agents.value.find(a => a.id === id);
    if (!agent) return;
    agent.enabled = !agent.enabled;
    agent.status = agent.enabled ? 'idle' : 'disabled';
    // Persist
    const states: Record<string, boolean> = {};
    for (const a of agents.value) states[a.id] = a.enabled;
    saveEnabledStates(states);
  }

  function setAgentStatus(id: string, status: AgentStatus) {
    const agent = agents.value.find(a => a.id === id);
    if (agent && agent.enabled) {
      agent.status = status;
    }
  }

  const MAX_MESSAGES_PER_SESSION = 500;

  function addMessage(msg: Omit<ChatMessage, "id" | "timestamp">) {
    const agentId = msg.agentId ?? activeAgentId.value;
    let session = sessions.value.get(agentId);
    if (!session) {
      session = {
        id: crypto.randomUUID(),
        agentId,
        messages: [],
        createdAt: Date.now(),
      };
      sessions.value.set(agentId, session);
    }
    session.messages.push({
      ...msg,
      id: crypto.randomUUID(),
      timestamp: Date.now(),
    });
    // Cap messages to prevent unbounded memory growth
    if (session.messages.length > MAX_MESSAGES_PER_SESSION) {
      session.messages.splice(0, session.messages.length - MAX_MESSAGES_PER_SESSION);
    }
  }

  async function loadAgents() {
    loading.value = true;
    try {
      const defs: AgentDef[] = await invoke("list_agents");
      if (defs && defs.length > 0) {
        // Merge enabled states from persisted data
        const states = loadEnabledStates();
        for (const d of defs) {
          if (states[d.id] !== undefined) d.enabled = states[d.id];
          if (!d.status) d.status = d.enabled ? 'idle' : 'disabled';
        }
        agents.value = defs;
      }
    } catch {
      // Use built-in agents if backend not available
      console.warn("Could not load agents from backend, using built-in defaults");
    } finally {
      loading.value = false;
    }
  }

  // Initialize default session
  setActiveAgent("hermes");

  return {
    agents,
    activeAgentId,
    activeAgent,
    activeSession,
    activeMessages,
    enabledAgents,
    sessions,
    loading,
    setActiveAgent,
    toggleAgent,
    setAgentStatus,
    addMessage,
    loadAgents,
  };
});
