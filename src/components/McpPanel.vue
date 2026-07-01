<template>
  <div class="mcp-panel">
    <div class="mcp-header">
      <span class="mcp-title">桥 MCP 服务</span>
      <button class="mcp-refresh" :disabled="store.loading" @click="store.loadServers()">
        <TIcon name="refresh" :size="14" :class="{ 'spin': store.loading }" />
      </button>
    </div>

    <!-- Summary -->
    <div class="mcp-summary">
      <span class="mcp-stat">
        <span class="mcp-dot mcp-dot-connected"></span>
        {{ store.summary.connected }} 已连接
      </span>
      <span class="mcp-stat">
        <span class="mcp-dot mcp-dot-disconnected"></span>
        {{ store.summary.disconnected }} 未连接
      </span>
      <span class="mcp-stat">具 {{ store.summary.totalTools }} 工具</span>
    </div>

    <!-- Error -->
    <div v-if="store.error" class="mcp-error">{{ store.error }}</div>

    <!-- Server list -->
    <div v-if="store.loading && !store.servers.length" class="mcp-empty">加载中…</div>
    <div v-else-if="!store.servers.length" class="mcp-empty">暂无 MCP 服务器</div>

    <div v-else class="mcp-list">
      <div v-for="srv in store.filteredServers" :key="srv.name" class="mcp-card">
        <div class="mcp-card-header" @click="toggleExpand(srv.name)">
          <span class="mcp-status-dot" :class="store.statusClass(srv)"></span>
          <span class="mcp-srv-name">{{ srv.name }}</span>
          <span class="mcp-srv-transport">{{ srv.transport }}</span>
          <span class="mcp-srv-tools">{{ srv.tools_registered }} 工具</span>
          <span class="mcp-expand-arrow"><TIcon :name="expanded[srv.name] ? 'chevronDown' : 'chevronRight'" :size="14" /></span>
        </div>
        <div class="mcp-srv-status-label" :class="'mcp-status-' + store.statusClass(srv)">
          {{ store.statusLabel(srv) }}
        </div>
        <div v-if="srv.error" class="mcp-srv-error">{{ srv.error }}</div>

        <!-- Expanded: tool list + actions -->
        <div v-if="expanded[srv.name]" class="mcp-expanded">
          <div v-if="srv.tool_details && srv.tool_details.length" class="mcp-tools">
            <div v-for="tool in srv.tool_details" :key="tool.name" class="mcp-tool">
              <span class="mcp-tool-name">{{ tool.name }}</span>
              <span v-if="tool.description" class="mcp-tool-desc">{{ tool.description }}</span>
            </div>
          </div>
          <div v-else class="mcp-no-tools">无工具信息</div>
          <div class="mcp-card-actions">
            <button class="mcp-btn" @click.stop="testSrv(srv.name)" :disabled="testing === srv.name">
              {{ testing === srv.name ? '测试中…' : '桥 测试' }}
            </button>
            <button class="mcp-btn mcp-btn-remove" @click.stop="removeSrv(srv.name)"><TIcon name="close" :size="14" /> 移除</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Add server -->
    <div class="mcp-add-section">
      <div v-if="showAdd" class="mcp-add-form">
        <input v-model="addName" class="mcp-input" placeholder="服务器名称" />
        <input v-model="addCommand" class="mcp-input" placeholder="命令路径" />
        <input v-model="addArgs" class="mcp-input" placeholder="参数（空格分隔）" />
        <button class="mcp-add-btn" :disabled="!addName.trim() || !addCommand.trim()" @click="addServer">添加</button>
      </div>
      <button class="mcp-add-toggle" @click="showAdd = !showAdd">
        {{ showAdd ? '取消' : '+ 添加服务器' }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted } from 'vue';
import { TIcon } from "../utils/icons";
import { useMcpStore } from '../stores/mcp';

const store = useMcpStore();
const expanded = reactive<Record<string, boolean>>({});
const testing = ref('');
const showAdd = ref(false);
const addName = ref('');
const addCommand = ref('');
const addArgs = ref('');

onMounted(() => store.loadServers());

function toggleExpand(name: string) {
  expanded[name] = !expanded[name];
}

async function testSrv(name: string) {
  testing.value = name;
  try {
    await store.testServer(name);
    await store.loadServers();
  } finally {
    testing.value = '';
  }
}

async function removeSrv(name: string) {
  if (!confirm(`确认移除 MCP 服务器「${name}」？`)) return;
  await store.removeServer(name);
}

async function addServer() {
  const name = addName.value.trim();
  const command = addCommand.value.trim();
  if (!name || !command) return;
  const args = addArgs.value.trim() ? addArgs.value.trim().split(/\s+/) : [];
  try {
    await store.addServer(name, { command, args });
    addName.value = '';
    addCommand.value = '';
    addArgs.value = '';
    showAdd.value = false;
  } catch (e: any) {
    alert(e.message || '添加失败');
  }
}
</script>

<style scoped>
.mcp-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-y: auto;
  padding: 12px;
  gap: 10px;
}

