import { onMounted, onUnmounted } from "vue";

interface KeyboardActions {
  toggleCommandPalette: () => void;
  toggleWorkspace: () => void;
  toggleTerminal: () => void;
  toggleDiffView: () => void;
  closeOverlays: () => void;
  switchToAgent: (index: number) => void;
  sendMessage: () => void;
}

export function useKeyboard(actions: KeyboardActions) {
  function handleKeydown(e: KeyboardEvent) {
    const mod = e.metaKey || e.ctrlKey;

    // Cmd+K / Ctrl+K: Toggle command palette
    if (mod && e.key === "k") {
      e.preventDefault();
      actions.toggleCommandPalette();
      return;
    }

    // Cmd+B / Ctrl+B: Toggle workspace sidebar
    if (mod && e.key === "b") {
      e.preventDefault();
      actions.toggleWorkspace();
      return;
    }

    // Cmd+J / Ctrl+J: Toggle terminal panel
    if (mod && e.key === "j") {
      e.preventDefault();
      actions.toggleTerminal();
      return;
    }

    // Cmd+\ / Ctrl+\: Toggle diff view
    if (mod && e.key === "\\") {
      e.preventDefault();
      actions.toggleDiffView();
      return;
    }

    // Escape: Close any open overlay
    if (e.key === "Escape") {
      actions.closeOverlays();
      return;
    }

    // Cmd+1-5: Switch to agent 1-5
    if (mod && e.key >= "1" && e.key <= "5") {
      e.preventDefault();
      actions.switchToAgent(parseInt(e.key) - 1);
      return;
    }

    // Cmd+Enter: Send chat message (only when not in textarea with Shift)
    if (mod && e.key === "Enter") {
      e.preventDefault();
      actions.sendMessage();
      return;
    }
  }

  onMounted(() => {
    document.addEventListener("keydown", handleKeydown);
  });

  onUnmounted(() => {
    document.removeEventListener("keydown", handleKeydown);
  });
}
