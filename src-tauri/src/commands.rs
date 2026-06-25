// ═══════════════════════════════════════════
// Group Chat Commands
// ═══════════════════════════════════════════

/// Send a user message to the group chat. Returns the list of agents that will speak.
#[tauri::command]
pub fn group_send(state: tauri::State<crate::bus::SharedGroupChat>, content: String) -> Result<Vec<crate::bus::NextSpeaker>, String> {
    let mut chat = state.write().map_err(|e| e.to_string())?;
    Ok(chat.user_message(&content))
}

/// Get the next agent that should speak in the discussion.
#[tauri::command]
pub fn group_next_speaker(state: tauri::State<crate::bus::SharedGroupChat>) -> Result<Option<crate::bus::NextSpeaker>, String> {
    let mut chat = state.write().map_err(|e| e.to_string())?;
    Ok(chat.next_speaker())
}

/// Record an agent's response in the group chat.
#[tauri::command]
pub fn group_agent_response(
    state: tauri::State<crate::bus::SharedGroupChat>,
    agent_id: String,
    content: String,
    tokens: Option<u32>,
    model: Option<String>,
    duration_ms: Option<u64>,
) -> Result<(), String> {
    let mut chat = state.write().map_err(|e| e.to_string())?;
    chat.agent_response(&agent_id, &content, tokens, model, duration_ms);
    Ok(())
}

/// Build the discussion prompt for a specific agent.
#[tauri::command]
pub fn group_build_prompt(
    app: tauri::AppHandle,
    state: tauri::State<crate::bus::SharedGroupChat>,
    agent_id: String,
) -> Result<String, String> {
    let chat = state.read().map_err(|e| e.to_string())?;
    let all_agents = crate::agents::load_agents(&app)?;
    let agents_info: Vec<(String, String, String)> = all_agents.iter()
        .map(|a| (a.id.clone(), a.name.clone(), a.specialty.clone()))
        .collect();
    Ok(chat.build_discussion_prompt(&agent_id, &agents_info))
}

/// User confirms execution. Optionally specify execution order.
#[tauri::command]
pub fn group_confirm_exec(state: tauri::State<crate::bus::SharedGroupChat>, order: Option<Vec<String>>) -> Result<(), String> {
    let mut chat = state.write().map_err(|e| e.to_string())?;
    chat.confirm_execution(order);
    Ok(())
}

/// Get the next agent to execute.
#[tauri::command]
pub fn group_next_executor(state: tauri::State<crate::bus::SharedGroupChat>) -> Result<Option<String>, String> {
    let mut chat = state.write().map_err(|e| e.to_string())?;
    Ok(chat.next_executor())
}

/// Get current chat phase.
#[tauri::command]
pub fn group_get_phase(state: tauri::State<crate::bus::SharedGroupChat>) -> Result<crate::bus::ChatPhase, String> {
    let chat = state.read().map_err(|e| e.to_string())?;
    Ok(chat.phase.clone())
}

/// Get all messages in the group chat.
#[tauri::command]
pub fn group_get_messages(state: tauri::State<crate::bus::SharedGroupChat>) -> Result<Vec<crate::bus::ChatMessage>, String> {
    let chat = state.read().map_err(|e| e.to_string())?;
    Ok(chat.messages.clone())
}

/// Invite an agent to the group.
#[tauri::command]
pub fn group_invite(state: tauri::State<crate::bus::SharedGroupChat>, agent_id: String) -> Result<(), String> {
    let mut chat = state.write().map_err(|e| e.to_string())?;
    chat.invite(&agent_id);
    Ok(())
}

/// Kick an agent from the group.
#[tauri::command]
pub fn group_kick(state: tauri::State<crate::bus::SharedGroupChat>, agent_id: String) -> Result<(), String> {
    let mut chat = state.write().map_err(|e| e.to_string())?;
    chat.kick(&agent_id);
    Ok(())
}

/// Check if the discussion has converged (new message is too similar to recent ones).
#[tauri::command]
pub fn group_check_convergence(state: tauri::State<crate::bus::SharedGroupChat>, message: String) -> Result<bool, String> {
    let mut chat = state.write().map_err(|e| e.to_string())?; // write lock needed: check_convergence may update internal state
    Ok(chat.check_convergence(&message))
}
