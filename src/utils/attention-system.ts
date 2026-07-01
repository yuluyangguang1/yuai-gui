/**
 * Attention System — 参考 Cotal attention modes
 * 控制 Agent 何时被唤醒/打断
 * 全局: open / dnd / focus
 * 每频道: quiet / muted
 */

// ══════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════

/** 全局注意力模式 */
export type AttentionMode = 'open' | 'dnd' | 'focus'

/** 每频道覆盖 */
export type ChannelOverride = 'normal' | 'quiet' | 'muted'

export interface AttentionState {
  /** 全局模式 */
  global: AttentionMode
  /** 每频道覆盖 (频道名 → 覆盖) */
  channel_overrides: Map<string, ChannelOverride>
  /** 最后更新时间 */
  updated_at: number
}

export interface WakeDecision {
  should_wake: boolean
  reason: string
  /** 消息是否被丢弃 (可召回) */
  dropped: boolean
  /** 被丢弃的消息 ID (用于召回) */
  dropped_message_id: string | null
}

// ══════════════════════════════════════════════
// Attention Manager
// ══════════════════════════════════════════════

export class AttentionManager {
  private maxAgents = 20
  private agents = new Map<string, AttentionState>()
  private droppedMessages: Array<{
    agent_id: string
    channel: string
    message_id: string
    content: string
    timestamp: number
  }> = []
  private maxDroppedHistory = 200

  /** 初始化 Agent 注意力状态 */
  initAgent(agentId: string, mode: AttentionMode = 'open'): void {
    this.agents.set(agentId, {
      global: mode,
      channel_overrides: new Map(),
      updated_at: Date.now(),
    })
  }

  /** 设置全局模式 */
  setGlobalMode(agentId: string, mode: AttentionMode): void {
    const state = this.agents.get(agentId)
    if (state) {
      state.global = mode
      state.updated_at = Date.now()
    }
  }

  /** 获取全局模式 */
  getGlobalMode(agentId: string): AttentionMode {
    return this.agents.get(agentId)?.global ?? 'open'
  }

  /** 设置每频道覆盖 */
  setChannelOverride(agentId: string, channel: string, override: ChannelOverride): void {
    const state = this.agents.get(agentId)
    if (state) {
      state.channel_overrides.set(channel, override)
      state.updated_at = Date.now()
    }
  }

  /** 获取每频道覆盖 */
  getChannelOverride(agentId: string, channel: string): ChannelOverride {
    return this.agents.get(agentId)?.channel_overrides.get(channel) ?? 'normal'
  }

  /** 清除每频道覆盖 */
  clearChannelOverride(agentId: string, channel: string): void {
    this.agents.get(agentId)?.channel_overrides.delete(channel)
  }

  /**
   * 判断消息是否应该唤醒 Agent
   * 核心决策逻辑
   */
  shouldWake(
    agentId: string,
    messageType: 'channel' | 'direct' | 'anycast' | 'system',
    channel?: string,
    messageId?: string,
    content?: string,
  ): WakeDecision {
    const state = this.agents.get(agentId)
    if (!state) return { should_wake: true, reason: 'no attention state', dropped: false, dropped_message_id: null }

    // 每频道覆盖优先
    if (channel) {
      const channelOverride = state.channel_overrides.get(channel)
      if (channelOverride === 'muted') {
        return { should_wake: false, reason: `channel ${channel} muted`, dropped: true, dropped_message_id: messageId ?? null }
      }
      if (channelOverride === 'quiet') {
        // quiet: 投递但不唤醒
        this.recordDropped(agentId, channel, messageId ?? '', content ?? '')
        return { should_wake: false, reason: `channel ${channel} quiet`, dropped: true, dropped_message_id: messageId ?? null }
      }
    }

    // 全局模式
    switch (state.global) {
      case 'open':
        return { should_wake: true, reason: 'open mode', dropped: false, dropped_message_id: null }

      case 'dnd':
        // dnd: 频道消息不唤醒, DM/工作唤醒
        if (messageType === 'channel') {
          this.recordDropped(agentId, channel ?? '', messageId ?? '', content ?? '')
          return { should_wake: false, reason: 'dnd: channel message deferred', dropped: true, dropped_message_id: messageId ?? null }
        }
        return { should_wake: true, reason: 'dnd: direct/work message', dropped: false, dropped_message_id: null }

      case 'focus':
        // focus: 仅 DM 和 anycast 唤醒
        if (messageType === 'direct' || messageType === 'anycast' || messageType === 'system') {
          return { should_wake: true, reason: `focus: ${messageType} passes`, dropped: false, dropped_message_id: null }
        }
        this.recordDropped(agentId, channel ?? '', messageId ?? '', content ?? '')
        return { should_wake: false, reason: 'focus: channel message blocked', dropped: true, dropped_message_id: messageId ?? null }
    }
  }

