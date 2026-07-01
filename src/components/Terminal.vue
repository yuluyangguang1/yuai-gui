<template>
  <div
    class="terminal-container"
    @dragover.prevent="onDragOver"
    @dragleave="onDragLeave"
    @drop.prevent="onDrop"
  >
    <div class="terminal-header">
      <span class="terminal-agent-indicator" :style="{ background: agentColor }" />
      <span class="terminal-agent-glyph">{{ agentGlyph }}</span>
      <span class="terminal-agent-name">{{ agentName }}</span>
      <span v-if="currentCwd" class="terminal-cwd" :title="currentCwd">
        {{ shortCwd }}
      </span>
      <span class="terminal-spacer" />
      <button
        class="terminal-follow-btn"
        :class="{ active: isFollowing }"
        :title="isFollowing ? '停止跟踪' : '跟踪文件变化'"
        @click="toggleFollow"
      >
        <TIcon name="eye" :size="14" /> {{ isFollowing ? '跟踪中' : '跟踪' }}
      </button>
      <button class="terminal-close-btn" title="关闭终端" @click="handleClose"><TIcon name="close" :size="14" /></button>
    </div>
    <div
      ref="terminalEl"
      class="terminal-body"
      :class="{ 'drag-over': isDragOver }"
    />
    <!-- Drop overlay -->
    <div v-if="isDragOver" class="terminal-drop-overlay">
      <span class="terminal-drop-text">放置文件到终端</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from "vue";
import { TIcon } from "../utils/icons";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { invoke, Channel } from "@tauri-apps/api/core";
import { useSettingsStore } from "../stores/settings";
import { useWorkspaceStore } from "../stores/workspace";
import { extractPaths } from "../composables/usePathResolver";
import { TerminalBufferManager, FrameBudgetDrainer } from "../utils/terminal-buffer";

const props = defineProps<{
  agentId: string;
  agentName: string;
  agentGlyph: string;
  agentColor: string;
  cwd?: string;
}>();

const emit = defineEmits<{
  (e: "close"): void;
}>();

const settings = useSettingsStore();
const workspace = useWorkspaceStore();
const terminalEl = ref<HTMLElement | null>(null);
const bufferManager = new TerminalBufferManager();
const drainer = new FrameBudgetDrainer((taskId, data) => {
  if (terminal) terminal.write(data);
});
const isDragOver = ref(false);
const currentCwd = ref<string>(props.cwd ?? "");

const shortCwd = computed(() => {
  const cwd = currentCwd.value;
  if (!cwd) return "";
  const parts = cwd.split("/").filter(Boolean);
  if (parts.length <= 2) return cwd;
  return "…/" + parts.slice(-2).join("/");
});

let terminal: Terminal | null = null;
let fitAddon: FitAddon | null = null;
let ptyId: number | null = null;
let resizeTimer: ReturnType<typeof setTimeout> | null = null;
let resizeObserver: ResizeObserver | null = null;
let cwdPollTimer: ReturnType<typeof setInterval> | null = null;

// ── Follow Mode ──
const isFollowing = computed(() => workspace.followedAgentId === props.agentId);

function toggleFollow() {
  if (isFollowing.value) {
    workspace.unfollow();
  } else {
    workspace.followAgent(props.agentId);
  }
}

// ── Drag and Drop ──
let dragCounter = 0;

function onDragOver(_e: DragEvent) {
  // Required for drop to work
}

function onDragLeave(_e: DragEvent) {
  dragCounter--;
  if (dragCounter <= 0) {
    isDragOver.value = false;
    dragCounter = 0;
  }
}

function onDrop(e: DragEvent) {
  isDragOver.value = false;
  dragCounter = 0;

  const files = e.dataTransfer?.files;
  if (!files || files.length === 0) return;

  // Insert file paths into the terminal
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    // In Tauri webview, file.path contains the system path
    const filePath = (file as File & { path?: string }).path || file.name;
    if (terminal && ptyId != null) {
      // Quote the path and insert it
      const quoted = filePath.includes(" ") ? `"${filePath}"` : filePath;
      invoke("pty_write", { id: ptyId, data: quoted + " " }).catch((e) =>
        console.warn("pty_write failed:", e)
      );
    }
  }
}

// ── Track drag enter for nested elements ──
function handleDragEnter(e: DragEvent) {
  e.preventDefault();
  dragCounter++;
  isDragOver.value = true;
}

// ── Terminal Setup ──
function getTerminalTheme() {
  const isDark = settings.theme === "dark";
  return {
    background: isDark ? "#0b1a1a" : "#faf6f0",
    foreground: isDark ? "#e8ddd0" : "#3a3530",
    cursor: isDark ? "#5ccfb8" : "#2a8f7a",
    cursorAccent: isDark ? "#0b1a1a" : "#faf6f0",
    selectionBackground: isDark ? "rgba(92,207,184,0.25)" : "rgba(42,143,122,0.25)",
    black: isDark ? "#0b1a1a" : "#3a3530",
    red: "#ff6464",
    green: "#50c878",
    yellow: "#c9a85c",
    blue: "#64b5f6",
    magenta: "#a064ff",
    cyan: "#5ccfb8",
    white: isDark ? "#e8ddd0" : "#faf6f0",
    brightBlack: isDark ? "#887868" : "#8a7e70",
    brightRed: "#ff8c8c",
    brightGreen: "#70e898",
    brightYellow: "#d4b970",
    brightBlue: "#84c5f6",
    brightMagenta: "#b084ff",
    brightCyan: "#7adbc9",
    brightWhite: isDark ? "#f0e8e0" : "#ffffff",
  };
}

