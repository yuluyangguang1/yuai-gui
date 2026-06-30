/**
 * Tabler Icons 统一封装 — 静态 import 版本
 * 直接导入所需图标，避免 Vite 动态 import 限制
 */
import { h, defineComponent } from 'vue'

// ── 静态导入所有用到的图标 ──
import {
  IconX, IconRefresh, IconSettings, IconChevronRight, IconChevronDown,
  IconChevronUp, IconChevronLeft,
  IconPlayerPlay, IconPlayerPause, IconSearch, IconPlus, IconMinus,
  IconPencil, IconCopy, IconCheck, IconAlertTriangle, IconInfoCircle,
  IconTrash, IconSend, IconEye, IconEyeOff, IconLock, IconLockOpen,
  IconKey, IconExternalLink, IconDownload, IconUpload, IconShare,
  IconBell, IconBookmark, IconHeart, IconStar, IconStarFilled,
  IconFilter, IconSelector, IconMenu, IconDots, IconMaximize, IconMinimize,
  IconFolder, IconFolderOpen, IconFile, IconFileCode, IconFileText,
  IconArrowUp, IconArrowDown, IconArrowLeft, IconArrowRight,
  IconHome, IconTerminal, IconCode, IconMessageCircle, IconPlug,
  IconBrain, IconSparkles, IconDeviceDesktop, IconDatabase, IconCpu,
  IconNetwork, IconWifi, IconLink, IconServer, IconShield,
  IconBug, IconTool, IconBolt, IconSun, IconMoon, IconPalette,
  IconCamera, IconPhoto, IconVideo, IconMusic, IconMicrophone,
  IconVolume, IconVolumeOff, IconMail, IconPhone, IconMessage,
  IconUser, IconUsers, IconRobot, IconClock, IconCalendar,
  IconHistory, IconHourglass, IconRotate, IconRotate2,
  IconLayout, IconLayoutGrid, IconLayoutList, IconLayoutSidebar,
  IconLayoutDashboard, IconList, IconTable, IconChartBar,
  IconSortAscending, IconSortDescending, IconGitBranch,
  IconGitCommit, IconGitMerge, IconCircle, IconPointFilled, IconPoint,
  IconAlertCircle, IconLoader, IconCircleCheck, IconCircleX, IconBan,
  IconArchive, IconSchema, IconFlame, IconWind, IconSnowflake,
  IconDiamond, IconCrown, IconAward, IconTrophy, IconFeather,
  IconWand, IconPaw, IconCompass, IconAnchor,
  IconInbox, IconLayoutKanban,
} from '@tabler/icons-vue'

