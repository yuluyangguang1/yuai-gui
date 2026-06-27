use serde::Serialize;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};

// ═══════════════════════════════════════════
// Screenshot Detection
// ═══════════════════════════════════════════

#[derive(Debug, Serialize, Clone)]
pub struct ScreenshotInfo {
    pub path: String,
    pub name: String,
    pub size: u64,
}

/// State for deduplicating screenshot events.
pub struct ScreenshotState {
    /// Recently emitted paths (path + timestamp) to avoid duplicate events within 3s.
    recent: Arc<Mutex<Vec<(String, Instant)>>>,
}

impl Default for ScreenshotState {
    fn default() -> Self {
        Self {
            recent: Arc::new(Mutex::new(Vec::new())),
        }
    }
}

impl ScreenshotState {
    // is_duplicate was here but was unused — dedup is done inline in the watcher thread
}

/// Get the macOS screenshot directory from system preferences.
#[cfg(target_os = "macos")]
fn get_screenshot_dir() -> PathBuf {
    // Try reading the macOS screencapture location preference
    let output = std::process::Command::new("defaults")
        .args(["read", "com.apple.screencapture", "location"])
        .output();

    match output {
        Ok(o) if o.status.success() => {
            let path_str = String::from_utf8_lossy(&o.stdout).trim().to_string();
            if path_str.is_empty() {
                default_desktop()
            } else {
                // Expand ~ if present
                if path_str.starts_with("~/") {
                    if let Some(home) = dirs::home_dir() {
                        home.join(path_str.strip_prefix("~/").unwrap_or(&path_str))
                    } else {
                        PathBuf::from(path_str)
                    }
                } else {
                    PathBuf::from(path_str)
                }
            }
        }
        _ => default_desktop(),
    }
}

fn default_desktop() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(std::env::temp_dir)
        .join("Desktop")
}

/// Get the Windows screenshot directory: Pictures/Screenshots
#[cfg(target_os = "windows")]
fn get_screenshot_dir() -> PathBuf {
    dirs::picture_dir()
        .unwrap_or_else(|| dirs::desktop_dir().unwrap_or_else(std::env::temp_dir))
        .join("Screenshots")
}

/// Get the Linux screenshot directory: Desktop
#[cfg(target_os = "linux")]
fn get_screenshot_dir() -> PathBuf {
    dirs::desktop_dir().unwrap_or_else(std::env::temp_dir)
}

/// Fallback for unsupported platforms
#[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
fn get_screenshot_dir() -> PathBuf {
    dirs::desktop_dir().unwrap_or_else(std::env::temp_dir)
}

/// Check if a filename matches known screenshot patterns.
fn is_screenshot_file(name: &str) -> bool {
    let lower = name.to_lowercase();
    lower.starts_with("截屏")
        || lower.starts_with("screenshot")
        || lower.starts_with("cleanshot")
        || lower.starts_with("scr-")
        || lower.starts_with("屏幕截图")
        || lower.starts_with("screenshot (")
}

/// Get file size, returns None if file can't be stat'd.
fn file_size(path: &std::path::Path) -> Option<u64> {
    std::fs::metadata(path).ok().map(|m| m.len())
}

/// Start watching the screenshot directory. Spawns a background thread.
pub fn start_screenshot_watcher(app: AppHandle) {
    let screenshot_dir = get_screenshot_dir();
    log::info!("Watching screenshot directory: {:?}", screenshot_dir);

    if !screenshot_dir.exists() {
        log::warn!("Screenshot directory does not exist: {:?}", screenshot_dir);
        return;
    }

    use notify::{Event, EventKind, RecursiveMode, Watcher};
    use std::sync::mpsc;

    let (tx, rx) = mpsc::channel::<notify::Result<Event>>();

    let mut watcher = match notify::recommended_watcher(tx) {
        Ok(w) => w,
        Err(e) => {
            log::error!("Failed to create screenshot watcher: {}", e);
            return;
        }
    };

    if let Err(e) = watcher.watch(&screenshot_dir, RecursiveMode::NonRecursive) {
        log::error!("Failed to watch screenshot dir: {}", e);
        return;
    }

    // Keep watcher alive by leaking it (lives for app lifetime)
    // This is intentional - the watcher should live as long as the app
    std::mem::forget(watcher);

    let state = app.state::<ScreenshotState>();
    let recent = state.recent.clone();

    // We need to keep the watcher thread alive
    let recent_clone = recent;
    std::thread::spawn(move || {
        while let Ok(event_result) = rx.recv() {
            if let Ok(event) = event_result {
                if !matches!(event.kind, EventKind::Create(_)) {
                    continue;
                }
                for path_buf in &event.paths {
                    let path = path_buf.clone();
                    let name = path
                        .file_name()
                        .map(|n| n.to_string_lossy().to_string())
                        .unwrap_or_default();

                    if !is_screenshot_file(&name) {
                        continue;
                    }

                    // Clone what we need for the stabilization thread
                    let app_clone = app.clone();
                    let recent_inner = recent_clone.clone();
                    let path_str = path.to_string_lossy().to_string();

                    // Wait for file size to stabilize (poll until unchanged twice)
                    std::thread::spawn(move || {
                        let mut last_size: Option<u64> = None;
                        let mut stable_count = 0;

                        for _ in 0..30 {
                            // Max 15 seconds
                            std::thread::sleep(Duration::from_millis(500));
                            let current = file_size(&path);
                            match (current, last_size) {
                                (Some(c), Some(l)) if c == l && c > 0 => {
                                    stable_count += 1;
                                    if stable_count >= 2 {
                                        break;
                                    }
                                }
                                _ => {
                                    stable_count = 0;
                                }
                            }
                            last_size = current;
                        }

                        let size = file_size(&path).unwrap_or(0);
                        if size == 0 {
                            return;
                        }

                        // Deduplicate
                        {
                            let mut recent = recent_inner.lock().unwrap();
                            let now = Instant::now();
                            recent.retain(|(_, t)| now.duration_since(*t) < Duration::from_secs(3));
                            if recent.iter().any(|(p, _)| *p == path_str) {
                                return;
                            }
                            recent.push((path_str.clone(), now));
                        }

                        let info = ScreenshotInfo {
                            path: path_str,
                            name,
                            size,
                        };

                        if let Err(e) = app_clone.emit("screenshot-detected", &info) {
                            log::error!("Failed to emit screenshot-detected: {}", e);
                        }
                    });
                }
            }
        }
    });
}
