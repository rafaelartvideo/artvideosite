import { TopTableScrollbar } from "@/shared/ui/admin/TopTableScrollbar";
import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "motion/react";
import { createPortal } from "react-dom";
import { AlertCircle, ArrowRight, CheckCircle2, History, RotateCcw, XCircle } from "lucide-react";
import { BtnPrimary, BtnSecondary, Section, AdminButton, AdminDialog } from "@/shared/ui/admin/AdminLayout";
import { FInput, FTextarea } from "@/shared/ui/admin/AdminFormControls";
import { formatCurrency } from "@/shared/domain/formatters";
import { LoadingSpinner, LoadingState, notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import { systemErrorMessage } from "@/shared/domain/error-message";
import {
  changeOrderQuote, emptyOrderQuoteDraft, readOrderPricingAfterApproval,
  readOrderQuote, reopenApprovedOrderQuote,
  type OrderQuoteDraft,type OrderQuoteProposal,
} from "../infrastructure/order-quote.repository";
import { OrderQuoteCommercialEditor } from "./OrderQuoteCommercialEditor";
import { OrderQuoteComments } from "./OrderQuoteComments";
import { OrderQuotePhotosSection } from "./OrderQuotePhotosSection";
import { OrderProductsServicesSection } from "./OrderProductsServicesSection";
import { listOrderCommercialItems, type OrderCommercialItem } from "../infrastructure/order-commercial-items.repository";
import { capitalizeSentenceStarts } from "../domain/capitalize-sentence-starts";
import { UnionQuoteAiActions, UnionQuoteAiUsage } from "./UnionQuoteAiActions";

type QuoteAction = "submit" | "approve" | "reject" | "renegotiate" | "reopen";
type ModalFeedback = { type: "success" | "error"; message: string };
const MAX_TECHNICAL_CHARS = 400;
const ACTION_TITLES: Record<QuoteAction,string> = {
  submit: "Enviar orçamento para aprovação",
  approve: "Aprovar orçamento",
  reject: "Rejeitar orçamento",
  renegotiate: "Renegociar",
  reopen: "Reabrir orçamento",
};
const ACTION_BUTTON_LABELS: Record<QuoteAction,string> = {
  submit: "Confirmar",
  approve: "Confirmar",
  reject: "Confirmar rejeição",
  renegotiate: "Confirmar renegociação",
  reopen: "Confirmar",
};
const ACTION_SUCCESS: Record<QuoteAction,string> = {
  submit: "Orçamento enviado para aprovação. A proposta permanece aguardando uma decisão.",
  approve: "Orçamento aprovado. Os serviços existentes foram preservados e vinculados à proposta, sem duplicação.",
  reject: "Orçamento rejeitado. O motivo ficou registrado e a negociação poderá ser reaberta.",
  renegotiate: "Negociação reaberta. Uma nova versão da proposta está pronta para edição.",
  reopen: "Orçamento reaberto com justificativa no histórico. Atualize os itens e envie novamente para aprovação.",
};

function snapshot(d:OrderQuoteProposal):OrderQuoteDraft {
  return {
    diagnosis:d.diagnosis||"",proposed_solution:d.proposed_solution||"",
    commercial_conditions:d.commercial_conditions||"",valid_until:d.valid_until||null,
    items:Array.isArray(d.items)?d.items:[],
    discount_type:d.discount_type==="percentage"?"percentage":"amount",
    discount_value:Number(d.discount_value||0),
  };
}
function versionPricing(version: Record<string,any>) {
  const items: any[] = Array.isArray(version.items) ? version.items : [];
  const subtotal = items.reduce((sum,item) => sum+Number(item.quantity||0)*Number(item.unit_price||0)+Number(item.additional_cost||0),0);
  const discount = version.discount_type==="percentage"
    ? subtotal*Number(version.discount_value||0)/100
    : Number(version.discount_value||0);
  return { subtotal, discount, total: Math.max(0,subtotal-discount) };
}
/** Compatibilidade um a um: preserva vínculos técnicos sem duplicar valores. */
function canReuseQuoteExecution(execution: OrderCommercialItem[], proposed: OrderQuoteProposal["items"]): boolean {
  if (!execution.length || !Array.isArray(proposed) || execution.length !== proposed.length) return false;
  const matched = new Set<string>();
  for (const item of proposed) {
    const matches = execution.filter(previous => {
      if (matched.has(previous.id) || previous.quote_proposal_id) return false;
      if (previous.item_type !== item.item_type ||
          Number(previous.quantity) !== Number(item.quantity) ||
          Number(previous.unit_price) !== Number(item.unit_price) ||
          Number(previous.additional_cost) !== Number(item.additional_cost || 0)) return false;
      if (previous.item_type === "service")
        return Boolean(previous.general_service_id) && previous.general_service_id === item.general_service_id;
      if (previous.item_type === "product")
        return Boolean(previous.inventory_item_id) && previous.inventory_item_id === item.inventory_item_id;
      return previous.title_snapshot.trim().toLocaleLowerCase("pt-BR") ===
        String(item.title_snapshot || "").trim().toLocaleLowerCase("pt-BR");
    });
    if (matches.length !== 1) return false;
    matched.add(matches[0].id);
  }
  return matched.size === execution.length;
}
export function OrderQuoteWorkspace({order,canEdit,canManagePhotos,canRemovePhotos,onPricingChange,onOverviewChange,footerHostId,onStatusChange}:{
  order:any;canEdit:boolean;canManagePhotos:boolean;canRemovePhotos:boolean;onPricingChange:(pricing:any)=>void;
  onOverviewChange?: (overview:{total:number;pending:number;inProgress:number;completed:number})=>void;
  footerHostId:string;
  onStatusChange?:(status:OrderQuoteProposal["status"])=>void;
}) {
  const queryClient = useQueryClient();
  const org=String(order?.organization_id||"");
  const orderId=String(order?.id||"");
  const quoteKey = ["orders", "quote", org, orderId] as const;
  const [proposal,setProposal]=useState<OrderQuoteProposal|null>(() =>
    queryClient.getQueryData<OrderQuoteProposal | null>(quoteKey) || null);
  const [draft,setDraft]=useState<OrderQuoteDraft>(() => {
    const cached = queryClient.getQueryData<OrderQuoteProposal | null>(quoteKey);
    return cached ? snapshot(cached) : emptyOrderQuoteDraft();
  });
  const [reason,setReason]=useState("");
  const [loading,setLoading]=useState(() =>
    !queryClient.getQueryState(["orders", "quote", org, orderId])?.dataUpdatedAt);
  const [busy,setBusy]=useState(false);
  const [footerHost,setFooterHost]=useState<HTMLElement|null>(null);
  const [confirmationAction,setConfirmationAction]=useState<QuoteAction|null>(null);
  const [modalFeedback,setModalFeedback]=useState<ModalFeedback|null>(null);
  const [executionItems,setExecutionItems]=useState<OrderCommercialItem[]>([]);
  const [executionItemsLoading,setExecutionItemsLoading]=useState(false);
  const [executionItemsError,setExecutionItemsError]=useState("");
  const submissionLocked=useRef(false);
  const approvalLookupId=useRef(0);
  const [selectedVersion,setSelectedVersion]=useState<Record<string,any>|null>(null);

  useEffect(()=>{
    setFooterHost(document.getElementById(footerHostId));
  },[footerHostId,orderId]);
  useEffect(()=>()=>{approvalLookupId.current += 1;},[]);

  useEffect(()=>{
    setConfirmationAction(null);
    setModalFeedback(null);
    approvalLookupId.current += 1;
    setExecutionItems([]);setExecutionItemsLoading(false);setExecutionItemsError("");
    submissionLocked.current=false;
  },[orderId]);

  useEffect(()=>{
    if(!org||!orderId)return;
    let active=true;
    const cached = queryClient.getQueryData<OrderQuoteProposal | null>(quoteKey);
    const hasCached = Boolean(queryClient.getQueryState(quoteKey)?.dataUpdatedAt);
    if (hasCached) {
      setProposal(cached || null);
      setDraft(cached ? snapshot(cached) : emptyOrderQuoteDraft());
    }
    setLoading(!hasCached);
    // A situação do orçamento e a aba compartilham exatamente a mesma
    // requisição: não há segundo GET ao navegar para Produtos e Serviços.
    void queryClient.fetchQuery({
      queryKey: quoteKey,
      staleTime: 120_000,
      queryFn: () => readOrderQuote(org, orderId),
    }).then(next=>{
      if(!active)return;
      setProposal(next);
      setDraft(next?snapshot(next):emptyOrderQuoteDraft());
    }).catch(err=>{if(active)notifyAdmin(systemErrorMessage(err),"error");})
      .finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[org,orderId,queryClient]);

  const renegotiations = (proposal?.versions||[])
    .filter(version=>Number(version.version)<Number(proposal?.version||1))
    .sort((a,b)=>Number(b.version)-Number(a.version));
  const canReuseExecution = canReuseQuoteExecution(executionItems, proposal?.items || []);
  const revisingApprovedQuote = Boolean(proposal?.applied_at);
  const editable=canEdit&&!order.completed_at&&!order.cancelled_at&&
    (!proposal||proposal.status==="draft"||proposal.status==="renegotiation");
  const openAction = (action: QuoteAction) => {
    if(busy || submissionLocked.current)return;
    setModalFeedback(null);
    setConfirmationAction(action);
    if(action==="approve") {
      // O conteúdo e as ações de aprovação ficam ocultos até terminar a consulta.
      const requestId=++approvalLookupId.current;
      setExecutionItems([]);setExecutionItemsError("");setExecutionItemsLoading(true);
      void listOrderCommercialItems(orderId)
        .then(items=>{
          if(approvalLookupId.current===requestId)
            setExecutionItems(items.filter(item=>item.organization_id===org));
        })
        .catch(error=>{
          if(approvalLookupId.current===requestId)
            setExecutionItemsError(systemErrorMessage(error,"Não foi possível consultar os itens existentes."));
        })
        .finally(()=>{
          if(approvalLookupId.current===requestId)setExecutionItemsLoading(false);
        });
    }
  };
  const closeAction = () => {
    if(busy || submissionLocked.current)return;
    approvalLookupId.current += 1;
    setConfirmationAction(null);
    setModalFeedback(null);
  };
  const act=async(action:QuoteAction)=>{
    if(busy || submissionLocked.current || !canEdit || confirmationAction!==action ||
      modalFeedback?.type==="success")return;
    if(action==="submit"){
      const missing: string[] = [];
      if(!draft.diagnosis.trim()) missing.push("preencha o diagnóstico");
      if(!draft.proposed_solution.trim()) missing.push("preencha a solução");
      if(!draft.items.length) missing.push("adicione pelo menos um item");
      if(missing.length){
        const instructions=missing.join(", ").replace(/, ([^,]*)$/, " e $1");
        setModalFeedback({type:"error",message:"Para encaminhar o orçamento, "+instructions+"."});
        return;
      }
    }
    if(action==="submit" && (draft.diagnosis.length>MAX_TECHNICAL_CHARS ||
      draft.proposed_solution.length>MAX_TECHNICAL_CHARS)){
      setModalFeedback({type:"error",message:"Diagnóstico e solução proposta devem ter no máximo 400 caracteres cada."});
      return;
    }
    if(action==="approve" && (executionItemsLoading || executionItemsError || (executionItems.length>0 && !revisingApprovedQuote && !canReuseExecution))){
      setModalFeedback({type:"error",message:executionItemsError||"Os itens do orçamento devem corresponder exatamente aos serviços existentes antes da aprovação."});return;
    }
    if(action==="reopen" && reason.trim().length<5){
      setModalFeedback({type:"error",message:"Informe uma justificativa com pelo menos 5 caracteres para reabrir o orçamento."});
      return;
    }
    if(action==="reject" && !reason.trim()){
      setModalFeedback({type:"error",message:"Informe o motivo da rejeição antes de confirmar."});
      return;
    }
    submissionLocked.current=true;
    setBusy(true);
    setModalFeedback(null);
    try {
      let result:OrderQuoteProposal;
      if(action==="submit"){
        await changeOrderQuote(org,orderId,"save",draft as unknown as Record<string,unknown>);
        result=await changeOrderQuote(org,orderId,"submit");
      }else if(action==="reopen"){
        result=await reopenApprovedOrderQuote(org,orderId,reason);
      }else result=await changeOrderQuote(org,orderId,action,
        action==="reject"?{reason}:
        action==="approve"?{confirmation:"CONFIRMAR_APROVACAO",version:proposal?.version,
          ...(executionItems.length?{reconcile_mode:revisingApprovedQuote?"replace":"reuse"}:{})}: {});
      queryClient.setQueryData(quoteKey, result);
      setProposal(result);
      setDraft(snapshot(result));
      onStatusChange?.(result.status);
      if(action==="approve") {
        void queryClient.invalidateQueries({queryKey:["orders","commercial-items",org,orderId]});
        try {
          const pricing=await readOrderPricingAfterApproval(org,orderId);
          onPricingChange(pricing);
        } catch (pricingError) {
          console.warn("[ORDERS] Orçamento aprovado; o resumo financeiro será atualizado na próxima leitura.",pricingError);
        }
      }
      if(action==="reject" || action==="reopen")setReason("");
      setModalFeedback({type:"success",message:action==="approve" && executionItems.length===0 ? "Orçamento aprovado. Os itens foram adicionados à execução da OS." : action==="approve" && revisingApprovedQuote ? "Nova versão aprovada. Os itens anteriores foram substituídos e o histórico preservado." : ACTION_SUCCESS[action]});
    }catch(err){
      setModalFeedback({type:"error",message:systemErrorMessage(err)});
    }finally{
      submissionLocked.current=false;
      setBusy(false);
    }
  };
  if(loading)return <LoadingState text="Carregando orçamento da OS..."/>;
  return <>
    <div className="space-y-4">
    <Section title="Diagnóstico e solução proposta">
      <div className="space-y-3">
        <FTextarea rows={4} label="Descrição do problema"
          value={capitalizeSentenceStarts(String(order.customer_notes || ""))}
          readOnly aria-readonly="true" placeholder="Não informada na OS" />
        <div className="space-y-1">
          <FTextarea rows={4} label="Diagnóstico" required autoCapitalize="sentences"
            maxLength={MAX_TECHNICAL_CHARS} value={draft.diagnosis} disabled={!editable}
            onChange={(e:any)=>setDraft(current=>({...current,diagnosis:capitalizeSentenceStarts(e.target.value).slice(0,MAX_TECHNICAL_CHARS)}))}/>
          <p className="text-right text-[11px] tabular-nums text-muted-foreground" aria-live="off">
            {draft.diagnosis.length}/{MAX_TECHNICAL_CHARS} caracteres
          </p>
          {editable && <UnionQuoteAiActions organizationId={org} orderId={orderId} field="diagnosis"
            currentText={draft.diagnosis} diagnosisText={draft.diagnosis}
            onApply={text=>setDraft(current=>({...current,diagnosis:text}))}/>}
        </div>
        <div className="space-y-1">
          <FTextarea rows={4} label="Solução proposta" required autoCapitalize="sentences"
            maxLength={MAX_TECHNICAL_CHARS} value={draft.proposed_solution} disabled={!editable}
            onChange={(e:any)=>setDraft(current=>({...current,proposed_solution:capitalizeSentenceStarts(e.target.value).slice(0,MAX_TECHNICAL_CHARS)}))}/>
          <p className="text-right text-[11px] tabular-nums text-muted-foreground" aria-live="off">
            {draft.proposed_solution.length}/{MAX_TECHNICAL_CHARS} caracteres
          </p>
          {editable && <UnionQuoteAiActions organizationId={org} orderId={orderId} field="proposed_solution"
            currentText={draft.proposed_solution} diagnosisText={draft.diagnosis}
            onApply={text=>setDraft(current=>({...current,proposed_solution:text}))}/>}
        </div>
      </div>
    </Section>
    {editable && <UnionQuoteAiUsage organizationId={org}/>}
    {proposal?.status==="approved"
      ? <section aria-label="Produtos e serviços da OS" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
            <h3 className="text-sm font-black uppercase tracking-wider text-foreground">Produtos e serviços da OS</h3>
            {canEdit && !order.completed_at && !order.cancelled_at && !order.is_solved &&
              <AdminButton variant="tertiary" onClick={()=>openAction("reopen")} disabled={busy}>
                <RotateCcw size={15}/> Reabrir orçamento
              </AdminButton>}
          </div>
          <OrderProductsServicesSection
            order={order} canEdit={canEdit} commercialLocked formatCurrency={formatCurrency}
            onPricingChange={onPricingChange} onOverviewChange={onOverviewChange}
          />
        </section>
      : <OrderQuoteCommercialEditor orderId={orderId} draft={draft} onChange={setDraft} disabled={!editable}/>}

    <OrderQuotePhotosSection organizationId={org} orderId={orderId}
      canUpload={canManagePhotos && !order.completed_at && !order.cancelled_at}
      canRemove={canRemovePhotos && !order.completed_at && !order.cancelled_at}/>
    {!!renegotiations.length&&<Section title={<span className="inline-flex items-center gap-2"><History size={15}/> Histórico de renegociações</span>} flush>
      <div className="hidden overflow-x-auto md:block"><TopTableScrollbar />
        <table className="w-full border-collapse text-left text-xs">
          <thead><tr className="border-b border-border bg-muted/45 text-muted-foreground">
            <th className="px-4 py-3">Proposta anterior</th>
            <th className="px-4 py-3">Enviada em</th>
            <th className="px-4 py-3">Itens</th>
            <th className="px-4 py-3 text-right">Valor anterior</th>
            <th className="px-4 py-3 text-right">Detalhes</th>
          </tr></thead>
          <tbody>{renegotiations.map((version,index)=><tr
            key={String(version.version)+"-"+index}
            className="border-b border-border last:border-b-0 hover:bg-muted/30">
            <td className="px-4 py-3 font-semibold">Versão {version.version}</td>
            <td className="px-4 py-3">{version.submitted_at?new Date(version.submitted_at).toLocaleString("pt-BR"):"—"}</td>
            <td className="px-4 py-3">{Array.isArray(version.items)?version.items.length:0}</td>
            <td className="px-4 py-3 text-right font-bold text-emerald-700 dark:text-emerald-300">{formatCurrency(versionPricing(version).total)}</td>
            <td className="px-4 py-3 text-right"><BtnSecondary onClick={()=>setSelectedVersion(version)}>Visualizar</BtnSecondary></td>
          </tr>)}</tbody>
        </table>
      </div>
      <div className="grid gap-3 p-3 md:hidden">{renegotiations.map((version,index)=>
        <button type="button" key={String(version.version)+"-"+index}
          onClick={()=>setSelectedVersion(version)}
          className="w-full rounded-lg border border-border p-3 text-left transition-colors hover:border-primary/50 hover:bg-muted/30">
          <span className="flex items-center justify-between gap-2 text-sm font-bold">
            <span>Versão {version.version}</span>
            <span className="text-emerald-700 dark:text-emerald-300">{formatCurrency(versionPricing(version).total)}</span>
          </span>
          <span className="mt-2 block text-xs text-muted-foreground">
            {version.submitted_at?new Date(version.submitted_at).toLocaleString("pt-BR"):"—"}
            {" · "}{Array.isArray(version.items)?version.items.length:0} itens
          </span>
        </button>)}</div>
    </Section>}
    <OrderQuoteComments organizationId={org} orderId={orderId} canComment={canEdit && !busy} />
    </div>
    {footerHost && proposal?.status!=="approved" && createPortal(<>
      {editable && <BtnPrimary disabled={busy} className="w-auto min-w-0 shrink-0 whitespace-nowrap !px-3 text-xs md:!px-4 md:text-sm"
        onClick={() => openAction("submit")}>Encaminhar <ArrowRight size={15} className="ml-1 inline-block shrink-0 align-middle"/></BtnPrimary>}
      {proposal?.status==="awaiting_approval" && <>
        <AdminButton variant="secondary" disabled={busy} onClick={()=>openAction("renegotiate")} className="min-w-0 flex-1 basis-0 !px-1 text-[11px] sm:text-xs md:flex-none md:!px-4 md:text-sm">
          <RotateCcw size={15} className="hidden shrink-0 sm:block"/> Renegociar</AdminButton>
        <AdminButton variant="quaternary" disabled={busy} onClick={()=>openAction("reject")} className="min-w-0 flex-1 basis-0 !px-1 text-[11px] sm:text-xs md:flex-none md:!px-4 md:text-sm">
          <XCircle size={15} className="hidden shrink-0 sm:block"/> Rejeitar</AdminButton>
        <BtnPrimary disabled={busy} onClick={()=>openAction("approve")} className="min-w-0 flex-1 basis-0 !px-1 text-[11px] sm:text-xs md:flex-none md:!px-4 md:text-sm">
          <CheckCircle2 size={15} className="hidden shrink-0 sm:block"/> Aprovar</BtnPrimary>
      </>}
      {proposal?.status==="rejected" && <BtnPrimary disabled={busy} className="w-full min-w-0 !px-2 text-xs md:w-auto md:!px-4 md:text-sm"
        onClick={()=>openAction("renegotiate")}><RotateCcw size={15} className="hidden shrink-0 sm:block"/> Renegociar</BtnPrimary>}

    </>,footerHost)}
    <AdminDialog
      open={Boolean(selectedVersion)}
      onClose={()=>setSelectedVersion(null)}
      title={selectedVersion?"Renegociação · Versão "+selectedVersion.version:"Renegociação"}
      description="Registro preservado da proposta anterior, sem alterar o orçamento atual."
      className="max-w-3xl"
      footer={<div className="flex w-full justify-end"><BtnSecondary onClick={()=>setSelectedVersion(null)}>Fechar</BtnSecondary></div>}
    >
      {selectedVersion&&<div className="max-h-[65vh] space-y-4 overflow-y-auto">
        <div className="grid gap-3 rounded-lg border border-border p-4 text-xs sm:grid-cols-3">
          <div><span className="block text-muted-foreground">Enviado em</span>
            <strong>{selectedVersion.submitted_at?new Date(selectedVersion.submitted_at).toLocaleString("pt-BR"):"—"}</strong></div>
          <div><span className="block text-muted-foreground">Validade</span>
            <strong>{selectedVersion.valid_until?new Date(String(selectedVersion.valid_until)+"T12:00:00").toLocaleDateString("pt-BR"):"—"}</strong></div>
          <div><span className="block text-muted-foreground">Valor negociado</span>
            <strong className="text-emerald-700 dark:text-emerald-300">{formatCurrency(versionPricing(selectedVersion).total)}</strong></div>
        </div>
        <div className="space-y-2 text-sm">
          <p><strong>Diagnóstico:</strong> {selectedVersion.diagnosis||"—"}</p>
          <p><strong>Solução proposta:</strong> {selectedVersion.proposed_solution||"—"}</p>
        </div>
        <div className="overflow-x-auto rounded-lg border border-border"><TopTableScrollbar />
          <table className="w-full min-w-[480px] text-left text-xs">
            <thead className="bg-muted/50"><tr>
              <th className="px-3 py-3">Produto / Serviço</th>
              <th className="px-3 py-3 text-right">Qtd.</th>
              <th className="px-3 py-3 text-right">Preço unitário</th>
              <th className="px-3 py-3 text-right">Subtotal</th>
            </tr></thead>
            <tbody>{(selectedVersion.items||[]).map((item:any,index:number)=>
              <tr key={index} className="border-t border-border">
                <td className="px-3 py-3">{item.title_snapshot}</td>
                <td className="px-3 py-3 text-right">{item.quantity}</td>
                <td className="px-3 py-3 text-right">{formatCurrency(Number(item.unit_price||0))}</td>
                <td className="px-3 py-3 text-right">
                  {formatCurrency(Number(item.quantity||0)*Number(item.unit_price||0)+Number(item.additional_cost||0))}
                </td>
              </tr>)}</tbody>
          </table>
        </div>
        <div className="ml-auto grid max-w-sm gap-2 text-xs">
          <div className="flex justify-between"><span>Subtotal</span><strong className="text-emerald-700 dark:text-emerald-300">{formatCurrency(versionPricing(selectedVersion).subtotal)}</strong></div>
          <div className="flex justify-between"><span>Desconto</span><strong className="text-red-600 dark:text-red-400">- {formatCurrency(versionPricing(selectedVersion).discount)}</strong></div>
          <div className="flex justify-between border-t border-border pt-2 text-sm font-bold">
            <span>Total anterior</span><span className="text-emerald-700 dark:text-emerald-300">{formatCurrency(versionPricing(selectedVersion).total)}</span>
          </div>
        </div>
      </div>}
    </AdminDialog>
    <AdminDialog
      open={Boolean(confirmationAction)}
      onClose={closeAction}
      title={confirmationAction ? ACTION_TITLES[confirmationAction] : "Confirmar ação"}
      description={confirmationAction==="approve" && executionItemsLoading ? undefined : confirmationAction==="submit"
        ? "Confira a proposta antes de encaminhá-la para aprovação."
        : confirmationAction==="approve"
          ? revisingApprovedQuote
            ? "Esta versão substituirá os itens da aprovação anterior. A execução precisa estar intacta e sem agendamentos."
            : "Confirme a aprovação. Se já houver serviços equivalentes, a execução técnica será preservada."
          : confirmationAction==="reject"
            ? "A proposta ficará rejeitada e poderá ser renegociada posteriormente."
            : confirmationAction==="reopen"
              ? "Informe o motivo da reabertura. A proposta volta à edição e precisará de nova aprovação."
              : "Será iniciada uma nova versão, preservando o histórico anterior."}
      footer={confirmationAction==="approve" && executionItemsLoading ? undefined : <div className="flex w-full flex-wrap justify-end gap-2">
        {modalFeedback?.type==="success"
          ? <BtnPrimary onClick={closeAction}>Concluir</BtnPrimary>
          : <>
            <BtnSecondary disabled={busy} onClick={closeAction}>Voltar</BtnSecondary>
            {!modalFeedback && <BtnPrimary
              disabled={busy || !confirmationAction || (confirmationAction==="reject" && !reason.trim()) || (confirmationAction==="reopen" && reason.trim().length<5) || (confirmationAction==="approve" && (executionItemsLoading || Boolean(executionItemsError) || (executionItems.length>0 && !revisingApprovedQuote && !canReuseExecution)))}
              loading={busy}
              loadingText="Processando..."
              onClick={()=>{if(confirmationAction)void act(confirmationAction);}}>
              {confirmationAction ? ACTION_BUTTON_LABELS[confirmationAction] : "Confirmar"}
            </BtnPrimary>}
          </>}
      </div>}>
      <div className="min-h-[126px] space-y-4">
        <AnimatePresence mode="wait">
          {(busy || (confirmationAction==="approve" && executionItemsLoading))
            ? <motion.div key="processing"
                initial={{opacity:0,y:7}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-7}}
                className="flex min-h-28 flex-col items-center justify-center gap-3 text-center">
                <div className="flex items-center justify-center text-primary" role="status" aria-label="Processando solicitação">
                  <LoadingSpinner size="md" />
                </div>
                {busy && <p className="text-sm font-medium text-muted-foreground">Processando orçamento...</p>}
              </motion.div>
            : modalFeedback
              ? <motion.div
                  key={modalFeedback.type}
                  initial={{opacity:0,y:12,scale:0.95}}
                  animate={{opacity:1,y:0,scale:1}}
                  exit={{opacity:0,y:-8,scale:0.98}}
                  transition={{type:"spring",stiffness:360,damping:25}}
                  role={modalFeedback.type==="error"?"alert":"status"}
                  className="flex min-h-32 flex-col items-center justify-center gap-3 text-center">
                  <motion.div initial={{scale:0.4,rotate:-18}} animate={{scale:1,rotate:0}}
                    transition={{type:"spring",stiffness:280,damping:17}}
                    className={`flex h-14 w-14 items-center justify-center rounded-full border ${modalFeedback.type==="success"
                      ?"border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                      :"border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300"}`}>
                    {modalFeedback.type==="success"?<CheckCircle2 size={29}/>:<AlertCircle size={29}/>}
                  </motion.div>
                  <strong className="text-base font-bold text-foreground">
                    {modalFeedback.type==="success"?"Operação realizada com sucesso":"Não foi possível concluir"}
                  </strong>
                  <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">{modalFeedback.message}</p>
                </motion.div>
              : <motion.div key="confirm"
                  initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-6}}
                  className="space-y-3">
                  <p className="text-sm text-foreground">
                    {confirmationAction==="submit" ? "Deseja enviar este orçamento para aprovação?"
                      : confirmationAction==="approve" ? "Deseja realmente aprovar esta proposta?"
                      : confirmationAction==="reject" ? "Deseja rejeitar este orçamento?"
                      : confirmationAction==="reopen" ? "Deseja reabrir o orçamento aprovado e enviá-lo novamente para aprovação?"
                      : "Deseja reabrir a negociação e elaborar uma nova versão?"}
                  </p>
                  {confirmationAction==="approve" && <div className="space-y-3">

                    {executionItemsError && <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">{executionItemsError}</p>}
                    {!executionItemsLoading && !executionItemsError && executionItems.length>0 && <>
                      <div className="rounded-lg border border-border p-3">
                        <strong className="text-xs text-foreground">Itens já existentes na execução</strong>
                        <div className="mt-2 max-h-36 space-y-2 overflow-y-auto">
                          {executionItems.map(item=><div key={item.id} className="flex justify-between gap-3 text-xs">
                            <span className="min-w-0 break-words text-muted-foreground">{item.title_snapshot} · Qtd. {item.quantity}</span>
                            <strong className="shrink-0">{formatCurrency(Number(item.subtotal||0))}</strong>
                          </div>)}
                        </div>
                      </div>
                      {revisingApprovedQuote ? <div className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs leading-5 text-foreground">
                        Os itens aprovados anteriormente serão substituídos ao confirmar. Caso haja execução técnica ou faturamento, a operação será bloqueada para preservar os registros.
                      </div> : canReuseExecution ? <div className="flex items-start gap-3 rounded-lg border border-primary bg-primary/10 p-3">
                        <CheckCircle2 size={19} className="mt-0.5 shrink-0 text-primary" aria-hidden="true"/>
                        <span className="min-w-0">
                          <strong className="block text-sm text-foreground">Reutilizar serviços existentes</strong>
                          <span className="mt-1 block text-xs leading-5 text-muted-foreground">Única opção disponível: associa o orçamento aos itens já cadastrados, preservando atividades técnicas, relatórios, fotos e valores. Nenhum item será duplicado ou excluído.</span>
                        </span>
                      </div> : <p role="alert" className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-xs leading-5 text-foreground">
                        Os itens, quantidades ou valores do orçamento não correspondem exatamente à execução, ou algum serviço já pertence a outra proposta. Revise os itens antes de aprovar; não serão feitas substituições nem duplicações.
                      </p>}
                    </>}
                  </div>}
                  {confirmationAction==="reopen" && <FTextarea label="Justificativa para reabrir o orçamento" required rows={4} maxLength={2000} value={reason} disabled={busy}
                    onChange={(e:any)=>setReason(e.target.value)} placeholder="Descreva por que os itens ou valores precisam de nova aprovação."/>}
                  {confirmationAction==="reject" && <FInput label="Motivo da rejeição"
                    required maxLength={2000} value={reason} disabled={busy}
                    onChange={(e:any)=>setReason(e.target.value)} placeholder="Informe o motivo da rejeição"/>}
                  <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span>Proposta · Versão {proposal?.version||1}</span>
                      <strong className="text-emerald-700 dark:text-emerald-300">{formatCurrency(versionPricing(draft as Record<string,any>).total)}</strong>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{draft.items.length} item(ns) no orçamento</p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {confirmationAction==="submit"
                      ? "Enviar para aprovação não aprova o orçamento automaticamente."
                      : confirmationAction==="approve"
                        ? "Após a confirmação, os itens serão aplicados à mesma OS."
                        : confirmationAction==="reject"
                          ? "O motivo da rejeição ficará registrado."
                          : confirmationAction==="reopen"
                            ? "A justificativa ficará no histórico e a nova versão deverá ser encaminhada para aprovação."
                            : "A proposta anterior será preservada no histórico de renegociações."}
                  </p>
                </motion.div>}
        </AnimatePresence>
      </div>
    </AdminDialog>
  </>;
}
