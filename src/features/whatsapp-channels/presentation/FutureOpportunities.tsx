import { useEffect,useState } from "react";
import { useQuery,useQueryClient } from "@tanstack/react-query";
import { ArrowLeft,BookmarkPlus,CheckCircle2,ChevronLeft,ChevronRight,Clock3,ExternalLink,History,LoaderCircle,Search } from "lucide-react";
import { AdminButton,AdminDialog } from "@/shared/ui/admin/AdminLayout";
import { systemErrorMessage } from "@/shared/domain/error-message";
import {
  FUTURE_REASONS,FUTURE_STATUSES,futureOpportunityQueryKey,futureOpportunitiesSummary,
  listContactFutureOpportunities,listFutureOpportunities,listFutureOpportunityHistory,
  locateServiceOrder,saveFutureOpportunity,
  type FutureOpportunity,type FutureOpportunityDraft,type FutureOpportunityIdentity,type FutureOpportunityStatus,
} from "../infrastructure/future-opportunities.repository";

const inputClass="mt-1.5 min-h-10 w-full min-w-0 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-primary/10";
const dateLabel=(value:string|null|undefined)=>value?new Date(value).toLocaleString("pt-BR"):"—";
const statusClass=(status:FutureOpportunityStatus)=>({
  waiting:"bg-amber-500/10 text-amber-700 dark:text-amber-300",
  available:"bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  contacted:"bg-blue-500/10 text-blue-700 dark:text-blue-300",
  converted:"bg-primary/10 text-primary",
  lost:"bg-muted text-muted-foreground",
})[status];

function OpportunityStatusTag({status}:{status:FutureOpportunityStatus}){
  return <span className={"inline-flex rounded-md px-2 py-1 text-[11px] font-semibold "+statusClass(status)}>
    {FUTURE_STATUSES[status]}
  </span>;
}

