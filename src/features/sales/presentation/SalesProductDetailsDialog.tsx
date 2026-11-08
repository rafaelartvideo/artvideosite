import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Barcode, Minus, Package, Plus } from "lucide-react";
import { useMediaUrl } from "@/shared/application/useMediaUrl";
import { formatCurrency, formatNumber } from "@/shared/domain/formatters";
import { AdminButton, AdminDialog } from "@/shared/ui/admin/AdminLayout";
import { LoadingState } from "@/shared/ui/admin/AdminFeedback";
import { productConditionLabel } from "@/features/products/domain/product-condition";
import { CompatibleDeviceModelsList } from "@/features/products/presentation/CompatibleDeviceModelsList";
import { CompatibleProductCarousel } from "@/features/products/presentation/CompatibleProductCarousel";
import { listCompatibleModelsForProducts } from "@/features/products/infrastructure/product-compatible-models.repository";
import type { PdvProduct, PdvRelatedProduct } from "@/features/pdv/infrastructure/pdv.repository";
import { getSalesProductDetails } from "../infrastructure/sales.repository";

function ImagePreview({ mediaId, name, className = "" }: { mediaId: string | null; name: string; className?: string }) {
  const { url } = useMediaUrl(mediaId);
  return <div className={"flex h-full w-full items-center justify-center overflow-hidden bg-muted/30 " + className}>
    {url
      ? <img src={url} alt={name} loading="lazy" className="h-full max-h-full w-full object-contain p-2" />
      : <Package size={28} className="text-muted-foreground/50" aria-label="Sem foto do produto" />}
  </div>;
}

