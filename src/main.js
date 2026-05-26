import { invoke } from '@tauri-apps/api/core';

const grid = document.getElementById('tool-grid');
const toast = document.getElementById('toast');

let toastTimer = null;
function showToast(msg, isErr = false) {
  toast.textContent = msg;
  toast.classList.remove('hidden', 'err');
  if (isErr) toast.classList.add('err');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add('hidden'), 2800);
}

function statusLabel(t) {
  if (!t.binary_present) return { text: '未安装', cls: 'err' };
  if (!t.configured) return { text: '待配置', cls: 'warn' };
  return { text: '就绪', cls: 'ok' };
}

function renderCard(t) {
  const card = document.createElement('article');
  card.className = 'tool-card' + (t.binary_present ? '' : ' unavailable');

  const status = statusLabel(t);

  card.innerHTML = `
    <div class="tool-head">
      <div class="tool-glyph">${t.glyph}</div>
      <span class="tool-status ${status.cls}">${status.text}</span>
    </div>
    <div class="tool-name">${t.display_name}</div>
    <div class="tool-motto">${t.motto}</div>
    <div class="tool-actions">
      <button class="btn ${t.configured ? 'btn-primary' : 'btn-warn'}" data-action="launch">
        ${t.configured ? '启动' : '配置 → 启动'}
      </button>
    </div>
  `;

  card.querySelector('[data-action="launch"]').addEventListener('click', async () => {
    if (!t.binary_present) {
      showToast(`${t.display_name} 二进制未找到`, true);
      return;
    }
    if (!t.configured) {
      showToast('请先在 CC Switch 中配置该工具');
      try { await invoke('launch_cc_switch'); } catch (e) { showToast(String(e), true); }
      return;
    }
    try {
      const msg = await invoke('launch_tool', { toolId: t.id });
      showToast(`已启动: ${t.display_name}`);
      console.log(msg);
    } catch (e) {
      showToast(`启动失败: ${e}`, true);
    }
  });

  return card;
}

async function refresh() {
  try {
    const tools = await invoke('list_tools');
    grid.innerHTML = '';
    tools.forEach(t => grid.appendChild(renderCard(t)));
  } catch (e) {
    grid.innerHTML = `<div class="loading">加载失败：${e}</div>`;
  }
}

document.getElementById('open-cc-switch').addEventListener('click', async () => {
  try {
    await invoke('launch_cc_switch');
    showToast('CC Switch 已打开，配置完成后回到这里点击工具卡片刷新状态');
    setTimeout(refresh, 1500);
  } catch (e) {
    showToast(`无法启动 CC Switch: ${e}`, true);
  }
});

document.getElementById('open-data-dir').addEventListener('click', async () => {
  try {
    await invoke('open_data_dir');
  } catch (e) {
    showToast(String(e), true);
  }
});

// Refresh on focus (returning from CC Switch)
window.addEventListener('focus', refresh);

refresh();
