<template>
  <div class="hw-panel">
    <div class="hw-header">
      <span class="hw-title">系统信息</span>
      <button class="hw-refresh" @click="refresh" :disabled="hw.detecting">
        ↻ 刷新
      </button>
    </div>

    <div v-if="!hw.detected" class="hw-empty">
      <button class="hw-detect-btn" @click="hw.detect()" :disabled="hw.detecting">
        {{ hw.detecting ? '检测中...' : '检测硬件' }}
      </button>
    </div>

    <template v-else>
      <!-- GPU -->
      <div class="hw-section">
        <div class="hw-section-header">
          <span class="hw-icon">🎮</span>
          <span class="hw-section-title">GPU</span>
        </div>
        <div class="hw-row">
          <span class="hw-label">名称</span>
          <span class="hw-value" :title="hw.gpu.renderer">{{ hw.gpuName }}</span>
        </div>
        <div class="hw-row" v-if="hw.gpu.vendor">
          <span class="hw-label">厂商</span>
          <span class="hw-value">{{ hw.gpu.vendor }}</span>
        </div>
      </div>

      <!-- CPU -->
      <div class="hw-section">
        <div class="hw-section-header">
          <span class="hw-icon">⚡</span>
          <span class="hw-section-title">CPU</span>
        </div>
        <div class="hw-row">
          <span class="hw-label">核心数</span>
          <span class="hw-value">{{ hw.cpuDisplay }}</span>
        </div>
        <div class="hw-bar-track" v-if="hw.cpuCores > 0">
          <div
            class="hw-bar-fill hw-bar-cpu"
            :style="{ width: cpuBarWidth }"
          />
        </div>
      </div>

      <!-- RAM -->
      <div class="hw-section">
        <div class="hw-section-header">
          <span class="hw-icon">💾</span>
          <span class="hw-section-title">内存</span>
        </div>
        <div class="hw-row">
          <span class="hw-label">容量</span>
          <span class="hw-value">{{ hw.ramDisplay }}</span>
        </div>
        <div class="hw-bar-track" v-if="hw.ramGB > 0">
          <div
            class="hw-bar-fill hw-bar-ram"
            :style="{ width: ramBarWidth }"
          />
        </div>
      </div>

      <!-- Model Compatibility (inspired by CanIRun.ai) -->
      <div class="hw-section">
        <div class="hw-section-header">
          <span class="hw-icon">🤖</span>
          <span class="hw-section-title">模型兼容性</span>
        </div>
        <div class="hw-compat-grid">
          <div
            v-for="model in modelCompat"
            :key="model.name"
            class="hw-compat-item"
            :class="model.status"
          >
            <span class="hw-compat-icon">{{ model.icon }}</span>
            <span class="hw-compat-name">{{ model.name }}</span>
            <span class="hw-compat-verdict">{{ model.verdict }}</span>
          </div>
        </div>
      </div>

      <!-- Browser Info -->
      <div class="hw-section">
        <div class="hw-section-header">
          <span class="hw-icon">🌐</span>
          <span class="hw-section-title">浏览器</span>
        </div>
        <div class="hw-row">
          <span class="hw-label">User Agent</span>
          <span class="hw-value hw-ua">{{ ua }}</span>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useHardwareStore } from "../stores/hardware";

const hw = useHardwareStore();

onMounted(() => {
  hw.detect();
});

function refresh() {
  hw.detected = false;
  hw.detecting = false;
  hw.gpu = { vendor: "", renderer: "", name: "" };
  hw.cpuCores = 0;
  hw.ramGB = 0;
  hw.detect();
}

const cpuBarWidth = computed(() => {
  // Scale: 1-32 cores, show as percentage
  return `${Math.min(100, (hw.cpuCores / 32) * 100)}%`;
});

const ramBarWidth = computed(() => {
  // Scale: 1-128 GB, show as percentage
  return `${Math.min(100, (hw.ramGB / 128) * 100)}%`;
});

const ua = computed(() =>
  typeof navigator !== "undefined" ? navigator.userAgent : ""
);

interface ModelCompat {
  name: string;
  icon: string;
  status: "ok" | "maybe" | "no";
  verdict: string;
}

