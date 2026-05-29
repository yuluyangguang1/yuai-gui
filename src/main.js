import { invoke, Channel } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';

// ═══ State ═══
let agents = [];
let activeAgent = null; // 当前ly previewed agent id
let sessions = {}; // agentId → { ptyId, terminal, fitAddon }
let workspace = null;
let fileTree = [];

// ═══ DOM refs (3-column layout) ═══
const rail = document.getElementById('sidebar');
const wsBody = document.getElementById('workspace-body');
const previewBody = document.getElementById('preview-body');
const previewTitle = document.getElementById('preview-title');
const chatBody = document.getElementById('chat-body');
const chatTitle = document.getElementById('chat-title');
const statusBar = document.getElementById('status-bar');

// ═══ Initialize ═══
async function init() {
  try {
    agents = await invoke('list_agents');
    workspace = localStorage.getItem('yuai_workspace') || null;
    renderRail();
    renderWorkspaceColumn();
    renderPreviewColumn();
    renderChatColumn();
    updateStatus(workspace ? shortenPath(workspace) : 'no workspace');
  } catch (e) {
    console.error('init failed:', e);
    previewBody.innerHTML = `<div class="error">初始化失败: ${e}</div>`;
  }
}

// ═══ Rail (agent switcher) ═══
function renderRail() {
  const btns = agents.filter(a => a.enabled).map(a => `
    <button class="agent-btn" data-id="${a.id}" style="color:${a.color}" title="${a.name}">
      ${a.glyph}
      <span class="status-dot off"></span>
      <span class="expand-label">${a.name}</span>
    </button>
  `).join('');

  rail.innerHTML = `
    ${btns}
    <div class="sep"></div>
    <button class="nav-btn active" data-panel="group" title="群聊">合</button>
    <button class="nav-btn" data-panel="config" title="配置">器</button>
  `;

  rail.querySelectorAll('.agent-btn').forEach(btn => {
    btn.addEventListener('click', () => switchAgent(btn.dataset.id));
  });
  rail.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => switchChatMode(btn.dataset.panel));
  });
}

function switchAgent(agentId) {
  activeAgent = agentId;
  // Update rail active state
  rail.querySelectorAll('.agent-btn').forEach(b => b.classList.remove('active'));
  const btn = rail.querySelector(`[data-id="${agentId}"]`);
  if (btn) btn.classList.add('active');
  // Switch chat to 1v1 mode with this agent
  renderAgentChat(agentId);
  // Spawn agent in background if not already running
  if (!sessions[agentId]?.ptyId && workspace) {
    spawnAgentForGroup(agentId);
  }
}

function switchChatMode(mode) {
  rail.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const btn = rail.querySelector(`[data-panel="${mode}"]`);
  if (btn) btn.classList.add('active');
  if (mode === 'group') {
    renderGroupChat();
  } else if (mode === 'config') {
    renderConfigPanel();
  }
}

// ═══ Column 1: 状态 + 规划 ═══
function renderWorkspaceColumn() {
  if (!workspace) {
    wsBody.innerHTML = `
      <div class="workspace-empty">
        <div class="glyph">合</div>
        <h3>选择工作区</h3>
        <p>所有 Agent 在同一目录协作</p>
        <button class="workspace-btn" onclick="selectWorkspace()">选择目录</button>
        ${getRecentWorkspaces().length > 0 ? `
          <div class="recent-workspaces">
            ${getRecentWorkspaces().map(w => `
              <button class="recent-ws-btn" onclick="setWorkspace('${w.replace(/\\/g, '\\\\')}')">${shortenPath(w)}</button>
            `).join('')}
          </div>
        ` : ''}
      </div>
    `;
    return;
  }

  const enabledAgents = agents.filter(a => a.enabled);
  const agentStatusItems = enabledAgents.map(a => {
    const isRunning = sessions[a.id]?.ptyId ? true : false;
    const statusLabel = isRunning ? '运行中' : '空闲';
    const statusCls = isRunning ? 'status-on' : 'status-off';
    return `<div class="task-item">
      <span class="task-dot" style="background:${a.color}"></span>
      <span class="task-name">${a.name} · ${a.chinese_name}</span>
      <span class="task-status ${statusCls}">${statusLabel}</span>
    </div>`;
  }).join('');

  wsBody.innerHTML = `
    <!-- Collapsible file tree -->
    <details class="filetree-collapse">
      <summary class="filetree-summary">
        <span class="filetree-icon">◇</span>
        <span>${shortenPath(workspace)}</span>
      </summary>
      <div class="file-tree" id="file-tree"></div>
    </details>

    <!-- Current work status -->
    <div class="status-section">
      <div class="section-label">协作器</div>
      <div class="task-list">${agentStatusItems}</div>
    </div>

    <!-- Next steps / plan -->
    <div class="status-section">
      <div class="section-label">规划</div>
      <div class="task-list" id="plan-list">
        <div class="task-item">
          <span class="task-dot" style="background:var(--jade)"></span>
          <span class="task-name">群聊讨论需求</span>
          <span class="task-status status-on">当前</span>
        </div>
        <div class="task-item">
          <span class="task-dot" style="background:var(--gold)"></span>
          <span class="task-name">确认分工</span>
          <span class="task-status status-off">待办</span>
        </div>
        <div class="task-item">
          <span class="task-dot" style="background:var(--gold)"></span>
          <span class="task-name">并行执行</span>
          <span class="task-status status-off">待办</span>
        </div>
        <div class="task-item">
          <span class="task-dot" style="background:var(--gold)"></span>
          <span class="task-name">审查产物 Diff</span>
          <span class="task-status status-off">待办</span>
        </div>
      </div>
    </div>
  `;

  loadFileTree();
}

