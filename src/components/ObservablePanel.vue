<template>
  <div class="observable-panel">
    <div class="observable-header">
      <TIcon name="chartBar" :size="16" />
      <span>Agent 监控</span>
      <button class="observable-refresh" @click="refresh">
        <TIcon name="refresh" :size="14" />
      </button>
    </div>

    <div class="observable-grid">
      <!-- Agent 状态卡片 -->
      <div class="observable-card" v-for="agent in agents" :key="agent.id">
        <div class="card-header">
          <div class="agent-indicator" :style="{ background: agent.color }"></div>
          <span class="agent-name">{{ agent.chinese_name }}</span>
          <span class="agent-state" :class="agent.state">{{ stateLabel(agent.state) }}</span>
        </div>
        <div class="card-stats">
          <div class="stat-item">
            <TIcon name="message" :size="12" />
            <span class="stat-value">{{ agent.messageCount }}</span>
            <span class="stat-label">消息</span>
          </div>
          <div class="stat-item">
            <TIcon name="clock" :size="12" />
            <span class="stat-value">{{ formatDuration(agent.totalDuration) }}</span>
            <span class="stat-label">时长</span>
          </div>
          <div class="stat-item">
            <TIcon name="cpu" :size="12" />
            <span class="stat-value">{{ agent.tokenCount }}</span>
            <span class="stat-label">Token</span>
          </div>
        </div>
        <div class="card-progress" v-if="agent.state === 'running'">
          <div class="progress-bar">
            <div class="progress-fill" :style="{ width: agent.progress + '%' }"></div>
          </div>
        </div>
      </div>
    </div>

    <!-- 总体统计 -->
    <div class="observable-summary">
      <div class="summary-item">
        <span class="summary-label">总消息</span>
        <span class="summary-value">{{ totalMessages }}</span>
      </div>
      <div class="summary-item">
        <span class="summary-label">总 Token</span>
        <span class="summary-value">{{ totalTokens }}</span>
      </div>
      <div class="summary-item">
        <span class="summary-label">运行中</span>
        <span class="summary-value">{{ runningCount }}</span>
      </div>
      <div class="summary-item">
        <span class="summary-label">错误</span>
        <span class="summary-value error">{{ errorCount }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { TIcon } from '../utils/icons'
import { useAgentsStore } from '../stores/agents'
import { useUsageStore } from '../stores/usage'
import type { AgentState } from '../utils/agent-state-machine'

const agentsStore = useAgentsStore()
const usageStore = useUsageStore()

const agents = computed(() => {
  return agentsStore.agents.map(agent => {
    const session = agentsStore.sessions.get(agent.id)
    const messages = session?.messages ?? []
    const messageCount = messages.length
    // Estimate tokens from message content (chars / 4)
    const tokenCount = messages.reduce((sum, m) => sum + Math.ceil(m.content.length / 4), 0)
    // Duration: time span from first to last message
    const totalDuration = messages.length >= 2
      ? messages[messages.length - 1].timestamp - messages[0].timestamp
      : 0
    return {
      ...agent,
      state: (agent.status || 'idle') as AgentState,
      messageCount,
      totalDuration,
      tokenCount,
      progress: agent.status === 'running' ? undefined : 0,
    }
  })
})

const totalMessages = computed(() => agents.value.reduce((sum, a) => sum + a.messageCount, 0))
const totalTokens = computed(() => {
  // Use usage store total if available, otherwise sum from agents
  const tracked = usageStore.totalTokens
  return tracked > 0 ? tracked : agents.value.reduce((sum, a) => sum + a.tokenCount, 0)
})
const runningCount = computed(() => agents.value.filter(a => a.state === 'running').length)
const errorCount = computed(() => agents.value.filter(a => a.state === 'error').length)

function stateLabel(state: AgentState): string {
  const labels: Record<string, string> = {
    idle: '空闲',
    running: '运行中',
    waiting_tool: '等待工具',
    completed: '已完成',
    failed: '失败',
    paused: '暂停',
    cancelled: '已取消',
  }
  return labels[state] ?? state
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${Math.floor(ms / 1000)}s`
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`
}

function refresh() {
  usageStore.fetchStats()
}
</script>

<style scoped>
.observable-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
  height: 100%;
  overflow-y: auto;
}

.observable-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--text-primary);
}

.observable-refresh {
  margin-left: auto;
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
}

.observable-refresh:hover {
  color: var(--text-primary);
}

.observable-grid {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.observable-card {
  background: var(--bg-surface);
  border: 1px solid var(--border-light);
  border-radius: 8px;
  padding: 12px;
}

.card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.agent-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.agent-name {
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--text-primary);
}

.agent-state {
  margin-left: auto;
  font-size: var(--text-xs);
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--bg-primary);
  color: var(--text-muted);
}

.agent-state.running {
  background: rgba(92, 207, 184, 0.15);
  color: var(--accent);
}

.agent-state.failed {
  background: rgba(239, 68, 68, 0.15);
  color: var(--error);
}

.agent-state.completed {
  background: rgba(52, 211, 153, 0.15);
  color: var(--success);
}

.card-stats {
  display: flex;
  gap: 12px;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--text-muted);
}

.stat-value {
  font-weight: 500;
  color: var(--text-primary);
  font-family: var(--font-mono);
}

.stat-label {
  font-size: var(--text-xs);
}

.card-progress {
  margin-top: 8px;
}

.progress-bar {
  height: 4px;
  background: var(--bg-primary);
  border-radius: 2px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--accent);
  border-radius: 2px;
  transition: width 0.3s ease;
}

.observable-summary {
  display: flex;
  gap: 16px;
  padding: 12px;
  background: var(--bg-surface);
  border: 1px solid var(--border-light);
  border-radius: 8px;
}

.summary-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.summary-label {
  font-size: var(--text-xs);
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.summary-value {
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--text-primary);
  font-family: var(--font-mono);
}

.summary-value.error {
  color: var(--error);
}
</style>
