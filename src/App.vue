<template>
  <div class="app-shell pattern-starfield">
    <AppTitlebar />
    <div class="app-main">
      <AppRail @open-settings="previewMode = 'settings'" @open-skills="previewMode = 'skills'" />
      <HomeView v-show="workspaceStore.showWorkspace" />

      <div class="preview-col">
        <div class="col-header">
          <span
            v-for="tab in previewTabs"
            :key="tab.id"
            class="preview-mode-tab"
            :class="{ active: previewMode === tab.id }"
            @click="previewMode = tab.id"
          >{{ tab.label }}</span>
        </div>
        <div class="preview-body">
          <PreviewView v-if="previewMode === 'code'" />
          <DiffViewer v-else-if="previewMode === 'diff'" />
          <div v-else-if="previewMode === 'terminal'" class="terminal-host">
            <Terminal
              v-if="activeTerminalAgent"
              :agentId="activeTerminalAgent"
              :agentName="agentsStore.agents.find(a => a.id === activeTerminalAgent)?.name || ''"
              :agentGlyph="agentsStore.agents.find(a => a.id === activeTerminalAgent)?.glyph || ''"
              :agentColor="agentsStore.agents.find(a => a.id === activeTerminalAgent)?.color || '#5ccfb8'"
              :cwd="workspaceStore.path || undefined"
              @close="activeTerminalAgent = null"
            />
            <div v-else class="terminal-select">
              <div style="font-family:var(--font-brush);font-size:2rem;color:var(--jade);opacity:.5;margin-bottom:12px">端</div>
              <p style="color:var(--silver);font-size:.72rem;margin-bottom:16px">选择一个 Agent 启动终端</p>
              <div class="terminal-agent-grid">
                <button
                  v-for="agent in agentsStore.agents.filter(a => a.enabled)"
                  :key="agent.id"
                  class="terminal-agent-btn"
                  :style="{ borderColor: agent.color + '40', color: agent.color }"
                  @click="activeTerminalAgent = agent.id; previewMode = 'terminal'"
                >
                  <span style="font-family:var(--font-brush);font-size:1.5rem">{{ agent.glyph }}</span>
                  <span style="font-size:.62rem">{{ agent.name }}</span>
                </button>
              </div>
            </div>
          </div>
          <SessionReplay v-else-if="previewMode === 'replay'" />
          <DiskUsage v-else-if="previewMode === 'disk'" />
          <WechatPanel v-else-if="previewMode === 'wechat'" />
          <OrganizePanel v-else-if="previewMode === 'organize'" />
          <SettingsPanel v-else-if="previewMode === 'settings'" />
          <SkillsPanel v-else-if="previewMode === 'skills'" />
          <WriteGatePanel v-else-if="previewMode === 'write-gate'" />
          <KanbanBoard v-else-if="previewMode === 'kanban'" />
          <McpPanel v-else-if="previewMode === 'mcp'" />
          <WorkflowEditor v-else-if="previewMode === 'workflow'" />
          <HardwarePanel v-else-if="previewMode === 'hardware'" />
        </div>
      </div>

      <ChatPanel />
    </div>
    <AppStatusbar />
    <CommandPalette ref="commandPalette" @open-settings="previewMode = 'settings'" />
    <ScreenshotToast />
    <ToastContainer />
  </div>
</template>

<script setup lang="ts">
import { ref, defineAsyncComponent, onMounted } from "vue";
import AppTitlebar from "./components/layout/AppTitlebar.vue";
import AppRail from "./components/layout/AppRail.vue";
import AppStatusbar from "./components/layout/AppStatusbar.vue";
import HomeView from "./views/HomeView.vue";
import PreviewView from "./views/PreviewView.vue";
import ChatPanel from "./components/ChatPanel.vue";
import DiffViewer from "./components/DiffViewer.vue";
import SettingsPanel from "./components/SettingsPanel.vue";
import OrganizePanel from "./components/OrganizePanel.vue";
import SkillsPanel from "./components/SkillsPanel.vue";