async function loadFileTree() {
  const container = document.getElementById('file-tree');
  if (!container || !workspace) return;
  try {
    fileTree = await invoke('read_dir_tree', { path: workspace, maxDepth: 2 });
    container.innerHTML = renderTreeNodes(fileTree, 0);
    // Bind click events
    container.querySelectorAll('.tree-node').forEach(node => {
      node.addEventListener('click', () => {
        const path = node.dataset.path;
        const isDir = node.dataset.dir === 'true';
        if (!isDir) {
          // File click → show in code preview
          container.querySelectorAll('.tree-node').forEach(n => n.classList.remove('selected'));
          node.classList.add('selected');
          currentFile = path;
          previewMode = 'code';
          document.querySelectorAll('.preview-mode-tab').forEach(t => t.classList.remove('active'));
          document.querySelector('.preview-mode-tab[data-mode="code"]')?.classList.add('active');
          loadFilePreview(path);
        } else {
          // Dir click → toggle expand (future: lazy load children)
          node.classList.toggle('expanded');
          const children = node.nextElementSibling;
          if (children && children.classList.contains('tree-children')) {
            children.style.display = children.style.display === 'none' ? '' : 'none';
          }
        }
      });
    });
  } catch (e) {
    container.innerHTML = `<div class="tree-error">${e}</div>`;
  }
}

function renderTreeNodes(nodes, depth) {
  return nodes.map(n => {
    const indent = depth * 14;
    const icon = n.is_dir ? '◇' : '·';
    const cls = n.is_dir ? 'is-dir' : 'is-file';
    const twist = n.is_dir ? '<span class="twist">▸</span>' : '<span class="twist"> </span>';
    let html = `<div class="tree-node ${cls}" style="padding-left:${indent + 8}px" data-path="${n.path}" data-dir="${n.is_dir}">
      ${twist}<span class="icon">${icon}</span>${n.name}
    </div>`;
    if (n.children && n.children.length > 0) {
      html += `<div class="tree-children">${renderTreeNodes(n.children, depth + 1)}</div>`;
    }
    return html;
  }).join('');
}

// ═══ Column 2: Artifact Preview (Code / Diff / Web) ═══
let previewMode = 'code'; // 'code' | 'diff' | 'web'
let currentFile = null; // path of file being viewed

function renderPreviewColumn() {
  // Bind mode tabs
  document.querySelectorAll('.preview-mode-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      previewMode = tab.dataset.mode;
      document.querySelectorAll('.preview-mode-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      renderPreviewContent();
    });
  });
  renderPreviewContent();
}

function renderPreviewContent() {
  if (!workspace) {
    previewBody.innerHTML = `
      <div class="preview-empty">
        <div class="glyph">器</div>
        <p>选择工作区后可预览文件</p>
      </div>
    `;
    return;
  }

  switch (previewMode) {
    case 'code':
      if (currentFile) {
        loadFilePreview(currentFile);
      } else {
        previewBody.innerHTML = `
          <div class="preview-empty">
            <div class="glyph">文</div>
            <p>点击左侧文件查看内容</p>
          </div>
        `;
      }
      break;
    case 'diff':
      loadDiffPreview();
      break;
    case 'web':
      renderWebPreview();
      break;
  }
}

