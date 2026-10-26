import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import {
  ArrowRight, CalendarDays, ClipboardList, MapPin, MessageCircle, Wrench,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import {
  AdminButton, AdminDialog, AdminPage, AdminStickyToolbar, BtnSecondary, Section,
} from "@/shared/ui/admin/AdminLayout";
import { LoadingState, StatusBadge, Toast } from "@/shared/ui/admin/AdminFeedback";
import { formatCurrency, formatDateTime, formatCpf, formatCnpj, formatPhone } from "@/shared/domain/formatters";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { adminPath } from "@/features/admin-shell/admin-routes";
import { initialOrderStatus } from "@/features/orders/domain/order-status";
import {
  advanceSiteQuote,createServiceOrderFromQuote,findServiceOrderByQuote,
  getQuote,listOrderStatuses,listSiteQuoteWorkflowEvents,
  type SiteQuoteAction,type SiteQuoteWorkflowEvent,
} from "../infrastructure/quotes.repository";
import { parseQuoteRequestMessage,quoteRequestAddress,quoteAddressLabel } from "../domain/quote-request-details.mjs";
import { QuoteSacDigitalDialog } from "./QuoteSacDigitalDialog";

type ActionConfig = { id:SiteQuoteAction; label:string; variant?:"primary"|"secondary"|"tertiary"|"danger"|"success"; needsNote?:boolean };
const repairActions:Record<string,ActionConfig[]> = {
  PENDENTE:[
    {id:"await_dropoff",label:"Aguardar entrega na loja"},
    {id:"request_collection",label:"Registrar solicitação de coleta",variant:"tertiary"},
  ],
  AGUARDANDO_ENTREGA:[{id:"receive_equipment",label:"Confirmar recebimento",needsNote:true}],
  COLETA_PENDENTE:[{id:"schedule_collection",label:"Confirmar agendamento da coleta",needsNote:true}],
  COLETA_AGENDADA:[{id:"receive_equipment",label:"Confirmar recebimento",needsNote:true}],
};
const serviceActions:Record<string,ActionConfig[]> = {
  PENDENTE:[{id:"start_analysis",label:"Iniciar análise"}],
  EM_ANALISE:[
    {id:"prepare_offer",label:"Preparar proposta"},
    {id:"need_info",label:"Solicitar informações",variant:"tertiary",needsNote:true},
  ],
  AGUARDANDO_CLIENTE:[{id:"resume_analysis",label:"Retomar análise"}],
  PROPOSTA_PREPARADA:[
    {id:"record_sent",label:"Registrar envio da proposta",needsNote:true},
    {id:"edit_offer",label:"Editar proposta",variant:"tertiary"},
  ],
  PROPOSTA_ENVIADA:[
    {id:"record_acceptance",label:"Registrar aceite do cliente",needsNote:true},
    {id:"reopen_offer",label:"Revisar proposta",variant:"tertiary",needsNote:true},
  ],
  ACEITO_CLIENTE:[{id:"schedule_service",label:"Confirmar agendamento",needsNote:true}],
  AGENDADO:[{id:"finish_service",label:"Registrar conclusão",needsNote:true}],
};
const labels:Record<string,string>={
  PENDENTE:"Solicitação recebida",EM_ANALISE:"Em análise",AGUARDANDO_CLIENTE:"Aguardando cliente",
  AGUARDANDO_ENTREGA:"Aguardando entrega na loja",COLETA_PENDENTE:"Coleta solicitada",
  COLETA_AGENDADA:"Coleta agendada",EQUIPAMENTO_RECEBIDO:"Equipamento recebido",
  OS_VINCULADA:"Vinculada à OS",PROPOSTA_PREPARADA:"Proposta preparada",
  PROPOSTA_ENVIADA:"Proposta enviada",ACEITO_CLIENTE:"Aceite confirmado",
  AGENDADO:"Agendamento confirmado",CONCLUIDO:"Concluído",ENCERRADA:"Encerrada",
  CANCELADO:"Cancelado",APROVADO:"Aprovado (histórico)",REPROVADO:"Reprovado (histórico)",
};
const repairStages=["PENDENTE","AGUARDANDO_ENTREGA","EQUIPAMENTO_RECEBIDO","OS_VINCULADA"];
const collectionStages=["PENDENTE","COLETA_PENDENTE","COLETA_AGENDADA","EQUIPAMENTO_RECEBIDO","OS_VINCULADA"];
const serviceStages=["PENDENTE","EM_ANALISE","PROPOSTA_PREPARADA","PROPOSTA_ENVIADA","ACEITO_CLIENTE","AGENDADO","CONCLUIDO"];
function DetailField({label,value}:{label:string;value?:unknown}){
  if(value===null||value===undefined||String(value).trim()==="")return null;
  return <div className="min-w-0">
    <p className="text-[11px] font-semibold text-muted-foreground">{label}</p>
    <p className="mt-1 break-words whitespace-pre-wrap text-sm font-medium text-foreground">{String(value)}</p>
  </div>;
}
export function SiteQuoteDetailsPage({quoteId,onBack}:{
  quoteId:string;onBack:()=>void;
}){
  const navigate=useNavigate();
  const {activeOrganizationId,hasPermission}=useAuth();
  const organizationId=activeOrganizationId||"";
  const canView=hasPermission("quotes.details.view");
  const canUpdate=hasPermission("quotes.status.change");
  const canCreateOrder=hasPermission("quotes.convert_to_order");
  const canMessage=hasPermission("sac_digital.messages.send");
  const [quote,setQuote]=useState<any>(null);
  const [events,setEvents]=useState<SiteQuoteWorkflowEvent[]>([]);
  const [linkedOs,setLinkedOs]=useState<{id:string;os_number:string|null}|null>(null);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [toast,setToast]=useState<{msg:string;type:"success"|"error"}|null>(null);
  const [action,setAction]=useState<ActionConfig|null>(null);
  const [note,setNote]=useState("");
  const [price,setPrice]=useState("");
  const [description,setDescription]=useState("");
  const [sacOpen,setSacOpen]=useState(false);
  const load=useCallback(async()=>{
    if(!organizationId||!canView){setLoading(false);return;}
    try{
      const detail=await getQuote(organizationId,quoteId);
      if(!detail){setQuote(null);setError("Solicitação não encontrada.");return;}
      const [history,order]=await Promise.all([
        listSiteQuoteWorkflowEvents(organizationId,quoteId),
        findServiceOrderByQuote(organizationId,quoteId),
      ]);
      if(order.error)throw order.error;
      setQuote(detail);setEvents(history);
      setLinkedOs(order.data as {id:string;os_number:string|null}|null);
      setError("");
    }catch(cause){setError(systemErrorMessage(cause));}
    finally{setLoading(false);}
  },[organizationId,quoteId,canView]);
  useEffect(()=>{void load();},[load]);
  const status=String(quote?.request_status?.slug||"").toUpperCase();
  const repair=quote?.site_request_kind==="repair"||
    (!quote?.site_request_kind&&String(quote?.customer_message||"").includes("Tipo de solicitação: Conserto / manutenção"));
  const parsed=useMemo(()=>parseQuoteRequestMessage(quote?.customer_message),[quote?.customer_message]);
  const address=useMemo(()=>quoteRequestAddress(quote),[quote]);
  const mapText=quoteAddressLabel(address);
  const location=address?.address;
  const zipDigits=String(location?.zip_code||parsed.repairPostalCode||"").replace(/\D/g,"");
  const zipLabel=zipDigits.length===8?`${zipDigits.slice(0,5)}-${zipDigits.slice(5)}`:zipDigits;
  const report=String(quote?.issue_reported||parsed.issue||"").trim();
  const customerNotes=String(parsed.notes||"").trim();
  const hasCustomerReport=Boolean(report||customerNotes);
  const collecting=parsed.repairLocation.toLowerCase().includes("colet")||
    ["COLETA_PENDENTE","COLETA_AGENDADA"].includes(status);
  const stages=repair?(collecting?collectionStages:repairStages):serviceStages;
  const currentIndex=stages.indexOf(status);
  const requestedMode=parsed.repairLocation.toLowerCase();
  const actionOptions=repair
    ? (repairActions[status]||[]).filter(option=>status!=="PENDENTE"||
      (!requestedMode.includes("colet")&& !requestedMode.includes("loja"))||
      (requestedMode.includes("colet")&&option.id==="request_collection")||
      (requestedMode.includes("loja")&&option.id==="await_dropoff"))
    : (serviceActions[status]||[]);
  const finished=["CONCLUIDO","OS_VINCULADA","ENCERRADA","CANCELADO"].includes(status);
  const contactDigits=String(quote?.customer?.whatsapp||quote?.customer?.phone||"").replace(/\D/g,"");
  const mayMessage=canMessage&&Boolean(quote?.customer_id&&contactDigits);
  const choose=(option:ActionConfig)=>{
    setAction(option);setNote("");
    setPrice(quote?.final_price==null?"":String(quote.final_price));
    setDescription(String(quote?.proposed_solution||""));
    setError("");
  };
  const perform=async()=>{
    if(!quote||!action||busy)return;
    setBusy(true);setError("");
    try{
      const isOffer=action.id==="prepare_offer"||action.id==="edit_offer";
      await advanceSiteQuote(quote.id,status,action.id,{
        note,price:isOffer?Number(price):undefined,
        description:isOffer?description:undefined,
      });
      setAction(null);setNote("");
      await load();
      setToast({msg:"Situação atualizada e registrada no histórico.",type:"success"});
    }catch(cause){setError(systemErrorMessage(cause));}
    finally{setBusy(false);}
  };
  const createOs=async()=>{
    if(!quote||busy||!canCreateOrder)return;
    setBusy(true);setError("");
    try{
      const existing=await findServiceOrderByQuote(organizationId,quote.id);
      if(existing.error)throw existing.error;
      if(existing.data){
        if(repair&&status==="EQUIPAMENTO_RECEBIDO")
          await advanceSiteQuote(quote.id,status,"link_os");
        navigate(adminPath("orders",existing.data.id));return;
      }
      const states=await listOrderStatuses(organizationId);
      if(states.error)throw states.error;
      const initial=initialOrderStatus(states.data||[]);
      if(!initial?.id)throw new Error("Situação inicial da OS não configurada.");
      const inserted=await createServiceOrderFromQuote(organizationId,{
        service_id:quote.service_id,quote_request_id:quote.id,
        customer_id:quote.customer_id,status_id:initial.id,
        situation_id:null,customer_notes:quote.customer_message||null,
      });
      if(inserted.error)throw inserted.error;
      const linked=await findServiceOrderByQuote(organizationId,quote.id);
      if(linked.error)throw linked.error;
      if(repair&&status==="EQUIPAMENTO_RECEBIDO")
        await advanceSiteQuote(quote.id,status,"link_os");
      await load();
      if(linked.data?.id)navigate(adminPath("orders",linked.data.id));
      else setToast({msg:"OS criada e vinculada. Consulte a lista de ordens de serviço.",type:"success"});
    }catch(cause){setError(systemErrorMessage(cause));}
    finally{setBusy(false);}
  };
  const pageTitle=quote?.protocol||"Orçamento do site";
  return <AdminPage open onClose={onBack} breadcrumb="Site > Solicitações > Orçamentos"
    title={pageTitle} titleVariant="order-number"
    subtitle={repair?"Solicitação de conserto de equipamento":"Solicitação de serviço"}
    maxW="max-w-[1440px]" smoothMotion={false}>
    {toast&&<Toast message={toast.msg} type={toast.type} onClose={()=>setToast(null)}/>}
    {loading?<LoadingState text="Carregando solicitação..."/>:!quote||!canView?
      <Section title="Solicitação indisponível"><p className="text-sm text-muted-foreground">{error||"Você não tem permissão para visualizar."}</p></Section>:
      <div className="space-y-5 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
              {repair?<Wrench size={20}/>:<CalendarDays size={20}/>}
            </span>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">{repair?"Conserto · "+(collecting?"Coleta":"Entrega na loja"):"Serviço no endereço do cliente"}</p>
              <p className="text-sm font-semibold">{(quote.service as any)?.title||parsed.equipment||parsed.service||"Solicitação recebida"}</p>
            </div>
          </div>
          <StatusBadge status={labels[status]||quote?.request_status?.name||"Recebida"} color={quote?.request_status?.color}/>
        </div>
        {!finished&&currentIndex>=0&&<Section title="Andamento da solicitação" description="Etapas conforme o tipo de atendimento. A aprovação do conserto pertence à OS.">
          <div className={"grid gap-1.5 "+(stages.length<=4?"grid-cols-4":stages.length===5?"grid-cols-5":"grid-cols-7")}>
            {stages.map((step,index)=><div key={step} className="min-w-0">
              <div className={"h-2 rounded-full "+(index<=currentIndex?"bg-primary":"bg-muted")}/>
              <p className={"mt-2 break-words text-[10px] leading-tight "+(index<=currentIndex?"font-bold text-primary":"text-muted-foreground")}>{labels[step]}</p>
            </div>)}
          </div>
        </Section>}
        <div className="grid min-w-0 gap-4 lg:grid-cols-2">
          <Section title="Cliente"
            actions={mayMessage?<AdminButton variant="success" size="sm"
              onClick={()=>setSacOpen(true)} aria-label="Abrir conversa no WhatsApp com o cliente"
              title="Abrir conversa no WhatsApp">
              <MessageCircle size={16}/> WhatsApp
            </AdminButton>:undefined}>
            <div className="grid gap-3 sm:grid-cols-2">
              <DetailField label="Nome" value={quote.customer?.full_name||quote.customer?.trade_name}/>
              <DetailField label="Tipo" value={quote.customer?.customer_type==="PJ"?"Pessoa jurídica":"Pessoa física"}/>
              <DetailField label="CPF/CNPJ" value={quote.customer?.customer_type==="PJ"?
                (quote.customer?.cnpj?formatCnpj(quote.customer.cnpj):null):
                (quote.customer?.document?formatCpf(quote.customer.document):null)}/>
              <DetailField label="Telefone" value={formatPhone(quote.customer?.phone)}/>
              <DetailField label="WhatsApp" value={formatPhone(quote.customer?.whatsapp)}/>
              <DetailField label="E-mail" value={quote.customer?.email}/>
            </div>
          </Section>
          <Section title={repair?"Equipamento e modalidade":"Serviço solicitado"}
            description={repair?"Conserto: a solicitação não é uma aprovação de orçamento técnico.":"O horário informado pelo cliente é uma preferência, até confirmação da equipe."}>
            <div className="grid gap-3 sm:grid-cols-2">
              <DetailField label={repair?"Equipamento":"Serviço"} value={repair?parsed.equipment:((quote.service as any)?.title||parsed.service)}/>
              <DetailField label="Marca" value={(quote.brand as any)?.name||parsed.brand}/>
              <DetailField label="Modelo" value={parsed.model}/>
              <DetailField label="Opção" value={parsed.option}/>
              <DetailField label="Quantidade" value={parsed.quantity}/>
              <DetailField label="Preferência de atendimento" value={parsed.schedule}/>
              <DetailField label="Modalidade" value={parsed.repairLocation}/>
              <DetailField label="Recebido em" value={formatDateTime(quote.created_at)}/>
            </div>
          </Section>
        </div>
        <div className={hasCustomerReport?"grid min-w-0 gap-4 lg:grid-cols-2":"min-w-0"}>
          <Section title={repair?"Entrega / coleta":"Local de atendimento"}
            actions={mapText?<AdminButton variant="tertiary" size="sm"
              onClick={()=>window.open("https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(mapText),"_blank","noopener,noreferrer")}
              aria-label="Abrir local de atendimento no Google Maps" title="Abrir no Google Maps">
              <MapPin size={16}/> Mapa
            </AdminButton>:undefined}>
            {location&&(location.street||location.number||location.neighborhood||location.city||location.state||zipLabel||location.text)
              ? <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  <DetailField label="CEP" value={zipLabel}/>
                  <DetailField label="Rua / Avenida" value={location.street}/>
                  <DetailField label="Número" value={location.number}/>
                  <DetailField label="Complemento" value={location.complement}/>
                  <DetailField label="Bairro" value={location.neighborhood}/>
                  <DetailField label="Cidade" value={location.city}/>
                  <DetailField label="Estado" value={location.state}/>
                  {location.text&&!location.street&&<DetailField label="Endereço informado" value={location.text}/>}
                </div>
              : <p className="text-sm text-muted-foreground">{repair&&!collecting?
                  "O cliente escolheu levar o equipamento à loja.":"Endereço não informado."}</p>}
            {repair&&collecting&&<p className="mt-3 text-xs text-muted-foreground">
              A coleta deverá ser confirmada com o cliente. Nenhuma taxa é cobrada automaticamente nesta etapa.
            </p>}
          </Section>
          {hasCustomerReport&&<Section title="Relato do cliente">
            <div className="space-y-3">
              <DetailField label={repair?"Problema relatado":"Descrição informada"} value={report}/>
              <DetailField label="Observações adicionais" value={customerNotes}/>
            </div>
          </Section>}
        </div>
        {!repair&&["PROPOSTA_PREPARADA","PROPOSTA_ENVIADA","ACEITO_CLIENTE","AGENDADO","CONCLUIDO"].includes(status)&&
          <Section title="Proposta comercial" description="Somente o aceite informado pelo cliente autoriza o avanço.">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><p className="text-xs text-muted-foreground">Valor da proposta</p>
                <p className="text-xl font-bold">{quote.final_price==null?"Não informado":formatCurrency(Number(quote.final_price))}</p></div>
              <StatusBadge status={labels[status]||status} color={quote.request_status?.color}/>
            </div>
            {quote.proposed_solution&&<p className="mt-3 whitespace-pre-wrap text-sm">{quote.proposed_solution}</p>}
          </Section>}
        {linkedOs&&<Section title="Ordem de serviço vinculada">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-semibold">{linkedOs.os_number||"OS vinculada"}</p>
            <AdminButton variant="tertiary" size="sm" onClick={()=>navigate(adminPath("orders",linkedOs.id))}>Abrir OS <ArrowRight size={15}/></AdminButton>
          </div>
        </Section>}
        <Section title="Histórico" description="Todas as mudanças ficam associadas ao protocolo original.">
          {!events.length?<p className="text-sm text-muted-foreground">Solicitação recebida em {formatDateTime(quote.created_at)}. Nenhuma movimentação adicional.</p>:
          <ol className="space-y-3">
            {events.map(event=><li key={event.id} className="border-l-2 border-primary/30 pl-3">
              <p className="text-sm font-semibold">{labels[event.to_status]||event.to_status}</p>
              <p className="text-xs text-muted-foreground">{formatDateTime(event.created_at)}</p>
              {event.note&&<p className="mt-1 whitespace-pre-wrap text-xs">{event.note}</p>}
            </li>)}
          </ol>}
        </Section>
        {error&&<div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</div>}
      </div>}
    <AdminStickyToolbar className="justify-between">
      <BtnSecondary onClick={onBack} disabled={busy}>Voltar</BtnSecondary>
      {quote&&<div className="flex min-w-0 flex-wrap items-center justify-end gap-1.5 md:gap-2">
        {linkedOs&&<AdminButton variant="tertiary"
          onClick={()=>navigate(adminPath("orders",linkedOs.id))}>
          <ClipboardList size={15}/> Abrir OS
        </AdminButton>}
        {!linkedOs&&canCreateOrder&&(
          (repair&&status==="EQUIPAMENTO_RECEBIDO")||
          (!repair&&["ACEITO_CLIENTE","AGENDADO"].includes(status)))&&
          <AdminButton disabled={busy} loading={busy} onClick={()=>void createOs()}>
            Criar OS
          </AdminButton>}
        {!action&&canUpdate&&!finished&&<>
          <AdminButton variant="secondary"
            disabled={busy} onClick={()=>choose({id:"close",label:"Encerrar solicitação",needsNote:true})}>
            Encerrar
          </AdminButton>
          {actionOptions.map(option=><AdminButton key={option.id}
            variant={option.variant||"primary"} disabled={busy}
            onClick={()=>choose(option)}>
            {option.label}
          </AdminButton>)}
        </>}
      </div>}
    </AdminStickyToolbar>
    <AdminDialog open={Boolean(canUpdate&&!finished&&action)}
      onClose={()=>{if(!busy){setAction(null);setError("");}}}
      title={action?.label||"Confirmar movimentação"}
      description={
        action?.id==="start_analysis"
          ?"Ao confirmar, a solicitação passará para Em análise e a movimentação ficará registrada no histórico."
          :action?.id==="record_sent"
            ?"Registre apenas após encaminhar a proposta ao cliente; esta ação não faz o envio."
          :action?.id==="record_acceptance"
            ?"Registre como o cliente confirmou o aceite; esta ação não solicita aprovação automaticamente."
          :"Confirme a movimentação para atualizar a situação e registrar no histórico."
      }
      className="max-w-lg" minimizable={false}
      footer={<div className="flex w-full justify-end gap-2">
        <AdminButton variant="secondary" disabled={busy}
          onClick={()=>{setAction(null);setError("");}}>Cancelar</AdminButton>
        <AdminButton loading={busy} disabled={!action||busy||
          (Boolean(action?.needsNote)&&note.trim().length<10)||
          (["prepare_offer","edit_offer"].includes(action?.id||"")&&
            (price.trim()===""||!Number.isFinite(Number(price))||Number(price)<0||description.trim().length<10))}
          onClick={()=>void perform()}>
          Confirmar alteração
        </AdminButton>
      </div>}>
      <div className="space-y-4">
        {["prepare_offer","edit_offer"].includes(action?.id||"")&&<>
          <label className="block text-sm font-semibold">Valor da proposta (R$)
            <input className="mt-2 h-11 w-full rounded-lg border border-border bg-background px-3"
              type="number" min="0" max="999999.99" step="0.01"
              value={price} onChange={event=>setPrice(event.target.value)} placeholder="0,00"/>
          </label>
          <label className="block text-sm font-semibold">Descrição e condições
            <textarea className="mt-2 min-h-24 w-full resize-y rounded-lg border border-border bg-background p-3"
              maxLength={400} value={description} onChange={event=>setDescription(event.target.value)}
              placeholder="Detalhes do serviço, materiais incluídos e condições da proposta"/>
          </label>
        </>}
        {action?.needsNote&&<label className="block text-sm font-semibold">
          {action.id==="record_sent"?"Canal, data e registro do envio":
            action.id==="record_acceptance"?"Como o cliente confirmou o aceite":
            "Observação sobre a movimentação"}
          <textarea className="mt-2 min-h-20 w-full resize-y rounded-lg border border-border bg-background p-3"
            maxLength={1500} value={note} onChange={event=>setNote(event.target.value)}
            placeholder="Registre os detalhes (mínimo 10 caracteres)"/>
        </label>}
        {error&&<p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {error}
        </p>}
      </div>
    </AdminDialog>
    {sacOpen&&quote&&<QuoteSacDigitalDialog quote={quote} organizationId={organizationId} onClose={()=>setSacOpen(false)}/>}
  </AdminPage>;
}
