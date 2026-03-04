import { Hono } from 'hono';
import { createProject, getProjectById, getTasksByProject, updateProjectSettings } from '../db/index.js';
import { VALID_STATUSES, VALID_ROLES, MAX_NAME_LENGTH, MAX_DESCRIPTION_LENGTH } from '../constants.js';
import type { CreateProjectInput, TaskStatus, TaskRole } from '../types.js';

const app = new Hono();

// ============================================================
// POST /projects - create a new project
// ============================================================
app.post('/projects', async (c) => {
  const body = await c.req.json<{
    workspace_id?: string;
    name?: string;
    description?: string;
  }>();

  if (!body.workspace_id || typeof body.workspace_id !== 'string') {
    return c.json({ error: 'workspace_id is required' }, 400);
  }
  if (!body.name || typeof body.name !== 'string' || body.name.trim() === '') {
    return c.json({ error: 'name is required' }, 400);
  }
  if (body.name.length > MAX_NAME_LENGTH) {
    return c.json({ error: `name must be ${MAX_NAME_LENGTH} characters or less` }, 400);
  }
  if (body.description && body.description.length > MAX_DESCRIPTION_LENGTH) {
    return c.json({ error: `description must be ${MAX_DESCRIPTION_LENGTH} characters or less` }, 400);
  }

  const input: CreateProjectInput = {
    workspace_id: body.workspace_id,
    name: body.name.trim(),
    description: body.description,
  };

  let project;
  try {
    project = createProject(input);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('FOREIGN KEY')) {
      return c.json({ error: 'Invalid workspace_id (workspace not found)' }, 400);
    }
    throw err;
  }
  return c.json(project, 201);
});

// ============================================================
// GET /projects/:id/tasks - tasks for a project with optional filters
// ============================================================
app.get('/projects/:id/tasks', (c) => {
  const projectId = c.req.param('id');
  const status = c.req.query('status');
  const role = c.req.query('role');

  if (status && !VALID_STATUSES.has(status)) {
    return c.json({ error: `Invalid status. Must be one of: ${[...VALID_STATUSES].join(', ')}` }, 400);
  }
  if (role && !VALID_ROLES.has(role)) {
    return c.json({ error: `Invalid role. Must be one of: ${[...VALID_ROLES].join(', ')}` }, 400);
  }

  const filters: { status?: TaskStatus; role?: TaskRole } = {};
  if (status) filters.status = status as TaskStatus;
  if (role) filters.role = role as TaskRole;

  const tasks = getTasksByProject(projectId, filters);
  return c.json(tasks);
});

// ============================================================
// GET /projects/:id/settings - project settings (auto_approve)
// ============================================================
app.get('/projects/:id/settings', (c) => {
  const project = getProjectById(c.req.param('id'));
  if (!project) {
    return c.json({ error: 'Project not found' }, 404);
  }
  return c.json({ auto_approve: project.auto_approve });
});

// ============================================================
// PATCH /projects/:id/settings - update project settings
// ============================================================
app.patch('/projects/:id/settings', async (c) => {
  const body = await c.req.json<{ auto_approve?: boolean }>();

  if (typeof body.auto_approve !== 'boolean') {
    return c.json({ error: 'auto_approve (boolean) is required' }, 400);
  }

  const project = updateProjectSettings(c.req.param('id'), {
    auto_approve: body.auto_approve,
  });
  if (!project) {
    return c.json({ error: 'Project not found' }, 404);
  }
  return c.json({ auto_approve: project.auto_approve });
});

export default app;
