import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { ArrowRight, ClipboardList, MapPin, MessageCircle, Wrench } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/auth";
import { AdminButton, AdminDialog, AdminPage, AdminStickyToolbar, AdminSectionEmpty, BtnSecondary, Section } from "@/shared/ui/admin/AdminLayout";
import { LoadingState, StatusBadge, Toast } from "@/shared/ui/admin/AdminFeedback";
import { formatDateTime, formatCpf, formatCnpj, formatPhone } from "@/shared/domain/formatters";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { adminPath } from "@/features/admin-shell/admin-routes";
import { getQuote,findServiceOrderByQuote,listSiteQuoteWorkflowEvents,type SiteQuoteWorkflowEvent } from "../infrastructure/quotes.repository";
import { parseQuoteRequestMessage,quoteRequestAddress,quoteAddressLabel,quoteCustomerReport } from "../domain/quote-request-details.mjs";
import { QuoteSacDigitalDialog } from "./QuoteSacDigitalDialog";
import { SiteQuoteMediaGallery } from "./SiteQuoteMediaGallery";

const labels:Record<string,string>={
  PENDENTE:"Solicitação recebida",EM_ANALISE:"Em análise",AGUARDANDO_CLIENTE:"Aguardando cliente",
  AGUARDANDO_ENTREGA:"Aguardando entrega na loja",COLETA_PENDENTE:"Coleta solicitada",
  COLETA_AGENDADA:"Coleta agendada",EQUIPAMENTO_RECEBIDO:"Equipamento recebido",
  OS_VINCULADA:"Convertida em OS de Orçamento",PROPOSTA_PREPARADA:"Proposta preparada",
  PROPOSTA_ENVIADA:"Proposta enviada",ACEITO_CLIENTE:"Aceite registrado",
  AGENDADO:"Agendado",CONCLUIDO:"Concluído",ENCERRADA:"Encerrada",
  CANCELADO:"Cancelada",
};
function DetailField({label,value}:{label:string;value?:unknown}){
  if(value===null||value===undefined||String(value).trim()==="")return null;
  return <div className="min-w-0">
    <p className="text-[11px] font-semibold text-muted-foreground">{label}</p>
    <p className="mt-1 break-words whitespace-pre-wrap text-sm font-medium text-foreground">{String(value)}</p>
  </div>;
}

