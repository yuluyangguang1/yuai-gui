use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};

// ══════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SkillInfo {
    pub name: String,
    pub description: String,
    pub source: String,
    pub label: String,
    pub dir: String,
    pub content: String,
    pub hits: u32,
    pub last: u64,
    pub disabled: bool,
    pub issues: Vec<String>,
    pub copies: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone, Default)]
pub struct SkillStats {
    pub hits: u32,
    pub last: u64,
}

#[derive(Debug, Serialize)]
pub struct SkillsOverview {
    pub total: usize,
    pub unique: usize,
    pub active: usize,
    pub dust: usize,
    pub issues: usize,
    pub budget_chars: usize,
    pub budget_limit: usize,
}

#[derive(Debug, Serialize)]
pub struct SkillsData {
    pub overview: SkillsOverview,
    pub items: Vec<SkillInfo>,
}

// ══════════════════════════════════════════════
// Frontmatter Parser
// ══════════════════════════════════════════════

#[derive(Debug, Default)]
struct Frontmatter {
    name: String,
    description: String,
    triggers: Vec<String>,
}

fn parse_frontmatter(content: &str) -> Frontmatter {
    let mut fm = Frontmatter::default();
    let trimmed = content.trim_start();

    // Must start with ---
    if !trimmed.starts_with("---") {
        return fm;
    }

    let after_first = &trimmed[3..];
    let end = match after_first.find("---") {
        Some(pos) => pos,
        None => return fm,
    };

    let yaml_block = &after_first[..end];

    for line in yaml_block.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }

        if let Some((key, value)) = line.split_once(':') {
            let key = key.trim();
            let value = value.trim();
            match key {
                "name" => fm.name = value.trim_matches('"').trim_matches('\'').to_string(),
                "description" => {
                    fm.description = value.trim_matches('"').trim_matches('\'').to_string()
                }
                _ => {}
            }
        }

        // Handle triggers as list items
        if line.starts_with("- ") && fm.name.is_empty() == false {
            // Only collect triggers if we're inside a triggers block
            // Simple heuristic: lines starting with "- " after "triggers:" key
        }
    }

    // Also scan for triggers block
    let mut in_triggers = false;
    for line in yaml_block.lines() {
        let line = line.trim();
        if line == "triggers:" || line.starts_with("triggers: []") {
            in_triggers = line.ends_with(':') && !line.ends_with("[]");
            continue;
        }
        if in_triggers {
            if line.starts_with("- ") {
                fm.triggers
                    .push(line[2..].trim().trim_matches('"').to_string());
            } else if !line.starts_with('#') && !line.is_empty() {
                in_triggers = false;
            }
        }
    }

    fm
}

// ══════════════════════════════════════════════
// Stats File (.yuai/skill-stats.json)
// ══════════════════════════════════════════════

fn stats_path() -> PathBuf {
    let home = dirs::home_dir().unwrap_or_default();
    home.join(".yuai").join("skill-stats.json")
}

fn load_stats() -> HashMap<String, SkillStats> {
    let path = stats_path();
    if let Ok(data) = fs::read_to_string(&path) {
        serde_json::from_str(&data).unwrap_or_default()
    } else {
        HashMap::new()
    }
}

fn save_stats(stats: &HashMap<String, SkillStats>) -> Result<(), String> {
    let path = stats_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let data = serde_json::to_string_pretty(stats).map_err(|e| e.to_string())?;
    fs::write(&path, data).map_err(|e| e.to_string())
}

// ══════════════════════════════════════════════
// Scanner
// ══════════════════════════════════════════════