async function loadFilePreview(filePath) {
  previewBody.innerHTML = `<div class="preview-loading">加载中...</div>`;
  try {
    const content = await invoke('read_file_content', { path: filePath });
    const ext = filePath.split('.').pop() || '';
    const fileName = filePath.split('/').pop() || filePath.split('\\').pop() || filePath;
    previewTitle.textContent = fileName;
    previewBody.innerHTML = `
      <div class="code-preview">
        <div class="code-meta">
          <span class="code-path">${shortenPath(filePath)}</span>
          <span class="code-ext">${ext}</span>
        </div>
        <pre class="code-content"><code>${escapeHtml(content)}</code></pre>
      </div>
    `;
  } catch (e) {
    previewBody.innerHTML = `<div class="preview-empty"><p style="color:var(--vermilion-glow)">${e}</p></div>`;
  }
}

async function loadDiffPreview() {
  previewBody.innerHTML = `<div class="preview-loading">加载变更...</div>`;
  try {
    const files = await invoke('get_changed_files', { cwd: workspace });
    if (!files || files.length === 0) {
      previewBody.innerHTML = `
        <div class="preview-empty">
          <div class="glyph" style="font-size:2.5rem">∅</div>
          <p>工作区无变更</p>
        </div>
      `;
      return;
    }
    const diff = await invoke('get_git_diff', { cwd: workspace });
    previewTitle.textContent = `变更 (${files.length})`;
    previewBody.innerHTML = `
      <div class="diff-preview">
        <div class="diff-file-list">
          ${files.map(f => `
            <div class="diff-file-item" data-path="${f.path}">
              <span class="diff-file-status ${f.status}">${f.status[0].toUpperCase()}</span>
              <span class="diff-file-name">${f.path}</span>
              <div class="diff-file-actions">
                <button class="diff-accept" onclick="acceptChange('${f.path.replace(/'/g, "\\'")}')">接受</button>
                <button class="diff-reject" onclick="rejectChange('${f.path.replace(/'/g, "\\'")}')">拒绝</button>
              </div>
            </div>
          `).join('')}
        </div>
        <div class="diff-accept-all">
          <button class="diff-accept" onclick="acceptAllChanges()">全部接受</button>
          <button class="diff-reject" onclick="rejectAllChanges()">全部拒绝</button>
        </div>
        <pre class="diff-content">${renderDiffHtml(diff)}</pre>
      </div>
    `;
  } catch (e) {
    previewBody.innerHTML = `<div class="preview-empty"><p style="color:var(--vermilion-glow)">${e}</p></div>`;
  }
}

window.acceptChange = async function(path) {
  try {
    await invoke('accept_file', { cwd: workspace, path });
    const item = document.querySelector(`.diff-file-item[data-path="${path}"]`);
    if (item) { item.style.opacity = '.4'; item.querySelector('.diff-file-actions').innerHTML = '<span style="color:var(--jade)">已接受</span>'; }
  } catch (e) { console.error(e); }
};

window.rejectChange = async function(path) {
  try {
    await invoke('revert_file', { cwd: workspace, path });
    const item = document.querySelector(`.diff-file-item[data-path="${path}"]`);
    if (item) { item.style.opacity = '.4'; item.querySelector('.diff-file-actions').innerHTML = '<span style="color:var(--vermilion-glow)">已拒绝</span>'; }
  } catch (e) { console.error(e); }
};

window.acceptAllChanges = async function() {
  for (const item of document.querySelectorAll('.diff-file-item')) {
    await invoke('accept_file', { cwd: workspace, path: item.dataset.path });
    item.style.opacity = '.4';
    item.querySelector('.diff-file-actions').innerHTML = '<span style="color:var(--jade)">已接受</span>';
  }
};

window.rejectAllChanges = async function() {
  for (const item of document.querySelectorAll('.diff-file-item')) {
    await invoke('revert_file', { cwd: workspace, path: item.dataset.path });
    item.style.opacity = '.4';
    item.querySelector('.diff-file-actions').innerHTML = '<span style="color:var(--vermilion-glow)">已拒绝</span>';
  }
};

function renderDiffHtml(diff) {
  return diff.split('\n').map(line => {
    if (line.startsWith('+++') || line.startsWith('---')) {
      return `<span class="diff-file">${escapeHtml(line)}</span>`;
    } else if (line.startsWith('+')) {
      return `<span class="diff-add">${escapeHtml(line)}</span>`;
    } else if (line.startsWith('-')) {
      return `<span class="diff-del">${escapeHtml(line)}</span>`;
    } else if (line.startsWith('@@')) {
      return `<span class="diff-hunk">${escapeHtml(line)}</span>`;
    } else if (line.startsWith('diff ')) {
      return `<span class="diff-header">${escapeHtml(line)}</span>`;
    }
    return escapeHtml(line);
  }).join('\n');
}