export function SiteQuoteDetailsPage({quoteId,onBack}:{quoteId:string;onBack:()=>void}){
  const navigate=useNavigate();
  const {activeOrganizationId,hasPermission}=useAuth();
  const organizationId=activeOrganizationId||"";
  const canView=hasPermission("quotes.details.view");
  const canConvert=hasPermission("quotes.convert_to_order");
  const canCancel=hasPermission("quotes.status.change");
  const canMessage=hasPermission("sac_digital.messages.send");
  const [quote,setQuote]=useState<any>(null);
  const [events,setEvents]=useState<SiteQuoteWorkflowEvent[]>([]);
  const [linkedOs,setLinkedOs]=useState<{id:string;os_number:string|null}|null>(null);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [toast,setToast]=useState<{msg:string;type:"success"|"error"}|null>(null);
  const [dialog,setDialog]=useState<"convert"|"cancel"|null>(null);
  const [sacOpen,setSacOpen]=useState(false);

  const load=useCallback(async()=>{
    if(!organizationId||!canView){setLoading(false);return;}
    try{
      const record=await getQuote(organizationId,quoteId);
      if(!record){setQuote(null);setError("Solicitação não encontrada.");return;}
      const [history,order]=await Promise.all([
        listSiteQuoteWorkflowEvents(organizationId,quoteId),
        findServiceOrderByQuote(organizationId,quoteId),
      ]);
      if(order.error)throw order.error;
      setQuote(record);setEvents(history);
      setLinkedOs(order.data as {id:string;os_number:string|null}|null);
      setError("");
    }catch(cause){setError(systemErrorMessage(cause));}
    finally{setLoading(false);}
  },[organizationId,quoteId,canView]);
  useEffect(()=>{void load();},[load]);

  const parsed=useMemo(()=>parseQuoteRequestMessage(quote?.customer_message),[quote?.customer_message]);
  const address=useMemo(()=>quoteRequestAddress(quote),[quote]);
  const mapText=quoteAddressLabel(address);
  const location=address?.address;
  const details=(quote?.service_address&&typeof quote.service_address==="object")?quote.service_address:{};
  const mode=details.attendance_mode==="store"?"store":
    details.attendance_mode==="onsite"?"onsite":
    String(parsed.repairLocation||"").toLowerCase().includes("loja")?"store":"onsite";
  const status=String(quote?.request_status?.slug||"").toUpperCase();
  const finished=["CANCELADO","ENCERRADA","CONCLUIDO","OS_VINCULADA"].includes(status);
  const report=useMemo(()=>quoteCustomerReport(quote),[quote]);
  const contactDigits=String(quote?.customer?.whatsapp||quote?.customer?.phone||"").replace(/\D/g,"");
  const mayMessage=canMessage&&Boolean(quote?.customer_id&&contactDigits);
  const zipDigits=String(location?.zip_code||"").replace(/\D/g,"");
  const zipLabel=zipDigits.length===8?zipDigits.slice(0,5)+"-"+zipDigits.slice(5):zipDigits;

  const confirm=async()=>{
    if(!quote||!dialog||busy)return;
    setBusy(true);setError("");
    try{
      if(dialog==="convert"){
        const result=await supabase.rpc("artvideo_site_quote_convert_to_os_v1",{p_quote_id:quote.id});
        if(result.error)throw result.error;
        const payload=result.data as {success?:boolean;order_id?:string;error?:string}|null;
        if(!payload?.success||!payload.order_id)throw new Error(payload?.error||"Não foi possível converter o orçamento.");
        setDialog(null);
        navigate(adminPath("orders",payload.order_id));
        return;
      }
      const result=await supabase.rpc("artvideo_site_quote_cancel_v1",{p_quote_id:quote.id});
      if(result.error)throw result.error;
      if(!result.data?.success)throw new Error(result.data?.error||"Não foi possível cancelar.");
      setDialog(null);
      await load();
      setToast({msg:"Solicitação cancelada e registrada no histórico.",type:"success"});
    }catch(cause){setError(systemErrorMessage(cause));}
    finally{setBusy(false);}
  };

  return <AdminPage open onClose={onBack} breadcrumb="Site > Solicitações > Orçamentos"
    title={quote?.protocol||"Orçamento do site"} titleVariant="order-number"
    subtitle="Solicitação de serviço recebida pelo site"
    maxW="max-w-[1440px]" smoothMotion={false}>
    {toast&&<Toast message={toast.msg} type={toast.type} onClose={()=>setToast(null)}/>}
    {loading?<LoadingState text="Carregando solicitação..."/>:
      !quote||!canView?<Section title="Solicitação indisponível">
        <p className="text-sm text-muted-foreground">{error||"Você não tem permissão para visualizar."}</p>
      </Section>:
      <div className="space-y-5 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Wrench size={20}/>
            </span>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">
                {mode==="store"?"Equipamento será entregue na loja":"Atendimento no endereço do cliente"}
              </p>
              <p className="text-sm font-semibold">
                {(quote.service as any)?.title||parsed.service||parsed.equipment||"Serviço solicitado"}
              </p>
            </div>
          </div>
          <StatusBadge status={labels[status]||quote.request_status?.name||"Recebida"} color={quote.request_status?.color}/>
        </div>

        <div className="grid min-w-0 gap-4 lg:grid-cols-2">
          <Section title="Cliente" actions={mayMessage?<AdminButton variant="success" size="sm"
            onClick={()=>setSacOpen(true)} title="Abrir conversa no WhatsApp">
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
          <Section title="Serviço e equipamento">
            <div className="grid gap-3 sm:grid-cols-2">
              <DetailField label="Serviço" value={(quote.service as any)?.title||parsed.service||parsed.equipment}/>
              <DetailField label="Modalidade" value={mode==="store"?"Levar equipamento à loja":"Atendimento no local"}/>
              <DetailField label="Marca" value={(quote.brand as any)?.name||details.equipment_brand||parsed.brand}/>
              <DetailField label="Modelo" value={details.equipment_model||parsed.model}/>
              <DetailField label="Quantidade" value={parsed.quantity}/>
              <DetailField label="Data e horário preferidos" value={mode==="onsite"?
                [details.preferred_date||"",details.preferred_slot||""].filter(Boolean).join(" · ")||parsed.schedule:null}/>
              <DetailField label="Recebido em" value={formatDateTime(quote.created_at)}/>
            </div>
          </Section>
        </div>

        <div className="grid min-w-0 gap-4 lg:grid-cols-2">
          <Section title={mode==="store"?"Local de entrega":"Local de atendimento"}
            actions={mode==="onsite"&&mapText?<AdminButton size="sm" variant="tertiary"
              onClick={()=>window.open("https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(mapText),"_blank","noopener,noreferrer")}>
              <MapPin size={15}/> Mapa
            </AdminButton>:undefined}>
            {mode==="store"?<p className="text-sm text-muted-foreground">O cliente levará o equipamento à loja. Não há agendamento nesta solicitação.</p>:
              <div className="grid gap-3 sm:grid-cols-2">
                <DetailField label="CEP" value={zipLabel}/>
                <DetailField label="Rua / Avenida" value={location?.street||details.street}/>
                <DetailField label="Número" value={location?.number||details.number}/>
                <DetailField label="Complemento" value={location?.complement||details.complement}/>
                <DetailField label="Bairro" value={location?.neighborhood||details.neighborhood}/>
                <DetailField label="Cidade / UF" value={(location?.city||details.city||"")+"/"+(location?.state||details.state||"")}/>
              </div>}
          </Section>
          <Section title="Relato do cliente">
            {report?<p className="whitespace-pre-wrap text-sm leading-6">{report}</p>:<AdminSectionEmpty>Nenhum relato informado pelo cliente.</AdminSectionEmpty>}
          </Section>
        </div>
        <SiteQuoteMediaGallery quoteId={quote.id} organizationId={organizationId}/>

        {linkedOs&&<Section title="OS de Orçamento vinculada">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-semibold">{linkedOs.os_number||"OS vinculada"}</p>
            <AdminButton variant="tertiary" size="sm" onClick={()=>navigate(adminPath("orders",linkedOs.id))}>
              Abrir OS <ArrowRight size={15}/>
            </AdminButton>
          </div>
        </Section>}
        <Section title="Histórico">
          {!events.length?<AdminSectionEmpty>Solicitação recebida em {formatDateTime(quote.created_at)}.</AdminSectionEmpty>:
            <ol className="space-y-3">{events.map(event=><li key={event.id}
              className="border-l-2 border-primary/30 pl-3">
              <p className="text-sm font-semibold">{labels[event.to_status]||event.to_status}</p>
              <p className="text-xs text-muted-foreground">{formatDateTime(event.created_at)}</p>
              {event.note&&<p className="mt-1 whitespace-pre-wrap text-xs">{event.note}</p>}
            </li>)}</ol>}
        </Section>
        {error&&<p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
      </div>}

    <AdminStickyToolbar className="justify-between">
      <BtnSecondary onClick={onBack} disabled={busy}>Voltar</BtnSecondary>
      {quote&&<div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
        {linkedOs&&<AdminButton variant="tertiary"
          onClick={()=>navigate(adminPath("orders",linkedOs.id))}>
          <ClipboardList size={15}/> Abrir OS
        </AdminButton>}
        {!linkedOs&&!finished&&canCancel&&<AdminButton variant="secondary" disabled={busy}
          onClick={()=>{setError("");setDialog("cancel");}}>Cancelar solicitação</AdminButton>}
        {!linkedOs&&!finished&&canConvert&&<AdminButton disabled={busy}
          onClick={()=>{setError("");setDialog("convert");}}>Converter em OS de Orçamento</AdminButton>}
      </div>}
    </AdminStickyToolbar>
    <AdminDialog open={Boolean(dialog)} minimizable={false} className="max-w-lg"
      onClose={()=>{if(!busy){setDialog(null);setError("");}}}
      title={dialog==="convert"?"Converter em OS de Orçamento":"Cancelar solicitação"}
      description={dialog==="convert"
        ?"Será criada uma OS de orçamento vinculada a esta solicitação, com o mesmo cliente, relato, modalidade e equipamento. O orçamento seguirá o fluxo padrão da OS."
        :"A solicitação será cancelada e o histórico será preservado. Essa ação não cria uma OS."}
      footer={<div className="flex w-full justify-end gap-2">
        <AdminButton variant="secondary" disabled={busy} onClick={()=>setDialog(null)}>Voltar</AdminButton>
        <AdminButton loading={busy} variant={dialog==="cancel"?"danger":"primary"} onClick={()=>void confirm()}>
          {dialog==="convert"?"Converter em OS":"Confirmar cancelamento"}
        </AdminButton>
      </div>}>
      {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
      <p className="text-sm text-muted-foreground">
        {dialog==="convert"?"O orçamento técnico, aprovação e renegociação serão realizados dentro da OS.":"Confirme somente se não for necessário dar continuidade à solicitação."}
      </p>
    </AdminDialog>
    {sacOpen&&quote&&<QuoteSacDigitalDialog quote={quote} organizationId={organizationId}
      onClose={()=>setSacOpen(false)}/>}
  </AdminPage>;
}
