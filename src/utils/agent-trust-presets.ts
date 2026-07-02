/**
 * Agent Trust Presets — 参考 Orca agent-trust-presets.ts
 * 预信任 workspace, 跳过 "Do you trust this folder?" 提示
 * 比自动发送 "1\n" 更可靠 — 在 agent 启动前写入信任文件
 */

import { homeDir } from '@tauri-apps/api/path';
import { exists, mkdir, writeTextFile } from '@tauri-apps/plugin-fs';
import { join } from '@tauri-apps/api/path';

// ══════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════

export type AgentTrustType = 'claude' | 'codex' | 'cursor' | 'copilot' | 'hermes';

export interface TrustPreset {
  agent: AgentTrustType;
  /** Check if workspace is already trusted */
  isTrusted(workspacePath: string): Promise<boolean>;
  /** Mark workspace as trusted */
  markTrusted(workspacePath: string): Promise<void>;
}

// ══════════════════════════════════════════════
// Claude Code Trust
// ══════════════════════════════════════════════
// Claude keeps trust at: ~/.claude/projects/<slug>/.trust
// slug = absolute path with leading / stripped, remaining / → -

function pathToSlug(workspacePath: string): string {
  return workspacePath.replace(/^\//, '').replace(/\//g, '-');
}

async function getClaudeTrustPath(workspacePath: string): Promise<string> {
  const home = await homeDir();
  const slug = pathToSlug(workspacePath);
  return await join(home, '.claude', 'projects', slug, '.trust');
}

const claudeTrust: TrustPreset = {
  agent: 'claude',
  async isTrusted(workspacePath: string): Promise<boolean> {
    try {
      const trustPath = await getClaudeTrustPath(workspacePath);
      return await exists(trustPath);
    } catch {
      return false;
    }
  },
  async markTrusted(workspacePath: string): Promise<void> {
    const trustPath = await getClaudeTrustPath(workspacePath);
    const dir = trustPath.replace(/\/[^/]+$/, '');
    try { await mkdir(dir, { recursive: true }); } catch { /* exists */ }
    await writeTextFile(trustPath, JSON.stringify({
      trustedAt: Date.now(),
      workspacePath,
    }));
  },
};

// ══════════════════════════════════════════════
// Codex Trust
// ══════════════════════════════════════════════
// Codex keeps trust at: ~/.codex/config.toml [projects."<path>"] trust_level = "trusted"

async function getCodexConfigPath(): Promise<string> {
  const home = await homeDir();
  return await join(home, '.codex', 'config.toml');
}

const codexTrust: TrustPreset = {
  agent: 'codex',
  async isTrusted(workspacePath: string): Promise<boolean> {
    try {
      const configPath = await getCodexConfigPath();
      if (!(await exists(configPath))) return false;
      const content = await (await import('@tauri-apps/plugin-fs')).readTextFile(configPath);
      return content.includes(`"${workspacePath}"`) && content.includes('trust_level');
    } catch {
      return false;
    }
  },
  async markTrusted(workspacePath: string): Promise<void> {
    const configPath = await getCodexConfigPath();
    let content = '';
    try {
      content = await (await import('@tauri-apps/plugin-fs')).readTextFile(configPath);
    } catch {
      content = '';
    }

    // Add trust entry if not present
    const trustSection = `\n[projects."${workspacePath}"]\ntrust_level = "trusted"\n`;
    if (!content.includes(`"${workspacePath}"`)) {
      content += trustSection;
      const dir = configPath.replace(/\/[^/]+$/, '');
      try { await mkdir(dir, { recursive: true }); } catch { /* exists */ }
      await (await import('@tauri-apps/plugin-fs')).writeTextFile(configPath, content);
    }
  },
};

// ══════════════════════════════════════════════
// Registry
// ══════════════════════════════════════════════

const presets: Record<AgentTrustType, TrustPreset> = {
  claude: claudeTrust,
  codex: codexTrust,
  cursor: claudeTrust, // Cursor uses similar trust mechanism
  copilot: codexTrust,  // Copilot uses similar trust mechanism
  hermes: codexTrust,   // Hermes uses similar trust mechanism
};

/**
 * Ensure workspace is trusted for an agent type.
 * Call before spawning the agent PTY.
 */
export async function ensureAgentTrust(agentType: AgentTrustType, workspacePath: string): Promise<boolean> {
  const preset = presets[agentType];
  if (!preset) return false;

  if (await preset.isTrusted(workspacePath)) {
    return true; // Already trusted
  }

  try {
    await preset.markTrusted(workspacePath);
    console.debug(`[AgentTrust] Marked ${workspacePath} as trusted for ${agentType}`);
    return true;
  } catch (e) {
    console.warn(`[AgentTrust] Failed to mark trusted for ${agentType}:`, e);
    return false;
  }
}

/**
 * Check if workspace is trusted for an agent type.
 */
export async function isAgentTrusted(agentType: AgentTrustType, workspacePath: string): Promise<boolean> {
  const preset = presets[agentType];
  if (!preset) return false;
  return preset.isTrusted(workspacePath);
}

/**
 * Map agent config_type to trust type.
 */
export function configTypeToTrustType(configType: string): AgentTrustType | null {
  switch (configType) {
    case 'anthropic_env': return 'claude';
    case 'codex_toml': return 'codex';
    case 'openai_env': return 'hermes';
    default: return null;
  }
}