fn scan_skill_root(dir: &Path, source: &str, label: &str) -> Vec<SkillInfo> {
    let mut items = Vec::new();

    if !dir.exists() || !dir.is_dir() {
        return items;
    }

    // Walk directory looking for SKILL.md
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();

            // Check if this is a skill directory with SKILL.md
            let skill_md = if path.is_dir() {
                path.join("SKILL.md")
            } else if path.file_name().map_or(false, |f| f == "SKILL.md") {
                path.clone()
            } else {
                continue;
            };

            if !skill_md.exists() {
                // Check subdirectories
                if path.is_dir() {
                    if let Ok(sub_entries) = fs::read_dir(&path) {
                        for sub in sub_entries.flatten() {
                            let sub_path = sub.path();
                            if sub_path.is_dir() {
                                let sub_md = sub_path.join("SKILL.md");
                                if sub_md.exists() {
                                    if let Some(skill) =
                                        build_skill_info(&sub_path, &sub_md, source, label)
                                    {
                                        items.push(skill);
                                    }
                                }
                            }
                        }
                    }
                }
                continue;
            }

            if let Some(skill) = build_skill_info(&path, &skill_md, source, label) {
                items.push(skill);
            }
        }
    }

    // Also scan _disabled directory
    let disabled_dir = dir.parent().unwrap_or(dir).join("_disabled");
    if disabled_dir.exists() {
        if let Ok(entries) = fs::read_dir(&disabled_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                let skill_md = if path.is_dir() {
                    path.join("SKILL.md")
                } else {
                    continue;
                };
                if skill_md.exists() {
                    if let Some(mut skill) =
                        build_skill_info(&path, &skill_md, source, label)
                    {
                        skill.disabled = true;
                        items.push(skill);
                    }
                }
            }
        }
    }

    items
}

fn build_skill_info(skill_dir: &Path, skill_md: &Path, source: &str, label: &str) -> Option<SkillInfo> {
    let content = fs::read_to_string(skill_md).ok()?;
    let fm = parse_frontmatter(&content);

    let name = if fm.name.is_empty() {
        skill_dir
            .file_name()
            .map(|f| f.to_string_lossy().to_string())
            .unwrap_or_else(|| "unnamed".to_string())
    } else {
        fm.name
    };

    // Validate issues
    let mut issues = Vec::new();
    if content.len() > 8000 {
        issues.push("内容过长 (>8000 字符)".to_string());
    }
    if fm.description.is_empty() {
        issues.push("缺少描述".to_string());
    }
    if fm.triggers.is_empty() {
        issues.push("缺少触发词".to_string());
    }

    Some(SkillInfo {
        name,
        description: fm.description,
        source: source.to_string(),
        label: label.to_string(),
        dir: skill_dir.to_string_lossy().to_string(),
        content,
        hits: 0,
        last: 0,
        disabled: false,
        issues,
        copies: Vec::new(),
    })
}

// ══════════════════════════════════════════════
// Duplicate Detection
// ══════════════════════════════════════════════

fn detect_duplicates(items: &mut [SkillInfo]) {
    // Group by normalized name
    let mut groups: HashMap<String, Vec<usize>> = HashMap::new();
    for (i, item) in items.iter().enumerate() {
        let key = item.name.to_lowercase().replace(['-', '_'], " ");
        groups.entry(key).or_default().push(i);
    }

    // Mark duplicates
    for (_key, indices) in &groups {
        if indices.len() > 1 {
            let sources: Vec<String> = indices
                .iter()
                .map(|&i| format!("{}:{}", items[i].source, items[i].label))
                .collect();
            for &i in indices {
                items[i].copies = sources.clone();
            }
        }
    }
}

// ══════════════════════════════════════════════
// Commands
// ══════════════════════════════════════════════

