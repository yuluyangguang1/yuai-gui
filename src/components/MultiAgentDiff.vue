<template>
  <div class="multi-agent-diff">
    <!-- Header -->
    <div class="mad-header">
      <div class="mad-title-row">
        <span class="mad-title">多 Agent Diff</span>
        <span class="mad-badge" v-if="totalFiles > 0">
          {{ resolvedCount }}/{{ totalFiles }}
        </span>
      </div>
      <div class="mad-actions">
        <button class="mad-btn auto" @click="autoResolve" :disabled="conflictCount === 0">
          自动选择
        </button>
        <button class="mad-btn merge" @click="mergeSelected" :disabled="unresolvedCount > 0">
          合并已选 ({{ resolvedCount }})
        </button>
      </div>
    </div>

    <!-- Conflict Summary -->
    <div class="mad-summary" v-if="conflictCount > 0 || resolvedCount > 0">
      <span class="mad-summary-item conflict" v-if="conflictCount > 0">
        <TIcon name="warning" :size="14" /> {{ conflictCount }} 冲突
      </span>
      <span class="mad-summary-item resolved" v-if="resolvedCount > 0">
        <TIcon name="check" :size="14" /> {{ resolvedCount }} 已解决
      </span>
    </div>

    <!-- File List -->
    <div class="mad-file-list">
      <div
        v-for="file in fileConflicts" :key="file.path"
        class="mad-file-item"
        :class="{ 'has-conflict': file.hasConflict, 'is-selected': selectedFile === file.filePath }"
        @click="selectedFile = file.filePath"
      >
        <span class="mad-file-status" :class="file.hasConflict ? 'conflict' : 'ok'">
          <TIcon :name="file.hasConflict ? 'warning' : 'check'" :size="14" />
        </span>
        <span class="mad-file-path">{{ file.filePath }}</span>
        <span class="mad-file-agents">
          {{ file.agentChanges.map(c => c.agentId).join(', ') }}
        </span>
      </div>
    </div>

    <!-- Side-by-Side Diff View -->
    <div class="mad-diff-area" v-if="selectedFile">
      <div class="mad-diff-header">
        <span class="mad-diff-file">{{ selectedFile }}</span>
        <div class="mad-diff-agent-tabs">
          <button
            v-for="change in selectedFileChanges"
            :key="change.agentId"
            class="mad-agent-tab"
            :class="{
              active: selectedAgentForFile === change.agentId,
              selected: fileSelections.get(selectedFile) === change.agentId,
            }"
            @click="selectAgentForFile(change.agentId)"
            :style="{ '--agent-color': getAgentColor(change.agentId) }"
          >
            {{ getAgentGlyph(change.agentId) }} {{ change.agentId }}
          </button>
        </div>
      </div>

      <!-- Side by side columns -->
      <div class="mad-columns" :style="{ '--cols': selectedFileChanges.length }">
        <div
          v-for="change in selectedFileChanges"
          :key="change.agentId"
          class="mad-column"
          :class="{
            'is-highlighted': selectedAgentForFile === change.agentId,
            'is-selected': fileSelections.get(selectedFile) === change.agentId,
          }"
          :style="{ '--agent-color': getAgentColor(change.agentId) }"
        >
          <div class="mad-col-header" @click="selectAgentForFile(change.agentId)">
            <span class="mad-col-agent">{{ getAgentGlyph(change.agentId) }} {{ change.agentId }}</span>
            <button
              class="mad-col-pick"
              :class="{ picked: fileSelections.get(selectedFile) === change.agentId }"
              @click.stop="pickAgent(change.agentId)"
            >
              <TIcon v-if="fileSelections.get(selectedFile) === change.agentId" name="check" :size="14" /> {{ fileSelections.get(selectedFile) === change.agentId ? '已选' : '选用' }}
            </button>
          </div>
          <div class="mad-col-diff">
            <div
              v-for="(line, idx) in parseDiff(change.diff)"
              :key="idx"
              class="mad-diff-line"
              :class="line.type"
            >
              <span class="mad-diff-gutter">{{ line.lineNum }}</span>
              <span class="mad-diff-marker">{{ line.marker }}</span>
              <span class="mad-diff-text">{{ line.text }}</span>
            </div>
            <div v-if="!change.diff" class="mad-diff-empty">
              无差异
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Empty State -->
    <div class="mad-empty" v-if="!selectedFile && fileConflicts.length === 0">
      <TIcon name="file" :size="32" />
      <p>暂无多 Agent 变更</p>
      <p class="mad-empty-hint">多个 Agent 修改相同文件时会在此显示</p>
    </div>

    <!-- Merge Results -->
    <div class="mad-results" v-if="mergeResults.length > 0">
      <div class="mad-results-header">合并结果</div>
      <div
        v-for="result in mergeResults"
        :key="result.filePath"
        class="mad-result-item"
        :class="result.success ? 'success' : 'error'"
      >
        <span class="mad-result-icon"><TIcon :name="result.success ? 'check' : 'close'" :size="14" /></span>
        <span class="mad-result-file">{{ result.filePath }}</span>
        <span class="mad-result-agent" v-if="result.sourceAgentId">← {{ result.sourceAgentId }}</span>
        <span class="mad-result-error" v-if="result.error">{{ result.error }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { TIcon } from "../utils/icons";
import { useMultiDiffStore, type FileConflict } from '../stores/multiDiff';
import { useAgentsStore } from '../stores/agents';

const multiDiff = useMultiDiffStore();
const agentsStore = useAgentsStore();

const selectedFile = ref<string | null>(null);
const selectedAgentForFile = ref<string | null>(null);

// Use the store's selectedChanges as our fileSelections
const fileSelections = computed(() => multiDiff.selectedChanges);
const fileConflicts = computed(() => multiDiff.activeSnapshot?.conflicts ?? []);
const totalFiles = computed(() => multiDiff.totalFiles);
const conflictCount = computed(() => multiDiff.conflictCount);
const resolvedCount = computed(() => multiDiff.resolvedCount);
const unresolvedCount = computed(() => conflictCount.value - resolvedCount.value);
const mergeResults = computed(() => multiDiff.mergeResults);

const selectedFileChanges = computed(() => {
  if (!selectedFile.value) return [];
  return multiDiff.getFileChanges(selectedFile.value);
});

// ── Helpers ──

function getAgentColor(agentId: string): string {
  const agent = agentsStore.agents.find(a => a.id === agentId);
  return agent?.color ?? '#888';
}

function getAgentGlyph(agentId: string): string {
  const agent = agentsStore.agents.find(a => a.id === agentId);
  return agent?.glyph ?? agentId[0];
}

interface DiffLine {
  type: 'add' | 'del' | 'hunk' | 'header' | 'context';
  text: string;
  marker: string;
  lineNum: string;
}

function parseDiff(diff: string): DiffLine[] {
  if (!diff) return [];
  const lines = diff.split('\n');
  const result: DiffLine[] = [];
  let lineNum = 0;

  for (const line of lines) {
    if (line.startsWith('@@')) {
      // Extract line number from hunk header
      const match = line.match(/@@ -\d+(?:,\d+)? \+(\d+)/);
      if (match) lineNum = parseInt(match[1], 10) - 1;
      result.push({ type: 'hunk', text: line, marker: '@', lineNum: '' });
    } else if (line.startsWith('diff ') || line.startsWith('---') || line.startsWith('+++')) {
      result.push({ type: 'header', text: line, marker: '', lineNum: '' });
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      lineNum++;
      result.push({ type: 'add', text: line.slice(1), marker: '+', lineNum: String(lineNum) });
    } else if (line.startsWith('-') && !line.startsWith('---')) {
      result.push({ type: 'del', text: line.slice(1), marker: '-', lineNum: '' });
    } else {
      lineNum++;
      result.push({ type: 'context', text: line, marker: ' ', lineNum: String(lineNum) });
    }
  }

  return result;
}

// ── Actions ──

function selectAgentForFile(agentId: string) {
  selectedAgentForFile.value = agentId;
}

function pickAgent(agentId: string) {
  if (selectedFile.value) {
    multiDiff.selectChange(selectedFile.value, agentId);
  }
}

function autoResolve() {
  multiDiff.autoResolve();
}

async function mergeSelected() {
  const basePath = agentsStore.activeAgent?.id ? '' : '';
  await multiDiff.mergeSelected(basePath);
}
</script>

<style scoped>
.multi-agent-diff {
  display: flex;
  flex-direction: column;
  height: 100%;
  font-family: var(--font-sans, system-ui, sans-serif);
  font-size: 12px;
  color: var(--text-primary, #e0e0e0);
}

/* ── Header ── */
.mad-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-light, #333);
  flex-shrink: 0;
}

.mad-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.mad-title {
  font-weight: 600;
  font-size: 12px;
  color: var(--text-muted, #aaa);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.mad-badge {
  background: var(--accent, #50c878);
  color: #000;
  padding: 1px 6px;
  border-radius: 8px;
  font-size: 10px;
  font-weight: 600;
}

.mad-actions {
  display: flex;
  gap: 6px;
}

.mad-btn {
  padding: 3px 10px;
  border: 1px solid var(--border, #444);
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
  font-weight: 500;
  transition: all 0.15s;
  background: transparent;
  color: var(--text-primary, #e0e0e0);
}

.mad-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.mad-btn.auto {
  color: var(--gold, #ffc107);
  border-color: var(--gold, #ffc107);
}

.mad-btn.auto:hover:not(:disabled) {
  background: rgba(255, 193, 7, 0.1);
}

.mad-btn.merge {
  color: var(--accent, #50c878);
  border-color: var(--accent, #50c878);
}

.mad-btn.merge:hover:not(:disabled) {
  background: rgba(80, 200, 120, 0.1);
}

/* ── Summary ── */
.mad-summary {
  display: flex;
  gap: 12px;
  padding: 6px 12px;
  border-bottom: 1px solid var(--border-light, #333);
  flex-shrink: 0;
}

.mad-summary-item {
  font-size: 11px;
  font-weight: 500;
}

.mad-summary-item.conflict {
  color: var(--vermilion-glow, #ff6464);
}

.mad-summary-item.resolved {
  color: var(--accent, #50c878);
}

/* ── File List ── */
.mad-file-list {
  border-bottom: 1px solid var(--border-light, #333);
  max-height: 180px;
  overflow-y: auto;
  flex-shrink: 0;
}

.mad-file-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 12px;
  cursor: pointer;
  transition: background 0.15s;
  font-family: var(--font-mono, monospace);
  font-size: 11px;
}

.mad-file-item:hover {
  background: var(--bg-hover, rgba(255, 255, 255, 0.04));
}

.mad-file-item.is-selected {
  background: var(--bg-active, rgba(255, 255, 255, 0.08));
}

.mad-file-status {
  width: 14px;
  text-align: center;
  flex-shrink: 0;
}

.mad-file-status.conflict {
  color: var(--vermilion-glow, #ff6464);
}

.mad-file-status.ok {
  color: var(--accent, #50c878);
}

.mad-file-path {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mad-file-agents {
  color: var(--text-muted, #888);
  font-size: 10px;
  flex-shrink: 0;
}

/* ── Diff Area ── */
.mad-diff-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.mad-diff-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  border-bottom: 1px solid var(--border-light, #333);
  flex-shrink: 0;
}

.mad-diff-file {
  font-family: var(--font-mono, monospace);
  font-weight: 600;
  font-size: 12px;
  color: var(--text-primary, #e0e0e0);
}

.mad-diff-agent-tabs {
  display: flex;
  gap: 4px;
}

.mad-agent-tab {
  padding: 2px 8px;
  border: 1px solid var(--border, #444);
  border-radius: 4px;
  cursor: pointer;
  font-size: 10px;
  font-weight: 500;
  background: transparent;
  color: var(--text-muted, #aaa);
  transition: all 0.15s;
}

.mad-agent-tab.active {
  border-color: var(--agent-color, #888);
  color: var(--agent-color, #888);
}

.mad-agent-tab.selected {
  background: var(--agent-color, #888);
  color: #000;
  border-color: var(--agent-color, #888);
}

/* ── Columns ── */
.mad-columns {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(var(--cols, 2), 1fr);
  gap: 0;
  overflow: hidden;
}

.mad-column {
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--border-light, #333);
  overflow: hidden;
}

.mad-column:last-child {
  border-right: none;
}

.mad-column.is-highlighted {
  border-top: 2px solid var(--agent-color, #888);
}

.mad-col-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 4px 8px;
  border-bottom: 1px solid var(--border-light, #333);
  background: var(--surface, #1a1a1a);
  cursor: pointer;
  flex-shrink: 0;
}

.mad-col-agent {
  font-weight: 600;
  font-size: 11px;
  color: var(--agent-color, #888);
}

.mad-col-pick {
  padding: 1px 6px;
  border: 1px solid var(--border, #444);
  border-radius: 3px;
  cursor: pointer;
  font-size: 10px;
  background: transparent;
  color: var(--text-muted, #aaa);
  transition: all 0.15s;
}

.mad-col-pick.picked {
  background: var(--accent, #50c878);
  color: #000;
  border-color: var(--accent, #50c878);
}

.mad-col-pick:hover {
  border-color: var(--accent, #50c878);
  color: var(--accent, #50c878);
}

.mad-col-diff {
  flex: 1;
  overflow: auto;
  font-family: var(--font-mono, monospace);
  font-size: 11px;
  line-height: 1.5;
  background: var(--bg, #111);
}

.mad-diff-line {
  display: flex;
  align-items: flex-start;
  padding: 0 6px;
  min-height: 20px;
  white-space: pre;
}

.mad-diff-line.add {
  background: rgba(80, 200, 120, 0.12);
}

.mad-diff-line.del {
  background: rgba(255, 100, 100, 0.12);
}

.mad-diff-line.hunk {
  background: rgba(255, 200, 50, 0.08);
  color: var(--gold, #ffc107);
}

.mad-diff-line.header {
  color: var(--text-muted, #888);
}

.mad-diff-gutter {
  width: 32px;
  text-align: right;
  padding-right: 6px;
  color: var(--text-muted, #666);
  font-size: 10px;
  user-select: none;
  flex-shrink: 0;
}

.mad-diff-marker {
  width: 14px;
  text-align: center;
  font-weight: 700;
  flex-shrink: 0;
}

.mad-diff-line.add .mad-diff-marker {
  color: var(--accent, #50c878);
}

.mad-diff-line.del .mad-diff-marker {
  color: var(--vermilion-glow, #ff6464);
}

.mad-diff-text {
  flex: 1;
  padding-left: 4px;
}

.mad-diff-empty {
  padding: 20px;
  text-align: center;
  color: var(--text-muted, #888);
}

/* ── Empty State ── */
.mad-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px;
  color: var(--text-muted, #888);
}

.mad-empty-icon {
  font-size: 2rem;
  color: var(--accent, #50c878);
  opacity: 0.5;
  margin-bottom: 8px;
}

.mad-empty-hint {
  font-size: 11px;
  color: var(--text-muted, #666);
  margin-top: 4px;
}

/* ── Merge Results ── */
.mad-results {
  border-top: 1px solid var(--border-light, #333);
  max-height: 150px;
  overflow-y: auto;
  flex-shrink: 0;
}

.mad-results-header {
  padding: 6px 12px;
  font-weight: 600;
  font-size: 11px;
  color: var(--text-muted, #aaa);
  background: var(--surface, #1a1a1a);
  border-bottom: 1px solid var(--border-light, #333);
}

.mad-result-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 12px;
  font-family: var(--font-mono, monospace);
  font-size: 11px;
}

.mad-result-item.success .mad-result-icon {
  color: var(--accent, #50c878);
}

.mad-result-item.error .mad-result-icon {
  color: var(--vermilion-glow, #ff6464);
}

.mad-result-file {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mad-result-agent {
  color: var(--text-muted, #888);
  font-size: 10px;
}

.mad-result-error {
  color: var(--vermilion-glow, #ff6464);
  font-size: 10px;
}
</style>
