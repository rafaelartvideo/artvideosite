import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "motion/react";
import { createPortal } from "react-dom";
import { AlertCircle, CheckCircle2, History, RotateCcw, Send, XCircle } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { BtnPrimary, BtnSecondary, Section, AdminButton, AdminDialog } from "@/shared/ui/admin/AdminLayout";
import { FInput, FTextarea } from "@/shared/ui/admin/AdminFormControls";
import { formatCurrency } from "@/shared/domain/formatters";
import { LoadingSpinner, LoadingState, notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import { systemErrorMessage } from "@/shared/domain/error-message";
import {
  addOrderQuoteComment, changeOrderQuote, emptyOrderQuoteDraft, readOrderPricingAfterApproval,
  listOrderQuoteComments, readOrderQuote,
  type OrderQuoteDraft,type OrderQuoteProposal,
} from "../infrastructure/order-quote.repository";
import { OrderQuoteCommercialEditor } from "./OrderQuoteCommercialEditor";
import { OrderQuotePhotosSection } from "./OrderQuotePhotosSection";
import { OrderProductsServicesSection } from "./OrderProductsServicesSection";
import { capitalizeSentenceStarts } from "../domain/capitalize-sentence-starts";
import { UnionQuoteAiActions, UnionQuoteAiUsage } from "./UnionQuoteAiActions";

type QuoteAction = "submit" | "approve" | "reject" | "renegotiate";
type ModalFeedback = { type: "success" | "error"; message: string };
const MAX_TECHNICAL_CHARS = 400;
const ACTION_TITLES: Record<QuoteAction,string> = {
  submit: "Enviar orçamento para aprovação",
  approve: "Aprovar orçamento",
  reject: "Rejeitar orçamento",
  renegotiate: "Reabrir negociação",
};
const ACTION_BUTTON_LABELS: Record<QuoteAction,string> = {
  submit: "Confirmar envio",
  approve: "Confirmar aprovação",
  reject: "Confirmar rejeição",
  renegotiate: "Confirmar renegociação",
};
const ACTION_SUCCESS: Record<QuoteAction,string> = {
  submit: "Orçamento enviado para aprovação. A proposta permanece aguardando uma decisão.",
  approve: "Orçamento aprovado. Os itens foram incorporados à OS e a execução está liberada.",
  reject: "Orçamento rejeitado. O motivo ficou registrado e a negociação poderá ser reaberta.",
  renegotiate: "Negociação reaberta. Uma nova versão da proposta está pronta para edição.",
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
export function OrderQuoteWorkspace({order,canEdit,canManagePhotos,canRemovePhotos,onPricingChange,footerHostId,onStatusChange}:{
  order:any;canEdit:boolean;canManagePhotos:boolean;canRemovePhotos:boolean;onPricingChange:(pricing:any)=>void;footerHostId:string;
  onStatusChange?:(status:OrderQuoteProposal["status"])=>void;
}) {
  const {user}=useAuth();
  const queryClient = useQueryClient();
  const org=String(order?.organization_id||"");
  const orderId=String(order?.id||"");
  const quoteKey = ["orders", "quote", org, orderId] as const;
  const commentsKey = ["orders", "quote-comments", org, orderId] as const;
  const [proposal,setProposal]=useState<OrderQuoteProposal|null>(() =>
    queryClient.getQueryData<OrderQuoteProposal | null>(quoteKey) || null);
  const [draft,setDraft]=useState<OrderQuoteDraft>(() => {
    const cached = queryClient.getQueryData<OrderQuoteProposal | null>(quoteKey);
    return cached ? snapshot(cached) : emptyOrderQuoteDraft();
  });
  const [comments,setComments]=useState<any[]>(() =>
    queryClient.getQueryData<any[]>(commentsKey) || []);
  const [comment,setComment]=useState("");
  const [reason,setReason]=useState("");
  const [loading,setLoading]=useState(() =>
    !queryClient.getQueryState(["orders", "quote", org, orderId])?.dataUpdatedAt);
  const [busy,setBusy]=useState(false);
  const [footerHost,setFooterHost]=useState<HTMLElement|null>(null);
  const [confirmationAction,setConfirmationAction]=useState<QuoteAction|null>(null);
  const [modalFeedback,setModalFeedback]=useState<ModalFeedback|null>(null);
  const submissionLocked=useRef(false);
  const [showExecution,setShowExecution]=useState(false);
  const [selectedVersion,setSelectedVersion]=useState<Record<string,any>|null>(null);

  useEffect(()=>{
    setFooterHost(document.getElementById(footerHostId));
  },[footerHostId,orderId]);

  useEffect(()=>{
    setConfirmationAction(null);
    setModalFeedback(null);
    submissionLocked.current=false;
  },[orderId]);

  useEffect(()=>{
    if(!org||!orderId)return;
    let active=true;
    setShowExecution(false);
    const cached = queryClient.getQueryData<OrderQuoteProposal | null>(quoteKey);
    const hasCached = Boolean(queryClient.getQueryState(quoteKey)?.dataUpdatedAt);
    const cachedComments = queryClient.getQueryData<any[]>(commentsKey);
    if (hasCached) {
      setProposal(cached || null);
      setDraft(cached ? snapshot(cached) : emptyOrderQuoteDraft());
    }
    if (cachedComments) setComments(cachedComments);
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
    // Comentários carregam em paralelo e não bloqueiam a proposta.
    void queryClient.fetchQuery({
      queryKey: commentsKey,
      staleTime: 60_000,
      queryFn: () => listOrderQuoteComments(org, orderId),
    }).then(notes=>{if(active)setComments(notes);})
      .catch(err=>{if(active)notifyAdmin(systemErrorMessage(err),"error");});
    return()=>{active=false;};
  },[org,orderId,queryClient]);

  const renegotiations = (proposal?.versions||[])
    .filter(version=>Number(version.version)<Number(proposal?.version||1))
    .sort((a,b)=>Number(b.version)-Number(a.version));
  const editable=canEdit&&!order.completed_at&&!order.cancelled_at&&
    (!proposal||proposal.status==="draft"||proposal.status==="renegotiation");
  const openAction = (action: QuoteAction) => {
    if(busy || submissionLocked.current)return;
    setModalFeedback(null);
    setConfirmationAction(action);
  };
  const closeAction = () => {
    if(busy || submissionLocked.current)return;
    setConfirmationAction(null);
    setModalFeedback(null);
  };
  const act=async(action:QuoteAction)=>{
    if(busy || submissionLocked.current || !canEdit || confirmationAction!==action ||
      modalFeedback?.type==="success")return;
    if(action==="submit" && (draft.diagnosis.length>MAX_TECHNICAL_CHARS ||
      draft.proposed_solution.length>MAX_TECHNICAL_CHARS)){
      setModalFeedback({type:"error",message:"Diagnóstico e solução proposta devem ter no máximo 400 caracteres cada."});
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
      }else result=await changeOrderQuote(org,orderId,action,
        action==="reject"?{reason}:
        action==="approve"?{confirmation:"CONFIRMAR_APROVACAO",version:proposal?.version}: {});
      queryClient.setQueryData(quoteKey, result);
      setProposal(result);
      setDraft(snapshot(result));
      onStatusChange?.(result.status);
      if(action==="approve") {
        try {
          const pricing=await readOrderPricingAfterApproval(org,orderId);
          onPricingChange(pricing);
        } catch (pricingError) {
          console.warn("[ORDERS] Orçamento aprovado; o resumo financeiro será atualizado na próxima leitura.",pricingError);
        }
      }
      if(action==="reject")setReason("");
      setModalFeedback({type:"success",message:ACTION_SUCCESS[action]});
    }catch(err){
      setModalFeedback({type:"error",message:systemErrorMessage(err)});
    }finally{
      submissionLocked.current=false;
      setBusy(false);
    }
  };
  const sendComment=async()=>{
    if(!comment.trim()||!user?.id||busy)return;
    setBusy(true);
    try{
      await addOrderQuoteComment(org,orderId,user.id,comment);
      setComment("");
      const notes=await listOrderQuoteComments(org,orderId);
      queryClient.setQueryData(commentsKey, notes);
      setComments(notes);
      notifyAdmin("Comentário registrado.","success");
    }catch(err){notifyAdmin(systemErrorMessage(err),"error");}
    finally{setBusy(false);}
  };
  if(loading)return <LoadingState text="Carregando orçamento da OS..."/>;
  if(showExecution&&proposal?.status==="approved")return <div className="space-y-4">
    <BtnSecondary onClick={()=>setShowExecution(false)}>Voltar ao orçamento aprovado</BtnSecondary>
    <OrderProductsServicesSection order={order} canEdit={canEdit} formatCurrency={formatCurrency} onPricingChange={onPricingChange}/>
  </div>;
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
    <OrderQuoteCommercialEditor orderId={orderId} draft={draft} onChange={setDraft} disabled={!editable}/>
    <OrderQuotePhotosSection organizationId={org} orderId={orderId}
      canUpload={canManagePhotos && !order.completed_at && !order.cancelled_at}
      canRemove={canRemovePhotos && !order.completed_at && !order.cancelled_at}/>
    {!!renegotiations.length&&<Section title={<span className="inline-flex items-center gap-2"><History size={15}/> Histórico de renegociações</span>} flush>
      <div className="hidden overflow-x-auto md:block">
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
            <td className="px-4 py-3 text-right font-bold">{formatCurrency(versionPricing(version).total)}</td>
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
            <span>{formatCurrency(versionPricing(version).total)}</span>
          </span>
          <span className="mt-2 block text-xs text-muted-foreground">
            {version.submitted_at?new Date(version.submitted_at).toLocaleString("pt-BR"):"—"}
            {" · "}{Array.isArray(version.items)?version.items.length:0} itens
          </span>
        </button>)}</div>
    </Section>}
    <Section title="Comentários do orçamento">
      <div className="space-y-3">
        {canEdit&&<div className="flex min-w-0 items-stretch gap-2 sm:gap-3">
          <div className="min-w-0 flex-1">
            <FInput value={comment} disabled={busy} className="h-[42px]"
              onChange={(e:any)=>setComment(e.target.value)}
              onKeyDown={(event:any)=>{if(event.key==="Enter"&&!event.shiftKey){event.preventDefault();void sendComment();}}}
              placeholder="Registrar comentário da análise ou negociação..."/>
          </div>
          <BtnPrimary className="h-[42px] shrink-0 self-start px-3 sm:px-4"
            disabled={busy||!comment.trim()} loading={busy} onClick={()=>void sendComment()}>
            Adicionar comentário</BtnPrimary>
        </div>}
        {!comments.length?<p className="text-xs text-muted-foreground">Nenhum comentário registrado.</p>:
          comments.map(note=><article key={note.id} className="rounded-lg border border-border p-3">
            <div className="flex justify-between gap-2 text-xs"><strong>{(note.author as any)?.full_name||"Usuário"}</strong>
              <span className="text-muted-foreground">{new Date(note.created_at).toLocaleString("pt-BR")}</span></div>
            <p className="mt-2 whitespace-pre-wrap text-sm">{note.body}</p></article>)}
      </div>
    </Section>
    </div>
    {footerHost && createPortal(<>
      {editable && <BtnPrimary disabled={busy} loading={busy}
        onClick={() => openAction("submit")}><Send size={15}/> Enviar para aprovação</BtnPrimary>}
      {proposal?.status==="awaiting_approval" && <>
        <AdminButton variant="secondary" disabled={busy} onClick={()=>openAction("renegotiate")}>
          <RotateCcw size={15}/> Reabrir negociação</AdminButton>
        <AdminButton variant="secondary" disabled={busy} onClick={()=>openAction("reject")}>
          <XCircle size={15}/> Rejeitar</AdminButton>
        <BtnPrimary disabled={busy} loading={busy} onClick={()=>openAction("approve")}>
          <CheckCircle2 size={15}/> Aprovar</BtnPrimary>
      </>}
      {proposal?.status==="rejected" && <BtnPrimary disabled={busy} loading={busy}
        onClick={()=>openAction("renegotiate")}><RotateCcw size={15}/> Reabrir negociação</BtnPrimary>}
      {proposal?.status==="approved" && <BtnPrimary onClick={()=>setShowExecution(true)}>
        Abrir produtos e serviços para execução</BtnPrimary>}
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
            <strong>{formatCurrency(versionPricing(selectedVersion).total)}</strong></div>
        </div>
        <div className="space-y-2 text-sm">
          <p><strong>Diagnóstico:</strong> {selectedVersion.diagnosis||"—"}</p>
          <p><strong>Solução proposta:</strong> {selectedVersion.proposed_solution||"—"}</p>
        </div>
        <div className="overflow-x-auto rounded-lg border border-border">
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
          <div className="flex justify-between"><span>Subtotal</span><strong>{formatCurrency(versionPricing(selectedVersion).subtotal)}</strong></div>
          <div className="flex justify-between"><span>Desconto</span><strong>- {formatCurrency(versionPricing(selectedVersion).discount)}</strong></div>
          <div className="flex justify-between border-t border-border pt-2 text-sm font-bold">
            <span>Total anterior</span><span>{formatCurrency(versionPricing(selectedVersion).total)}</span>
          </div>
        </div>
      </div>}
    </AdminDialog>
    <AdminDialog
      open={Boolean(confirmationAction)}
      onClose={closeAction}
      title={confirmationAction ? ACTION_TITLES[confirmationAction] : "Confirmar ação"}
      description={confirmationAction==="submit"
        ? "Confira a proposta antes de encaminhá-la para aprovação."
        : confirmationAction==="approve"
          ? "Confirme a autorização para incluir os itens na execução da OS."
          : confirmationAction==="reject"
            ? "A proposta ficará rejeitada e poderá ser renegociada posteriormente."
            : "Será iniciada uma nova versão, preservando o histórico anterior."}
      footer={<div className="flex w-full flex-wrap justify-end gap-2">
        {modalFeedback?.type==="success"
          ? <BtnPrimary onClick={closeAction}>Concluir</BtnPrimary>
          : <>
            <BtnSecondary disabled={busy} onClick={closeAction}>Voltar</BtnSecondary>
            <BtnPrimary
              disabled={busy || !confirmationAction || (confirmationAction==="reject" && !reason.trim())}
              loading={busy}
              loadingText="Processando..."
              onClick={()=>{if(confirmationAction)void act(confirmationAction);}}>
              {confirmationAction ? ACTION_BUTTON_LABELS[confirmationAction] : "Confirmar"}
            </BtnPrimary>
          </>}
      </div>}>
      <div className="min-h-[126px] space-y-4">
        <AnimatePresence mode="wait">
          {busy
            ? <motion.div key="processing"
                initial={{opacity:0,y:7}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-7}}
                className="flex min-h-28 flex-col items-center justify-center gap-3 text-center">
                <div className="flex items-center justify-center text-primary" role="status" aria-label="Processando solicitação">
                  <LoadingSpinner size="md" />
                </div>
                <p className="text-sm font-medium text-muted-foreground">Processando orçamento...</p>
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
                      : "Deseja reabrir a negociação e elaborar uma nova versão?"}
                  </p>
                  {confirmationAction==="reject" && <FInput label="Motivo da rejeição"
                    required maxLength={2000} value={reason} disabled={busy}
                    onChange={(e:any)=>setReason(e.target.value)} placeholder="Informe o motivo da rejeição"/>}
                  <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <span>Proposta · Versão {proposal?.version||1}</span>
                      <strong>{formatCurrency(versionPricing(draft as Record<string,any>).total)}</strong>
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
                          : "A proposta anterior será preservada no histórico de renegociações."}
                  </p>
                </motion.div>}
        </AnimatePresence>
      </div>
    </AdminDialog>
  </>;
}
