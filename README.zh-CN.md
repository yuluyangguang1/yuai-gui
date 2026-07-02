# yuai

> **yu.ai · 与 AI · 同行**
> Multi-Agent Collaboration Desktop Platform
> 多 Agent 协作桌面平台

[![Tauri](https://img.shields.io/badge/Tauri-v2-blue?logo=tauri)](https://tauri.app)
[![Vue 3](https://img.shields.io/badge/Vue-3-brightgreen?logo=vuedotjs)](https://vuejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://www.typescriptlang.org)
[![Rust](https://img.shields.io/badge/Rust-2021-orange?logo=rust)](https://www.rust-lang.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

---

## 中文简介

### 什么是 yuai？
yuai 是一个**桌面原生的多 AI Agent 协作平台**。它把 Claude Code、Codex、OpenClaw、Hermes 装进一个 Tauri 桌面客户端，让它们在各自真实运行环境中**群聊协作、分工执行**。

每个 Agent 都是真实的 PTY 进程（不是 API 包装），共享同一目录的文件改动，讨论收敛后串行执行代码修改。

### 核心架构
```
yuai/
├── src/                          # Vue 3 前端
│   ├── components/               # 49 个组件
│   ├── stores/                   # 23 个 Pinia stores
│   ├── utils/                    # 50+ 工具模块
│   ├── styles/                   # 6 个主题文件
│   └── views/                    # HomeView, PreviewView
├── src-tauri/                    # Rust 后端
│   └── src/                      # PTY, Files, Git, Config, Secure
└── package.json
```

### 主要功能

#### Agent 协作
- **梅兰竹菊** — 四个内置 Agent，自定义象形 SVG 图标
- **群聊模式** — 多 Agent 讨论分工，收敛检测，决策确认后执行
- **Beam 模式** — 并行提问所有 Agent，对比结果选最佳
- **真实 PTY** — 每个 Agent 都是真实终端进程
- **流式消息** — 实时推送，打字光标，空闲自动完成

#### 模型管理
- **22 个内置供应商** — Anthropic/OpenAI/DeepSeek/Google/xAI/OpenRouter/小米/Kimi/通义/智谱/百川/豆包/百度/讯飞/MiniMax/HuggingFace/Mistral/Groq/Together/SiliconFlow/阶跃/零一
- **models.dev 集成** — 4000+ 模型元数据库，三级缓存
- **模型别名** — sonnet -> claude-sonnet-4
- **Credential Pool** — 多 Key 自动轮换
- **Fallback 链** — 主供应商失败自动切换
- **熔断器** — 连续失败自动隔离，冷却后半开试探
- **Queue Guard** — 高并发自动排队
- **3 层压缩** — Token-Budget/Remote/Streaming 压缩
- **Token Budget** — 按目标限制 token，超限停止
- **5 级推理深度** — low/medium/high/xhigh/max
- **角色模型分配** — chat/edit/embed/rerank 使用不同模型
- **4 种传输协议** — OpenAI Chat/Anthropic Messages/Codex Responses/Bedrock
- **模型可见性** — include/exclude 控制 UI 显示
- **实时发现** — 自动探测 /v1/models
- **会话内热切换** — 聊天头部切换模型

#### 工作区
- **文件浏览器** — 列表/网格、筛选/排序、收藏、缩略图
- **Git Diff** — 变更列表、内联 Diff、接受/回滚
- **Monaco 编辑器** — CDN 懒加载、自动保存、mtime 冲突保护
- **Web 终端** — xterm.js、CWD 追踪、Agent 选择

#### 平台集成
- **8 平台统一配置** — Telegram、Discord、Slack、WhatsApp、Matrix、飞书、微信、企微
- **微信 ClawBot** — iLink 协议、QR 登录、AES 加密、文件传输
- **LAN 设备发现** — UDP 广播、配对、终端附加、文件传输
- **MCP 管理** — CRUD 配置、自动注入 Agent 环境
- **技能管理** — SKILL.md 解析、搜索/浏览/启停

#### 设计语言
- **青瓷墨玉** — 翡翠绿 #5ccfb8 + 赤金 #c9a85c + 深墨 #0b1a1a
- **Tabler Icons** — 4800+ SVG 图标，静态 import，零 emoji
- **梅兰竹菊** — 自定义象形 SVG，植物本色
- **5 主题** — dark/light/volt/warm/editorial
- **字体** — LXGW WenKai + Noto Serif SC + JetBrains Mono

### 技术栈
| 层 | 技术 |
|------|------|
| 桌面框架 | Tauri v2 (Rust) |
| 前端 | Vue 3 + TypeScript + Vite + Pinia |
| 终端 | xterm.js |
| 编辑器 | Monaco Editor (CDN) |
| 图标 | Tabler Icons + 自定义 SVG |
| 数据库 | SQLite (Tauri) |
| 样式 | CSS Variables + 主题文件 |

### 系统要求
| 平台 | 最低版本 | 架构 | 打包格式 | 说明 |
|------|---------|------|---------|------|
| **macOS** | 10.15 (Catalina) | x86_64 + aarch64 | .app, .dmg | 系统自带 WKWebView |
| **Windows** | 10 (1809+) | x86_64 | .nsis, .msi | 需要 WebView2 |
| **Linux** | Ubuntu 20.04+ / Fedora 34+ / Arch | x86_64 | .deb, .AppImage | 需要 WebKitGTK 4.0+ |

> **窗口最小尺寸:** 800 × 560 | **默认尺寸:** 1100 × 720

### 快速开始
```bash
git clone https://github.com/yuluyangguang1/yuai-gui.git
cd yuai-gui
npm install
npx tauri dev
```

### 构建与测试
```bash
npm run build
npm run test
```

### 仓库信息
- 远端仓库：https://github.com/yuluyangguang1/yuai-gui.git
- 默认分支：`main`
- 最近标签：`v0.1.0`

---

## English

### What is yuai?
yuai is a **native desktop multi-AI-agent collaboration platform**. It packages Claude Code, Codex, OpenClaw, and Hermes into a single Tauri client so they can work together in one workspace: **group chat, divide tasks, and execute as real terminal processes**.

### Core architecture
```
yuai/
├── src/                          # Vue 3 + TypeScript frontend
│   ├── components/               # 49 components
│   ├── stores/                   # 23 Pinia stores
│   ├── utils/                    # 50+ utility modules
│   ├── styles/                   # 6 theme files
│   └── views/                    # HomeView, PreviewView
├── src-tauri/                    # Rust backend
│   └── src/                      # PTY, Files, Git, Config, Secure
├── package.json
├── vite.config.ts
├── vitest.config.ts
├── tsconfig.json
└── index.html
```

### Key features

#### Agent collaboration
- **Plum · Orchid · Bamboo · Chrysanthemum** — four built-in agents with custom hand-drawn SVG icons
- **Group chat** — multi-agent discussion, convergence detection, decision panel before execution
- **Beam mode** — parallel queries to all agents, compare and pick the best solution
- **Real PTY** — each agent runs as a real terminal process with full tool access
- **Streaming messages** — real-time push with typing cursor and idle completion

#### Model management
- **22 built-in providers** — Anthropic, OpenAI, DeepSeek, Google, xAI, OpenRouter, Xiaomi, Kimi, Qwen, GLM, Baichuan, Doubao, Baidu, Spark, MiniMax, HuggingFace, Mistral, Groq, Together, SiliconFlow, StepFun, Yi
- **models.dev integration** — 4000+ model metadata with 3-tier caching
- **Model aliases** — `sonnet` -> `claude-sonnet-4`, `gpt5` -> `gpt-5`, `mimo` -> `mimo-v2.5-pro`
- **Credential pool** — multi-key rotation, lease mechanism, cooldown recovery
- **Fallback chain** — automatic provider failover
- **Circuit breaker** — auto-isolate failing providers, half-open probe after cooldown
- **Queue guard** — automatic request queuing to reduce 429 errors
- **3-layer compaction** — Token-Budget / Remote / Streaming compression with Pre/Post hooks
- **Token budget** — goal-based token limit with auto-stop
- **5 effort levels** — low / medium / high / xhigh / max
- **Role-based models** — chat / autocomplete / edit / embed / rerank can use different models
- **4 transports** — OpenAI Chat, Anthropic Messages, Codex Responses, Bedrock
- **Model visibility** — include/exclude control in UI
- **Live discovery** — auto-detect `/v1/models` endpoints
- **Hot switch** — change model inside a chat session

#### Workspace
- **File browser** — list/grid view, filter/sort, favorites, thumbnail preview
- **Git diff** — changed files list, inline diff, accept/revert
- **Monaco editor** — CDN lazy-load, auto-save, mtime conflict protection
- **Web terminal** — xterm.js, CWD tracking, agent selection

#### Integrations
- **8 platform configs** — Telegram, Discord, Slack, WhatsApp, Matrix, Feishu, WeChat, WeCom
- **WeChat ClawBot** — iLink protocol, QR login, AES encryption, file transfer
- **LAN discovery** — UDP broadcast, pairing, terminal attach, file transfer
- **MCP management** — CRUD config, auto-inject into agent environment
- **Skill management** — SKILL.md parsing, search/browse/enable/disable

#### Design language
- **Jade-Ink (青瓷墨玉)** — Emerald `#5ccfb8` + Gold `#c9a85c` + Deep Ink `#0b1a1a`
- **Tabler Icons** — 4800+ SVG icons as static imports, zero emoji
- **Custom nature icons** — Plum/Orchid/Bamboo/Chrysanthemum with natural colors
- **5 themes** — dark / light / volt / warm / editorial
- **Typography** — LXGW WenKai + Noto Serif SC + JetBrains Mono

### Tech stack
| Layer | Technology |
|-------|-----------|
| Desktop framework | Tauri v2 (Rust) |
| Frontend | Vue 3 + TypeScript + Vite + Pinia |
| Terminal | xterm.js |
| Editor | Monaco Editor (CDN) |
| Icons | Tabler Icons + Custom SVG |
| Database | SQLite (Tauri) |
| Styling | CSS Variables |

### System requirements
| Platform | Minimum Version | Architecture | Package Format | Notes |
|----------|----------------|--------------|----------------|-------|
| **macOS** | 10.15 (Catalina) | x86_64 + aarch64 | .app, .dmg | Uses system WKWebView |
| **Windows** | 10 (1809+) | x86_64 | .nsis, .msi | Requires WebView2 |
| **Linux** | Ubuntu 20.04+ / Fedora 34+ / Arch | x86_64 | .deb, .AppImage | Requires WebKitGTK 4.0+ |

> **Minimum window size:** 800 × 560 | **Default:** 1100 × 720

### Quick start
```bash
git clone https://github.com/yuluyangguang1/yuai-gui.git
cd yuai-gui
npm install
npx tauri dev
```

### Build & test
```bash
npm run build
npm run test
```

### Repo links
- Remote: https://github.com/yuluyangguang1/yuai-gui.git
- Default branch: `main`
- Latest tag: `v0.1.0`

---

## 致谢 / Acknowledgments

yuai 的模型管理和架构设计借鉴了以下开源项目：

| Project | Lessons |
|---------|---------|
| [Hermes Agent](https://github.com/NousResearch/hermes-agent) | Credential Pool 多 Key 轮换、models.dev 元数据库、Provider 别名系统、Fallback 链、Profile 隔离 |
| [Hermes Studio](https://github.com/EKKOLearnAI/hermes-studio) | Model Selector UI 分组/搜索/自定义、Provider CRUD 预设+OAuth、Per-Session 模型切换 |
| [LiteLLM](https://github.com/BerriAI/litellm) | 熔断器、预检管道、上下文窗口回退、按异常类型重试、预算上限 |
| [Continue.dev](https://github.com/continuedev/continue) | 角色模型分配、YAML 配置层级、Tab 自动补全独立管道 |
| [OpenHands](https://github.com/All-Hands-AI/OpenHands) | 双模型压缩、重试指数退避、按任务复杂度路由 |
| [Aider](https://github.com/Aider-AI/aider) | 架构师/编辑器双模型管道 |
| [OpenClaw](https://github.com/QClaw/openclaw) | Queue Guard、Fetch Chain、Hook Proxy 并发、Config Center、Plugin 架构 |
| [Codex CLI](https://github.com/openai/codex) | 3 层压缩架构、Goal-based Token Budget、Pre/Post Compact Hooks、WorldState 重注入 |
| [Claude Code](https://github.com/anthropics/claude-code) | Model Aliases、Effort Levels、Budget Caps、Prompt Cache 优化 |
| [Open WebUI](https://github.com/open-webui/open-webui) | 工作区模型预设、RBAC、模型标签+搜索、导出/导入 |
| [LobeChat](https://github.com/lobehub/lobe-chat) | 模型属性回退链、远程模型列表同步、批量模型操作、Provider 运行时状态 |
| [models.dev](https://models.dev) | 4000+ 模型元数据库、109+ 供应商 |
| [Tabler Icons](https://github.com/tabler/tabler-icons) | 4800+ MIT SVG 图标库 |
| [Tauri](https://github.com/tauri-apps/tauri) | Rust + WebView 桌面框架 |

---

## License

[MIT](./LICENSE)