function renderWebPreview() {
  previewTitle.textContent = 'Web Preview';
  previewBody.innerHTML = `
    <div class="web-preview">
      <div class="web-bar">
        <input type="text" id="web-url" class="web-url-input" value="http://localhost:1420" placeholder="http://localhost:...">
        <button class="web-reload-btn" onclick="reloadWebPreview()">↻</button>
      </div>
      <iframe id="web-iframe" class="web-iframe" src="http://localhost:3000" sandbox="allow-scripts allow-same-origin allow-forms"></iframe>
    </div>
  `;
  // Try common dev server ports
  const iframe = document.getElementById('web-iframe');
  const urlInput = document.getElementById('web-url');
  if (urlInput) {
    urlInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        iframe.src = urlInput.value;
      }
    });
  }
}

window.reloadWebPreview = function() {
  const iframe = document.getElementById('web-iframe');
  const urlInput = document.getElementById('web-url');
  if (iframe && urlInput) iframe.src = urlInput.value;
};

// ═══ Terminal Management ═══
async function initTerminal(agentId, container) {
  // Already has terminal — reattach
  if (sessions[agentId]?.terminal) {
    const { terminal, fitAddon } = sessions[agentId];
    if (!container.querySelector('.xterm')) {
      container.innerHTML = '';
      terminal.open(container);
    }
    terminal.element.style.display = '';
    setTimeout(() => fitAddon.fit(), 50);
    return;
  }

  // Create new terminal + spawn agent
  const terminal = createTerminal();
  const fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);
  terminal.loadAddon(new WebLinksAddon());
  container.innerHTML = '';
  terminal.open(container);
  setTimeout(() => fitAddon.fit(), 50);

  if (!window._agentBuffers) window._agentBuffers = {};
  window._agentBuffers[agentId] = '';

  const onData = new Channel();
  onData.onmessage = (data) => {
    terminal.write(data);
    window._agentBuffers[agentId] += data;
  };

  try {
    const ptyId = await invoke('spawn_agent', {
      agentId, cwd: workspace, cols: terminal.cols, rows: terminal.rows, onData,
    });
    sessions[agentId] = { ptyId, terminal, fitAddon };
    terminal.onData(data => invoke('pty_write', { id: ptyId, data }));
    updateAgentStatus(agentId, 'ready');
    updateStatus(`${agentId} 已启动`);
  } catch (e) {
    terminal.write(`\r\n\x1b[31m启动失败: ${e}\x1b[0m\r\n`);
    terminal.write(`\r\n\x1b[33m提示: 确认 API Key 已配置且 bundle/ 有对应二进制\x1b[0m\r\n`);
    sessions[agentId] = { ptyId: null, terminal, fitAddon };
    updateAgentStatus(agentId, 'error');
  }

  const ro = new ResizeObserver(() => fitAddon?.fit());
  ro.observe(container);
}

function createTerminal() {
  return new Terminal({
    theme: {
      background: '#02100f',
      foreground: '#f0e8d6',
      cursor: '#00ffc8',
      cursorAccent: '#02100f',
      selectionBackground: '#00ffc840',
      black: '#02100f', brightBlack: '#6e8a82',
      green: '#00ffc8', brightGreen: '#50c878',
      red: '#e85a3a', yellow: '#d4af6a',
      blue: '#4285f4', magenta: '#a064ff',
    },
    fontFamily: "'JetBrains Mono', 'Menlo', monospace",
    fontSize: 13, cursorBlink: true, scrollback: 5000,
  });
}

function updateAgentStatus(agentId, status) {
  const dot = rail.querySelector(`[data-id="${agentId}"] .status-dot`);
  if (!dot) return;
  dot.classList.remove('off', 'ready', 'busy');
  dot.classList.add(status === 'ready' ? 'ready' : status === 'busy' ? 'busy' : 'off');
}

// ═══ Column 3: Chat ═══
let groupMessagesHtml = '';

function renderChatColumn() {
  renderGroupChat();
}

function renderGroupChat() {
  chatTitle.textContent = '群聊';
  rail.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const gb = rail.querySelector('[data-panel="group"]');
  if (gb) gb.classList.add('active');

  if (!groupMessagesHtml) {
    // Try loading history
    loadChatHistory();
    return;
  }
  renderGroupChatUI();
}

