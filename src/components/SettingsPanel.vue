<template>
  <div class="settings-panel">
    <h2 class="settings-title">设置</h2>

    <!-- Account Section -->
    <div class="settings-section">
      <h3 class="section-title"><TIcon name="user" :size="16" /> 账户</h3>
      <LoginPanel />
    </div>

    <!-- Activation Section -->
    <div class="settings-section">
      <h3 class="section-title"><TIcon name="key" :size="16" /> 激活</h3>
      <ActivationPanel />
    </div>

    <!-- API Config Section -->
    <div class="settings-section">
      <h3 class="section-title"><TIcon name="settings" :size="16" /> API 配置</h3>
      <p class="settings-desc">每个 Agent 可独立配置，也可共用同一个中转站 Key</p>

      <!-- Agent tabs with active provider indicator -->
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
          <span v-if="activeProviders[t.id]" class="tab-indicator" :title="activeProviders[t.id]?.name || ''"><TIcon name="statusOnline" :size="8" /></span>
        </button>
      </div>

      <!-- Active provider display -->
      <div v-if="activeProviders[selectedType]" class="active-provider-badge">
        <TIcon name="check" :size="14" /> 当前: <strong>{{ activeProviders[selectedType]?.name || '未配置' }}</strong>
        <span v-if="activeProviders[selectedType]?.model"> · {{ activeProviders[selectedType]?.model }}</span>
      </div>

      <!-- Preset Selector -->
      <div class="preset-section">
        <label><TIcon name="bolt" :size="14" /> 快速预设</label>
        <div class="preset-selector">
          <select v-model="selectedPresetIdx" @change="applyPreset">
            <option :value="-1">自定义</option>
            <option v-for="(p, i) in PROVIDER_PRESETS" :key="i" :value="i">
              {{ p.name }}
            </option>
          </select>
        </div>
        <!-- Model dropdown for selected preset -->
        <div v-if="selectedPresetIdx >= 0 && PROVIDER_PRESETS[selectedPresetIdx]?.models?.length" class="preset-models">
          <label><TIcon name="cpu" :size="14" /> 模型选择</label>
          <div class="model-chips">
            <button
              v-for="m in PROVIDER_PRESETS[selectedPresetIdx].models"
              :key="m"
              class="model-chip"
              :class="{ active: model === m }"
              @click="model = m"
            >
              {{ m }}
            </button>
          </div>
        </div>
      </div>

      <div class="settings-form">
        <label><TIcon name="link" :size="14" /> 地址</label>
        <input v-model="baseUrl" type="text" placeholder="https://api.example.com/v1" />
        <label><TIcon name="key" :size="14" /> 密钥</label>
        <input v-model="apiKey" type="password" placeholder="sk-..." />
        <label><TIcon name="cpu" :size="14" /> 模型</label>
        <input v-model="model" type="text" placeholder="模型名称 (可选)" />
        <div class="settings-actions">
          <button class="save-btn" @click="save"><TIcon name="check" :size="14" /> 保存</button>
          <button class="test-btn" @click="testConn" :disabled="testing">
            <TIcon name="plug" :size="14" /> {{ testing ? '测试中...' : '测试连接' }}
          </button>
          <span class="settings-status" :class="{ error: connStatus.startsWith('连接失败') }" v-if="connStatus"><TIcon :name="connStatus.startsWith('连接失败') ? 'close' : 'check'" :size="14" /> {{ connStatus }}</span>
          <span class="settings-status" v-else-if="status"><TIcon name="check" :size="14" /> {{ status }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { TIcon } from "../utils/icons";
import { invoke } from '@tauri-apps/api/core';
import LoginPanel from './LoginPanel.vue';
import ActivationPanel from './ActivationPanel.vue';

// ─── Provider Presets ───
const PROVIDER_PRESETS = [
  { name: 'Anthropic', base_url: 'https://api.anthropic.com', models: ['claude-sonnet-4', 'claude-opus-4', 'claude-haiku-4'], env: 'ANTHROPIC' },
  { name: 'OpenAI', base_url: 'https://api.openai.com/v1', models: ['gpt-4o', 'gpt-4-turbo', 'gpt-3.5-turbo'], env: 'OPENAI' },
  { name: 'DeepSeek', base_url: 'https://api.deepseek.com/v1', models: ['deepseek-chat', 'deepseek-coder'], env: 'OPENAI' },
  { name: 'Moonshot', base_url: 'https://api.moonshot.cn/v1', models: ['moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k'], env: 'OPENAI' },
  { name: '通义千问', base_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1', models: ['qwen-plus', 'qwen-turbo', 'qwen-max'], env: 'OPENAI' },
  { name: '智谱 GLM', base_url: 'https://open.bigmodel.cn/api/paas/v4', models: ['glm-4-flash', 'glm-4', 'glm-3-turbo'], env: 'OPENAI' },
  { name: '百川', base_url: 'https://api.baichuan-ai.com/v1', models: ['Baichuan4', 'Baichuan3-Turbo'], env: 'OPENAI' },
  { name: '豆包', base_url: 'https://ark.cn-beijing.volces.com/api/v3', models: ['doubao-1.5-pro-32k', 'doubao-lite-32k'], env: 'OPENAI' },
  { name: '小米 MiMo', base_url: 'https://api.xiaomimimo.com/v1', models: ['MiMo', 'mimo-v2.5-pro'], env: 'OPENAI' },
  { name: '百度千帆', base_url: 'https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop', models: ['ernie-4.0-8k', 'ernie-3.5-8k'], env: 'OPENAI' },
  { name: '讯飞星火', base_url: 'https://spark-api-open.xf-yun.com/v1', models: ['generalv3.5', 'generalv3'], env: 'OPENAI' },
  { name: '本地中转', base_url: 'http://localhost:3000/v1', models: [], env: 'OPENAI' },
];

// ─── State ───
const selectedType = ref('claude');
const baseUrl = ref('');
const apiKey = ref('');
const model = ref('');
const status = ref('');
const connStatus = ref('');
const testing = ref(false);
const selectedPresetIdx = ref(-1);

// Track active provider per agent type
const activeProviders = reactive<Record<string, { name: string; model: string } | null>>({
  claude: null,
  codex: null,
  openclaw: null,
  hermes: null,
});

const appTypes = [
  { id: 'claude', label: 'Claude (梅)', glyph: '梅', color: '#d4577b' },
  { id: 'codex', label: 'Codex (兰)', glyph: '兰', color: '#6a994e' },
  { id: 'openclaw', label: 'OpenClaw (竹)', glyph: '竹', color: '#4caf50' },
  { id: 'hermes', label: 'Hermes (菊)', glyph: '菊', color: '#f0a830' },
];

// ─── Methods ───

async function loadProviders() {
  try {
    const providers: any[] = await invoke('get_providers', { appType: selectedType.value });
    const active = providers?.find((p: any) => p.is_current);
    if (active) {
      baseUrl.value = active.base_url || '';
      apiKey.value = active.api_key || '';
      model.value = active.model || '';
      activeProviders[selectedType.value] = { name: active.name, model: active.model || '' };
    } else {
      baseUrl.value = '';
      apiKey.value = '';
      model.value = '';
      activeProviders[selectedType.value] = null;
    }
    // Auto-detect preset from current URL
    detectPreset();
  } catch (e) {
    console.error('loadProviders:', e);
  }
}

async function loadAllActiveProviders() {
  for (const t of appTypes) {
    try {
      const providers: any[] = await invoke('get_providers', { appType: t.id });
      const active = providers?.find((p: any) => p.is_current);
      if (active) {
        activeProviders[t.id] = { name: active.name, model: active.model || '' };
      } else {
        activeProviders[t.id] = null;
      }
    } catch {
      // ignore
    }
  }
}

function detectPreset() {
  // Try to match current base_url to a preset
  const idx = PROVIDER_PRESETS.findIndex(p => {
    return baseUrl.value.includes(p.base_url.replace('https://', '').replace('http://', ''));
  });
  selectedPresetIdx.value = idx;
}

function applyPreset() {
  const idx = selectedPresetIdx.value;
  if (idx < 0 || idx >= PROVIDER_PRESETS.length) return;
  const preset = PROVIDER_PRESETS[idx];
  baseUrl.value = preset.base_url;
  if (preset.models.length > 0) {
    model.value = preset.models[0];
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
    connStatus.value = '';
    activeProviders[selectedType.value] = { name: agent?.label || selectedType.value, model: model.value };
    setTimeout(() => status.value = '', 2000);
  } catch (e) {
    status.value = String(e);
  }
}

async function testConn() {
  if (!baseUrl.value) {
    connStatus.value = '请先填写地址';
    return;
  }
  testing.value = true;
  connStatus.value = '';
  try {
    const result: string = await invoke('test_connection', {
      baseUrl: baseUrl.value,
      apiKey: apiKey.value || '',
      appType: selectedType.value,
    });
    connStatus.value = result;
  } catch (e) {
    connStatus.value = String(e);
  } finally {
    testing.value = false;
  }
}

onMounted(() => {
  loadProviders();
  loadAllActiveProviders();
});
</script>

<style scoped>
.settings-panel { padding: 16px; }
.settings-title { font-family: var(--font-serif); font-size: 1rem; color: var(--bone); margin-bottom: 12px; }
.settings-desc { font-size: .68rem; color: var(--silver); margin-bottom: 16px; }

.settings-section {
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border-light);
}

.section-title {
  font-family: var(--font-serif);
  font-size: .82rem;
  color: var(--bone-dim);
  margin-bottom: 12px;
}

.settings-tabs { display: flex; gap: 6px; margin-bottom: 16px; flex-wrap: wrap; }
.settings-tab {
  display: flex; align-items: center; gap: 4px;
  padding: 6px 12px; border-radius: 6px; border: 1px solid var(--border-light);
  background: transparent; color: var(--bone-dim); cursor: pointer; transition: all .2s;
  font-family: var(--font-body); font-size: .68rem;
  position: relative;
}
.settings-tab:hover { border-color: var(--hairline-warm); color: var(--bone); }
.settings-tab.active { border-color: var(--tab-color, var(--jade)); color: var(--tab-color, var(--jade)); }
.tab-glyph { font-family: var(--font-brush); font-size: 1.1rem; }
.tab-indicator {
  font-size: .4rem; margin-left: 2px; opacity: .7;
  color: var(--jade);
}

.active-provider-badge {
  font-size: .62rem; color: var(--silver); margin-bottom: 12px;
  padding: 4px 8px; background: var(--bg-surface); border-radius: 4px;
  border: 1px solid var(--border-light);
}
.active-provider-badge strong { color: var(--bone); }

/* Preset selector */
.preset-section { margin-bottom: 12px; }
.preset-section label { font-family: var(--font-mono); font-size: .58rem; color: var(--silver); display: block; margin-bottom: 4px; }
.preset-selector select {
  width: 100%; padding: 6px 10px;
  background: var(--bg-surface); border: 1px solid var(--border-light);
  border-radius: 6px; color: var(--bone); font-family: var(--font-mono); font-size: .68rem;
  outline: none; cursor: pointer;
}
.preset-selector select:focus { border-color: var(--border-accent); }
.preset-selector select option { background: var(--bg-primary); color: var(--bone); }

.preset-models { margin-top: 8px; }
.model-chips { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 4px; }
.model-chip {
  padding: 3px 8px; border: 1px solid var(--border-light); border-radius: 4px;
  background: transparent; color: var(--bone-dim); font-size: .58rem; cursor: pointer;
  font-family: var(--font-mono); transition: all .15s;
}
.model-chip:hover { border-color: var(--hairline-warm); color: var(--bone); }
.model-chip.active { border-color: var(--jade); color: var(--jade); background: rgba(80, 200, 120, .08); }

/* Form */
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
.test-btn {
  padding: 6px 14px; background: transparent; border: 1px solid var(--border-light); border-radius: 6px;
  color: var(--bone-dim); font-family: var(--font-serif); font-size: .72rem; cursor: pointer;
  transition: all .2s;
}
.test-btn:hover:not(:disabled) { border-color: var(--jade); color: var(--jade); }
.test-btn:disabled { opacity: .5; cursor: not-allowed; }
.settings-status { font-size: .62rem; color: var(--jade); }
.settings-status.error { color: var(--red, #ff6464); }
</style>
