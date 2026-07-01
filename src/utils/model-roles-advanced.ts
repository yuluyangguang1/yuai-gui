/**
 * Model Roles — 参考 Continue 8角色 + Aider 三层模型
 * 不同任务用不同模型: chat/edit/autocomplete/embed/summarize/subagent/weak/editor
 */

// ══════════════════════════════════════════════
// Types
// ══════════════════════════════════════════════

export type ModelRole =
  | 'chat'          // 主对话模型
  | 'edit'          // 代码编辑模型
  | 'autocomplete'  // Tab 补全模型
  | 'embed'         // 嵌入向量模型
  | 'summarize'     // 摘要/压缩模型
  | 'subagent'      // 子 Agent 模型
  | 'weak'          // 弱模型 (commit message 等)
  | 'editor';       // 编辑器模型 (architect 模式)

export const MODEL_ROLE_LABELS: Record<ModelRole, string> = {
  chat: '对话',
  edit: '编辑',
  autocomplete: '补全',
  embed: '嵌入',
  summarize: '摘要',
  subagent: '子Agent',
  weak: '弱模型',
  editor: '编辑器',
};

export const MODEL_ROLE_ICONS: Record<ModelRole, string> = {
  chat: 'messageCircle',
  edit: 'code',
  autocomplete: 'keyboard',
  embed: 'vectorBezier',
  summarize: 'fileText',
  subagent: 'users',
  weak: 'moodSad',
  editor: 'pencil',
};

export interface ModelRoleAssignment {
  role: ModelRole;
  providerId: string;
  modelId: string;
  /** Override effort level for this role */
  effort?: string;
}

// ══════════════════════════════════════════════
// Model Role Manager
// ══════════════════════════════════════════════

const STORAGE_KEY = 'yuai-model-roles';

export class ModelRoleManager {
  private assignments = new Map<ModelRole, ModelRoleAssignment>();

  constructor() {
    this.loadFromStorage();
  }

  /** Set model for a role */
  setRole(role: ModelRole, providerId: string, modelId: string, effort?: string): void {
    this.assignments.set(role, { role, providerId, modelId, effort });
    this.saveToStorage();
  }

  /** Get model for a role */
  getRole(role: ModelRole): ModelRoleAssignment | undefined {
    return this.assignments.get(role);
  }

  /** Get provider+model for a role, falls back to chat role */
  resolve(role: ModelRole): { providerId: string; modelId: string } | undefined {
    const assignment = this.assignments.get(role);
    if (assignment) return { providerId: assignment.providerId, modelId: assignment.modelId };
    // Fallback: weak/editor → chat, autocomplete → chat
    if (role === 'weak' || role === 'editor' || role === 'autocomplete') {
      return this.resolve('chat');
    }
    return undefined;
  }

  /** Get all assignments */
  getAll(): ModelRoleAssignment[] {
    return Array.from(this.assignments.values());
  }

  /** Check if a role has an assignment */
  hasRole(role: ModelRole): boolean {
    return this.assignments.has(role);
  }

  /** Clear a role assignment */
  clearRole(role: ModelRole): void {
    this.assignments.delete(role);
    this.saveToStorage();
  }

  private loadFromStorage(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const data = JSON.parse(raw) as ModelRoleAssignment[];
      for (const a of data) {
        this.assignments.set(a.role, a);
      }
    } catch { /* ignore */ }
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.getAll()));
    } catch { /* ignore */ }
  }
}

// Singleton
export const globalModelRoles = new ModelRoleManager();
