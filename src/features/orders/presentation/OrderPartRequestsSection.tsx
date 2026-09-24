import type React from "react";
import { AlertTriangle, Check, ClipboardCheck, PackageCheck, RotateCcw, Truck, Undo2, X } from "lucide-react";
import { cn } from "@/shared/domain/formatters";
import { AdminCard } from "@/shared/ui/admin/AdminLayout";
import { purposeLabel } from "../application/part-request.formatters";
import type { CustodyAction, PartRequestForReview, PartRequestItemForReview } from "../domain/part-request.types";

type WizardStepState = "done" | "current" | "pending" | "error";

type WizardStage = {
  label: string;
  description: string;
  state: WizardStepState;
};

const stageTone = (state: WizardStepState) => {
  if (state === "done") return {
    dot: "bg-emerald-600 text-white",
    panel: "border-emerald-200 bg-emerald-50/70",
    title: "text-emerald-800",
    line: "#059669",
  };
  if (state === "current") return {
    dot: "bg-amber-500 text-white ring-4 ring-amber-100",
    panel: "border-amber-300 bg-amber-50",
    title: "text-amber-800",
    line: "#f59e0b",
  };
  if (state === "error") return {
    dot: "bg-red-600 text-white",
    panel: "border-red-200 bg-red-50/80",
    title: "text-red-700",
    line: "#dc2626",
  };
  return {
    dot: "bg-[#dfe5ee] text-[#5a6a82]",
    panel: "border-[#0d1b2e]/10 bg-[#f8fafc]",
    title: "text-[#5a6a82]",
    line: "#cbd5e1",
  };
};

