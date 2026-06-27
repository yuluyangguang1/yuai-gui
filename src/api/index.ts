/**
 * API layer — typed wrappers around common Tauri invoke calls.
 * Each function uses invokeSafe for consistent error handling.
 */

import { invokeSafe } from '../utils/errors';

// ── File System ──

/** Read directory tree */
export function readDirTree(path: string) {
  return invokeSafe<Array<{ name: string; path: string; isDir: boolean; children?: unknown[] }>>(
    'read_dir_tree',
    { path },
  );
}

/** Read file content as string */
export function readFileContent(path: string) {
  return invokeSafe<string>('read_file_content', { path });
}

/** Read file bytes as base64 */
export function readFileBytes(path: string) {
  return invokeSafe<string>('read_file_bytes', { path });
}

/** Write file content */
export function writeFileContent(path: string, content: string) {
  return invokeSafe<void>('write_file_content', { path, content });
}

// ── PTY / Agent ──

/** Spawn an agent PTY session */
export function spawnAgent(agentId: string, cwd?: string) {
  return invokeSafe<number>('spawn_agent', { agentId, cwd });
}

/** Write data to a PTY session */
export function ptyWrite(id: number, data: string) {
  return invokeSafe<void>('pty_write', { id, data });
}

/** Resize a PTY session */
export function ptyResize(id: number, cols: number, rows: number) {
  return invokeSafe<void>('pty_resize', { id, cols, rows });
}

/** Kill a PTY session */
export function ptyKill(id: number) {
  return invokeSafe<void>('pty_kill', { id });
}

/** Get PTY current working directory */
export function ptyCwd(id: number) {
  return invokeSafe<string>('pty_cwd', { id });
}

/** List active PTY sessions */
export function ptyList() {
  return invokeSafe<Array<{ id: number; agentId?: string; title?: string }>>('pty_list', undefined, []);
}

// ── Watcher ──

/** Start file system watcher */
export function startWatcher(path: string) {
  return invokeSafe<void>('start_watcher', { path });
}

/** Stop file system watcher */
export function stopWatcher() {
  return invokeSafe<void>('stop_watcher');
}

// ── Context / Compression ──

/** Compress context for a room */
export function compressContext(roomId: string, messages: unknown[]) {
  return invokeSafe<string>('compress_context', { roomId, messages });
}

/** Get context prefix for a room */
export function getContextPrefix(roomId: string) {
  return invokeSafe<string | null>('get_context_prefix', { roomId }, null);
}

/** Store compressed summary */
export function storeCompressedSummary(roomId: string, summary: string, messageCount: number) {
  return invokeSafe<void>('store_compressed_summary', { roomId, summary, messageCount });
}

// ── Group Chat ──

/** Send message to group chat */
export function groupSend(content: string, roomId: string) {
  return invokeSafe<Array<{ agent_id: string; reason: string }> | null>('group_send', { content, roomId });
}

/** Get next speaker in group chat */
export function groupNextSpeaker() {
  return invokeSafe<string | null>('group_next_speaker', undefined, null);
}

/** Build prompt for a specific agent in group chat */
export function groupBuildPrompt(agentId: string) {
  return invokeSafe<string>('group_build_prompt', { agentId });
}

/** Check if group chat has converged */
export function groupCheckConvergence(message: string, roomId: string) {
  return invokeSafe<boolean>('group_check_convergence', { message, roomId });
}

/** Record agent response in group chat */
export function groupAgentResponse(agentId: string, response: string, roomId: string) {
  return invokeSafe<void>('group_agent_response', { agentId, response, roomId });
}

// ── Misc ──

/** Get thumbnail for an image */
export function getThumbnail(path: string, width: number) {
  return invokeSafe<string | null>('get_thumbnail', { path, width }, null);
}

/** Copy file to workspace */
export function copyFileToWorkspace(srcPath: string, destDir: string) {
  return invokeSafe<void>('copy_file_to_workspace', { srcPath, destDir });
}

/** Get disk usage */
export function getDiskUsage(path: string) {
  return invokeSafe<{ total: number; used: number; free: number }>('get_disk_usage', { path });
}

/** Read diff for a file */
export function readFileDiff(path: string) {
  return invokeSafe<string>('read_file_diff', { path }, '');
}

/** Get app version */
export function getAppVersion() {
  return invokeSafe<string>('get_app_version', undefined, 'unknown');
}

/** Check for updates */
export function checkForUpdates() {
  return invokeSafe<{ available: boolean; version?: string }>('check_for_updates', undefined, { available: false });
}
