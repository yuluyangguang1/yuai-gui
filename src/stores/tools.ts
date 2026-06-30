/**
 * Tool Registry store (inspired by Craft Agents)
 * Define, register, and manage tools available to agents.
 * Track tool execution and permissions.
 */
import { defineStore } from 'pinia';
import { ref, computed, readonly } from 'vue';

// ── Types ──

export type ToolCategory = 'file' | 'git' | 'search' | 'web' | 'custom';

export type ToolPermission = 'read' | 'write' | 'execute' | 'admin';

export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required: boolean;
  default?: unknown;
  enum?: string[];
}

export interface Tool {
  id: string;
  name: string;
  description: string;
  category: ToolCategory;
  parameters: ToolParameter[];
  permissions: ToolPermission[];
  enabled: boolean;
  icon?: string;
  version?: string;
}

export interface ToolRegistration {
  toolId: string;
  agentId: string;
  enabled: boolean;
  grantedPermissions: ToolPermission[];
  registeredAt: number;
}

export interface ToolExecution {
  id: string;
  toolId: string;
  agentId: string;
  parameters: Record<string, unknown>;
  result: unknown;
  success: boolean;
  durationMs: number;
  timestamp: number;
  error?: string;
}

// ── Built-in Tools ──

const BUILTIN_TOOLS: Tool[] = [
  // File tools
  {
    id: 'file_read',
    name: 'Read File',
    description: 'Read the contents of a file',
    category: 'file',
    parameters: [
      { name: 'path', type: 'string', description: 'File path', required: true },
    ],
    permissions: ['read'],
    enabled: true,
    icon: 'fileText',
  },
  {
    id: 'file_write',
    name: 'Write File',
    description: 'Write content to a file',
    category: 'file',
    parameters: [
      { name: 'path', type: 'string', description: 'File path', required: true },
      { name: 'content', type: 'string', description: 'File content', required: true },
    ],
    permissions: ['write'],
    enabled: true,
    icon: 'edit',
  },
  {
    id: 'file_edit',
    name: 'Edit File',
    description: 'Edit a file with find-and-replace',
    category: 'file',
    parameters: [
      { name: 'path', type: 'string', description: 'File path', required: true },
      { name: 'old', type: 'string', description: 'Text to find', required: true },
      { name: 'new', type: 'string', description: 'Replacement text', required: true },
    ],
    permissions: ['write'],
    enabled: true,
    icon: 'tool',
  },
  // Git tools
  {
    id: 'git_diff',
    name: 'Git Diff',
    description: 'Show changes in the working directory',
    category: 'git',
    parameters: [
      { name: 'cwd', type: 'string', description: 'Repository path', required: true },
    ],
    permissions: ['read'],
    enabled: true,
    icon: 'chartBar',
  },
  {
    id: 'git_commit',
    name: 'Git Commit',
    description: 'Create a git commit',
    category: 'git',
    parameters: [
      { name: 'cwd', type: 'string', description: 'Repository path', required: true },
      { name: 'message', type: 'string', description: 'Commit message', required: true },
    ],
    permissions: ['execute'],
    enabled: true,
    icon: 'pencil',
  },
  {
    id: 'git_branch',
    name: 'Git Branch',
    description: 'Create or switch branches',
    category: 'git',
    parameters: [
      { name: 'cwd', type: 'string', description: 'Repository path', required: true },
      { name: 'branch', type: 'string', description: 'Branch name', required: true },
      { name: 'create', type: 'boolean', description: 'Create new branch', required: false, default: false },
    ],
    permissions: ['execute'],
    enabled: true,
    icon: 'arrowsShuffle',
  },
  // Search tools
  {
    id: 'search_grep',
    name: 'Search in Files',
    description: 'Search for patterns in files',
    category: 'search',
    parameters: [
      { name: 'pattern', type: 'string', description: 'Search pattern (regex)', required: true },
      { name: 'path', type: 'string', description: 'Directory to search in', required: true },
      { name: 'glob', type: 'string', description: 'File glob filter', required: false },
    ],
    permissions: ['read'],
    enabled: true,
    icon: 'search',
  },
  {
    id: 'search_files',
    name: 'Find Files',
    description: 'Find files by name pattern',
    category: 'search',
    parameters: [
      { name: 'pattern', type: 'string', description: 'File name pattern', required: true },
      { name: 'path', type: 'string', description: 'Directory to search in', required: true },
    ],
    permissions: ['read'],
    enabled: true,
    icon: 'folder',
  },
  // Web tools
  {
    id: 'web_fetch',
    name: 'Fetch URL',
    description: 'Fetch content from a URL',
    category: 'web',
    parameters: [
      { name: 'url', type: 'string', description: 'URL to fetch', required: true },
      { name: 'method', type: 'string', description: 'HTTP method', required: false, default: 'GET' },
    ],
    permissions: ['read', 'execute'],
    enabled: true,
    icon: 'world',
  },
  {
    id: 'web_search',
    name: 'Web Search',
    description: 'Search the web for information',
    category: 'web',
    parameters: [
      { name: 'query', type: 'string', description: 'Search query', required: true },
    ],
    permissions: ['read'],
    enabled: true,
    icon: 'search',
  },
];

// ── Store ──

