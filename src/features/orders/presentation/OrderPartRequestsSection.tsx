import type React from "react";
import { AlertTriangle } from "lucide-react";
import { cn, Section } from "@/shared/admin/AdminPrimitives";
import { purposeLabel } from "../application/part-request.formatters";
import type {
  PartRequestForReview,
  PartRequestItemForReview,
} from "../domain/part-request.types";

export function OrderPartRequestsSection({
  requests,
  assignedTo,
  currentUserId,
  hasPermission,
  formatDate,
  getCommittedQuantity,
  getPendingQuantity,
  onApprove,
  onReject,
  onDelivery,
  onTestResult,
}: {
  requests: PartRequestForReview[];
  assignedTo?: string | null;
  currentUserId?: string | null;
  hasPermission: (permission: string) => boolean;
  formatDate: (value?: string | null, time?: boolean) => string;
  getCommittedQuantity: (item: PartRequestItemForReview) => number;
  getPendingQuantity: (
    request: PartRequestForReview,
    item: PartRequestItemForReview,
  ) => number;
  onApprove: (
    event: React.MouseEvent<HTMLButtonElement>,
    request: PartRequestForReview,
  ) => void;
  onReject: (
    event: React.MouseEvent<HTMLButtonElement>,
    request: PartRequestForReview,
  ) => void;
  onDelivery: (request: PartRequestForReview) => void;
  onTestResult: (request: PartRequestForReview) => void;
}) {
  const detailPartRequests = requests;
  const detail = { assigned_to: assignedTo };
  const user = { id: currentUserId };
  const fmtDate = formatDate;
  const getTestCommittedQuantity = getCommittedQuantity;
  const getTestPendingQuantity = getPendingQuantity;
  return (
<Section title="Solicitações de peças">
                {detailPartRequests.length === 0 ? <p className="text-xs text-[#5a6a82]">Nenhuma solicitação de peças para esta OS.</p> : <div className="space-y-3">
                  {detailPartRequests.map((request: PartRequestForReview) => {
                    const status = String(request.status || "").toUpperCase();
                    const normalizedPurpose = request.purpose || "RESOLUTION";
                    const hasDeliveredItems = request.items.some(item => Number(item.delivered_quantity ?? 0) > 0);
                    const hasPendingTestResult = normalizedPurpose === "TEST" && request.items.some(item => getTestPendingQuantity(request, item) > 0);
                    const statusLabel = status === "APPROVED" ? "Aprovada" : status === "REJECTED" ? "Rejeitada" : status === "CANCELLED" ? "Cancelada" : "Em análise";
                    const statusClass = status === "APPROVED" ? "bg-green-100 text-green-700" : status === "REJECTED" ? "bg-red-100 text-red-700" : status === "CANCELLED" ? "bg-[#f5f7fa] text-[#5a6a82]" : "bg-amber-100 text-amber-700";
                    return <div key={request.id} className="rounded-lg border border-[#0d1b2e]/10 bg-[#f8fafc] p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className={cn("rounded-full px-2 py-1 text-[10px] font-bold", statusClass)}>{statusLabel}</span>
                        <span className="rounded-full bg-blue-100 px-2 py-1 text-[10px] font-bold text-blue-700">{purposeLabel(normalizedPurpose)}</span>
                        <span className="text-[11px] text-[#5a6a82]">{request.requester?.full_name || "Solicitante não informado"} · {fmtDate(request.created_at, true)}</span>
                      </div>
                      {request.notes && <p className="mt-2 whitespace-pre-line text-xs text-[#0d1b2e]">{request.notes}</p>}
                      <div className="mt-2 space-y-2">{request.items.map(item => {
                        const unit = item.inventory_item?.unit || "un";
                        const delivered = Math.max(0, Number(item.delivered_quantity ?? 0));
                        const returned = Math.max(0, Number(item.returned_quantity ?? 0));
                        const damaged = Math.max(0, Number(item.damaged_quantity ?? 0));
                        const committed = normalizedPurpose === "TEST" ? getTestCommittedQuantity(item) : 0;
                        const pending = normalizedPurpose === "TEST" ? getTestPendingQuantity(request, item) : 0;
                        return <div key={item.id} className="rounded-lg border border-[#0d1b2e]/8 bg-white p-2.5">
                          <p className="text-xs font-semibold text-[#0d1b2e]">{item.inventory_item?.name || "Peça"}</p>
                          <p className="mt-0.5 text-[11px] text-[#5a6a82]">Solicitado: {Number(item.quantity)} {unit}{item.approved_quantity != null && ` · Aprovado: ${Number(item.approved_quantity)} ${unit}`}</p>
                          {item.source_test_item_id && <span className="mt-1 inline-flex rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700">Origem: peça testada</span>}
                          {normalizedPurpose === "TEST" && delivered > 0 && <div className="mt-2 grid grid-cols-2 gap-1 text-[10px] sm:grid-cols-5">
                            <span className="rounded bg-blue-50 px-2 py-1 text-blue-700">Entregue: {delivered} {unit}</span>
                            <span className="rounded bg-emerald-50 px-2 py-1 text-emerald-700">Devolvida: {returned} {unit}</span>
                            <span className="rounded bg-red-50 px-2 py-1 text-red-700">Danificada: {damaged} {unit}</span>
                            <span className="rounded bg-violet-50 px-2 py-1 text-violet-700">Para resolução: {committed} {unit}</span>
                            <span className="rounded bg-amber-50 px-2 py-1 text-amber-700">Aguardando: {pending} {unit}</span>
                          </div>}
                        </div>;
                      })}</div>
                      {status !== "PENDING" && (request.reviewed_by_profile?.full_name || request.reviewed_at || request.review_notes) && <div className="mt-2 border-t border-[#0d1b2e]/8 pt-2 text-[11px] text-[#5a6a82]">Analisado por {request.reviewed_by_profile?.full_name || "Responsável não informado"}{request.reviewed_at ? ` em ${fmtDate(request.reviewed_at, true)}` : ""}{request.review_notes ? ` · ${request.review_notes}` : ""}</div>}
                      {status === "APPROVED" && normalizedPurpose === "TEST" && hasDeliveredItems && <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[11px] text-amber-800"><AlertTriangle size={14} className="mt-0.5 shrink-0" /><span>Peças já entregues — a análise não pode mais ser revertida.</span></div>}
                      <div className="mt-3 flex flex-wrap justify-end gap-2">
                        {hasPermission("orders.manage_part_requests") && status === "PENDING" && <><button type="button" onClick={event => onApprove(event, request)} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700">Aprovar</button><button type="button" onClick={event => onReject(event, request)} className="rounded-lg bg-red-600 px-3 py-2 text-xs font-bold text-white hover:bg-red-700">Rejeitar</button></>}
                        {hasPermission("orders.manage_part_requests") && status === "REJECTED" && <button type="button" onClick={event => onApprove(event, request)} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700">Aprovar</button>}
                        {hasPermission("orders.manage_part_requests") && status === "APPROVED" && !hasDeliveredItems && <button type="button" onClick={event => onReject(event, request)} className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-bold text-white hover:bg-amber-700">Desaprovar</button>}
                        {hasPermission("orders.manage_part_requests") && status === "APPROVED" && normalizedPurpose === "TEST" && !hasDeliveredItems && <button type="button" onClick={() => onDelivery(request)} className="rounded-lg bg-[#0057e7] px-3 py-2 text-xs font-bold text-white hover:bg-[#0046c0]">Confirmar entrega</button>}
                        {status === "APPROVED" && normalizedPurpose === "TEST" && hasDeliveredItems && hasPendingTestResult && user?.id === detail?.assigned_to && <button type="button" onClick={() => onTestResult(request)} className="rounded-lg border border-[#0057e7]/30 px-3 py-2 text-xs font-bold text-[#0057e7]">Registrar resultado do teste</button>}
                      </div>
                    </div>;
                  })}
                </div>}
              </Section>
  );
}
