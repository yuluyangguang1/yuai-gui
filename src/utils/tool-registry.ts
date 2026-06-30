/**
 * 工具注册表
 * 参考 Omnigent ToolManager + Orca Tool Registry
 * 统一管理 MCP 服务器和本地工具
 */

export interface ToolDefinition {
  name: string
  description: string
  category: 'file' | 'network' | 'database' | 'ai' | 'system' | 'custom'
  parameters: Record<string, ToolParameter>
  permissions?: string[]
  timeout?: number
  retryable?: boolean
}

export interface ToolParameter {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array'
  description: string
  required?: boolean
  default?: unknown
  enum?: unknown[]
}

export interface ToolResult {
  success: boolean
  data?: unknown
  error?: string
  duration?: number
}

export type ToolExecutor = (params: Record<string, unknown>) => Promise<ToolResult>

/**
 * 工具注册表
 * 管理所有可用工具，提供统一的调用接口
 */
export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map()
  private executors: Map<string, ToolExecutor> = new Map()

  /** 注册工具 */
  register(tool: ToolDefinition, executor: ToolExecutor): void {
    this.tools.set(tool.name, tool)
    this.executors.set(tool.name, executor)
  }

  /** 注销工具 */
  unregister(name: string): void {
    this.tools.delete(name)
    this.executors.delete(name)
  }

  /** 获取工具定义 */
  getDefinition(name: string): ToolDefinition | undefined {
    return this.tools.get(name)
  }

  /** 获取所有工具定义 */
  getAllDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values())
  }

  /** 按类别获取工具 */
  getByCategory(category: string): ToolDefinition[] {
    return Array.from(this.tools.values()).filter(t => t.category === category)
  }

  /** 检查工具是否存在 */
  has(name: string): boolean {
    return this.tools.has(name)
  }

  /** 执行工具 */
  async execute(name: string, params: Record<string, unknown>): Promise<ToolResult> {
    const tool = this.tools.get(name)
    const executor = this.executors.get(name)

    if (!tool || !executor) {
      return { success: false, error: `Tool not found: ${name}` }
    }

    // 参数验证
    const validation = this.validateParams(tool, params)
    if (!validation.valid) {
      return { success: false, error: `Invalid parameters: ${validation.errors.join(', ')}` }
    }

    // 执行（带超时）
    const timeout = tool.timeout ?? 30000
    const startTime = Date.now()

    try {
      const result = await Promise.race([
        executor(params),
        new Promise<ToolResult>((_, reject) =>
          setTimeout(() => reject(new Error('Tool execution timeout')), timeout)
        ),
      ])

      return {
        ...result,
        duration: Date.now() - startTime,
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime,
      }
    }
  }

  /** 验证参数 */
  private validateParams(tool: ToolDefinition, params: Record<string, unknown>): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    for (const [name, param] of Object.entries(tool.parameters)) {
      if (param.required && !(name in params)) {
        errors.push(`Missing required parameter: ${name}`)
      }

      if (name in params) {
        const value = params[name]
        if (param.type === 'string' && typeof value !== 'string') {
          errors.push(`Parameter ${name} must be a string`)
        }
        if (param.type === 'number' && typeof value !== 'number') {
          errors.push(`Parameter ${name} must be a number`)
        }
        if (param.type === 'boolean' && typeof value !== 'boolean') {
          errors.push(`Parameter ${name} must be a boolean`)
        }
        if (param.enum && !param.enum.includes(value)) {
          errors.push(`Parameter ${name} must be one of: ${param.enum.join(', ')}`)
        }
      }
    }

    return { valid: errors.length === 0, errors }
  }

  /** 生成 JSON Schema（用于 LLM function calling） */
  generateSchema(name: string): Record<string, unknown> | null {
    const tool = this.tools.get(name)
    if (!tool) return null

    return {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: 'object',
        properties: Object.fromEntries(
          Object.entries(tool.parameters).map(([key, param]) => [
            key,
            {
              type: param.type,
              description: param.description,
              ...(param.enum ? { enum: param.enum } : {}),
              ...(param.default !== undefined ? { default: param.default } : {}),
            },
          ])
        ),
        required: Object.entries(tool.parameters)
          .filter(([, param]) => param.required)
          .map(([key]) => key),
      },
    }
  }

  /** 生成所有工具的 JSON Schema 列表 */
  generateAllSchemas(): Record<string, unknown>[] {
    return Array.from(this.tools.keys())
      .map(name => this.generateSchema(name))
      .filter(Boolean) as Record<string, unknown>[]
  }
}

// 全局工具注册表实例
export const globalToolRegistry = new ToolRegistry()
