use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex, RwLock};
use std::thread;

use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde::{Deserialize, Serialize};
use tauri::{ipc::Channel, Manager};

mod agents;
mod config;

// ═══════════════════════════════════════════
// PTY Session Management
// ═══════════════════════════════════════════

struct PtySession {
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    #[allow(dead_code)]
    killer: Mutex<Box<dyn portable_pty::ChildKiller + Send + Sync>>,
}

struct AppState {
    sessions: RwLock<HashMap<u32, Arc<PtySession>>>,
    next_id: AtomicU32,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            sessions: RwLock::new(HashMap::new()),
            next_id: AtomicU32::new(1),
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AgentDef {
    pub id: String,
    pub name: String,
    pub chinese_name: String,
    pub glyph: String,
    pub color: String,
    pub specialty: String,
    pub binary: String,
    pub config_type: String,
    pub enabled: bool,
    pub in_group: bool,
}

// ═══════════════════════════════════════════
// Tauri Commands
// ═══════════════════════════════════════════

/// Spawn a PTY process. Returns session ID.
/// `on_data` channel streams stdout bytes to the frontend.
#[tauri::command]
fn pty_spawn(
    state: tauri::State<AppState>,
    cmd: String,
    args: Vec<String>,
    cwd: Option<String>,
    cols: u16,
    rows: u16,
    on_data: Channel<String>,
) -> Result<u32, String> {
    let pty_system = native_pty_system();

    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("openpty failed: {}", e))?;

    let mut command = CommandBuilder::new(&cmd);
    for arg in &args {
        command.arg(arg);
    }
    if let Some(dir) = &cwd {
        command.cwd(dir);
    }

    // Set TERM for proper rendering
    command.env("TERM", "xterm-256color");

    let child = pair
        .slave
        .spawn_command(command)
        .map_err(|e| format!("spawn failed: {}", e))?;

    let id = state.next_id.fetch_add(1, Ordering::Relaxed);

    let writer = Arc::new(Mutex::new(pair.master.take_writer().map_err(|e| e.to_string())?));
    let killer = Mutex::new(child.clone_killer());

    let session = Arc::new(PtySession { writer, killer });
    state.sessions.write().unwrap().insert(id, session);

    // Reader thread: PTY stdout → Channel → frontend xterm.js
    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    thread::spawn(move || {
        let mut buf = [0u8; 8192];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    // Send as base64 to avoid UTF-8 issues with raw bytes
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();
                    let _ = on_data.send(data);
                }
                Err(_) => break,
            }
        }
    });

    log::info!("pty_spawn id={} cmd={} cols={} rows={}", id, cmd, cols, rows);
    Ok(id)
}

/// Write data to a PTY session's stdin.
#[tauri::command]
fn pty_write(state: tauri::State<AppState>, id: u32, data: String) -> Result<(), String> {
    let sessions = state.sessions.read().unwrap();
    let session = sessions.get(&id).ok_or("session not found")?;
    let mut writer = session.writer.lock().unwrap();
    writer
        .write_all(data.as_bytes())
        .map_err(|e| e.to_string())?;
    writer.flush().map_err(|e| e.to_string())?;
    Ok(())
}

/// Resize a PTY session.
#[tauri::command]
fn pty_resize(state: tauri::State<AppState>, id: u32, cols: u16, rows: u16) -> Result<(), String> {
    // portable-pty resize requires master access which we don't store separately.
    // For Phase 0, resize is a no-op. Phase 1 will store master handle.
    let _ = (state, id, cols, rows);
    Ok(())
}

/// Kill a PTY session.
#[tauri::command]
fn pty_kill(state: tauri::State<AppState>, id: u32) -> Result<(), String> {
    let mut sessions = state.sessions.write().unwrap();
    if let Some(session) = sessions.remove(&id) {
        if let Ok(mut killer) = session.killer.lock() {
            let _ = killer.kill();
        }
    }
    Ok(())
}

