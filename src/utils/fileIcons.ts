/**
 * Shared file-type icon map.
 * Eliminates duplication between HomeView and FileTreeNode.
 * Uses Tabler Icons names for consistency.
 */
export const FILE_ICONS: Record<string, string> = {
  // 代码
  ts: 'code',
  vue: 'code',
  js: 'code',
  json: 'braces',
  md: 'fileText',
  css: 'palette',
  html: 'code',
  rs: 'code',
  toml: 'settings',
  yaml: 'braces',
  yml: 'braces',
  
  // 图片
  png: 'photo',
  jpg: 'photo',
  jpeg: 'photo',
  svg: 'photo',
  gif: 'photo',
  webp: 'photo',
  bmp: 'photo',
  
  // 文档
  txt: 'fileText',
  pdf: 'fileText',
  doc: 'fileText',
  docx: 'fileText',
  
  // 编程语言
  py: 'code',
  go: 'code',
  java: 'code',
  rb: 'code',
  sh: 'terminal',
  sql: 'database',
  
  // 数据
  xml: 'code',
  
  // 压缩
  zip: 'package',
  tar: 'package',
  gz: 'package',
  '7z': 'package',
  rar: 'package',
};

/**
 * Get the file icon for a given filename based on its extension.
 */
export function getFileIcon(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  return FILE_ICONS[ext] ?? 'file';
}
