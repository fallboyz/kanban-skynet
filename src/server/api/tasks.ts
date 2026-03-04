import { Hono } from 'hono';
import {
  getTaskById,
  createTask,
  updateTask,
  transitionTaskStatus,
  validateSameProject,
  getCommentsByTask,
  createComment,
  addDependency,
  removeDependency,
  getDependencies,
  getDependents,
  wouldCreateCycle,
} from '../db/index.js';
import { broadcast } from '../ws.js';
import {
  VALID_PRIORITIES, VALID_ROLES,
  MAX_TITLE_LENGTH, MAX_DESCRIPTION_LENGTH, MAX_COMMENT_LENGTH, MAX_AUTHOR_LENGTH, MAX_REASON_LENGTH,
} from '../constants.js';
import type {
  CreateTaskInput,
  UpdateTaskInput,
  CreateCommentInput,
  TaskPriority,
  TaskRole,
} from '../types.js';

const app = new Hono();

interface TaskPatchBody {
  status?: string;
  priority?: string;
  role?: string;
  agent_name?: string | null;
  is_blocked?: boolean;
  blocked_reason?: string | null;
}

function validateFieldsOnly(body: TaskPatchBody): string | null {
  if (body.priority !== undefined && !VALID_PRIORITIES.has(body.priority)) {
    return `Invalid priority. Must be one of: ${[...VALID_PRIORITIES].join(', ')}`;
  }
  if (body.role !== undefined && !VALID_ROLES.has(body.role)) {
    return `Invalid role. Must be one of: ${[...VALID_ROLES].join(', ')}`;
  }
  if (body.blocked_reason && body.blocked_reason.length > MAX_REASON_LENGTH) {
    return `blocked_reason must be ${MAX_REASON_LENGTH} characters or less`;
  }
  return null;
}

function buildUpdateInput(body: TaskPatchBody): UpdateTaskInput {
  const input: UpdateTaskInput = {};
  if (body.priority !== undefined) input.priority = body.priority as TaskPriority;
  if (body.role !== undefined) input.role = body.role as TaskRole;
  if (body.agent_name !== undefined) input.agent_name = body.agent_name;
  if (body.is_blocked !== undefined) input.is_blocked = body.is_blocked;
  if (body.blocked_reason !== undefined) input.blocked_reason = body.blocked_reason;
  return input;
}


// ============================================================
// GET /tasks/:id - return task with its comments + dependencies
// ============================================================
app.get('/tasks/:id', (c) => {
  const id = c.req.param('id');
  const task = getTaskById(id);

  if (!task) {
    return c.json({ error: 'Task not found' }, 404);
  }

  const comments = getCommentsByTask(id);
  const dependencies = getDependencies(id);
  const dependents = getDependents(id);
  return c.json({ ...task, comments, dependencies, dependents });
});

// ============================================================
// POST /tasks - create a new task
// ============================================================
app.post('/tasks', async (c) => {
  let body: {
    project_id?: string;
    title?: string;
    description?: string;
    priority?: string;
    role?: string;
    parent_id?: string;
    depends_on?: string[];
  };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  if (!body.project_id || typeof body.project_id !== 'string') {
    return c.json({ error: 'project_id is required' }, 400);
  }
  if (!body.title || typeof body.title !== 'string' || body.title.trim() === '') {
    return c.json({ error: 'title is required' }, 400);
  }
  if (body.title.length > MAX_TITLE_LENGTH) {
    return c.json({ error: `title must be ${MAX_TITLE_LENGTH} characters or less` }, 400);
  }
  if (body.description && body.description.length > MAX_DESCRIPTION_LENGTH) {
    return c.json({ error: `description must be ${MAX_DESCRIPTION_LENGTH} characters or less` }, 400);
  }
  if (body.priority && !VALID_PRIORITIES.has(body.priority)) {
    return c.json({ error: `Invalid priority. Must be one of: ${[...VALID_PRIORITIES].join(', ')}` }, 400);
  }
  if (body.role && !VALID_ROLES.has(body.role)) {
    return c.json({ error: `Invalid role. Must be one of: ${[...VALID_ROLES].join(', ')}` }, 400);
  }

  const input: CreateTaskInput = {
    project_id: body.project_id,
    title: body.title.trim(),
    description: body.description,
    priority: body.priority as TaskPriority | undefined,
    role: body.role as TaskRole | undefined,
    parent_id: body.parent_id,
    depends_on: body.depends_on,
  };

  let task;
  try {
    task = createTask(input);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('FOREIGN KEY')) {
      return c.json({ error: 'Invalid project_id or parent_id (referenced resource not found)' }, 400);
    }
    throw err;
  }

  broadcast({ type: 'task:created', payload: task });

  return c.json(task, 201);
});

