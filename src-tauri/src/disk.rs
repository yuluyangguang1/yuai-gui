// ═══════════════════════════════════════════
// Disk Usage — du-based workspace analysis
// ═══════════════════════════════════════════

use serde::Serialize;

/// A single item in the disk usage breakdown.
#[derive(Debug, Serialize, Clone)]
pub struct DiskItem {
    pub name: String,
    pub path: String,
    pub size_kb: u64,
}

/// Result of a disk usage query.
#[derive(Debug, Serialize, Clone)]
pub struct DiskUsageResult {
    pub total_kb: u64,
    pub items: Vec<DiskItem>,
}

/// Get total disk usage for a path (in KB).
#[tauri::command]
pub fn get_disk_usage(path: String) -> Result<DiskUsageResult, String> {
    let dir = std::path::Path::new(&path);
    if !dir.exists() {
        return Err(format!("path does not exist: {}", path));
    }

    // Run `du -sk` for total
    let total_kb = run_du_sk(dir)?;

    // Get top-level children with sizes
    let mut items: Vec<DiskItem> = Vec::new();
    if let Ok(read) = std::fs::read_dir(dir) {
        for entry in read.flatten() {
            let child_path = entry.path();
            let name = child_path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();

            // Skip hidden
            if name.starts_with('.') {
                continue;
            }

            if let Ok(size) = run_du_sk(&child_path) {
                if size > 0 {
                    items.push(DiskItem {
                        name,
                        path: child_path.to_string_lossy().to_string(),
                        size_kb: size,
                    });
                }
            }
        }
    }

    // Sort by size descending, keep top 20
    items.sort_by(|a, b| b.size_kb.cmp(&a.size_kb));
    items.truncate(20);

    Ok(DiskUsageResult {
        total_kb,
        items,
    })
}

/// Recursively compute directory size in KB using pure Rust (cross-platform).
fn run_du_sk(path: &std::path::Path) -> Result<u64, String> {
    let bytes = dir_size_recursive(path).map_err(|e| format!("size calc failed: {}", e))?;
    // Convert bytes to KB (ceiling division to match `du -sk` behavior)
    Ok((bytes + 1023) / 1024)
}

/// Recursively sum the size of all files under a path.
fn dir_size_recursive(path: &std::path::Path) -> std::io::Result<u64> {
    let meta = std::fs::symlink_metadata(path)?;
    if meta.is_file() {
        return Ok(meta.len());
    }
    if meta.is_symlink() {
        // Skip symlinks to avoid cycles
        return Ok(0);
    }
    if !meta.is_dir() {
        return Ok(0);
    }
    let mut total: u64 = 0;
    let entries = match std::fs::read_dir(path) {
        Ok(e) => e,
        Err(_) => return Ok(0),
    };
    for entry in entries.flatten() {
        total += dir_size_recursive(&entry.path())?;
    }
    Ok(total)
}
