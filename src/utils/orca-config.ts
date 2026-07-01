/**
 * Orca YAML Config — 参考 Orca orca.yaml 声明式配置
 * Agent/hook/脚本配置, 替代硬编码
 */

// ══════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════

export interface OrcaAgentConfig {
  /** Agent ID (e.g. 'claude', 'codex') */
  id: string;
  /** Display name */
  name: string;
  /** Chinese name */
  chinese_name?: string;
  /** Glyph/icon */
  glyph?: string;
  /** Color */
  color?: string;
  /** Specialty description */
  specialty?: string;
  /** Binary path */
  binary?: string;
  /** Config type (anthropic_env, codex_toml, openai_env) */
  config_type: string;
  /** Default model */
  model?: string;
  /** Enabled by default */
  enabled?: boolean;
  /** Instructions/persona (appended to system prompt) */
  instructions?: string;
}

export interface OrcaHookConfig {
  /** Hook name */
  name: string;
  /** Command to run */
  command: string;
  /** When to run: before_agent_start, after_agent_start, on_message, on_error */
  on: 'before_agent_start' | 'after_agent_start' | 'on_message' | 'on_error';
  /** Timeout in ms */
  timeout?: number;
}

export interface OrcaScriptConfig {
  /** Setup script (runs on workspace init) */
  setup?: string;
  /** Pre-agent script (runs before each agent) */
  pre_agent?: string;
  /** Post-agent script (runs after each agent) */
  post_agent?: string;
}

export interface OrcaConfig {
  /** Config version */
  version?: number;
  /** Agent definitions */
  agents?: OrcaAgentConfig[];
  /** Hook definitions */
  hooks?: OrcaHookConfig[];
  /** Script definitions */
  scripts?: OrcaScriptConfig[];
  /** Default workspace path */
  workspace?: string;
}

// ══════════════════════════════════════════════
// Parser — simplified YAML parser for orca.yaml
// ══════════════════════════════════════════════

/**
 * Parse orca.yaml content into OrcaConfig.
 * Uses a simplified parser — supports flat key-value and basic nesting.
 */
export function parseOrcaYaml(content: string): OrcaConfig {
  const config: OrcaConfig = {};
  const lines = content.split('\n');

  let currentSection: string | null = null;
  let currentItem: Record<string, string> | null = null;
  let items: Record<string, string>[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Top-level key
    const topMatch = trimmed.match(/^(\w+):\s*$/);
    if (topMatch && !line.startsWith(' ')) {
      // Save previous section
      currentItem = null;  // Reset between sections
      if (currentSection === 'agents' && items.length > 0) {
        config.agents = items.map(parseAgentItem);
        items = [];
      }
      currentSection = topMatch[1];
      continue;
    }

    // List item (starts with -)
    const listMatch = trimmed.match(/^-\s+(\w+):\s*(.+)$/);
    if (listMatch && currentSection === 'agents') {
      if (currentItem) items.push(currentItem);
      currentItem = { [listMatch[1]]: listMatch[2] };
      continue;
    }

    // Nested key-value
    const kvMatch = trimmed.match(/^(\w+):\s*(.+)$/);
    if (kvMatch && currentItem) {
      currentItem[kvMatch[1]] = kvMatch[2];
      continue;
    }

    // Top-level key-value
    const topKvMatch = trimmed.match(/^(\w+):\s*(.+)$/);
    if (topKvMatch && !currentSection) {
      (config as Record<string, unknown>)[topKvMatch[1]] = topKvMatch[2];
    }
  }

  // Save last section
  if (currentSection === 'agents' && items.length > 0) {
    config.agents = items.map(parseAgentItem);
  }
  if (currentItem && currentSection === 'agents') {
    config.agents = [...(config.agents ?? []), parseAgentItem(currentItem)];
  }

  return config;
}

function parseAgentItem(item: Record<string, string>): OrcaAgentConfig {
  return {
    id: item.id ?? '',
    name: item.name ?? item.id ?? '',
    chinese_name: item.chinese_name,
    glyph: item.glyph,
    color: item.color,
    specialty: item.specialty,
    binary: item.binary,
    config_type: item.config_type ?? 'openai_env',
    model: item.model,
    enabled: item.enabled !== 'false',
    instructions: item.instructions,
  };
}

/**
 * Serialize OrcaConfig back to YAML.
 */
export function serializeOrcaYaml(config: OrcaConfig): string {
  const lines: string[] = [];

  if (config.version) lines.push(`version: ${config.version}`);
  if (config.workspace) lines.push(`workspace: ${config.workspace}`);

  if (config.scripts) {
    lines.push('scripts:');
    if (config.scripts[0]?.setup) lines.push(`  setup: |`, `    ${config.scripts[0].setup}`);
  }

  if (config.agents && config.agents.length > 0) {
    lines.push('agents:');
    for (const agent of config.agents) {
      lines.push(`  - id: ${agent.id}`);
      if (agent.name) lines.push(`    name: ${agent.name}`);
      if (agent.chinese_name) lines.push(`    chinese_name: ${agent.chinese_name}`);
      if (agent.config_type) lines.push(`    config_type: ${agent.config_type}`);
      if (agent.model) lines.push(`    model: ${agent.model}`);
      if (agent.instructions) lines.push(`    instructions: ${agent.instructions}`);
    }
  }

  return lines.join('\n') + '\n';
}

/**
 * Load orca.yaml from workspace.
 */
export async function loadOrcaConfig(workspacePath: string): Promise<OrcaConfig | null> {
  try {
    const { exists, readTextFile } = await import('@tauri-apps/plugin-fs');
    const { join } = await import('@tauri-apps/api/path');
    const yamlPath = await join(workspacePath, 'orca.yaml');
    if (!(await exists(yamlPath))) return null;
    const content = await readTextFile(yamlPath);
    return parseOrcaYaml(content);
  } catch {
    return null;
  }
}

/**
 * Save orca.yaml to workspace.
 */
export async function saveOrcaConfig(workspacePath: string, config: OrcaConfig): Promise<void> {
  const { writeTextFile } = await import('@tauri-apps/plugin-fs');
  const { join } = await import('@tauri-apps/api/path');
  const yamlPath = await join(workspacePath, 'orca.yaml');
  await writeTextFile(yamlPath, serializeOrcaYaml(config));
}
