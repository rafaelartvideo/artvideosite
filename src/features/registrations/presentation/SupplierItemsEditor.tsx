import { useEffect, useMemo, useState } from "react";
import { Link2, Unlink } from "lucide-react";
import { StatusBadge } from "@/shared/ui/admin/AdminFeedback";
import { AdminListSection, AdminListSectionRow } from "@/shared/ui/admin/AdminListSection";
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

  return <AdminListSection
    title="Itens fornecidos"
    description="Vincule os itens do estoque fornecidos por este cadastro."
    count={filtered.length}
    searchValue={search}
    onSearchChange={setSearch}
    searchPlaceholder="Buscar por nome ou SKU"
    searchDisabled={disabled}
    loading={loading}
    loadingText="Carregando estoque..."
    error={error ? `Erro ao consultar estoque: ${error}` : undefined}
    empty={!loading && !error && filtered.length === 0}
    emptyText={items.length === 0 ? "Nenhum item de estoque disponível." : "Nenhum item encontrado."}
    footer={!loading && !error && filtered.length > 0 ? <PaginationBar
      page={safePage}
      pageSize={pageSize}
      totalItems={filtered.length}
      onPageChange={setPage}
      onPageSizeChange={setPageSize}
    /> : undefined}
  >
    {paged.map(item => {
      const linked = selectedIds.has(item.id);
      return <AdminListSectionRow key={item.id} className="flex flex-col gap-3 sm:flex-row sm:items-center">
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
      </AdminListSectionRow>;
    })}
  </AdminListSection>;
}
