'use client';

import type { Task, TaskStatus } from '@/types';
import { TaskCard } from '@/components/TaskCard';

interface KanbanColumnProps {
  status: TaskStatus;
  title: string;
  subtitle: string;
  color: string;
  emptyText: string;
  tasks: Task[];
  onTaskClick: (task: Task) => void;
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
}: Readonly<KanbanColumnProps>) {
  const style = columnStyle[color] ?? columnStyle.blue;
  const isDone = status === 'done';

  return (
    <div className="zone flex min-w-67.5 flex-1 flex-col p-3">
      <div className="flex items-center justify-between mb-3 px-1">
        <div>
          <span className={`text-sm font-extrabold tracking-wide ${style.titleColor}`}>{title}</span>
          <span className="text-xs text-slate-400 ml-1.5">{subtitle}</span>
        </div>
        <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border shadow-sm tabular-nums ${style.badgeBg} ${style.badgeText} ${style.badgeBorder}`}>
          {tasks.length}
        </span>
      </div>

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
    </div>
  );
}
