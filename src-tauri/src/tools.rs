//! Tool registry — describes the four bundled tools and how to find their binaries.

use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Copy)]
pub struct ToolDescriptor {
    pub id: &'static str,
    pub display_name: &'static str,
    pub glyph: &'static str,   // 中国风字符 — 匣 / 砚 / 刃 / 盒
    pub motto: &'static str,
    /// relative path under bundle/<id>/<platform>/ to the executable name
    pub bin_name_unix: &'static str,
    pub bin_name_windows: &'static str,
}

pub fn all_tools() -> Vec<ToolDescriptor> {
    vec![
        ToolDescriptor {
            id: "openclaw",
            display_name: "openclaw · 竹",
            glyph: "竹",
            motto: "为 应 物",
            bin_name_unix: "openclaw",
            bin_name_windows: "openclaw.exe",
        },
        ToolDescriptor {
            id: "hermes",
            display_name: "hermes · 菊",
            glyph: "菊",
            motto: "为 养 识",
            bin_name_unix: "hermes",
            bin_name_windows: "hermes.exe",
        },
        ToolDescriptor {
            id: "claude",
            display_name: "claude portable · 梅",
            glyph: "梅",
            motto: "为 编 程",
            bin_name_unix: "claude",
            bin_name_windows: "claude.exe",
        },
        ToolDescriptor {
            id: "codex",
            display_name: "codex portable · 兰",
            glyph: "兰",
            motto: "为 编 程",
            bin_name_unix: "codex",
            bin_name_windows: "codex.exe",
        },
    ]
}

#[cfg(target_os = "windows")]
pub fn platform_dir() -> &'static str { "windows-x64" }
#[cfg(all(target_os = "macos", target_arch = "aarch64"))]
pub fn platform_dir() -> &'static str { "macos-arm64" }
#[cfg(all(target_os = "macos", target_arch = "x86_64"))]
pub fn platform_dir() -> &'static str { "macos-x64" }
#[cfg(all(target_os = "linux", target_arch = "x86_64"))]
pub fn platform_dir() -> &'static str { "linux-x64" }
#[cfg(all(target_os = "linux", target_arch = "aarch64"))]
pub fn platform_dir() -> &'static str { "linux-arm64" }

impl ToolDescriptor {
    pub fn resolve_binary(&self, root: &Path) -> Option<PathBuf> {
        let bin_name = if cfg!(windows) { self.bin_name_windows } else { self.bin_name_unix };
        let p = root.join("bundle").join(self.id).join(platform_dir()).join(bin_name);
        Some(p)
    }
}

pub fn cc_switch_path(root: &Path) -> Option<PathBuf> {
    let bin_name = if cfg!(windows) { "cc-switch.exe" } else { "cc-switch" };
    let p = root.join("bundle").join("cc-switch").join(platform_dir()).join(bin_name);
    Some(p)
}