const modelCompat = computed<ModelCompat[]>(() => {
  const cores = hw.cpuCores;
  const ram = hw.ramGB;
  const gpu = hw.gpuName.toLowerCase();

  const isAppleSilicon = gpu.includes("apple") || gpu.includes("m1") || gpu.includes("m2") || gpu.includes("m3") || gpu.includes("m4");
  const isNvidia = gpu.includes("nvidia") || gpu.includes("geforce") || gpu.includes("rtx") || gpu.includes("gtx");
  const isAmd = gpu.includes("amd") || gpu.includes("radeon");
  const hasDiscreteGpu = isNvidia || isAmd || isAppleSilicon;

  const models: ModelCompat[] = [];

  // Small models (1-3B) - can run on most hardware
  models.push({
    name: "Qwen 0.5B / Phi-3 mini",
    icon: "✓",
    status: cores >= 2 ? "ok" : "maybe",
    verdict: cores >= 2 ? "可运行" : "可能卡顿",
  });

  // Medium models (7-8B)
  models.push({
    name: "Llama 3.1 8B / Qwen 7B",
    icon: ram >= 8 ? "✓" : ram >= 4 ? "△" : "✕",
    status: ram >= 8 ? "ok" : ram >= 4 ? "maybe" : "no",
    verdict: ram >= 16 ? "流畅" : ram >= 8 ? "可用" : ram >= 4 ? "勉强" : "内存不足",
  });

  // Large models (13-14B)
  models.push({
    name: "Llama 13B / Qwen 14B",
    icon: ram >= 16 ? "✓" : ram >= 8 ? "△" : "✕",
    status: ram >= 16 ? "ok" : ram >= 8 ? "maybe" : "no",
    verdict: ram >= 32 ? "流畅" : ram >= 16 ? "可用" : ram >= 8 ? "勉强" : "内存不足",
  });

  // Very large models (70B)
  models.push({
    name: "Llama 70B / Qwen 72B",
    icon: ram >= 64 ? "✓" : ram >= 32 ? "△" : "✕",
    status: ram >= 64 ? "ok" : ram >= 32 ? "maybe" : "no",
    verdict: ram >= 64 ? "可用" : ram >= 32 ? "需量化" : "内存不足",
  });

  // Image generation (Stable Diffusion)
  models.push({
    name: "Stable Diffusion",
    icon: hasDiscreteGpu ? "✓" : isAppleSilicon ? "✓" : "△",
    status: hasDiscreteGpu || isAppleSilicon ? "ok" : "maybe",
    verdict: hasDiscreteGpu ? "GPU加速" : isAppleSilicon ? "MPS加速" : "CPU模式(慢)",
  });

  return models;
});
</script>

<style scoped>
.hw-panel {
  padding: 12px;
  height: 100%;
  overflow-y: auto;
  font-size: 12px;
  color: var(--silver, #aaa);
}

.hw-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.hw-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--ink, #d4d4d4);
  letter-spacing: 0.05em;
}

.hw-refresh {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  color: var(--silver, #aaa);
  padding: 4px 10px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
  transition: background 0.15s;
}

.hw-refresh:hover {
  background: rgba(255, 255, 255, 0.08);
}

.hw-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 0;
  gap: 12px;
}

.hw-detect-btn {
  background: rgba(92, 207, 184, 0.12);
  border: 1px solid rgba(92, 207, 184, 0.25);
  color: var(--jade, #5ccfb8);
  padding: 10px 24px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.15s;
}

.hw-detect-btn:hover {
  background: rgba(92, 207, 184, 0.2);
}

.hw-detect-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.hw-section {
  margin-bottom: 16px;
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 6px;
}

.hw-section-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}

.hw-icon {
  font-size: 14px;
}

.hw-section-title {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted, #888);
  font-weight: 600;
}

.hw-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 3px 0;
}

.hw-label {
  font-size: 11px;
  color: var(--text-muted, #666);
  flex-shrink: 0;
}

.hw-value {
  font-size: 12px;
  color: var(--ink, #d4d4d4);
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 260px;
}

.hw-ua {
  font-size: 10px;
  max-width: 200px;
  word-break: break-all;
  white-space: normal;
  line-height: 1.3;
}

.hw-bar-track {
  height: 4px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 2px;
  margin-top: 6px;
  overflow: hidden;
}

.hw-bar-fill {
  height: 100%;
  border-radius: 2px;
  transition: width 0.6s var(--ease-spring-normal);
}

.hw-bar-cpu {
  background: linear-gradient(90deg, #5ccfb8, #a064ff);
}

.hw-bar-ram {
  background: linear-gradient(90deg, #5ccfb8, #e0b0ff);
}

.hw-compat-grid {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.hw-compat-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 4px;
  font-size: 11px;
}

.hw-compat-item.ok {
  background: rgba(92, 207, 184, 0.08);
  border: 1px solid rgba(92, 207, 184, 0.15);
}

.hw-compat-item.maybe {
  background: rgba(224, 176, 255, 0.08);
  border: 1px solid rgba(224, 176, 255, 0.15);
}

.hw-compat-item.no {
  background: rgba(255, 100, 100, 0.08);
  border: 1px solid rgba(255, 100, 100, 0.15);
}

.hw-compat-icon {
  font-size: 12px;
  flex-shrink: 0;
}

.hw-compat-item.ok .hw-compat-icon {
  color: var(--jade, #5ccfb8);
}

.hw-compat-item.maybe .hw-compat-icon {
  color: var(--gold, #e0b0ff);
}

.hw-compat-item.no .hw-compat-icon {
  color: #ff6464;
}

.hw-compat-name {
  flex: 1;
  color: var(--ink, #d4d4d4);
}

.hw-compat-verdict {
  font-size: 10px;
  color: var(--text-muted, #888);
  text-align: right;
}
</style>
