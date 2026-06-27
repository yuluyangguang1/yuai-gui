<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { invoke } from '@tauri-apps/api/core';

const selectedType = ref('claude');
const baseUrl = ref('');
const apiKey = ref('');
const model = ref('');
const status = ref('');
const appTypes = [
  { id: 'claude', label: 'Claude (梅)', glyph: '梅', color: '#ff8c32' },
  { id: 'codex', label: 'Codex (兰)', glyph: '兰', color: '#50c878' },
  { id: 'openclaw', label: 'OpenClaw (竹)', glyph: '竹', color: '#ff6464' },
  { id: 'hermes', label: 'Hermes (菊)', glyph: '菊', color: '#a064ff' },
];

async function loadProviders() {
  try {
    const providers: any[] = await invoke('get_providers', { appType: selectedType.value });
    const active = providers?.find((p: any) => p.is_current);
    if (active) {
      baseUrl.value = active.base_url || '';
      apiKey.value = active.api_key || '';
      model.value = active.model || '';
    } else {
      baseUrl.value = '';
      apiKey.value = '';
      model.value = '';
    }
  } catch (e) {
    console.error('loadProviders:', e);
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
        base_url: baseUrl.value,
        api_key: apiKey.value,
        model: model.value,
        is_current: true,
      },
    });
    status.value = '已保存';
    setTimeout(() => status.value = '', 2000);
  } catch (e) {
    status.value = String(e);
  }
}

async function applyTemplate(url: string, m: string) {
  baseUrl.value = url;
  model.value = m;
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
      <input v-model="baseUrl" type="text" placeholder="https://api.example.com/v1" />
      <label>密钥</label>
      <input v-model="apiKey" type="password" placeholder="sk-..." />
      <label>模型</label>
      <input v-model="model" type="text" placeholder="模型名称" />
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
        <button @click="applyTemplate('https://api.moonshot.cn/v1', 'moonshot-v1-8k')">Moonshot</button>
        <button @click="applyTemplate('https://dashscope.aliyuncs.com/compatible-mode/v1', 'qwen-plus')">通义千问</button>
        <button @click="applyTemplate('https://open.bigmodel.cn/api/paas/v4', 'glm-4-flash')">智谱 GLM</button>
        <button @click="applyTemplate('https://api.baichuan-ai.com/v1', 'Baichuan4')">百川</button>
        <button @click="applyTemplate('https://ark.cn-beijing.volces.com/api/v3', 'doubao-1.5-pro-32k')">豆包</button>
        <button @click="applyTemplate('https://api.xiaomimimo.com/v1', 'MiMo')">小米 MiMo</button>
        <button @click="applyTemplate('https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop', 'ernie-4.0-8k')">百度千帆</button>
        <button @click="applyTemplate('https://spark-api-open.xf-yun.com/v1', 'generalv3.5')">讯飞星火</button>
        <button @click="applyTemplate('http://localhost:3000/v1', '')">本地中转</button>
        <button @click="applyTemplate('https://dashscope.aliyuncs.com/compatible-mode/v1', 'qwen-max')">通义千问</button>
        <button @click="applyTemplate('https://open.bigmodel.cn/api/paas/v4', 'glm-4')">智谱 GLM</button>
        <button @click="applyTemplate('https://api.baichuan-ai.com/v1', 'Baichuan4')">百川</button>
        <button @click="applyTemplate('https://ark.cn-beijing.volces.com/api/v3', 'doubao-pro-32k')">火山(豆包)</button>
        <button @click="applyTemplate('https://api.xiaomi.com/v1', 'MiMo')">小米 MiMo</button>
        <button @click="applyTemplate('https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop', 'ernie-4.0-8k')">百度千帆</button>
        <button @click="applyTemplate('https://spark-api-open.xf-yun.com/v1', 'generalv3.5')">讯飞星火</button>
        <button @click="applyTemplate('https://api.sensenova.cn/v1', 'SenseChat')">商汤</button>
        <button @click="applyTemplate('https://api.kunlun.com/v1', 'kunlun')">昆仑</button>
        <button @click="applyTemplate('http://localhost:3000/v1', '')">本地中转</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.settings-panel { padding: 16px; }
.settings-title { font-family: var(--font-serif); font-size: 1rem; color: var(--bone); margin-bottom: 4px; }
.settings-desc { font-size: .68rem; color: var(--silver); margin-bottom: 16px; }
.settings-tabs { display: flex; gap: 6px; margin-bottom: 16px; flex-wrap: wrap; }
.settings-tab {
  display: flex; align-items: center; gap: 4px;
  padding: 6px 12px; border-radius: 6px; border: 1px solid var(--border-light);
  background: transparent; color: var(--bone-dim); cursor: pointer; transition: all .2s;
  font-family: var(--font-body); font-size: .68rem;
}
.settings-tab:hover { border-color: var(--hairline-warm); color: var(--bone); }
.settings-tab.active { border-color: var(--tab-color, var(--jade)); color: var(--tab-color, var(--jade)); }
.tab-glyph { font-family: var(--font-brush); font-size: 1.1rem; }
.settings-form { display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px; }
.settings-form label { font-family: var(--font-mono); font-size: .58rem; color: var(--silver); }
.settings-form input {
  padding: 8px 12px; background: var(--bg-surface); border: 1px solid var(--border-light);
  border-radius: 6px; color: var(--bone); font-family: var(--font-mono); font-size: .72rem;
  outline: none; transition: border-color .2s;
}
.settings-form input:focus { border-color: var(--border-accent); }
.settings-actions { display: flex; align-items: center; gap: 10px; margin-top: 8px; }
.save-btn {
  padding: 6px 20px; background: var(--jade-deep); border: none; border-radius: 6px;
  color: var(--bg-primary); font-family: var(--font-serif); font-size: .72rem; cursor: pointer;
}
.save-btn:hover { background: var(--jade); }
.settings-status { font-size: .62rem; color: var(--jade); }
.settings-templates h3 { font-family: var(--font-serif); font-size: .78rem; color: var(--bone-dim); margin-bottom: 8px; }
.template-grid { display: flex; gap: 6px; flex-wrap: wrap; }
.template-grid button {
  padding: 4px 10px; border: 1px solid var(--border-light); border-radius: 4px;
  background: transparent; color: var(--bone-dim); font-size: .6rem; cursor: pointer;
}
.template-grid button:hover { border-color: var(--hairline-warm); color: var(--bone); }
</style>
