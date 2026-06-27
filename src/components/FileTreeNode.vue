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
      <span class="tree-icon">
        <template v-if="node.is_dir">
          {{ expanded ? ICONS.folder : ICONS.folderOpen }}
        </template>
        <template v-else-if="thumbnailUrl">
          <img class="tree-thumb" :src="thumbnailUrl" alt="" @error="thumbnailFailed = true" />
        </template>
        <template v-else>
          <span class="tree-rich-icon" v-html="richIcon"></span>
        </template>
      </span>
      <span class="tree-label">{{ node.name }}</span>
      <button
        v-if="!node.is_dir"
        class="star-btn"
        :class="{ active: workspace.isFavorite(node.path) }"
        @click.stop="workspace.toggleFavorite(node.path)"
        :title="workspace.isFavorite(node.path) ? '取消收藏' : '收藏'"
      >
        {{ workspace.isFavorite(node.path) ? ICONS.starFilled : ICONS.starEmpty }}
      </button>
    </div>

    <template v-if="node.is_dir && expanded && node.children">
      <FileTreeNode
        v-for="child in node.children"
        :key="child.path"
        :node="child"
        :depth="depth + 1"
        @contextmenu="(e: MouseEvent, n: FileNode) => emit('contextmenu', e, n)"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from "vue";
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
}>();

const emit = defineEmits<{
  (e: 'contextmenu', event: MouseEvent, node: FileNode): void
}>()

const workspace = useWorkspaceStore();
const expanded = ref(props.depth < 1);

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
  return FILE_ICONS[ext] ?? ICONS.file;
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
</style>
