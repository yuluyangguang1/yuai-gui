//! Message Bus — orchestrates multi-agent group chat.
//!
//! Responsibilities:
//! 1. Maintain ordered chat history (all messages)
//! 2. Decide which agent speaks next
//! 3. Build prompt with full context and inject into target agent's PTY stdin
//! 4. Capture agent stdout and add to chat history
//! 5. Manage discussion → execution state transitions

use serde::{Deserialize, Serialize};
use std::collections::VecDeque;
use std::sync::{Arc, RwLock};

/// A single message in the group chat.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChatMessage {
    pub id: String,
    pub timestamp: u64,
    pub from: String,       // "user" | agent_id | "system"
    pub to: String,         // "all" | agent_id
    pub msg_type: String,   // "chat" | "exec_request" | "exec_result" | "status"
    pub content: String,
    pub tokens_used: Option<u32>,
    pub model: Option<String>,
    pub duration_ms: Option<u64>,
}

/// The current phase of the group chat.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum ChatPhase {
    Idle,
    Discussing,
    WaitingConfirm,
    Executing,
    Handoff,
}

/// Which agent should speak next.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NextSpeaker {
    pub agent_id: String,
    pub reason: String, // "mentioned", "specialty", "round_robin"
}

/// Group chat state.
pub struct GroupChat {
    pub messages: Vec<ChatMessage>,
    pub phase: ChatPhase,
    pub participants: Vec<String>,  // agent IDs currently in the group
    pub speaking_order: VecDeque<String>,
    pub current_speaker: Option<String>,
    pub execution_queue: VecDeque<String>, // agents to execute in order
    pub spoken_this_round: std::collections::HashSet<String>, // track who spoke to prevent loops
    next_msg_id: u32,
}

impl Default for GroupChat {
    fn default() -> Self {
        Self {
            messages: Vec::new(),
            phase: ChatPhase::Idle,
            participants: vec![
                "claude".into(), "codex".into(), "openclaw".into(), "hermes".into()
            ],
            speaking_order: VecDeque::new(),
            current_speaker: None,
            execution_queue: VecDeque::new(),
            spoken_this_round: std::collections::HashSet::new(),
            next_msg_id: 1,
        }
    }
}

impl GroupChat {
    /// Add a user message and determine who speaks next.
    pub fn user_message(&mut self, content: &str) -> Vec<NextSpeaker> {
        let msg = ChatMessage {
            id: format!("msg_{}", self.next_msg_id),
            timestamp: now_ms(),
            from: "user".into(),
            to: "all".into(),
            msg_type: "chat".into(),
            content: content.into(),
            tokens_used: None,
            model: None,
            duration_ms: None,
        };
        self.next_msg_id += 1;
        self.messages.push(msg);
        self.phase = ChatPhase::Discussing;
        self.spoken_this_round.clear();

        // Determine speaking order (specialty-based)
        self.determine_speakers_by_specialty(content)
    }

    /// Add an agent's response to the chat.
    pub fn agent_response(&mut self, agent_id: &str, content: &str, tokens: Option<u32>, model: Option<String>, duration_ms: Option<u64>) {
        let msg = ChatMessage {
            id: format!("msg_{}", self.next_msg_id),
            timestamp: now_ms(),
            from: agent_id.into(),
            to: "all".into(),
            msg_type: "chat".into(),
            content: content.into(),
            tokens_used: tokens,
            model,
            duration_ms,
        };
        self.next_msg_id += 1;
        self.messages.push(msg);

        // Check for @mentions in the response — but don't re-add already-spoken agents
        let mentions = extract_mentions(content, &self.participants);
        for m in mentions {
            if !self.spoken_this_round.contains(&m) && !self.speaking_order.contains(&m) {
                self.speaking_order.push_back(m);
            }
        }
    }

    /// Get the next agent that should speak. Returns None if all have spoken.
    pub fn next_speaker(&mut self) -> Option<NextSpeaker> {
        // Skip agents that already spoke this round
        while let Some(agent_id) = self.speaking_order.pop_front() {
            if self.spoken_this_round.contains(&agent_id) {
                continue; // skip already-spoken agents
            }
            self.spoken_this_round.insert(agent_id.clone());
            self.current_speaker = Some(agent_id.clone());
            return Some(NextSpeaker { agent_id, reason: "scheduled".into() });
        }
        {
            self.current_speaker = None;
            self.phase = ChatPhase::WaitingConfirm;
            None
        }
    }

    /// User confirms execution. Sets up execution queue.
    pub fn confirm_execution(&mut self, order: Option<Vec<String>>) {
        self.phase = ChatPhase::Executing;
        self.execution_queue = order
            .unwrap_or_else(|| self.participants.clone())
            .into_iter()
            .collect();
    }

