/**
 * Terminal Buffer Manager — 参考 Nezha terminal 管理
 * 帧预算输出, 10MB 限制, snapshot/restore
 */

// ══════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════

export interface TerminalSnapshot {
  task_id: string
  buffer: string       // 终端输出内容
  cursor_row: number
  cursor_col: number
  scrollback: number
  saved_at: number
}

export interface TerminalBufferConfig {
  /** 每任务最大 buffer 大小 (bytes) */
  max_buffer_bytes: number
  /** 每帧最大输出 (bytes) — 避免 UI 卡顿 */
  frame_budget_bytes: number
  /** chunk 压缩阈值 — 超过此大小时压缩旧内容 */
  compress_threshold_bytes: number
  /** 压缩后保留的大小 */
  compress_retain_bytes: number
}

// ══════════════════════════════════════════════
// 默认配置
// ══════════════════════════════════════════════

export const DEFAULT_BUFFER_CONFIG: TerminalBufferConfig = {
  max_buffer_bytes: 10 * 1024 * 1024,     // 10MB
  frame_budget_bytes: 128 * 1024,          // 128KB/frame
  compress_threshold_bytes: 8 * 1024 * 1024, // 8MB
  compress_retain_bytes: 2 * 1024 * 1024,    // 2MB
}

// ══════════════════════════════════════════════
// Terminal Buffer Manager
// ══════════════════════════════════════════════

export class TerminalBufferManager {
  private buffers = new Map<string, string[]>() // taskId → output chunks
  private snapshots = new Map<string, TerminalSnapshot>()
  private config: TerminalBufferConfig
  private totalBytes = new Map<string, number>()

  constructor(config: Partial<TerminalBufferConfig> = {}) {
    this.config = { ...DEFAULT_BUFFER_CONFIG, ...config }
  }

  /** 写入输出 (帧预算控制) */
  write(taskId: string, data: string): string {
    const bytes = new TextEncoder().encode(data).byteLength
    const currentTotal = this.totalBytes.get(taskId) ?? 0

    // 检查是否需要压缩
    if (currentTotal + bytes > this.config.compress_threshold_bytes) {
      this.compress(taskId)
    }

    // 帧预算截断
    let output = data
    if (bytes > this.config.frame_budget_bytes) {
      // 保留头尾, 中间截断
      const head = data.slice(0, this.config.frame_budget_bytes / 2)
      const tail = data.slice(-this.config.frame_budget_bytes / 2)
      output = head + '\n... [输出截断, 完整内容已保存] ...\n' + tail
    }

    // 写入 buffer
    if (!this.buffers.has(taskId)) {
      this.buffers.set(taskId, [])
    }
    this.buffers.get(taskId)!.push(output)
    this.totalBytes.set(taskId, currentTotal + new TextEncoder().encode(output).byteLength)

    return output
  }

  /** 读取完整 buffer */
  read(taskId: string): string {
    return (this.buffers.get(taskId) ?? []).join('')
  }

  /** 读取最后 N 行 */
  readTail(taskId: string, lines: number = 100): string {
    const full = this.read(taskId)
    const allLines = full.split('\n')
    return allLines.slice(-lines).join('\n')
  }

  /** 压缩 buffer — 保留头部和尾部 */
  private compress(taskId: string): void {
    const chunks = this.buffers.get(taskId)
    if (!chunks) return

    const full = chunks.join('')
    const retainChars = this.config.compress_retain_bytes

    // 保留尾部
    const tail = full.slice(-retainChars)
    this.buffers.set(taskId, ['[... 历史输出已压缩 ...]\n', tail])
    this.totalBytes.set(taskId, new TextEncoder().encode(tail).byteLength)
  }

  /** Snapshot — 保存终端状态 (切换任务时) */
  snapshot(taskId: string): TerminalSnapshot {
    const snapshot: TerminalSnapshot = {
      task_id: taskId,
      buffer: this.read(taskId),
      cursor_row: 0,
      cursor_col: 0,
      scrollback: 0,
      saved_at: Date.now(),
    }
    this.snapshots.set(taskId, snapshot)
    return snapshot
  }

  /** Restore — 恢复终端状态 (切回任务时) */
  restore(taskId: string): TerminalSnapshot | null {
    return this.snapshots.get(taskId) ?? null
  }

  /** 清除 buffer */
  clear(taskId: string): void {
    this.buffers.delete(taskId)
    this.totalBytes.delete(taskId)
    this.snapshots.delete(taskId)
  }

  /** 获取 buffer 统计 */
  getStats(taskId: string): { bytes: number; chunks: number; compressed: boolean } {
    const bytes = this.totalBytes.get(taskId) ?? 0
    const chunks = this.buffers.get(taskId)?.length ?? 0
    return {
      bytes,
      chunks,
      compressed: bytes > this.config.compress_threshold_bytes,
    }
  }

  /** 获取所有活跃 buffer 的任务 ID */
  getActiveTaskIds(): string[] {
    return Array.from(this.buffers.keys())
  }
}

// ══════════════════════════════════════════════
// 帧预算输出调度器
// ══════════════════════════════════════════════

export class FrameBudgetDrainer {
  private queue: Array<{ taskId: string; data: string }> = []
  private draining = false
  private onOutput: (taskId: string, data: string) => void
  private budgetBytes: number

  constructor(
    onOutput: (taskId: string, data: string) => void,
    budgetBytes: number = 128 * 1024,
  ) {
    this.onOutput = onOutput
    this.budgetBytes = budgetBytes
  }

  /** 入队输出 */
  enqueue(taskId: string, data: string): void {
    this.queue.push({ taskId, data })
    if (!this.draining) {
      this.drain()
    }
  }

  /** 帧预算排空 */
  private drain(): void {
    this.draining = true
    const startTime = performance.now()
    let totalBytes = 0

    while (this.queue.length > 0) {
      const item = this.queue.shift()!
      const bytes = new TextEncoder().encode(item.data).byteLength

      if (totalBytes + bytes > this.budgetBytes) {
        // 超出帧预算, 下一帧继续
        this.queue.unshift(item)
        requestAnimationFrame(() => this.drain())
        return
      }

      totalBytes += bytes
      this.onOutput(item.taskId, item.data)
    }

    this.draining = false
  }

  /** 获取队列长度 */
  get queueLength(): number {
    return this.queue.length
  }
}
