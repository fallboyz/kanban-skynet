import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resetDb, seedWorkspaceAndProject } from '../../__tests__/helpers.js';
import { createApiApp } from '../index.js';
import { createWorkspace } from '../../db/workspaces.js';
import { createProject } from '../../db/projects.js';
import { createTask, startTask, updateTask } from '../../db/tasks.js';
import { addDependency } from '../../db/dependencies.js';

vi.mock('../../ws.js', () => ({
  broadcast: vi.fn(),
}));

const { broadcast } = await import('../../ws.js');

const app = createApiApp();

function json(body: unknown) {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function patchJson(body: unknown) {
  return {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

let projId: string;

beforeEach(() => {
  resetDb();
  vi.mocked(broadcast).mockClear();
  const { proj } = seedWorkspaceAndProject();
  projId = proj.id;
});

// ============================================================
// GET /api/tasks/:id
// ============================================================

describe('GET /api/tasks/:id', () => {
  it('should return task with comments, dependencies, dependents', async () => {
    const task = createTask({ project_id: projId, title: 'T' });

    const res = await app.request(`/api/tasks/${task.id}`);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.id).toBe(task.id);
    expect(data.comments).toEqual([]);
    expect(data.dependencies).toEqual([]);
    expect(data.dependents).toEqual([]);
  });

  it('should return 404 for nonexistent task', async () => {
    const res = await app.request('/api/tasks/nonexistent');
    expect(res.status).toBe(404);
  });
});

// ============================================================
// POST /api/tasks
// ============================================================

describe('POST /api/tasks', () => {
  it('should create a task (201)', async () => {
    const res = await app.request('/api/tasks', json({
      project_id: projId,
      title: 'New Task',
    }));
    expect(res.status).toBe(201);

    const data = await res.json();
    expect(data.title).toBe('New Task');
    expect(data.status).toBe('ready');
    expect(data.priority).toBe('medium');
    expect(data.role).toBe('BACKEND');
    expect(broadcast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'task:created' }),
    );
  });

  it('should create with all optional fields', async () => {
    const res = await app.request('/api/tasks', json({
      project_id: projId,
      title: 'Full Task',
      description: 'Detailed',
      priority: 'critical',
      role: 'FRONTEND',
    }));
    expect(res.status).toBe(201);

    const data = await res.json();
    expect(data.description).toBe('Detailed');
    expect(data.priority).toBe('critical');
    expect(data.role).toBe('FRONTEND');
  });

  it('should reject missing project_id (400)', async () => {
    const res = await app.request('/api/tasks', json({ title: 'T' }));
    expect(res.status).toBe(400);
  });

  it('should reject missing title (400)', async () => {
    const res = await app.request('/api/tasks', json({ project_id: projId }));
    expect(res.status).toBe(400);
  });

  it('should reject title exceeding max length (400)', async () => {
    const res = await app.request('/api/tasks', json({
      project_id: projId,
      title: 'a'.repeat(201),
    }));
    expect(res.status).toBe(400);
  });

  it('should reject invalid priority (400)', async () => {
    const res = await app.request('/api/tasks', json({
      project_id: projId,
      title: 'T',
      priority: 'ultra',
    }));
    expect(res.status).toBe(400);
  });

  it('should reject invalid role (400)', async () => {
    const res = await app.request('/api/tasks', json({
      project_id: projId,
      title: 'T',
      role: 'WIZARD',
    }));
    expect(res.status).toBe(400);
  });

  it('should reject invalid project_id (FK violation, 400)', async () => {
    const res = await app.request('/api/tasks', json({
      project_id: 'nonexistent',
      title: 'T',
    }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('referenced resource not found');
  });

  it('should handle invalid JSON body (400)', async () => {
    const res = await app.request('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('Invalid JSON');
  });
});

// ============================================================
// PATCH /api/tasks/:id
// ============================================================

describe('PATCH /api/tasks/:id', () => {
  it('should update fields without status change', async () => {
    const task = createTask({ project_id: projId, title: 'T' });

    const res = await app.request(
      `/api/tasks/${task.id}`,
      patchJson({ priority: 'high', role: 'QA' }),
    );
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.priority).toBe('high');
    expect(data.role).toBe('QA');
  });

  it('should transition status via transitionTaskStatus', async () => {
    const task = createTask({ project_id: projId, title: 'T' });
    startTask(task.id, 'agent');

    const res = await app.request(
      `/api/tasks/${task.id}`,
      patchJson({ status: 'review' }),
    );
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.status).toBe('review');
  });

  it('should update status and fields simultaneously', async () => {
    const task = createTask({ project_id: projId, title: 'T' });
    startTask(task.id, 'agent');

    const res = await app.request(
      `/api/tasks/${task.id}`,
      patchJson({ status: 'review', priority: 'critical' }),
    );
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.status).toBe('review');
    expect(data.priority).toBe('critical');
  });

  it('should reject invalid transition (400)', async () => {
    const task = createTask({ project_id: projId, title: 'T' });

    const res = await app.request(
      `/api/tasks/${task.id}`,
      patchJson({ status: 'done' }),
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('Invalid transition');
  });

  it('should reject ready->in_progress via PATCH (400)', async () => {
    const task = createTask({ project_id: projId, title: 'T' });

    const res = await app.request(
      `/api/tasks/${task.id}`,
      patchJson({ status: 'in_progress' }),
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('start_task');
  });

  it('should reject blocked task transition except cancel (400)', async () => {
    const task = createTask({ project_id: projId, title: 'T' });
    startTask(task.id, 'agent');
    updateTask(task.id, { is_blocked: true });

    const res = await app.request(
      `/api/tasks/${task.id}`,
      patchJson({ status: 'review' }),
    );
    expect(res.status).toBe(400);
  });

  it('should allow blocked task to cancel', async () => {
    const task = createTask({ project_id: projId, title: 'T' });
    startTask(task.id, 'agent');
    updateTask(task.id, { is_blocked: true });

    const res = await app.request(
      `/api/tasks/${task.id}`,
      patchJson({ status: 'cancelled' }),
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe('cancelled');
  });

  it('should reject invalid priority (400)', async () => {
    const task = createTask({ project_id: projId, title: 'T' });

    const res = await app.request(
      `/api/tasks/${task.id}`,
      patchJson({ priority: 'ultra' }),
    );
    expect(res.status).toBe(400);
  });

  it('should return 404 for nonexistent task', async () => {
    const res = await app.request(
      '/api/tasks/nonexistent',
      patchJson({ priority: 'high' }),
    );
    expect(res.status).toBe(404);
  });

  it('should handle invalid JSON body (400)', async () => {
    const task = createTask({ project_id: projId, title: 'T' });

    const res = await app.request(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: '{invalid',
    });
    expect(res.status).toBe(400);
  });

  it('should broadcast task:updated on success', async () => {
    const task = createTask({ project_id: projId, title: 'T' });

    await app.request(
      `/api/tasks/${task.id}`,
      patchJson({ priority: 'high' }),
    );

    expect(broadcast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'task:updated' }),
    );
  });
});

