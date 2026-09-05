import type React from "react";
import { Edit2 } from "lucide-react";
import { cn } from "@/shared/domain/formatters";
import { AdminSelect } from "@/shared/ui/admin/AdminFormControls";

export function OrdersKanban({ statuses, filteredOrders, situations, draggingId, dragOverStatusId, hasPermission, onDragOver, onDragLeave, onDrop, onCardDragStart, onCardDragEnd, onOpen, onSituationChange, onEdit, formatDate }: {
  statuses: any[]; filteredOrders: any[]; situations: any[]; draggingId: string | null; dragOverStatusId: string | null;
  hasPermission: (permission: string) => boolean; onDragOver: (statusId: string) => void; onDragLeave: (statusId: string) => void; onDrop: (statusId: string) => void;
  onCardDragStart: (event: React.DragEvent<HTMLDivElement>, order: any) => void; onCardDragEnd: () => void; onOpen: (order: any) => void;
  onSituationChange: (order: any, situationId: string) => void; onEdit: (order: any) => void; formatDate: (value?: string | null, time?: boolean) => string;
}) {
  if (!hasPermission("orders.kanban.view")) return null;
  const canOpenDetails = hasPermission("orders.details.view");
  const canChangeStatus = hasPermission("orders.status.change");
  const canChangeSituation = hasPermission("orders.situation.change");
  const canEdit = hasPermission("orders.edit");
  return <div className="overflow-x-auto pb-3"><div className="flex min-w-max items-start gap-4">{statuses.map(status => {
    const statusOrders = filteredOrders.filter(order => order.status_id === status.id);
    return <div key={status.id} onDragOver={event => { if (!canChangeStatus) return; event.preventDefault(); onDragOver(status.id); }} onDragLeave={() => canChangeStatus && onDragLeave(status.id)} onDrop={event => { if (!canChangeStatus) return; event.preventDefault(); onDrop(status.id); }} className={cn("w-[300px] flex-shrink-0 overflow-hidden rounded-xl border bg-[#f8fafc] transition-colors", canChangeStatus && dragOverStatusId === status.id ? "border-[#0057e7] bg-[#e8eef8]" : "border-[#0d1b2e]/8")}>
      <div className="flex items-center justify-between gap-2 border-b border-[#0d1b2e]/8 bg-white px-4 py-3"><div className="flex min-w-0 items-center gap-2"><span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ backgroundColor: status.color || "transparent" }} /><span className="truncate text-sm font-bold text-[#0d1b2e]">{status.name}</span></div><span className="text-xs font-bold text-[#5a6a82]">{statusOrders.length}</span></div>
      <div className="min-h-[180px] space-y-3 p-3">{statusOrders.length === 0 ? <p className="py-10 text-center text-xs text-[#5a6a82]">{canChangeStatus ? "Solte uma OS aqui." : "Nenhuma OS."}</p> : statusOrders.map(order => <div key={order.id} draggable={canChangeStatus} onDragStart={event => canChangeStatus && onCardDragStart(event, order)} onDragEnd={() => canChangeStatus && onCardDragEnd()} onClick={() => canOpenDetails && onOpen(order)} className={cn("cursor-default rounded-lg border border-[#0d1b2e]/10 bg-white p-3 shadow-sm transition-colors", canOpenDetails && "hover:border-[#0057e7]/30", canChangeStatus && "cursor-grab", draggingId === order.id && canChangeStatus && "cursor-grabbing opacity-50")}>
        <div className="flex min-w-0 items-center gap-2"><span className="h-6 w-1.5 flex-shrink-0 rounded-full" style={{ backgroundColor: status.color || "transparent" }} /><span className="truncate font-mono text-xs font-black text-[#0057e7]">{order.os_number || "—"}</span></div>
        <p className="mt-3 truncate text-sm font-semibold text-[#0d1b2e]">{(order.customer as any)?.full_name || "Cliente não informado"}</p><p className="truncate text-xs text-[#5a6a82]">{(order.general_service as any)?.name || (order.service as any)?.title || "Serviço não informado"}</p>{order.scheduled_at && <p className="mt-1 text-[11px] text-[#5a6a82]">Agendado: {formatDate(order.scheduled_at)}</p>}
        <div className="mt-2 flex items-center gap-2 text-[11px] text-[#5a6a82]" onClick={event => event.stopPropagation()}><span className="font-semibold">Situação:</span>{canChangeSituation ? <div className="min-w-0 flex-1"><AdminSelect value={order.situation_id || ""} onValueChange={value => onSituationChange(order, value)} options={[{ value: "", label: "Não definida" }, ...situations.map(situation => ({ value: situation.id, label: situation.name }))]} className="min-h-8 px-1.5 py-1 text-[11px]" ariaLabel={`Situação da OS ${order.os_number || ""}`} /></div> : <span className="truncate">{(order.situation as any)?.name || "Não definida"}</span>}</div>
        {order.completed_at ? <span className="mt-2 inline-flex items-center rounded-full bg-emerald-600 px-2 py-1 text-[10px] font-bold uppercase text-white">✓ OS concluída</span> : order.is_solved && <span className="mt-2 inline-flex items-center rounded-full bg-green-100 px-2 py-1 text-[10px] font-bold uppercase text-green-700">✓ OS solucionada</span>}{order.cannot_be_solved && <span className="mt-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-1 text-[10px] font-bold uppercase text-amber-700">⚠ OS não solucionável</span>}
        {canEdit && !order.is_solved && <div className="mt-3 flex items-center justify-end" onClick={event => event.stopPropagation()}><button type="button" draggable={false} onMouseDown={event => event.stopPropagation()} onPointerDown={event => event.stopPropagation()} onDragStart={event => { event.preventDefault(); event.stopPropagation(); }} onClick={() => onEdit(order)} className="flex cursor-default items-center gap-1 rounded-lg border border-[#0057e7]/30 px-2.5 py-1.5 text-xs font-bold text-[#0057e7]"><Edit2 size={13} /> Editar</button></div>}
      </div>)}</div>
    </div>;
  })}</div></div>;
}
