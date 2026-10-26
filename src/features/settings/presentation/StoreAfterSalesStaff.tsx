import { STATUS_TONE_CLASSES } from "@/shared/domain/status-tone";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ClipboardList, MessageSquareText, Plus, RotateCcw } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { AdminButton } from "@/shared/ui/admin/AdminLayout";
import { StoreReturnOperations, type StoreSoldLine } from "./StoreReturnOperations";

type CaseStatus="open"|"in_review"|"approved"|"rejected"|"closed";
type CaseType="cancellation"|"exchange"|"return";
type AfterSale={
  id:string;order_id:string;request_type:CaseType;status:CaseStatus;
  reason:string;opened_by:string;created_at:string;updated_at:string;
};
type CaseEvent={
  id:string;case_id:string;from_status:string|null;to_status:CaseStatus;
  actor_name:string|null;public_note:string|null;internal_note:string|null;created_at:string;
};
const typeNames:Record<CaseType,string>={cancellation:"Cancelamento",exchange:"Troca",return:"Devolução"};
const statusNames:Record<CaseStatus,string>={
  open:"Recebida",in_review:"Em análise",approved:"Aprovada",
  rejected:"Não aprovada",closed:"Concluída",
};
const actionNext:Partial<Record<CaseStatus,{status:CaseStatus;label:string}[]>>={
  open:[{status:"in_review",label:"Iniciar análise"},{status:"rejected",label:"Não aprovar"}],
  in_review:[{status:"approved",label:"Aprovar solicitação"},{status:"rejected",label:"Não aprovar"}],
  approved:[{status:"closed",label:"Concluir atendimento"}],
};
const input="min-h-10 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary";

