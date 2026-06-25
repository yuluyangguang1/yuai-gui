// ═══════════════════════════════════════════
// Auto-Update Check — GitHub Releases API
// ═══════════════════════════════════════════

use serde::{Deserialize, Serialize};

const GITHUB_REPO: &str = "nousresearch/yuai-gui";

/// Update info returned to the frontend.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UpdateInfo {
    pub available: bool,
    pub current: String,
    pub latest: String,
    pub url: String,
}

/// Parse a semver string like "1.2.3" into (major, minor, patch).
fn parse_semver(v: &str) -> Option<(u64, u64, u64)> {
    let v = v.trim_start_matches('v');
    let parts: Vec<&str> = v.split('.').collect();
    if parts.len() < 3 {
        return None;
    }
    let major = parts[0].parse().ok()?;
    let minor = parts[1].parse().ok()?;
    let patch = parts[2].parse().ok()?;
    Some((major, minor, patch))
}

/// Compare two semver strings. Returns true if `latest` > `current`.
fn is_newer(current: &str, latest: &str) -> bool {
    let c = parse_semver(current);
    let l = parse_semver(latest);
    match (c, l) {
        (Some(c), Some(l)) => l > c,
        _ => false,
    }
}

/// Check GitHub releases API for the latest version.
#[tauri::command]
pub fn check_update() -> Result<UpdateInfo, String> {
    let current = env!("CARGO_PKG_VERSION").to_string();

    let url = format!(
        "https://api.github.com/repos/{}/releases/latest",
        GITHUB_REPO
    );

    // Use blocking reqwest
    let client = reqwest::blocking::Client::builder()
        .user_agent("yuai-gui-updater")
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("http client: {}", e))?;

    let resp = client
        .get(&url)
        .send()
        .map_err(|e| format!("http request: {}", e))?;

    if !resp.status().is_success() {
        return Ok(UpdateInfo {
            available: false,
            current: current.clone(),
            latest: current,
            url: String::new(),
        });
    }

    let body: serde_json::Value = resp.json().map_err(|e| format!("json parse: {}", e))?;

    let tag = body
        .get("tag_name")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    let html_url = body
        .get("html_url")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    let available = is_newer(&current, &tag);

    Ok(UpdateInfo {
        available,
        current,
        latest: tag,
        url: html_url,
    })
}
