# yuai-gui

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

### 什么是 yuai-gui？

yuai-gui 是一个**桌面原生的多 AI Agent 协作平台**。它把 Claude Code、Codex、OpenClaw、Hermes 四个 AI Agent CLI 装进一个 Tauri 桌面客户端，让它们在同一个工作区里**群聊协作、分工执行**。

每个 Agent 都是真实的 PTY 进程（不是 API 包装），共享同一目录的文件改动，通过群聊模式讨论分工后串行执行代码修改。

### 核心架构

```
┌─────────────────────────────────────────────────────────────┐
│  Tauri v2 Desktop (Rust + WebView)                          │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Vue 3 + Pinia + TypeScript Frontend                  │  │
│  │  ┌─────────┐ ┌──────────┐ ┌────────────────────────┐ │  │
│  │  │ AppRail │ │ ChatPanel│ │ Preview Panel          │ │  │
│  │  │ 梅兰竹菊 │ │ 群聊/单聊 │ │ 代码/变更/终端/工作流  │ │  │
│  │  └─────────┘ └──────────┘ └────────────────────────┘ │  │
│  │  ┌──────────────────────────────────────────────────┐ │  │
│  │  │  Model Management Layer                          │ │  │
│  │  │  Provider Store │ Credential Pool │ Transport    │ │  │
│  │  │  Model Selector │ Circuit Breaker │ Queue Guard  │ │  │
│  │  └──────────────────────────────────────────────────┘ │  │
│  └───────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │  Rust Backend (src-tauri)                             │  │
│  │  PTY · Files · Git · Config · Secure · LAN Discovery  │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

### 功能特性

#### Agent 协作
- **梅兰竹菊** — 四个内置 Agent（Claude/Codex/OpenClaw/Hermes），自定义 SVG 象形图标
- **群聊模式** — 多 Agent 讨论分工，收敛检测，决策面板确认后执行
- **Beam 模式** — 并行提问所有 Agent，对比方案选择最佳
- **真实 PTY** — 每个 Agent 是 spawn 的终端进程，不是 API mock
- **流式消息** — Channel 实时推送，打字光标，2s 空闲自动完成

#### 模型管理（深度研究 8 个开源项目）
- **22 个内置供应商** — Anthropic/OpenAI/DeepSeek/Google/xAI/OpenRouter/小米/Kimi/通义/智谱/百川/豆包/百度/讯飞/MiniMax/HuggingFace/Mistral/Groq/Together/SiliconFlow/阶跃/零一
- **models.dev 集成** — 4000+ 模型元数据库，三级缓存（内存→localStorage→网络）
- **模型别名系统** — `sonnet` → `claude-sonnet-4`，`gpt5` → `gpt-5`，`mimo` → `mimo-v2.5-pro`
- **Credential Pool** — 多 Key 自动轮换，租借机制，冷却恢复
- **Fallback 链** — 主供应商失败自动切换备选
- **熔断器** — 连续失败自动隔离，冷却期后半开试探恢复
- **Queue Guard** — 高并发自动排队，避免 429 错误
- **3 层压缩架构** — Token-Budget/Remote/Streaming 压缩 + Pre/Post Hooks
- **Token Budget** — 按目标限制 token 消耗，超限自动停止
- **5 级推理深度** — low/medium/high/xhigh/max，会话级覆盖
- **角色模型分配** — chat/autocomplete/edit/embed/rerank 各用不同模型
- **4 种传输协议** — OpenAI Chat/Anthropic Messages/Codex Responses/Bedrock
- **模型可见性** — include/exclude 控制哪些模型在 UI 显示
- **实时模型发现** — 探测 `/v1/models` 端点获取可用模型
- **会话内热切换** — ChatPanel 头部 ModelSelector 下拉

#### 工作区
- **文件浏览器** — 列表/网格视图，筛选/排序，收藏，缩略图预览
- **Git Diff** — 变更文件列表，内联 Diff，接受/回滚
- **Monaco 编辑器** — CDN 懒加载，自动保存，mtime 冲突保护
- **Web 终端** — xterm.js，CWD 追踪，Agent 选择

#### 平台集成
- **8 平台统一配置** — Telegram/Discord/Slack/WhatsApp/Matrix/飞书/微信/企微
- **微信 ClawBot** — iLink 协议，QR 登录，AES 加密，文件传输
- **LAN 设备发现** — UDP 广播，配对，终端附加，文件传输
- **MCP 管理** — CRUD 配置，自动注入 Agent 环境
- **技能管理** — SKILL.md 解析，搜索/浏览/启停

#### 设计语言
- **青瓷墨玉** — 翡翠绿 `#5ccfb8` + 赤金 `#c9a85c` + 深墨 `#0b1a1a`
- **Tabler Icons** — 4800+ SVG 图标，静态 import，零 emoji
- **梅兰竹菊** — 手绘象形 SVG，植物本色（粉红/翠绿/竹青/金黄）
- **5 主题** — dark/light/volt/warm/editorial
- **字体** — LXGW WenKai + Noto Serif SC + JetBrains Mono

