import { Hono } from 'hono';
import {
  getAllWorkspaces,
  createWorkspace,
  getProjectsByWorkspace,
} from '../db/index.js';
import { MAX_NAME_LENGTH, MAX_DESCRIPTION_LENGTH } from '../constants.js';
import type { CreateWorkspaceInput } from '../types.js';

const app = new Hono();

// ============================================================
// GET /workspaces - return all workspaces
// ============================================================
app.get('/workspaces', (c) => {
  const workspaces = getAllWorkspaces();
  return c.json(workspaces);
});

// ============================================================
// POST /workspaces - create a new workspace
// ============================================================
app.post('/workspaces', async (c) => {
  const body = await c.req.json<{ name?: string; description?: string }>();

  if (!body.name || typeof body.name !== 'string' || body.name.trim() === '') {
    return c.json({ error: 'name is required' }, 400);
  }
  if (body.name.length > MAX_NAME_LENGTH) {
    return c.json({ error: `name must be ${MAX_NAME_LENGTH} characters or less` }, 400);
  }
  if (body.description && body.description.length > MAX_DESCRIPTION_LENGTH) {
    return c.json({ error: `description must be ${MAX_DESCRIPTION_LENGTH} characters or less` }, 400);
  }

  const input: CreateWorkspaceInput = {
    name: body.name.trim(),
    description: body.description,
  };

  const workspace = createWorkspace(input);
  return c.json(workspace, 201);
});

// ============================================================
// GET /workspaces/:id/projects - projects for a workspace
// ============================================================
app.get('/workspaces/:id/projects', (c) => {
  const workspaceId = c.req.param('id');
  const projects = getProjectsByWorkspace(workspaceId);
  return c.json(projects);
});

export default app;
