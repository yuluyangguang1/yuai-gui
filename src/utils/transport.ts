/**
 * Transport Protocol Abstraction — 参考 Hermes Agent providers/base.py
 * 统一不同 AI API 的请求/响应格式
 * 支持: openai_chat, anthropic_messages, codex_responses, bedrock_converse
 */

import type { TransportType, ProviderDef } from '../stores/provider'

// ══════════════════════════════════════════════
// 统一消息格式 (内部使用)
// ══════════════════════════════════════════════

export interface UnifiedMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  name?: string
  tool_call_id?: string
  tool_calls?: ToolCall[]
}

export interface ToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

export interface UnifiedRequest {
  model: string
  messages: UnifiedMessage[]
  temperature?: number
  max_tokens?: number
  stream?: boolean
  tools?: any[]
  tool_choice?: any
  stop?: string[]
  top_p?: number
}

export interface UnifiedResponse {
  id: string
  model: string
  content: string | null
  finish_reason: string | null
  tool_calls?: ToolCall[]
  usage?: { input_tokens: number; output_tokens: number }
  raw: any // 原始响应
}

export interface StreamChunk {
  delta: string
  finish_reason: string | null
  tool_calls?: Partial<ToolCall>[]
}

// ══════════════════════════════════════════════
// Transport 接口
// ══════════════════════════════════════════════

export interface Transport {
  type: TransportType

  /** 构建请求 URL */
  buildUrl(provider: ProviderDef, stream: boolean): string

  /** 构建请求头 */
  buildHeaders(provider: ProviderDef): Record<string, string>

  /** 将统一格式转为供应商原生请求体 */
  formatRequest(req: UnifiedRequest): any

  /** 将供应商原生响应转为统一格式 */
  parseResponse(raw: any): UnifiedResponse

  /** 解析 SSE 流式 chunk */
  parseStreamChunk(line: string): StreamChunk | null
}

// ══════════════════════════════════════════════
// OpenAI Chat Completions
// ══════════════════════════════════════════════

export class OpenAIChatTransport implements Transport {
  type: TransportType = 'openai_chat'

  buildUrl(provider: ProviderDef, stream: boolean): string {
    const base = provider.base_url.replace(/\/+$/, '')
    // 大部分 OpenAI 兼容端点直接用 /chat/completions
    if (base.endsWith('/v1') || base.endsWith('/v1/')) {
      return `${base}/chat/completions`
    }
    return `${base}/v1/chat/completions`
  }

  buildHeaders(provider: ProviderDef): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (provider.api_key) {
      headers['Authorization'] = `Bearer ${provider.api_key}`
    }
    return headers
  }

  formatRequest(req: UnifiedRequest): any {
    return {
      model: req.model,
      messages: req.messages,
      temperature: req.temperature,
      max_tokens: req.max_tokens,
      stream: req.stream ?? false,
      tools: req.tools,
      tool_choice: req.tool_choice,
      stop: req.stop,
      top_p: req.top_p,
    }
  }

  parseResponse(raw: any): UnifiedResponse {
    const choice = raw.choices?.[0]
    return {
      id: raw.id ?? '',
      model: raw.model ?? '',
      content: choice?.message?.content ?? null,
      finish_reason: choice?.finish_reason ?? null,
      tool_calls: choice?.message?.tool_calls,
      usage: raw.usage ? { input_tokens: raw.usage.prompt_tokens, output_tokens: raw.usage.completion_tokens } : undefined,
      raw,
    }
  }

  parseStreamChunk(line: string): StreamChunk | null {
    if (line.startsWith('data: ')) {
      const data = line.slice(6).trim()
      if (data === '[DONE]') return { delta: '', finish_reason: 'stop' }
      try {
        const json = JSON.parse(data)
        const delta = json.choices?.[0]?.delta
        if (!delta) return null
        return {
          delta: delta.content ?? '',
          finish_reason: json.choices?.[0]?.finish_reason ?? null,
          tool_calls: delta.tool_calls,
        }
      } catch { return null }
    }
    return null
  }
}

// ══════════════════════════════════════════════
// Anthropic Messages
// ══════════════════════════════════════════════

export class AnthropicMessagesTransport implements Transport {
  type: TransportType = 'anthropic_messages'

  buildUrl(provider: ProviderDef, stream: boolean): string {
    const base = provider.base_url.replace(/\/+$/, '')
    return `${base}/v1/messages`
  }

  buildHeaders(provider: ProviderDef): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
    }
    if (provider.api_key) {
      headers['x-api-key'] = provider.api_key
    }
    return headers
  }

  formatRequest(req: UnifiedRequest): any {
    // Anthropic 分离 system 和 messages
    const systemMsgs = req.messages.filter(m => m.role === 'system')
    const nonSystemMsgs = req.messages.filter(m => m.role !== 'system')

    const body: any = {
      model: req.model,
      messages: nonSystemMsgs.map(m => ({
        role: m.role === 'tool' ? 'user' : m.role,
        content: m.content,
      })),
      max_tokens: req.max_tokens ?? 4096,
      stream: req.stream ?? false,
    }

    if (systemMsgs.length > 0) {
      body.system = systemMsgs.map(m => m.content).join('\n\n')
    }
    if (req.temperature !== undefined) body.temperature = req.temperature
    if (req.top_p !== undefined) body.top_p = req.top_p
    if (req.stop) body.stop_sequences = req.stop

    // Anthropic tools 格式
    if (req.tools && req.tools.length > 0) {
      body.tools = req.tools.map(t => ({
        name: t.function?.name ?? t.name,
        description: t.function?.description ?? t.description,
        input_schema: t.function?.parameters ?? t.parameters ?? { type: 'object', properties: {} },
      }))
    }

    return body
  }

  parseResponse(raw: any): UnifiedResponse {
    const textBlock = raw.content?.find((b: any) => b.type === 'text')
    const toolBlocks = raw.content?.filter((b: any) => b.type === 'tool_use') ?? []

    return {
      id: raw.id ?? '',
      model: raw.model ?? '',
      content: textBlock?.text ?? null,
      finish_reason: raw.stop_reason ?? null,
      tool_calls: toolBlocks.map((b: any) => ({
        id: b.id,
        type: 'function' as const,
        function: { name: b.name, arguments: JSON.stringify(b.input) },
      })),
      usage: raw.usage ? { input_tokens: raw.usage.input_tokens, output_tokens: raw.usage.output_tokens } : undefined,
      raw,
    }
  }

  parseStreamChunk(line: string): StreamChunk | null {
    if (line.startsWith('data: ')) {
      const data = line.slice(6).trim()
      try {
        const json = JSON.parse(data)
        if (json.type === 'content_block_delta') {
          return {
            delta: json.delta?.text ?? '',
            finish_reason: null,
          }
        }
        if (json.type === 'message_stop') {
          return { delta: '', finish_reason: 'stop' }
        }
        return null
      } catch { return null }
    }
    return null
  }
}

