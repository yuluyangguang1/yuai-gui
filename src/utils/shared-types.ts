/**
 * Shared Types — 统一的共享类型定义
 * 消除 agent-api/direct-agent/transport 之间的重复定义
 */

/** Chat message used across all agent modes */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** Stream chunk from LLM API */
export interface StreamChunk {
  content: string;
  done: boolean;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/** Stream callback function */
export type StreamCallback = (chunk: StreamChunk) => void;

/** Agent status */
export type AgentStatus = 'idle' | 'working' | 'blocked' | 'waiting' | 'done' | 'error';

/** Provider definition */
export interface ProviderDef {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  transport: string;
}

/** Model definition */
export interface ModelDef {
  id: string;
  name: string;
  contextLength: number;
  vision: boolean;
  tools: boolean;
  cost?: { input: number; output: number };
}
