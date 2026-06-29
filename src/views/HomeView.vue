<template>
  <div
    class="workspace-panel"
    @dragover.prevent="onDragOver"
    @dragenter.prevent="onDragEnter"
    @dragleave="onDragLeave"
    @drop.prevent="onDrop"
  >
    <div class="workspace-header">
      <span class="workspace-title">工作区</span>
      <div class="workspace-controls" v-if="workspace.hasWorkspace">
        <!-- View mode toggle -->
        <button
          class="ws-ctrl-btn"
          :class="{ active: workspace.viewMode === 'list' }"
          @click="workspace.viewMode = 'list'"
          title="列表视图"
        ><TIcon name="menu" :size="14" /></button>
        <button
          class="ws-ctrl-btn"
          :class="{ active: workspace.viewMode === 'grid' }"
          @click="workspace.viewMode = 'grid'"
          title="网格视图"
        ><TIcon name="layoutGrid" :size="14" /></button>
        <!-- Show hidden toggle -->
        <button
          class="ws-ctrl-btn"
          :class="{ active: workspace.showHidden }"
          @click="workspace.showHidden = !workspace.showHidden"
          :title="workspace.showHidden ? '隐藏隐藏文件' : '显示隐藏文件'"
        >{{ workspace.showHidden ? '隐' : '显' }}</button>
      </div>
    </div>

    <!-- Breadcrumb navigation -->
    <div v-if="workspace.hasWorkspace" class="workspace-breadcrumb">
      <Breadcrumb :path="workspace.path" :home-path="homePath" @navigate="navigateTo" />
    </div>

    <!-- Filter & Sort controls -->
    <div v-if="workspace.hasWorkspace" class="workspace-toolbar">
      <input
        v-model="workspace.filterText"
        class="filter-input"
        placeholder="筛选文件..."
        type="text"
      />
      <select v-model="workspace.sortBy" class="sort-select">
        <option value="name">名称</option>
        <option value="mtime">修改时间</option>
        <option value="size">大小</option>
      </select>
    </div>

    <!-- Favorites section -->
    <div v-if="workspace.hasWorkspace && workspace.favorites.length > 0" class="sidebar-section">
      <div class="sidebar-section-header">
        <span class="sidebar-section-icon">{{ ICONS.starFilled }}</span>
        <span class="sidebar-section-title">收藏</span>
      </div>
      <div
        v-for="fav in workspace.favorites"
        :key="fav"
        class="sidebar-item favorite-item"
        :class="{ active: workspace.currentFile === fav }"
        @click="workspace.selectFile(fav)"
      >
        <span class="sidebar-item-icon">◦</span>
        <span class="sidebar-item-name" :title="fav">{{ fav.split(/[\/]/).pop() }}</span>
        <button
          class="star-btn active"
          @click.stop="workspace.toggleFavorite(fav)"
          title="取消收藏"
        >
          {{ ICONS.starFilled }}
        </button>
      </div>
    </div>

    <!-- Recent files section -->
    <div v-if="workspace.hasWorkspace && workspace.recentFiles.length > 0" class="sidebar-section">
      <div class="sidebar-section-header">
        <TIcon name="history" :size="14" />
        <span class="sidebar-section-title">最近文件</span>
      </div>
      <div
        v-for="recent in workspace.recentFiles.slice(0, 8)"
        :key="recent.path"
        class="sidebar-item recent-item"
        :class="{ active: workspace.currentFile === recent.path }"
        @click="workspace.selectFile(recent.path)"
      >
        <span class="sidebar-item-icon">◦</span>
        <span class="sidebar-item-name" :title="recent.path">{{ recent.path.split(/[\/]/).pop() }}</span>
        <button
          class="star-btn"
          :class="{ active: workspace.isFavorite(recent.path) }"
          @click.stop="workspace.toggleFavorite(recent.path)"
          :title="workspace.isFavorite(recent.path) ? '取消收藏' : '收藏'"
        >
          {{ workspace.isFavorite(recent.path) ? ICONS.starFilled : ICONS.starEmpty }}
        </button>
      </div>
    </div>

    <!-- File tree — List view -->
    <div
      v-if="workspace.hasWorkspace && workspace.viewMode === 'list'"
      class="workspace-tree"
      :class="{ 'drag-over': isDragOver }"
    >
      <template v-if="workspace.displayTree.length > 0">
        <FileTreeNode
          v-for="node in workspace.displayTree"
          :key="node.path"
          :node="node"
          :depth="0"
          @contextmenu="onFileContextMenu"
        />
      </template>
      <div v-else-if="workspace.loading" class="workspace-empty">
        <span class="workspace-empty-icon">载</span>
        <span class="workspace-empty-text">加载中...</span>
      </div>
      <div v-else class="workspace-empty">
        <span class="workspace-empty-text">无匹配文件</span>
      </div>

      <!-- Drop zone overlay -->
      <div v-if="isDragOver" class="workspace-drop-overlay">
        <span class="workspace-drop-icon">拖</span>
        <span class="workspace-drop-text">拖放文件到工作区</span>
      </div>
    </div>

    <!-- File tree — Grid view -->
    <div
      v-if="workspace.hasWorkspace && workspace.viewMode === 'grid'"
      class="workspace-grid"
      :class="{ 'drag-over': isDragOver }"
    >
      <template v-if="workspace.displayTree.length > 0">
        <div
          v-for="node in workspace.displayTree"
          :key="node.path"
          class="grid-item"
          :class="{ active: workspace.currentFile === node.path }"
          @click="handleGridClick(node)"
          @contextmenu.prevent="onFileContextMenu($event, node)"
        >
          <span class="grid-item-icon">
            <template v-if="node.is_dir">{{ ICONS.folder }}</template>
            <template v-else><span class="grid-rich-icon" v-html="getRichFileIcon(node.name)"></span></template>
          </span>
          <span class="grid-item-name" :title="node.name">{{ node.name }}</span>
        </div>
      </template>
      <div v-else-if="workspace.loading" class="workspace-empty">
        <span class="workspace-empty-icon">载</span>
        <span class="workspace-empty-text">加载中...</span>
      </div>
      <div v-else class="workspace-empty">
        <span class="workspace-empty-text">无匹配文件</span>
      </div>

      <div v-if="isDragOver" class="workspace-drop-overlay">
        <span class="workspace-drop-icon">拖</span>
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
        {{ ICONS.folder }} 打开文件夹
      </button>
    </div>

    <!-- Context Menu -->
    <ContextMenu
      :visible="contextMenu.visible"
      :x="contextMenu.x"
      :y="contextMenu.y"
      :items="contextMenuItems"
      @close="closeContextMenu"
      @action="handleContextAction"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from "vue";
