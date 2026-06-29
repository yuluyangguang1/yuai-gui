/**
 * 统一图标系统
 *
 * 两层架构：
 * 1. Tabler Icons（TIcon 组件）— SVG 矢量，风格统一，用于 UI 控件
 * 2. Unicode 字形 — 毛笔风格，用于 Agent 品牌标识（梅兰竹菊）和功能单字
 *
 * 用法：
 *   import { ICONS, getFileIcon } from '@/utils/icons'
 *   import { TIcon, preloadCommonIcons } from '@/utils/tabler-icons'
 */

// ── Tabler 图标 re-export ──
export { TIcon, preloadCommonIcons, ICON_MAP } from './tabler-icons'

// ── 梅兰竹菊象形图标 re-export ──
export { Plum, Orchid, Bamboo, Chrysanthemum, AGENT_ICONS, AGENT_COLORS } from './agent-icons'

/**
 * Unicode 字形系统（保留用于品牌标识和功能单字）
 * 这些是「青瓷墨玉」设计语言的毛笔风格元素，不用 Tabler 替代
 */
export const ICONS = {
  // ── Agent 品牌字形（毛笔风格，不可替代）──
  mei: '梅',
  lan: '兰',
  zhu: '竹',
  ju: '菊',

  // ── 功能单字（毛笔风格，用于侧边栏导航）──
  group: '合',
  beam: '束',
  skills: '技',
  devices: '网',
  terminal: '端',
  preview: '览',
  workspace: '文',
  wechat: '微',
  kanbanGlyph: '板',
  writeGate: '审',
  mcp: '桥',
  memory: '忆',
  usage: '量',
  organize: '理',

  // ── 文件类型标签（2字母缩写）──
  fileTypes: {
    // 代码
    js: 'JS', mjs: 'JS', cjs: 'JS',
    ts: 'TS', tsx: 'TS', jsx: 'JS',
    vue: 'Vu',
    rs: 'Rs',
    py: 'Py',
    go: 'Go',
    java: 'Jv',
    c: 'C', h: 'C', cpp: 'C', hpp: 'C', cs: 'C#',
    rb: 'Rb',
    php: 'Ph',
    swift: 'Sw',
    kt: 'Kt',
    sql: 'Sq',
    sh: '$_', zsh: '$_', bash: '$_',

    // 样式
    css: 'Cs',
    scss: 'Cs',
    sass: 'Cs',
    less: 'Cs',

    // 标记
    html: 'Ht',
    xml: 'Xm',
    md: 'Md',

    // 数据
    json: '{}',
    yaml: 'Ym',
    yml: 'Ym',
    toml: 'Tm',
    ini: 'In',
    csv: 'Cs',

    // 配置
    lock: 'Lk',
    env: 'En',

    // 媒体
    png: '图', jpg: '图', jpeg: '图', gif: '图', webp: '图',
    svg: 'Svg',
    mp4: '视', mov: '视', webm: '视',
    mp3: '音', wav: '音', flac: '音',

    // 文档
    pdf: 'Pdf',
    doc: 'Wd', docx: 'Wd',
    xlsx: 'Xl', xls: 'Xl',

    // 压缩
    zip: 'Zip', tar: 'Tar', gz: 'Gz', '7z': '7z', dmg: 'Dmg',

    // 其他
    txt: 'Tx', log: 'Lg', plist: 'Pl',
  } as Record<string, string>,

  // ── 看板状态字形 ──
  kanban: {
    triage: '◇',
    todo: '○',
    scheduled: '◐',
    ready: '◎',
    running: '●',
    blocked: '⊘',
    review: '◑',
    done: '✓',
    archived: '▪',
  } as Record<string, string>,
} as const

/** 获取文件类型图标 */
export function getFileIcon(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || ''
  return ICONS.fileTypes[ext] || '·'
}

/** 获取看板状态图标 */
export function getKanbanIcon(status: string): string {
  return ICONS.kanban[status] || ICONS.kanban.todo
}

/** 获取 Agent 字形 */
export function getAgentGlyph(agentId: string): string {
  const map: Record<string, string> = {
    claude: ICONS.mei,
    codex: ICONS.lan,
    openclaw: ICONS.zhu,
    hermes: ICONS.ju,
  }
  return map[agentId] || agentId[0]
}
