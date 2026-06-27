/**
 * Rich SVG file icons — generates inline SVG strings per file type.
 * Uses a consistent color palette matching the yuai-gui design system.
 */

/** Color palette from design system */
const PALETTE = {
  // Code colors
  typescript: '#3178c6',
  javascript: '#f7df1e',
  vue: '#42b883',
  rust: '#dea584',
  python: '#3572a5',
  go: '#00add8',
  java: '#b07219',
  c: '#555555',
  cpp: '#f34b7d',
  csharp: '#178600',
  ruby: '#cc342d',
  php: '#4f5d95',
  swift: '#f05138',
  kotlin: '#a97bff',
  sql: '#e38c00',
  shell: '#89e051',

  // Style colors
  css: '#563d7c',
  scss: '#c6538c',

  // Markup
  html: '#e34c26',
  xml: '#0060ac',
  markdown: '#083fa1',

  // Data
  json: '#292929',
  yaml: '#cb171e',
  toml: '#9c4221',
  csv: '#217346',

  // Docs
  pdf: '#b30b00',
  word: '#2b579a',
  excel: '#217346',

  // Media
  image: '#a855f7',
  video: '#ec4899',
  audio: '#f59e0b',

  // Archives
  archive: '#8b6914',

  // Default
  default: '#565f89',
} as const;

type FileCategory = 'code' | 'document' | 'image' | 'archive' | 'media' | 'default';

interface IconConfig {
  category: FileCategory;
  color: string;
  label: string;
}

/** Map extensions to icon configs */
const EXT_CONFIG: Record<string, IconConfig> = {
  // Code
  ts:  { category: 'code', color: PALETTE.typescript, label: 'TS' },
  tsx: { category: 'code', color: PALETTE.typescript, label: 'TS' },
  js:  { category: 'code', color: PALETTE.javascript, label: 'JS' },
  jsx: { category: 'code', color: PALETTE.javascript, label: 'JS' },
  mjs: { category: 'code', color: PALETTE.javascript, label: 'JS' },
  vue: { category: 'code', color: PALETTE.vue, label: 'Vue' },
  rs:  { category: 'code', color: PALETTE.rust, label: 'Rs' },
  py:  { category: 'code', color: PALETTE.python, label: 'Py' },
  go:  { category: 'code', color: PALETTE.go, label: 'Go' },
  java:{ category: 'code', color: PALETTE.java, label: 'Jv' },
  c:   { category: 'code', color: PALETTE.c, label: 'C' },
  h:   { category: 'code', color: PALETTE.c, label: 'C' },
  cpp: { category: 'code', color: PALETTE.cpp, label: 'C++' },
  hpp: { category: 'code', color: PALETTE.cpp, label: 'C++' },
  cs:  { category: 'code', color: PALETTE.csharp, label: 'C#' },
  rb:  { category: 'code', color: PALETTE.ruby, label: 'Rb' },
  php: { category: 'code', color: PALETTE.php, label: 'Ph' },
  swift:{ category: 'code', color: PALETTE.swift, label: 'Sw' },
  kt:  { category: 'code', color: PALETTE.kotlin, label: 'Kt' },
  sql: { category: 'code', color: PALETTE.sql, label: 'SQL' },
  sh:  { category: 'code', color: PALETTE.shell, label: '$_' },
  bash:{ category: 'code', color: PALETTE.shell, label: '$_' },
  zsh: { category: 'code', color: PALETTE.shell, label: '$_' },

  // Styles
  css:  { category: 'code', color: PALETTE.css, label: 'CSS' },
  scss: { category: 'code', color: PALETTE.scss, label: 'SCSS' },
  sass: { category: 'code', color: PALETTE.scss, label: 'Sass' },
  less: { category: 'code', color: PALETTE.css, label: 'Less' },

  // Markup
  html: { category: 'code', color: PALETTE.html, label: 'HTML' },
  htm:  { category: 'code', color: PALETTE.html, label: 'HTML' },
  xml:  { category: 'code', color: PALETTE.xml, label: 'XML' },
  md:   { category: 'document', color: PALETTE.markdown, label: 'MD' },

  // Data
  json: { category: 'code', color: PALETTE.json, label: 'JSON' },
  yaml: { category: 'code', color: PALETTE.yaml, label: 'YAML' },
  yml:  { category: 'code', color: PALETTE.yaml, label: 'YAML' },
  toml: { category: 'code', color: PALETTE.toml, label: 'TOML' },
  csv:  { category: 'document', color: PALETTE.csv, label: 'CSV' },
  txt:  { category: 'document', color: PALETTE.default, label: 'TXT' },
  log:  { category: 'document', color: PALETTE.default, label: 'LOG' },

  // Documents
  pdf:  { category: 'document', color: PALETTE.pdf, label: 'PDF' },
  doc:  { category: 'document', color: PALETTE.word, label: 'DOC' },
  docx: { category: 'document', color: PALETTE.word, label: 'DOC' },
  xlsx: { category: 'document', color: PALETTE.excel, label: 'XLS' },
  xls:  { category: 'document', color: PALETTE.excel, label: 'XLS' },

  // Images
  png:  { category: 'image', color: PALETTE.image, label: 'IMG' },
  jpg:  { category: 'image', color: PALETTE.image, label: 'IMG' },
  jpeg: { category: 'image', color: PALETTE.image, label: 'IMG' },
  gif:  { category: 'image', color: PALETTE.image, label: 'GIF' },
  webp: { category: 'image', color: PALETTE.image, label: 'IMG' },
  svg:  { category: 'image', color: PALETTE.image, label: 'SVG' },
  bmp:  { category: 'image', color: PALETTE.image, label: 'IMG' },

  // Video
  mp4:  { category: 'media', color: PALETTE.video, label: 'MP4' },
  mov:  { category: 'media', color: PALETTE.video, label: 'MOV' },
  webm: { category: 'media', color: PALETTE.video, label: 'WEBM' },

  // Audio
  mp3:  { category: 'media', color: PALETTE.audio, label: 'MP3' },
  wav:  { category: 'media', color: PALETTE.audio, label: 'WAV' },
  flac: { category: 'media', color: PALETTE.audio, label: 'FLAC' },

  // Archives
  zip:  { category: 'archive', color: PALETTE.archive, label: 'ZIP' },
  tar:  { category: 'archive', color: PALETTE.archive, label: 'TAR' },
  gz:   { category: 'archive', color: PALETTE.archive, label: 'GZ' },
  '7z': { category: 'archive', color: PALETTE.archive, label: '7Z' },
  rar:  { category: 'archive', color: PALETTE.archive, label: 'RAR' },
  dmg:  { category: 'archive', color: PALETTE.archive, label: 'DMG' },

  // Config
  lock: { category: 'default', color: '#6b7280', label: 'LCK' },
  env:  { category: 'default', color: '#6b7280', label: 'ENV' },
  plist:{ category: 'default', color: '#6b7280', label: 'PL' },
  ini:  { category: 'default', color: '#6b7280', label: 'INI' },
};

