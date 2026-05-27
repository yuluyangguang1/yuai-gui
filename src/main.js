import { invoke, Channel } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';

// ═══ State ═══
let agents = [];
let activePanel = 'group'; // 'group' | agent id | 'config'
let sessions = {}; // agentId → { ptyId, terminal, fitAddon, container }
let workspace = null; // current workspace path

// ═══ DOM refs ═══
const sidebar = document.getElementById('sidebar');
const mainPanel = document.getElementById('main-panel');
const statusBar = document.getElementById('status-bar');

// ═══ Initialize ═══
async function init() {
  try {
    agents = await invoke('list_agents');
    // Try to load saved workspace
    workspace = localStorage.getItem('yuai_workspace') || null;
    renderSidebar();
    if (!workspace) {
      renderWorkspaceSelector();
    } else {
      renderGroupPanel();
    }
    updateStatus(workspace ? `工作区: ${shortenPath(workspace)}` : '请选择工作区');
  } catch (e) {
    console.error('init failed:', e);
    mainPanel.innerHTML = `<div class="error">初始化失败: ${e}</div>`;
  }
}

// ═══ Sidebar ═══
function renderSidebar() {
  const agentButtons = agents
    .filter(a => a.enabled)
    .map(a => `
      <button class="agent-btn" data-id="${a.id}" style="color:${a.color}" title="${a.name}">
        ${a.glyph}
        <span class="status-dot off"></span>
        <span class="expand-label">${a.name}</span>
      </button>
    `).join('');

  sidebar.innerHTML = `
    ${agentButtons}
    <div class="sep"></div>
    <button class="nav-btn active" data-panel="group" title="群聊">群</button>
    <button class="nav-btn" data-panel="config" title="配置">⚙</button>
  `;

  // Event listeners
  sidebar.querySelectorAll('.agent-btn').forEach(btn => {
    btn.addEventListener('click', () => switchPanel(btn.dataset.id));
  });
  sidebar.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => switchPanel(btn.dataset.panel));
  });
}

// ═══ Workspace Selector ═══
function renderWorkspaceSelector() {
  mainPanel.innerHTML = `
    <div class="workspace-selector">
      <div style="font-family:var(--brush);font-size:3rem;color:var(--accent);opacity:.6;margin-bottom:16px">合</div>
      <h2 style="font-family:var(--serif);margin-bottom:8px">选择工作区</h2>
      <p style="opacity:.5;font-size:.85rem;margin-bottom:24px">所有 Agent 将在同一个目录中协作</p>
      <button class="workspace-btn" onclick="selectWorkspace()">📂 选择项目目录</button>
      ${getRecentWorkspaces().length > 0 ? `
        <div class="recent-workspaces">
          <span style="font-family:var(--mono);font-size:.65rem;opacity:.4;margin-bottom:8px;display:block">最近使用</span>
          ${getRecentWorkspaces().map(w => `
            <button class="recent-ws-btn" onclick="setWorkspace('${w.replace(/\\/g, '\\\\')}')">${shortenPath(w)}</button>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `;
}

window.selectWorkspace = async function() {
  try {
    const selected = await open({ directory: true, multiple: false, title: '选择工作区目录' });
    if (selected) {
      setWorkspace(selected);
    }
  } catch (e) {
    console.error('select workspace:', e);
  }
};

window.setWorkspace = function(path) {
  workspace = path;
  localStorage.setItem('yuai_workspace', path);
  // Save to recent list
  let recent = getRecentWorkspaces();
  recent = [path, ...recent.filter(w => w !== path)].slice(0, 5);
  localStorage.setItem('yuai_recent_workspaces', JSON.stringify(recent));
  updateStatus(`工作区: ${shortenPath(path)}`);
  renderGroupPanel();
};

function getRecentWorkspaces() {
  try {
    return JSON.parse(localStorage.getItem('yuai_recent_workspaces') || '[]');
  } catch { return []; }
}

function shortenPath(p) {
  if (!p) return '';
  const parts = p.replace(/\\/g, '/').split('/');
  if (parts.length <= 3) return p;
  return '.../' + parts.slice(-2).join('/');
}

// ═══ Panel Switching (improved: preserves terminal sessions) ═══
// ═══ Panel Switching (improved: preserves terminal sessions) ═══
function switchPanel(panelId) {
  activePanel = panelId;

  // Update sidebar active state
  sidebar.querySelectorAll('.agent-btn, .nav-btn').forEach(b => b.classList.remove('active'));
  const activeBtn = sidebar.querySelector(`[data-id="${panelId}"], [data-panel="${panelId}"]`);
  if (activeBtn) activeBtn.classList.add('active');

  // Detach any currently visible terminal (don't destroy it)
  Object.values(sessions).forEach(s => {
    if (s.terminal && s.terminal.element) {
      s.terminal.element.style.display = 'none';
    }
  });

  if (panelId === 'group') {
    renderGroupPanel();
  } else if (panelId === 'config') {
    renderConfigPanel();
  } else {
    renderAgentPanel(panelId);
  }
}

// ═══ Group Chat Panel ═══
let groupMessagesHtml = ''; // Persist across panel switches

function renderGroupPanel() {
  if (!groupMessagesHtml) {
    groupMessagesHtml = `
      <div class="system-msg">
        <div style="font-family:var(--brush);font-size:2rem;color:var(--accent);opacity:.6;margin-bottom:8px">合</div>
        群聊模式 · 四器协作<br>
        <span style="opacity:.5;font-size:.8rem">输入需求，所有已启用的 Agent 将参与讨论${workspace ? '<br>工作区: ' + shortenPath(workspace) : ''}</span>
      </div>
    `;
  }

  mainPanel.innerHTML = `
    <div class="chat-panel">
      <div class="chat-messages" id="group-messages">${groupMessagesHtml}</div>
      <div class="chat-input">
        <span class="mode-tag">群聊</span>
        <input type="text" id="group-input" placeholder="描述你的需求... (所有 Agent 参与讨论)">
        <button onclick="sendGroupMessage()">发送</button>
      </div>
    </div>
  `;

  const input = document.getElementById('group-input');
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendGroupMessage();
    }
  });

  // Scroll to bottom
  const msgs = document.getElementById('group-messages');
  if (msgs) msgs.scrollTop = msgs.scrollHeight;
}


