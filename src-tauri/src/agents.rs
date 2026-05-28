use std::path::PathBuf;
use tauri::Manager;

use crate::AgentDef;

/// Resolve the bundle root directory.
pub fn bundle_root(app: &tauri::AppHandle) -> PathBuf {
    // In production: same directory as the executable
    if let Ok(exe) = std::env::current_exe() {
        if let Some(p) = exe.parent() {
            return p.to_path_buf();
        }
    }
    // Fallback: resource dir
    app.path()
        .resource_dir()
        .unwrap_or_else(|_| PathBuf::from("."))
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
            chinese_name: "利刃".into(),
            glyph: "刃".into(),
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
            chinese_name: "方盒".into(),
            glyph: "盒".into(),
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
            chinese_name: "百川".into(),
            glyph: "匣".into(),
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
            chinese_name: "砚墨".into(),
            glyph: "砚".into(),
            color: "#a064ff".into(),
            specialty: "记忆、学习、任务编排".into(),
            binary: "bundle/hermes/{platform}/hermes".into(),
            config_type: "openai_env".into(),
            enabled: true,
            in_group: true,
        },
    ]
}