async function loadChatHistory() {
  try {
    const history = await invoke('load_chat_history', { workspace: workspace || '' });
    if (history && history.length > 0) {
      groupMessagesHtml = history.map(m => {
        if (m.from === 'user') {
          return `<div class="msg user"><div class="avatar user-av">Y</div><div class="bubble">${escapeHtml(m.content)}</div></div>`;
        } else if (m.msg_type === 'system') {
          return `<div class="system-msg">${escapeHtml(m.content)}</div>`;
        } else {
          const agent = agents.find(a => a.id === m.from);
          const color = agent?.color || 'var(--bone-dim)';
          const glyph = agent?.glyph || m.from[0];
          return `<div class="msg"><div class="avatar" style="color:${color}">${glyph}</div><div class="bubble"><div class="name" style="color:${color}">${m.from}</div>${escapeHtml(m.content)}</div></div>`;
        }
      }).join('');
    } else {
      groupMessagesHtml = `
        <div class="system-msg">
          <div style="font-family:var(--brush);font-size:2rem;color:var(--jade);opacity:.7;line-height:1;margin-bottom:8px">合</div>
          <div style="font-family:var(--mono);font-size:.6rem;letter-spacing:.12em;color:var(--silver)">
            ${workspace ? shortenPath(workspace) : '请先选择工作区'}
          </div>
        </div>
      `;
    }
  } catch (e) {
    groupMessagesHtml = `
      <div class="system-msg">
        <div style="font-family:var(--brush);font-size:2rem;color:var(--jade);opacity:.7;line-height:1;margin-bottom:8px">合</div>
        <div style="font-family:var(--mono);font-size:.6rem;letter-spacing:.12em;color:var(--silver)">
          ${workspace ? shortenPath(workspace) : '请先选择工作区'}
        </div>
      </div>
    `;
  }
  renderGroupChatUI();
}

function renderGroupChatUI() {

  chatBody.innerHTML = `
    <div class="chat-messages" id="group-messages">${groupMessagesHtml}</div>
    <div class="chat-input">
      <input type="text" id="group-input" placeholder="输入需求...">
      <button onclick="sendGroupMessage()">发送</button>
    </div>
  `;

  const input = document.getElementById('group-input');
  if (input) input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendGroupMessage(); }
  });
  const msgs = document.getElementById('group-messages');
  if (msgs) msgs.scrollTop = msgs.scrollHeight;
}

function renderAgentChat(agentId) {
  const agent = agents.find(a => a.id === agentId);
  if (!agent) return;
  chatTitle.textContent = `${agent.name} · ${agent.chinese_name}`;
  rail.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));

  chatBody.innerHTML = `
    <div class="chat-messages" id="agent-messages">
      <div class="system-msg">
        <div style="font-family:var(--brush);font-size:1.8rem;color:${agent.color};opacity:.8;line-height:1;margin-bottom:6px">${agent.glyph}</div>
        <div style="font-family:var(--mono);font-size:.58rem;color:var(--silver)">${agent.specialty}</div>
      </div>
    </div>
    <div class="chat-input">
      <input type="text" id="input-${agentId}" placeholder="对话...">
      <button onclick="sendToAgent('${agentId}')">发送</button>
    </div>
  `;

  const input = document.getElementById(`input-${agentId}`);
  if (input) input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendToAgent(agentId); }
  });
}

// ═══ Message Sending ═══
window.sendGroupMessage = async function() {
  const input = document.getElementById('group-input');
  if (!input || !input.value.trim()) return;
  const msg = input.value.trim();
  input.value = '';

  // Persist
  await invoke('save_chat_message', { record: { id: null, timestamp: Date.now(), from: 'user', content: msg, msg_type: 'chat', workspace: workspace || '' } }).catch(() => {});

  const messages = document.getElementById('group-messages');
  messages.innerHTML += `
    <div class="msg user">
      <div class="avatar user-av">Y</div>
      <div class="bubble">${escapeHtml(msg)}</div>
    </div>
  `;
  messages.scrollTop = messages.scrollHeight;
  groupMessagesHtml = messages.innerHTML;

  if (msg.startsWith('/')) { await handleCommand(msg); return; }

  try {
    const speakers = await invoke('group_send', { content: msg });
    updateStatus(`讨论中 · ${speakers.length} 个 Agent`);
    await runDiscussion();
  } catch (e) {
    addSystemMessage(`错误: ${e}`);
  }
};

window.sendToAgent = function(agentId) {
  const input = document.getElementById(`input-${agentId}`);
  if (!input || !input.value.trim()) return;
  const msg = input.value.trim();
  input.value = '';
  if (sessions[agentId]?.ptyId) {
    invoke('pty_write', { id: sessions[agentId].ptyId, data: msg + '\n' });
  }
};

