/**
 * Direct Agent — 参考 Aider/Continue 直接调用 LLM API
 * 不依赖外部 CLI binary, 不需要 PTY, 没有终端乱码
 */

// ══════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════

export interface DirectAgentConfig {
  providerId: string;
  modelId: string;
  apiKey: string;
  baseUrl: string;
  systemPrompt?: string;
  maxTokens?: number;
  temperature?: number;
}

import type { ChatMessage, StreamChunk, StreamCallback } from './shared-types';
export type { ChatMessage, StreamChunk, StreamCallback };

// ══════════════════════════════════════════════
// Direct Agent
// ══════════════════════════════════════════════

export class DirectAgent {
  private config: DirectAgentConfig;
  private messages: ChatMessage[] = [];
  private abortController: AbortController | null = null;

  constructor(config: DirectAgentConfig) {
    this.config = config;
    if (config.systemPrompt) {
      this.messages.push({ role: 'system', content: config.systemPrompt });
    }
  }

  /** Send a message and get a streamed response */
  async sendMessage(content: string, onChunk: StreamCallback): Promise<string> {
    this.messages.push({ role: 'user', content });

    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    const url = this.config.baseUrl.replace(/\/+$/, '') + '/chat/completions';
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.config.apiKey}`,
    };

    const body = JSON.stringify({
      model: this.config.modelId,
      messages: this.messages,
      stream: true,
      max_tokens: this.config.maxTokens ?? 4096,
      temperature: this.config.temperature ?? 0.7,
    });

    let fullContent = '';

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body,
        signal,
      });

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`API error ${response.status}: ${error}`);
      }

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
            const delta = parsed.choices?.[0]?.delta?.content ?? '';
            if (delta) {
              fullContent += delta;
              onChunk({ content: delta, done: false });
            }
            if (parsed.usage) {
              onChunk({
                content: '',
                done: false,
                usage: {
                  promptTokens: parsed.usage.prompt_tokens,
                  completionTokens: parsed.usage.completion_tokens,
                  totalTokens: parsed.usage.total_tokens,
                },
              });
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

  /** Abort the current request */
  abort(): void {
    this.abortController?.abort();
    this.abortController = null;
  }

  /** Clear conversation history */
  clear(): void {
    this.messages = [];
    if (this.config.systemPrompt) {
      this.messages.push({ role: 'system', content: this.config.systemPrompt });
    }
  }

  /** Get conversation history */
  getHistory(): ChatMessage[] {
    return [...this.messages];
  }

  /** Update config (e.g., switch model) */
  updateConfig(config: Partial<DirectAgentConfig>): void {
    this.config = { ...this.config, ...config };
  }
}
