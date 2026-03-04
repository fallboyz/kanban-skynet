import Database, { type Database as DatabaseType } from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

// ============================================================
// Database initialization
// ============================================================

const DB_PATH = process.env.DB_PATH ?? './data/kanban-skynet.db';

// Ensure the data directory exists
mkdirSync(dirname(DB_PATH), { recursive: true });

const db: DatabaseType = new Database(DB_PATH);

// Pragmas for concurrency and referential integrity
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 5000');
db.pragma('foreign_keys = ON');

// ============================================================
// Schema creation (idempotent)
// ============================================================

db.exec(`
  CREATE TABLE IF NOT EXISTS workspaces (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    created_at  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS projects (
    id           TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    name         TEXT NOT NULL,
    description  TEXT NOT NULL DEFAULT '',
    auto_approve INTEGER NOT NULL DEFAULT 1,
    created_at   INTEGER NOT NULL,
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id             TEXT PRIMARY KEY,
    project_id     TEXT NOT NULL,
    parent_id      TEXT,
    title          TEXT NOT NULL,
    description    TEXT NOT NULL DEFAULT '',
    status         TEXT NOT NULL DEFAULT 'ready'
      CHECK(status IN ('ready','in_progress','review','done','cancelled')),
    priority       TEXT NOT NULL DEFAULT 'medium'
      CHECK(priority IN ('critical','high','medium','low')),
    role           TEXT NOT NULL DEFAULT 'BACKEND'
      CHECK(role IN ('ARCHITECT','DATABASE','BACKEND','FRONTEND','SECURITY','QA')),
    agent_name     TEXT,
    is_blocked     INTEGER NOT NULL DEFAULT 0,
    blocked_reason TEXT,
    created_at     INTEGER NOT NULL,
    updated_at     INTEGER NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id)  REFERENCES tasks(id)    ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS task_dependencies (
    task_id    TEXT NOT NULL,
    depends_on TEXT NOT NULL,
    PRIMARY KEY (task_id, depends_on),
    FOREIGN KEY (task_id)    REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (depends_on) REFERENCES tasks(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS comments (
    id         TEXT PRIMARY KEY,
    task_id    TEXT NOT NULL,
    content    TEXT NOT NULL,
    author     TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_projects_workspace_id ON projects(workspace_id);
  CREATE INDEX IF NOT EXISTS idx_tasks_project_id      ON tasks(project_id);
  CREATE INDEX IF NOT EXISTS idx_tasks_status           ON tasks(status);
  CREATE INDEX IF NOT EXISTS idx_tasks_role             ON tasks(role);
  CREATE INDEX IF NOT EXISTS idx_tasks_parent_id        ON tasks(parent_id);
  CREATE INDEX IF NOT EXISTS idx_deps_task_id           ON task_dependencies(task_id);
  CREATE INDEX IF NOT EXISTS idx_deps_depends_on        ON task_dependencies(depends_on);
  CREATE INDEX IF NOT EXISTS idx_comments_task_id       ON comments(task_id);
`);

// ============================================================
// Migrations (for existing databases)
// ============================================================

try {
  db.exec('ALTER TABLE projects ADD COLUMN auto_approve INTEGER NOT NULL DEFAULT 1');
} catch {
  // Column already exists — ignore
}

// Status migration: todo -> ready, claimed -> in_progress
db.exec(`UPDATE tasks SET status = 'ready' WHERE status = 'todo'`);
db.exec(`UPDATE tasks SET status = 'in_progress' WHERE status = 'claimed'`);

// Role migration: lowercase -> uppercase, remove fullstack/infra
db.exec(`UPDATE tasks SET role = 'BACKEND' WHERE role IN ('backend', 'fullstack', 'infra')`);
db.exec(`UPDATE tasks SET role = 'FRONTEND' WHERE role = 'frontend'`);
db.exec(`UPDATE tasks SET role = 'QA' WHERE role IN ('qa', 'test')`);
db.exec(`UPDATE tasks SET role = 'ARCHITECT' WHERE role = 'architect'`);
db.exec(`UPDATE tasks SET role = 'DATABASE' WHERE role = 'database'`);
db.exec(`UPDATE tasks SET role = 'SECURITY' WHERE role = 'security'`);

// CHECK constraint migration: SQLite doesn't support ALTER CHECK,
// so we must recreate the table if the old constraints are still in place.
{
  const tableInfo = db.prepare(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='tasks'"
  ).get() as { sql: string } | undefined;

  if (tableInfo && tableInfo.sql.includes("'backend'")) {
    db.exec(`
      CREATE TABLE tasks_new (
        id             TEXT PRIMARY KEY,
        project_id     TEXT NOT NULL,
        parent_id      TEXT,
        title          TEXT NOT NULL,
        description    TEXT NOT NULL DEFAULT '',
        status         TEXT NOT NULL DEFAULT 'ready'
          CHECK(status IN ('ready','in_progress','review','done','cancelled')),
        priority       TEXT NOT NULL DEFAULT 'medium'
          CHECK(priority IN ('critical','high','medium','low')),
        role           TEXT NOT NULL DEFAULT 'BACKEND'
          CHECK(role IN ('ARCHITECT','DATABASE','BACKEND','FRONTEND','SECURITY','QA')),
        agent_name     TEXT,
        is_blocked     INTEGER NOT NULL DEFAULT 0,
        blocked_reason TEXT,
        created_at     INTEGER NOT NULL,
        updated_at     INTEGER NOT NULL,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (parent_id)  REFERENCES tasks(id)    ON DELETE CASCADE
      );
      INSERT INTO tasks_new SELECT * FROM tasks;
      DROP TABLE tasks;
      ALTER TABLE tasks_new RENAME TO tasks;

      CREATE INDEX IF NOT EXISTS idx_tasks_project_id ON tasks(project_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_status     ON tasks(status);
      CREATE INDEX IF NOT EXISTS idx_tasks_role       ON tasks(role);
      CREATE INDEX IF NOT EXISTS idx_tasks_parent_id  ON tasks(parent_id);
    `);
    console.log('Migrated tasks table: updated CHECK constraints to uppercase roles');
  }
}

export { db };
