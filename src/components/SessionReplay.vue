<template>
  <div class="session-replay">
    <div v-if="!selectedRecording" class="recording-list">
      <div class="replay-header">
        <span class="replay-title">终端回放</span>
        <button class="replay-refresh" @click="recordingStore.loadRecordings()">
          <TIcon name="refresh" :size="14" /> 刷新
        </button>
      </div>
      <div v-if="recordingStore.loading" class="replay-empty">加载中...</div>
      <div
        v-else-if="recordingStore.recordings.length === 0"
        class="replay-empty"
      >
        暂无录制
      </div>
      <div
        v-for="rec in recordingStore.recordings"
        :key="rec.path"
        class="recording-item"
        @click="selectRecording(rec)"
      >
        <div class="rec-info">
          <span class="rec-session">{{ rec.sessionId }}</span>
          <span class="rec-time">{{ formatTimestamp(rec.timestamp) }}</span>
        </div>
        <div class="rec-meta">
          <span class="rec-duration">{{ formatDuration(rec.duration) }}</span>
          <button
            class="rec-delete"
            title="删除"
            @click.stop="recordingStore.deleteRecording(rec.path)"
          >
            ✕
          </button>
        </div>
      </div>
    </div>

    <div v-else class="replay-player">
      <div class="replay-toolbar">
        <button class="replay-back" @click="backToList"><TIcon name="arrowLeft" :size="14" /> 返回</button>
        <span class="replay-session-id">{{ selectedRecording.sessionId }}</span>
        <span class="replay-spacer" />
        <button class="replay-ctrl" @click="togglePlay">
          {{ playing ? "⏸" : "▶" }}
        </button>
        <select v-model="speed" class="replay-speed">
          <option :value="1">1×</option>
          <option :value="2">2×</option>
          <option :value="4">4×</option>
        </select>
        <span class="replay-time-display">
          {{ formatDuration(currentTime) }} / {{ formatDuration(totalDuration) }}
        </span>
      </div>
      <input
        type="range"
        class="replay-scrubber"
        :min="0"
        :max="totalDuration"
        :step="0.1"
        :value="currentTime"
        @input="onSeek"
      />
      <div ref="replayTerminalEl" class="replay-terminal" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from "vue";
import { Terminal } from "@xterm/xterm";
import { useRecordingStore, type RecordingInfo } from "../stores/recording";

const recordingStore = useRecordingStore();
const replayTerminalEl = ref<HTMLElement | null>(null);

const selectedRecording = ref<RecordingInfo | null>(null);
const playing = ref(false);
const speed = ref(1);
const currentTime = ref(0);
const totalDuration = ref(0);

let terminal: Terminal | null = null;
let events: Array<[number, string, string]> = [];
let playTimer: ReturnType<typeof requestAnimationFrame> | null = null;
let playStartTime = 0;
let playOffset = 0;

function formatTimestamp(ts: string): string {
  const d = new Date(parseInt(ts) * 1000);
  return d.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

async function selectRecording(rec: RecordingInfo) {
  selectedRecording.value = rec;
  const content = await recordingStore.readRecording(rec.path);
  parseCast(content);
  totalDuration.value =
    events.length > 0 ? events[events.length - 1][0] : rec.duration;
  currentTime.value = 0;
  playing.value = false;

  // Init terminal
  await new Promise((r) => setTimeout(r, 50));
  initReplayTerminal();
}

function parseCast(content: string) {
  events = [];
  const lines = content.split("\n");
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line);
      if (Array.isArray(parsed) && parsed.length >= 3) {
        // Idle compression: cap gaps at 2s
        events.push(parsed);
      }
    } catch {
      // Skip non-JSON lines (header)
    }
  }
  // Apply idle compression
  for (let i = 1; i < events.length; i++) {
    const gap = events[i][0] - events[i - 1][0];
    if (gap > 2) {
      const excess = gap - 2;
      for (let j = i; j < events.length; j++) {
        events[j] = [events[j][0] - excess, events[j][1], events[j][2]];
      }
    }
  }
  totalDuration.value =
    events.length > 0 ? events[events.length - 1][0] : 0;
}

function initReplayTerminal() {
  if (terminal) {
    terminal.dispose();
  }
  if (!replayTerminalEl.value) return;
  terminal = new Terminal({
    fontSize: 13,
    fontFamily: "'JetBrains Mono', 'Consolas', monospace",
    theme: {
      background: "#0b1a1a",
      foreground: "#e8ddd0",
      cursor: "#5ccfb8",
    },
    cursorBlink: false,
    scrollback: 0,
    disableStdin: true,
  });
  terminal.open(replayTerminalEl.value);
}

function togglePlay() {
  if (playing.value) {
    pausePlay();
  } else {
    startPlay();
  }
}

function startPlay() {
  playing.value = true;
  playStartTime = performance.now();
  playOffset = currentTime.value;
  tick();
}

