import { useRef } from "react";
import { ChevronLeft, ChevronRight, Package, Plus } from "lucide-react";
import { useMediaUrl } from "@/shared/application/useMediaUrl";
import { cn, formatCurrency, formatNumber } from "@/shared/domain/formatters";

export type CompatibleProductSuggestion = {
  id: string;
  name: string;
  sku?: string | null;
  barcode?: string | null;
  price?: number | null;
  stock?: number | null;
  unit?: string | null;
  coverMediaId?: string | null;
};

function ProductPhoto({ mediaId, name }: { mediaId?: string | null; name: string }) {
  const { url } = useMediaUrl(mediaId || null);
  return url
    ? <img src={url} alt={name} loading="lazy"
        className="h-20 w-20 shrink-0 rounded-lg border border-border bg-card object-contain" />
    : <div aria-label="Sem foto" className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/60">
        <Package size={23} className="text-muted-foreground" />
      </div>;
}

/** Mesmo carrossel reutilizado no PDV, no orçamento, na OS e em pedidos de peças. */
export function CompatibleProductCarousel({
  products, onPick, sourceName, disabled = false, selectedIds = [], actionLabel = "Adicionar",
}: {
  products: CompatibleProductSuggestion[];
  onPick?: (product: CompatibleProductSuggestion) => void;
  sourceName?: string;
  disabled?: boolean;
  selectedIds?: string[];
  actionLabel?: string;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  if (!products.length) return null;
  const selected = new Set(selectedIds);
  const move = (direction: -1 | 1) => scrollerRef.current?.scrollBy({ left: direction * 312, behavior: "smooth" });

  return <section aria-label="Produtos compatíveis" className="min-w-0 space-y-2.5">
    <div className="flex min-w-0 items-center justify-between gap-2">
      <div className="min-w-0">
        <h4 className="text-xs font-bold text-foreground">Produtos compatíveis</h4>
        {sourceName && <p className="truncate text-[11px] text-muted-foreground">Alternativas para {sourceName}</p>}
      </div>
      {products.length > 1 && <div className="flex shrink-0 items-center gap-1">
        <button type="button" onClick={() => move(-1)}
          aria-label="Ver produtos compatíveis anteriores"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card hover:bg-muted">
          <ChevronLeft size={16} aria-hidden="true"/>
        </button>
        <button type="button" onClick={() => move(1)}
          aria-label="Ver próximos produtos compatíveis"
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card hover:bg-muted">
          <ChevronRight size={16} aria-hidden="true"/>
        </button>
      </div>}
    </div>
    <div ref={scrollerRef} className="flex min-w-0 snap-x snap-mandatory gap-2.5 overflow-x-auto overscroll-x-contain pb-2"
      role="region" aria-label="Carrossel horizontal de produtos compatíveis">
      {products.map(product => {
        const stock = Number(product.stock ?? 0);
        const noStock = stock <= 0;
        const isSelected = selected.has(product.id);
        const canPick = Boolean(onPick) && !disabled && !noStock && !isSelected;
        return <article key={product.id}
          className="flex w-[min(84vw,298px)] min-w-0 shrink-0 snap-start flex-col justify-between gap-2.5 rounded-xl border border-border bg-card p-3 sm:w-[298px]">
          <div className="flex min-w-0 items-start gap-2.5">
            <ProductPhoto mediaId={product.coverMediaId} name={product.name}/>
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-xs font-bold leading-snug text-foreground">{product.name}</p>
              <p className="mt-1 truncate text-[11px] text-muted-foreground">{product.sku || product.barcode || "Sem código"}</p>
              <p className="mt-1.5 text-sm font-black text-foreground">
                {product.price == null ? "Sem preço" : formatCurrency(product.price)}
              </p>
              <p className={cn("mt-0.5 text-[11px] font-semibold",
                noStock ? "text-red-600 dark:text-red-400" : "text-emerald-700 dark:text-emerald-300")}>
                {formatNumber(stock)} {product.unit || "un"} em estoque
              </p>
            </div>
          </div>
          {onPick && <button type="button"
            disabled={!canPick}
            onClick={() => { if (canPick) onPick(product); }}
            aria-label={`${actionLabel} ${product.name}`}
            className={cn("inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border px-2 text-xs font-bold transition-colors",
              canPick ? "border-primary bg-primary/10 text-primary hover:bg-primary/20" : "cursor-not-allowed border-border bg-muted text-muted-foreground")}>
            <Plus size={14} aria-hidden="true"/>
            {isSelected ? "Adicionado" : noStock ? "Sem estoque" : actionLabel}
          </button>}
        </article>;
      })}
    </div>
  </section>;
}
