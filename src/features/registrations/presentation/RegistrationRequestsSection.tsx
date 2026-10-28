import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Link2, Package, ShoppingBag, Wrench } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { AdminButton, AdminDialog, AdminSectionEmpty, Section } from "@/shared/ui/admin/AdminLayout";
import { LoadingState, notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import { CustomerEquipmentsSection } from "@/features/customers/presentation/CustomerEquipmentsSection";
import { listCustomerEquipments } from "@/features/customers/infrastructure/customers.repository";
import { adminPath } from "@/features/admin-shell/admin-routes";

type RequestTab = "equipment" | "quotes" | "orders" | "store";
type ShopOrder = { id:string; order_number:number; created_at:string; status:string; product_name:string; buyer:Record<string,string>|null };
type ServiceOrder = {id:string;os_number:string|number;created_at:string;service:{title?:string}|null;order_status:{name?:string;color?:string}|null};
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

export function RegistrationRequestsSection({entityId,customerId,organizationId,onOpenOrder}:{
  entityId:string;customerId:string|null;organizationId:string;
  onOpenOrder?:(id:string,customerId?:string)=>void;
}) {
  const {hasPermission}=useAuth();
  const queryClient=useQueryClient();
  const canViewOrders=hasPermission("orders.view")||hasPermission("orders.details.view");
  const canOpenOrders=hasPermission("orders.details.view");
  const canViewQuotes=hasPermission("quotes.view");
  const canViewShop=hasPermission("site_settings.view")&&hasPermission("customers.view");
  const canLinkShop=canViewShop&&hasPermission("site_settings.update")&&hasPermission("customers.edit");
  const [tab,setTab]=useState<RequestTab>("equipment");
  const [linkOpen,setLinkOpen]=useState(false);
  const [orderNumber,setOrderNumber]=useState("");
  const [candidate,setCandidate]=useState<ShopOrder|null>(null);
  const [busy,setBusy]=useState(false);
  const [lookupError,setLookupError]=useState("");

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
        .select("id,os_number,created_at,service:services(title),order_status:order_statuses(name,color)")
        .eq("organization_id",organizationId).eq("customer_id",customerId!)
        .order("created_at",{ascending:false}).limit(100);
      if(error)throw error;
      return (data||[]) as unknown as ServiceOrder[];
    },enabled:Boolean(customerId&&canViewOrders),staleTime:60000,
  });
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
      <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3">
        {tabs.map(item=>{
          const Icon=item.icon;
          return <button key={item.id} type="button" aria-pressed={selectedTab===item.id}
            onClick={()=>setTab(item.id)}
            className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-bold transition-colors ${selectedTab===item.id?"border-primary bg-primary/10 text-primary":"border-border bg-card text-muted-foreground hover:bg-muted"}`}>
            <Icon size={15}/>{item.label}<span className="rounded-md bg-muted px-1.5 py-0.5 tabular-nums">{item.count}</span>
          </button>;
        })}
      </div>
      <div className="pt-4">
        {currentQuery.isLoading ? <LoadingState text="Carregando solicitações..." /> :
          currentQuery.error ? <div className="space-y-2 py-5 text-center"><p className="text-sm text-destructive">Não foi possível carregar esta seção: {systemErrorMessage(currentQuery.error)}</p><AdminButton size="sm" variant="secondary" onClick={()=>void currentQuery.refetch()}>Tentar novamente</AdminButton></div> :
          selectedTab==="equipment"
            ? <CustomerEquipmentsSection embedded equipments={equipmentQuery.data||[]}/>
          : selectedTab==="quotes" ? (quotesQuery.data?.length
            ? <div className="space-y-2">{quotesQuery.data.map(q=><div key={q.id} className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-border bg-card p-3">
                <div className="min-w-0"><div className="text-sm font-bold text-foreground">{q.protocol||"Orçamento"}</div><p className="truncate text-xs text-muted-foreground">{q.service?.title||"Serviço"} · {readableDate(q.created_at)}</p></div>
                <span className="text-xs font-semibold text-muted-foreground">{q.request_status?.name||"—"}</span>
              </div>)}</div> : <AdminSectionEmpty>Nenhum orçamento vinculado a este cliente.</AdminSectionEmpty>)
          : selectedTab==="orders" ? (ordersQuery.data?.length
            ? <div className="space-y-2">{ordersQuery.data.map(order=><button key={order.id} type="button" disabled={!canOpenOrders}
                onClick={()=>onOpenOrder?.(order.id,entityId)}
                className="flex w-full min-w-0 items-center justify-between gap-3 rounded-lg border border-border bg-card p-3 text-left enabled:hover:bg-muted">
                <div className="min-w-0"><div className="text-sm font-bold text-foreground">OS {order.os_number}</div><p className="truncate text-xs text-muted-foreground">{order.service?.title||"Ordem de serviço"} · {readableDate(order.created_at)}</p></div>
                <span className="text-xs font-semibold text-muted-foreground">{order.order_status?.name||"—"}</span>
              </button>)}</div> : <AdminSectionEmpty>Nenhuma ordem de serviço vinculada a este cliente.</AdminSectionEmpty>)
          : <div className="space-y-3">
              {canLinkShop&&<div className="flex justify-end"><AdminButton size="sm" variant="secondary" onClick={()=>{setOrderNumber("");setCandidate(null);setLookupError("");setLinkOpen(true);}}><Link2 size={14}/> Vincular pedido</AdminButton></div>}
              {shopQuery.data?.length ? <div className="space-y-2">{shopQuery.data.map(order=><div key={order.id} className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-3">
                <div className="min-w-0"><p className="text-sm font-bold">PED-{order.order_number}</p><p className="truncate text-xs text-muted-foreground">{order.product_name||"Pedido da loja"} · {readableDate(order.created_at)}</p></div>
                <div className="flex items-center gap-2"><span className="text-xs font-semibold text-muted-foreground">{order.status}</span>
                <a href={adminPath("siteStoreOrders")} className="rounded-md px-2 py-1 text-xs font-semibold text-primary hover:underline">Ver pedidos</a>
                {canLinkShop&&<button className="text-xs text-destructive hover:underline" type="button" onClick={()=>void unlink(order)}>Desvincular</button>}</div>
              </div>)}</div> : <AdminSectionEmpty>Sem pedidos da loja vinculados. Os pedidos não são associados automaticamente por nome ou e-mail.</AdminSectionEmpty>}
            </div>}
      </div>
    </Section>

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