// ============================================================
// PATCH /tasks/:id - partial update
// Status changes go through transitionTaskStatus (enforces guards).
// Other field changes go through updateTask.
// ============================================================
app.patch('/tasks/:id', async (c) => {
  const id = c.req.param('id');

  const existing = getTaskById(id);
  if (!existing) {
    return c.json({ error: 'Task not found' }, 404);
  }

  let body: TaskPatchBody;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  const validationError = validateFieldsOnly(body);
  if (validationError) {
    return c.json({ error: validationError }, 400);
  }

  // Handle status change via transitionTaskStatus (includes all guards)
  if (body.status !== undefined) {
    const result = transitionTaskStatus(id, body.status);
    if (!result.ok) {
      return c.json({ error: result.error }, 400);
    }
    // If only status was changed, return now
    const fieldInput = buildUpdateInput(body);
    if (Object.keys(fieldInput).length === 0) {
      broadcast({ type: 'task:updated', payload: result.task });
      return c.json(result.task);
    }
    // Additional fields to update after status change
    const updated = updateTask(id, fieldInput);
    if (!updated) {
      return c.json({ error: 'Task not found' }, 404);
    }
    broadcast({ type: 'task:updated', payload: updated });
    return c.json(updated);
  }

  // No status change -- just update other fields
  const input = buildUpdateInput(body);
  const updated = updateTask(id, input);
  if (!updated) {
    return c.json({ error: 'Task not found' }, 404);
  }

  broadcast({ type: 'task:updated', payload: updated });

  return c.json(updated);
});

// ============================================================
// POST /tasks/:id/dependencies - add a dependency
// ============================================================
app.post('/tasks/:id/dependencies', async (c) => {
  const taskId = c.req.param('id');
  const task = getTaskById(taskId);
  if (!task) {
    return c.json({ error: 'Task not found' }, 404);
  }

  let body: { depends_on?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }
  if (!body.depends_on || typeof body.depends_on !== 'string') {
    return c.json({ error: 'depends_on is required' }, 400);
  }

  const depTask = getTaskById(body.depends_on);
  if (!depTask) {
    return c.json({ error: 'Dependency task not found' }, 404);
  }

  if (taskId === body.depends_on) {
    return c.json({ error: 'A task cannot depend on itself' }, 400);
  }

  const crossProjectError = validateSameProject(taskId, body.depends_on);
  if (crossProjectError) {
    return c.json({ error: crossProjectError }, 400);
  }

  if (wouldCreateCycle(taskId, body.depends_on)) {
    return c.json({ error: 'Cannot add dependency: would create a circular dependency' }, 400);
  }

  addDependency(taskId, body.depends_on);
  broadcast({ type: 'dependency:added', payload: { task_id: taskId, depends_on: body.depends_on } });
  return c.json({ task_id: taskId, depends_on: body.depends_on }, 201);
});

// ============================================================
// DELETE /tasks/:id/dependencies/:depId - remove a dependency
// ============================================================
app.delete('/tasks/:id/dependencies/:depId', (c) => {
  const taskId = c.req.param('id');
  const depId = c.req.param('depId');

  removeDependency(taskId, depId);
  broadcast({ type: 'dependency:removed', payload: { task_id: taskId, depends_on: depId } });
  return c.json({ ok: true });
});

// ============================================================
// GET /tasks/:id/comments - return comments for a task
// ============================================================
app.get('/tasks/:id/comments', (c) => {
  const taskId = c.req.param('id');

  const task = getTaskById(taskId);
  if (!task) {
    return c.json({ error: 'Task not found' }, 404);
  }

  const comments = getCommentsByTask(taskId);
  return c.json(comments);
});

// ============================================================
// POST /tasks/:id/comments - create a comment
// ============================================================
app.post('/tasks/:id/comments', async (c) => {
  const taskId = c.req.param('id');

  const task = getTaskById(taskId);
  if (!task) {
    return c.json({ error: 'Task not found' }, 404);
  }

  let body: { content?: string; author?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON body' }, 400);
  }

  if (!body.content || typeof body.content !== 'string' || body.content.trim() === '') {
    return c.json({ error: 'content is required' }, 400);
  }
  if (body.content.length > MAX_COMMENT_LENGTH) {
    return c.json({ error: `content must be ${MAX_COMMENT_LENGTH} characters or less` }, 400);
  }
  if (!body.author || typeof body.author !== 'string' || body.author.trim() === '') {
    return c.json({ error: 'author is required' }, 400);
  }
  if (body.author.length > MAX_AUTHOR_LENGTH) {
    return c.json({ error: `author must be ${MAX_AUTHOR_LENGTH} characters or less` }, 400);
  }

  const input: CreateCommentInput = {
    task_id: taskId,
    content: body.content.trim(),
    author: body.author.trim(),
  };

  const comment = createComment(input);

  broadcast({ type: 'comment:added', payload: comment });

  return c.json(comment, 201);
});

export default app;
