/**
 * Tabler Icons 统一封装
 * 替代纯 Unicode 字符，风格一致，跨平台无差异
 *
 * 用法：
 *   import { TIcon } from '@/utils/tabler-icons'
 *   <TIcon name="settings" :size="18" />
 *
 * 保留 agents 毛笔字形（梅兰竹菊）不动 — 那是品牌标识
 */
import { h, defineComponent, type PropType } from 'vue'

// ── 图标映射：旧 ICONS key → Tabler 组件名 ──
const ICON_MAP: Record<string, string> = {
  // 动作
  close: 'IconX',
  refresh: 'IconRefresh',
  settings: 'IconSettings',
  expand: 'IconChevronRight',
  collapse: 'IconChevronDown',
  play: 'IconPlayerPlay',
  pause: 'IconPlayerPause',
  search: 'IconSearch',
  add: 'IconPlus',
  remove: 'IconMinus',
  edit: 'IconPencil',
  copy: 'IconCopy',
  undo: 'IconRotateCounterClockwise',
  redo: 'IconRotateClockwise',
  check: 'IconCheck',
  cross: 'IconX',
  warning: 'IconAlertTriangle',
  info: 'IconInfoCircle',
  trash: 'IconTrash',
  save: 'IconDeviceFloppy',
  send: 'IconSend',
  eye: 'IconEye',
  eyeOff: 'IconEyeOff',
  lock: 'IconLock',
  lockOpen: 'IconLockOpen',
  key: 'IconKey',
  external: 'IconExternalLink',
  download: 'IconDownload',
  upload: 'IconUpload',
  share: 'IconShare',
  bell: 'IconBell',
  bookmark: 'IconBookmark',
  heart: 'IconHeart',
  star: 'IconStar',
  starFilled: 'IconStarFilled',
  filter: 'IconFilter',
  sort: 'IconSelector',
  menu: 'IconMenu',
  dots: 'IconDots',
  maximize: 'IconMaximize',
  minimize: 'IconMinimize',

  // 导航
  folder: 'IconFolder',
  folderOpen: 'IconFolderOpen',
  file: 'IconFile',
  fileCode: 'IconFileCode',
  fileText: 'IconFileText',
  arrowUp: 'IconArrowUp',
  arrowDown: 'IconArrowDown',
  arrowLeft: 'IconArrowLeft',
  arrowRight: 'IconArrowRight',
  chevronRight: 'IconChevronRight',
  chevronLeft: 'IconChevronLeft',
  chevronUp: 'IconChevronUp',
  chevronDown: 'IconChevronDown',
  home: 'IconHome',
  back: 'IconArrowLeft',

  // 功能
  terminal: 'IconTerminal',
  code: 'IconCode',
  preview: 'IconEye',
  workspace: 'IconFolder',
  wechat: 'IconMessageCircle',
  kanban: 'IconLayoutKanban',
  writeGate: 'IconShieldCheck',
  mcp: 'IconPlugConnected',
  memory: 'IconBrain',
  usage: 'IconChartBar',
  organize: 'IconLayoutGrid',
  skills: 'IconSparkles',
  devices: 'IconDeviceDesktop',
  workflow: 'IconSchema',
  git: 'IconGitBranch',
  gitCommit: 'IconGitCommit',
  gitMerge: 'IconGitMerge',

  // 状态
  statusOnline: 'IconPointFilled',
  statusBusy: 'IconClock',
  statusOffline: 'IconPoint',
  statusError: 'IconAlertCircle',
  running: 'IconLoader',
  success: 'IconCircleCheck',
  error: 'IconCircleX',
  pending: 'IconClock',
  blocked: 'IconBan',

  // 系统
  cpu: 'IconCpu',
  memory_hw: 'IconCpu2',
  disk: 'IconDatabase',
  network: 'IconNetwork',
  wifi: 'IconWifi',
  link: 'IconLink',
  server: 'IconServer',
  plug: 'IconPlug',
  shield: 'IconShield',
  bug: 'IconBug',
  tool: 'IconTool',
  bolt: 'IconBolt',
  sun: 'IconSun',
  moon: 'IconMoon',
  palette: 'IconPalette',

  // 媒体
  camera: 'IconCamera',
  photo: 'IconPhoto',
  video: 'IconVideo',
  music: 'IconMusic',
  microphone: 'IconMicrophone',
  volume: 'IconVolume',
  volumeOff: 'IconVolumeOff',

  // 通讯
  mail: 'IconMail',
  phone: 'IconPhone',
  message: 'IconMessage',
  messageCircle: 'IconMessageCircle',

  // 用户
  user: 'IconUser',
  users: 'IconUsers',
  robot: 'IconRobot',

  // 时间
  clock: 'IconClock',
  calendar: 'IconCalendar',
  history: 'IconHistory',
  hourglass: 'IconHourglass',

  // 布局
  layout: 'IconLayout',
  layoutGrid: 'IconLayoutGrid',
  layoutList: 'IconLayoutList',
  layoutSidebar: 'IconLayoutSidebar',
  layoutDashboard: 'IconLayoutDashboard',
  list: 'IconList',
  table: 'IconTable',
  chart: 'IconChartBar',

  // 排序
  sortAsc: 'IconSortAscending',
  sortDesc: 'IconSortDescending',

  // Git
  branch: 'IconGitBranch',
  commit: 'IconGitCommit',
  merge: 'IconGitMerge',

  // 看板
  triage: 'IconSelector',
  todo: 'IconCircle',
  scheduled: 'IconClock',
  ready: 'IconCircleCheck',
  review: 'IconEye',
  done: 'IconCheck',
  archived: 'IconArchive',
}

