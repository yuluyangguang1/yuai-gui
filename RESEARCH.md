# yuai-gui 技术研究报告

> PTY 管理 · Agent 编排 · 群聊调度
> 2026-06-23

---

## 一、PTY 管理：现有实现 vs 最佳实践

### 1.1 现状分析

**lib.rs** 当前实现：
- `portable-pty 0.9` + `PtySession { writer, killer }`
- 8KB 固定 buffer 读取循环（`thread::spawn`）
- `pty_resize` 是 **no-op**（注释说 Phase 1 再处理）
- 没有 cleanup — PTY session 只在 `pty_kill` 时移除，无自动回收
- `spawn_agent` 复杂度高 — 同时处理 binary 解析、config 注入、PTY 创建

### 1.2 问题清单

| # | 问题 | 严重度 | 说明 |
|---|------|--------|------|
| 1 | **resize 是 no-op** | 高 | xterm.js 触发 resize 事件后，PTY 行列不变，导致换行错位、进度条错乱 |
| 2 | **无 PTY 清理** | 高 | 用户切 workspace 或关闭窗口时，旧 PTY 进程变成僵尸进程 |
| 3 | **8KB buffer 无背压** | 中 | Agent 快速输出时（如长代码块），Channel 可能堆积，内存膨胀 |
| 4 | **UTF-8 混合输出** | 中 | `String::from_utf8_lossy` 会破坏 ANSI escape sequence 中间的多字节字符 |
| 5 | **无进程退出检测** | 中 | Reader thread `read` 返回 Ok(0) 就 break，但前端不知道进程已退出 |
| 6 | **无环境隔离** | 低 | 4 个 Agent 共享同一 shell 环境变量，可能冲突 |

### 1.3 VS Code 集成终端的 PTY 架构

VS Code 的终端是业界标杆，核心设计：

```
┌─────────────────────────────────────────────────┐
│  Frontend (xterm.js)                            │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐      │
│  │ Terminal  │  │ FitAddon │  │ Search   │      │
│  │ Instance  │  │          │  │ Addon    │      │
│  └────┬─────┘  └──────────┘  └──────────┘      │
│       │ onResize(rows, cols)                    │
│       │ onData(input)                           │
│       ▼                                         │
│  ┌─────────────────────────────────────┐        │
│  │  TerminalProcess (IPC bridge)       │        │
│  │  - Serialize: binary → base64       │        │
│  │  - Debounce resize (50ms)           │        │
│  │  - Buffer: ring buffer 10MB         │        │
│  └──────────────┬──────────────────────┘        │
└─────────────────┼───────────────────────────────┘
                  │ IPC (MessagePort / Named Pipe)
┌─────────────────┼───────────────────────────────┐
│  Backend        ▼                                │
│  ┌─────────────────────────────────────┐        │
│  │  PTY Host (node-pty / portable-pty) │        │
│  │  - per-session: { pty, pid, shell } │        │
│  │  - ResizeObserver → pty.resize()    │        │
│  │  - Process exit event → cleanup     │        │
│  │  - Environment per-profile          │        │
│  └─────────────────────────────────────┘        │
└─────────────────────────────────────────────────┘
```

**关键设计模式：**

1. **Resize 防抖** — xterm.js 的 resize 事件可能高频触发（拖拽窗口），VS Code 用 50ms debounce 后调用 `pty.resize(cols, rows)`
2. **Ring Buffer** — 终端回滚缓冲区用环形结构，固定内存占用，旧数据自动丢弃
3. **进程生命周期事件** — PTY 进程退出时，通过 `onExit` 事件通知前端，显示 `[process exited with code N]`
4. **环境隔离** — 每个终端实例独立的 `env` 字典，从 shell 环境 + 用户配置合并

### 1.4 对 yuai-gui 的改进建议

#### 修复 1: 实现真正的 resize

