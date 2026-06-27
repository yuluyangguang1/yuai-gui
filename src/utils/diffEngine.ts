/**
 * Diff Engine — inspired by Void editor
 * Character-level diff with line grouping and hunk support.
 */

// ══════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════

export type DiffOpType = 'insert' | 'delete' | 'replace' | 'equal';

export interface DiffOp {
  type: DiffOpType;
  /** The original text (for delete/replace) */
  oldValue?: string;
  /** The new text (for insert/replace) */
  newValue?: string;
  /** Start line in old text (1-indexed) */
  oldLine?: number;
  /** Start line in new text (1-indexed) */
  newLine?: number;
}

export interface DiffHunk {
  /** Operations in this hunk */
  ops: DiffOp[];
  /** Start line in old file */
  oldStart: number;
  /** Line count in old file */
  oldCount: number;
  /** Start line in new file */
  newStart: number;
  /** Line count in new file */
  newCount: number;
  /** Context lines before changes */
  contextBefore: string[];
  /** Context lines after changes */
  contextAfter: string[];
}

export interface DiffResult {
  ops: DiffOp[];
  hunks: DiffHunk[];
  hasChanges: boolean;
}

// ══════════════════════════════════════════════
// LCS-based Character Diff
// ══════════════════════════════════════════════

function computeLCS(a: string, b: string): number[][] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }
  return dp;
}

interface RawOp {
  type: DiffOpType;
  oldChars: string;
  newChars: string;
}

function backtrack(dp: number[][], a: string, b: string): RawOp[] {
  const ops: RawOp[] = [];
  let i = a.length;
  let j = b.length;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
      // Equal — merge with previous equal op if possible
      const ch = a[i - 1];
      if (ops.length > 0 && ops[ops.length - 1].type === 'equal') {
        ops[ops.length - 1].oldChars = ch + ops[ops.length - 1].oldChars;
        ops[ops.length - 1].newChars = ch + ops[ops.length - 1].newChars;
      } else {
        ops.push({ type: 'equal', oldChars: ch, newChars: ch });
      }
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      // Insert
      const ch = b[j - 1];
      if (ops.length > 0 && ops[ops.length - 1].type === 'insert') {
        ops[ops.length - 1].newChars = ch + ops[ops.length - 1].newChars;
      } else {
        ops.push({ type: 'insert', oldChars: '', newChars: ch });
      }
      j--;
    } else {
      // Delete
      const ch = a[i - 1];
      if (ops.length > 0 && ops[ops.length - 1].type === 'delete') {
        ops[ops.length - 1].oldChars = ch + ops[ops.length - 1].oldChars;
      } else {
        ops.push({ type: 'delete', oldChars: ch, newChars: '' });
      }
      i--;
    }
  }

  return ops.reverse();
}

// ══════════════════════════════════════════════
// Convert adjacent delete+insert to replace
// ══════════════════════════════════════════════

function coalesceReplaces(ops: RawOp[]): RawOp[] {
  const result: RawOp[] = [];
  let idx = 0;

  while (idx < ops.length) {
    if (
      idx + 1 < ops.length &&
      ops[idx].type === 'delete' &&
      ops[idx + 1].type === 'insert'
    ) {
      result.push({
        type: 'replace',
        oldChars: ops[idx].oldChars,
        newChars: ops[idx + 1].newChars,
      });
      idx += 2;
    } else {
      result.push(ops[idx]);
      idx++;
    }
  }

  return result;
}

// ══════════════════════════════════════════════
// Line-level grouping
// ══════════════════════════════════════════════

function assignLineNumbers(ops: RawOp[]): DiffOp[] {
  const result: DiffOp[] = [];
  let oldLine = 1;
  let newLine = 1;

  for (const op of ops) {
    if (op.type === 'equal') {
      // Count newlines to advance line counters
      const newlines = (op.oldChars.match(/\n/g) || []).length;
      oldLine += newlines;
      newLine += newlines;
      result.push({
        type: 'equal',
        oldValue: op.oldChars,
        newValue: op.newChars,
        oldLine,
        newLine,
      });
    } else if (op.type === 'delete') {
      const newlines = (op.oldChars.match(/\n/g) || []).length;
      result.push({ type: 'delete', oldValue: op.oldChars, oldLine });
      oldLine += newlines;
    } else if (op.type === 'insert') {
      const newlines = (op.newChars.match(/\n/g) || []).length;
      result.push({ type: 'insert', newValue: op.newChars, newLine });
      newLine += newlines;
    } else if (op.type === 'replace') {
      const oldNewlines = (op.oldChars.match(/\n/g) || []).length;
      const newNewlines = (op.newChars.match(/\n/g) || []).length;
      result.push({
        type: 'replace',
        oldValue: op.oldChars,
        newValue: op.newChars,
        oldLine,
        newLine,
      });
      oldLine += oldNewlines;
      newLine += newNewlines;
    }
  }

  return result;
}

