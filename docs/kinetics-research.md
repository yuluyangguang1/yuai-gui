# 桌面应用弹簧动画（Kinetics）实现调研

## 1. 研究目标
研究如何在 `yuai-gui`（Tauri + Vue 3 桌面应用）中引入基于物理的弹簧动画（Spring/Kinetics），参考 Linear / VS Code / Slack 等桌面应用的动画模式。

## 2. yuai-gui 当前动画现状

- **技术栈**：Tauri（桌面壳） + Vue 3.5 + TypeScript + Vite
- **根组件**：`src/App.vue`，包含 `AppRail`（侧边导航）、多个面板、Toast、CommandPalette 等
- **样式体系**：统一设计语言在 `design-system.css` / `effects.css` / `components.css`

### 已存在的动画能力

| 位置 | 技术 | 状态 |
|------|------|------|
| `design-system.css` | CSS `@keyframes spring-*` + `cubic-bezier(0.34, 1.56, 0.64, 1)` | **已定义但几乎未使用**；组件中无 `.spring-in` 等类引用 |
| `AppRail.vue` | CSS `transition: all 0.15s` | 基础过渡，非 spring 物理 |
| `ScreenshotToast.vue` | Vue `<Transition>` + 自定义 cubic-bezier | 局部出现/消失过渡 |
| `ToastContainer.vue` | Vue `<TransitionGroup>` + 自定义 cubic-bezier | 列表入场/离场 |
| `AnimatedIcon.vue` | CSS `transition` 实现图标 hover 动画 | 点对点控制 |
| `effects.css` | CSS `@keyframes`（pulse、dropIn、liveZap、springPop 等） | 主要用于：状态脉冲、文件卡片涟漪、涟漪 | 用于文件卡片和涟漪；**无真实 spring 物理参数** |

**核心问题**：目前没有基于“弹簧物理模型（阻尼谐振子）”的真正 Spring 动画；所有效果均为静态 `ease` / `cubic-bezier(0.34, 1.56, 0.64, 1)` 或简单 ease-in-out 套路。

## 3. 知名桌面应用的动画模式

### 3.1 Linear macOS
- 所有微交互（侧栏展开、导航选中、模态、Toast）统一使用 `cubic-bezier(0.2, 0.8, 0.2, 1)`  Toward 的“工业级”即时、轻微过冲感
- 配合 **Figma Motion**（内部工具）统一生成为 Lottie 或 CSS 曲线
- 窗体和下拉菜单高度依赖 `NSViewAnimation` / `CALayer` 的物理曲线

### 3.2 VS Code
- 无库直接操作 DOM；在 Electron 主进程/渲染进程中，使用标准 CSS `transition-timing-function`
- 核心窗口缩放使用 `cubic-bezier(0.32, 0.72, 0, 1)`，呈现“入门快、落点平滑”特征
- 侧边栏折叠使用 `ease-in-out` 但时长短（100ms），体现“响应即见”的即时感

### 3.3 Slack macOS
- 广泛使用 **Framer Motion** (React Web 版) 和原生的 `NSAnimationContext`（Swift 版）
- 动画曲线统一为 `cubic-bezier(0.16, 1, 0.3, 1)` —— Expo out（指数出），视觉类似弹簧但更克制

**共同特征**：
1. **全局统一曲线变量**：通过 CSS 变量提供 3~4 档弹簧曲线
2. **按场景分级时长**：micro 120ms，small 250ms，large 400ms
3. **关闭/离开动画通常快于进入动画**，避免滞留感
4. **不滥用过冲**：仅用于目标元素，不在滚动条、细边框上使用

## 4. 桌面应用 Kinetics（弹簧动画）实现方案

桌面应用动画最佳实践是：**使用真弹簧参数（stiffness / damping / mass）驱动，而非静态 cubic-bezier 近似**。原因在于：
- 启动停止速度不同时，单条 cubic-bezier 无法兼顾
- 弹簧物理可根据持续时间和位移自动计算最自然的曲线

### 方案对比

| 方案 | 浏览器/桌面 | 性能 | 与 Tauri/Vue 集成 | 可维护性 | 推荐度 |
|------|-------------|------|-------------------|----------|--------|
| **Framer Motion** (Vue 适配) | 高 | 高 | 中（React 优先） | 极高 | ⭐⭐⭐ |
| **Motion One** | 高 | **极高**（WAAPI） | 好（与 Vue Transition 兼容） | 高 | ⭐⭐⭐⭐⭐ |
| **auto-animate** | 高 | 好 | 中 | 高 | ⭐⭐⭐⭐ |
| **Popmotion + Vue** | - | - | - | - | 停止维护 |
| **原生 WAAPI (Web Animations API)** | 高 | 极高 | 好（需封装） | 中 | ⭐⭐⭐⭐ |
| **Tauri 原生 (tauri-plugin-animation)** | Tauri 侧 | 中 | 需 Rust 桥接 | 低 | ⭐⭐ |
| **CSS 变量 + keyframes** | 高 | 高 | **原生** | 中 | ⭐⭐⭐（现有方案） |

