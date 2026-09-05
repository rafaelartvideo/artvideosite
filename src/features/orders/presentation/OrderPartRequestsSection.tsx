import type React from "react";
import { AlertTriangle, Check, X } from "lucide-react";
import { cn } from "@/shared/domain/formatters";
import { AdminCard, Section } from "@/shared/ui/admin/AdminLayout";
import { purposeLabel } from "../application/part-request.formatters";
import type { CustodyAction, PartRequestForReview, PartRequestItemForReview } from "../domain/part-request.types";

type WizardStepState = "done" | "current" | "pending" | "error";

function PartCustodyWizard({ request, orderSolved, getCommittedQuantity }: { request: PartRequestForReview; orderSolved: boolean; getCommittedQuantity: (item: PartRequestItemForReview) => number }) {
  const status = String(request.status || "").toUpperCase();
  const purpose = request.purpose || "RESOLUTION";
  const approved = status === "APPROVED";
  const rejected = status === "REJECTED" || status === "CANCELLED";
  const requestOrderSolved = orderSolved || Boolean(request.service_order?.is_solved || request.service_order?.completed_at);
  const physicalItems = request.items.filter(item => !item.source_test_item_id && Number(item.approved_quantity ?? 0) > 0);
  const dispatchDone = approved && (physicalItems.length === 0 || physicalItems.every(item => Number(item.delivered_quantity ?? 0) >= Number(item.approved_quantity ?? 0)));
  const deliveryDone = dispatchDone && (physicalItems.length === 0 || physicalItems.every(item => Number(item.technician_received_quantity ?? 0) >= Number(item.delivered_quantity ?? 0)));
  const hasReturnPending = request.items.some(item => Number(item.return_pending_quantity ?? 0) > 0);
  const hasReturned = request.items.some(item => Number(item.returned_quantity ?? 0) > 0);
  const hasDamaged = request.items.some(item => Number(item.damaged_quantity ?? 0) > 0);
  const hasCommitted = request.items.some(item => getCommittedQuantity(item) > 0);
  const destinationDone = purpose === "TEST" && deliveryDone && request.items.every(item => Number(item.technician_received_quantity ?? 0) <= Number(item.returned_quantity ?? 0) + Number(item.return_pending_quantity ?? 0) + Number(item.damaged_quantity ?? 0) + getCommittedQuantity(item));
  const step = (label: string, description: string, state: WizardStepState) => ({ label, description, state });
  const stages = [
    step("Solicitação", "Pedido criado pelo técnico", "done"),
    step(rejected ? "Não aprovada" : "Aprovação do gestor", rejected ? (status === "CANCELLED" ? "Solicitação cancelada" : "Pedido rejeitado pelo gestor") : approved ? "Quantidades aprovadas" : "Aguardando análise do gestor", rejected ? "error" : approved ? "done" : "current"),
    step("Saída do estoque", physicalItems.length === 0 && approved ? "Peça já estava com o técnico" : dispatchDone ? "Saída confirmada pelo estoquista" : approved ? "Aguardando confirmação do estoquista" : "Disponível após aprovação", dispatchDone ? "done" : approved ? "current" : "pending"),
    step("Entrega ao técnico", deliveryDone ? "Recebimento confirmado pelo gestor" : dispatchDone ? "Aguardando confirmação do gestor" : "Disponível após a saída", deliveryDone ? "done" : dispatchDone ? "current" : "pending"),
    ...(purpose === "TEST" ? [
      step("Destino da peça", destinationDone ? (hasCommitted && requestOrderSolved ? "Peça utilizada na resolução da OS" : hasCommitted ? "Peça destinada à resolução" : hasDamaged ? "Resultado e danos registrados" : "Resultado do teste registrado") : deliveryDone ? "Aguardando uso, devolução ou dano" : "Disponível após a entrega", destinationDone ? "done" as WizardStepState : deliveryDone ? "current" as WizardStepState : "pending" as WizardStepState),
      step("Retorno ao estoque", hasReturnPending ? "Aguardando estoquista confirmar recebimento" : hasReturned ? "Recebimento confirmado e saldo reposto" : hasCommitted ? (requestOrderSolved ? "Peça utilizada na resolução" : "Peça reservada para resolução") : destinationDone ? "Sem devolução pendente" : "Disponível quando houver devolução", hasReturnPending ? "current" as WizardStepState : hasReturned || destinationDone ? "done" as WizardStepState : "pending" as WizardStepState),
    ] : [
      step("Uso na resolução", requestOrderSolved ? "Peça registrada na solução da OS" : deliveryDone ? "Disponível para resolver a OS" : "Disponível após a entrega", requestOrderSolved ? "done" as WizardStepState : deliveryDone ? "current" as WizardStepState : "pending" as WizardStepState),
    ]),
  ];

  return <AdminCard className="mt-3 min-w-0 p-3 shadow-none">
    <div className="mb-3 flex min-w-0 items-center justify-between gap-2"><div className="min-w-0"><p className="text-[11px] font-black uppercase tracking-wider text-[#0d1b2e]">Fluxo das peças</p><p className="text-[10px] text-[#5a6a82]">{purpose === "TEST" ? "Pedido para teste" : "Pedido para resolução"}</p></div>{stages.some(stage => stage.state === "current") && <span className="shrink-0 rounded-full bg-amber-100 px-2 py-1 text-[10px] font-bold text-amber-700">Aguardando ação</span>}</div>
    <div className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">{stages.map((stage, index) => <AdminCard key={`${stage.label}-${index}`} className={cn("min-w-0 p-2.5 shadow-none", stage.state === "done" ? "border-emerald-200 bg-emerald-50" : stage.state === "current" ? "border-amber-300 bg-amber-50 ring-1 ring-amber-200" : stage.state === "error" ? "border-red-200 bg-red-50" : "bg-[#f8fafc] opacity-70")}><div className="flex min-w-0 items-start gap-2"><span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-black", stage.state === "done" ? "bg-emerald-600 text-white" : stage.state === "current" ? "bg-amber-500 text-white" : stage.state === "error" ? "bg-red-600 text-white" : "bg-[#dfe5ee] text-[#5a6a82]")}>{stage.state === "done" ? <Check size={12} /> : stage.state === "error" ? <X size={12} /> : index + 1}</span><div className="min-w-0"><p className={cn("break-words text-[11px] font-bold", stage.state === "error" ? "text-red-700" : "text-[#0d1b2e]")}>{stage.label}</p><p className="mt-0.5 break-words text-[10px] leading-snug text-[#5a6a82]">{stage.description}</p></div></div></AdminCard>)}</div>
  </AdminCard>;
}

export function OrderPartRequestsSection({ requests, assignedTo, currentUserId, orderSolved = false, hasPermission, formatDate, getCommittedQuantity, getPendingQuantity, onApprove, onReject, onDelivery, onTestResult }: {
  requests: PartRequestForReview[];
  assignedTo?: string | null;
  currentUserId?: string | null;
  orderSolved?: boolean;
  hasPermission: (permission: string) => boolean;
  formatDate: (value?: string | null, time?: boolean) => string;
  getCommittedQuantity: (item: PartRequestItemForReview) => number;
  getPendingQuantity: (request: PartRequestForReview, item: PartRequestItemForReview) => number;
  onApprove: (event: React.MouseEvent<HTMLButtonElement>, request: PartRequestForReview) => void;
  onReject: (event: React.MouseEvent<HTMLButtonElement>, request: PartRequestForReview) => void;
  onDelivery: (request: PartRequestForReview, action?: CustodyAction) => void;
  onTestResult: (request: PartRequestForReview) => void;
}) {
  return <Section title="Solicitações de peças">{requests.length === 0 ? <p className="text-xs text-[#5a6a82]">Nenhuma solicitação de peças para esta OS.</p> : <div className="min-w-0 space-y-3">{requests.map(request => {
    const status = String(request.status || "").toUpperCase();
    const purpose = request.purpose || "RESOLUTION";
    const hasDeliveredItems = request.items.some(item => Number(item.delivered_quantity ?? 0) > 0);
    const hasPendingDispatch = request.items.some(item => !item.source_test_item_id && Number(item.approved_quantity ?? 0) > Number(item.delivered_quantity ?? 0));
    const hasPendingDeliveryConfirmation = request.items.some(item => Number(item.delivered_quantity ?? 0) > Number(item.technician_received_quantity ?? 0));
    const hasReturnableItems = request.items.some(item => Number(item.technician_received_quantity ?? 0) - Number(item.returned_quantity ?? 0) - Number(item.return_pending_quantity ?? 0) - Number(item.damaged_quantity ?? 0) > 0);
    const hasPendingReturnReceipt = request.items.some(item => Number(item.return_pending_quantity ?? 0) > 0);
    const hasPendingTestResult = purpose === "TEST" && request.items.some(item => getPendingQuantity(request, item) > 0);
    const statusLabel = status === "APPROVED" ? "Aprovada" : status === "REJECTED" ? "Rejeitada" : status === "CANCELLED" ? "Cancelada" : "Em análise";
    const statusClass = status === "APPROVED" ? "bg-green-100 text-green-700" : status === "REJECTED" ? "bg-red-100 text-red-700" : status === "CANCELLED" ? "bg-[#f5f7fa] text-[#5a6a82]" : "bg-amber-100 text-amber-700";
    return <AdminCard key={request.id} className="min-w-0 bg-[#f8fafc] p-3 shadow-none">
      <div className="flex min-w-0 flex-wrap items-center gap-2"><span className={cn("shrink-0 rounded-full px-2 py-1 text-[10px] font-bold", statusClass)}>{statusLabel}</span><span className="shrink-0 rounded-full bg-blue-100 px-2 py-1 text-[10px] font-bold text-blue-700">{purposeLabel(purpose)}</span><span className="min-w-0 basis-full break-words text-[11px] text-[#5a6a82] sm:ml-auto sm:basis-auto sm:text-right">{request.requester?.full_name || "Solicitante não informado"} · {formatDate(request.created_at, true)}</span></div>
      {request.notes && <p className="mt-2 break-words whitespace-pre-line text-xs text-[#0d1b2e]">{request.notes}</p>}
      <PartCustodyWizard request={request} orderSolved={orderSolved} getCommittedQuantity={getCommittedQuantity} />
      <div className="mt-2 min-w-0 space-y-2">{request.items.map(item => {
        const unit = item.inventory_item?.unit || "un";
        const delivered = Math.max(0, Number(item.delivered_quantity ?? 0));
        const received = Math.max(0, Number(item.technician_received_quantity ?? 0));
        const returnPending = Math.max(0, Number(item.return_pending_quantity ?? 0));
        const returned = Math.max(0, Number(item.returned_quantity ?? 0));
        const damaged = Math.max(0, Number(item.damaged_quantity ?? 0));
        const committed = purpose === "TEST" ? getCommittedQuantity(item) : 0;
        const pending = purpose === "TEST" ? getPendingQuantity(request, item) : 0;
        const requestOrderSolved = orderSolved || Boolean(request.service_order?.is_solved || request.service_order?.completed_at);
        return <AdminCard key={item.id} className="min-w-0 p-2.5 shadow-none"><p className="break-words text-xs font-semibold text-[#0d1b2e]">{item.inventory_item?.name || "Peça"}</p><p className="mt-0.5 break-words text-[11px] text-[#5a6a82]">Solicitado: {Number(item.quantity)} {unit}{item.approved_quantity != null && ` · Aprovado: ${Number(item.approved_quantity)} ${unit}`}</p>{item.source_test_item_id && <span className="mt-1 inline-flex max-w-full rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700">Origem: peça testada</span>}{(delivered > 0 || item.source_test_item_id || committed > 0) && <div className="mt-2 grid min-w-0 grid-cols-2 gap-1 text-[10px] sm:grid-cols-3 xl:grid-cols-7">{delivered > 0 && <span className="min-w-0 rounded bg-blue-50 px-2 py-1 text-blue-700">Saída: {delivered} {unit}</span>}{delivered > 0 && <span className="min-w-0 rounded bg-cyan-50 px-2 py-1 text-cyan-700">Recebida pelo técnico: {received} {unit}</span>}{returnPending > 0 && <span className="min-w-0 rounded bg-amber-50 px-2 py-1 text-amber-700">Devolução pendente: {returnPending} {unit}</span>}{returned > 0 && <span className="min-w-0 rounded bg-emerald-50 px-2 py-1 text-emerald-700">Recebida no estoque: {returned} {unit}</span>}{damaged > 0 && <span className="min-w-0 rounded bg-red-50 px-2 py-1 text-red-700">Danificada: {damaged} {unit}</span>}{purpose === "TEST" && committed > 0 && <span className="min-w-0 rounded bg-violet-50 px-2 py-1 text-violet-700">{requestOrderSolved ? "Usada na resolução" : "Para resolução"}: {committed} {unit}</span>}{purpose === "TEST" && pending > 0 && <span className="min-w-0 rounded bg-amber-50 px-2 py-1 text-amber-700">Aguardando: {pending} {unit}</span>}{purpose === "RESOLUTION" && item.source_test_item_id && requestOrderSolved && <span className="min-w-0 rounded bg-emerald-50 px-2 py-1 text-emerald-700">Usada na resolução: {Number(item.approved_quantity ?? item.quantity)} {unit}</span>}</div>}</AdminCard>;
      })}</div>
      {status !== "PENDING" && (request.reviewed_by_profile?.full_name || request.reviewed_at || request.review_notes) && <div className="mt-2 break-words border-t border-[#0d1b2e]/8 pt-2 text-[11px] text-[#5a6a82]">Analisado por {request.reviewed_by_profile?.full_name || "Responsável não informado"}{request.reviewed_at ? ` em ${formatDate(request.reviewed_at, true)}` : ""}{request.review_notes ? ` · ${request.review_notes}` : ""}</div>}
      {status === "APPROVED" && purpose === "TEST" && hasDeliveredItems && <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[11px] text-amber-800"><AlertTriangle size={14} className="mt-0.5 shrink-0" /><span>Peças já entregues — a análise não pode mais ser revertida.</span></div>}
      <div className="mt-3 grid min-w-0 grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:justify-end">
        {hasPermission("orders.manage_part_requests") && status === "PENDING" && <><button type="button" onClick={event => onApprove(event, request)} className="min-w-0 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700">Aprovar</button><button type="button" onClick={event => onReject(event, request)} className="min-w-0 rounded-lg bg-red-600 px-3 py-2 text-xs font-bold text-white hover:bg-red-700">Rejeitar</button></>}
        {hasPermission("orders.manage_part_requests") && status === "REJECTED" && <button type="button" onClick={event => onApprove(event, request)} className="min-w-0 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700">Aprovar</button>}
        {hasPermission("orders.manage_part_requests") && status === "APPROVED" && !hasDeliveredItems && <button type="button" onClick={event => onReject(event, request)} className="min-w-0 rounded-lg bg-amber-600 px-3 py-2 text-xs font-bold text-white hover:bg-amber-700">Desaprovar</button>}
        {hasPermission("orders.dispatch_parts") && status === "APPROVED" && hasPendingDispatch && <button type="button" onClick={() => onDelivery(request, "DISPATCH")} className="min-w-0 rounded-lg bg-[#0057e7] px-3 py-2 text-xs font-bold text-white hover:bg-[#0046c0]">Confirmar saída</button>}
        {hasPermission("orders.confirm_part_delivery") && status === "APPROVED" && hasPendingDeliveryConfirmation && <button type="button" onClick={() => onDelivery(request, "CONFIRM_DELIVERY")} className="min-w-0 rounded-lg bg-cyan-600 px-3 py-2 text-xs font-bold text-white hover:bg-cyan-700">Confirmar entrega ao técnico</button>}
        {hasPermission("orders.register_part_return") && status === "APPROVED" && hasReturnableItems && <button type="button" onClick={() => onDelivery(request, "REGISTER_RETURN")} className="min-w-0 rounded-lg bg-amber-600 px-3 py-2 text-xs font-bold text-white hover:bg-amber-700">Registrar devolução</button>}
        {hasPermission("orders.receive_returned_parts") && status === "APPROVED" && hasPendingReturnReceipt && <button type="button" onClick={() => onDelivery(request, "RECEIVE_RETURN")} className="min-w-0 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700">Confirmar retorno ao estoque</button>}
        {hasPermission("orders.record_test_results") && status === "APPROVED" && purpose === "TEST" && hasDeliveredItems && hasPendingTestResult && currentUserId === assignedTo && <button type="button" onClick={() => onTestResult(request)} className="min-w-0 rounded-lg border border-[#0057e7]/30 px-3 py-2 text-xs font-bold text-[#0057e7]">Registrar resultado do teste</button>}
      </div>
    </AdminCard>;
  })}</div>}</Section>;
}
