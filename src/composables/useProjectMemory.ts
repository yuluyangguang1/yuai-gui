/**
 * useProjectMemory — Project Memory (from FanBox)
 *
 * Read Claude Code and Codex session logs to show AI history
 * for the current project.
 */
import { ref, watch } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { useWorkspaceStore } from "../stores/workspace";

export interface ProjectSession {
  id: string;
  title: string;
  agent: "claude" | "codex";
  filesChanged: number;
  timestamp: number;
  inputTokens: number;
  outputTokens: number;
}

interface DirEntry {
  name: string;
  path: string;
  is_dir: boolean;
  size: number | null;
  mtime: number | null;
}

// Cache: key is file path, value is { size, mtime, parsed }
const cache = new Map<
  string,
  { size: number; mtime: number; sessions: ProjectSession[] }
>();

/**
 * Munge a directory path the way Claude Code does:
 * /Users/ylyg/Desktop/yuai-gui → -Users-ylyg-Desktop-yuai-gui
 */
function mungePath(dir: string): string {
  return dir.replace(/[\/\\]/g, "-");
}

/** Truncate text to maxLen characters */
function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + "…";
}

/**
 * Parse a single Claude Code JSONL session file.
 */
async function parseClaudeJsonl(
  filePath: string
): Promise<ProjectSession | null> {
  try {
    const content: string = await invoke("read_text_file", { path: filePath });
    const lines = content.split("\n").filter((l) => l.trim());

    let title = "Untitled session";
    let timestamp = 0;
    let inputTokens = 0;
    let outputTokens = 0;
    let filesChanged = 0;
    const seenFiles = new Set<string>();

    for (const line of lines) {
      try {
        const entry = JSON.parse(line);

        // Extract title from first user message
        if (entry.type === "user" && title === "Untitled session") {
          const msg = entry.message;
          if (msg?.content && typeof msg.content === "string") {
            title = truncate(msg.content, 80);
          } else if (msg?.content && Array.isArray(msg.content)) {
            const textPart = msg.content.find(
              (c: { type: string }) => c.type === "text"
            );
            if (textPart?.text) title = truncate(textPart.text, 80);
          }
        }

        // Extract timestamp
        if (entry.timestamp && !timestamp) {
          timestamp = new Date(entry.timestamp).getTime();
        }

        // Extract token usage from assistant messages
        if (entry.type === "assistant" && entry.message?.usage) {
          const u = entry.message.usage;
          inputTokens += u.input_tokens || 0;
          outputTokens += u.output_tokens || 0;
        }

        // Track files changed via tool_use (Write/Edit/etc.)
        if (entry.type === "assistant" && entry.message?.content) {
          const content = entry.message.content;
          if (Array.isArray(content)) {
            for (const block of content) {
              if (block.type === "tool_use") {
                const input = block.input || {};
                // Common file-writing tools
                const filePath =
                  input.file_path || input.path || input.filename;
                if (
                  filePath &&
                  (block.name === "Write" ||
                    block.name === "Edit" ||
                    block.name === "create" ||
                    block.name === "str_replace_editor")
                ) {
                  seenFiles.add(filePath);
                }
              }
            }
          }
        }
      } catch {
        // Skip malformed lines
      }
    }

    filesChanged = seenFiles.size;
    if (!timestamp) {
      // Fallback: use file mtime
      const stat: DirEntry[] = await invoke("list_dir", {
        path: filePath.replace(/\/[^/]+$/, ""),
      });
      const entry = stat.find((e) => e.path === filePath);
      if (entry?.mtime) timestamp = entry.mtime * 1000;
    }

    const id = filePath.split(/[\/\\]/).pop()?.replace(".jsonl", "") ?? filePath;

    return {
      id,
      title,
      agent: "claude",
      filesChanged,
      timestamp,
      inputTokens,
      outputTokens,
    };
  } catch {
    return null;
  }
}

/**
 * Parse Claude Code sessions for a given project directory.
 * Reads ~/.claude/projects/<munged(dir)>/*.jsonl
 */