```rust
// lib.rs — 需要存储 master handle
struct PtySession {
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    killer: Mutex<Box<dyn portable_pty::ChildKiller + Send + Sync>>,
    master: Mutex<Box<dyn portable_pty::MasterPty + Send>>,  // 新增
}

#[tauri::command]
fn pty_resize(state: tauri::State<AppState>, id: u32, cols: u16, rows: u16) -> Result<(), String> {
    let sessions = state.sessions.read().unwrap();
    let session = sessions.get(&id).ok_or("session not found")?;
    let master = session.master.lock().unwrap();
    master.resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
        .map_err(|e| format!("resize failed: {}", e))?;
    Ok(())
}
```

前端 resize 防抖：
```javascript
// main.js — Terminal resize observer
const ro = new ResizeObserver(debounce(() => {
  fitAddon.fit();
  if (sessions[agentId]?.ptyId) {
    invoke('pty_resize', {
      id: sessions[agentId].ptyId,
      cols: terminal.cols,
      rows: terminal.rows
    });
  }
}, 50));
ro.observe(container);
```

#### 修复 2: 进程退出通知

```rust
// Reader thread 中检测退出后发送信号
thread::spawn(move || {
    let mut buf = [0u8; 8192];
    loop {
        match reader.read(&mut buf) {
            Ok(0) => {
                let _ = on_data.send("\r\n[process exited]\r\n".into());
                break;
            }
            Ok(n) => {
                let data = String::from_utf8_lossy(&buf[..n]).to_string();
                let _ = on_data.send(data);
            }
            Err(e) => {
                let _ = on_data.send(format!("\r\n[error: {}]\r\n", e));
                break;
            }
        }
    }
});
```

#### 修复 3: PTY 清理

```rust
// App close 时清理所有 PTY
fn cleanup_all_sessions(state: &AppState) {
    let mut sessions = state.sessions.write().unwrap();
    for (id, session) in sessions.drain() {
        if let Ok(mut killer) = session.killer.lock() {
            let _ = killer.kill();
        }
        log::info!("cleaned up PTY session {}", id);
    }
}

// Tauri setup 中注册
app.on_window_event(move |event| {
    if let tauri::WindowEvent::Destroyed = event {
        cleanup_all_sessions(&state);
    }
});
```

#### 改进 4: Buffer 策略

```rust
// 用 ring buffer 替代 unbounded channel
// 或者在 Channel 发送前做节流
use std::time::Instant;

thread::spawn(move || {
    let mut buf = [0u8; 8192];
    let mut pending = String::new();
    let mut last_flush = Instant::now();

    loop {
        match reader.read(&mut buf) {
            Ok(0) => break,
            Ok(n) => {
                pending.push_str(&String::from_utf8_lossy(&buf[..n]));
                // Flush if buffer > 4KB or 16ms elapsed (~60fps)
                if pending.len() > 4096 || last_flush.elapsed().as_millis() > 16 {
                    let _ = on_data.send(std::mem::take(&mut pending));
                    last_flush = Instant::now();
                }
            }
            Err(_) => break,
        }
    }
    // Flush remaining
    if !pending.is_empty() {
        let _ = on_data.send(pending);
    }
});
```

---

## 二、Agent 编排：业界模式分析

### 2.1 六大编排框架对比

| 框架 | 核心模式 | 发言选择 | 执行策略 | 适用场景 |
|------|----------|----------|----------|----------|
| **AutoGen** | GroupChatManager | LLM选择/轮询/函数/随机 | 顺序/并行 | 通用对话协作 |
| **CrewAI** | 角色+任务+委托 | 顺序/层级/共识 | 任务队列 | 结构化工作流 |
| **Cline** | Plan→Approve→Execute | 单Agent | 人工审批门 | 编码安全 |
| **Aider** | Architect+Coder | 双模型 | 先规划后编码 | 复杂代码重构 |
| **ChatDev** | 角色扮演+瀑布链 | 预设顺序 | 阶段门控 | 软件开发全流程 |
| **MetaGPT** | SOP+结构化中间产物 | 角色分工 | 瀑布式 | 企业级开发 |

### 2.2 AutoGen GroupChatManager — 最值得借鉴

AutoGen 的 `GroupChatManager` 是群聊编排的参考实现：