## 5. 推荐方案

### 首选：Motion One（由 framer-motion 作者出品，专为性能设计）
Motion One 轻量、WAAPI 原生、可精确控制 spring 参数，且能无缝接入现有 Vue `<Transition>` 组件。

**理由**：
1. **体积最小**：核心仅 3.7 kB gzip
2. **Spring 准确**：标准 spring (stiffness/damping/mass)
3. **与 Tauri 兼容**：浏览器渲染色域，不依赖额外 Rust 层
4. **可配置 easing 变量**：与现有 design-system.css 变量一一对应

### 次要方案：原生 WAAPI + 辅助函数
如果不想引入新库，可使用浏览器自带 Web Animations API 封装 spring 计算，然后把 Motion One 作为后备对比项。

### 备选方案：auto-animate (Formkit 出品)
用于“视图列表”（看板、文件列表）的自动布局动画，适合 Kanban / 文件树等列表项重排场景。

## 6. 建议落地结构

```
src/
├── styles/
│   └── kinet.css            ← 从 design-system.css 独立出 motion/kinet 变量
├── lib/
│   └── spring.ts            ← 封装 Motion One / WAAPI spring 参数
│   └── transition.ts        ← Vue Transition 全局 hook（全局映射 spring-*）
│   └── presets/
│       ├── rail.ts          ← AppRail 进入/离开的 spring 预设
│       ├── panel.ts         ← PreviewPanel 展开/收缩
│       └── modal.ts         ← 模态/命令面板
└── components/
    └── layout/
        └── AppRail.vue      ← 替换 transition: all 为真实 spring transition
```

### Spring 参数参考（MTT/生产级）

```ts
// 参考 Linear / 可交互设计系统
const SPRING_PRESETS = {
  // 用于 AppRail 激活、按钮 hover
  snappy: { stiffness: 400, damping: 28 },

  // 用于侧栏展开、面板显示
  smooth: { stiffness: 180, damping: 20 },

  // 用于 Toast、下拉、命令面板
  bouncy: { stiffness: 260, damping: 22 },

  // 用于 Toast 关闭、列表删除
  exit: { stiffness: 350, damping: 30 },
} as const;

// 转换为 CSS-style easing：若想继续用 CSS @keyframes，可用 cubic-bezier 近似：
function springToBezier(preset: SpringOptions) {
  // 参考：framer-motion spring -> cubic-bezier 近似，或 Motion One 内置
  // 在此处封装为设计系统变量
}
```

### Vue Transition 全局接入示例

```vue
<!-- App.vue 全局使用 -->
<template>
  <router-view v-slot="{ Component, route }">
    <transition name="spring-slide" mode="out-in">
      <component :is="Component" :key="route.path" />
    </transition>
  </router-view>
</template>
```

```css
/* spring-slide 映射 Motion One spring 曲线 */
.spring-slide-enter-active {
  transition: all 350ms cubic-bezier(0.34, 1.3, 0.64, 1);
}
.spring-slide-leave-active {
  transition: all 220ms cubic-bezier(0.4, 0, 0.6, 1);
}
```

> 注意：需配合 `<style>` 装置（Tauri + electron 才能使用 `@property` 以实现 `interpolate-size: allow-discrete;`；常规 Web 需先知动画起始值，保证 Web Animations API 能正确插值）。

## 7. 落地建议与规避坑

| 注意点 | 说明 |
|--------|------|
| **不要在滚动条上使用弹簧** | 视觉效果嘈杂且影响性能 |
| **避重就轻** | 低优先级元素（分隔线、次要文字）使用 0.12s ease；高优先级（侧栏、顶部标题栏）使用 spring |
| **淡入淡出不滥用 spring** | Overlay / backdrop 使用 linear fade，spring 仅用于位移或缩放 |
| **统一维护曲线** | 所有 spring 参数写入 `design-system.css` 或专用 `kinet.css`，组件只引用变量 |
| **考虑 Tauri WebView 渲染管线** | 某些旧版 WebView2/WebKit 对 WAAPI 某些特性支持不一，需设 graceful fallback |
| **禁用 AppRail transition: all** | 当前 `AppRail.vue` 使用 `transition: all 0.15s`；应明确列出要过渡的属性 `transition: background 180ms, color 180ms`，避免意外抖动 |

## 8. 下一步行动

1. **向项目引入 Motion One（或自有 WAAPI 封装）**作为依赖
2. **将 `design-system.css` 中的 spring 变量升级**为真正的 spring 生成器函数
3. **替换 AppRail** 的 `transition: all 0.15s` 为明确 spring 曲线
4. **在 PreviewPanel / 模态 **中 `<Transition>` 接入全局 spring preset
5. **在上层滑动动画中加入 Bezier 近似**，先保证视觉统一；后续有条件再接管为 WAAPI spring
6. **编写 `src/lib/spring.ts`** 统一导出，TS 类型 + spring-to-color 兼容函数

---

*调研生成时间：2026-06-28*
*目标项目：/Users/ylyg/Desktop/yuai-gui*
*参考产品：Linear、VS Code、Slack*
