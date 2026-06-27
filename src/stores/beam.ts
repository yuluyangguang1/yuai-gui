import { defineStore } from 'pinia';
import { ref } from 'vue';
import { invoke, Channel } from '@tauri-apps/api/core';
import { useAgentsStore } from './agents';

interface BeamResult {
  agentId: string;
  response: string;
  duration: number;
  status: 'pending' | 'thinking' | 'done' | 'error';
}

export const useBeamStore = defineStore('beam', () => {
  const agentsStore = useAgentsStore();
  const messages = ref<{ role: string; content: string; timestamp: number }[]>([]);
  const results = ref<BeamResult[]>([]);
  const isRunning = ref(false);
  const showComparison = ref(false);
  
  // Agent PTY sessions (persistent)
  const agentSessions = new Map<string, number>();
  const agentBuffers: Record<string, string> = {};
  
  function cleanAnsi(s: string): string {
    return s.replace(/\x1b\[[0-9;?]*[A-Za-z]|\x1b[()][AB0]|\r/g, '');
  }
  
  async function spawnIfNeeded(agentId: string): Promise<number> {
    if (agentSessions.has(agentId)) return agentSessions.get(agentId)!
    const on_data = new Channel<string>();
    agentBuffers[agentId] = '';
    on_data.onmessage = (data) => { agentBuffers[agentId] += data; };
    const ptyId = await invoke<number>('spawn_agent', { agentId, cwd: null, cols: 120, rows: 40, onData: on_data });
    agentSessions.set(agentId, ptyId);
    await new Promise(r => setTimeout(r, 2000));
    agentBuffers[agentId] = '';
    return ptyId;
  }
  
  async function captureResponse(agentId: string, timeoutMs: number): Promise<string> {
    agentBuffers[agentId] = '';
    return new Promise(resolve => {
      let lastLen = 0, stableCount = 0;
      const iv = setInterval(() => {
        const buf = agentBuffers[agentId] || '';
        if (buf.includes('[process exited]')) {
          clearInterval(iv); resolve(cleanAnsi(buf.replace('[process exited]', '').trim()) || '（进程已退出）');
        }
        if (buf.length === lastLen && buf.length > 0) {
          stableCount++;
          if (stableCount >= 2) { clearInterval(iv); resolve(cleanAnsi(buf)); }
        } else { stableCount = 0; lastLen = buf.length; }
      }, 1000);
      setTimeout(() => { clearInterval(iv); resolve(agentBuffers[agentId] ? cleanAnsi(agentBuffers[agentId]) : '（无响应）'); }, timeoutMs);
    });
  }
  
  async function sendQuestion(question: string) {
    messages.value.push({ role: 'user', content: question, timestamp: Date.now() });
    isRunning.value = true;
    showComparison.value = false;
    
    const agents = agentsStore.agents.filter(a => a.enabled);
    results.value = agents.map(a => ({ agentId: a.id, response: '', duration: 0, status: 'pending' as const }));
    
    const beamPromises = agents.map(async (agent, i) => {
      try {
        results.value[i].status = 'thinking';
        const ptyId = await spawnIfNeeded(agent.id);
        const prompt = `请简要回答以下问题（不超过200字）：\n${question}`;
        agentBuffers[agent.id] = '';
        await invoke('pty_write', { id: ptyId, data: prompt + '\n' });
        const startTime = Date.now();
        const response = await captureResponse(agent.id, 25000);
        results.value[i].response = response;
        results.value[i].duration = Date.now() - startTime;
        results.value[i].status = 'done';
      } catch (e) {
        results.value[i].response = String(e);
        results.value[i].status = 'error';
      }
    });
    
    await Promise.allSettled(beamPromises);
    isRunning.value = false;
    showComparison.value = true;
  }
  
  function pickResponse(agentId: string) {
    const agent = agentsStore.agents.find(a => a.id === agentId);
    messages.value.push({ role: 'system', content: `已选择 ${agent?.name || agentId} 的方案`, timestamp: Date.now() });
    showComparison.value = false;
  }
  
  function clearMessages() {
    messages.value = [];
    results.value = [];
    showComparison.value = false;
  }
  
  return { messages, results, isRunning, showComparison, sendQuestion, pickResponse, clearMessages };
});
