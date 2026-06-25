<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { invoke } from '@tauri-apps/api/core';

interface Provider {
  id: string;
  app_type: string;
  name: string;
  base_url: string;
  api_key: string;
  model: string;
  is_current: boolean;
}

const providers = ref<Provider[]>([]);
const selectedType = ref('claude');
const editing = ref<Partial<Provider>>({});
const status = ref('');
const appTypes = [
  { id: 'claude', label: 'Claude', glyph: '梅', color: '#ff8c32' },
  { id: 'codex', label: 'Codex', glyph: '兰', color: '#50c878' },
  { id: 'openclaw', label: 'OpenClaw', glyph: '竹', color: '#ff6464' },
  { id: 'hermes', label: 'Hermes', glyph: '菊', color: '#a064ff' },
  { id: 'openhuman', label: 'OpenHuman', glyph: '莲', color: '#5ccfb8' },
];

async function loadProviders() {
  try {
    providers.value = await invoke('get_providers', { appType: selectedType.value });
    const active = providers.value.find(p => p.is_current);
    if (active) {
      editing.value = { ...active };
    } else {
      editing.value = { base_url: '', api_key: '', model: '' };
    }
  } catch (e) {
    console.error('loadProviders:', e);
    providers.value = [];
  }
}

async function save() {
  try {
    const agent = appTypes.find(a => a.id === selectedType.value);
    await invoke('save_provider', {
      provider: {
        id: `${selectedType.value}-default`,
        app_type: selectedType.value,
        name: agent?.label || selectedType.value,
        base_url: editing.value.base_url || '',
        api_key: editing.value.api_key || '',
        model: editing.value.model || '',
        is_current: true,
      },
    });
    status.value = '已保存';
    setTimeout(() => status.value = '', 2000);
  } catch (e) {
    status.value = String(e);
  }
}

async function applyTemplate(url: string, model: string) {
  editing.value.base_url = url;
  editing.value.model = model;
}

onMounted(loadProviders);
</script>

<template>
  <div class="settings-panel">
    <h2 class="settings-title">API 配置</h2>
    <p class="settings-desc">每个 Agent 可独立配置，也可共用同一个中转站 Key</p>

    <div class="settings-tabs">
      <button
        v-for="t in appTypes"
        :key="t.id"
        class="settings-tab"
        :class="{ active: selectedType === t.id }"
        :style="{ '--tab-color': t.color }"
        @click="selectedType = t.id; loadProviders()"
      >
        <span class="tab-glyph">{{ t.glyph }}</span>
        <span class="tab-label">{{ t.label }}</span>
      </button>
    </div>

    <div class="settings-form">
      <label>地址</label>
      <input v-model="editing.base_url" type="text" placeholder="https://api.example.com/v1" />
      <label>密钥</label>
      <input v-model="editing.api_key" type="password" placeholder="sk-..." />
      <label>模型</label>
      <input v-model="editing.model" type="text" placeholder="模型名称" />
      <div class="settings-actions">
        <button class="save-btn" @click="save">保存</button>
        <span class="settings-status" v-if="status">{{ status }}</span>
      </div>
    </div>

    <div class="settings-templates">
      <h3>快速模板</h3>
      <div class="template-grid">
        <button @click="applyTemplate('https://api.openai.com/v1', 'gpt-4o')">OpenAI</button>
        <button @click="applyTemplate('https://api.anthropic.com/v1', 'claude-sonnet-4')">Anthropic</button>
        <button @click="applyTemplate('https://api.deepseek.com/v1', 'deepseek-chat')">DeepSeek</button>
        <button @click="applyTemplate('http://localhost:3000/v1', '')">本地中转</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-panel { padding: 16px; }
.settings-title { font-family: var(--serif-zh); font-size: 1rem; color: var(--bone); margin-bottom: 4px; }
.settings-desc { font-size: .68rem; color: var(--silver); margin-bottom: 16px; }
.settings-tabs { display: flex; gap: 6px; margin-bottom: 16px; flex-wrap: wrap; }
.settings-tab {
  display: flex; align-items: center; gap: 4px;
  padding: 6px 12px; border-radius: 6px; border: 1px solid var(--hairline);
  background: transparent; color: var(--bone-dim); cursor: pointer; transition: all .2s;
  font-family: var(--sans); font-size: .68rem;
}
.settings-tab:hover { border-color: var(--hairline-warm); color: var(--bone); }
.settings-tab.active { border-color: var(--tab-color, var(--jade)); color: var(--tab-color, var(--jade)); }
.tab-glyph { font-family: var(--brush); font-size: 1.1rem; }
.settings-form { display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px; }
.settings-form label { font-family: var(--mono); font-size: .58rem; color: var(--silver); }
.settings-form input {
  padding: 8px 12px; background: var(--ink-deep); border: 1px solid var(--hairline);
  border-radius: 6px; color: var(--bone); font-family: var(--mono); font-size: .72rem;
  outline: none; transition: border-color .2s;
}
.settings-form input:focus { border-color: var(--hairline-jade); }
.settings-actions { display: flex; align-items: center; gap: 10px; margin-top: 8px; }
.save-btn {
  padding: 6px 20px; background: var(--jade-deep); border: none; border-radius: 6px;
  color: var(--ink-black); font-family: var(--serif-zh); font-size: .72rem; cursor: pointer;
}
.save-btn:hover { background: var(--jade); }
.settings-status { font-size: .62rem; color: var(--jade); }
.settings-templates h3 { font-family: var(--serif-zh); font-size: .78rem; color: var(--bone-dim); margin-bottom: 8px; }
.template-grid { display: flex; gap: 6px; flex-wrap: wrap; }
.template-grid button {
  padding: 4px 10px; border: 1px solid var(--hairline); border-radius: 4px;
  background: transparent; color: var(--bone-dim); font-size: .6rem; cursor: pointer;
}
.template-grid button:hover { border-color: var(--hairline-warm); color: var(--bone); }
</style>
