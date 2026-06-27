import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractErrorMessage, withErrorHandling } from '../errors';

// Mock @tauri-apps/api/core
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

describe('extractErrorMessage', () => {
  it('extracts message from Error instances', () => {
    const err = new Error('test error');
    expect(extractErrorMessage(err)).toBe('test error');
  });

  it('returns string errors directly', () => {
    expect(extractErrorMessage('string error')).toBe('string error');
  });

  it('extracts message from objects with message property', () => {
    const err = { message: 'object error', code: 42 };
    expect(extractErrorMessage(err)).toBe('object error');
  });

  it('converts non-string, non-Error values to string', () => {
    expect(extractErrorMessage(42)).toBe('42');
    expect(extractErrorMessage(null)).toBe('null');
    expect(extractErrorMessage(undefined)).toBe('undefined');
    expect(extractErrorMessage(true)).toBe('true');
  });

  it('handles empty string', () => {
    expect(extractErrorMessage('')).toBe('');
  });

  it('handles Error with empty message', () => {
    expect(extractErrorMessage(new Error(''))).toBe('');
  });
});

describe('withErrorHandling', () => {
  it('returns result when function succeeds', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    const result = await withErrorHandling(fn, 'fallback');
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledOnce();
  });

  it('returns fallback when function throws', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await withErrorHandling(fn, 'fallback');
    expect(result).toBe('fallback');
    expect(fn).toHaveBeenCalledOnce();
    consoleSpy.mockRestore();
  });

  it('logs error message on failure', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('boom'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await withErrorHandling(fn, null);
    expect(consoleSpy).toHaveBeenCalledWith(
      '[withErrorHandling]',
      'boom',
    );
    consoleSpy.mockRestore();
  });

  it('handles fallback of different types', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(await withErrorHandling(fn, 0)).toBe(0);
    expect(await withErrorHandling(fn, null)).toBe(null);
    expect(await withErrorHandling(fn, undefined)).toBe(undefined);
    expect(await withErrorHandling(fn, [])).toEqual([]);
    expect(await withErrorHandling(fn, {})).toEqual({});

    consoleSpy.mockRestore();
  });

  it('passes through resolved value unchanged', async () => {
    const obj = { key: 'value' };
    const fn = vi.fn().mockResolvedValue(obj);
    const result = await withErrorHandling(fn, null);
    expect(result).toBe(obj); // same reference
  });
});
