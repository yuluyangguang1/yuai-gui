<template>
  <div class="settings-panel" role="region" aria-label="模型配置">
    <h2 class="settings-title">模型配置</h2>

    <!-- API Config Section -->
    <div class="settings-section">
      <h3 class="section-title"><span class="section-icon"><TIcon name="settings" :size="16" /></span><span class="section-label">API 配置</span></h3>
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

      <!-- Preset Selector (改为供应商选择器) -->
      <div class="preset-section">
        <label><TIcon name="bolt" :size="14" /> 供应商 ({{ providerList.length }})</label>
        <div class="provider-grid">
          <button
            v-for="p in providerList"
            :key="p.id"
            class="provider-chip" role="radio"
            :class="{ active: selectedProviderId === p.id, connected: p.status === 'connected' }"
            @click="selectProvider(p.id)"
            :title="p.base_url"
          >
            {{ p.name }}
          </button>
        </div>
        <!-- Model picker for selected provider -->
        <div v-if="filteredModels.length > 0" class="preset-models">
          <label><TIcon name="cpu" :size="14" /> 模型选择 ({{ filteredModels.length }})</label>
          <input
            v-model="modelSearch"
            class="model-search"
            aria-label="搜索模型" placeholder="搜索模型... (支持别名如 sonnet, gpt5, mimo)"
          />
          <div class="model-chips">
            <button
              v-for="m in filteredModels.slice(0, 12)"
              :key="m.id"
              class="model-chip" role="radio"
              :class="{ active: model === m.id }"
              @click="selectModel(m.id)"
              :title="`${m.id}${m.context_length ? ' · ' + (m.context_length/1000) + 'K' : ''}${m.supports_vision ? ' · 视觉' : ''}`"
            >
              {{ m.name }}
              <span v-if="m.aliases.length" class="model-alias">{{ m.aliases[0] }}</span>
            </button>
          </div>
          <span v-if="filteredModels.length > 12" class="model-more">+{{ filteredModels.length - 12 }} 更多</span>
        </div>
      </div>

      <div class="settings-form">
        <label><TIcon name="link" :size="14" /> 地址</label>
        <input v-model="baseUrl" type="text" placeholder="https://api.example.com/v1" />
        <label><TIcon name="key" :size="14" /> 密钥</label>
        <input v-model="apiKey" type="password" placeholder="sk-..." />
        <label><TIcon name="cpu" :size="14" /> 模型</label>
        <input v-model="model" type="text" aria-label="模型名称" placeholder="模型名称 (支持别名: sonnet, gpt5, mimo)" @input="onModelInput" />
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
import { ref, reactive, onMounted, computed } from 'vue';
import { TIcon } from "../utils/icons";
import { invoke } from '@tauri-apps/api/core';
import { useProviderStore } from '../stores/provider';
import { PROVIDER_PRESETS } from '../utils/provider-crud';
import { filterVisibleModels } from '../utils/model-visibility';
import { useAgentsStore } from '../stores/agents';
import LoginPanel from './LoginPanel.vue';

const providerStore = useProviderStore();
const agentsStore = useAgentsStore();

// ─── State ───
const selectedType = ref('claude');
const baseUrl = ref('');
const apiKey = ref('');
const model = ref('');
const status = ref('');
const connStatus = ref('');
const testing = ref(false);
const selectedPresetIdx = ref(-1);
const showModelPicker = ref(false);
const modelSearch = ref('');

// Agent tabs
const appTypes = [
  { id: 'claude', label: 'Claude (梅)', glyph: '梅', color: '#d4577b' },
  { id: 'codex', label: 'Codex (兰)', glyph: '兰', color: '#6a994e' },
  { id: 'openclaw', label: 'OpenClaw (竹)', glyph: '竹', color: '#4caf50' },
  { id: 'hermes', label: 'Hermes (菊)', glyph: '菊', color: '#f0a830' },
];

// Track active provider per agent type
const activeProviders = reactive<Record<string, { name: string; model: string } | null>>({
  claude: null, codex: null, openclaw: null, hermes: null,
});

// 从 ProviderStore 获取供应商列表（替代旧的 PROVIDER_PRESETS）
const providerList = computed(() => providerStore.allProviders);

// 过滤后的模型列表
const filteredModels = computed(() => {
  const provider = providerStore.allProviders.find(p => p.id === selectedProviderId.value);
  if (!provider) return [];
  const models = providerStore.models.filter(m => m.provider_id === provider.id);
  if (!modelSearch.value) return models;
  const q = modelSearch.value.toLowerCase();
  return models.filter(m =>
    m.id.includes(q) || m.name.toLowerCase().includes(q) || m.aliases.some(a => a.includes(q))
  );
});

const selectedProviderId = ref('openai');

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
      activeProviders[t.id] = active ? { name: active.name, model: active.model || '' } : null;
    } catch { /* ignore */ }
  }
}

function detectPreset() {
  const idx = providerList.value.findIndex(p =>
    baseUrl.value.includes(p.base_url.replace('https://', '').replace('http://', ''))
  );
  selectedPresetIdx.value = idx;
  if (idx >= 0) selectedProviderId.value = providerList.value[idx].id;
}

function selectProvider(id: string) {
  selectedProviderId.value = id;
  const provider = providerStore.allProviders.find(p => p.id === id);
  if (provider) {
    baseUrl.value = provider.base_url;
    // 选择该供应商的第一个模型
    const firstModel = providerStore.models.find(m => m.provider_id === id);
    if (firstModel) model.value = firstModel.id;
  }
}