const emptyDraft:FutureOpportunityDraft={
  equipment_type:"",service_interest:"",reason:"service_unavailable",
  notes:"",status:"waiting",consent_to_contact:false,consent_source:"manual_whatsapp",service_order_id:null,
};
export function FutureOpportunityEditor({identity,initial,onClose,onSaved}:{
  identity:FutureOpportunityIdentity;initial?:FutureOpportunity|null;onClose:()=>void;onSaved?:()=>void;
}){
  const [draft,setDraft]=useState<FutureOpportunityDraft>(()=>initial?{
    equipment_type:initial.equipment_type,service_interest:initial.service_interest,reason:initial.reason,
    notes:initial.notes,status:initial.status,consent_to_contact:initial.consent_to_contact,
    consent_source:initial.consent_source,service_order_id:initial.service_order_id,
  }:emptyDraft);
  const [saving,setSaving]=useState(false);
  const [error,setError]=useState("");
  const [osNumber,setOsNumber]=useState("");
  const [orderName,setOrderName]=useState("");
  const [orderLoading,setOrderLoading]=useState(false);
  const client=useQueryClient();
  const history=useQuery({
    queryKey:[...futureOpportunityQueryKey(identity.organization_id),"history",initial?.id],
    queryFn:()=>listFutureOpportunityHistory(identity.organization_id,initial!.id),
    enabled:Boolean(initial?.id),
    staleTime:60_000,refetchOnWindowFocus:false,retry:false,
  });
  const update=<K extends keyof FutureOpportunityDraft>(key:K,value:FutureOpportunityDraft[K])=>
    setDraft(previous=>({...previous,[key]:value}));
  const findOrder=async()=>{
    if(!osNumber.trim()||orderLoading)return;
    setOrderLoading(true);setError("");
    try{
      const order=await locateServiceOrder(identity.organization_id,osNumber);
      if(!order){setError("Nenhuma OS encontrada com esse número nesta empresa.");return;}
      setOrderName("OS "+order.os_number);
      setDraft(current=>({...current,service_order_id:order.id,status:"converted"}));
    }catch(reason){setError(systemErrorMessage(reason,"Falha ao localizar OS."));}
    finally{setOrderLoading(false);}
  };
  const save=async()=>{
    if(saving)return;
    if(draft.service_interest.trim().length<2){setError("Informe o serviço procurado pelo cliente.");return;}
    if(draft.status==="converted"&&!draft.service_order_id){
      setError("Para marcar como convertida, vincule uma OS existente ou crie uma nova OS pela lista.");return;
    }
    setSaving(true);setError("");
    try{
      await saveFutureOpportunity(identity,draft,initial?.id);
      await client.invalidateQueries({queryKey:futureOpportunityQueryKey(identity.organization_id)});
      void client.invalidateQueries({queryKey:["dashboard","future-opportunities",identity.organization_id]});
      onSaved?.();onClose();
    }catch(reason){setError(systemErrorMessage(reason,"Não foi possível registrar a oportunidade."));}
    finally{setSaving(false);}
  };
  return <AdminDialog open onClose={onClose}
    title={initial?"Editar oportunidade futura":"Registrar oportunidade futura"}
    description="O interesse permanece vinculado ao contato, mesmo após finalizar a conversa."
    className="w-full max-w-xl"
    footer={<div className="flex justify-end gap-2">
      <AdminButton variant="secondary" onClick={onClose} disabled={saving}>Cancelar</AdminButton>
      <AdminButton onClick={()=>void save()} disabled={saving||!draft.service_interest.trim()}>
        {saving?<LoaderCircle size={16} className="animate-spin"/>:<BookmarkPlus size={16}/>}
        {saving?"Salvando...":"Salvar oportunidade"}
      </AdminButton>
    </div>}>
    <div className="max-h-[min(72dvh,740px)] space-y-4 overflow-y-auto p-0.5">
      <div className="rounded-lg border border-border bg-muted/30 px-3 py-2.5">
        <p className="text-[11px] font-semibold text-muted-foreground">Contato</p>
        <p className="text-sm font-bold">{initial?.contact_name||identity.contact_name||"Contato WhatsApp"}</p>
        <p className="text-xs text-muted-foreground">O registro não reabre protocolos nem cria OS automaticamente.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="min-w-0 text-xs font-semibold">Tipo de equipamento (opcional)
          <input className={inputClass} maxLength={160} value={draft.equipment_type}
            onChange={e=>update("equipment_type",e.target.value)}
            placeholder="Ex.: máquina de lavar"/>
        </label>
        <label className="min-w-0 text-xs font-semibold">Motivo do não atendimento
          <select className={inputClass} value={draft.reason}
            onChange={e=>update("reason",e.target.value as FutureOpportunityDraft["reason"])}>
            {Object.entries(FUTURE_REASONS).map(([key,label])=><option key={key} value={key}>{label}</option>)}
          </select>
        </label>
      </div>
      <label className="block text-xs font-semibold">Serviço de interesse *
        <input className={inputClass} maxLength={180} value={draft.service_interest}
          onChange={e=>update("service_interest",e.target.value)}
          placeholder="Ex.: manutenção de placa eletrônica"/>
      </label>
      <label className="block text-xs font-semibold">Observações
        <textarea className={inputClass+" min-h-20 resize-y"} maxLength={2000} value={draft.notes}
          onChange={e=>update("notes",e.target.value)}
          placeholder="O que o cliente perguntou e informações importantes"/>
      </label>
      <div className="rounded-lg border border-border p-3">
        <label className="flex cursor-pointer items-start gap-2 text-sm">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-primary" checked={draft.consent_to_contact}
            onChange={e=>update("consent_to_contact",e.target.checked)}/>
          <span>
            <span className="block font-semibold">Cliente autorizou contato futuro sobre esse serviço</span>
            <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
              Marque somente quando houver autorização real. Não envia nenhuma mensagem automaticamente.
            </span>
          </span>
        </label>
        {draft.consent_to_contact&&<label className="mt-3 block text-xs font-semibold">
          Autorização recebida por
          <select className={inputClass} value={draft.consent_source}
            onChange={e=>update("consent_source",e.target.value as FutureOpportunityDraft["consent_source"])}>
            <option value="manual_whatsapp">WhatsApp</option>
            <option value="manual_in_person">Presencial / telefone</option>
            <option value="other">Outro meio</option>
          </select>
        </label>}
      </div>
      {initial&&<div className="space-y-3 border-t border-border pt-3">
        <label className="block text-xs font-semibold">Situação da oportunidade
          <select className={inputClass} value={draft.status}
            onChange={e=>update("status",e.target.value as FutureOpportunityStatus)}>
            {Object.entries(FUTURE_STATUSES).map(([key,label])=><option key={key} value={key}>{label}</option>)}
          </select>
        </label>
        <div className="space-y-2 rounded-lg border border-border p-3">
          <p className="text-xs font-bold">Vincular uma OS existente</p>
          {draft.service_order_id&&<p className="text-xs text-emerald-700 dark:text-emerald-300">
            Vinculada: {orderName||"OS selecionada"}
            <button type="button" className="ml-2 font-semibold underline"
              onClick={()=>{update("service_order_id",null);setOrderName("");}}>Desvincular</button>
          </p>}
          <div className="flex min-w-0 gap-2">
            <input className={inputClass+" !mt-0 flex-1"} aria-label="Número da OS"
              value={osNumber} onChange={e=>setOsNumber(e.target.value)} placeholder="Número exato da OS"/>
            <AdminButton variant="secondary" disabled={!osNumber.trim()||orderLoading}
              onClick={()=>void findOrder()}>{orderLoading?"Buscando...":"Localizar"}</AdminButton>
          </div>
          <p className="text-[11px] text-muted-foreground">Vincular a OS marca a oportunidade como convertida, com registro de histórico.</p>
        </div>
        <div className="space-y-1 rounded-lg border border-border p-3">
          <p className="flex items-center gap-2 text-xs font-bold"><History size={14}/> Histórico da oportunidade</p>
          {history.isLoading?<p className="text-xs text-muted-foreground">Carregando histórico...</p>
            :history.isError?<p className="text-xs text-destructive">Histórico indisponível.</p>
            :history.data?.map(row=><div key={row.id} className="flex justify-between gap-3 border-b border-border/50 py-1 text-xs">
              <span>{row.action==="created"?"Criada":row.action==="status"?"Situação alterada":row.action==="consent"?"Autorização alterada":"Dados atualizados"}</span>
              <span className="shrink-0 text-muted-foreground">{dateLabel(row.created_at)}</span>
            </div>)}
        </div>
      </div>}
      {error&&<p role="alert" className="rounded-lg border border-destructive/25 bg-destructive/5 p-2 text-xs text-destructive">{error}</p>}
    </div>
  </AdminDialog>;
}

