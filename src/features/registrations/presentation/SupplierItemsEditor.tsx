import { useEffect, useMemo, useState } from "react";
import { Link2, Search, Unlink } from "lucide-react";
import { INPUT } from "@/shared/ui/admin/AdminFormControls";
import { LoadingState, StatusBadge } from "@/shared/ui/admin/AdminFeedback";
import { PaginationBar } from "@/shared/ui/admin/AdminPagination";
import {
  listSupplierInventoryItems,
  type SupplierInventoryItem,
} from "../infrastructure/registrations.repository";

export function SupplierItemsEditor({
  organizationId,
  value,
  onChange,
  disabled = false,
}: {
  organizationId: string | null;
  value: SupplierInventoryItem[];
  onChange: (value: SupplierInventoryItem[]) => void;
  disabled?: boolean;
}) {
  const [items, setItems] = useState<SupplierInventoryItem[]>([]);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    if (!organizationId) {
      setItems([]);
      return () => { active = false; };
    }
    setLoading(true);
    setError("");
    void listSupplierInventoryItems(organizationId).then(({ data, error: queryError }) => {
      if (!active) return;
      setLoading(false);
      if (queryError) {
        setError(queryError.message);
        return;
      }
      setItems((data || []) as SupplierInventoryItem[]);
    });
    return () => { active = false; };
  }, [organizationId]);

  const selectedIds = useMemo(() => new Set(value.map(item => item.id)), [value]);
  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("pt-BR");
    if (!query) return items;
    return items.filter(item => `${item.name} ${item.sku || ""}`.toLocaleLowerCase("pt-BR").includes(query));
  }, [items, search]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const paged = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  useEffect(() => { setPage(1); }, [search, pageSize]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  const toggleItem = (item: SupplierInventoryItem) => {
    if (disabled) return;
    if (selectedIds.has(item.id)) onChange(value.filter(current => current.id !== item.id));
    else onChange([...value, item]);
  };

  return <section className="overflow-hidden rounded-xl border border-[#0d1b2e]/10 bg-white">
    <div className="border-b border-[#0d1b2e]/8 px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-black text-[#0d1b2e]">Itens fornecidos</p>
          <p className="mt-0.5 text-[11px] text-[#5a6a82]">Vincule os itens do estoque fornecidos por este cadastro.</p>
        </div>
        <span className="shrink-0 text-[10px] font-bold text-[#7c899c]">{filtered.length} item{filtered.length === 1 ? "" : "s"}</span>
      </div>
      <div className="relative mx-auto mt-3 w-full max-w-md">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#7c899c]" />
        <input
          className={`${INPUT} h-10 w-full pl-9 pr-3 text-sm`}
          value={search}
          onChange={event => setSearch(event.target.value)}
          placeholder="Buscar por nome ou SKU"
        />
      </div>
    </div>

    {error && <div className="m-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">Erro ao consultar estoque: {error}</div>}
    {loading ? <LoadingState text="Carregando estoque..." /> : items.length === 0 ? <div className="flex min-h-32 items-center justify-center px-4 text-sm text-[#5a6a82]">Nenhum item de estoque disponível.</div> : paged.length === 0 ? <div className="flex min-h-32 items-center justify-center px-4 text-sm text-[#5a6a82]">Nenhum item encontrado.</div> : <div className="px-4">
      {paged.map((item, index) => {
        const linked = selectedIds.has(item.id);
        return <div key={item.id} className={`flex min-w-0 flex-col gap-3 py-3.5 sm:flex-row sm:items-center ${index > 0 ? "border-t border-[#0d1b2e]/8" : ""}`}>
          <div className="min-w-0 flex-1">
            <p className="break-words text-sm font-bold text-[#0d1b2e]">{item.name}</p>
            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[#7c899c]">
              <span>{item.sku ? `SKU ${item.sku}` : "Sem SKU"}</span>
              <StatusBadge status={item.is_active ? "Ativo" : "Inativo"} />
              <span className={linked ? "font-bold text-emerald-700" : "text-[#7c899c]"}>{linked ? "Vinculado" : "Não vinculado"}</span>
            </div>
          </div>
          {!disabled && <button
            type="button"
            onClick={() => toggleItem(item)}
            className={`inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-bold transition-colors ${linked ? "border-red-200 text-red-600 hover:bg-red-50" : "border-[#0d1b2e]/15 bg-white text-[#0057e7] hover:bg-[#f5f7fa]"}`}
          >{linked ? <><Unlink size={14} /> Remover</> : <><Link2 size={14} /> Vincular</>}</button>}
        </div>;
      })}
    </div>}

    {!loading && !error && filtered.length > 0 && <PaginationBar
      page={safePage}
      pageSize={pageSize}
      totalItems={filtered.length}
      onPageChange={setPage}
      onPageSizeChange={setPageSize}
    />}
  </section>;
}
