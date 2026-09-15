import { useEffect, useMemo, useState } from "react";
import { Link2, Search, Unlink } from "lucide-react";
import { Section } from "@/shared/ui/admin/AdminLayout";
import { INPUT } from "@/shared/ui/admin/AdminFormControls";
import { LoadingState, StatusBadge } from "@/shared/ui/admin/AdminFeedback";
import { PaginationBar } from "@/shared/ui/admin/AdminPagination";
import {
  listSupplierInventoryItems,
  type SupplierInventoryItem,
} from "../infrastructure/registrations.repository";

function MobileField({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="min-w-0">
    <div className="mb-1 text-[9px] font-black uppercase tracking-[0.12em] text-[#8a98aa]">{label}</div>
    <div className="min-w-0 text-xs font-semibold text-[#0d1b2e]">{children}</div>
  </div>;
}

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
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const toggleItem = (item: SupplierInventoryItem) => {
    if (disabled) return;
    if (selectedIds.has(item.id)) onChange(value.filter(current => current.id !== item.id));
    else onChange([...value, item]);
  };

  return <Section title="Itens fornecidos">
    <div className="space-y-4">
      <div className="mx-auto w-full max-w-md md:mx-0">
        <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-[#5a6a82]">Pesquisar</label>
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8a98aa]" />
          <input
            className={`${INPUT} pl-9`}
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Nome ou SKU"
          />
        </div>
      </div>

      {error && <p className="text-xs font-semibold text-red-600">Erro ao consultar estoque: {error}</p>}

      {loading ? <LoadingState text="Carregando estoque..." /> : items.length === 0 ? <p className="py-5 text-center text-sm text-[#5a6a82]">Nenhum item de estoque disponível.</p> : <>
        <div className="divide-y divide-[#0d1b2e]/8 md:hidden">
          {paged.length ? paged.map(item => {
            const linked = selectedIds.has(item.id);
            return <article key={item.id} className="py-4 first:pt-0 last:pb-0">
              <div className="grid grid-cols-2 gap-x-4 gap-y-3">
                <div className="col-span-2"><MobileField label="Item"><span className="break-words text-sm font-black">{item.name}</span></MobileField></div>
                <MobileField label="SKU"><span className="break-all font-mono">{item.sku || "—"}</span></MobileField>
                <MobileField label="Status"><StatusBadge status={item.is_active ? "Ativo" : "Inativo"} /></MobileField>
                <div className="col-span-2"><MobileField label="Fornecedor"><span className={linked ? "font-bold text-emerald-700" : "text-[#8a98aa]"}>{linked ? "Vinculado" : "Não vinculado"}</span></MobileField></div>
              </div>
              {!disabled && <div className="mt-3 flex justify-end border-t border-[#0d1b2e]/8 pt-3">
                <button
                  type="button"
                  onClick={() => toggleItem(item)}
                  className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold ${linked ? "border-red-200 text-red-600 hover:bg-red-50" : "border-[#0057e7]/25 text-[#0057e7] hover:bg-[#0057e7]/5"}`}
                >{linked ? <><Unlink size={14} /> Remover</> : <><Link2 size={14} /> Vincular</>}</button>
              </div>}
            </article>;
          }) : <p className="py-6 text-center text-sm text-[#5a6a82]">Nenhum item encontrado.</p>}
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="min-w-[760px]">
            <thead><tr>
              <th className="text-left">Item</th>
              <th className="text-left">SKU</th>
              <th className="text-left">Status</th>
              <th className="text-left">Fornecedor</th>
              {!disabled && <th className="text-right">Ações</th>}
            </tr></thead>
            <tbody>
              {paged.length ? paged.map(item => {
                const linked = selectedIds.has(item.id);
                return <tr key={item.id}>
                  <td className="font-bold text-[#0d1b2e]">{item.name}</td>
                  <td className="text-xs text-[#5a6a82]">{item.sku || "—"}</td>
                  <td><StatusBadge status={item.is_active ? "Ativo" : "Inativo"} /></td>
                  <td><span className={linked ? "font-bold text-emerald-700" : "text-xs text-[#8a98aa]"}>{linked ? "Vinculado" : "Não vinculado"}</span></td>
                  {!disabled && <td className="text-right">
                    <button
                      type="button"
                      onClick={() => toggleItem(item)}
                      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold ${linked ? "border-red-200 text-red-600 hover:bg-red-50" : "border-[#0057e7]/25 text-[#0057e7] hover:bg-[#0057e7]/5"}`}
                    >{linked ? <><Unlink size={14} /> Remover</> : <><Link2 size={14} /> Vincular</>}</button>
                  </td>}
                </tr>;
              }) : <tr><td colSpan={disabled ? 4 : 5} className="py-6 text-center text-sm text-[#5a6a82]">Nenhum item encontrado.</td></tr>}
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
    </div>
  </Section>;
}