// ══════════════════════════════════════════════
// Codex Responses (OpenAI Responses API)
// ══════════════════════════════════════════════

export class CodexResponsesTransport implements Transport {
  type: TransportType = 'codex_responses'

  buildUrl(provider: ProviderDef, stream: boolean): string {
    const base = provider.base_url.replace(/\/+$/, '')
    return `${base}/responses`
  }

  buildHeaders(provider: ProviderDef): Record<string, string> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (provider.api_key) {
      headers['Authorization'] = `Bearer ${provider.api_key}`
    }
    return headers
  }

  formatRequest(req: UnifiedRequest): any {
    // Codex Responses API 使用 input 而非 messages
    const input = req.messages.map(m => ({
      role: m.role,
      content: m.content,
    }))

    return {
      model: req.model,
      input,
      stream: req.stream ?? false,
      temperature: req.temperature,
      max_output_tokens: req.max_tokens,
    }
  }

  parseResponse(raw: any): UnifiedResponse {
    // Responses API 的 output 格式
    const textItem = raw.output?.find((o: any) => o.type === 'message')
    const content = textItem?.content?.find((c: any) => c.type === 'output_text')

    return {
      id: raw.id ?? '',
      model: raw.model ?? '',
      content: content?.text ?? null,
      finish_reason: raw.status === 'completed' ? 'stop' : raw.status,
      usage: raw.usage ? { input_tokens: raw.usage.input_tokens, output_tokens: raw.usage.output_tokens } : undefined,
      raw,
    }
  }

  parseStreamChunk(line: string): StreamChunk | null {
    if (line.startsWith('data: ')) {
      const data = line.slice(6).trim()
      try {
        const json = JSON.parse(data)
        if (json.type === 'response.output_text.delta') {
          return { delta: json.delta ?? '', finish_reason: null }
        }
        if (json.type === 'response.completed') {
          return { delta: '', finish_reason: 'stop' }
        }
        return null
      } catch { return null }
    }
    return null
  }
}

// ══════════════════════════════════════════════
// Transport 注册表
// ══════════════════════════════════════════════

const transports: Record<TransportType, Transport> = {
  openai_chat: new OpenAIChatTransport(),
  anthropic_messages: new AnthropicMessagesTransport(),
  codex_responses: new CodexResponsesTransport(),
  bedrock_converse: new OpenAIChatTransport(), // Bedrock 暂用 OpenAI 兼容
}

export function getTransport(type: TransportType): Transport {
  return transports[type] ?? transports.openai_chat
}

export function getTransportForProvider(provider: ProviderDef): Transport {
  return getTransport(provider.transport)
}

// ══════════════════════════════════════════════
// 统一发送接口
// ══════════════════════════════════════════════

/**
 * 统一 API 调用 — 自动选择正确的传输协议
 */
export async function unifiedChat(
  provider: ProviderDef,
  request: UnifiedRequest,
): Promise<UnifiedResponse> {
  const transport = getTransportForProvider(provider)
  const url = transport.buildUrl(provider, false)
  const headers = transport.buildHeaders(provider)
  const body = transport.formatRequest(request)

  const resp = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  })

  if (!resp.ok) {
    const errText = await resp.text().catch(() => resp.statusText)
    throw new Error(`API error ${resp.status}: ${errText.slice(0, 200)}`)
  }

  const raw = await resp.json()
  return transport.parseResponse(raw)
}

/**
 * 统一流式调用 — 返回 AsyncGenerator
 */
export async function* unifiedChatStream(
  provider: ProviderDef,
  request: UnifiedRequest,
): AsyncGenerator<StreamChunk> {
  const transport = getTransportForProvider(provider)
  const url = transport.buildUrl(provider, true)
  const headers = transport.buildHeaders(provider)
  const body = transport.formatRequest({ ...request, stream: true })

  const resp = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120000),
  })

  if (!resp.ok) {
    const errText = await resp.text().catch(() => resp.statusText)
    throw new Error(`API error ${resp.status}: ${errText.slice(0, 200)}`)
  }

  const reader = resp.body?.getReader()
  if (!reader) throw new Error('No response body')

  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith(':')) continue
      const chunk = transport.parseStreamChunk(trimmed)
      if (chunk) yield chunk
    }
  }

  // 处理剩余 buffer
  if (buffer.trim()) {
    const chunk = transport.parseStreamChunk(buffer.trim())
    if (chunk) yield chunk
  }
}
