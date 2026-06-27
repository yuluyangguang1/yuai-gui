import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @tauri-apps/api/core before importing the module
vi.mock('@tauri-apps/api/core', () => ({
  invoke: vi.fn(),
}));

// Import after mock setup
import { invoke } from '@tauri-apps/api/core';
import {
  readDirTree,
  readFileContent,
  readFileBytes,
  writeFileContent,
  spawnAgent,
  ptyWrite,
  ptyResize,
  ptyKill,
  ptyCwd,
  ptyList,
  startWatcher,
  stopWatcher,
  compressContext,
  getContextPrefix,
  storeCompressedSummary,
  groupSend,
  groupNextSpeaker,
  groupBuildPrompt,
  groupCheckConvergence,
  groupAgentResponse,
  getThumbnail,
  copyFileToWorkspace,
  getDiskUsage,
  readFileDiff,
  getAppVersion,
  checkForUpdates,
} from '../index';

const mockInvoke = vi.mocked(invoke);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('File System API', () => {
  it('readDirTree invokes correct command', async () => {
    const mockTree = [{ name: 'src', path: '/project/src', isDir: true }];
    mockInvoke.mockResolvedValue(mockTree as any);
    const result = await readDirTree('/project');
    expect(mockInvoke).toHaveBeenCalledWith('read_dir_tree', { path: '/project' });
    expect(result).toEqual(mockTree);
  });

  it('readFileContent invokes correct command', async () => {
    mockInvoke.mockResolvedValue('file content' as any);
    const result = await readFileContent('/project/file.txt');
    expect(mockInvoke).toHaveBeenCalledWith('read_file_content', { path: '/project/file.txt' });
    expect(result).toBe('file content');
  });

  it('readFileBytes invokes correct command', async () => {
    mockInvoke.mockResolvedValue('base64data' as any);
    const result = await readFileBytes('/project/image.png');
    expect(mockInvoke).toHaveBeenCalledWith('read_file_bytes', { path: '/project/image.png' });
    expect(result).toBe('base64data');
  });

  it('writeFileContent invokes correct command', async () => {
    mockInvoke.mockResolvedValue(undefined as any);
    await writeFileContent('/project/file.txt', 'new content');
    expect(mockInvoke).toHaveBeenCalledWith('write_file_content', {
      path: '/project/file.txt',
      content: 'new content',
    });
  });
});

