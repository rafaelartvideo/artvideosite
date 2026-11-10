import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapPin, Minus, Package, Plus, Trash2 } from "lucide-react";
import { useMediaUrl } from "@/shared/application/useMediaUrl";
import { formatCurrency, formatNumber } from "@/shared/domain/formatters";
import { AdminButton, AdminDialog, AdminIconButton } from "@/shared/ui/admin/AdminLayout";
import { LoadingState } from "@/shared/ui/admin/AdminFeedback";
import { productConditionLabel } from "@/features/products/domain/product-condition";
import { CompatibleDeviceModelsList } from "@/features/products/presentation/CompatibleDeviceModelsList";
import { CompatibleProductCarousel } from "@/features/products/presentation/CompatibleProductCarousel";
import { listCompatibleModelsForProducts } from "@/features/products/infrastructure/product-compatible-models.repository";
import { getSalesProductDetails,type SalesRelatedProduct } from "../infrastructure/sales.repository";
import { salesHomologationImage } from "../domain/sales-homologation-images";
import type { PdvProduct } from "@/features/pdv/infrastructure/pdv.repository";

function ImagePreview({ mediaId, name, illustrationUrl, className = "" }: {
  mediaId: string | null; name: string; illustrationUrl?:string|null; className?:string;
}) {
  const { url } = useMediaUrl(mediaId);
  return <div className={"flex h-full w-full items-center justify-center overflow-hidden bg-muted/20 " + className}>
    {url || illustrationUrl
      ? <img src={url || illustrationUrl || ""} alt={name} loading="eager"
        className="h-full max-h-full w-full object-contain p-2"/>
      : <Package size={29} className="text-muted-foreground/50" aria-label="Sem foto do produto" />}
  </div>;
}

function Attribute({ label, value }: { label:string;value:string|null|undefined }) {
  if (!value) return null;
  return <div className="min-w-0 py-1">
    <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
    <p className="mt-0.5 break-words text-sm font-semibold text-foreground">{value}</p>
  </div>;
}

function availableQuantity(product:PdvProduct){
  const quantity=Math.max(0,Number(product.quantity||0));
  const factor=Math.max(1,Number(product.conversion_factor)||1);
  return product.unit==="cx"?Math.floor(quantity/factor):quantity;
}

