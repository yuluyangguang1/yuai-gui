<template>
  <div class="monaco-editor-wrapper" ref="wrapperRef">
    <div v-if="!monacoLoaded" class="monaco-fallback">
      <pre class="code-fallback"><code>{{ modelValue }}</code></pre>
    </div>
    <div v-show="monacoLoaded" ref="editorRef" class="monaco-container"></div>
    <div class="monaco-toolbar" v-if="monacoLoaded">
      <button
        class="monaco-btn"
        :class="{ active: wordWrap }"
        @click="toggleWordWrap"
        title="Toggle Word Wrap"
      >
        ↩
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from "vue";

const props = defineProps<{
  modelValue: string;
  language?: string;
  readOnly?: boolean;
  theme?: "dark" | "light";
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
}>();

const editorRef = ref<HTMLElement | null>(null);
const wrapperRef = ref<HTMLElement | null>(null);
const monacoLoaded = ref(false);
const wordWrap = ref(false);

let editor: any = null;
let monaco: any = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

// Map file extensions to Monaco language IDs
const langMap: Record<string, string> = {
  js: "javascript",
  ts: "typescript",
  py: "python",
  rs: "rust",
  go: "go",
  java: "java",
  c: "c",
  cpp: "cpp",
  h: "c",
  hpp: "cpp",
  html: "html",
  htm: "html",
  css: "css",
  json: "json",
  yaml: "yaml",
  yml: "yaml",
  toml: "toml",
  xml: "xml",
  sql: "sql",
  sh: "shell",
  bash: "shell",
  md: "markdown",
  vue: "html",
  svelte: "html",
};

function detectLanguage(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return langMap[ext] ?? "plaintext";
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Check if already loaded
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load ${src}`));
    document.head.appendChild(script);
  });
}

async function initMonaco() {
  try {
    // Load the AMD loader first
    const vsBase = "https://cdn.jsdelivr.net/npm/monaco-editor@0.52.0/min/vs";
    await loadScript(`${vsBase}/loader.min.js`);

    // Wait for require to be available
    await new Promise<void>((resolve) => {
      const check = () => {
        if ((window as any).require) resolve();
        else setTimeout(check, 50);
      };
      check();
    });

    const require = (window as any).require;
    require.config({ paths: { vs: vsBase } });

    monaco = await new Promise<any>((resolve) => {
      require(["vs/editor/editor.main"], (m: any) => {
        resolve(m);
      });
    });

    // Define dark theme (ink palette)
    monaco.editor.defineTheme("yuai-dark", {
      base: "vs-dark",
      inherit: true,
      rules: [
        { token: "comment", foreground: "6a737d", fontStyle: "italic" },
        { token: "keyword", foreground: "c586c0" },
        { token: "string", foreground: "ce9178" },
        { token: "number", foreground: "b5cea8" },
        { token: "type", foreground: "4ec9b0" },
      ],
      colors: {
        "editor.background": "#1a1a2e",
        "editor.foreground": "#d4d4d4",
        "editor.lineHighlightBackground": "#ffffff0a",
        "editorLineNumber.foreground": "#5a5a7a",
        "editorCursor.foreground": "#e0b0ff",
        "editor.selectionBackground": "#3a3a5c",
      },
    });

    // Define light theme (paper palette)
    monaco.editor.defineTheme("yuai-light", {
      base: "vs",
      inherit: true,
      rules: [
        { token: "comment", foreground: "6a737d", fontStyle: "italic" },
        { token: "keyword", foreground: "d73a49" },
        { token: "string", foreground: "032f62" },
        { token: "number", foreground: "005cc5" },
      ],
      colors: {
        "editor.background": "#faf8f5",
        "editor.foreground": "#24292e",
        "editorLineNumber.foreground": "#bbb5ac",
        "editorCursor.foreground": "#8b4513",
        "editor.selectionBackground": "#d4c5a9",
      },
    });

    if (!editorRef.value) return;

    const lang = props.language || "plaintext";

    editor = monaco.editor.create(editorRef.value, {
      value: props.modelValue,
      language: lang,
      theme: props.theme === "light" ? "yuai-light" : "yuai-dark",
      readOnly: props.readOnly ?? true,
      minimap: { enabled: true },
      lineNumbers: "on",
      wordWrap: wordWrap.value ? "on" : "off",
      scrollBeyondLastLine: false,
      automaticLayout: true,
      fontSize: 13,
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      padding: { top: 8 },
    });

    // Listen for changes (for auto-save)
    if (!props.readOnly) {
      editor.onDidChangeModelContent(() => {
        const value = editor.getValue();
        emit("update:modelValue", value);

        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(async () => {
          // Auto-save could be implemented here
          // For now just emit the value
        }, 800);
      });
    }

    monacoLoaded.value = true;
  } catch (err) {
    console.warn("Monaco editor failed to load, using fallback:", err);
    monacoLoaded.value = false;
  }
}

function toggleWordWrap() {
  wordWrap.value = !wordWrap.value;
  if (editor) {
    editor.updateOptions({ wordWrap: wordWrap.value ? "on" : "off" });
  }
}

// Watch for external value changes
watch(
  () => props.modelValue,
  (newVal) => {
    if (editor && monacoLoaded.value) {
      const currentValue = editor.getValue();
      if (currentValue !== newVal) {
        editor.setValue(newVal || "");
      }
    }
  }
);

// Watch for theme changes
watch(
  () => props.theme,
  (newTheme) => {
    if (editor && monaco) {
      monaco.editor.setTheme(newTheme === "light" ? "yuai-light" : "yuai-dark");
    }
  }
);

onMounted(async () => {
  await nextTick();
  await initMonaco();
});

onBeforeUnmount(() => {
  if (saveTimer) clearTimeout(saveTimer);
  if (editor) {
    editor.dispose();
    editor = null;
  }
});
</script>

<style scoped>
.monaco-editor-wrapper {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}

.monaco-container {
  flex: 1;
  min-height: 0;
}

.monaco-fallback {
  flex: 1;
  overflow: auto;
}

.code-fallback {
  margin: 0;
  padding: 12px;
  font-family: "JetBrains Mono", "Fira Code", monospace;
  font-size: 13px;
  line-height: 1.5;
  white-space: pre;
  color: var(--ink, #d4d4d4);
  background: var(--bg-code, #1a1a2e);
  min-height: 100%;
}

.monaco-toolbar {
  position: absolute;
  top: 4px;
  right: 8px;
  z-index: 10;
  display: flex;
  gap: 4px;
}

.monaco-btn {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 4px;
  color: var(--ink-muted, #888);
  cursor: pointer;
  padding: 2px 8px;
  font-size: 14px;
  transition: all 0.15s;
}

.monaco-btn:hover {
  background: rgba(255, 255, 255, 0.15);
  color: var(--ink, #d4d4d4);
}

.monaco-btn.active {
  background: rgba(224, 176, 255, 0.15);
  color: var(--gold, #e0b0ff);
  border-color: rgba(224, 176, 255, 0.3);
}
</style>
