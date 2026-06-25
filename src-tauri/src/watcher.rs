// ═══════════════════════════════════════════
// File Watcher — monitors workspace for changes (inspired by FanBox)
// ═══════════════════════════════════════════

use notify::{Event, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter};

/// A file-change event emitted to the frontend.
#[derive(Debug, Clone, Serialize)]
pub struct FileChangedEvent {
    pub path: String,
    pub kind: String, // "create" | "modify" | "delete"
}

/// Managed watcher state — holds the watcher handle and the watched path.
pub struct WatcherState {
    watcher: Option<RecommendedWatcher>,
    watched_path: Option<String>,
}

impl Default for WatcherState {
    fn default() -> Self {
        Self {
            watcher: None,
            watched_path: None,
        }
    }
}

/// Thread-safe wrapper.
pub type SharedWatcherState = Arc<Mutex<WatcherState>>;

pub fn new_watcher_state() -> SharedWatcherState {
    Arc::new(Mutex::new(WatcherState::default()))
}

/// Map a notify EventKind to a human-readable string.
fn kind_str(kind: &EventKind) -> &'static str {
    match kind {
        EventKind::Create(_) => "create",
        EventKind::Modify(_) => "modify",
        EventKind::Remove(_) => "delete",
        _ => "other",
    }
}

/// Filter out unwanted paths (node_modules, target, .git, dist, etc.)
fn should_ignore(path: &std::path::Path) -> bool {
    let components: Vec<_> = path.components().collect();
    for comp in &components {
        let s = comp.as_os_str().to_string_lossy();
        if matches!(
            s.as_ref(),
            "node_modules" | "target" | ".git" | "dist" | "build" | "__pycache__" | ".next" | ".cache"
        ) {
            return true;
        }
        if s.starts_with('.') && s.len() > 1 {
            // skip dotfiles/dotdirs except .env-type files at leaf level
            if s != ".env" {
                return true;
            }
        }
    }
    false
}

/// Start watching a directory.
#[tauri::command]
pub fn start_watcher(
    app: AppHandle,
    state: tauri::State<'_, SharedWatcherState>,
    path: String,
) -> Result<String, String> {
    let dir = PathBuf::from(&path);
    if !dir.is_dir() {
        return Err(format!("not a directory: {}", path));
    }

    let app_handle = app.clone();
    let closure_path = path.clone();

    // Create the watcher closure
    let watcher = RecommendedWatcher::new(
        move |result: Result<Event, notify::Error>| {
            let event = match result {
                Ok(e) => e,
                Err(e) => {
                    log::warn!("watcher error: {}", e);
                    return;
                }
            };

            // Filter out ignored paths
            let paths: Vec<PathBuf> = event
                .paths
                .iter()
                .filter(|p| !should_ignore(p))
                .cloned()
                .collect();

            if paths.is_empty() {
                return;
            }

            let kind = kind_str(&event.kind);

            for changed_path in paths {
                let path_str = changed_path.to_string_lossy().to_string();
                let payload = FileChangedEvent {
                    path: path_str,
                    kind: kind.to_string(),
                };
                if let Err(e) = app_handle.emit("file-changed", &payload) {
                    log::warn!("emit file-changed failed: {}", e);
                }
            }
        },
        notify::Config::default(),
    )
    .map_err(|e| format!("watcher init failed: {}", e))?;

    // Acquire lock, stop previous watcher if any, store new one
    let mut ws = state.lock().map_err(|e| e.to_string())?;
    ws.watcher = Some(watcher);
    ws.watched_path = Some(path.clone());

    // Start watching
    if let Some(ref mut w) = ws.watcher {
        w.watch(&dir, RecursiveMode::Recursive)
            .map_err(|e| format!("watch failed: {}", e))?;
    }

    log::info!("started watching: {}", path);
    Ok(format!("watching: {}", closure_path))
}

/// Stop watching.
#[tauri::command]
pub fn stop_watcher(
    state: tauri::State<'_, SharedWatcherState>,
) -> Result<String, String> {
    let mut ws = state.lock().map_err(|e| e.to_string())?;
    if ws.watcher.is_some() {
        ws.watcher = None;
        let old_path = ws.watched_path.take().unwrap_or_default();
        log::info!("stopped watching: {}", old_path);
        Ok(format!("stopped watching: {}", old_path))
    } else {
        Ok("no watcher active".into())
    }
}
