import { INPUT } from "@/shared/ui/admin/AdminFormControls";
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClipboardCopy, Clock3, Download, Edit2, FileText, History, Link2, MoreHorizontal, PackageCheck, ReceiptText, ShoppingCart, UserRound } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { formatCurrency } from "@/shared/domain/formatters";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { AdminButton, AdminDialog } from "@/shared/ui/admin/AdminLayout";
import {DropdownMenu,DropdownMenuContent,DropdownMenuItem,DropdownMenuTrigger} from "@/shared/ui/primitives/dropdown-menu";
import { LoadingState } from "@/shared/ui/admin/AdminFeedback";
import { changeSalesProposalStatus, createSalesProposalApprovalLink, getSalesProposalDetail,
  type SalesProposalDetail } from "../infrastructure/sales-proposals.repository";
import { formatSalesDate, formatSalesDueDate } from "../domain/sales-order-display";
import { downloadSalesProposalPdf } from "../application/sales-proposal-pdf";
import {
  listSalesProposalReservations,releaseSalesProposalReservation,reserveSalesProposal,
} from "../infrastructure/sales-operations.repository";

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
  const historyRef=useRef<HTMLElement|null>(null);
  const client = useQueryClient();
  const [action,setAction] = useState<ProposalAction|null>(null);
  const [reason,setReason] = useState("");
  const [errorText,setErrorText] = useState<string|null>(null);
  const [feedback,setFeedback] = useState<string|null>(null);
  const [pdfBusy,setPdfBusy] = useState(false);
  const [approvalLink,setApprovalLink]=useState<string|null>(null);
  const [approvalExpires,setApprovalExpires]=useState<string|null>(null);
  const [reserveDays,setReserveDays]=useState(7);
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
  const canReserve=hasPermission("sales.reservations.manage");
  const reservationsQuery=useQuery({
    queryKey:["sales",organizationId,"proposal-reservations",id],
    queryFn:()=>listSalesProposalReservations(organizationId,id),
    enabled:Boolean(organizationId&&id),staleTime:10_000,
  });
  const activeReservations=(reservationsQuery.data||[]).filter(item=>item.status==="active");
  const linkMutation=useMutation({
    mutationFn:()=>createSalesProposalApprovalLink(organizationId,id),
    onSuccess:data=>{
      const url=window.location.origin+"/vendas/aprovar/"+data.token;
      setApprovalLink(url);setApprovalExpires(data.expires_at);
      setFeedback("Link pronto. Compartilhe com o cliente; ele expira em até 72 horas.");
      void client.invalidateQueries({queryKey:["sales",organizationId,"proposal",id]});
    },
    onError:error=>setFeedback(systemErrorMessage(error,"Não foi possível gerar link de aprovação.")),
  });
  const reservationMutation=useMutation({
    mutationFn:()=>reserveSalesProposal(organizationId,id,reserveDays),
    onSuccess:()=>{
      setFeedback("Mercadorias reservadas. A conversão em pedido libera a reserva e baixa o estoque uma só vez.");
      void client.invalidateQueries({queryKey:["sales",organizationId]});
      onChanged("Reserva registrada para a proposta.");
    },
    onError:error=>setFeedback(systemErrorMessage(error,"Não foi possível reservar mercadorias.")),
  });
  const releaseMutation=useMutation({
    mutationFn:()=>releaseSalesProposalReservation(organizationId,id,"Liberação manual pelo responsável."),
    onSuccess:()=>{
      setFeedback("Reserva liberada. O estoque físico não foi alterado.");
      void client.invalidateQueries({queryKey:["sales",organizationId]});
      onChanged("Reserva de estoque liberada.");
    },
    onError:error=>setFeedback(systemErrorMessage(error,"Não foi possível liberar a reserva.")),
  });

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

  const shareWhatsApp=()=>{
    if(!proposal)return;
    const digits=String(proposal.customer_whatsapp||"").replace(/\D/g,"");
    const normalized=digits.startsWith("55")?digits:"55"+digits;
    const message=[
      "Olá, "+proposal.customer_name_snapshot+"!",
      "Segue a proposta comercial #"+proposal.proposal_number+".",
      "Total: "+formatCurrency(proposal.total_amount),
      "Validade: "+formatSalesDueDate(proposal.valid_until)+".",
      approvalLink?"Acesse para aprovar ou recusar: "+approvalLink:
        "Responda esta mensagem para confirmar sua decisão.",
    ].join("\n");
    if(!digits || normalized.length<12){
      setFeedback("Cliente sem WhatsApp válido. Use Copiar resumo ou Link de aprovação.");
      return;
    }
    window.open("https://wa.me/"+normalized+"?text="+encodeURIComponent(message),
      "_blank","noopener,noreferrer");
    setFeedback("WhatsApp aberto com a mensagem preparada. Confira e envie ao cliente.");
  };
  const copyApprovalLink=async()=>{
    if(!approvalLink)return;
    try{
      await navigator.clipboard.writeText(approvalLink);
      setFeedback("Link de aprovação copiado. Compartilhe com o cliente.");
    }catch{setFeedback("Não foi possível copiar o link automaticamente.");}
  };
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

  const downloadPdf=async()=>{
    if(!proposal || pdfBusy)return;
    setPdfBusy(true);setFeedback(null);
    try{
      await downloadSalesProposalPdf(organizationId,proposal);
      setFeedback("PDF da proposta preparado.");
    }catch(error){
      setFeedback(systemErrorMessage(error,"Não foi possível gerar o PDF da proposta."));
    }finally{
      setPdfBusy(false);
    }
  };
  const showAction=(next:ProposalAction)=>{
    setAction(next);setReason("");setErrorText(null);
  };
  const canReopen=Boolean(proposal && (
    proposal.status==="rejected" || proposal.status==="sent" ||
    (proposal.status==="approved" && canApprove)
  ));

  return <>
    <AdminDialog open title={"Proposta #"+(proposal?.proposal_number||"…")}
      description="Itens, negociação, histórico e conversão em pedido"
      onClose={onClose}
      className="w-[calc(100vw-1.25rem)] max-w-3xl"
      bodyClassName="max-h-[min(75dvh,760px)] overflow-y-auto"
      footer={<div className="flex w-full flex-wrap items-center justify-end gap-2">
        {proposal&&<DropdownMenu>
          <DropdownMenuTrigger asChild>
            <AdminButton size="sm" variant="secondary" ariaLabel="Ações da proposta">
              <MoreHorizontal size={16}/> Ações
            </AdminButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="end" className="z-[360] max-h-[min(70dvh,460px)] min-w-[230px]">
            <DropdownMenuItem onSelect={()=>historyRef.current?.scrollIntoView({behavior:"smooth",block:"start"})}>
              <History size={15} className="mr-2"/> Visualizar histórico
            </DropdownMenuItem>
            <DropdownMenuItem disabled={pdfBusy} onSelect={()=>void downloadPdf()}>
              <Download size={15} className="mr-2"/> Baixar PDF
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={()=>void copySummary()}>
              <ClipboardCopy size={15} className="mr-2"/> Copiar resumo
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={shareWhatsApp}>
              <Link2 size={15} className="mr-2"/> Compartilhar no WhatsApp
            </DropdownMenuItem>
            {canManage&&status==="draft"&&<DropdownMenuItem onSelect={()=>{onEdit(proposal);onClose();}}>
              <Edit2 size={15} className="mr-2"/> Editar proposta
            </DropdownMenuItem>}
            {canManage&&canReopen&&<DropdownMenuItem onSelect={()=>showAction("draft")}>
              <FileText size={15} className="mr-2"/> Reabrir negociação
            </DropdownMenuItem>}
            {canManage&&status==="sent"&&<DropdownMenuItem disabled={linkMutation.isPending}
              onSelect={()=>linkMutation.mutate()}>
              <Link2 size={15} className="mr-2"/> Gerar link de aprovação
            </DropdownMenuItem>}
            {canManage&&status==="draft"&&<DropdownMenuItem onSelect={()=>showAction("sent")}>
              <FileText size={15} className="mr-2"/> Marcar como enviada
            </DropdownMenuItem>}
            {canManage&&status==="sent"&&<DropdownMenuItem onSelect={()=>showAction("rejected")}>
              <FileText size={15} className="mr-2"/> Registrar recusa
            </DropdownMenuItem>}
            {canManage&&canApprove&&status==="sent"&&<DropdownMenuItem onSelect={()=>showAction("approved")}>
              <PackageCheck size={15} className="mr-2"/> Registrar aprovação
            </DropdownMenuItem>}
            {canManage&&(status==="draft"||status==="sent")&&<DropdownMenuItem
              variant="destructive" onSelect={()=>showAction("cancelled")}>
              Cancelar proposta
            </DropdownMenuItem>}
          </DropdownMenuContent>
        </DropdownMenu>}
        {proposal&&status==="approved"&&canSell&&Number(proposal.discount_amount)>0&&!hasPermission("sales.discount")&&
          <p className="max-w-52 text-xs text-muted-foreground">A conversão desta proposta com desconto exige autorização.</p>}
        {proposal&&status==="approved"&&canSell&&(Number(proposal.discount_amount)===0||hasPermission("sales.discount"))&&
          <AdminButton size="sm" onClick={()=>{onConvert(proposal);onClose();}}>
            <ShoppingCart size={15}/> Converter em pedido
          </AdminButton>}
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
          {approvalLink&&<div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3">
            <p className="text-xs font-semibold">Link individual de aprovação</p>
            <div className="flex flex-wrap gap-2">
              <AdminButton variant="secondary" size="sm" onClick={()=>void copyApprovalLink()}>
                <ClipboardCopy size={14}/> Copiar link
              </AdminButton>
              <AdminButton variant="secondary" size="sm" onClick={shareWhatsApp}>
                Compartilhar no WhatsApp
              </AdminButton>
            </div>
            <p className="break-all text-xs text-muted-foreground">{approvalLink}</p>
            {approvalExpires&&<p className="text-xs text-muted-foreground">
              Expira: {formatSalesDate(approvalExpires)}
            </p>}
            <p className="text-xs text-muted-foreground">Ao gerar outro link, o anterior será invalidado.</p>
          </div>}
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
              <div className="flex flex-wrap items-center gap-2">
                <AdminButton variant="secondary" size="sm" onClick={()=>void downloadPdf()}
                  disabled={pdfBusy} loading={pdfBusy}>
                  <Download size={14}/> PDF
                </AdminButton>
                <AdminButton variant="secondary" size="sm" onClick={shareWhatsApp}>
                  WhatsApp
                </AdminButton>
                <AdminButton variant="secondary" size="sm" onClick={()=>void copySummary()}>
                  <ClipboardCopy size={14}/> Copiar resumo
                </AdminButton>
              </div>
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
          <section className="space-y-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <PackageCheck size={15}/> Reserva de mercadorias
            </h3>
            {activeReservations.length>0?<div className="space-y-2 rounded-lg border border-border p-3">
              <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                {activeReservations.length} {activeReservations.length===1?"item reservado":"itens reservados"}
              </p>
              {activeReservations.map(entry=><div key={entry.id}
                className="flex justify-between gap-3 text-xs">
                <span>{entry.product_name} · {entry.quantity_base} un. base</span>
                <span className="shrink-0 text-muted-foreground">{formatSalesDate(entry.expires_at)}</span>
              </div>)}
              {canReserve&&<AdminButton size="sm" variant="secondary"
                loading={releaseMutation.isPending} onClick={()=>releaseMutation.mutate()}>
                Liberar reserva
              </AdminButton>}
            </div>:<p className="text-xs text-muted-foreground">
              Esta proposta não tem reserva ativa. Só reserve quando tiver aprovação e confirmação do cliente.
            </p>}
            {canReserve&&status==="approved"&&<div className="flex flex-wrap items-end gap-2">
              <label className="space-y-1 text-xs font-semibold">
                <span className="block">Reservar por</span>
                <select value={reserveDays} onChange={e=>setReserveDays(Number(e.target.value))}
                  className={INPUT+" h-9 px-2 text-xs"}>
                  {[1,3,7,15,30].map(days=><option key={days} value={days}>{days} dias</option>)}
                </select>
              </label>
              <AdminButton size="sm" disabled={reservationMutation.isPending}
                loading={reservationMutation.isPending} onClick={()=>reservationMutation.mutate()}>
                {activeReservations.length?"Renovar reserva":"Reservar estoque"}
              </AdminButton>
            </div>}
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
          <section ref={historyRef} className="space-y-2">
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
          (action==="approved"&&reason.trim().length<3)||
          (action==="draft"&&proposal?.status==="approved"&&reason.trim().length<5)}
          loading={changeMutation.isPending} onClick={()=>changeMutation.mutate()}>Confirmar</AdminButton>
      </div>}>
      <label className="block space-y-1.5">
        <span className="text-xs font-semibold">
          {action==="approved"?"Como o cliente aprovou?":
            action==="draft"&&proposal?.status==="approved"?"Motivo da renegociação":
            "Observações (opcional)"}
        </span>
        <textarea value={reason} rows={3} maxLength={500}
          onChange={event=>setReason(event.target.value)}
          placeholder={action==="approved"?"Ex.: Aprovado pelo cliente via WhatsApp":
            action==="draft"&&proposal?.status==="approved"?"Ex.: preço alterado; precisa de nova aprovação":
            "Observações da negociação"}
          className="w-full resize-y rounded-lg border border-border bg-background p-3 text-sm"/>
      </label>
      {errorText&&<p role="alert" className="mt-2 text-xs text-destructive">{errorText}</p>}
    </AdminDialog>}
  </>;
}
