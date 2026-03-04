import { ulid } from 'ulidx';
import { db } from './connection.js';
import type { Project, CreateProjectInput } from '../types.js';

const stmtGetProjectsByWorkspace = db.prepare(
  'SELECT * FROM projects WHERE workspace_id = ? ORDER BY created_at ASC'
);

const stmtGetProjectById = db.prepare(
  'SELECT * FROM projects WHERE id = ?'
);

const stmtInsertProject = db.prepare(
  'INSERT INTO projects (id, workspace_id, name, description, auto_approve, created_at) VALUES (?, ?, ?, ?, ?, ?)'
);

const stmtUpdateProjectAutoApprove = db.prepare(
  'UPDATE projects SET auto_approve = ? WHERE id = ?'
);

export function getProjectsByWorkspace(workspaceId: string): Project[] {
  const rows = stmtGetProjectsByWorkspace.all(workspaceId) as (Omit<Project, 'auto_approve'> & { auto_approve: number })[];
  return rows.map((row) => ({ ...row, auto_approve: !!row.auto_approve }));
}

export function createProject(input: CreateProjectInput): Project {
  const id = ulid();
  const now = Date.now();
  const description = input.description ?? '';

  stmtInsertProject.run(id, input.workspace_id, input.name, description, 1, now);

  return {
    id,
    workspace_id: input.workspace_id,
    name: input.name,
    description,
    auto_approve: true,
    created_at: now,
  };
}

export function getProjectById(id: string): Project | undefined {
  const row = stmtGetProjectById.get(id) as (Omit<Project, 'auto_approve'> & { auto_approve: number }) | undefined;
  if (!row) return undefined;
  return { ...row, auto_approve: !!row.auto_approve };
}

export function updateProjectSettings(id: string, settings: { auto_approve: boolean }): Project | undefined {
  const existing = stmtGetProjectById.get(id) as Record<string, unknown> | undefined;
  if (!existing) return undefined;

  stmtUpdateProjectAutoApprove.run(settings.auto_approve ? 1 : 0, id);

  return getProjectById(id);
}
