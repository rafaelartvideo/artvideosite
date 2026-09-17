import { ClipboardList, Edit2 } from "lucide-react";
import { EmptyState, LoadingSpinner, StatusBadge } from "@/shared/ui/admin/AdminFeedback";
import { formatPhone } from "@/shared/domain/formatters";
import { PaginationBar } from "@/shared/ui/admin/AdminPagination";
import { AdminButton, AdminCard } from "@/shared/ui/admin/AdminLayout";
import { AdminSelect } from "@/shared/ui/admin/AdminFormControls";
import { filteredRowNumber } from "../domain/order-list-display.mjs";

export function OrdersTable({ loading, filteredOrders, pagedOrders, totalItems, hasActiveFilters, hasPermission, onOpen, onSituationChange, getSituations, onEdit, onComplete, formatDate, equipmentSummary, page, pageSize, totalPages, onPageChange, onPageSizeChange }: {
  loading: boolean; filteredOrders: any[]; pagedOrders: any[]; totalItems: number; hasActiveFilters: boolean;
  hasPermission: (permission: string) => boolean; onOpen: (order: any) => void;
  onSituationChange: (order: any, situationId: string) => void; getSituations: (serviceTypeId: string, situationId?: string, situation?: any) => any[];
  onEdit: (order: any) => void; onComplete: (order: any) => void;
  formatDate: (value?: string | null, time?: boolean) => string; equipmentSummary: (order: any) => string;
  page: number; pageSize: number; totalPages: number; onPageChange: (page: number) => void; onPageSizeChange: (pageSize: number) => void;
}) {
  if (!hasPermission("orders.table.view")) return null;
  const canOpenDetails = hasPermission("orders.details.view");
  const canChangeSituation = hasPermission("orders.situation.change");
  const canEditOrder = hasPermission("orders.edit");
  const canCompleteOrder = hasPermission("orders.complete");
  const filtered = filteredOrders;
  const fmtDate = formatDate;
  const safePage = page;
  const situationOptions = (order: any) => [{ value: "", label: "Situação: selecionar" }, ...getSituations(order.service_type_id, order.situation_id, order.situation).map(situation => ({ value: situation.id, label: `Situação: ${situation.name}` }))];
  const openDetails = (order: any) => { if (canOpenDetails) onOpen(order); };
  const isCancelled = (order: any) => Boolean(order.cancelled_at) || String(order.order_status?.name || "").toLowerCase() === "cancelada";
  const isSolvedPendingCompletion = (order: any) => Boolean(order.is_solved) && !order.completed_at && !isCancelled(order);
  const canComplete = (order: any) => canCompleteOrder && isSolvedPendingCompletion(order);
  const rowNumber = (index: number) => filteredRowNumber({ page: safePage, pageSize, index });

  return (
    <AdminCard>
      {loading ? (
        <div className="flex min-h-[300px] flex-col items-center justify-center gap-3 px-4 py-12 text-center" role="status" aria-live="polite" aria-busy="true">
          <LoadingSpinner size="lg" />
          <p className="text-sm font-semibold text-[#5a6a82]">Carregando ordens...</p>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={ClipboardList} title="Nenhuma OS encontrada" message={hasActiveFilters ? "Tente ajustar os filtros." : "Crie a primeira OS com o botão Nova OS."} />
      ) : (
        <>
          <div className="divide-y divide-[#0d1b2e]/8 md:hidden">
            {pagedOrders.map((o, index) => (
              <article key={o.id} role={canOpenDetails ? "button" : undefined} tabIndex={canOpenDetails ? 0 : undefined} onClick={() => openDetails(o)} onKeyDown={event => { if (canOpenDetails && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); openDetails(o); } }} className="min-w-0 cursor-default space-y-3 overflow-hidden p-4 transition-colors active:bg-[#f5f7fa]">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-2">
                      {hasActiveFilters && <span className="flex h-7 min-w-7 shrink-0 items-center justify-center rounded-lg bg-[#eef5ff] px-1.5 font-mono text-[11px] font-black text-[#0057e7]">{rowNumber(index)}</span>}
                      <span aria-label={`Cor do status ${(o.order_status as any)?.name || "Sem status"}`} className="h-8 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: (o.order_status as any)?.color || "transparent" }} />
                      <div className="min-w-0">
                        {hasPermission("orders.table.os") && <p className="font-mono text-lg font-black text-[#0057e7]">OS {o.os_number || "—"}</p>}
                        {hasPermission("orders.table.external_os") && o.external_os_number && <p className="truncate text-sm font-black text-[#5a6a82]">OS Externa {o.external_os_number}</p>}
                        {hasPermission("orders.table.customer") && <p className="truncate text-sm font-bold text-[#0d1b2e]">{(o.customer as any)?.full_name || "—"}</p>}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">{hasPermission("orders.table.situation") && (o.situation as any)?.name && <StatusBadge status={(o.situation as any).name} color={(o.situation as any)?.color} />}{o.cannot_be_solved && !isCancelled(o) && <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">⚠ Não solucionável</span>}</div>
                <div className="grid min-w-0 grid-cols-2 gap-x-4 gap-y-2 text-xs">
                  <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wide text-[#8a96a8]">Data de abertura</p><p className="truncate font-medium text-[#5a6a82]">{o.created_at ? fmtDate(o.created_at, true) : "—"}</p></div>
                  {hasPermission("orders.table.customer") && <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wide text-[#8a96a8]">Contato</p><p className="truncate font-medium text-[#5a6a82]">{formatPhone((o.customer as any)?.whatsapp || (o.customer as any)?.phone) || "—"}</p></div>}
                  {hasPermission("orders.table.scheduled_at") && <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wide text-[#8a96a8]">Agendamento</p><p className="truncate font-medium text-[#5a6a82]">{o.scheduled_at ? fmtDate(o.scheduled_at, true) : "—"}</p></div>}
                  {hasPermission("orders.table.service_type") && <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wide text-[#8a96a8]">Atendimento</p><p className="truncate font-medium text-[#5a6a82]">{(o.service_type as any)?.title || (o.general_service as any)?.name || (o.service as any)?.title || "—"}</p></div>}
                  {hasPermission("orders.table.equipment") && <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wide text-[#8a96a8]">Equipamento</p><p className="truncate font-medium text-[#5a6a82]">{equipmentSummary(o) || "—"}</p></div>}
                </div>
                {hasPermission("orders.table.actions") && <div onClick={event => event.stopPropagation()} className="flex min-w-0 flex-wrap items-center gap-1.5 border-t border-[#0d1b2e]/8 pt-3">
                  {canChangeSituation && <div className="min-w-[150px] flex-1"><AdminSelect value={o.situation_id || ""} onValueChange={value => void onSituationChange(o, value)} options={situationOptions(o)} className="h-9 min-h-9 min-w-0 px-2 py-1 text-[10px] font-bold" ariaLabel={`Situação da OS ${o.os_number || ""}`} /></div>}
                  {canComplete(o) && <AdminButton variant="primary" size="sm" onClick={event => { event.stopPropagation(); onComplete(o); }} aria-label={`Concluir OS ${o.os_number || ""}`} title="Concluir OS" className="h-9 shrink-0 px-2.5"><span>Concluir</span></AdminButton>}
                  {canEditOrder && !o.is_solved && !isCancelled(o) && <AdminButton variant="secondary" size="sm" onClick={event => { event.stopPropagation(); void onEdit(o); }} aria-label={`Editar OS ${o.os_number || ""}`} title="Editar" className="h-9 w-9 min-w-0 shrink-0 border-[#0057e7]/30 p-0 text-[#0057e7] hover:bg-[#0057e7]/5"><Edit2 size={15} /></AdminButton>}
                </div>}
              </article>
            ))}
          </div>

          <div className="hidden overflow-x-auto md:block">
            <table className="min-w-[1120px]">
              <thead><tr>
                {hasActiveFilters && <th className="w-14 text-left">#</th>}
                {hasPermission("orders.table.os") && <th className="w-36 text-left">OS</th>}
                {hasPermission("orders.table.external_os") && <th className="w-32 text-left">OS Externa</th>}
                {hasPermission("orders.table.customer") && <th className="text-left">Cliente</th>}
                {hasPermission("orders.table.service_type") && <th className="w-40 text-left">Tipo de atendimento</th>}
                {hasPermission("orders.table.equipment") && <th className="w-40 text-left">Equipamento</th>}
                <th className="w-36 text-left">Data de abertura</th>
                {hasPermission("orders.table.scheduled_at") && <th className="w-36 text-left">Data de agendamento</th>}
                {hasPermission("orders.table.situation") && <th className="w-36 text-left">Situação</th>}
                {hasPermission("orders.table.actions") && <th className="w-36 text-right">Ações</th>}
              </tr></thead>
              <tbody>{pagedOrders.map((o, index) => <tr key={o.id} onClick={() => openDetails(o)} className="cursor-default">
                {hasActiveFilters && <td className="font-mono text-xs font-black text-[#5a6a82]">{rowNumber(index)}</td>}
                {hasPermission("orders.table.os") && <td><div className="flex items-center gap-2"><span aria-label={`Cor do status ${(o.order_status as any)?.name || "Sem status"}`} className="h-8 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: (o.order_status as any)?.color || "transparent" }} /><div className="flex min-w-0 flex-wrap items-center gap-1.5"><span className="font-mono text-base font-black text-[#0057e7]">{o.os_number || "—"}</span>{o.cannot_be_solved && !isCancelled(o) && <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">⚠ Não solucionável</span>}</div></div></td>}
                {hasPermission("orders.table.external_os") && <td className="font-mono text-base font-black text-[#5a6a82]">{o.external_os_number || "—"}</td>}
                {hasPermission("orders.table.customer") && <td><p className="text-sm font-semibold text-[#0d1b2e]">{(o.customer as any)?.full_name || "—"}</p><p className="text-[11px] text-[#5a6a82]">{formatPhone((o.customer as any)?.whatsapp || (o.customer as any)?.phone)}</p></td>}
                {hasPermission("orders.table.service_type") && <td className="text-xs text-[#5a6a82]">{(o.service_type as any)?.title || (o.general_service as any)?.name || (o.service as any)?.title || "—"}</td>}
                {hasPermission("orders.table.equipment") && <td className="text-xs text-[#5a6a82]">{equipmentSummary(o)}</td>}
                <td className="text-xs text-[#5a6a82]">{o.created_at ? fmtDate(o.created_at, true) : "—"}</td>
                {hasPermission("orders.table.scheduled_at") && <td className="text-xs text-[#5a6a82]">{o.scheduled_at ? fmtDate(o.scheduled_at, true) : "—"}</td>}
                {hasPermission("orders.table.situation") && <td>{(o.situation as any)?.name ? <StatusBadge status={(o.situation as any).name} color={(o.situation as any)?.color} /> : <span className="text-xs text-[#5a6a82]">—</span>}</td>}
                {hasPermission("orders.table.actions") && <td><div className="flex items-center justify-end gap-2">
                  {canChangeSituation && <div onClick={event => event.stopPropagation()} className="w-40"><AdminSelect value={o.situation_id || ""} onValueChange={value => void onSituationChange(o, value)} options={situationOptions(o)} className="min-h-9 py-1.5 text-[11px] font-bold" ariaLabel={`Situação da OS ${o.os_number || ""}`} /></div>}
                  {canComplete(o) && <AdminButton variant="primary" size="sm" onClick={event => { event.stopPropagation(); onComplete(o); }}>Concluir</AdminButton>}
                  {canEditOrder && !o.is_solved && !isCancelled(o) && <AdminButton variant="secondary" size="sm" onClick={event => { event.stopPropagation(); void onEdit(o); }} className="border-[#0057e7]/30 text-[#0057e7] hover:bg-[#0057e7]/5"><Edit2 size={14} /> Editar</AdminButton>}
                </div></td>}
              </tr>)}</tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[#0d1b2e]/8 px-4 py-3 text-[11px] font-semibold text-[#5a6a82]" aria-label="Legenda dos indicadores da ordem de serviço">
            <span className="font-bold text-[#0d1b2e]">Legenda:</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-[#16a34a]" aria-hidden="true" />Aberta</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-[#0057e7]" aria-hidden="true" />Fechada</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-[#dc2626]" aria-hidden="true" />Cancelada</span>
            {hasActiveFilters && <span className="inline-flex items-center border-l border-[#0d1b2e]/10 pl-4 font-normal text-[#0057e7]">Total do filtro: {totalItems} OS</span>}
          </div>
        </>
      )}
      <PaginationBar page={safePage} pageSize={pageSize} totalItems={totalItems} onPageChange={nextPage => onPageChange(Math.max(1, Math.min(nextPage, totalPages)))} onPageSizeChange={onPageSizeChange} />
    </AdminCard>
  );
}