// ═══ Single Agent Panel (with embedded terminal) ═══
function renderAgentPanel(agentId) {
  const agent = agents.find(a => a.id === agentId);
  if (!agent) return;

  mainPanel.innerHTML = `
    <div class="agent-panel">
      <div class="agent-header">
        <span class="agent-glyph" style="color:${agent.color}">${agent.glyph}</span>
        <span class="agent-title">${agent.name} · ${agent.chinese_name}</span>
        <span class="agent-specialty">${agent.specialty}</span>
        <div class="view-toggle">
          <button class="active" onclick="showAgentChat('${agentId}')">对话</button>
          <button onclick="showAgentTerminal('${agentId}')">终端</button>
        </div>
      </div>
      <div class="terminal-container" id="term-${agentId}"></div>
      <div class="chat-input">
        <span class="mode-tag" style="border-color:${agent.color};color:${agent.color}">${agent.glyph}</span>
        <input type="text" id="input-${agentId}" placeholder="和 ${agent.name} 对话...">
        <button onclick="sendToAgent('${agentId}')">发送</button>
      </div>
    </div>
  `;

  // Initialize or reattach terminal
  initTerminal(agentId);

  const input = document.getElementById(`input-${agentId}`);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendToAgent(agentId);
    }
  });
}

// ═══ Terminal Management (session persistence) ═══
async function initTerminal(agentId) {
  const container = document.getElementById(`term-${agentId}`);
  if (!container) return;

  // If session already exists with a terminal, reattach
  if (sessions[agentId] && sessions[agentId].terminal) {
    const { terminal, fitAddon } = sessions[agentId];
    container.innerHTML = '';
    terminal.open(container);
    terminal.element.style.display = '';
    setTimeout(() => fitAddon.fit(), 50);
    return;
  }

  // If session exists with ptyId but no terminal (spawned by group chat), create terminal and attach
  if (sessions[agentId] && sessions[agentId].ptyId && !sessions[agentId].terminal) {
    const agent = agents.find(a => a.id === agentId);
    const terminal = createTerminal();
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.loadAddon(new WebLinksAddon());
    container.innerHTML = '';
    terminal.open(container);
    setTimeout(() => fitAddon.fit(), 50);

    // Attach input to existing PTY
    terminal.onData(data => {
      invoke('pty_write', { id: sessions[agentId].ptyId, data });
    });

    // Pipe buffer output to terminal (catch up on missed output)
    if (window._agentBuffers && window._agentBuffers[agentId]) {
      terminal.write(window._agentBuffers[agentId]);
    }

    sessions[agentId].terminal = terminal;
    sessions[agentId].fitAddon = fitAddon;
    updateAgentStatus(agentId, 'ready');

    const resizeObserver = new ResizeObserver(() => { if (fitAddon) fitAddon.fit(); });
    resizeObserver.observe(container);
    return;
  }

  // No session at all — create new terminal + spawn agent
  const agent = agents.find(a => a.id === agentId);
  const terminal = createTerminal();
  const fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);
  terminal.loadAddon(new WebLinksAddon());
  container.innerHTML = '';
  terminal.open(container);
  setTimeout(() => fitAddon.fit(), 50);

  // Spawn Agent PTY
  if (!window._agentBuffers) window._agentBuffers = {};
  window._agentBuffers[agentId] = '';

  const onData = new Channel();
  onData.onmessage = (data) => {
    terminal.write(data);
    window._agentBuffers[agentId] += data;
  };

  try {
    const ptyId = await invoke('spawn_agent', {
      agentId,
      cwd: workspace,
      cols: terminal.cols,
      rows: terminal.rows,
      onData,
    });

    sessions[agentId] = { ptyId, terminal, fitAddon };

    // Terminal input → PTY stdin
    terminal.onData(data => {
      invoke('pty_write', { id: ptyId, data });
    });

    updateAgentStatus(agentId, 'ready');
    updateStatus(`${agent.name} 已启动 · ${shortenPath(workspace)}`);
  } catch (e) {
    terminal.write(`\r\n\x1b[31m启动失败: ${e}\x1b[0m\r\n`);
    terminal.write(`\r\n\x1b[33m提示: 请确认已在配置面板填写 API Key，且 bundle/ 中有对应二进制\x1b[0m\r\n`);
    sessions[agentId] = { ptyId: null, terminal, fitAddon };
    updateAgentStatus(agentId, 'error');
    updateStatus(`${agent.name} 启动失败`);
  }

  const resizeObserver = new ResizeObserver(() => { if (fitAddon) fitAddon.fit(); });
  resizeObserver.observe(container);
}

