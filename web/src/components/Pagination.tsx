"use client";

import { useEffect, useMemo, useState } from "react";

/**
 * Client-side pagination over an already-loaded array.
 * Pass `resetKey` (e.g. a search string or filter object) to jump back to
 * page 1 whenever that value changes.
 */
export function usePagination<T>(rows: T[], initialPageSize = 25, resetKey?: unknown) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    setPage(1);
  }, [resetKey]);

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const page_ = Math.min(page, totalPages);

  const paged = useMemo(() => {
    const start = (page_ - 1) * pageSize;
    return rows.slice(start, start + pageSize);
  }, [rows, page_, pageSize]);

  return {
    page: page_,
    setPage,
    pageSize,
    setPageSize: (n: number) => {
      setPageSize(n);
      setPage(1);
    },
    totalPages,
    total: rows.length,
    paged,
  };
}

export function PaginationBar({
  page,
  totalPages,
  pageSize,
  total,
  onPage,
  onPageSize,
  pageSizeOptions = [10, 25, 50, 100],
}: {
  page: number;
  totalPages: number;
  pageSize: number;
  total: number;
  onPage: (p: number) => void;
  onPageSize: (n: number) => void;
  pageSizeOptions?: number[];
}) {
  if (total === 0) return null;
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-3 py-2.5 text-sm">
      <div className="text-ink-faint">
        Showing <span className="font-medium text-ink">{start}–{end}</span> of{" "}
        <span className="font-medium text-ink">{total}</span>
      </div>
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-1.5 text-ink-faint">
          Rows
          <select
            value={pageSize}
            onChange={(e) => onPageSize(Number(e.target.value))}
            className="rounded-md border border-line bg-white px-1.5 py-1 text-sm text-ink focus:border-brand-500 focus:outline-none"
          >
            {pageSizeOptions.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onPage(1)}
            disabled={page <= 1}
            className="rounded-md border border-line px-2 py-1 text-ink-soft transition-colors hover:bg-surface disabled:cursor-not-allowed disabled:opacity-40"
          >
            «
          </button>
          <button
            type="button"
            onClick={() => onPage(page - 1)}
            disabled={page <= 1}
            className="rounded-md border border-line px-2 py-1 text-ink-soft transition-colors hover:bg-surface disabled:cursor-not-allowed disabled:opacity-40"
          >
            ‹
          </button>
          <span className="px-2 tabular-nums text-ink-soft">
            {page} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => onPage(page + 1)}
            disabled={page >= totalPages}
            className="rounded-md border border-line px-2 py-1 text-ink-soft transition-colors hover:bg-surface disabled:cursor-not-allowed disabled:opacity-40"
          >
            ›
          </button>
          <button
            type="button"
            onClick={() => onPage(totalPages)}
            disabled={page >= totalPages}
            className="rounded-md border border-line px-2 py-1 text-ink-soft transition-colors hover:bg-surface disabled:cursor-not-allowed disabled:opacity-40"
          >
            »
          </button>
        </div>
      </div>
    </div>
  );
}