use std::path::PathBuf;
use tauri::Manager;

use crate::AgentDef;

/// Resolve the bundle root directory.
pub fn bundle_root(app: &tauri::AppHandle) -> PathBuf {
    // In dev mode, check project root (where bundle/ actually is)
    #[cfg(debug_assertions)]
    {
        if let Ok(exe) = std::env::current_exe() {
            if let Some(p) = exe.parent() {
                let project_root = p.ancestors().find(|a| a.join("Cargo.toml").exists());
                if let Some(pr) = project_root {
                    if pr.join("bundle").exists() {
                        return pr.to_path_buf();
                    }
                }
            }
        }
    }

    // In production: check resource directory first (Tauri bundles resources here)
    if let Ok(resource_dir) = app.path().resource_dir() {
        if resource_dir.join("bundle").exists() {
            return resource_dir;
        }
        // Tauri .app bundles place resources under Contents/Resources/_up_/
        let up_bundle = resource_dir.join("_up_").join("bundle");
        if up_bundle.exists() {
            return resource_dir.join("_up_");
        }
    }

    // Fallback: same directory as executable
    if let Ok(exe) = std::env::current_exe() {
        if let Some(p) = exe.parent() {
            return p.to_path_buf();
        }
    }

    PathBuf::from(".")
}

/// Load agents from data/agents.json.
/// If the file doesn't exist, return the four built-in defaults.
pub fn load_agents(app: &tauri::AppHandle) -> Result<Vec<AgentDef>, String> {
    let root = bundle_root(app);
    let agents_file = root.join("data").join("agents.json");

    if agents_file.exists() {
        let content =
            std::fs::read_to_string(&agents_file).map_err(|e| format!("read agents.json: {}", e))?;
        let agents: Vec<AgentDef> =
            serde_json::from_str(&content).map_err(|e| format!("parse agents.json: {}", e))?;
        Ok(agents)
    } else {
        Ok(default_agents())
    }
}

/// Resolve the actual binary path from the template in agents.json.
/// Replaces {platform} with the current platform directory name.
/// In dev mode, falls back to searching system PATH if bundle binary not found.
pub fn resolve_binary_path(root: &std::path::Path, binary_template: &str) -> PathBuf {
    let platform = current_platform();
    let resolved = binary_template.replace("{platform}", platform);

    // Add .exe on Windows
    let resolved = if cfg!(windows) && !resolved.ends_with(".exe") {
        format!("{}.exe", resolved)
    } else {
        resolved
    };

    let bundle_path = root.join(&resolved);

    // If bundle binary exists, use it
    if bundle_path.exists() {
        return bundle_path;
    }

    // Fallback: search system PATH for the binary name (dev mode convenience)
    let binary_name = std::path::Path::new(&resolved)
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .to_string();

    if let Some(found) = find_in_path(&binary_name) {
        return found;
    }

    // Fallback: use login shell PATH (catches Homebrew, nvm, etc.)
    if let Some(found) = find_in_login_shell_path(&binary_name) {
        return found;
    }

    // Return the bundle path anyway (caller will report "not found")
    bundle_path
}

/// Simple PATH lookup without external crate.
fn find_in_path(name: &str) -> Option<PathBuf> {
    let path_var = std::env::var("PATH").ok()?;
    let sep = if cfg!(windows) { ';' } else { ':' };
    for dir in path_var.split(sep) {
        let candidate = PathBuf::from(dir).join(name);
        if candidate.exists() {
            return Some(candidate);
        }
    }
    None
}

/// Use a login shell to resolve the full PATH, then search for the binary.
/// This catches binaries installed via Homebrew, nvm, etc. that are only
/// available in a login shell environment.
fn find_in_login_shell_path(name: &str) -> Option<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        // On Windows, use `where`
        let output = std::process::Command::new("where")
            .arg(name)
            .output()
            .ok()?;
        if output.status.success() {
            let text = String::from_utf8_lossy(&output.stdout);
            let first_line = text.lines().next()?.trim();
            if !first_line.is_empty() {
                return Some(PathBuf::from(first_line));
            }
        }
        None
    }

    #[cfg(not(target_os = "windows"))]
    {
        // On macOS/Linux, spawn a login shell to get the full PATH
        let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
        let cmd = format!("command -v {}", name);
        let output = std::process::Command::new(&shell)
            .args(["-lc", &cmd])
            .output()
            .ok()?;
        if output.status.success() {
            let text = String::from_utf8_lossy(&output.stdout);
            let path_str = text.trim();
            if !path_str.is_empty() {
                let candidate = PathBuf::from(path_str);
                if candidate.exists() {
                    return Some(candidate);
                }
            }
        }
        None
    }
}

fn current_platform() -> &'static str {
    if cfg!(all(target_os = "windows", target_arch = "x86_64")) {
        "windows-x64"
    } else if cfg!(all(target_os = "macos", target_arch = "aarch64")) {
        "macos-arm64"
    } else if cfg!(all(target_os = "macos", target_arch = "x86_64")) {
        "macos-x64"
    } else {
        "unknown"
    }
}

fn default_agents() -> Vec<AgentDef> {
    vec![
        AgentDef {
            id: "claude".into(),
            name: "claude".into(),
            chinese_name: "梅".into(),
            glyph: "梅".into(),
            color: "#ff8c32".into(),
            specialty: "编程、架构设计、代码审查".into(),
            binary: "bundle/claude/{platform}/claude".into(),
            config_type: "anthropic_env".into(),
            enabled: true,
            in_group: true,
        },
        AgentDef {
            id: "codex".into(),
            name: "codex".into(),
            chinese_name: "兰".into(),
            glyph: "兰".into(),
            color: "#50c878".into(),
            specialty: "编程、快速原型、OpenAI 生态".into(),
            binary: "bundle/codex/{platform}/codex".into(),
            config_type: "codex_toml".into(),
            enabled: true,
            in_group: true,
        },
        AgentDef {
            id: "openclaw".into(),
            name: "openclaw".into(),
            chinese_name: "竹".into(),
            glyph: "竹".into(),
            color: "#ff6464".into(),
            specialty: "内容生成、渠道运营、技能调用".into(),
            binary: "bundle/openclaw/{platform}/openclaw".into(),
            config_type: "openai_env".into(),
            enabled: true,
            in_group: true,
        },
        AgentDef {
            id: "hermes".into(),
            name: "hermes".into(),
            chinese_name: "菊".into(),
            glyph: "菊".into(),
            color: "#a064ff".into(),
            specialty: "记忆、学习、任务编排".into(),
            binary: "bundle/hermes/{platform}/hermes".into(),
            config_type: "openai_env".into(),
            enabled: true,
            in_group: true,
        },
    ]
}