function selectModel(modelId: string) {
  model.value = modelId;
  showModelPicker.value = false;
}

// 别名快速切换
function onModelInput(e: Event) {
  const val = (e.target as HTMLInputElement).value;
  model.value = val;
  // 尝试别名解析
  const resolved = providerStore.resolveAlias(val);
  if (resolved) {
    const provider = providerStore.allProviders.find(p => p.id === resolved.provider_id);
    if (provider) {
      baseUrl.value = provider.base_url;
      selectedProviderId.value = resolved.provider_id;
    }
    model.value = resolved.model_id;
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
    // Sync to provider store so ModelSelector updates
    providerStore.switchModel(model.value);
    providerStore.saveToStorage();
    setTimeout(() => status.value = '', 2000);
  } catch (e) {
    status.value = String(e);
  }
}

async function testConn() {
  if (!baseUrl.value) { connStatus.value = '请先填写地址'; return; }
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
.settings-desc { font-size: var(--text-sm); color: var(--silver); margin-bottom: 16px; }

.settings-section {
  margin-bottom: 20px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--border-light);
}

.section-title {
  font-family: var(--font-serif);
  font-size: var(--text-base);
  color: var(--bone-dim);
  margin-bottom: 12px;
  display: inline-flex; align-items: center; gap: 6px;
}
.section-icon { display: inline-flex; align-items: center; line-height: 1; }
.section-label { line-height: 1; }

/* Account info */
.account-info {
  display: flex; flex-direction: column; gap: 8px;
  padding: 12px; border-radius: 8px;
  background: var(--bg-surface); border: 1px solid var(--border-light);
}
.account-row {
  display: flex; justify-content: space-between; align-items: center;
  font-size: var(--text-sm);
}
.account-label { color: var(--silver); font-family: var(--font-body); }
.account-value { color: var(--bone); font-family: var(--font-body); }
.account-mono { font-family: var(--font-mono); font-size: .62rem; opacity: .8; }

.settings-tabs { display: flex; gap: 6px; margin-bottom: 16px; flex-wrap: wrap; }
.settings-tab {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 6px 14px; border-radius: 6px; border: 1px solid var(--border-light);
  background: transparent; color: var(--bone-dim); cursor: pointer; transition: all .2s;
  font-family: var(--font-body); font-size: var(--text-sm);
  position: relative;
}
.settings-tab:hover { border-color: var(--hairline-warm); color: var(--bone); }
.settings-tab.active { border-color: var(--tab-color, var(--jade)); color: var(--tab-color, var(--jade)); }
.tab-glyph {
  font-family: var(--font-brush); font-size: 1.2rem; line-height: 1;
  transform: translateY(1px); /* 微调毛笔字体基线 */
}
.tab-label { line-height: 1; }
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
.preset-section label { font-family: var(--font-mono); font-size: var(--text-xs); color: var(--silver); display: block; margin-bottom: 4px; }
.preset-selector select {
  width: 100%; padding: 6px 10px;
  background: var(--bg-surface); border: 1px solid var(--border-light);
  border-radius: 6px; color: var(--bone); font-family: var(--font-mono); font-size: var(--text-sm);
  outline: none; cursor: pointer;
}
.preset-selector select:focus { border-color: var(--border-accent); }
.preset-selector select option { background: var(--bg-primary); color: var(--bone); }

/* Provider grid */
.provider-grid {
  display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 8px;
}
.provider-chip {
  padding: 3px 8px; border: 1px solid var(--border-light); border-radius: 4px;
  background: transparent; color: var(--bone-dim); font-size: var(--text-xs); cursor: pointer;
  font-family: var(--font-mono); transition: all .15s;
}
.provider-chip:hover { border-color: var(--hairline-warm); color: var(--bone); }
.provider-chip.active { border-color: var(--jade); color: var(--jade); background: rgba(80, 200, 120, .08); }
.provider-chip.connected::after { content: ''; display: inline-block; width: 5px; height: 5px; border-radius: 50%; background: var(--jade); margin-left: 3px; }

/* Model search */
.model-search {
  width: 100%; padding: 4px 8px; margin-bottom: 6px;
  background: var(--bg-primary); border: 1px solid var(--border-light);
  border-radius: 4px; color: var(--bone); font-family: var(--font-mono); font-size: var(--text-xs);
  outline: none;
}
.model-search:focus { border-color: var(--border-accent); }

.preset-models { margin-top: 8px; }
.model-chips { display: flex; gap: 4px; flex-wrap: wrap; margin-top: 4px; }
.model-chip {
  padding: 3px 8px; border: 1px solid var(--border-light); border-radius: 4px;
  background: transparent; color: var(--bone-dim); font-size: var(--text-xs); cursor: pointer;
  font-family: var(--font-mono); transition: all .15s; display: flex; align-items: center; gap: 4px;
}
.model-chip:hover { border-color: var(--hairline-warm); color: var(--bone); }
.model-chip.active { border-color: var(--jade); color: var(--jade); background: rgba(80, 200, 120, .08); }
.model-alias { font-size: .5rem; opacity: .5; }
.model-more { font-size: .5rem; color: var(--silver); margin-top: 4px; display: block; }

/* Form */
.settings-form { display: flex; flex-direction: column; gap: 6px; margin-bottom: 16px; }
.settings-form label { font-family: var(--font-mono); font-size: var(--text-xs); color: var(--silver); }
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
