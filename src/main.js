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

// ═══ Terminal Management (session persistence) ═══
async function initTerminal(agentId) {
  const container = document.getElementById(`term-${agentId}`);
  if (!container) return;

  // If session already exists, reattach terminal to new container
  if (sessions[agentId] && sessions[agentId].terminal) {
    const { terminal, fitAddon } = sessions[agentId];
    container.innerHTML = '';
    // xterm.js requires re-opening in new container
    terminal.open(container);
    terminal.element.style.display = '';
    setTimeout(() => fitAddon.fit(), 50);
    return;
  }

  // Create new terminal instance
  const agent = agents.find(a => a.id === agentId);
  const terminal = new Terminal({
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

  const fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);
  terminal.loadAddon(new WebLinksAddon());

  container.innerHTML = '';
  terminal.open(container);
  setTimeout(() => fitAddon.fit(), 50);

  // Spawn Agent PTY
  const onData = new Channel();
  onData.onmessage = (data) => {
    terminal.write(data);
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

    // Update sidebar status dot
    updateAgentStatus(agentId, 'ready');
    updateStatus(`${agent.name} 已启动 · ${shortenPath(workspace)}`);
  } catch (e) {
    terminal.write(`\r\n\x1b[31m启动失败: ${e}\x1b[0m\r\n`);
    terminal.write(`\r\n\x1b[33m提示: 请确认已在配置面板填写 API Key，且 bundle/ 中有对应二进制\x1b[0m\r\n`);
    sessions[agentId] = { ptyId: null, terminal, fitAddon };
    updateAgentStatus(agentId, 'error');
    updateStatus(`${agent.name} 启动失败`);
  }

  // Handle resize
  const resizeObserver = new ResizeObserver(() => {
    if (fitAddon) fitAddon.fit();
  });
  resizeObserver.observe(container);
}

function updateAgentStatus(agentId, status) {
  const dot = sidebar.querySelector(`[data-id="${agentId}"] .status-dot`);
  if (!dot) return;
  dot.classList.remove('off', 'ready', 'busy');
  dot.classList.add(status === 'ready' ? 'ready' : status === 'busy' ? 'busy' : 'off');
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
      <div class="config-agents">
        ${agentSections}
      </div>
    </div>
  `;

  // Load existing configs
  agents.filter(a => a.enabled).forEach(a => loadAgentConfig(a.id));
}

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
