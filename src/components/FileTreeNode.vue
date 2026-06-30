<template>
  <div>
    <div
      class="tree-node"
      :class="{
        active: workspace.currentFile === node.path,
        changed: isChanged,
        'changed-recent': isRecentChange,
      }"
      :style="{ paddingLeft: (depth * 14 + 8) + 'px' }"
      @click="handleClick"
      @contextmenu.prevent="handleContextMenu"
    >
      <!-- Cascade Selection Checkbox -->
      <span class="tree-checkbox" @click.stop="toggleCheck">
        <span
          class="checkbox-visual"
          :class="{
            checked: checkState === 'checked',
            indeterminate: checkState === 'indeterminate',
          }"
        >
          <template v-if="checkState === 'checked'"><TIcon name="check" :size="12" /></template>
          <template v-else-if="checkState === 'indeterminate'"><TIcon name="minus" :size="12" /></template>
        </span>
      </span>

      <span class="tree-icon">
        <template v-if="node.is_dir">
          <TIcon :name="expanded ? 'folderOpen' : 'folder'" :size="14" />
        </template>
        <template v-else-if="thumbnailUrl">
          <img class="tree-thumb" :src="thumbnailUrl" alt="" @error="thumbnailFailed = true" />
        </template>
        <template v-else>
          <span class="tree-rich-icon" v-html="richIcon"></span>
        </template>
      </span>
      <span v-if="!renaming" class="tree-label">{{ node.name }}</span>
      <input
        v-else
        ref="renameInput"
        class="rename-input"
        :value="node.name"
        @keydown.enter="commitRename"
        @keydown.escape="cancelRename"
        @blur="commitRename"
        @click.stop
      />
      <button
        v-if="!node.is_dir"
        class="star-btn"
        :class="{ active: workspace.isFavorite(node.path) }"
        @click.stop="workspace.toggleFavorite(node.path)"
        :title="workspace.isFavorite(node.path) ? '取消收藏' : '收藏'"
      >
        <TIcon :name="workspace.isFavorite(node.path) ? 'starFilled' : 'star'" :size="14" />
      </button>
    </div>

    <template v-if="node.is_dir && expanded && node.children">
      <FileTreeNode
        v-for="child in node.children"
        :key="child.path"
        :node="child"
        :depth="depth + 1"
        :selected-paths="selectedPaths"
        :renaming-path="renamingPath"
        @contextmenu="(e: MouseEvent, n: FileNode) => emit('contextmenu', e, n)"
        @toggle-select="(path: string) => emit('toggleSelect', path)"
        @rename="(oldPath: string, newName: string) => emit('rename', oldPath, newName)"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from "vue";
import { TIcon } from "../utils/icons";
import type { FileNode } from "../stores/workspace";
import { useWorkspaceStore } from "../stores/workspace";
import { invoke } from "@tauri-apps/api/core";
import { ICONS } from "../utils/icons";
import { FILE_ICONS } from "../utils/fileIcons";
import { getRichFileIcon } from "../utils/richIcons";

// Module-level thumbnail cache to avoid re-fetching across component instances
const thumbnailCache = new Map<string, string | null>();

const props = defineProps<{
  node: FileNode;
  depth: number;
  selectedPaths?: Set<string>;
  renamingPath?: string | null;
}>();

const emit = defineEmits<{
  (e: 'contextmenu', event: MouseEvent, node: FileNode): void;
  (e: 'toggleSelect', path: string): void;
  (e: 'rename', oldPath: string, newName: string): void;
}>();

const workspace = useWorkspaceStore();
const expanded = ref(props.depth < 1);

// ══════════════════════════════════════════════
// Cascade Selection (inspired by GPT-Runner)
// ══════════════════════════════════════════════

type CheckState = 'unchecked' | 'checked' | 'indeterminate';

/** Count all file descendants of a directory node. */
function getAllFilePaths(node: FileNode): string[] {
  if (!node.is_dir) return [node.path];
  const paths: string[] = [];
  if (node.children) {
    for (const child of node.children) {
      paths.push(...getAllFilePaths(child));
    }
  }
  return paths;
}

/** Determine checkbox state for this node. */
const checkState = computed<CheckState>(() => {
  if (!props.selectedPaths) return 'unchecked';

  if (!props.node.is_dir) {
    return props.selectedPaths.has(props.node.path) ? 'checked' : 'unchecked';
  }

  // For directories: check children
  const childPaths = getAllFilePaths(props.node);
  if (childPaths.length === 0) return 'unchecked';

  const selectedCount = childPaths.filter(p => props.selectedPaths!.has(p)).length;
  if (selectedCount === 0) return 'unchecked';
  if (selectedCount === childPaths.length) return 'checked';
  return 'indeterminate';
});

/** Toggle selection for this node (and cascade to children). */
function toggleCheck() {
  const paths = getAllFilePaths(props.node);
  for (const p of paths) {
    emit('toggleSelect', p);
  }
}

/// Track when the change was detected (for recent-change glow)
const changeTimestamps = ref<Map<string, number>>(new Map());

const isChanged = computed(() => workspace.changedFiles.has(props.node.path));

const isRecentChange = computed(() => {
  if (!isChanged.value) return false;
  // Consider "recent" if changed within the last 3 seconds
  const ts = changeTimestamps.value.get(props.node.path);
  return ts ? Date.now() - ts < 3000 : true;
});