// ============================================================
// POST /api/tasks/:id/dependencies
// ============================================================

describe('POST /api/tasks/:id/dependencies', () => {
  it('should add a dependency (201)', async () => {
    const a = createTask({ project_id: projId, title: 'A' });
    const b = createTask({ project_id: projId, title: 'B' });

    const res = await app.request(
      `/api/tasks/${b.id}/dependencies`,
      json({ depends_on: a.id }),
    );
    expect(res.status).toBe(201);

    const data = await res.json();
    expect(data.task_id).toBe(b.id);
    expect(data.depends_on).toBe(a.id);
  });

  it('should reject self-reference (400)', async () => {
    const task = createTask({ project_id: projId, title: 'T' });

    const res = await app.request(
      `/api/tasks/${task.id}/dependencies`,
      json({ depends_on: task.id }),
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('itself');
  });

  it('should reject cross-project dependency (400)', async () => {
    const ws2 = createWorkspace({ name: 'WS2' });
    const proj2 = createProject({ workspace_id: ws2.id, name: 'P2' });

    const a = createTask({ project_id: projId, title: 'A' });
    const b = createTask({ project_id: proj2.id, title: 'B' });

    const res = await app.request(
      `/api/tasks/${a.id}/dependencies`,
      json({ depends_on: b.id }),
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('same project');
  });

  it('should reject circular dependency (400)', async () => {
    const a = createTask({ project_id: projId, title: 'A' });
    const b = createTask({ project_id: projId, title: 'B' });
    addDependency(b.id, a.id); // B depends on A

    // Try to add A depends on B (would create cycle)
    const res = await app.request(
      `/api/tasks/${a.id}/dependencies`,
      json({ depends_on: b.id }),
    );
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('circular');
  });

  it('should return 404 for nonexistent task', async () => {
    const a = createTask({ project_id: projId, title: 'A' });

    const res = await app.request(
      '/api/tasks/nonexistent/dependencies',
      json({ depends_on: a.id }),
    );
    expect(res.status).toBe(404);
  });

  it('should return 404 for nonexistent dependency task', async () => {
    const task = createTask({ project_id: projId, title: 'T' });

    const res = await app.request(
      `/api/tasks/${task.id}/dependencies`,
      json({ depends_on: 'nonexistent' }),
    );
    expect(res.status).toBe(404);
  });

  it('should broadcast dependency:added', async () => {
    const a = createTask({ project_id: projId, title: 'A' });
    const b = createTask({ project_id: projId, title: 'B' });

    await app.request(
      `/api/tasks/${b.id}/dependencies`,
      json({ depends_on: a.id }),
    );

    expect(broadcast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'dependency:added' }),
    );
  });
});

