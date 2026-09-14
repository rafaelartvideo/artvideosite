import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { PaginationBar } from "@/shared/ui/admin/AdminPagination";
import { StatusBadge } from "@/shared/ui/admin/AdminFeedback";
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

  if (items.length === 0) return <p className="py-5 text-center text-sm text-[#5a6a82]">{emptyText}</p>;

  return <div className="min-w-0">
    <div className="overflow-x-auto">
      <table className="min-w-[720px]">
        <thead><tr>
          <th className="text-left">Item</th>
          <th className="text-left">SKU</th>
          <th className="text-left">Status</th>
          {onRemove && <th className="text-right">Ações</th>}
        </tr></thead>
        <tbody>
          {paged.map(item => <tr key={item.id}>
            <td className="font-bold text-[#0d1b2e]">{item.name}</td>
            <td className="text-xs text-[#5a6a82]">{item.sku || "—"}</td>
            <td><StatusBadge status={item.is_active ? "Ativo" : "Inativo"} /></td>
            {onRemove && <td className="text-right">
              <button
                type="button"
                onClick={() => onRemove(item.id)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-red-200 text-red-600 hover:bg-red-50"
                aria-label={`Remover ${item.name}`}
                title="Remover vínculo"
              ><X size={14} /></button>
            </td>}
          </tr>)}
        </tbody>
      </table>
    </div>

    <PaginationBar
      page={safePage}
      pageSize={pageSize}
      totalItems={items.length}
      onPageChange={setPage}
      onPageSizeChange={setPageSize}
    />
  </div>;
}