### 技术栈

| 层 | 技术 |
|---|------|
| 桌面框架 | Tauri v2 (Rust) |
| 前端 | Vue 3 + TypeScript + Vite + Pinia |
| 终端 | xterm.js + node-pty |
| 编辑器 | Monaco Editor (CDN) |
| 图标 | Tabler Icons + 自定义 SVG |
| 数据库 | SQLite (Tauri) |
| 样式 | CSS Variables + 6 个主题文件 |

### 快速开始

```bash
# 克隆
git clone https://github.com/yuluyangguang1/yuai-gui.git
cd yuai-gui

# 安装依赖
npm install

# 启动开发
npx tauri dev

# 构建发布
npx tauri build
```

### 项目结构

```
yuai-gui/
├── src/                          # Vue 3 前端
│   ├── components/               # 49 个组件
│   │   ├── layout/              # AppRail, AppTitlebar, AppStatusbar
│   │   ├── ChatPanel.vue        # 聊天面板 (群聊/单聊/Beam)
│   │   ├── ModelSelector.vue    # 模型选择器 (分组/搜索/自定义)
│   │   └── ...
│   ├── stores/                   # 23 个 Pinia stores
│   │   ├── provider.ts          # Provider/Model 分离架构
│   │   ├── agents.ts            # Agent 管理
│   │   ├── chat.ts              # 聊天状态机
│   │   └── ...
│   ├── utils/                    # 50+ 工具模块
│   │   ├── models-dev.ts        # models.dev 4000+ 模型元数据
│   │   ├── transport.ts         # 4 种传输协议
│   │   ├── circuit-breaker.ts   # 熔断器
│   │   ├── compaction.ts        # 3 层压缩架构
│   │   ├── queue-guard.ts       # 排队守卫
│   │   └── ...
│   ├── styles/                   # 6 个 CSS 文件
│   └── views/                    # HomeView, PreviewView
├── src-tauri/                    # Rust 后端
│   └── src/
│       ├── lib.rs               # 入口 + 命令注册
│       ├── pty.rs               # PTY 管理
│       ├── files.rs             # 文件操作
│       ├── git.rs               # Git 操作
│       ├── config.rs            # 配置 + safeStorage 加密
│       ├── secure.rs            # AES-256-GCM 加密
│       └── ...
└── package.json
```

---

## English Introduction

### What is yuai-gui?

yuai-gui is a **native desktop multi-AI-agent collaboration platform**. It packages Claude Code, Codex, OpenClaw, and Hermes — four AI agent CLIs — into a single Tauri desktop client, enabling them to **discuss, divide work, and execute collaboratively** in a shared workspace.

Each agent runs as a real PTY process (not an API wrapper), shares the same working directory, and executes code modifications after group-chat discussion and consensus.

### Core Architecture

