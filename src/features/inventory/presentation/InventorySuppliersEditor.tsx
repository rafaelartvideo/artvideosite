import { useEffect, useMemo, useState } from "react";
import { Link2, Search, Unlink } from "lucide-react";
import { INPUT } from "@/shared/ui/admin/AdminFormControls";
import { formatCnpj, formatCpf } from "@/shared/domain/formatters";
import {
  listAvailableInventorySuppliers,
  type InventorySupplier,
} from "../infrastructure/inventory.repository";

function supplierDocument(supplier: InventorySupplier) {
  if (!supplier.document) return "—";
  return supplier.person_type === "PJ" ? formatCnpj(supplier.document) : formatCpf(supplier.document);
}

export function InventorySuppliersEditor({
  organizationId,
  value,
  onChange,
  disabled = false,
}: {
  organizationId?: string | null;
  value: InventorySupplier[];
  onChange: (suppliers: InventorySupplier[]) => void;
  disabled?: boolean;
}) {
  const [available, setAvailable] = useState<InventorySupplier[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!organizationId) {
        setAvailable([]);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const suppliers = await listAvailableInventorySuppliers(organizationId);
        if (!cancelled) setAvailable(suppliers);
      } catch (loadError) {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : String(loadError));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [organizationId]);

  const rows = useMemo(() => {
    const byId = new Map<string, InventorySupplier>();
    value.forEach(supplier => byId.set(supplier.id, supplier));
    available.forEach(supplier => byId.set(supplier.id, supplier));
    const query = search.trim().toLocaleLowerCase("pt-BR");
    return Array.from(byId.values())
      .filter(supplier => {
        if (!query) return true;
        return [supplier.name, supplier.trade_name, supplier.legal_name, supplier.document]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase("pt-BR")
          .includes(query);
      })
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [available, value, search]);

  const selectedIds = useMemo(() => new Set(value.map(supplier => supplier.id)), [value]);

  const toggle = (supplier: InventorySupplier) => {
    if (disabled) return;
    if (selectedIds.has(supplier.id)) {
      onChange(value.filter(item => item.id !== supplier.id));
      return;
    }
    if (supplier.is_active === false) return;
    onChange([...value, supplier]);
  };

  return <section className="overflow-hidden rounded-xl border border-[#0d1b2e]/10 bg-white">
    <div className="border-b border-[#0d1b2e]/8 px-4 py-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-black text-[#0d1b2e]">Fornecedores</p>
          <p className="mt-0.5 text-[11px] text-[#5a6a82]">Vincule os fornecedores disponíveis a este item do estoque.</p>
        </div>
        <span className="shrink-0 text-[10px] font-bold text-[#7c899c]">{rows.length} fornecedor{rows.length === 1 ? "" : "es"}</span>
      </div>
      <div className="relative mx-auto mt-3 w-full max-w-md">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#7c899c]" />
        <input
          id="inventory-supplier-search"
          value={search}
          onChange={event => setSearch(event.target.value)}
          placeholder="Buscar por nome ou CPF/CNPJ"
          className={`${INPUT} h-10 w-full pl-9 pr-3 text-sm`}
        />
      </div>
    </div>

    {error && <div className="m-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">Erro ao carregar fornecedores: {error}</div>}
    {loading ? <div className="flex min-h-32 items-center justify-center px-4 text-sm text-[#5a6a82]">Carregando fornecedores...</div> : rows.length === 0 ? <div className="flex min-h-32 items-center justify-center px-4 text-sm text-[#5a6a82]">Nenhum fornecedor disponível.</div> : <div className="px-4">
      {rows.map((supplier, index) => {
        const selected = selectedIds.has(supplier.id);
        const inactive = supplier.is_active === false;
        return <div key={supplier.id} className={`flex min-w-0 flex-col gap-3 py-3.5 sm:flex-row sm:items-center ${index > 0 ? "border-t border-[#0d1b2e]/8" : ""}`}>
          <div className="min-w-0 flex-1">
            <p className="break-words text-sm font-bold text-[#0d1b2e]">{supplier.name}</p>
            <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-[#7c899c]">
              {supplier.legal_name && supplier.legal_name !== supplier.name && <span className="break-words">{supplier.legal_name}</span>}
              <span className="font-mono">{supplierDocument(supplier)}</span>
              <span className={inactive ? "text-[#7c899c]" : "font-semibold text-emerald-700"}>{inactive ? "Inativo" : "Ativo"}</span>
              <span className={selected ? "font-bold text-emerald-700" : "text-[#7c899c]"}>{selected ? "Vinculado" : "Não vinculado"}</span>
            </div>
          </div>
          {!disabled && <button
            type="button"
            disabled={!selected && inactive}
            onClick={() => toggle(supplier)}
            className={`inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${selected ? "border-red-200 text-red-600 hover:bg-red-50" : "border-[#0d1b2e]/15 bg-white text-[#0057e7] hover:bg-[#f5f7fa]"}`}
          >{selected ? <><Unlink size={14} /> Remover</> : <><Link2 size={14} /> Vincular</>}</button>}
        </div>;
      })}
    </div>}

    {value.length > 0 && <p className="border-t border-[#0d1b2e]/8 px-4 py-3 text-xs font-semibold text-[#5a6a82]">{value.length} fornecedor{value.length === 1 ? "" : "es"} vinculado{value.length === 1 ? "" : "s"} ao item.</p>}
  </section>;
}
