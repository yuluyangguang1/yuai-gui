use std::path::{Path, PathBuf};
use std::process::Command;
use serde::{Deserialize, Serialize};
use tauri::Manager;

mod tools;
mod config;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ToolStatus {
    pub id: String,
    pub display_name: String,
    pub glyph: String,
    pub motto: String,
    pub binary_present: bool,
    pub configured: bool,
    pub version: Option<String>,
}

/// Resolve the bundle root directory.
/// In dev: the parent of src-tauri/ (i.e. project root). 
/// In release: the directory of the executable.
fn bundle_root(app: &tauri::AppHandle) -> PathBuf {
    if let Ok(exe) = std::env::current_exe() {
        if let Some(p) = exe.parent() {
            return p.to_path_buf();
        }
    }
    app.path().resource_dir().unwrap_or_else(|_| PathBuf::from("."))
}

#[tauri::command]
fn list_tools(app: tauri::AppHandle) -> Result<Vec<ToolStatus>, String> {
    let root = bundle_root(&app);
    Ok(tools::all_tools()
        .into_iter()
        .map(|t| {
            let bin = t.resolve_binary(&root);
            let configured = config::is_tool_configured(&t.id, &root);
            ToolStatus {
                id: t.id.to_string(),
                display_name: t.display_name.to_string(),
                glyph: t.glyph.to_string(),
                motto: t.motto.to_string(),
                binary_present: bin.as_ref().map(|p| p.exists()).unwrap_or(false),
                configured,
                version: None,
            }
        })
        .collect())
}

#[tauri::command]
fn launch_tool(app: tauri::AppHandle, tool_id: String) -> Result<String, String> {
    let root = bundle_root(&app);
    let tool = tools::all_tools()
        .into_iter()
        .find(|t| t.id == tool_id)
        .ok_or_else(|| format!("unknown tool: {}", tool_id))?;

    let bin = tool
        .resolve_binary(&root)
        .ok_or_else(|| format!("no binary path for {}", tool_id))?;

    if !bin.exists() {
        return Err(format!("binary not found: {}", bin.display()));
    }

    spawn_in_terminal(&bin, &root, &tool_id).map_err(|e| e.to_string())
}

#[tauri::command]
fn launch_cc_switch(app: tauri::AppHandle) -> Result<String, String> {
    let root = bundle_root(&app);
    let bin = tools::cc_switch_path(&root)
        .ok_or_else(|| "cc-switch binary not found".to_string())?;
    if !bin.exists() {
        return Err(format!("cc-switch not found: {}", bin.display()));
    }

    // cc-switch is a GUI app — just spawn it directly
    Command::new(&bin)
        .current_dir(&root)
        .spawn()
        .map_err(|e| format!("failed to spawn cc-switch: {}", e))?;

    Ok(format!("cc-switch launched: {}", bin.display()))
}

#[tauri::command]
fn open_data_dir(app: tauri::AppHandle) -> Result<(), String> {
    let root = bundle_root(&app);
    let data = root.join("data");
    std::fs::create_dir_all(&data).map_err(|e| e.to_string())?;
    open_in_file_manager(&data).map_err(|e| e.to_string())
}

#[cfg(target_os = "windows")]
fn spawn_in_terminal(bin: &Path, cwd: &Path, _tool_id: &str) -> std::io::Result<String> {
    // cmd /k keeps the window open after the program exits so users can read errors
    Command::new("cmd")
        .args(["/c", "start", "", "cmd", "/k"])
        .arg(bin)
        .current_dir(cwd)
        .spawn()?;
    Ok(format!("launched in terminal: {}", bin.display()))
}

#[cfg(target_os = "macos")]
fn spawn_in_terminal(bin: &Path, _cwd: &Path, _tool_id: &str) -> std::io::Result<String> {
    Command::new("open")
        .args(["-a", "Terminal"])
        .arg(bin)
        .spawn()?;
    Ok(format!("launched in terminal: {}", bin.display()))
}

#[cfg(target_os = "linux")]
fn spawn_in_terminal(bin: &Path, cwd: &Path, _tool_id: &str) -> std::io::Result<String> {
    let bin_str = bin.to_string_lossy().to_string();
    // Try common terminals in order
    for term in &["x-terminal-emulator", "gnome-terminal", "konsole", "xterm"] {
        if Command::new("which").arg(term).output().map(|o| o.status.success()).unwrap_or(false) {
            Command::new(term)
                .arg("-e")
                .arg(format!("bash -c '{}; exec bash'", bin_str.replace('\'', "'\\''")))
                .current_dir(cwd)
                .spawn()?;
            return Ok(format!("launched in {}: {}", term, bin_str));
        }
    }
    Err(std::io::Error::new(std::io::ErrorKind::NotFound, "no terminal emulator found"))
}

#[cfg(target_os = "windows")]
fn open_in_file_manager(path: &Path) -> std::io::Result<()> {
    Command::new("explorer").arg(path).spawn()?;
    Ok(())
}

#[cfg(target_os = "macos")]
fn open_in_file_manager(path: &Path) -> std::io::Result<()> {
    Command::new("open").arg(path).spawn()?;
    Ok(())
}

#[cfg(target_os = "linux")]
fn open_in_file_manager(path: &Path) -> std::io::Result<()> {
    Command::new("xdg-open").arg(path).spawn()?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            list_tools,
            launch_tool,
            launch_cc_switch,
            open_data_dir
        ])
        .run(tauri::generate_context!())
        .expect("error while running yuai-gui");
}
