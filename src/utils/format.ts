/**
 * Shared formatting utilities — single source of truth for all display formatting.
 */

/** Relative time display (e.g. "刚刚", "5秒前", "3分钟前", "2小时前", "3天前") */
export function timeAgo(ts: number): string {
  if (!ts) return '';
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 5) return '刚刚';
  if (seconds < 60) return `${seconds}秒前`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}分钟前`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}小时前`;
  const days = Math.floor(seconds / 86400);
  if (days < 7) return `${days}天前`;
  return `${Math.floor(days / 7)}周前`;
}

/** Format number with K/M suffix (e.g. 1.2K, 3.4M) */
export function formatTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K';
  return n.toString();
}

export function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

/** Format file size in human-readable units (B/KB/MB/GB) */
export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

/** Format duration in milliseconds to human-readable string (e.g. "2m 30s") */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

/** Strip ANSI escape sequences from a string */
export function cleanAnsi(s: string): string {
  // eslint-disable-next-line no-control-regex
  let cleaned = s.replace(/\x1b\[[0-9;?]*[A-Za-z]|\x1b[()][AB0]|\r/g, '').replace(/\x1b\][^\x07]*\x07/g, '');
  // Remove DA1/DA2 device attribute responses
  cleaned = cleaned.replace(/\x1b\[\?62c/g, '').replace(/\x1b\[\?1;2c/g, '');
  // Remove bracketed paste mode markers (with and without ESC prefix)
  cleaned = cleaned.replace(/\x1b\[>0q/g, '').replace(/\x1b\[2 q/g, '');
  cleaned = cleaned.replace(/\[>0q/g, '').replace(/\[2 q/g, '').replace(/\[0 q/g, '');
  // Remove cursor position reports
  cleaned = cleaned.replace(/\x1b\[\d+;\d+[RH]/g, '');
  // Remove "1" trust prompt echo at start
  cleaned = cleaned.replace(/^1\n/, '');
  // Remove Codex ASCII art (large blocks of |*_/\ characters)
  cleaned = cleaned.replace(/[_.=+*|/\\^~`'";:,!?<>{}()\[\]#@&%$#\-=\+]{50,}/g, '');
  // Remove "Welcome to Codex" banner
  cleaned = cleaned.replace(/.*Welcome\s+to\s+Codex.*$/gm, '');
  // Remove "Do you trust" prompt
  cleaned = cleaned.replace(/.*Do you trust.*$/gm, '');
  // Remove "Press enter to continue"
  cleaned = cleaned.replace(/.*Press enter to continue.*$/gm, '');
  // Remove Update available banners
  cleaned = cleaned.replace(/╭─+╮[\s\S]*?╰─+╯/g, '');
  // Remove Hermes/Codex status lines (╭─╮/╰─╯ boxes)
  cleaned = cleaned.replace(/╭[─┬╮]+/g, '').replace(/╰[─┴╯]+/g, '').replace(/│[^│]*│/g, '');
  // Remove progress indicators like ◉_◉ processing...
  cleaned = cleaned.replace(/◉_◉.*$/gm, '');
  // Remove msg=interrupt / /queue / /bg / /steer status lines
  cleaned = cleaned.replace(/.*msg=interrupt.*$/gm, '');
  // Remove mimo-v2.5-pro status lines
  cleaned = cleaned.replace(/.*mimo-v2\.5-pro.*$/gm, '');
  // Remove progress counter lines (just numbers)
  cleaned = cleaned.replace(/^\d+\s*$/gm, '');
  // Remove (⊙_⊙)...(•_•)...(´･_･`) thinking indicators
  cleaned = cleaned.replace(/[⊙◉•_´･ʖ⌐■▣▢◻▷►◆◇●○◐◑★☆♦♢]+[^\n]*$/gm, '');
  // Clean up excessive whitespace
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();
  return cleaned;
}
