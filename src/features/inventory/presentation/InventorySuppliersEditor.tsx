import { useEffect, useMemo, useState } from "react";
import { Link2, Unlink } from "lucide-react";
import { AdminListSection, AdminListSectionRow } from "@/shared/ui/admin/AdminListSection";
import { PaginationBar } from "@/shared/ui/admin/AdminPagination";
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
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
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

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedRows = rows.slice((safePage - 1) * pageSize, safePage * pageSize);
  const selectedIds = useMemo(() => new Set(value.map(supplier => supplier.id)), [value]);

  useEffect(() => { setPage(1); }, [search, pageSize]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  const toggle = (supplier: InventorySupplier) => {
    if (disabled) return;
    if (selectedIds.has(supplier.id)) {
      onChange(value.filter(item => item.id !== supplier.id));
      return;
    }
    if (supplier.is_active === false) return;
    onChange([...value, supplier]);
  };

  return <AdminListSection
    title="Fornecedores"
    description="Vincule os fornecedores disponíveis a este item do estoque."
    count={rows.length}
    countSingular="fornecedor"
    countPlural="fornecedores"
    searchValue={search}
    onSearchChange={setSearch}
    searchPlaceholder="Buscar por nome ou CPF/CNPJ"
    loading={loading}
    loadingText="Carregando fornecedores..."
    error={error ? `Erro ao carregar fornecedores: ${error}` : undefined}
    empty={!loading && !error && rows.length === 0}
    emptyText="Nenhum fornecedor disponível."
    footer={!loading && !error && rows.length > 0 ? <PaginationBar
      page={safePage}
      pageSize={pageSize}
      totalItems={rows.length}
      onPageChange={setPage}
      onPageSizeChange={setPageSize}
    /> : undefined}
  >
    {pagedRows.map(supplier => {
      const selected = selectedIds.has(supplier.id);
      const inactive = supplier.is_active === false;
      return <AdminListSectionRow key={supplier.id} className="flex flex-col gap-3 sm:flex-row sm:items-center">
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
      </AdminListSectionRow>;
    })}
  </AdminListSection>;
}
