use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ═══════════════════════════════════════════
// Types — mirrors Hermes Studio kanban API
// ═══════════════════════════════════════════

pub type KanbanTaskStatus = String; // triage|todo|scheduled|ready|running|blocked|review|done|archived

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct KanbanTask {
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub body: Option<String>,
    #[serde(default)]
    pub assignee: Option<String>,
    pub status: KanbanTaskStatus,
    #[serde(default)]
    pub priority: i32,
    #[serde(default)]
    pub created_by: Option<String>,
    #[serde(default)]
    pub created_at: f64,
    #[serde(default)]
    pub started_at: Option<f64>,
    #[serde(default)]
    pub completed_at: Option<f64>,
    #[serde(default)]
    pub workspace_kind: String,
    #[serde(default)]
    pub workspace_path: Option<String>,
    #[serde(default)]
    pub tenant: Option<String>,
    #[serde(default)]
    pub result: Option<String>,
    #[serde(default)]
    pub skills: Option<Vec<String>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct KanbanBoard {
    pub slug: String,
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub icon: String,
    #[serde(default)]
    pub color: String,
    #[serde(default)]
    pub created_at: Option<f64>,
    #[serde(default)]
    pub archived: bool,
    #[serde(default)]
    pub counts: HashMap<String, u32>,
    #[serde(default)]
    pub total: u32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct KanbanStats {
    pub by_status: HashMap<String, u32>,
    pub by_assignee: HashMap<String, u32>,
    pub total: u32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct KanbanAssignee {
    pub name: String,
    pub on_disk: bool,
    #[serde(default)]
    pub counts: Option<HashMap<String, u32>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct KanbanComment {
    pub id: i64,
    pub task_id: String,
    pub author: String,
    pub body: String,
    pub created_at: f64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct KanbanEvent {
    pub id: i64,
    pub task_id: String,
    pub kind: String,
    #[serde(default)]
    pub payload: Option<HashMap<String, serde_json::Value>>,
    pub created_at: f64,
    #[serde(default)]
    pub run_id: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct KanbanRun {
    pub id: i64,
    pub task_id: String,
    #[serde(default)]
    pub profile: Option<String>,
    pub status: String,
    pub started_at: f64,
    #[serde(default)]
    pub ended_at: Option<f64>,
    #[serde(default)]
    pub outcome: Option<String>,
    #[serde(default)]
    pub summary: Option<String>,
    #[serde(default)]
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct KanbanTaskDetail {
    pub task: KanbanTask,
    #[serde(default)]
    pub comments: Vec<KanbanComment>,
    #[serde(default)]
    pub events: Vec<KanbanEvent>,
    #[serde(default)]
    pub runs: Vec<KanbanRun>,
}

// ═══════════════════════════════════════════
// Hermes Studio API helpers
// ═══════════════════════════════════════════

fn hermes_base_url() -> String {
    std::env::var("HERMES_STUDIO_URL")
        .unwrap_or_else(|_| "http://localhost:8648".to_string())
}

fn hermes_client() -> reqwest::blocking::Client {
    reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .unwrap_or_default()
}

// ═══════════════════════════════════════════
// Tauri Commands
// ═══════════════════════════════════════════

#[tauri::command]
pub async fn kanban_list_boards(include_archived: Option<bool>) -> Result<Vec<KanbanBoard>, String> {
    let mut url = format!("{}/api/hermes/kanban/boards", hermes_base_url());
    if include_archived.unwrap_or(false) {
        url.push_str("?includeArchived=true");
    }
    let client = hermes_client();
    let resp = client.get(&url).send().map_err(|e| e.to_string())?;
    let raw: serde_json::Value = resp.json().map_err(|e| e.to_string())?;
    let boards: Vec<KanbanBoard> = serde_json::from_value(
        raw.get("boards").cloned().unwrap_or(serde_json::Value::Array(vec![])),
    )
    .map_err(|e| e.to_string())?;
    Ok(boards)
}

#[tauri::command]
pub async fn kanban_list_tasks(
    board: Option<String>,
    status: Option<String>,
    assignee: Option<String>,
    include_archived: Option<bool>,
) -> Result<Vec<KanbanTask>, String> {
    let board_slug = board.unwrap_or_else(|| "default".to_string());
    let mut url = format!("{}/api/hermes/kanban?board={}", hermes_base_url(), board_slug);
    if let Some(s) = &status {
        url.push_str(&format!("&status={}", s));
    }
    if let Some(a) = &assignee {
        url.push_str(&format!("&assignee={}", a));
    }
    if include_archived.unwrap_or(false) {
        url.push_str("&includeArchived=true");
    }
    let client = hermes_client();
    let resp = client.get(&url).send().map_err(|e| e.to_string())?;
    let raw: serde_json::Value = resp.json().map_err(|e| e.to_string())?;
    let tasks: Vec<KanbanTask> = serde_json::from_value(
        raw.get("tasks").cloned().unwrap_or(serde_json::Value::Array(vec![])),
    )
    .map_err(|e| e.to_string())?;
    Ok(tasks)
}

#[tauri::command]
pub async fn kanban_get_task(task_id: String, board: Option<String>) -> Result<KanbanTaskDetail, String> {
    let board_slug = board.unwrap_or_else(|| "default".to_string());
    let url = format!(
        "{}/api/hermes/kanban/{}?board={}",
        hermes_base_url(),
        task_id,
        board_slug
    );
    let client = hermes_client();
    let resp = client.get(&url).send().map_err(|e| e.to_string())?;
    let detail: KanbanTaskDetail = resp.json().map_err(|e| e.to_string())?;
    Ok(detail)
}

#[tauri::command]
pub async fn kanban_get_stats(board: Option<String>) -> Result<KanbanStats, String> {
    let board_slug = board.unwrap_or_else(|| "default".to_string());
    let url = format!(
        "{}/api/hermes/kanban/stats?board={}",
        hermes_base_url(),
        board_slug
    );
    let client = hermes_client();
    let resp = client.get(&url).send().map_err(|e| e.to_string())?;
    let raw: serde_json::Value = resp.json().map_err(|e| e.to_string())?;
    let stats: KanbanStats = serde_json::from_value(
        raw.get("stats").cloned().unwrap_or(serde_json::Value::Null),
    )
    .map_err(|e| e.to_string())?;
    Ok(stats)
}

#[tauri::command]
pub async fn kanban_get_assignees(board: Option<String>) -> Result<Vec<KanbanAssignee>, String> {
    let board_slug = board.unwrap_or_else(|| "default".to_string());
    let url = format!(
        "{}/api/hermes/kanban/assignees?board={}",
        hermes_base_url(),
        board_slug
    );
    let client = hermes_client();
    let resp = client.get(&url).send().map_err(|e| e.to_string())?;
    let raw: serde_json::Value = resp.json().map_err(|e| e.to_string())?;
    let assignees: Vec<KanbanAssignee> = serde_json::from_value(
        raw.get("assignees")
            .cloned()
            .unwrap_or(serde_json::Value::Array(vec![])),
    )
    .map_err(|e| e.to_string())?;
    Ok(assignees)
}

#[derive(Debug, Deserialize)]
pub struct KanbanCreateRequest {
    pub title: String,
    #[serde(default)]
    pub body: Option<String>,
    #[serde(default)]
    pub assignee: Option<String>,
    #[serde(default)]
    pub priority: Option<i32>,
}

#[tauri::command]
pub async fn kanban_create_task(
    data: KanbanCreateRequest,
    board: Option<String>,
) -> Result<KanbanTask, String> {
    let board_slug = board.unwrap_or_else(|| "default".to_string());
    let url = format!("{}/api/hermes/kanban?board={}", hermes_base_url(), board_slug);
    let client = hermes_client();
    let mut body = serde_json::json!({ "title": data.title });
    if let Some(b) = &data.body {
        body["body"] = serde_json::Value::String(b.clone());
    }
    if let Some(a) = &data.assignee {
        body["assignee"] = serde_json::Value::String(a.clone());
    }
    if let Some(p) = data.priority {
        body["priority"] = serde_json::Value::Number(p.into());
    }
    let resp = client.post(&url).json(&body).send().map_err(|e| e.to_string())?;
    let raw: serde_json::Value = resp.json().map_err(|e| e.to_string())?;
    let task: KanbanTask = serde_json::from_value(
        raw.get("task").cloned().unwrap_or(serde_json::Value::Null),
    )
    .map_err(|e| e.to_string())?;
    Ok(task)
}

#[tauri::command]
pub async fn kanban_complete_tasks(
    task_ids: Vec<String>,
    summary: Option<String>,
    board: Option<String>,
) -> Result<(), String> {
    let board_slug = board.unwrap_or_else(|| "default".to_string());
    let url = format!(
        "{}/api/hermes/kanban/complete?board={}",
        hermes_base_url(),
        board_slug
    );
    let mut body = serde_json::json!({ "task_ids": task_ids });
    if let Some(s) = &summary {
        body["summary"] = serde_json::Value::String(s.clone());
    }
    let client = hermes_client();
    client.post(&url).json(&body).send().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn kanban_block_task(
    task_id: String,
    reason: String,
    board: Option<String>,
) -> Result<(), String> {
    let board_slug = board.unwrap_or_else(|| "default".to_string());
    let url = format!(
        "{}/api/hermes/kanban/{}/block?board={}",
        hermes_base_url(),
        task_id,
        board_slug
    );
    let client = hermes_client();
    client
        .post(&url)
        .json(&serde_json::json!({ "reason": reason }))
        .send()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn kanban_unblock_tasks(task_ids: Vec<String>, board: Option<String>) -> Result<(), String> {
    let board_slug = board.unwrap_or_else(|| "default".to_string());
    let url = format!(
        "{}/api/hermes/kanban/unblock?board={}",
        hermes_base_url(),
        board_slug
    );
    let client = hermes_client();
    client
        .post(&url)
        .json(&serde_json::json!({ "task_ids": task_ids }))
        .send()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn kanban_assign_task(
    task_id: String,
    profile: String,
    board: Option<String>,
) -> Result<(), String> {
    let board_slug = board.unwrap_or_else(|| "default".to_string());
    let url = format!(
        "{}/api/hermes/kanban/{}/assign?board={}",
        hermes_base_url(),
        task_id,
        board_slug
    );
    let client = hermes_client();
    client
        .post(&url)
        .json(&serde_json::json!({ "profile": profile }))
        .send()
        .map_err(|e| e.to_string())?;
    Ok(())
}
