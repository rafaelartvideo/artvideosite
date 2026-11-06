import { useMemo, useState } from "react";
import { Link2, Plus, Search, X } from "lucide-react";
import { cn, formatCurrency, formatNumber } from "@/shared/domain/formatters";
import { INPUT } from "@/shared/ui/admin/AdminFormControls";

export type CompatibleProductOption = {
  id: string;
  name: string;
  sku?: string | null;
  manufacturer_code?: string | null;
  price?: number | null;
  is_active?: boolean;
  inventory?: {
    quantity?: number | null;
    unit?: string | null;
    conversion_factor?: number | null;
  } | null;
};

type Props = {
  products: CompatibleProductOption[];
  currentProductId?: string | null;
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
  loading?: boolean;
};

function optionStock(product: CompatibleProductOption) {
  const quantity = Number(product.inventory?.quantity || 0);
  const unit = product.inventory?.unit === "cx" ? "cx" : "un";
  return {
    quantity: unit === "cx"
      ? Math.floor(quantity / Math.max(1, Number(product.inventory?.conversion_factor || 1)))
      : quantity,
    unit,
  };
}

/** Conecta cadastros distintos, sem transformar códigos alternativos em outros produtos. */
export function ProductCompatibilityPicker({
  products, currentProductId, selectedIds, onChange, disabled = false, loading = false,
}: Props) {
  const [search, setSearch] = useState("");
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);
  const candidates = useMemo(() => products.filter(product => product.id !== currentProductId), [products, currentProductId]);
  const results = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    if (term.length < 2) return [];
    return candidates.filter(product => !selected.has(product.id)
      && [product.name, product.sku, product.manufacturer_code].some(value =>
        String(value || "").toLocaleLowerCase("pt-BR").includes(term)))
      .sort((a,b) => Number(b.is_active !== false) - Number(a.is_active !== false)
        || a.name.localeCompare(b.name, "pt-BR")).slice(0, 10);
  }, [search, candidates, selected]);
  const selectedProducts = selectedIds.map(id => candidates.find(product => product.id === id));

  return <section aria-label="Produtos compatíveis" className="min-w-0 space-y-3 rounded-xl border border-border bg-muted/10 p-3 sm:p-4">
    <div className="flex items-start gap-2">
      <Link2 size={17} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
      <div className="min-w-0">
        <h3 className="text-sm font-bold text-foreground">Produtos compatíveis</h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Vincule outros produtos cadastrados que possam substituir este item.
          O vínculo funciona nos dois sentidos e aparece no PDV com preço e estoque de cada alternativa.
          Não altera os códigos relacionados.
        </p>
      </div>
    </div>
    {loading ? <p className="text-xs text-muted-foreground">Carregando compatibilidades...</p>
      : <>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {selectedProducts.length === 0
            ? <p className="col-span-full text-xs text-muted-foreground">Nenhum produto compatível vinculado.</p>
            : selectedProducts.map((product, index) => {
                const id = selectedIds[index];
                const stock = product ? optionStock(product) : null;
                return <div key={id} className="flex min-w-0 items-center justify-between gap-2 rounded-lg border border-border bg-card px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-foreground">{product?.name || "Produto indisponível no catálogo"}</p>
                    <p className="truncate text-[11px] text-muted-foreground">
                      {product?.sku || "Sem SKU"}
                      {product ? ` · ${product.price == null ? "Sem preço" : formatCurrency(product.price)}` : ""}
                      {stock ? ` · ${formatNumber(stock.quantity)} ${stock.unit}` : ""}
                    </p>
                  </div>
                  <button type="button" title="Remover compatibilidade"
                    aria-label={`Remover compatibilidade com ${product?.name || id}`}
                    disabled={disabled}
                    onClick={() => onChange(selectedIds.filter(value => value !== id))}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border text-destructive transition hover:bg-destructive/10 disabled:opacity-50">
                    <X size={15} aria-hidden="true"/>
                  </button>
                </div>;
              })}
        </div>
        <div className="relative">
          <Search aria-hidden="true" size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"/>
          <input type="search" aria-label="Buscar outros produtos compatíveis"
            value={search} disabled={disabled || selectedIds.length >= 60}
            onChange={event => setSearch(event.target.value)}
            placeholder="Buscar produto por nome, SKU ou código do fabricante"
            className={cn(INPUT, "w-full pl-10")}/>
        </div>
        {search.trim().length >= 2 && <div className="max-h-52 space-y-1 overflow-y-auto rounded-lg border border-border bg-card p-1">
          {results.length ? results.map(product => {
            const stock = optionStock(product);
            return <button type="button" key={product.id}
              disabled={disabled || selectedIds.length >= 60}
              onClick={() => { onChange([...selectedIds, product.id]); setSearch(""); }}
              className="flex w-full min-w-0 items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors hover:bg-muted disabled:opacity-50">
              <Plus size={15} className="shrink-0 text-primary" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold text-foreground">{product.name}</span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {product.sku || "Sem SKU"} · {product.price == null ? "Sem preço" : formatCurrency(product.price)}
                  {" · "}{formatNumber(stock.quantity)} {stock.unit}
                  {product.is_active === false ? " · Inativo" : ""}
                </span>
              </span>
            </button>;
          }) : <p className="p-2 text-xs text-muted-foreground">Nenhum outro produto cadastrado encontrado.</p>}
        </div>}
        {selectedIds.length >= 60 && <p className="text-xs text-amber-700 dark:text-amber-300">Limite de 60 produtos compatíveis por item.</p>}
      </>}
  </section>;
}
