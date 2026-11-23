import { lazy, Suspense, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Link2, Package, Pin, ShoppingBag, Wrench } from "lucide-react";
import { useNavigate } from "react-router";
import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { AdminButton, AdminDialog, AdminIconButton, AdminSectionEmpty, Section } from "@/shared/ui/admin/AdminLayout";
import { LoadingState, notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import { CustomerEquipmentsSection, type EquipmentLinkedOrder } from "@/features/customers/presentation/CustomerEquipmentsSection";
import { listCustomerEquipments } from "@/features/customers/infrastructure/customers.repository";
import { adminPath } from "@/features/admin-shell/admin-routes";
import { isAdminModuleEnabled } from "@/features/admin-shell/navigation-config";
import { getMediaPreview, type MediaPreviewSource } from "@/shared/infrastructure/media.repository";
import { getOrderStatusBadgeClass, getOrderStatusHex } from "@/features/orders/domain/order-status-palette";
import type { OrderImage } from "@/features/orders/domain/order-image";

const OrderImageLightbox = lazy(() => import("@/features/orders/presentation/OrderImages").then(mod => ({ default: mod.OrderImageLightbox })));

type RequestTab = "equipment" | "quotes" | "orders" | "store";
type ShopOrder = { id:string; order_number:number; created_at:string; status:string; product_name:string; buyer:Record<string,string>|null };
type ServiceOrder = EquipmentLinkedOrder & {
  customer_equipment_id: string | null;
  equipment_type: { name?: string } | null;
  general_service: { name?: string } | null;
  service: { title?: string } | null;
};
type Quote = {id:string;protocol:string|null;created_at:string;service:{title?:string}|null;request_status:{name?:string}|null};

async function linkedStoreOrders(organizationId:string,entityId:string):Promise<ShopOrder[]> {
  const {data:links,error:linkError}=await supabase.from("artvideo_store_order_registration_links")
    .select("order_id").eq("organization_id",organizationId).eq("entity_id",entityId).limit(100);
  if(linkError)throw linkError;
  const ids=(links||[]).map(item=>item.order_id);
  if(!ids.length)return [];
  const {data,error}=await supabase.from("artvideo_store_orders")
    .select("id,order_number,created_at,status,product_name,buyer").eq("organization_id",organizationId)
    .in("id",ids).order("created_at",{ascending:false}).limit(100);
  if(error)throw error;
  return (data||[]) as ShopOrder[];
}

function readableDate(date:string) {
  return new Date(date).toLocaleDateString("pt-BR");
}


type EquipmentPhotoLookup = {
  photoUrls: Record<string,string>;
  photos: Record<string,OrderImage>;
};

// Foto da etiqueta = mídia da OS com sort_order entre 500 e 999.
// Consultas em lote por cliente/empresa, sem N consultas de mídia por card.
async function loadEquipmentPhotoLookup(organizationId:string,equipmentIds:string[],orders:ServiceOrder[],queryClient:QueryClient):Promise<EquipmentPhotoLookup>{
  const empty:EquipmentPhotoLookup={photoUrls:{},photos:{}};
  if(!equipmentIds.length || !orders.length)return empty;
  const validIds=new Set(equipmentIds);
  const byOrder=new Map<string,string>();
  const orderRank=new Map<string,number>();
  for(const [index,order] of orders.entries()){
    if(!order.customer_equipment_id || !validIds.has(order.customer_equipment_id))continue;
    byOrder.set(order.id,order.customer_equipment_id);
    orderRank.set(order.id,index);
  }
  if(!byOrder.size)return empty;
  const {data:images,error:imagesError}=await supabase.from("service_order_media")
    .select("service_order_id,sort_order,media:media(id,file_name,bucket_id,storage_path)")
    .eq("organization_id",organizationId).in("service_order_id",Array.from(byOrder.keys()))
    .gte("sort_order",500).lt("sort_order",1000).order("sort_order").limit(100);
  if(imagesError)throw imagesError;
  const candidates=new Map<string,{media:MediaPreviewSource & {file_name?:string|null};rank:number;sort:number}>();
  for(const entry of images||[]){
    const equipmentId=byOrder.get(entry.service_order_id);
    const media=entry.media as unknown as (MediaPreviewSource & {file_name?:string|null})|null;
    if(!equipmentId || !media?.id || !media.storage_path || !media.bucket_id)continue;
    const rank=orderRank.get(entry.service_order_id)??Number.MAX_SAFE_INTEGER;
    const sort=entry.sort_order ?? 0;
    const previous=candidates.get(equipmentId);
    if(!previous || rank<previous.rank || (rank===previous.rank && sort<previous.sort)){
      candidates.set(equipmentId,{media,rank,sort});
    }
  }
  const previewResults=await Promise.allSettled(Array.from(candidates.entries()).map(async ([id,{media}])=>
    [id,media,(await getMediaPreview(queryClient,media.id,media)).url] as const));
  const photoUrls:Record<string,string>={};
  const photos:Record<string,OrderImage>={};
  for(const result of previewResults)if(result.status==="fulfilled"){
    const [id,media,url]=result.value;
    photoUrls[id]=url;
    photos[id]={
      key:"registration-equipment-label:"+id+":"+media.id,
      name:media.file_name||"Foto da etiqueta",
      kind:"label", mediaId:media.id, media, url,
    };
  }
  return {photoUrls,photos};
}

type PinGroup = Record<RequestTab,string[]>;
function readPinnedRequests(key:string):PinGroup{
  const empty:PinGroup={equipment:[],quotes:[],orders:[],store:[]};
  try{
    const saved=JSON.parse(window.localStorage.getItem(key)||"{}") as Partial<PinGroup>;
    for(const type of Object.keys(empty) as RequestTab[]){
      if(Array.isArray(saved[type]))empty[type]=saved[type]!.filter((id):id is string=>typeof id==="string");
    }
  }catch{/* O navegador pode bloquear o armazenamento local. */}
  return empty;
}

function RequestCard({kind,title,subtitle,titleDetail,status,statusTone,pinned,onTogglePin,onOpen,children}:{
  kind:string;title:string;subtitle:string;titleDetail?:string;status?:string|null;statusTone?:"order";pinned:boolean;
  onTogglePin:()=>void;onOpen?:()=>void;children?:React.ReactNode;
}){
  return <article aria-label={title} role={onOpen?"button":undefined} tabIndex={onOpen?0:undefined}
    onClick={onOpen}
    onKeyDown={onOpen?event=>{
      if(event.target!==event.currentTarget)return;
      if(event.key==="Enter"||event.key===" "){event.preventDefault();onOpen();}
    }:undefined}
    className={"group flex min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card transition-colors hover:border-primary/40 focus-within:border-primary/50 "+(onOpen?"cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50":"")}>
    <header className="flex min-h-11 items-center justify-between gap-2 border-b border-border bg-muted/30 px-3 py-2">
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{kind}</span>
      <div onClick={event=>event.stopPropagation()}>
        <AdminIconButton variant={pinned?"tertiary":"ghost"} ariaLabel={(pinned?"Desafixar ":"Fixar ")+title}
          title={pinned?"Desafixar item":"Fixar no início da lista"} aria-pressed={pinned}
          onClick={onTogglePin}><Pin size={15} fill={pinned?"currentColor":"none"}/></AdminIconButton>
      </div>
    </header>
    <div className="flex min-w-0 flex-1 flex-col justify-center gap-3 p-3.5 sm:p-4">
      <div className="min-w-0">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <p className="break-words text-sm font-black text-foreground">{title}</p>
          {titleDetail&&<span className="min-w-0 break-words text-xs font-semibold text-muted-foreground">{titleDetail}</span>}
        </div>
        <p className="mt-1 break-words text-xs text-muted-foreground">{subtitle}</p>
      </div>
      {status&&<div className="border-t border-border/70 pt-3">
        <span className={"inline-flex max-w-full items-center gap-1.5 break-words rounded-md border px-2 py-1 text-[11px] font-bold "+(statusTone==="order"?getOrderStatusBadgeClass(status):"border-border bg-muted/50 text-foreground")}>
          {statusTone==="order"&&<span className="h-2 w-2 shrink-0 rounded-full" style={{backgroundColor:getOrderStatusHex(status)}} aria-hidden="true"/>}
          {status}
        </span>
      </div>}
      {children}
    </div>
  </article>;
}

export function RegistrationRequestsSection({entityId,customerId,organizationId,onOpenOrder}:{
  entityId:string;customerId:string|null;organizationId:string;
  onOpenOrder?:(id:string,customerId?:string)=>void;
}) {
  const {hasPermission,hasModule,activeOrganization}=useAuth();
  const navigate=useNavigate();
  const pinStorageKey="unionworld:registration-request-pins:v1:"+organizationId+":"+entityId;
  const [pinned,setPinned]=useState<PinGroup>(()=>readPinnedRequests(pinStorageKey));
  const isPinned=(type:RequestTab,id:string)=>pinned[type].includes(id);
  const togglePin=(type:RequestTab,id:string)=>setPinned(current=>{
    const next:PinGroup={...current,[type]:current[type].includes(id)
      ? current[type].filter(value=>value!==id) : [...current[type],id]};
    try{window.localStorage.setItem(pinStorageKey,JSON.stringify(next));}catch{/* Preferência apenas visual. */}
    return next;
  });
  function sortPinned<T extends {id:string}>(type:RequestTab,items:T[]):T[] {
    return [...items].sort((a,b)=>Number(isPinned(type,b.id))-Number(isPinned(type,a.id)));
  }
  const isArtvideo=activeOrganization?.is_artvideo_tenant===true && activeOrganization?.organization_id===organizationId;
  const queryClient=useQueryClient();
  const canViewOrders=hasPermission("orders.view")||hasPermission("orders.details.view");
  const canOpenOrders=hasPermission("orders.details.view");
  const canViewQuotes=isArtvideo&&hasPermission("quotes.view");
  const canOpenQuotes=canViewQuotes&&hasPermission("site.view")&&isAdminModuleEnabled("quotes",hasModule);
  const canViewShop=isArtvideo&&hasPermission("site_settings.view")&&hasPermission("customers.view");
  const canOpenShop=canViewShop&&hasPermission("site.view")&&isAdminModuleEnabled("siteStoreOrders",hasModule);
  const canLinkShop=canViewShop&&hasPermission("site_settings.update")&&hasPermission("customers.edit");
  const [tab,setTab]=useState<RequestTab>("equipment");
  const [linkOpen,setLinkOpen]=useState(false);
  const [orderNumber,setOrderNumber]=useState("");
  const [candidate,setCandidate]=useState<ShopOrder|null>(null);
  const [busy,setBusy]=useState(false);
  const [lookupError,setLookupError]=useState("");
  const [selectedPhoto,setSelectedPhoto]=useState<OrderImage|null>(null);

  const key=["registration-requests",organizationId,entityId,customerId];
  const equipmentQuery=useQuery({
    queryKey:[...key,"equipment"],
    queryFn:()=>listCustomerEquipments(organizationId,customerId!),
    enabled:Boolean(customerId),staleTime:60000,
  });
  const quotesQuery=useQuery({
    queryKey:[...key,"quotes"],
    queryFn:async()=>{
      const {data,error}=await supabase.from("quote_requests")
        .select("id,protocol,created_at,service:services(title),request_status:request_statuses(name)")
        .eq("organization_id",organizationId).eq("customer_id",customerId!)
        .is("archived_at",null).order("created_at",{ascending:false}).limit(100);
      if(error)throw error;
      return (data||[]) as unknown as Quote[];
    },enabled:Boolean(customerId&&canViewQuotes),staleTime:60000,
  });
  const ordersQuery=useQuery({
    queryKey:[...key,"orders"],
    queryFn:async()=>{
      const {data,error}=await supabase.from("service_orders")
        .select("id,os_number,created_at,customer_equipment_id,service:services(title),service_type:service_types(title),general_service:general_services(name),equipment_type:equipment_types(name),order_status:order_statuses(name,color)")
        .eq("organization_id",organizationId).eq("customer_id",customerId!)
        .order("created_at",{ascending:false}).limit(100);
      if(error)throw error;
      return (data||[]) as unknown as ServiceOrder[];
    },enabled:Boolean(customerId&&canViewOrders),staleTime:60000,
  });
  const equipmentPhotoQuery=useQuery({
    queryKey:[...key,"equipment-label-photos"],
    queryFn:()=>loadEquipmentPhotoLookup(organizationId,
      (equipmentQuery.data||[]).map(equipment=>equipment.id),ordersQuery.data||[],queryClient),
    enabled:Boolean(customerId&&canViewOrders&&equipmentQuery.data?.length&&ordersQuery.data),
    staleTime:60000,retry:false,
  });
  const linkedOrders=useMemo(()=>{
    const byEquipment:Record<string,EquipmentLinkedOrder[]>={};
    for(const order of ordersQuery.data||[]){
      if(!order.customer_equipment_id)continue;
      (byEquipment[order.customer_equipment_id]??=[]).push(order);
    }
    return byEquipment;
  },[ordersQuery.data]);
  const shopQuery=useQuery({
    queryKey:[...key,"shop"],
    queryFn:()=>linkedStoreOrders(organizationId,entityId),
    enabled:canViewShop,staleTime:60000,
  });
  const tabs:{id:RequestTab;label:string;count:number;icon:typeof Package}[]=[
    {id:"equipment",label:"Equipamentos",count:equipmentQuery.data?.length||0,icon:Package},
    ...(canViewQuotes?[{id:"quotes" as const,label:"Orçamentos",count:quotesQuery.data?.length||0,icon:FileText}]:[]),
    ...(canViewOrders?[{id:"orders" as const,label:"Ordens de serviço",count:ordersQuery.data?.length||0,icon:Wrench}]:[]),
    ...(canViewShop?[{id:"store" as const,label:"Pedidos da loja",count:shopQuery.data?.length||0,icon:ShoppingBag}]:[]),
  ];
  const selectedTab=tabs.some(item=>item.id===tab)?tab:"equipment";
  const currentQuery=selectedTab==="equipment"?equipmentQuery:selectedTab==="quotes"?quotesQuery:selectedTab==="orders"?ordersQuery:shopQuery;
  const refreshShop=()=>void queryClient.invalidateQueries({queryKey:[...key,"shop"]});
  const searchOrder=async()=>{
    const number=Number(orderNumber.trim().replace(/^PED-/i,""));
    if(!Number.isSafeInteger(number)||number<1){setLookupError("Informe o número do pedido (ex.: PED-1).");return;}
    setBusy(true);setLookupError("");setCandidate(null);
    try{
      const {data,error}=await supabase.from("artvideo_store_orders")
        .select("id,order_number,created_at,status,product_name,buyer")
        .eq("organization_id",organizationId).eq("order_number",number).maybeSingle();
      if(error)throw error;
      if(!data){setLookupError("Pedido não encontrado nesta empresa.");return;}
      setCandidate(data as ShopOrder);
    }catch(e){setLookupError(systemErrorMessage(e,"Não foi possível consultar o pedido."));}
    finally{setBusy(false);}
  };
  const confirmLink=async()=>{
    if(!candidate||busy)return;
    if(!window.confirm(`Vincular o pedido PED-${candidate.order_number} a este cadastro? Confira o comprador antes de confirmar.`))return;
    setBusy(true);setLookupError("");
    try{
      const {error}=await supabase.from("artvideo_store_order_registration_links")
        .insert({organization_id:organizationId,entity_id:entityId,order_id:candidate.id});
      if(error)throw error;
      setLinkOpen(false);setCandidate(null);setOrderNumber("");
      notifyAdmin("Pedido vinculado ao cadastro.");refreshShop();
    }catch(e){setLookupError(systemErrorMessage(e,"Não foi possível vincular o pedido. Ele pode estar associado a outro cadastro."));}
    finally{setBusy(false);}
  };
  const unlink=async(order:ShopOrder)=>{
    if(!window.confirm(`Desvincular PED-${order.order_number} deste cadastro? O pedido não será excluído.`))return;
    const {error}=await supabase.from("artvideo_store_order_registration_links")
      .delete().eq("order_id",order.id).eq("organization_id",organizationId).eq("entity_id",entityId);
    if(error)notifyAdmin(systemErrorMessage(error,"Falha ao desvincular pedido."),"error");
    else {notifyAdmin("Vínculo removido.");refreshShop();}
  };

  return <>
    <Section title="Solicitações">
      <div className="flex flex-wrap items-center justify-center gap-2 border-b border-border pb-3">
        {tabs.map(item=>{
          const Icon=item.icon;
          return <button key={item.id} type="button" aria-pressed={selectedTab===item.id}
            onClick={()=>setTab(item.id)}
            className={"inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 "+(selectedTab===item.id?"border-primary bg-primary/10 text-primary":"border-border bg-card text-muted-foreground hover:border-primary/40 hover:bg-muted")}>
            <Icon size={15}/>{item.label}<span className="rounded-md border border-border/60 bg-muted px-1.5 py-0.5 tabular-nums">{item.count}</span>
          </button>;
        })}
      </div>
      <div className="pt-4">
        {currentQuery.isLoading ? <LoadingState text="Carregando solicitações..." /> :
          currentQuery.error ? <div className="space-y-2 py-5 text-center"><p className="text-sm text-destructive">Não foi possível carregar esta seção: {systemErrorMessage(currentQuery.error)}</p><AdminButton size="sm" variant="secondary" onClick={()=>void currentQuery.refetch()}>Tentar novamente</AdminButton></div> :
          selectedTab==="equipment"
            ? <CustomerEquipmentsSection embedded equipments={sortPinned("equipment",equipmentQuery.data||[])}
                photoUrls={equipmentPhotoQuery.data?.photoUrls}
                linkedOrders={canOpenOrders?linkedOrders:{}}
                pinnedIds={new Set(pinned.equipment)}
                onTogglePin={id=>togglePin("equipment",id)}
                onViewLabelPhoto={id=>{
                  const photo=equipmentPhotoQuery.data?.photos[id];
                  if(photo)setSelectedPhoto(photo);
                }}
                onOpenLinkedOrder={canOpenOrders&&onOpenOrder
                  ? orderId=>onOpenOrder(orderId,entityId) : undefined}/>
          : selectedTab==="quotes" ? (quotesQuery.data?.length
            ? <div className="grid min-w-0 grid-cols-1 gap-3 xl:grid-cols-2">
                {sortPinned("quotes",quotesQuery.data).map(q=><RequestCard key={q.id}
                  kind="Orçamento" title={q.protocol||"Orçamento"}
                  subtitle={(q.service?.title||"Serviço")+" · "+readableDate(q.created_at)}
                  status={q.request_status?.name||"—"} pinned={isPinned("quotes",q.id)}
                  onTogglePin={()=>togglePin("quotes",q.id)}
                  onOpen={canOpenQuotes ? ()=>navigate(adminPath("siteRequests","orcamentos",q.id)) : undefined}
                  />)}
              </div> : <AdminSectionEmpty>Nenhum orçamento vinculado a este cliente.</AdminSectionEmpty>)
          : selectedTab==="orders" ? (ordersQuery.data?.length
            ? <div className="grid min-w-0 grid-cols-1 gap-3 xl:grid-cols-2">
                {sortPinned("orders",ordersQuery.data).map(order=><RequestCard key={order.id}
                  kind="Ordem de serviço" title={"OS "+order.os_number}
                  titleDetail={[order.equipment_type?.name||"Equipamento não informado",order.service_type?.title||order.general_service?.name||"Atendimento não informado"].join(" · ")}
                  subtitle={(order.service?.title||"Ordem de serviço")+" · "+readableDate(order.created_at)}
                  status={order.order_status?.name||"—"} statusTone="order" pinned={isPinned("orders",order.id)}
                  onTogglePin={()=>togglePin("orders",order.id)}
                  onOpen={canOpenOrders&&onOpenOrder ? ()=>onOpenOrder(order.id,entityId) : undefined}
                  />)}
              </div> : <AdminSectionEmpty>Nenhuma ordem de serviço vinculada a este cliente.</AdminSectionEmpty>)
          : <div className="space-y-3">
              {canLinkShop&&<div className="flex justify-end"><AdminButton size="sm" variant="secondary" onClick={()=>{setOrderNumber("");setCandidate(null);setLookupError("");setLinkOpen(true);}}><Link2 size={14}/> Vincular pedido</AdminButton></div>}
              {shopQuery.data?.length ? <div className="grid min-w-0 grid-cols-1 gap-3 xl:grid-cols-2">
                {sortPinned("store",shopQuery.data).map(order=><RequestCard key={order.id}
                  kind="Pedido da loja" title={"PED-"+order.order_number}
                  subtitle={(order.product_name||"Pedido da loja")+" · "+readableDate(order.created_at)}
                  status={order.status} pinned={isPinned("store",order.id)}
                  onTogglePin={()=>togglePin("store",order.id)}
                  onOpen={canOpenShop ? ()=>navigate(adminPath("siteStoreOrders")) : undefined}
                  >
                  {canLinkShop&&<button className="self-start text-xs font-semibold text-destructive hover:underline"
                    type="button" onClick={event=>{event.stopPropagation();void unlink(order);}}>Desvincular pedido</button>}
                </RequestCard>)}
              </div> : <AdminSectionEmpty>Sem pedidos da loja vinculados. Os pedidos não são associados automaticamente por nome ou e-mail.</AdminSectionEmpty>}
            </div>}
      </div>
    </Section>

    {selectedPhoto&&<Suspense fallback={null}>
      <OrderImageLightbox key={selectedPhoto.key} image={selectedPhoto} onClose={()=>setSelectedPhoto(null)}/>
    </Suspense>}
    <AdminDialog open={linkOpen} onClose={()=>{if(!busy)setLinkOpen(false);}} title="Vincular pedido da loja" description="Associe apenas pedidos cuja identidade do comprador foi conferida." footer={<div className="flex justify-end gap-2">
      <AdminButton variant="secondary" disabled={busy} onClick={()=>setLinkOpen(false)}>Cancelar</AdminButton>
      {candidate&&<AdminButton disabled={busy} loading={busy} onClick={()=>void confirmLink()}>Confirmar vínculo</AdminButton>}
    </div>}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[150px] flex-1"><label className="mb-1.5 block text-xs font-bold text-foreground">Número do pedido</label>
            <input className="admin-input h-10 w-full rounded-lg border border-border bg-card px-3 text-sm" placeholder="PED-1" value={orderNumber} onChange={e=>{setOrderNumber(e.target.value);setCandidate(null);setLookupError("");}}/>
          </div>
          <AdminButton disabled={busy} loading={busy} variant="secondary" onClick={()=>void searchOrder()}>Consultar</AdminButton>
        </div>
        {lookupError&&<p role="alert" className="text-xs text-destructive">{lookupError}</p>}
        {candidate&&<div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
          <p className="font-bold">PED-{candidate.order_number} · {candidate.product_name}</p>
          <p className="mt-1 text-xs">Comprador informado: <strong>{candidate.buyer?.buyer_name||"Não informado"}</strong></p>
          <p className="mt-1 text-xs">Telefone do pedido: <strong>{candidate.buyer?.buyer_phone||"Não informado"}</strong></p>
          <p className="mt-2 text-xs text-muted-foreground">A conferência do comprador deve ser feita antes de criar o vínculo. O número do pedido não comprova a identidade por si só.</p>
        </div>}
      </div>
    </AdminDialog>
  </>;
}
