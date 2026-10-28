import { useState } from "react";
import { Download, FileSignature, LoaderCircle } from "lucide-react";
import { Link } from "react-router";
import { customerAccessRequest } from "@/lib/customer-access";
import { useCustomerSignatures } from "../application/useCustomerSignatures";
import type { CustomerSignatureRequest } from "../infrastructure/customer-account.repository";
import { CustomerSectionLoading } from "./CustomerSectionLoading";

type Filter = "all" | "pending" | "signed" | "expired";
type SignatureState = CustomerSignatureRequest["customer_status"] | "expiring";
const date = (value?: string | null) => value ? new Date(value).toLocaleDateString("pt-BR") : "—";
const statusName: Record<SignatureState,string> = {
  pending: "Pendente", expiring: "Expirando", signed: "Concluída",
  expired: "Expirada", cancelled: "Cancelada",
};
const edgeTone: Record<SignatureState,string> = {
  pending: "bg-amber-400", expiring: "bg-orange-500", signed: "bg-emerald-500",
  expired: "bg-red-500", cancelled: "bg-slate-400",
};
const textTone: Record<SignatureState,string> = {
  pending: "text-amber-800", expiring: "text-orange-700", signed: "text-emerald-700",
  expired: "text-red-700", cancelled: "text-slate-600",
};

/** Convite pendente a 48h do fim é sinalizado como Expirando; concluído/cancelado têm prioridade. */
export function customerSignatureState(item: CustomerSignatureRequest, now=Date.now()): SignatureState {
  if (item.customer_status !== "pending") return item.customer_status;
  const deadline = item.expires_at ? new Date(item.expires_at).getTime() : NaN;
  if (!Number.isFinite(deadline)) return "pending";
  if (deadline <= now) return "expired";
  return deadline - now <= 48 * 60 * 60 * 1000 ? "expiring" : "pending";
}

