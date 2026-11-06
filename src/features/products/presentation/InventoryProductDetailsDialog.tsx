import { useQuery } from "@tanstack/react-query";
import { ArrowLeftRight, Edit2, Image as ImageIcon, Layers3, List, Package, Warehouse } from "lucide-react";
import { AdminButton, AdminCard, AdminDialog } from "@/shared/ui/admin/AdminLayout";
import { LoadingState } from "@/shared/ui/admin/AdminFeedback";
import { cn, formatCurrency, formatDateTime, formatNumber } from "@/shared/domain/formatters";
import { useMediaUrl } from "@/shared/application/useMediaUrl";
import { listRelatedProductCodes } from "../infrastructure/products.repository";
import { listProductVariations } from "../infrastructure/product-variations.repository";
import { loadProductGallery } from "../infrastructure/product-lookup.repository";
import { listInventoryItemSuppliers } from "@/features/inventory/infrastructure/inventory.repository";
import { InventorySaleBatchesPanel, InventorySaleWindowBadge } from "@/features/inventory/presentation/InventorySaleWindowStatus";
import type { InventorySaleSummary } from "@/features/inventory/infrastructure/inventory-sale-batches.repository";
import { ProductAdminThumb } from "@/shared/ui/admin/AdminMedia";

type Props = {
  product: any | null;
  organizationId: string;
  canEdit: boolean;
  canMove: boolean;
  canHistory: boolean;
  canViewCosts: boolean;
  canViewSuppliers: boolean;
  saleSummary?: InventorySaleSummary;
  onClose: () => void;
  onEdit: (product: any) => void;
  onMove: (product: any) => void;
  onHistory: (product: any) => void;
  onOpenProduct: (productId: string) => void;
};

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="min-w-0 rounded-lg border border-border bg-muted/20 px-3 py-2.5">
    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
    <div className="mt-1 break-words text-xs font-semibold text-foreground">{value ?? "—"}</div>
  </div>;
}

