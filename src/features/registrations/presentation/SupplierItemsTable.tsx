import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { StatusBadge } from "@/shared/ui/admin/AdminFeedback";
import { AdminListSection, AdminListSectionRow } from "@/shared/ui/admin/AdminListSection";
import { PaginationBar } from "@/shared/ui/admin/AdminPagination";
import type { SupplierInventoryItem } from "../infrastructure/registrations.repository";

export function SupplierItemsTable({
  items,
  onRemove,
  emptyText = "Nenhum item do estoque vinculado.",
}: {
  items: SupplierInventoryItem[];
  onRemove?: (id: string) => void;
  emptyText?: string;
}) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paged = useMemo(() => items.slice((safePage - 1) * pageSize, safePage * pageSize), [items, safePage, pageSize]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  return <AdminListSection
    title="Itens fornecidos"
    description="Itens do estoque vinculados a este fornecedor."
    count={items.length}
    empty={items.length === 0}
    emptyText={emptyText}
    footer={items.length > 0 ? <PaginationBar
      page={safePage}
      pageSize={pageSize}
      totalItems={items.length}
      onPageChange={setPage}
      onPageSizeChange={setPageSize}
    /> : undefined}
  >
    {paged.map(item => <AdminListSectionRow key={item.id} className="flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className="break-words text-sm font-bold text-[#0d1b2e]">{item.name}</p>
        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[#7c899c]">
          <span className="break-all font-mono">{item.sku ? `SKU ${item.sku}` : "Sem SKU"}</span>
          <StatusBadge status={item.is_active ? "Ativo" : "Inativo"} />
        </div>
      </div>
      {onRemove && <button
        type="button"
        onClick={() => onRemove(item.id)}
        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-red-200 text-red-600 hover:bg-red-50"
        aria-label={`Remover ${item.name}`}
        title="Remover vínculo"
      ><X size={14} /></button>}
    </AdminListSectionRow>)}
  </AdminListSection>;
}
