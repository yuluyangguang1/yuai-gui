import { defineStore } from "pinia";
import { ref, computed } from "vue";

const STORAGE_KEY = "yuai-activation";

const ACTIVATION_PATTERN = /^YUAI-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;

function loadActivation(): string | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return raw;
  } catch { /* ignore */ }
  return null;
}

function saveActivation(code: string | null) {
  try {
    if (code) {
      localStorage.setItem(STORAGE_KEY, code);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch { /* ignore */ }
}

export const useActivationStore = defineStore("activation", () => {
  const activationCode = ref<string | null>(loadActivation());

  const isActivated = computed(() => activationCode.value !== null);

  function activate(code: string): { ok: boolean; error?: string } {
    const trimmed = code.trim().toUpperCase();
    if (!ACTIVATION_PATTERN.test(trimmed)) {
      return { ok: false, error: '格式不正确。应为 YUAI-XXXX-XXXX-XXXX' };
    }
    activationCode.value = trimmed;
    saveActivation(trimmed);
    return { ok: true };
  }

  function deactivate() {
    activationCode.value = null;
    saveActivation(null);
  }

  return { activationCode, isActivated, activate, deactivate };
});
