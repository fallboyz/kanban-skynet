import { describe, it, expect, beforeEach } from 'vitest';
import { resetDb, seedWorkspaceAndProject } from '../../__tests__/helpers.js';
import { createTask } from '../tasks.js';
import { createComment, getCommentsByTask } from '../comments.js';

let projectId: string;

beforeEach(() => {
  resetDb();
  const { proj } = seedWorkspaceAndProject();
  projectId = proj.id;
});

describe('createComment', () => {
  it('should create a comment and return it', () => {
    const task = createTask({ project_id: projectId, title: 'T1' });
    const comment = createComment({
      task_id: task.id,
      content: 'Hello',
      author: 'agent-1',
    });

    expect(comment.id).toBeDefined();
    expect(comment.task_id).toBe(task.id);
    expect(comment.content).toBe('Hello');
    expect(comment.author).toBe('agent-1');
    expect(comment.created_at).toBeGreaterThan(0);
  });
});

describe('getCommentsByTask', () => {
  it('should return empty array when no comments exist', () => {
    const task = createTask({ project_id: projectId, title: 'T1' });
    expect(getCommentsByTask(task.id)).toEqual([]);
  });

  it('should return comments in created_at ASC order', () => {
    const task = createTask({ project_id: projectId, title: 'T1' });

    const c1 = createComment({ task_id: task.id, content: 'First', author: 'a' });
    const c2 = createComment({ task_id: task.id, content: 'Second', author: 'b' });
    const c3 = createComment({ task_id: task.id, content: 'Third', author: 'c' });

    const comments = getCommentsByTask(task.id);
    expect(comments).toHaveLength(3);
    expect(comments[0].id).toBe(c1.id);
    expect(comments[1].id).toBe(c2.id);
    expect(comments[2].id).toBe(c3.id);
  });

  it('should only return comments for the specified task', () => {
    const t1 = createTask({ project_id: projectId, title: 'T1' });
    const t2 = createTask({ project_id: projectId, title: 'T2' });

    createComment({ task_id: t1.id, content: 'for t1', author: 'a' });
    createComment({ task_id: t2.id, content: 'for t2', author: 'b' });

    const comments = getCommentsByTask(t1.id);
    expect(comments).toHaveLength(1);
    expect(comments[0].task_id).toBe(t1.id);
  });
});
