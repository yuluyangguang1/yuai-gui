use serde::{Deserialize, Serialize};
use tauri::Manager;

mod agents;
mod bus;
mod chat_db;
mod commands;
mod config;
mod context;
mod disk;
mod files;
mod git;
mod pty;
mod recording;
mod screenshot;
mod thumbnail;
mod updater;
mod watcher;
mod window;

// ═══════════════════════════════════════════
// Shared Types
// ═══════════════════════════════════════════

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
// Agent & Config Helper Commands
// ═══════════════════════════════════════════

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
        .manage(pty::AppState::default())
        .manage(bus::new_group_chat())
        .manage(watcher::new_watcher_state())
        .manage(context::new_context_manager())
        .manage(recording::RecordingState::default())
        .manage(screenshot::ScreenshotState::default())
        .setup(|app| {
            // Apply saved window state
            window::apply_window_state(app.handle());

            // Start screenshot watcher
            screenshot::start_screenshot_watcher(app.handle().clone());

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                let state = window.state::<pty::AppState>();
                let rec_state = window.state::<recording::RecordingState>();
                // Stop all recordings before cleanup
                let sessions = state.sessions.read().unwrap();
                for id in sessions.keys() {
                    recording::stop_recording(&rec_state, *id);
                }
                drop(sessions);
                pty::cleanup_all_sessions(&state);
            }
            // Save window state on move/resize with debounce
            if matches!(
                event,
                tauri::WindowEvent::Moved(_) | tauri::WindowEvent::Resized(_)
            ) {
                if let Ok(pos) = window.outer_position() {
                    if let Ok(size) = window.outer_size() {
                        let maximized = window.is_maximized().unwrap_or(false);
                        let ws = window::WindowState {
                            x: pos.x as f64,
                            y: pos.y as f64,
                            width: size.width as f64,
                            height: size.height as f64,
                            maximized,
                        };
                        let app = window.app_handle().clone();
                        // Debounce: save after 400ms of no further events
                        std::thread::spawn(move || {
                            std::thread::sleep(std::time::Duration::from_millis(400));
                            window::save_window_state(&app, &ws);
                        });
                    }
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            pty::pty_spawn,
            pty::pty_write,
            pty::pty_resize,
            pty::pty_kill,
            pty::spawn_agent,
            pty::pty_cwd,
            list_agents,
            get_bundle_root,
            get_providers,
            save_provider,
            get_active_provider,
            files::read_dir_tree,
            files::read_file_content,
            files::list_dir,
            files::read_text_file,
            files::get_home_dir,
            files::copy_file_to_workspace,
            files::write_file_content,
            thumbnail::get_thumbnail,
            git::get_git_diff,
            git::get_changed_files,
            git::revert_file,
            git::accept_file,
            chat_db::save_chat_message,
            chat_db::load_chat_history,
            commands::group_send,
            commands::group_next_speaker,
            commands::group_agent_response,
            commands::group_build_prompt,
            commands::group_confirm_exec,
            commands::group_next_executor,
            commands::group_get_phase,
            commands::group_get_messages,
            commands::group_invite,
            commands::group_kick,
            commands::group_check_convergence,
            watcher::start_watcher,
            watcher::stop_watcher,
            context::compress_context,
            context::store_compressed_summary,
            context::get_context_prefix,
            recording::list_recordings,
            recording::read_recording,
            recording::delete_recording,
            updater::check_update,
            disk::get_disk_usage,
        ])
        .run(tauri::generate_context!())
        .expect("error while running yuai-gui");
}