function debouncedResize(cols: number, rows: number) {
  if (resizeTimer) clearTimeout(resizeTimer);
  resizeTimer = setTimeout(async () => {
    if (ptyId != null) {
      try {
        await invoke("pty_resize", { id: ptyId, cols, rows });
      } catch (e) {
        console.warn("pty_resize failed:", e);
      }
    }
  }, 50);
}

async function spawnTerminal() {
  if (!terminalEl.value) return;

  // Create xterm terminal
  terminal = new Terminal({
    fontSize: 13,
    fontFamily: "'JetBrains Mono', 'Consolas', monospace",
    theme: getTerminalTheme(),
    cursorBlink: true,
    cursorStyle: "bar",
    scrollback: 5000,
    allowProposedApi: true,
  });

  // Addons
  fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);
  terminal.loadAddon(new WebLinksAddon());

  // Mount
  terminal.open(terminalEl.value);
  fitAddon.fit();

  // Register file path link provider
  (terminal as any).registerLinkProvider?.({
    provideLinks(bufferLineNumber: number, callback: (links: any[] | undefined) => void) {
      const line = terminal!.buffer.active.getLine(bufferLineNumber - 1);
      if (!line) { callback(undefined); return; }
      const text = line.translateToString(true);
      const paths = extractPaths(text);
      if (paths.length === 0) { callback(undefined); return; }
      const links = paths.map(p => {
        const startCol = text.indexOf(p.path) + 1;
        const endCol = startCol + p.path.length;
        return {
          range: { start: { x: startCol, y: bufferLineNumber }, end: { x: endCol, y: bufferLineNumber } },
          text: p.path,
          activate: () => {
            workspace.selectFile(p.path);
          },
        };
      }).filter(l => l.range.start.x > 0);
      callback(links);
    },
  });

  const cols = terminal.cols;
  const rows = terminal.rows;

  // onData: send input to PTY
  terminal.onData((data: string) => {
    if (ptyId != null) {
      invoke("pty_write", { id: ptyId, data }).catch((e) =>
        console.warn("pty_write failed:", e)
      );
    }
  });

  // Create Tauri Channel for on_data callback
  const on_data = new Channel<string>();
  on_data.onmessage = (data: string) => {
    terminal?.write(data);
  };

  // Spawn agent PTY
  try {
    ptyId = await invoke("spawn_agent", {
      agentId: props.agentId,
      cwd: props.cwd ?? null,
      cols,
      rows,
      onData: on_data,
    });

    // Start CWD polling
    startCwdPolling();
  } catch (e) {
    terminal.writeln(`\r\n\x1b[31m[错误] 无法启动代理 ${props.agentId}: ${e}\x1b[0m\r\n`);
    console.error("spawn_agent failed:", e);
  }

  // ResizeObserver for container
  resizeObserver = new ResizeObserver(() => {
    if (fitAddon && terminal) {
      fitAddon.fit();
      debouncedResize(terminal.cols, terminal.rows);
    }
  });
  resizeObserver.observe(terminalEl.value);
}

async function handleClose() {
  await cleanup();
  emit("close");
}

function startCwdPolling() {
  if (cwdPollTimer) clearInterval(cwdPollTimer);
  cwdPollTimer = setInterval(async () => {
    if (ptyId == null) return;
    try {
      const cwd: string = await invoke("pty_cwd", { id: ptyId });
      if (cwd && cwd !== currentCwd.value) {
        currentCwd.value = cwd;
      }
    } catch {
      // pty_cwd not available or pty closed
    }
  }, 3000);
}

async function cleanup() {
  // Unfollow if following this agent
  if (isFollowing.value) {
    workspace.unfollow();
  }
  // Kill PTY
  if (ptyId != null) {
    try {
      await invoke("pty_kill", { id: ptyId });
    } catch {
      // ignore
    }
    ptyId = null;
  }
  // Dispose terminal
  if (terminal) {
    terminal.dispose();
    terminal = null;
  }
  fitAddon = null;
  // Disconnect ResizeObserver
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
  if (resizeTimer) {
    clearTimeout(resizeTimer);
    resizeTimer = null;
  }
  if (cwdPollTimer) {
    clearInterval(cwdPollTimer);
    cwdPollTimer = null;
  }
}

// Re-open theme on change
watch(() => settings.theme, () => {
  if (terminal) {
    terminal.options.theme = getTerminalTheme();
  }
});

onMounted(() => {
  spawnTerminal();
  // Listen for dragenter at container level
  terminalEl.value?.parentElement?.addEventListener("dragenter", handleDragEnter);
});

onBeforeUnmount(() => {
  cleanup();
  terminalEl.value?.parentElement?.removeEventListener("dragenter", handleDragEnter);
});
</script>

<style scoped>
.terminal-cwd {
  font-size: 11px;
  color: var(--text-muted, #888);
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 1px 6px;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 3px;
}
</style>
