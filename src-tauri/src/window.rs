use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::Manager;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct WindowState {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub maximized: bool,
}

impl Default for WindowState {
    fn default() -> Self {
        Self {
            x: 100.0,
            y: 100.0,
            width: 1100.0,
            height: 720.0,
            maximized: false,
        }
    }
}

fn state_path(app: &tauri::AppHandle) -> PathBuf {
    let data_dir = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| PathBuf::from("."));
    let dir = data_dir.join("data");
    let _ = std::fs::create_dir_all(&dir);
    dir.join("window-state.json")
}

pub fn load_window_state(app: &tauri::AppHandle) -> WindowState {
    let path = state_path(app);
    match std::fs::read_to_string(&path) {
        Ok(content) => match serde_json::from_str::<WindowState>(&content) {
            Ok(state) => validate_state(state),
            Err(_) => WindowState::default(),
        },
        Err(_) => WindowState::default(),
    }
}

pub fn save_window_state(app: &tauri::AppHandle, state: &WindowState) {
    let path = state_path(app);
    if let Ok(json) = serde_json::to_string_pretty(state) {
        let _ = std::fs::write(path, json);
    }
}

fn validate_state(state: WindowState) -> WindowState {
    let mut s = state;
    // Min size 400x300
    if s.width < 400.0 {
        s.width = 400.0;
    }
    if s.height < 300.0 {
        s.height = 300.0;
    }
    // Basic on-screen check (rough bounds)
    if s.x < -100.0 || s.x > 4000.0 || s.y < -100.0 || s.y > 3000.0 {
        s.x = 100.0;
        s.y = 100.0;
    }
    s
}

/// Apply saved window state on startup
pub fn apply_window_state(app: &tauri::AppHandle) {
    let state = load_window_state(app);
    if let Some(window) = app.get_webview_window("main") {
        if state.maximized {
            let _ = window.maximize();
        } else {
            let _ = window.set_size(tauri::Size::Physical(tauri::PhysicalSize {
                width: state.width as u32,
                height: state.height as u32,
            }));
            let _ = window.set_position(tauri::Position::Physical(tauri::PhysicalPosition {
                x: state.x as i32,
                y: state.y as i32,
            }));
        }
    }
}
