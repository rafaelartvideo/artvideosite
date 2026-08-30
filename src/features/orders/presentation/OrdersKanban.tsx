import type React from "react";
import { Edit2 } from "lucide-react";
import { cn } from "@/shared/domain/formatters";
import { AdminSelect } from "@/shared/ui/admin/AdminFormControls";

export function OrdersKanban({
  statuses,
  filteredOrders,
  situations,
  draggingId,
  dragOverStatusId,
  hasPermission,
  onDragOver,
  onDragLeave,
  onDrop,
  onCardDragStart,
  onCardDragEnd,
  onOpen,
  onSituationChange,
  onEdit,
  formatDate,
}: {
  statuses: any[];
  filteredOrders: any[];
  situations: any[];
  draggingId: string | null;
  dragOverStatusId: string | null;
  hasPermission: (permission: string) => boolean;
  onDragOver: (statusId: string) => void;
  onDragLeave: (statusId: string) => void;
  onDrop: (statusId: string) => void;
  onCardDragStart: (event: React.DragEvent<HTMLDivElement>, order: any) => void;
  onCardDragEnd: () => void;
  onOpen: (order: any) => void;
  onSituationChange: (order: any, situationId: string) => void;
  onEdit: (order: any) => void;
  formatDate: (value?: string | null, time?: boolean) => string;
}) {
  return (
<div className="overflow-x-auto pb-3">
        <div className="flex items-start gap-4 min-w-max">
          {statuses.map(status => {
            const statusOrders = filteredOrders.filter(order => order.status_id === status.id);
            return <div key={status.id} onDragOver={event => { event.preventDefault(); onDragOver(status.id); }} onDragLeave={() => onDragLeave(status.id)} onDrop={event => { event.preventDefault(); onDrop(status.id); }} className={cn("w-[300px] flex-shrink-0 bg-[#f8fafc] rounded-xl border overflow-hidden transition-colors", dragOverStatusId === status.id ? "border-[#0057e7] bg-[#e8eef8]" : "border-[#0d1b2e]/8")}>
              <div className="px-4 py-3 border-b border-[#0d1b2e]/8 bg-white flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0"><span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: status.color || "transparent" }} /><span className="font-bold text-sm text-[#0d1b2e] truncate">{status.name}</span></div>
                <span className="text-xs font-bold text-[#5a6a82]">{statusOrders.length}</span>
              </div>
              <div className="p-3 space-y-3 min-h-[180px]">
                {statusOrders.length === 0 ? <p className="py-10 text-center text-xs text-[#5a6a82]">Solte uma OS aqui.</p> : statusOrders.map(order => <div key={order.id} draggable onDragStart={event => onCardDragStart(event, order)} onDragEnd={onCardDragEnd} onClick={() => onOpen(order)} className={cn("bg-white rounded-lg border border-[#0d1b2e]/10 p-3 shadow-sm cursor-grab hover:border-[#0057e7]/30 transition-colors", draggingId === order.id && "opacity-50 cursor-grabbing")}>
                  <div className="flex items-center gap-2 min-w-0"><span className="w-1.5 h-6 rounded-full flex-shrink-0" style={{ backgroundColor: status.color || "transparent" }} /><span className="font-mono text-xs font-black text-[#0057e7] truncate">{order.os_number || "—"}</span></div>
                  <p className="mt-3 font-semibold text-sm text-[#0d1b2e] truncate">{(order.customer as any)?.full_name || "Cliente não informado"}</p>
                  <p className="text-xs text-[#5a6a82] truncate">{(order.general_service as any)?.name || (order.service as any)?.title || "Serviço não informado"}</p>
                  {order.estimated_price != null && <p className="mt-2 text-xs font-bold text-[#0d1b2e]">R$ {Number(order.estimated_price).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</p>}
                  {order.scheduled_at && <p className="mt-1 text-[11px] text-[#5a6a82]">Agendado: {formatDate(order.scheduled_at)}</p>}
                  <div className="mt-2 flex items-center gap-2 text-[11px] text-[#5a6a82]" onClick={event => event.stopPropagation()}>
                    <span className="font-semibold">Situação:</span>
                    {hasPermission("orders.edit") ? <div className="min-w-0 flex-1"><AdminSelect value={order.situation_id || ""} onValueChange={value => onSituationChange(order, value)} options={[{ value: "", label: "Não definida" }, ...situations.map(situation => ({ value: situation.id, label: situation.name }))]} className="min-h-8 px-1.5 py-1 text-[11px]" ariaLabel={`Situação da OS ${order.os_number || ""}`} /></div> : <span className="truncate">{(order.situation as any)?.name || "Não definida"}</span>}
                  </div>
                  {order.is_solved && <span className="mt-2 inline-flex items-center rounded-full bg-green-100 px-2 py-1 text-[10px] font-bold uppercase text-green-700">✓ OS solucionada</span>}
                  {order.cannot_be_solved && <span className="mt-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-1 text-[10px] font-bold uppercase text-amber-700">⚠ OS não solucionável</span>}
                  {hasPermission("orders.edit") && !order.is_solved && <div className="mt-3 flex items-center justify-end" onClick={event => event.stopPropagation()}><button type="button" draggable={false} onMouseDown={event => event.stopPropagation()} onPointerDown={event => event.stopPropagation()} onDragStart={event => { event.preventDefault(); event.stopPropagation(); }} onClick={() => onEdit(order)} className="flex items-center gap-1 text-xs font-bold text-[#0057e7] border border-[#0057e7]/30 px-2.5 py-1.5 rounded-lg"><Edit2 size={13} /> Editar</button></div>}
                </div>)}
              </div>
            </div>;
          })}
        </div>
      </div>
  );
}
