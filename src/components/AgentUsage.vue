<template>
  <div class="agent-usage" v-if="hasUsage || loading">
    <div class="agent-usage-header" @click="showPopup = !showPopup">
      <span class="agent-usage-icon">📊</span>
      <span class="agent-usage-label">Token 用量</span>
    </div>

    <Teleport to="body">
      <div v-if="showPopup" class="agent-usage-overlay" @click.self="showPopup = false">
        <div class="agent-usage-popup">
          <div class="agent-usage-popup-title">Agent Token 用量统计</div>

          <div v-if="loading" class="agent-usage-loading">加载中...</div>

          <template v-else>
            <!-- Usage bars -->
            <div class="agent-usage-section">
              <div class="agent-usage-period">
                <span class="agent-usage-period-label">最近 5 小时</span>
                <span class="agent-usage-period-cost">${{ last5h.costEstimate.toFixed(4) }}</span>
              </div>
              <div class="usage-bar-container">
                <div class="usage-bar">
                  <div class="usage-bar-fill input" :style="{ width: barWidth(last5h, 'input') }" />
                  <div class="usage-bar-fill output" :style="{ width: barWidth(last5h, 'output') }" />
                </div>
              </div>
              <div class="usage-numbers">
                <span>入 {{ formatTokens(last5h.inputTokens) }}</span>
                <span>出 {{ formatTokens(last5h.outputTokens) }}</span>
              </div>
            </div>

            <div class="agent-usage-section">
              <div class="agent-usage-period">
                <span class="agent-usage-period-label">今天</span>
                <span class="agent-usage-period-cost">${{ today.costEstimate.toFixed(4) }}</span>
              </div>
              <div class="usage-bar-container">
                <div class="usage-bar">
                  <div class="usage-bar-fill input" :style="{ width: barWidth(today, 'input') }" />
                  <div class="usage-bar-fill output" :style="{ width: barWidth(today, 'output') }" />
                </div>
              </div>
              <div class="usage-numbers">
                <span>入 {{ formatTokens(today.inputTokens) }}</span>
                <span>出 {{ formatTokens(today.outputTokens) }}</span>
              </div>
            </div>

            <div class="agent-usage-section">
              <div class="agent-usage-period">
                <span class="agent-usage-period-label">本周</span>
                <span class="agent-usage-period-cost">${{ week.costEstimate.toFixed(4) }}</span>
              </div>
              <div class="usage-bar-container">
                <div class="usage-bar">
                  <div class="usage-bar-fill input" :style="{ width: barWidth(week, 'input') }" />
                  <div class="usage-bar-fill output" :style="{ width: barWidth(week, 'output') }" />
                </div>
              </div>
              <div class="usage-numbers">
                <span>入 {{ formatTokens(week.inputTokens) }}</span>
                <span>出 {{ formatTokens(week.outputTokens) }}</span>
              </div>
            </div>

            <!-- Cache stats -->
            <div class="agent-usage-cache" v-if="week.cacheCreation > 0 || week.cacheRead > 0">
              <span>缓存写入: {{ formatTokens(week.cacheCreation) }}</span>
              <span>缓存读取: {{ formatTokens(week.cacheRead) }}</span>
            </div>
          </template>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { useAgentUsage, type UsageStats } from "../composables/useAgentUsage";

const { last5h, today, week, loading } = useAgentUsage();
const showPopup = ref(false);

const hasUsage = computed(
  () =>
    last5h.value.inputTokens > 0 ||
    today.value.inputTokens > 0 ||
    week.value.inputTokens > 0
);

/** Max tokens for bar scaling */
const maxTokens = computed(() => {
  return Math.max(
    last5h.value.inputTokens + last5h.value.outputTokens,
    today.value.inputTokens + today.value.outputTokens,
    week.value.inputTokens + week.value.outputTokens,
    1
  );
});

function barWidth(stats: UsageStats, type: "input" | "output"): string {
  const total = stats.inputTokens + stats.outputTokens;
  if (total === 0) return "0%";
  const value = type === "input" ? stats.inputTokens : stats.outputTokens;
  return `${(value / maxTokens.value) * 100}%`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}
</script>
