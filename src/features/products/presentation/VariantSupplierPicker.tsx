import { useEffect, useMemo, useState } from "react";
import { LoaderCircle, Search, X } from "lucide-react";
import { listAvailableInventorySuppliersPage, type InventorySupplier } from "@/features/inventory/infrastructure/inventory.repository";

/** Busca compacta para fornecedores exclusivos de uma variação.
 * O vínculo efetivo é salvo na mesma transação que cria a variação. */
export function VariantSupplierPicker({
  organizationId, value, onChange, disabled,
}: {
  organizationId: string;
  value: InventorySupplier[];
  onChange: (value: InventorySupplier[]) => void;
  disabled: boolean;
}) {
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<InventorySupplier[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const ids = useMemo(() => new Set(value.map(supplier => supplier.id)), [value]);
  const selectedKey = value.map(supplier => supplier.id).join(",");

  useEffect(() => {
    if (!organizationId) { setResults([]); return; }
    let cancelled = false;
    const timeout = window.setTimeout(async () => {
      setLoading(true);
      setError("");
      try {
        const page = await listAvailableInventorySuppliersPage(organizationId, 1, 12, search, []);
        if (!cancelled) {
          setResults(page.items);
          setTotal(page.total);
        }
      } catch {
        if (!cancelled) { setError("Não foi possível consultar fornecedores."); setResults([]); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 250);
    return () => { cancelled = true; window.clearTimeout(timeout); };
  }, [organizationId, search, selectedKey]);

  return <div className="min-w-0 space-y-2 rounded-lg border border-border bg-background p-3">
    <div className="flex flex-wrap gap-1.5">
      {value.map(supplier => <span key={supplier.id} className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-primary/20 bg-primary/5 px-2 py-1 text-xs text-foreground">
        <span className="truncate">{supplier.name}</span>
        <button type="button" disabled={disabled} aria-label={"Remover fornecedor " + supplier.name}
          className="shrink-0 text-destructive disabled:opacity-40"
          onClick={() => onChange(value.filter(item => item.id !== supplier.id))}><X size={13}/></button>
      </span>)}
      {value.length === 0 && <span className="text-xs text-muted-foreground">Nenhum fornecedor selecionado para esta variação.</span>}
    </div>
    <label className="relative block min-w-0">
      <Search size={15} className="pointer-events-none absolute left-3 top-3 text-muted-foreground"/>
      <input type="search" aria-label="Buscar fornecedor da variação" value={search}
        onChange={event => setSearch(event.target.value)} disabled={disabled}
        placeholder="Buscar fornecedor por nome ou CPF/CNPJ"
        className="h-10 w-full min-w-0 rounded-lg border border-border bg-background pl-9 pr-3 text-sm text-foreground"/>
    </label>
    {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
    {loading ? <p className="flex items-center gap-2 text-xs text-muted-foreground"><LoaderCircle size={14} className="animate-spin"/>Carregando fornecedores...</p>
      : <div className="max-h-36 divide-y divide-border overflow-y-auto rounded-md border border-border">
        {results.filter(supplier => !ids.has(supplier.id) && supplier.is_active !== false).map(supplier =>
          <button key={supplier.id} type="button" disabled={disabled}
            onClick={() => onChange([...value, supplier])}
            className="block w-full px-3 py-2 text-left text-xs text-foreground hover:bg-muted disabled:opacity-50">
            + {supplier.name}
          </button>)}
        {!results.some(supplier => !ids.has(supplier.id) && supplier.is_active !== false) &&
          <p className="p-3 text-xs text-muted-foreground">Nenhum outro fornecedor nesta busca.</p>}
      </div>}
    {total > 12 && <p className="text-[11px] text-muted-foreground">Mostrando os primeiros 12 de {total}. Digite o nome para encontrar outros fornecedores.</p>}
  </div>;
}
