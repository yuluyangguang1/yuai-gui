import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { invoke } from "@tauri-apps/api/core";

export interface McpServerInfo {
  name: string;
  transport: string;
  connected: boolean;
  tools: number;
  tools_registered: number;
  tool_names: string[];
  tool_names_registered: string[];
  error: string | null;
  command: string | null;
  args: string[] | null;
  url: string | null;
  env: Record<string, string> | null;
  headers: Record<string, string> | null;
  tools_config: any;
  prompts: boolean | null;
  resources: boolean | null;
  enabled: boolean | null;
  raw_config: any;
  tool_details: Array<{ name: string; description: string }> | null;
}

export interface McpToolInfo {
  name: string;
  description: string;
  input_schema: any;
}

export const useMcpStore = defineStore("mcp", () => {
  const servers = ref<McpServerInfo[]>([]);
  const loading = ref(false);
  const error = ref("");
  const searchQuery = ref("");
  const toolsByServer = ref<Record<string, McpToolInfo[]>>({});

  const summary = computed(() => {
    let connected = 0;
    let totalTools = 0;
    for (const s of servers.value) {
      if (s.connected) connected++;
      totalTools += s.tools_registered;
    }
    return {
      total: servers.value.length,
      connected,
      disconnected: servers.value.length - connected,
      totalTools,
    };
  });

  const filteredServers = computed(() => {
    const q = searchQuery.value.trim().toLowerCase();
    if (!q) return servers.value;
    return servers.value.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.transport.includes(q) ||
        s.tool_names.some((n) => n.toLowerCase().includes(q))
    );
  });

  async function loadServers() {
    loading.value = true;
    error.value = "";
    try {
      const data: { servers: McpServerInfo[]; total_tools: number } =
        await invoke("mcp_list_servers");
      servers.value = data.servers ?? [];

      // Populate toolsByServer
      const next: Record<string, McpToolInfo[]> = {};
      for (const s of servers.value) {
        next[s.name] = (s.tool_details || []).map((t) => ({
          name: t.name,
          description: t.description || "",
          input_schema: null,
        }));
      }
      toolsByServer.value = next;
    } catch (e: any) {
      error.value = e?.message || "加载 MCP 服务器失败";
    } finally {
      loading.value = false;
    }
  }

  async function addServer(name: string, config: any) {
    const res: { ok: boolean; error?: string } = await invoke("mcp_add_server", {
      name,
      config,
    });
    if (!res.ok) throw new Error(res.error || "添加失败");
    await loadServers();
    return res;
  }

  async function updateServer(name: string, config: any) {
    const res: { ok: boolean; error?: string } = await invoke("mcp_update_server", {
      name,
      config,
    });
    if (!res.ok) throw new Error(res.error || "更新失败");
    await loadServers();
    return res;
  }

  async function removeServer(name: string) {
    const res: { ok: boolean; error?: string } = await invoke("mcp_remove_server", { name });
    if (!res.ok) throw new Error(res.error || "删除失败");
    const { [name]: _, ...rest } = toolsByServer.value;
    toolsByServer.value = rest;
    await loadServers();
    return res;
  }

  async function testServer(name: string) {
    const res: { ok: boolean; error?: string; tools?: string[] } = await invoke(
      "mcp_test_server",
      { name }
    );
    return res;
  }

  async function reload(server?: string) {
    const res: { ok: boolean; error?: string; message?: string } = await invoke("mcp_reload", {
      server: server || null,
    });
    if (server) {
      const { [server]: _, ...rest } = toolsByServer.value;
      toolsByServer.value = rest;
    } else {
      toolsByServer.value = {};
    }
    await loadServers();
    return res;
  }

  function statusClass(s: McpServerInfo): string {
    if (s.enabled === false) return "disabled";
    return s.connected ? "connected" : "disconnected";
  }

  function statusLabel(s: McpServerInfo): string {
    if (s.enabled === false) return "已禁用";
    return s.connected ? "已连接" : "未连接";
  }

  return {
    servers,
    loading,
    error,
    searchQuery,
    toolsByServer,
    summary,
    filteredServers,
    loadServers,
    addServer,
    updateServer,
    removeServer,
    testServer,
    reload,
    statusClass,
    statusLabel,
  };
});
