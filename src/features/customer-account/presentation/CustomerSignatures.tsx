import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Clock3, FileSignature, LoaderCircle, XCircle } from "lucide-react";
import { Link } from "react-router";
import { supabase } from "@/lib/supabase";
import { customerAccessRequest } from "@/lib/customer-access";
import type { CustomerSignatureRequest } from "../infrastructure/customer-account.repository";
import { CustomerSectionLoading } from "./CustomerSectionLoading";

type Filter="all"|"pending"|"signed"|"expired";
const date=(value?:string|null)=>value?new Date(value).toLocaleDateString("pt-BR"):"—";
const statusName:Record<string,string>={pending:"Pendente",signed:"Concluída",expired:"Expirada",cancelled:"Cancelada"};
const statusStyle:Record<string,string>={
  pending:"border-amber-200 bg-amber-50 text-amber-800",
  signed:"border-emerald-200 bg-emerald-50 text-emerald-700",
  expired:"border-red-200 bg-red-50 text-red-700",
  cancelled:"border-slate-200 bg-slate-50 text-slate-700",
};
export function CustomerSignatures({userId}:{userId:string}){
  const [filter,setFilter]=useState<Filter>("all");
  const [busy,setBusy]=useState<string|null>(null);
  const [error,setError]=useState("");
  const query=useQuery<CustomerSignatureRequest[]>({
    queryKey:["artvideo-customer-signatures",userId],
    queryFn:async()=>{
      const {data,error:rpcError}=await supabase.rpc("artvideo_customer_signatures_v1");
      if(rpcError)throw rpcError;
      return Array.isArray(data)?data as CustomerSignatureRequest[]:[];
    },
    staleTime:20000,refetchOnWindowFocus:true,
  });
  const signatures=query.data||[];
  const counts={all:signatures.length,pending:signatures.filter(x=>x.customer_status==="pending").length,
    signed:signatures.filter(x=>x.customer_status==="signed").length,
    expired:signatures.filter(x=>x.customer_status==="expired"||x.customer_status==="cancelled").length};
  const items=signatures.filter(x=>filter==="all"||
    filter==="expired"?(filter==="all"||x.customer_status==="expired"||x.customer_status==="cancelled")
      :x.customer_status===filter);
  async function openItem(item:CustomerSignatureRequest){
    const win=window.open("about:blank","_blank");if(win)win.opener=null;
    setBusy(item.id);setError("");
    try {
      const result=item.customer_status==="signed"?
        await customerAccessRequest("signed_document",{document_id:item.id}):
        await customerAccessRequest("customer_signature_link",{signature_id:item.id});
      if(win)win.location.replace(result.url);else window.location.assign(result.url);
    } catch (cause) {
      win?.close();
      setError(cause instanceof Error?cause.message:"Não foi possível abrir a assinatura.");
      await query.refetch();
    } finally {setBusy(null);}
  }
  if(query.isLoading)return <CustomerSectionLoading label="Carregando minhas assinaturas..."/>;
  if(query.error)return <div className="py-10 text-center text-sm text-red-700">
    Não foi possível carregar as assinaturas. <button type="button" onClick={()=>void query.refetch()} className="ml-2 font-semibold text-[var(--art-primary)]">Tentar novamente</button>
  </div>;
  return <section className="space-y-4">
    <div className="flex flex-wrap gap-2" aria-label="Filtrar assinaturas">
      {([{key:"all",title:"Todas"},{key:"pending",title:"Pendentes"},
        {key:"signed",title:"Concluídas"},{key:"expired",title:"Expiradas/Canceladas"}] as const).map(option=>
        <button key={option.key} type="button" aria-pressed={filter===option.key} onClick={()=>setFilter(option.key)}
          className={"inline-flex h-9 items-center gap-2 rounded-lg border px-3 text-xs font-semibold transition-colors "+
            (filter===option.key?"border-[var(--art-primary)] bg-[#eff4ff] text-[var(--art-primary)]":"border-[#dce5f1] bg-white text-[#647b96] hover:bg-[#f7f9fc]")}>
          {option.title} <span className="rounded-md bg-white/75 px-1.5 py-0.5 tabular-nums">{counts[option.key]}</span>
        </button>)}
    </div>
    {error&&<p role="alert" className="rounded-lg bg-red-50 p-3 text-xs text-red-700">{error}</p>}
    {items.length?<div className="space-y-2">
      {items.map(item=>{
        const signed=item.customer_status==="signed";
        const active=item.customer_status==="pending";
        const Icon=signed?CheckCircle2:active?Clock3:item.customer_status==="expired"?XCircle:FileSignature;
        return <article key={item.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e2e8f1] bg-white p-4">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#eef4ff] text-[var(--art-primary)]"><Icon size={19}/></span>
            <div className="min-w-0">
              <p className="break-words text-sm font-bold text-[#193756]">{item.title||"Documento para assinatura"}</p>
              <p className="mt-1 text-xs text-[#71859e]">OS {item.os_number} · Enviado em {date(item.created_at)}</p>
              <p className="mt-1 text-xs text-[#71859e]">{signed?"Assinado em "+date(item.signed_at):"Validade do convite: "+date(item.expires_at)}</p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <span className={"rounded-md border px-2 py-1 text-[11px] font-semibold "+(statusStyle[item.customer_status]||statusStyle.cancelled)}>
              {statusName[item.customer_status]||item.status}
            </span>
            {(active || signed&&item.downloadable) && <button type="button" disabled={busy===item.id}
              onClick={()=>void openItem(item)}
              className="inline-flex h-9 items-center justify-center rounded-lg bg-[var(--art-primary)] px-3 text-xs font-semibold text-white disabled:opacity-60">
              {busy===item.id?<LoaderCircle size={16} className="animate-spin" aria-label="Abrindo..."/>:active?"Assinar":"Ver assinatura"}
            </button>}
            {item.customer_status==="expired" && <Link to="/contato"
              className="text-xs font-semibold text-[var(--art-primary)] hover:underline">Solicitar novo convite</Link>}
          </div>
        </article>;
      })}</div>:<div className="flex min-h-44 flex-col items-center justify-center gap-3 rounded-xl border border-[#e2e8f1] bg-white p-5 text-center">
        <FileSignature size={26} className="text-[#9aabc0]"/>
        <p className="text-sm text-[#657b95]">Nenhuma assinatura {filter==="pending"?"pendente":filter==="signed"?"concluída":"encontrada"}.</p>
      </div>}
    <p className="text-center text-xs leading-5 text-[#899ab0]">
      Os convites de assinatura possuem validade própria. Documentos concluídos permanecem disponíveis para consulta.
    </p>
  </section>;
}
