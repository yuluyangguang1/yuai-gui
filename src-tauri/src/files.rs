use serde::Serialize;

// ═══════════════════════════════════════════
// File Tree
// ═══════════════════════════════════════════

#[derive(Debug, Serialize)]
pub struct FileNode {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub children: Option<Vec<FileNode>>,
}

/// Read the file tree of a directory, up to 2 levels deep, with sensible filtering.
#[tauri::command]
pub fn read_dir_tree(path: String, max_depth: Option<u32>) -> Result<Vec<FileNode>, String> {
    let root = std::path::Path::new(&path);
    if !root.exists() {
        return Err(format!("path does not exist: {}", path));
    }
    let depth = max_depth.unwrap_or(2);
    read_dir_recursive(root, depth)
}

/// Read a text file's content.
#[tauri::command]
pub fn read_file_content(path: String) -> Result<String, String> {
    let p = std::path::Path::new(&path);
    if !p.exists() {
        return Err(format!("file not found: {}", path));
    }
    // Limit to 500KB to avoid loading huge binaries
    let meta = std::fs::metadata(p).map_err(|e| e.to_string())?;
    if meta.len() > 512_000 {
        return Err("file too large (>500KB)".into());
    }
    std::fs::read_to_string(p).map_err(|e| format!("read error: {}", e))
}

// ═══════════════════════════════════════════
// Directory Listing & Arbitrary File Read
// ═══════════════════════════════════════════

#[derive(Debug, Serialize)]
pub struct DirEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: Option<u64>,
    pub mtime: Option<u64>,
}

/// List entries in a directory (flat, no recursion).
#[tauri::command]
pub fn list_dir(path: String) -> Result<Vec<DirEntry>, String> {
    let dir = std::path::Path::new(&path);
    if !dir.exists() || !dir.is_dir() {
        return Ok(vec![]);
    }
    let mut entries = Vec::new();
    for entry in std::fs::read_dir(dir).map_err(|e| e.to_string())?.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        let p = entry.path().to_string_lossy().to_string();
        let is_dir = entry.path().is_dir();
        let size = entry.metadata().ok().map(|m| m.len());
        let mtime = entry
            .metadata()
            .ok()
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs());
        entries.push(DirEntry {
            name,
            path: p,
            is_dir,
            size,
            mtime,
        });
    }
    entries.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    Ok(entries)
}

/// Read an arbitrary text file (no size limit for JSONL logs).
#[tauri::command]
pub fn read_text_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("read error: {}: {}", path, e))
}

/// Get the user's home directory.
#[tauri::command]
pub fn get_home_dir() -> Result<String, String> {
    dirs::home_dir()
        .map(|p| p.to_string_lossy().to_string())
        .ok_or_else(|| "could not determine home directory".into())
}

/// Copy a file into the workspace directory.

/// Result of a write_file_content operation.
#[derive(Debug, Serialize)]
pub struct WriteFileResult {
    pub conflict: bool,
    pub mtime: u64,
}

/// Write file content atomically (temp + rename) with mtime conflict check.
#[tauri::command]
pub fn write_file_content(
    path: String,
    content: String,
    expected_mtime: u64,
) -> Result<WriteFileResult, String> {
    let p = std::path::Path::new(&path);

    // Read current mtime if file exists
    if p.exists() && expected_mtime > 0 {
        let meta = std::fs::metadata(p).map_err(|e| e.to_string())?;
        let current_mtime = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_secs())
            .unwrap_or(0);

        if current_mtime != expected_mtime {
            return Ok(WriteFileResult {
                conflict: true,
                mtime: current_mtime,
            });
        }
    }

    // Atomic write: write to temp file, then rename
    let parent = p.parent().ok_or("no parent directory")?;
    let tmp_path = parent.join(format!(
        ".yuai_tmp_{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos()
    ));
    std::fs::write(&tmp_path, &content).map_err(|e| format!("write error: {}", e))?;
    std::fs::rename(&tmp_path, p).map_err(|e| {
        // Clean up temp file on rename failure
        let _ = std::fs::remove_file(&tmp_path);
        format!("rename error: {}", e)
    })?;

    // Read back the new mtime
    let new_meta = std::fs::metadata(p).map_err(|e| e.to_string())?;
    let new_mtime = new_meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0);

    Ok(WriteFileResult {
        conflict: false,
        mtime: new_mtime,
    })
}
#[tauri::command]
pub fn copy_file_to_workspace(src_path: String, dest_dir: String) -> Result<String, String> {
    let src = std::path::Path::new(&src_path);
    if !src.exists() {
        return Err(format!("source file not found: {}", src_path));
    }
    let file_name = src
        .file_name()
        .ok_or_else(|| "could not get file name".to_string())?;
    let dest = std::path::Path::new(&dest_dir).join(file_name);
    std::fs::copy(src, &dest).map_err(|e| format!("copy failed: {}", e))?;
    Ok(dest.to_string_lossy().to_string())
}

// ═══════════════════════════════════════════
// Recursive Helper
// ═══════════════════════════════════════════

pub fn read_dir_recursive(dir: &std::path::Path, depth: u32) -> Result<Vec<FileNode>, String> {
    if depth == 0 {
        return Ok(vec![]);
    }

    let mut entries: Vec<FileNode> = Vec::new();
    let read = std::fs::read_dir(dir).map_err(|e| format!("read_dir: {}", e))?;

    for entry in read.flatten() {
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_string();

        // Skip hidden files and common heavy directories
        if name.starts_with('.') {
            continue;
        }
        if matches!(
            name.as_str(),
            "node_modules" | "target" | "dist" | "build" | "__pycache__" | ".next" | ".cache"
        ) {
            continue;
        }

        let is_dir = path.is_dir();
        let path_str = path.to_string_lossy().to_string();

        let children = if is_dir && depth > 1 {
            // Lazily expand: only top level loads children
            read_dir_recursive(&path, depth - 1).ok()
        } else {
            None
        };

        entries.push(FileNode {
            name,
            path: path_str,
            is_dir,
            children,
        });
    }

    // Sort: dirs first, then alphabetical
    entries.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });

    Ok(entries)
}
