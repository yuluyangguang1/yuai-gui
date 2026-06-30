import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { invoke } from "@tauri-apps/api/core";

export type KanbanTaskStatus =
  | "triage"
  | "todo"
  | "scheduled"
  | "ready"
  | "running"
  | "blocked"
  | "review"
  | "done"
  | "archived";

export interface KanbanTask {
  id: string;
  title: string;
  body: string | null;
  assignee: string | null;
  status: KanbanTaskStatus;
  priority: number;
  created_by: string | null;
  created_at: number;
  started_at: number | null;
  completed_at: number | null;
  workspace_kind: string;
  workspace_path: string | null;
  tenant: string | null;
  result: string | null;
  skills: string[] | null;
}

export interface KanbanBoard {
  slug: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  created_at: number | null;
  archived: boolean;
  counts: Record<string, number>;
  total: number;
}

export interface KanbanStats {
  by_status: Record<string, number>;
  by_assignee: Record<string, number>;
  total: number;
}

export interface KanbanAssignee {
  name: string;
  on_disk: boolean;
  counts: Record<string, number> | null;
}

export const KANBAN_COLUMNS: KanbanTaskStatus[] = [
  "triage",
  "todo",
  "ready",
  "running",
  "blocked",
  "review",
  "done",
];

export const KANBAN_STATUS_LABELS: Record<string, string> = {
  triage: "分类",
  todo: "待办",
  scheduled: "计划",
  ready: "就绪",
  running: "执行中",
  blocked: "阻塞",
  review: "审查",
  done: "完成",
  archived: "归档",
};

export const KANBAN_STATUS_ICONS: Record<string, string> = {
  triage: "circle",
  todo: "○",
  scheduled: "loader",
  ready: "eye",
  running: "check",
  blocked: "ban",
  review: "archive",
  done: "✓",
  archived: "▪",
};

export const KANBAN_STATUS_COLORS: Record<string, string> = {
  triage: "#94a3b8",
  todo: "#38bdf8",
  scheduled: "#06b6d4",
  ready: "#f59e0b",
  running: "#8b5cf6",
  blocked: "#ef4444",
  review: "#ec4899",
  done: "#22c55e",
  archived: "#64748b",
};

