<template>
  <Teleport to="body">
    <div v-if="visible" class="command-palette-overlay" @click.self="close">
      <div class="command-palette">
        <input
          ref="searchInput"
          v-model="query"
          class="command-palette-input"
          placeholder="搜索命令、代理、文件..."
          @keydown="handleKeydown"
        />
        <div class="command-palette-results" v-if="filteredItems.length > 0">
          <div
            v-for="(item, index) in filteredItems"
            :key="item.id"
            class="command-palette-item"
            :class="{ active: index === selectedIndex }"
            @click="executeItem(item)"
            @mouseenter="selectedIndex = index"
          >
            <span class="command-palette-icon">{{ item.icon }}</span>
            <span class="command-palette-label">{{ item.label }}</span>
            <span class="command-palette-hint" v-if="item.hint">{{ item.hint }}</span>
          </div>
        </div>
        <div v-else class="command-palette-empty">
          无匹配结果
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from "vue";
import { useAgentsStore } from "../stores/agents";
import { useWorkspaceStore } from "../stores/workspace";
import { useSettingsStore } from "../stores/settings";

interface CommandItem {
  id: string;
  label: string;
  icon: string;
  hint?: string;
  category: "agent" | "file" | "action";
  action: () => void;
}

const agentsStore = useAgentsStore();
const workspaceStore = useWorkspaceStore();
const settingsStore = useSettingsStore();

const visible = ref(false);
const query = ref("");
const selectedIndex = ref(0);
const searchInput = ref<HTMLInputElement | null>(null);

const emit = defineEmits<{
  (e: "navigate-file", path: string): void;
  (e: "open-settings"): void;
}>();

// Build all command items
const allItems = computed<CommandItem[]>(() => {
  const items: CommandItem[] = [];

  // Agent commands
  for (const agent of agentsStore.agents) {
    if (agent.enabled) {
      items.push({
        id: `agent-${agent.id}`,
        label: `${agent.glyph} ${agent.name} — ${agent.chinese_name}`,
        icon: agent.glyph,
        hint: agent.specialty,
        category: "agent",
        action: () => agentsStore.setActiveAgent(agent.id),
      });
    }
  }

  // File commands (from file tree, flat list)
  function collectFiles(nodes: typeof workspaceStore.fileTree, prefix = "") {
    for (const node of nodes) {
      if (node.is_dir && node.children) {
        collectFiles(node.children, prefix + node.name + "/");
      } else if (!node.is_dir) {
        items.push({
          id: `file-${node.path}`,
          label: node.name,
          icon: "📄",
          hint: prefix + node.name,
          category: "file",
          action: () => {
            workspaceStore.selectFile(node.path);
            emit("navigate-file", node.path);
          },
        });
      }
    }
  }
  collectFiles(workspaceStore.fileTree);

  // Action commands
  items.push({
    id: "action-theme",
    label: "切换主题",
    icon: "🎨",
    hint: settingsStore.theme === "dark" ? "当前: 暗色" : "当前: 亮色",
    category: "action",
    action: () => settingsStore.toggleTheme(),
  });

  items.push({
    id: "action-settings",
    label: "打开设置",
    icon: "⚙",
    category: "action",
    action: () => emit("open-settings"),
  });

  return items;
});

// Fuzzy filter
const filteredItems = computed(() => {
  const q = query.value.toLowerCase().trim();
  if (!q) return allItems.value;
  return allItems.value.filter(item => {
    const text = (item.label + " " + (item.hint || "")).toLowerCase();
    // Simple fuzzy: all chars must appear in order
    let qi = 0;
    for (let i = 0; i < text.length && qi < q.length; i++) {
      if (text[i] === q[qi]) qi++;
    }
    return qi === q.length;
  });
});

// Reset selection when results change
watch(filteredItems, () => {
  selectedIndex.value = 0;
});

function open() {
  visible.value = true;
  query.value = "";
  selectedIndex.value = 0;
  nextTick(() => searchInput.value?.focus());
}

function close() {
  visible.value = false;
  query.value = "";
}

function toggle() {
  if (visible.value) close();
  else open();
}

function executeItem(item: CommandItem) {
  item.action();
  close();
}

function handleKeydown(e: KeyboardEvent) {
  const items = filteredItems.value;
  switch (e.key) {
    case "ArrowDown":
      e.preventDefault();
      selectedIndex.value = (selectedIndex.value + 1) % items.length;
      break;
    case "ArrowUp":
      e.preventDefault();
      selectedIndex.value = (selectedIndex.value - 1 + items.length) % items.length;
      break;
    case "Enter":
      e.preventDefault();
      if (items[selectedIndex.value]) {
        executeItem(items[selectedIndex.value]);
      }
      break;
    case "Escape":
      e.preventDefault();
      close();
      break;
  }
}

// Global shortcut: Cmd+K / Ctrl+K
function handleGlobalKeydown(e: KeyboardEvent) {
  if ((e.metaKey || e.ctrlKey) && e.key === "k") {
    e.preventDefault();
    toggle();
  }
}

onMounted(() => {
  document.addEventListener("keydown", handleGlobalKeydown);
});

onUnmounted(() => {
  document.removeEventListener("keydown", handleGlobalKeydown);
});

defineExpose({ open, close, toggle });
</script>
