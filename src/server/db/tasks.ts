import { ulid } from 'ulidx';
import { db } from './connection.js';
import { addDependency, areDependenciesMet } from './dependencies.js';
import { VALID_TRANSITIONS } from '../constants.js';
import type {
  Task,
  TaskRow,
  CreateTaskInput,
  UpdateTaskInput,
} from '../types.js';

function rowToTask(row: TaskRow): Task {
  return {
    ...row,
    is_blocked: !!row.is_blocked,
  };
}

const stmtGetTaskById = db.prepare('SELECT * FROM tasks WHERE id = ?');

const stmtInsertTask = db.prepare(`
  INSERT INTO tasks (id, project_id, parent_id, title, description, status, priority, role, agent_name, is_blocked, blocked_reason, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

export function getTasksByProject(projectId: string, filters?: { status?: string; role?: string }): Task[] {
  const conditions: string[] = ['project_id = ?'];
  const params: unknown[] = [projectId];

  if (filters?.status) {
    conditions.push('status = ?');
    params.push(filters.status);
  }
  if (filters?.role) {
    conditions.push('role = ?');
    params.push(filters.role);
  }

  const sql = `SELECT * FROM tasks WHERE ${conditions.join(' AND ')} ORDER BY created_at ASC`;
  const rows = db.prepare(sql).all(...params) as TaskRow[];
  return rows.map(rowToTask);
}

export function getTaskById(id: string): Task | undefined {
  const row = stmtGetTaskById.get(id) as TaskRow | undefined;
  if (!row) return undefined;
  return rowToTask(row);
}

const createTaskTx = db.transaction((input: CreateTaskInput) => {
  const id = ulid();
  const now = Date.now();
  const description = input.description ?? '';
  const priority = input.priority ?? 'medium';
  const role = input.role ?? 'BACKEND';
  const parentId = input.parent_id ?? null;

  stmtInsertTask.run(
    id,
    input.project_id,
    parentId,
    input.title,
    description,
    'ready',
    priority,
    role,
    null,   // agent_name
    0,      // is_blocked
    null,   // blocked_reason
    now,
    now,
  );

  if (input.depends_on && input.depends_on.length > 0) {
    for (const depId of input.depends_on) {
      addDependency(id, depId);
    }
  }

  return {
    id,
    project_id: input.project_id,
    parent_id: parentId,
    title: input.title,
    description,
    status: 'ready' as const,
    priority,
    role,
    agent_name: null,
    is_blocked: false,
    blocked_reason: null,
    created_at: now,
    updated_at: now,
  } satisfies Task;
});

export function createTask(input: CreateTaskInput): Task {
  return createTaskTx(input);
}

export function updateTask(id: string, input: UpdateTaskInput): Task | undefined {
  const existing = stmtGetTaskById.get(id) as TaskRow | undefined;
  if (!existing) return undefined;

  const setClauses: string[] = [];
  const params: unknown[] = [];

  if (input.status !== undefined) {
    setClauses.push('status = ?');
    params.push(input.status);
  }
  if (input.priority !== undefined) {
    setClauses.push('priority = ?');
    params.push(input.priority);
  }
  if (input.role !== undefined) {
    setClauses.push('role = ?');
    params.push(input.role);
  }
  if (input.agent_name !== undefined) {
    setClauses.push('agent_name = ?');
    params.push(input.agent_name);
  }
  if (input.is_blocked !== undefined) {
    setClauses.push('is_blocked = ?');
    params.push(input.is_blocked ? 1 : 0);
  }
  if (input.blocked_reason !== undefined) {
    setClauses.push('blocked_reason = ?');
    params.push(input.blocked_reason);
  }

  if (setClauses.length === 0) {
    return rowToTask(existing);
  }

  const now = Date.now();
  setClauses.push('updated_at = ?');
  params.push(now);
  params.push(id);

  const sql = `UPDATE tasks SET ${setClauses.join(', ')} WHERE id = ?`;
  db.prepare(sql).run(...params);

  // Re-fetch the updated row
  const updated = stmtGetTaskById.get(id) as TaskRow;
  return rowToTask(updated);
}

// ============================================================
// Atomic start_task -- prevents TOCTOU race condition
// ============================================================

const stmtClaimTask = db.prepare(
  `UPDATE tasks SET status = 'in_progress', agent_name = ?, updated_at = ?
   WHERE id = ? AND status = 'ready' AND is_blocked = 0`
);

export type StartTaskResult =
  | { ok: true; task: Task }
  | { ok: false; error: string };

const startTaskTx = db.transaction((taskId: string, agentName: string): StartTaskResult => {
  const row = stmtGetTaskById.get(taskId) as TaskRow | undefined;
  if (!row) return { ok: false, error: 'Task not found' };

  if (row.status !== 'ready') {
    return { ok: false, error: `Cannot start task: status is '${row.status}', must be 'ready'` };
  }
  if (row.is_blocked) {
    return { ok: false, error: `Cannot start task: task is blocked (${row.blocked_reason ?? 'no reason'})` };
  }
  if (!areDependenciesMet(taskId)) {
    return { ok: false, error: 'Cannot start task: dependencies not met' };
  }

  const result = stmtClaimTask.run(agentName, Date.now(), taskId);
  if (result.changes === 0) {
    return { ok: false, error: 'Cannot start task: already claimed by another agent' };
  }

  const updated = stmtGetTaskById.get(taskId) as TaskRow;
  return { ok: true, task: rowToTask(updated) };
});

export function startTask(taskId: string, agentName: string): StartTaskResult {
  return startTaskTx(taskId, agentName);
}

// ============================================================
// Safe status transition -- enforces guards for ready->in_progress
// ============================================================

export type TransitionResult =
  | { ok: true; task: Task }
  | { ok: false; error: string };

const transitionTx = db.transaction((taskId: string, newStatus: string): TransitionResult => {
  const row = stmtGetTaskById.get(taskId) as TaskRow | undefined;
  if (!row) return { ok: false, error: 'Task not found' };

  const allowed = VALID_TRANSITIONS[row.status];
  if (!allowed?.includes(newStatus)) {
    return {
      ok: false,
      error: `Invalid transition: '${row.status}' -> '${newStatus}'. Allowed: ${(allowed ?? []).join(', ') || 'none (terminal state)'}`,
    };
  }

  // ready -> in_progress must go through startTask
  if (row.status === 'ready' && newStatus === 'in_progress') {
    return { ok: false, error: "Use start_task to transition from 'ready' to 'in_progress'" };
  }

  // blocked tasks cannot progress (except cancel)
  if (row.is_blocked && newStatus !== 'cancelled') {
    return { ok: false, error: `Cannot transition: task is blocked (${row.blocked_reason ?? 'no reason'})` };
  }

  const now = Date.now();
  db.prepare('UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?').run(newStatus, now, taskId);

  const updated = stmtGetTaskById.get(taskId) as TaskRow;
  return { ok: true, task: rowToTask(updated) };
});

export function transitionTaskStatus(taskId: string, newStatus: string): TransitionResult {
  return transitionTx(taskId, newStatus);
}

// ============================================================
// Cross-project validation for parent_id
// ============================================================

export function validateSameProject(taskId: string, otherTaskId: string): string | null {
  const a = stmtGetTaskById.get(taskId) as TaskRow | undefined;
  const b = stmtGetTaskById.get(otherTaskId) as TaskRow | undefined;
  if (!a || !b) return null; // let FK constraint handle missing
  if (a.project_id !== b.project_id) {
    return 'Tasks must belong to the same project';
  }
  return null;
}

// ============================================================
// Orphan task recovery -- reset tasks stuck in in_progress
// when an agent session expires or server restarts.
// ============================================================

const stmtRecoverByAgent = db.prepare(
  `UPDATE tasks SET status = 'ready', agent_name = NULL, updated_at = ?
   WHERE status = 'in_progress' AND agent_name = ?`
);

const stmtRecoverAll = db.prepare(
  `UPDATE tasks SET status = 'ready', agent_name = NULL, updated_at = ?
   WHERE status = 'in_progress'`
);

const stmtGetInProgressByAgent = db.prepare(
  `SELECT * FROM tasks WHERE status = 'in_progress' AND agent_name = ?`
);

const stmtGetAllInProgress = db.prepare(
  `SELECT * FROM tasks WHERE status = 'in_progress'`
);

/**
 * Recover orphaned tasks for a specific agent (e.g., when MCP session expires).
 * Returns the recovered tasks for broadcasting.
 */
export function recoverOrphanedTasks(agentName?: string): Task[] {
  const now = Date.now();
  let rows: TaskRow[];

  if (agentName) {
    rows = stmtGetInProgressByAgent.all(agentName) as TaskRow[];
    if (rows.length > 0) {
      stmtRecoverByAgent.run(now, agentName);
    }
  } else {
    rows = stmtGetAllInProgress.all() as TaskRow[];
    if (rows.length > 0) {
      stmtRecoverAll.run(now);
    }
  }

  return rows.map((row) => rowToTask({ ...row, status: 'ready', agent_name: null, updated_at: now }));
}