.mcp-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.mcp-title {
  font-family: var(--font-brush);
  font-size: 1.2rem;
  color: var(--gold);
}

.mcp-refresh {
  background: none;
  border: 1px solid var(--border);
  color: var(--text-secondary);
  border-radius: var(--radius-sm);
  padding: 2px 8px;
  cursor: pointer;
  font-size: 0.85rem;
}
.mcp-refresh:hover { border-color: var(--accent); color: var(--accent); }

.mcp-summary {
  display: flex;
  gap: 14px;
  font-size: 0.72rem;
  color: var(--text-secondary);
}

.mcp-stat {
  display: flex;
  align-items: center;
  gap: 4px;
}

.mcp-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}
.mcp-dot-connected { background: var(--accent); }
.mcp-dot-disconnected { background: var(--error); }

.mcp-error {
  color: var(--error);
  font-size: 0.72rem;
  background: rgba(239, 68, 68, 0.1);
  padding: 6px 10px;
  border-radius: var(--radius-sm);
}

.mcp-empty {
  color: var(--text-muted);
  font-size: 0.78rem;
  text-align: center;
  padding: 30px 0;
}

.mcp-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.mcp-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
  padding: 8px 10px;
  transition: border-color var(--transition-fast);
}
.mcp-card:hover { border-color: var(--border); }

.mcp-card-header {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
}

.mcp-status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}
.mcp-status-dot.connected { background: var(--accent); }
.mcp-status-dot.disconnected { background: var(--error); }
.mcp-status-dot.disabled { background: var(--text-muted); }

.mcp-srv-name {
  font-size: 0.82rem;
  color: var(--text-primary);
  font-weight: 500;
}

.mcp-srv-transport {
  font-size: 0.65rem;
  color: var(--text-muted);
  background: var(--bg-surface);
  padding: 1px 5px;
  border-radius: var(--radius-sm);
}

.mcp-srv-tools {
  font-size: 0.68rem;
  color: var(--accent);
  margin-left: auto;
}

.mcp-expand-arrow {
  font-size: 0.7rem;
  color: var(--text-muted);
}

.mcp-srv-status-label {
  font-size: 0.65rem;
  margin-top: 2px;
  padding-left: 15px;
}
.mcp-status-connected { color: var(--accent); }
.mcp-status-disconnected { color: var(--error); }
.mcp-status-disabled { color: var(--text-muted); }

.mcp-srv-error {
  font-size: 0.65rem;
  color: var(--error);
  padding-left: 15px;
  margin-top: 2px;
}

.mcp-expanded {
  margin-top: 8px;
  border-top: 1px solid var(--border-light);
  padding-top: 8px;
}

.mcp-tools {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 200px;
  overflow-y: auto;
  margin-bottom: 8px;
}

.mcp-tool {
  display: flex;
  flex-direction: column;
  background: var(--bg-primary);
  border-radius: var(--radius-sm);
  padding: 4px 8px;
}

.mcp-tool-name {
  font-family: var(--font-mono);
  font-size: 0.72rem;
  color: var(--accent);
}

.mcp-tool-desc {
  font-size: 0.65rem;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mcp-no-tools {
  font-size: 0.7rem;
  color: var(--text-muted);
  margin-bottom: 8px;
}

.mcp-card-actions {
  display: flex;
  gap: 6px;
}

.mcp-btn {
  flex: 1;
  padding: 4px 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-surface);
  color: var(--text-primary);
  font-size: 0.72rem;
  cursor: pointer;
  transition: all var(--transition-fast);
}
.mcp-btn:hover { border-color: var(--accent); }
.mcp-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.mcp-btn-remove { color: var(--error); border-color: rgba(239, 68, 68, 0.3); }
.mcp-btn-remove:hover { background: rgba(239, 68, 68, 0.1); border-color: rgba(239, 68, 68, 0.5); }

.mcp-add-section {
  margin-top: auto;
  flex-shrink: 0;
}

.mcp-add-form {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 6px;
}

.mcp-input {
  background: var(--bg-primary);
  border: 1px solid var(--border);
  color: var(--text-primary);
  border-radius: var(--radius-sm);
  padding: 5px 8px;
  font-size: 0.75rem;
  font-family: var(--font-body);
  outline: none;
}
.mcp-input:focus { border-color: var(--accent); }

.mcp-add-btn {
  background: var(--accent);
  color: var(--text-inverse);
  border: none;
  border-radius: var(--radius-sm);
  padding: 6px;
  font-size: 0.75rem;
  cursor: pointer;
  font-weight: 500;
}
.mcp-add-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.mcp-add-toggle {
  width: 100%;
  background: none;
  border: 1px dashed var(--border);
  color: var(--text-muted);
  border-radius: var(--radius-sm);
  padding: 6px;
  font-size: 0.72rem;
  cursor: pointer;
  transition: all var(--transition-fast);
}
.mcp-add-toggle:hover { border-color: var(--accent); color: var(--accent); }
</style>
