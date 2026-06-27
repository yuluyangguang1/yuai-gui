use serde::{Deserialize, Serialize};

// ═══════════════════════════════════════════════════════════
// Usage Tracking — aggregate-only, no message content stored
// ═══════════════════════════════════════════════════════════

const SCHEMA_VERSION: u32 = 1;
const SCHEMA_CHECKSUM: &str = "v1_usage_aggregate_2025";

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UsageRecord {
    pub session_id: String,
    pub model: String,
    pub provider: String,
    pub input_tokens: i64,
    pub output_tokens: i64,
    pub cost: f64,
    pub duration_ms: i64,
    pub timestamp: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct UsageStats {
    pub total_input_tokens: i64,
    pub total_output_tokens: i64,
    pub total_cost: f64,
    pub total_sessions: i64,
    pub by_model: Vec<ModelAggregate>,
    pub by_provider: Vec<ProviderAggregate>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ModelAggregate {
    pub model: String,
    pub provider: String,
    pub total_input_tokens: i64,
    pub total_output_tokens: i64,
    pub total_cost: f64,
    pub session_count: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProviderAggregate {
    pub provider: String,
    pub total_tokens: i64,
    pub total_cost: f64,
    pub session_count: i64,
}

fn open_db(app: &tauri::AppHandle) -> Result<rusqlite::Connection, String> {
    let root = crate::agents::bundle_root(app);
    let db_dir = root.join("data");
    std::fs::create_dir_all(&db_dir).map_err(|e| e.to_string())?;
    let db_path = db_dir.join("usage.db");

    let conn = rusqlite::Connection::open(&db_path).map_err(|e| e.to_string())?;
    init_schema(&conn)?;
    Ok(conn)
}

fn init_schema(conn: &rusqlite::Connection) -> Result<(), String> {
    conn.execute_batch(&format!(
        "CREATE TABLE IF NOT EXISTS schema_version (
            version INTEGER NOT NULL,
            checksum TEXT NOT NULL,
            applied_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS usage_sessions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            session_id TEXT NOT NULL,
            model TEXT NOT NULL,
            provider TEXT NOT NULL,
            input_tokens INTEGER NOT NULL DEFAULT 0,
            output_tokens INTEGER NOT NULL DEFAULT 0,
            cost REAL NOT NULL DEFAULT 0.0,
            duration_ms INTEGER NOT NULL DEFAULT 0,
            timestamp INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS usage_models (
            model TEXT NOT NULL,
            provider TEXT NOT NULL,
            total_input_tokens INTEGER NOT NULL DEFAULT 0,
            total_output_tokens INTEGER NOT NULL DEFAULT 0,
            total_cost REAL NOT NULL DEFAULT 0.0,
            session_count INTEGER NOT NULL DEFAULT 0,
            PRIMARY KEY (model, provider)
        );

        CREATE TABLE IF NOT EXISTS usage_providers (
            provider TEXT PRIMARY KEY,
            total_tokens INTEGER NOT NULL DEFAULT 0,
            total_cost REAL NOT NULL DEFAULT 0.0,
            session_count INTEGER NOT NULL DEFAULT 0
        );

        CREATE INDEX IF NOT EXISTS idx_usage_sessions_session_id ON usage_sessions(session_id);
        CREATE INDEX IF NOT EXISTS idx_usage_sessions_timestamp ON usage_sessions(timestamp);
        CREATE INDEX IF NOT EXISTS idx_usage_sessions_model ON usage_sessions(model);
        CREATE INDEX IF NOT EXISTS idx_usage_sessions_provider ON usage_sessions(provider);"
    ))
    .map_err(|e| e.to_string())?;

    // Insert schema version if not present
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM schema_version WHERE checksum = ?1",
            rusqlite::params![SCHEMA_CHECKSUM],
            |row| row.get(0),
        )
        .unwrap_or(0);

    if count == 0 {
        conn.execute(
            "INSERT INTO schema_version (version, checksum, applied_at) VALUES (?1, ?2, ?3)",
            rusqlite::params![SCHEMA_VERSION, SCHEMA_CHECKSUM, chrono_timestamp()],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(())
}

fn chrono_timestamp() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as i64
}

// ═══════════════════════════════════════════════════════════
// Commands
// ═══════════════════════════════════════════════════════════

#[tauri::command]
pub fn record_usage(app: tauri::AppHandle, record: UsageRecord) -> Result<(), String> {
    let conn = open_db(&app)?;

    // Insert session record
    conn.execute(
        "INSERT INTO usage_sessions (session_id, model, provider, input_tokens, output_tokens, cost, duration_ms, timestamp)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        rusqlite::params![
            record.session_id,
            record.model,
            record.provider,
            record.input_tokens,
            record.output_tokens,
            record.cost,
            record.duration_ms,
            record.timestamp,
        ],
    )
    .map_err(|e| e.to_string())?;

    // Update model aggregate
    conn.execute(
        "INSERT INTO usage_models (model, provider, total_input_tokens, total_output_tokens, total_cost, session_count)
         VALUES (?1, ?2, ?3, ?4, ?5, 1)
         ON CONFLICT(model, provider) DO UPDATE SET
            total_input_tokens = total_input_tokens + excluded.total_input_tokens,
            total_output_tokens = total_output_tokens + excluded.total_output_tokens,
            total_cost = total_cost + excluded.total_cost,
            session_count = session_count + 1",
        rusqlite::params![
            record.model,
            record.provider,
            record.input_tokens,
            record.output_tokens,
            record.cost,
        ],
    )
    .map_err(|e| e.to_string())?;

    // Update provider aggregate
    conn.execute(
        "INSERT INTO usage_providers (provider, total_tokens, total_cost, session_count)
         VALUES (?1, ?2, ?3, 1)
         ON CONFLICT(provider) DO UPDATE SET
            total_tokens = total_tokens + excluded.total_tokens,
            total_cost = total_cost + excluded.total_cost,
            session_count = session_count + 1",
        rusqlite::params![
            record.provider,
            record.input_tokens + record.output_tokens,
            record.cost,
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn get_usage_stats(app: tauri::AppHandle) -> Result<UsageStats, String> {
    let conn = open_db(&app)?;

    // Totals from sessions
    let (total_input, total_output, total_cost, total_sessions): (i64, i64, f64, i64) = conn
        .query_row(
            "SELECT COALESCE(SUM(input_tokens),0), COALESCE(SUM(output_tokens),0), COALESCE(SUM(cost),0.0), COUNT(*)
             FROM usage_sessions",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .map_err(|e| e.to_string())?;

    let by_model = get_model_aggregates(&conn)?;
    let by_provider = get_provider_aggregates(&conn)?;

    Ok(UsageStats {
        total_input_tokens: total_input,
        total_output_tokens: total_output,
        total_cost,
        total_sessions,
        by_model,
        by_provider,
    })
}

#[tauri::command]
pub fn get_usage_by_model(app: tauri::AppHandle) -> Result<Vec<ModelAggregate>, String> {
    let conn = open_db(&app)?;
    get_model_aggregates(&conn)
}

#[tauri::command]
pub fn get_usage_by_provider(app: tauri::AppHandle) -> Result<Vec<ProviderAggregate>, String> {
    let conn = open_db(&app)?;
    get_provider_aggregates(&conn)
}

fn get_model_aggregates(conn: &rusqlite::Connection) -> Result<Vec<ModelAggregate>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT model, provider, total_input_tokens, total_output_tokens, total_cost, session_count
             FROM usage_models ORDER BY total_cost DESC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(ModelAggregate {
                model: row.get(0)?,
                provider: row.get(1)?,
                total_input_tokens: row.get(2)?,
                total_output_tokens: row.get(3)?,
                total_cost: row.get(4)?,
                session_count: row.get(5)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for row in rows {
        if let Ok(r) = row {
            result.push(r);
        }
    }
    Ok(result)
}

fn get_provider_aggregates(conn: &rusqlite::Connection) -> Result<Vec<ProviderAggregate>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT provider, total_tokens, total_cost, session_count
             FROM usage_providers ORDER BY total_cost DESC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(ProviderAggregate {
                provider: row.get(0)?,
                total_tokens: row.get(1)?,
                total_cost: row.get(2)?,
                session_count: row.get(3)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for row in rows {
        if let Ok(r) = row {
            result.push(r);
        }
    }
    Ok(result)
}
