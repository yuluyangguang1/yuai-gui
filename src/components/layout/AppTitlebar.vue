<template>
  <header class="app-titlebar">
    <span class="titlebar-brand">語AI</span>

    <span class="titlebar-spacer" />

    <span class="titlebar-status" v-if="workspace.hasWorkspace && workspace.currentFileName">
      {{ workspace.currentFileName }}
    </span>

    <div class="titlebar-actions">
      <button
        class="titlebar-btn"
        :title="settings.theme === 'dark' ? '切换亮色' : '切换暗色'"
        @click="settings.toggleTheme"
      >
        <TIcon :name="settings.theme === 'dark' ? 'sun' : 'moon'" :size="14" />
      </button>
    </div>
  </header>
</template>

<script setup lang="ts">
import { useSettingsStore } from "../../stores/settings";
import { useWorkspaceStore } from "../../stores/workspace";
import { TIcon } from "../../utils/tabler-icons";

const settings = useSettingsStore();
const workspace = useWorkspaceStore();
</script>
