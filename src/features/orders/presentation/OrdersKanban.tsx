import { useState } from "react";
import type React from "react";
import { Ban, Edit2 } from "lucide-react";
import { cn } from "@/shared/domain/formatters";
import { AdminSelect } from "@/shared/ui/admin/AdminFormControls";
import { OrderCancelDialog } from "./OrderCancelDialog";
import { OrderStatusDot } from "./OrderStatusDot";

export function OrdersKanban({ statuses, filteredOrders, situations, draggingId, hasPermission, onOpen, onSituationChange, onEdit, onCancel, cancellingId, formatDate }: {
  statuses: any[]; filteredOrders: any[]; situations: any[]; draggingId: string | null; dragOverStatusId: string | null;
  hasPermission: (permission: string) => boolean; onDragOver: (statusId: string) => void; onDragLeave: (statusId: string) => void; onDrop: (statusId: string) => void;
  onCardDragStart: (event: React.DragEvent<HTMLDivElement>, order: any) => void; onCardDragEnd: () => void; onOpen: (order: any) => void;
  onSituationChange: (order: any, situationId: string) => void; onEdit: (order: any) => void; onCancel: (order: any, reason: string) => Promise<boolean>; cancellingId: string | null;
  formatDate: (value?: string | null, time?: boolean) => string;
}) {
  const [cancelTarget, setCancelTarget] = useState<any>(null);
  if (!hasPermission("orders.kanban.view")) return null;
  const canOpenDetails = hasPermission("orders.details.view");
  const canChangeSituation = hasPermission("orders.situation.change");
  const canEdit = hasPermission("orders.edit");
  const canCancelPermission = hasPermission("orders.cancel");
  const isCancelled = (order: any) => Boolean(order.cancelled_at) || String(order.order_status?.name || "").toLowerCase() === "cancelada";
  const canCancel = (order: any) => canCancelPermission && !order.completed_at && !isCancelled(order);

  return <>
    <div className="w-full pb-3">
      <div className="mx-auto grid w-full grid-cols-1 items-start gap-3 md:grid-cols-3 md:gap-4">{statuses.map(status => {
        const statusOrders = filteredOrders.filter(order => order.status_id === status.id);
        return <div key={status.id} className="w-full min-w-0 overflow-hidden rounded-xl border border-[#0d1b2e]/8 bg-[#f8fafc]">
          <div className="flex items-center justify-between gap-2 border-b border-[#0d1b2e]/8 bg-white px-3 py-2.5 md:px-4 md:py-3"><div className="flex min-w-0 items-center gap-2"><OrderStatusDot status={status.name} color={status.color} /><span className="truncate text-sm font-bold text-[#0d1b2e]">{status.name}</span></div><span className="rounded-full bg-[#f5f7fa] px-2 py-0.5 text-[10px] font-bold text-[#5a6a82] md:bg-transparent md:px-0 md:py-0 md:text-xs">{statusOrders.length}</span></div>
          <div className="min-h-0 space-y-2 p-2.5 md:min-h-[180px] md:space-y-3 md:p-3">{statusOrders.length === 0 ? <p className="py-5 text-center text-[11px] text-[#5a6a82] md:py-10 md:text-xs">Nenhuma OS.</p> : statusOrders.map(order => <div key={order.id} draggable={false} onClick={() => canOpenDetails && onOpen(order)} className={cn("cursor-default rounded-lg border border-[#0d1b2e]/10 bg-white p-3 shadow-sm transition-colors", canOpenDetails && "hover:border-[#0057e7]/30", draggingId === order.id && "opacity-50")}>
            <div className="flex min-w-0 items-center gap-2"><OrderStatusDot status={status.name} color={status.color} /><span className="truncate font-mono text-xs font-black text-[#0057e7]">{order.os_number || "—"}</span></div>
            <p className="mt-2 truncate text-sm font-semibold text-[#0d1b2e] md:mt-3">{(order.customer as any)?.full_name || "Cliente não informado"}</p><p className="truncate text-xs text-[#5a6a82]">{(order.general_service as any)?.name || (order.service as any)?.title || "Serviço não informado"}</p>{order.scheduled_at && <p className="mt-1 text-[11px] text-[#5a6a82]">Agendado: {formatDate(order.scheduled_at)}</p>}
            <div className="mt-2 flex items-center gap-2 text-[11px] text-[#5a6a82]" onClick={event => event.stopPropagation()}><span className="shrink-0 font-semibold">Situação:</span>{canChangeSituation && !isCancelled(order) ? <div className="min-w-0 flex-1"><AdminSelect value={order.situation_id || ""} onValueChange={value => onSituationChange(order, value)} options={[{ value: "", label: "Não definida" }, ...situations.map(situation => ({ value: situation.id, label: situation.name }))]} className="min-h-9 px-1.5 py-1 text-[11px] md:min-h-8" ariaLabel={`Situação da OS ${order.os_number || ""}`} /></div> : <span className="truncate">{(order.situation as any)?.name || "Não definida"}</span>}</div>
            {order.is_solved && !order.completed_at && !isCancelled(order) && <span className="mt-2 inline-flex items-center rounded-full bg-green-100 px-2 py-1 text-[10px] font-bold uppercase text-green-700">✓ OS solucionada</span>}{order.cannot_be_solved && !isCancelled(order) && <span className="mt-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-1 text-[10px] font-bold uppercase text-amber-700">⚠ OS não solucionável</span>}
            {(canEdit && !order.is_solved && !isCancelled(order) || canCancel(order)) && <div className="mt-3 flex items-center justify-end gap-2 border-t border-[#0d1b2e]/8 pt-3" onClick={event => event.stopPropagation()}>
              {canEdit && !order.is_solved && !isCancelled(order) && <button type="button" onClick={() => onEdit(order)} className="flex min-h-9 cursor-default items-center gap-1 rounded-lg border border-[#0057e7]/30 px-3 py-1.5 text-xs font-bold text-[#0057e7]"><Edit2 size={13} /> Editar</button>}
              {canCancel(order) && <button type="button" onClick={() => setCancelTarget(order)} className="flex min-h-9 cursor-default items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50"><Ban size={13} /> Cancelar</button>}
            </div>}
          </div>)}</div>
        </div>;
      })}</div>
    </div>
    <OrderCancelDialog
      order={cancelTarget}
      open={Boolean(cancelTarget)}
      loading={Boolean(cancelTarget && cancellingId === cancelTarget.id)}
      onClose={() => setCancelTarget(null)}
      onConfirm={async reason => { if (cancelTarget && await onCancel(cancelTarget, reason)) setCancelTarget(null); }}
    />
  </>;
}
