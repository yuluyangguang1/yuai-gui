import { defineStore } from 'pinia';
import { ref } from 'vue';
import { invoke } from '@tauri-apps/api/core';

export interface ChangedFile {
  path: string;
  status: string; // 'modified' | 'added' | 'deleted' | 'untracked' | 'changed'
}

export const useGitStore = defineStore('git', () => {
  const changedFiles = ref<ChangedFile[]>([]);
  const diffContent = ref<string>('');
  const selectedFile = ref<string | null>(null);
  const loading = ref(false);

  async function loadChanges(cwd: string) {
    loading.value = true;
    try {
      changedFiles.value = await invoke('get_changed_files', { cwd });
    } catch (e) {
      console.error('loadChanges:', e);
      changedFiles.value = [];
    } finally {
      loading.value = false;
    }
  }

  async function loadDiff(cwd: string, filePath?: string) {
    loading.value = true;
    try {
      diffContent.value = await invoke('get_git_diff', { cwd });
      if (filePath) selectedFile.value = filePath;
    } catch (e) {
      console.error('loadDiff:', e);
      diffContent.value = '';
    } finally {
      loading.value = false;
    }
  }

  async function acceptFile(cwd: string, filePath: string) {
    try {
      await invoke('accept_file', { cwd, path: filePath });
      await loadChanges(cwd);
    } catch (e) {
      console.error('acceptFile:', e);
    }
  }

  async function revertFile(cwd: string, filePath: string) {
    try {
      await invoke('revert_file', { cwd, path: filePath });
      await loadChanges(cwd);
    } catch (e) {
      console.error('revertFile:', e);
    }
  }

  return { changedFiles, diffContent, selectedFile, loading, loadChanges, loadDiff, acceptFile, revertFile };
});
