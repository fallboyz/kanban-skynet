import { describe, it, expect, beforeEach } from 'vitest';
import { resetDb, seedWorkspaceAndProject } from '../../__tests__/helpers.js';
import { createWorkspace } from '../workspaces.js';
import { createProject } from '../projects.js';
import { addDependency, getDependencies } from '../dependencies.js';
import {
  createTask,
  getTaskById,
  getTasksByProject,
  updateTask,
  startTask,
  transitionTaskStatus,
  validateSameProject,
  recoverOrphanedTasks,
} from '../tasks.js';

let projectId: string;

beforeEach(() => {
  resetDb();
  const { proj } = seedWorkspaceAndProject();
  projectId = proj.id;
});

// ============================================================
// CRUD
// ============================================================

describe('createTask', () => {
  it('should create a task with default values', () => {
    const task = createTask({ project_id: projectId, title: 'My Task' });

    expect(task.id).toBeDefined();
    expect(task.project_id).toBe(projectId);
    expect(task.title).toBe('My Task');
    expect(task.description).toBe('');
    expect(task.status).toBe('ready');
    expect(task.priority).toBe('medium');
    expect(task.role).toBe('BACKEND');
    expect(task.agent_name).toBeNull();
    expect(task.is_blocked).toBe(false);
    expect(task.blocked_reason).toBeNull();
    expect(task.parent_id).toBeNull();
  });

  it('should create a task with all fields specified', () => {
    const task = createTask({
      project_id: projectId,
      title: 'Full Task',
      description: 'A detailed description',
      priority: 'critical',
      role: 'FRONTEND',
    });

    expect(task.description).toBe('A detailed description');
    expect(task.priority).toBe('critical');
    expect(task.role).toBe('FRONTEND');
  });

  it('should create a task with depends_on', () => {
    const dep = createTask({ project_id: projectId, title: 'Dependency' });
    const task = createTask({
      project_id: projectId,
      title: 'Dependent',
      depends_on: [dep.id],
    });

    expect(task.id).toBeDefined();
    expect(getDependencies(task.id)).toEqual([dep.id]);
  });

  it('should create a task with parent_id', () => {
    const parent = createTask({ project_id: projectId, title: 'Parent' });
    const child = createTask({
      project_id: projectId,
      title: 'Child',
      parent_id: parent.id,
    });

    expect(child.parent_id).toBe(parent.id);
  });
});

describe('getTaskById', () => {
  it('should return the task when it exists', () => {
    const task = createTask({ project_id: projectId, title: 'T' });
    const found = getTaskById(task.id);

    expect(found).toBeDefined();
    expect(found!.id).toBe(task.id);
    expect(typeof found!.is_blocked).toBe('boolean');
  });

  it('should return undefined for nonexistent id', () => {
    expect(getTaskById('nonexistent')).toBeUndefined();
  });
});

describe('getTasksByProject', () => {
  it('should return all tasks for a project', () => {
    createTask({ project_id: projectId, title: 'T1' });
    createTask({ project_id: projectId, title: 'T2' });

    const tasks = getTasksByProject(projectId);
    expect(tasks).toHaveLength(2);
  });

  it('should filter by status', () => {
    createTask({ project_id: projectId, title: 'T1' });
    const t2 = createTask({ project_id: projectId, title: 'T2' });
    updateTask(t2.id, { status: 'done' });

    const done = getTasksByProject(projectId, { status: 'done' });
    expect(done).toHaveLength(1);
    expect(done[0].id).toBe(t2.id);
  });

  it('should filter by role', () => {
    createTask({ project_id: projectId, title: 'T1', role: 'FRONTEND' });
    createTask({ project_id: projectId, title: 'T2', role: 'BACKEND' });

    const frontend = getTasksByProject(projectId, { role: 'FRONTEND' });
    expect(frontend).toHaveLength(1);
    expect(frontend[0].role).toBe('FRONTEND');
  });

  it('should apply both status and role filters', () => {
    const t1 = createTask({ project_id: projectId, title: 'T1', role: 'FRONTEND' });
    createTask({ project_id: projectId, title: 'T2', role: 'FRONTEND' });
    updateTask(t1.id, { status: 'done' });

    const result = getTasksByProject(projectId, { status: 'done', role: 'FRONTEND' });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(t1.id);
  });

  it('should return empty array for project with no tasks', () => {
    expect(getTasksByProject(projectId)).toEqual([]);
  });
});