function createTerminal() {
  return new Terminal({
    theme: {
      background: '#0a1a1a',
      foreground: '#ffe6cb',
      cursor: '#00ffc8',
      cursorAccent: '#041c1c',
      selectionBackground: '#00ffc840',
      black: '#0a1a1a',
      brightBlack: '#7a9a90',
      green: '#00ffc8',
      brightGreen: '#50c878',
      red: '#ff6464',
      yellow: '#ffc857',
      blue: '#4285f4',
      magenta: '#a064ff',
    },
    fontFamily: "'Courier New', 'Menlo', 'Consolas', monospace",
    fontSize: 13,
    cursorBlink: true,
    scrollback: 5000,
  });
}

function updateAgentStatus(agentId, status) {
  const dot = sidebar.querySelector(`[data-id="${agentId}"] .status-dot`);
  if (!dot) return;
  dot.classList.remove('off', 'ready', 'busy');
  dot.classList.add(status === 'ready' ? 'ready' : status === 'busy' ? 'busy' : 'off');
}

// ═══ Message Sending ═══
window.sendGroupMessage = async function() {
  const input = document.getElementById('group-input');
  if (!input || !input.value.trim()) return;
  const msg = input.value.trim();
  input.value = '';

  // Add user message to UI
  const messages = document.getElementById('group-messages');
  messages.innerHTML += `
    <div class="msg user">
      <div class="avatar user-av">你</div>
      <div class="bubble">${escapeHtml(msg)}</div>
    </div>
  `;
  messages.scrollTop = messages.scrollHeight;
  groupMessagesHtml = messages.innerHTML;

  // Handle commands
  if (msg.startsWith('/')) {
    await handleCommand(msg);
    return;
  }

  // Send to message bus
  try {
    const speakers = await invoke('group_send', { content: msg });
    updateStatus(`讨论中 · ${speakers.length} 个 Agent 将发言`);

    // Trigger agent responses sequentially
    await runDiscussion();
  } catch (e) {
    addSystemMessage(`错误: ${e}`);
  }
};

