import React, { useEffect, useRef } from "react";
import { AdminSelect } from "@/shared/ui/admin/AdminFormControls";

const DEFAULT_ADMIN_PAGE_SIZE = 5;

export function PaginationBar({ page, pageSize, totalItems, onPageChange, onPageSizeChange }: {
  page: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (nextPage: number) => void;
  onPageSizeChange: (nextPageSize: number) => void;
}) {
  const normalizedRef = useRef(false);

  useEffect(() => {
    if (normalizedRef.current) return;
    normalizedRef.current = true;
    if (pageSize !== DEFAULT_ADMIN_PAGE_SIZE) onPageSizeChange(DEFAULT_ADMIN_PAGE_SIZE);
  }, [pageSize, onPageSizeChange]);

  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  if (totalItems === 0) return null;

  const pageButton = "flex h-11 w-11 cursor-default items-center justify-center rounded-lg border border-[#0d1b2e]/15 bg-white text-[#5a6a82] transition-colors disabled:cursor-default disabled:opacity-40 hover:bg-[#f5f7fa] sm:h-8 sm:w-8";
  return <div className="flex min-w-0 flex-col gap-3 border-t border-[#0d1b2e]/8 bg-[#f8fafc] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
    <div className="flex min-w-0 items-center justify-between gap-2 text-xs text-[#5a6a82] sm:justify-start">
      <span>Linhas:</span>
      <div className="w-[88px]"><AdminSelect value={pageSize} onValueChange={value => onPageSizeChange(Number(value))} options={[5, 10, 20, 30, 50, 100].map(value => ({ value, label: String(value) }))} className="min-h-11 py-2 text-xs sm:min-h-8 sm:py-1.5" ariaLabel="Linhas por página" /></div>
    </div>
    <div className="grid min-w-0 grid-cols-[44px_44px_1fr_44px_44px] items-center gap-2 sm:flex sm:justify-end">
      <button type="button" onClick={() => onPageChange(1)} disabled={page <= 1} className={pageButton} aria-label="Primeira página">«</button>
      <button type="button" onClick={() => onPageChange(page - 1)} disabled={page <= 1} className={pageButton} aria-label="Página anterior">‹</button>
      <span className="min-w-0 text-center text-xs font-bold text-[#0d1b2e]">{page} de {totalPages}</span>
      <button type="button" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages} className={pageButton} aria-label="Próxima página">›</button>
      <button type="button" onClick={() => onPageChange(totalPages)} disabled={page >= totalPages} className={pageButton} aria-label="Última página">»</button>
    </div>
  </div>;
}
