<template>
  <div class="inline-diff">
    <div class="diff-toolbar">
      <span class="diff-title">Inline Diff</span>
      <div class="diff-actions">
        <button class="diff-btn accept-all" @click="acceptAll" title="Accept All"><TIcon name="check" :size="14" /> Accept All</button>
        <button class="diff-btn reject-all" @click="rejectAll" title="Reject All"><TIcon name="close" :size="14" /> Reject All</button>
      </div>
    </div>
    <div class="diff-editor" ref="editorRef">
      <div
        v-for="(line, idx) in displayLines"
        :key="idx"
        class="diff-line"
        :class="{
          'diff-insert': line.type === 'insert',
          'diff-delete': line.type === 'delete',
          'diff-replace': line.type === 'replace',
          'diff-equal': line.type === 'equal',
        }"
      >
        <span class="diff-gutter">{{ line.lineNum }}</span>
        <span class="diff-marker">{{ line.marker }}</span>
        <span class="diff-text">{{ line.text }}</span>
        <button
          v-if="line.type !== 'equal'"
          class="diff-inline-btn accept"
          @click="acceptChange(idx)"
          title="Accept"
        ><TIcon name="check" :size="14" /></button>
        <button
          v-if="line.type !== 'equal'"
          class="diff-inline-btn reject"
          @click="rejectChange(idx)"
          title="Reject"
        ><TIcon name="close" :size="14" /></button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { TIcon } from "../utils/icons";
import { findDiffs } from '../utils/diffEngine';
import type { DiffOp } from '../utils/diffEngine';

const props = defineProps<{
  /** Original text */
  original: string;
  /** Modified text */
  modified: string;
}>();

const emit = defineEmits<{
  (e: 'accept', result: string): void;
  (e: 'reject'): void;
}>();

const editorRef = ref<HTMLElement | null>(null);

/** Accepted changes tracker — indices of changes that have been accepted */
const acceptedChanges = ref<Set<number>>(new Set());
/** Rejected changes tracker */
const rejectedChanges = ref<Set<number>>(new Set());

/** Compute diff operations */
const diffResult = computed(() => findDiffs(props.original, props.modified));

/** Build display lines from diff operations */
interface DisplayLine {
  type: 'insert' | 'delete' | 'replace' | 'equal';
  text: string;
  marker: string;
  lineNum: string;
  opIndex: number;
}

const displayLines = computed<DisplayLine[]>(() => {
  const ops = diffResult.value.ops;
  const lines: DisplayLine[] = [];
  let oldLine = 1;
  let newLine = 1;

  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];

    if (op.type === 'equal') {
      const text = (op.newValue ?? op.oldValue ?? '').split('\n').filter(l => l !== '');
      for (const line of text) {
        lines.push({
          type: 'equal',
          text: line,
          marker: ' ',
          lineNum: String(newLine),
          opIndex: i,
        });
        oldLine++;
        newLine++;
      }
    } else if (op.type === 'insert') {
      if (rejectedChanges.value.has(i)) continue;
      const text = (op.newValue ?? '').split('\n').filter(l => l !== '');
      for (const line of text) {
        lines.push({
          type: 'insert',
          text: line,
          marker: '+',
          lineNum: String(newLine),
          opIndex: i,
        });
        newLine++;
      }
    } else if (op.type === 'delete') {
      if (rejectedChanges.value.has(i)) {
        // Show the original text as normal when rejected
        const text = (op.oldValue ?? '').split('\n').filter(l => l !== '');
        for (const line of text) {
          lines.push({
            type: 'equal',
            text: line,
            marker: ' ',
            lineNum: String(oldLine),
            opIndex: i,
          });
          oldLine++;
        }
        continue;
      }
      const text = (op.oldValue ?? '').split('\n').filter(l => l !== '');
      for (const line of text) {
        lines.push({
          type: 'delete',
          text: line,
          marker: '-',
          lineNum: String(oldLine),
          opIndex: i,
        });
        oldLine++;
      }
    } else if (op.type === 'replace') {
      if (rejectedChanges.value.has(i)) {
        // Show old text as normal
        const oldText = (op.oldValue ?? '').split('\n').filter(l => l !== '');
        for (const line of oldText) {
          lines.push({
            type: 'equal',
            text: line,
            marker: ' ',
            lineNum: String(oldLine),
            opIndex: i,
          });
          oldLine++;
        }
      } else {
        // Show deleted lines
        const oldText = (op.oldValue ?? '').split('\n').filter(l => l !== '');
        for (const line of oldText) {
          lines.push({
            type: 'delete',
            text: line,
            marker: '-',
            lineNum: String(oldLine),
            opIndex: i,
          });
          oldLine++;
        }
        // Show inserted lines
        const newText = (op.newValue ?? '').split('\n').filter(l => l !== '');
        for (const line of newText) {
          lines.push({
            type: 'insert',
            text: line,
            marker: '+',
            lineNum: String(newLine),
            opIndex: i,
          });
          newLine++;
        }
      }
    }
  }

  return lines;
});

