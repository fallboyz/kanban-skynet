'use client';

import { memo, useMemo } from 'react';
import type { Task, TaskPriority, TaskRole } from '@/types';
import { formatRelativeTime } from '@/lib/utils';

interface TaskCardProps {
  task: Task;
  isDone?: boolean;
  onClick: () => void;
}

/* --- priority -> grade config --- */
const gradeConfig: Record<
  TaskPriority,
  { label: string; cssClass: string; rarity: string }
> = {
  critical: { label: 'SS', cssClass: 'grade-ss', rarity: 'rarity-legendary' },
  high: { label: 'S', cssClass: 'grade-s', rarity: 'rarity-epic' },
  medium: { label: 'A', cssClass: 'grade-a', rarity: 'rarity-rare' },
  low: { label: 'B', cssClass: 'grade-b', rarity: '' },
};

/* --- role -> visual config --- */
const roleConfig: Record<
  TaskRole,
  { label: string; bg: string; badgeBg: string; badgeBgDone: string; pushpin: string; dotColor: string }
> = {
  ARCHITECT: {
    label: 'Architect',
    bg: 'bg-role-architect',
    badgeBg: 'bg-teal-500',
    badgeBgDone: 'bg-teal-500/60',
    pushpin: 'bg-linear-to-b from-teal-300 to-teal-500',
    dotColor: 'bg-teal-500',
  },
  DATABASE: {
    label: 'Database',
    bg: 'bg-role-database',
    badgeBg: 'bg-emerald-500',
    badgeBgDone: 'bg-emerald-500/60',
    pushpin: 'bg-linear-to-b from-emerald-300 to-emerald-500',
    dotColor: 'bg-emerald-500',
  },
  BACKEND: {
    label: 'Backend',
    bg: 'bg-role-backend',
    badgeBg: 'bg-blue-500',
    badgeBgDone: 'bg-blue-500/60',
    pushpin: 'bg-linear-to-b from-blue-300 to-blue-500',
    dotColor: 'bg-blue-500',
  },
  FRONTEND: {
    label: 'Frontend',
    bg: 'bg-role-frontend',
    badgeBg: 'bg-violet-500',
    badgeBgDone: 'bg-violet-500/60',
    pushpin: 'bg-linear-to-b from-violet-300 to-violet-500',
    dotColor: 'bg-violet-500',
  },
  SECURITY: {
    label: 'Security',
    bg: 'bg-role-security',
    badgeBg: 'bg-rose-500',
    badgeBgDone: 'bg-rose-500/60',
    pushpin: 'bg-linear-to-b from-rose-300 to-rose-500',
    dotColor: 'bg-rose-500',
  },
  QA: {
    label: 'QA',
    bg: 'bg-role-qa',
    badgeBg: 'bg-pink-500',
    badgeBgDone: 'bg-pink-500/60',
    pushpin: 'bg-linear-to-b from-pink-300 to-pink-500',
    dotColor: 'bg-pink-500',
  },
};

/* deterministic tilt per card based on title hash */
function getTilt(title: string): number {
  let h = 0;
  for (let i = 0; i < title.length; i++) {
    h = ((h << 5) - h + title.charCodeAt(i)) | 0;
  }
  return ((((h % 5) + 5) % 5) - 2) * 0.8; // -1.6 ~ 1.6 deg (symmetric)
}

export const TaskCard = memo(function TaskCard({ task, isDone, onClick }: Readonly<TaskCardProps>) {
  const grade = gradeConfig[task.priority];
  const role = roleConfig[task.role];
  const tilt = useMemo(() => getTilt(task.title), [task.title]);

  const isBlocked = task.is_blocked;

  /* done cards: muted + line-through */
  const doneOpacity = isDone ? 'opacity-55' : '';
  const donePushpin = isDone ? 'bg-linear-to-b from-emerald-300 to-emerald-500' : role.pushpin;
  const doneBadgeBg = isDone ? role.badgeBgDone : role.badgeBg;

  /* blocked cards: red pushpin */
  const actualPushpin = isBlocked ? 'bg-linear-to-b from-red-400 to-red-600' : donePushpin;

  let titleClass: string;
  if (isDone) {
    titleClass = 'mb-2.5 text-slate-600 line-through decoration-emerald-400/60 decoration-2';
  } else if (isBlocked && task.blocked_reason) {
    titleClass = 'mb-1 text-slate-800';
  } else {
    titleClass = 'mb-2.5 text-slate-800';
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={`game-card ${isDone ? '' : grade.rarity} ${doneOpacity} text-left`}
      style={{ transform: `rotate(${tilt}deg)` }}
    >
      {/* card bg color via role */}
      <div className={`absolute inset-0 ${role.bg} rounded-xl`} />

      {/* blocked stripes */}
      {isBlocked && <div className="blocked-overlay" />}

      {/* blocked ribbon tag */}
      {isBlocked && (
        <div className="absolute top-7 right-0 z-10 rounded-l-md bg-red-500 px-2 py-0.5 text-[8px] font-extrabold uppercase tracking-wider text-white shadow-sm">
          Blocked
        </div>
      )}

      {/* pushpin */}
      <div className={`pushpin ${actualPushpin}`} />

      {/* role badge header */}
      <div className={`role-badge ${doneBadgeBg} text-white relative z-1`}>
        <span>{role.label}</span>
        <span className={`grade ${grade.cssClass} ml-auto`} style={isDone ? { opacity: 0.7 } : undefined}>
          {grade.label}등급
        </span>
      </div>

      {/* card body */}
      <div className="relative z-1 p-3">
        <p className={`text-sm font-bold leading-snug ${titleClass}`}>
          {task.title}
        </p>

        {/* blocked reason (below title) */}
        {isBlocked && task.blocked_reason && !isDone && (
          <p className="mb-2 text-[11px] font-medium text-red-500">
            {task.blocked_reason}
          </p>
        )}

        <div className="flex items-center justify-between text-[11px]">
          {isDone ? (
            <>
              <span className="text-slate-400">{task.agent_name ?? 'Unassigned'}</span>
              <span className="text-emerald-500 font-semibold">Victory</span>
            </>
          ) : (
            <>
              <span className="flex items-center gap-1.5 text-slate-500">
                {task.agent_name ? (
                  <>
                    <span className={`agent-dot ${role.dotColor}`} />
                    <span className="font-medium">{task.agent_name}</span>
                  </>
                ) : (
                  <span className="italic text-slate-400">Unassigned</span>
                )}
              </span>
              <span className="text-slate-400 tabular-nums">
                {formatRelativeTime(task.updated_at)}
              </span>
            </>
          )}
        </div>
      </div>
    </button>
  );
});
