import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useSettingsStore } from '../settings';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
  };
})();

// Mock document.documentElement
const mockSetAttribute = vi.fn();

describe('useSettingsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorageMock.clear();
    vi.clearAllMocks();

    // Setup mocks
    Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock });
    Object.defineProperty(document.documentElement, 'setAttribute', {
      value: mockSetAttribute,
      writable: true,
    });
  });

  it('initializes with dark theme by default', () => {
    const store = useSettingsStore();
    expect(store.theme).toBe('dark');
  });

  it('loads saved theme from localStorage', () => {
    localStorageMock.getItem.mockReturnValueOnce('light');
    const store = useSettingsStore();
    expect(store.theme).toBe('light');
  });

  it('ignores invalid theme in localStorage', () => {
    localStorageMock.getItem.mockReturnValueOnce('invalid-theme');
    const store = useSettingsStore();
    expect(store.theme).toBe('dark');
  });

  it('toggleTheme cycles through themes', () => {
    const store = useSettingsStore();
    expect(store.theme).toBe('dark');

    store.toggleTheme();
    expect(store.theme).toBe('light');

    store.toggleTheme();
    expect(store.theme).toBe('volt');

    store.toggleTheme();
    expect(store.theme).toBe('warm');

    store.toggleTheme();
    expect(store.theme).toBe('editorial');

    store.toggleTheme();
    expect(store.theme).toBe('dark');
  });

  it('setTheme sets specific theme', () => {
    const store = useSettingsStore();
    store.setTheme('warm');
    expect(store.theme).toBe('warm');
  });

  it('setTheme applies theme to DOM', () => {
    const store = useSettingsStore();
    store.setTheme('light');
    expect(mockSetAttribute).toHaveBeenCalledWith('data-theme', 'light');
  });

  it('setTheme saves to localStorage', () => {
    const store = useSettingsStore();
    store.setTheme('volt');
    expect(localStorageMock.setItem).toHaveBeenCalledWith('yuai-theme', 'volt');
  });

  it('toggleTheme saves to localStorage', () => {
    const store = useSettingsStore();
    store.toggleTheme();
    expect(localStorageMock.setItem).toHaveBeenCalledWith('yuai-theme', 'light');
  });

  it('all theme values are valid ThemeMode types', () => {
    const store = useSettingsStore();
    const validThemes = ['dark', 'light', 'volt', 'warm', 'editorial'];

    for (const theme of validThemes) {
      store.setTheme(theme as any);
      expect(store.theme).toBe(theme);
    }
  });
});
