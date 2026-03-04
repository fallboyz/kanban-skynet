import { z } from 'zod';

// ============================================================
// Input length limits
// ============================================================

export const MAX_NAME_LENGTH = 100;
export const MAX_TITLE_LENGTH = 200;
export const MAX_DESCRIPTION_LENGTH = 10_000;
export const MAX_COMMENT_LENGTH = 10_000;
export const MAX_AUTHOR_LENGTH = 100;
export const MAX_REASON_LENGTH = 1_000;

// ============================================================
// Validation Sets (used by API routes)
// ============================================================

export const VALID_STATUSES: ReadonlySet<string> = new Set([
  'ready', 'in_progress', 'review', 'done', 'cancelled',
]);

export const VALID_PRIORITIES: ReadonlySet<string> = new Set([
  'critical', 'high', 'medium', 'low',
]);

export const VALID_ROLES: ReadonlySet<string> = new Set([
  'ARCHITECT', 'DATABASE', 'BACKEND', 'FRONTEND', 'SECURITY', 'QA',
]);

// ============================================================
// Status transition rules (used by API routes + MCP tools)
// ============================================================

export const VALID_TRANSITIONS: Readonly<Record<string, readonly string[]>> = {
  ready: ['in_progress', 'cancelled'],
  in_progress: ['review', 'ready', 'cancelled'],
  review: ['done', 'in_progress', 'cancelled'],
  done: [],
  cancelled: [],
};

// ============================================================
// Zod schemas (used by MCP tools)
// ============================================================

export const TaskStatusSchema = z.enum([
  'ready', 'in_progress', 'review', 'done', 'cancelled',
]);

export const TaskPrioritySchema = z.enum([
  'critical', 'high', 'medium', 'low',
]);

export const TaskRoleSchema = z.enum([
  'ARCHITECT', 'DATABASE', 'BACKEND', 'FRONTEND', 'SECURITY', 'QA',
]);