async function runDiscussion() {
  while (true) {
    const speaker = await invoke('group_next_speaker');
    if (!speaker) {
      addSystemMessage(`
        所有 Agent 已发言完毕。
        <div class="actions">
          <button class="primary" onclick="confirmExecution()">✓ 确认执行</button>
          <button onclick="continueDicussion()">↻ 继续讨论</button>
        </div>
      `);
      updateStatus('待确认');
      break;
    }

    const agent = agents.find(a => a.id === speaker.agent_id);
    if (!agent) continue;

    // Always get fresh DOM reference (user might have switched panels)
    let messages = document.getElementById('group-messages');
    if (!messages) { await sleep(500); messages = document.getElementById('group-messages'); }
    if (!messages) break; // User left group chat entirely

    // Show thinking indicator
    updateAgentStatus(speaker.agent_id, 'busy');
    const thinkingId = `thinking-${Date.now()}`;
    messages.innerHTML += `
      <div class="msg" id="${thinkingId}">
        <div class="avatar" style="background:${agent.color}20;color:${agent.color};border-color:${agent.color}40">${agent.glyph}</div>
        <div class="bubble"><div class="name" style="color:${agent.color}">${agent.name} · ${agent.chinese_name}</div><span class="thinking">思考中...</span></div>
      </div>
    `;
    messages.scrollTop = messages.scrollHeight;
    groupMessagesHtml = messages.innerHTML;

    // Build prompt and inject into agent's PTY
    const prompt = await invoke('group_build_prompt', { agentId: speaker.agent_id });

    // Ensure agent is spawned
    if (!sessions[speaker.agent_id]) {
      await spawnAgentForGroup(speaker.agent_id);
    }

    // Write prompt to agent's stdin
    if (sessions[speaker.agent_id] && sessions[speaker.agent_id].ptyId) {
      const startTime = Date.now();
      await invoke('pty_write', { id: sessions[speaker.agent_id].ptyId, data: prompt + '\n' });

      // Wait for response (capture stdout for a few seconds)
      const response = await captureAgentResponse(speaker.agent_id, 15000);
      const duration = Date.now() - startTime;

      // Record in bus
      await invoke('group_agent_response', {
        agentId: speaker.agent_id,
        content: response,
        tokens: null,
        model: null,
        durationMs: duration,
      });

      // Replace thinking indicator with actual response
      const thinkingEl = document.getElementById(thinkingId);
      if (thinkingEl) {
        thinkingEl.innerHTML = `
          <div class="avatar" style="background:${agent.color}20;color:${agent.color};border-color:${agent.color}40">${agent.glyph}</div>
          <div class="bubble">
            <div class="name" style="color:${agent.color}">${agent.name} · ${agent.chinese_name}</div>
            ${escapeHtml(response)}
            <div class="meta">⏱ ${(duration/1000).toFixed(1)}s</div>
          </div>
        `;
      }
    } else {
      // Agent not available — skip
      const thinkingEl = document.getElementById(thinkingId);
      if (thinkingEl) {
        thinkingEl.innerHTML = `
          <div class="avatar" style="background:${agent.color}20;color:${agent.color};border-color:${agent.color}40">${agent.glyph}</div>
          <div class="bubble"><div class="name" style="color:${agent.color}">${agent.name}</div><span style="opacity:.5">未启动，跳过</span></div>
        `;
      }
    }

    updateAgentStatus(speaker.agent_id, 'ready');
    // Refresh DOM ref and persist
    messages = document.getElementById('group-messages');
    if (messages) {
      messages.scrollTop = messages.scrollHeight;
      groupMessagesHtml = messages.innerHTML;
    }
  }
}

async function spawnAgentForGroup(agentId) {
  // If agent already has a PTY session (from single-chat), reuse it
  if (sessions[agentId] && sessions[agentId].ptyId) {
    // Just ensure the buffer callback is set up
    if (!window._agentBuffers) window._agentBuffers = {};
    if (!(agentId in window._agentBuffers)) window._agentBuffers[agentId] = '';
    return;
  }

  const onData = new Channel();
  // Buffer stdout for group chat capture
  if (!window._agentBuffers) window._agentBuffers = {};
  window._agentBuffers[agentId] = '';
  onData.onmessage = (data) => {
    window._agentBuffers[agentId] += data;
    // Also write to terminal if it exists
    if (sessions[agentId] && sessions[agentId].terminal) {
      sessions[agentId].terminal.write(data);
    }
  };

  try {
    const ptyId = await invoke('spawn_agent', {
      agentId,
      cwd: workspace,
      cols: 120,
      rows: 40,
      onData,
    });
    if (!sessions[agentId]) sessions[agentId] = {};
    sessions[agentId].ptyId = ptyId;
    updateAgentStatus(agentId, 'ready');

    // Wait for startup banner to finish (2s) before using in group chat
    await sleep(2000);
    window._agentBuffers[agentId] = ''; // Clear startup output
  } catch (e) {
    console.error(`spawn ${agentId} for group:`, e);
  }
}

