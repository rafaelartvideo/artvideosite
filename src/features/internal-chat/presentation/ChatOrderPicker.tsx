import {useState} from "react";
import {useQuery} from "@tanstack/react-query";
import {ChevronLeft,ClipboardList,Loader2,Search} from "lucide-react";
import {supabase} from "@/lib/supabase";
import {adminPath} from "@/features/admin-shell/admin-routes";

export function ChatOrderPicker({org,onSelect,onBack}:{org:string;onSelect:(path:string)=>void;onBack:()=>void}){
 const [input,setInput]=useState("");
 const [term,setTerm]=useState("");
 const orders=useQuery({queryKey:["internal-chat-order-picker",org,term],queryFn:async()=>{
  let q=supabase.from("service_orders").select("id,os_number").eq("organization_id",org);
  if(term)q=q.ilike("os_number","%"+term+"%");
  const {data,error}=await q.order("created_at",{ascending:false}).limit(20);
  if(error)throw error;
  return (data??[]) as {id:string;os_number:string|null}[];
 },retry:false,staleTime:30000});
 return <div className="flex h-[min(280px,45dvh)] min-h-0 flex-col gap-2">
 <div className="flex items-center gap-2"><button type="button" title="Voltar" className="rounded p-1 hover:bg-muted" onClick={onBack}><ChevronLeft size={16}/></button><span className="text-xs font-semibold">Enviar ordem de serviço</span></div>
 <div className="flex gap-1"><input aria-label="Buscar número da OS" placeholder="Número da OS" maxLength={40} value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"){e.preventDefault();e.stopPropagation();setTerm(input.trim().replace(/[^a-zA-Z0-9-]/g,""));}}} className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 text-xs"/><button type="button" title="Buscar OS" className="rounded-md border border-border p-2 hover:bg-muted" onClick={()=>setTerm(input.trim().replace(/[^a-zA-Z0-9-]/g,""))}><Search size={15}/></button></div>
 <div className="min-h-0 flex-1 overflow-y-auto">
 {orders.isPending?<div role="status" className="grid h-full place-items-center"><Loader2 size={20} className="animate-spin text-primary"/></div>:orders.isError?<p className="p-3 text-center text-xs text-destructive">Não foi possível consultar as ordens de serviço.</p>:!orders.data?.length?<p className="p-3 text-center text-xs text-muted-foreground">Nenhuma OS disponível.</p>:orders.data.map(o=><button type="button" key={o.id} className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs hover:bg-muted" onClick={()=>onSelect(adminPath("orders",o.id))}><ClipboardList size={16} className="shrink-0 text-primary"/><span className="font-semibold">OS {o.os_number??"Sem número"}</span></button>)}
 </div><p className="text-[10px] text-muted-foreground">O destinatário precisa ter acesso à OS para abrir os detalhes.</p></div>;
}
