'use client';

import { useMemo } from 'react';
import type { Task } from '@/types';

interface StatsBarProps {
  tasks: Task[];     // non-done tasks (ready + in_progress + review)
  doneTotal: number; // total done count from server pagination
}

export function StatsBar({ tasks, doneTotal }: Readonly<StatsBarProps>) {
  const { total, done, active, blocked, rate } = useMemo(() => {
    const visible = tasks.filter((t) => t.status !== 'cancelled');
    const nonDoneCount = visible.length;
    const d = doneTotal;
    const t = nonDoneCount + d;
    const a = visible.filter(
      (tk) => tk.status === 'in_progress' || tk.status === 'review',
    ).length;
    const b = visible.filter((tk) => tk.is_blocked).length;
    const r = t > 0 ? Math.round((d / t) * 100) : 0;
    return { total: t, done: d, active: a, blocked: b, rate: r };
  }, [tasks, doneTotal]);

  return (
    <div className="flex items-center gap-3">
      <StatCard
        value={total}
        line1="Total"
        line2="Tasks"
        bgClass="bg-stone-50"
        borderClass="border-stone-200"
        valueClass="text-stone-800"
        labelClass="text-stone-400"
      />
      <StatCard
        value={active}
        line1="In"
        line2="Battle"
        bgClass="bg-blue-50"
        borderClass="border-blue-100"
        valueClass="text-blue-600"
        labelClass="text-blue-400"
      />
      {blocked > 0 && (
        <StatCard
          value={blocked}
          line1="Alert"
          bgClass="bg-red-50"
          borderClass="border-red-100"
          valueClass="text-red-500"
          labelClass="text-red-400"
        />
      )}
      <StatCard
        value={done}
        line1="Victory"
        bgClass="bg-emerald-50"
        borderClass="border-emerald-100"
        valueClass="text-emerald-600"
        labelClass="text-emerald-400"
      />
      <div className="flex flex-col items-center rounded-xl border border-violet-100 bg-violet-50 px-3 py-2 min-w-15">
        <span className="text-xl font-extrabold tabular-nums text-violet-600">{rate}%</span>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-violet-200">
          <div
            className="h-full rounded-full bg-linear-to-r from-violet-500 to-fuchsia-500 transition-all duration-500"
            style={{ width: `${rate}%` }}
          />
        </div>
      </div>
    </div>
  );
}

interface StatCardProps {
  value: number;
  line1: string;
  line2?: string;
  bgClass: string;
  borderClass: string;
  valueClass: string;
  labelClass: string;
}

function StatCard({ value, line1, line2, bgClass, borderClass, valueClass, labelClass }: Readonly<StatCardProps>) {
  return (
    <div className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 ${bgClass} ${borderClass}`}>
      <span className={`text-2xl font-extrabold tabular-nums ${valueClass}`}>{value}</span>
      <span className={`text-[10px] uppercase tracking-wider leading-tight ${labelClass}`}>
        {line1}
        {line2 && (
          <>
            <br />
            {line2}
          </>
        )}
      </span>
    </div>
  );
}
