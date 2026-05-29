use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::{Arc, Mutex, RwLock};
use std::thread;

use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;

mod agents;
mod bus;
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
// File Tree
// ═══════════════════════════════════════════

#[derive(Debug, Serialize)]
struct FileNode {
    name: String,
    path: String,
    is_dir: bool,
    children: Option<Vec<FileNode>>,
}

/// Read the file tree of a directory, up to 2 levels deep, with sensible filtering.
#[tauri::command]
fn read_dir_tree(path: String, max_depth: Option<u32>) -> Result<Vec<FileNode>, String> {
    let root = std::path::Path::new(&path);
    if !root.exists() {
        return Err(format!("path does not exist: {}", path));
    }
    let depth = max_depth.unwrap_or(2);
    read_dir_recursive(root, depth)
}

/// Read a text file's content.
#[tauri::command]
fn read_file_content(path: String) -> Result<String, String> {
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

/// Get git diff for the workspace (unstaged changes).
#[tauri::command]
fn get_git_diff(cwd: String) -> Result<String, String> {
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
fn get_changed_files(cwd: String) -> Result<Vec<ChangedFile>, String> {
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
fn revert_file(cwd: String, path: String) -> Result<(), String> {
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
fn accept_file(cwd: String, path: String) -> Result<(), String> {
    std::process::Command::new("git")
        .args(["add", &path])
        .current_dir(&cwd)
        .output()
        .map_err(|e| format!("git add failed: {}", e))?;
    Ok(())
}

#[derive(Debug, Serialize, Deserialize)]
struct ChangedFile {
    path: String,
    status: String,
}

// ═══════════════════════════════════════════
// Chat Persistence
// ═══════════════════════════════════════════

#[derive(Debug, Serialize, Deserialize, Clone)]
struct ChatRecord {
    id: Option<i64>,
    timestamp: u64,
    from: String,       // "user" | agent_id
    content: String,
    msg_type: String,   // "chat" | "system"
    workspace: String,
}

/// Save a chat message to local DB.
#[tauri::command]
fn save_chat_message(app: tauri::AppHandle, record: ChatRecord) -> Result<(), String> {
    let root = agents::bundle_root(&app);
    let db_dir = root.join("data");
    std::fs::create_dir_all(&db_dir).map_err(|e| e.to_string())?;
    let db_path = db_dir.join("chat_history.db");

    let conn = rusqlite::Connection::open(&db_path).map_err(|e| e.to_string())?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp INTEGER NOT NULL,
            sender TEXT NOT NULL,
            content TEXT NOT NULL,
            msg_type TEXT NOT NULL DEFAULT 'chat',
            workspace TEXT NOT NULL DEFAULT ''
        );"
    ).map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO messages (timestamp, sender, content, msg_type, workspace) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![record.timestamp, record.from, record.content, record.msg_type, record.workspace],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

/// Load chat history for a workspace (last 100 messages).
#[tauri::command]
fn load_chat_history(app: tauri::AppHandle, workspace: String) -> Result<Vec<ChatRecord>, String> {
    let root = agents::bundle_root(&app);
    let db_path = root.join("data").join("chat_history.db");
    if !db_path.exists() {
        return Ok(vec![]);
    }

    let conn = rusqlite::Connection::open_with_flags(
        &db_path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY
    ).map_err(|e| e.to_string())?;

    let mut stmt = conn.prepare(
        "SELECT id, timestamp, sender, content, msg_type, workspace FROM messages WHERE workspace = ?1 ORDER BY timestamp DESC LIMIT 100"
    ).map_err(|e| e.to_string())?;

    let rows = stmt.query_map(rusqlite::params![workspace], |row| {
        Ok(ChatRecord {
            id: row.get(0)?,
            timestamp: row.get(1)?,
            from: row.get(2)?,
            content: row.get(3)?,
            msg_type: row.get(4)?,
            workspace: row.get(5)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut records: Vec<ChatRecord> = Vec::new();
    for row in rows {
        if let Ok(r) = row { records.push(r); }
    }
    records.reverse(); // oldest first
    Ok(records)
}

fn read_dir_recursive(dir: &std::path::Path, depth: u32) -> Result<Vec<FileNode>, String> {
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

        entries.push(FileNode { name, path: path_str, is_dir, children });
    }

    // Sort: dirs first, then alphabetical
    entries.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });

    Ok(entries)
}

// ═══════════════════════════════════════════
// Group Chat Commands
// ═══════════════════════════════════════════

/// Send a user message to the group chat. Returns the list of agents that will speak.
#[tauri::command]
fn group_send(state: tauri::State<bus::SharedGroupChat>, content: String) -> Result<Vec<bus::NextSpeaker>, String> {
    let mut chat = state.write().map_err(|e| e.to_string())?;
    Ok(chat.user_message(&content))
}

/// Get the next agent that should speak in the discussion.
#[tauri::command]
fn group_next_speaker(state: tauri::State<bus::SharedGroupChat>) -> Result<Option<bus::NextSpeaker>, String> {
    let mut chat = state.write().map_err(|e| e.to_string())?;
    Ok(chat.next_speaker())
}

/// Record an agent's response in the group chat.
#[tauri::command]
fn group_agent_response(
    state: tauri::State<bus::SharedGroupChat>,
    agent_id: String,
    content: String,
    tokens: Option<u32>,
    model: Option<String>,
    duration_ms: Option<u64>,
) -> Result<(), String> {
    let mut chat = state.write().map_err(|e| e.to_string())?;
    chat.agent_response(&agent_id, &content, tokens, model, duration_ms);
    Ok(())
}

/// Build the discussion prompt for a specific agent.
#[tauri::command]
fn group_build_prompt(
    app: tauri::AppHandle,
    state: tauri::State<bus::SharedGroupChat>,
    agent_id: String,
) -> Result<String, String> {
    let chat = state.read().map_err(|e| e.to_string())?;
    let all_agents = agents::load_agents(&app)?;
    let agents_info: Vec<(String, String, String)> = all_agents.iter()
        .map(|a| (a.id.clone(), a.name.clone(), a.specialty.clone()))
        .collect();
    Ok(chat.build_discussion_prompt(&agent_id, &agents_info))
}

/// User confirms execution. Optionally specify execution order.
#[tauri::command]
fn group_confirm_exec(state: tauri::State<bus::SharedGroupChat>, order: Option<Vec<String>>) -> Result<(), String> {
    let mut chat = state.write().map_err(|e| e.to_string())?;
    chat.confirm_execution(order);
    Ok(())
}

/// Get the next agent to execute.
#[tauri::command]
fn group_next_executor(state: tauri::State<bus::SharedGroupChat>) -> Result<Option<String>, String> {
    let mut chat = state.write().map_err(|e| e.to_string())?;
    Ok(chat.next_executor())
}

/// Get current chat phase.
#[tauri::command]
fn group_get_phase(state: tauri::State<bus::SharedGroupChat>) -> Result<bus::ChatPhase, String> {
    let chat = state.read().map_err(|e| e.to_string())?;
    Ok(chat.phase.clone())
}

/// Get all messages in the group chat.
#[tauri::command]
fn group_get_messages(state: tauri::State<bus::SharedGroupChat>) -> Result<Vec<bus::ChatMessage>, String> {
    let chat = state.read().map_err(|e| e.to_string())?;
    Ok(chat.messages.clone())
}

/// Invite an agent to the group.
#[tauri::command]
fn group_invite(state: tauri::State<bus::SharedGroupChat>, agent_id: String) -> Result<(), String> {
    let mut chat = state.write().map_err(|e| e.to_string())?;
    chat.invite(&agent_id);
    Ok(())
}

/// Kick an agent from the group.
#[tauri::command]
fn group_kick(state: tauri::State<bus::SharedGroupChat>, agent_id: String) -> Result<(), String> {
    let mut chat = state.write().map_err(|e| e.to_string())?;
    chat.kick(&agent_id);
    Ok(())
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
        .manage(bus::new_group_chat())
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
            read_dir_tree,
            read_file_content,
            get_git_diff,
            get_changed_files,
            revert_file,
            accept_file,
            save_chat_message,
            load_chat_history,
            group_send,
            group_next_speaker,
            group_agent_response,
            group_build_prompt,
            group_confirm_exec,
            group_next_executor,
            group_get_phase,
            group_get_messages,
            group_invite,
            group_kick,
        ])
        .run(tauri::generate_context!())
        .expect("error while running yuai-gui");
}
