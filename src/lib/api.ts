import type { Comment, Project, Task, TaskDependency, Workspace } from '@/types';

const BASE_URL = '';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) {
    throw new Error(`API error ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

export async function getWorkspaces(): Promise<Workspace[]> {
  return request<Workspace[]>('/api/workspaces');
}

export async function createWorkspace(input: {
  name: string;
  description?: string;
}): Promise<Workspace> {
  return request<Workspace>('/api/workspaces', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function getProjects(workspaceId: string): Promise<Project[]> {
  return request<Project[]>(`/api/workspaces/${workspaceId}/projects`);
}

export async function createProject(input: {
  workspace_id: string;
  name: string;
  description?: string;
}): Promise<Project> {
  return request<Project>('/api/projects', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function getTasks(
  projectId: string,
  filters?: { status?: string; role?: string },
): Promise<Task[]> {
  const params = new URLSearchParams();
  if (filters?.status) params.set('status', filters.status);
  if (filters?.role) params.set('role', filters.role);
  const query = params.toString() ? `?${params.toString()}` : '';
  return request<Task[]>(`/api/projects/${projectId}/tasks${query}`);
}

export async function getTask(
  taskId: string,
): Promise<Task & { comments: Comment[]; dependencies: string[]; dependents: string[] }> {
  return request<Task & { comments: Comment[]; dependencies: string[]; dependents: string[] }>(`/api/tasks/${taskId}`);
}

export async function getTaskComments(taskId: string): Promise<Comment[]> {
  return request<Comment[]>(`/api/tasks/${taskId}/comments`);
}

export async function getProjectSettings(
  projectId: string,
): Promise<{ auto_approve: boolean }> {
  return request<{ auto_approve: boolean }>(
    `/api/projects/${projectId}/settings`,
  );
}

export async function updateProjectSettings(
  projectId: string,
  settings: { auto_approve: boolean },
): Promise<{ auto_approve: boolean }> {
  return request<{ auto_approve: boolean }>(
    `/api/projects/${projectId}/settings`,
    {
      method: 'PATCH',
      body: JSON.stringify(settings),
    },
  );
}

export async function addTaskDependency(
  taskId: string,
  dependsOn: string,
): Promise<TaskDependency> {
  return request<TaskDependency>(`/api/tasks/${taskId}/dependencies`, {
    method: 'POST',
    body: JSON.stringify({ depends_on: dependsOn }),
  });
}

export async function removeTaskDependency(
  taskId: string,
  dependsOn: string,
): Promise<void> {
  await request<{ ok: boolean }>(`/api/tasks/${taskId}/dependencies/${dependsOn}`, {
    method: 'DELETE',
  });
}
