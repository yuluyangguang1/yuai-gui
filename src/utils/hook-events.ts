/**
 * Hook Event System — 参考 Nezha hooks.rs
 * 文件系统事件监控, 比 PTY 输出解析更可靠
 */

// ══════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════

export type HookEvent =
  | 'session_start'
  | 'session_end'
  | 'user_prompt'
  | 'agent_response'
  | 'tool_call'
  | 'tool_result'
  | 'notification'
  | 'input_required'
  | 'task_complete'
  | 'task_failed'
  | 'file_change'
  | 'git_commit'

export interface HookPayload {
  event: HookEvent
  task_id: string | null
  agent_id: string | null
  session_id: string | null
  data: Record<string, unknown>
  timestamp: number
}

export interface HookHandler {
  name: string
  event: HookEvent | '*'
  priority: number
  handler: (payload: HookPayload) => void | Promise<void>
}

// ══════════════════════════════════════════════
// Hook Manager
// ══════════════════════════════════════════════

export class HookManager {
  private handlers = new Map<string, HookHandler[]>()
  private history: HookPayload[] = []
  private maxHistory = 500

  /** 注册钩子 */
  register(handler: HookHandler): void {
    const key = handler.event
    if (!this.handlers.has(key)) {
      this.handlers.set(key, [])
    }
    const list = this.handlers.get(key)!
    // 按 priority 排序 (数字越小越先执行)
    list.push(handler)
    list.sort((a, b) => a.priority - b.priority)
  }

  /** 移除钩子 */
  unregister(name: string): void {
    for (const [key, handlers] of this.handlers.entries()) {
      this.handlers.set(key, handlers.filter(h => h.name !== name))
    }
  }

  /** 触发事件 */
  async emit(event: HookEvent, data: Record<string, unknown> = {}): Promise<void> {
    const payload: HookPayload = {
      event,
      task_id: typeof data.task_id === 'string' ? data.task_id : null,
      agent_id: typeof data.agent_id === 'string' ? data.agent_id : null,
      session_id: typeof data.session_id === 'string' ? data.session_id : null,
      data,
      timestamp: Date.now(),
    }

    // 记录历史
    this.history.push(payload)
    if (this.history.length > this.maxHistory) {
      this.history = this.history.slice(-this.maxHistory)
    }

    // 执行特定事件的处理器
    const specific = this.handlers.get(event) ?? []
    // 执行通配符处理器
    const wildcard = this.handlers.get('*') ?? []

    const all = [...specific, ...wildcard].sort((a, b) => a.priority - b.priority)

    for (const handler of all) {
      try {
        await handler.handler(payload)
      } catch (e) {
        console.warn(`[Hook] Handler ${handler.name} failed for ${event}:`, e)
      }
    }
  }

  /** 获取历史 */
  getHistory(event?: HookEvent): HookPayload[] {
    if (event) return this.history.filter(h => h.event === event)
    return [...this.history]
  }

  /** 获取最近的事件 */
  getRecent(count: number = 20): HookPayload[] {
    return this.history.slice(-count)
  }
}

// ══════════════════════════════════════════════
// 预定义钩子
// ══════════════════════════════════════════════

/** 日志钩子 */
export function createLoggingHook(): HookHandler {
  return {
    name: 'hook-logger',
    event: '*',
    priority: 1000,
    handler: (payload) => {
      console.log(`[Hook] ${payload.event} | task:${payload.task_id} | agent:${payload.agent_id}`)
    },
  }
}

/** 通知钩子 — input_required 时发送系统通知 */
export function createNotificationHook(): HookHandler {
  return {
    name: 'hook-notification',
    event: 'input_required',
    priority: 100,
    handler: (payload) => {
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('yuai — 需要你的输入', {
          body: `Agent ${payload.agent_id ?? '未知'} 需要你的确认`,
          icon: '/icon.png',
        })
      }
    },
  }
}

/** 任务自动完成钩子 */
export function createAutoCompleteHook(onComplete: (taskId: string) => void): HookHandler {
  return {
    name: 'hook-auto-complete',
    event: 'task_complete',
    priority: 100,
    handler: (payload) => {
      if (payload.task_id) {
        onComplete(payload.task_id)
      }
    },
  }
}
