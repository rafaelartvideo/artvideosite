import { ClipboardList, Edit2, Trash2 } from "lucide-react";
import {
  EmptyState,
  formatPhone,
  LoadingState,
  PaginationBar,
  StatusBadge,
} from "@/shared/admin/AdminPrimitives";
import { PriorityBadge } from "./OrderFormControls";

export function OrdersTable({
  loading,
  filteredOrders,
  pagedOrders,
  statuses,
  hasActiveFilters,
  hasPermission,
  onOpen,
  onStatusChange,
  onSituationChange,
  getSituations,
  onEdit,
  onDelete,
  formatDate,
  equipmentSummary,
  page,
  pageSize,
  totalPages,
  onPageChange,
  onPageSizeChange,
}: {
  loading: boolean;
  filteredOrders: any[];
  pagedOrders: any[];
  statuses: any[];
  hasActiveFilters: boolean;
  hasPermission: (permission: string) => boolean;
  onOpen: (order: any) => void;
  onStatusChange: (order: any, statusId: string) => void;
  onSituationChange: (order: any, situationId: string) => void;
  getSituations: (serviceTypeId: string, situationId?: string, situation?: any) => any[];
  onEdit: (order: any) => void;
  onDelete: (orderId: string) => void;
  formatDate: (value?: string | null, time?: boolean) => string;
  equipmentSummary: (order: any) => string;
  page: number;
  pageSize: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}) {
  const filtered = filteredOrders;
  const openDetail = onOpen;
  const updateOrderStatus = onStatusChange;
  const updateOrderSituation = onSituationChange;
  const getSituationsForType = getSituations;
  const openEdit = onEdit;
  const setDeleteId = onDelete;
  const fmtDate = formatDate;
  const safePage = page;
  return (
<div className="bg-white rounded-xl border border-[#0d1b2e]/8 shadow-sm overflow-hidden">
        {loading ? <LoadingState /> : filtered.length === 0 ? (
          <EmptyState icon={ClipboardList} title="Nenhuma OS encontrada" message={hasActiveFilters ? "Tente ajustar os filtros." : "Crie a primeira OS com o botão Nova OS."} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[1100px]">
              <thead className="bg-[#f8fafc] text-[#5a6a82] text-[10px] uppercase font-bold border-b border-[#0d1b2e]/8">
                <tr>
                  <th className="px-4 py-3 text-left w-28">Protocolo</th>
                  <th className="px-4 py-3 text-left">Cliente</th>
                  <th className="px-4 py-3 text-left w-40">Tipo de atendimento</th>
                  <th className="px-4 py-3 text-left w-40">Equipamento</th>
                  <th className="px-4 py-3 text-left w-24">Prioridade</th>
                  <th className="px-4 py-3 text-left w-32">Data de agendamento</th>
                  <th className="px-4 py-3 text-left w-28">Status</th>
                  <th className="px-4 py-3 text-left w-36">Situação</th>
                  <th className="px-4 py-3 text-right w-28">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#0d1b2e]/5">
                {pagedOrders.map(o => (
                  <tr key={o.id} onClick={() => openDetail(o)} className="hover:bg-[#f8fafc]/80 cursor-pointer">
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2"><span aria-label={`Cor do status ${(o.order_status as any)?.name || "Sem status"}`} className="w-1.5 h-8 rounded-full flex-shrink-0" style={{ backgroundColor: (o.order_status as any)?.color || "transparent" }} /><span className="font-mono text-xs font-black text-[#0057e7]">{o.os_number || "—"}</span></div>
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="font-semibold text-[#0d1b2e] text-sm">{(o.customer as any)?.full_name || "—"}</p>
                      <p className="text-[11px] text-[#5a6a82]">{formatPhone((o.customer as any)?.whatsapp || (o.customer as any)?.phone)}</p>
                    </td>
                    <td className="px-4 py-3.5 text-xs text-[#5a6a82]">{(o.service_type as any)?.title || (o.general_service as any)?.name || (o.service as any)?.title || "—"}</td>
                    <td className="px-4 py-3.5 text-xs text-[#5a6a82]">{equipmentSummary(o)}</td>
                    <td className="px-4 py-3.5"><PriorityBadge priority={o.priority || "normal"} /></td>
                    <td className="px-4 py-3.5 text-xs text-[#5a6a82]">{o.scheduled_at ? fmtDate(o.scheduled_at, true) : "—"}</td>
                    <td className="px-4 py-3.5"><div className="flex flex-wrap items-center gap-1.5"><StatusBadge status={(o.order_status as any)?.name || "—"} color={(o.order_status as any)?.color} />{o.is_solved && <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-700">✓ Solucionada</span>}{o.cannot_be_solved && <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">⚠ Não solucionável</span>}</div></td>
                    <td className="px-4 py-3.5">{(o.situation as any)?.name ? <StatusBadge status={(o.situation as any).name} color={(o.situation as any)?.color} /> : <span className="text-xs text-[#5a6a82]">—</span>}</td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2 justify-end">
                        {hasPermission("orders.status") && <select value={o.status_id || ""} onClick={event => event.stopPropagation()} onChange={event => updateOrderStatus(o, event.target.value)} className="text-xs border border-[#0d1b2e]/15 rounded-lg px-2 py-1.5 font-bold bg-white cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#0057e7]/30">
                          {statuses.map(status => <option key={status.id} value={status.id}>{status.name}</option>)}
                        </select>}
                        {hasPermission("orders.edit") && <select value={o.situation_id || ""} onClick={event => event.stopPropagation()} onChange={event => void updateOrderSituation(o, event.target.value)} className="max-w-[130px] text-xs border border-[#0d1b2e]/15 rounded-lg px-2 py-1.5 font-bold bg-white cursor-pointer"><option value="">Situação</option>{getSituationsForType(o.service_type_id, o.situation_id, o.situation).map(situation => <option key={situation.id} value={situation.id}>{situation.name}</option>)}</select>}
                        {hasPermission("orders.edit") && !o.is_solved && <button onClick={(event) => { event.stopPropagation(); void openEdit(o); }} className="flex items-center gap-1.5 text-xs font-bold text-[#0057e7] border border-[#0057e7]/30 px-3 py-2 rounded-lg hover:bg-[#0057e7]/5 transition-colors"><Edit2 size={14} /> Editar</button>}
                        {hasPermission("orders.delete") && !o.is_solved && <button type="button" onClick={(event) => { event.stopPropagation(); setDeleteId(o.id); }} className="flex items-center gap-1.5 text-xs font-bold text-red-600 border border-red-200 px-3 py-2 rounded-lg hover:bg-red-50 transition-colors"><Trash2 size={14} /> Excluir</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <PaginationBar
          page={safePage}
          pageSize={pageSize}
          totalItems={filtered.length}
          onPageChange={(nextPage) => onPageChange(Math.max(1, Math.min(nextPage, totalPages)))}
          onPageSizeChange={(nextPageSize) => onPageSizeChange(nextPageSize)}
        />
      </div>
  );
}