// Use a watcher to track change transitions (not a computed, which never triggers side effects)
watch(isChanged, (now, prev) => {
  if (now && !prev) {
    changeTimestamps.value.set(props.node.path, Date.now());
  }
});

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "tiff"]);

const isImageFile = computed(() => {
  if (props.node.is_dir) return false;
  const ext = props.node.name.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_EXTENSIONS.has(ext);
});

const thumbnailUrl = ref<string | null>(null);
const thumbnailFailed = ref(false);

// Fetch thumbnail for image files
onMounted(async () => {
  if (!isImageFile.value || thumbnailFailed.value) return;
  // Check cache first
  if (thumbnailCache.has(props.node.path)) {
    thumbnailUrl.value = thumbnailCache.get(props.node.path) ?? null;
    if (!thumbnailUrl.value) thumbnailFailed.value = true;
    return;
  }
  try {
    const thumb = await invoke<string | null>("get_thumbnail", {
      path: props.node.path,
      width: 32,
    });
    thumbnailCache.set(props.node.path, thumb);
    if (thumb) thumbnailUrl.value = thumb;
    else thumbnailFailed.value = true;
  } catch {
    thumbnailCache.set(props.node.path, null);
    // Silently fail, fall back to icon
  }
});

// Re-fetch if path changes (e.g. directory expansion reloads)
watch(() => props.node.path, async (newPath) => {
  if (!isImageFile.value || thumbnailFailed.value) return;
  thumbnailUrl.value = null;
  thumbnailFailed.value = false;
  // Check cache first
  if (thumbnailCache.has(newPath)) {
    thumbnailUrl.value = thumbnailCache.get(newPath) ?? null;
    if (!thumbnailUrl.value) thumbnailFailed.value = true;
    return;
  }
  try {
    const thumb = await invoke<string | null>("get_thumbnail", {
      path: newPath,
      width: 32,
    });
    thumbnailCache.set(newPath, thumb);
    if (thumb) thumbnailUrl.value = thumb;
    else thumbnailFailed.value = true;
  } catch {
    thumbnailCache.set(newPath, null);
    // Silently fail
  }
});

const fileIcon = computed(() => {
  const ext = props.node.name.split(".").pop()?.toLowerCase() ?? "";
  return FILE_ICONS[ext] ?? 'file';
});

const richIcon = computed(() => {
  return getRichFileIcon(props.node.name);
});

function handleClick() {
  if (props.node.is_dir) {
    expanded.value = !expanded.value;
  } else {
    workspace.selectFile(props.node.path);
  }
}

function handleContextMenu(e: MouseEvent) {
  emit('contextmenu', e, props.node);
}

// ── Inline Rename ──
const renaming = ref(false);
const renameInput = ref<HTMLInputElement | null>(null);

function startRename() {
  renaming.value = true;
  // Focus the input after Vue renders it
  setTimeout(() => {
    if (renameInput.value) {
      renameInput.value.focus();
      // Select filename without extension
      const name = props.node.name;
      const dotIdx = name.lastIndexOf('.');
      if (dotIdx > 0 && !props.node.is_dir) {
        renameInput.value.setSelectionRange(0, dotIdx);
      } else {
        renameInput.value.select();
      }
    }
  }, 50);
}

function commitRename(e?: Event) {
  const input = renameInput.value;
  if (!input) { renaming.value = false; return; }
  const newName = input.value.trim();
  renaming.value = false;
  if (newName && newName !== props.node.name) {
    emit('rename', props.node.path, newName);
  }
}

function cancelRename() {
  renaming.value = false;
}

// Expose startRename for parent context menu
defineExpose({ startRename });

// Watch for external rename trigger
watch(() => props.renamingPath, (path) => {
  if (path === props.node.path) {
    startRename();
  }
});
</script>

<style scoped>
.tree-thumb {
  width: 18px;
  height: 18px;
  border-radius: 3px;
  object-fit: cover;
  display: inline-block;
  vertical-align: middle;
}

.tree-rich-icon {
  display: inline-flex;
  align-items: center;
  vertical-align: middle;
  width: 16px;
  height: 16px;
}

.tree-rich-icon :deep(svg) {
  display: block;
}

.tree-checkbox {
  display: inline-flex;
  align-items: center;
  margin-right: 4px;
  cursor: pointer;
}

.checkbox-visual {
  width: 14px;
  height: 14px;
  border: 1.5px solid var(--text-muted, #888);
  border-radius: 3px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  line-height: 1;
  color: var(--bg, #fff);
  transition: background 0.15s, border-color 0.15s;
}

.checkbox-visual.checked {
  background: var(--accent, #50c878);
  border-color: var(--accent, #50c878);
}

.checkbox-visual.indeterminate {
  background: var(--accent, #50c878);
  border-color: var(--accent, #50c878);
  opacity: 0.6;
}

.star-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 11px;
  color: var(--text-muted, #666);
  padding: 0 2px;
  margin-left: auto;
  opacity: 0;
  transition: opacity 0.15s, color 0.15s, transform 0.15s;
  flex-shrink: 0;
}

.tree-node:hover .star-btn,
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

.rename-input {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  font-family: inherit;
  background: var(--bg-primary, #1a1a2e);
  color: var(--text-primary, #e0e0e0);
  border: 1px solid var(--accent, #5ccfb8);
  border-radius: 3px;
  padding: 1px 4px;
  outline: none;
  box-shadow: 0 0 0 2px rgba(92, 207, 184, 0.2);
}
</style>
