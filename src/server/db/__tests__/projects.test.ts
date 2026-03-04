import { describe, it, expect, beforeEach } from 'vitest';
import { resetDb, seedWorkspaceAndProject } from '../../__tests__/helpers.js';
import { createWorkspace } from '../workspaces.js';
import {
  createProject,
  getProjectsByWorkspace,
  getProjectById,
  updateProjectSettings,
} from '../projects.js';

beforeEach(() => {
  resetDb();
});

describe('createProject', () => {
  it('should create a project with default values', () => {
    const ws = createWorkspace({ name: 'WS' });
    const proj = createProject({ workspace_id: ws.id, name: 'My Project' });

    expect(proj.id).toBeDefined();
    expect(proj.workspace_id).toBe(ws.id);
    expect(proj.name).toBe('My Project');
    expect(proj.description).toBe('');
    expect(proj.auto_approve).toBe(true);
    expect(proj.created_at).toBeGreaterThan(0);
  });

  it('should throw on invalid workspace_id (FK violation)', () => {
    expect(() =>
      createProject({ workspace_id: 'nonexistent', name: 'P' }),
    ).toThrow();
  });
});

describe('getProjectsByWorkspace', () => {
  it('should return only projects for the given workspace', () => {
    const ws1 = createWorkspace({ name: 'WS1' });
    const ws2 = createWorkspace({ name: 'WS2' });
    createProject({ workspace_id: ws1.id, name: 'P1' });
    createProject({ workspace_id: ws1.id, name: 'P2' });
    createProject({ workspace_id: ws2.id, name: 'P3' });

    const projects = getProjectsByWorkspace(ws1.id);
    expect(projects).toHaveLength(2);
    expect(projects.every((p) => p.workspace_id === ws1.id)).toBe(true);
  });

  it('should return empty array for workspace with no projects', () => {
    const ws = createWorkspace({ name: 'Empty' });
    expect(getProjectsByWorkspace(ws.id)).toEqual([]);
  });

  it('should convert auto_approve from integer to boolean', () => {
    const ws = createWorkspace({ name: 'WS' });
    createProject({ workspace_id: ws.id, name: 'P' });

    const projects = getProjectsByWorkspace(ws.id);
    expect(typeof projects[0].auto_approve).toBe('boolean');
  });
});

describe('getProjectById', () => {
  it('should return the project when it exists', () => {
    const { proj } = seedWorkspaceAndProject();
    const found = getProjectById(proj.id);

    expect(found).toBeDefined();
    expect(found!.id).toBe(proj.id);
    expect(typeof found!.auto_approve).toBe('boolean');
  });

  it('should return undefined for nonexistent id', () => {
    expect(getProjectById('nonexistent')).toBeUndefined();
  });
});

describe('updateProjectSettings', () => {
  it('should toggle auto_approve', () => {
    const { proj } = seedWorkspaceAndProject();
    expect(proj.auto_approve).toBe(true);

    const updated = updateProjectSettings(proj.id, { auto_approve: false });
    expect(updated).toBeDefined();
    expect(updated!.auto_approve).toBe(false);

    const restored = updateProjectSettings(proj.id, { auto_approve: true });
    expect(restored!.auto_approve).toBe(true);
  });

  it('should return undefined for nonexistent project', () => {
    expect(updateProjectSettings('nonexistent', { auto_approve: false })).toBeUndefined();
  });
});