    /// Get the next agent to execute.
    pub fn next_executor(&mut self) -> Option<String> {
        let next = self.execution_queue.pop_front();
        if next.is_none() {
            self.phase = ChatPhase::Idle;
        }
        next
    }

    /// Build the prompt to inject into an agent's stdin for discussion.
    pub fn build_discussion_prompt(&self, agent_id: &str, agents_info: &[(String, String, String)]) -> String {
        let agent_info = agents_info.iter().find(|(id, _, _)| id == agent_id);
        let (_, name, specialty) = agent_info.cloned().unwrap_or_else(|| (agent_id.into(), agent_id.into(), String::new()));

        let team_members: Vec<String> = agents_info.iter()
            .filter(|(id, _, _)| id != agent_id)
            .map(|(_, n, s)| format!("{}({})", n, s))
            .collect();

        let history = self.format_history();

        format!(
            "你是 {name}，专长：{specialty}。\n\
             你正在和团队讨论项目方案。\n\n\
             团队成员：{team}\n\n\
             {history_section}\
             规则：\n\
             - 只讨论方案，不执行任何操作\n\
             - 需要他人配合时用 @name 提及\n\
             - 保持简洁（不超过 200 字）\n\
             - 明确说出你负责什么\n",
            name = name,
            specialty = specialty,
            team = team_members.join("、"),
            history_section = if history.is_empty() {
                String::new()
            } else {
                format!("之前的讨论：\n{}\n\n", history)
            }
        )
    }

    /// Build the prompt for execution phase.
    /// Reserved for future use — currently the frontend builds execution
    /// prompts directly. Kept here for potential server-side orchestration.
    #[allow(dead_code)]
    pub fn build_execution_prompt(&self, _agent_id: &str, task: &str) -> String {
        let summary = self.summarize_discussion();
        format!(
            "团队已确认分工，现在轮到你执行。\n\n\
             你的任务：{task}\n\n\
             讨论摘要：\n{summary}\n\n\
             请直接开始操作。\n",
            task = task,
            summary = summary,
        )
    }

    /// Invite an agent to the group.
    pub fn invite(&mut self, agent_id: &str) {
        if !self.participants.contains(&agent_id.to_string()) {
            self.participants.push(agent_id.into());
        }
    }

    /// Remove an agent from the group.
    pub fn kick(&mut self, agent_id: &str) {
        self.participants.retain(|id| id != agent_id);
        self.speaking_order.retain(|id| id != agent_id);
    }

    /// Check if the discussion has converged.
    pub fn check_convergence(&mut self, new_message: &str) -> bool {
        let stop_signals = ["讨论完毕", "没有其他意见", "我同意以上方案", "TERMINATE", "没有补充"];
        if stop_signals.iter().any(|s| new_message.contains(s)) {
            return true;
        }
        let recent: Vec<&str> = self.messages.iter()
            .filter(|m| m.msg_type == "chat" && m.from != "user")
            .rev()
            .take(3)
            .map(|m| m.content.as_str())
            .collect();
        if recent.len() < 2 { return false; }
        for prev in &recent {
            if jaccard_similarity(new_message, prev) > 0.6 { return true; }
        }
        false
    }

    /// Select speakers based on specialty matching.
    pub fn determine_speakers_by_specialty(&mut self, content: &str) -> Vec<NextSpeaker> {
        self.speaking_order.clear();
        let mut speakers = Vec::new();
        let mentions = extract_mentions(content, &self.participants);
        if !mentions.is_empty() {
            for m in &mentions {
                self.speaking_order.push_back(m.clone());
                speakers.push(NextSpeaker { agent_id: m.clone(), reason: "mentioned".into() });
            }
            return speakers;
        }
        let mut scores: Vec<(String, f32)> = self.participants.iter().map(|p| {
            (p.clone(), specialty_score(p, content))
        }).collect();
        scores.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
        for (agent_id, score) in &scores {
            self.speaking_order.push_back(agent_id.clone());
            speakers.push(NextSpeaker {
                agent_id: agent_id.clone(),
                reason: if *score > 0.0 { format!("specialty(score={:.1})", score) } else { "round_robin".into() },
            });
        }
        speakers
    }

    // ─── Internal ───