/** Generate SVG for code files: rounded badge with abbreviation */
function codeIcon(label: string, color: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
    <rect x="1" y="1" width="14" height="14" rx="3" fill="${color}" opacity="0.15" stroke="${color}" stroke-width="0.8"/>
    <text x="8" y="11" text-anchor="middle" font-family="system-ui,sans-serif" font-size="7" font-weight="600" fill="${color}">${label}</text>
  </svg>`;
}

/** Generate SVG for documents: folded corner page */
function documentIcon(label: string, color: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
    <path d="M3 1.5h7l3 3v9.5a1 1 0 01-1 1H3a1 1 0 01-1-1V2.5a1 1 0 011-1z" fill="${color}" opacity="0.12" stroke="${color}" stroke-width="0.7"/>
    <path d="M10 1.5v3h3" fill="none" stroke="${color}" stroke-width="0.7" opacity="0.5"/>
    <text x="8" y="12" text-anchor="middle" font-family="system-ui,sans-serif" font-size="5.5" font-weight="600" fill="${color}">${label}</text>
  </svg>`;
}

/** Generate SVG for images: landscape/mountain icon */
function imageIcon(color: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
    <rect x="1.5" y="2.5" width="13" height="11" rx="2" fill="${color}" opacity="0.12" stroke="${color}" stroke-width="0.7"/>
    <circle cx="5.5" cy="6" r="1.5" fill="${color}" opacity="0.5"/>
    <path d="M2 11l3.5-3.5 2 2 3-4 3.5 4.5" fill="none" stroke="${color}" stroke-width="0.8" opacity="0.6"/>
  </svg>`;
}

/** Generate SVG for media: play button */
function mediaIcon(color: string, label: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
    <rect x="1.5" y="2.5" width="13" height="11" rx="2" fill="${color}" opacity="0.12" stroke="${color}" stroke-width="0.7"/>
    <polygon points="6.5,5.5 6.5,10.5 11,8" fill="${color}" opacity="0.6"/>
    <text x="8" y="13.5" text-anchor="middle" font-family="system-ui,sans-serif" font-size="4" fill="${color}" opacity="0.5">${label}</text>
  </svg>`;
}

/** Generate SVG for archives: box icon */
function archiveIcon(color: string, label: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
    <rect x="2" y="3" width="12" height="10" rx="1.5" fill="${color}" opacity="0.12" stroke="${color}" stroke-width="0.7"/>
    <line x1="2" y1="6" x2="14" y2="6" stroke="${color}" stroke-width="0.5" opacity="0.4"/>
    <rect x="7" y="4" width="2" height="3" rx="0.5" fill="${color}" opacity="0.3"/>
    <text x="8" y="11.5" text-anchor="middle" font-family="system-ui,sans-serif" font-size="5" font-weight="600" fill="${color}">${label}</text>
  </svg>`;
}

/** Default file icon */
function defaultIcon(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
    <path d="M3 1.5h7l3 3v9.5a1 1 0 01-1 1H3a1 1 0 01-1-1V2.5a1 1 0 011-1z" fill="none" stroke="#565f89" stroke-width="0.7" opacity="0.5"/>
    <path d="M10 1.5v3h3" fill="none" stroke="#565f89" stroke-width="0.7" opacity="0.3"/>
  </svg>`;
}

/**
 * Get an SVG icon string for a filename based on its extension.
 * Returns an inline SVG that can be used with v-html or innerHTML.
 */
export function getRichFileIcon(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const config = EXT_CONFIG[ext];

  if (!config) return defaultIcon();

  switch (config.category) {
    case 'code':
      return codeIcon(config.label, config.color);
    case 'document':
      return documentIcon(config.label, config.color);
    case 'image':
      return imageIcon(config.color);
    case 'media':
      return mediaIcon(config.color, config.label);
    case 'archive':
      return archiveIcon(config.color, config.label);
    default:
      return defaultIcon();
  }
}

/**
 * Get the icon color for a given file extension.
 * Useful for styling borders/badges elsewhere in the UI.
 */
export function getFileIconColor(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return EXT_CONFIG[ext]?.color ?? PALETTE.default;
}

/**
 * Check if a file is an image based on extension.
 */
export function isImageFile(filename: string): boolean {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  return EXT_CONFIG[ext]?.category === 'image';
}

/** Export palette for use by other components */
export { PALETTE };
