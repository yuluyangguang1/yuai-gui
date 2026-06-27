/**
 * Shared file-type icon map.
 * Eliminates duplication between HomeView and FileTreeNode.
 */
export const FILE_ICONS: Record<string, string> = {
  ts: '📘',
  vue: '💚',
  js: '📒',
  json: '📋',
  md: '📝',
  css: '🎨',
  html: '🌐',
  rs: '🦀',
  toml: '⚙',
  yaml: '📋',
  yml: '📋',
  png: '🖼',
  jpg: '🖼',
  jpeg: '🖼',
  svg: '🖼',
  gif: '🖼',
  webp: '🖼',
  bmp: '🖼',
  txt: '📄',
  py: '🐍',
  go: '🔵',
  java: '☕',
  rb: '💎',
  sh: '🐚',
  sql: '🗄',
  xml: '📄',
  zip: '📦',
  tar: '📦',
  gz: '📦',
  '7z': '📦',
  rar: '📦',
};

/**
 * Get the file icon for a given filename based on its extension.
 */
export function getFileIcon(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return FILE_ICONS[ext] ?? '📄';
}
