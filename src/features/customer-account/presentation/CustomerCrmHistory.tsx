import { useState } from "react";
import { ClipboardList, Download, FileText, RefreshCw } from "lucide-react";
import { supabase } from "@/lib/supabase";
import type { CustomerPortal } from "../infrastructure/customer-account.repository";

const card="rounded-xl border border-[#e2e8f1] bg-white p-4";
const date=(value?:string|null)=>value?new Date(value).toLocaleDateString("pt-BR"):"—";
export function CustomerCrmHistory({portal,tab}:{
  portal:CustomerPortal;tab:"service_orders"|"documents";
}){
  const [busy,setBusy]=useState<string|null>(null);
  const [error,setError]=useState("");
  const orders=portal.service_orders||[];
  const documents=portal.documents||[];
  async function openDocument(id:string){
    const tab=window.open("about:blank","_blank");
    if(tab)tab.opener=null;
    setBusy(id);setError("");
    try{
      const {data,error:e}=await supabase.functions.invoke("artvideo-customer-access",{
        body:{action:"signed_document",document_id:id},
      });
      if(e||!data?.success||!data?.url)throw new Error(data?.error||"Documento não disponível.");
      if(tab)tab.location.replace(data.url);
      else window.location.assign(data.url);
    }catch(e){tab?.close();setError(e instanceof Error?e.message:"Não foi possível abrir o documento.");}
    finally{setBusy(null);}
  }
  if(!portal.crm_access)return <div className={card+" text-center text-sm text-[#687f9c]"}>
    O acesso ao histórico do CRM precisa ser ativado pela recepção da Artvideo.
  </div>;
  return <div className="space-y-3">
    {error&&<p role="alert" className="rounded-lg bg-red-50 p-3 text-xs text-red-700">{error}</p>}
    {tab==="service_orders"?(orders.length?orders.map(item=>
      <article key={item.id} className={card}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <strong className="text-sm text-[#173450]">OS {item.os_number}</strong>
          <span className="rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">{item.status}</span>
        </div>
        <p className="mt-2 text-sm text-[#38536f]">{item.description}</p>
        {item.model&&<p className="mt-1 text-xs text-[#7086a0]">Equipamento: {item.model}</p>}
        <p className="mt-2 text-xs text-[#8093aa]">Aberta em {date(item.created_at)}{item.scheduled_at?" · Agendada para "+date(item.scheduled_at):""}</p>
      </article>
    ):<div className={card+" flex flex-col items-center gap-2 py-10 text-center text-sm text-[#687f9c]"}>
      <ClipboardList size={24}/>Nenhuma ordem de serviço vinculada à sua conta.
    </div>):(documents.length?documents.map(doc=>
      <article key={doc.id} className={card+" flex flex-wrap items-center justify-between gap-3"}>
        <div className="flex min-w-0 items-center gap-3">
          <FileText className="shrink-0 text-[var(--art-primary)]" size={21}/>
          <div className="min-w-0"><strong className="block truncate text-sm text-[#173450]">{doc.title||"Documento assinado"}</strong>
          <p className="text-xs text-[#7086a0]">OS {doc.os_number} · {date(doc.signed_at)}</p></div>
        </div>
        <button type="button" onClick={()=>void openDocument(doc.id)} disabled={busy===doc.id}
          className="inline-flex items-center gap-2 rounded-lg border border-blue-200 px-3 py-2 text-xs font-semibold text-[var(--art-primary)] disabled:opacity-60">
          {busy===doc.id?<RefreshCw size={15} className="animate-spin"/>:<Download size={15}/>} Abrir
        </button>
      </article>
    ):<div className={card+" flex flex-col items-center gap-2 py-10 text-center text-sm text-[#687f9c]"}>
      <FileText size={24}/>Nenhum documento assinado disponível.
    </div>)}
  </div>;
}