export function SalesProductDetailsDialog({
  organizationId,product,cartQuantity,cartQuantities,canSell,relatedProducts,relatedLoading,
  relatedError,onClose,onAdd,onRemove,onSetCartQuantity,preparing=false,
}: {
  organizationId:string;
  product:PdvProduct;
  cartQuantity:number;
  cartQuantities:Record<string,number>;
  canSell:boolean;
  relatedProducts:SalesRelatedProduct[];
  relatedLoading:boolean;
  relatedError:boolean;
  onClose:()=>void;
  onAdd:(product:PdvProduct,quantity?:number)=>void;
  onRemove:(productId:string)=>void;
  onSetCartQuantity:(productId:string,quantity:number)=>void;
  preparing?:boolean;
}) {
  const [activeMediaId,setActiveMediaId]=useState<string|null>(product.cover_media_id);
  const details=useQuery({
    queryKey:["sales","product-details",organizationId,product.product_id],
    queryFn:()=>getSalesProductDetails(organizationId,product.product_id),
    enabled:Boolean(organizationId&&product.product_id),
    staleTime:30_000,
  });
  const models=useQuery({
    queryKey:["products","device-compatible-models",organizationId,product.product_id],
    queryFn:()=>listCompatibleModelsForProducts(organizationId,[product.product_id]),
    enabled:Boolean(organizationId&&product.product_id),
    staleTime:30_000,
  });
  const gallery=useMemo(()=>Array.from(new Set(
    [product.cover_media_id,...(details.data?.gallery_media_ids||[])].filter(
      (id):id is string=>Boolean(id)),
  )).slice(0,8),[product.cover_media_id,details.data?.gallery_media_ids]);
  const illustrationUrl=salesHomologationImage(product.sku);
  const visibleMediaId=activeMediaId||gallery[0]||null;
  const remaining=Math.max(0,availableQuantity(product)-cartQuantity);
  const validPrice=product.price!=null&&Number(product.price)>0;
  const totalAvailable=availableQuantity(product);
  // O seletor mostra somente a quantidade efetivamente reservada no carrinho.
  const actualQuantity=cartQuantity;
  const adjustQuantity=(step:-1|1)=>{
    if(!canSell||!validPrice)return;
    const next=cartQuantity+step;
    if(next<0||next>totalAvailable)return;
    if(cartQuantity===0&&next>0)onAdd(product,1);
    else onSetCartQuantity(product.product_id,next);
  };
  const variantAttributes=Object.entries(details.data?.variant_attributes||{})
    .filter(([,value])=>value!=null&&value!=="");
  const characteristics=Array.isArray(details.data?.site_characteristics)
    ?details.data.site_characteristics.filter(item=>item&&item.label&&item.value):[];

  const baseAttributes=[
    {label:"SKU",value:product.sku},
    {label:"Código de barras / GTIN",value:product.barcode},
    {label:"Modelo",value:details.data?.product_model},
    {label:"Código fabricante / MPN",value:details.data?.manufacturer_code},
    {label:"Código interno",value:details.data?.internal_barcode},
  ];

  return <AdminDialog open onClose={onClose} title="Detalhes do produto" description={product.name}
    className="w-[calc(100vw-1.25rem)] max-w-4xl"
    bodyClassName="max-h-[min(77dvh,820px)] overflow-y-auto">
    {preparing||details.isPending||models.isPending||relatedLoading
      ?<div role="status" aria-live="polite" className="flex min-h-[300px] flex-col items-center justify-center gap-3 text-center">
        <span aria-hidden="true" className="h-8 w-8 animate-spin rounded-full border-[3px] border-primary/20 border-t-primary"/>
        <p className="text-sm font-semibold text-foreground">Preparando produto...</p>
      </div>
      :<div className="min-w-0 space-y-6">
      <section className="grid min-w-0 gap-4 sm:grid-cols-[minmax(0,250px)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-2">
          <div className="aspect-[4/3] overflow-hidden rounded-xl border border-border">
            <ImagePreview mediaId={visibleMediaId} name={product.name} illustrationUrl={illustrationUrl}/>
          </div>
          {gallery.length>1&&<div className="flex gap-2 overflow-x-auto pb-1">
            {gallery.map((id,index)=><button key={id} type="button"
              onClick={()=>setActiveMediaId(id)} aria-label={"Visualizar foto "+(index+1)}
              className={"h-14 w-14 shrink-0 overflow-hidden rounded-lg border-2 "+
                (visibleMediaId===id?"border-primary":"border-border")}>
              <ImagePreview mediaId={id} name={product.name}/>
            </button>)}
          </div>}
          <div className="flex min-w-0 items-start gap-2 text-xs text-primary">
            <MapPin size={16} className="mt-0.5 shrink-0" aria-hidden="true"/>
            <div className="min-w-0">
              <p className="font-semibold text-foreground">Localização no estoque</p>
              <p className="mt-0.5 break-words">{details.data?.stock_location||"Não informada"}</p>
            </div>
          </div>
        </div>
        <div className="min-w-0 space-y-4">
          <div className="flex flex-wrap gap-2" aria-label="Categoria, marca e condição">
            {details.data?.category&&<span className="admin-action-blue-outline inline-flex min-h-7 items-center rounded-md border px-2.5 py-1 text-xs font-semibold">{details.data.category}</span>}
            {details.data?.brand&&<span className="admin-action-blue-outline inline-flex min-h-7 items-center rounded-md border px-2.5 py-1 text-xs font-semibold">{details.data.brand}</span>}
            {details.data?.condition&&<span className="admin-action-blue-outline inline-flex min-h-7 items-center rounded-md border px-2.5 py-1 text-xs font-semibold">{productConditionLabel(details.data.condition)}</span>}
          </div>
          <div className="space-y-2">
            <h3 className="break-words text-lg font-bold leading-6 text-foreground">{product.name}</h3>
            <strong className="block text-2xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
              {product.price==null?"Sem preço":formatCurrency(Number(product.price))}
            </strong>
            <p className={"text-sm font-semibold "+(remaining>0?"text-primary":"text-destructive")}>
              {formatNumber(remaining)} {product.unit||"un"} disponíveis
            </p>
          </div>
          <div className="grid min-w-0 grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-3"
            aria-label="Características e identificação">
            {baseAttributes.map(item=><Attribute key={item.label} label={item.label} value={item.value}/>)}
          </div>
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-10 shrink-0 items-center overflow-hidden rounded-lg border border-border">
              <button type="button" onClick={()=>adjustQuantity(-1)}
                aria-label="Diminuir quantidade" disabled={!canSell||actualQuantity<=0}
                className="flex h-full w-9 items-center justify-center text-muted-foreground disabled:opacity-40">
                <Minus size={15}/>
              </button>
              <span className="w-8 text-center text-sm font-bold tabular-nums">{actualQuantity}</span>
              <button type="button" onClick={()=>adjustQuantity(1)}
                disabled={!canSell||!validPrice||actualQuantity>=totalAvailable} aria-label="Aumentar quantidade"
                className="flex h-full w-9 items-center justify-center text-primary disabled:opacity-40">
                <Plus size={15}/>
              </button>
            </div>
            <AdminButton disabled={!canSell||!validPrice||remaining<1}
              className="min-w-0 flex-1 justify-center"
              onClick={()=>onAdd(product,1)}>
              <Plus size={15}/> Adicionar ao carrinho
            </AdminButton>
            {canSell&&cartQuantity>0&&<AdminIconButton
              variant="quaternary" className="h-10 w-10 shrink-0"
              ariaLabel={"Remover "+product.name+" do carrinho"} title="Remover do carrinho"
              onClick={()=>onRemove(product.product_id)}>
              <Trash2 size={17}/>
            </AdminIconButton>}
          </div>
        </div>
      </section>
      <div role="separator" aria-label="Separação entre compra e características" className="border-t border-border"/>

      {(variantAttributes.length>0||characteristics.length>0)&&<section className="space-y-2">
        <h4 className="text-sm font-semibold text-foreground">Atributos e características</h4>
        <div className="grid min-w-0 grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-3">
          {variantAttributes.map(([label,value])=><Attribute key={"variation:"+label} label={label} value={String(value)}/>)}
          {characteristics.map((item,index)=><Attribute key={"characteristic:"+index}
            label={item.label} value={item.value}/>)}
        </div>
      </section>}

      {models.data?.length? <section className="space-y-2">
        <CompatibleDeviceModelsList models={models.data}/>
      </section>:null}

      {(relatedLoading||relatedError||relatedProducts.length>0)&&<section className="space-y-2">
        {relatedLoading?<LoadingState text="Preparando produtos relacionados..."/>
          :relatedError?<p className="text-xs text-destructive">Não foi possível consultar os produtos relacionados.</p>
          :<CompatibleProductCarousel title="Produtos Relacionados"
            salesAppearance
            quantitiesById={cartQuantities}
            onRemove={onRemove}
            products={relatedProducts.map(related=>({
              id:related.product_id,name:related.name,sku:related.sku,barcode:related.barcode,
              coverMediaId:related.cover_media_id,
              illustrationUrl:salesHomologationImage(related.sku),
              stockLocation:related.stock_location,
              price:related.price,stock:availableQuantity(related),unit:related.unit,
              relationType:related.relation_type,matchedCode:related.matched_code,
            }))}
            onPick={choice=>{
              const picked=relatedProducts.find(item=>item.product_id===choice.id);
              if(picked)onAdd(picked,1);
            }}/>}
      </section>}
    </div>}
  </AdminDialog>;
}
