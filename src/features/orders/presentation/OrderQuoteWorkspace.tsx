import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, History, RotateCcw, Send, XCircle } from "lucide-react";
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
import { OrderQuoteCommercialEditor } from "./OrderQuoteCommercialEditor";
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
function versionPricing(version: Record<string,any>) {
  const items: any[] = Array.isArray(version.items) ? version.items : [];
  const subtotal = items.reduce((sum,item) => sum+Number(item.quantity||0)*Number(item.unit_price||0)+Number(item.additional_cost||0),0);
  const discount = version.discount_type==="percentage"
    ? subtotal*Number(version.discount_value||0)/100
    : Number(version.discount_value||0);
  return { subtotal, discount, total: Math.max(0,subtotal-discount) };
}
export function OrderQuoteWorkspace({order,canEdit,onPricingChange,footerHostId,onStatusChange}:{
  order:any;canEdit:boolean;onPricingChange:(pricing:any)=>void;footerHostId:string;
  onStatusChange?:(status:OrderQuoteProposal["status"])=>void;
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
  const [approvalDialogOpen,setApprovalDialogOpen]=useState(false);
  const [showExecution,setShowExecution]=useState(false);
  const [selectedVersion,setSelectedVersion]=useState<Record<string,any>|null>(null);

  useEffect(()=>{
    setFooterHost(document.getElementById(footerHostId));
  },[footerHostId,orderId]);

  useEffect(()=>{
    setApprovalDialogOpen(false);
    setRejectDialogOpen(false);
  },[orderId]);

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

  const renegotiations = (proposal?.versions||[])
    .filter(version=>Number(version.version)<Number(proposal?.version||1))
    .sort((a,b)=>Number(b.version)-Number(a.version));
  const editable=canEdit&&!order.completed_at&&!order.cancelled_at&&
    (!proposal||proposal.status==="draft"||proposal.status==="renegotiation");
  const act=async(action:"save"|"submit"|"approve"|"reject"|"renegotiate")=>{
    if(busy||!canEdit || (action==="approve" && !approvalDialogOpen))return;
    setBusy(true);
    try {
      let result:OrderQuoteProposal;
      if(action==="submit"){
        await changeOrderQuote(org,orderId,"save",draft as unknown as Record<string,unknown>);
        result=await changeOrderQuote(org,orderId,"submit");
      }else result=await changeOrderQuote(org,orderId,action,
        action==="save"?draft as unknown as Record<string,unknown>:
        action==="reject"?{reason}:
        action==="approve"?{confirmation:"CONFIRMAR_APROVACAO",version:proposal?.version}: {});
      setProposal(result);
      setDraft(snapshot(result));
      onStatusChange?.(result.status);
      if(action==="approve") {
        setApprovalDialogOpen(false);
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
        <FTextarea rows={4} label="Descrição do problema" value={String(order.customer_notes || "")}
          readOnly aria-readonly="true" className="bg-muted/35" placeholder="Não informada na OS" />
        <FTextarea rows={4} label="Diagnóstico" required value={draft.diagnosis} disabled={!editable}
          onChange={(e:any)=>setDraft(current=>({...current,diagnosis:e.target.value}))}/>
        <FTextarea rows={4} label="Solução proposta" required value={draft.proposed_solution} disabled={!editable}
          onChange={(e:any)=>setDraft(current=>({...current,proposed_solution:e.target.value}))}/>
      </div>
    </Section>
    <OrderQuoteCommercialEditor orderId={orderId} draft={draft} onChange={setDraft} disabled={!editable}/>
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
        onClick={() => void act("submit")}><Send size={15}/> Enviar para aprovação</BtnPrimary>}
      {proposal?.status==="awaiting_approval" && <>
        <AdminButton variant="secondary" disabled={busy} onClick={()=>void act("renegotiate")}>
          <RotateCcw size={15}/> Renegociar</AdminButton>
        <AdminButton variant="secondary" disabled={busy} onClick={()=>setRejectDialogOpen(true)}>
          <XCircle size={15}/> Reprovar</AdminButton>
        <BtnPrimary disabled={busy} loading={busy} onClick={()=>setApprovalDialogOpen(true)}>
          <CheckCircle2 size={15}/> Aprovar</BtnPrimary>
      </>}
      {proposal?.status==="rejected" && <BtnPrimary disabled={busy} loading={busy}
        onClick={()=>void act("renegotiate")}><RotateCcw size={15}/> Nova versão</BtnPrimary>}
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
    <AdminDialog open={approvalDialogOpen} onClose={()=>{if(!busy)setApprovalDialogOpen(false);}}
      title="Confirmar aprovação do orçamento"
      description="Esta ação não é automática. Confirme para aplicar os serviços e produtos aprovados à mesma OS."
      footer={<div className="flex w-full flex-wrap justify-end gap-2">
        <BtnSecondary disabled={busy} onClick={()=>setApprovalDialogOpen(false)}>Voltar</BtnSecondary>
        <BtnPrimary disabled={busy||proposal?.status!=="awaiting_approval"}
          loading={busy} onClick={()=>void act("approve")}>
          <CheckCircle2 size={15}/> Confirmar aprovação
        </BtnPrimary>
      </div>}>
      <div className="space-y-3">
        <p className="text-sm text-foreground">Deseja realmente aprovar o orçamento desta OS?</p>
        <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span>Proposta · Versão {proposal?.version||1}</span>
            <strong>{formatCurrency((draft.items||[]).reduce((sum,item)=>
              sum+Number(item.quantity||0)*Number(item.unit_price||0)+Number(item.additional_cost||0),0)-
              (draft.discount_type==="percentage"
                ? (draft.items||[]).reduce((sum,item)=>sum+Number(item.quantity||0)*Number(item.unit_price||0)+Number(item.additional_cost||0),0)*Number(draft.discount_value||0)/100
                : Number(draft.discount_value||0)))}</strong>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{draft.items.length} item(ns) · A aprovação libera a execução da OS.</p>
        </div>
        <p className="text-xs text-muted-foreground">O envio para aprovação não autoriza o orçamento. Somente o botão Confirmar aprovação realiza essa alteração.</p>
      </div>
    </AdminDialog>
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
