import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resetDb } from '../../__tests__/helpers.js';
import { createApiApp } from '../index.js';
import { createWorkspace } from '../../db/workspaces.js';
import { createProject } from '../../db/projects.js';

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

beforeEach(() => {
  resetDb();
});

describe('GET /api/workspaces', () => {
  it('should return empty array when no workspaces', async () => {
    const res = await app.request('/api/workspaces');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('should return all workspaces', async () => {
    createWorkspace({ name: 'WS1' });
    createWorkspace({ name: 'WS2' });

    const res = await app.request('/api/workspaces');
    const data = await res.json();
    expect(data).toHaveLength(2);
  });
});

describe('POST /api/workspaces', () => {
  it('should create a workspace (201)', async () => {
    const res = await app.request('/api/workspaces', json({ name: 'New WS' }));
    expect(res.status).toBe(201);

    const data = await res.json();
    expect(data.name).toBe('New WS');
    expect(data.id).toBeDefined();
  });

  it('should reject missing name (400)', async () => {
    const res = await app.request('/api/workspaces', json({}));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('name');
  });

  it('should reject empty name (400)', async () => {
    const res = await app.request('/api/workspaces', json({ name: '   ' }));
    expect(res.status).toBe(400);
  });

  it('should reject name exceeding max length (400)', async () => {
    const longName = 'a'.repeat(101);
    const res = await app.request('/api/workspaces', json({ name: longName }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain('100');
  });

  it('should trim the name', async () => {
    const res = await app.request('/api/workspaces', json({ name: '  Trimmed  ' }));
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.name).toBe('Trimmed');
  });
});

describe('GET /api/workspaces/:id/projects', () => {
  it('should return projects for a workspace', async () => {
    const ws = createWorkspace({ name: 'WS' });
    createProject({ workspace_id: ws.id, name: 'P1' });
    createProject({ workspace_id: ws.id, name: 'P2' });

    const res = await app.request(`/api/workspaces/${ws.id}/projects`);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data).toHaveLength(2);
  });

  it('should return empty array for workspace with no projects', async () => {
    const ws = createWorkspace({ name: 'Empty WS' });

    const res = await app.request(`/api/workspaces/${ws.id}/projects`);
    const data = await res.json();
    expect(data).toEqual([]);
  });
});