export function FutureOpportunityContactSection({identity,canEdit=true}:{
  identity:FutureOpportunityIdentity;canEdit?:boolean;
}){
  const [editing,setEditing]=useState<FutureOpportunity|"new"|null>(null);
  const list=useQuery({
    queryKey:[...futureOpportunityQueryKey(identity.organization_id),"contact",identity.channel_id,identity.account_phone,identity.chat_jid],
    queryFn:()=>listContactFutureOpportunities(identity),
    staleTime:45_000,refetchOnWindowFocus:false,retry:false,
  });
  return <section className="min-w-0 border-b border-border px-4 py-4" aria-label="Oportunidades futuras do contato">
    <div className="flex items-center justify-between gap-2">
      <h3 className="flex min-w-0 items-center gap-2 text-sm font-bold">
        <BookmarkPlus size={17} className="text-primary"/> Oportunidades futuras
        {!!list.data?.length&&<span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] tabular-nums">{list.data.length}</span>}
      </h3>
      {canEdit&&<button type="button" onClick={()=>setEditing("new")}
        className="shrink-0 rounded-lg border border-primary/25 bg-primary/10 px-2.5 py-1.5 text-xs font-semibold text-primary hover:bg-primary/15">
        + Registrar
      </button>}
    </div>
    {list.isPending?<p className="mt-3 text-xs text-muted-foreground">Consultando interesses do contato...</p>
      :list.isError?<p role="alert" className="mt-3 text-xs text-destructive">
        {systemErrorMessage(list.error,"Não foi possível consultar as oportunidades.")}
      </p>:!list.data?.length?
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        Nenhum interesse registrado. Guarde aqui serviços e equipamentos que o cliente gostaria de contratar futuramente.
      </p>:<div className="mt-3 space-y-2">
        {list.data.map(item=><button key={item.id} type="button"
          onClick={()=>canEdit&&setEditing(item)} disabled={!canEdit}
          className="block w-full rounded-lg border border-border bg-card p-3 text-left hover:border-primary/30 disabled:cursor-default">
          <div className="flex items-center justify-between gap-2">
            <span className="min-w-0 truncate text-xs font-bold">{item.service_interest}</span>
            <OpportunityStatusTag status={item.status}/>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {item.equipment_type||"Equipamento não informado"} · {dateLabel(item.created_at)}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {item.consent_to_contact?"Autorizou contato futuro":"Sem autorização para contato comercial"}
          </p>
        </button>)}
        {list.data.length===50&&<p className="text-[11px] text-muted-foreground">
          Mostrando as 50 oportunidades mais recentes deste contato.
        </p>}
      </div>}
    {editing&&<FutureOpportunityEditor key={editing==="new"?"new":editing.id}
      identity={identity} initial={editing==="new"?null:editing} onClose={()=>setEditing(null)}/>}
  </section>;
}