function PartCustodyWizard({ request, orderSolved, getCommittedQuantity }: {
  request: PartRequestForReview;
  orderSolved: boolean;
  getCommittedQuantity: (item: PartRequestItemForReview) => number;
}) {
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
  const step = (label: string, description: string, state: WizardStepState): WizardStage => ({ label, description, state });
  const stages: WizardStage[] = [
    step("Solicitação", "Pedido criado pelo técnico", "done"),
    step(
      rejected ? "Não aprovada" : "Aprovação do gestor",
      rejected ? (status === "CANCELLED" ? "Solicitação cancelada" : "Pedido rejeitado pelo gestor") : approved ? "Quantidades aprovadas" : "Aguardando análise do gestor",
      rejected ? "error" : approved ? "done" : "current",
    ),
    step(
      "Saída do estoque",
      physicalItems.length === 0 && approved ? "Peça já estava com o técnico" : dispatchDone ? "Saída confirmada pelo estoquista" : approved ? "Aguardando confirmação do estoquista" : "Disponível após aprovação",
      dispatchDone ? "done" : approved ? "current" : "pending",
    ),
    step(
      "Entrega ao técnico",
      deliveryDone ? "Recebimento confirmado pelo gestor" : dispatchDone ? "Aguardando confirmação do gestor" : "Disponível após a saída",
      deliveryDone ? "done" : dispatchDone ? "current" : "pending",
    ),
    ...(purpose === "TEST" ? [
      step(
        "Destino da peça",
        destinationDone ? (hasCommitted && requestOrderSolved ? "Peça utilizada na resolução da OS" : hasCommitted ? "Peça destinada à resolução" : hasDamaged ? "Resultado e danos registrados" : "Resultado do teste registrado") : deliveryDone ? "Aguardando uso, devolução ou dano" : "Disponível após a entrega",
        destinationDone ? "done" : deliveryDone ? "current" : "pending",
      ),
      step(
        "Retorno ao estoque",
        hasReturnPending ? "Aguardando estoquista confirmar recebimento" : hasReturned ? "Recebimento confirmado e saldo reposto" : hasCommitted ? (requestOrderSolved ? "Peça utilizada na resolução" : "Peça reservada para resolução") : destinationDone ? "Sem devolução pendente" : "Disponível quando houver devolução",
        hasReturnPending ? "current" : hasReturned || destinationDone ? "done" : "pending",
      ),
    ] : [
      step(
        "Uso na resolução",
        requestOrderSolved ? "Peça registrada na solução da OS" : deliveryDone ? "Disponível para resolver a OS" : "Disponível após a entrega",
        requestOrderSolved ? "done" : deliveryDone ? "current" : "pending",
      ),
    ]),
  ];

  return <div className="border-t border-[#0d1b2e]/8 px-4 py-3.5 sm:px-5 sm:py-4">
    <div className="flex flex-col items-center text-center">
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#0d1b2e]">Fluxo das peças</p>
      <p className="mt-0.5 text-[10px] text-[#5a6a82]">{purpose === "TEST" ? "Pedido para teste" : "Pedido para resolução"}</p>
      {stages.some(stage => stage.state === "current") && <span className="mt-1.5 rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-semibold text-amber-700 sm:mt-2 sm:px-2.5 sm:py-1 sm:text-[10px]">Aguardando ação</span>}
    </div>

    <div className="mx-auto mt-3 w-full max-w-md md:hidden">
      {stages.map((stage, index) => {
        const tone = stageTone(stage.state);
        const nextTone = index < stages.length - 1 ? stageTone(stages[index + 1].state) : null;
        return <div key={`${stage.label}-mobile-${index}`} className="relative flex min-w-0 gap-2.5 pb-2.5 last:pb-0">
          {nextTone && <span
            aria-hidden="true"
            className="absolute left-[12px] top-6 bottom-[-1px] w-[2px] rounded-full"
            style={{ background: `linear-gradient(to bottom, ${tone.line} 0%, ${tone.line} 50%, ${nextTone.line} 50%, ${nextTone.line} 100%)` }}
          />}
          <span className={cn("relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[9px] font-bold", tone.dot)}>
            {stage.state === "done" ? <Check size={11} /> : stage.state === "error" ? <X size={11} /> : index + 1}
          </span>
          <div className={cn("min-w-0 flex-1 rounded-md border px-2.5 py-2", tone.panel)}>
            <p className={cn("break-words text-[10px] font-semibold leading-tight", tone.title)}>{stage.label}</p>
            <p className="mt-0.5 break-words text-[9px] leading-snug text-[#5a6a82]">{stage.description}</p>
          </div>
        </div>;
      })}
    </div>

    <div className="mt-5 hidden w-full overflow-x-auto pb-2 md:block">
      <div
        className="mx-auto grid items-start"
        style={{ gridTemplateColumns: `repeat(${stages.length}, minmax(132px, 1fr))`, minWidth: `${Math.max(680, stages.length * 142)}px` }}
      >
        {stages.map((stage, index) => {
          const tone = stageTone(stage.state);
          const nextTone = index < stages.length - 1 ? stageTone(stages[index + 1].state) : null;
          return <div key={`${stage.label}-desktop-${index}`} className="relative min-w-0 px-2 text-center">
            {nextTone && <span
              aria-hidden="true"
              className="absolute left-1/2 top-[15px] z-0 h-[3px] w-full"
              style={{ background: `linear-gradient(to right, ${tone.line} 0%, ${tone.line} 50%, ${nextTone.line} 50%, ${nextTone.line} 100%)` }}
            />}
            <div className="relative z-10 mx-auto flex h-8 w-8 items-center justify-center">
              <span className={cn("flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-bold", tone.dot)}>
                {stage.state === "done" ? <Check size={14} /> : stage.state === "error" ? <X size={14} /> : index + 1}
              </span>
            </div>
            <div className={cn("relative z-10 mx-auto mt-3 min-h-[68px] max-w-[156px] rounded-lg border px-2.5 py-2 text-center", tone.panel)}>
              <p className={cn("break-words text-[11px] font-semibold leading-tight", tone.title)}>{stage.label}</p>
              <p className="mt-1 break-words text-[10px] leading-snug text-[#5a6a82]">{stage.description}</p>
            </div>
          </div>;
        })}
      </div>
    </div>
  </div>;
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
  if (requests.length === 0) return <p className="text-xs text-[#5a6a82]">Nenhuma solicitação de peças para esta OS.</p>;

  return <div className="min-w-0 space-y-4">{requests.map((request, requestIndex) => {
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

    return <AdminCard key={request.id} className="min-w-0 bg-white p-0">
      <div className="px-4 py-4 sm:px-5">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-[#0d1b2e]">Solicitação {requestIndex + 1}</p>
            <p className="mt-1 break-words text-[11px] text-[#5a6a82]">{request.requester?.full_name || "Solicitante não informado"} · {formatDate(request.created_at, true)}</p>
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
            <span className={cn("rounded-full px-2.5 py-1 text-[10px] font-semibold", statusClass)}>{statusLabel}</span>
            <span className="rounded-full bg-blue-100 px-2.5 py-1 text-[10px] font-semibold text-blue-700">{purposeLabel(purpose)}</span>
          </div>
        </div>
        {request.notes && <p className="mt-3 break-words whitespace-pre-line text-xs leading-relaxed text-[#0d1b2e]">{request.notes}</p>}
      </div>

      <PartCustodyWizard request={request} orderSolved={orderSolved} getCommittedQuantity={getCommittedQuantity} />

      <div className="border-t border-[#0d1b2e]/8">
        <div className="px-4 pt-4 sm:px-5"><p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[#0d1b2e]">Itens solicitados</p></div>
        <div className="divide-y divide-[#0d1b2e]/8">{request.items.map(item => {
          const unit = item.inventory_item?.unit || "un";
          const delivered = Math.max(0, Number(item.delivered_quantity ?? 0));
          const received = Math.max(0, Number(item.technician_received_quantity ?? 0));
          const returnPending = Math.max(0, Number(item.return_pending_quantity ?? 0));
          const returned = Math.max(0, Number(item.returned_quantity ?? 0));
          const damaged = Math.max(0, Number(item.damaged_quantity ?? 0));
          const committed = purpose === "TEST" ? getCommittedQuantity(item) : 0;
          const pending = purpose === "TEST" ? getPendingQuantity(request, item) : 0;
          const requestOrderSolved = orderSolved || Boolean(request.service_order?.is_solved || request.service_order?.completed_at);

          return <div key={item.id} className="min-w-0 px-4 py-3.5 sm:px-5">
            <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
              <div className="min-w-0">
                <p className="break-words text-xs font-semibold text-[#0d1b2e]">{item.inventory_item?.name || "Peça"}</p>
                <p className="mt-0.5 break-words text-[11px] text-[#5a6a82]">Solicitado: {Number(item.quantity)} {unit}{item.approved_quantity != null && ` · Aprovado: ${Number(item.approved_quantity)} ${unit}`}</p>
              </div>
              {item.source_test_item_id && <span className="shrink-0 self-start rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold text-violet-700">Origem: peça testada</span>}
            </div>

            {(delivered > 0 || item.source_test_item_id || committed > 0) && <div className="mt-2.5 flex min-w-0 flex-wrap gap-1.5 text-[10px]">
              {delivered > 0 && <span className="rounded bg-blue-50 px-2 py-1 text-blue-700">Saída: {delivered} {unit}</span>}
              {delivered > 0 && <span className="rounded bg-cyan-50 px-2 py-1 text-cyan-700">Recebida pelo técnico: {received} {unit}</span>}
              {returnPending > 0 && <span className="rounded bg-amber-50 px-2 py-1 text-amber-700">Devolução pendente: {returnPending} {unit}</span>}
              {returned > 0 && <span className="rounded bg-emerald-50 px-2 py-1 text-emerald-700">Recebida no estoque: {returned} {unit}</span>}
              {damaged > 0 && <span className="rounded bg-red-50 px-2 py-1 text-red-700">Danificada: {damaged} {unit}</span>}
              {purpose === "TEST" && committed > 0 && <span className="rounded bg-violet-50 px-2 py-1 text-violet-700">{requestOrderSolved ? "Usada na resolução" : "Para resolução"}: {committed} {unit}</span>}
              {purpose === "TEST" && pending > 0 && <span className="rounded bg-amber-50 px-2 py-1 text-amber-700">Aguardando: {pending} {unit}</span>}
              {purpose === "RESOLUTION" && item.source_test_item_id && requestOrderSolved && <span className="rounded bg-emerald-50 px-2 py-1 text-emerald-700">Usada na resolução: {Number(item.approved_quantity ?? item.quantity)} {unit}</span>}
            </div>}
          </div>;
        })}</div>
      </div>

      {status !== "PENDING" && (request.reviewed_by_profile?.full_name || request.reviewed_at || request.review_notes) && <div className="border-t border-[#0d1b2e]/8 px-4 py-3 text-[11px] leading-relaxed text-[#5a6a82] sm:px-5">Analisado por {request.reviewed_by_profile?.full_name || "Responsável não informado"}{request.reviewed_at ? ` em ${formatDate(request.reviewed_at, true)}` : ""}{request.review_notes ? ` · ${request.review_notes}` : ""}</div>}

      {status === "APPROVED" && purpose === "TEST" && hasDeliveredItems && <div className="border-t border-[#0d1b2e]/8 px-4 py-3 sm:px-5"><div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-[11px] text-amber-800"><AlertTriangle size={14} className="mt-0.5 shrink-0" /><span>Peças já entregues — a análise não pode mais ser revertida.</span></div></div>}

      <div className="flex min-w-0 flex-wrap justify-end gap-1.5 border-t border-[#0d1b2e]/8 bg-[#f8fafc]/70 px-4 py-3 sm:px-5">
        {hasPermission("orders.manage_part_requests") && status === "PENDING" && <><button type="button" onClick={event => onApprove(event, request)} aria-label="Aprovar solicitação" title="Aprovar" className="inline-flex h-11 w-11 min-w-0 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-0 text-xs font-semibold text-white hover:bg-emerald-700 sm:h-9 sm:w-auto sm:px-3"><Check className="h-5 w-5 sm:h-[15px] sm:w-[15px]" /><span className="hidden sm:inline">Aprovar</span></button><button type="button" onClick={event => onReject(event, request)} aria-label="Rejeitar solicitação" title="Rejeitar" className="inline-flex h-11 w-11 min-w-0 items-center justify-center gap-1.5 rounded-lg bg-red-600 px-0 text-xs font-semibold text-white hover:bg-red-700 sm:h-9 sm:w-auto sm:px-3"><X className="h-5 w-5 sm:h-[15px] sm:w-[15px]" /><span className="hidden sm:inline">Rejeitar</span></button></>}
        {hasPermission("orders.manage_part_requests") && status === "REJECTED" && <button type="button" onClick={event => onApprove(event, request)} aria-label="Aprovar solicitação" title="Aprovar" className="inline-flex h-11 w-11 min-w-0 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-0 text-xs font-semibold text-white hover:bg-emerald-700 sm:h-9 sm:w-auto sm:px-3"><Check className="h-5 w-5 sm:h-[15px] sm:w-[15px]" /><span className="hidden sm:inline">Aprovar</span></button>}
        {hasPermission("orders.manage_part_requests") && status === "APPROVED" && !hasDeliveredItems && <button type="button" onClick={event => onReject(event, request)} aria-label="Desaprovar solicitação" title="Desaprovar" className="inline-flex h-11 w-11 min-w-0 items-center justify-center gap-1.5 rounded-lg bg-amber-600 px-0 text-xs font-semibold text-white hover:bg-amber-700 sm:h-9 sm:w-auto sm:px-3"><RotateCcw className="h-5 w-5 sm:h-[15px] sm:w-[15px]" /><span className="hidden sm:inline">Desaprovar</span></button>}
        {hasPermission("orders.dispatch_parts") && status === "APPROVED" && hasPendingDispatch && <button type="button" onClick={() => onDelivery(request, "DISPATCH")} aria-label="Confirmar saída" title="Confirmar saída" className="inline-flex h-11 w-11 min-w-0 items-center justify-center gap-1.5 rounded-lg bg-[#0057e7] px-0 text-xs font-semibold text-white hover:bg-[#0046c0] sm:h-9 sm:w-auto sm:px-3"><Truck className="h-5 w-5 sm:h-[15px] sm:w-[15px]" /><span className="hidden sm:inline">Confirmar saída</span></button>}
        {hasPermission("orders.confirm_part_delivery") && status === "APPROVED" && hasPendingDeliveryConfirmation && <button type="button" onClick={() => onDelivery(request, "CONFIRM_DELIVERY")} aria-label="Confirmar entrega ao técnico" title="Confirmar entrega ao técnico" className="inline-flex h-11 w-11 min-w-0 items-center justify-center gap-1.5 rounded-lg bg-cyan-600 px-0 text-xs font-semibold text-white hover:bg-cyan-700 sm:h-9 sm:w-auto sm:px-3"><PackageCheck className="h-5 w-5 sm:h-[15px] sm:w-[15px]" /><span className="hidden sm:inline">Confirmar entrega ao técnico</span></button>}
        {hasPermission("orders.register_part_return") && status === "APPROVED" && hasReturnableItems && <button type="button" onClick={() => onDelivery(request, "REGISTER_RETURN")} aria-label="Registrar devolução" title="Registrar devolução" className="inline-flex h-11 w-11 min-w-0 items-center justify-center gap-1.5 rounded-lg bg-amber-600 px-0 text-xs font-semibold text-white hover:bg-amber-700 sm:h-9 sm:w-auto sm:px-3"><Undo2 className="h-5 w-5 sm:h-[15px] sm:w-[15px]" /><span className="hidden sm:inline">Registrar devolução</span></button>}
        {hasPermission("orders.receive_returned_parts") && status === "APPROVED" && hasPendingReturnReceipt && <button type="button" onClick={() => onDelivery(request, "RECEIVE_RETURN")} aria-label="Confirmar retorno ao estoque" title="Confirmar retorno ao estoque" className="inline-flex h-11 w-11 min-w-0 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-0 text-xs font-semibold text-white hover:bg-emerald-700 sm:h-9 sm:w-auto sm:px-3"><PackageCheck className="h-5 w-5 sm:h-[15px] sm:w-[15px]" /><span className="hidden sm:inline">Confirmar retorno ao estoque</span></button>}
        {hasPermission("orders.record_test_results") && status === "APPROVED" && purpose === "TEST" && hasDeliveredItems && hasPendingTestResult && currentUserId === assignedTo && <button type="button" onClick={() => onTestResult(request)} aria-label="Registrar resultado do teste" title="Registrar resultado do teste" className="inline-flex h-11 w-11 min-w-0 items-center justify-center gap-1.5 rounded-lg border border-[#0057e7]/30 bg-white px-0 text-xs font-semibold text-[#0057e7] hover:bg-[#eef5ff] sm:h-9 sm:w-auto sm:px-3"><ClipboardCheck className="h-5 w-5 sm:h-[15px] sm:w-[15px]" /><span className="hidden sm:inline">Registrar resultado do teste</span></button>}
      </div>
    </AdminCard>;
  })}</div>;
}
