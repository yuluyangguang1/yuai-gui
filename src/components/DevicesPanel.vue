<template>
  <div class="lan-panel">
    <header class="lan-header">
      <div>
        <div class="lan-title">设备</div>
        <div class="lan-subtitle">局域网内 yuai 设备</div>
      </div>
      <div class="lan-actions">
        <button v-if="!scanning" class="lan-btn lan-btn--primary" @click="onStart">
          启动扫描
        </button>
        <button v-else class="lan-btn lan-btn--danger" @click="onStop">
          停止扫描
        </button>
        <button class="lan-btn" :disabled="!scanning" @click="onRefresh">
          刷新列表
        </button>
      </div>
    </header>

    <section v-if="error" class="lan-error">
      {{ error }}
      <button class="lan-btn" @click="lanStore.refreshDevices()">重试</button>
    </section>

    <section class="lan-sections">
      <div class="lan-section">
        <div class="lan-section-header">在线</div>
        <DeviceList :items="lanStore.onlineDevices" @select="onSelect" />
      </div>
      <div class="lan-section">
        <div class="lan-section-header">已配对</div>
        <DeviceList :items="lanStore.pairedDevices" @select="onSelect" />
      </div>
      <div class="lan-section">
        <div class="lan-section-header">离线</div>
        <DeviceList :items="lanStore.offlineDevices" @select="onSelect" />
      </div>
    </section>

    <PairModal
      v-if="selectedDevice"
      :device="selectedDevice"
      :loading="lanStore.pairingTargetId === selectedDevice.device_id"
      @cancel="selectedDevice = null"
      @done="onPaired"
    />
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { useLanStore } from "@/stores/useLanStore";
import type { LanDevice } from "@/stores/useLanStore";
import DeviceList from "./LanDeviceList.vue";
import PairModal from "./LanPairModal.vue";

const lanStore = useLanStore();
const selectedDevice = ref<LanDevice | null>(null);

async function onStart() {
  await lanStore.startScan();
  await lanStore.refreshDevices();
}

async function onStop() {
  await lanStore.stopScan();
}

async function onRefresh() {
  await lanStore.refreshDevices();
}

async function onSelect(device: LanDevice) {
  selectedDevice.value = device;
}

async function onPaired() {
  selectedDevice.value = null;
  await lanStore.refreshDevices();
}
</script>

<style scoped>
.lan-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-secondary);
  color: var(--text-primary);
}

.lan-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border);
}

.lan-title {
  font-family: var(--font-brush);
  font-size: 1.4rem;
  color: var(--accent);
}

.lan-subtitle {
  font-size: 0.72rem;
  color: var(--text-muted);
  margin-top: 4px;
}

.lan-actions {
  display: flex;
  gap: 8px;
  align-items: center;
}

.lan-btn {
  appearance: none;
  border: 1px solid var(--border);
  background: var(--bg-tertiary);
  color: var(--text-primary);
  border-radius: var(--radius-sm, 8px);
  padding: 6px 12px;
  font-size: 0.75rem;
}

.lan-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.lan-btn--primary {
  background: var(--accent);
  color: #00140f;
  border-color: var(--accent);
}

.lan-btn--danger {
  background: var(--vermilion-glow, #c8442a);
  color: #fff;
  border-color: var(--vermilion-glow, #c8442a);
}

.lan-error {
  margin: 12px 18px;
  padding: 10px 12px;
  border-radius: var(--radius-sm, 8px);
  border: 1px solid var(--vermilion-glow, #c8442a);
  color: var(--vermilion-glow, #c8442a);
  background: rgba(200, 68, 42, 0.1);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 0.8rem;
}

.lan-sections {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  padding: 14px 18px;
}

.lan-section + .lan-section {
  border-left: 1px solid var(--border);
}

.lan-section-header {
  font-size: 0.7rem;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin-bottom: 8px;
}

@media (max-width: 860px) {
  .lan-sections {
    grid-template-columns: 1fr;
  }
  .lan-section + .lan-section {
    border-left: none;
    border-top: 1px solid var(--border);
  }
}
</style>
