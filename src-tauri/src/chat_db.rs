use serde::{Deserialize, Serialize};

// ═══════════════════════════════════════════
// Chat Persistence
// ═══════════════════════════════════════════

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ChatRecord {
    pub id: Option<i64>,
    pub timestamp: u64,
    pub from: String,       // "user" | agent_id
    pub content: String,
    pub msg_type: String,   // "chat" | "system"
    pub workspace: String,
}

/// Save a chat message to local DB.
#[tauri::command]
pub fn save_chat_message(app: tauri::AppHandle, record: ChatRecord) -> Result<(), String> {
    let root = crate::agents::bundle_root(&app);
    let db_dir = root.join("data");
    std::fs::create_dir_all(&db_dir).map_err(|e| e.to_string())?;
    let db_path = db_dir.join("chat_history.db");

    let conn = rusqlite::Connection::open(&db_path).map_err(|e| e.to_string())?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp INTEGER NOT NULL,
            sender TEXT NOT NULL,
            content TEXT NOT NULL,
            msg_type TEXT NOT NULL DEFAULT 'chat',
            workspace TEXT NOT NULL DEFAULT ''
        );"
    ).map_err(|e| e.to_string())?;

    conn.execute(
        "INSERT INTO messages (timestamp, sender, content, msg_type, workspace) VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![record.timestamp, record.from, record.content, record.msg_type, record.workspace],
    ).map_err(|e| e.to_string())?;
    Ok(())
}

/// Load chat history for a workspace (last 100 messages).
#[tauri::command]
pub fn load_chat_history(app: tauri::AppHandle, workspace: String) -> Result<Vec<ChatRecord>, String> {
    let root = crate::agents::bundle_root(&app);
    let db_path = root.join("data").join("chat_history.db");
    if !db_path.exists() {
        return Ok(vec![]);
    }

    let conn = rusqlite::Connection::open_with_flags(
        &db_path, rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY
    ).map_err(|e| e.to_string())?;

    let mut stmt = conn.prepare(
        "SELECT id, timestamp, sender, content, msg_type, workspace FROM messages WHERE workspace = ?1 ORDER BY timestamp DESC LIMIT 100"
    ).map_err(|e| e.to_string())?;

    let rows = stmt.query_map(rusqlite::params![workspace], |row| {
        Ok(ChatRecord {
            id: row.get(0)?,
            timestamp: row.get(1)?,
            from: row.get(2)?,
            content: row.get(3)?,
            msg_type: row.get(4)?,
            workspace: row.get(5)?,
        })
    }).map_err(|e| e.to_string())?;

    let mut records: Vec<ChatRecord> = Vec::new();
    for row in rows {
        if let Ok(r) = row { records.push(r); }
    }
    records.reverse(); // oldest first
    Ok(records)
}