async function runDiscussion() {
  while (true) {
    const speaker = await invoke('group_next_speaker');
    if (!speaker) {
      addSystemMessage(`
        讨论完毕
        <div class="actions">
          <button class="primary" onclick="confirmExecution()">确认执行</button>
          <button onclick="continueDicussion()">继续讨论</button>
        </div>
      `);
      updateStatus('待确认');
      break;
    }
    const agent = agents.find(a => a.id === speaker.agent_id);
    if (!agent) continue;

    let messages = document.getElementById('group-messages');
    if (!messages) { await sleep(500); messages = document.getElementById('group-messages'); }
    if (!messages) break;

    updateAgentStatus(speaker.agent_id, 'busy');
    const thinkingId = `thinking-${Date.now()}`;
    messages.innerHTML += `
      <div class="msg" id="${thinkingId}">
        <div class="avatar" style="background:${agent.color}20;color:${agent.color};border-color:${agent.color}40">${agent.glyph}</div>
        <div class="bubble"><div class="name" style="color:${agent.color}">${agent.name}</div><span class="thinking">思考中...</span></div>
      </div>
    `;
    messages.scrollTop = messages.scrollHeight;
    groupMessagesHtml = messages.innerHTML;

    const prompt = await invoke('group_build_prompt', { agentId: speaker.agent_id });
    if (!sessions[speaker.agent_id]) await spawnAgentForGroup(speaker.agent_id);

    if (sessions[speaker.agent_id]?.ptyId) {
      const startTime = Date.now();
      await invoke('pty_write', { id: sessions[speaker.agent_id].ptyId, data: prompt + '\n' });
      const response = await captureAgentResponse(speaker.agent_id, 15000);
      const duration = Date.now() - startTime;
      await invoke('group_agent_response', { agentId: speaker.agent_id, content: response, tokens: null, model: null, durationMs: duration });

      const el = document.getElementById(thinkingId);
      if (el) {
        el.innerHTML = `
          <div class="avatar" style="background:${agent.color}20;color:${agent.color};border-color:${agent.color}40">${agent.glyph}</div>
          <div class="bubble"><div class="name" style="color:${agent.color}">${agent.name}</div>${escapeHtml(response)}<div class="meta">${(duration/1000).toFixed(1)}s</div></div>
        `;
      }
    } else {
      const el = document.getElementById(thinkingId);
      if (el) el.querySelector('.thinking').textContent = '未启动，跳过';
    }

    updateAgentStatus(speaker.agent_id, 'ready');
    messages = document.getElementById('group-messages');
    if (messages) { messages.scrollTop = messages.scrollHeight; groupMessagesHtml = messages.innerHTML; }
  }
}

// ═══ Group chat helpers ═══
async function spawnAgentForGroup(agentId) {
  if (sessions[agentId]?.ptyId) {
    if (!window._agentBuffers) window._agentBuffers = {};
    if (!(agentId in window._agentBuffers)) window._agentBuffers[agentId] = '';
    return;
  }
  const onData = new Channel();
  if (!window._agentBuffers) window._agentBuffers = {};
  window._agentBuffers[agentId] = '';
  onData.onmessage = (data) => {
    window._agentBuffers[agentId] += data;
    if (sessions[agentId]?.terminal) sessions[agentId].terminal.write(data);
  };
  try {
    const ptyId = await invoke('spawn_agent', { agentId, cwd: workspace, cols: 120, rows: 40, onData });
    if (!sessions[agentId]) sessions[agentId] = {};
    sessions[agentId].ptyId = ptyId;
    updateAgentStatus(agentId, 'ready');
    await sleep(2000);
    window._agentBuffers[agentId] = '';
  } catch (e) { console.error(`spawn ${agentId}:`, e); }
}

async function captureAgentResponse(agentId, timeoutMs) {
  if (!window._agentBuffers) window._agentBuffers = {};
  window._agentBuffers[agentId] = '';
  return new Promise(resolve => {
    let lastLen = 0, stableCount = 0;
    const iv = setInterval(() => {
      const buf = window._agentBuffers[agentId] || '';
      if (buf.length === lastLen && buf.length > 0) {
        stableCount++;
        if (stableCount >= 3) { clearInterval(iv); resolve(cleanAnsi(buf)); }
      } else { stableCount = 0; lastLen = buf.length; }
    }, 1000);
    setTimeout(() => {
      clearInterval(iv);
      const buf = window._agentBuffers[agentId] || '';
      resolve(buf.length > 0 ? cleanAnsi(buf) : '（无响应）');
    }, timeoutMs);
  });
}

