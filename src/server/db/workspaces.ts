import { ulid } from 'ulidx';
import { db } from './connection.js';
import type { Workspace, CreateWorkspaceInput } from '../types.js';

const stmtGetAllWorkspaces = db.prepare(
  'SELECT * FROM workspaces ORDER BY created_at ASC'
);

const stmtInsertWorkspace = db.prepare(
  'INSERT INTO workspaces (id, name, description, created_at) VALUES (?, ?, ?, ?)'
);

export function getAllWorkspaces(): Workspace[] {
  return stmtGetAllWorkspaces.all() as Workspace[];
}

export function createWorkspace(input: CreateWorkspaceInput): Workspace {
  const id = ulid();
  const now = Date.now();
  const description = input.description ?? '';

  stmtInsertWorkspace.run(id, input.name, description, now);

  return { id, name: input.name, description, created_at: now };
}
