import { invoke } from "@tauri-apps/api/core";

export interface ResolvedPath {
  path: string;
  line?: number;
  col?: number;
}

/**
 * Extract file paths from terminal output text.
 * Handles: absolute paths, relative paths, paths with spaces, Chinese filenames,
 * and wrapped long paths.
 */
export function extractPaths(text: string): ResolvedPath[] {
  const results: ResolvedPath[] = [];
  const seen = new Set<string>();

  // Absolute paths: /foo/bar/baz.ts (Unix) or C:\foo\bar\baz.ts (Windows)
  const absolutePattern = /(\/[^\s:*?"<>|]+(?:[\u4e00-\u9fff][^\s:*?"<>|]*)*)|([A-Z]:\\[^\s:*?"<>|]+(?:[\u4e00-\u9fff][^\s:*?"<>|]*)*)/gi;
  let match: RegExpExecArray | null;

  while ((match = absolutePattern.exec(text)) !== null) {
    const raw = match[1];
    // Strip trailing line:col references like :12 or :12:5
    const lineColMatch = raw.match(/^(.+?):(\d+)(?::(\d+))?$/);
    let filePath = raw;
    let line: number | undefined;
    let col: number | undefined;

    if (lineColMatch) {
      filePath = lineColMatch[1];
      line = parseInt(lineColMatch[2]);
      if (lineColMatch[3]) col = parseInt(lineColMatch[3]);
    }

    // Skip common false positives
    if (isLikelyPath(filePath) && !seen.has(filePath)) {
      seen.add(filePath);
      results.push({ path: filePath, line, col });
    }
  }

  // Relative paths with common extensions (./foo.ts, ../bar.js, src/main.rs)
  const relativePattern = /(?:\.?\.?\/)?(?:[\w\u4e00-\u9fff][\w\u4e00-\u9fff\-]*\/)+[\w\u4e00-\u9fff][\w\u4e00-\u9fff\-]*\.[a-zA-Z]{1,10}/g;
  while ((match = relativePattern.exec(text)) !== null) {
    const raw = match[0];
    const lineColMatch = raw.match(/^(.+?):(\d+)(?::(\d+))?$/);
    let filePath = raw;
    let line: number | undefined;
    let col: number | undefined;

    if (lineColMatch) {
      filePath = lineColMatch[1];
      line = parseInt(lineColMatch[2]);
      if (lineColMatch[3]) col = parseInt(lineColMatch[3]);
    }

    if (!seen.has(filePath)) {
      seen.add(filePath);
      results.push({ path: filePath, line, col });
    }
  }

  return results;
}

function isLikelyPath(p: string): boolean {
  // Must have a file extension or be a directory-like path
  const hasExtension = /\.\w{1,10}$/.test(p);
  // Split on both / and \ for cross-platform support
  const segments = p.split(/[\/\\]/).filter(Boolean);
  // At least 2 segments and has extension, or starts with common dirs
  return hasExtension && segments.length >= 2;
}

/**
 * Verify a path exists via the backend.
 */
export async function verifyPath(path: string): Promise<boolean> {
  try {
    await invoke("read_file_content", { path });
    return true;
  } catch {
    return false;
  }
}

/**
 * Scan terminal text for file paths and return clickable entries.
 */
export async function resolvePaths(text: string): Promise<ResolvedPath[]> {
  const candidates = extractPaths(text);
  const verified: ResolvedPath[] = [];

  for (const candidate of candidates) {
    if (await verifyPath(candidate.path)) {
      verified.push(candidate);
    }
  }

  return verified;
}
