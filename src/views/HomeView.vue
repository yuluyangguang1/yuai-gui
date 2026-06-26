<template>
  <div
    class="workspace-panel"
    @dragover.prevent="onDragOver"
    @dragleave="onDragLeave"
    @drop.prevent="onDrop"
  >
    <div class="workspace-header">
      <span class="workspace-title">工作区</span>
    </div>

    <div v-if="workspace.hasWorkspace" class="workspace-path" @click="workspace.openWorkspace()" :title="workspace.path">
      {{ workspace.path }}
    </div>

    <!-- Favorites section -->
    <div v-if="workspace.hasWorkspace && workspace.favorites.length > 0" class="sidebar-section">
      <div class="sidebar-section-header">
        <span class="sidebar-section-icon">⭐</span>
        <span class="sidebar-section-title">收藏</span>
      </div>
      <div
        v-for="fav in workspace.favorites"
        :key="fav"
        class="sidebar-item favorite-item"
        :class="{ active: workspace.currentFile === fav }"
        @click="workspace.selectFile(fav)"
      >
        <span class="sidebar-item-icon">📄</span>
        <span class="sidebar-item-name" :title="fav">{{ fav.split(/[\/\\]/).pop() }}</span>
        <button
          class="star-btn active"
          @click.stop="workspace.toggleFavorite(fav)"
          title="取消收藏"
        >
          ★
        </button>
      </div>
    </div>

    <!-- Recent files section -->
    <div v-if="workspace.hasWorkspace && workspace.recentFiles.length > 0" class="sidebar-section">
      <div class="sidebar-section-header">
        <span class="sidebar-section-icon">🕐</span>
        <span class="sidebar-section-title">最近文件</span>
      </div>
      <div
        v-for="recent in workspace.recentFiles.slice(0, 8)"
        :key="recent.path"
        class="sidebar-item recent-item"
        :class="{ active: workspace.currentFile === recent.path }"
        @click="workspace.selectFile(recent.path)"
      >
        <span class="sidebar-item-icon">📄</span>
        <span class="sidebar-item-name" :title="recent.path">{{ recent.path.split(/[\/\\]/).pop() }}</span>
        <button
          class="star-btn"
          :class="{ active: workspace.isFavorite(recent.path) }"
          @click.stop="workspace.toggleFavorite(recent.path)"
          :title="workspace.isFavorite(recent.path) ? '取消收藏' : '收藏'"
        >
          {{ workspace.isFavorite(recent.path) ? '★' : '☆' }}
        </button>
      </div>
    </div>

    <!-- File tree -->
    <div
      v-if="workspace.hasWorkspace"
      class="workspace-tree"
      :class="{ 'drag-over': isDragOver }"
    >
      <template v-if="workspace.fileTree.length > 0">
        <FileTreeNode
          v-for="node in workspace.fileTree"
          :key="node.path"
          :node="node"
          :depth="0"
        />
      </template>
      <div v-else-if="workspace.loading" class="workspace-empty">
        <span class="workspace-empty-icon">⏳</span>
        <span class="workspace-empty-text">加载中...</span>
      </div>

      <!-- Drop zone overlay -->
      <div v-if="isDragOver" class="workspace-drop-overlay">
        <span class="workspace-drop-icon">📥</span>
        <span class="workspace-drop-text">拖放文件到工作区</span>
      </div>
    </div>

    <!-- Project Memory (AI session history) -->
    <ProjectMemory v-if="workspace.hasWorkspace" />

    <!-- Change Inbox -->
    <ChangeInbox v-if="workspace.hasWorkspace" />

    <!-- Empty state: no workspace -->
    <div v-if="!workspace.hasWorkspace" class="workspace-empty">
      <span class="workspace-empty-glyph" style="font-family: var(--font-brush); font-size: 48px; color: var(--gold); opacity: 0.15;">文</span>
      <span class="workspace-empty-text">
        尚未打开工作区<br />
        选择一个文件夹开始
      </span>
      <button class="workspace-empty-btn" @click="workspace.openWorkspace()">
        📂 打开文件夹
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { useWorkspaceStore } from "../stores/workspace";
import FileTreeNode from "../components/FileTreeNode.vue";
import ChangeInbox from "../components/ChangeInbox.vue";
import ProjectMemory from "../components/ProjectMemory.vue";

const workspace = useWorkspaceStore();
const isDragOver = ref(false);
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

async function onDrop(e: DragEvent) {
  isDragOver.value = false;
  dragCounter = 0;

  const files = e.dataTransfer?.files;
  if (!files || files.length === 0) return;
  if (!workspace.path) return;

  // Copy dropped files into the workspace directory
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    // In Tauri webview, file.path contains the system path
    const srcPath = (file as File & { path?: string }).path;
    if (!srcPath) continue;

    try {
      // Use Tauri backend to copy the file into workspace
      await invoke("copy_file_to_workspace", {
        srcPath,
        destDir: workspace.path,
      });
      // Refresh file tree after copy
      await workspace.loadFileTree();
    } catch (err) {
      console.warn("Failed to copy dropped file:", err);
    }
  }
}

// Track dragenter for nested elements
function handleDragEnter(e: DragEvent) {
  e.preventDefault();
  dragCounter++;
  isDragOver.value = true;
}
</script>

<style scoped>
.sidebar-section {
  padding: 4px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.sidebar-section-header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--text-muted, #888);
  opacity: 0.7;
}

.sidebar-section-icon {
  font-size: 12px;
}

.sidebar-section-title {
  font-weight: 500;
}

.sidebar-item {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 12px 3px 20px;
  cursor: pointer;
  font-size: 12px;
  color: var(--text-muted, #aaa);
  transition: background 0.1s;
}

.sidebar-item:hover {
  background: rgba(255, 255, 255, 0.04);
}

.sidebar-item.active {
  background: rgba(224, 176, 255, 0.08);
  color: var(--ink, #d4d4d4);
}

.sidebar-item-icon {
  font-size: 12px;
  flex-shrink: 0;
}

.sidebar-item-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.star-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 12px;
  color: var(--text-muted, #666);
  padding: 0 2px;
  opacity: 0;
  transition: opacity 0.15s, color 0.15s;
  flex-shrink: 0;
}

.sidebar-item:hover .star-btn,
.star-btn.active {
  opacity: 1;
}

.star-btn.active {
  color: var(--gold, #e0b0ff);
}

.star-btn:hover {
  color: var(--gold, #e0b0ff);
  transform: scale(1.2);
}
</style>