    #[allow(dead_code)]
    fn determine_speakers(&mut self, content: &str) -> Vec<NextSpeaker> {
        self.speaking_order.clear();
        let mut speakers = Vec::new();

        // 1. Check for @mentions in user message
        let mentions = extract_mentions(content, &self.participants);
        if !mentions.is_empty() {
            for m in &mentions {
                self.speaking_order.push_back(m.clone());
                speakers.push(NextSpeaker { agent_id: m.clone(), reason: "mentioned".into() });
            }
        } else {
            // 2. All participants speak in order
            for p in &self.participants {
                self.speaking_order.push_back(p.clone());
                speakers.push(NextSpeaker { agent_id: p.clone(), reason: "round_robin".into() });
            }
        }

        speakers
    }

    fn format_history(&self) -> String {
        self.messages.iter()
            .filter(|m| m.msg_type == "chat")
            .map(|m| {
                let label = if m.from == "user" { "用户".to_string() } else { m.from.clone() };
                format!("[{}] {}", label, m.content)
            })
            .collect::<Vec<_>>()
            .join("\n")
    }

    #[allow(dead_code)]
    fn summarize_discussion(&self) -> String {
        // Simple: just return last 5 messages
        self.messages.iter()
            .filter(|m| m.msg_type == "chat")
            .rev()
            .take(5)
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .map(|m| format!("[{}] {}", m.from, m.content))
            .collect::<Vec<_>>()
            .join("\n")
    }
}

/// Thread-safe wrapper for GroupChat state.
pub type SharedGroupChat = Arc<RwLock<GroupChat>>;

pub fn new_group_chat() -> SharedGroupChat {
    Arc::new(RwLock::new(GroupChat::default()))
}

// ─── Helpers ───

/// Characters that are valid before an @mention boundary.
/// Includes whitespace, line starts, and CJK punctuation.
const BEFORE_BOUNDARY: &[char] = &[
    ' ', '\t', '\n', '\r',         // whitespace
    '，', '。', '、', '；', '：',  // CJK punctuation
    '？', '！',                     // CJK question/exclamation
    '（', '）', '【', '】',         // CJK brackets
    '「', '」', '『', '』',         // CJK quotes
    '《', '》',                     // CJK angle quotes
    '…', '—', '–',                 // ellipsis, dashes
    '"', '\'', '(', ')', '[', ']', // ASCII brackets/quotes
    '{', '}', '<', '>',            // more brackets
    ',', '.', ';', ':', '!', '?',  // ASCII punctuation
    '/', '\\', '|',                // path separators
];

/// Characters that are valid after an @mention boundary (end of name).
const AFTER_BOUNDARY: &[char] = &[
    ' ', '\t', '\n', '\r',
    '，', '。', '、', '；', '：',
    '？', '！',
    '（', '）', '【', '】',
    '「', '」', '『', '』',
    '《', '》',
    '…', '—', '–',
    '"', '\'', '(', ')', '[', ']',
    '{', '}', '<', '>', ',', '.', ';', ':', '!', '?',
    '/', '\\', '|',
    '\0',  // end of string sentinel
];

/// Check if a character is a valid boundary character before an @mention.
fn is_before_boundary(ch: char) -> bool {
    BEFORE_BOUNDARY.contains(&ch)
}

/// Check if a character is a valid boundary character after an @mention.
fn is_after_boundary(ch: char) -> bool {
    AFTER_BOUNDARY.contains(&ch)
}

/// Maximum mention nesting depth to prevent infinite loops.
const MAX_MENTION_DEPTH: u32 = 4;

/// A detected mention range in text.
#[derive(Debug, Clone)]
pub struct MentionRange {
    #[allow(dead_code)]
    pub start: usize,       // byte offset of '@'
    #[allow(dead_code)]
    pub end: usize,         // byte offset after the name
    pub target: String,     // the name after '@'
}

/// Find all @mention ranges in text with proper boundary checking.
/// Uses byte offsets for slicing.
pub fn find_mention_ranges(text: &str) -> Vec<MentionRange> {
    let mut ranges = Vec::new();
    let chars: Vec<(usize, char)> = text.char_indices().collect();

    for i in 0..chars.len() {
        let (byte_idx, ch) = chars[i];
        if ch != '@' {
            continue;
        }

        // Check before boundary: must be at start of string or preceded by boundary char
        if i > 0 {
            let (_, prev_ch) = chars[i - 1];
            if !is_before_boundary(prev_ch) {
                continue; // no valid boundary before @
            }
        }

        // Collect the name after @
        let name_start = i + 1;
        if name_start >= chars.len() {
            continue;
        }

        let mut name_end = name_start;
        while name_end < chars.len() {
            let (_, ch) = chars[name_end];
            if is_after_boundary(ch) {
                break;
            }
            name_end += 1;
        }

        if name_end == name_start {
            continue; // empty name
        }

        // Build the name string
        let name: String = chars[name_start..name_end]
            .iter()
            .map(|(_, c)| *c)
            .collect();

        let end_byte = if name_end < chars.len() {
            chars[name_end].0
        } else {
            text.len()
        };

        ranges.push(MentionRange {
            start: byte_idx,
            end: end_byte,
            target: name,
        });
    }

    ranges
}

