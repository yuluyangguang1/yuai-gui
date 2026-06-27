/**
 * Error handling utilities — consistent error extraction and safe invocation wrappers.
 */

import { invoke } from '@tauri-apps/api/core';

/**
 * Extract a human-readable error message from any error type.
 */
export function extractErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  if (err && typeof err === 'object' && 'message' in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}

/**
 * Wrap an async function with try/catch, returning a fallback value on error.
 */
export async function withErrorHandling<T>(fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    console.error('[withErrorHandling]', extractErrorMessage(err));
    return fallback;
  }
}

/**
 * Invoke a Tauri command with error handling.
 * Returns the result or the fallback value if the command fails.
 */
export async function invokeSafe<T = unknown>(
  command: string,
  args?: Record<string, unknown>,
  fallback?: T,
): Promise<T> {
  try {
    return await invoke<T>(command, args as Record<string, unknown>);
  } catch (err) {
    console.error(`[invokeSafe] ${command}:`, extractErrorMessage(err));
    if (fallback !== undefined) return fallback;
    throw err;
  }
}
