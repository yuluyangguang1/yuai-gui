//! Configuration detection — reads cc-switch's SQLite DB to determine which
//! tools have an active provider configured.

use std::path::Path;
use rusqlite::{Connection, OpenFlags};

fn cc_switch_db(root: &Path) -> std::path::PathBuf {
    root.join("data").join(".cc-switch").join("cc-switch.db")
}

/// Returns true if cc-switch DB has an active (is_current=1) provider for this tool's app_type.
/// Tool-specific validation rules:
/// - claude:   env.ANTHROPIC_BASE_URL + (ANTHROPIC_AUTH_TOKEN | ANTHROPIC_API_KEY)
/// - codex:    auth.OPENAI_API_KEY OR auth.tokens.access_token
/// - openclaw: any provider with non-empty config
/// - hermes:   any provider with non-empty config
pub fn is_tool_configured(tool_id: &str, root: &Path) -> bool {
    let db_path = cc_switch_db(root);
    if !db_path.exists() {
        return false;
    }

    let conn = match Connection::open_with_flags(&db_path, OpenFlags::SQLITE_OPEN_READ_ONLY) {
        Ok(c) => c,
        Err(_) => return false,
    };

    let app_types: &[&str] = match tool_id {
        "claude"   => &["claude"],
        "codex"    => &["codex", "openai"],
        "openclaw" => &["openclaw"],
        "hermes"   => &["hermes"],
        _ => return false,
    };

    for app_type in app_types {
        let row: Option<String> = conn.query_row(
            "SELECT settings_config FROM providers WHERE app_type = ?1 AND is_current = 1 LIMIT 1",
            [app_type],
            |r| r.get(0),
        ).ok();

        if let Some(cfg_json) = row {
            if validate_config(tool_id, &cfg_json) {
                return true;
            }
        }
    }
    false
}

fn validate_config(tool_id: &str, cfg_json: &str) -> bool {
    let val: serde_json::Value = match serde_json::from_str(cfg_json) {
        Ok(v) => v,
        Err(_) => return false,
    };

    match tool_id {
        "claude" => {
            let env = val.get("env").and_then(|e| e.as_object());
            if let Some(env) = env {
                let url = env.get("ANTHROPIC_BASE_URL").and_then(|v| v.as_str()).unwrap_or("");
                let key = env.get("ANTHROPIC_AUTH_TOKEN").and_then(|v| v.as_str())
                    .or_else(|| env.get("ANTHROPIC_API_KEY").and_then(|v| v.as_str()))
                    .unwrap_or("");
                return url.len() > 5 && key.len() > 5;
            }
            false
        }
        "codex" => {
            let auth = val.get("auth");
            if let Some(auth) = auth {
                let key = auth.get("OPENAI_API_KEY").and_then(|v| v.as_str()).unwrap_or("");
                if key.len() > 5 { return true; }
                let token = auth.get("tokens")
                    .and_then(|t| t.get("access_token"))
                    .and_then(|v| v.as_str())
                    .unwrap_or("");
                return !token.is_empty();
            }
            false
        }
        _ => {
            // openclaw / hermes: just require some non-trivial config
            !cfg_json.trim().is_empty() && cfg_json.len() > 10
        }
    }
}
