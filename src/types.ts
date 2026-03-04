export interface Workspace {
  id: string;
  name: string;
  description: string;
  created_at: number;
}

export interface Project {
  id: string;
  workspace_id: string;
  name: string;
  description: string;
  auto_approve: boolean;
  created_at: number;
}

export type TaskStatus = 'ready' | 'in_progress' | 'review' | 'done' | 'cancelled';
export type TaskPriority = 'critical' | 'high' | 'medium' | 'low';
export type TaskRole = 'ARCHITECT' | 'DATABASE' | 'BACKEND' | 'FRONTEND' | 'SECURITY' | 'QA';

export interface Task {
  id: string;
  project_id: string;
  parent_id: string | null;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  role: TaskRole;
  agent_name: string | null;
  is_blocked: boolean;
  blocked_reason: string | null;
  created_at: number;
  updated_at: number;
}

export interface Comment {
  id: string;
  task_id: string;
  content: string;
  author: string;
  created_at: number;
}

export interface TaskDependency {
  task_id: string;
  depends_on: string;
}

export interface DependencyInfo {
  id: string;
  title: string;
  status: TaskStatus;
}

export type WsEvent =
  | { type: 'task:created'; payload: Task }
  | { type: 'task:updated'; payload: Task }
  | { type: 'comment:added'; payload: Comment }
  | { type: 'project:updated'; payload: Project }
  | { type: 'dependency:added'; payload: { task_id: string; depends_on: string } }
  | { type: 'dependency:removed'; payload: { task_id: string; depends_on: string } };
