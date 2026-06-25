<template>
  <div class="preview-panel">
    <!-- Preview header with metadata -->
    <div class="preview-header" v-if="workspace.currentFile">
      <span class="preview-tab active">{{ workspace.currentFileName }}</span>
      <span class="preview-type-badge" v-if="fileType">{{ fileType }}</span>
      <span class="preview-size" v-if="fileSize">{{ fileSize }}</span>
      <span class="preview-meta-sep" v-if="lastModified">·</span>
      <span class="preview-modified" v-if="lastModified">{{ lastModified }}</span>
    </div>

    <div v-if="workspace.currentFile" class="preview-content">
      <!-- Code files: Monaco editor -->
      <MonacoEditor
        v-if="isCode"
        :modelValue="workspace.currentFileContent"
        :language="monacoLanguage"
        :readOnly="true"
        :theme="editorTheme"
      />

      <!-- Markdown: rendered + source toggle -->
      <div v-else-if="isMarkdown" class="preview-markdown">
        <div class="preview-md-toolbar">
          <button
            class="preview-toggle-btn"
            :class="{ active: !showMarkdownSource }"
            @click="showMarkdownSource = false"
          >
            渲染
          </button>
          <button
            class="preview-toggle-btn"
            :class="{ active: showMarkdownSource }"
            @click="showMarkdownSource = true"
          >
            源码
          </button>
        </div>
        <div v-if="showMarkdownSource" class="preview-md-source">
          <pre class="code-preview">{{ workspace.currentFileContent }}</pre>
        </div>
        <div v-else class="preview-md-rendered" v-html="renderedMarkdown"></div>
      </div>

      <!-- HTML: rendered in iframe -->
      <div v-else-if="isHtml" class="preview-html">
        <iframe
          :srcdoc="workspace.currentFileContent"
          class="html-iframe"
          sandbox="allow-scripts allow-same-origin"
          referrerpolicy="no-referrer"
        ></iframe>
      </div>

      <!-- Images -->
      <div v-else-if="isImage" class="preview-image">
        <img
          :src="fileDataUrl"
          :alt="workspace.currentFileName"
          class="image-view"
          @load="onImageLoad"
        />
        <div class="image-info" v-if="imageDimensions">
          {{ imageDimensions.width }} × {{ imageDimensions.height }}
        </div>
      </div>

      <!-- Video -->
      <div v-else-if="isVideo" class="preview-video">
        <video controls class="video-player">
          <source :src="fileDataUrl" />
          您的浏览器不支持视频播放
        </video>
      </div>

      <!-- Audio -->
      <div v-else-if="isAudio" class="preview-audio">
        <div class="audio-container">
          <span class="audio-icon">🎵</span>
          <span class="audio-name">{{ workspace.currentFileName }}</span>
          <audio controls class="audio-player">
            <source :src="fileDataUrl" />
            您的浏览器不支持音频播放
          </audio>
        </div>
      </div>

      <!-- PDF -->
      <div v-else-if="isPdf" class="preview-pdf">
        <iframe :src="fileDataUrl" class="pdf-iframe"></iframe>
      </div>

      <!-- CSV: table -->
      <div v-else-if="isCsv" class="preview-csv">
        <div class="csv-table-wrapper">
          <table class="csv-table">
            <thead v-if="csvData.length > 0">
              <tr>
                <th v-for="(cell, ci) in csvData[0]" :key="'h' + ci">{{ cell }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, ri) in csvData.slice(1)" :key="'r' + ri">
                <td v-for="(cell, ci) in row" :key="'c' + ci">{{ cell }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Archive: cannot preview -->
      <div v-else-if="isArchive" class="preview-unavailable">
        <span class="unavailable-icon">📦</span>
        <span class="unavailable-title">压缩文件</span>
        <span class="unavailable-desc">无法预览压缩文件，请在系统中打开。</span>
        <span class="unavailable-name">{{ workspace.currentFileName }}</span>
      </div>

      <!-- Other: file info + cannot preview -->
      <div v-else class="preview-unavailable">
        <span class="unavailable-icon">📄</span>
        <span class="unavailable-title">无法预览</span>
        <span class="unavailable-desc">此文件类型暂不支持预览。</span>
        <div class="unavailable-meta">
          <span>{{ workspace.currentFileName }}</span>
          <span v-if="fileSize">{{ fileSize }}</span>
          <span v-if="fileType">{{ fileType }}</span>
        </div>
      </div>
    </div>

    <!-- Preview empty state -->
    <div v-else class="preview-empty">
      <span class="preview-empty-glyph">覽</span>
      <span class="preview-empty-hint">选择文件以预览内容</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useWorkspaceStore } from "../stores/workspace";
import MonacoEditor from "../components/MonacoEditor.vue";

const workspace = useWorkspaceStore();
const showMarkdownSource = ref(false);
const imageDimensions = ref<{ width: number; height: number } | null>(null);

// ── File type detection ──

const ext = computed(() => {
  const name = workspace.currentFileName;
  return name.split(".").pop()?.toLowerCase() ?? "";
});

const codeExtensions = new Set([
  "js", "ts", "py", "rs", "go", "java", "c", "cpp", "h", "hpp",
  "css", "json", "yaml", "yml", "toml", "xml", "sql", "sh", "bash",
  "vue", "svelte", "jsx", "tsx", "rb", "php", "swift", "kt", "lua",
  "zig", "nim", "dart", "r", "m", "mm",
]);

const imageExtensions = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico"]);
const videoExtensions = new Set(["mp4", "webm", "mov", "avi"]);
const audioExtensions = new Set(["mp3", "wav", "ogg", "flac"]);
const archiveExtensions = new Set(["zip", "tar", "gz", "7z", "rar", "bz2", "xz"]);