export function InventoryProductDetailsDialog({
  product, organizationId, canEdit, canMove, canHistory, canViewCosts,
  canViewSuppliers, saleSummary, onClose, onEdit, onMove, onHistory, onOpenProduct,
}: Props) {
  const id = product?.id as string | undefined;
  const inventory = product?.inventory;
  const unit = inventory?.unit === "cx" ? "cx" : "un";
  const factor = Math.max(1, Number(inventory?.conversion_factor || 1));
  const stock = Number(inventory?.quantity || 0) / (unit === "cx" ? factor : 1);
  const minimum = Number(inventory?.min_quantity || 0) / (unit === "cx" ? factor : 1);
  const { url: coverUrl } = useMediaUrl(product?.cover_media_id || null);

  const variants = useQuery({
    queryKey: ["products", "variation-family", organizationId, id],
    queryFn: () => listProductVariations(organizationId, id!),
    enabled: Boolean(product && organizationId && id),
    staleTime: 20_000,
  });
  const relatedCodes = useQuery({
    queryKey: ["products", "related-codes-detail", organizationId, id],
    queryFn: () => listRelatedProductCodes(organizationId, id!),
    enabled: Boolean(product && organizationId && id),
    staleTime: 30_000,
  });
  const gallery = useQuery({
    queryKey: ["products", "gallery-detail", organizationId, id],
    queryFn: () => loadProductGallery(organizationId, id!),
    enabled: Boolean(product && organizationId && id),
    staleTime: 30_000,
  });
  const suppliers = useQuery({
    queryKey: ["products", "suppliers-detail", organizationId, inventory?.inventory_item_id],
    queryFn: () => listInventoryItemSuppliers(String(inventory.inventory_item_id), organizationId),
    enabled: Boolean(product && canViewSuppliers && organizationId && inventory?.inventory_item_id),
    staleTime: 30_000,
  });
  if (!product) return null;

  const stockTone = stock <= 0 ? "text-red-600 dark:text-red-400"
    : stock <= minimum ? "text-amber-700 dark:text-amber-300" : "text-emerald-700 dark:text-emerald-300";
  const location = [inventory?.storage_shelf ? `Estante ${inventory.storage_shelf}` : "",
    inventory?.storage_level ? `Prateleira ${inventory.storage_level}` : "",
    inventory?.storage_compartment ? `Compartimento ${inventory.storage_compartment}` : ""]
    .filter(Boolean).join(" · ") || "Não informado";

  return <AdminDialog
    open
    onClose={onClose}
    title="Detalhes do item"
    description={product.name}
    className="w-[min(96vw,850px)] max-w-4xl"
    bodyClassName="space-y-5 p-3 sm:p-5"
    footer={<div className="flex flex-wrap justify-end gap-2">
      {canHistory && inventory?.inventory_item_id && <AdminButton variant="secondary" size="sm" onClick={() => onHistory(product)}>
        <List size={15} /> Histórico
      </AdminButton>}
      {canMove && inventory?.inventory_item_id && <AdminButton variant="secondary" size="sm" onClick={() => onMove(product)}>
        <ArrowLeftRight size={15} /> Movimentar
      </AdminButton>}
      {canEdit && <AdminButton size="sm" onClick={() => onEdit(product)}><Edit2 size={15} /> Editar</AdminButton>}
      <AdminButton size="sm" variant="secondary" onClick={onClose}>Fechar</AdminButton>
    </div>}
  >
    <section className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start" aria-label="Resumo do item">
      <div className="flex h-32 w-32 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-border bg-muted/30">
        {coverUrl ? <img src={coverUrl} alt={product.name} className="h-full w-full object-contain"/>
          : <Package size={36} className="text-muted-foreground"/>}
      </div>
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
            <p className="mt-1 text-sm font-bold text-foreground">{product.price == null ? "Sem preço" : formatCurrency(product.price)}</p>
          </div>
          <div className="rounded-lg border border-border p-2.5">
            <p className="text-[10px] font-semibold text-muted-foreground">Saldo disponível</p>
            <p className={cn("mt-1 text-sm font-bold",stockTone)}>{formatNumber(stock)} {unit}</p>
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
        <Detail label="Modelo" value={product.model || "—"}/>
        <Detail label="Código fabricante / MPN" value={product.manufacturer_code || "—"}/>
        <Detail label="Código de barras / GTIN" value={product.barcode || "—"}/>
        <Detail label="Unidade comercial" value={unit === "cx" ? `Caixa · ${factor} unidades` : "Unidade"}/>
        <Detail label="Prazo para vender" value={product.sale_window_days ? `${product.sale_window_days} dias por entrada` : "Não configurado"}/>
        <Detail label="Endereço no estoque" value={location}/>
        <Detail label="Cadastrado em" value={product.created_at ? formatDateTime(product.created_at) : "—"}/>
      </div>
      {product.description && <div className="rounded-lg border border-border px-3 py-2.5">
        <p className="text-[10px] font-semibold uppercase text-muted-foreground">Descrição</p>
        <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-foreground">{product.description}</p>
      </div>}
      {canViewCosts && <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Detail label="Última compra" value={inventory?.purchase_price == null ? "—" : formatCurrency(inventory.purchase_price)}/>
        <Detail label="Custo médio" value={inventory?.average_cost == null ? "—" : formatCurrency(inventory.average_cost)}/>
        <Detail label="Valor em estoque" value={inventory?.stock_value == null ? "—" : formatCurrency(inventory.stock_value)}/>
      </div>}
    </section>

    {gallery.data && gallery.data.length > 0 && <section className="space-y-2">
      <h4 className="text-sm font-bold text-foreground">Fotos do produto</h4>
      <div className="flex flex-wrap gap-2">
        {gallery.data.map(image => <img key={image.media_id} src={image.public_url}
          alt={image.alt_text || product.name} loading="lazy"
          className="h-20 w-20 rounded-lg border border-border bg-muted/20 object-contain"/>)}
      </div>
    </section>}

    <section className="space-y-2" aria-label="Códigos relacionados">
      <h4 className="text-sm font-bold text-foreground">Códigos relacionados</h4>
      {relatedCodes.isPending ? <p className="text-xs text-muted-foreground">Carregando códigos...</p>
        : relatedCodes.isError ? <p className="text-xs text-muted-foreground">Não foi possível consultar os códigos.</p>
        : relatedCodes.data?.length ? <div className="flex flex-wrap gap-1.5">
          {relatedCodes.data.map((code,index) => <span key={index}
            className="rounded-md border border-border bg-muted/30 px-2 py-1 font-mono text-[11px] text-foreground">
            {code.code}
          </span>)}
        </div> : <p className="text-xs text-muted-foreground">Nenhum código relacionado.</p>}
    </section>

    <section className="space-y-2" aria-label="Variações do item">
      <div className="flex items-center gap-2"><Layers3 size={16} className="text-primary"/>
        <h4 className="text-sm font-bold text-foreground">Variações do produto</h4>
      </div>
      {variants.isPending ? <p className="text-xs text-muted-foreground">Carregando variações...</p>
        : variants.isError ? <p className="text-xs text-muted-foreground">Não foi possível consultar as variações.</p>
        : !variants.data?.length ? <p className="text-xs text-muted-foreground">
          Nenhuma variação vinculada. Você pode agrupar outros itens cadastrados pela tela Editar.
        </p> : <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {variants.data.map(variant => {
            const variantUnit = variant.unit === "cx" ? "cx" : "un";
            const variantStock = variant.quantity / (variantUnit === "cx" ? variant.conversion_factor : 1);
            return <button type="button" key={variant.product_id}
              disabled={variant.product_id === product.id}
              onClick={() => onOpenProduct(variant.product_id)}
              className={cn("flex min-w-0 items-center gap-2.5 rounded-xl border border-border p-2.5 text-left transition-colors",
                variant.product_id === product.id ? "bg-primary/5" : "hover:border-primary/40 hover:bg-muted/30")}>
              <ProductAdminThumb mediaId={variant.cover_media_id} name={variant.name}/>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-bold text-foreground">{variant.name}</span>
                <span className="block truncate text-[11px] text-muted-foreground">{variant.variation_label} · {variant.sku || "Sem SKU"}</span>
                <span className="block truncate text-[11px] font-semibold text-foreground">
                  {variant.price == null ? "Sem preço" : formatCurrency(variant.price)}
                  {" · "}{formatNumber(variantStock)} {variantUnit}
                </span>
              </span>
            </button>;
          })}
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
  </AdminDialog>;
}
