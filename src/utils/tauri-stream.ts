/**
 * Tauri Stream Fetch — 参考 ChatGPT-Next-Web 统一 fetch 抽象
 * Tauri 模式: Rust reqwest 流式 → event emitter → TransformStream
 * 浏览器模式: 标准 fetch
 */

import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';

interface StreamRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: string;
  request_id: string;
}

interface ChunkPayload {
  request_id: string;
  chunk: number[];
}

interface EndPayload {
  request_id: string;
  status: number;
}

interface ErrorPayload {
  request_id: string;
  error: string;
}

/**
 * Check if running in Tauri environment
 */
function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window;
}

/**
 * Generate unique request ID
 */
function generateRequestId(): string {
  return `req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Stream fetch via Tauri Rust backend
 * Returns a standard Response object with readable stream
 */
async function tauriStreamFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  const requestId = generateRequestId();
  const headers: Record<string, string> = {};

  // Extract headers
  if (options.headers) {
    if (options.headers instanceof Headers) {
      options.headers.forEach((value, key) => { headers[key] = value; });
    } else if (Array.isArray(options.headers)) {
      for (const [key, value] of options.headers) {
        headers[key] = value;
      }
    } else {
      Object.assign(headers, options.headers);
    }
  }

  const request: StreamRequest = {
    url,
    method: options.method || 'GET',
    headers,
    body: options.body ? String(options.body) : undefined,
    request_id: requestId,
  };

  // Create TransformStream for chunk delivery
  const ts = new TransformStream();
  const writer = ts.writable.getWriter();

  // Listen for chunks
  const unlisteners: UnlistenFn[] = [];

  const chunkListener = await listen<ChunkPayload>('stream-response', (event) => {
    if (event.payload.request_id === requestId) {
      const bytes = new Uint8Array(event.payload.chunk);
      writer.write(bytes);
    }
  });
  unlisteners.push(chunkListener);

  const endListener = await listen<EndPayload>('stream-end', (event) => {
    if (event.payload.request_id === requestId) {
      writer.close();
      unlisteners.forEach((u) => u());
    }
  });
  unlisteners.push(endListener);

  const errorListener = await listen<ErrorPayload>('stream-error', (event) => {
    if (event.payload.request_id === requestId) {
      writer.abort(new Error(event.payload.error));
      unlisteners.forEach((u) => u());
    }
  });
  unlisteners.push(errorListener);

  // Handle abort signal
  if (options.signal) {
    options.signal.addEventListener('abort', () => {
      writer.abort(new Error('Aborted'));
      unlisteners.forEach((u) => u());
    });
  }

  // Start the stream request (fire and forget)
  invoke('stream_fetch', { request }).catch((err) => {
    writer.abort(new Error(String(err)));
    unlisteners.forEach((u) => u());
  });

  // Return standard Response object
  return new Response(ts.readable, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

/**
 * Unified fetch — works in both Tauri and browser
 */
export async function unifiedFetch(
  url: string,
  options: RequestInit = {}
): Promise<Response> {
  if (isTauri()) {
    return tauriStreamFetch(url, options);
  }
  return fetch(url, options);
}

/**
 * Parse SSE stream from Response
 * Calls onChunk for each content delta
 */
export async function parseSSEStream(
  response: Response,
  onChunk: (content: string, done: boolean) => void,
  onError?: (error: string) => void
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) {
    onError?.('No response body');
    return;
  }

  const decoder = new TextDecoder();
  let buffer = '';

  try {
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
          onChunk('', true);
          continue;
        }

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content ?? '';
          if (delta) {
            onChunk(delta, false);
          }
        } catch { /* skip malformed lines */ }
      }
    }
  } catch (e) {
    onError?.(String(e));
  }
}
