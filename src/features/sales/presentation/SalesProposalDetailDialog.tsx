import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardCopy, Clock3, FileText, ReceiptText, ShoppingCart, UserRound } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { formatCurrency } from "@/shared/domain/formatters";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { AdminButton, AdminDialog } from "@/shared/ui/admin/AdminLayout";
import { LoadingState } from "@/shared/ui/admin/AdminFeedback";
import { changeSalesProposalStatus, getSalesProposalDetail,
  type SalesProposalDetail } from "../infrastructure/sales-proposals.repository";
import { formatSalesDate, formatSalesDueDate } from "../domain/sales-order-display";

const labels: Record<string,string> = {
  draft:"Rascunho",sent:"Enviada",approved:"Aprovada",rejected:"Recusada",
  converted:"Convertida",expired:"Vencida",cancelled:"Cancelada",
};
const events: Record<string,string> = {
  created:"Proposta criada",revised:"Proposta revisada",sent:"Envio registrado",
  approved:"Aprovação do cliente registrada",rejected:"Recusa registrada",
  reopened:"Negociação reaberta",converted:"Convertida em pedido",cancelled:"Cancelada",
};

type ProposalAction = "sent" | "approved" | "rejected" | "draft" | "cancelled";

export function SalesProposalDetailDialog({
  organizationId,id,onClose,onEdit,onConvert,onChanged,
}: {
  organizationId:string;
  id:string;
  onClose:()=>void;
  onEdit:(proposal:SalesProposalDetail)=>void;
  onConvert:(proposal:SalesProposalDetail)=>void;
  onChanged:(message:string)=>void;
}) {
  const { hasPermission } = useAuth();
  const client = useQueryClient();
  const [action,setAction] = useState<ProposalAction|null>(null);
  const [reason,setReason] = useState("");
  const [errorText,setErrorText] = useState<string|null>(null);
  const [feedback,setFeedback] = useState<string|null>(null);
  const canManage=hasPermission("sales.proposals.manage");
  const canApprove=hasPermission("sales.proposals.approve");
  const canSell=hasPermission("sales.create");

  const detailQuery=useQuery({
    queryKey:["sales",organizationId,"proposal",id],
    queryFn:()=>getSalesProposalDetail(organizationId,id),
    enabled:Boolean(organizationId&&id),staleTime:10_000,
  });
  const proposal=detailQuery.data;
  const status=proposal?.effective_status||"draft";

  const changeMutation=useMutation({
    mutationFn:()=>changeSalesProposalStatus(organizationId,id,action!,reason.trim()),
    onSuccess:()=>{
      const result=action;
      setAction(null);
      setReason("");
      setErrorText(null);
      void client.invalidateQueries({queryKey:["sales",organizationId]});
      onChanged("Proposta "+(result==="approved"?"aprovada":result==="sent"?"marcada como enviada":result==="rejected"?"recusada":result==="draft"?"reaberta":"cancelada")+".");
    },
    onError:error=>setErrorText(systemErrorMessage(error,"Não foi possível atualizar a proposta.")),
  });

  const copySummary=async()=>{
    if(!proposal)return;
    const content=[
      "Proposta comercial #"+proposal.proposal_number,
      "Cliente: "+proposal.customer_name_snapshot,
      "Validade: "+formatSalesDueDate(proposal.valid_until),
      "",
      ...proposal.items.map(item=>item.name+" — "+item.quantity+" × "+formatCurrency(item.unit_price)
        +" = "+formatCurrency(item.line_total)),
      "",
      "Subtotal: "+formatCurrency(proposal.subtotal),
      "Desconto: "+formatCurrency(proposal.discount_amount),
      "Total: "+formatCurrency(proposal.total_amount),
      proposal.notes?"Condições: "+proposal.notes:"",
      "",
      "Esta mensagem é um resumo comercial. Confirme a aprovação com o vendedor.",
    ].filter(Boolean).join("\n");
    try{
      await navigator.clipboard.writeText(content);
      setFeedback("Resumo copiado. Envie ao cliente pelo canal desejado.");
    }catch{
      setFeedback("Não foi possível copiar automaticamente. Verifique as permissões do navegador.");
    }
  };

  const showAction=(next:ProposalAction)=>{
    setAction(next);setReason("");setErrorText(null);
  };
  const canReopen=Boolean(proposal && (
    proposal.status==="rejected" ||
    (proposal.effective_status==="expired" && proposal.status!=="converted" && proposal.status!=="cancelled")
  ));

  return <>
    <AdminDialog open title={"Proposta #"+(proposal?.proposal_number||"…")}
      description="Itens, negociação, histórico e conversão em pedido"
      onClose={onClose}
      className="w-[calc(100vw-1.25rem)] max-w-3xl"
      bodyClassName="max-h-[min(75dvh,760px)] overflow-y-auto"
      footer={<div className="flex w-full flex-wrap justify-end gap-2">
        {proposal && canManage && status==="draft" && <AdminButton size="sm" variant="secondary"
          onClick={()=>{onEdit(proposal);onClose();}}>Editar</AdminButton>}
        {proposal && canManage && canReopen && <AdminButton size="sm" variant="secondary"
          onClick={()=>showAction("draft")}>Reabrir negociação</AdminButton>}
        {proposal && canManage && status==="draft" && <AdminButton size="sm"
          onClick={()=>showAction("sent")}>Marcar como enviada</AdminButton>}
        {proposal && status==="sent" && canManage && <AdminButton size="sm" variant="secondary"
          onClick={()=>showAction("rejected")}>Registrar recusa</AdminButton>}
        {proposal && status==="sent" && canApprove && canManage && <AdminButton size="sm"
          onClick={()=>showAction("approved")}>Registrar aprovação</AdminButton>}
        {proposal && status==="approved" && canSell && <AdminButton size="sm"
          onClick={()=>{onConvert(proposal);onClose();}}>
          <ShoppingCart size={15}/> Converter em pedido
        </AdminButton>}
        {proposal && canManage && (status==="draft"||status==="sent") && <AdminButton size="sm"
          variant="danger" onClick={()=>showAction("cancelled")}>Cancelar</AdminButton>}
        <AdminButton size="sm" variant="secondary" onClick={onClose}>Fechar</AdminButton>
      </div>}>
      {detailQuery.isPending?<div className="py-10"><LoadingState text="Carregando proposta..."/></div>
        :detailQuery.isError||!proposal?<p role="alert" className="py-5 text-sm text-destructive">
          {systemErrorMessage(detailQuery.error,"Não foi possível carregar a proposta.")}
        </p>
        :<div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-semibold text-primary">
              {labels[status]||status}
            </span>
            <span className="text-xs text-muted-foreground">Criada em {formatSalesDate(proposal.created_at)}</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 rounded-xl border border-border p-3">
              <p className="flex items-center gap-2 text-xs font-semibold"><UserRound size={14}/> Cliente</p>
              <p className="break-words text-sm font-bold">{proposal.customer_name_snapshot}</p>
              {proposal.customer_document_snapshot&&<p className="text-xs text-muted-foreground">
                {proposal.customer_document_snapshot}
              </p>}
              <p className="text-xs text-muted-foreground">Validade: {formatSalesDueDate(proposal.valid_until)}</p>
            </div>
            <div className="space-y-1.5 rounded-xl border border-border p-3">
              <p className="flex items-center gap-2 text-xs font-semibold"><ReceiptText size={14}/> Valor da proposta</p>
              <p className="text-xl font-bold tabular-nums">{formatCurrency(proposal.total_amount)}</p>
              <p className="text-xs text-muted-foreground">
                {status==="converted"?"Convertida em pedido comercial.":"Não reserva mercadoria nem gera cobrança até a conversão."}
              </p>
            </div>
          </div>
          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 text-sm font-semibold"><FileText size={15}/> Itens da proposta</h3>
              <AdminButton variant="secondary" size="sm" onClick={()=>void copySummary()}>
                <ClipboardCopy size={14}/> Copiar resumo
              </AdminButton>
            </div>
            <div className="divide-y divide-border overflow-hidden rounded-xl border border-border">
              {proposal.items.map(item=><div key={item.product_id} className="flex min-w-0 justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="break-words text-sm font-semibold">{item.name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {item.quantity} × {formatCurrency(item.unit_price)}{item.sku?" · SKU "+item.sku:""}
                  </p>
                </div>
                <strong className="shrink-0 text-sm tabular-nums">{formatCurrency(item.line_total)}</strong>
              </div>)}
            </div>
            <div className="space-y-1 rounded-lg bg-muted/20 p-3 text-xs">
              <div className="flex justify-between"><span>Subtotal</span><strong>{formatCurrency(proposal.subtotal)}</strong></div>
              <div className="flex justify-between"><span>Desconto</span><strong>{formatCurrency(proposal.discount_amount)}</strong></div>
              <div className="flex justify-between border-t border-border pt-1.5 text-sm">
                <strong>Total</strong><strong>{formatCurrency(proposal.total_amount)}</strong>
              </div>
            </div>
          </section>
          {proposal.notes&&<section className="space-y-1.5">
            <h3 className="text-sm font-semibold">Condições e observações</h3>
            <p className="whitespace-pre-wrap text-sm leading-5 text-muted-foreground">{proposal.notes}</p>
          </section>}
          {feedback&&<p role="status" className="text-xs text-muted-foreground">{feedback}</p>}
          {proposal.status==="converted"&&proposal.converted_order_id&&
            <p className="rounded-lg border border-border p-3 text-xs text-muted-foreground">
              Pedido gerado com sucesso. Consulte em Vendas → Pedidos.
            </p>}
          <section className="space-y-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold"><Clock3 size={15}/> Histórico</h3>
            <div className="divide-y divide-border rounded-lg border border-border">
              {proposal.events.map(event=><div key={event.id} className="p-3 text-xs">
                <p className="font-semibold">{events[event.type]||"Atualização"}</p>
                {event.type==="approved"&&typeof event.data.reason==="string"&&
                  <p className="mt-1 text-muted-foreground">Confirmação: {event.data.reason}</p>}
                <p className="mt-1 text-muted-foreground">{formatSalesDate(event.at)} · {event.by}</p>
              </div>)}
            </div>
          </section>
        </div>}
    </AdminDialog>
    {action&&<AdminDialog open onClose={()=>!changeMutation.isPending&&setAction(null)}
      title={action==="approved"?"Registrar aprovação do cliente":
        action==="rejected"?"Registrar recusa":action==="sent"?"Marcar como enviada":
        action==="draft"?"Reabrir negociação":"Cancelar proposta"}
      description={action==="approved"?"Registre a confirmação comunicada pelo cliente. Esta ação não envia mensagem nem assina em nome dele.":
        "Esta alteração ficará registrada no histórico da proposta."}
      className="max-w-lg"
      footer={<div className="flex w-full justify-end gap-2">
        <AdminButton size="sm" variant="secondary" disabled={changeMutation.isPending}
          onClick={()=>setAction(null)}>Voltar</AdminButton>
        <AdminButton size="sm" disabled={changeMutation.isPending||
          (action==="approved"&&reason.trim().length<3)}
          loading={changeMutation.isPending} onClick={()=>changeMutation.mutate()}>Confirmar</AdminButton>
      </div>}>
      <label className="block space-y-1.5">
        <span className="text-xs font-semibold">
          {action==="approved"?"Como o cliente aprovou?": "Observações (opcional)"}
        </span>
        <textarea value={reason} rows={3} maxLength={500}
          onChange={event=>setReason(event.target.value)}
          placeholder={action==="approved"?"Ex.: Aprovado pelo cliente via WhatsApp":"Observações da negociação"}
          className="w-full resize-y rounded-lg border border-border bg-background p-3 text-sm"/>
      </label>
      {errorText&&<p role="alert" className="mt-2 text-xs text-destructive">{errorText}</p>}
    </AdminDialog>}
  </>;
}