export const useKanbanStore = defineStore("kanban", () => {
  const tasks = ref<KanbanTask[]>([]);
  const boards = ref<KanbanBoard[]>([]);
  const stats = ref<KanbanStats | null>(null);
  const assignees = ref<KanbanAssignee[]>([]);
  const selectedBoard = ref("default");
  const loading = ref(false);
  const filterStatus = ref<string | null>(null);
  const filterAssignee = ref<string | null>(null);
  const selectedTaskId = ref<string | null>(null);

  const tasksByStatus = computed(() => {
    const map: Record<string, KanbanTask[]> = {};
    for (const col of KANBAN_COLUMNS) {
      map[col] = [];
    }
    for (const task of tasks.value) {
      if (task.status === "archived") continue;
      if (!map[task.status]) map[task.status] = [];
      map[task.status].push(task);
    }
    // Sort by priority (high first), then created_at (newest first)
    for (const col of KANBAN_COLUMNS) {
      map[col].sort((a, b) => {
        if (b.priority !== a.priority) return b.priority - a.priority;
        return b.created_at - a.created_at;
      });
    }
    return map;
  });

  const activeBoards = computed(() => {
    return boards.value.filter((b) => !b.archived);
  });

  async function fetchBoards(includeArchived = false) {
    try {
      const result: KanbanBoard[] = await invoke("kanban_list_boards", {
        includeArchived,
      });
      boards.value = result;
    } catch (e) {
      console.error("Failed to fetch boards:", e);
    }
  }

  async function fetchTasks() {
    loading.value = true;
    try {
      const result: KanbanTask[] = await invoke("kanban_list_tasks", {
        board: selectedBoard.value,
        status: filterStatus.value || undefined,
        assignee: filterAssignee.value || undefined,
        includeArchived: true,
      });
      tasks.value = result;
    } catch (e) {
      console.error("Failed to fetch tasks:", e);
    } finally {
      loading.value = false;
    }
  }

  async function fetchStats() {
    try {
      const result: KanbanStats = await invoke("kanban_get_stats", {
        board: selectedBoard.value,
      });
      stats.value = result;
    } catch (e) {
      console.error("Failed to fetch stats:", e);
    }
  }

  async function fetchAssignees() {
    try {
      const result: KanbanAssignee[] = await invoke("kanban_get_assignees", {
        board: selectedBoard.value,
      });
      assignees.value = result;
    } catch (e) {
      console.error("Failed to fetch assignees:", e);
    }
  }

  async function createTask(data: {
    title: string;
    body?: string;
    assignee?: string;
    priority?: number;
  }) {
    try {
      const task: KanbanTask = await invoke("kanban_create_task", {
        data,
        board: selectedBoard.value,
      });
      tasks.value.unshift(task);
      await Promise.all([fetchStats(), fetchBoards()]);
      return task;
    } catch (e) { console.error('[Kanban] createTask failed:', e); }
  }

  async function completeTasks(taskIds: string[], summary?: string) {
    try {
      await invoke("kanban_complete_tasks", {
        taskIds,
        summary,
        board: selectedBoard.value,
      });
      for (const id of taskIds) {
        const task = tasks.value.find((t) => t.id === id);
        if (task) task.status = "done";
      }
      await Promise.all([fetchStats(), fetchBoards()]);
    } catch (e) { console.error('[Kanban] completeTasks failed:', e); }
  }

  async function blockTask(taskId: string, reason: string) {
    try {
      await invoke("kanban_block_task", {
        taskId,
        reason,
        board: selectedBoard.value,
      });
      const task = tasks.value.find((t) => t.id === taskId);
      if (task) task.status = "blocked";
      await Promise.all([fetchStats(), fetchBoards()]);
    } catch (e) { console.error('[Kanban] blockTask failed:', e); }
  }

  async function unblockTasks(taskIds: string[]) {
    try {
      await invoke("kanban_unblock_tasks", {
        taskIds,
        board: selectedBoard.value,
      });
      for (const id of taskIds) {
        const task = tasks.value.find((t) => t.id === id);
        if (task) task.status = "ready";
      }
      await Promise.all([fetchStats(), fetchBoards()]);
    } catch (e) { console.error('[Kanban] unblockTasks failed:', e); }
  }

  async function assignTask(taskId: string, profile: string) {
    try {
      await invoke("kanban_assign_task", {
        taskId,
        profile,
        board: selectedBoard.value,
      });
      const task = tasks.value.find((t) => t.id === taskId);
      if (task) task.assignee = profile;
      await Promise.all([fetchStats(), fetchAssignees()]);
    } catch (e) { console.error('[Kanban] assignTask failed:', e); }
  }

  async function refreshAll() {
    await Promise.all([fetchBoards(), fetchTasks(), fetchStats(), fetchAssignees()]);
  }

  function setBoard(board: string) {
    selectedBoard.value = board;
    selectedTaskId.value = null;
  }

  function setFilter(key: "status" | "assignee", value: string | null) {
    if (key === "status") filterStatus.value = value;
    else filterAssignee.value = value;
  }

  function timeAgo(ts: number): string {
    const diff = Date.now() / 1000 - ts;
    if (diff < 60) return "刚刚";
    if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
    if (diff < 45 * 86400) return `${Math.floor(diff / 86400)} 天前`;
    return `${Math.floor(diff / (30 * 86400))} 月前`;
  }

  return {
    tasks,
    boards,
    stats,
    assignees,
    selectedBoard,
    loading,
    filterStatus,
    filterAssignee,
    selectedTaskId,
    tasksByStatus,
    activeBoards,
    fetchBoards,
    fetchTasks,
    fetchStats,
    fetchAssignees,
    createTask,
    completeTasks,
    blockTask,
    unblockTasks,
    assignTask,
    refreshAll,
    setBoard,
    setFilter,
    timeAgo,
  };
});