function pausePlay() {
  playing.value = false;
  if (playTimer) {
    cancelAnimationFrame(playTimer);
    playTimer = null;
  }
}

function tick() {
  if (!playing.value || !terminal) return;

  const elapsed =
    (performance.now() - playStartTime) / 1000 * speed.value + playOffset;
  currentTime.value = Math.min(elapsed, totalDuration.value);

  // Write all events up to currentTime
  // We need to replay from scratch for seeking, so we track the last event index
  // For simplicity, we'll use a different approach: track last written index
  replayUpTo(currentTime.value);

  if (currentTime.value >= totalDuration.value) {
    playing.value = false;
    return;
  }

  playTimer = requestAnimationFrame(tick);
}

let lastEventIndex = 0;

function replayUpTo(time: number) {
  if (!terminal) return;

  // If seeking backwards, we need to reset
  if (lastEventIndex > 0 && events.length > 0 && events[lastEventIndex - 1][0] > time) {
    terminal.reset();
    lastEventIndex = 0;
  }

  while (lastEventIndex < events.length && events[lastEventIndex][0] <= time) {
    const [, type, data] = events[lastEventIndex];
    if (type === "o") {
      terminal.write(data);
    }
    // 'i' (input) and 'r' (resize) are not rendered in replay
    lastEventIndex++;
  }
}

function onSeek(e: Event) {
  const val = parseFloat((e.target as HTMLInputElement).value);
  currentTime.value = val;
  if (terminal) {
    terminal.reset();
    lastEventIndex = 0;
    replayUpTo(val);
  }
  if (playing.value) {
    pausePlay();
    startPlay();
  }
}

function backToList() {
  pausePlay();
  selectedRecording.value = null;
  events = [];
  lastEventIndex = 0;
  if (terminal) {
    terminal.dispose();
    terminal = null;
  }
}

onMounted(() => {
  recordingStore.loadRecordings();
});

onBeforeUnmount(() => {
  pausePlay();
  if (terminal) {
    terminal.dispose();
    terminal = null;
  }
});
</script>

<style scoped>
.session-replay {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.replay-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.replay-title {
  font-size: 0.72rem;
  color: var(--jade, #5ccfb8);
  font-family: var(--font-brush);
}

.replay-refresh {
  font-size: 0.62rem;
  color: var(--silver, #887868);
  background: none;
  border: 1px solid rgba(255, 255, 255, 0.08);
  padding: 2px 8px;
  border-radius: 4px;
  cursor: pointer;
}

.replay-empty {
  padding: 24px;
  text-align: center;
  color: var(--silver, #887868);
  font-size: 0.7rem;
}

.recording-list {
  overflow-y: auto;
  flex: 1;
}

.recording-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  cursor: pointer;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  transition: background 0.15s;
}

.recording-item:hover {
  background: rgba(92, 207, 184, 0.06);
}

.rec-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.rec-session {
  font-size: 0.68rem;
  color: var(--jade, #5ccfb8);
  font-family: monospace;
}

.rec-time {
  font-size: 0.6rem;
  color: var(--silver, #887868);
}

.rec-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.rec-duration {
  font-size: 0.6rem;
  color: var(--silver, #887868);
}

.rec-delete {
  font-size: 0.6rem;
  color: var(--vermilion-glow);
  background: none;
  border: none;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s;
}

.recording-item:hover .rec-delete {
  opacity: 1;
}

/* ── Replay Player ── */

.replay-player {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.replay-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.replay-back {
  font-size: 0.62rem;
  color: var(--silver, #887868);
  background: none;
  border: 1px solid rgba(255, 255, 255, 0.08);
  padding: 2px 8px;
  border-radius: 4px;
  cursor: pointer;
}

.replay-session-id {
  font-size: 0.62rem;
  color: var(--jade, #5ccfb8);
  font-family: monospace;
}

.replay-spacer {
  flex: 1;
}

.replay-ctrl {
  font-size: 0.8rem;
  color: var(--jade, #5ccfb8);
  background: none;
  border: 1px solid rgba(92, 207, 184, 0.3);
  padding: 2px 10px;
  border-radius: 4px;
  cursor: pointer;
}

.replay-speed {
  font-size: 0.6rem;
  background: rgba(0, 0, 0, 0.3);
  color: var(--silver, #887868);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 3px;
  padding: 1px 4px;
}

.replay-time-display {
  font-size: 0.6rem;
  color: var(--silver, #887868);
  font-family: monospace;
  min-width: 80px;
  text-align: right;
}

.replay-scrubber {
  width: 100%;
  height: 4px;
  -webkit-appearance: none;
  appearance: none;
  background: rgba(255, 255, 255, 0.08);
  outline: none;
  cursor: pointer;
}

.replay-scrubber::-webkit-slider-thumb {
  -webkit-appearance: none;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--jade, #5ccfb8);
  cursor: pointer;
}

.replay-terminal {
  flex: 1;
  min-height: 0;
  overflow: hidden;
}
</style>