// ── 懒加载缓存 ──
const iconCache = new Map<string, any>()

async function loadIcon(name: string): Promise<any> {
  if (iconCache.has(name)) return iconCache.get(name)
  try {
    const mod = await import(`@tabler/icons-vue/dist/esm/icons/${name}.mjs`)
    const icon = mod.default || mod[name]
    iconCache.set(name, icon)
    return icon
  } catch {
    console.warn(`[TIcon] 图标未找到: ${name}`)
    return null
  }
}

/**
 * TIcon 组件 — 统一图标入口
 *
 * Props:
 *   name    — ICONS key（如 'settings'）或 Tabler 组件名（如 'IconSettings'）
 *   size    — 尺寸 px，默认 18
 *   color   — 颜色，默认 currentColor
 *   stroke  — 线条宽度，默认 1.8
 */
export const TIcon = defineComponent({
  name: 'TIcon',
  props: {
    name: { type: String, required: true },
    size: { type: Number, default: 18 },
    color: { type: String, default: 'currentColor' },
    stroke: { type: Number, default: 1.8 },
  },
  setup(props) {
    return () => {
      // 解析图标名：支持 ICONS key 或直接 Tabler 名
      const tablerName = ICON_MAP[props.name] || props.name

      // 同步尝试从缓存渲染
      const cached = iconCache.get(tablerName)
      if (cached) {
        return h(cached, {
          size: props.size,
          color: props.color,
          stroke: props.stroke,
        })
      }

      // 异步加载并触发更新
      loadIcon(tablerName).then(() => {
        // 触发 Vue 重新渲染（通过缓存更新）
      })

      // 占位符
      return h('span', {
        style: {
          display: 'inline-flex',
          width: props.size + 'px',
          height: props.size + 'px',
          alignItems: 'center',
          justifyContent: 'center',
          color: props.color,
          fontSize: props.size * 0.6 + 'px',
          opacity: 0.3,
        },
      }, '·')
    }
  },
})

/**
 * 预加载常用图标（在 App 启动时调用）
 */
export async function preloadCommonIcons() {
  const common = [
    'IconX', 'IconSettings', 'IconSearch', 'IconPlus', 'IconMinus',
    'IconCheck', 'IconRefresh', 'IconTerminal', 'IconCode', 'IconEye',
    'IconFolder', 'IconFile', 'IconPencil', 'IconCopy', 'IconTrash',
    'IconSend', 'IconArrowLeft', 'IconArrowRight', 'IconChevronRight',
    'IconChevronDown', 'IconPlayerPlay', 'IconPlayerPause', 'IconAlertTriangle',
    'IconInfoCircle', 'IconStar', 'IconStarFilled', 'IconPointFilled',
    'IconLock', 'IconKey', 'IconShield', 'IconPlug', 'IconBrain',
    'IconSparkles', 'IconRobot', 'IconUsers', 'IconHome', 'IconMenu',
    'IconLoader', 'IconCircleCheck', 'IconCircleX', 'IconClock',
    'IconGitBranch', 'IconDeviceDesktop', 'IconDatabase', 'IconCpu',
    'IconMessageCircle', 'IconLayoutKanban', 'IconSchema',
  ]
  await Promise.all(common.map(loadIcon))
}

export { ICON_MAP }
