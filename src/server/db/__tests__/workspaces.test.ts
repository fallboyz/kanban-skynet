import { describe, it, expect, beforeEach } from 'vitest';
import { resetDb } from '../../__tests__/helpers.js';
import { createWorkspace, getAllWorkspaces } from '../workspaces.js';

beforeEach(() => {
  resetDb();
});

describe('createWorkspace', () => {
  it('should create a workspace with default description', () => {
    const ws = createWorkspace({ name: 'My Workspace' });

    expect(ws.id).toBeDefined();
    expect(ws.name).toBe('My Workspace');
    expect(ws.description).toBe('');
    expect(ws.created_at).toBeGreaterThan(0);
  });

  it('should create a workspace with custom description', () => {
    const ws = createWorkspace({ name: 'WS', description: 'Some desc' });

    expect(ws.description).toBe('Some desc');
  });
});

describe('getAllWorkspaces', () => {
  it('should return empty array when no workspaces exist', () => {
    expect(getAllWorkspaces()).toEqual([]);
  });

  it('should return workspaces in created_at ASC order', () => {
    const ws1 = createWorkspace({ name: 'First' });
    const ws2 = createWorkspace({ name: 'Second' });
    const ws3 = createWorkspace({ name: 'Third' });

    const all = getAllWorkspaces();
    expect(all).toHaveLength(3);
    expect(all[0].id).toBe(ws1.id);
    expect(all[1].id).toBe(ws2.id);
    expect(all[2].id).toBe(ws3.id);
  });
});
