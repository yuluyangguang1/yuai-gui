use serde::{Deserialize, Serialize};

// ═══════════════════════════════════════════
// Git Worktree Isolation (from Orca)
// ═══════════════════════════════════════════

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WorktreeInfo {
    pub path: String,
    pub branch: String,
    pub head: String,
}

/// Create a new git worktree at the given path with a new branch.
#[tauri::command]
pub fn worktree_create(
    repo_path: String,
    worktree_path: String,
    branch: String,
) -> Result<(), String> {
    // Ensure parent directory exists
    let parent = std::path::Path::new(&worktree_path)
        .parent()
        .ok_or("Invalid worktree path")?;
    if !parent.exists() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create worktrees dir: {}", e))?;
    }

    let output = std::process::Command::new("git")
        .args(["worktree", "add", "-b", &branch, &worktree_path])
        .current_dir(&repo_path)
        .output()
        .map_err(|e| format!("git worktree add failed: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git worktree add failed: {}", stderr));
    }

    Ok(())
}

/// List all git worktrees in the repository.
#[tauri::command]
pub fn worktree_list(repo_path: String) -> Result<Vec<WorktreeInfo>, String> {
    let output = std::process::Command::new("git")
        .args(["worktree", "list", "--porcelain"])
        .current_dir(&repo_path)
        .output()
        .map_err(|e| format!("git worktree list failed: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git worktree list failed: {}", stderr));
    }

    let text = String::from_utf8_lossy(&output.stdout);
    let mut worktrees = Vec::new();
    let mut current_path = String::new();
    let mut current_branch = String::new();
    let mut current_head = String::new();

    for line in text.lines() {
        if line.starts_with("worktree ") {
            // Save previous entry if any
            if !current_path.is_empty() {
                worktrees.push(WorktreeInfo {
                    path: current_path.clone(),
                    branch: current_branch.clone(),
                    head: current_head.clone(),
                });
            }
            current_path = line.strip_prefix("worktree ").unwrap_or("").to_string();
            current_branch.clear();
            current_head.clear();
        } else if line.starts_with("HEAD ") {
            current_head = line.strip_prefix("HEAD ").unwrap_or("").to_string();
        } else if line.starts_with("branch ") {
            current_branch = line
                .strip_prefix("branch refs/heads/")
                .unwrap_or(line.strip_prefix("branch ").unwrap_or(""))
                .to_string();
        }
    }

    // Don't forget the last entry
    if !current_path.is_empty() {
        worktrees.push(WorktreeInfo {
            path: current_path,
            branch: current_branch,
            head: current_head,
        });
    }

    Ok(worktrees)
}

/// Remove a git worktree.
#[tauri::command]
pub fn worktree_remove(repo_path: String, worktree_path: String) -> Result<(), String> {
    let output = std::process::Command::new("git")
        .args(["worktree", "remove", &worktree_path, "--force"])
        .current_dir(&repo_path)
        .output()
        .map_err(|e| format!("git worktree remove failed: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git worktree remove failed: {}", stderr));
    }

    Ok(())
}

/// Get changed files in a specific agent's worktree.
#[tauri::command]
pub fn get_agent_changes(
    cwd: String,
    agent_id: String,
) -> Result<Vec<super::git::ChangedFile>, String> {
    // Look for agent worktree in .worktrees/ directory
    let _worktree_dir = std::path::Path::new(&cwd)
        .join(".worktrees")
        .join(format!("{}-*", agent_id));

    // Try to find the worktree path
    let worktrees = worktree_list(cwd.clone())?;
    let agent_wt = worktrees
        .iter()
        .find(|w| w.path.contains(&agent_id))
        .ok_or_else(|| format!("No worktree found for agent: {}", agent_id))?;

    super::git::get_changed_files(agent_wt.path.clone())
}

/// Get a file diff from an agent's worktree.
#[tauri::command]
pub fn get_agent_file_diff(cwd: String, agent_id: String, path: String) -> Result<String, String> {
    let worktrees = worktree_list(cwd.clone())?;
    let agent_wt = worktrees
        .iter()
        .find(|w| w.path.contains(&agent_id))
        .ok_or_else(|| format!("No worktree found for agent: {}", agent_id))?;

    let output = std::process::Command::new("git")
        .args(["diff", "--no-color", "HEAD", "--", &path])
        .current_dir(&agent_wt.path)
        .output()
        .map_err(|e| format!("git diff failed: {}", e))?;

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

/// Get file content from an agent's worktree.
#[tauri::command]
pub fn get_agent_file_content(
    cwd: String,
    agent_id: String,
    path: String,
) -> Result<String, String> {
    let worktrees = worktree_list(cwd.clone())?;
    let agent_wt = worktrees
        .iter()
        .find(|w| w.path.contains(&agent_id))
        .ok_or_else(|| format!("No worktree found for agent: {}", agent_id))?;

    let full_path = std::path::Path::new(&agent_wt.path).join(&path);
    std::fs::read_to_string(&full_path).map_err(|e| format!("Failed to read file: {}", e))
}
