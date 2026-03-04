'use client';

import { useMemo } from 'react';
import type { Task, TaskStatus } from '@/types';
import { KanbanColumn } from '@/components/KanbanColumn';

interface KanbanBoardProps {
  tasks: Task[];
  onTaskClick: (task: Task) => void;
}

interface ColumnDef {
  status: TaskStatus;
  title: string;
  subtitle: string;
  color: string;
  emptyText: string;
}

const COLUMNS: ColumnDef[] = [
  { status: 'ready', title: 'Deck', subtitle: 'Ready', color: 'slate', emptyText: 'No Cards in Deck' },
  { status: 'in_progress', title: 'Battle', subtitle: 'In Progress', color: 'blue', emptyText: 'Awaiting Orders' },
  { status: 'review', title: 'Judge', subtitle: 'Review', color: 'purple', emptyText: 'Awaiting Judgment' },
  { status: 'done', title: 'Victory', subtitle: 'Done', color: 'emerald', emptyText: 'No Victories Yet' },
];

export function KanbanBoard({ tasks, onTaskClick }: Readonly<KanbanBoardProps>) {
  // cancelled tasks are hidden from the kanban board
  const tasksByStatus = useMemo(() => {
    const visible = tasks.filter((t) => t.status !== 'cancelled');
    return COLUMNS.reduce<Record<TaskStatus, Task[]>>(
      (acc, col) => {
        const filtered = visible.filter((t) => t.status === col.status);
        // Done: 최근 완료순 (updated_at DESC — 최근 완료가 위), 나머지: 생성순 (created_at ASC)
        acc[col.status] = col.status === 'done'
          ? filtered.toSorted((a, b) => b.updated_at - a.updated_at)
          : filtered;
        return acc;
      },
      {} as Record<TaskStatus, Task[]>,
    );
  }, [tasks]);

  return (
    <div className="flex h-full min-h-0 flex-1 gap-4 overflow-x-auto p-4">
      {COLUMNS.map((col) => (
        <KanbanColumn
          key={col.status}
          status={col.status}
          title={col.title}
          subtitle={col.subtitle}
          color={col.color}
          emptyText={col.emptyText}
          tasks={tasksByStatus[col.status]}
          onTaskClick={onTaskClick}
        />
      ))}
    </div>
  );
}
