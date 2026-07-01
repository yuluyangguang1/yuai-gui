/**
 * Named Config Profiles — 参考 Roo-Code 命名配置文件
 * 用户可保存多套 provider 配置, 每个 agent 模式可分配不同配置
 */

// ══════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════

export interface ProviderProfile {
  /** Unique profile ID */
  id: string;
  /** Display name (e.g. "Work - OpenAI", "Personal - MiMo") */
  name: string;
  /** Provider ID (e.g. "openai", "anthropic", "xiaomi") */
  providerId: string;
  /** Model ID (e.g. "gpt-4o", "claude-sonnet-4") */
  modelId: string;
  /** API Key (encrypted in storage) */
  apiKey?: string;
  /** Base URL override */
  baseUrl?: string;
  /** When this profile was created */
  createdAt: number;
  /** When this profile was last used */
  lastUsedAt?: number;
}

export interface ProfileModeMapping {
  /** Mode name (e.g. "code", "chat", "review") */
  mode: string;
  /** Profile ID to use for this mode */
  profileId: string;
}

// ══════════════════════════════════════════════
// Named Config Profile Manager
// ══════════════════════════════════════════════

const STORAGE_KEY = 'yuai-provider-profiles';
const MAPPING_KEY = 'yuai-profile-mappings';

export class NamedProfileManager {
  private profiles = new Map<string, ProviderProfile>();
  private mappings = new Map<string, string>(); // mode → profileId

  constructor() {
    this.loadFromStorage();
  }

  /** Create a new profile */
  create(profile: Omit<ProviderProfile, 'id' | 'createdAt'>): ProviderProfile {
    const id = `profile-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const full: ProviderProfile = { ...profile, id, createdAt: Date.now() };
    this.profiles.set(id, full);
    this.saveToStorage();
    return full;
  }

  /** Update an existing profile */
  update(id: string, changes: Partial<ProviderProfile>): void {
    const existing = this.profiles.get(id);
    if (!existing) return;
    const { id: _, createdAt: __, ...safeChanges } = changes;
    this.profiles.set(id, { ...existing, ...safeChanges });
    this.saveToStorage();
  }

  /** Delete a profile */
  delete(id: string): void {
    this.profiles.delete(id);
    // Remove any mode mappings pointing to this profile
    for (const [mode, pid] of this.mappings) {
      if (pid === id) this.mappings.delete(mode);
    }
    this.saveToStorage();
    this.saveMappings();
  }

  /** Get a profile by ID */
  get(id: string): ProviderProfile | undefined {
    return this.profiles.get(id);
  }

  /** Get all profiles */
  getAll(): ProviderProfile[] {
    return Array.from(this.profiles.values())
      .sort((a, b) => (b.lastUsedAt ?? b.createdAt) - (a.lastUsedAt ?? a.createdAt));
  }

  /** Set mode → profile mapping */
  setModeMapping(mode: string, profileId: string): void {
    this.mappings.set(mode, profileId);
    this.saveMappings();
  }

  /** Get profile for a mode */
  getForMode(mode: string): ProviderProfile | undefined {
    const profileId = this.mappings.get(mode);
    if (!profileId) return undefined;
    const profile = this.profiles.get(profileId);
    if (profile) {
      profile.lastUsedAt = Date.now();
      this.saveToStorage();
    }
    return profile;
  }

  /** Get all mode mappings */
  getModeMappings(): ProfileModeMapping[] {
    return Array.from(this.mappings.entries()).map(([mode, profileId]) => ({ mode, profileId }));
  }

  /** Mark a profile as used */
  markUsed(id: string): void {
    const profile = this.profiles.get(id);
    if (profile) {
      profile.lastUsedAt = Date.now();
      this.saveToStorage();
    }
  }

  private loadFromStorage(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const data = JSON.parse(raw) as ProviderProfile[];
        for (const p of data) this.profiles.set(p.id, p);
      }
      const rawMappings = localStorage.getItem(MAPPING_KEY);
      if (rawMappings) {
        const data = JSON.parse(rawMappings) as ProfileModeMapping[];
        for (const m of data) this.mappings.set(m.mode, m.profileId);
      }
    } catch { /* ignore */ }
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.getAll()));
    } catch { /* ignore */ }
  }

  private saveMappings(): void {
    try {
      localStorage.setItem(MAPPING_KEY, JSON.stringify(this.getModeMappings()));
    } catch { /* ignore */ }
  }
}

// Singleton
export const globalNamedProfiles = new NamedProfileManager();
