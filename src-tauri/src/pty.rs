use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex, RwLock};
use std::thread;
use std::time::Duration;
use std::process::Command as StdCommand;

use portable_pty::{native_pty_system, CommandBuilder, PtySize, MasterPty};
use tauri::ipc::Channel;
use tauri::Emitter;

// ═══════════════════════════════════════════
// PTY Session Management
// ═══════════════════════════════════════════

pub struct PtySession {
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    killer: Mutex<Box<dyn portable_pty::ChildKiller + Send + Sync>>,
    master: Mutex<Box<dyn MasterPty + Send>>,
    pid: u32,
}

pub struct AppState {
    pub sessions: Arc<RwLock<HashMap<u32, Arc<PtySession>>>>,
    pub next_id: AtomicU32,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            sessions: Arc::new(RwLock::new(HashMap::new())),
            next_id: AtomicU32::new(1),
        }
    }
}

// ═══════════════════════════════════════════
// PTY Cleanup
// ═══════════════════════════════════════════

/// Kill and clean up all PTY sessions.
pub fn cleanup_all_sessions(state: &AppState) {
    let mut sessions = state.sessions.write().unwrap();
    for (id, session) in sessions.drain() {
        if let Ok(mut killer) = session.killer.lock() {
            let _ = killer.kill();
        }
        log::info!("cleaned up PTY session {}", id);
    }
}

/// List all active PTY sessions with their IDs and PIDs.
#[tauri::command]
pub fn pty_list(state: tauri::State<AppState>) -> Result<Vec<(u32, u32)>, String> {
    let sessions = state.sessions.read().unwrap();
    let list: Vec<(u32, u32)> = sessions.iter().map(|(id, s)| (*id, s.pid)).collect();
    Ok(list)
}

// ═══════════════════════════════════════════
// Tauri Commands
// ═══════════════════════════════════════════

/// Spawn a PTY process. Returns session ID.
/// `on_data` channel streams stdout bytes to the frontend.
#[tauri::command]
pub fn pty_spawn(
    app: tauri::AppHandle,
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
    let pid = child.process_id().unwrap_or(0);

    let writer = Arc::new(Mutex::new(pair.master.take_writer().map_err(|e| e.to_string())?));
    let killer = Mutex::new(child.clone_killer());
    let master = Mutex::new(pair.master);

    let session = Arc::new(PtySession { writer, killer, master, pid });
    // Clone Arc BEFORE inserting — avoids TOCTOU race (H4)
    // M6: try_clone_reader before inserting so failure doesn't orphan session
    let mut reader = session.master.lock().unwrap_or_else(|e| e.into_inner()).try_clone_reader().map_err(|e| e.to_string())?;
    state.sessions.write().unwrap().insert(id, session.clone());

    // Clone sessions Arc for cleanup in reader thread
    let sessions_for_thread = state.sessions.clone();
    thread::spawn(move || {
        let mut buf = [0u8; 8192];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => {
                    let _ = on_data.send("\r\n[process exited]\r\n".into());
                    break;
                }
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();
                    // Filter DA1/DA2 device attribute responses
                    let filtered = data.replace("\x1b[?62c", "").replace("\x1b[?1;2c", "").replace("\x1b[0q", "").replace("\x1b[>0q", "");
                    let _ = on_data.send(filtered);
                }
                Err(e) => {
                    let _ = on_data.send(format!("\r\n[error: {}]\r\n", e));
                    break;
                }
            }
        }
        // Cleanup: remove session from map and emit event
        sessions_for_thread.write().unwrap().remove(&id);
        drop(session); // release our Arc reference
        let _ = app.emit("pty-exit", id);
        log::info!("pty id={} reader exited, session removed", id);
    });

    log::info!("pty_spawn id={} cmd={} cols={} rows={}", id, cmd, cols, rows);
    Ok(id)
}

/// Write data to a PTY session's stdin.
#[tauri::command]
pub fn pty_write(state: tauri::State<AppState>, id: u32, data: String) -> Result<(), String> {
    let sessions = state.sessions.read().unwrap();
    let session = sessions.get(&id).ok_or("session not found")?;
    let mut writer = session.writer.lock().unwrap_or_else(|e| e.into_inner());
    writer
        .write_all(data.as_bytes())
        .map_err(|e| e.to_string())?;
    writer.flush().map_err(|e| e.to_string())?;
    Ok(())
}