import { invoke } from "@tauri-apps/api/core";
import { useWorkspaceStore } from "../stores/workspace";
import type { FileNode } from "../stores/workspace";
import FileTreeNode from "../components/FileTreeNode.vue";
import ChangeInbox from "../components/ChangeInbox.vue";
import ProjectMemory from "../components/ProjectMemory.vue";
import ContextMenu from "../components/ContextMenu.vue";
import type { ContextMenuItem } from "../components/ContextMenu.vue";
import Breadcrumb from "../components/Breadcrumb.vue";
import { useToast } from "../composables/useToast";
import { ICONS } from "../utils/icons";
import { getFileIcon } from "../utils/fileIcons";
import { getRichFileIcon } from "../utils/richIcons";

const workspace = useWorkspaceStore();
const toast = useToast();
const isDragOver = ref(false);
let dragCounter = 0;

const homePath = ref<string>('');

onMounted(async () => {
  try {
    homePath.value = await invoke<string>('get_home_dir').catch(() => '');
  } catch {
    // ignore
  }
});

// ── Breadcrumb navigation ──
function navigateTo(dirPath: string) {
  workspace.openWorkspace(dirPath);
}

// ── Context Menu ──
const contextMenu = reactive({
  visible: false,
  x: 0,
  y: 0,
  node: null as FileNode | null,
});

const contextMenuItems = computed<ContextMenuItem[]>(() => {
  const node = contextMenu.node;
  if (!node) return [];

  const isFav = workspace.isFavorite(node.path);

  if (node.is_dir) {
    return [
      { icon: ICONS.folder, label: '打开', action: 'open' },
      { icon: ICONS.terminal, label: '在终端打开', action: 'open-in-terminal' },
      { icon: '板', label: '复制路径', action: 'copy-path' },
      { icon: '🔍', label: '在 Finder 显示', action: 'reveal-in-finder' },
      { icon: '✏️', label: '重命名', action: 'rename' },
      { divider: true, icon: '', label: '' },
      { icon: '✕', label: '移到废纸篓', action: 'trash', danger: true },
    ];
  }

  return [
    { icon: ICONS.file, label: '打开', action: 'open' },
    { icon: '显', label: '预览', action: 'preview' },
    { icon: ICONS.terminal, label: '在终端打开', action: 'open-in-terminal' },
    { icon: '板', label: '复制路径', action: 'copy-path' },
    { icon: '🔍', label: '在 Finder 显示', action: 'reveal-in-finder' },
    { divider: true, icon: '', label: '' },
    { icon: isFav ? ICONS.starFilled : ICONS.starEmpty, label: isFav ? '取消收藏' : '收藏', action: 'toggle-favorite' },
    { icon: '✏️', label: '重命名', action: 'rename' },
    { divider: true, icon: '', label: '' },
    { icon: '✕', label: '移到废纸篓', action: 'trash', danger: true },
  ];
});

function onFileContextMenu(event: MouseEvent, node: FileNode) {
  contextMenu.x = event.clientX;
  contextMenu.y = event.clientY;
  contextMenu.node = node;
  contextMenu.visible = true;
}

