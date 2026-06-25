<script setup lang="ts">
import { onMounted, watch } from 'vue';
import { useGitStore } from '../stores/git';
import { useWorkspaceStore } from '../stores/workspace';

const git = useGitStore();
const workspace = useWorkspaceStore();

const statusColors: Record<string, string> = {
  modified: 'var(--gold)',
  added: 'var(--jade)',
  deleted: 'var(--vermilion-glow)',
  untracked: 'var(--silver)',
  changed: 'var(--bone-dim)',
};

const statusLabels: Record<string, string> = {
  modified: 'M',
  added: 'A',
  deleted: 'D',
  untracked: '?',
  changed: '~',
};

onMounted(() => {
  if (workspace.path) {
    git.loadChanges(workspace.path);
    git.loadDiff(workspace.path);
  }
});

watch(() => workspace.path, (p) => {
  if (p) {
    git.loadChanges(p);
    git.loadDiff(p);
  }
});

async function accept(path: string) {
  if (workspace.path) await git.acceptFile(workspace.path, path);
}

async function revert(path: string) {
  if (workspace.path) await git.revertFile(workspace.path, path);
}

async function acceptAll() {
  if (!workspace.path) return;
  for (const f of git.changedFiles) {
    await git.acceptFile(workspace.path, f.path);
  }
}

async function revertAll() {
  if (!workspace.path) return;
  for (const f of git.changedFiles) {
    await git.revertFile(workspace.path, f.path);
  }
}
</script>

<template>
  <div class="diff-viewer">
    <div class="diff-header">
      <span class="diff-title">变更 ({{ git.changedFiles.length }})</span>
      <div class="diff-actions" v-if="git.changedFiles.length > 0">
        <button class="diff-btn accept" @click="acceptAll">全部接受</button>
        <button class="diff-btn reject" @click="revertAll">全部拒绝</button>
      </div>
    </div>

    <div class="diff-file-list" v-if="git.changedFiles.length > 0">
      <div
        v-for="file in git.changedFiles"
        :key="file.path"
        class="diff-file-item"
        :class="{ selected: git.selectedFile === file.path }"
      >
        <span class="diff-file-status" :style="{ color: statusColors[file.status] || 'var(--silver)' }">
          {{ statusLabels[file.status] || '?' }}
        </span>
        <span class="diff-file-name">{{ file.path }}</span>
        <div class="diff-file-actions">
          <button class="diff-accept" @click.stop="accept(file.path)">接受</button>
          <button class="diff-reject" @click.stop="revert(file.path)">拒绝</button>
        </div>
      </div>
    </div>

    <div class="diff-empty" v-else-if="!git.loading">
      <div style="font-family:var(--brush);font-size:2rem;color:var(--jade);opacity:.5;line-height:1;margin-bottom:8px">∅</div>
      <p>工作区无变更</p>
    </div>

    <div class="diff-content" v-if="git.diffContent">
      <pre><code v-for="(line, i) in git.diffContent.split('\n')" :key="i"
        :class="{
          'diff-add': line.startsWith('+') && !line.startsWith('+++'),
          'diff-del': line.startsWith('-') && !line.startsWith('---'),
          'diff-hunk': line.startsWith('@@'),
          'diff-header': line.startsWith('diff ') || line.startsWith('---') || line.startsWith('+++'),
        }">{{ line }}\n</code></pre>
    </div>
  </div>
</template>

<style scoped>
.diff-viewer { display: flex; flex-direction: column; height: 100%; }
.diff-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 12px; border-bottom: 1px solid var(--hairline);
}
.diff-title { font-family: var(--serif-zh); font-size: .75rem; color: var(--bone-dim); }
.diff-actions { display: flex; gap: 6px; }
.diff-btn {
  padding: 3px 10px; border-radius: 4px; font-size: .6rem; cursor: pointer;
  font-family: var(--serif-zh); border: 1px solid; transition: all .2s;
}
.diff-btn.accept { color: var(--jade); border-color: var(--hairline-jade); }
.diff-btn.accept:hover { background: rgba(92, 207, 184, .08); }
.diff-btn.reject { color: var(--vermilion-glow); border-color: rgba(200, 68, 42, .3); }
.diff-btn.reject:hover { background: rgba(200, 68, 42, .08); }

.diff-file-list { border-bottom: 1px solid var(--hairline); max-height: 200px; overflow-y: auto; }
.diff-file-item {
  display: flex; align-items: center; gap: 8px; padding: 4px 12px;
  font-family: var(--mono); font-size: .62rem; transition: background .15s;
}
.diff-file-item:hover { background: var(--hover); }
.diff-file-item.selected { background: rgba(92, 207, 184, .06); }
.diff-file-status { width: 14px; text-align: center; font-weight: 600; }
.diff-file-name { flex: 1; color: var(--bone); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.diff-file-actions { display: flex; gap: 4px; opacity: 0; transition: opacity .2s; }
.diff-file-item:hover .diff-file-actions { opacity: 1; }
.diff-accept, .diff-reject {
  padding: 1px 6px; border-radius: 3px; font-size: .55rem; cursor: pointer;
  border: 1px solid var(--hairline); background: transparent; transition: all .15s;
}
.diff-accept { color: var(--jade); border-color: var(--hairline-jade); }
.diff-accept:hover { background: rgba(92, 207, 184, .1); }
.diff-reject { color: var(--vermilion-glow); border-color: rgba(200, 68, 42, .3); }
.diff-reject:hover { background: rgba(200, 68, 42, .1); }

.diff-empty {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: 40px; color: var(--silver); font-size: .75rem;
}
.diff-content {
  flex: 1; overflow: auto; padding: 8px 12px;
  font-family: var(--mono); font-size: .62rem; line-height: 1.6;
}
.diff-content pre { margin: 0; white-space: pre-wrap; word-break: break-all; }
.diff-add { color: var(--jade); }
.diff-del { color: var(--vermilion-glow); }
.diff-hunk { color: var(--gold); }
.diff-header { color: var(--silver); }
</style>
