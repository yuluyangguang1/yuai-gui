use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ═══════════════════════════════════════════
// Types — mirrors Hermes Studio write-gate API
// ═══════════════════════════════════════════

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PendingWriteRecord {
    pub id: String,
    pub subsystem: String, // "memory" | "skills"
    pub action: String,
    pub summary: String,
    pub origin: String,
    pub created_at: Option<f64>,
    #[serde(default)]
    pub payload: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PendingWriteReviewNote {
    #[serde(rename = "type")]
    pub note_type: String,
    #[serde(default)]
    pub target_label: Option<String>,
    #[serde(default)]
    pub skill_name: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PendingWriteReview {
    pub subsystem: String,
    pub target_label: String,
    pub language: String,
    pub current: String,
    pub proposed: String,
    pub diff: String,
    #[serde(default)]
    pub requested_old_string: Option<String>,
    #[serde(default)]
    pub payload_text: Option<String>,
    #[serde(default)]
    pub notes: Vec<PendingWriteReviewNote>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct PendingWritesResponse {
    pub records: Vec<PendingWriteRecord>,
    pub counts: HashMap<String, u32>,
    #[serde(default)]
    pub supported: Option<bool>,
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
pub async fn write_gate_list() -> Result<PendingWritesResponse, String> {
    let url = format!("{}/api/hermes/write-gate/pending", hermes_base_url());
    let client = hermes_client();
    let resp = client.get(&url).send().map_err(|e| e.to_string())?;
    let data: PendingWritesResponse = resp.json().map_err(|e| e.to_string())?;
    Ok(data)
}

#[tauri::command]
pub async fn write_gate_diff(subsystem: String, id: String) -> Result<PendingWriteReview, String> {
    let url = format!(
        "{}/api/hermes/write-gate/pending/{}/diff",
        hermes_base_url(), id
    );
    let client = hermes_client();
    let resp = client
        .get(&url)
        .query(&[("subsystem", &subsystem)])
        .send()
        .map_err(|e| e.to_string())?;

    // The API returns { diff, review? }
    let raw: serde_json::Value = resp.json().map_err(|e| e.to_string())?;

    if let Some(review) = raw.get("review") {
        let r: PendingWriteReview =
            serde_json::from_value(review.clone()).map_err(|e| e.to_string())?;
        return Ok(r);
    }

    // Fallback: construct review from diff
    let diff_text = raw
        .get("diff")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    Ok(PendingWriteReview {
        subsystem: subsystem.clone(),
        target_label: subsystem,
        language: String::new(),
        current: String::new(),
        proposed: diff_text.clone(),
        diff: diff_text,
        requested_old_string: None,
        payload_text: None,
        notes: vec![],
    })
}

#[tauri::command]
pub async fn write_gate_approve(subsystem: String, id: String) -> Result<String, String> {
    let url = format!(
        "{}/api/hermes/write-gate/pending/{}/approve",
        hermes_base_url(), id
    );
    let client = hermes_client();
    let resp = client
        .post(&url)
        .json(&serde_json::json!({ "subsystem": subsystem }))
        .send()
        .map_err(|e| e.to_string())?;
    let body: serde_json::Value = resp.json().map_err(|e| e.to_string())?;
    Ok(body
        .get("output")
        .and_then(|v| v.as_str())
        .unwrap_or("Approved")
        .to_string())
}

#[tauri::command]
pub async fn write_gate_reject(subsystem: String, id: String) -> Result<String, String> {
    let url = format!(
        "{}/api/hermes/write-gate/pending/{}/reject",
        hermes_base_url(), id
    );
    let client = hermes_client();
    let resp = client
        .post(&url)
        .json(&serde_json::json!({ "subsystem": subsystem }))
        .send()
        .map_err(|e| e.to_string())?;
    let body: serde_json::Value = resp.json().map_err(|e| e.to_string())?;
    Ok(body
        .get("output")
        .and_then(|v| v.as_str())
        .unwrap_or("Rejected")
        .to_string())
}
