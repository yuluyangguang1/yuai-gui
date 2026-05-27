#!/bin/bash
# Pull the four portable tools' binaries from their GitHub releases into ./bundle/
# Used for local testing of yuai-gui.
#
# Usage:
#   bash setup-bundle.sh                 # current platform only
#   bash setup-bundle.sh --all-platforms # all platforms (for distribution)

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

ALL=0
[ "${1:-}" = "--all-platforms" ] && ALL=1

OS="$(uname -s)"
ARCH="$(uname -m)"

current_label() {
    case "$OS-$ARCH" in
        Darwin-arm64)  echo macos-arm64 ;;
        Darwin-x86_64) echo macos-x64 ;;
        Linux-x86_64)  echo linux-x64 ;;
        Linux-aarch64) echo linux-arm64 ;;
        *) echo "" ;;
    esac
}

PLATFORMS=()
if [ "$ALL" = "1" ]; then
    PLATFORMS=(macos-arm64 macos-x64 linux-x64 windows-x64)
else
    p=$(current_label)
    [ -z "$p" ] && { echo "[!] unsupported platform: $OS-$ARCH"; exit 1; }
    PLATFORMS=("$p")
fi

mkdir -p "$SCRIPT_DIR/bundle"

# 1. Codex CLI — direct download from openai/codex releases
fetch_codex() {
    local plat="$1"
    local target_dir="$SCRIPT_DIR/bundle/codex/$plat"
    local exe; case "$plat" in
        macos-arm64)   exe=codex; archive="codex-aarch64-apple-darwin.tar.gz" ;;
        macos-x64)     exe=codex; archive="codex-x86_64-apple-darwin.tar.gz" ;;
        linux-x64)     exe=codex; archive="codex-x86_64-unknown-linux-musl.tar.gz" ;;
        windows-x64)   exe=codex.exe; archive="codex-x86_64-pc-windows-msvc.exe.tar.gz" ;;
        *) return 1 ;;
    esac
    [ -f "$target_dir/$exe" ] && { echo "  [skip] codex/$plat (already present)"; return 0; }
    mkdir -p "$target_dir"
    local tag
    tag=$(curl -fsSL https://api.github.com/repos/openai/codex/releases/latest | grep -m1 tag_name | cut -d '"' -f4)
    echo "  [fetch] codex/$plat ($tag)"
    curl -fsSL "https://github.com/openai/codex/releases/download/$tag/$archive" | tar -xz -C "$target_dir"
    if [ ! -f "$target_dir/$exe" ]; then
        local found
        found=$(find "$target_dir" -maxdepth 2 -type f \( -name 'codex' -o -name 'codex.exe' -o -name 'codex-*' \) | head -1)
        [ -n "$found" ] && mv "$found" "$target_dir/$exe"
    fi
    chmod +x "$target_dir/$exe" 2>/dev/null || true
}

# 2. cc-switch — from codex-portable's auxiliary release
fetch_cc_switch() {
    local plat="$1"
    local target_dir="$SCRIPT_DIR/bundle/cc-switch/$plat"
    local exe; local asset
    case "$plat" in
        macos-arm64|macos-x64) exe=cc-switch; asset=cc-switch-macos ;;
        linux-x64)             exe=cc-switch; asset=cc-switch-linux-x64 ;;
        windows-x64)           exe=cc-switch.exe; asset=cc-switch-windows-x64.exe ;;
        *) return 1 ;;
    esac
    [ -f "$target_dir/$exe" ] && { echo "  [skip] cc-switch/$plat (already present)"; return 0; }
    mkdir -p "$target_dir"
    echo "  [fetch] cc-switch/$plat"
    curl -fsSL -o "$target_dir/$exe" \
      "https://github.com/yuluyangguang1/codex-portable/releases/download/cc-switch-assets/$asset"
    chmod +x "$target_dir/$exe" 2>/dev/null || true
}

# 3. Claude / OpenClaw / Hermes — pulled from their portable releases
# These ship as zip bundles; we extract just the binary we need.
fetch_from_portable_zip() {
    local repo="$1" tool_id="$2" plat="$3" inner_path="$4"
    local target_dir="$SCRIPT_DIR/bundle/$tool_id/$plat"
    local exe="${inner_path##*/}"
    [ -f "$target_dir/$exe" ] && { echo "  [skip] $tool_id/$plat (already present)"; return 0; }
    mkdir -p "$target_dir"

    local tag
    tag=$(curl -fsSL "https://api.github.com/repos/$repo/releases/latest" 2>/dev/null | grep -m1 tag_name | cut -d '"' -f4)
    if [ -z "$tag" ]; then
        echo "  [skip] $tool_id/$plat (no release found in $repo)"
        return 0
    fi

    echo "  [info] $tool_id/$plat — please drop binary manually:"
    echo "         wanted at: $target_dir/$exe"
    echo "         source:    https://github.com/$repo/releases (tag: $tag)"
    return 0
}

for plat in "${PLATFORMS[@]}"; do
    echo "[$plat]"
    fetch_codex "$plat" || echo "  [warn] codex/$plat fetch failed"
    fetch_cc_switch "$plat" || echo "  [warn] cc-switch/$plat fetch failed"
    fetch_from_portable_zip "yuluyangguang1/claude-portable"   claude   "$plat" "bin/$plat/claude"
    fetch_from_portable_zip "yuluyangguang1/openclaw-portable" openclaw "$plat" "app/openclaw"
    fetch_from_portable_zip "yuluyangguang1/hermes-portable"   hermes   "$plat" "bin/$plat/hermes"
done

echo ""
echo "[done] Bundle directory: $SCRIPT_DIR/bundle/"
echo ""
echo "Note: claude/openclaw/hermes binaries need to be dropped manually for now."
echo "      Auto-fetch from those repos will be added once their zip layout stabilizes."

# Create default agents.json if not exists
AGENTS_FILE="$SCRIPT_DIR/data/agents.json"
if [ ! -f "$AGENTS_FILE" ]; then
    mkdir -p "$SCRIPT_DIR/data"
    cat > "$AGENTS_FILE" << 'EOF'
[
  {"id":"claude","name":"claude","chinese_name":"利刃","glyph":"刃","color":"#ff8c32","specialty":"编程、架构设计、代码审查","binary":"bundle/claude/{platform}/claude","config_type":"anthropic_env","enabled":true,"in_group":true},
  {"id":"codex","name":"codex","chinese_name":"方盒","glyph":"盒","color":"#50c878","specialty":"编程、快速原型、OpenAI 生态","binary":"bundle/codex/{platform}/codex","config_type":"codex_toml","enabled":true,"in_group":true},
  {"id":"openclaw","name":"openclaw","chinese_name":"百川","glyph":"匣","color":"#ff6464","specialty":"内容生成、渠道运营、技能调用","binary":"bundle/openclaw/{platform}/openclaw","config_type":"openai_env","enabled":true,"in_group":true},
  {"id":"hermes","name":"hermes","chinese_name":"砚墨","glyph":"砚","color":"#a064ff","specialty":"记忆、学习、任务编排","binary":"bundle/hermes/{platform}/hermes","config_type":"openai_env","enabled":true,"in_group":true}
]
EOF
    echo "  [created] data/agents.json"
fi
