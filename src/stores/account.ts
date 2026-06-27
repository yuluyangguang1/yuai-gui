import { defineStore } from "pinia";
import { ref, computed } from "vue";

export interface User {
  id: string;
  name: string;
  email: string;
  avatar: string;
}

interface StoredUser extends User {
  passwordHash: string;
}

const STORAGE_KEY = "yuai-accounts";
const SESSION_KEY = "yuai-session";

function loadAccounts(): StoredUser[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return [];
}

function saveAccounts(accounts: StoredUser[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(accounts));
  } catch { /* ignore */ }
}

function simpleHash(s: string): string {
  // Simple hash for local-only use (not cryptographically secure)
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return 'h_' + Math.abs(h).toString(36);
}

function loadSession(): User | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return null;
}

function saveSession(user: User | null) {
  try {
    if (user) {
      localStorage.setItem(SESSION_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(SESSION_KEY);
    }
  } catch { /* ignore */ }
}

export const useAccountStore = defineStore("account", () => {
  const user = ref<User | null>(loadSession());

  const isLoggedIn = computed(() => user.value !== null);

  function login(email: string, password: string): { ok: boolean; error?: string } {
    const accounts = loadAccounts();
    const hash = simpleHash(password);
    const found = accounts.find(a => a.email === email && a.passwordHash === hash);
    if (!found) {
      return { ok: false, error: '邮箱或密码错误' };
    }
    const u: User = { id: found.id, name: found.name, email: found.email, avatar: found.avatar };
    user.value = u;
    saveSession(u);
    return { ok: true };
  }

  function logout() {
    user.value = null;
    saveSession(null);
  }

  function register(name: string, email: string, password: string): { ok: boolean; error?: string } {
    const accounts = loadAccounts();
    if (accounts.find(a => a.email === email)) {
      return { ok: false, error: '该邮箱已注册' };
    }
    if (!name.trim() || !email.trim() || !password.trim()) {
      return { ok: false, error: '请填写所有字段' };
    }
    if (password.length < 4) {
      return { ok: false, error: '密码至少4位' };
    }
    const newUser: StoredUser = {
      id: crypto.randomUUID(),
      name: name.trim(),
      email: email.trim(),
      avatar: name.trim().charAt(0).toUpperCase(),
      passwordHash: simpleHash(password),
    };
    accounts.push(newUser);
    saveAccounts(accounts);
    // Auto-login
    const u: User = { id: newUser.id, name: newUser.name, email: newUser.email, avatar: newUser.avatar };
    user.value = u;
    saveSession(u);
    return { ok: true };
  }

  return { user, isLoggedIn, login, logout, register };
});
