// ═══════════════════════════════════════════
// Context Compression — keep chat context within token budget
// (inspired by Hermes Studio)
// ═══════════════════════════════════════════

use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;

/// Default token threshold before compression kicks in.
const DEFAULT_THRESHOLD: usize = 100_000;

/// Per-room compression state.
struct RoomCompression {
    /// Accumulated compressed summaries.
    summaries: Vec<String>,
    /// Original message count at last compression.
    last_compressed_at: usize,
}

/// Manages compression for multiple rooms.
pub struct ContextManager {
    rooms: HashMap<String, RoomCompression>,
    threshold: usize,
}

impl Default for ContextManager {
    fn default() -> Self {
        Self {
            rooms: HashMap::new(),
            threshold: DEFAULT_THRESHOLD,
        }
    }
}

pub type SharedContextManager = Arc<Mutex<ContextManager>>;

pub fn new_context_manager() -> SharedContextManager {
    Arc::new(Mutex::new(ContextManager::default()))
}

// ─── Token Estimation ───

/// Estimate the number of tokens in a string.
/// CJK characters: ~1.5 tokens/char
/// Latin/ASCII: ~1 token per 4 chars (0.25 tok/char)
fn estimate_tokens(text: &str) -> usize {
    let mut tokens: f64 = 0.0;
    for ch in text.chars() {
        if is_cjk(ch) {
            tokens += 1.5;
        } else if ch.is_ascii() {
            tokens += 0.25;
        } else {
            // Other scripts (Arabic, Cyrillic, etc.) — treat as ~1 tok/char
            tokens += 1.0;
        }
    }
    tokens.ceil() as usize
}

/// Check if a character is in the CJK Unified Ideographs range (and extensions).
fn is_cjk(ch: char) -> bool {
    matches!(ch,
        '\u{4E00}'..='\u{9FFF}'   |  // CJK Unified Ideographs
        '\u{3400}'..='\u{4DBF}'   |  // CJK Unified Ideographs Extension A
        '\u{20000}'..='\u{2A6DF}' |  // CJK Extension B
        '\u{2A700}'..='\u{2B73F}' |  // CJK Extension C
        '\u{2B740}'..='\u{2B81F}' |  // CJK Extension D
        '\u{F900}'..='\u{FAFF}'   |  // CJK Compatibility Ideographs
        '\u{3000}'..='\u{303F}'   |  // CJK Symbols and Punctuation
        '\u{FF00}'..='\u{FFEF}'   |  // Fullwidth Forms
        '\u{3040}'..='\u{309F}'   |  // Hiragana
        '\u{30A0}'..='\u{30FF}'      // Katakana
    )
}

// ─── Compression API ───

/// Check whether the combined context for a room needs compression.
/// `messages_total_chars` is the total character count of all messages in the room.
pub fn needs_compression(_messages_total_chars: usize, messages_text: &str) -> bool {
    let estimated = estimate_tokens(messages_text);
    estimated >= DEFAULT_THRESHOLD
}

/// Build a structured compression prompt (in Chinese, matching the app's voice).
/// Returns the prompt to send to an LLM to produce a compressed summary.
pub fn build_compression_prompt(messages: &[String]) -> String {
    let joined = messages.join("\n");
    let char_count = joined.len();
    let est_tokens = estimate_tokens(&joined);

    format!(
        "请对以下对话进行结构化压缩摘要。\n\n\
         要求：\n\
         1. 保留所有关键决策和结论\n\
         2. 保留所有 @mention 指令和任务分配\n\
         3. 保留技术细节（代码片段、配置、路径）\n\
         4. 删除重复讨论和寒暄\n\
         5. 用简洁的中文总结，分条目列出\n\
         6. 标注每个决策的负责人\n\n\
         当前上下文：约 {} 字符（~{} tokens）\n\n\
         对话内容：\n\
         {}",
        char_count, est_tokens, joined
    )
}

/// Compress a set of messages: store the summary and return it.
/// Uses per-room lock to prevent concurrent compression.
impl ContextManager {
    /// Check if a room needs compression.
    pub fn room_needs_compression(&self, _room_id: &str, messages: &[String]) -> bool {
        let joined = messages.join("\n");
        estimate_tokens(&joined) >= self.threshold
    }

    /// Store a compressed summary for a room.
    pub fn store_summary(&mut self, room_id: &str, summary: String, msg_count: usize) {
        let room = self
            .rooms
            .entry(room_id.to_string())
            .or_insert_with(|| RoomCompression {
                summaries: Vec::new(),
                last_compressed_at: 0,
            });
        room.summaries.push(summary);
        room.last_compressed_at = msg_count;
    }

    /// Get all stored summaries for a room.
    pub fn get_summaries(&self, room_id: &str) -> Vec<String> {
        self.rooms
            .get(room_id)
            .map(|r| r.summaries.clone())
            .unwrap_or_default()
    }

    /// Get the compressed context prefix for a room (all summaries joined).
    pub fn get_context_prefix(&self, room_id: &str) -> String {
        let summaries = self.get_summaries(room_id);
        if summaries.is_empty() {
            return String::new();
        }
        format!(
            "【之前的讨论摘要】\n{}\n",
            summaries.join("\n---\n")
        )
    }

    /// The message index from which new (uncompressed) messages start.
    pub fn uncompressed_start(&self, room_id: &str) -> usize {
        self.rooms
            .get(room_id)
            .map(|r| r.last_compressed_at)
            .unwrap_or(0)
    }
}

// ─── Tauri Command ───

/// Trigger context compression for a room.
/// Returns the compression prompt that should be sent to the LLM.
#[tauri::command]
pub async fn compress_context(
    state: tauri::State<'_, SharedContextManager>,
    room_id: String,
    messages: Vec<String>,
) -> Result<String, String> {
    let mgr = state.lock().await;

    if !mgr.room_needs_compression(&room_id, &messages) {
        return Ok(String::new()); // no compression needed
    }

    let prompt = build_compression_prompt(&messages);

    // We don't call the LLM here — return the prompt for the frontend to send.
    // The frontend will call store_compressed_summary once it gets the LLM response.
    Ok(prompt)
}

/// Store a compression result (called after LLM produces the summary).
#[tauri::command]
pub async fn store_compressed_summary(
    state: tauri::State<'_, SharedContextManager>,
    room_id: String,
    summary: String,
    message_count: usize,
) -> Result<(), String> {
    let mut mgr = state.lock().await;
    mgr.store_summary(&room_id, summary, message_count);
    Ok(())
}

/// Get the compressed context prefix for a room.
#[tauri::command]
pub async fn get_context_prefix(
    state: tauri::State<'_, SharedContextManager>,
    room_id: String,
) -> Result<String, String> {
    let mgr = state.lock().await;
    Ok(mgr.get_context_prefix(&room_id))
}