const isCode = computed(() => codeExtensions.has(ext.value));
const isMarkdown = computed(() => ext.value === "md");
const isHtml = computed(() => ext.value === "html" || ext.value === "htm");
const isImage = computed(() => imageExtensions.has(ext.value));
const isVideo = computed(() => videoExtensions.has(ext.value));
const isAudio = computed(() => audioExtensions.has(ext.value));
const isPdf = computed(() => ext.value === "pdf");
const isCsv = computed(() => ext.value === "csv");
const isArchive = computed(() => archiveExtensions.has(ext.value));

// ── Monaco language mapping ──

const langMap: Record<string, string> = {
  js: "javascript", ts: "typescript", py: "python", rs: "rust",
  go: "go", java: "java", c: "c", cpp: "cpp", h: "c", hpp: "cpp",
  css: "css", json: "json", yaml: "yaml", yml: "yaml", toml: "toml",
  xml: "xml", sql: "sql", sh: "shell", bash: "shell",
  html: "html", htm: "html", vue: "html", svelte: "html",
  jsx: "javascript", tsx: "typescript", rb: "ruby", php: "php",
};

const monacoLanguage = computed(() => langMap[ext.value] ?? "plaintext");

// ── Theme detection ──

const editorTheme = computed(() => {
  // Could be wired to a settings store; default dark
  return "dark" as "dark" | "light";
});

// ── File metadata ──

const fileType = computed(() => {
  const e = ext.value;
  const types: Record<string, string> = {
    js: "JavaScript", ts: "TypeScript", py: "Python", rs: "Rust",
    go: "Go", java: "Java", c: "C", cpp: "C++", html: "HTML", htm: "HTML",
    css: "CSS", json: "JSON", yaml: "YAML", yml: "YAML", toml: "TOML",
    xml: "XML", sql: "SQL", sh: "Shell", md: "Markdown", vue: "Vue",
    png: "PNG", jpg: "JPEG", jpeg: "JPEG", gif: "GIF", webp: "WebP",
    svg: "SVG", mp4: "MP4", webm: "WebM", mp3: "MP3", wav: "WAV",
    pdf: "PDF", csv: "CSV", zip: "ZIP", tar: "TAR", gz: "Gzip",
    "7z": "7-Zip", rar: "RAR",
  };
  return types[e] ?? e.toUpperCase();
});

const fileSize = computed(() => {
  // We don't have file size from the store yet, so estimate from content length
  const content = workspace.currentFileContent;
  if (!content) return null;
  const bytes = new TextEncoder().encode(content).length;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
});

const lastModified = computed(() => {
  // Not available from store; placeholder
  return null;
});

// ── File data URL for media ──

const fileDataUrl = computed(() => {
  // For text-based previews (code, md, etc), we use content directly
  // For binary files (images, video, audio), we'd need the Tauri asset protocol
  // For now, create a data URL from text content for non-binary types
  if (isHtml.value) return workspace.currentFileContent;
  // For media files, we'd need invoke to get raw bytes; placeholder for now
  return "";
});

// ── Markdown rendering (simple inline converter) ──

const renderedMarkdown = computed(() => {
  if (!isMarkdown.value) return "";
  return simpleMarkdown(workspace.currentFileContent);
});

function simpleMarkdown(md: string): string {
  let html = md;

  // Escape HTML
  html = html
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // Code blocks
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, lang, code) => {
    return `<pre class="md-code-block"><code class="lang-${lang}">${code.trim()}</code></pre>`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, "<code class=\"md-inline-code\">$1</code>");

  // Headers
  html = html.replace(/^######\s+(.+)$/gm, "<h6>$1</h6>");
  html = html.replace(/^#####\s+(.+)$/gm, "<h5>$1</h5>");
  html = html.replace(/^####\s+(.+)$/gm, "<h4>$1</h4>");
  html = html.replace(/^###\s+(.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^##\s+(.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/^#\s+(.+)$/gm, "<h1>$1</h1>");

  // Bold and italic
  html = html.replace(/\*\*\*(.+?)\*\*\*/g, "<strong><em>$1</em></strong>");
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*(.+?)\*/g, "<em>$1</em>");

  // Links
  html = html.replace(
    /\[([^\]]+)\]\(([^)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener">$1</a>'
  );

  // Horizontal rule
  html = html.replace(/^---+$/gm, "<hr />");

  // Blockquotes
  html = html.replace(/^&gt;\s+(.+)$/gm, "<blockquote>$1</blockquote>");

  // Unordered lists
  html = html.replace(/^[-*]\s+(.+)$/gm, "<li>$1</li>");
  html = html.replace(/(<li>.*<\/li>\n?)+/g, "<ul>$&</ul>");

  // Paragraphs (lines that aren't already wrapped)
  html = html.replace(/^(?!<[a-z/])((?!^\s*$).+)$/gm, "<p>$1</p>");

  // Line breaks
  html = html.replace(/\n\n/g, "");
  html = html.replace(/\n/g, "<br />");

  return html;
}

// ── CSV parsing ──

const csvData = computed(() => {
  if (!isCsv.value) return [];
  const content = workspace.currentFileContent;
  if (!content) return [];

  const lines = content.split("\n").filter((l) => l.trim());
  return lines.map((line) => {
    const cells: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (ch === "," && !inQuotes) {
        cells.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    cells.push(current.trim());
    return cells;
  });
});

// ── Image dimensions ──

function onImageLoad(e: Event) {
  const img = e.target as HTMLImageElement;
  imageDimensions.value = { width: img.naturalWidth, height: img.naturalHeight };
}

// Reset on file change
watch(
  () => workspace.currentFile,
  () => {
    showMarkdownSource.value = false;
    imageDimensions.value = null;
  }
);
</script>
