import { useQuery } from "@tanstack/react-query";
import { useRef, useState, type ReactNode } from "react";
import { ArrowLeftRight, ChevronLeft, ChevronRight, Edit2, List, Package } from "lucide-react";
import { AdminButton, AdminDialog } from "@/shared/ui/admin/AdminLayout";
import { cn, formatCurrency, formatDateTime, formatNumber } from "@/shared/domain/formatters";
import { useMediaUrl } from "@/shared/application/useMediaUrl";
import { salesHomologationImage } from "@/shared/domain/catalog-homologation-image";
import { listRelatedProductCodes, listProductRelations } from "../infrastructure/products.repository";
import { listCompatibleModelsForProducts } from "../infrastructure/product-compatible-models.repository";
import { CompatibleDeviceModelsList } from "./CompatibleDeviceModelsList";
import { productRelationLabel } from "../domain/product-relation-labels";
import { productConditionLabel } from "../domain/product-condition";
import { loadProductGallery } from "../infrastructure/product-lookup.repository";
import { listInventoryItemSuppliers } from "@/features/inventory/infrastructure/inventory.repository";
import { InventorySaleBatchesPanel, InventorySaleWindowBadge } from "@/features/inventory/presentation/InventorySaleWindowStatus";
import type { InventorySaleSummary } from "@/features/inventory/infrastructure/inventory-sale-batches.repository";
import { ProductAdminThumb } from "@/shared/ui/admin/AdminMedia";
import { InventoryMovementFinancePage } from "@/features/inventory/presentation/InventoryMovementFinancePage";
import { InventoryMovementHistory } from "@/features/inventory/presentation/InventoryMovementHistory";
import { InventoryProductImageLightbox, type InventoryProductPhoto } from "./InventoryProductImageLightbox";
import { listProductVariationOptions, listProductVariations } from "../infrastructure/product-variations.repository";

export type InventoryDetailsView = "details" | "move" | "history";

type Props = {
  product: any | null;
  organizationId: string;
  canEdit: boolean;
  canMove: boolean;
  canHistory: boolean;
  canViewCosts: boolean;
  canViewSuppliers: boolean;
  saleSummary?: InventorySaleSummary;
  view: InventoryDetailsView;
  backToDetails?: boolean;
  onBack: () => void;
  onClose: () => void;
  onEdit: (product: any) => void;
  onMove: (product: any) => void;
  onHistory: (product: any) => void;
  onOpenProduct: (productId: string) => void;
};

function Detail({ label, value }: { label: string; value: ReactNode }) {
  return <div className="min-w-0 border-b border-border/60 px-1 py-2.5">
    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
    <div className="mt-1 break-words text-xs font-semibold text-foreground">{value ?? "—"}</div>
  </div>;
}

