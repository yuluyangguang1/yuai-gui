<script setup lang="ts">
import { onMounted, watch, ref } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { useWorkspaceStore } from '../stores/workspace';

const workspace = useWorkspaceStore();
const changedFiles = ref<{path:string;status:string}[]>([]);
const diffContent = ref('');
const loading = ref(false);

const statusColors: Record<string, string> = {
  modified: 'var(--gold)',
  added: 'var(--jade)',
  deleted: 'var(--vermilion-glow)',
  untracked: 'var(--text-muted)',
  changed: 'var(--text-muted)',
};

const statusLabels: Record<string, string> = {
  modified: 'M',
  added: 'A',
  deleted: 'D',
  untracked: '?',
  changed: '~',
};

async function loadChanges() {
  if (!workspace.path) return;
  loading.value = true;
  try {
    changedFiles.value = await invoke('get_changed_files', { cwd: workspace.path });
    diffContent.value = await invoke('get_git_diff', { cwd: workspace.path });
  } catch (e) { console.error('git:', e); }
  finally { loading.value = false; }
}

async function acceptFile(path: string) {
  if (!workspace.path) return;
  try {
    await invoke('accept_file', { cwd: workspace.path, path });
    await loadChanges();
  } catch (e) {
    console.error('accept_file failed:', e);
  }
}

async function revertFile(path: string) {
  if (!workspace.path) return;
  try {
    await invoke('revert_file', { cwd: workspace.path, path });
    await loadChanges();
  } catch (e) {
    console.error('revert_file failed:', e);
  }
}

async function acceptAll() {
  if (!workspace.path) return;
  for (const f of changedFiles.value) await acceptFile(f.path);
}

async function revertAll() {
  if (!workspace.path) return;
  for (const f of changedFiles.value) await revertFile(f.path);
}

onMounted(loadChanges);
watch(() => workspace.path, loadChanges);
</script>

<template>
  <div class="diff-viewer">
    <div class="diff-header">
      <span class="diff-title">变更 ({{ changedFiles.length }})</span>
      <div class="diff-actions" v-if="changedFiles.length > 0">
        <button class="diff-btn accept" @click="acceptAll">全部接受</button>
        <button class="diff-btn reject" @click="revertAll">全部拒绝</button>
      </div>
    </div>

    <div class="diff-file-list" v-if="changedFiles.length > 0">
      <div
        v-for="file in changedFiles"
        :key="file.path"
        class="diff-file-item"
      >
        <span class="diff-file-status" :style="{ color: statusColors[file.status] || 'var(--text-muted)' }">
          {{ statusLabels[file.status] || '?' }}
        </span>
        <span class="diff-file-name">{{ file.path }}</span>
        <div class="diff-file-actions">
          <button class="diff-accept" @click.stop="acceptFile(file.path)">接受</button>
          <button class="diff-reject" @click.stop="revertFile(file.path)">拒绝</button>
        </div>
      </div>
    </div>

    <div class="diff-empty" v-else-if="!loading">
      <div style="font-family:var(--font-brush);font-size:2rem;color:var(--accent);opacity:.5;line-height:1;margin-bottom:8px">∅</div>
      <p>工作区无变更</p>
    </div>

    <div class="diff-content" v-if="diffContent">
      <pre><code v-for="(line, i) in diffContent.split('\n')" :key="i"
        :class="{
          'diff-add': line.startsWith('+') && !line.startsWith('+++'),
          'diff-del': line.startsWith('-') && !line.startsWith('---'),
          'diff-hunk': line.startsWith('@@'),
          'diff-header': line.startsWith('diff ') || line.startsWith('---') || line.startsWith('+++'),
        }">{{ line }}
</code></pre>
    </div>
  </div>
</template>

<style scoped>
.diff-viewer { display: flex; flex-direction: column; height: 100%; }
.diff-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 12px; border-bottom: 1px solid var(--border-light);
}
.diff-title { font-family: var(--font-serif); font-size: .75rem; color: var(--text-muted); }
.diff-actions { display: flex; gap: 6px; }
.diff-btn {
  padding: 3px 10px; border-radius: 4px; font-size: .6rem; cursor: pointer;
  font-family: var(--font-serif); border: 1px solid; transition: all .2s;
}
.diff-btn.accept { color: var(--accent); border-color: var(--border-accent); }
.diff-btn.accept:hover { background: rgba(92, 207, 184, .08); }
.diff-btn.reject { color: var(--vermilion-glow); border-color: color-mix(in srgb, var(--vermilion-glow) 30%, transparent); }
.diff-btn.reject:hover { background: color-mix(in srgb, var(--vermilion-glow) 8%, transparent); }

.diff-file-list { border-bottom: 1px solid var(--border-light); max-height: 200px; overflow-y: auto; }
.diff-file-item {
  display: flex; align-items: center; gap: 8px; padding: 4px 12px;
  font-family: var(--font-mono); font-size: .62rem; transition: background .15s;
}
.diff-file-item:hover { background: var(--bg-hover); }
.diff-file-status { width: 14px; text-align: center; font-weight: 600; }
.diff-file-name { flex: 1; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.diff-file-actions { display: flex; gap: 4px; opacity: 0; transition: opacity .2s; }
.diff-file-item:hover .diff-file-actions { opacity: 1; }
.diff-accept, .diff-reject {
  padding: 1px 6px; border-radius: 3px; font-size: .55rem; cursor: pointer;
  border: 1px solid var(--border-light); background: transparent; transition: all .15s;
}
.diff-accept { color: var(--accent); border-color: var(--border-accent); }
.diff-accept:hover { background: rgba(92, 207, 184, .1); }
.diff-reject { color: var(--vermilion-glow); border-color: color-mix(in srgb, var(--vermilion-glow) 30%, transparent); }
.diff-reject:hover { background: color-mix(in srgb, var(--vermilion-glow) 10%, transparent); }

.diff-empty {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: 40px; color: var(--text-muted); font-size: .75rem;
}
.diff-content {
  flex: 1; overflow: auto; padding: 8px 12px;
  font-family: var(--font-mono); font-size: .62rem; line-height: 1.6;
}
.diff-content pre { margin: 0; white-space: pre-wrap; word-break: break-all; }
.diff-add { color: var(--accent); }
.diff-del { color: var(--vermilion-glow); }
.diff-hunk { color: var(--gold); }
.diff-header { color: var(--text-muted); }
</style>