```python
# AutoGen 核心选择逻辑（简化）
class GroupChatManager:
    def select_speaker(self, last_speaker, messages):
        """选择下一个发言者"""
        # 策略 1: LLM 选择（默认）
        if self.speaker_selection_method == "auto":
            # 把团队成员描述 + 历史消息发给 LLM，让它决定
            prompt = self._build_speaker_prompt(messages)
            response = self.llm.create(prompt)
            return self._extract_agent_name(response)

        # 策略 2: 轮询
        elif self.speaker_selection_method == "round_robin":
            idx = self.agent_by_name(last_speaker)
            return self.agents[(idx + 1) % len(self.agents)]

        # 策略 3: 函数选择
        elif self.speaker_selection_method == "function":
            return self.func(last_speaker, messages)

        # 策略 4: 随机
        elif self.speaker_selection_method == "random":
            return random.choice(self.agents)
```

**关键设计：**

1. **发言终止条件** — 当 LLM 返回 `TERMINATE` 或连续 N 轮无新观点时，讨论结束
2. **@mention 路由** — 被 @mention 的 agent 优先发言
3. **max_round** — 限制讨论轮次，防止无限循环
4. **send_introductions** — 新 agent 加入时，自动发送团队介绍

### 2.3 yuai-gui 的 bus.rs 分析

现有实现：
- `determine_speakers()` — @mention 优先，否则全员轮询
- `ChatPhase` — Idle → Discussing → WaitingConfirm → Executing → Handoff
- `build_discussion_prompt()` — 注入角色、专长、团队成员、历史

**缺失的关键能力：**

| 能力 | 现状 | 目标 |
|------|------|------|
| LLM 选择发言者 | ❌ 无 | 用轻量模型判断谁最适合回答 |
| 发言终止检测 | ❌ 固定轮询完就停 | 检测讨论收敛（观点重复/无新信息） |
| 超时处理 | ❌ `captureAgentResponse` 固定 15s | 可配置超时 + 优雅降级 |
| 并行发言 | ❌ 严格串行 | 某些场景可并行（如各自分析不同文件） |
| 上下文压缩 | ❌ 全量历史 | 讨论过长时自动摘要 |
| 执行回滚 | ❌ 无 | 执行失败时回退到讨论阶段 |

### 2.4 建议：增强 bus.rs

#### 改进 1: 智能发言选择

```rust
/// 发言选择策略
pub enum SpeakerStrategy {
    RoundRobin,         // 现有：轮询
    MentionBased,       // 现有：@mention
    LLMDecided,         // 新增：LLM 判断
    SpecialtyBased,     // 新增：根据问题类型匹配专长
    Priority,           // 新增：被 @mention 的优先，其次专长匹配，最后轮询
}

impl GroupChat {
    fn determine_speakers_v2(&mut self, content: &str) -> Vec<NextSpeaker> {
        self.speaking_order.clear();
        let mut speakers = Vec::new();

        // 1. @mention 最高优先
        let mentions = extract_mentions(content, &self.participants);
        for m in &mentions {
            self.speaking_order.push_back(m.clone());
            speakers.push(NextSpeaker {
                agent_id: m.clone(),
                reason: "mentioned".into(),
            });
        }

        // 2. 专长匹配（如果没有 @mention）
        if mentions.is_empty() {
            let scored = self.score_by_specialty(content);
            for (agent_id, score) in scored {
                if !self.speaking_order.contains(&agent_id) {
                    self.speaking_order.push_back(agent_id.clone());
                    speakers.push(NextSpeaker {
                        agent_id,
                        reason: format!("specialty_match(score={})", score),
                    });
                }
            }
        }

        speakers
    }

    fn score_by_specialty(&self, content: &str) -> Vec<(String, f32)> {
        let keywords = vec![
            ("代码", "claude"), ("编程", "claude"), ("重构", "claude"), ("架构", "claude"),
            ("原型", "codex"), ("快速", "codex"), ("测试", "codex"),
            ("内容", "openclaw"), ("文案", "openclaw"), ("运营", "openclaw"),
            ("记忆", "hermes"), ("学习", "hermes"), ("任务", "hermes"), ("分析", "hermes"),
        ];

        let mut scores: HashMap<String, f32> = HashMap::new();
        for (keyword, agent) in &keywords {
            if content.contains(keyword) {
                *scores.entry(agent.to_string()).or_insert(0.0) += 1.0;
            }
        }

        let mut sorted: Vec<_> = scores.into_iter().collect();
        sorted.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
        sorted
    }
}
```