#[tauri::command]
#[allow(unused_variables)]
pub async fn get_skills(app: tauri::AppHandle) -> Result<SkillsData, String> {
    let home = dirs::home_dir().unwrap_or_default();
    let stats = load_stats();
    let mut items = Vec::new();

    // Scan ~/.claude/skills/
    items.extend(scan_skill_root(
        &home.join(".claude").join("skills"),
        "claude",
        "Claude 全局",
    ));

    // Scan ~/.codex/skills/
    items.extend(scan_skill_root(
        &home.join(".codex").join("skills"),
        "codex",
        "Codex",
    ));

    // Scan project-level skills if workspace is set
    // Try to find project skills in common locations
    let project_dirs = vec![
        PathBuf::from(".claude/skills"),
        PathBuf::from(".codex/skills"),
    ];
    for pdir in project_dirs {
        if pdir.exists() {
            items.extend(scan_skill_root(&pdir, "project", "项目"));
        }
    }

    // Apply stats
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    for item in &mut items {
        let key = item.dir.clone();
        if let Some(stat) = stats.get(&key) {
            item.hits = stat.hits;
            item.last = stat.last;
        }
    }

    // Detect duplicates
    detect_duplicates(&mut items);

    // Calculate overview
    let total = items.len();
    let active = items.iter().filter(|s| !s.disabled).count();
    let dust_threshold = now.saturating_sub(45 * 24 * 3600);
    let dust = items
        .iter()
        .filter(|s| s.last > 0 && s.last < dust_threshold)
        .count();
    let issues_count = items.iter().filter(|s| !s.issues.is_empty()).count();
    let budget_chars: usize = items.iter().filter(|s| !s.disabled).map(|s| s.content.len()).sum();
    let budget_limit = 200_000; // 200K chars

    // Unique = items without copies
    let unique = items.iter().filter(|s| s.copies.is_empty() || s.copies.len() <= 1).count();

    let overview = SkillsOverview {
        total,
        unique,
        active,
        dust,
        issues: issues_count,
        budget_chars,
        budget_limit,
    };

    Ok(SkillsData { overview, items })
}

#[tauri::command]
pub async fn toggle_skill(dir: String, enable: bool) -> Result<(), String> {
    let skill_path = PathBuf::from(&dir);
    let skill_md = skill_path.join("SKILL.md");

    if !skill_md.exists() {
        return Err("SKILL.md not found".to_string());
    }

    let parent = skill_path
        .parent()
        .ok_or("Cannot determine parent directory")?;
    let skill_name = skill_path
        .file_name()
        .ok_or("Cannot determine skill name")?;

    if enable {
        // Move from _disabled/ to skills/
        let disabled_parent = parent;
        let skills_parent = disabled_parent
            .parent()
            .ok_or("Cannot find skills parent")?
            .join("skills");
        let target = skills_parent.join(skill_name);
        fs::create_dir_all(&skills_parent).map_err(|e| e.to_string())?;
        fs::rename(&skill_path, &target).map_err(|e| format!("Move failed: {}", e))?;
    } else {
        // Move from skills/ to _disabled/
        let skills_parent = parent;
        let disabled_parent = skills_parent
            .parent()
            .ok_or("Cannot find parent")?
            .join("_disabled");
        let target = disabled_parent.join(skill_name);
        fs::create_dir_all(&disabled_parent).map_err(|e| e.to_string())?;
        fs::rename(&skill_path, &target).map_err(|e| format!("Move failed: {}", e))?;
    }

    Ok(())
}

#[tauri::command]
pub async fn trash_skill(dir: String) -> Result<(), String> {
    let skill_path = PathBuf::from(&dir);
    if !skill_path.exists() {
        return Err("Skill directory not found".to_string());
    }

    let trash_dir = dirs::home_dir()
        .unwrap_or_default()
        .join(".yuai")
        .join("trash")
        .join("skills");

    let skill_name = skill_path
        .file_name()
        .ok_or("Cannot determine skill name")?;

    // Add timestamp to avoid conflicts
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let target = trash_dir.join(format!("{}_{}", skill_name.to_string_lossy(), now));

    fs::create_dir_all(&trash_dir).map_err(|e| e.to_string())?;
    fs::rename(&skill_path, &target).map_err(|e| format!("Move to trash failed: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn update_skill_stats(dir: String) -> Result<(), String> {
    let mut stats = load_stats();
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    let entry = stats.entry(dir).or_insert_with(SkillStats::default);
    entry.hits += 1;
    entry.last = now;

    save_stats(&stats)
}