function Attribute({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return <div className="min-w-0 space-y-0.5">
    <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
    <p className="break-words text-sm font-semibold text-foreground">{value}</p>
  </div>;
}

function availableQuantity(product: PdvProduct) {
  const value = Math.max(0, Number(product.quantity || 0));
  const factor = Math.max(1, Number(product.conversion_factor) || 1);
  return product.unit === "cx" ? Math.floor(value / factor) : value;
}

export function SalesProductDetailsDialog({
  organizationId, product, cartQuantity, canSell, relatedProducts, relatedLoading,
  relatedError, onClose, onAdd,
}: {
  organizationId: string;
  product: PdvProduct;
  cartQuantity: number;
  canSell: boolean;
  relatedProducts: PdvRelatedProduct[];
  relatedLoading: boolean;
  relatedError: boolean;
  onClose: () => void;
  onAdd: (product: PdvProduct, quantity?: number) => void;
}) {
  const [quantity, setQuantity] = useState(1);
  const [activeMediaId, setActiveMediaId] = useState<string | null>(product.cover_media_id);
  const details = useQuery({
    queryKey: ["sales", "product-details", organizationId, product.product_id],
    queryFn: () => getSalesProductDetails(organizationId, product.product_id),
    enabled: Boolean(organizationId && product.product_id),
    staleTime: 30_000,
  });
  const models = useQuery({
    queryKey: ["products", "device-compatible-models", organizationId, product.product_id],
    queryFn: () => listCompatibleModelsForProducts(organizationId, [product.product_id]),
    enabled: Boolean(organizationId && product.product_id),
    staleTime: 30_000,
  });

  const gallery = useMemo(() => Array.from(new Set(
    [product.cover_media_id, ...(details.data?.gallery_media_ids || [])].filter((id): id is string => Boolean(id)),
  )).slice(0, 8), [product.cover_media_id, details.data?.gallery_media_ids]);
  const remaining = Math.max(0, availableQuantity(product) - cartQuantity);
  const validPrice = product.price != null && Number(product.price) > 0;
  const actualQuantity = Math.max(1, Math.min(quantity, remaining || 1));
  const attributes = Object.entries(details.data?.variant_attributes || {}).filter(([, value]) => value != null && value !== "");
  const characteristics = Array.isArray(details.data?.site_characteristics)
    ? details.data.site_characteristics.filter(item => item && item.label && item.value) : [];
  return <AdminDialog open onClose={onClose} title="Detalhes para venda" description={product.name}
    className="w-[calc(100vw-1.25rem)] max-w-4xl" bodyClassName="max-h-[min(76dvh,780px)] overflow-y-auto">
    <div className="min-w-0 space-y-5">
      <div className="grid min-w-0 gap-4 sm:grid-cols-[minmax(0,250px)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-2">
          <div className="aspect-[4/3] overflow-hidden rounded-xl border border-border">
            <ImagePreview mediaId={activeMediaId || product.cover_media_id} name={product.name} />
          </div>
          {gallery.length > 1 && <div className="flex gap-2 overflow-x-auto pb-1">
            {gallery.map((id, i) => <button key={id} type="button" onClick={() => setActiveMediaId(id)}
              aria-label={"Visualizar foto " + (i + 1)}
              className={"h-14 w-14 shrink-0 overflow-hidden rounded-lg border-2 " +
                ((activeMediaId || product.cover_media_id) === id ? "border-primary" : "border-border")}>
              <ImagePreview mediaId={id} name={product.name}/>
            </button>)}
          </div>}
        </div>
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap gap-2">
            {details.data?.category && <span className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground">{details.data.category}</span>}
            {details.data?.brand && <span className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground">{details.data.brand}</span>}
            {details.data?.condition && <span className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground">{productConditionLabel(details.data.condition)}</span>}
          </div>
          <h3 className="break-words text-base font-bold leading-6 text-foreground">{product.name}</h3>
          <strong className="block text-2xl tabular-nums text-foreground">
            {product.price == null ? "Sem preço" : formatCurrency(Number(product.price))}
          </strong>
          <p className={remaining > 0 ? "text-xs font-semibold text-emerald-700 dark:text-emerald-300" : "text-xs font-semibold text-destructive"}>
            {formatNumber(remaining)} {product.unit || "un"} disponíveis para adicionar
          </p>
          <div className="grid min-w-0 grid-cols-2 gap-3 border-t border-border pt-3">
            <Attribute label="SKU" value={product.sku || undefined}/>
            <Attribute label="Código de barras / GTIN" value={product.barcode || undefined}/>
            <Attribute label="Modelo do produto" value={details.data?.product_model}/>
            <Attribute label="Código do fabricante (MPN)" value={details.data?.manufacturer_code}/>
          </div>
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
            <div className="flex h-10 items-center overflow-hidden rounded-lg border border-border">
              <button type="button" onClick={() => setQuantity(q => Math.max(1,q-1))}
                aria-label="Diminuir quantidade" className="flex h-full w-9 items-center justify-center text-muted-foreground"><Minus size={15}/></button>
              <span className="w-9 text-center text-sm font-bold tabular-nums">{actualQuantity}</span>
              <button type="button" onClick={() => setQuantity(q => Math.min(remaining,q+1))}
                disabled={remaining <= actualQuantity} aria-label="Aumentar quantidade"
                className="flex h-full w-9 items-center justify-center text-primary disabled:opacity-40"><Plus size={15}/></button>
            </div>
            <AdminButton disabled={!canSell || !validPrice || remaining < 1}
              className="min-w-0 flex-1 justify-center"
              onClick={() => onAdd(product, actualQuantity)}>
              <Plus size={15}/> Adicionar ao carrinho
            </AdminButton>
          </div>
        </div>
      </div>

      {details.isPending && <LoadingState text="Carregando informações do produto..." />}
      {details.isError && <p className="text-xs text-muted-foreground">Não foi possível carregar todas as especificações.</p>}
      {details.data?.description && <section className="border-t border-border pt-4">
        <h4 className="mb-1.5 text-sm font-semibold text-foreground">Descrição</h4>
        <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{details.data.description}</p>
      </section>}
      {(attributes.length > 0 || characteristics.length > 0) && <section className="space-y-2 border-t border-border pt-4">
        <h4 className="text-sm font-semibold text-foreground">Atributos e características</h4>
        <div className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3">
          {attributes.map(([label, value]) => <Attribute key={label} label={label} value={String(value)}/>)}
          {characteristics.map((item,i) => <Attribute key={i} label={item.label} value={item.value}/>)}
        </div>
      </section>}

      <section className="border-t border-border pt-4">
        {models.isPending ? <p className="text-xs text-muted-foreground">Buscando modelos de aparelhos compatíveis...</p>
          : models.isError ? <p className="text-xs text-muted-foreground">Não foi possível consultar os modelos compatíveis.</p>
          : models.data?.length ? <CompatibleDeviceModelsList models={models.data} />
          : <><h4 className="text-sm font-semibold text-foreground">Modelos de aparelhos compatíveis</h4>
            <p className="mt-1 text-xs text-muted-foreground">Nenhum modelo cadastrado para este produto.</p></>}
      </section>

      {(relatedLoading || relatedError || relatedProducts.length > 0) && <section className="border-t border-border pt-4">
        {relatedLoading ? <LoadingState text="Buscando variações e alternativas..." />
          : relatedError ? <p className="text-xs text-muted-foreground">Não foi possível consultar alternativas.</p>
          : <CompatibleProductCarousel title="Variações, similares e produtos relacionados"
            sourceName={product.name}
            products={relatedProducts.map(related => ({
              id: related.product_id, name: related.name, sku: related.sku, barcode: related.barcode,
              coverMediaId: related.cover_media_id, price: related.price,
              stock: availableQuantity(related), unit: related.unit,
              relationType: related.relation_type, matchedCode: related.matched_code,
            }))}
            onPick={choice => {
              const selected = relatedProducts.find(item => item.product_id === choice.id);
              if (selected) onAdd(selected,1);
            }}/>}
      </section>}
    </div>
  </AdminDialog>;
}
