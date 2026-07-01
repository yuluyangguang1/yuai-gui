<template>
  <div class="app-shell pattern-starfield">
    <a href="#main-content" class="sr-only" style="position:absolute;top:-100px;left:0;z-index:9999;padding:8px 16px;background:var(--accent);color:var(--text-inverse);text-decoration:none;" @focus="$event.target.style.top='0'" @blur="$event.target.style.top='-100px'">跳转到主内容</a>
    <AppTitlebar />
    <div class="app-main">
      <AppRail
        @open-settings="previewMode = 'settings'"
        @open-account="previewMode = 'account'"
        @open-skills="previewMode = 'skills'"
        @open-lan="previewMode = 'lan'"
      />
      <HomeView v-show="workspaceStore.showWorkspace" />

      <div class="preview-col" id="main-content" role="main">
        <div class="col-header" role="tablist" aria-label="面板标签">
          <span
            v-for="tab in previewTabs"
            :key="tab.id"
            class="preview-mode-tab"
            :class="{ active: previewMode === tab.id }"
            role="tab"
            :aria-selected="previewMode === tab.id"
            :tabindex="previewMode === tab.id ? 0 : -1"
            @click="previewMode = tab.id"
            @keydown.enter="previewMode = tab.id"
            @keydown.space.prevent="previewMode = tab.id"
          ><span class="preview-tab-icon"><TIcon :name="tab.icon" :size="12" /></span><span class="preview-tab-label">{{ tab.label }}</span></span>
        </div>
        <div class="preview-body" role="tabpanel">
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
              <TIcon name="terminal" :size="32" style="color:var(--jade);opacity:.5;margin-bottom:12px" />
              <p style="color:var(--silver);font-size:.72rem;margin-bottom:16px">选择一个 Agent 启动终端</p>
              <div class="terminal-agent-grid stagger-scale">
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
          <DevicesPanel v-else-if="previewMode === 'lan'" />
          <OrganizePanel v-else-if="previewMode === 'organize'" />
          <SettingsPanel v-else-if="previewMode === 'settings'" />
          <AccountPanel v-else-if="previewMode === 'account'" />
          <TaskPanel v-else-if="previewMode === 'task'" />
          <SpecPanel v-else-if="previewMode === 'spec'" />
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
import { TIcon } from "./utils/icons";
import AppTitlebar from "./components/layout/AppTitlebar.vue";
import AppRail from "./components/layout/AppRail.vue";
import AppStatusbar from "./components/layout/AppStatusbar.vue";
import HomeView from "./views/HomeView.vue";
import PreviewView from "./views/PreviewView.vue";
import ChatPanel from "./components/ChatPanel.vue";
import DiffViewer from "./components/DiffViewer.vue";
import SettingsPanel from "./components/SettingsPanel.vue";
import AccountPanel from "./components/AccountPanel.vue";
import TaskPanel from "./components/TaskPanel.vue";
import SpecPanel from "./components/SpecPanel.vue";
import OrganizePanel from "./components/OrganizePanel.vue";
import SkillsPanel from "./components/SkillsPanel.vue";
import DevicesPanel from "./components/DevicesPanel.vue";
import SessionReplay from "./components/SessionReplay.vue";
import DiskUsage from "./components/DiskUsage.vue";
import WriteGatePanel from "./components/WriteGatePanel.vue";
import HardwarePanel from "./components/HardwarePanel.vue";
import KanbanBoard from "./components/KanbanBoard.vue";
import McpPanel from "./components/McpPanel.vue";
import CommandPalette from "./components/CommandPalette.vue";
import ScreenshotToast from "./components/ScreenshotToast.vue";
import ToastContainer from "./components/ToastContainer.vue";

const Terminal = defineAsyncComponent(() => import("./components/Terminal.vue"));
const WechatPanel = defineAsyncComponent(() => import("./components/WechatPanel.vue"));
const WorkflowEditor = defineAsyncComponent(() => import("./components/WorkflowEditor.vue"));

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

type PreviewMode =
  | 'code'
  | 'diff'
  | 'terminal'
  | 'wechat'
  | 'lan'
  | 'organize'
  | 'settings'
  | 'replay'
  | 'disk'
  | 'skills'
  | 'write-gate'
  | 'kanban'
  | 'mcp'
  | 'workflow'
  | 'hardware'
  | 'account'
  | 'task'
  | 'spec';

const previewMode = ref<PreviewMode>('code');
const activeTerminalAgent = ref<string | null>(null);
const previewTabs: { id: PreviewMode; label: string; icon: string }[] = [
  { id: 'code', label: '代码', icon: 'code' },
  { id: 'diff', label: '变更', icon: 'gitBranch' },
  { id: 'terminal', label: '终端', icon: 'terminal' },
  { id: 'lan', label: '设备', icon: 'deviceDesktop' },
  { id: 'replay', label: '回放', icon: 'playerPlay' },
  { id: 'disk', label: '磁盘', icon: 'database' },
  { id: 'wechat', label: '微信', icon: 'messageCircle' },
  { id: 'organize', label: '整理', icon: 'sparkles' },
  { id: 'skills', label: '技能', icon: 'wand' },
  { id: 'write-gate', label: '写入', icon: 'shield' },
  { id: 'kanban', label: '看板', icon: 'layoutKanban' },
  { id: 'task', label: '任务', icon: 'listCheck' },
  { id: 'spec', label: '规格', icon: 'fileCode' },
  { id: 'mcp', label: 'MCP', icon: 'plug' },
  { id: 'workflow', label: '工作流', icon: 'schema' },
  { id: 'hardware', label: '硬件', icon: 'cpu' },
  { id: 'account', label: '账户', icon: 'user' },
  { id: 'settings', label: '模型', icon: 'settings' },
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
  try { await agentsStore.loadAgents(); } catch (e) { console.error('[App] loadAgents failed:', e); }
  try { await workspaceStore.initWorkspace(); } catch (e) { console.error('[App] initWorkspace failed:', e); }
  updateStore.startAutoCheck();
});
</script>
