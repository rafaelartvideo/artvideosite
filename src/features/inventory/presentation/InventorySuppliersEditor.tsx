import { useEffect, useMemo, useState } from "react";
import { Link2, Search, Unlink } from "lucide-react";
import { AdminButton } from "@/shared/ui/admin/AdminLayout";
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
        const text = [supplier.name, supplier.trade_name, supplier.legal_name, supplier.document]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase("pt-BR");
        return text.includes(query);
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

  return <div className="space-y-3">
    <div className="relative">
      <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#8a98aa]" />
      <input
        value={search}
        onChange={event => setSearch(event.target.value)}
        placeholder="Buscar fornecedor por nome ou CPF/CNPJ"
        className={`${INPUT} pl-9`}
      />
    </div>

    {error && <p className="text-xs font-semibold text-red-600">Erro ao carregar fornecedores: {error}</p>}
    {loading ? <p className="py-4 text-center text-sm text-[#5a6a82]">Carregando fornecedores...</p> : rows.length === 0 ? <p className="py-4 text-center text-sm text-[#5a6a82]">Nenhum fornecedor disponível.</p> : <div className="overflow-x-auto rounded-xl border border-[#0d1b2e]/10">
      <table className="min-w-[620px]">
        <thead><tr><th className="text-left">Fornecedor</th><th className="text-left">CPF/CNPJ</th><th className="text-left">Status</th><th className="text-right">Vínculo</th></tr></thead>
        <tbody>{rows.map(supplier => {
          const selected = selectedIds.has(supplier.id);
          return <tr key={supplier.id}>
            <td><div className="font-semibold text-[#0d1b2e]">{supplier.name}</div>{supplier.legal_name && supplier.legal_name !== supplier.name && <div className="text-[11px] text-[#5a6a82]">{supplier.legal_name}</div>}</td>
            <td className="font-mono text-xs text-[#5a6a82]">{supplierDocument(supplier)}</td>
            <td><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${supplier.is_active !== false ? "bg-green-100 text-green-700" : "bg-[#f5f7fa] text-[#5a6a82]"}`}>{supplier.is_active !== false ? "Ativo" : "Inativo"}</span></td>
            <td><div className="flex justify-end"><AdminButton
              type="button"
              size="sm"
              variant={selected ? "secondary" : "primary"}
              disabled={disabled || (!selected && supplier.is_active === false)}
              onClick={() => toggle(supplier)}
              className="min-w-[110px]"
            >{selected ? <><Unlink size={14} /> Remover</> : <><Link2 size={14} /> Vincular</>}</AdminButton></div></td>
          </tr>;
        })}</tbody>
      </table>
    </div>}

    {value.length > 0 && <p className="text-xs font-semibold text-[#5a6a82]">{value.length} fornecedor(es) vinculado(s) ao item.</p>}
  </div>;
}