// Lazy-load heavy components for performance
const Terminal = defineAsyncComponent(() => import("./components/Terminal.vue"));
const WechatPanel = defineAsyncComponent(() => import("./components/WechatPanel.vue"));
const WorkflowEditor = defineAsyncComponent(() => import("./components/WorkflowEditor.vue"));

import SessionReplay from "./components/SessionReplay.vue";
import DiskUsage from "./components/DiskUsage.vue";
import WriteGatePanel from "./components/WriteGatePanel.vue";
import HardwarePanel from "./components/HardwarePanel.vue";
import KanbanBoard from "./components/KanbanBoard.vue";
import McpPanel from "./components/McpPanel.vue";
import CommandPalette from "./components/CommandPalette.vue";
import ScreenshotToast from "./components/ScreenshotToast.vue";
import ToastContainer from "./components/ToastContainer.vue";
import { useAgentsStore } from "./stores/agents";
import { useWorkspaceStore } from "./stores/workspace";
import { useChatStore } from "./stores/chat";
import { useUpdateStore } from "./stores/update";
import { useKeyboard } from "./composables/useKeyboard";

const agentsStore = useAgentsStore();
const workspaceStore = useWorkspaceStore();
const chatStore = useChatStore();
const updateStore = useUpdateStore();

const commandPalette = ref<InstanceType<typeof CommandPalette> | null>(null);

const previewMode = ref<'code' | 'diff' | 'terminal' | 'wechat' | 'organize' | 'settings' | 'replay' | 'disk' | 'skills' | 'write-gate' | 'kanban' | 'mcp' | 'workflow' | 'hardware'>('code');
const activeTerminalAgent = ref<string | null>(null);
const previewTabs = [
  { id: 'code' as const, label: '代码' },
  { id: 'diff' as const, label: '变更' },
  { id: 'terminal' as const, label: '终端' },
  { id: 'replay' as const, label: '回放' },
  { id: 'disk' as const, label: '磁盘' },
  { id: 'wechat' as const, label: '微信' },
  { id: 'organize' as const, label: '整理' },
  { id: 'skills' as const, label: '技能' },
  { id: 'write-gate' as const, label: '写入' },
  { id: 'kanban' as const, label: '看板' },
  { id: 'mcp' as const, label: 'MCP' },
  { id: 'workflow' as const, label: '工作流' },
  { id: 'hardware' as const, label: '硬件' },
  { id: 'settings' as const, label: '配置' },
];

const enabledAgents = () => agentsStore.agents.filter(a => a.enabled);

useKeyboard({
  toggleCommandPalette: () => commandPalette.value?.toggle(),
  toggleWorkspace: () => workspaceStore.toggleWorkspace(),
  toggleTerminal: () => {
    if (previewMode.value === 'terminal') {
      previewMode.value = 'code';
    } else {
      if (!activeTerminalAgent.value && enabledAgents().length > 0) {
        activeTerminalAgent.value = enabledAgents()[0].id;
      }
      previewMode.value = 'terminal';
    }
  },
  toggleDiffView: () => {
    previewMode.value = previewMode.value === 'diff' ? 'code' : 'diff';
  },
  closeOverlays: () => {
    commandPalette.value?.close();
    if (previewMode.value === 'settings') {
      previewMode.value = 'code';
    }
  },
  switchToAgent: (index: number) => {
    const agents = enabledAgents();
    if (index < agents.length) {
      activeTerminalAgent.value = agents[index].id;
      previewMode.value = 'terminal';
    }
  },
  sendMessage: () => {
    chatStore.sendMessage();
  },
});

onMounted(async () => {
  await agentsStore.loadAgents();
  // Initialize workspace with home directory
  workspaceStore.initWorkspace();
  // Start auto-update check on app startup
  updateStore.startAutoCheck();
});
</script>
