<template>
  <div class="provider-switcher" ref="containerRef">
    <!-- Trigger Button -->
    <button
      class="switcher-trigger"
      @click="toggleDropdown"
      :title="`Current: ${currentProvider?.name ?? 'None'}`"
    >
      <span class="trigger-icon"><TIcon name="bolt" :size="14" /></span>
      <span class="trigger-name">{{ currentProvider?.name ?? 'Select Provider' }}</span>
      <span class="trigger-status" :class="currentProvider?.status ?? 'unknown'"></span>
      <TIcon name="chevronDown" :size="14" :class="{ open: isOpen }" />
    </button>

    <!-- Dropdown -->
    <div v-if="isOpen" class="switcher-dropdown">
      <div class="dropdown-header">
        <span class="dropdown-title">Providers</span>
        <button class="test-btn" @click.stop="testAllConnectivity" :disabled="testing">
          {{ testing ? 'Testing...' : 'Test All' }}
        </button>
      </div>

      <div
        v-for="provider in activeProviders"
        :key="provider.id"
        class="provider-item"
        :class="{
          active: provider.id === currentId,
          connected: provider.status === 'connected',
          error: provider.status === 'error',
        }"
        @click="switchProvider(provider.id)"
      >
        <span class="provider-icon">{{ provider.icon }}</span>
        <div class="provider-info">
          <span class="provider-name">{{ provider.name }}</span>
          <span class="provider-model">{{ provider.model }}</span>
        </div>
        <div class="provider-right">
          <span
            class="status-dot"
            :class="provider.status"
            :title="statusLabel(provider.status)"
          ></span>
          <button
            class="test-single-btn"
            @click.stop="testProvider(provider.id)"
            title="Test connectivity"
          ><TIcon name="link" :size="14" /></button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { TIcon } from "../utils/icons";
import { useProviderStore } from '../stores/provider';

const providerStore = useProviderStore();

export type ProviderStatus = 'connected' | 'error' | 'unknown';

export interface Provider {
  id: string;
  name: string;
  icon: string;
  model: string;
  baseUrl: string;
  status: ProviderStatus;
}

const props = defineProps<{
  /** Override providers list (optional, uses store if not provided) */
  providers?: Provider[];
  /** Currently active provider ID (optional, uses store if not provided) */
  currentProviderId?: string;
}>();

const emit = defineEmits<{
  (e: 'switch', providerId: string): void;
  (e: 'test', providerId: string): void;
  (e: 'testAll'): void;
}>();

const isOpen = ref(false);
const testing = ref(false);
const containerRef = ref<HTMLElement | null>(null);

// 优先使用 props，否则从 store 获取
const activeProviders = computed(() => {
  if (props.providers) return props.providers;
  return providerStore.allProviders.map(p => ({
    id: p.id,
    name: p.name,
    icon: '',
    model: providerStore.models.find(m => m.provider_id === p.id)?.name ?? '',
    baseUrl: p.base_url,
    status: (p.status === 'testing' ? 'unknown' : p.status) as ProviderStatus,
  }));
});

const currentId = computed(() =>
  props.currentProviderId ?? providerStore.activeProviderId
);

const currentProvider = computed(() =>
  activeProviders.value.find(p => p.id === currentId.value) ?? null
);

function toggleDropdown() {
  isOpen.value = !isOpen.value;
}

function switchProvider(providerId: string) {
  if (props.providers) {
    emit('switch', providerId);
  } else {
    providerStore.switchProvider(providerId);
  }
  isOpen.value = false;
}

function testProvider(providerId: string) {
  if (props.providers) {
    emit('test', providerId);
  } else {
    providerStore.testProvider(providerId);
  }
}

async function testAllConnectivity() {
  testing.value = true;
  if (props.providers) {
    emit('testAll');
  } else {
    await providerStore.testAllProviders();
  }
  setTimeout(() => { testing.value = false; }, 3000);
}

function statusLabel(status: ProviderStatus): string {
  switch (status) {
    case 'connected': return '已连接';
    case 'error': return '连接失败';
    case 'unknown': return '未知';
  }
}

function handleClickOutside(e: MouseEvent) {
  if (containerRef.value && !containerRef.value.contains(e.target as Node)) {
    isOpen.value = false;
  }
}

onMounted(() => { document.addEventListener('click', handleClickOutside); });
onUnmounted(() => { document.removeEventListener('click', handleClickOutside); });
</script>

<style scoped>
.provider-switcher {
  position: relative;
  display: inline-block;
}

.switcher-trigger {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: var(--bg-surface, #1e1e1e);
  border: 1px solid var(--border, #333);
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text-primary, #eee);
  transition: border-color 0.15s, background 0.15s;
  min-width: 160px;
}

.switcher-trigger:hover {
  border-color: var(--accent, var(--accent));
  background: var(--bg-hover, #252525);
}

.trigger-icon {
  font-size: 16px;
}

.trigger-name {
  flex: 1;
  text-align: left;
}

.trigger-status {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.trigger-status.connected { background: var(--accent); }
.trigger-status.error { background: var(--error); }
.trigger-status.unknown { background: #888; }

.trigger-arrow {
  font-size: 10px;
  transition: transform 0.2s;
}

.trigger-arrow.open {
  transform: rotate(180deg);
}

.switcher-dropdown {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  min-width: 240px;
  background: var(--bg-surface, #1e1e1e);
  border: 1px solid var(--border, #333);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
  z-index: 1000;
  overflow: hidden;
}

.dropdown-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border, #333);
}

.dropdown-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted, #888);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.test-btn {
  padding: 2px 8px;
  font-size: 11px;
  background: rgba(80, 200, 120, 0.1);
  border: 1px solid rgba(80, 200, 120, 0.3);
  border-radius: 4px;
  color: var(--accent);
  cursor: pointer;
  transition: all 0.15s;
}

.test-btn:hover {
  background: rgba(80, 200, 120, 0.2);
}

.test-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.provider-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  cursor: pointer;
  transition: background 0.15s;
}

.provider-item:hover {
  background: var(--bg-hover, #252525);
}

.provider-item.active {
  background: rgba(80, 200, 120, 0.08);
  border-left: 3px solid var(--accent, var(--accent));
}

.provider-icon {
  font-size: 18px;
  width: 24px;
  text-align: center;
}

.provider-info {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.provider-name {
  font-size: 13px;
  font-weight: 500;
}

.provider-model {
  font-size: 11px;
  color: var(--text-muted, #888);
}

.provider-right {
  display: flex;
  align-items: center;
  gap: 6px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.status-dot.connected { background: var(--accent); }
.status-dot.error { background: var(--error); }
.status-dot.unknown { background: #666; }

.test-single-btn {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 12px;
  opacity: 0;
  transition: opacity 0.15s;
}

.provider-item:hover .test-single-btn {
  opacity: 0.7;
}

.test-single-btn:hover {
  opacity: 1;
}
</style>
