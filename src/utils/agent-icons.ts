/**
 * 梅兰竹菊 · 象形 SVG 图标组件
 * 手绘线条风格，和青瓷墨玉设计语言搭配
 *
 * 用法：
 *   import { Plum, Orchid, Bamboo, Chrysanthemum } from '@/utils/agent-icons'
 *   <Plum :size="28" />
 */
import { h, defineComponent } from 'vue'

const svgProps = (size: number, color: string) => ({
  xmlns: 'http://www.w3.org/2000/svg',
  viewBox: '0 0 48 48',
  width: size,
  height: size,
  fill: 'none',
  stroke: color,
  'stroke-width': 2,
  'stroke-linecap': 'round' as const,
  'stroke-linejoin': 'round' as const,
})

/**
 * 梅花 — 五瓣梅花 + 花蕊 + 弯枝
 */
export const Plum = defineComponent({
  name: 'Plum',
  props: {
    size: { type: Number, default: 28 },
    color: { type: String, default: 'currentColor' },
  },
  setup(props) {
    return () => h('svg', svgProps(props.size, props.color), [
      // 花瓣（5 个圆）
      h('circle', { cx: 24, cy: 10, r: 4.5 }),
      h('circle', { cx: 17, cy: 15, r: 4.5 }),
      h('circle', { cx: 31, cy: 15, r: 4.5 }),
      h('circle', { cx: 19, cy: 22, r: 4.5 }),
      h('circle', { cx: 29, cy: 22, r: 4.5 }),
      // 花瓣填充底色
      h('circle', { cx: 24, cy: 18, r: 4, fill: props.color, opacity: 0.2 }),
      // 花蕊
      h('circle', { cx: 24, cy: 17, r: 1.5, fill: props.color }),
      // 枝干
      h('path', { d: 'M24 26 Q22 32 20 38', 'stroke-width': 2.5 }),
      // 小枝
      h('path', { d: 'M20 34 Q16 32 13 30', 'stroke-width': 1.5 }),
    ])
  },
})

/**
 * 兰花 — S 形双叶 + 兰花
 */
export const Orchid = defineComponent({
  name: 'Orchid',
  props: {
    size: { type: Number, default: 28 },
    color: { type: String, default: 'currentColor' },
  },
  setup(props) {
    return () => h('svg', svgProps(props.size, props.color), [
      // 兰叶（两条长弧线）
      h('path', { d: 'M24 40 Q20 28 14 16 Q12 12 16 10 Q20 8 24 14' }),
      h('path', { d: 'M24 40 Q28 28 34 16 Q36 12 32 10 Q28 8 24 14' }),
      // 中叶
      h('path', { d: 'M24 40 Q24 30 22 20' }),
      // 兰花花瓣
      h('ellipse', { cx: 22, cy: 8, rx: 3, ry: 2, transform: 'rotate(-20 22 8)', fill: props.color, opacity: 0.3 }),
      h('ellipse', { cx: 26, cy: 7, rx: 3, ry: 2, transform: 'rotate(15 26 7)', fill: props.color, opacity: 0.3 }),
      // 花心
      h('circle', { cx: 24, cy: 12, r: 1.5, fill: props.color }),
    ])
  },
})

/**
 * 竹子 — 双竿 + 竹节 + 竹叶
 */
export const Bamboo = defineComponent({
  name: 'Bamboo',
  props: {
    size: { type: Number, default: 28 },
    color: { type: String, default: 'currentColor' },
  },
  setup(props) {
    return () => h('svg', svgProps(props.size, props.color), [
      // 竹竿
      h('path', { d: 'M20 42 L20 6', 'stroke-width': 3 }),
      h('path', { d: 'M28 42 L28 6', 'stroke-width': 3 }),
      // 竹节（左竿）
      h('path', { d: 'M18 14 L22 14', 'stroke-width': 2 }),
      h('path', { d: 'M18 24 L22 24', 'stroke-width': 2 }),
      h('path', { d: 'M18 34 L22 34', 'stroke-width': 2 }),
      // 竹节（右竿）
      h('path', { d: 'M26 14 L30 14', 'stroke-width': 2 }),
      h('path', { d: 'M26 24 L30 24', 'stroke-width': 2 }),
      h('path', { d: 'M26 34 L30 34', 'stroke-width': 2 }),
      // 竹叶
      h('path', { d: 'M20 10 Q14 6 10 4', 'stroke-width': 1.5 }),
      h('path', { d: 'M20 10 Q12 10 8 8', 'stroke-width': 1.5 }),
      h('path', { d: 'M28 8 Q34 4 38 4', 'stroke-width': 1.5 }),
      h('path', { d: 'M28 8 Q36 8 40 6', 'stroke-width': 1.5 }),
      h('path', { d: 'M20 20 Q14 18 10 16', 'stroke-width': 1.5 }),
      h('path', { d: 'M28 18 Q34 16 38 14', 'stroke-width': 1.5 }),
    ])
  },
})

/**
 * 菊花 — 十瓣轮状 + 花心 + 茎叶
 */
export const Chrysanthemum = defineComponent({
  name: 'Chrysanthemum',
  props: {
    size: { type: Number, default: 28 },
    color: { type: String, default: 'currentColor' },
  },
  setup(props) {
    return () => h('svg', svgProps(props.size, props.color), [
      // 花瓣（10 片，轮状展开）
      h('path', { d: 'M24 8 Q26 14 24 18 Q22 14 24 8' }),
      h('path', { d: 'M32 10 Q28 15 25 18 Q28 14 32 10' }),
      h('path', { d: 'M37 17 Q31 17 27 18 Q31 16 37 17' }),
      h('path', { d: 'M37 26 Q31 23 27 21 Q31 24 37 26' }),
      h('path', { d: 'M32 34 Q28 28 25 24 Q28 29 32 34' }),
      h('path', { d: 'M24 38 Q22 31 24 26 Q26 31 24 38' }),
      h('path', { d: 'M16 34 Q20 28 23 24 Q20 29 16 34' }),
      h('path', { d: 'M11 26 Q17 23 21 21 Q17 24 11 26' }),
      h('path', { d: 'M11 17 Q17 17 21 18 Q17 16 11 17' }),
      h('path', { d: 'M16 10 Q20 15 23 18 Q20 14 16 10' }),
      // 花心
      h('circle', { cx: 24, cy: 21, r: 3, fill: props.color, opacity: 0.3 }),
      h('circle', { cx: 24, cy: 21, r: 1.5, fill: props.color }),
      // 茎
      h('path', { d: 'M24 24 Q24 30 26 38', 'stroke-width': 2.5 }),
      // 叶
      h('path', { d: 'M26 32 Q30 30 34 28', 'stroke-width': 1.5 }),
      h('path', { d: 'M26 32 Q32 34 36 36', 'stroke-width': 1.5 }),
    ])
  },
})

/** Agent ID → 图标组件映射 */
export const AGENT_ICONS: Record<string, typeof Plum> = {
  claude: Plum,
  codex: Orchid,
  openclaw: Bamboo,
  hermes: Chrysanthemum,
}

/** Agent ID → 色彩映射（植物本色） */
export const AGENT_COLORS: Record<string, string> = {
  claude: '#d4577b',   // 梅花粉红
  codex: '#6a994e',    // 兰叶翠绿
  openclaw: '#4caf50', // 竹青绿
  hermes: '#f0a830',   // 菊花金黄
}