describe('PTY / Agent API', () => {
  it('spawnAgent invokes correct command', async () => {
    mockInvoke.mockResolvedValue(42 as any);
    const result = await spawnAgent('claude', '/project');
    expect(mockInvoke).toHaveBeenCalledWith('spawn_agent', { agentId: 'claude', cwd: '/project' });
    expect(result).toBe(42);
  });

  it('ptyWrite invokes correct command', async () => {
    mockInvoke.mockResolvedValue(undefined as any);
    await ptyWrite(42, 'ls -la\n');
    expect(mockInvoke).toHaveBeenCalledWith('pty_write', { id: 42, data: 'ls -la\n' });
  });

  it('ptyResize invokes correct command', async () => {
    mockInvoke.mockResolvedValue(undefined as any);
    await ptyResize(42, 120, 40);
    expect(mockInvoke).toHaveBeenCalledWith('pty_resize', { id: 42, cols: 120, rows: 40 });
  });

  it('ptyKill invokes correct command', async () => {
    mockInvoke.mockResolvedValue(undefined as any);
    await ptyKill(42);
    expect(mockInvoke).toHaveBeenCalledWith('pty_kill', { id: 42 });
  });

  it('ptyCwd invokes correct command', async () => {
    mockInvoke.mockResolvedValue('/home/user' as any);
    const result = await ptyCwd(42);
    expect(mockInvoke).toHaveBeenCalledWith('pty_cwd', { id: 42 });
    expect(result).toBe('/home/user');
  });

  it('ptyList invokes correct command with fallback', async () => {
    mockInvoke.mockResolvedValue([{ id: 1, agentId: 'claude' }] as any);
    const result = await ptyList();
    expect(mockInvoke).toHaveBeenCalledWith('pty_list', undefined);
    expect(result).toEqual([{ id: 1, agentId: 'claude' }]);
  });

  it('ptyList returns empty array as fallback on error', async () => {
    mockInvoke.mockRejectedValue(new Error('no PTY'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await ptyList();
    expect(result).toEqual([]);
    consoleSpy.mockRestore();
  });
});

describe('Watcher API', () => {
  it('startWatcher invokes correct command', async () => {
    mockInvoke.mockResolvedValue(undefined as any);
    await startWatcher('/project');
    expect(mockInvoke).toHaveBeenCalledWith('start_watcher', { path: '/project' });
  });

  it('stopWatcher invokes correct command', async () => {
    mockInvoke.mockResolvedValue(undefined as any);
    await stopWatcher();
    expect(mockInvoke).toHaveBeenCalledWith('stop_watcher', undefined);
  });
});

describe('Context API', () => {
  it('compressContext invokes correct command', async () => {
    mockInvoke.mockResolvedValue('compressed summary' as any);
    const result = await compressContext('room1', [{ role: 'user', content: 'hi' }]);
    expect(mockInvoke).toHaveBeenCalledWith('compress_context', {
      roomId: 'room1',
      messages: [{ role: 'user', content: 'hi' }],
    });
    expect(result).toBe('compressed summary');
  });

  it('getContextPrefix invokes correct command', async () => {
    mockInvoke.mockResolvedValue('prefix text' as any);
    const result = await getContextPrefix('room1');
    expect(result).toBe('prefix text');
  });

  it('getContextPrefix returns null as fallback on error', async () => {
    mockInvoke.mockRejectedValue(new Error('not found'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await getContextPrefix('room1');
    expect(result).toBeNull();
    consoleSpy.mockRestore();
  });

  it('storeCompressedSummary invokes correct command', async () => {
    mockInvoke.mockResolvedValue(undefined as any);
    await storeCompressedSummary('room1', 'summary', 10);
    expect(mockInvoke).toHaveBeenCalledWith('store_compressed_summary', {
      roomId: 'room1',
      summary: 'summary',
      messageCount: 10,
    });
  });
});

describe('Group Chat API', () => {
  it('groupSend invokes correct command', async () => {
    mockInvoke.mockResolvedValue([{ agent_id: 'claude', reason: 'has context' }] as any);
    const result = await groupSend('hello', 'room1');
    expect(mockInvoke).toHaveBeenCalledWith('group_send', { content: 'hello', roomId: 'room1' });
    expect(result).toEqual([{ agent_id: 'claude', reason: 'has context' }]);
  });

  it('groupNextSpeaker invokes correct command', async () => {
    mockInvoke.mockResolvedValue('claude' as any);
    const result = await groupNextSpeaker();
    expect(result).toBe('claude');
  });

  it('groupBuildPrompt invokes correct command', async () => {
    mockInvoke.mockResolvedValue('prompt text' as any);
    const result = await groupBuildPrompt('claude');
    expect(mockInvoke).toHaveBeenCalledWith('group_build_prompt', { agentId: 'claude' });
    expect(result).toBe('prompt text');
  });

  it('groupCheckConvergence invokes correct command', async () => {
    mockInvoke.mockResolvedValue(true as any);
    const result = await groupCheckConvergence('I agree', 'room1');
    expect(result).toBe(true);
  });

  it('groupAgentResponse invokes correct command', async () => {
    mockInvoke.mockResolvedValue(undefined as any);
    await groupAgentResponse('claude', 'my response', 'room1');
    expect(mockInvoke).toHaveBeenCalledWith('group_agent_response', {
      agentId: 'claude',
      response: 'my response',
      roomId: 'room1',
    });
  });
});

describe('Misc API', () => {
  it('getThumbnail invokes correct command', async () => {
    mockInvoke.mockResolvedValue('data:image/png;base64,abc' as any);
    const result = await getThumbnail('/img.png', 64);
    expect(mockInvoke).toHaveBeenCalledWith('get_thumbnail', { path: '/img.png', width: 64 });
    expect(result).toBe('data:image/png;base64,abc');
  });

  it('getThumbnail returns null fallback on error', async () => {
    mockInvoke.mockRejectedValue(new Error('not found'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await getThumbnail('/missing.png', 32);
    expect(result).toBeNull();
    consoleSpy.mockRestore();
  });

  it('copyFileToWorkspace invokes correct command', async () => {
    mockInvoke.mockResolvedValue(undefined as any);
    await copyFileToWorkspace('/src/file.txt', '/dest/');
    expect(mockInvoke).toHaveBeenCalledWith('copy_file_to_workspace', {
      srcPath: '/src/file.txt',
      destDir: '/dest/',
    });
  });

  it('getDiskUsage invokes correct command', async () => {
    mockInvoke.mockResolvedValue({ total: 100, used: 60, free: 40 } as any);
    const result = await getDiskUsage('/');
    expect(result).toEqual({ total: 100, used: 60, free: 40 });
  });

  it('readFileDiff invokes correct command', async () => {
    mockInvoke.mockResolvedValue('--- a/file\n+++ b/file' as any);
    const result = await readFileDiff('/file.txt');
    expect(result).toContain('---');
  });

  it('readFileDiff returns empty string fallback on error', async () => {
    mockInvoke.mockRejectedValue(new Error('no git'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await readFileDiff('/file.txt');
    expect(result).toBe('');
    consoleSpy.mockRestore();
  });

  it('getAppVersion invokes correct command', async () => {
    mockInvoke.mockResolvedValue('1.0.0' as any);
    const result = await getAppVersion();
    expect(result).toBe('1.0.0');
  });

  it('getAppVersion returns unknown fallback on error', async () => {
    mockInvoke.mockRejectedValue(new Error('no version'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await getAppVersion();
    expect(result).toBe('unknown');
    consoleSpy.mockRestore();
  });

  it('checkForUpdates invokes correct command', async () => {
    mockInvoke.mockResolvedValue({ available: true, version: '2.0.0' } as any);
    const result = await checkForUpdates();
    expect(result).toEqual({ available: true, version: '2.0.0' });
  });

  it('checkForUpdates returns default fallback on error', async () => {
    mockInvoke.mockRejectedValue(new Error('network error'));
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await checkForUpdates();
    expect(result).toEqual({ available: false });
    consoleSpy.mockRestore();
  });
});
