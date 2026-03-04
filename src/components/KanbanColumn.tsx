'use client';

import type { Task, TaskStatus } from '@/types';
import { TaskCard } from '@/components/TaskCard';
import { Pagination } from '@/components/Pagination';

interface KanbanColumnProps {
  status: TaskStatus;
  title: string;
  subtitle: string;
  color: string;
  emptyText: string;
  tasks: Task[];
  onTaskClick: (task: Task) => void;
  // Done column pagination (optional)
  totalCount?: number;
  search?: string;
  onSearchChange?: (search: string) => void;
  page?: number;
  pageSize?: number;
  onPageChange?: (page: number) => void;
}

const columnStyle: Record<string, {
  titleColor: string;
  badgeBg: string;
  badgeText: string;
  badgeBorder: string;
}> = {
  slate: {
    titleColor: 'text-slate-600',
    badgeBg: 'bg-white',
    badgeText: 'text-slate-500',
    badgeBorder: 'border-slate-200',
  },
  blue: {
    titleColor: 'text-blue-600',
    badgeBg: 'bg-blue-50',
    badgeText: 'text-blue-600',
    badgeBorder: 'border-blue-200',
  },
  purple: {
    titleColor: 'text-purple-600',
    badgeBg: 'bg-purple-50',
    badgeText: 'text-purple-600',
    badgeBorder: 'border-purple-200',
  },
  emerald: {
    titleColor: 'text-emerald-600',
    badgeBg: 'bg-emerald-50',
    badgeText: 'text-emerald-600',
    badgeBorder: 'border-emerald-200',
  },
};

export function KanbanColumn({
  status,
  title,
  subtitle,
  color,
  emptyText,
  tasks,
  onTaskClick,
  totalCount,
  search,
  onSearchChange,
  page,
  pageSize,
  onPageChange,
}: Readonly<KanbanColumnProps>) {
  const style = columnStyle[color] ?? columnStyle.blue;
  const isDone = status === 'done';
  const hasPagination = isDone && onPageChange && page !== undefined && pageSize !== undefined;
  const badgeCount = totalCount ?? tasks.length;
  const totalPages = hasPagination ? Math.ceil((totalCount ?? 0) / pageSize) : 0;

  return (
    <div className="zone flex min-w-67.5 flex-1 flex-col p-3">
      <div className="flex items-center justify-between mb-3 px-1">
        <div>
          <span className={`text-sm font-extrabold tracking-wide ${style.titleColor}`}>{title}</span>
          <span className="text-xs text-slate-400 ml-1.5">{subtitle}</span>
        </div>
        <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border shadow-sm tabular-nums ${style.badgeBg} ${style.badgeText} ${style.badgeBorder}`}>
          {badgeCount}
        </span>
      </div>

      {/* Done column search */}
      {isDone && onSearchChange && (
        <div className="mb-2 px-1">
          <div className="relative">
            <svg
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-emerald-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2.5}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
            </svg>
            <input
              type="text"
              value={search ?? ''}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Search completed tasks..."
              className="w-full rounded-lg border border-emerald-200 bg-emerald-50/50 pl-8 pr-2.5 py-1.5 text-xs text-stone-700 placeholder:text-emerald-300 focus:border-emerald-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-emerald-200"
            />
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col gap-4 overflow-y-auto pt-1" style={{ maxHeight: 'calc(100vh - 200px)' }}>
        {tasks.map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            isDone={isDone}
            onClick={() => onTaskClick(task)}
          />
        ))}
        {tasks.length === 0 && (
          <div className="flex-1 flex items-start justify-center pt-8">
            <p className="text-xs text-stone-300 uppercase tracking-widest font-semibold">
              {emptyText}
            </p>
          </div>
        )}
      </div>

      {/* Done column pagination */}
      {hasPagination && totalPages > 1 && (
        <Pagination page={page} totalPages={totalPages} onPageChange={onPageChange} />
      )}
    </div>
  );
}