The application follows a clean separation between frontend (Vue 3 + TypeScript), backend (Rust via Tauri v2), and agent runtime (PTY processes). The model management layer is inspired by the best patterns from 8 open-source projects.

### Key Features

#### Agent Collaboration
- **Plum · Orchid · Bamboo · Chrysanthemum** — Four built-in agents with custom hand-drawn SVG icons
- **Group Chat** — Multi-agent discussion with convergence detection and decision panel
- **Beam Mode** — Parallel queries to all agents, compare and pick the best solution
- **Real PTY** — Each agent is a spawned terminal process with full tool access
- **Streaming Messages** — Real-time Channel push with typing cursor

#### Model Management (Deep Research from 8 Open-Source Projects)
- **22 Built-in Providers** — Anthropic, OpenAI, DeepSeek, Google, xAI, OpenRouter, Xiaomi, Kimi, Qwen, GLM, Baichuan, Doubao, Baidu, Spark, MiniMax, HuggingFace, Mistral, Groq, Together, SiliconFlow, StepFun, Yi
- **models.dev Integration** — 4000+ model metadata database with 3-tier caching
- **Model Aliases** — `sonnet` → `claude-sonnet-4`, `gpt5` → `gpt-5`, `mimo` → `mimo-v2.5-pro`
- **Credential Pool** — Multi-key rotation with lease mechanism and cooldown recovery
- **Fallback Chain** — Automatic failover when primary provider fails
- **Circuit Breaker** — Auto-isolate failing providers, half-open probe after cooldown
- **Queue Guard** — Automatic request queuing under high concurrency
- **3-Layer Compaction** — Token-Budget / Remote / Streaming compression with Pre/Post hooks
- **Token Budget** — Goal-based token limits with auto-stop
- **5 Effort Levels** — low / medium / high / xhigh / max reasoning depth
- **Role-Based Models** — chat / autocomplete / edit / embed / rerank use different models
- **4 Transport Protocols** — OpenAI Chat, Anthropic Messages, Codex Responses, Bedrock
- **Model Visibility** — include/exclude control for model display
- **Live Model Discovery** — Probe `/v1/models` endpoints for available models
- **In-Session Hot Switch** — ModelSelector dropdown in chat header

#### Workspace
- **File Browser** — List/grid view, filter/sort, favorites, thumbnail preview
- **Git Diff** — Changed files, inline diff, accept/revert
- **Monaco Editor** — CDN lazy-load, auto-save, mtime conflict protection
- **Web Terminal** — xterm.js, CWD tracking, agent selection

#### Platform Integration
- **8 Platform Config** — Telegram, Discord, Slack, WhatsApp, Matrix, Feishu, WeChat, WeCom
- **WeChat ClawBot** — iLink protocol, QR login, AES encryption, file transfer
- **LAN Device Discovery** — UDP broadcast, pairing, terminal attach, file transfer
- **MCP Management** — CRUD config, auto-inject into agent environment
- **Skill Management** — SKILL.md parsing, search/browse/enable/disable

#### Design Language
- **Jade-Ink (青瓷墨玉)** — Emerald `#5ccfb8` + Gold `#c9a85c` + Deep Ink `#0b1a1a`
- **Tabler Icons** — 4800+ SVG icons, static import, zero emoji
- **Plum · Orchid · Bamboo · Chrysanthemum** — Hand-drawn SVG with plant-natural colors
- **5 Themes** — dark / light / volt / warm / editorial
- **Typography** — LXGW WenKai + Noto Serif SC + JetBrains Mono

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop Framework | Tauri v2 (Rust) |
| Frontend | Vue 3 + TypeScript + Vite + Pinia |
| Terminal | xterm.js + node-pty |
| Editor | Monaco Editor (CDN) |
| Icons | Tabler Icons + Custom SVG |
| Database | SQLite (Tauri) |
| Styling | CSS Variables + 6 theme files |

### Quick Start

```bash
git clone https://github.com/yuluyangguang1/yuai-gui.git
cd yuai-gui
npm install
npx tauri dev
```

