import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { timeAgo, formatNumber, formatTokens, formatSize, formatDuration, cleanAnsi } from '../format';

describe('timeAgo', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns empty string for falsy timestamps', () => {
    expect(timeAgo(0)).toBe('');
  });

  it('returns 刚刚 for < 5 seconds', () => {
    expect(timeAgo(Date.now() - 3000)).toBe('刚刚');
  });

  it('returns seconds for < 60 seconds', () => {
    expect(timeAgo(Date.now() - 30_000)).toBe('30秒前');
  });

  it('returns minutes for < 1 hour', () => {
    expect(timeAgo(Date.now() - 5 * 60_000)).toBe('5分钟前');
  });

  it('returns hours for < 1 day', () => {
    expect(timeAgo(Date.now() - 3 * 3600_000)).toBe('3小时前');
  });

  it('returns days for < 7 days', () => {
    expect(timeAgo(Date.now() - 3 * 86400_000)).toBe('3天前');
  });

  it('returns weeks for >= 7 days', () => {
    expect(timeAgo(Date.now() - 14 * 86400_000)).toBe('2周前');
  });
});

describe('formatNumber', () => {
  it('returns raw number for < 1000', () => {
    expect(formatNumber(42)).toBe('42');
  });

  it('formats thousands with K suffix', () => {
    expect(formatNumber(1500)).toBe('1.5K');
  });

  it('formats millions with M suffix', () => {
    expect(formatNumber(2_500_000)).toBe('2.5M');
  });

  it('handles zero', () => {
    expect(formatNumber(0)).toBe('0');
  });

  it('handles exact boundaries', () => {
    expect(formatNumber(1000)).toBe('1.0K');
    expect(formatNumber(1_000_000)).toBe('1.0M');
  });
});

describe('formatTokens', () => {
  it('returns raw number for < 1000', () => {
    expect(formatTokens(999)).toBe('999');
  });

  it('formats thousands with K suffix', () => {
    expect(formatTokens(1500)).toBe('1.5K');
  });

  it('formats millions with M suffix', () => {
    expect(formatTokens(2_500_000)).toBe('2.5M');
  });
});

describe('formatSize', () => {
  it('formats bytes', () => {
    expect(formatSize(512)).toBe('512 B');
  });

  it('formats kilobytes', () => {
    expect(formatSize(1024)).toBe('1.0 KB');
    expect(formatSize(1536)).toBe('1.5 KB');
  });

  it('formats megabytes', () => {
    expect(formatSize(1024 * 1024)).toBe('1.0 MB');
    expect(formatSize(2.5 * 1024 * 1024)).toBe('2.5 MB');
  });

  it('formats gigabytes', () => {
    expect(formatSize(1024 * 1024 * 1024)).toBe('1.0 GB');
  });

  it('handles zero', () => {
    expect(formatSize(0)).toBe('0 B');
  });
});

describe('formatDuration', () => {
  it('formats milliseconds', () => {
    expect(formatDuration(500)).toBe('500ms');
  });

  it('formats seconds', () => {
    expect(formatDuration(5000)).toBe('5s');
  });

  it('formats minutes and seconds', () => {
    expect(formatDuration(150_000)).toBe('2m 30s');
  });

  it('formats hours and minutes', () => {
    expect(formatDuration(3_600_000)).toBe('1h 0m');
  });

  it('handles zero', () => {
    expect(formatDuration(0)).toBe('0ms');
  });
});

describe('cleanAnsi', () => {
  it('strips ANSI color codes', () => {
    expect(cleanAnsi('\x1b[31mred\x1b[0m')).toBe('red');
  });

  it('strips ANSI codes with semicolons', () => {
    expect(cleanAnsi('\x1b[1;32mbold green\x1b[0m')).toBe('bold green');
  });

  it('strips ANSI codes with question mark', () => {
    expect(cleanAnsi('\x1b[?25lhidden\x1b[?25h')).toBe('hidden');
  });

  it('strips OSC sequences', () => {
    expect(cleanAnsi('\x1b]0;title\x07text')).toBe('text');
  });

  it('handles string with no ANSI codes', () => {
    expect(cleanAnsi('plain text')).toBe('plain text');
  });

  it('handles empty string', () => {
    expect(cleanAnsi('')).toBe('');
  });

  it('strips carriage returns', () => {
    expect(cleanAnsi('hello\rworld')).toBe('helloworld');
  });

  it('handles multiple ANSI sequences', () => {
    expect(cleanAnsi('\x1b[1m\x1b[31mred bold\x1b[0m normal')).toBe('red bold normal');
  });
});
