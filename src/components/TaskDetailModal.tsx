'use client';

import { useEffect } from 'react';
import type { Comment, Task, TaskPriority, TaskRole, TaskStatus } from '@/types';
import { formatRelativeTime } from '@/lib/utils';

interface TaskDetailModalProps {
  task: Task;
  comments: Comment[];
  dependencies: string[];
  dependents: string[];
  allTasks: Task[];
  onClose: () => void;
}

const gradeConfig: Record<TaskPriority, { label: string; cssClass: string }> = {
  critical: { label: 'SS', cssClass: 'grade-ss' },
  high: { label: 'S', cssClass: 'grade-s' },
  medium: { label: 'A', cssClass: 'grade-a' },
  low: { label: 'B', cssClass: 'grade-b' },
};

const roleConfig: Record<TaskRole, { label: string; color: string; bg: string }> = {
  ARCHITECT: { label: 'Architect', color: 'text-teal-600', bg: 'bg-teal-50' },
  DATABASE: { label: 'Database', color: 'text-emerald-600', bg: 'bg-emerald-50' },
  BACKEND: { label: 'Backend', color: 'text-blue-600', bg: 'bg-blue-50' },
  FRONTEND: { label: 'Frontend', color: 'text-violet-600', bg: 'bg-violet-50' },
  SECURITY: { label: 'Security', color: 'text-rose-600', bg: 'bg-rose-50' },
  QA: { label: 'QA', color: 'text-pink-600', bg: 'bg-pink-50' },
};

const statusConfig: Record<TaskStatus, { label: string; className: string }> = {
  ready: { label: 'Deck', className: 'text-blue-600' },
  in_progress: { label: 'Battle', className: 'text-orange-600' },
  review: { label: 'Judge', className: 'text-purple-600' },
  done: { label: 'Victory', className: 'text-emerald-600' },
  cancelled: { label: 'Cancelled', className: 'text-stone-400' },
};

function depStatusDotColor(status: string | undefined): string {
  if (status === 'done') return 'bg-emerald-400';
  if (status === 'in_progress') return 'bg-orange-400';
  return 'bg-slate-300';
}

