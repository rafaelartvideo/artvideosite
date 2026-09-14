import { useEffect, useMemo, useState } from "react";
import { PackageSearch, Plus, Search, X } from "lucide-react";
import { BtnSecondary, Section } from "@/shared/ui/admin/AdminLayout";
import { INPUT } from "@/shared/ui/admin/AdminFormControls";
import { LoadingState } from "@/shared/ui/admin/AdminFeedback";
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
    if (!query) return [];
    return items
      .filter(item => !selectedIds.has(item.id))
      .filter(item => `${item.name} ${item.sku || ""}`.toLocaleLowerCase("pt-BR").includes(query))
      .slice(0, 8);
  }, [items, search, selectedIds]);

  const add = (item: SupplierInventoryItem) => {
    if (selectedIds.has(item.id)) return;
    onChange([...value, item]);
    setSearch("");
  };

  const remove = (id: string) => onChange(value.filter(item => item.id !== id));

  return <Section title="Itens fornecidos">
    <div className="space-y-4">
      {!disabled && <div className="relative">
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8a98aa]" />
          <input
            className={`${INPUT} pl-9`}
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Pesquisar item do estoque por nome ou SKU"
          />
        </div>
        {search.trim() && <div className="absolute z-20 mt-1 max-h-72 w-full overflow-auto rounded-xl border border-[#0d1b2e]/10 bg-white p-1 shadow-xl">
          {loading ? <div className="p-3"><LoadingState text="Buscando estoque..." /></div> : filtered.length ? filtered.map(item => <button
            key={item.id}
            type="button"
            onClick={() => add(item)}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-[#f5f8fc]"
          >
            <PackageSearch size={16} className="shrink-0 text-[#0057e7]" />
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-[#0d1b2e]">{item.name}</span><span className="block truncate text-xs text-[#5a6a82]">{item.sku ? `SKU ${item.sku}` : "Sem SKU"}</span></span>
            <Plus size={15} className="text-[#0057e7]" />
          </button>) : <p className="p-3 text-sm text-[#5a6a82]">Nenhum item encontrado.</p>}
        </div>}
      </div>}

      {error && <p className="text-xs font-semibold text-red-600">Erro ao consultar estoque: {error}</p>}

      {value.length === 0 ? <div className="rounded-xl border border-dashed border-[#0d1b2e]/15 bg-[#f8fafc] p-5 text-center">
        <PackageSearch size={22} className="mx-auto text-[#8a98aa]" />
        <p className="mt-2 text-sm font-bold text-[#0d1b2e]">Nenhum item vinculado.</p>
        <p className="mt-1 text-xs text-[#5a6a82]">Pesquise no estoque para informar o que este fornecedor fornece.</p>
      </div> : <div className="grid gap-2 md:grid-cols-2">
        {value.map(item => <div key={item.id} className="flex items-center gap-3 rounded-xl border border-[#0d1b2e]/10 bg-white p-3">
          <PackageSearch size={17} className="shrink-0 text-[#0057e7]" />
          <div className="min-w-0 flex-1"><div className="truncate text-sm font-bold text-[#0d1b2e]">{item.name}</div><div className="truncate text-xs text-[#5a6a82]">{item.sku ? `SKU ${item.sku}` : "Sem SKU"}</div></div>
          {!disabled && <BtnSecondary onClick={() => remove(item.id)} aria-label={`Remover ${item.name}`} title="Remover vínculo"><X size={14} /></BtnSecondary>}
        </div>)}
      </div>}
    </div>
  </Section>;
}
