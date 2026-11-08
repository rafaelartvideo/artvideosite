import { useRef } from "react";
import { ChevronLeft, ChevronRight, MapPin, Package, Plus } from "lucide-react";
import { Popover,PopoverTrigger,PopoverContent } from "@/shared/ui/primitives/popover";
import { useMediaUrl } from "@/shared/application/useMediaUrl";
import { productRelationLabel } from "../domain/product-relation-labels";
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
  relationType?: string | null;
  matchedCode?: string | null;
  stockLocation?: string | null;
  illustrationUrl?: string | null;
};

function ProductPhoto({ mediaId, name,illustrationUrl }: { mediaId?: string | null; name: string; illustrationUrl?: string | null }) {
  const { url } = useMediaUrl(mediaId || null);
  return (url || illustrationUrl)
    ? <img src={url || illustrationUrl || ""} alt={name} loading="lazy"
        className="h-20 w-20 shrink-0 rounded-lg border border-border bg-card object-contain" />
    : <div aria-label="Sem foto" className="flex h-20 w-20 shrink-0 items-center justify-center rounded-lg border border-border bg-muted/60">
        <Package size={23} className="text-muted-foreground" />
      </div>;
}

/** Mesmo carrossel reutilizado no PDV, no orçamento, na OS e em pedidos de peças. */
export function CompatibleProductCarousel({
  products, onPick, sourceName, disabled = false, selectedIds = [], actionLabel = "Adicionar", hideTitle = false, title = "Produtos relacionados",salesAppearance=false,
}: {
  products: CompatibleProductSuggestion[];
  onPick?: (product: CompatibleProductSuggestion) => void;
  sourceName?: string;
  disabled?: boolean;
  selectedIds?: string[];
  actionLabel?: string;
  hideTitle?: boolean;
  title?: string;
  salesAppearance?: boolean;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  if (!products.length) return null;
  const selected = new Set(selectedIds);
  const move = (direction: -1 | 1) => scrollerRef.current?.scrollBy({ left: direction * 312, behavior: "smooth" });

  return <section aria-label={title} className="min-w-0 space-y-2.5">
    <div className="flex min-w-0 items-center justify-between gap-2">
      {!hideTitle && <div className="min-w-0">
        <h4 className="text-xs font-bold text-foreground">{title}</h4>
        {sourceName && <p className="truncate text-[11px] text-muted-foreground">Alternativas para {sourceName}</p>}
      </div>}
      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <span className="mr-1 text-[11px] font-bold tabular-nums text-muted-foreground" aria-label={`${products.length} ${title.toLocaleLowerCase("pt-BR")}`}>
          {products.length} {products.length === 1 ? "item" : "itens"}
        </span>
        {products.length > 1 && <>
        <button type="button" onClick={() => move(-1)}
          aria-label={`Ver ${title.toLocaleLowerCase("pt-BR")} anteriores`}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card hover:bg-muted">
          <ChevronLeft size={16} aria-hidden="true"/>
        </button>
        <button type="button" onClick={() => move(1)}
          aria-label={`Ver próximos ${title.toLocaleLowerCase("pt-BR")}`}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card hover:bg-muted">
          <ChevronRight size={16} aria-hidden="true"/>
        </button>
        </>}
      </div>
    </div>
    <div ref={scrollerRef} className="flex min-w-0 snap-x snap-mandatory gap-2.5 overflow-x-auto overscroll-x-contain pb-2"
      role="region" aria-label={`Carrossel horizontal de ${title.toLocaleLowerCase("pt-BR")}`}>
      {products.map(product => {
        const stock = Number(product.stock ?? 0);
        const noStock = stock <= 0;
        const isSelected = selected.has(product.id);
        const canPick = Boolean(onPick) && !disabled && !noStock && !isSelected;
        return <article key={product.id}
          className="flex w-[min(84vw,298px)] min-w-0 shrink-0 snap-start flex-col justify-between gap-2.5 rounded-xl border border-border bg-card p-3 sm:w-[298px]">
          <div className="flex min-w-0 items-start gap-2.5">
            <ProductPhoto mediaId={product.coverMediaId} name={product.name} illustrationUrl={product.illustrationUrl}/>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-start gap-1.5">
                <p className="line-clamp-2 min-w-0 flex-1 text-xs font-bold leading-snug text-foreground">
                  {product.name}
                </p>
                {product.stockLocation&&<Popover>
                  <PopoverTrigger asChild>
                    <button type="button" aria-label={"Localização de "+product.name}
                      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-primary hover:bg-primary/10">
                      <MapPin size={14} aria-hidden="true"/>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-64 space-y-1 p-3">
                    <p className="text-xs font-bold">Localização no estoque</p>
                    <p className="break-words text-xs text-foreground">{product.stockLocation}</p>
                  </PopoverContent>
                </Popover>}
              </div>
              {product.relationType && <span className="mt-1 inline-flex max-w-full truncate rounded-md border border-primary/20 bg-primary/5 px-1.5 py-0.5 text-[10px] font-semibold text-primary">{productRelationLabel(product.relationType)}</span>}
              <p className="mt-1 truncate text-[11px] text-muted-foreground">SKU {product.sku || "—"}{product.barcode ? " · GTIN " + product.barcode : ""}</p>
              {product.matchedCode && <p className="mt-0.5 truncate text-[10px] text-muted-foreground">Referência: {product.matchedCode}</p>}
              <p className={"mt-1.5 text-sm font-black "+(salesAppearance?"text-emerald-700 dark:text-emerald-400":"text-foreground")}>
                {product.price == null ? "Sem preço" : formatCurrency(product.price)}
              </p>
              <p className={cn("mt-0.5 text-[11px] font-semibold",
                noStock ? "text-red-600 dark:text-red-400" : salesAppearance?"text-primary":"text-emerald-700 dark:text-emerald-300")}>
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