/// Resize a PTY session.
#[tauri::command]
pub fn pty_resize(state: tauri::State<AppState>, id: u32, cols: u16, rows: u16) -> Result<(), String> {
    let sessions = state.sessions.read().unwrap();
    let session = sessions.get(&id).ok_or("session not found")?;
    let master = session.master.lock().unwrap_or_else(|e| e.into_inner());
    master.resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
        .map_err(|e| format!("resize failed: {}", e))?;
    Ok(())
}

/// Kill a PTY session.
#[tauri::command]
pub fn pty_kill(
    state: tauri::State<AppState>,
    rec_state: tauri::State<crate::recording::RecordingState>,
    id: u32,
) -> Result<(), String> {
    // M3: Stop recording before killing the session
    crate::recording::stop_recording(&rec_state, id);
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
pub fn spawn_agent(
    app: tauri::AppHandle,
    state: tauri::State<AppState>,
    rec_state: tauri::State<crate::recording::RecordingState>,
    agent_id: String,
    cwd: Option<String>,
    cols: u16,
    rows: u16,
    on_data: Channel<String>,
) -> Result<u32, String> {
    let root = crate::agents::bundle_root(&app);
    let all_agents = crate::agents::load_agents(&app)?;
    let agent = all_agents.into_iter().find(|a| a.id == agent_id)
        .ok_or_else(|| format!("agent not found: {}", agent_id))?;

    // Resolve binary path
    let binary_path = crate::agents::resolve_binary_path(&root, &agent.binary);
    if !binary_path.exists() {
        return Err(format!("binary not found: {} (looked at {})", agent_id, binary_path.display()));
    }

    // Get active provider config
    let app_type = match agent_id.as_str() {
        "claude" => "claude",
        "codex" => "codex",
        _ => &agent_id,
    };
    let provider = crate::config::get_active_provider(&root, app_type)?;

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
                // Decrypt key if encrypted (cc-switch stores encrypted keys)
                let plain_key = crate::secure::unseal(&p.api_key).unwrap_or_else(|_| p.api_key.clone());
                let auth = serde_json::json!({"OPENAI_API_KEY": plain_key});
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
                if !p.model.is_empty() {
                    command.env("OPENAI_MODEL", &p.model);
                }
                if !p.base_url.is_empty() {
                    command.env("OPENAI_BASE_URL", &p.base_url);
                }
                if !p.api_key.is_empty() {
                    command.env("OPENAI_API_KEY", &p.api_key);
                }
            }
        }
    }
    let child = pair
        .slave
        .spawn_command(command)
        .map_err(|e| format!("spawn failed: {}", e))?;
    let id = state.next_id.fetch_add(1, Ordering::Relaxed);
    let pid = child.process_id().unwrap_or(0);
    let writer = Arc::new(Mutex::new(pair.master.take_writer().map_err(|e| e.to_string())?));
    let killer = Mutex::new(child.clone_killer());
    let master = Mutex::new(pair.master);
    let session = Arc::new(PtySession { writer, killer, master, pid });

    // Auto-accept trust prompt for CLI agents (Claude Code, Codex, etc.)
    // First: write trust files (Orca pattern — more reliable than sending "1\n")
    if let Some(ref dir) = cwd {
        let _trust_path = std::path::Path::new(dir);
        // Codex: add trust entry to ~/.codex/config.toml
        if agent.config_type == "codex_toml" {
            let home = dirs::home_dir().unwrap_or_else(|| std::path::PathBuf::from("."));
            let codex_config = home.join(".codex").join("config.toml");
            if let Ok(mut content) = std::fs::read_to_string(&codex_config) {
                let trust_entry = format!("\n[projects.\"{}\"]\ntrust_level = \"trusted\"\n", dir);
                if !content.contains(dir) {
                    content.push_str(&trust_entry);
                    let _ = std::fs::write(&codex_config, content);
                }
            }
        }
        // Claude: write trust marker
        if agent.config_type == "anthropic_env" {
            let home = dirs::home_dir().unwrap_or_else(|| std::path::PathBuf::from("."));
            let slug = dir.trim_start_matches('/').replace('/', "-");
            let trust_dir = home.join(".claude").join("projects").join(&slug);
            let _ = std::fs::create_dir_all(&trust_dir);
            let _ = std::fs::write(trust_dir.join(".trust"), serde_json::json!({
                "trustedAt": std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default().as_millis(),
                "workspacePath": dir,
            }).to_string());
        }
    }
    // Fallback: also send "1\n" in case trust files weren't enough
    {
        let w = session.writer.clone();
        thread::spawn(move || {
            thread::sleep(Duration::from_millis(2500));
            let mut lock = w.lock().unwrap_or_else(|e| e.into_inner());
            let _ = lock.write_all(b"1\n");
        });
    }
    // Clone Arc BEFORE inserting — avoids TOCTOU race (H4)
    // H4+M6: Clone reader BEFORE inserting, clone Arc for insert
    let mut reader = session.master.lock().unwrap_or_else(|e| e.into_inner()).try_clone_reader().map_err(|e| e.to_string())?;
    state.sessions.write().unwrap().insert(id, session.clone());

    // Clone sessions Arc for cleanup in reader thread
    let sessions_for_thread = state.sessions.clone();
    thread::spawn(move || {
        let mut buf = [0u8; 8192];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => {
                    let _ = on_data.send("\r\n[process exited]\r\n".into());
                    break;
                }
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();
                    // Filter DA1/DA2 device attribute responses
                    let filtered = data.replace("\x1b[?62c", "").replace("\x1b[?1;2c", "").replace("\x1b[0q", "").replace("\x1b[>0q", "");
                    let _ = on_data.send(filtered);
                }
                Err(e) => {
                    let _ = on_data.send(format!("\r\n[error: {}]\r\n", e));
                    break;
                }
            }
        }
        // Cleanup: remove session from map and emit event
        sessions_for_thread.write().unwrap().remove(&id);
        drop(session);
        let _ = app.emit("pty-exit", id);
        log::info!("spawn_agent id={} reader exited, session removed", id);
    });

    log::info!("spawn_agent id={} agent={} binary={}", id, agent_id, binary_path.display());
    // M3: Auto-start recording for agent sessions
    crate::recording::start_recording(&rec_state, id, cols, rows);
    Ok(id)
}