describe('updateTask', () => {
  it('should update a single field', () => {
    const task = createTask({ project_id: projectId, title: 'T' });
    const updated = updateTask(task.id, { priority: 'high' });

    expect(updated).toBeDefined();
    expect(updated!.priority).toBe('high');
    expect(updated!.updated_at).toBeGreaterThanOrEqual(task.updated_at);
  });

  it('should update multiple fields', () => {
    const task = createTask({ project_id: projectId, title: 'T' });
    const updated = updateTask(task.id, {
      priority: 'critical',
      role: 'QA',
      agent_name: 'bot-1',
    });

    expect(updated!.priority).toBe('critical');
    expect(updated!.role).toBe('QA');
    expect(updated!.agent_name).toBe('bot-1');
  });

  it('should return unchanged task for empty input', () => {
    const task = createTask({ project_id: projectId, title: 'T' });
    const same = updateTask(task.id, {});

    expect(same).toBeDefined();
    expect(same!.id).toBe(task.id);
  });

  it('should return undefined for nonexistent task', () => {
    expect(updateTask('nonexistent', { priority: 'high' })).toBeUndefined();
  });

  it('should update is_blocked with boolean conversion', () => {
    const task = createTask({ project_id: projectId, title: 'T' });

    const blocked = updateTask(task.id, { is_blocked: true, blocked_reason: 'Waiting' });
    expect(blocked!.is_blocked).toBe(true);
    expect(blocked!.blocked_reason).toBe('Waiting');

    const unblocked = updateTask(task.id, { is_blocked: false, blocked_reason: null });
    expect(unblocked!.is_blocked).toBe(false);
    expect(unblocked!.blocked_reason).toBeNull();
  });
});

// ============================================================
// startTask
// ============================================================

describe('startTask', () => {
  it('should claim a ready, unblocked task with met dependencies', () => {
    const task = createTask({ project_id: projectId, title: 'T' });

    const result = startTask(task.id, 'agent-1');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.task.status).toBe('in_progress');
      expect(result.task.agent_name).toBe('agent-1');
    }
  });

  it('should fail when task is not ready', () => {
    const task = createTask({ project_id: projectId, title: 'T' });
    updateTask(task.id, { status: 'done' });

    const result = startTask(task.id, 'agent-1');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('status is');
    }
  });

  it('should fail when task is blocked', () => {
    const task = createTask({ project_id: projectId, title: 'T' });
    updateTask(task.id, { is_blocked: true, blocked_reason: 'Waiting on approval' });

    const result = startTask(task.id, 'agent-1');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('blocked');
    }
  });

  it('should fail when dependencies are not met', () => {
    const dep = createTask({ project_id: projectId, title: 'Dep' });
    const task = createTask({ project_id: projectId, title: 'T' });
    addDependency(task.id, dep.id);

    const result = startTask(task.id, 'agent-1');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('dependencies');
    }
  });

  it('should succeed when dependencies are all done', () => {
    const dep = createTask({ project_id: projectId, title: 'Dep' });
    const task = createTask({ project_id: projectId, title: 'T' });
    addDependency(task.id, dep.id);
    updateTask(dep.id, { status: 'done' });

    const result = startTask(task.id, 'agent-1');
    expect(result.ok).toBe(true);
  });

  it('should fail for nonexistent task', () => {
    const result = startTask('nonexistent', 'agent-1');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain('not found');
    }
  });

  it('should prevent double-claim (second agent fails)', () => {
    const task = createTask({ project_id: projectId, title: 'T' });

    const r1 = startTask(task.id, 'agent-1');
    expect(r1.ok).toBe(true);

    const r2 = startTask(task.id, 'agent-2');
    expect(r2.ok).toBe(false);
  });
});

// ============================================================
// transitionTaskStatus
// ============================================================