export function StoreAfterSalesStaff({orderId,paymentStatus,canManage,items,orderTotal,onChange,standalone=false}:{
  orderId:string;paymentStatus:string;canManage:boolean;
  items:StoreSoldLine[];orderTotal:number;onChange?:()=>void;standalone?:boolean;
}){
  const [cases,setCases]=useState<AfterSale[]>([]);
  const [events,setEvents]=useState<CaseEvent[]>([]);
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [feedback,setFeedback]=useState("");
  const [creating,setCreating]=useState(false);
  const [kind,setKind]=useState<CaseType>("cancellation");
  const [reason,setReason]=useState("");
  const [selectedCase,setSelectedCase]=useState<string|null>(null);
  const [next,setNext]=useState<CaseStatus|"">("");
  const [publicNote,setPublicNote]=useState("");
  const [privateNote,setPrivateNote]=useState("");
  const refresh=useCallback(async()=>{
    setLoading(true);setError("");
    const {data,error}=await supabase.from("artvideo_store_support_cases")
      .select("id,order_id,request_type,status,reason,opened_by,created_at,updated_at")
      .eq("order_id",orderId).order("created_at",{ascending:false}).limit(5);
    if(error){setError(systemErrorMessage(error));setLoading(false);return;}
    const found=(data||[]) as AfterSale[];
    setCases(found);
    if(found.length){
      const result=await supabase.from("artvideo_store_support_case_events")
        .select("id,case_id,from_status,to_status,actor_name,public_note,internal_note,created_at")
        .in("case_id",found.map(c=>c.id)).order("created_at",{ascending:true}).limit(120);
      if(result.error)setError(systemErrorMessage(result.error));
      else setEvents((result.data||[]) as CaseEvent[]);
    }else setEvents([]);
    setLoading(false);
  },[orderId]);
  useEffect(()=>{setCases([]);setEvents([]);setSelectedCase(null);setCreating(false);setFeedback("");void refresh();},[refresh]);

  const active=cases.some(c=>["open","in_review","approved"].includes(c.status));
  const mayCreate=canManage&&!active&&cases.length<5
    &&["paid","awaiting_payment"].includes(paymentStatus);
  const create=async(e:FormEvent)=>{
    e.preventDefault();if(!mayCreate||busy||reason.trim().length<10)return;
    setBusy(true);setError("");setFeedback("");
    const {error}=await supabase.rpc("artvideo_store_open_support_staff_v1",{
      p_order_id:orderId,p_type:kind,p_reason:reason.trim(),
    });
    if(error)setError(systemErrorMessage(error));
    else{setCreating(false);setReason("");setFeedback("Solicitação registrada.");await refresh();onChange?.();}
    setBusy(false);
  };
  const update=async()=>{
    if(!selectedCase||!next||!canManage||busy)return;
    if(["approved","rejected","closed"].includes(next) && publicNote.trim().length<10){
      setError("Escreva uma justificativa para o cliente com pelo menos 10 caracteres.");return;
    }
    setBusy(true);setError("");setFeedback("");
    const {error}=await supabase.rpc("artvideo_store_review_support_v1",{
      p_case_id:selectedCase,p_next_status:next,
      p_public_note:publicNote.trim()||null,p_internal_note:privateNote.trim()||null,
    });
    if(error)setError(systemErrorMessage(error));
    else{
      setFeedback("Atendimento atualizado. O cliente poderá acompanhar a resposta no site.");
      setSelectedCase(null);setNext("");setPublicNote("");setPrivateNote("");
      await refresh();onChange?.();
    }
    setBusy(false);
  };
  return <div className={standalone ? "space-y-4" : "rounded-lg border border-border p-4"}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h3 className="flex items-center gap-2 text-sm font-bold"><RotateCcw size={18} className="text-primary"/> Solicitações de pós-venda</h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Cancelamentos, trocas e devoluções, com parecer e histórico.
        </p>
      </div>
      {mayCreate&&!creating&&<button type="button" onClick={()=>{setCreating(true);setError("");}}
        className="inline-flex min-h-9 items-center gap-2 rounded-md border border-primary/30 bg-primary/10 px-3 text-xs font-bold text-primary hover:bg-primary/15">
        <Plus size={15}/> Nova solicitação
      </button>}
    </div>
    {error&&<p role="alert" className="mt-3 rounded-md border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-600">{error}</p>}
    {feedback&&<p role="status" className="mt-3 rounded-md border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs text-emerald-700 dark:text-emerald-300">{feedback}</p>}
    {creating&&<form onSubmit={e=>void create(e)} className="mt-4 space-y-3 rounded-lg border border-border bg-muted/30 p-4">
      <label className="block text-xs font-bold">Tipo de solicitação
        <select className={input+" mt-2"} value={kind} onChange={e=>setKind(e.target.value as CaseType)}>
          <option value="cancellation">Cancelamento</option>
          {paymentStatus==="paid"&&<><option value="exchange">Troca</option><option value="return">Devolução</option></>}
        </select>
      </label>
      <label className="block text-xs font-bold">Motivo relatado *
        <textarea className={input+" mt-2 min-h-24 resize-y"} maxLength={1200} minLength={10} required
          value={reason} onChange={e=>setReason(e.target.value)}
          placeholder="Relate o que foi informado pelo cliente..."/>
      </label>
      <p className="text-[11px] text-muted-foreground">Use para solicitações recebidas na loja ou pelo SAC. Não haverá envio automático ao WhatsApp.</p>
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={busy||reason.trim().length<10} className="rounded-md bg-primary px-4 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50">{busy?"Salvando...":"Registrar"}</button>
        <button type="button" disabled={busy} onClick={()=>setCreating(false)} className="rounded-md border border-border px-4 py-2 text-xs font-bold">Cancelar</button>
      </div>
    </form>}
    {loading?<p className="mt-5 text-xs text-muted-foreground">Consultando solicitações...</p>
    :cases.length===0?<p className="mt-4 text-xs text-muted-foreground">Este pedido não possui solicitações de pós-venda.</p>
    :<div className="mt-4 space-y-4">
      {cases.map(item=><div key={item.id} className="rounded-md border border-border bg-background p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <strong className="text-[13px]">{typeNames[item.request_type]}</strong>
          <span className={"rounded-full border px-2.5 py-1 text-[11px] font-bold " +
            STATUS_TONE_CLASSES[["approved", "closed"].includes(item.status) ? "success" : item.status === "rejected" ? "danger" : item.status === "in_review" ? "review" : "pending"].badge}>
            {statusNames[item.status]}
          </span>
        </div>
        <p className="mt-2 whitespace-pre-wrap text-xs text-muted-foreground">{item.reason}</p>
        <p className="mt-2 text-[11px] text-muted-foreground">
          {item.opened_by==="customer"?"Solicitado pelo cliente":"Registrado pela equipe"} · {new Date(item.created_at).toLocaleString("pt-BR")}
        </p>
        <div className="mt-3 space-y-3 border-t border-border pt-3">
          <h4 className="flex items-center gap-2 text-xs font-bold"><ClipboardList size={15}/> Histórico</h4>
          {events.filter(event=>event.case_id===item.id).map(event=><div key={event.id} className="border-l-2 border-primary/30 pl-3">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <strong className="text-xs">{statusNames[event.to_status]}</strong>
              <span className="text-[11px] text-muted-foreground">{new Date(event.created_at).toLocaleString("pt-BR")}</span>
            </div>
            {event.actor_name&&<p className="mt-1 text-[11px] text-muted-foreground">{event.actor_name}</p>}
            {event.public_note&&<p className="mt-1 whitespace-pre-wrap text-xs">{event.public_note}</p>}
            {event.internal_note&&<p className="mt-1 whitespace-pre-wrap rounded-md bg-muted/70 p-2 text-[11px] text-muted-foreground">
              Nota interna: {event.internal_note}
            </p>}
          </div>)}
        </div>
        {["approved","closed"].includes(item.status)&&<StoreReturnOperations
          caseId={item.id} caseType={item.request_type} caseStatus={item.status}
          items={items} orderTotal={orderTotal} canManage={canManage}
          onChange={()=>{void refresh();onChange?.();}}/>}
        {canManage&&actionNext[item.status]&&<div className="mt-4 border-t border-border pt-3">
          {selectedCase!==item.id?<button type="button" onClick={()=>{setSelectedCase(item.id);setNext(actionNext[item.status]![0].status);setPublicNote("");setPrivateNote("");}}
            className="inline-flex items-center gap-2 rounded-md border border-primary/30 px-3 py-2 text-xs font-bold text-primary hover:bg-primary/10">
            <MessageSquareText size={15}/> Analisar solicitação
          </button>:<div className="space-y-3">
            <label className="block text-xs font-bold">Próxima situação
              <select className={input+" mt-2"} value={next} onChange={e=>setNext(e.target.value as CaseStatus)}>
                {actionNext[item.status]!.map(a=><option value={a.status} key={a.status}>{a.label}</option>)}
              </select>
            </label>
            <label className="block text-xs font-bold">Resposta visível ao cliente {["approved","rejected","closed"].includes(next)?"*":"(opcional)"}
              <textarea className={input+" mt-2 min-h-20 resize-y"} value={publicNote} maxLength={1200}
                onChange={e=>setPublicNote(e.target.value)} placeholder="O cliente verá este texto no acompanhamento do pedido."/>
            </label>
            <label className="block text-xs font-bold">Observação interna (opcional)
              <textarea className={input+" mt-2 min-h-20 resize-y"} value={privateNote} maxLength={1500}
                onChange={e=>setPrivateNote(e.target.value)} placeholder="Informações reservadas à equipe."/>
            </label>
            {next==="approved"&&<p className="rounded-md border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-300">
              Aprovar esta solicitação não realiza estorno nem movimentação de estoque. O recebimento e a inspeção deverão ser registrados separadamente.
            </p>}
            {next==="closed"&&item.request_type!=="cancellation"&&<p className="rounded-md border border-amber-500/20 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-300">
              Antes de concluir, registre o recebimento e a avaliação dos produtos devolvidos. A validação também é feita no banco.
            </p>}
            <div className="flex gap-2">
              <button type="button" disabled={busy||(["approved","rejected","closed"].includes(next)&&publicNote.trim().length<10)}
                onClick={()=>void update()} className="rounded-md bg-primary px-4 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50">
                {busy?"Salvando...":"Salvar decisão"}
              </button>
              <AdminButton variant="secondary" size="sm" disabled={busy} onClick={()=>setSelectedCase(null)}>Voltar</AdminButton>
            </div>
          </div>}
        </div>}
      </div>)}
    </div>}
  </div>;
}