/// Resolve mention targets from text, filtering against known participants.
/// Supports "@all" to mention all participants.
/// Tracks mention depth to prevent infinite loops (max 4).
pub fn resolve_mention_targets(
    text: &str,
    participants: &[String],
    current_depth: u32,
) -> Vec<String> {
    if current_depth >= MAX_MENTION_DEPTH {
        return Vec::new(); // prevent infinite loop
    }

    let ranges = find_mention_ranges(text);
    let mut targets = Vec::new();
    let mut seen = std::collections::HashSet::new();

    for range in &ranges {
        let name = range.target.to_lowercase();

        if name == "all" {
            // @all mentions everyone
            for p in participants {
                if seen.insert(p.clone()) {
                    targets.push(p.clone());
                }
            }
        } else if participants.iter().any(|p| p.to_lowercase() == name) {
            if seen.insert(range.target.clone()) {
                targets.push(range.target.clone());
            }
        }
    }

    targets
}

/// Updated extract_mentions that uses proper boundary detection.
fn extract_mentions(text: &str, participants: &[String]) -> Vec<String> {
    resolve_mention_targets(text, participants, 0)
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

/// Jaccard similarity between two strings using character bigrams.
/// Works for both Chinese and English text.
fn jaccard_similarity(a: &str, b: &str) -> f32 {
    let bigrams_a = char_bigrams(a);
    let bigrams_b = char_bigrams(b);
    if bigrams_a.is_empty() && bigrams_b.is_empty() { return 1.0; }
    if bigrams_a.is_empty() || bigrams_b.is_empty() { return 0.0; }
    let set_a: std::collections::HashSet<&str> = bigrams_a.iter().map(|s| s.as_str()).collect();
    let set_b: std::collections::HashSet<&str> = bigrams_b.iter().map(|s| s.as_str()).collect();
    let intersection = set_a.intersection(&set_b).count();
    let union = set_a.union(&set_b).count();
    if union == 0 { 0.0 } else { intersection as f32 / union as f32 }
}

/// Extract character bigrams from a string, skipping whitespace and punctuation.
fn char_bigrams(s: &str) -> Vec<String> {
    let punct = "，。、；：？！\u{201c}\u{201d}\u{2018}\u{2019}（）【】…—《》";
    let chars: Vec<char> = s.chars().filter(|c| !c.is_whitespace() && !c.is_ascii_punctuation() && !punct.contains(*c)).collect();
    if chars.len() < 2 { return chars.iter().map(|c| c.to_string()).collect(); }
    chars.windows(2).map(|w| format!("{}{}", w[0], w[1])).collect()
}

/// Score an agent by how well its specialty matches the content.
fn specialty_score(agent_id: &str, content: &str) -> f32 {
    let content_lower = content.to_lowercase();
    let keywords: &[(&str, f32)] = match agent_id {
        "claude" => &[("代码", 1.0), ("编程", 1.0), ("重构", 1.5), ("架构", 1.5), ("bug", 1.0), ("review", 1.0), ("优化", 1.0), ("code", 1.0), ("refactor", 1.5), ("architect", 1.5), ("debug", 1.0), ("fix", 0.8), ("implement", 1.0)],
        "codex" => &[("原型", 1.0), ("快速", 0.8), ("测试", 1.0), ("demo", 1.0), ("实验", 1.0), ("尝试", 0.8), ("prototype", 1.0), ("quick", 0.8), ("test", 1.0), ("experiment", 1.0), ("try", 0.8), ("hack", 0.8)],
        "openclaw" => &[("内容", 1.0), ("文案", 1.0), ("运营", 1.0), ("文章", 1.0), ("发布", 0.8), ("推广", 0.8), ("content", 1.0), ("write", 1.0), ("article", 1.0), ("publish", 0.8), ("copy", 0.8), ("marketing", 0.8)],
        "hermes" => &[("记忆", 1.0), ("学习", 1.0), ("任务", 0.8), ("分析", 1.0), ("研究", 1.0), ("总结", 1.0), ("整理", 0.8), ("memory", 1.0), ("learn", 1.0), ("task", 0.8), ("analyze", 1.0), ("research", 1.0), ("summarize", 1.0), ("organize", 0.8)],
        _ => &[],
    };
    keywords.iter()
        .filter(|(kw, _)| content_lower.contains(*kw))
        .map(|(_, score)| *score)
        .sum()
}