describe('transitionTaskStatus', () => {
  it('should allow valid transitions', () => {
    const task = createTask({ project_id: projectId, title: 'T' });

    // ready -> in_progress via startTask (not direct)
    startTask(task.id, 'agent');

    // in_progress -> review
    const r1 = transitionTaskStatus(task.id, 'review');
    expect(r1.ok).toBe(true);
    if (r1.ok) expect(r1.task.status).toBe('review');

    // review -> done
    const r2 = transitionTaskStatus(task.id, 'done');
    expect(r2.ok).toBe(true);
    if (r2.ok) expect(r2.task.status).toBe('done');
  });

  it('should reject invalid transitions', () => {
    const task = createTask({ project_id: projectId, title: 'T' });

    // ready -> done (invalid)
    const r = transitionTaskStatus(task.id, 'done');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain('Invalid transition');
    }
  });

  it('should reject ready -> in_progress (must use startTask)', () => {
    const task = createTask({ project_id: projectId, title: 'T' });

    const r = transitionTaskStatus(task.id, 'in_progress');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain('start_task');
    }
  });

  it('should reject transitions from terminal states', () => {
    const t1 = createTask({ project_id: projectId, title: 'T1' });
    updateTask(t1.id, { status: 'done' });

    const r1 = transitionTaskStatus(t1.id, 'ready');
    expect(r1.ok).toBe(false);

    const t2 = createTask({ project_id: projectId, title: 'T2' });
    updateTask(t2.id, { status: 'cancelled' });

    const r2 = transitionTaskStatus(t2.id, 'ready');
    expect(r2.ok).toBe(false);
  });

  it('should allow blocked task to cancel but not other transitions', () => {
    const task = createTask({ project_id: projectId, title: 'T' });
    startTask(task.id, 'agent');
    updateTask(task.id, { is_blocked: true, blocked_reason: 'Stuck' });

    // in_progress -> review should fail when blocked
    const r1 = transitionTaskStatus(task.id, 'review');
    expect(r1.ok).toBe(false);
    if (!r1.ok) {
      expect(r1.error).toContain('blocked');
    }

    // in_progress -> cancelled should succeed even when blocked
    const r2 = transitionTaskStatus(task.id, 'cancelled');
    expect(r2.ok).toBe(true);
  });

  it('should allow in_progress -> ready (rollback)', () => {
    const task = createTask({ project_id: projectId, title: 'T' });
    startTask(task.id, 'agent');

    const r = transitionTaskStatus(task.id, 'ready');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.task.status).toBe('ready');
  });

  it('should allow review -> in_progress', () => {
    const task = createTask({ project_id: projectId, title: 'T' });
    startTask(task.id, 'agent');
    transitionTaskStatus(task.id, 'review');

    const r = transitionTaskStatus(task.id, 'in_progress');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.task.status).toBe('in_progress');
  });

  it('should fail for nonexistent task', () => {
    const r = transitionTaskStatus('nonexistent', 'done');
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toContain('not found');
    }
  });
});

// ============================================================
// validateSameProject
// ============================================================

describe('validateSameProject', () => {
  it('should return null for tasks in the same project', () => {
    const a = createTask({ project_id: projectId, title: 'A' });
    const b = createTask({ project_id: projectId, title: 'B' });

    expect(validateSameProject(a.id, b.id)).toBeNull();
  });

  it('should return error for tasks in different projects', () => {
    const ws = createWorkspace({ name: 'WS2' });
    const proj2 = createProject({ workspace_id: ws.id, name: 'P2' });

    const a = createTask({ project_id: projectId, title: 'A' });
    const b = createTask({ project_id: proj2.id, title: 'B' });

    const error = validateSameProject(a.id, b.id);
    expect(error).toBe('Tasks must belong to the same project');
  });

  it('should return null when task does not exist (let FK handle it)', () => {
    const a = createTask({ project_id: projectId, title: 'A' });
    expect(validateSameProject(a.id, 'nonexistent')).toBeNull();
  });
});

// ============================================================
// recoverOrphanedTasks
// ============================================================

describe('recoverOrphanedTasks', () => {
  it('should recover all in_progress tasks when no agent specified', () => {
    const t1 = createTask({ project_id: projectId, title: 'T1' });
    const t2 = createTask({ project_id: projectId, title: 'T2' });
    startTask(t1.id, 'agent-1');
    startTask(t2.id, 'agent-2');

    const recovered = recoverOrphanedTasks();
    expect(recovered).toHaveLength(2);
    expect(recovered.every((t) => t.status === 'ready')).toBe(true);
    expect(recovered.every((t) => t.agent_name === null)).toBe(true);

    // Verify in DB
    const t1After = getTaskById(t1.id)!;
    expect(t1After.status).toBe('ready');
    expect(t1After.agent_name).toBeNull();
  });

  it('should recover only tasks for the specified agent', () => {
    const t1 = createTask({ project_id: projectId, title: 'T1' });
    const t2 = createTask({ project_id: projectId, title: 'T2' });
    startTask(t1.id, 'agent-1');
    startTask(t2.id, 'agent-2');

    const recovered = recoverOrphanedTasks('agent-1');
    expect(recovered).toHaveLength(1);
    expect(recovered[0].id).toBe(t1.id);

    // agent-2's task should still be in_progress
    const t2After = getTaskById(t2.id)!;
    expect(t2After.status).toBe('in_progress');
  });

  it('should return empty array when no tasks to recover', () => {
    createTask({ project_id: projectId, title: 'T1' }); // ready, not in_progress

    expect(recoverOrphanedTasks()).toEqual([]);
  });

  it('should update updated_at timestamp', () => {
    const task = createTask({ project_id: projectId, title: 'T' });
    startTask(task.id, 'agent');
    const before = getTaskById(task.id)!.updated_at;

    // Small delay to ensure timestamp differs
    const recovered = recoverOrphanedTasks();
    expect(recovered).toHaveLength(1);
    expect(recovered[0].updated_at).toBeGreaterThanOrEqual(before);
  });
});
