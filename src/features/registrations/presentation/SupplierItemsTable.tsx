import { useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { PaginationBar } from "@/shared/ui/admin/AdminPagination";
import { INPUT } from "@/shared/ui/admin/AdminFormControls";
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
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    if (!query) return items;
    return items.filter(item => `${item.name} ${item.sku || ""}`.toLocaleLowerCase("pt-BR").includes(query));
  }, [items, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  useEffect(() => { setPage(1); }, [search, pageSize]);
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  return <div className="min-w-0">
    {items.length > 0 && <div className="mb-4 max-w-md">
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8a98aa]" />
        <input
          className={`${INPUT} pl-9`}
          value={search}
          onChange={event => setSearch(event.target.value)}
          placeholder="Pesquisar item por nome ou SKU"
        />
      </div>
    </div>}

    {items.length === 0 ? <p className="text-sm text-[#5a6a82]">{emptyText}</p> : <>
      <div className="overflow-x-auto border-y border-[#0d1b2e]/8">
        <table className="min-w-[620px] w-full">
          <thead>
            <tr>
              <th className="text-left">Item</th>
              <th className="text-left">SKU</th>
              <th className="text-left">Status</th>
              {onRemove && <th className="w-24 text-right">Ações</th>}
            </tr>
          </thead>
          <tbody>
            {paged.length ? paged.map(item => <tr key={item.id}>
              <td className="font-bold text-[#0d1b2e]">{item.name}</td>
              <td>{item.sku || "—"}</td>
              <td><span className={item.is_active ? "font-bold text-emerald-700" : "font-bold text-slate-500"}>{item.is_active ? "Ativo" : "Inativo"}</span></td>
              {onRemove && <td className="text-right">
                <button
                  type="button"
                  onClick={() => onRemove(item.id)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-red-200 text-red-600 hover:bg-red-50"
                  aria-label={`Remover ${item.name}`}
                  title="Remover vínculo"
                ><X size={14} /></button>
              </td>}
            </tr>) : <tr><td colSpan={onRemove ? 4 : 3} className="py-6 text-center text-sm text-[#5a6a82]">Nenhum item encontrado.</td></tr>}
          </tbody>
        </table>
      </div>
      <PaginationBar
        page={safePage}
        pageSize={pageSize}
        totalItems={filtered.length}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />
    </>}
  </div>;
}
