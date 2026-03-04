import { ulid } from 'ulidx';
import { db } from './connection.js';
import type { Comment, CreateCommentInput } from '../types.js';

const stmtGetCommentsByTask = db.prepare(
  'SELECT * FROM comments WHERE task_id = ? ORDER BY created_at ASC'
);

const stmtInsertComment = db.prepare(
  'INSERT INTO comments (id, task_id, content, author, created_at) VALUES (?, ?, ?, ?, ?)'
);

export function getCommentsByTask(taskId: string): Comment[] {
  return stmtGetCommentsByTask.all(taskId) as Comment[];
}

export function createComment(input: CreateCommentInput): Comment {
  const id = ulid();
  const now = Date.now();

  stmtInsertComment.run(id, input.task_id, input.content, input.author, now);

  return {
    id,
    task_id: input.task_id,
    content: input.content,
    author: input.author,
    created_at: now,
  };
}
