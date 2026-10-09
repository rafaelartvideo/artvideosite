import { useState } from "react";
import { Check, ClipboardList, Clock3, Edit2, MoreVertical, Printer } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { EmptyState, LoadingSpinner, StatusBadge, Toast } from "@/shared/ui/admin/AdminFeedback";
import { formatPhone } from "@/shared/domain/formatters";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { PaginationBar } from "@/shared/ui/admin/AdminPagination";
import { AdminButton, AdminCard, AdminDialog } from "@/shared/ui/admin/AdminLayout";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/shared/ui/primitives/dropdown-menu";
import { filteredRowNumber } from "../domain/order-list-display.mjs";
import { printServiceOrderA4 } from "../application/printServiceOrderA4";
import {
  getServiceOrderSituationHistory,
  type ServiceOrderSituationHistoryEntry,
} from "../infrastructure/order-situation-history.repository";

function SituationDot({ color }: { color?: string | null }) {
  return <span
    aria-hidden="true"
    className="h-2.5 w-2.5 shrink-0 rounded-full border border-black/5"
    style={{ backgroundColor: color || "#94a3b8" }}
  />;
}

export function OrdersTable({ loading, filteredOrders, pagedOrders, totalItems, hasActiveFilters, hasPermission, onOpen, onSituationChange, getSituations, onEdit, onComplete, formatDate, equipmentSummary, page, pageSize, totalPages, onPageChange, onPageSizeChange }: {
  loading: boolean; filteredOrders: any[]; pagedOrders: any[]; totalItems: number; hasActiveFilters: boolean;
  hasPermission: (permission: string) => boolean; onOpen: (order: any) => void;
  onSituationChange: (order: any, situationId: string) => void | Promise<unknown>; getSituations: (serviceTypeId: string, situationId?: string, situation?: any) => any[];
  onEdit: (order: any) => void; onComplete: (order: any) => void;
  formatDate: (value?: string | null, time?: boolean) => string; equipmentSummary: (order: any) => string;
  page: number; pageSize: number; totalPages: number; onPageChange: (page: number) => void; onPageSizeChange: (pageSize: number) => void;
}) {
  const { profile } = useAuth();
  const [printingOrderId, setPrintingOrderId] = useState<string | null>(null);
  const [historyOrder, setHistoryOrder] = useState<any | null>(null);
  const [historyEntries, setHistoryEntries] = useState<ServiceOrderSituationHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [actionToast, setActionToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  if (!hasPermission("orders.table.view")) return null;
  const canOpenDetails = hasPermission("orders.details.view");
  const canChangeSituation = hasPermission("orders.situation.change");
  const canEditOrder = hasPermission("orders.edit");
  const canCompleteOrder = hasPermission("orders.complete");
  const canPrint = hasPermission("documents.print");
  const canViewSituation = hasPermission("orders.table.situation");
  const filtered = filteredOrders;
  const fmtDate = formatDate;
  const safePage = page;
  const openDetails = (order: any) => { if (canOpenDetails) onOpen(order); };
  const isCancelled = (order: any) => Boolean(order.cancelled_at) || String(order.order_status?.name || "").toLowerCase() === "cancelada";
  const isSolvedPendingCompletion = (order: any) => Boolean(order.is_solved) && !order.completed_at && !isCancelled(order);
  const canComplete = (order: any) => canCompleteOrder && isSolvedPendingCompletion(order);
  const canEdit = (order: any) => canEditOrder && !order.is_solved && !isCancelled(order);
  const rowNumber = (index: number) => filteredRowNumber({ page: safePage, pageSize, index });
  const availableSituations = (order: any) => getSituations(order.service_type_id, order.situation_id, order.situation);

  const printA4 = async (order: any) => {
    if (!canPrint || printingOrderId) return;
    setPrintingOrderId(order.id);
    try {
      await printServiceOrderA4({
        order,
        printedBy: profile?.full_name,
        canPrintChecklists: hasPermission("orders.section.checklists"),
      });
    } catch (error) {
      setActionToast({ msg: systemErrorMessage(error, "Não foi possível imprimir a OS."), type: "error" });
    } finally {
      setPrintingOrderId(null);
    }
  };

  const openSituationHistory = async (order: any) => {
    if (!order?.id || !order?.organization_id) return;
    setHistoryOrder(order);
    setHistoryEntries([]);
    setHistoryError("");
    setHistoryLoading(true);
    try {
      setHistoryEntries(await getServiceOrderSituationHistory(order.organization_id, order.id));
    } catch (error) {
      setHistoryError(systemErrorMessage(error, "Não foi possível carregar o histórico de situações."));
    } finally {
      setHistoryLoading(false);
    }
  };

  const situationHistoryButton = (order: any) => (
    <button
      type="button"
      onClick={event => {
        event.stopPropagation();
        void openSituationHistory(order);
      }}
      aria-label={`Ver alterações da situação da OS ${order.os_number || ""}`}
      title="Histórico da situação"
      className="inline-flex h-7 w-7 shrink-0 items-center justify-center text-foreground transition-opacity hover:opacity-65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
    >
      <Clock3 size={14} />
    </button>
  );

  const quickActions = (order: any) => {
    const situations = availableSituations(order);
    const editable = canEdit(order);
    const hasAnyAction = canPrint || canChangeSituation || editable;

    return <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          onClick={event => event.stopPropagation()}
          aria-label={`Ações rápidas da OS ${order.os_number || ""}`}
          title="Ações rápidas"
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center bg-transparent text-foreground transition-opacity hover:opacity-65 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        >
          <MoreVertical size={17} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56" onClick={event => event.stopPropagation()}>
        {!hasAnyAction && <DropdownMenuItem disabled>Nenhuma ação disponível</DropdownMenuItem>}

        {canPrint && <DropdownMenuItem
          disabled={printingOrderId === order.id}
          onSelect={() => void printA4(order)}
          className="font-semibold"
        >
          <Printer size={15} />
          {printingOrderId === order.id ? "Preparando A4..." : "Imprimir A4"}
        </DropdownMenuItem>}

        {canPrint && (canChangeSituation || editable) && <DropdownMenuSeparator />}

        {canChangeSituation && <DropdownMenuSub>
          <DropdownMenuSubTrigger className="gap-2 font-semibold">
            <SituationDot color={(order.situation as any)?.color} />
            Alterar situação
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="min-w-56">
            {situations.map((situation: any) => (
              <DropdownMenuItem
                key={situation.id}
                onSelect={() => {
                  if (order.situation_id !== situation.id) void onSituationChange(order, situation.id);
                }}
                className="gap-2"
              >
                <SituationDot color={situation.color} />
                <span className="min-w-0 flex-1 truncate">{situation.name}</span>
                {order.situation_id === situation.id && <Check size={14} className="text-[#0057e7]" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>}

        {canChangeSituation && editable && <DropdownMenuSeparator />}

        {editable && <DropdownMenuItem
          onSelect={() => onEdit(order)}
          className="font-semibold"
        >
          <Edit2 size={15} />
          Editar OS
        </DropdownMenuItem>}
      </DropdownMenuContent>
    </DropdownMenu>;
  };

  return <>
    {actionToast && <Toast message={actionToast.msg} type={actionToast.type} onClose={() => setActionToast(null)} />}

    <AdminDialog
      open={Boolean(historyOrder)}
      onClose={() => {
        setHistoryOrder(null);
        setHistoryEntries([]);
        setHistoryError("");
      }}
      title={`Histórico da situação · OS ${historyOrder?.os_number || "—"}`}
      description="Alterações registradas para a situação desta ordem de serviço."
      className="max-w-xl"
    >
      {historyLoading ? <div className="flex min-h-40 flex-col items-center justify-center gap-3">
        <LoadingSpinner />
        <p className="text-sm font-semibold text-muted-foreground">Carregando alterações...</p>
      </div> : historyError ? <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{historyError}</div> : historyEntries.length === 0 ? <div className="rounded-xl border border-border bg-muted px-4 py-6 text-center text-sm text-muted-foreground">
        Nenhuma alteração de situação foi registrada para esta OS.
      </div> : <div className="space-y-0">
        {historyEntries.map((entry, index) => <div key={entry.audit_log_id} className="relative flex gap-3 pb-5 last:pb-0">
          {index < historyEntries.length - 1 && <span className="absolute left-[7px] top-5 h-[calc(100%-12px)] w-px bg-[#d9e1ec]" aria-hidden="true" />}
          <span className="relative z-10 mt-1.5 h-3.5 w-3.5 shrink-0 rounded-full border-2 border-white bg-[#0057e7] shadow-[0_0_0_1px_#cfd8e6]" aria-hidden="true" />
          <div className="min-w-0 flex-1 rounded-xl border border-border bg-muted p-3">
            <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm font-bold text-foreground">
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <SituationDot color={entry.previous_situation_color} />
                <span className="truncate">{entry.previous_situation_name || "Sem situação"}</span>
              </span>
              <span className="text-muted-foreground">→</span>
              <span className="inline-flex min-w-0 items-center gap-1.5">
                <SituationDot color={entry.next_situation_color} />
                <span className="truncate">{entry.next_situation_name || "Sem situação"}</span>
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-medium text-[#6b788a]">
              <span>{entry.actor_name || "Sistema"}</span>
              <span aria-hidden="true">•</span>
              <span>{fmtDate(entry.changed_at, true)}</span>
            </div>
          </div>
        </div>)}
      </div>}
    </AdminDialog>

    <AdminCard className="[&_th]:md:py-2 [&_td]:md:py-2.5">
      {loading ? (
        <div className="flex min-h-[300px] flex-col items-center justify-center gap-3 px-4 py-12 text-center" role="status" aria-live="polite" aria-busy="true">
          <LoadingSpinner size="lg" />
          <p className="text-sm font-semibold text-muted-foreground">Carregando ordens...</p>
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
                        {hasPermission("orders.table.os") && <p className="font-mono text-lg font-black text-foreground">OS {o.os_number || "—"}</p>}
                        {hasPermission("orders.table.external_os") && o.external_os_number && <p className="truncate text-sm font-black text-muted-foreground">OS Externa {o.external_os_number}</p>}
                        {hasPermission("orders.table.customer") && <p className="truncate text-sm font-bold text-foreground">{(o.customer as any)?.full_name || "—"}</p>}
                      </div>
                    </div>
                  </div>
                  {hasPermission("orders.table.actions") && <div onClick={event => event.stopPropagation()}>{quickActions(o)}</div>}
                </div>
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  {canViewSituation && ((o.situation as any)?.name
                    ? <div className="inline-flex min-w-0 items-center gap-1">
                        <StatusBadge status={(o.situation as any).name} color={(o.situation as any)?.color} />
                        {situationHistoryButton(o)}
                      </div>
                    : <span className="text-xs text-muted-foreground">—</span>)}
                  {o.cannot_be_solved && !isCancelled(o) && <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">⚠ Não solucionável</span>}
                </div>
                <div className="grid min-w-0 grid-cols-2 gap-x-4 gap-y-2 text-xs">
                  <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Data de abertura</p><p className="truncate font-medium text-muted-foreground">{o.created_at ? fmtDate(o.created_at, true) : "—"}</p></div>
                  {hasPermission("orders.table.customer") && <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Contato</p><p className="truncate font-medium text-muted-foreground">{formatPhone((o.customer as any)?.whatsapp || (o.customer as any)?.phone) || "—"}</p></div>}
                  {hasPermission("orders.table.scheduled_at") && <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Agendamento</p><p className="truncate font-medium text-muted-foreground">{o.scheduled_at ? fmtDate(o.scheduled_at, true) : "—"}</p></div>}
                  {hasPermission("orders.table.service_type") && <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Atendimento</p><p className="truncate font-medium text-muted-foreground">{(o.service_type as any)?.title || (o.general_service as any)?.name || (o.service as any)?.title || "—"}</p></div>}
                  {hasPermission("orders.table.equipment") && <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">Equipamento</p><p className="truncate font-medium text-muted-foreground">{equipmentSummary(o) || "—"}</p></div>}
                </div>
                {hasPermission("orders.table.actions") && canComplete(o) && <div onClick={event => event.stopPropagation()} className="flex justify-end border-t border-border pt-3">
                  <AdminButton variant="primary" size="sm" onClick={event => { event.stopPropagation(); onComplete(o); }} aria-label={`Concluir OS ${o.os_number || ""}`} title="Concluir OS" className="h-9 shrink-0 px-2.5"><span>Concluir</span></AdminButton>
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
                {canViewSituation && <th className="w-44 text-left">Situação</th>}
                {hasPermission("orders.table.actions") && <th className="w-28 text-right">Ações</th>}
              </tr></thead>
              <tbody>{pagedOrders.map((o, index) => <tr key={o.id} onClick={() => openDetails(o)} className="cursor-default">
                {hasActiveFilters && <td className="font-mono text-xs font-black text-muted-foreground">{rowNumber(index)}</td>}
                {hasPermission("orders.table.os") && <td><div className="flex items-center gap-2"><span aria-label={`Cor do status ${(o.order_status as any)?.name || "Sem status"}`} className="h-8 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: (o.order_status as any)?.color || "transparent" }} /><div className="flex min-w-0 flex-wrap items-center gap-1.5"><span className="font-mono text-base font-black text-foreground">{o.os_number || "—"}</span>{o.cannot_be_solved && !isCancelled(o) && <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">⚠ Não solucionável</span>}</div></div></td>}
                {hasPermission("orders.table.external_os") && <td className="font-mono text-base font-black text-muted-foreground">{o.external_os_number || "—"}</td>}
                {hasPermission("orders.table.customer") && <td><p className="text-sm font-semibold text-foreground">{(o.customer as any)?.full_name || "—"}</p><p className="text-[11px] text-muted-foreground">{formatPhone((o.customer as any)?.whatsapp || (o.customer as any)?.phone)}</p></td>}
                {hasPermission("orders.table.service_type") && <td className="text-xs text-muted-foreground">{(o.service_type as any)?.title || (o.general_service as any)?.name || (o.service as any)?.title || "—"}</td>}
                {hasPermission("orders.table.equipment") && <td className="text-xs text-muted-foreground">{equipmentSummary(o)}</td>}
                <td className="text-xs text-muted-foreground">{o.created_at ? fmtDate(o.created_at, true) : "—"}</td>
                {hasPermission("orders.table.scheduled_at") && <td className="text-xs text-muted-foreground">{o.scheduled_at ? fmtDate(o.scheduled_at, true) : "—"}</td>}
                {canViewSituation && <td>{(o.situation as any)?.name
                  ? <div className="flex min-w-0 items-center gap-1">
                      <StatusBadge status={(o.situation as any).name} color={(o.situation as any)?.color} />
                      {situationHistoryButton(o)}
                    </div>
                  : <span className="text-xs text-muted-foreground">—</span>}</td>}
                {hasPermission("orders.table.actions") && <td><div onClick={event => event.stopPropagation()} className="flex items-center justify-end gap-2">
                  {canComplete(o) && <AdminButton variant="primary" size="sm" onClick={event => { event.stopPropagation(); onComplete(o); }}>Concluir</AdminButton>}
                  {quickActions(o)}
                </div></td>}
              </tr>)}</tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border px-4 py-3 text-[11px] md:py-2 font-semibold text-muted-foreground" aria-label="Legenda dos indicadores da ordem de serviço">
            <span className="font-bold text-foreground">Legenda:</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-[#16a34a]" aria-hidden="true" />Aberta</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-[#0057e7]" aria-hidden="true" />Fechada</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-3 w-3 rounded-full bg-[#dc2626]" aria-hidden="true" />Cancelada</span>
            {hasActiveFilters && <span className="inline-flex items-center border-l border-border pl-4 font-normal text-[#0057e7]">Total do filtro: {totalItems} OS</span>}
          </div>
        </>
      )}
      <PaginationBar page={safePage} pageSize={pageSize} totalItems={totalItems} onPageChange={nextPage => onPageChange(Math.max(1, Math.min(nextPage, totalPages)))} onPageSizeChange={onPageSizeChange} />
    </AdminCard>
  </>;
}