export function TaskDetailModal({
  task,
  comments,
  dependencies,
  dependents,
  allTasks,
  onClose,
}: Readonly<TaskDetailModalProps>) {
  const grade = gradeConfig[task.priority];
  const role = roleConfig[task.role];
  const status = statusConfig[task.status];

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm cursor-pointer"
      onClick={onClose}
    >
      <dialog
        open
        aria-label={task.title}
        className="relative flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl border border-stone-200 bg-white shadow-2xl shadow-black/10 cursor-default m-0 text-left"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-start justify-between border-b border-stone-100 p-5">
          <div className="flex flex-wrap items-center gap-2 pr-6">
            <span className={`grade ${grade.cssClass}`}>
              {grade.label}등급
            </span>
            <span className={`inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-bold ${role.bg} ${role.color}`}>
              {role.label}
            </span>
            {task.is_blocked && (
              <span className="inline-flex items-center rounded-lg bg-red-50 px-2 py-0.5 text-xs font-bold text-red-500">
                BLOCKED
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="cursor-pointer absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-full text-stone-400 hover:bg-stone-100 hover:text-stone-600"
          >
            x
          </button>
        </div>

        {/* 본문 (스크롤) */}
        <div className="flex-1 overflow-y-auto p-5">
          <h2 className="mb-4 text-lg font-semibold text-stone-800">
            {task.title}
          </h2>

          {/* 메타 정보 */}
          <div className="mb-4 grid grid-cols-2 gap-3 rounded-xl bg-stone-50 border border-stone-100 p-3 text-sm">
            <div>
              <span className="text-stone-400">Status:</span>{' '}
              <span className={`font-medium ${status.className}`}>
                {status.label}
              </span>
            </div>
            <div>
              <span className="text-stone-400">Assigned:</span>{' '}
              <span className="font-medium text-stone-700">
                {task.agent_name ?? 'Unassigned'}
              </span>
            </div>
            <div>
              <span className="text-stone-400">Grade:</span>{' '}
              <span className={`grade ${grade.cssClass} ml-1`}>
                {grade.label}등급
              </span>
            </div>
            <div>
              <span className="text-stone-400">Role:</span>{' '}
              <span className={`font-medium ${role.color}`}>{role.label}</span>
            </div>
          </div>

          {/* 설명 */}
          {task.description && (
            <div className="mb-4">
              <h3 className="mb-1.5 text-xs font-medium text-stone-400 uppercase tracking-wider text-center">
                Description
              </h3>
              <p className="whitespace-pre-wrap text-sm text-stone-600 leading-relaxed">
                {task.description}
              </p>
            </div>
          )}

          {/* Blocked 사유 */}
          {task.is_blocked && task.blocked_reason && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3">
              <p className="text-xs font-bold tracking-wider text-red-500 text-center">BLOCKED REASON</p>
              <p className="mt-1 text-sm text-red-600">{task.blocked_reason}</p>
            </div>
          )}

          {/* 의존관계 */}
          {(dependencies.length > 0 || dependents.length > 0) && (
            <div className="mb-4">
              <h3 className="mb-2 text-xs font-medium text-stone-400 uppercase tracking-wider text-center">
                Dependencies
              </h3>
              <div className="flex flex-col gap-2">
                {dependencies.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs text-stone-400">Depends on:</p>
                    <div className="flex flex-col gap-1">
                      {dependencies.map((depId) => {
                        const depTask = allTasks.find((t) => t.id === depId);
                        const depStatus = depTask ? statusConfig[depTask.status] : null;
                        return (
                          <div
                            key={depId}
                            className="flex items-center gap-2 rounded-lg border border-stone-100 bg-stone-50 px-2.5 py-1.5 text-sm"
                          >
                            <span
                              className={`inline-block h-2 w-2 shrink-0 rounded-full ${depStatusDotColor(depTask?.status)}`}
                            />
                            <span className="truncate text-stone-600">
                              {depTask?.title ?? depId}
                            </span>
                            <span className={`ml-auto shrink-0 text-xs ${depStatus?.className ?? 'text-stone-400'}`}>
                              {depStatus?.label ?? 'unknown'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                {dependents.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs text-stone-400">Blocks:</p>
                    <div className="flex flex-col gap-1">
                      {dependents.map((depId) => {
                        const depTask = allTasks.find((t) => t.id === depId);
                        const depStatus = depTask ? statusConfig[depTask.status] : null;
                        return (
                          <div
                            key={depId}
                            className="flex items-center gap-2 rounded-lg border border-stone-100 bg-stone-50 px-2.5 py-1.5 text-sm"
                          >
                            <span className="truncate text-stone-600">
                              {depTask?.title ?? depId}
                            </span>
                            <span className={`ml-auto shrink-0 text-xs ${depStatus?.className ?? 'text-stone-400'}`}>
                              {depStatus?.label ?? 'unknown'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 댓글 */}
          <div>
            <h3 className="mb-3 text-xs font-medium text-stone-400 uppercase tracking-wider text-center">
              Comments / Log
              {comments.length > 0 && (
                <span className="ml-1.5 text-stone-300">({comments.length})</span>
              )}
            </h3>
            {comments.length === 0 ? (
              <p className="text-sm text-stone-400">No comments yet.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {comments.map((comment) => (
                  <div
                    key={comment.id}
                    className="rounded-xl border border-stone-100 bg-stone-50 p-3"
                  >
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-xs font-semibold text-stone-700">
                        {comment.author}
                      </span>
                      <span className="text-xs tabular-nums text-stone-400">
                        {formatRelativeTime(comment.created_at)}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap text-sm text-stone-600">
                      {comment.content}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </dialog>
    </div>
  );
}
