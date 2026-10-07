import React, { useEffect, useRef } from "react";
import { AdminSelect } from "@/shared/ui/admin/AdminFormControls";

const DEFAULT_ADMIN_PAGE_SIZE = 5;
const DEFAULT_ADMIN_PAGE_SIZE_OPTIONS = [5, 10, 20, 30, 50, 100];
const ADMIN_PAGE_SIZE_STORAGE_KEY = "union-admin-page-size-v1";

function readPersistedPageSize(options: number[]) {
  if (typeof window === "undefined") return null;
  try {
    const value = Number(window.localStorage.getItem(ADMIN_PAGE_SIZE_STORAGE_KEY));
    return Number.isFinite(value) && options.includes(value) ? value : null;
  } catch {
    return null;
  }
}

function persistPageSize(value: number) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(ADMIN_PAGE_SIZE_STORAGE_KEY, String(value));
  } catch {
    // Preferência visual não deve impedir o uso da paginação.
  }
}

export function PaginationBar({
  page,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
  defaultPageSize = DEFAULT_ADMIN_PAGE_SIZE,
  pageSizeOptions = DEFAULT_ADMIN_PAGE_SIZE_OPTIONS,
  showPageSizeSelector = true,
}: {
  page: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (nextPage: number) => void;
  onPageSizeChange: (nextPageSize: number) => void;
  defaultPageSize?: number;
  pageSizeOptions?: number[];
  showPageSizeSelector?: boolean;
}) {
  const normalizedRef = useRef(false);

  useEffect(() => {
    if (normalizedRef.current) return;
    normalizedRef.current = true;

    const persistedPageSize = readPersistedPageSize(pageSizeOptions);
    if (persistedPageSize !== null && pageSize !== persistedPageSize) {
      onPageSizeChange(persistedPageSize);
    }
  }, [pageSize, pageSizeOptions, onPageSizeChange]);

  const handlePageSizeChange = (nextPageSize: number) => {
    if (!pageSizeOptions.includes(nextPageSize)) return;
    persistPageSize(nextPageSize);
    onPageSizeChange(nextPageSize);
  };

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  if (totalItems === 0) return null;

  const pageButton = "flex h-11 w-11 cursor-default items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-default disabled:opacity-40 sm:h-8 sm:w-8";
  return <div className={`flex min-w-0 flex-col gap-3 border-t border-border bg-muted/55 px-4 py-3 sm:flex-row sm:items-center ${showPageSizeSelector ? "sm:justify-between" : "sm:justify-end"}`}>
    {showPageSizeSelector && <div className="flex min-w-0 items-center justify-between gap-2 text-xs text-muted-foreground sm:justify-start">
      <span>Linhas:</span>
      <div className="w-[88px]"><AdminSelect value={pageSize} onValueChange={value => handlePageSizeChange(Number(value))} options={pageSizeOptions.map(value => ({ value, label: String(value) }))} className="min-h-11 py-2 text-xs sm:min-h-8 sm:py-1.5" ariaLabel="Linhas por página" /></div>
    </div>}
    <div className="grid min-w-0 grid-cols-[44px_44px_1fr_44px_44px] items-center gap-2 sm:flex sm:justify-end">
      <button type="button" onClick={() => onPageChange(1)} disabled={page <= 1} className={pageButton} aria-label="Primeira página">«</button>
      <button type="button" onClick={() => onPageChange(page - 1)} disabled={page <= 1} className={pageButton} aria-label="Página anterior">‹</button>
      <span className="min-w-0 text-center text-xs font-bold text-foreground">{page} de {totalPages}</span>
      <button type="button" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages} className={pageButton} aria-label="Próxima página">›</button>
      <button type="button" onClick={() => onPageChange(totalPages)} disabled={page >= totalPages} className={pageButton} aria-label="Última página">»</button>
    </div>
  </div>;
}