### Project Structure

```
yuai-gui/
├── src/                          # Vue 3 Frontend
│   ├── components/               # 49 components
│   ├── stores/                   # 23 Pinia stores
│   ├── utils/                    # 50+ utility modules
│   ├── styles/                   # 6 CSS files
│   └── views/                    # HomeView, PreviewView
├── src-tauri/                    # Rust Backend
│   └── src/                      # PTY, Files, Git, Config, Secure
└── package.json
```

---

## Acknowledgments / 致谢

yuai-gui 的模型管理和架构设计深度研究并借鉴了以下开源项目。在此向所有贡献者表示衷心感谢：

### Model Management / 模型管理

| Project | What We Learned |
|---------|----------------|
| [**Hermes Agent**](https://github.com/NousResearch/hermes-agent) | Credential Pool 多 Key 轮换、models.dev 模型元数据库、Provider 别名系统、Fallback 链、Profile 隔离 |
| [**Hermes Studio**](https://github.com/EKKOLearnAI/hermes-studio) | Model Selector UI 分组/搜索/自定义、Provider CRUD 预设+OAuth、模型可见性管理、Per-Session 模型切换 |
| [**LiteLLM**](https://github.com/BerriAI/litellm) | 熔断器 Circuit Breaker、预检管道 Pre-Call Checks、上下文窗口回退、按异常类型重试、预算上限 |
| [**Continue.dev**](https://github.com/continuedev/continue) | 角色模型分配 (chat/autocomplete/edit/embed)、YAML 配置层级、Tab 自动补全独立管道 |

### Agent Architecture / Agent 架构

| Project | What We Learned |
|---------|----------------|
| [**OpenHands**](https://github.com/All-Hands-AI/OpenHands) | 双模型压缩（便宜模型压缩+强模型推理）、重试指数退避、按任务复杂度路由 |
| [**Aider**](https://github.com/Aider-AI/aider) | 架构师/编辑器双模型管道思路（强模型规划→快模型执行） |
| [**FanBox**](https://github.com/anthropics/claude-code) | 微信 ClawBot、会话录制、自动更新、磁盘分析、截图检测、流式消息、群聊协作 |

### Desktop & UI / 桌面与界面

| Project | What We Learned |
|---------|----------------|
| [**OpenClaw**](https://github.com/QClaw/openclaw) | Queue Guard 排队守卫、Fetch Chain 洋葱中间件、Hook Proxy 优先级并发、Config Center 两层配置热更新、Plugin 架构 |
| [**Codex CLI**](https://github.com/openai/codex) | 3 层压缩架构（Token-Budget/Remote/Streaming）、Goal-based Token Budget、Pre/Post Compact Hooks、WorldState 重注入 |
| [**Claude Code**](https://github.com/anthropics/claude-code) | Model Aliases 自动解析（sonnet→最新版本）、Effort Levels 推理深度控制、Budget Caps、Prompt Cache 优化 |
| [**Open WebUI**](https://github.com/open-webui/open-webui) | 工作区模型预设、RBAC 访问控制、模型标签+搜索、导出/导入 |
| [**LobeChat**](https://github.com/lobehub/lobe-chat) | 模型属性回退链、远程模型列表同步、批量模型操作、Provider 运行时状态 |

### Infrastructure / 基础设施

| Project | What We Learned |
|---------|----------------|
| [**models.dev**](https://models.dev) | 4000+ 模型元数据库、109+ 供应商、上下文窗口/能力/成本/模态元数据 |
| [**Tabler Icons**](https://github.com/tabler/tabler-icons) | 4800+ MIT SVG 图标库 |
| [**Tauri**](https://github.com/tauri-apps/tauri) | Rust + WebView 桌面框架 |

---

## License

[MIT](./LICENSE)

---

<p align="center">
  <strong>yu.ai · 与 AI · 同行</strong><br>
  <sub>Built with ❤️ for the AI agent community</sub>
</p>
