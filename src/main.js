import { invoke, Channel } from '@tauri-apps/api/core';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';

// ═══ State ═══
let agents = [];
let activePanel = 'group'; // 'group' | agent id
let sessions = {}; // agentId → { ptyId, terminal, fitAddon }

// ═══ DOM refs ═══
const sidebar = document.getElementById('sidebar');
const mainPanel = document.getElementById('main-panel');
const statusBar = document.getElementById('status-bar');

// ═══ Initialize ═══
async function init() {
  try {
    agents = await invoke('list_agents');
    renderSidebar();
    renderGroupPanel();
    updateStatus('就绪');
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

// ═══ Panel Switching ═══
function switchPanel(panelId) {
  activePanel = panelId;

  // Update sidebar active state
  sidebar.querySelectorAll('.agent-btn, .nav-btn').forEach(b => b.classList.remove('active'));
  const activeBtn = sidebar.querySelector(`[data-id="${panelId}"], [data-panel="${panelId}"]`);
  if (activeBtn) activeBtn.classList.add('active');

  if (panelId === 'group') {
    renderGroupPanel();
  } else if (panelId === 'config') {
    renderConfigPanel();
  } else {
    renderAgentPanel(panelId);
  }
}

// ═══ Group Chat Panel ═══
function renderGroupPanel() {
  mainPanel.innerHTML = `
    <div class="chat-panel">
      <div class="chat-messages" id="group-messages">
        <div class="system-msg">
          <div style="font-family:var(--brush);font-size:2rem;color:var(--accent);opacity:.6;margin-bottom:8px">合</div>
          群聊模式 · 四器协作<br>
          <span style="opacity:.5;font-size:.8rem">输入需求，所有已启用的 Agent 将参与讨论</span>
        </div>
      </div>
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

// ═══ Terminal Management ═══
async function initTerminal(agentId) {
  const container = document.getElementById(`term-${agentId}`);
  if (!container) return;

  // If session already exists, just reattach
  if (sessions[agentId]) {
    container.innerHTML = '';
    sessions[agentId].terminal.open(container);
    sessions[agentId].fitAddon.fit();
    return;
  }

  // Create new terminal
  const terminal = new Terminal({
    theme: {
      background: '#0a1a1a',
      foreground: '#ffe6cb',
      cursor: '#00ffc8',
      selectionBackground: '#00ffc840',
    },
    fontFamily: "'Courier New', 'Menlo', monospace",
    fontSize: 13,
    cursorBlink: true,
  });

  const fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);
  terminal.loadAddon(new WebLinksAddon());

  container.innerHTML = '';
  terminal.open(container);
  fitAddon.fit();

  // Spawn PTY
  const agent = agents.find(a => a.id === agentId);
  const shell = getDefaultShell();

  const onData = new Channel();
  onData.onmessage = (data) => {
    terminal.write(data);
  };

  try {
    const ptyId = await invoke('pty_spawn', {
      cmd: shell,
      args: [],
      cwd: null,
      cols: terminal.cols,
      rows: terminal.rows,
      onData,
    });

    sessions[agentId] = { ptyId, terminal, fitAddon };

    // Terminal input → PTY stdin
    terminal.onData(data => {
      invoke('pty_write', { id: ptyId, data });
    });

    // Update status dot
    const dot = sidebar.querySelector(`[data-id="${agentId}"] .status-dot`);
    if (dot) {
      dot.classList.remove('off');
      dot.classList.add('ready');
    }

    updateStatus(`${agent.name} 已启动`);
  } catch (e) {
    terminal.write(`\r\n\x1b[31m启动失败: ${e}\x1b[0m\r\n`);
    updateStatus(`${agent.name} 启动失败`);
  }

  // Handle resize
  const resizeObserver = new ResizeObserver(() => {
    fitAddon.fit();
  });
  resizeObserver.observe(container);
}

// ═══ Message Sending ═══
window.sendGroupMessage = function() {
  const input = document.getElementById('group-input');
  if (!input || !input.value.trim()) return;
  const msg = input.value.trim();
  input.value = '';

  // Add user message to chat
  const messages = document.getElementById('group-messages');
  messages.innerHTML += `
    <div class="msg user">
      <div class="avatar user-av">你</div>
      <div class="bubble">${escapeHtml(msg)}</div>
    </div>
  `;
  messages.scrollTop = messages.scrollHeight;

  // TODO Phase 2: Route to message bus → inject into Agent PTYs
  messages.innerHTML += `
    <div class="system-msg" style="opacity:.5;font-size:.75rem">
      [Phase 2] 消息总线将把此消息分发给群聊中的 Agent
    </div>
  `;
};

window.sendToAgent = function(agentId) {
  const input = document.getElementById(`input-${agentId}`);
  if (!input || !input.value.trim()) return;
  const msg = input.value.trim();
  input.value = '';

  // Write directly to PTY stdin
  if (sessions[agentId]) {
    invoke('pty_write', { id: sessions[agentId].ptyId, data: msg + '\n' });
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
  mainPanel.innerHTML = `
    <div class="config-panel">
      <h2 style="font-family:var(--serif);margin-bottom:16px">配置</h2>
      <p style="opacity:.6">Phase 3 将实现 Provider 管理面板</p>
      <h3 style="font-family:var(--serif);margin-top:24px">已注册 Agent</h3>
      <div class="agent-list-config">
        ${agents.map(a => `
          <div class="agent-config-item">
            <span style="color:${a.color};font-family:var(--brush);font-size:1.4rem">${a.glyph}</span>
            <span>${a.name} · ${a.chinese_name}</span>
            <span style="opacity:.5;font-size:.8rem">${a.specialty}</span>
            <span style="opacity:.4;font-size:.7rem">${a.enabled ? '✓ 启用' : '○ 禁用'}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

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
