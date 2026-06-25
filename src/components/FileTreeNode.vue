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
    >
      <span class="tree-icon">
        <template v-if="node.is_dir">
          {{ expanded ? "📂" : "📁" }}
        </template>
        <template v-else-if="thumbnailUrl">
          <img class="tree-thumb" :src="thumbnailUrl" alt="" @error="thumbnailFailed = true" />
        </template>
        <template v-else>
          {{ fileIcon }}
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
        {{ workspace.isFavorite(node.path) ? '★' : '☆' }}
      </button>
    </div>

    <template v-if="node.is_dir && expanded && node.children">
      <FileTreeNode
        v-for="child in node.children"
        :key="child.path"
        :node="child"
        :depth="depth + 1"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from "vue";
import type { FileNode } from "../stores/workspace";
import { useWorkspaceStore } from "../stores/workspace";
import { invoke } from "@tauri-apps/api/core";

const props = defineProps<{
  node: FileNode;
  depth: number;
}>();

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
  try {
    const thumb = await invoke<string | null>("get_thumbnail", {
      path: props.node.path,
      width: 24,
    });
    if (thumb) {
      thumbnailUrl.value = thumb;
    }
  } catch {
    // Silently fail, fall back to icon
  }
});

// Re-fetch if path changes (e.g. directory expansion reloads)
watch(() => props.node.path, async (newPath) => {
  if (!isImageFile.value || thumbnailFailed.value) return;
  thumbnailUrl.value = null;
  thumbnailFailed.value = false;
  try {
    const thumb = await invoke<string | null>("get_thumbnail", {
      path: newPath,
      width: 24,
    });
    if (thumb) {
      thumbnailUrl.value = thumb;
    }
  } catch {
    // Silently fail
  }
});

const fileIcon = computed(() => {
  const ext = props.node.name.split(".").pop()?.toLowerCase() ?? "";
  const icons: Record<string, string> = {
    ts: "📘",
    vue: "💚",
    js: "📒",
    json: "📋",
    md: "📝",
    css: "🎨",
    html: "🌐",
    rs: "🦀",
    toml: "⚙",
    yaml: "📋",
    yml: "📋",
    png: "🖼",
    jpg: "🖼",
    svg: "🖼",
    txt: "📄",
    py: "🐍",
  };
  return icons[ext] ?? "📄";
});

function handleClick() {
  if (props.node.is_dir) {
    expanded.value = !expanded.value;
  } else {
    workspace.selectFile(props.node.path);
  }
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

.star-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 11px;
  color: var(--ink-muted, #666);
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
