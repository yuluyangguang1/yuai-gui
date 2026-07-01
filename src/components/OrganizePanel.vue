<template>
  <div class="organize-panel">
    <div class="organize-header">
      <span class="organize-title">理 AI 整理</span>
    </div>

    <!-- Preferences -->
    <div class="organize-section">
      <div class="organize-section-header">
        <span>偏好设置</span>
        <button class="organize-btn-sm" @click="clearPrefs" v-if="organizeStore.preferences.length">清空</button>
      </div>
      <div v-if="organizeStore.preferences.length" class="organize-prefs">
        <div
          v-for="(pref, i) in organizeStore.preferences" :key="i"
          class="organize-pref-tag"
        >
          <span>{{ pref }}</span>
          <button class="organize-tag-remove" @click="organizeStore.removePreference(i)"><TIcon name="close" :size="12" /></button>
        </div>
      </div>
      <div v-else class="organize-empty">暂无偏好</div>
      <div class="organize-add-pref">
        <input
          v-model="newPref"
          class="organize-input"
          placeholder="添加偏好..."
          @keydown.enter="addPref"
        />
        <button class="organize-btn-sm" @click="addPref">+</button>
      </div>
    </div>

    <!-- History -->
    <div class="organize-section">
      <div class="organize-section-header">
        <span>历史记录</span>
        <button class="organize-btn-sm" @click="organizeStore.clearHistory()" v-if="organizeStore.history.length">清空</button>
      </div>
      <div v-if="organizeStore.history.length" class="organize-history">
        <div
          v-for="(entry, i) in organizeStore.history" :key="i"
          class="organize-history-item"
        >
          <span class="organize-history-time">{{ formatTime(entry.timestamp) }}</span>
          <span class="organize-history-action">{{ entry.action }}</span>
          <span class="organize-history-result">{{ entry.result }}</span>
        </div>
      </div>
      <div v-else class="organize-empty">暂无记录</div>
    </div>

    <!-- Actions -->
    <div class="organize-actions">
      <button class="organize-btn" :disabled="!workspaceStore.path" @click="startOrganize">
        AI 开始整理
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { TIcon } from "../utils/icons";
import { useOrganizeStore } from "../stores/organize";
import { useWorkspaceStore } from "../stores/workspace";
import { useChatStore } from "../stores/chat";

const organizeStore = useOrganizeStore();
const workspaceStore = useWorkspaceStore();
const chatStore = useChatStore();

const newPref = ref("");

function addPref() {
  if (newPref.value.trim()) {
    organizeStore.addPreference(newPref.value);
    newPref.value = "";
  }
}

function clearPrefs() {
  organizeStore.clearPreferences();
}

function startOrganize() {
  if (!workspaceStore.path) return;
  const prompt = organizeStore.buildOrganizePrompt(workspaceStore.path);
  chatStore.inputText = prompt;
  organizeStore.addHistory({
    timestamp: Date.now(),
    action: "AI 整理",
    result: "已发送整理请求",
  });
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}
</script>
