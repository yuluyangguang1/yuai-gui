use serde::{Deserialize, Serialize};

// ═══════════════════════════════════════════
// Git Operations
// ═══════════════════════════════════════════

#[derive(Debug, Serialize, Deserialize)]
pub struct ChangedFile {
    pub path: String,
    pub status: String,
}

/// Get git diff for the workspace (unstaged changes).
#[tauri::command]
pub fn get_git_diff(cwd: String) -> Result<String, String> {
    let output = std::process::Command::new("git")
        .args(["diff", "--no-color"])
        .current_dir(&cwd)
        .output()
        .map_err(|e| format!("git diff failed: {}", e))?;
    if !output.status.success() {
        let output2 = std::process::Command::new("git")
            .args(["diff", "--cached", "--no-color"])
            .current_dir(&cwd)
            .output()
            .map_err(|e| e.to_string())?;
        return Ok(String::from_utf8_lossy(&output2.stdout).to_string());
    }
    let mut result = String::from_utf8_lossy(&output.stdout).to_string();
    if let Ok(staged) = std::process::Command::new("git")
        .args(["diff", "--cached", "--no-color"])
        .current_dir(&cwd)
        .output()
    {
        let s = String::from_utf8_lossy(&staged.stdout);
        if !s.is_empty() {
            result.push_str("\n");
            result.push_str(&s);
        }
    }
    Ok(result)
}

/// Get list of changed files with their status.
#[tauri::command]
pub fn get_changed_files(cwd: String) -> Result<Vec<ChangedFile>, String> {
    let output = std::process::Command::new("git")
        .args(["status", "--porcelain", "-uall"])
        .current_dir(&cwd)
        .output()
        .map_err(|e| format!("git status failed: {}", e))?;
    let text = String::from_utf8_lossy(&output.stdout);
    let files: Vec<ChangedFile> = text.lines()
        .filter(|l| l.len() > 3)
        .map(|l| {
            let status = l[..2].trim().to_string();
            let path = l[3..].to_string();
            let action = match status.as_str() {
                "M" | "MM" => "modified",
                "A" | "AM" => "added",
                "D" => "deleted",
                "??" => "untracked",
                _ => "changed",
            }.to_string();
            ChangedFile { path, status: action }
        })
        .collect();
    Ok(files)
}

/// Revert a specific file (reject changes).
#[tauri::command]
pub fn revert_file(cwd: String, path: String) -> Result<(), String> {
    // Try git checkout first (for tracked files)
    let result = std::process::Command::new("git")
        .args(["checkout", "--", &path])
        .current_dir(&cwd)
        .output()
        .map_err(|e| format!("git checkout failed: {}", e))?;
    if !result.status.success() {
        // For untracked files, just delete
        let full_path = std::path::Path::new(&cwd).join(&path);
        if full_path.exists() {
            std::fs::remove_file(&full_path).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

/// Accept changes: stage a specific file.
#[tauri::command]
pub fn accept_file(cwd: String, path: String) -> Result<(), String> {
    std::process::Command::new("git")
        .args(["add", &path])
        .current_dir(&cwd)
        .output()
        .map_err(|e| format!("git add failed: {}", e))?;
    Ok(())
}
