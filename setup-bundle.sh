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
# Auto-download from GitHub releases, extract binary to bundle/<tool>/<platform>/
fetch_from_portable() {
    local repo="$1" tool_id="$2" plat="$3"
    local target_dir="$SCRIPT_DIR/bundle/$tool_id/$plat"
    local exe="$tool_id"
    [ "$plat" = "windows-x64" ] && exe="${exe}.exe"

    # Skip if already present
    [ -f "$target_dir/$exe" ] && { echo "  [skip] $tool_id/$plat (already present)"; return 0; }

    local tag
    tag=$(curl -fsSL "https://api.github.com/repos/$repo/releases/latest" 2>/dev/null | grep -m1 tag_name | cut -d '"' -f4)
    if [ -z "$tag" ]; then
        echo "  [warn] $tool_id/$plat — no release found in $repo"
        return 1
    fi

    mkdir -p "$target_dir"
    local tmpdir
    tmpdir=$(mktemp -d)

    echo "  [fetch] $tool_id/$plat ($tag) from $repo"

    # Try platform-specific asset names
    local asset_names=(
        "${tool_id}-${plat}.zip"
        "${tool_id}-${plat}.tar.gz"
        "${tool_id}-${plat}.tar.xz"
        "${repo##*/}-${plat}.zip"
        "${repo##*/}-${tag}-${plat}.zip"
    )

    local downloaded=0
    for asset in "${asset_names[@]}"; do
        local url="https://github.com/$repo/releases/download/$tag/$asset"
        if curl -fsSL --retry 2 --retry-delay 3 -o "$tmpdir/$asset" "$url" 2>/dev/null; then
            downloaded=1
            echo "    downloaded: $asset"
            # Extract
            case "$asset" in
                *.tar.gz|*.tgz)  tar -xzf "$tmpdir/$asset" -C "$tmpdir/extracted" 2>/dev/null || tar -xzf "$tmpdir/$asset" -C "$tmpdir" ;;
                *.tar.xz)        tar -xJf "$tmpdir/$asset" -C "$tmpdir/extracted" 2>/dev/null || tar -xJf "$tmpdir/$asset" -C "$tmpdir" ;;
                *.zip)           mkdir -p "$tmpdir/extracted"; unzip -qo "$tmpdir/$asset" -d "$tmpdir/extracted" 2>/dev/null || unzip -qo "$tmpdir/$asset" -d "$tmpdir" ;;
            esac
            break
        fi
    done

    if [ "$downloaded" = "0" ]; then
        echo "  [warn] $tool_id/$plat — no matching asset found in $repo $tag"
        echo "         Download manually from: https://github.com/$repo/releases/tag/$tag"
        rm -rf "$tmpdir"
        return 1
    fi

    # Find the binary in extracted content
    local found=""
    # Search in extract dir first, then tmpdir
    for search_dir in "$tmpdir/extracted" "$tmpdir"; do
        [ -d "$search_dir" ] || continue
        # Look for exact match
        found=$(find "$search_dir" -type f -name "$exe" 2>/dev/null | head -1)
        [ -n "$found" ] && break
        # Look for tool_id without extension
        found=$(find "$search_dir" -type f -name "$tool_id" 2>/dev/null | head -1)
        [ -n "$found" ] && break
        # Look for any executable with tool_id in name
        found=$(find "$search_dir" -type f \( -name "${tool_id}*" -o -name "${tool_id}.exe" \) ! -name '*.tar*' ! -name '*.zip' 2>/dev/null | head -1)
        [ -n "$found" ] && break
    done

    if [ -n "$found" ]; then
        cp "$found" "$target_dir/$exe"
        chmod +x "$target_dir/$exe" 2>/dev/null || true
        echo "    installed: $target_dir/$exe"
    else
        echo "  [warn] $tool_id/$plat — binary not found in archive"
        echo "         Contents:"
        find "$tmpdir" -type f 2>/dev/null | head -10 | sed 's/^/           /'
        echo "         Download manually from: https://github.com/$repo/releases/tag/$tag"
        rm -rf "$tmpdir"
        return 1
    fi

    rm -rf "$tmpdir"
    return 0
}

for plat in "${PLATFORMS[@]}"; do
    echo "[$plat]"
    fetch_codex "$plat" || echo "  [warn] codex/$plat fetch failed"
    fetch_cc_switch "$plat" || echo "  [warn] cc-switch/$plat fetch failed"
    fetch_from_portable "yuluyangguang1/claude-portable"   claude   "$plat" || true
    fetch_from_portable "yuluyangguang1/openclaw-portable" openclaw "$plat" || true
    fetch_from_portable "yuluyangguang1/hermes-portable"   hermes   "$plat" || true
done

echo ""
echo "[done] Bundle directory: $SCRIPT_DIR/bundle/"
ls -la "$SCRIPT_DIR/bundle/" 2>/dev/null
echo ""

# Count what's present
total=0
for tool in codex cc-switch claude openclaw hermes; do
    for plat in "${PLATFORMS[@]}"; do
        [ -d "$SCRIPT_DIR/bundle/$tool/$plat" ] && total=$((total + $(find "$SCRIPT_DIR/bundle/$tool/$plat" -type f | wc -l)))
    done
done
echo "Total binaries: $total"
[ "$total" -lt 4 ] && echo "Note: Some agents failed to download. Check warnings above."

# Create default agents.json if not exists
AGENTS_FILE="$SCRIPT_DIR/data/agents.json"
if [ ! -f "$AGENTS_FILE" ]; then
    mkdir -p "$SCRIPT_DIR/data"
    cat > "$AGENTS_FILE" << 'EOF'
[
  {"id":"claude","name":"claude","chinese_name":"梅","glyph":"梅","color":"#ff8c32","specialty":"编程、架构设计、代码审查","binary":"bundle/claude/{platform}/claude","config_type":"anthropic_env","enabled":true,"in_group":true},
  {"id":"codex","name":"codex","chinese_name":"兰","glyph":"兰","color":"#50c878","specialty":"编程、快速原型、OpenAI 生态","binary":"bundle/codex/{platform}/codex","config_type":"codex_toml","enabled":true,"in_group":true},
  {"id":"openclaw","name":"openclaw","chinese_name":"竹","glyph":"竹","color":"#ff6464","specialty":"内容生成、渠道运营、技能调用","binary":"bundle/openclaw/{platform}/openclaw","config_type":"openai_env","enabled":true,"in_group":true},
  {"id":"hermes","name":"hermes","chinese_name":"菊","glyph":"菊","color":"#a064ff","specialty":"记忆、学习、任务编排","binary":"bundle/hermes/{platform}/hermes","config_type":"openai_env","enabled":true,"in_group":true}
]
EOF
    echo "  [created] data/agents.json"
fi