// ============================================================
// DELETE /api/tasks/:id/dependencies/:depId
// ============================================================

describe('DELETE /api/tasks/:id/dependencies/:depId', () => {
  it('should remove a dependency', async () => {
    const a = createTask({ project_id: projId, title: 'A' });
    const b = createTask({ project_id: projId, title: 'B' });
    addDependency(b.id, a.id);

    const res = await app.request(`/api/tasks/${b.id}/dependencies/${a.id}`, {
      method: 'DELETE',
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
  });

  it('should broadcast dependency:removed', async () => {
    const a = createTask({ project_id: projId, title: 'A' });
    const b = createTask({ project_id: projId, title: 'B' });

    await app.request(`/api/tasks/${b.id}/dependencies/${a.id}`, {
      method: 'DELETE',
    });

    expect(broadcast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'dependency:removed' }),
    );
  });
});

// ============================================================
// GET /api/tasks/:id/comments
// ============================================================

describe('GET /api/tasks/:id/comments', () => {
  it('should return comments for a task', async () => {
    const task = createTask({ project_id: projId, title: 'T' });

    const res = await app.request(`/api/tasks/${task.id}/comments`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('should return 404 for nonexistent task', async () => {
    const res = await app.request('/api/tasks/nonexistent/comments');
    expect(res.status).toBe(404);
  });
});

// ============================================================
// POST /api/tasks/:id/comments
// ============================================================

describe('POST /api/tasks/:id/comments', () => {
  it('should create a comment (201)', async () => {
    const task = createTask({ project_id: projId, title: 'T' });

    const res = await app.request(
      `/api/tasks/${task.id}/comments`,
      json({ content: 'Hello', author: 'user1' }),
    );
    expect(res.status).toBe(201);

    const data = await res.json();
    expect(data.content).toBe('Hello');
    expect(data.author).toBe('user1');
    expect(data.task_id).toBe(task.id);
  });

  it('should reject missing content (400)', async () => {
    const task = createTask({ project_id: projId, title: 'T' });

    const res = await app.request(
      `/api/tasks/${task.id}/comments`,
      json({ author: 'user1' }),
    );
    expect(res.status).toBe(400);
  });

  it('should reject missing author (400)', async () => {
    const task = createTask({ project_id: projId, title: 'T' });

    const res = await app.request(
      `/api/tasks/${task.id}/comments`,
      json({ content: 'Hello' }),
    );
    expect(res.status).toBe(400);
  });

  it('should reject content exceeding max length (400)', async () => {
    const task = createTask({ project_id: projId, title: 'T' });

    const res = await app.request(
      `/api/tasks/${task.id}/comments`,
      json({ content: 'a'.repeat(10001), author: 'user1' }),
    );
    expect(res.status).toBe(400);
  });

  it('should reject author exceeding max length (400)', async () => {
    const task = createTask({ project_id: projId, title: 'T' });

    const res = await app.request(
      `/api/tasks/${task.id}/comments`,
      json({ content: 'Hello', author: 'a'.repeat(101) }),
    );
    expect(res.status).toBe(400);
  });

  it('should return 404 for nonexistent task', async () => {
    const res = await app.request(
      '/api/tasks/nonexistent/comments',
      json({ content: 'Hello', author: 'user1' }),
    );
    expect(res.status).toBe(404);
  });

  it('should handle invalid JSON body (400)', async () => {
    const task = createTask({ project_id: projId, title: 'T' });

    const res = await app.request(`/api/tasks/${task.id}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    });
    expect(res.status).toBe(400);
  });

  it('should broadcast comment:added', async () => {
    const task = createTask({ project_id: projId, title: 'T' });

    await app.request(
      `/api/tasks/${task.id}/comments`,
      json({ content: 'Hello', author: 'user1' }),
    );

    expect(broadcast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'comment:added' }),
    );
  });
});
