# yuai-gui

> **yu.ai · 与 AI · 同在** — 多 Agent 协作桌面平台

把 [claude-code](https://github.com/anthropics/claude-code) · [codex](https://github.com/openai/codex) · [openclaw](https://github.com/yuluyangguang1/openclaw-portable) · [hermes](https://github.com/yuluyangguang1/hermes-portable) 四个 AI Agent CLI 装进一个 Tauri 客户端，让它们**在同一个工作区里群聊协作**。

A Tauri-based desktop app that runs four AI agent CLIs inside one window and orchestrates them in group chat — they discuss, divide work, and execute on the same codebase.

---

## 特性

- **群聊协作** — 输入需求，四个 Agent 依次讨论分工，确认后串行执行
- **真实 CLI 进程** — 每个 Agent 都是真实的 spawn 进程（PTY），不是 API 包装
- **共享工作区** — 所有 Agent 在同一目录工作，文件改动彼此可见
- **共用 Key** — 一个中转站 Key 一键填入所有 Agent，省去重复配置
- **可扩展 Agent** — `data/agents.json` 动态注册，可加 Gemini、DeepSeek 等
- **双模式** — 群聊（多 Agent 编排）+ 单 Agent 1v1（直接用单个工具）
- **平台** — Windows x64 · macOS arm64 / x64

---

## 截图

```
┌─────────────────────────────────────────────────┐
│ ⛧ ☷ ◇ ⌬   群  ⚙                                │  ← 侧栏：Agent + 群聊 + 配置
├─────────────────────────────────────────────────┤
│ 群聊 · 四器协作                                  │
│ 工作区: ~/projects/myapp                         │
│                                                 │
│ 你: 帮我给这个项目加个登录功能                     │
│                                                 │
│ ⛧ claude · 利刃: 我来设计 API 和数据模型          │
│ ☷ codex · 方盒: 我写后端实现                      │
│ ◇ openclaw · 百川: 我做前端界面                   │
│ ⌬ hermes · 砚墨: 我记录决策并整合测试               │
│                                                 │
│ [✓ 确认执行]  [↻ 继续讨论]                        │
└─────────────────────────────────────────────────┘
```

---

## 工作原理

```
┌──────────────────────────────────────────────────┐
│              yuai-gui (Tauri WebView)            │
│  ┌────────────┐                                  │
│  │  消息总线   │  ← 编排发言顺序、注入 prompt        │
│  │  (bus.rs)  │                                  │
│  └─────┬──────┘                                  │
│        │ 写 stdin / 读 stdout                     │
│  ┌─────▼─────┬─────────┬───────────┬──────────┐   │
│  │ claude PTY│codex PTY│openclaw   │hermes PTY│   │
│  │  process  │ process │   PTY     │ process  │   │
│  └───────────┴─────────┴───────────┴──────────┘   │
└──────────────────────────────────────────────────┘
              ↓ 共享同一个工作区（cwd）
        ┌──────────────────────────┐
        │  ~/projects/myapp        │
        │   ├── src/               │
        │   ├── package.json       │
        │   └── ...                │
        └──────────────────────────┘
```

每个 Agent 是真实 spawn 的 CLI 进程，群聊由消息总线编排：
1. 用户发消息 → bus 选定参与的 Agent 顺序
2. 给每个 Agent 注入"上下文 prompt"到 stdin
3. 捕获 stdout 作为该 Agent 的发言
4. 用户确认后，按分工顺序串行执行

---

## 安装

### 下载预编译版本（推荐）

到 [Releases](https://github.com/yuluyangguang1/yuai-gui/releases) 下载：

- `yuai-windows-x64.exe` — Windows 安装包
- `yuai-macos-arm64.dmg` — macOS Apple Silicon
- `yuai-macos-x64.dmg` — macOS Intel

完整 bundle（约 450 MB）内嵌全部 Agent 二进制，开箱即用。

### 从源码构建

前置：
- Node.js 20+
- Rust 1.77+
- Windows: Microsoft C++ Build Tools
- macOS: Xcode Command Line Tools

```bash
git clone https://github.com/yuluyangguang1/yuai-gui
cd yuai-gui
npm install
npm run tauri build
```

---

## 配置 API Key

启动后点击侧栏 **⚙**（配置按钮）：

### 方式一：共用 Key（推荐用中转站）

填一次，应用到所有 Agent：

| 字段 | 示例值 |
|------|--------|
| Base URL | `https://your-relay.com/v1` |
| API Key | `sk-...` |
| 模型 | 留空则各 Agent 用默认值 |

点 **「应用到所有 Agent」**。

### 方式二：模板一键填充

点击 **OpenAI / Anthropic / DeepSeek / one-api / Azure** 等按钮自动填入 Base URL。

### 方式三：各 Agent 独立配置

为每个 Agent 单独填 Base URL、API Key、模型。

配置存储在 `data/.cc-switch/cc-switch.db`（SQLite），与 [cc-switch](https://github.com/Mizuanen/cc-switch) 数据格式兼容。

---

## 添加自定义 Agent

配置面板底部 **「➕ 添加自定义 Agent」**：

| 字段 | 说明 |
|------|------|
| ID | 唯一标识，如 `gemini` |
| 名称 | 显示名，如 `gemini-cli` |
| 中文名 | 群聊里的称呼，如 `明镜` |
| 图标字 | 单字图标，如 `镜` |
| 颜色 | 主题色 |
| 专长 | 群聊讨论时让其他 Agent 知道你的角色 |
| 二进制路径 | `bundle/gemini/{platform}/gemini` |

会写入 `data/agents.json`，下次启动生效。

---

## 项目结构

```
yuai-gui/
├── index.html                 # 入口
├── src/
│   ├── main.js                # 前端逻辑（侧栏、群聊、配置面板）
│   └── styles.css             # yu.ai 设计系统
├── src-tauri/
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── src/
│   │   ├── lib.rs             # PTY commands + 群聊 commands
│   │   ├── agents.rs          # 动态 Agent 注册
│   │   ├── bus.rs             # 消息总线（群聊状态机）
│   │   └── config.rs          # cc-switch DB 读写
│   └── icons/                 # 应用图标
├── .github/workflows/
│   ├── build.yml              # CI 编译
│   └── release.yml            # 完整打包（含 Agent 二进制）
└── setup-bundle.sh            # 本地拉取 Agent 二进制
```

---

## 开发

```bash
npm install
npm run tauri dev
```

首次启动 Tauri 会编译 Rust（约 5-7 分钟），后续增量约 2-3 分钟。

**开发模式下**，如果 `bundle/` 里没有 Agent 二进制，会自动从系统 `PATH` 查找（比如全局安装的 `claude`、`codex`），方便本地调试。生产模式仍优先使用 `bundle/` 内嵌二进制。

---

## 路线图

- [x] **Phase 0** — Tauri + PTY + xterm.js 骨架
- [x] **Phase 1** — 四终端 + 配置面板 + 工作区 + spawn_agent
- [x] **Phase 2** — 群聊消息总线 + 讨论 + 执行调度
- [x] **Phase 3** — 共用 Key + 模板 + 自定义 Agent
- [x] **Phase 4** — release 打包流程
- [ ] **Phase 5** — 打磨发布 v0.1.0
- [ ] **Phase 6** — 任务跟踪面板（进度、产物、回滚）
- [ ] **Phase 7** — 上游 release 监控 + 自动更新

---

## 设计理念

**纯 CLI 进程模式**，不重新实现任何 Agent 的功能。yuai-gui 只做编排：
- 启动它们的 CLI 进程
- 在它们之间传递消息
- 让它们共享同一个工作区

每个 Agent 保留自己的所有能力（工具调用、记忆、专长），yuai-gui 不替代它们，只是让它们能"开会"。

四个内置 Agent 的角色定位：

| Agent | 中文名 | 字 | 专长 |
|-------|-------|---|------|
| claude | 利刃 | 刃 | 编程、架构设计、代码审查 |
| codex | 方盒 | 盒 | 编程、快速原型、OpenAI 生态 |
| openclaw | 百川 | 匣 | 内容生成、渠道运营、技能调用 |
| hermes | 砚墨 | 砚 | 记忆、学习、任务编排 |

---

## License

MIT

---

## 相关项目

- [claude-portable](https://github.com/yuluyangguang1/claude-portable) — Claude Code 便携版
- [codex-portable](https://github.com/yuluyangguang1/codex-portable) — Codex 便携版
- [openclaw-portable](https://github.com/yuluyangguang1/openclaw-portable) — OpenClaw 便携版
- [hermes-portable](https://github.com/yuluyangguang1/hermes-portable) — Hermes 便携版
- [yuai-site](https://github.com/yuluyangguang1/yuai-site) — yu.ai 官网