async function captureAgentResponse(agentId, timeoutMs) {
  // Clear buffer
  if (!window._agentBuffers) window._agentBuffers = {};
  window._agentBuffers[agentId] = '';

  // Wait for output to stabilize (no new output for 3s, or timeout)
  return new Promise(resolve => {
    let lastLen = 0;
    let stableCount = 0;
    const checkInterval = setInterval(() => {
      const buf = window._agentBuffers[agentId] || '';
      if (buf.length === lastLen && buf.length > 0) {
        stableCount++;
        if (stableCount >= 3) { // 3 seconds of no new output
          clearInterval(checkInterval);
          resolve(cleanAnsi(buf));
        }
      } else {
        stableCount = 0;
        lastLen = buf.length;
      }
    }, 1000);

    // Hard timeout
    setTimeout(() => {
      clearInterval(checkInterval);
      const buf = window._agentBuffers[agentId] || '';
      resolve(buf.length > 0 ? cleanAnsi(buf) : '(无响应)');
    }, timeoutMs);
  });
}

function cleanAnsi(str) {
  // Strip ANSI escape codes
  return str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
    .replace(/\x1b\][^\x07]*\x07/g, '')  // OSC sequences
    .replace(/\r/g, '')
    .split('\n')
    .filter(l => l.trim().length > 0)
    .join('\n')
    .trim();
}

window.confirmExecution = async function() {
  try {
    await invoke('group_confirm_exec', { order: null });
    addSystemMessage('🚀 开始执行 · 按分工顺序串行');
    updateStatus('执行中');

    // Run execution queue
    await runExecution();
  } catch (e) {
    addSystemMessage(`错误: ${e}`);
  }
};