export const useToolsStore = defineStore('tools', () => {
  const tools = ref<Tool[]>([...BUILTIN_TOOLS]);
  const registrations = ref<ToolRegistration[]>([]);
  const executions = ref<ToolExecution[]>([]);
  const activeCategory = ref<ToolCategory | 'all'>('all');

  // ── Computed ──

  const filteredTools = computed(() => {
    if (activeCategory.value === 'all') return tools.value;
    return tools.value.filter(t => t.category === activeCategory.value);
  });

  const enabledTools = computed(() => tools.value.filter(t => t.enabled));

  const toolsByCategory = computed(() => {
    const grouped = new Map<ToolCategory, Tool[]>();
    for (const tool of tools.value) {
      const existing = grouped.get(tool.category) ?? [];
      existing.push(tool);
      grouped.set(tool.category, existing);
    }
    return grouped;
  });

  const categories = computed<ToolCategory[]>(() => ['file', 'git', 'search', 'web', 'custom']);

  const totalExecutions = computed(() => executions.value.length);

  const successfulExecutions = computed(() =>
    executions.value.filter(e => e.success).length,
  );

  // ── Tool Management ──

  /** Register a new custom tool. */
  function registerTool(tool: Omit<Tool, 'id' | 'enabled'> & { id?: string }): Tool {
    const newTool: Tool = {
      ...tool,
      id: tool.id ?? `tool_${Date.now()}`,
      enabled: true,
    };
    tools.value.push(newTool);
    return newTool;
  }

  /** Unregister a tool. */
  function unregisterTool(toolId: string): boolean {
    const idx = tools.value.findIndex(t => t.id === toolId);
    if (idx < 0) return false;

    // Don't allow removing built-in tools
    if (BUILTIN_TOOLS.some(t => t.id === toolId)) return false;

    tools.value.splice(idx, 1);

    // Clean up registrations
    registrations.value = registrations.value.filter(r => r.toolId !== toolId);
    return true;
  }

  /** Enable/disable a tool. */
  function toggleTool(toolId: string): boolean {
    const tool = tools.value.find(t => t.id === toolId);
    if (!tool) return false;
    tool.enabled = !tool.enabled;
    return true;
  }

  /** Get a tool by ID. */
  function getTool(toolId: string): Tool | undefined {
    return tools.value.find(t => t.id === toolId);
  }

  // ── Agent Registration ──

  /** Register a tool for an agent. */
  function registerToolForAgent(
    toolId: string,
    agentId: string,
    permissions?: ToolPermission[],
  ): boolean {
    const tool = tools.value.find(t => t.id === toolId);
    if (!tool) return false;

    // Check if already registered
    const existing = registrations.value.find(
      r => r.toolId === toolId && r.agentId === agentId,
    );
    if (existing) return false;

    registrations.value.push({
      toolId,
      agentId,
      enabled: true,
      grantedPermissions: permissions ?? tool.permissions,
      registeredAt: Date.now(),
    });

    return true;
  }

  /** Unregister a tool from an agent. */
  function unregisterToolFromAgent(toolId: string, agentId: string): boolean {
    const idx = registrations.value.findIndex(
      r => r.toolId === toolId && r.agentId === agentId,
    );
    if (idx < 0) return false;
    registrations.value.splice(idx, 1);
    return true;
  }

  /** Get tools registered for a specific agent. */
  function getAgentTools(agentId: string): Tool[] {
    const agentRegs = registrations.value.filter(
      r => r.agentId === agentId && r.enabled,
    );
    return agentRegs
      .map(r => tools.value.find(t => t.id === r.toolId))
      .filter((t): t is Tool => t !== undefined && t.enabled);
  }

  /** Check if an agent has permission to use a tool. */
  function hasPermission(agentId: string, toolId: string, permission: ToolPermission): boolean {
    const reg = registrations.value.find(
      r => r.toolId === toolId && r.agentId === agentId && r.enabled,
    );
    if (!reg) return false;
    return reg.grantedPermissions.includes(permission);
  }

  /** Update permissions for an agent's tool registration. */
  function updatePermissions(
    toolId: string,
    agentId: string,
    permissions: ToolPermission[],
  ): boolean {
    const reg = registrations.value.find(
      r => r.toolId === toolId && r.agentId === agentId,
    );
    if (!reg) return false;
    reg.grantedPermissions = permissions;
    return true;
  }

  // ── Execution Tracking ──

  /** Record a tool execution. */
  function recordExecution(execution: Omit<ToolExecution, 'id'>): ToolExecution {
    const record: ToolExecution = {
      ...execution,
      id: `exec_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    };
    executions.value.push(record);

    // Keep max 1000 execution records
    if (executions.value.length > 1000) {
      executions.value = executions.value.slice(-1000);
    }

    return record;
  }

  /** Get execution history for a tool. */
  function getToolExecutions(toolId: string): ToolExecution[] {
    return executions.value.filter(e => e.toolId === toolId);
  }

  /** Get execution history for an agent. */
  function getAgentExecutions(agentId: string): ToolExecution[] {
    return executions.value.filter(e => e.agentId === agentId);
  }

  /** Clear execution history. */
  function clearExecutions() {
    executions.value = [];
  }

  /** Set active category filter. */
  function setActiveCategory(category: ToolCategory | 'all') {
    activeCategory.value = category;
  }

  return {
    // State
    tools: readonly(tools),
    registrations,
    executions,
    activeCategory,

    // Computed
    filteredTools,
    enabledTools,
    toolsByCategory,
    categories,
    totalExecutions,
    successfulExecutions,

    // Tool management
    registerTool,
    unregisterTool,
    toggleTool,
    getTool,

    // Agent registration
    registerToolForAgent,
    unregisterToolFromAgent,
    getAgentTools,
    hasPermission,
    updatePermissions,

    // Execution tracking
    recordExecution,
    getToolExecutions,
    getAgentExecutions,
    clearExecutions,
    setActiveCategory,
  };
});