/// Get the current working directory of a PTY session's child process.
/// On Unix, uses /proc/PID/cwd symlink or lsof as fallback.
/// On Windows, uses PowerShell Get-Process.
#[tauri::command]
pub fn pty_cwd(state: tauri::State<AppState>, id: u32) -> Result<String, String> {
    let sessions = state.sessions.read().unwrap();
    let session = sessions.get(&id).ok_or("session not found")?;
    let pid = session.pid;
    drop(sessions);

    if pid == 0 {
        return Ok(String::new());
    }

    #[cfg(target_os = "macos")]
    {
        // On macOS, use lsof to find the cwd
        let output = StdCommand::new("lsof")
            .args(["-a", "-p", &pid.to_string(), "-d", "cwd", "-Fn"])
            .output();
        match output {
            Ok(out) if out.status.success() => {
                let text = String::from_utf8_lossy(&out.stdout);
                // lsof -Fn output: lines prefixed with 'n' are the cwd path
                for line in text.lines() {
                    if let Some(path) = line.strip_prefix('n') {
                        return Ok(path.to_string());
                    }
                }
                Ok(String::new())
            }
            _ => Ok(String::new()),
        }
    }

    #[cfg(target_os = "linux")]
    {
        // On Linux, read /proc/PID/cwd symlink
        let cwd_link = format!("/proc/{}/cwd", pid);
        match std::fs::read_link(&cwd_link) {
            Ok(path) => Ok(path.to_string_lossy().to_string()),
            Err(_) => Ok(String::new()),
        }
    }

    #[cfg(target_os = "windows")]
    {
        // On Windows, use PowerShell CIM to get process working directory
        // (Get-Process.Path returns the exe path, not the CWD)
        let output = StdCommand::new("powershell")
            .args([
                "-NoProfile",
                "-Command",
                &format!(
                    "(Get-CimInstance Win32_Process -Filter \"ProcessId={}\").CommandLine",
                    pid
                ),
            ])
            .output();
        match output {
            Ok(out) if out.status.success() => {
                Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
            }
            _ => Ok(String::new()),
        }
    }

    // Fallback for other platforms
    #[cfg(not(any(target_os = "macos", target_os = "linux", target_os = "windows")))]
    {
        Ok(String::new())
    }
}
