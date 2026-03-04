import { db } from '../db/connection.js';
import { createWorkspace } from '../db/workspaces.js';
import { createProject } from '../db/projects.js';
import type { Workspace, Project } from '../types.js';

/**
 * Delete all data from all tables (schema is preserved).
 * Call this in beforeEach to isolate tests.
 */
export function resetDb(): void {
  db.exec('DELETE FROM comments');
  db.exec('DELETE FROM task_dependencies');
  db.exec('DELETE FROM tasks');
  db.exec('DELETE FROM projects');
  db.exec('DELETE FROM workspaces');
}

/**
 * Create a workspace + project pair.
 * Most tests need at least one of each before creating tasks.
 */
export function seedWorkspaceAndProject(): { ws: Workspace; proj: Project } {
  const ws = createWorkspace({ name: 'Test Workspace' });
  const proj = createProject({ workspace_id: ws.id, name: 'Test Project' });
  return { ws, proj };
}
