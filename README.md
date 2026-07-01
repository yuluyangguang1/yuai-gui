1|# yuai
2|
3|> **yu.ai · 与 AI · 同行**
4|> Multi-Agent Collaboration Desktop Platform
5|> 多 Agent 协作桌面平台
6|
7|[![Tauri](https://img.shields.io/badge/Tauri-v2-blue?logo=tauri)](https://tauri.app)
8|[![Vue 3](https://img.shields.io/badge/Vue-3-brightgreen?logo=vuedotjs)](https://vuejs.org)
9|[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://www.typescriptlang.org)
10|[![Rust](https://img.shields.io/badge/Rust-2021-orange?logo=rust)](https://www.rust-lang.org)
11|[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
12|
13|---
14|
15|## 中文简介
16|
17|### 什么是 yuai？
18|
19|yuai 是一个**桌面原生的多 AI Agent 协作平台**。它把 Claude Code、Codex、OpenClaw、Hermes 四个 AI Agent CLI 装进一个 Tauri 桌面客户端，让它们在同一个工作区里**群聊协作、分工执行**。
20|
21|每个 Agent 都是真实的 PTY 进程（不是 API 包装），共享同一目录的文件改动，通过群聊模式讨论分工后串行执行代码修改。
22|
23|### 核心架构
24|
25|```
26|┌─────────────────────────────────────────────────────────────┐
27|│  Tauri v2 Desktop (Rust + WebView)                          │
28|│  ┌───────────────────────────────────────────────────────┐  │
29|│  │  Vue 3 + Pinia + TypeScript Frontend                  │  │
30|│  │  ┌─────────┐ ┌──────────┐ ┌────────────────────────┐ │  │
31|│  │  │ AppRail │ │ ChatPanel│ │ Preview Panel          │ │  │
32|│  │  │ 梅兰竹菊 │ │ 群聊/单聊 │ │ 代码/变更/终端/工作流  │ │  │
33|│  │  └─────────┘ └──────────┘ └────────────────────────┘ │  │
34|│  │  ┌──────────────────────────────────────────────────┐ │  │
35|│  │  │  Model Management Layer                          │ │  │
36|│  │  │  Provider Store │ Credential Pool │ Transport    │ │  │
37|│  │  │  Model Selector │ Circuit Breaker │ Queue Guard  │ │  │
38|│  │  └──────────────────────────────────────────────────┘ │  │
39|│  └───────────────────────────────────────────────────────┘  │
40|│  ┌───────────────────────────────────────────────────────┐  │
41|│  │  Rust Backend (src-tauri)                             │  │
42|│  │  PTY · Files · Git · Config · Secure · LAN Discovery  │  │
43|│  └───────────────────────────────────────────────────────┘  │
44|└─────────────────────────────────────────────────────────────┘
45|```
46|
47|### 功能特性
48|
49|#### Agent 协作
50|- **梅兰竹菊** — 四个内置 Agent（Claude/Codex/OpenClaw/Hermes），自定义 SVG 象形图标
51|- **群聊模式** — 多 Agent 讨论分工，收敛检测，决策面板确认后执行
52|- **Beam 模式** — 并行提问所有 Agent，对比方案选择最佳
53|- **真实 PTY** — 每个 Agent 是 spawn 的终端进程，不是 API mock
54|- **流式消息** — Channel 实时推送，打字光标，2s 空闲自动完成
55|
56|#### 模型管理（深度研究 8 个开源项目）
57|- **22 个内置供应商** — Anthropic/OpenAI/DeepSeek/Google/xAI/OpenRouter/小米/Kimi/通义/智谱/百川/豆包/百度/讯飞/MiniMax/HuggingFace/Mistral/Groq/Together/SiliconFlow/阶跃/零一
58|- **models.dev 集成** — 4000+ 模型元数据库，三级缓存（内存→localStorage→网络）
59|- **模型别名系统** — `sonnet` → `claude-sonnet-4`，`gpt5` → `gpt-5`，`mimo` → `mimo-v2.5-pro`
60|- **Credential Pool** — 多 Key 自动轮换，租借机制，冷却恢复
61|- **Fallback 链** — 主供应商失败自动切换备选
62|- **熔断器** — 连续失败自动隔离，冷却期后半开试探恢复
63|- **Queue Guard** — 高并发自动排队，避免 429 错误
64|- **3 层压缩架构** — Token-Budget/Remote/Streaming 压缩 + Pre/Post Hooks
65|- **Token Budget** — 按目标限制 token 消耗，超限自动停止
66|- **5 级推理深度** — low/medium/high/xhigh/max，会话级覆盖
67|- **角色模型分配** — chat/autocomplete/edit/embed/rerank 各用不同模型
68|- **4 种传输协议** — OpenAI Chat/Anthropic Messages/Codex Responses/Bedrock
69|- **模型可见性** — include/exclude 控制哪些模型在 UI 显示
70|- **实时模型发现** — 探测 `/v1/models` 端点获取可用模型
71|- **会话内热切换** — ChatPanel 头部 ModelSelector 下拉
72|
73|#### 工作区
74|- **文件浏览器** — 列表/网格视图，筛选/排序，收藏，缩略图预览
75|- **Git Diff** — 变更文件列表，内联 Diff，接受/回滚
76|- **Monaco 编辑器** — CDN 懒加载，自动保存，mtime 冲突保护
77|- **Web 终端** — xterm.js，CWD 追踪，Agent 选择
78|
79|#### 平台集成
80|- **8 平台统一配置** — Telegram/Discord/Slack/WhatsApp/Matrix/飞书/微信/企微
81|- **微信 ClawBot** — iLink 协议，QR 登录，AES 加密，文件传输
82|- **LAN 设备发现** — UDP 广播，配对，终端附加，文件传输
83|- **MCP 管理** — CRUD 配置，自动注入 Agent 环境
84|- **技能管理** — SKILL.md 解析，搜索/浏览/启停
85|
86|#### 设计语言
87|- **青瓷墨玉** — 翡翠绿 `#5ccfb8` + 赤金 `#c9a85c` + 深墨 `#0b1a1a`
88|- **Tabler Icons** — 4800+ SVG 图标，静态 import，零 emoji
89|- **梅兰竹菊** — 手绘象形 SVG，植物本色（粉红/翠绿/竹青/金黄）
90|- **5 主题** — dark/light/volt/warm/editorial
91|- **字体** — LXGW WenKai + Noto Serif SC + JetBrains Mono
92|
93|### 技术栈
94|
95|| 层 | 技术 |
96||---|------|
97|| 桌面框架 | Tauri v2 (Rust) |
98|| 前端 | Vue 3 + TypeScript + Vite + Pinia |
99|| 终端 | xterm.js + node-pty |
100|| 编辑器 | Monaco Editor (CDN) |
101|| 图标 | Tabler Icons + 自定义 SVG |
102|| 数据库 | SQLite (Tauri) |
103|| 样式 | CSS Variables + 6 个主题文件 |
104|
105|### 系统要求
106|
107|| 平台 | 最低版本 | 架构 | 打包格式 | 说明 |
108||------|---------|------|---------|------|
109|| **macOS** | 10.15 (Catalina) | x86_64 (Intel) + aarch64 (Apple Silicon) | .app, .dmg | WebView 使用系统自带 WKWebView |
110|| **Windows** | 10 (1809+) | x86_64 | .nsis, .msi | 需要 WebView2 (Win10 1809+ 自带) |
111|| **Linux** | Ubuntu 20.04+ / Fedora 34+ / Arch | x86_64 | .deb, .AppImage | 需安装 WebKitGTK 4.0+ |
112|
113|> **窗口最小尺寸:** 800 × 560 | **默认尺寸:** 1100 × 720
114|
115|### 快速开始
116|
117|```bash
118|# 克隆
119|git clone https://github.com/yuluyangguang1/yuai.git
120|cd yuai
121|
122|# 安装依赖
123|npm install
124|
125|# 启动开发
126|npx tauri dev
127|
128|# 构建发布
129|npx tauri build
130|```
131|
132|### 项目结构
133|
134|```
135|yuai/
136|├── src/                          # Vue 3 前端
137|│   ├── components/               # 49 个组件
138|│   │   ├── layout/              # AppRail, AppTitlebar, AppStatusbar
139|│   │   ├── ChatPanel.vue        # 聊天面板 (群聊/单聊/Beam)
140|│   │   ├── ModelSelector.vue    # 模型选择器 (分组/搜索/自定义)
141|│   │   └── ...
142|│   ├── stores/                   # 23 个 Pinia stores
143|│   │   ├── provider.ts          # Provider/Model 分离架构
144|│   │   ├── agents.ts            # Agent 管理
145|│   │   ├── chat.ts              # 聊天状态机
146|│   │   └── ...
147|│   ├── utils/                    # 50+ 工具模块
148|│   │   ├── models-dev.ts        # models.dev 4000+ 模型元数据
149|│   │   ├── transport.ts         # 4 种传输协议
150|│   │   ├── circuit-breaker.ts   # 熔断器
151|│   │   ├── compaction.ts        # 3 层压缩架构
152|│   │   ├── queue-guard.ts       # 排队守卫
153|│   │   └── ...
154|│   ├── styles/                   # 6 个 CSS 文件
155|│   └── views/                    # HomeView, PreviewView
156|├── src-tauri/                    # Rust 后端
157|│   └── src/
158|│       ├── lib.rs               # 入口 + 命令注册
159|│       ├── pty.rs               # PTY 管理
160|│       ├── files.rs             # 文件操作
161|│       ├── git.rs               # Git 操作
162|│       ├── config.rs            # 配置 + safeStorage 加密
163|│       ├── secure.rs            # AES-256-GCM 加密
164|│       └── ...
165|└── package.json
166|```
167|
168|---
169|
170|## English Introduction
171|
172|### What is yuai?
173|
174|yuai is a **native desktop multi-AI-agent collaboration platform**. It packages Claude Code, Codex, OpenClaw, and Hermes — four AI agent CLIs — into a single Tauri desktop client, enabling them to **discuss, divide work, and execute collaboratively** in a shared workspace.
175|
176|Each agent runs as a real PTY process (not an API wrapper), shares the same working directory, and executes code modifications after group-chat discussion and consensus.
177|
178|### Core Architecture
179|
180|The application follows a clean separation between frontend (Vue 3 + TypeScript), backend (Rust via Tauri v2), and agent runtime (PTY processes). The model management layer is inspired by the best patterns from 8 open-source projects.
181|
182|### Key Features
183|
184|#### Agent Collaboration
185|- **Plum · Orchid · Bamboo · Chrysanthemum** — Four built-in agents with custom hand-drawn SVG icons
186|- **Group Chat** — Multi-agent discussion with convergence detection and decision panel
187|- **Beam Mode** — Parallel queries to all agents, compare and pick the best solution
188|- **Real PTY** — Each agent is a spawned terminal process with full tool access
189|- **Streaming Messages** — Real-time Channel push with typing cursor
190|
191|#### Model Management (Deep Research from 8 Open-Source Projects)
192|- **22 Built-in Providers** — Anthropic, OpenAI, DeepSeek, Google, xAI, OpenRouter, Xiaomi, Kimi, Qwen, GLM, Baichuan, Doubao, Baidu, Spark, MiniMax, HuggingFace, Mistral, Groq, Together, SiliconFlow, StepFun, Yi
193|- **models.dev Integration** — 4000+ model metadata database with 3-tier caching
194|- **Model Aliases** — `sonnet` → `claude-sonnet-4`, `gpt5` → `gpt-5`, `mimo` → `mimo-v2.5-pro`
195|- **Credential Pool** — Multi-key rotation with lease mechanism and cooldown recovery
196|- **Fallback Chain** — Automatic failover when primary provider fails
197|- **Circuit Breaker** — Auto-isolate failing providers, half-open probe after cooldown
198|- **Queue Guard** — Automatic request queuing under high concurrency
199|- **3-Layer Compaction** — Token-Budget / Remote / Streaming compression with Pre/Post hooks
200|- **Token Budget** — Goal-based token limits with auto-stop
201|- **5 Effort Levels** — low / medium / high / xhigh / max reasoning depth
202|- **Role-Based Models** — chat / autocomplete / edit / embed / rerank use different models
203|- **4 Transport Protocols** — OpenAI Chat, Anthropic Messages, Codex Responses, Bedrock
204|- **Model Visibility** — include/exclude control for model display
205|- **Live Model Discovery** — Probe `/v1/models` endpoints for available models
206|- **In-Session Hot Switch** — ModelSelector dropdown in chat header
207|
208|#### Workspace
209|- **File Browser** — List/grid view, filter/sort, favorites, thumbnail preview
210|- **Git Diff** — Changed files, inline diff, accept/revert
211|- **Monaco Editor** — CDN lazy-load, auto-save, mtime conflict protection
212|- **Web Terminal** — xterm.js, CWD tracking, agent selection
213|
214|#### Platform Integration
215|- **8 Platform Config** — Telegram, Discord, Slack, WhatsApp, Matrix, Feishu, WeChat, WeCom
216|- **WeChat ClawBot** — iLink protocol, QR login, AES encryption, file transfer
217|- **LAN Device Discovery** — UDP broadcast, pairing, terminal attach, file transfer
218|- **MCP Management** — CRUD config, auto-inject into agent environment
219|- **Skill Management** — SKILL.md parsing, search/browse/enable/disable
220|
221|#### Design Language
222|- **Jade-Ink (青瓷墨玉)** — Emerald `#5ccfb8` + Gold `#c9a85c` + Deep Ink `#0b1a1a`
223|- **Tabler Icons** — 4800+ SVG icons, static import, zero emoji
224|- **Plum · Orchid · Bamboo · Chrysanthemum** — Hand-drawn SVG with plant-natural colors
225|- **5 Themes** — dark / light / volt / warm / editorial
226|- **Typography** — LXGW WenKai + Noto Serif SC + JetBrains Mono
227|
228|### Tech Stack
229|
230|| Layer | Technology |
231||-------|-----------|
232|| Desktop Framework | Tauri v2 (Rust) |
233|| Frontend | Vue 3 + TypeScript + Vite + Pinia |
234|| Terminal | xterm.js + node-pty |
235|| Editor | Monaco Editor (CDN) |
236|| Icons | Tabler Icons + Custom SVG |
237|| Database | SQLite (Tauri) |
238|| Styling | CSS Variables + 6 theme files |
239|
240|### System Requirements
241|
242|| Platform | Minimum Version | Architecture | Package Format | Notes |
243||----------|----------------|--------------|----------------|-------|
244|| **macOS** | 10.15 (Catalina) | x86_64 (Intel) + aarch64 (Apple Silicon) | .app, .dmg | Uses system WKWebView |
245|| **Windows** | 10 (1809+) | x86_64 | .nsis, .msi | Requires WebView2 (built-in on Win10 1809+) |
246|| **Linux** | Ubuntu 20.04+ / Fedora 34+ / Arch | x86_64 | .deb, .AppImage | Requires WebKitGTK 4.0+ |
247|
248|> **Minimum window size:** 800 × 560 | **Default:** 1100 × 720
249|
250|### Quick Start
251|
252|```bash
253|git clone https://github.com/yuluyangguang1/yuai.git
254|cd yuai
255|npm install
256|npx tauri dev
257|```
258|
259|### Project Structure
260|
261|```
262|yuai/
263|├── src/                          # Vue 3 Frontend
264|│   ├── components/               # 49 components
265|│   ├── stores/                   # 23 Pinia stores
266|│   ├── utils/                    # 50+ utility modules
267|│   ├── styles/                   # 6 CSS files
268|│   └── views/                    # HomeView, PreviewView
269|├── src-tauri/                    # Rust Backend
270|│   └── src/                      # PTY, Files, Git, Config, Secure
271|└── package.json
272|```
273|
274|---
275|
276|## Acknowledgments / 致谢
277|
278|yuai 的模型管理和架构设计深度研究并借鉴了以下开源项目。在此向所有贡献者表示衷心感谢：
279|
280|### Model Management / 模型管理
281|
282|| Project | What We Learned |
283||---------|----------------|
284|| [**Hermes Agent**](https://github.com/NousResearch/hermes-agent) | Credential Pool 多 Key 轮换、models.dev 模型元数据库、Provider 别名系统、Fallback 链、Profile 隔离 |
285|| [**Hermes Studio**](https://github.com/EKKOLearnAI/hermes-studio) | Model Selector UI 分组/搜索/自定义、Provider CRUD 预设+OAuth、模型可见性管理、Per-Session 模型切换 |
286|| [**LiteLLM**](https://github.com/BerriAI/litellm) | 熔断器 Circuit Breaker、预检管道 Pre-Call Checks、上下文窗口回退、按异常类型重试、预算上限 |
287|| [**Continue.dev**](https://github.com/continuedev/continue) | 角色模型分配 (chat/autocomplete/edit/embed)、YAML 配置层级、Tab 自动补全独立管道 |
288|
289|### Agent Architecture / Agent 架构
290|
291|| Project | What We Learned |
292||---------|----------------|
293|| [**OpenHands**](https://github.com/All-Hands-AI/OpenHands) | 双模型压缩（便宜模型压缩+强模型推理）、重试指数退避、按任务复杂度路由 |
294|| [**Aider**](https://github.com/Aider-AI/aider) | 架构师/编辑器双模型管道思路（强模型规划→快模型执行） |
295|| [**FanBox**](https://github.com/anthropics/claude-code) | 微信 ClawBot、会话录制、自动更新、磁盘分析、截图检测、流式消息、群聊协作 |
296|
297|### Desktop & UI / 桌面与界面
298|
299|| Project | What We Learned |
300||---------|----------------|
301|| [**OpenClaw**](https://github.com/QClaw/openclaw) | Queue Guard 排队守卫、Fetch Chain 洋葱中间件、Hook Proxy 优先级并发、Config Center 两层配置热更新、Plugin 架构 |
302|| [**Codex CLI**](https://github.com/openai/codex) | 3 层压缩架构（Token-Budget/Remote/Streaming）、Goal-based Token Budget、Pre/Post Compact Hooks、WorldState 重注入 |
303|| [**Claude Code**](https://github.com/anthropics/claude-code) | Model Aliases 自动解析（sonnet→最新版本）、Effort Levels 推理深度控制、Budget Caps、Prompt Cache 优化 |
304|| [**Open WebUI**](https://github.com/open-webui/open-webui) | 工作区模型预设、RBAC 访问控制、模型标签+搜索、导出/导入 |
305|| [**LobeChat**](https://github.com/lobehub/lobe-chat) | 模型属性回退链、远程模型列表同步、批量模型操作、Provider 运行时状态 |
306|
307|### Infrastructure / 基础设施
308|
309|| Project | What We Learned |
310||---------|----------------|
311|| [**models.dev**](https://models.dev) | 4000+ 模型元数据库、109+ 供应商、上下文窗口/能力/成本/模态元数据 |
312|| [**Tabler Icons**](https://github.com/tabler/tabler-icons) | 4800+ MIT SVG 图标库 |
313|| [**Tauri**](https://github.com/tauri-apps/tauri) | Rust + WebView 桌面框架 |
314|
315|---
316|
317|## License
318|
319|[MIT](./LICENSE)
320|
321|---
322|
323|<p align="center">
324|  <strong>yu.ai · 与 AI · 同行</strong><br>
325|  <sub>Built with ❤️ for the AI agent community</sub>
326|</p>
327|