#### 改进 2: 收敛检测

```rust
/// 讨论收敛检测器
pub struct ConvergenceDetector {
    pub max_rounds: usize,           // 最大轮次（默认 5）
    pub similarity_threshold: f32,   // 相似度阈值（默认 0.7）
    pub no_new_info_rounds: usize,   // 连续无新信息轮次（默认 2）
    history: Vec<String>,            // 最近的发言
}

impl ConvergenceDetector {
    pub fn should_stop(&self, new_message: &str) -> bool {
        // 1. 达到最大轮次
        if self.history.len() >= self.max_rounds {
            return true;
        }

        // 2. 连续 N 轮无新信息
        if self.history.len() >= self.no_new_info_rounds {
            let recent = &self.history[self.history.len() - self.no_new_info_rounds..];
            if recent.iter().all(|msg| self.similarity(msg, new_message) > self.similarity_threshold) {
                return true;
            }
        }

        // 3. 检测到终止信号
        let stop_signals = ["讨论完毕", "没有其他意见", "我同意以上方案", "TERMINATE"];
        if stop_signals.iter().any(|s| new_message.contains(s)) {
            return true;
        }

        false
    }

    /// 简单的 Jaccard 相似度（基于词集合）
    fn similarity(&self, a: &str, b: &str) -> f32 {
        let set_a: HashSet<&str> = a.split_whitespace().collect();
        let set_b: HashSet<&str> = b.split_whitespace().collect();
        let intersection = set_a.intersection(&set_b).count();
        let union = set_a.union(&set_b).count();
        if union == 0 { 0.0 } else { intersection as f32 / union as f32 }
    }
}
```

#### 改进 3: 执行阶段增强

```rust
/// 执行结果
pub struct ExecutionResult {
    pub agent_id: String,
    pub success: bool,
    pub output: String,
    pub files_changed: Vec<String>,
    pub duration_ms: u64,
}

impl GroupChat {
    /// 确认执行后，按顺序让每个 agent 执行
    pub fn confirm_execution_v2(&mut self, order: Option<Vec<String>>, strategy: ExecStrategy) {
        self.phase = ChatPhase::Executing;
        self.exec_strategy = strategy;
        self.execution_queue = order
            .unwrap_or_else(|| self.participants.clone())
            .into_iter()
            .collect();
    }

    /// 处理执行结果
    pub fn on_execution_result(&mut self, result: ExecutionResult) {
        self.execution_results.push(result.clone());

        if !result.success {
            // 执行失败 → 回到讨论阶段
            self.phase = ChatPhase::Discussing;
            self.messages.push(ChatMessage {
                id: format!("msg_{}", self.next_msg_id),
                timestamp: now_ms(),
                from: "system".into(),
                to: "all".into(),
                msg_type: "exec_failure".into(),
                content: format!(
                    "{} 执行失败: {}\n请团队讨论如何处理。",
                    result.agent_id, result.output
                ),
                tokens_used: None,
                model: None,
                duration_ms: None,
            });
            self.next_msg_id += 1;
        }
    }
}

pub enum ExecStrategy {
    Sequential,     // 串行：一个完成再下一个
    Parallel,       // 并行：同时执行
    Pipeline,       // 流水线：前一个的输出作为后一个的输入
}
```

---

## 三、群聊调度：从原型到生产

### 3.1 现有问题深度分析

**main.js 中的 `runDiscussion()` 循环：**

```javascript
async function runDiscussion() {
  while (true) {
    const speaker = await invoke('group_next_speaker');
    if (!speaker) {
      // 显示"确认执行"按钮
      break;
    }
    // ... 向 agent PTY 写入 prompt，等 15s 抓取响应
    const response = await captureAgentResponse(speaker.agent_id, 15000);
  }
}
```

