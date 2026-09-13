import { useRef, useState, type Dispatch, type DragEvent, type SetStateAction } from "react";
import { useAuth } from "@/lib/auth";
import { insertServiceOrderStatusHistory, updateServiceOrderSituation, updateServiceOrderStatus } from "../infrastructure/orders.repository";
import { cancelServiceOrder } from "../infrastructure/order-cancellation.repository";

type ToastMessage = { msg: string; type: "success" | "error" };

export function useOrderListMutations({ orders, setOrders, statuses, situations, detail, setDetail, userId, hasPermission, showToast, formatError, syncRelatedCaches, organizationIdOverride }: {
  orders: any[]; setOrders: Dispatch<SetStateAction<any[]>>; statuses: any[]; situations: any[]; detail: any; setDetail: Dispatch<SetStateAction<any>>;
  userId?: string; hasPermission: (permission: string) => boolean; showToast: (toast: ToastMessage) => void; formatError: (error: unknown) => string; syncRelatedCaches: () => Promise<void>;
  organizationIdOverride?: string | null;
}) {
  const { activeOrganizationId } = useAuth();
  const targetOrganizationId = organizationIdOverride || activeOrganizationId;
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverSituationId, setDragOverSituationId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const suppressCardClickRef = useRef(false);

  const requireTargetOrganization = () => {
    if (targetOrganizationId) return targetOrganizationId;
    showToast({ msg: "Selecione uma empresa antes de alterar a OS.", type: "error" });
    return null;
  };

  // Mantido apenas por compatibilidade interna. O status da OS é derivado
  // automaticamente pelo ciclo Aberta / Fechada / Cancelada.
  const updateOrderStatus = async (order: any, statusId: string) => {
    if (!hasPermission("orders.status.change")) { showToast({ msg: "O status da OS é automático.", type: "error" }); return; }
    const organizationId = requireTargetOrganization();
    if (!organizationId || order.organization_id !== organizationId) return;
    const previousOrders = orders; const previousDetail = detail; const nextStatus = statuses.find(status => status.id === statusId);
    setOrders(current => current.map(item => item.id === order.id ? { ...item, status_id: statusId, order_status: nextStatus || item.order_status } : item));
    setDetail((current: any) => current?.id === order.id ? { ...current, status_id: statusId, order_status: nextStatus || current.order_status } : current);
    const { error } = await updateServiceOrderStatus(organizationId, order.id, statusId);
    if (error) { setOrders(previousOrders); setDetail(previousDetail); showToast({ msg: `Erro: ${error.message}`, type: "error" }); return; }
    await insertServiceOrderStatusHistory(order.id, statusId, userId || null);
    await syncRelatedCaches();
  };

  const cancelOrder = async (order: any, reason: string) => {
    if (!hasPermission("orders.cancel")) {
      showToast({ msg: "Você não possui permissão para cancelar esta OS.", type: "error" });
      return false;
    }
    const organizationId = requireTargetOrganization();
    if (!organizationId || order.organization_id !== organizationId) return false;
    if (order.completed_at) {
      showToast({ msg: "Uma OS concluída não pode ser cancelada.", type: "error" });
      return false;
    }
    if (order.cancelled_at || String(order.order_status?.name || "").toLowerCase() === "cancelada") {
      showToast({ msg: "Esta OS já está cancelada.", type: "error" });
      return false;
    }
    if (reason.trim().length < 3) {
      showToast({ msg: "Informe a justificativa do cancelamento.", type: "error" });
      return false;
    }

    const previousOrders = orders;
    const previousDetail = detail;
    const cancelledStatus = statuses.find(status => String(status.name || "").toLowerCase() === "cancelada");
    const cancelledAt = new Date().toISOString();
    const optimistic = (item: any) => ({
      ...item,
      status_id: cancelledStatus?.id || item.status_id,
      order_status: cancelledStatus || item.order_status,
      cancelled_at: cancelledAt,
      cancelled_by: userId || null,
      cancellation_reason: reason.trim(),
    });

    setCancellingId(order.id);
    setOrders(current => current.map(item => item.id === order.id ? optimistic(item) : item));
    setDetail((current: any) => current?.id === order.id ? optimistic(current) : current);
    try {
      const { error } = await cancelServiceOrder(order.id, reason);
      if (error) throw error;
      showToast({ msg: `OS ${order.os_number || ""} cancelada.`, type: "success" });
      await syncRelatedCaches();
      return true;
    } catch (error) {
      setOrders(previousOrders);
      setDetail(previousDetail);
      showToast({ msg: `Não foi possível cancelar a OS: ${formatError(error)}`, type: "error" });
      return false;
    } finally {
      setCancellingId(null);
    }
  };

  const updateOrderSituation = async (order: any, situationId: string) => {
    if (!hasPermission("orders.situation.change")) { showToast({ msg: "Você não possui permissão para alterar a situação.", type: "error" }); return false; }
    const organizationId = requireTargetOrganization();
    if (!organizationId || order.organization_id !== organizationId) return false;
    const previousOrders = orders; const previousDetail = detail; const optimisticSituation = situations.find(item => item.id === situationId);
    setOrders(current => current.map(item => item.id === order.id ? { ...item, situation_id: situationId || null, situation: optimisticSituation || null } : item));
    setDetail((current: any) => current?.id === order.id ? { ...current, situation_id: situationId || null, situation: optimisticSituation || null } : current);
    const { data, error } = await updateServiceOrderSituation(organizationId, order.id, situationId || null);
    if (error) { setOrders(previousOrders); setDetail(previousDetail); showToast({ msg: `Erro ao alterar situação: ${formatError(error)}`, type: "error" }); return false; }
    const nextSituationId = data?.situation_id || situationId; const situation = situations.find(item => item.id === nextSituationId);
    setOrders(current => current.map(item => item.id === order.id ? { ...item, situation_id: nextSituationId || null, situation: situation || null } : item));
    setDetail((current: any) => current?.id === order.id ? { ...current, situation_id: nextSituationId || null, situation: situation || null } : current);
    await syncRelatedCaches();
    return true;
  };

  const handleKanbanDrop = async (situationId: string) => {
    const orderId = draggingId;
    setDraggingId(null);
    setDragOverSituationId(null);
    if (!orderId) return;

    const order = orders.find(item => item.id === orderId);
    if (!order) return;
    if (order.completed_at || order.cancelled_at || String(order.order_status?.name || "").toLowerCase() === "cancelada") return;
    if ((order.situation_id || "") === situationId) return;

    suppressCardClickRef.current = true;
    const changed = await updateOrderSituation(order, situationId);
    if (changed) {
      const destination = situations.find(item => item.id === situationId);
      showToast({ msg: `OS ${order.os_number || ""} movida para ${destination?.name || "Sem situação"}.`, type: "success" });
    }
  };

  const handleCardDragStart = (event: DragEvent<HTMLElement>, order: any) => {
    if (!hasPermission("orders.situation.change") || order.completed_at || order.cancelled_at || String(order.order_status?.name || "").toLowerCase() === "cancelada") {
      event.preventDefault();
      return;
    }
    suppressCardClickRef.current = true;
    setDraggingId(order.id);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(order.id));
  };
  const handleCardDragEnd = () => { setDraggingId(null); setDragOverSituationId(null); };
  const shouldSuppressCardOpen = () => { if (!suppressCardClickRef.current) return false; suppressCardClickRef.current = false; return true; };
  const handleDragLeave = (situationId: string) => { setDragOverSituationId(current => current === situationId ? null : current); };

  return { organizationId: targetOrganizationId, draggingId, dragOverSituationId, cancellingId, setDragOverSituationId, updateOrderStatus, cancelOrder, updateOrderSituation, handleKanbanDrop, handleCardDragStart, handleCardDragEnd, shouldSuppressCardOpen, handleDragLeave };
}