async function parseClaudeSessions(
  dir: string
): Promise<ProjectSession[]> {
  const home =
    (await invoke<string>("get_home_dir").catch(() => "")) || "";
  const munged = mungePath(dir);
  const sessionsDir = `${home}/.claude/projects/${munged}`;

  try {
    const entries: DirEntry[] = await invoke("list_dir", { path: sessionsDir });
    const jsonlFiles = entries.filter(
      (e) => !e.is_dir && e.name.endsWith(".jsonl")
    );

    const sessions: ProjectSession[] = [];
    for (const file of jsonlFiles.slice(0, 50)) {
      // Limit to 50 most recent
      // Check cache
      const cached = cache.get(file.path);
      if (
        cached &&
        cached.size === (file.size ?? 0) &&
        cached.mtime === (file.mtime ?? 0)
      ) {
        sessions.push(...cached.sessions);
        continue;
      }

      const parsed = await parseClaudeJsonl(file.path);
      if (parsed) {
        sessions.push(parsed);
        cache.set(file.path, {
          size: file.size ?? 0,
          mtime: file.mtime ?? 0,
          sessions: [parsed],
        });
      }
    }

    // Sort by timestamp descending
    sessions.sort((a, b) => b.timestamp - a.timestamp);
    return sessions;
  } catch {
    return [];
  }
}

/**
 * Parse Codex sessions for a given project directory.
 * Reads ~/.codex/sessions/ and matches by cwd.
 */
async function parseCodexSessions(
  dir: string
): Promise<ProjectSession[]> {
  const home =
    (await invoke<string>("get_home_dir").catch(() => "")) || "";
  const sessionsDir = `${home}/.codex/sessions`;

  try {
    const entries: DirEntry[] = await invoke("list_dir", { path: sessionsDir });
    const jsonlFiles = entries.filter(
      (e) => !e.is_dir && e.name.endsWith(".jsonl")
    );

    const sessions: ProjectSession[] = [];
    for (const file of jsonlFiles.slice(0, 50)) {
      try {
        const content: string = await invoke("read_text_file", {
          path: file.path,
        });
        // Check if first line contains matching cwd
        const firstLine = content.split("\n")[0];
        if (!firstLine?.includes(dir)) continue;

        const lines = content.split("\n").filter((l) => l.trim());
        let title = "Codex session";
        let timestamp = 0;

        for (const line of lines) {
          try {
            const entry = JSON.parse(line);
            if (entry.type === "message" && entry.role === "user") {
              const c = entry.content;
              if (typeof c === "string") {
                title = truncate(c, 80);
                break;
              }
            }
            if (entry.timestamp && !timestamp) {
              timestamp = new Date(entry.timestamp).getTime();
            }
          } catch {
            // skip
          }
        }

        if (!timestamp && file.mtime) timestamp = file.mtime * 1000;

        const id = file.name.replace(".jsonl", "");
        sessions.push({
          id,
          title,
          agent: "codex",
          filesChanged: 0,
          timestamp,
          inputTokens: 0,
          outputTokens: 0,
        });
      } catch {
        // skip unreadable files
      }
    }

    sessions.sort((a, b) => b.timestamp - a.timestamp);
    return sessions;
  } catch {
    return [];
  }
}

export function useProjectMemory() {
  const sessions = ref<ProjectSession[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const workspace = useWorkspaceStore();

  async function load() {
    if (!workspace.path) {
      sessions.value = [];
      return;
    }

    loading.value = true;
    error.value = null;

    try {
      const [claude, codex] = await Promise.all([
        parseClaudeSessions(workspace.path),
        parseCodexSessions(workspace.path),
      ]);
      // Merge and sort
      const all = [...claude, ...codex];
      all.sort((a, b) => b.timestamp - a.timestamp);
      sessions.value = all;
    } catch (e) {
      error.value = String(e);
      sessions.value = [];
    } finally {
      loading.value = false;
    }
  }

  // Auto-reload when workspace path changes
  watch(() => workspace.path, load, { immediate: true });

  return { sessions, loading, error, load };
}
