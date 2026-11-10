import { isOrderSituationLocked } from "../domain/order-situation-lock";
import { getOrderStatusBadgeClass } from "../domain/order-status-palette";
import { useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import { Ban, Edit2, GripVertical } from "lucide-react";
import { cn } from "@/shared/domain/formatters";
import { AdminSelect } from "@/shared/ui/admin/AdminFormControls";
import { AdminButton } from "@/shared/ui/admin/AdminLayout";
import { OrderCancelDialog } from "./OrderCancelDialog";
import { OrderStatusDot } from "./OrderStatusDot";
import { OrderLifecycleTag } from "./OrderLifecycleTag";

export function OrdersKanban({ filteredOrders, situations, serviceTypeSituations, serviceTypes, selectedServiceTypeId, onServiceTypeChange, topPagination, draggingId, dragOverSituationId, hasPermission, onDragOver, onDragLeave, onDrop, onCardDragStart, onCardDragEnd, onOpen, onSituationChange, onEdit, onCancel, cancellingId, formatDate }: {
  filteredOrders: any[];
  situations: any[]; serviceTypeSituations: any[]; serviceTypes: any[];
  selectedServiceTypeId: string; onServiceTypeChange: (serviceTypeId: string) => void;
  topPagination?: React.ReactNode;
  draggingId: string | null; dragOverSituationId: string | null;
  hasPermission: (permission: string) => boolean; onDragOver: (situationId: string) => void; onDragLeave: (situationId: string) => void; onDrop: (situationId: string) => void;
  onCardDragStart: (event: React.DragEvent<HTMLDivElement>, order: any) => void; onCardDragEnd: () => void; onOpen: (order: any) => void;
  onSituationChange: (order: any, situationId: string) => void; onEdit: (order: any) => void; onCancel: (order: any, reason: string) => Promise<boolean>; cancellingId: string | null;
  formatDate: (value?: string | null, time?: boolean) => string;
}) {
  const [cancelTarget, setCancelTarget] = useState<any>(null);
  const topScrollRef = useRef<HTMLDivElement>(null);
  const boardScrollRef = useRef<HTMLDivElement>(null);
  const [boardScrollWidth, setBoardScrollWidth] = useState(0);
  const [horizontalOverflow, setHorizontalOverflow] = useState(false);

  // As etapas pertencem ao tipo de atendimento, não à lista global de situações.
  // Mantém a ordem de configuração e não cria colunas para situações sem vínculo.
  // Indexa os vínculos uma vez para montar apenas as colunas configuradas.
  const situationsByType = useMemo(() => {
    const byId = new Map(situations.map(situation => [situation.id, situation]));
    const map = new Map<string, any[]>();
    const linked = [...serviceTypeSituations].sort((a, b) =>
      Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0));
    for (const link of linked) {
      if (!link.service_type_id || !link.situation_id) continue;
      const situation = byId.get(link.situation_id);
      if (!situation) continue;
      const group = map.get(link.service_type_id) || [];
      if (group.some(item => item.id === situation.id)) continue;
      group.push(situation);
      map.set(link.service_type_id, group);
    }
    return map;
  }, [situations, serviceTypeSituations]);
  const linkedColumns = (situationsByType.get(selectedServiceTypeId) || [])
    .map(situation => ({ id: situation.id, name: situation.name, color: situation.color || "var(--primary)" }));
  const linkedIds = new Set(linkedColumns.map(column => column.id));
  const columns = linkedColumns;
  const displayedOrders = selectedServiceTypeId
    ? filteredOrders.filter(order => order.service_type_id === selectedServiceTypeId && linkedIds.has(order.situation_id))
    : [];

  // Espelha a rolagem horizontal do quadro numa barra no TOPO; ResizeObserver
  // recalcula a largura quando a tela ou a quantidade de colunas mudar.
  useEffect(() => {
    if (!boardScrollRef.current) return;
    const board = boardScrollRef.current;
    if (!board) return;
    const measure = () => {
      setBoardScrollWidth(board.scrollWidth);
      setHorizontalOverflow(board.scrollWidth > board.clientWidth + 1);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(board);
    if (board.firstElementChild) observer.observe(board.firstElementChild);
    window.addEventListener("resize", measure);
    measure();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [linkedColumns.length]);

  // Ao trocar o tipo de atendimento, posiciona o quadro no início.
  useEffect(() => {
    if (boardScrollRef.current) boardScrollRef.current.scrollLeft = 0;
    if (topScrollRef.current) topScrollRef.current.scrollLeft = 0;
  }, [selectedServiceTypeId]);

  const syncTopScroll = () => {
    const top = topScrollRef.current;
    const board = boardScrollRef.current;
    if (top && board && Math.abs(top.scrollLeft - board.scrollLeft) > 1) top.scrollLeft = board.scrollLeft;
  };
  const syncBoardScroll = () => {
    const top = topScrollRef.current;
    const board = boardScrollRef.current;
    if (top && board && Math.abs(board.scrollLeft - top.scrollLeft) > 1) board.scrollLeft = top.scrollLeft;
  };

  if (!hasPermission("orders.kanban.view")) return null;
  const canOpenDetails = hasPermission("orders.details.view");
  const canChangeSituation = hasPermission("orders.situation.change");
  const canEdit = hasPermission("orders.edit");
  const canCancelPermission = hasPermission("orders.cancel");
  const isCancelled = (order: any) => Boolean(order.cancelled_at) || String(order.order_status?.name || "").toLowerCase() === "cancelada";
  const canCancel = (order: any) => canCancelPermission && !order.completed_at && !isCancelled(order);
  const canDrag = (order: any) => canChangeSituation && !isOrderSituationLocked(order)
    && (!order.return_root_id || order.return_classification !== "analysis");
  return <>
    <div className="mb-3 min-w-0 border-b border-border">
      <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        Tipo de atendimento
      </p>
      <nav role="tablist" aria-label="Tipos de atendimento do Kanban"
        className="flex min-w-0 w-full flex-nowrap items-center gap-2 overflow-x-auto pb-3">
        {serviceTypes.filter(type => type.id).map(type => {
          const active = selectedServiceTypeId === type.id;
          return <button
            key={type.id}
            type="button"
            role="tab"
            aria-selected={active}
            aria-controls="orders-kanban-board"
            onClick={() => { if (!active) onServiceTypeChange(type.id); }}
            className={cn(
              "inline-flex min-h-10 shrink-0 items-center justify-center whitespace-nowrap rounded-lg border px-3.5 py-2 text-xs font-bold transition-colors sm:text-sm",
              active
                ? "border-primary bg-primary text-primary-foreground shadow-sm"
                : "border-border bg-card text-foreground hover:border-primary/40 hover:bg-muted",
            )}
          >
            {type.title || type.name || "Sem nome"}
          </button>;
        })}
      </nav>
    </div>
    {selectedServiceTypeId && topPagination}
    <div id="orders-kanban-board">
    {(!selectedServiceTypeId || linkedColumns.length === 0) && <p className="mb-2 text-xs text-muted-foreground">
      {!selectedServiceTypeId
        ? "Selecione um tipo de atendimento para visualizar as situações."
        : "Nenhuma situação vinculada a esse atendimento."}
    </p>}
    <>
      <div ref={topScrollRef} onScroll={syncBoardScroll} aria-label="Rolagem horizontal superior do Kanban"
        className={cn("mb-2 h-4 w-full overflow-x-auto overflow-y-hidden [scrollbar-gutter:stable]", !horizontalOverflow && "hidden")}>
        <div style={{ width: boardScrollWidth, height: 1 }} />
      </div>
      <div ref={boardScrollRef} onScroll={syncTopScroll} className="w-full overflow-x-auto pb-3" aria-label="Colunas do Kanban">
        <div className="flex min-w-max items-start gap-3 md:gap-4">{columns.map(column => {
        const columnOrders = displayedOrders.filter(order => order.situation_id === column.id);
        const isDragTarget = canChangeSituation && dragOverSituationId === column.id;
        return <div
          key={column.id}
          onDragOver={event => {
            if (!canChangeSituation || !draggingId || !column.id) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            onDragOver(column.id);
          }}
          onDragLeave={() => canChangeSituation && onDragLeave(column.id)}
          onDrop={event => {
            if (!canChangeSituation || !draggingId || !column.id) return;
            event.preventDefault();
            onDrop(column.id);
          }}
          className={cn(
            "w-[min(85vw,320px)] shrink-0 overflow-hidden rounded-xl border bg-muted transition-all md:w-[320px]",
            isDragTarget ? "border-primary bg-primary-soft ring-2 ring-primary/10" : "border-border",
          )}
        >
          <div className="flex items-center justify-between gap-2 border-b border-border bg-white px-3 py-2.5 md:px-4 md:py-3">
            <div className="flex min-w-0 items-center gap-2">
              <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: column.color }} />
              <span className="truncate text-sm font-bold text-[#0d1b2e]">{column.name}</span>
            </div>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-bold text-[#5a6a82] md:bg-transparent md:px-0 md:py-0 md:text-xs">{columnOrders.length}</span>
          </div>

          <div className="min-h-0 space-y-2 p-2.5 md:min-h-[180px] md:space-y-3 md:p-3">
            {columnOrders.length === 0 ? <p className={cn("rounded-lg py-5 text-center text-[11px] text-[#5a6a82] transition-colors md:py-10 md:text-xs", isDragTarget && "bg-white/70 text-primary")}>{draggingId && canChangeSituation && column.id ? "Solte a OS aqui." : "Nenhuma OS."}</p> : columnOrders.map(order => {
              const draggable = canDrag(order);
              const orderSituations = linkedColumns;
              const orderStatus = order.order_status as any;
              return <div
                key={order.id}
                draggable={draggable}
                onDragStart={event => draggable && onCardDragStart(event, order)}
                onDragEnd={() => draggable && onCardDragEnd()}
                onClick={() => canOpenDetails && onOpen(order)}
                className={cn(
                  "rounded-lg border border-border bg-white p-3 shadow-sm transition-all",
                  canOpenDetails && "hover:border-primary/30",
                  draggable && "md:cursor-grab md:active:cursor-grabbing",
                  draggingId === order.id && "scale-[0.98] opacity-45",
                )}
              >
                <div className="flex min-w-0 items-center gap-2">
                  {draggable && <GripVertical size={14} className="hidden shrink-0 text-[#5a6a82]/60 md:block" />}
                  <OrderStatusDot status={orderStatus?.name || ""} color={orderStatus?.color} isReturn={Boolean(order.return_root_id)} />
                  <span className={cn("min-w-0 flex-1 truncate font-mono text-xs font-black", order.return_root_id ? "text-orange-600" : "text-primary")}>{order.os_number || "—"}</span>
                  {orderStatus?.name && <span className={`shrink-0 rounded-full border px-2 py-1 text-[9px] font-black uppercase tracking-wide ${getOrderStatusBadgeClass(orderStatus.name)}`}>{orderStatus.name}</span>}
                </div>

                <p className="mt-2 truncate text-sm font-semibold text-[#0d1b2e] md:mt-3">{(order.customer as any)?.full_name || "Cliente não informado"}</p>
                <p className="truncate text-xs text-[#5a6a82]">{(order.general_service as any)?.name || (order.service as any)?.title || "Serviço não informado"}</p>
                {order.scheduled_at && <p className="mt-1 text-[11px] text-[#5a6a82]">Agendado: {formatDate(order.scheduled_at)}</p>}

                <div className="mt-2 flex items-center gap-2 text-[11px] text-[#5a6a82]" onClick={event => event.stopPropagation()} onPointerDown={event => event.stopPropagation()}>
                  <span className="shrink-0 font-semibold">Situação:</span>
                  {canDrag(order) && orderSituations.length > 0
                    ? <div className="min-w-0 flex-1"><AdminSelect value={order.situation_id || ""} onValueChange={value => { if (value) onSituationChange(order, value); }}
                        options={[...(!order.situation_id ? [{ value: "", label: "Selecionar situação" }] : []), ...orderSituations.map(situation => ({ value: situation.id, label: situation.name }))]}
                        className="min-h-9 px-1.5 py-1 text-[11px] md:min-h-8" ariaLabel={`Situação da OS ${order.os_number || ""}`} /></div>
                    : <span className="truncate">{(order.situation as any)?.name || "Sem situação"}</span>}
                </div>

                {!isCancelled(order) && (order.completed_at
                  ? <OrderLifecycleTag status="completed" className="mt-2" />
                  : order.is_solved ? <OrderLifecycleTag status="solved" className="mt-2" /> : null)}
                {order.cannot_be_solved && !isCancelled(order) && <span className="mt-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-1 text-[10px] font-bold uppercase text-amber-700">⚠ OS não solucionável</span>}

                {(canEdit && !order.is_solved && !isCancelled(order) || canCancel(order)) && <div className="mt-3 flex items-center justify-end gap-2 border-t border-border pt-3" onClick={event => event.stopPropagation()} onPointerDown={event => event.stopPropagation()}>
                  {canEdit && !order.return_root_id && !order.is_solved && !isCancelled(order) && <button type="button" draggable={false} onDragStart={event => event.preventDefault()} onClick={() => onEdit(order)} className="flex min-h-9 cursor-default items-center gap-1 rounded-lg border border-primary/30 px-3 py-1.5 text-xs font-bold text-primary"><Edit2 size={13} /> Editar</button>}
                  {canCancel(order) && <AdminButton variant="quaternary" size="sm" draggable={false} onDragStart={event => event.preventDefault()} onClick={() => setCancelTarget(order)} className="min-h-9 gap-1"><Ban size={13} /> Cancelar</AdminButton>}
                </div>}
              </div>;
            })}
          </div>
        </div>;
        })}</div>
      </div>
    </>
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
