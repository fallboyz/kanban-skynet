import type { DependencyInfo } from '../types.js';
import { db } from './connection.js';

export type { DependencyInfo };

const stmtInsertDep = db.prepare(
  'INSERT OR IGNORE INTO task_dependencies (task_id, depends_on) VALUES (?, ?)'
);
const stmtDeleteDep = db.prepare(
  'DELETE FROM task_dependencies WHERE task_id = ? AND depends_on = ?'
);
const stmtGetDependencies = db.prepare(
  'SELECT depends_on FROM task_dependencies WHERE task_id = ?'
);
const stmtGetDependents = db.prepare(
  'SELECT task_id FROM task_dependencies WHERE depends_on = ?'
);
const stmtGetDependenciesWithInfo = db.prepare(
  `SELECT t.id, t.title, t.status
   FROM task_dependencies td
   JOIN tasks t ON td.depends_on = t.id
   WHERE td.task_id = ?`
);
const stmtGetDependentsWithInfo = db.prepare(
  `SELECT t.id, t.title, t.status
   FROM task_dependencies td
   JOIN tasks t ON td.task_id = t.id
   WHERE td.depends_on = ?`
);
const stmtUnmetDeps = db.prepare(
  `SELECT COUNT(*) as cnt FROM task_dependencies td
   JOIN tasks t ON td.depends_on = t.id
   WHERE td.task_id = ? AND t.status != 'done'`
);
const stmtHasDeps = db.prepare(
  'SELECT COUNT(*) as cnt FROM task_dependencies WHERE task_id = ?'
);

export function addDependency(taskId: string, dependsOn: string): void {
  stmtInsertDep.run(taskId, dependsOn);
}

export function removeDependency(taskId: string, dependsOn: string): void {
  stmtDeleteDep.run(taskId, dependsOn);
}

export function getDependencies(taskId: string): string[] {
  const rows = stmtGetDependencies.all(taskId) as { depends_on: string }[];
  return rows.map((r) => r.depends_on);
}

export function getDependents(taskId: string): string[] {
  const rows = stmtGetDependents.all(taskId) as { task_id: string }[];
  return rows.map((r) => r.task_id);
}

export function getDependenciesWithInfo(taskId: string): DependencyInfo[] {
  return stmtGetDependenciesWithInfo.all(taskId) as DependencyInfo[];
}

export function getDependentsWithInfo(taskId: string): DependencyInfo[] {
  return stmtGetDependentsWithInfo.all(taskId) as DependencyInfo[];
}

export function areDependenciesMet(taskId: string): boolean {
  const { cnt: total } = stmtHasDeps.get(taskId) as { cnt: number };
  if (total === 0) return true;
  const { cnt: unmet } = stmtUnmetDeps.get(taskId) as { cnt: number };
  return unmet === 0;
}

/**
 * Check if adding a dependency (taskId -> dependsOn) would create a cycle.
 * Walks the dependency chain from dependsOn to see if it eventually reaches taskId.
 */
export function wouldCreateCycle(taskId: string, dependsOn: string): boolean {
  const visited = new Set<string>();
  const queue = [dependsOn];

  while (queue.length > 0) {
    const current = queue.pop()!;
    if (current === taskId) return true;
    if (visited.has(current)) continue;
    visited.add(current);

    const deps = getDependencies(current);
    for (const dep of deps) {
      queue.push(dep);
    }
  }

  return false;
}