  /** 召回被丢弃的消息 (从 focus/dnd 切换回 open 时) */
  recallDropped(agentId: string, channel?: string): Array<{ channel: string; message_id: string; content: string; timestamp: number }> {
    const dropped = this.droppedMessages.filter(d =>
      d.agent_id === agentId && (channel ? d.channel === channel : true)
    )
    // 移除已召回的
    this.droppedMessages = this.droppedMessages.filter(d =>
      !(d.agent_id === agentId && (channel ? d.channel === channel : true))
    )
    return dropped
  }

  /** 获取 Agent 状态摘要 */
  getAgentSummary(agentId: string): {
    mode: AttentionMode
    channel_overrides: Record<string, ChannelOverride>
    dropped_count: number
  } {
    const state = this.agents.get(agentId)
    if (!state) return { mode: 'open', channel_overrides: {}, dropped_count: 0 }

    const overrides: Record<string, ChannelOverride> = {}
    state.channel_overrides.forEach((v, k) => { overrides[k] = v })

    return {
      mode: state.global,
      channel_overrides: overrides,
      dropped_count: this.droppedMessages.filter(d => d.agent_id === agentId).length,
    }
  }

  /** 获取所有 Agent 的注意力状态 */
  getAllSummaries(): Record<string, ReturnType<AttentionManager['getAgentSummary']>> {
    const result: Record<string, ReturnType<AttentionManager['getAgentSummary']>> = {}
    for (const agentId of this.agents.keys()) {
      result[agentId] = this.getAgentSummary(agentId)
    }
    return result
  }

  private recordDropped(agentId: string, channel: string, messageId: string, content: string): void {
    this.droppedMessages.push({
      agent_id: agentId,
      channel,
      message_id: messageId,
      content: content.slice(0, 500), // 截断保存
      timestamp: Date.now(),
    })
    if (this.droppedMessages.length > this.maxDroppedHistory) {
      this.droppedMessages = this.droppedMessages.slice(-this.maxDroppedHistory)
    }
  }
}

// ══════════════════════════════════════════════
// 预定义注意力配置
// ══════════════════════════════════════════════

export const ATTENTION_MODE_LABELS: Record<AttentionMode, string> = {
  open: '开放 — 接收所有消息',
  dnd: '勿扰 — 仅接收直接消息和工作',
  focus: '专注 — 仅接收直接消息和任务分配',
}

export const CHANNEL_OVERRIDE_LABELS: Record<ChannelOverride, string> = {
  normal: '正常',
  quiet: '静默 — 投递但不唤醒',
  muted: '屏蔽 — 完全停止',
}

export const ATTENTION_MODE_ICONS: Record<AttentionMode, string> = {
  open: 'bell',
  dnd: 'bellOff',
  focus: 'eye',
}

export const CHANNEL_OVERRIDE_ICONS: Record<ChannelOverride, string> = {
  normal: 'volume',
  quiet: 'volume2',
  muted: 'volumeOff',
}
