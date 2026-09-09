import { useState } from "react";
import { Ban, ClipboardList, Edit2 } from "lucide-react";
import { EmptyState, LoadingSpinner, StatusBadge } from "@/shared/ui/admin/AdminFeedback";
import { formatPhone } from "@/shared/domain/formatters";
import { PaginationBar } from "@/shared/ui/admin/AdminPagination";
import { AdminButton, AdminCard } from "@/shared/ui/admin/AdminLayout";
import { PriorityBadge } from "./OrderFormControls";
import { AdminSelect } from "@/shared/ui/admin/AdminFormControls";
import { OrderCancelDialog } from "./OrderCancelDialog";

export function OrdersTable({ loading, filteredOrders, pagedOrders, totalItems, hasActiveFilters, hasPermission, onOpen, onSituationChange, getSituations, onEdit, onCancel, cancellingId, formatDate, equipmentSummary, page, pageSize, totalPages, onPageChange, onPageSizeChange }: {
  loading: boolean; filteredOrders: any[]; pagedOrders: any[]; totalItems: number; hasActiveFilters: boolean;
  hasPermission: (permission: string) => boolean; onOpen: (order: any) => void;
  onSituationChange: (order: any, situationId: string) => void; getSituations: (serviceTypeId: string, situationId?: string, situation?: any) => any[];
  onEdit: (order: any) => void; onCancel: (order: any, reason: string) => Promise<boolean>; cancellingId: string | null;
  formatDate: (value?: string | null, time?: boolean) => string; equipmentSummary: (order: any) => string;
  page: number; pageSize: number; totalPages: number; onPageChange: (page: number) => void; onPageSizeChange: (pageSize: number) => void;
}) {
  const [cancelTarget, setCancelTarget] = useState<any>(null);
  if (!hasPermission("orders.table.view")) return null;
  const canOpenDetails = hasPermission("orders.details.view");
  const canChangeSituation = hasPermission("orders.situation.change");
  const canEditOrder = hasPermission("orders.edit");
  const canCancelOrder = hasPermission("orders.cancel");
  const filtered = filteredOrders;
  const fmtDate = formatDate;
  const safePage = page;
  const situationOptions = (order: any) => [{ value: "", label: "Situação: selecionar" }, ...getSituations(order.service_type_id, order.situation_id, order.situation).map(situation => ({ value: situation.id, label: `Situação: ${situation.name}` }))];
  const openDetails = (order: any) => { if (canOpenDetails) onOpen(order); };
  const isCancelled = (order: any) => Boolean(order.cancelled_at) || String(order.order_status?.name || "").toLowerCase() === "cancelada";
  const canCancel = (order: any) => canCancelOrder && !order.completed_at && !isCancelled(order);

  return <>
    <AdminCard>
      {loading ? <div className="flex min-h-[300px] flex-col items-center justify-center gap-3 px-4 py-12 text-center" role="status" aria-live="polite" aria-busy="true"><LoadingSpinner size="lg" /><p className="text-sm font-semibold text-[#5a6a82]">Carregando ordens...</p></div> : filtered.length === 0 ? <EmptyState icon={ClipboardList} title="Nenhuma OS encontrada" message={hasActiveFilters ? "Tente ajustar os filtros." : "Crie a primeira OS com o botão Nova OS."} /> : <>
        <div className="divide-y divide-[#0d1b2e]/8 md:hidden">{pagedOrders.map(o => <article key={o.id} role={canOpenDetails ? "button" : undefined} tabIndex={canOpenDetails ? 0 : undefined} onClick={() => openDetails(o)} onKeyDown={event => { if (canOpenDetails && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); openDetails(o); } }} className="min-w-0 cursor-default space-y-3 overflow-hidden p-4 transition-colors active:bg-[#f5f7fa]">
          <div className="flex min-w-0 items-start justify-between gap-3"><div className="min-w-0 flex-1"><div className="flex min-w-0 items-center gap-2"><span className="h-8 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: (o.order_status as any)?.color || "transparent" }} /><div className="min-w-0">{hasPermission("orders.table.protocol") && <p className="font-mono text-sm font-black text-[#0057e7]">OS {o.os_number || "—"}</p>}{hasPermission("orders.table.customer") && <p className="truncate text-sm font-bold text-[#0d1b2e]">{(o.customer as any)?.full_name || "—"}</p>}</div></div></div>{hasPermission("orders.table.priority") && <div className="shrink-0"><PriorityBadge priority={o.priority || "normal"} /></div>}</div>
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">{hasPermission("orders.table.status") && <StatusBadge status={(o.order_status as any)?.name || "—"} color={(o.order_status as any)?.color} />}{hasPermission("orders.table.situation") && (o.situation as any)?.name && <StatusBadge status={(o.situation as any).name} color={(o.situation as any)?.color} />}{o.is_solved && !o.completed_at && !isCancelled(o) && <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-700">✓ Solucionada</span>}{o.cannot_be_solved && !isCancelled(o) && <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">⚠ Não solucionável</span>}</div>
          <div className="grid min-w-0 grid-cols-2 gap-x-4 gap-y-2 text-xs">{hasPermission("orders.table.customer") && <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wide text-[#8a96a8]">Contato</p><p className="truncate font-medium text-[#5a6a82]">{formatPhone((o.customer as any)?.whatsapp || (o.customer as any)?.phone) || "—"}</p></div>}{hasPermission("orders.table.scheduled_at") && <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wide text-[#8a96a8]">Agendamento</p><p className="truncate font-medium text-[#5a6a82]">{o.scheduled_at ? fmtDate(o.scheduled_at, true) : "—"}</p></div>}{hasPermission("orders.table.service_type") && <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wide text-[#8a96a8]">Atendimento</p><p className="truncate font-medium text-[#5a6a82]">{(o.service_type as any)?.title || (o.general_service as any)?.name || (o.service as any)?.title || "—"}</p></div>}{hasPermission("orders.table.equipment") && <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wide text-[#8a96a8]">Equipamento</p><p className="truncate font-medium text-[#5a6a82]">{equipmentSummary(o) || "—"}</p></div>}</div>
          {hasPermission("orders.table.actions") && <div onClick={event => event.stopPropagation()} className="grid min-w-0 grid-cols-[minmax(0,1fr)_2.25rem_2.25rem] items-center gap-1.5 border-t border-[#0d1b2e]/8 pt-3">{canChangeSituation ? <div className="min-w-0"><AdminSelect value={o.situation_id || ""} onValueChange={value => void onSituationChange(o, value)} options={situationOptions(o)} className="h-9 min-h-9 min-w-0 px-2 py-1 text-[10px] font-bold" ariaLabel={`Situação da OS ${o.os_number || ""}`} /></div> : <span />}{canEditOrder && !o.is_solved && !isCancelled(o) ? <AdminButton variant="secondary" size="sm" onClick={event => { event.stopPropagation(); void onEdit(o); }} aria-label={`Editar OS ${o.os_number || ""}`} title="Editar" className="h-9 w-9 min-w-0 border-[#0057e7]/30 p-0 text-[#0057e7] hover:bg-[#0057e7]/5"><Edit2 size={15} /></AdminButton> : <span />}{canCancel(o) ? <AdminButton variant="secondary" size="sm" onClick={event => { event.stopPropagation(); setCancelTarget(o); }} aria-label={`Cancelar OS ${o.os_number || ""}`} title="Cancelar OS" className="h-9 w-9 min-w-0 border-red-200 p-0 text-red-600 hover:bg-red-50"><Ban size={15} /></AdminButton> : <span />}</div>}
        </article>)}</div>
        <div className="hidden overflow-x-auto md:block"><table className="min-w-[1100px]"><thead><tr><th className="w-28 text-left">Protocolo</th><th className="text-left">Cliente</th><th className="w-40 text-left">Tipo de atendimento</th><th className="w-40 text-left">Equipamento</th><th className="w-24 text-left">Prioridade</th><th className="w-32 text-left">Data de agendamento</th><th className="w-28 text-left">Status</th><th className="w-36 text-left">Situação</th><th className="w-28 text-right">Ações</th></tr></thead><tbody>{pagedOrders.map(o => <tr key={o.id} onClick={() => openDetails(o)} className="cursor-default">
          {hasPermission("orders.table.protocol") && <td><div className="flex items-center gap-2"><span aria-label={`Cor do status ${(o.order_status as any)?.name || "Sem status"}`} className="h-8 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: (o.order_status as any)?.color || "transparent" }} /><span className="font-mono text-xs font-black text-[#0057e7]">{o.os_number || "—"}</span></div></td>}
          {hasPermission("orders.table.customer") && <td><p className="text-sm font-semibold text-[#0d1b2e]">{(o.customer as any)?.full_name || "—"}</p><p className="text-[11px] text-[#5a6a82]">{formatPhone((o.customer as any)?.whatsapp || (o.customer as any)?.phone)}</p></td>}
          {hasPermission("orders.table.service_type") && <td className="text-xs text-[#5a6a82]">{(o.service_type as any)?.title || (o.general_service as any)?.name || (o.service as any)?.title || "—"}</td>}
          {hasPermission("orders.table.equipment") && <td className="text-xs text-[#5a6a82]">{equipmentSummary(o)}</td>}
          {hasPermission("orders.table.priority") && <td><PriorityBadge priority={o.priority || "normal"} /></td>}
          {hasPermission("orders.table.scheduled_at") && <td className="text-xs text-[#5a6a82]">{o.scheduled_at ? fmtDate(o.scheduled_at, true) : "—"}</td>}
          {hasPermission("orders.table.status") && <td><div className="flex flex-wrap items-center gap-1.5"><StatusBadge status={(o.order_status as any)?.name || "—"} color={(o.order_status as any)?.color} />{o.is_solved && !o.completed_at && !isCancelled(o) && <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-700">✓ Solucionada</span>}{o.cannot_be_solved && !isCancelled(o) && <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">⚠ Não solucionável</span>}</div></td>}
          {hasPermission("orders.table.situation") && <td>{(o.situation as any)?.name ? <StatusBadge status={(o.situation as any).name} color={(o.situation as any)?.color} /> : <span className="text-xs text-[#5a6a82]">—</span>}</td>}
          {hasPermission("orders.table.actions") && <td><div className="flex items-center justify-end gap-2">{canChangeSituation && <div onClick={event => event.stopPropagation()} className="w-40"><AdminSelect value={o.situation_id || ""} onValueChange={value => void onSituationChange(o, value)} options={situationOptions(o)} className="min-h-9 py-1.5 text-[11px] font-bold" ariaLabel={`Situação da OS ${o.os_number || ""}`} /></div>}{canEditOrder && !o.is_solved && !isCancelled(o) && <AdminButton variant="secondary" size="sm" onClick={event => { event.stopPropagation(); void onEdit(o); }} className="border-[#0057e7]/30 text-[#0057e7] hover:bg-[#0057e7]/5"><Edit2 size={14} /> Editar</AdminButton>}{canCancel(o) && <AdminButton variant="secondary" size="sm" onClick={event => { event.stopPropagation(); setCancelTarget(o); }} className="border-red-200 text-red-600 hover:bg-red-50"><Ban size={14} /> Cancelar</AdminButton>}</div></td>}
        </tr>)}</tbody></table></div>
      </>}
      <PaginationBar page={safePage} pageSize={pageSize} totalItems={totalItems} onPageChange={nextPage => onPageChange(Math.max(1, Math.min(nextPage, totalPages)))} onPageSizeChange={onPageSizeChange} />
    </AdminCard>
    <OrderCancelDialog
      order={cancelTarget}
      open={Boolean(cancelTarget)}
      loading={Boolean(cancelTarget && cancellingId === cancelTarget.id)}
      onClose={() => setCancelTarget(null)}
      onConfirm={async reason => { if (cancelTarget && await onCancel(cancelTarget, reason)) setCancelTarget(null); }}
    />
  </>;
}
