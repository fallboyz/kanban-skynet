'use client';

import { useMemo } from 'react';
import type { Task, TaskStatus } from '@/types';
import { KanbanColumn } from '@/components/KanbanColumn';

interface KanbanBoardProps {
  tasks: Task[];           // ready + in_progress + review (non-done)
  doneTasks: Task[];       // done (server-paginated)
  doneTotal: number;
  donePage: number;
  donePageSize: number;
  doneSearch: string;
  onDonePageChange: (page: number) => void;
  onDoneSearchChange: (search: string) => void;
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

export function KanbanBoard({
  tasks,
  doneTasks,
  doneTotal,
  donePage,
  donePageSize,
  doneSearch,
  onDonePageChange,
  onDoneSearchChange,
  onTaskClick,
}: Readonly<KanbanBoardProps>) {
  // cancelled tasks are hidden from the kanban board
  const tasksByStatus = useMemo(() => {
    const visible = tasks.filter((t) => t.status !== 'cancelled');
    return COLUMNS.reduce<Record<TaskStatus, Task[]>>(
      (acc, col) => {
        if (col.status === 'done') {
          // Done uses server-paginated data directly
          acc[col.status] = doneTasks;
        } else {
          acc[col.status] = visible.filter((t) => t.status === col.status);
        }
        return acc;
      },
      {} as Record<TaskStatus, Task[]>,
    );
  }, [tasks, doneTasks]);

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
          {...(col.status === 'done' ? {
            totalCount: doneTotal,
            search: doneSearch,
            onSearchChange: onDoneSearchChange,
            page: donePage,
            pageSize: donePageSize,
            onPageChange: onDonePageChange,
          } : {})}
        />
      ))}
    </div>
  );
}
