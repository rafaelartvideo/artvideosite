import React from "react";
import { cn } from "@/shared/domain/formatters";
import { INPUT } from "@/shared/ui/admin/AdminFormControls";

export function PaginationBar({ page, pageSize, totalItems, onPageChange, onPageSizeChange }: {
  page: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (nextPage: number) => void;
  onPageSizeChange: (nextPageSize: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  if (totalItems === 0) return null;

  const pageButton = "flex h-8 w-8 items-center justify-center rounded-lg border border-[#0d1b2e]/15 bg-white text-[#5a6a82] disabled:cursor-not-allowed disabled:opacity-40 hover:bg-[#f5f7fa]";
  return <div className="flex flex-col gap-3 border-t border-[#0d1b2e]/8 bg-[#f8fafc] px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
    <div className="flex items-center gap-2 text-xs text-[#5a6a82]">
      <span>Linhas:</span>
      <select value={pageSize} onChange={event => onPageSizeChange(Number(event.target.value))} className={cn(INPUT, "w-[82px] py-2 text-xs")}>
        {[5, 10, 20, 30, 50, 100].map(value => <option key={value} value={value}>{value}</option>)}
      </select>
    </div>
    <div className="flex items-center justify-end gap-2">
      <button type="button" onClick={() => onPageChange(1)} disabled={page <= 1} className={pageButton} aria-label="Primeira página">«</button>
      <button type="button" onClick={() => onPageChange(page - 1)} disabled={page <= 1} className={pageButton} aria-label="Página anterior">‹</button>
      <span className="min-w-[92px] text-center text-xs font-bold text-[#0d1b2e]">{page} de {totalPages}</span>
      <button type="button" onClick={() => onPageChange(page + 1)} disabled={page >= totalPages} className={pageButton} aria-label="Próxima página">›</button>
      <button type="button" onClick={() => onPageChange(totalPages)} disabled={page >= totalPages} className={pageButton} aria-label="Última página">»</button>
    </div>
  </div>;
}
