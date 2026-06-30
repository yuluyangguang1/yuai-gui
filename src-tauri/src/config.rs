// Configuration management — reads/writes cc-switch DB for provider info.

use std::path::Path;
use rusqlite::{Connection, OpenFlags, params};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProviderConfig {
    pub id: String,
    pub app_type: String,
    pub name: String,
    pub base_url: String,
    pub api_key: String,
    pub model: String,
    pub is_current: bool,
}

/// Get the cc-switch DB path.
pub fn db_path(root: &Path) -> std::path::PathBuf {
    root.join("data").join(".cc-switch").join("cc-switch.db")
}

/// Ensure the data directories and DB exist.
pub fn ensure_db(root: &Path) -> Result<(), String> {
    let dir = root.join("data").join(".cc-switch");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let path = db_path(root);
    if !path.exists() {
        let conn = Connection::open(&path).map_err(|e| e.to_string())?;
        conn.execute_batch(
            "CREATE TABLE IF NOT EXISTS providers (
                id TEXT PRIMARY KEY,
                app_type TEXT NOT NULL,
                name TEXT NOT NULL,
                settings_config TEXT NOT NULL DEFAULT '{}',
                is_current BOOLEAN NOT NULL DEFAULT 0,
                sort_index INTEGER DEFAULT 0,
                created_at INTEGER DEFAULT 0
            );"
        ).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// List all providers for a given app_type.
pub fn list_providers(root: &Path, app_type: &str) -> Result<Vec<ProviderConfig>, String> {
    let path = db_path(root);
    if !path.exists() {
        return Ok(vec![]);
    }

    let conn = Connection::open_with_flags(&path, OpenFlags::SQLITE_OPEN_READ_ONLY)
        .map_err(|e| e.to_string())?;

    let mut stmt = conn.prepare(
        "SELECT id, app_type, name, settings_config, is_current FROM providers WHERE app_type = ?1"
    ).map_err(|e| e.to_string())?;

    let rows = stmt.query_map(params![app_type], |row| {
        let id: String = row.get(0)?;
        let app_type: String = row.get(1)?;
        let name: String = row.get(2)?;
        let settings_json: String = row.get(3)?;
        let is_current: bool = row.get(4)?;

        // Parse settings_config to extract base_url and api_key
        let (base_url, api_key, model) = parse_settings(&app_type, &settings_json);

        Ok(ProviderConfig { id, app_type, name, base_url, api_key, model, is_current })
    }).map_err(|e| e.to_string())?;

    let mut providers = Vec::new();
    for row in rows {
        if let Ok(p) = row {
            providers.push(p);
        }
    }
    Ok(providers)
}

/// Save or update a provider.
pub fn save_provider(root: &Path, config: &ProviderConfig) -> Result<(), String> {
    ensure_db(root)?;
    let path = db_path(root);
    let conn = Connection::open(&path).map_err(|e| e.to_string())?;
    // Normalize base_url based on config type
    let normalized_url = normalize_url(&config.app_type, &config.base_url);

    let settings_json = build_settings(&config.app_type, &normalized_url, &config.api_key, &config.model);

    // If is_current, unset all others first
    if config.is_current {
        conn.execute(
            "UPDATE providers SET is_current = 0 WHERE app_type = ?1",
            params![config.app_type],
        ).map_err(|e| e.to_string())?;
    }

    conn.execute(
        "INSERT OR REPLACE INTO providers (id, app_type, name, settings_config, is_current, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, strftime('%s','now'))",
        params![config.id, config.app_type, config.name, settings_json, config.is_current],
    ).map_err(|e| e.to_string())?;

    Ok(())
}

/// Get the active provider for an app_type.
pub fn get_active_provider(root: &Path, app_type: &str) -> Result<Option<ProviderConfig>, String> {
    let providers = list_providers(root, app_type)?;
    Ok(providers.into_iter().find(|p| p.is_current))
}

// ─── Internal helpers ───

/// Normalize base_url based on config type.
/// - anthropic_env: strip trailing /v1 (Anthropic SDK doesn't want it)
/// - openai_env / codex / others: ensure trailing /v1
pub fn normalize_url(app_type: &str, base_url: &str) -> String {
    let url = base_url.trim_end_matches('/');
    match app_type {
        "claude" => {
            // Anthropic: strip trailing /v1
            url.strip_suffix("/v1").unwrap_or(url).to_string()
        }
        _ => {
            // OpenAI-compatible: ensure trailing /v1
            if url.ends_with("/v1") {
                url.to_string()
            } else if url.is_empty() {
                String::new()
            } else {
                format!("{}/v1", url)
            }
        }
    }
}

fn decrypt_key(raw: &str) -> String {
    if raw.is_empty() {
        return raw.to_string();
    }
    // Try to decrypt; if it fails (e.g. old plaintext key), return as-is
    crate::secure::unseal(raw).unwrap_or_else(|_| raw.to_string())
}

fn parse_settings(app_type: &str, json_str: &str) -> (String, String, String) {
    let val: serde_json::Value = serde_json::from_str(json_str).unwrap_or_default();

    match app_type {
        "claude" => {
            let env = val.get("env").and_then(|e| e.as_object());
            if let Some(env) = env {
                let url = env.get("ANTHROPIC_BASE_URL").and_then(|v| v.as_str()).unwrap_or("").to_string();
                let key = env.get("ANTHROPIC_AUTH_TOKEN").and_then(|v| v.as_str())
                    .or_else(|| env.get("ANTHROPIC_API_KEY").and_then(|v| v.as_str()))
                    .unwrap_or("").to_string();
                let key = decrypt_key(&key);
                let model = env.get("ANTHROPIC_MODEL").and_then(|v| v.as_str()).unwrap_or("claude-sonnet-4").to_string();
                return (url, key, model);
            }
        }
        "codex" | "openai" => {
            let auth = val.get("auth");
            if let Some(auth) = auth {
                let key = auth.get("OPENAI_API_KEY").and_then(|v| v.as_str()).unwrap_or("").to_string();
                let config_str = val.get("config").and_then(|v| v.as_str()).unwrap_or("");
                // Extract base_url from TOML config string
                let url = config_str.lines()
                    .find(|l| l.contains("base_url"))
                    .and_then(|l| l.split('"').nth(1))
                    .unwrap_or("https://api.openai.com/v1")
                    .to_string();
                let model = config_str.lines()
                    .find(|l| l.trim().starts_with("model") && !l.contains("model_provider") && !l.contains("model_providers"))
                    .and_then(|l| l.split('"').nth(1))
                    .unwrap_or("gpt-5.4")
                    .to_string();
                return (url, key, model);
            }
        }
        _ => {
            // Generic: try env.OPENAI_BASE_URL / OPENAI_API_KEY
            let env = val.get("env").and_then(|e| e.as_object());
            if let Some(env) = env {
                let url = env.get("OPENAI_BASE_URL").and_then(|v| v.as_str()).unwrap_or("").to_string();
                let key = env.get("OPENAI_API_KEY").and_then(|v| v.as_str()).unwrap_or("").to_string();
                let key = decrypt_key(&key);
                let model = env.get("OPENAI_MODEL").and_then(|v| v.as_str()).unwrap_or("").to_string();
                return (url, key, model);
            }
        }
    }

    (String::new(), String::new(), String::new())
}

fn build_settings(app_type: &str, base_url: &str, api_key: &str, model: &str) -> String {
    // Encrypt API key before storing
    let encrypted_key = crate::secure::seal(api_key).unwrap_or_else(|_| api_key.to_string());
    match app_type {
        "claude" => {
            serde_json::json!({
                "env": {
                    "ANTHROPIC_BASE_URL": base_url,
                    "ANTHROPIC_API_KEY": encrypted_key,
                    "ANTHROPIC_MODEL": model
                }
            }).to_string()
        }
        "codex" | "openai" => {
            let config_toml = format!(
                "model_provider = \"custom\"\nmodel = \"{}\"\n\n[model_providers.custom]\nname = \"Custom\"\nbase_url = \"{}\"\nwire_api = \"responses\"\nenv_key = \"OPENAI_API_KEY\"",
                model, base_url
            );
            serde_json::json!({
                "auth": { "OPENAI_API_KEY": encrypted_key },
                "config": config_toml
            }).to_string()
        }
        _ => {
            serde_json::json!({
                "env": {
                    "OPENAI_BASE_URL": base_url,
                    "OPENAI_API_KEY": encrypted_key,
                    "OPENAI_MODEL": model
                }
            }).to_string()
        }
    }
}
