# yuai-gui

> yu.ai · 与 AI · 同在 — 四件套统一启动器

把 [openclaw-portable](https://github.com/yuluyangguang1/openclaw-portable) · [hermes-portable](https://github.com/yuluyangguang1/hermes-portable) · [claude-portable](https://github.com/yuluyangguang1/claude-portable) · [codex-portable](https://github.com/yuluyangguang1/codex-portable) 整合到一个 Tauri 桌面客户端。

A Tauri-based unified launcher for the yu.ai portable AI toolkit (openclaw / hermes / claude / codex).

---

## 特性

- **30 MB 原生 .exe** — Tauri 编译，启动 < 1 秒
- **统一配置中心** — 内嵌 cc-switch，所有工具共用同一供应商数据库
- **状态可视化** — 每个工具卡片显示「未安装 / 待配置 / 就绪」
- **一键启动** — 点击启动按钮，自动开终端运行对应工具
- **数据隔离** — 所有数据在 `data/` 目录，便携友好
- **跨平台** — Windows · macOS (arm64+x64) · Linux

---

## 项目结构

```
yuai-gui/
  Yuai.exe                       ← 启动器（Tauri 编译产物）
  bundle/                         ← 各工具二进制（gitignore，CI 或 setup-bundle.sh 拉取）
    cc-switch/
      windows-x64/cc-switch.exe
      macos-arm64/cc-switch
      linux-x64/cc-switch
    claude/
      windows-x64/claude.exe
      ...
    codex/
      windows-x64/codex.exe
      ...
    openclaw/
    hermes/
  data/                           ← 用户数据
    .cc-switch/cc-switch.db       ← 共享配置
    .claude/                      ← Claude 会话历史
    .codex/                       ← Codex auth + config.toml
    .openclaw/
    .hermes/
  src/                            ← 前端 (HTML/CSS/JS)
  src-tauri/                      ← Rust 后端
    src/lib.rs                    ← 主逻辑：list_tools / launch_tool / launch_cc_switch
    src/tools.rs                  ← 工具注册表
    src/config.rs                 ← cc-switch DB 读取（判断已配置）
```

---

## 开发

### 前置要求
- Node.js 20+
- Rust 1.77+
- Windows: Microsoft C++ Build Tools
- Linux: `libwebkit2gtk-4.1-dev` 等（见 CI 配置）
- macOS: Xcode Command Line Tools

### 启动开发模式
```bash
npm install
bash setup-bundle.sh   # 拉取测试用的二进制（仅当前平台）
npm run tauri dev
```

### 编译生产版本
```bash
npm run tauri build
# 产物：src-tauri/target/release/bundle/
```

### 一键打全平台包
推 tag 触发 GitHub Actions：
```bash
git tag v0.1.0
git push --tags
```

---

## 设计理念

四个工具各自保持独立仓库 + 独立 release 周期。yuai-gui 只做：
- **门面整合** — 一个图标、一个安装包、一个配置入口
- **状态聚合** — 统一显示四个工具的就绪状态
- **配置共享** — cc-switch 数据库被所有工具共用

不做的事：
- 不重新实现各工具的功能
- 不嵌入终端（用户在系统终端里和 CLI 工具交互，最稳妥）
- 不分叉 cc-switch（直接调用上游二进制）

---

## 路线图

- [x] v0.1：四工具卡片 + 启动 + cc-switch 集成
- [ ] v0.2：版本检测 + 上游 release 监控（提示更新）
- [ ] v0.3：使用统计聚合（跨工具 API 调用次数 / Token 消耗）
- [ ] v0.4：内嵌 xterm.js 终端（可选，不打扰偏好系统终端的用户）
- [ ] v1.0：稳定版，签名安装包

---

## License

MIT
