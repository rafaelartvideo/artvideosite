import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, FileText, History, RotateCcw, Send, XCircle } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { BtnPrimary, BtnSecondary, Section, AdminButton, AdminDialog } from "@/shared/ui/admin/AdminLayout";
import { FInput, FTextarea } from "@/shared/ui/admin/AdminFormControls";
import { formatCurrency } from "@/shared/domain/formatters";
import { LoadingState, notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import { systemErrorMessage } from "@/shared/domain/error-message";
import {
  addOrderQuoteComment, changeOrderQuote, emptyOrderQuoteDraft, readOrderPricingAfterApproval,
  listOrderQuoteComments, readOrderQuote,
  type OrderQuoteDraft,type OrderQuoteProposal,
} from "../infrastructure/order-quote.repository";
import { OrderQuoteCommercialEditor,quoteItemTotal } from "./OrderQuoteCommercialEditor";
import { OrderProductsServicesSection } from "./OrderProductsServicesSection";

function snapshot(d:OrderQuoteProposal):OrderQuoteDraft {
  return {
    diagnosis:d.diagnosis||"",proposed_solution:d.proposed_solution||"",
    commercial_conditions:d.commercial_conditions||"",valid_until:d.valid_until||null,
    items:Array.isArray(d.items)?d.items:[],
    discount_type:d.discount_type==="percentage"?"percentage":"amount",
    discount_value:Number(d.discount_value||0),
  };
}
function escapeHtml(v:unknown):string {
  return String(v??"").replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}
function printQuote(order:any,proposal:OrderQuoteProposal,draft:OrderQuoteDraft) {
  const subtotal=draft.items.reduce((sum,item)=>sum+quoteItemTotal(item),0);
  const disc=draft.discount_type==="percentage"?subtotal*draft.discount_value/100:draft.discount_value;
  const win=window.open("","_blank","width=850,height=750");
  if(!win)throw new Error("Permita janelas para imprimir ou salvar o orçamento em PDF.");
  const rows=draft.items.map(item=>'<tr><td>'+escapeHtml(item.title_snapshot)+'</td><td>'+
    escapeHtml(item.quantity)+'</td><td>'+escapeHtml(formatCurrency(item.unit_price))+
    '</td><td>'+escapeHtml(formatCurrency(quoteItemTotal(item)))+'</td></tr>').join("");
  const html='<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Orçamento OS '+
    escapeHtml(order.os_number)+' - V'+proposal.version+'</title><style>'+
    'body{font:13px Arial,sans-serif;margin:28px;color:#111}h1{font-size:20px;margin:0 0 6px}'+
    'h2{font-size:13px;margin:24px 0 8px}table{width:100%;border-collapse:collapse;margin:12px 0}'+
    'td,th{text-align:left;padding:9px 6px;border-bottom:1px solid #ddd}'+
    'p{white-space:pre-wrap;line-height:1.5}footer{margin-top:24px;border-top:1px solid #ccc;padding-top:12px}'+
    '@page{size:A4;margin:15mm}button{margin:14px 0;padding:8px 12px}@media print{button{display:none}}'+
    '</style></head><body><h1>Orçamento técnico</h1><div>OS '+escapeHtml(order.os_number)+
    ' · Versão '+proposal.version+'</div><div>Validade: '+escapeHtml(draft.valid_until||"Não definida")+
    '</div><h2>Diagnóstico</h2><p>'+escapeHtml(draft.diagnosis)+
    '</p><h2>Solução proposta</h2><p>'+escapeHtml(draft.proposed_solution)+
    '</p><h2>Produtos e serviços</h2><table><thead><tr><th>Descrição</th><th>Qtd.</th><th>Preço</th><th>Subtotal</th></tr></thead><tbody>'+
    rows+'</tbody></table><p>Subtotal: '+escapeHtml(formatCurrency(subtotal))+
    '<br>Desconto: '+escapeHtml(formatCurrency(disc))+'<br><strong>Total: '+
    escapeHtml(formatCurrency(Math.max(0,subtotal-disc)))+'</strong></p><footer>Esta proposta depende de aprovação para execução dos serviços.</footer>'+
    '<button onclick="window.print()">Imprimir / Salvar em PDF</button></body></html>';
  win.document.open();win.document.write(html);win.document.close();win.focus();
}
export function OrderQuoteWorkspace({order,canEdit,onPricingChange,footerHostId,onApproved}:{
  order:any;canEdit:boolean;onPricingChange:(pricing:any)=>void;footerHostId:string;onApproved?:()=>void;
}) {
  const {user}=useAuth();
  const org=String(order?.organization_id||"");
  const orderId=String(order?.id||"");
  const [proposal,setProposal]=useState<OrderQuoteProposal|null>(null);
  const [draft,setDraft]=useState<OrderQuoteDraft>(emptyOrderQuoteDraft);
  const [comments,setComments]=useState<any[]>([]);
  const [comment,setComment]=useState("");
  const [reason,setReason]=useState("");
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [footerHost,setFooterHost]=useState<HTMLElement|null>(null);
  const [rejectDialogOpen,setRejectDialogOpen]=useState(false);
  const [showExecution,setShowExecution]=useState(false);

  useEffect(()=>{
    setFooterHost(document.getElementById(footerHostId));
  },[footerHostId,orderId]);

  useEffect(()=>{
    if(!org||!orderId)return;
    let active=true;
    setLoading(true);setShowExecution(false);
    void Promise.all([readOrderQuote(org,orderId),listOrderQuoteComments(org,orderId)])
      .then(([next,notes])=>{
        if(!active)return;
        setProposal(next);setDraft(next?snapshot(next):emptyOrderQuoteDraft());setComments(notes);
      })
      .catch(err=>{if(active)notifyAdmin(systemErrorMessage(err),"error");})
      .finally(()=>{if(active)setLoading(false);});
    return()=>{active=false;};
  },[org,orderId]);

  const editable=canEdit&&!order.completed_at&&!order.cancelled_at&&
    (!proposal||proposal.status==="draft"||proposal.status==="renegotiation");
  const act=async(action:"save"|"submit"|"approve"|"reject"|"renegotiate")=>{
    if(busy||!canEdit)return;
    setBusy(true);
    try {
      let result:OrderQuoteProposal;
      if(action==="submit"){
        await changeOrderQuote(org,orderId,"save",draft as unknown as Record<string,unknown>);
        result=await changeOrderQuote(org,orderId,"submit");
      }else result=await changeOrderQuote(org,orderId,action,
        action==="save"?draft as unknown as Record<string,unknown>:
        action==="reject"?{reason}: {});
      setProposal(result);
      setDraft(snapshot(result));
      if(action==="approve") {
        onApproved?.();
        try {
          const pricing=await readOrderPricingAfterApproval(org,orderId);
          onPricingChange(pricing);
        } catch (pricingError) {
          console.warn("[ORDERS] Orçamento aprovado, atualização do resumo pendente.",pricingError);
        }
      }
      if(action==="reject"){setReason("");setRejectDialogOpen(false);}
      notifyAdmin(action==="save"?"Rascunho salvo.":action==="submit"?"Orçamento enviado para aprovação.":
        action==="approve"?"Orçamento aprovado. A OS está liberada para execução.":
        action==="reject"?"Proposta reprovada.":"Nova versão iniciada para renegociação.","success");
    }catch(err){notifyAdmin(systemErrorMessage(err),"error");}finally{setBusy(false);}
  };
  const sendComment=async()=>{
    if(!comment.trim()||!user?.id||busy)return;
    setBusy(true);
    try{
      await addOrderQuoteComment(org,orderId,user.id,comment);
      setComment("");
      const notes=await listOrderQuoteComments(org,orderId);setComments(notes);
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
        <FTextarea rows={4} label="Diagnóstico" required value={draft.diagnosis} disabled={!editable}
          onChange={(e:any)=>setDraft(current=>({...current,diagnosis:e.target.value}))}/>
        <FTextarea rows={4} label="Solução proposta" required value={draft.proposed_solution} disabled={!editable}
          onChange={(e:any)=>setDraft(current=>({...current,proposed_solution:e.target.value}))}/>
      </div>
    </Section>
    <OrderQuoteCommercialEditor orderId={orderId} draft={draft} onChange={setDraft} disabled={!editable}/>
    {!!proposal?.versions?.length&&<Section title="Histórico de versões">
      <div className="space-y-3">{[...proposal.versions].reverse().map((version:any,i)=>
        <div className="rounded-lg border border-border p-3 text-xs" key={i}>
          <div className="flex justify-between gap-3"><strong><History size={14} className="mr-1 inline"/>Versão {version.version}</strong>
            <span className="text-muted-foreground">{version.submitted_at?new Date(version.submitted_at).toLocaleString("pt-BR"):""}</span>
          </div>
          <p className="mt-1 text-muted-foreground">{Array.isArray(version.items)?version.items.length:0} itens · {version.proposed_solution||"Sem solução"}</p>
        </div>)}</div>
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
        onClick={() => void act("submit")}><Send size={15}/> Enviar para aprovação</BtnPrimary>}
      {proposal?.status==="awaiting_approval" && <>
        <AdminButton variant="secondary" disabled={busy} onClick={()=>void act("renegotiate")}>
          <RotateCcw size={15}/> Renegociar</AdminButton>
        <AdminButton variant="secondary" disabled={busy} onClick={()=>setRejectDialogOpen(true)}>
          <XCircle size={15}/> Reprovar</AdminButton>
        <BtnPrimary disabled={busy} loading={busy} onClick={()=>void act("approve")}>
          <CheckCircle2 size={15}/> Aprovar</BtnPrimary>
      </>}
      {proposal?.status==="rejected" && <BtnPrimary disabled={busy} loading={busy}
        onClick={()=>void act("renegotiate")}><RotateCcw size={15}/> Nova versão</BtnPrimary>}
      {(proposal?.status==="awaiting_approval" || proposal?.status==="approved") && <AdminButton variant="secondary" disabled={busy}
        onClick={() => { if(proposal)try{printQuote(order,proposal,draft);}catch(e){notifyAdmin(systemErrorMessage(e),"error");} }}>
        <FileText size={15}/> Imprimir / PDF</AdminButton>}
      {proposal?.status==="approved" && <BtnPrimary onClick={()=>setShowExecution(true)}>
        Abrir produtos e serviços para execução</BtnPrimary>}
    </>,footerHost)}
    <AdminDialog open={rejectDialogOpen} onClose={()=>{if(!busy)setRejectDialogOpen(false);}}
      title="Reprovar orçamento" description="Informe o motivo da reprovação da proposta.">
      <div className="space-y-4">
        <FInput label="Motivo da reprovação" required value={reason} disabled={busy}
          onChange={(e:any)=>setReason(e.target.value)}/>
        <div className="flex justify-end gap-2">
          <BtnSecondary disabled={busy} onClick={()=>setRejectDialogOpen(false)}>Voltar</BtnSecondary>
          <BtnPrimary disabled={busy||!reason.trim()} loading={busy} onClick={()=>void act("reject")}>Confirmar reprovação</BtnPrimary>
        </div>
      </div>
    </AdminDialog>
  </>;
}
