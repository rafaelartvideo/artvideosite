import { useState, type FormEvent } from "react";
import { ArrowRight, ClipboardList, RotateCcw, ShieldCheck, X } from "lucide-react";
import { requestStoreAfterSales, type StoreSupportCase } from "../infrastructure/storefront.repository";

type SupportType=StoreSupportCase["type"];
const requestLabels:Record<SupportType,string>={
  cancellation:"Cancelamento",exchange:"Troca",return:"Devolução",
};
const stateLabels:Record<StoreSupportCase["status"],string>={
  open:"Solicitação recebida",in_review:"Em análise",
  approved:"Solicitação aprovada",rejected:"Solicitação não aprovada",
  closed:"Atendimento concluído",
};
const style="min-h-11 w-full rounded-lg border border-[#dce5f1] bg-white px-3 py-2.5 text-[13px] text-[#173450] outline-none focus:border-[var(--art-primary)] focus:ring-2 focus:ring-blue-500/10";

export function StoreAfterSalesCustomer({token,paymentStatus,cases,onSubmitted}:{
  token:string;paymentStatus:string;cases:StoreSupportCase[];
  onSubmitted:()=>Promise<void>;
}){
  const [open,setOpen]=useState(false);
  const [type,setType]=useState<SupportType>("cancellation");
  const [reason,setReason]=useState("");
  const [submitting,setSubmitting]=useState(false);
  const [message,setMessage]=useState("");
  const [success,setSuccess]=useState("");
  const allowed=paymentStatus==="paid"||paymentStatus==="awaiting_payment";
  const active=cases.some(c=>["open","in_review","approved"].includes(c.status));
  const mayRequest=allowed&&!active&&cases.length<5;
  const send=async(e:FormEvent)=>{
    e.preventDefault();
    if(submitting||reason.trim().length<10)return;
    setSubmitting(true);setMessage("");setSuccess("");
    try{
      await requestStoreAfterSales({token,type,reason:reason.trim()});
      setSuccess("Solicitação registrada. Acompanhe a análise por esta mesma página.");
      setOpen(false);setReason("");
      await onSubmitted();
    }catch(err){setMessage(err instanceof Error?err.message:"Não foi possível registrar sua solicitação.");}
    finally{setSubmitting(false);}
  };
  return <section className="rounded-xl border border-[#e0e8f3] bg-white p-5 shadow-[0_5px_20px_rgba(13,39,77,.035)] sm:p-6">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 className="flex items-center gap-2 text-[16px] font-extrabold text-[#102843]">
          <RotateCcw size={19} className="text-[var(--art-primary)]"/> Trocas, devoluções e cancelamentos
        </h3>
        <p className="mt-2 max-w-2xl text-[12px] leading-5 text-[#667b95]">
          Precisa de ajuda com esta compra? Abra uma solicitação para a equipe da Artvideo analisar.
          O registro não cancela o pedido nem realiza estorno automaticamente.
        </p>
      </div>
      {mayRequest&&!open&&<button type="button" onClick={()=>{setOpen(true);setMessage("");}}
        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-blue-200 bg-blue-50 px-4 text-[12px] font-bold text-[var(--art-primary)] transition-colors hover:bg-blue-100">
        Nova solicitação <ArrowRight size={15}/>
      </button>}
    </div>

    {success&&<p role="status" className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-[12px] font-semibold text-emerald-800">{success}</p>}
    {message&&<p role="alert" className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-[12px] text-red-700">{message}</p>}
    {open&&<form onSubmit={e=>void send(e)} className="mt-5 space-y-4 rounded-lg border border-[#dce9f7] bg-[#f8fbff] p-4">
      <div className="flex items-center justify-between gap-2">
        <strong className="text-[13px]">Qual é sua solicitação?</strong>
        <button type="button" aria-label="Fechar formulário" onClick={()=>setOpen(false)} className="p-2 text-[#667d99] hover:text-[#183957]"><X size={18}/></button>
      </div>
      <label className="block text-[12px] font-bold text-[#23415f]">Tipo de solicitação
        <select value={type} onChange={e=>setType(e.target.value as SupportType)} className={style+" mt-2"}>
          <option value="cancellation">Solicitar cancelamento</option>
          {paymentStatus==="paid"&&<><option value="exchange">Solicitar troca</option><option value="return">Solicitar devolução</option></>}
        </select>
      </label>
      <label className="block text-[12px] font-bold text-[#23415f]">Explique o que aconteceu *
        <textarea required rows={4} minLength={10} maxLength={1200} value={reason}
          onChange={e=>setReason(e.target.value)} className={style+" mt-2 min-h-28 resize-y"}
          placeholder="Descreva sua solicitação em pelo menos 10 caracteres..."/>
      </label>
      <p className="flex items-start gap-2 text-[11px] leading-5 text-[#6b8099]">
        <ShieldCheck size={16} className="mt-0.5 shrink-0 text-[var(--art-primary)]"/>
        Nossa equipe avaliará o pedido e informará a decisão aqui. Para assuntos urgentes, entre em contato diretamente.
      </p>
      <button type="submit" disabled={submitting||reason.trim().length<10}
        className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[var(--art-primary)] px-5 text-[12px] font-bold text-white transition-all hover:brightness-110 disabled:opacity-50">
        {submitting?"Enviando...":"Enviar solicitação"} <ArrowRight size={16}/>
      </button>
    </form>}

    {cases.length>0?<div className="mt-5 space-y-3">
      <h4 className="flex items-center gap-2 text-[13px] font-bold"><ClipboardList size={16} className="text-[var(--art-primary)]"/> Suas solicitações</h4>
      {cases.map(item=><div key={item.id} className="rounded-lg border border-[#e2eaf4] p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <strong className="text-[13px]">{requestLabels[item.type]}</strong>
          <span className={"rounded-full px-3 py-1 text-[11px] font-bold "+
            (item.status==="approved"||item.status==="closed"?"bg-emerald-50 text-emerald-700":
            item.status==="rejected"?"bg-red-50 text-red-700":"bg-blue-50 text-blue-700")}>
            {stateLabels[item.status]}
          </span>
        </div>
        <p className="mt-2 whitespace-pre-wrap text-[12px] text-[#546c87]">{item.reason}</p>
        <p className="mt-2 text-[11px] text-[#8b9aae]">Aberta em {new Date(item.createdAt).toLocaleString("pt-BR")}</p>
        {item.timeline?.length>0&&<ol className="mt-4 space-y-3 border-t border-[#edf2f8] pt-3">
          {item.timeline.map((event,i)=><li key={i} className="border-l-2 border-blue-200 pl-3">
            <p className="text-[12px] font-semibold">{stateLabels[event.status as StoreSupportCase["status"]]||"Atualização"}</p>
            {event.note&&<p className="mt-1 whitespace-pre-wrap text-[12px] text-[#59718e]">{event.note}</p>}
            <p className="mt-1 text-[10px] text-[#8294aa]">{new Date(event.createdAt).toLocaleString("pt-BR")}</p>
          </li>)}
        </ol>}
      </div>)}
    </div>:!mayRequest&&<p className="mt-4 text-[12px] text-[#6e8198]">
      Para atendimento sobre o pedido, entre em contato diretamente com a Artvideo.
    </p>}
  </section>;
}