function closeContextMenu() {
  contextMenu.visible = false;
  contextMenu.node = null;
}

async function handleContextAction(action: string) {
  const node = contextMenu.node;
  if (!node) return;

  switch (action) {
    case 'open':
      if (node.is_dir) {
        workspace.openWorkspace(node.path);
      } else {
        workspace.selectFile(node.path);
      }
      break;
    case 'preview':
      workspace.selectFile(node.path);
      break;
    case 'open-in-terminal':
      try {
        await invoke('open_in_terminal', { path: node.path });
      } catch {
        toast.error('无法在终端中打开');
      }
      break;
    case 'copy-path':
      try {
        await navigator.clipboard.writeText(node.path);
        toast.success('路径已复制');
      } catch {
        toast.error('复制失败');
      }
      break;
    case 'reveal-in-finder':
      try {
        await invoke('reveal_in_finder', { path: node.path });
      } catch {
        toast.error('无法在 Finder 中显示');
      }
      break;
    case 'toggle-favorite':
      workspace.toggleFavorite(node.path);
      toast.info(workspace.isFavorite(node.path) ? '已收藏' : '已取消收藏');
      break;
    case 'rename':
      // TODO: implement inline rename
      toast.info('重命名功能开发中');
      break;
    case 'trash':
      try {
        await invoke('move_to_trash', { path: node.path });
        toast.success('已移到废纸篓');
        workspace.refreshFileTree();
      } catch {
        toast.error('移到废纸篓失败');
      }
      break;
  }
}

// ── Grid view helpers ──
function handleGridClick(node: FileNode) {
  if (node.is_dir) {
    workspace.openWorkspace(node.path);
  } else {
    workspace.selectFile(node.path);
  }
}

// FILE_ICONS and getFileIcon are now in src/utils/fileIcons.ts

// ── Drag & Drop ──
function onDragEnter(_e: DragEvent) {
  dragCounter++;
  isDragOver.value = true;
}

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

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const srcPath = (file as File & { path?: string }).path;
    if (!srcPath) continue;

    try {
      await invoke("copy_file_to_workspace", {
        srcPath,
        destDir: workspace.path,
      });
      await workspace.refreshFileTree();
      toast.success(`已复制 ${file.name}`);
    } catch (err) {
      console.warn("Failed to copy dropped file:", err);
      toast.error(`复制 ${file.name} 失败`);
    }
  }
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

/* ── Workspace Controls ── */
.workspace-controls {
  display: flex;
  align-items: center;
  gap: 2px;
}

.ws-ctrl-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-muted, #666);
  cursor: pointer;
  font-size: 13px;
  transition: all 0.15s;
}

.ws-ctrl-btn:hover {
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-primary, #e0e0e0);
}

.ws-ctrl-btn.active {
  color: var(--accent, #82b1ff);
  background: color-mix(in srgb, var(--accent, #82b1ff) 10%, transparent);
}

/* ── Breadcrumb ── */
.workspace-breadcrumb {
  padding: 4px 12px;
  border-bottom: 1px solid var(--border-light, rgba(255, 255, 255, 0.06));
  min-height: 24px;
  display: flex;
  align-items: center;
}

/* ── Filter & Sort Toolbar ── */
.workspace-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 8px;
  border-bottom: 1px solid var(--border-light, rgba(255, 255, 255, 0.06));
}

.filter-input {
  flex: 1;
  padding: 4px 8px;
  border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
  border-radius: 4px;
  background: var(--bg-primary, #12121f);
  color: var(--text-primary, #e0e0e0);
  font-size: 11px;
  font-family: var(--font-body, sans-serif);
  outline: none;
  transition: border-color 0.15s;
}

.filter-input::placeholder {
  color: var(--text-muted, #666);
}

.filter-input:focus {
  border-color: var(--accent, #82b1ff);
}

.sort-select {
  padding: 4px 6px;
  border: 1px solid var(--border, rgba(255, 255, 255, 0.1));
  border-radius: 4px;
  background: var(--bg-primary, #12121f);
  color: var(--text-muted, #aaa);
  font-size: 11px;
  font-family: var(--font-body, sans-serif);
  outline: none;
  cursor: pointer;
  min-width: 0;
}

.sort-select:focus {
  border-color: var(--accent, #82b1ff);
}

/* ── Grid View ── */
.workspace-grid {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(72px, 1fr));
  gap: 4px;
  align-content: start;
}

.grid-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 4px;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s;
  user-select: none;
}

.grid-item:hover {
  background: rgba(255, 255, 255, 0.04);
}

.grid-item.active {
  background: color-mix(in srgb, var(--accent, #82b1ff) 12%, transparent);
}

.grid-item-icon {
  font-size: 28px;
  line-height: 1;
}

.grid-item-name {
  font-size: 10px;
  color: var(--text-secondary, #c0c0c0);
  text-align: center;
  word-break: break-all;
  line-height: 1.3;
  max-height: 2.6em;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
</style>
