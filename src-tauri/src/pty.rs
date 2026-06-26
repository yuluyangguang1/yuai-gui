use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex, RwLock};
use std::thread;
use std::process::Command as StdCommand;

use portable_pty::{native_pty_system, CommandBuilder, PtySize, MasterPty};
use tauri::ipc::Channel;

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
    pub sessions: RwLock<HashMap<u32, Arc<PtySession>>>,
    pub next_id: AtomicU32,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            sessions: RwLock::new(HashMap::new()),
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

// ═══════════════════════════════════════════
// Tauri Commands
// ═══════════════════════════════════════════

/// Spawn a PTY process. Returns session ID.
/// `on_data` channel streams stdout bytes to the frontend.
#[tauri::command]
pub fn pty_spawn(
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
    let mut reader = session.master.lock().unwrap().try_clone_reader().map_err(|e| e.to_string())?;
    state.sessions.write().unwrap().insert(id, session.clone());
    // H3: Get a clone of the sessions map for cleanup in reader thread
    let sessions_ref = {
        let s = state.sessions.read().unwrap();
        // We can't clone RwLock, but we can get a reference via Arc
        // Instead, use a simpler approach: store session Arc in thread and let frontend call pty_kill
        drop(s);
        None::<Arc<PtySession>> // placeholder — see cleanup note below
    };
    let _ = sessions_ref; // suppress unused warning
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
                    let _ = on_data.send(data);
                }
                Err(e) => {
                    let _ = on_data.send(format!("\r\n[error: {}]\r\n", e));
                    break;
                }
            }
        }
        // H3: Session cleanup — the Arc<PtySession> in HashMap will be cleaned
        // when frontend calls pty_kill or window closes.
        // The session stays in HashMap so frontend can detect [process exited]
        // and call pty_kill explicitly.
        drop(session); // release our Arc reference
        log::info!("pty id={} reader exited", id);
    });

    log::info!("pty_spawn id={} cmd={} cols={} rows={}", id, cmd, cols, rows);
    Ok(id)
}

/// Write data to a PTY session's stdin.
#[tauri::command]
pub fn pty_write(state: tauri::State<AppState>, id: u32, data: String) -> Result<(), String> {
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
pub fn pty_resize(state: tauri::State<AppState>, id: u32, cols: u16, rows: u16) -> Result<(), String> {
    let sessions = state.sessions.read().unwrap();
    let session = sessions.get(&id).ok_or("session not found")?;
    let master = session.master.lock().unwrap();
    master.resize(PtySize { rows, cols, pixel_width: 0, pixel_height: 0 })
        .map_err(|e| format!("resize failed: {}", e))?;
    Ok(())
}

/// Kill a PTY session.
#[tauri::command]
pub fn pty_kill(state: tauri::State<AppState>, id: u32) -> Result<(), String> {
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
    // H4+M6: Clone reader BEFORE inserting, clone Arc for insert
    let mut reader = session.master.lock().unwrap().try_clone_reader().map_err(|e| e.to_string())?;
    state.sessions.write().unwrap().insert(id, session.clone());

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
                    let _ = on_data.send(data);
                }
                Err(e) => {
                    let _ = on_data.send(format!("\r\n[error: {}]\r\n", e));
                    break;
                }
            }
        }
        drop(session);
        log::info!("spawn_agent id={} reader exited", id);
    });

    log::info!("spawn_agent id={} agent={} binary={}", id, agent_id, binary_path.display());
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
        // On Windows, use PowerShell to get process working directory
        let output = StdCommand::new("powershell")
            .args([
                "-NoProfile",
                "-Command",
                &format!(
                    "(Get-Process -Id {}).Path | ForEach-Object {{ $_.DirectoryName }}",
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