export function CustomerSignatures({userId}:{userId:string}) {
  const [filter,setFilter] = useState<Filter>("all");
  const [busy,setBusy] = useState<string|null>(null);
  const [error,setError] = useState("");
  const query = useCustomerSignatures(userId);
  const signatures = query.data || [];
  const stateFor = (item: CustomerSignatureRequest) => customerSignatureState(item);
  const counts = {
    all: signatures.length,
    pending: signatures.filter(item => ["pending","expiring"].includes(stateFor(item))).length,
    signed: signatures.filter(item => stateFor(item) === "signed").length,
    expired: signatures.filter(item => ["expired","cancelled"].includes(stateFor(item))).length,
  };
  const items = signatures.filter(item => {
    const state = stateFor(item);
    if (filter === "all") return true;
    if (filter === "pending") return state === "pending" || state === "expiring";
    if (filter === "expired") return state === "expired" || state === "cancelled";
    return state === "signed";
  });

  async function openItem(item: CustomerSignatureRequest, download=false) {
    const win=window.open("about:blank","_blank"); if(win)win.opener=null;
    setBusy(download?"download:"+item.id:item.id);setError("");
    try {
      const result=item.customer_status==="signed"
        ? await customerAccessRequest("signed_document",{document_id:item.id,download})
        : await customerAccessRequest("customer_signature_link",{signature_id:item.id});
      if(win)win.location.replace(result.url);else window.location.assign(result.url);
    } catch (cause) {
      win?.close();
      setError(cause instanceof Error?cause.message:"Não foi possível abrir a assinatura.");
      await query.refetch();
    } finally {setBusy(null);}
  }

  function actions(item: CustomerSignatureRequest) {
    const state=stateFor(item);
    const canSign=state==="pending"||state==="expiring";
    const canView=state==="signed"&&item.downloadable;
    if (canSign||canView) return <div className="flex flex-wrap justify-end gap-2">
      <button type="button" disabled={busy!==null}
        onClick={()=>void openItem(item)}
        className="inline-flex h-9 shrink-0 items-center justify-center rounded-lg bg-[var(--art-primary)] px-3 text-xs font-semibold text-white transition-colors hover:bg-blue-800 disabled:opacity-60">
        {busy===item.id?<LoaderCircle size={16} className="animate-spin" aria-label="Abrindo..."/>:canSign?"Assinar":"Ver assinatura"}
      </button>
      {canView&&<button type="button" title="Baixar documento assinado" aria-label="Baixar documento assinado"
        disabled={busy!==null} onClick={()=>void openItem(item,true)}
        className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-blue-200 px-3 text-xs font-semibold text-[var(--art-primary)] hover:bg-blue-50 disabled:opacity-60">
        {busy==="download:"+item.id?<LoaderCircle size={16} className="animate-spin"/>:<Download size={16}/>} Baixar
      </button>}
    </div>;
    if(state==="expired")return <Link to="/contato"
      className="inline-flex min-h-9 items-center text-xs font-semibold text-[var(--art-primary)] hover:underline">Solicitar novo convite</Link>;
    return <span className="text-xs text-[#91a2b5]">—</span>;
  }

  if (query.isLoading) return <CustomerSectionLoading label="Carregando minhas assinaturas..."/>;
  if (query.error) return <div className="py-10 text-center text-sm text-red-700">
    Não foi possível carregar as assinaturas. <button type="button" onClick={()=>void query.refetch()} className="ml-2 font-semibold text-[var(--art-primary)]">Tentar novamente</button>
  </div>;
  return <section className="space-y-4">
    <div className="flex flex-wrap gap-2" aria-label="Filtrar assinaturas">
      {([{key:"all",title:"Todas"},{key:"pending",title:"Pendentes"},
        {key:"signed",title:"Concluídas"},{key:"expired",title:"Expiradas/Canceladas"}] as const).map(option=>
        <button key={option.key} type="button" aria-pressed={filter===option.key} onClick={()=>setFilter(option.key)}
          className={"inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-colors "+
            (filter===option.key?"border-[var(--art-primary)] bg-[#eff4ff] text-[var(--art-primary)]":"border-[#dce5f1] bg-white text-[#647b96] hover:bg-[#f7f9fc]")}>
          {option.title} ({counts[option.key]})
        </button>)}
    </div>
    {error&&<p role="alert" className="rounded-lg bg-red-50 p-3 text-xs text-red-700">{error}</p>}
    {items.length ? <>
      <div className="space-y-2 md:hidden" aria-label="Minhas assinaturas">
        {items.map(item=>{
          const state=stateFor(item);
          return <article key={item.id} className="relative overflow-hidden rounded-xl border border-[#e2e8f1] bg-white px-4 py-3.5 shadow-sm">
            <span aria-hidden="true" className={"absolute inset-y-0 left-0 w-1.5 "+edgeTone[state]}/>
            <div className="flex min-w-0 flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-wide text-[#6b809a]">Documento</p>
                <p className="mt-0.5 break-words text-[13px] font-bold text-[#193756]">{item.title||"Documento para assinatura"}</p>
              </div>
              <p className={"text-xs font-semibold "+textTone[state]}>{statusName[state]}</p>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2.5 border-t border-[#eef1f6] pt-3">
              <div><p className="text-[10px] font-bold uppercase tracking-wide text-[#6b809a]">Ordem de serviço</p>
                <p className="mt-1 text-[12px] font-medium text-[#263f5c]">OS {item.os_number}</p></div>
              <div><p className="text-[10px] font-bold uppercase tracking-wide text-[#6b809a]">Enviado em</p>
                <p className="mt-1 text-[12px] font-medium text-[#263f5c]">{date(item.created_at)}</p></div>
              <div className="col-span-2"><p className="text-[10px] font-bold uppercase tracking-wide text-[#6b809a]">{state==="signed"?"Assinado em":"Validade do convite"}</p>
                <p className="mt-1 text-[12px] text-[#263f5c]">{date(state==="signed"?item.signed_at:item.expires_at)}</p></div>
            </div>
            <div className="mt-3 flex justify-end border-t border-[#eef1f6] pt-3">{actions(item)}</div>
          </article>;
        })}
      </div>
      <div className="hidden overflow-x-auto rounded-xl border border-[#e2e8f1] bg-white md:block">
        <table className="w-full min-w-[650px] border-collapse text-left text-[13px]">
          <thead className="bg-[#f3f6fa] text-[11px] font-bold uppercase tracking-wider text-[#61748e]">
            <tr><th scope="col" className="px-4 py-3">Documento</th><th scope="col" className="px-4 py-3">Ordem de serviço</th>
              <th scope="col" className="px-4 py-3">Situação</th><th scope="col" className="px-4 py-3">Enviado em</th>
              <th scope="col" className="px-4 py-3 text-right">Ações</th></tr>
          </thead>
          <tbody className="divide-y divide-[#ecf0f6]">
            {items.map(item=>{
              const state=stateFor(item);
              return <tr key={item.id} className="transition-colors hover:bg-[#f3f7ff]">
                <td className="relative max-w-[260px] py-3 pl-6 pr-4">
                  <span aria-hidden="true" className={"absolute bottom-1 left-0 top-1 w-1.5 rounded-r "+edgeTone[state]}/>
                  <p className="truncate font-bold text-[#193756]" title={item.title}>{item.title||"Documento para assinatura"}</p>
                  <p className="mt-1 text-[11px] text-[#72849b]">{state==="signed"?"Assinado em "+date(item.signed_at):"Validade: "+date(item.expires_at)}</p>
                </td>
                <td className="px-4 py-3 font-medium text-[#263f5c]">OS {item.os_number}</td>
                <td className={"px-4 py-3 text-xs font-semibold "+textTone[state]}>{statusName[state]}</td>
                <td className="whitespace-nowrap px-4 py-3 text-[#657b95]">{date(item.created_at)}</td>
                <td className="px-4 py-3 text-right">{actions(item)}</td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
    </> : <div className="flex min-h-44 flex-col items-center justify-center gap-3 rounded-xl border border-[#e2e8f1] bg-white p-5 text-center">
      <FileSignature size={26} className="text-[#9aabc0]"/>
      <p className="text-sm text-[#657b95]">Nenhuma assinatura {filter==="pending"?"pendente":filter==="signed"?"concluída":"encontrada"}.</p>
    </div>}
    <p className="text-center text-xs leading-5 text-[#899ab0]">
      Os convites de assinatura possuem validade própria. Documentos concluídos permanecem disponíveis para consulta.
    </p>
  </section>;
}
