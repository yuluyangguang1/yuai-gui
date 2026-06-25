/**
 * useFileFollow — File Follow Mode (from FanBox)
 *
 * When an agent is running in the terminal, automatically track which file
 * the agent is editing and show it in the preview.
 */
import { ref, computed } from "vue";
import { useWorkspaceStore } from "../stores/workspace";

const followedAgentId = ref<string | null>(null);
let lastSwitchTime = 0;
let isFirstSwitch = true;
let userNavigated = false;

/** Minimum interval between auto-switches: 120ms first, 900ms after */
function canSwitch(): boolean {
  const now = Date.now();
  const minInterval = isFirstSwitch ? 120 : 900;
  if (now - lastSwitchTime < minInterval) return false;
  lastSwitchTime = now;
  isFirstSwitch = false;
  return true;
}

export function useFileFollow() {
  const workspace = useWorkspaceStore();

  const isFollowing = computed(() => followedAgentId.value !== null);

  /**
   * Start following files changed by a specific agent.
   * The workspace store's file-changed listener will call followFile
   * when a file change arrives from the followed agent's workspace.
   */
  function followAgent(agentId: string) {
    followedAgentId.value = agentId;
    userNavigated = false;
    isFirstSwitch = true;
    lastSwitchTime = 0;
  }

  /** Stop following. */
  function unfollow() {
    followedAgentId.value = null;
  }

  /**
   * Called by the workspace file-changed event handler.
   * If we're following and the change is relevant, auto-navigate.
   */
  function onFileChanged(filePath: string) {
    if (!followedAgentId.value) return;
    if (userNavigated) return;
    if (!canSwitch()) return;

    // Auto-select the file in the workspace store
    workspace.selectFile(filePath);
  }

  /**
   * Called when the user manually selects a file (clicks in tree, etc.)
   * This disables auto-follow navigation until re-enabled.
   */
  function onUserNavigation() {
    if (followedAgentId.value) {
      userNavigated = true;
    }
  }

  return {
    followedAgentId,
    isFollowing,
    followAgent,
    unfollow,
    onFileChanged,
    onUserNavigation,
  };
}
