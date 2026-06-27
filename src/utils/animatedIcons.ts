/**
 * Animated SVG Icons for Vue 3
 * 参考 itshover (2.3k stars) — 动画图标
 * 使用 CSS transitions 代替 motion/react
 */

import { ref, onMounted, onUnmounted, type Ref } from 'vue'

/** 动画图标 composable */
export function useAnimatedIcon() {
  const isHovered = ref(false)
  const scope: Ref<HTMLElement | null> = ref(null)

  function startAnimation() {
    isHovered.value = true
  }

  function stopAnimation() {
    isHovered.value = false
  }

  return { isHovered, scope, startAnimation, stopAnimation }
}

/** 动画图标 SVG 路径定义 */
export const ANIMATED_ICONS = {
  // ── 导航 ──
  arrowBack: {
    viewBox: '0 0 24 24',
    paths: [
      { d: 'M12 19V5', stroke: 'currentColor', fill: 'none' },
      { d: 'M5 12l7-7 7 7', stroke: 'currentColor', fill: 'none' },
    ],
    animation: 'arrow-back',
  },
  arrowForward: {
    viewBox: '0 0 24 24',
    paths: [
      { d: 'M12 5v14', stroke: 'currentColor', fill: 'none' },
      { d: 'M19 12l-7 7-7-7', stroke: 'currentColor', fill: 'none' },
    ],
    animation: 'arrow-forward',
  },

  // ── 收藏 ──
  star: {
    viewBox: '0 0 24 24',
    paths: [
      {
        d: 'M12 17.75l-6.172 3.245l1.179-6.873l-5-4.867l6.9-1l3.086-6.253l3.086 6.253l6.9 1l-5 4.867l1.179 6.873z',
        stroke: 'currentColor',
        fill: 'none',
        classes: ['star-outline'],
      },
      {
        d: 'M12 17.75l-6.172 3.245l1.179-6.873l-5-4.867l6.9-1l3.086-6.253l3.086 6.253l6.9 1l-5 4.867l1.179 6.873z',
        fill: 'currentColor',
        stroke: 'none',
        classes: ['star-fill'],
      },
    ],
    animation: 'star',
  },

  // ── 搜索 ──
  search: {
    viewBox: '0 0 24 24',
    paths: [
      { d: 'M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14z', stroke: 'currentColor', fill: 'none' },
      { d: 'M15 15l6 6', stroke: 'currentColor', fill: 'none', strokeLinecap: 'round' },
    ],
    animation: 'search',
  },

  // ── 设置 ──
  settings: {
    viewBox: '0 0 24 24',
    paths: [
      { d: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', stroke: 'currentColor', fill: 'none' },
      {
        d: 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
        stroke: 'currentColor',
        fill: 'none',
      },
    ],
    animation: 'settings',
  },

  // ── 关闭 ──
  close: {
    viewBox: '0 0 24 24',
    paths: [
      { d: 'M18 6L6 18', stroke: 'currentColor', fill: 'none', strokeLinecap: 'round' },
      { d: 'M6 6l12 12', stroke: 'currentColor', fill: 'none', strokeLinecap: 'round' },
    ],
    animation: 'close',
  },

  // ── 检查 ──
  check: {
    viewBox: '0 0 24 24',
    paths: [
      { d: 'M20 6L9 17l-5-5', stroke: 'currentColor', fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' },
    ],
    animation: 'check',
  },

  // ── 刷新 ──
  refresh: {
    viewBox: '0 0 24 24',
    paths: [
      { d: 'M21 12a9 9 0 1 1-6.219-8.56', stroke: 'currentColor', fill: 'none', strokeLinecap: 'round' },
      { d: 'M21 3v6h-6', stroke: 'currentColor', fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' },
    ],
    animation: 'refresh',
  },

  // ── 加载 ──
  loader: {
    viewBox: '0 0 24 24',
    paths: [
      { d: 'M12 2v4', stroke: 'currentColor', fill: 'none', strokeLinecap: 'round' },
      { d: 'M12 18v4', stroke: 'currentColor', fill: 'none', strokeLinecap: 'round' },
      { d: 'M4.93 4.93l2.83 2.83', stroke: 'currentColor', fill: 'none', strokeLinecap: 'round' },
      { d: 'M16.24 16.24l2.83 2.83', stroke: 'currentColor', fill: 'none', strokeLinecap: 'round' },
      { d: 'M2 12h4', stroke: 'currentColor', fill: 'none', strokeLinecap: 'round' },
      { d: 'M18 12h4', stroke: 'currentColor', fill: 'none', strokeLinecap: 'round' },
      { d: 'M4.93 19.07l2.83-2.83', stroke: 'currentColor', fill: 'none', strokeLinecap: 'round' },
      { d: 'M16.24 7.76l2.83-2.83', stroke: 'currentColor', fill: 'none', strokeLinecap: 'round' },
    ],
    animation: 'loader',
  },

  // ── 文件夹 ──
  folder: {
    viewBox: '0 0 24 24',
    paths: [
      { d: 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z', stroke: 'currentColor', fill: 'none' },
    ],
    animation: 'folder',
  },

  // ── 文件 ──
  file: {
    viewBox: '0 0 24 24',
    paths: [
      { d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z', stroke: 'currentColor', fill: 'none' },
      { d: 'M14 2v6h6', stroke: 'currentColor', fill: 'none' },
      { d: 'M16 13H8', stroke: 'currentColor', fill: 'none' },
      { d: 'M16 17H8', stroke: 'currentColor', fill: 'none' },
      { d: 'M10 9H8', stroke: 'currentColor', fill: 'none' },
    ],
    animation: 'file',
  },
} as const

/** 动画 keyframes CSS */
export const ANIMATED_ICON_CSS = `
/* ── Animated Icon Base ── */
.animated-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s ease;
}

.animated-icon svg {
  transition: all 0.3s ease;
}

/* ── Arrow Back ── */
.animated-icon[data-animation="arrow-back"]:hover svg {
  transform: translateX(-3px);
}

/* ── Arrow Forward ── */
.animated-icon[data-animation="arrow-forward"]:hover svg {
  transform: translateX(3px);
}

/* ── Star ── */
.animated-icon[data-animation="star"] .star-fill {
  opacity: 0;
  transform: scale(0.8);
  transform-origin: center;
  transition: all 0.3s ease;
}

.animated-icon[data-animation="star"]:hover .star-fill {
  opacity: 1;
  transform: scale(1);
}

.animated-icon[data-animation="star"]:hover .star-outline {
  transform: scale(1.1) rotate(-5deg);
  transform-origin: center;
  transition: all 0.3s ease;
}

/* ── Search ── */
.animated-icon[data-animation="search"]:hover svg {
  transform: scale(1.1);
}

/* ── Settings ── */
.animated-icon[data-animation="settings"]:hover svg {
  transform: rotate(90deg);
  transform-origin: center;
}

/* ── Close ── */
.animated-icon[data-animation="close"]:hover svg {
  transform: rotate(90deg);
  transform-origin: center;
}

/* ── Check ── */
.animated-icon[data-animation="check"]:hover svg {
  transform: scale(1.2);
  transform-origin: center;
}

/* ── Refresh ── */
.animated-icon[data-animation="refresh"]:hover svg {
  transform: rotate(180deg);
  transform-origin: center;
}

/* ── Loader ── */
.animated-icon[data-animation="loader"] svg {
  animation: icon-spin 1s linear infinite;
}

.animated-icon[data-animation="loader"]:hover svg {
  animation-duration: 0.5s;
}

@keyframes icon-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* ── Folder ── */
.animated-icon[data-animation="folder"]:hover svg {
  transform: translateY(-2px);
}

/* ── File ── */
.animated-icon[data-animation="file"]:hover svg {
  transform: translateY(-2px) rotate(-3deg);
  transform-origin: center;
}
`

export type AnimatedIconName = keyof typeof ANIMATED_ICONS