**问题：**
1. **15 秒固定超时** — 简单问题 15s 太长，复杂推理 15s 不够
2. **Buffer 响应检测不稳定** — `captureAgentResponse` 用 "3 次 1 秒 buffer 不变" 判断完成，但 agent 可能暂停思考
3. **无法中断讨论** — `while(true)` 循环中没有用户中断机制
4. **无进度反馈** — 只有"思考中..."文字，无 token 计数或进度条
5. **PTY 输出污染** — Agent CLI 的输出包含 ANSI、进度条、菜单等非对话内容，`cleanAnsi` 太粗糙

### 3.2 LobeChat 群聊实现分析

LobeChat 的群聊（多 Bot 讨论）核心设计：

```
用户消息 → Moderator（路由器）
              ↓
         ┌────┴────┐
         ▼         ▼
      Bot A      Bot B     ← 可并行
         │         │
         └────┬────┘
              ▼
         聚合消息
              │
              ▼
         是否继续？ → 是 → 下一轮
              │
              否 → 结束
```

**关键机制：**
- **Moderator Agent** — 专门的路由 agent，决定谁发言、何时结束
- **消息聚合** — 多个 agent 的响应合并为一条聚合消息
- **轮次限制** — 用户可设置最大轮次
- **实时流式** — 每个 agent 的响应实时流式显示

### 3.3 big-AGI Beam 模式

big-AGI 的 "Beam" 是另一种思路：

```
用户消息 → 同时发给 N 个模型
              ↓
         ┌────┼────┐
         ▼    ▼    ▼
      Resp1 Resp2 Resp3    ← 并行
         │    │    │
         └────┼────┘
              ▼
         用户选择最佳
              │
              ▼
         继续对话
```

**适用场景：** 不需要 agent 间讨论，只需要多模型对比

### 3.4 yuai-gui 群聊调度改进方案

#### 方案 A: 增强当前串行讨论

```javascript
// main.js — 改进的讨论循环
async function runDiscussion() {
  let round = 0;
  const maxRounds = 5;

  while (round < maxRounds) {
    const speaker = await invoke('group_next_speaker');
    if (!speaker) break;

    round++;
    updateStatus(`讨论中 · 第 ${round} 轮 · ${speaker.agent_id}`);

    // 显示思考状态
    const thinkingId = showThinking(speaker.agent_id);

    // 动态超时：第一轮 30s，后续轮 20s
    const timeout = round === 1 ? 30000 : 20000;
    const response = await captureAgentResponse(speaker.agent_id, timeout);

    // 更新消息
    updateMessage(thinkingId, speaker.agent_id, response);

    // 收敛检测
    const isConverged = await invoke('check_convergence', {
      message: response
    });
    if (isConverged) {
      addSystemMessage('讨论已收敛');
      break;
    }

    // 用户中断检查
    if (discussionAborted) {
      addSystemMessage('讨论已手动中断');
      break;
    }
  }

  // 显示决策面板
  showDecisionPanel();
}

// 用户中断按钮
let discussionAborted = false;
window.abortDiscussion = function() {
  discussionAborted = true;
};
```

#### 方案 B: 双模式设计

```
┌──────────────────────────────────────────────┐
│  群聊模式                                     │
│                                              │
│  [讨论模式]  [Beam模式]  [1v1模式]           │
│                                              │
│  讨论模式: Agent 间对话 → 确认 → 执行        │
│  Beam模式: 同时问多个 → 用户选最佳           │
│  1v1模式:  单独和某个 Agent 对话（现有）      │
│                                              │
└──────────────────────────────────────────────┘
```

**Beam 模式实现（适合 yuai-gui）：**

```javascript
// Beam 模式：同时向所有已启用的 agent 发送同一问题
async function runBeam(question) {
  const activeAgents = agents.filter(a => a.enabled && sessions[a.id]?.ptyId);

  // 并行发送
  const promises = activeAgents.map(async agent => {
    const thinkingId = showThinking(agent.id);
    window._agentBuffers[agent.id] = '';

    await invoke('pty_write', {
      id: sessions[agent.id].ptyId,
      data: question + '\n'
    });

    const response = await captureAgentResponse(agent.id, 30000);
    updateMessage(thinkingId, agent.id, response);
    return { agent: agent.id, response };
  });

  const results = await Promise.allSettled(promises);

  // 显示对比面板
  showComparisonPanel(results);
}
```

