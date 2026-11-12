import { useEffect, useRef, useState } from "react";
import { ChevronDown, ClipboardList, Cpu, LoaderCircle, RotateCcw, UserRound } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { getOrderStatusBadgeClass } from "@/features/orders/domain/order-status-palette";
import type { CrmConversationContext } from "@/features/whatsapp-channels/presentation/UnionWhatsAppCrmMenu";
import { pbxContactPhoneKey } from "../application/pbx-saved-contact-cards";

type Response = CrmConversationContext & { success?: boolean; error?: string; can_view_orders?: boolean };
type Cached = { context: Response; expires: number };
type Panel = "registration" | "equipments" | "orders" | null;

function Field({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return <div className="min-w-0">
    <span className="block text-[10px] font-semibold text-muted-foreground">{label}</span>
    <span className="block break-words text-xs text-foreground">{value}</span>
  </div>;
}
function date(value: string | null | undefined) {
  if (!value) return "";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toLocaleDateString("pt-BR");
}
function document(value: string | null | undefined) {
  const digits=String(value || "").replace(/\D/g,"");
  if (digits.length===11) return `${digits.slice(0,3)}.${digits.slice(3,6)}.${digits.slice(6,9)}-${digits.slice(9)}`;
  if (digits.length===14) return `${digits.slice(0,2)}.${digits.slice(2,5)}.${digits.slice(5,8)}/${digits.slice(8,12)}-${digits.slice(12)}`;
  return value || "";
}

export function PbxCrmContactPanel({
  organizationId, phone, active, source,
}: {
  organizationId: string | null;
  phone: string;
  active: boolean;
  source?: "crm" | "pbx" | "whatsapp" | "ramal" | null;
}) {
  const { hasPermission } = useAuth();
  const canViewCustomers=hasPermission("customers.view");
  const canViewOrders=hasPermission("orders.details.view");
  const key=pbxContactPhoneKey(phone);
  const [panel,setPanel]=useState<Panel>(null);
  const [context,setContext]=useState<Response | null>(null);
  const [loadedKey,setLoadedKey]=useState("");
  const [error,setError]=useState("");
  const [revision,setRevision]=useState(0);
  const cache=useRef(new Map<string,Cached>());
  const cacheKey=organizationId && key ? organizationId+":"+key : "";

  useEffect(()=>{setPanel(null);},[cacheKey]);
  useEffect(()=>{
    if(!active||!organizationId||!key||!canViewCustomers) return;
    const saved=cache.current.get(cacheKey);
    if(saved && saved.expires>Date.now() && !revision){
      setContext(saved.context);setLoadedKey(cacheKey);setError("");
      return;
    }
    let cancelled=false;
    const controller=new AbortController();
    setLoadedKey("");
    setError("");
    void supabase.functions.invoke<Response>("union-pbx-contact-cards",{
      body:{action:"context",organization_id:organizationId,phone:key},
      signal:controller.signal,
    }).then(({data,error:requestError})=>{
      if(cancelled)return;
      if(requestError||!data?.success)throw Error(data?.error||"Dados do CRM indisponíveis.");
      cache.current.set(cacheKey,{context:data,expires:Date.now()+5*60_000});
      setContext(data);setLoadedKey(cacheKey);
    }).catch(reason=>{
      if(!cancelled){setError(reason instanceof Error?reason.message:"Não foi possível consultar o cliente.");setLoadedKey(cacheKey);}
    });
    return()=>{cancelled=true;controller.abort();};
  },[active,organizationId,key,cacheKey,revision,canViewCustomers]);
  if(!active||!key||!canViewCustomers) return null;

  const ready=loadedKey===cacheKey;
  const customer=ready?context?.customer:null;
  const panels=[
    {id:"registration" as const,title:"Dados de cadastro",icon:UserRound},
    {id:"equipments" as const,title:"Equipamentos",icon:Cpu,count:context?.equipments?.length||0},
    ...(canViewOrders?[{id:"orders" as const,title:"OS recentes",icon:ClipboardList,count:context?.orders?.length||0}]:[]),
  ];

  return <section aria-label="Dados do cliente no CRM" className="mt-5 border-t border-border pt-4">
    <h4 className="mb-3 text-sm font-bold">Dados do CRM</h4>
    {!ready ? <p role="status" className="flex items-center gap-2 py-3 text-xs text-primary">
      <LoaderCircle size={15} className="animate-spin"/> Consultando cliente vinculado...
    </p> : error ? <div className="space-y-2 text-xs text-muted-foreground">
      <p>{error}</p>
      <button type="button" className="inline-flex items-center gap-1 text-primary" onClick={()=>setRevision(v=>v+1)}>
        <RotateCcw size={13}/> Tentar novamente
      </button>
    </div> : context?.ambiguous ? <p className="text-xs leading-5 text-amber-700 dark:text-amber-300">
      Mais de um cadastro possui este número. Confirme o cliente no CRM antes de consultar OS ou equipamentos.
    </p> : !customer ? <p className="text-xs leading-5 text-muted-foreground">
      {source==="pbx" ? "Contato salvo na agenda PABX, sem cliente correspondente no CRM." : "Nenhum cliente do CRM encontrado para este número."}
    </p> : <>
      <p className="mb-2 truncate text-xs font-semibold" title={customer.name}>{customer.name}</p>
      <div className="space-y-1">
        {panels.map(item=><div key={item.id} className="min-w-0 rounded-lg border border-border">
          <button type="button" aria-expanded={panel===item.id} onClick={()=>setPanel(old=>old===item.id?null:item.id)}
            className="flex min-h-10 w-full items-center gap-2 px-3 text-left text-xs font-semibold hover:bg-muted/50">
            <item.icon size={16} className="shrink-0 text-primary"/>
            <span className="min-w-0 flex-1">{item.title}</span>
            {"count" in item && <span className="font-normal text-muted-foreground">{item.count}</span>}
            <ChevronDown size={15} className={`shrink-0 text-muted-foreground transition-transform ${panel===item.id?"rotate-180":""}`}/>
          </button>
          {panel===item.id&&<div className="border-t border-border p-3">
            {item.id==="registration"&&<div className="grid grid-cols-2 gap-3">
              <Field label="Nome" value={customer.name}/>
              <Field label="CPF/CNPJ" value={document(customer.cnpj||customer.document)}/>
              <Field label="E-mail" value={customer.email}/>
              <Field label="Telefone" value={customer.phone}/>
              <Field label="WhatsApp" value={customer.whatsapp}/>
              <Field label="Razão social" value={customer.legal_name}/>
              <Field label="Nome fantasia" value={customer.trade_name}/>
              {customer.addresses?.map(address=><div key={address.id} className="col-span-2">
                <Field label={address.is_default?"Endereço principal":"Endereço"}
                  value={[address.street,address.number,address.neighborhood,address.city,address.state].filter(Boolean).join(", ")}/>
              </div>)}
            </div>}
            {item.id==="equipments"&&<div className="space-y-2">
              {!context?.equipments?.length&&<p className="text-xs text-muted-foreground">Nenhum equipamento cadastrado.</p>}
              {context?.equipments?.map(equipment=><details key={equipment.id} className="rounded-md border border-border p-2">
                <summary className="cursor-pointer text-xs font-semibold">
                  {[equipment.equipment_brand_name,equipment.equipment_model_name].filter(Boolean).join(" · ")
                    ||equipment.equipment_type_name||"Equipamento"}
                </summary>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Field label="Tipo" value={equipment.equipment_type_name}/>
                  <Field label="Nº de série" value={equipment.serial_number}/>
                  {equipment.technical_values?.map((field,i)=><Field key={field.technical_field_id||i}
                    label={field.label_snapshot||field.field_key_snapshot||"Campo técnico"}
                    value={field.value_text|| (field.value_number===null||field.value_number===undefined?"":String(field.value_number))}/>)}
                </div>
              </details>)}
            </div>}
            {item.id==="orders"&&<div className="space-y-3">
              {!context?.orders?.length&&<p className="text-xs text-muted-foreground">Nenhuma OS encontrada.</p>}
              {context?.orders?.map(order=>{
                const status=order.cancelled_at?"Cancelada":order.completed_at?"Fechada":order.order_status?.name||"Aberta";
                const equipment=[order.customer_equipment?.equipment_brand_name||order.equipment_brand?.name,
                  order.customer_equipment?.equipment_model_name||order.equipment_model?.name||order.model].filter(Boolean).join(" · ");
                return <div key={order.id} className="space-y-1 border-b border-border pb-2 last:border-0">
                  <a href={`/admin/orders/${encodeURIComponent(order.id)}?org=${encodeURIComponent(organizationId||"")}`}
                    target="_blank" rel="noopener noreferrer" className="block break-words text-xs font-semibold text-primary hover:underline">
                    OS {order.os_number} {equipment?"· "+equipment:""}
                  </a>
                  <span className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-semibold ${getOrderStatusBadgeClass(status)}`}>{status}</span>
                  <p className="text-[11px] text-muted-foreground">{order.situation?.name||""}{order.created_at?" · "+date(order.created_at):""}</p>
                </div>;
              })}
            </div>}
          </div>}
        </div>)}
      </div>
    </>}
  </section>;
}
