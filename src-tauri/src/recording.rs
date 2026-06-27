// ═══════════════════════════════════════════
// Terminal Recording — asciinema v2 .cast format
// ═══════════════════════════════════════════

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::Write;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::Instant;

const MAX_RECORDINGS: usize = 60;

/// An active recording session — holds a file handle and timing state.
pub struct Recording {
    file: std::fs::File,
    #[allow(dead_code)]
    start: Instant,
    #[allow(dead_code)]
    width: u16,
    #[allow(dead_code)]
    height: u16,
}

/// Shared state managed by Tauri — all active recordings keyed by session id.
#[derive(Default)]
pub struct RecordingState {
    pub active: Mutex<HashMap<u32, Arc<Mutex<Recording>>>>,
}

/// Recording metadata returned to the frontend.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RecordingInfo {
    pub path: String,
    pub timestamp: String,
    pub duration: f64,
    pub session_id: String,
}

// ── Helpers ──────────────────────────────────────────────

fn recordings_dir() -> PathBuf {
    let base = dirs::data_dir()
        .or_else(dirs::home_dir)
        .unwrap_or_else(|| PathBuf::from("."));
    base.join("yuai-gui").join("recordings")
}

/// Prune oldest recordings if count exceeds MAX_RECORDINGS.
fn prune_recordings() {
    let dir = recordings_dir();
    let _ = std::fs::create_dir_all(&dir);
    let mut entries: Vec<_> = std::fs::read_dir(&dir)
        .into_iter()
        .flatten()
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.path()
                .extension()
                .map(|ext| ext == "cast")
                .unwrap_or(false)
        })
        .collect();
    if entries.len() <= MAX_RECORDINGS {
        return;
    }
    entries.sort_by_key(|e| e.file_name());
    let to_remove = entries.len() - MAX_RECORDINGS;
    for entry in entries.iter().take(to_remove) {
        let _ = std::fs::remove_file(entry.path());
    }
}

/// Start a new recording for a PTY session.
pub fn start_recording(state: &RecordingState, session_id: u32, width: u16, height: u16) {
    prune_recordings();

    let dir = recordings_dir();
    let _ = std::fs::create_dir_all(&dir);

    let ts = chrono_timestamp();
    let filename = format!("{}-{}.cast", ts, session_id);
    let path = dir.join(&filename);

    let file = match std::fs::File::create(&path) {
        Ok(f) => f,
        Err(e) => {
            log::error!("recording: failed to create {}: {}", path.display(), e);
            return;
        }
    };

    let mut recording = Recording {
        file,
        start: Instant::now(),
        width,
        height,
    };

    // Write asciinema v2 header
    let header = serde_json::json!({
        "version": 2,
        "width": width,
        "height": height,
        "timestamp": ts,
        "env": { "TERM": "xterm-256color" }
    });
    let _ = writeln!(recording.file, "{}", header);

    let arc = Arc::new(Mutex::new(recording));
    state
        .active
        .lock()
        .unwrap()
        .insert(session_id, arc);
    log::info!(
        "recording started: session={} {}x{} -> {}",
        session_id,
        width,
        height,
        path.display()
    );
}

/// Stop recording for a session — flushes and closes the file.
pub fn stop_recording(state: &RecordingState, session_id: u32) {
    if let Some(rec) = state.active.lock().unwrap().remove(&session_id) {
        if let Ok(mut r) = rec.lock() {
            let _ = r.file.flush();
        }
        log::info!("recording stopped: session={}", session_id);
    }
}

fn chrono_timestamp() -> String {
    use std::time::SystemTime;
    let dur = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default();
    format!("{}", dur.as_secs())
}

// ═══════════════════════════════════════════
// Tauri Commands
// ═══════════════════════════════════════════

/// List all .cast files with metadata.
#[tauri::command]
pub fn list_recordings() -> Result<Vec<RecordingInfo>, String> {
    let dir = recordings_dir();
    if !dir.exists() {
        return Ok(vec![]);
    }
    let mut results = Vec::new();
    for entry in std::fs::read_dir(&dir)
        .map_err(|e| e.to_string())?
        .flatten()
    {
        let path = entry.path();
        if path.extension().map(|e| e == "cast").unwrap_or(false) {
            let fname = path
                .file_stem()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();
            // Parse: <timestamp>-<sessionId>
            let parts: Vec<&str> = fname.splitn(2, '-').collect();
            let timestamp = parts.first().unwrap_or(&"").to_string();
            let session_id = parts.get(1).unwrap_or(&"unknown").to_string();

            // Compute duration by scanning the file
            let duration = compute_cast_duration(&path);

            results.push(RecordingInfo {
                path: path.to_string_lossy().to_string(),
                timestamp,
                duration,
                session_id,
            });
        }
    }
    // Sort newest first
    results.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    Ok(results)
}

/// Read the raw content of a .cast file.
#[tauri::command]
pub fn read_recording(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("read recording {}: {}", path, e))
}

/// Delete a recording file.
#[tauri::command]
pub fn delete_recording(path: String) -> Result<(), String> {
    std::fs::remove_file(&path).map_err(|e| format!("delete {}: {}", path, e))
}

fn compute_cast_duration(path: &PathBuf) -> f64 {
    let content = match std::fs::read_to_string(path) {
        Ok(c) => c,
        Err(_) => return 0.0,
    };
    let mut last_ts = 0.0f64;
    for line in content.lines().skip(1) {
        // skip header
        if let Ok(arr) = serde_json::from_str::<serde_json::Value>(line) {
            if let Some(ts) = arr.get(0).and_then(|v| v.as_f64()) {
                last_ts = ts;
            }
        }
    }
    last_ts
}