// ── 图标映射表 ──
const ICONS_MAP: Record<string, any> = {
  // 动作
  close: IconX, x: IconX, refresh: IconRefresh, settings: IconSettings,
  expand: IconChevronRight, collapse: IconChevronDown,
  play: IconPlayerPlay, pause: IconPlayerPause, search: IconSearch,
  add: IconPlus, plus: IconPlus, remove: IconMinus, minus: IconMinus,
  edit: IconPencil, copy: IconCopy, check: IconCheck,
  warning: IconAlertTriangle, info: IconInfoCircle,
  trash: IconTrash, send: IconSend, eye: IconEye, eyeOff: IconEyeOff,
  lock: IconLock, lockOpen: IconLockOpen, key: IconKey,
  external: IconExternalLink, download: IconDownload, upload: IconUpload,
  share: IconShare, bell: IconBell, bookmark: IconBookmark,
  heart: IconHeart, star: IconStar, starFilled: IconStarFilled,
  filter: IconFilter, sort: IconSelector, menu: IconMenu, dots: IconDots,
  maximize: IconMaximize, minimize: IconMinimize,
  inbox: IconInbox, playerPlay: IconPlayerPlay, layoutKanban: IconLayoutKanban,

  // 导航
  folder: IconFolder, folderOpen: IconFolderOpen, file: IconFile,
  fileCode: IconFileCode, fileText: IconFileText,
  arrowUp: IconArrowUp, arrowDown: IconArrowDown,
  arrowLeft: IconArrowLeft, arrowRight: IconArrowRight,
  chevronRight: IconChevronRight, chevronLeft: IconChevronLeft,
  chevronUp: IconChevronUp, chevronDown: IconChevronDown,
  home: IconHome, back: IconArrowLeft,

  // 功能
  terminal: IconTerminal, code: IconCode,
  messageCircle: IconMessageCircle, plug: IconPlug,
  brain: IconBrain, sparkles: IconSparkles,
  deviceDesktop: IconDeviceDesktop, database: IconDatabase,
  cpu: IconCpu, network: IconNetwork, wifi: IconWifi,
  link: IconLink, server: IconServer, shield: IconShield,
  bug: IconBug, tool: IconTool, bolt: IconBolt,
  sun: IconSun, moon: IconMoon, palette: IconPalette,

  // 媒体
  camera: IconCamera, photo: IconPhoto, video: IconVideo,
  music: IconMusic, microphone: IconMicrophone,
  volume: IconVolume, volumeOff: IconVolumeOff,

  // 通讯
  mail: IconMail, phone: IconPhone, message: IconMessage,

  // 用户
  user: IconUser, users: IconUsers, robot: IconRobot,

  // 时间
  clock: IconClock, calendar: IconCalendar,
  history: IconHistory, hourglass: IconHourglass,

  // 布局
  layout: IconLayout, layoutGrid: IconLayoutGrid,
  layoutList: IconLayoutList, layoutSidebar: IconLayoutSidebar,
  layoutDashboard: IconLayoutDashboard, list: IconList,
  table: IconTable, chart: IconChartBar, chartBar: IconChartBar,

  // 排序
  sortAsc: IconSortAscending, sortDesc: IconSortDescending,

  // Git
  branch: IconGitBranch, gitBranch: IconGitBranch,
  commit: IconGitCommit, gitCommit: IconGitCommit,
  merge: IconGitMerge, gitMerge: IconGitMerge,

  // 状态
  circle: IconCircle, point: IconPoint, pointFilled: IconPointFilled,
  statusOnline: IconPointFilled, statusBusy: IconClock,
  statusOffline: IconPoint, statusError: IconAlertCircle,
  running: IconLoader, success: IconCircleCheck,
  error: IconCircleX, pending: IconClock, blocked: IconBan,

  // 看板
  triage: IconSelector, todo: IconCircle,
  scheduled: IconClock, ready: IconCircleCheck,
  review: IconEye, done: IconCheck, archived: IconArchive,

  // 工作流
  workflow: IconSchema, schema: IconSchema,

  // 其他
  flame: IconFlame, wind: IconWind, snowflake: IconSnowflake,
  diamond: IconDiamond, crown: IconCrown, award: IconAward,
  trophy: IconTrophy, feather: IconFeather, wand: IconWand,
  paw: IconPaw, compass: IconCompass, anchor: IconAnchor,
  undo: IconRotate, redo: IconRotate2,
  rotate: IconRotate, rotate2: IconRotate2,
}

/**
 * TIcon 组件
 *
 * Props:
 *   name    — 图标名（如 'settings'）
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
      const icon = ICONS_MAP[props.name]
      if (!icon) {
        // 找不到图标时显示占位
        return h('span', {
          style: {
            display: 'inline-flex',
            width: props.size + 'px',
            height: props.size + 'px',
            alignItems: 'center',
            justifyContent: 'center',
            color: props.color,
            fontSize: props.size * 0.5 + 'px',
            opacity: 0.4,
          },
        }, '·')
      }
      return h(icon, {
        size: props.size,
        color: props.color,
        stroke: props.stroke,
      })
    }
  },
})

/** 预加载（静态 import 已自动包含，此函数保留兼容） */
export async function preloadCommonIcons() {
  // 静态 import 无需预加载
}

export { ICONS_MAP as ICON_MAP }