// ══════════════════════════════════════════════
// Hunk Generation
// ══════════════════════════════════════════════

const CONTEXT_LINES = 3;

function buildHunks(ops: DiffOp[], oldText: string, newText: string): DiffHunk[] {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const hunks: DiffHunk[] = [];

  // Find indices of non-equal ops
  const changeIndices: number[] = [];
  for (let i = 0; i < ops.length; i++) {
    if (ops[i].type !== 'equal') changeIndices.push(i);
  }

  if (changeIndices.length === 0) return hunks;

  // Group changes that are within 2*CONTEXT_LINES of each other
  let groupStart = changeIndices[0];
  let groupEnd = changeIndices[0];

  for (let i = 1; i < changeIndices.length; i++) {
    const prev = changeIndices[i - 1];
    const curr = changeIndices[i];

    // Check if close enough to merge
    const gap = curr - prev;
    if (gap <= CONTEXT_LINES * 2 + 1) {
      groupEnd = curr;
    } else {
      hunks.push(buildSingleHunk(ops, groupStart, groupEnd, oldLines, newLines));
      groupStart = curr;
      groupEnd = curr;
    }
  }
  hunks.push(buildSingleHunk(ops, groupStart, groupEnd, oldLines, newLines));

  return hunks;
}

function buildSingleHunk(
  ops: DiffOp[],
  startIdx: number,
  endIdx: number,
  oldLines: string[],
  newLines: string[],
): DiffHunk {
  // Determine line ranges
  const firstChange = ops[startIdx];
  const lastChange = ops[endIdx];

  const oldStart = Math.max(1, (firstChange.oldLine ?? 1) - CONTEXT_LINES);
  const newStart = Math.max(1, (firstChange.newLine ?? 1) - CONTEXT_LINES);
  const oldEnd = Math.min(oldLines.length, (lastChange.oldLine ?? oldLines.length) + CONTEXT_LINES);
  const newEnd = Math.min(newLines.length, (lastChange.newLine ?? newLines.length) + CONTEXT_LINES);

  const contextBefore: string[] = [];
  const contextAfter: string[] = [];

  for (let i = oldStart; i < (firstChange.oldLine ?? oldStart); i++) {
    contextBefore.push(oldLines[i - 1] ?? '');
  }
  for (let i = (lastChange.oldLine ?? oldEnd) + 1; i <= oldEnd; i++) {
    contextAfter.push(oldLines[i - 1] ?? '');
  }

  return {
    ops: ops.slice(startIdx, endIdx + 1),
    oldStart,
    oldCount: oldEnd - oldStart + 1,
    newStart,
    newCount: newEnd - newStart + 1,
    contextBefore,
    contextAfter,
  };
}

// ══════════════════════════════════════════════
// Public API
// ══════════════════════════════════════════════

/**
 * Compute diffs between oldText and newText.
 * Returns character-level operations grouped into hunks with context.
 */
export function findDiffs(oldText: string, newText: string): DiffResult {
  if (oldText === newText) {
    return { ops: [], hunks: [], hasChanges: false };
  }

  // Character-level LCS diff
  const dp = computeLCS(oldText, newText);
  const rawOps = backtrack(dp, oldText, newText);

  // Coalesce adjacent delete+insert into replace
  const coalesced = coalesceReplaces(rawOps);

  // Assign line numbers
  const ops = assignLineNumbers(coalesced);

  // Build hunks
  const hunks = buildHunks(ops, oldText, newText);

  return { ops, hunks, hasChanges: true };
}

/**
 * Compute line-level diff (simpler, faster for large files).
 */
export function findLineDiffs(oldText: string, newText: string): DiffResult {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const dp = computeLCS(oldLines.join('\n'), newLines.join('\n'));
  const rawOps = backtrack(dp, oldLines.join('\n'), newLines.join('\n'));
  const coalesced = coalesceReplaces(rawOps);
  const ops = assignLineNumbers(coalesced);
  const hunks = buildHunks(ops, oldText, newText);
  return { ops, hunks, hasChanges: ops.some(o => o.type !== 'equal') };
}