/** Accept a single change by line index */
function acceptChange(lineIdx: number) {
  const line = displayLines.value[lineIdx];
  if (line) {
    acceptedChanges.value.add(line.opIndex);
    acceptedChanges.value = new Set(acceptedChanges.value);
  }
}

/** Reject a single change by line index */
function rejectChange(lineIdx: number) {
  const line = displayLines.value[lineIdx];
  if (line) {
    rejectedChanges.value.add(line.opIndex);
    rejectedChanges.value = new Set(rejectedChanges.value);
  }
}

/** Accept all changes — emit the modified text */
function acceptAll() {
  emit('accept', props.modified);
}

/** Reject all changes — emit the original text */
function rejectAll() {
  emit('reject');
}
</script>

<style scoped>
.inline-diff {
  border: 1px solid var(--border, #333);
  border-radius: 6px;
  overflow: hidden;
  font-family: var(--font-mono);
  font-size: var(--text-base);
}

.diff-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 12px;
  background: var(--surface, #1e1e1e);
  border-bottom: 1px solid var(--border, #333);
}

.diff-title {
  font-weight: 600;
  font-size: var(--text-sm);
  color: var(--text-muted, #aaa);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.diff-actions {
  display: flex;
  gap: 6px;
}

.diff-btn {
  padding: 3px 10px;
  border: 1px solid var(--border, #444);
  border-radius: 4px;
  cursor: pointer;
  font-size: var(--text-xs);
  font-weight: 500;
  transition: all 0.15s;
}

.diff-btn.accept-all {
  background: rgba(80, 200, 120, 0.15);
  color: #50c878;
  border-color: #50c878;
}

.diff-btn.accept-all:hover {
  background: rgba(80, 200, 120, 0.3);
}

.diff-btn.reject-all {
  background: rgba(255, 100, 100, 0.15);
  color: #ff6464;
  border-color: #ff6464;
}

.diff-btn.reject-all:hover {
  background: rgba(255, 100, 100, 0.3);
}

.diff-editor {
  max-height: 500px;
  overflow: auto;
  background: var(--bg, #111);
}

.diff-line {
  display: flex;
  align-items: center;
  padding: 0 8px;
  min-height: 22px;
  line-height: 22px;
  white-space: pre;
}

.diff-line.diff-insert {
  background: rgba(80, 200, 120, 0.12);
}

.diff-line.diff-delete {
  background: rgba(255, 100, 100, 0.12);
}

.diff-line.diff-replace {
  background: rgba(255, 200, 50, 0.08);
}

.diff-gutter {
  width: 40px;
  text-align: right;
  padding-right: 8px;
  color: var(--text-muted, #666);
  font-size: var(--text-xs);
  user-select: none;
  flex-shrink: 0;
}

.diff-marker {
  width: 16px;
  text-align: center;
  font-weight: 700;
  flex-shrink: 0;
}

.diff-insert .diff-marker {
  color: #50c878;
}

.diff-delete .diff-marker {
  color: #ff6464;
}

.diff-text {
  flex: 1;
  padding-left: 4px;
}

.diff-inline-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: var(--text-xs);
  padding: 0 4px;
  opacity: 0;
  transition: opacity 0.15s;
  flex-shrink: 0;
}

.diff-line:hover .diff-inline-btn {
  opacity: 1;
}

.diff-inline-btn.accept {
  color: #50c878;
}

.diff-inline-btn.reject {
  color: #ff6464;
}

.diff-inline-btn:hover {
  transform: scale(1.2);
}
</style>