/// Spawn an Agent by ID — resolves binary, injects config, starts PTY.
#[tauri::command]
fn spawn_agent(
    app: tauri::AppHandle,
    state: tauri::State<AppState>,
    agent_id: String,
    cwd: Option<String>,
    cols: u16,
    rows: u16,
    on_data: Channel<String>,
) -> Result<u32, String> {
    let root = agents::bundle_root(&app);
    let all_agents = agents::load_agents(&app)?;
    let agent = all_agents.into_iter().find(|a| a.id == agent_id)
        .ok_or_else(|| format!("agent not found: {}", agent_id))?;

    // Resolve binary path
    let binary_path = agents::resolve_binary_path(&root, &agent.binary);
    if !binary_path.exists() {
        return Err(format!("binary not found: {} (looked at {})", agent_id, binary_path.display()));
    }

    // Get active provider config
    let app_type = match agent_id.as_str() {
        "claude" => "claude",
        "codex" => "codex",
        _ => &agent_id,
    };
    let provider = config::get_active_provider(&root, app_type)?;

    // Build PTY
    let pty_system = native_pty_system();
    let pair = pty_system
        .openpty(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
        .map_err(|e| format!("openpty: {}", e))?;

    let mut command = CommandBuilder::new(&binary_path);
    if let Some(dir) = &cwd {
        command.cwd(dir);
    }
    command.env("TERM", "xterm-256color");

    // Inject config based on agent type
    if let Some(ref p) = provider {
        match agent.config_type.as_str() {
            "anthropic_env" => {
                command.env("ANTHROPIC_BASE_URL", &p.base_url);
                command.env("ANTHROPIC_API_KEY", &p.api_key);
                if !p.model.is_empty() {
                    command.env("ANTHROPIC_MODEL", &p.model);
                }
            }
            "codex_toml" => {
                // Write auth.json for codex
                let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
                let codex_dir = home.join(".codex");
                let _ = std::fs::create_dir_all(&codex_dir);
                let auth = serde_json::json!({"OPENAI_API_KEY": p.api_key});
                let _ = std::fs::write(codex_dir.join("auth.json"), auth.to_string());
                if !p.base_url.is_empty() {
                    let model = if p.model.is_empty() { "gpt-5.4" } else { &p.model };
                    let toml = format!(
                        "model_provider = \"custom\"\nmodel = \"{}\"\n\n[model_providers.custom]\nname = \"Custom\"\nbase_url = \"{}\"\nwire_api = \"responses\"\nenv_key = \"OPENAI_API_KEY\"",
                        model, p.base_url
                    );
                    let _ = std::fs::write(codex_dir.join("config.toml"), toml);
                }
            }
            "openai_env" | "custom_env" | _ => {
                if !p.base_url.is_empty() {
                    command.env("OPENAI_BASE_URL", &p.base_url);
                }
                if !p.api_key.is_empty() {
                    command.env("OPENAI_API_KEY", &p.api_key);
                }
            }
        }
    }

    let child = pair.slave.spawn_command(command)
        .map_err(|e| format!("spawn agent {}: {}", agent_id, e))?;

    let id = state.next_id.fetch_add(1, Ordering::Relaxed);
    let writer = Arc::new(Mutex::new(pair.master.take_writer().map_err(|e| e.to_string())?));
    let killer = Mutex::new(child.clone_killer());
    let session = Arc::new(PtySession { writer, killer });
    state.sessions.write().unwrap().insert(id, session);

    // Reader thread
    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    thread::spawn(move || {
        let mut buf = [0u8; 8192];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();
                    let _ = on_data.send(data);
                }
                Err(_) => break,
            }
        }
    });

    log::info!("spawn_agent id={} agent={} binary={}", id, agent_id, binary_path.display());
    Ok(id)
}

/// List registered agents from agents.json.
#[tauri::command]
fn list_agents(app: tauri::AppHandle) -> Result<Vec<AgentDef>, String> {
    agents::load_agents(&app)
}

/// Get the bundle root directory.
#[tauri::command]
fn get_bundle_root(app: tauri::AppHandle) -> Result<String, String> {
    let root = agents::bundle_root(&app);
    Ok(root.to_string_lossy().to_string())
}

/// List providers for a given agent/app_type.
#[tauri::command]
fn get_providers(app: tauri::AppHandle, app_type: String) -> Result<Vec<config::ProviderConfig>, String> {
    let root = agents::bundle_root(&app);
    config::list_providers(&root, &app_type)
}

/// Save a provider configuration.
#[tauri::command]
fn save_provider(app: tauri::AppHandle, provider: config::ProviderConfig) -> Result<(), String> {
    let root = agents::bundle_root(&app);
    config::save_provider(&root, &provider)
}

/// Get the active provider for an agent.
#[tauri::command]
fn get_active_provider(app: tauri::AppHandle, app_type: String) -> Result<Option<config::ProviderConfig>, String> {
    let root = agents::bundle_root(&app);
    config::get_active_provider(&root, &app_type)
}

// ═══════════════════════════════════════════
// App Entry
// ═══════════════════════════════════════════

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            pty_spawn,
            pty_write,
            pty_resize,
            pty_kill,
            spawn_agent,
            list_agents,
            get_bundle_root,
            get_providers,
            save_provider,
            get_active_provider,
        ])
        .run(tauri::generate_context!())
        .expect("error while running yuai-gui");
}