async function runExecution() {
  const messages = document.getElementById('group-messages');

  while (true) {
    const agentId = await invoke('group_next_executor');
    if (!agentId) {
      addSystemMessage('✅ 所有任务执行完毕');
      updateStatus('完成');
      break;
    }

    const agent = agents.find(a => a.id === agentId);
    if (!agent) continue;

    // Show execution start
    updateAgentStatus(agentId, 'busy');
    const execId = `exec-${agentId}-${Date.now()}`;
    messages.innerHTML += `
      <div class="msg" id="${execId}">
        <div class="avatar" style="background:${agent.color}20;color:${agent.color};border-color:${agent.color}40">${agent.glyph}</div>
        <div class="bubble">
          <div class="name" style="color:${agent.color}">${agent.name} · 执行中</div>
          <span class="thinking">正在执行任务...</span>
          <div class="exec-hint">点击侧栏「${agent.glyph}」查看实时终端输出</div>
        </div>
      </div>
    `;
    messages.scrollTop = messages.scrollHeight;

    // Ensure agent is spawned
    if (!sessions[agentId] || !sessions[agentId].ptyId) {
      await spawnAgentForGroup(agentId);
    }

    if (sessions[agentId] && sessions[agentId].ptyId) {
      // Build execution prompt from bus
      const chatMessages = await invoke('group_get_messages');
      const agentMessages = chatMessages.filter(m => m.from === agentId && m.msg_type === 'chat');
      const task = agentMessages.length > 0
        ? agentMessages[agentMessages.length - 1].content
        : '执行你在讨论中承诺的任务';

      const execPrompt = `请开始执行你在讨论中承诺的任务。直接操作文件和代码。\n你的任务摘要：${task}\n`;

      // Clear buffer and inject execution prompt
      window._agentBuffers[agentId] = '';
      const startTime = Date.now();
      await invoke('pty_write', { id: sessions[agentId].ptyId, data: execPrompt + '\n' });

      // Wait for execution to complete (longer timeout: 60s)
      const result = await captureAgentResponse(agentId, 60000);
      const duration = Date.now() - startTime;

      // Update UI
      const execEl = document.getElementById(execId);
      if (execEl) {
        const preview = result.length > 300 ? result.substring(0, 300) + '...' : result;
        execEl.innerHTML = `
          <div class="avatar" style="background:${agent.color}20;color:${agent.color};border-color:${agent.color}40">${agent.glyph}</div>
          <div class="bubble">
            <div class="name" style="color:${agent.color}">${agent.name} · 执行完成 ✓</div>
            <pre class="exec-output">${escapeHtml(preview)}</pre>
            <div class="meta">⏱ ${(duration/1000).toFixed(1)}s</div>
          </div>
        `;
      }

      // Record result in bus
      await invoke('group_agent_response', {
        agentId,
        content: `[执行完成] ${result.substring(0, 500)}`,
        tokens: null,
        model: null,
        durationMs: duration,
      });
    } else {
      const execEl = document.getElementById(execId);
      if (execEl) {
        execEl.querySelector('.bubble').innerHTML = `
          <div class="name" style="color:${agent.color}">${agent.name}</div>
          <span style="color:#ff6464">未启动，跳过执行</span>
        `;
      }
    }

    updateAgentStatus(agentId, 'ready');
    messages.scrollTop = messages.scrollHeight;

    // Brief pause between agents
    await sleep(1000);
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

window.continueDicussion = function() {
  const input = document.getElementById('group-input');
  if (input) input.focus();
};

async function handleCommand(cmd) {
  const parts = cmd.split(' ');
  const command = parts[0];
  const arg = parts.slice(1).join(' ');

  switch (command) {
    case '/invite':
      if (arg) {
        await invoke('group_invite', { agentId: arg });
        addSystemMessage(`已邀请 ${arg} 加入群聊`);
      }
      break;
    case '/kick':
      if (arg) {
        await invoke('group_kick', { agentId: arg });
        addSystemMessage(`已将 ${arg} 移出群聊`);
      }
      break;
    case '/agents':
      const phase = await invoke('group_get_phase');
      addSystemMessage(`当前阶段: ${phase}<br>参与者: ${agents.filter(a=>a.enabled).map(a=>a.name).join(', ')}`);
      break;
    default:
      addSystemMessage(`未知命令: ${command}`);
  }
}

function addSystemMessage(html) {
  const messages = document.getElementById('group-messages');
  if (messages) {
    messages.innerHTML += `<div class="system-msg">${html}</div>`;
    messages.scrollTop = messages.scrollHeight;
    groupMessagesHtml = messages.innerHTML;
  }
}

window.sendToAgent = function(agentId) {
  const input = document.getElementById(`input-${agentId}`);
  if (!input || !input.value.trim()) return;
  const msg = input.value.trim();
  input.value = '';

  // Write directly to PTY stdin
  if (sessions[agentId] && sessions[agentId].ptyId) {
    invoke('pty_write', { id: sessions[agentId].ptyId, data: msg + '\n' });
  } else {
    // Agent not running — show error in terminal
    if (sessions[agentId] && sessions[agentId].terminal) {
      sessions[agentId].terminal.write('\r\n\x1b[31mAgent 未启动，请先在配置面板设置 API Key\x1b[0m\r\n');
    }
  }
};

window.showAgentChat = function(agentId) {
  // TODO: toggle between chat view and terminal view
};

window.showAgentTerminal = function(agentId) {
  // Already showing terminal
};

// ═══ Config Panel ═══
function renderConfigPanel() {
  const agentSections = agents.filter(a => a.enabled).map(a => {
    const appType = a.id === 'claude' ? 'claude' : a.id === 'codex' ? 'codex' : a.id;
    return `
      <div class="config-agent" data-app-type="${appType}" data-agent-id="${a.id}">
        <div class="config-agent-header">
          <span style="color:${a.color};font-family:var(--brush);font-size:1.4rem">${a.glyph}</span>
          <span style="font-family:var(--serif);font-weight:700">${a.name}</span>
          <span style="opacity:.4;font-size:.75rem;margin-left:auto">${a.config_type}</span>
        </div>
        <div class="config-fields">
          <label>Base URL</label>
          <input type="text" class="cfg-url" placeholder="https://api.example.com/v1" data-agent="${a.id}">
          <label>API Key</label>
          <input type="password" class="cfg-key" placeholder="sk-..." data-agent="${a.id}">
          <label>模型</label>
          <input type="text" class="cfg-model" placeholder="claude-sonnet-4 / gpt-5.4" data-agent="${a.id}">
          <button class="cfg-save" onclick="saveAgentConfig('${a.id}', '${appType}')">保存</button>
          <span class="cfg-status" id="cfg-status-${a.id}"></span>
        </div>
      </div>
    `;
  }).join('');

  mainPanel.innerHTML = `
    <div class="config-panel">
      <div class="config-header">
        <h2 style="font-family:var(--serif)">API 配置</h2>
        <p style="opacity:.5;font-size:.82rem;margin-top:4px">每个 Agent 可独立配置，也可共用同一个中转站 Key</p>
      </div>

      <!-- 共用 Key 快捷设置 -->
      <div class="shared-key-section">
        <h3 style="font-family:var(--serif);font-size:.95rem;margin-bottom:10px">🔗 共用 Key（一键填充所有 Agent）</h3>
        <div class="config-fields" style="border:1px solid var(--border);border-radius:8px;padding:14px">
          <label>Base URL</label>
          <input type="text" id="shared-url" placeholder="https://your-relay.com/v1 (中转站地址)">
          <label>API Key</label>
          <input type="password" id="shared-key" placeholder="sk-... (共用 Key)">
          <label>模型</label>
          <input type="text" id="shared-model" placeholder="留空则各 Agent 用默认模型">
          <button class="cfg-save" onclick="applySharedKey()">应用到所有 Agent</button>
          <span class="cfg-status" id="cfg-status-shared"></span>
        </div>
      </div>

      <!-- Provider 模板 -->
      <div class="template-section">
        <h3 style="font-family:var(--serif);font-size:.95rem;margin:20px 0 10px">📋 快速模板</h3>
        <div class="template-grid">
          <button class="template-btn" onclick="applyTemplate('openai')">OpenAI 官方</button>
          <button class="template-btn" onclick="applyTemplate('anthropic')">Anthropic 官方</button>
          <button class="template-btn" onclick="applyTemplate('deepseek')">DeepSeek</button>
          <button class="template-btn" onclick="applyTemplate('oneapi')">one-api 中转</button>
          <button class="template-btn" onclick="applyTemplate('newapi')">new-api 中转</button>
          <button class="template-btn" onclick="applyTemplate('azure')">Azure OpenAI</button>
        </div>
      </div>

      <!-- 各 Agent 独立配置 -->
      <h3 style="font-family:var(--serif);font-size:.95rem;margin:24px 0 10px">⚙ 各 Agent 独立配置</h3>
      <div class="config-agents">
        ${agentSections}
      </div>

      <!-- 添加自定义 Agent -->
      <div class="add-agent-section">
        <h3 style="font-family:var(--serif);font-size:.95rem;margin:24px 0 10px">➕ 添加自定义 Agent</h3>
        <div class="config-fields" style="border:1px solid var(--border);border-radius:8px;padding:14px">
          <label>ID</label>
          <input type="text" id="new-agent-id" placeholder="gemini">
          <label>名称</label>
          <input type="text" id="new-agent-name" placeholder="gemini-cli">
          <label>中文名</label>
          <input type="text" id="new-agent-cn" placeholder="明镜">
          <label>图标字</label>
          <input type="text" id="new-agent-glyph" placeholder="镜" maxlength="1">
          <label>颜色</label>
          <input type="color" id="new-agent-color" value="#4285f4">
          <label>专长</label>
          <input type="text" id="new-agent-spec" placeholder="搜索、多模态">
          <label>二进制路径</label>
          <input type="text" id="new-agent-bin" placeholder="bundle/gemini/{platform}/gemini">
          <button class="cfg-save" onclick="addCustomAgent()">添加 Agent</button>
          <span class="cfg-status" id="cfg-status-new"></span>
        </div>
      </div>
    </div>
  `;

  // Load existing configs
  agents.filter(a => a.enabled).forEach(a => loadAgentConfig(a.id));
}

// ═══ Shared Key ═══
window.applySharedKey = async function() {
  const url = document.getElementById('shared-url')?.value || '';
  const key = document.getElementById('shared-key')?.value || '';
  const model = document.getElementById('shared-model')?.value || '';
  const status = document.getElementById('cfg-status-shared');

  if (!url && !key) {
    if (status) { status.textContent = '请填写 URL 或 Key'; status.style.color = '#ff6464'; }
    return;
  }

  let saved = 0;
  for (const a of agents.filter(a => a.enabled)) {
    const appType = a.id === 'claude' ? 'claude' : a.id === 'codex' ? 'codex' : a.id;
    const agentModel = model || (a.id === 'claude' ? 'claude-sonnet-4' : a.id === 'codex' ? 'gpt-5.4' : '');
    try {
      await invoke('save_provider', {
        provider: {
          id: `${a.id}-shared`,
          app_type: appType,
          name: 'Shared Provider',
          base_url: url,
          api_key: key,
          model: agentModel,
          is_current: true,
        }
      });
      saved++;
    } catch (e) { console.error(`save ${a.id}:`, e); }
  }

  if (status) {
    status.textContent = `✓ 已应用到 ${saved} 个 Agent`;
    status.style.color = 'var(--accent)';
    setTimeout(() => { status.textContent = ''; }, 3000);
  }

  // Refresh individual fields
  agents.filter(a => a.enabled).forEach(a => loadAgentConfig(a.id));
};

// ═══ Templates ═══
const TEMPLATES = {
  openai: { url: 'https://api.openai.com/v1', model: 'gpt-5.4', hint: '填入 OpenAI API Key' },
  anthropic: { url: 'https://api.anthropic.com/v1', model: 'claude-sonnet-4', hint: '填入 Anthropic API Key' },
  deepseek: { url: 'https://api.deepseek.com/v1', model: 'deepseek-chat', hint: '填入 DeepSeek API Key' },
  oneapi: { url: 'http://localhost:3000/v1', model: '', hint: '填入 one-api 的 Token' },
  newapi: { url: 'http://localhost:3000/v1', model: '', hint: '填入 new-api 的 Token' },
  azure: { url: 'https://YOUR_RESOURCE.openai.azure.com/openai/v1', model: 'gpt-4o', hint: '填入 Azure API Key' },
};

window.applyTemplate = function(templateId) {
  const t = TEMPLATES[templateId];
  if (!t) return;
  const urlEl = document.getElementById('shared-url');
  const modelEl = document.getElementById('shared-model');
  if (urlEl) urlEl.value = t.url;
  if (modelEl) modelEl.value = t.model;
  const status = document.getElementById('cfg-status-shared');
  if (status) { status.textContent = `模板已填入 · ${t.hint}`; status.style.color = 'var(--accent)'; }
};

// ═══ Custom Agent ═══
window.addCustomAgent = async function() {
  const id = document.getElementById('new-agent-id')?.value?.trim();
  const name = document.getElementById('new-agent-name')?.value?.trim();
  const cn = document.getElementById('new-agent-cn')?.value?.trim();
  const glyph = document.getElementById('new-agent-glyph')?.value?.trim();
  const color = document.getElementById('new-agent-color')?.value || '#888888';
  const spec = document.getElementById('new-agent-spec')?.value?.trim();
  const bin = document.getElementById('new-agent-bin')?.value?.trim();
  const status = document.getElementById('cfg-status-new');

  if (!id || !name) {
    if (status) { status.textContent = '请填写 ID 和名称'; status.style.color = '#ff6464'; }
    return;
  }

  const newAgent = {
    id, name,
    chinese_name: cn || name,
    glyph: glyph || name[0],
    color,
    specialty: spec || '',
    binary: bin || `bundle/${id}/{platform}/${id}`,
    config_type: 'openai_env',
    enabled: true,
    in_group: true,
  };

  // Add to local agents list and save to agents.json via backend
  agents.push(newAgent);
  // Re-render sidebar
  renderSidebar();

  if (status) {
    status.textContent = `✓ 已添加 ${name}（重启后生效）`;
    status.style.color = 'var(--accent)';
  }

  // TODO: save to data/agents.json via Tauri command (Phase 3 enhancement)
};

async function loadAgentConfig(agentId) {
  const appType = agentId === 'claude' ? 'claude' : agentId === 'codex' ? 'codex' : agentId;
  try {
    const provider = await invoke('get_active_provider', { appType });
    if (provider) {
      const urlInput = document.querySelector(`.cfg-url[data-agent="${agentId}"]`);
      const keyInput = document.querySelector(`.cfg-key[data-agent="${agentId}"]`);
      const modelInput = document.querySelector(`.cfg-model[data-agent="${agentId}"]`);
      if (urlInput) urlInput.value = provider.base_url || '';
      if (keyInput) keyInput.value = provider.api_key || '';
      if (modelInput) modelInput.value = provider.model || '';
    }
  } catch (e) {
    console.log(`No config for ${agentId}:`, e);
  }
}

window.saveAgentConfig = async function(agentId, appType) {
  const urlInput = document.querySelector(`.cfg-url[data-agent="${agentId}"]`);
  const keyInput = document.querySelector(`.cfg-key[data-agent="${agentId}"]`);
  const modelInput = document.querySelector(`.cfg-model[data-agent="${agentId}"]`);
  const status = document.getElementById(`cfg-status-${agentId}`);

  const provider = {
    id: `${agentId}-default`,
    app_type: appType,
    name: `${agentId} provider`,
    base_url: urlInput?.value || '',
    api_key: keyInput?.value || '',
    model: modelInput?.value || '',
    is_current: true,
  };

  try {
    await invoke('save_provider', { provider });
    if (status) {
      status.textContent = '✓ 已保存';
      status.style.color = 'var(--accent)';
      setTimeout(() => { status.textContent = ''; }, 2000);
    }
  } catch (e) {
    if (status) {
      status.textContent = '✗ ' + e;
      status.style.color = '#ff6464';
    }
  }
};

// ═══ Utilities ═══
function getDefaultShell() {
  const platform = navigator.platform.toLowerCase();
  if (platform.includes('win')) return 'cmd.exe';
  if (platform.includes('mac')) return '/bin/zsh';
  return '/bin/bash';
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function updateStatus(text) {
  if (statusBar) statusBar.textContent = text;
}

// ═══ Start ═══
init();
