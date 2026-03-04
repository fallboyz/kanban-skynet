import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resetDb, seedWorkspaceAndProject } from '../../__tests__/helpers.js';
import { createApiApp } from '../index.js';
import { createWorkspace } from '../../db/workspaces.js';
import { createTask, updateTask } from '../../db/tasks.js';

vi.mock('../../ws.js', () => ({
  broadcast: vi.fn(),
}));

const app = createApiApp();

function json(body: unknown) {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function patch(body: unknown) {
  return {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

let wsId: string;
let projId: string;

beforeEach(() => {
  resetDb();
  const { ws, proj } = seedWorkspaceAndProject();
  wsId = ws.id;
  projId = proj.id;
});

describe('POST /api/projects', () => {
  it('should create a project (201)', async () => {
    const res = await app.request('/api/projects', json({
      workspace_id: wsId,
      name: 'New Project',
    }));
    expect(res.status).toBe(201);

    const data = await res.json();
    expect(data.name).toBe('New Project');
    expect(data.workspace_id).toBe(wsId);
    expect(data.auto_approve).toBe(true);
  });

  it('should reject missing workspace_id (400)', async () => {
    const res = await app.request('/api/projects', json({ name: 'P' }));
    expect(res.status).toBe(400);
  });

  it('should reject missing name (400)', async () => {
    const res = await app.request('/api/projects', json({ workspace_id: wsId }));
    expect(res.status).toBe(400);
  });

  it('should reject invalid workspace_id (FK violation, 400)', async () => {
    const res = await app.request('/api/projects', json({
      workspace_id: 'nonexistent',
      name: 'P',
    }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('workspace');
  });
});

describe('GET /api/projects/:id/tasks', () => {
  it('should return all tasks for a project', async () => {
    createTask({ project_id: projId, title: 'T1' });
    createTask({ project_id: projId, title: 'T2' });

    const res = await app.request(`/api/projects/${projId}/tasks`);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data).toHaveLength(2);
  });

  it('should filter by status', async () => {
    createTask({ project_id: projId, title: 'T1' });
    const t2 = createTask({ project_id: projId, title: 'T2' });
    updateTask(t2.id, { status: 'done' });

    const res = await app.request(`/api/projects/${projId}/tasks?status=done`);
    const data = await res.json();
    expect(data).toHaveLength(1);
    expect(data[0].status).toBe('done');
  });

  it('should filter by role', async () => {
    createTask({ project_id: projId, title: 'T1', role: 'FRONTEND' });
    createTask({ project_id: projId, title: 'T2', role: 'BACKEND' });

    const res = await app.request(`/api/projects/${projId}/tasks?role=FRONTEND`);
    const data = await res.json();
    expect(data).toHaveLength(1);
    expect(data[0].role).toBe('FRONTEND');
  });

  it('should reject invalid status (400)', async () => {
    const res = await app.request(`/api/projects/${projId}/tasks?status=invalid`);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('status');
  });

  it('should reject invalid role (400)', async () => {
    const res = await app.request(`/api/projects/${projId}/tasks?role=WIZARD`);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('role');
  });
});

describe('GET /api/projects/:id/settings', () => {
  it('should return auto_approve setting', async () => {
    const res = await app.request(`/api/projects/${projId}/settings`);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.auto_approve).toBe(true);
  });

  it('should return 404 for nonexistent project', async () => {
    const res = await app.request('/api/projects/nonexistent/settings');
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/projects/:id/settings', () => {
  it('should update auto_approve', async () => {
    const res = await app.request(
      `/api/projects/${projId}/settings`,
      patch({ auto_approve: false }),
    );
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.auto_approve).toBe(false);
  });

  it('should reject non-boolean auto_approve (400)', async () => {
    const res = await app.request(
      `/api/projects/${projId}/settings`,
      patch({ auto_approve: 'yes' }),
    );
    expect(res.status).toBe(400);
  });

  it('should return 404 for nonexistent project', async () => {
    const res = await app.request(
      '/api/projects/nonexistent/settings',
      patch({ auto_approve: true }),
    );
    expect(res.status).toBe(404);
  });
});
