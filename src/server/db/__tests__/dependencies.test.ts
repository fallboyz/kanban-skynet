import { describe, it, expect, beforeEach } from 'vitest';
import { resetDb, seedWorkspaceAndProject } from '../../__tests__/helpers.js';
import { createTask, updateTask } from '../tasks.js';
import {
  addDependency,
  removeDependency,
  getDependencies,
  getDependents,
  areDependenciesMet,
  wouldCreateCycle,
} from '../dependencies.js';

let projectId: string;

beforeEach(() => {
  resetDb();
  const { proj } = seedWorkspaceAndProject();
  projectId = proj.id;
});

describe('addDependency / getDependencies / getDependents', () => {
  it('should add and retrieve dependencies', () => {
    const a = createTask({ project_id: projectId, title: 'A' });
    const b = createTask({ project_id: projectId, title: 'B' });

    addDependency(b.id, a.id); // B depends on A

    expect(getDependencies(b.id)).toEqual([a.id]);
    expect(getDependents(a.id)).toEqual([b.id]);
  });

  it('should ignore duplicate dependencies (INSERT OR IGNORE)', () => {
    const a = createTask({ project_id: projectId, title: 'A' });
    const b = createTask({ project_id: projectId, title: 'B' });

    addDependency(b.id, a.id);
    addDependency(b.id, a.id); // duplicate

    expect(getDependencies(b.id)).toHaveLength(1);
  });

  it('should return empty arrays when no dependencies exist', () => {
    const a = createTask({ project_id: projectId, title: 'A' });

    expect(getDependencies(a.id)).toEqual([]);
    expect(getDependents(a.id)).toEqual([]);
  });
});

describe('removeDependency', () => {
  it('should remove an existing dependency', () => {
    const a = createTask({ project_id: projectId, title: 'A' });
    const b = createTask({ project_id: projectId, title: 'B' });

    addDependency(b.id, a.id);
    expect(getDependencies(b.id)).toHaveLength(1);

    removeDependency(b.id, a.id);
    expect(getDependencies(b.id)).toEqual([]);
  });

  it('should be a no-op for nonexistent dependency', () => {
    const a = createTask({ project_id: projectId, title: 'A' });
    const b = createTask({ project_id: projectId, title: 'B' });

    // No error thrown
    removeDependency(b.id, a.id);
    expect(getDependencies(b.id)).toEqual([]);
  });
});

describe('areDependenciesMet', () => {
  it('should return true when task has no dependencies', () => {
    const a = createTask({ project_id: projectId, title: 'A' });
    expect(areDependenciesMet(a.id)).toBe(true);
  });

  it('should return true when all dependencies are done', () => {
    const a = createTask({ project_id: projectId, title: 'A' });
    const b = createTask({ project_id: projectId, title: 'B' });

    addDependency(b.id, a.id); // B depends on A

    // A is still 'ready'
    expect(areDependenciesMet(b.id)).toBe(false);

    // Move A to done
    updateTask(a.id, { status: 'done' });
    expect(areDependenciesMet(b.id)).toBe(true);
  });

  it('should return false when any dependency is not done', () => {
    const a = createTask({ project_id: projectId, title: 'A' });
    const b = createTask({ project_id: projectId, title: 'B' });
    const c = createTask({ project_id: projectId, title: 'C' });

    addDependency(c.id, a.id); // C depends on A and B
    addDependency(c.id, b.id);

    updateTask(a.id, { status: 'done' });
    // B is still 'ready'

    expect(areDependenciesMet(c.id)).toBe(false);
  });

  it('should treat cancelled as not met', () => {
    const a = createTask({ project_id: projectId, title: 'A' });
    const b = createTask({ project_id: projectId, title: 'B' });

    addDependency(b.id, a.id);
    updateTask(a.id, { status: 'cancelled' });

    expect(areDependenciesMet(b.id)).toBe(false);
  });
});

describe('wouldCreateCycle', () => {
  it('should detect direct cycle: A->B, adding B->A', () => {
    const a = createTask({ project_id: projectId, title: 'A' });
    const b = createTask({ project_id: projectId, title: 'B' });

    addDependency(b.id, a.id); // B depends on A

    // Adding A depends on B would create: A->B->A
    expect(wouldCreateCycle(a.id, b.id)).toBe(true);
  });

  it('should detect indirect cycle: A->B->C, adding C->A', () => {
    const a = createTask({ project_id: projectId, title: 'A' });
    const b = createTask({ project_id: projectId, title: 'B' });
    const c = createTask({ project_id: projectId, title: 'C' });

    addDependency(b.id, a.id); // B depends on A
    addDependency(c.id, b.id); // C depends on B

    // Adding A depends on C would create: A->C->B->A
    expect(wouldCreateCycle(a.id, c.id)).toBe(true);
  });

  it('should detect self-reference', () => {
    const a = createTask({ project_id: projectId, title: 'A' });

    expect(wouldCreateCycle(a.id, a.id)).toBe(true);
  });

  it('should return false when no cycle would be created', () => {
    const a = createTask({ project_id: projectId, title: 'A' });
    const b = createTask({ project_id: projectId, title: 'B' });
    const c = createTask({ project_id: projectId, title: 'C' });

    addDependency(b.id, a.id); // B depends on A

    // C depends on B: no cycle (A->B->C is a chain, not a cycle)
    expect(wouldCreateCycle(c.id, b.id)).toBe(false);
  });

  it('should return false for independent tasks', () => {
    const a = createTask({ project_id: projectId, title: 'A' });
    const b = createTask({ project_id: projectId, title: 'B' });

    expect(wouldCreateCycle(a.id, b.id)).toBe(false);
  });
});
