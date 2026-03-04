'use client';

import { DONE_PAGE_WINDOW } from '@/lib/constants';

interface PaginationProps {
  page: number;
  totalPages: number;
  window?: number;
  onPageChange: (page: number) => void;
}

function buildPageNumbers(current: number, total: number, windowSize: number): (number | 'ellipsis')[] {
  if (total <= windowSize + 2) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const half = Math.floor(windowSize / 2);
  let start = Math.max(2, current - half);
  let end = Math.min(total - 1, current + half);

  // Adjust if window is too close to edges
  if (end - start + 1 < windowSize) {
    if (start === 2) {
      end = Math.min(total - 1, start + windowSize - 1);
    } else {
      start = Math.max(2, end - windowSize + 1);
    }
  }

  const pages: (number | 'ellipsis')[] = [1];

  if (start > 2) pages.push('ellipsis');
  for (let i = start; i <= end; i++) pages.push(i);
  if (end < total - 1) pages.push('ellipsis');

  pages.push(total);

  return pages;
}

const btnBase = 'flex h-7 min-w-7 items-center justify-center rounded text-xs font-medium transition-colors';

export function Pagination({ page, totalPages, window: windowSize, onPageChange }: Readonly<PaginationProps>) {
  const win = windowSize ?? DONE_PAGE_WINDOW;

  if (totalPages <= 1) return null;

  const pages = buildPageNumbers(page, totalPages, win);

  return (
    <div className="flex items-center justify-center gap-1 py-2">
      {/* Prev */}
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        className={`${btnBase} cursor-pointer px-1.5 text-stone-400 hover:text-stone-600 disabled:opacity-30 disabled:cursor-not-allowed`}
        aria-label="Previous page"
      >
        &lt;
      </button>

      {/* Page numbers */}
      {pages.map((item, idx) =>
        item === 'ellipsis' ? (
          <span key={`e${idx}`} className="flex h-7 min-w-5 items-center justify-center text-xs text-stone-300">
            ...
          </span>
        ) : (
          <button
            key={item}
            onClick={() => onPageChange(item)}
            className={`${btnBase} cursor-pointer px-1.5 ${
              item === page
                ? 'bg-emerald-500 text-white shadow-sm'
                : 'text-stone-500 hover:bg-stone-100'
            }`}
          >
            {item}
          </button>
        ),
      )}

      {/* Next */}
      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        className={`${btnBase} cursor-pointer px-1.5 text-stone-400 hover:text-stone-600 disabled:opacity-30 disabled:cursor-not-allowed`}
        aria-label="Next page"
      >
        &gt;
      </button>
    </div>
  );
}