export function FutureOpportunitiesWorkspace({organizationId,onClose,onOpenConversation,onNewOrder,canEdit,modal=false}:{
  organizationId:string;onClose:()=>void;onOpenConversation:(id:string)=>void;
  onNewOrder?:(item:FutureOpportunity)=>void;canEdit:boolean;modal?:boolean;
}){
  const [status,setStatus]=useState<FutureOpportunityStatus|"all">("all");
  const [search,setSearch]=useState("");
  const [delayed,setDelayed]=useState("");
  const [page,setPage]=useState(0);
  const [editing,setEditing]=useState<FutureOpportunity|null>(null);
  useEffect(()=>{
    const timeout=window.setTimeout(()=>setDelayed(search),300);
    return()=>window.clearTimeout(timeout);
  },[search]);
  const list=useQuery({
    queryKey:[...futureOpportunityQueryKey(organizationId),"list",status,page,delayed],
    queryFn:()=>listFutureOpportunities(organizationId,{status,page,search:delayed}),
    staleTime:45_000,refetchOnWindowFocus:false,retry:false,
  });
  const summary=useQuery({
    queryKey:[...futureOpportunityQueryKey(organizationId),"summary"],
    queryFn:()=>futureOpportunitiesSummary(organizationId),
    staleTime:90_000,refetchOnWindowFocus:false,retry:false,
  });
  const count=summary.data;
  const content=<div className={modal?"space-y-4":"min-h-[480px] space-y-4 rounded-xl border border-border bg-card p-4 sm:p-5"}
    aria-label="Oportunidades futuras dos atendimentos">
    {!modal&&<div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h2 className="text-lg font-bold">Oportunidades futuras</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Interesses salvos nos contatos. A finalização do atendimento não remove o registro.
        </p>
      </div>
      <AdminButton variant="secondary" onClick={onClose}><ArrowLeft size={16}/> Voltar às conversas</AdminButton>
    </div>}
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {([
        ["waiting","Aguardando",Clock3],
        ["available","Serviço disponível",CheckCircle2],
        ["contacted","Contatados",ExternalLink],
        ["converted","Convertidos",BookmarkPlus],
      ] as const).map(([key,label,Icon])=><button key={key} type="button" onClick={()=>{setStatus(key);setPage(0);}}
        className={"rounded-xl border p-3 text-left transition-colors hover:border-primary/40 "+(status===key?"border-primary/40 bg-primary/5":"border-border")}>
        <span className="flex items-center gap-2 text-xs text-muted-foreground"><Icon size={15}/>{label}</span>
        <span className="mt-1 block text-xl font-black tabular-nums">{count?count[key]:"—"}</span>
      </button>)}
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <label className="relative min-w-[200px] flex-1">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"/>
        <input value={search} onChange={e=>{setSearch(e.target.value);setPage(0);}} aria-label="Buscar oportunidades"
          placeholder="Buscar cliente, aparelho ou serviço"
          className="h-10 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm outline-none focus:border-primary"/>
      </label>
      <select value={status} onChange={e=>{setStatus(e.target.value as FutureOpportunityStatus|"all");setPage(0);}}
        aria-label="Filtrar oportunidades por situação"
        className="h-10 rounded-lg border border-border bg-background px-3 text-xs font-semibold">
        <option value="all">Todas as situações</option>
        {Object.entries(FUTURE_STATUSES).map(([key,label])=><option value={key} key={key}>{label}</option>)}
      </select>
    </div>
    {list.isPending?<div className="flex justify-center py-16"><LoaderCircle size={26} className="animate-spin text-primary"/></div>:
      list.isError?<div role="alert" className="rounded-lg border border-destructive/30 p-4 text-sm text-destructive">
        {systemErrorMessage(list.error,"Não foi possível consultar oportunidades.")}
      </div>:!list.data?.items.length?<p className="py-16 text-center text-sm text-muted-foreground">Nenhuma oportunidade encontrada.</p>:
      <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
        {list.data.items.map(item=><div key={item.id} className="flex flex-wrap items-center justify-between gap-3 p-3 hover:bg-muted/30 sm:p-4">
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-bold">{item.contact_name}</span>
              <OpportunityStatusTag status={item.status}/>
            </div>
            <p className="text-xs font-semibold">{item.equipment_type?item.equipment_type+" · ":""}{item.service_interest}</p>
            <p className="text-[11px] text-muted-foreground">
              {FUTURE_REASONS[item.reason]} · {dateLabel(item.created_at)} · {item.consent_to_contact?"Contato autorizado":"Sem autorização comercial"}
            </p>
          </div>
          <div className="flex gap-2">
            {item.conversation_id&&<AdminButton size="sm" variant="secondary"
              onClick={()=>onOpenConversation(item.conversation_id!)}>
              <ExternalLink size={14}/> Abrir conversa
            </AdminButton>}
            {canEdit&&onNewOrder&&item.status!=="converted"&&
              <AdminButton size="sm" variant="secondary" onClick={()=>onNewOrder(item)}>
                <BookmarkPlus size={14}/> Nova OS
              </AdminButton>}
            {canEdit&&<AdminButton size="sm" variant="secondary" onClick={()=>setEditing(item)}>Detalhes</AdminButton>}
          </div>
        </div>)}
      </div>}
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
      <span>{list.data?Math.min(page*25+1,list.data.total):0}–{list.data?Math.min((page+1)*25,list.data.total):0} de {list.data?.total||0} oportunidades</span>
      <div className="flex gap-2">
        <AdminButton variant="secondary" size="sm" disabled={page===0||list.isFetching}
          onClick={()=>setPage(value=>Math.max(0,value-1))}><ChevronLeft size={14}/> Anterior</AdminButton>
        <AdminButton variant="secondary" size="sm" disabled={!list.data||(page+1)*25>=list.data.total||list.isFetching}
          onClick={()=>setPage(value=>value+1)}>Próxima <ChevronRight size={14}/></AdminButton>
      </div>
    </div>
  </div>;
  return <>{modal?<AdminDialog open onClose={onClose} title="Oportunidades futuras" description="Interesses salvos nos contatos" className="max-w-5xl" draggable floating footer={<div className="flex w-full justify-end"><AdminButton variant="secondary" onClick={onClose}>Fechar</AdminButton></div>}>{content}</AdminDialog>:content}{editing&&<FutureOpportunityEditor key={editing.id} identity={editing} initial={editing} onClose={()=>setEditing(null)}/>}</>;
}