### 3.5 Agent 输出解析器（关键缺失）

CLI agent 的输出不只是对话文本，还有：
- ANSI 颜色码、光标移动
- 进度条、spinner
- 工具调用结果（文件读写、命令执行）
- 确认提示（y/n）
- 版本信息、欢迎文本

需要一个**输出解析器**来提取有意义的内容：

```javascript
class AgentOutputParser {
  constructor(agentId) {
    this.agentId = agentId;
    this.buffer = '';
    this.state = 'idle'; // idle | thinking | responding | tool_call | confirm
  }

  feed(rawData) {
    this.buffer += rawData;

    // 检测状态转换
    if (this.buffer.includes('Thinking...') || this.buffer.includes('⠋')) {
      this.state = 'thinking';
    }

    // 提取对话内容（去掉 ANSI 和工具输出）
    const lines = this.buffer.split('\n');
    const meaningful = lines.filter(line => {
      const clean = stripAnsi(line).trim();
      // 过滤掉空行、进度条、欢迎文本
      if (!clean) return false;
      if (clean.match(/^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]+$/)) return false; // spinner
      if (clean.startsWith('╭') || clean.startsWith('╰')) return false; // box drawing
      return true;
    });

    return meaningful.join('\n');
  }
}
```

---

## 四、架构改进路线图

### Phase 1: PTY 修复（1-2 天）

- [ ] 实现 `pty_resize` — 存储 master handle
- [ ] 前端 resize 防抖（50ms debounce）
- [ ] 进程退出通知 → 前端状态更新
- [ ] PTY cleanup on window close

### Phase 2: 群聊增强（3-5 天）

- [ ] 动态超时（首轮 30s，后续 20s）
- [ ] 用户中断按钮
- [ ] 收敛检测（基于关键词重复率）
- [ ] 专长匹配发言选择
- [ ] 输出解析器（过滤 ANSI/spinner/工具输出）

### Phase 3: Beam 模式（2-3 天）

- [ ] 并行向所有 agent 发送同一问题
- [ ] 并排对比显示
- [ ] 用户选择最佳响应继续对话

### Phase 4: 执行引擎（3-5 天）

- [ ] 执行阶段状态机
- [ ] 执行结果收集
- [ ] 失败回滚到讨论阶段
- [ ] 文件变更 Diff 审批（已有基础）

---

## 五、竞品代码参考

### 5.1 值得直接看的 GitHub 仓库

| 仓库 | 关注点 | 文件 |
|------|--------|------|
| `microsoft/autogen` | 群聊编排 | `autogen/agentchat/groupchat.py` |
| `cline/cline` | 审批门 | `src/core/prompts/system.ts` |
| `paul-gauthier/aider` | Architect/Coder | `aider/coders/architect_coder.py` |
| `lobehub/lobe-chat` | 群聊 UX | `src/store/chat/slices/message/` |
| `enricoros/big-AGI` | Beam 模式 | `src/components/Beam/` |
| `lobehub/lobe-chat` | 多 Bot 讨论 | `src/app/chat/features/` |

### 5.2 portable-pty 参考

| 仓库 | 关注点 |
|------|--------|
| `wezterm/wezterm` | Rust PTY 管理标杆，完整 resize + cleanup |
| `zed-industries/zed` | Rust 编辑器终端，portable-pty 高级用法 |
| `zed-industries/zed/crates/terminal` | PTY 生命周期管理 |

---

## 六、总结

yuai-gui 的核心架构（Tauri + PTY + 群聊）是正确的，但从"原型"到"可用产品"需要：

1. **PTY 层** — resize、cleanup、进程退出通知（基础设施）
2. **编排层** — 专长匹配、收敛检测、超时处理（智能层）
3. **UX 层** — 中断按钮、进度反馈、输出清洗（体验层）
4. **Beam 模式** — 并行提问 + 对比选择（差异化功能）

优先级建议：先修 PTY 基础（resize + cleanup），再增强群聊（超时 + 中断 + 收敛），最后加 Beam 模式。
