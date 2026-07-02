/**
 * Agent API — 参考 Hermes Studio / OpenClaw Web UI
 * Agent 作为后台服务运行, 前端通过 HTTP API 对话
 * 不需要 PTY, 不需要终端, 干净的消息/响应流
 */


// ══════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════

export interface AgentApiConfig {
  /** Agent ID (claude/codex/openclaw/hermes) */
  agentId: string;
  /** API base URL (e.g., http://localhost:8642) */
  baseUrl: string;
  /** API key (if required) */
  apiKey?: string;
  /** Model to use */
  model?: string;
}

import type { ChatMessage, StreamChunk, StreamCallback } from './shared-types';
export type { ChatMessage, StreamChunk, StreamCallback };

// ══════════════════════════════════════════════
// Agent API Client
// ══════════════════════════════════════════════

export class AgentApiClient {
  private config: AgentApiConfig;
  private messages: ChatMessage[] = [];
  private abortController: AbortController | null = null;

  constructor(config: AgentApiConfig) {
    this.config = config;
  }

  /** Send a message and get a streamed response */
  async sendMessage(content: string, onChunk: StreamCallback): Promise<string> {
    this.messages.push({ role: 'user', content });
    this.abortController = new AbortController();

    let fullContent = '';

    try {
      // Try different API patterns based on agent type
      const response = await this.callAgentApi(content, this.abortController.signal);

      // Parse SSE stream
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') {
            onChunk({ content: '', done: true });
            continue;
          }

          try {
            const parsed = JSON.parse(data);
            // OpenAI format
            let delta = parsed.choices?.[0]?.delta?.content ?? '';
            // Anthropic format
            if (!delta && parsed.type === 'content_block_delta') {
              delta = parsed.delta?.text ?? '';
            }
            if (!delta && parsed.content?.[0]?.text) {
              delta = parsed.content[0].text;
            }
            if (delta) {
              fullContent += delta;
              onChunk({ content: delta, done: false });
            }
          } catch { /* skip malformed lines */ }
        }
      }
    } catch (e: unknown) {
      if (e instanceof Error && e.name === 'AbortError') {
        onChunk({ content: '', done: true });
      } else {
        throw e;
      }
    }

    this.messages.push({ role: 'assistant', content: fullContent });
    return fullContent;
  }

  /** Call the agent's API (supports multiple patterns) */
  private async callAgentApi(content: string, signal: AbortSignal): Promise<Response> {
    const baseUrl = this.config.baseUrl.replace(/\/+$/, '');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    // Pattern 1: OpenAI-compatible (OpenClaw, Hermes, most agents)
    const url = `${baseUrl}/v1/chat/completions`;
    const body = JSON.stringify({
      model: this.config.model ?? 'gpt-4o',
      messages: this.messages,
      stream: true,
      max_tokens: 4096,
    });

    return fetch(url, { method: 'POST', headers, body, signal });
  }

  /** Abort the current request */
  abort(): void {
    this.abortController?.abort();
    this.abortController = null;
  }

  /** Clear conversation history */
  clear(): void {
    this.messages = [];
  }

  /** Get conversation history */
  getHistory(): ChatMessage[] {
    return [...this.messages];
  }

  /** Update config */
  updateConfig(config: Partial<AgentApiConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

// ══════════════════════════════════════════════
// Agent API Discovery
// ══════════════════════════════════════════════

/** Default API ports for each agent */
export const AGENT_API_PORTS: Record<string, number> = {
  claude: 8642,    // Claude Code API
  codex: 8642,     // Codex API
  openclaw: 8642,  // OpenClaw API
  hermes: 8642,    // Hermes API
};

/** Get the API base URL for an agent */
export function getAgentApiUrl(agentId: string): string {
  const port = AGENT_API_PORTS[agentId] ?? 8642;
  return `http://localhost:${port}`;
}

/** Check if an agent's API is available */
export async function checkAgentApi(agentId: string): Promise<boolean> {
  try {
    const url = getAgentApiUrl(agentId);
    const response = await fetch(`${url}/health`, { method: 'GET' });
    return response.ok;
  } catch {
    return false;
  }
}
