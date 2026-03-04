// ============================================================
// Re-export shared types (single source of truth: src/types.ts)
// ============================================================

export type {
  Workspace,
  Project,
  Task,
  Comment,
  TaskDependency,
  DependencyInfo,
  TaskStatus,
  TaskPriority,
  TaskRole,
  WsEvent,
} from '../types.js';

// ============================================================
// Server-only: Create / Update DTOs
// ============================================================

import type { TaskStatus, TaskPriority, TaskRole } from '../types.js';

export interface CreateWorkspaceInput {
  name: string;
  description?: string;
}

export interface CreateProjectInput {
  workspace_id: string;
  name: string;
  description?: string;
}

export interface CreateTaskInput {
  project_id: string;
  title: string;
  description?: string;
  priority?: TaskPriority;
  role?: TaskRole;
  parent_id?: string;
  depends_on?: string[];
}

export interface UpdateTaskInput {
  status?: TaskStatus;
  priority?: TaskPriority;
  role?: TaskRole;
  agent_name?: string | null;
  is_blocked?: boolean;
  blocked_reason?: string | null;
}

export interface CreateCommentInput {
  task_id: string;
  content: string;
  author: string;
}

// ============================================================
// Server-only: DB row types (is_blocked is INTEGER 0/1 in SQLite)
// ============================================================

export interface TaskRow {
  id: string;
  project_id: string;
  parent_id: string | null;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  role: TaskRole;
  agent_name: string | null;
  is_blocked: number;
  blocked_reason: string | null;
  created_at: number;
  updated_at: number;
}

// ============================================================
// Server-only: Query filter options
// ============================================================

export interface TaskFilters {
  status?: TaskStatus;
  role?: TaskRole;
}
