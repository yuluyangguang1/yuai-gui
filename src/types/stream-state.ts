/**
 * Stream State Machine — inspired by Craft Agents
 * Tracks the lifecycle of an LLM streaming response.
 */

import { ref, computed, type Ref, type ComputedRef } from 'vue';

// ══════════════════════════════════════════════
// Discriminated Union: StreamState
// ══════════════════════════════════════════════

export type StreamState =
  | { phase: 'idle' }
  | { phase: 'thinking'; startedAt: number }
  | { phase: 'streaming'; startedAt: number; chunkCount: number; buffer: string }
  | { phase: 'tool_calling'; startedAt: number; toolName: string; toolArgs: Record<string, unknown> }
  | { phase: 'error'; error: string; recoverable: boolean }
  | { phase: 'done'; startedAt: number; finishedAt: number; totalChunks: number };

// ══════════════════════════════════════════════
// Stream Events
// ══════════════════════════════════════════════

export type StreamEvent =
  | { type: 'start'; timestamp: number }
  | { type: 'chunk'; content: string; timestamp: number }
  | { type: 'tool_call'; toolName: string; toolArgs: Record<string, unknown>; timestamp: number }
  | { type: 'tool_result'; toolName: string; result: unknown; timestamp: number }
  | { type: 'error'; error: string; recoverable: boolean; timestamp: number }
  | { type: 'done'; timestamp: number }
  | { type: 'cancel'; timestamp: number };

// ══════════════════════════════════════════════
// Stream State Machine Composable
// ══════════════════════════════════════════════

export interface StreamStateHandle {
  /** Current stream state (reactive) */
  state: Ref<StreamState>;
  /** Derived: is the stream actively producing output */
  isActive: ComputedRef<boolean>;
  /** Derived: accumulated text buffer */
  buffer: ComputedRef<string>;
  /** Transition the state machine */
  dispatch(event: StreamEvent): void;
  /** Reset to idle */
  reset(): void;
}

export function useStreamState(): StreamStateHandle {
  const state = ref<StreamState>({ phase: 'idle' }) as Ref<StreamState>;

  const isActive = computed(() => {
    const p = state.value.phase;
    return p === 'thinking' || p === 'streaming' || p === 'tool_calling';
  });

  const buffer = computed(() => {
    if (state.value.phase === 'streaming') return state.value.buffer;
    return '';
  });

  let localBuffer = '';

  function dispatch(event: StreamEvent): void {
    const ts = event.timestamp;

    switch (event.type) {
      case 'start':
        state.value = { phase: 'thinking', startedAt: ts };
        localBuffer = '';
        break;

      case 'chunk':
        if (state.value.phase === 'thinking') {
          localBuffer = event.content;
          state.value = { phase: 'streaming', startedAt: state.value.startedAt, chunkCount: 1, buffer: localBuffer };
        } else if (state.value.phase === 'streaming') {
          localBuffer += event.content;
          state.value = { ...state.value, chunkCount: state.value.chunkCount + 1, buffer: localBuffer };
        }
        break;

      case 'tool_call':
        state.value = {
          phase: 'tool_calling',
          startedAt: state.value.phase === 'streaming' || state.value.phase === 'thinking'
            ? state.value.startedAt : ts,
          toolName: event.toolName,
          toolArgs: event.toolArgs,
        };
        break;

      case 'tool_result':
        // Return to streaming after tool completes
        if (state.value.phase === 'tool_calling') {
          state.value = {
            phase: 'streaming',
            startedAt: state.value.startedAt,
            chunkCount: 0,
            buffer: localBuffer,
          };
        }
        break;

      case 'error':
        state.value = { phase: 'error', error: event.error, recoverable: event.recoverable };
        break;

      case 'done': {
        const startedAt = ('startedAt' in state.value) ? state.value.startedAt : ts;
        const totalChunks = state.value.phase === 'streaming' ? state.value.chunkCount : 0;
        state.value = { phase: 'done', startedAt, finishedAt: ts, totalChunks };
        break;
      }

      case 'cancel':
        state.value = { phase: 'idle' };
        localBuffer = '';
        break;
    }
  }

  function reset(): void {
    state.value = { phase: 'idle' };
    localBuffer = '';
  }

  return { state, isActive, buffer, dispatch, reset };
}