window.confirmExecution = async function() {
  try {
    await invoke('group_confirm_exec', { order: null });
    addSystemMessage('开始执行...');
    updateStatus('执行中');
  } catch (e) { addSystemMessage(`Error: ${e}`); }
};

window.continueDicussion = function() {
  const input = document.getElementById('group-input');
  if (input) input.focus();
};

async function handleCommand(cmd) {
  const [command, ...rest] = cmd.split(' ');
  const arg = rest.join(' ');
  switch (command) {
    case '/invite': if (arg) { await invoke('group_invite', { agentId: arg }); addSystemMessage(`invited ${arg}`); } break;
    case '/kick': if (arg) { await invoke('group_kick', { agentId: arg }); addSystemMessage(`removed ${arg}`); } break;
    case '/agents': const phase = await invoke('group_get_phase'); addSystemMessage(`phase: ${phase}`); break;
    default: addSystemMessage(`unknown: ${command}`);
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

// ═══ Config Panel (renders in preview area) ═══
function renderConfigPanel() {
  chatTitle.textContent = '配置';
  const agentSections = agents.filter(a => a.enabled).map(a => {
    const appType = a.id === 'claude' ? 'claude' : a.id === 'codex' ? 'codex' : a.id;
    return `
      <div class="config-agent">
        <div class="config-agent-header">
          <span style="color:${a.color};font-family:var(--brush);font-size:1.4rem">${a.glyph}</span>
          <span style="font-family:var(--serif-zh);font-weight:600">${a.name}</span>
          <span style="opacity:.4;font-size:.64rem;margin-left:auto;font-family:var(--mono)">${a.config_type}</span>
        </div>
        <div class="config-fields">
          <label>地址</label><input type="text" class="cfg-url" placeholder="https://api.example.com/v1" data-agent="${a.id}">
          <label>密钥</label><input type="password" class="cfg-key" placeholder="sk-..." data-agent="${a.id}">
          <label>模型</label><input type="text" class="cfg-model" placeholder="模型名称" data-agent="${a.id}">
          <button class="cfg-save" onclick="saveAgentConfig('${a.id}', '${appType}')">保存</button>
          <span class="cfg-status" id="cfg-status-${a.id}"></span>
        </div>
      </div>`;
  }).join('');

  // Render config in the preview body (takes over the preview area)
  previewBody.innerHTML = `
    <div class="config-panel">
      <div class="config-header">
        <h2>API 配置</h2>
        <p>每个 Agent 可独立配置，也可共用同一个中转站 Key</p>
      </div>
      <div class="shared-key-section">
        <h3>共用 Key</h3>
        <div class="config-fields" style="margin-top:10px">
          <label>地址</label><input type="text" id="shared-url" placeholder="https://your-relay.com/v1">
          <label>密钥</label><input type="password" id="shared-key" placeholder="sk-...">
          <label>模型</label><input type="text" id="shared-model" placeholder="可选">
          <button class="cfg-save" onclick="applySharedKey()">全部应用</button>
          <span class="cfg-status" id="cfg-status-shared"></span>
        </div>
      </div>
      <div class="template-section">
        <h3>快速模板</h3>
        <div class="template-grid">
          <button class="template-btn" onclick="applyTemplate('openai')">OpenAI 官方</button>
          <button class="template-btn" onclick="applyTemplate('anthropic')">Anthropic 官方</button>
          <button class="template-btn" onclick="applyTemplate('deepseek')">深度求索</button>
          <button class="template-btn" onclick="applyTemplate('oneapi')">one-api 中转</button>
          <button class="template-btn" onclick="applyTemplate('newapi')">new-api 中转</button>
          <button class="template-btn" onclick="applyTemplate('azure')">Azure 云</button>
        </div>
      </div>
      <h3 style="margin-top:28px">各 Agent 配置</h3>
      <div class="config-agents">${agentSections}</div>
    </div>
  `;
  previewTitle.textContent = '配置';
  agents.filter(a => a.enabled).forEach(a => loadAgentConfig(a.id));
}

// ═══ Config helpers ═══
const TEMPLATES = {
  openai: { url: 'https://api.openai.com/v1', model: 'gpt-5.4' },
  anthropic: { url: 'https://api.anthropic.com/v1', model: 'claude-sonnet-4' },
  deepseek: { url: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  oneapi: { url: 'http://localhost:3000/v1', model: '' },
  newapi: { url: 'http://localhost:3000/v1', model: '' },
  azure: { url: 'https://YOUR_RESOURCE.openai.azure.com/openai/v1', model: 'gpt-4o' },
};

window.applyTemplate = function(id) {
  const t = TEMPLATES[id]; if (!t) return;
  const u = document.getElementById('shared-url');
  const m = document.getElementById('shared-model');
  if (u) u.value = t.url;
  if (m) m.value = t.model;
};

window.applySharedKey = async function() {
  const url = document.getElementById('shared-url')?.value || '';
  const key = document.getElementById('shared-key')?.value || '';
  const model = document.getElementById('shared-model')?.value || '';
  const status = document.getElementById('cfg-status-shared');
  if (!url && !key) { if (status) { status.textContent = '请填写'; status.style.color = '#e85a3a'; } return; }
  let saved = 0;
  for (const a of agents.filter(a => a.enabled)) {
    const appType = a.id === 'claude' ? 'claude' : a.id === 'codex' ? 'codex' : a.id;
    const m = model || (a.id === 'claude' ? 'claude-sonnet-4' : a.id === 'codex' ? 'gpt-5.4' : '');
    try {
      await invoke('save_provider', { provider: { id: `${a.id}-shared`, app_type: appType, name: 'Shared', base_url: url, api_key: key, model: m, is_当前: true } });
      saved++;
    } catch (e) { console.error(e); }
  }
  if (status) { status.textContent = `已应用 ${saved} 个`; status.style.color = 'var(--jade)'; setTimeout(() => status.textContent = '', 3000); }
  agents.filter(a => a.enabled).forEach(a => loadAgentConfig(a.id));
};

window.saveAgentConfig = async function(agentId, appType) {
  const url = document.querySelector(`.cfg-url[data-agent="${agentId}"]`)?.value || '';
  const key = document.querySelector(`.cfg-key[data-agent="${agentId}"]`)?.value || '';
  const model = document.querySelector(`.cfg-model[data-agent="${agentId}"]`)?.value || '';
  const status = document.getElementById(`cfg-status-${agentId}`);
  try {
    await invoke('save_provider', { provider: { id: `${agentId}-default`, app_type: appType, name: `${agentId}`, base_url: url, api_key: key, model, is_当前: true } });
    if (status) { status.textContent = '已保存'; status.style.color = 'var(--jade)'; setTimeout(() => status.textContent = '', 2000); }
  } catch (e) { if (status) { status.textContent = e; status.style.color = '#e85a3a'; } }
};

async function loadAgentConfig(agentId) {
  const appType = agentId === 'claude' ? 'claude' : agentId === 'codex' ? 'codex' : agentId;
  try {
    const p = await invoke('get_active_provider', { appType });
    if (p) {
      const u = document.querySelector(`.cfg-url[data-agent="${agentId}"]`);
      const k = document.querySelector(`.cfg-key[data-agent="${agentId}"]`);
      const m = document.querySelector(`.cfg-model[data-agent="${agentId}"]`);
      if (u) u.value = p.base_url || '';
      if (k) k.value = p.api_key || '';
      if (m) m.value = p.model || '';
    }
  } catch (e) { /* no config yet */ }
}

// ═══ Workspace selection ═══
window.selectWorkspace = async function() {
  try {
    const selected = await open({ directory: true, multiple: false, title: '选择工作区目录' });
    if (selected) setWorkspace(selected);
  } catch (e) { console.error('select workspace:', e); }
};

window.setWorkspace = function(path) {
  workspace = path;
  localStorage.setItem('yuai_workspace', path);
  let recent = getRecentWorkspaces();
  recent = [path, ...recent.filter(w => w !== path)].slice(0, 5);
  localStorage.setItem('yuai_recent_workspaces', JSON.stringify(recent));
  updateStatus(shortenPath(path));
  renderWorkspaceColumn();
  renderPreviewColumn();
  renderGroupChat();
};

function getRecentWorkspaces() {
  try { return JSON.parse(localStorage.getItem('yuai_recent_workspaces') || '[]'); }
  catch { return []; }
}

// ═══ Utilities ═══
function shortenPath(p) {
  if (!p) return '';
  const parts = p.replace(/\\/g, '/').split('/');
  if (parts.length <= 3) return p;
  return '.../' + parts.slice(-2).join('/');
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function cleanAnsi(str) {
  return str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '')
    .replace(/\x1b\][^\x07]*\x07/g, '')
    .replace(/\r/g, '')
    .split('\n').filter(l => l.trim().length > 0).join('\n').trim();
}

function updateStatus(text) { if (statusBar) statusBar.textContent = text; }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ═══ Start ═══
init();
