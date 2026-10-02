import { useEffect, useMemo, useState } from "react";
import { Link2, Unlink } from "lucide-react";
import { AdminListSection, AdminListSectionRow } from "@/shared/ui/admin/AdminListSection";
import { PaginationBar } from "@/shared/ui/admin/AdminPagination";
import { formatCnpj, formatCpf } from "@/shared/domain/formatters";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import {
  listAvailableInventorySuppliersPage,
  type InventorySupplier,
} from "../infrastructure/inventory.repository";

function supplierDocument(supplier: InventorySupplier) {
  if (!supplier.document) return "—";
  return supplier.person_type === "PJ" ? formatCnpj(supplier.document) : formatCpf(supplier.document);
}

function useDebouncedValue<T>(value: T, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timeout);
  }, [value, delay]);
  return debounced;
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
  const [totalItems, setTotalItems] = useState(0);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const debouncedSearch = useDebouncedValue(search);
  const selectedIds = useMemo(() => new Set(value.map(supplier => supplier.id)), [value]);
  const selectedIdList = useMemo(() => Array.from(selectedIds), [selectedIds]);
  const selectedKey = selectedIdList.join(",");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (!organizationId) {
        setAvailable([]);
        setTotalItems(0);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const result = await listAvailableInventorySuppliersPage(
          organizationId,
          page,
          pageSize,
          debouncedSearch,
          selectedIdList,
        );
        if (!cancelled) {
          setAvailable(result.items);
          setTotalItems(result.total);
          const totalPages = Math.max(1, Math.ceil(result.total / pageSize));
          if (page > totalPages) setPage(totalPages);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError("Não foi possível carregar os fornecedores.");
          notifyAdmin(systemErrorMessage(loadError, "Não foi possível carregar os fornecedores."), "error");
          setAvailable([]);
          setTotalItems(0);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [organizationId, page, pageSize, debouncedSearch, selectedKey]);


  const rows = available;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(page, totalPages);

  useEffect(() => { setPage(1); }, [search, pageSize]);

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
    count={totalItems}
    countSingular="fornecedor"
    countPlural="fornecedores"
    searchValue={search}
    onSearchChange={setSearch}
    searchPlaceholder="Buscar por nome ou CPF/CNPJ"
    loading={loading}
    loadingText="Carregando fornecedores..."
    error={error ? `Erro ao carregar fornecedores: ${error}` : undefined}
    empty={!loading && !error && totalItems === 0}
    emptyText="Nenhum fornecedor disponível."
    footer={!loading && !error && totalItems > 0 ? <PaginationBar
      page={safePage}
      pageSize={pageSize}
      totalItems={totalItems}
      onPageChange={setPage}
      onPageSizeChange={setPageSize}
    /> : undefined}
  >
    {rows.map(supplier => {
      const selected = selectedIds.has(supplier.id);
      const selectedSupplier = value.find(item => item.id === supplier.id);
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
        <div className="flex w-full shrink-0 flex-col gap-2 sm:w-auto sm:min-w-[260px] sm:flex-row sm:items-end">
          {selected && <label className="min-w-0 flex-1">
            <span className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-[#7c899c]">Referência no fornecedor</span>
            <input
              type="text"
              disabled={disabled}
              value={selectedSupplier?.supplier_reference || ""}
              onChange={event => {
                const reference = event.target.value;
                onChange(value.map(item => item.id === supplier.id
                  ? { ...item, supplier_reference: reference }
                  : item));
              }}
              placeholder="Código deste item no fornecedor"
              className="h-9 w-full min-w-0 rounded-lg border border-[#0d1b2e]/15 bg-white px-2.5 text-xs text-[#0d1b2e] outline-none focus:border-primary focus:ring-2 focus:ring-primary/25 disabled:bg-slate-100/60"
            />
          </label>}
          {!disabled && <button
            type="button"
            disabled={!selected && inactive}
            onClick={() => toggle(supplier)}
            className={`inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${selected ? "border-red-200 text-red-600 hover:bg-red-50" : "border-primary/25 bg-white text-primary hover:bg-primary-soft/40"}`}
          >{selected ? <><Unlink size={14} /> Remover</> : <><Link2 size={14} /> Vincular</>}</button>}
        </div>
      </AdminListSectionRow>;
    })}
  </AdminListSection>;
}