export function InventoryProductDetailsDialog({
  product, organizationId, canEdit, canMove, canHistory, canViewCosts,
  canViewSuppliers, saleSummary, view, backToDetails = false, onBack, onClose, onEdit, onMove, onHistory, onOpenProduct,
}: Props) {
  const [supplierEditorOpen, setSupplierEditorOpen] = useState(false);
  const id = product?.id as string | undefined;
  const inventory = product?.inventory;
  const unit = inventory?.unit === "cx" ? "cx" : "un";
  const factor = Math.max(1, Number(inventory?.conversion_factor || 1));
  const stock = Number(inventory?.quantity || 0) / (unit === "cx" ? factor : 1);
  const minimum = Number(inventory?.min_quantity || 0) / (unit === "cx" ? factor : 1);
  const { url: coverUrl } = useMediaUrl(product?.cover_media_id || null);
  const carouselRef = useRef<HTMLDivElement>(null);
  const [expandedImage, setExpandedImage] = useState<(InventoryProductPhoto & { photos?: InventoryProductPhoto[]; startIndex?: number }) | null>(null);
  const coverIllustration = salesHomologationImage(product?.sku);

  const relatedCodes = useQuery({
    queryKey: ["products", "related-codes-detail", organizationId, id],
    queryFn: () => listRelatedProductCodes(organizationId, id!),
    enabled: Boolean(product && organizationId && id),
    staleTime: 30_000,
  });
  const relations = useQuery({
    queryKey: ["products", "relations-detail", organizationId, id],
    queryFn: () => listProductRelations(organizationId, id!),
    enabled: Boolean(product && organizationId && id),
    staleTime: 20_000,
  });
  const compatibleModels = useQuery({
    queryKey: ["products", "device-compatible-models", organizationId, id],
    queryFn: () => listCompatibleModelsForProducts(organizationId, [id!]),
    enabled: Boolean(product && organizationId && id),
    staleTime: 30_000,
  });
  const gallery = useQuery({
    queryKey: ["products", "gallery-detail", organizationId, id],
    queryFn: () => loadProductGallery(organizationId, id!),
    enabled: Boolean(product && organizationId && id),
    staleTime: 30_000,
  });
  const variantOptions = useQuery({
    queryKey: ["products", "variation-options-detail", organizationId, id],
    queryFn: () => listProductVariationOptions(organizationId, id!),
    enabled: Boolean(product && organizationId && id),
    staleTime: 30_000,
  });
  const variationFamily = useQuery({
    queryKey: ["products", "variation-family", organizationId, id],
    queryFn: () => listProductVariations(organizationId, id!),
    enabled: Boolean(product && organizationId && id),
    staleTime: 20_000,
  });
  const suppliers = useQuery({
    queryKey: ["products", "suppliers-detail", organizationId, inventory?.inventory_item_id],
    queryFn: () => listInventoryItemSuppliers(String(inventory.inventory_item_id), organizationId),
    enabled: Boolean(product && canViewSuppliers && organizationId && inventory?.inventory_item_id),
    staleTime: 30_000,
  });
  if (!product) return null;

  const photos: InventoryProductPhoto[] = [];
  if (coverUrl || coverIllustration) photos.push({
    mediaId: product.cover_media_id || null,
    src: coverUrl || coverIllustration || null,
    name: product.name,
  });
  for (const image of gallery.data || []) {
    if (!image.public_url || photos.some(photo => photo.mediaId && photo.mediaId === image.media_id)) continue;
    photos.push({ mediaId: image.media_id, src: image.public_url, name: image.alt_text || product.name });
  }

  const childVariation = variationFamily.data?.find(item => item.product_id === id && !item.is_parent);
  const childAttributes = childVariation?.variation_label?.split(/\\s*·\\s*/).map(part => {
    const separator = part.indexOf(":");
    return separator > 0
      ? { name: part.slice(0, separator).trim(), value: part.slice(separator + 1).trim(), otherValues: [] as string[] }
      : { name: "Variação", value: part.trim(), otherValues: [] as string[] };
  }).filter(attribute => attribute.name && attribute.value) || [];
  const mainAttributes = (variantOptions.data || []).map(option => {
    const values = option.values.split(/[;,\\n]/).map(value => value.trim()).filter(Boolean);
    return { name: option.name.trim(), value: values[0] || "", otherValues: values.slice(1) };
  }).filter(attribute => attribute.name && attribute.value);
  const attributes = childVariation ? childAttributes : mainAttributes;

  const location = [inventory?.storage_shelf ? `Estante ${inventory.storage_shelf}` : "",
    inventory?.storage_level ? `Prateleira ${inventory.storage_level}` : "",
    inventory?.storage_compartment ? `Compartimento ${inventory.storage_compartment}` : ""]
    .filter(Boolean).join(" · ") || "Não informado";

  return <><AdminDialog
    open
    onClose={onClose}
    title={supplierEditorOpen && view === "move" ? "Novo fornecedor" : view === "move" ? "Movimentação do estoque" : view === "history" ? "Histórico do estoque" : "Detalhes do item"}
    description={product.name}
    className="w-[min(96vw,850px)] max-w-4xl"
    bodyClassName="space-y-5 p-3 sm:p-5"
    footer={view === "details" ? <div className="flex flex-wrap justify-end gap-2">
      {canHistory && inventory?.inventory_item_id && <AdminButton variant="secondary" size="sm" onClick={() => onHistory(product)}>
        <List size={15} /> Histórico
      </AdminButton>}
      {canMove && inventory?.inventory_item_id && <AdminButton variant="secondary" size="sm" onClick={() => onMove(product)}>
        <ArrowLeftRight size={15} /> Movimentar
      </AdminButton>}
      {canEdit && <AdminButton size="sm" onClick={() => onEdit(product)}><Edit2 size={15} /> Editar</AdminButton>}
      <AdminButton size="sm" variant="secondary" onClick={onClose}>Fechar</AdminButton>
    </div> : view === "history" ? <div className="flex justify-end gap-2">
      <AdminButton variant="secondary" size="sm" onClick={backToDetails ? onBack : onClose}>{backToDetails ? "Voltar" : "Cancelar"}</AdminButton>
    </div> : undefined}
  >
    {view === "move" ? (canMove && inventory?.inventory_item_id
      ? <InventoryMovementFinancePage key={String(inventory.inventory_item_id)} embedded itemId={String(inventory.inventory_item_id)}
          backToDetails={backToDetails} onSupplierEditorChange={setSupplierEditorOpen} onClose={backToDetails ? onBack : onClose}/>
      : <p className="text-sm text-muted-foreground">Movimentação indisponível para este item.</p>)
    : view === "history" ? (canHistory && inventory?.inventory_item_id
      ? <InventoryMovementHistory key={String(inventory.inventory_item_id)} itemId={String(inventory.inventory_item_id)} organizationId={organizationId}
          unit={unit} conversionFactor={factor} canViewCosts={canViewCosts}/>
      : <p className="text-sm text-muted-foreground">Histórico indisponível para este item.</p>)
    : <>
    <section className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start" aria-label="Resumo do item">
      <button type="button" disabled={!(coverUrl || coverIllustration)}
        onClick={() => setExpandedImage({ mediaId: product.cover_media_id, src: coverUrl || coverIllustration, name: product.name, photos, startIndex: 0 })}
        title="Ampliar foto do produto" aria-label="Ampliar foto do produto"
        className="flex h-32 w-32 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted/30 disabled:cursor-default">
        {(coverUrl || coverIllustration) ? <img src={coverUrl || coverIllustration || ""} alt={product.name} className="h-full w-full object-contain"/>
          : <Package size={36} className="text-muted-foreground"/>}
      </button>
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-bold",
            product.is_active !== false ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-muted text-muted-foreground")}>
            {product.is_active !== false ? "Ativo" : "Inativo"}
          </span>
          {saleSummary && <InventorySaleWindowBadge summary={saleSummary}
            factor={unit === "cx" ? factor : 1} unit={unit}/>}
        </div>
        <h3 className="break-words text-lg font-extrabold text-foreground">{product.name}</h3>
        <p className="break-words text-xs text-muted-foreground">
          {product.sku || inventory?.sku || "Sem SKU"} · {product.barcode || "Sem GTIN"}
        </p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <div className="rounded-lg border border-border p-2.5">
            <p className="text-[10px] font-semibold text-muted-foreground">Preço de venda</p>
            <p className="mt-1 text-sm font-bold text-green-600 dark:text-green-400">{product.price == null ? "Sem preço" : formatCurrency(product.price)}</p>
          </div>
          <div className="rounded-lg border border-border p-2.5">
            <p className="text-[10px] font-semibold text-muted-foreground">Saldo disponível</p>
            <p className="mt-1 text-sm font-bold text-blue-600 dark:text-blue-400">{formatNumber(stock)} {unit}</p>
          </div>
          <div className="col-span-2 rounded-lg border border-border p-2.5 sm:col-span-1">
            <p className="text-[10px] font-semibold text-muted-foreground">Estoque mínimo</p>
            <p className="mt-1 text-sm font-bold text-foreground">{formatNumber(minimum)} {unit}</p>
          </div>
        </div>
      </div>
    </section>

    <section className="space-y-2.5" aria-label="Informações do cadastro">
      <h4 className="text-sm font-bold text-foreground">Informações do cadastro</h4>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Detail label="Marca" value={product.brands?.name || "—"}/>
        <Detail label="Categoria" value={product.product_categories?.name || "—"}/>
        <Detail label="Condição" value={productConditionLabel(product.product_condition)}/>
        <Detail label="Modelo" value={product.model || "—"}/>
        <Detail label="Código fabricante / MPN" value={product.manufacturer_code || "—"}/>
        <Detail label="Código de barras / GTIN" value={product.barcode || "—"}/>
        <Detail label="Código de barras interno" value={product.internal_barcode || "—"}/>
        <Detail label="Unidade comercial" value={unit === "cx" ? `Caixa · ${factor} unidades` : "Unidade"}/>
        <Detail label="Prazo para vender" value={product.sale_window_days ? `${product.sale_window_days} dias por entrada` : "Não configurado"}/>
        <Detail label="Endereço no estoque" value={location}/>
        <Detail label="Cadastrado em" value={product.created_at ? formatDateTime(product.created_at) : "—"}/>
      </div>
      {product.description && <div className="px-1 py-2.5">
        <p className="text-[10px] font-semibold uppercase text-muted-foreground">Descrição</p>
        <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-foreground">{product.description}</p>
      </div>}
      {canViewCosts && <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Detail label="Última compra" value={inventory?.purchase_price == null ? "—" : formatCurrency(Number(inventory.purchase_price) * (unit === "cx" ? factor : 1))}/>
        <Detail label="Custo médio" value={inventory?.average_cost == null ? "—" : formatCurrency(Number(inventory.average_cost) * (unit === "cx" ? factor : 1))}/>
        <Detail label="Valor em estoque" value={inventory?.stock_value == null ? "—" : formatCurrency(inventory.stock_value)}/>
      </div>}
    </section>

    {(variantOptions.isPending || variationFamily.isPending || variantOptions.isError || variationFamily.isError || attributes.length > 0) && <section className="space-y-2.5 border-t border-border pt-4" aria-label="Atributos do produto">
      <h4 className="text-sm font-bold text-foreground">Atributos do produto</h4>
      {variantOptions.isPending || variationFamily.isPending
        ? <p className="text-xs text-muted-foreground">Carregando atributos...</p>
        : attributes.length > 0
          ? <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {attributes.map((attribute, index) => <Detail key={attribute.name + "-" + index} label={attribute.name}
                value={<>
                  <span>{attribute.value}</span>
                  {attribute.otherValues.length > 0 && <p className="mt-1 text-[11px] font-normal text-muted-foreground">
                    Outras opções: {attribute.otherValues.join(", ")}
                  </p>}
                </>} />)}
            </div>
          : <p role="alert" className="text-xs text-destructive">Não foi possível consultar os atributos deste produto.</p>}
    </section>}

    {gallery.data && gallery.data.length > 0 && <section className="space-y-2">
      <h4 className="text-sm font-bold text-foreground">Fotos do produto</h4>
      <div className="flex flex-wrap gap-2">
        {gallery.data.map(image => <button key={image.media_id} type="button"
          onClick={() => setExpandedImage({ mediaId: image.media_id, src: image.public_url, name: image.alt_text || product.name, photos, startIndex: Math.max(0, photos.findIndex(photo => photo.mediaId === image.media_id)) })}
          title="Ampliar foto" aria-label={`Ampliar foto de ${product.name}`}
          className="h-20 w-20 overflow-hidden rounded-lg border border-border bg-muted/20 focus-visible:outline-2 focus-visible:outline-primary">
          <img src={image.public_url} alt={image.alt_text || product.name} loading="lazy"
            className="h-full w-full object-contain"/>
        </button>)}
      </div>
    </section>}

    <section className="space-y-3 border-t border-border pt-4" aria-label="Códigos relacionados">
      <h4 className="text-sm font-bold text-foreground">Códigos relacionados</h4>
      {relatedCodes.isPending ? <p className="text-xs text-muted-foreground">Carregando códigos...</p>
        : relatedCodes.isError ? <p className="text-xs text-destructive">Não foi possível consultar os códigos.</p>
        : relatedCodes.data?.length ? <div className="grid gap-x-5 sm:grid-cols-2">
          {relatedCodes.data.map((code,index) => <div key={index} className="flex min-w-0 flex-wrap items-center justify-between gap-2 border-b border-border/60 px-1 py-2">
            <span className="break-all font-mono text-xs font-semibold text-foreground">{code.code}</span>
            <span className="rounded-md bg-muted px-2 py-1 text-[10px] font-semibold text-muted-foreground">{productRelationLabel(code.relation_type)}</span>
          </div>)}
        </div> : <p className="text-xs text-muted-foreground">Nenhum código relacionado.</p>}
    </section>

    <section className="space-y-3 border-t border-border pt-4" aria-label="Modelos de aparelhos compatíveis">
      {compatibleModels.isPending ? <p className="text-xs text-muted-foreground">Carregando modelos compatíveis...</p>
        : compatibleModels.isError ? <p className="text-xs text-destructive">Não foi possível consultar os modelos compatíveis.</p>
        : compatibleModels.data?.length ? <CompatibleDeviceModelsList models={compatibleModels.data} />
        : <><h4 className="text-sm font-bold text-foreground">Modelos de aparelhos compatíveis</h4>
           <p className="text-xs text-muted-foreground">Nenhum modelo de aparelho informado.</p></>}
    </section>

    <section className="space-y-3 border-t border-border pt-4" aria-label="Produtos relacionados">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="text-sm font-bold text-foreground">Produtos relacionados</h4>
        {Boolean(relations.data?.length) && <div className="flex items-center gap-1.5">
          <span className="mr-1 text-xs text-muted-foreground">{relations.data?.length} produtos</span>
          <button type="button" aria-label="Ver produtos anteriores" title="Anterior"
            onClick={() => carouselRef.current?.scrollBy({ left: -260, behavior: "smooth" })}
            className="rounded-lg border border-border p-1.5 text-foreground hover:bg-muted"><ChevronLeft size={16}/></button>
          <button type="button" aria-label="Ver próximos produtos" title="Próximo"
            onClick={() => carouselRef.current?.scrollBy({ left: 260, behavior: "smooth" })}
            className="rounded-lg border border-border p-1.5 text-foreground hover:bg-muted"><ChevronRight size={16}/></button>
        </div>}
      </div>
      <p className="text-xs text-muted-foreground">Produtos identificados automaticamente por códigos e variações, nos dois sentidos.</p>
      {relations.isPending ? <p className="text-xs text-muted-foreground">Carregando produtos relacionados...</p>
        : relations.isError ? <p className="text-xs text-destructive">Não foi possível consultar as relações.</p>
        : !relations.data?.length ? <p className="text-xs text-muted-foreground">Nenhum produto relacionado identificado.</p>
        : <div ref={carouselRef} className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2">
          {relations.data.map(other => <button key={other.product_id} type="button" onClick={() => onOpenProduct(other.product_id)}
            className="flex w-[250px] shrink-0 snap-start flex-col gap-2 rounded-lg border border-border p-3 text-left transition-colors hover:bg-muted/30">
            <ProductAdminThumb mediaId={other.cover_media_id} name={other.name}/>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-foreground">{other.name}</span>
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                SKU {other.sku || "—"}{other.barcode ? " · GTIN " + other.barcode : ""}
              </span>
              {other.matched_code && <span className="block truncate text-[11px] text-muted-foreground">Referência: {other.matched_code}</span>}
              <span className="mt-1 inline-flex rounded-md border border-primary/20 bg-primary/5 px-2 py-0.5 text-[10px] font-bold text-primary">
                {productRelationLabel(other.relation_type)}
              </span>
            </span>
            <span className="mt-auto flex w-full items-center justify-between gap-2 border-t border-border pt-2">
              <span className="text-xs font-semibold text-green-600 dark:text-green-400">{other.price == null ? "Sem preço" : formatCurrency(other.price)}</span>
              <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">{formatNumber(other.stock)} {other.unit}</span>
            </span>
          </button>)}
        </div>}
    </section>

    {canViewSuppliers && <section className="space-y-2" aria-label="Fornecedores do item">
      <h4 className="text-sm font-bold text-foreground">Fornecedores</h4>
      {suppliers.isPending ? <p className="text-xs text-muted-foreground">Carregando fornecedores...</p>
        : suppliers.isError ? <p className="text-xs text-muted-foreground">Não foi possível consultar fornecedores.</p>
        : suppliers.data?.length ? <div className="flex flex-wrap gap-1.5">
          {suppliers.data.map(item => <span key={item.id}
            className="rounded-md border border-border bg-muted/30 px-2 py-1 text-xs text-foreground">{item.name}</span>)}
        </div> : <p className="text-xs text-muted-foreground">Nenhum fornecedor vinculado.</p>}
    </section>}

    {inventory?.inventory_item_id && product.sale_window_days && <div className="border-t border-border pt-2">
      <InventorySaleBatchesPanel organizationId={organizationId}
        itemId={String(inventory.inventory_item_id)}
        unit={unit} factor={unit === "cx" ? factor : 1}
        configuredDays={Number(product.sale_window_days)}/>
    </div>}
    {product.internal_notes && <section className="space-y-1 rounded-lg border border-border bg-muted/20 p-3">
      <h4 className="text-xs font-bold text-foreground">Observações internas</h4>
      <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">{product.internal_notes}</p>
    </section>}
    </>}
  </AdminDialog>
  {expandedImage && <InventoryProductImageLightbox key={expandedImage.mediaId || expandedImage.src || expandedImage.name} {...expandedImage} onClose={() => setExpandedImage(null)} />}
  </>;
}
