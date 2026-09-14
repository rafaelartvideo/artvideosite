import { useEffect, useMemo, useState } from "react";
import { PackageSearch, Plus, Search } from "lucide-react";
import { Section } from "@/shared/ui/admin/AdminLayout";
import { INPUT } from "@/shared/ui/admin/AdminFormControls";
import { LoadingState } from "@/shared/ui/admin/AdminFeedback";
import {
  listSupplierInventoryItems,
  type SupplierInventoryItem,
} from "../infrastructure/registrations.repository";
import { SupplierItemsTable } from "./SupplierItemsTable";

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
      {!disabled && <div className="relative max-w-xl">
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

      <SupplierItemsTable
        items={value}
        onRemove={disabled ? undefined : remove}
        emptyText="Nenhum item vinculado. Pesquise no estoque para informar o que este fornecedor fornece."
      />
    </div>
  </Section>;
}
