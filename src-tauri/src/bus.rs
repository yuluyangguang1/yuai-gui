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

        // Determine speaking order
        self.determine_speakers(content)
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

        // Check for @mentions in the response
        let mentions = extract_mentions(content, &self.participants);
        if !mentions.is_empty() {
            for m in mentions {
                if !self.speaking_order.contains(&m) {
                    self.speaking_order.push_back(m);
                }
            }
        }
    }

    /// Get the next agent that should speak. Returns None if all have spoken.
    pub fn next_speaker(&mut self) -> Option<NextSpeaker> {
        if let Some(agent_id) = self.speaking_order.pop_front() {
            self.current_speaker = Some(agent_id.clone());
            Some(NextSpeaker { agent_id, reason: "scheduled".into() })
        } else {
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

    // ─── Internal ───

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

fn extract_mentions(text: &str, participants: &[String]) -> Vec<String> {
    let mut mentions = Vec::new();
    for p in participants {
        if text.contains(&format!("@{}", p)) {
            mentions.push(p.clone());
        }
    }
    mentions
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}
