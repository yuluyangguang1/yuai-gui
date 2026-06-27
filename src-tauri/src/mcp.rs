use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ═══════════════════════════════════════════
// Types — mirrors Hermes Studio MCP API
// ═══════════════════════════════════════════

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct McpServerInfo {
    pub name: String,
    pub transport: String,
    pub connected: bool,
    #[serde(default)]
    pub tools: u32,
    #[serde(default)]
    pub tools_registered: u32,
    #[serde(default)]
    pub tool_names: Vec<String>,
    #[serde(default)]
    pub tool_names_registered: Vec<String>,
    #[serde(default)]
    pub error: Option<String>,
    #[serde(default)]
    pub command: Option<String>,
    #[serde(default)]
    pub args: Option<Vec<String>>,
    #[serde(default)]
    pub url: Option<String>,
    #[serde(default)]
    pub env: Option<HashMap<String, String>>,
    #[serde(default)]
    pub headers: Option<HashMap<String, String>>,
    #[serde(default)]
    pub tools_config: Option<serde_json::Value>,
    #[serde(default)]
    pub prompts: Option<bool>,
    #[serde(default)]
    pub resources: Option<bool>,
    #[serde(default)]
    pub enabled: Option<bool>,
    #[serde(default)]
    pub raw_config: Option<serde_json::Value>,
    #[serde(default)]
    pub tool_details: Option<Vec<McpToolInfo>>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct McpToolInfo {
    pub name: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub input_schema: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct McpServersResponse {
    pub servers: Vec<McpServerInfo>,
    #[serde(default)]
    pub total_tools: u32,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct McpToolsResponse {
    #[serde(default)]
    pub ok: bool,
    #[serde(default)]
    pub results: Vec<McpToolResult>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct McpToolResult {
    pub server: String,
    pub tools: Vec<McpToolInfo>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct McpActionResponse {
    pub ok: bool,
    #[serde(default)]
    pub error: Option<String>,
    #[serde(default)]
    pub tools: Option<Vec<String>>,
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
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .unwrap_or_default()
}

// ═══════════════════════════════════════════
// Tauri Commands
// ═══════════════════════════════════════════

#[tauri::command]
pub async fn mcp_list_servers() -> Result<McpServersResponse, String> {
    let url = format!("{}/api/hermes/mcp/servers", hermes_base_url());
    let client = hermes_client();
    let resp = client.get(&url).send().map_err(|e| e.to_string())?;
    let data: McpServersResponse = resp.json().map_err(|e| e.to_string())?;
    Ok(data)
}

#[tauri::command]
pub async fn mcp_list_tools(server: Option<String>) -> Result<McpToolsResponse, String> {
    let mut url = format!("{}/api/hermes/mcp/tools", hermes_base_url());
    if let Some(s) = &server {
        url.push_str(&format!("?server={}", s));
    }
    let client = hermes_client();
    let resp = client.get(&url).send().map_err(|e| e.to_string())?;
    let data: McpToolsResponse = resp.json().map_err(|e| e.to_string())?;
    Ok(data)
}

#[tauri::command]
pub async fn mcp_add_server(name: String, config: serde_json::Value) -> Result<McpActionResponse, String> {
    let url = format!("{}/api/hermes/mcp/servers", hermes_base_url());
    let client = hermes_client();
    let body = serde_json::json!({ "name": name, "config": config });
    let resp = client.post(&url).json(&body).send().map_err(|e| e.to_string())?;
    let data: McpActionResponse = resp.json().map_err(|e| e.to_string())?;
    Ok(data)
}

#[tauri::command]
pub async fn mcp_update_server(name: String, config: serde_json::Value) -> Result<McpActionResponse, String> {
    let url = format!(
        "{}/api/hermes/mcp/servers/{}",
        hermes_base_url(),
        name
    );
    let client = hermes_client();
    let resp = client
        .patch(&url)
        .json(&config)
        .send()
        .map_err(|e| e.to_string())?;
    let data: McpActionResponse = resp.json().map_err(|e| e.to_string())?;
    Ok(data)
}

#[tauri::command]
pub async fn mcp_remove_server(name: String) -> Result<McpActionResponse, String> {
    let url = format!(
        "{}/api/hermes/mcp/servers/{}",
        hermes_base_url(),
        name
    );
    let client = hermes_client();
    let resp = client.delete(&url).send().map_err(|e| e.to_string())?;
    let data: McpActionResponse = resp.json().map_err(|e| e.to_string())?;
    Ok(data)
}

#[tauri::command]
pub async fn mcp_test_server(name: String) -> Result<McpActionResponse, String> {
    let url = format!(
        "{}/api/hermes/mcp/servers/{}/test",
        hermes_base_url(),
        name
    );
    let client = hermes_client();
    let resp = client.post(&url).send().map_err(|e| e.to_string())?;
    let data: McpActionResponse = resp.json().map_err(|e| e.to_string())?;
    Ok(data)
}

#[tauri::command]
pub async fn mcp_reload(server: Option<String>) -> Result<McpActionResponse, String> {
    let mut url = format!("{}/api/hermes/mcp/reload", hermes_base_url());
    if let Some(s) = &server {
        url.push_str(&format!("?server={}", s));
    }
    let client = hermes_client();
    let resp = client.post(&url).send().map_err(|e| e.to_string())?;
    let data: McpActionResponse = resp.json().map_err(|e| e.to_string())?;
    Ok(data)
}
