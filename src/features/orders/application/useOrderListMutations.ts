import { useRef, useState, type Dispatch, type DragEvent, type SetStateAction } from "react";
import { useAuth } from "@/lib/auth";
import { insertServiceOrderStatusHistory, updateServiceOrderSituation, updateServiceOrderStatus } from "../infrastructure/orders.repository";

type ToastMessage = { msg: string; type: "success" | "error" };

export function useOrderListMutations({ orders, setOrders, statuses, situations, detail, setDetail, userId, hasPermission, showToast, formatError, syncRelatedCaches }: {
  orders: any[]; setOrders: Dispatch<SetStateAction<any[]>>; statuses: any[]; situations: any[]; detail: any; setDetail: Dispatch<SetStateAction<any>>;
  userId?: string; hasPermission: (permission: string) => boolean; showToast: (toast: ToastMessage) => void; formatError: (error: unknown) => string; syncRelatedCaches: () => Promise<void>;
}) {
  const { activeOrganizationId } = useAuth();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStatusId, setDragOverStatusId] = useState<string | null>(null);
  const dragOriginRef = useRef<any[] | null>(null);
  const suppressCardClickRef = useRef(false);

  const requireActiveOrganization = () => {
    if (activeOrganizationId) return activeOrganizationId;
    showToast({ msg: "Selecione uma empresa antes de alterar a OS.", type: "error" });
    return null;
  };

  const updateOrderStatus = async (order: any, statusId: string) => {
    if (!hasPermission("orders.status.change")) { showToast({ msg: "Você não possui permissão para alterar o status.", type: "error" }); return; }
    const organizationId = requireActiveOrganization();
    if (!organizationId || order.organization_id !== organizationId) return;
    const previousOrders = orders; const previousDetail = detail; const nextStatus = statuses.find(status => status.id === statusId);
    setOrders(current => current.map(item => item.id === order.id ? { ...item, status_id: statusId, order_status: nextStatus || item.order_status } : item));
    setDetail((current: any) => current?.id === order.id ? { ...current, status_id: statusId, order_status: nextStatus || current.order_status } : current);
    const { error } = await updateServiceOrderStatus(organizationId, order.id, statusId);
    if (error) { setOrders(previousOrders); setDetail(previousDetail); showToast({ msg: `Erro: ${error.message}`, type: "error" }); return; }
    await insertServiceOrderStatusHistory(order.id, statusId, userId || null);
    showToast({ msg: "Status atualizado!", type: "success" });
    await syncRelatedCaches();
  };

  const updateOrderSituation = async (order: any, situationId: string) => {
    if (!hasPermission("orders.situation.change")) { showToast({ msg: "Você não possui permissão para alterar a situação.", type: "error" }); return; }
    const organizationId = requireActiveOrganization();
    if (!organizationId || order.organization_id !== organizationId) return;
    const previousOrders = orders; const previousDetail = detail; const optimisticSituation = situations.find(item => item.id === situationId);
    setOrders(current => current.map(item => item.id === order.id ? { ...item, situation_id: situationId || null, situation: optimisticSituation || null } : item));
    setDetail((current: any) => current?.id === order.id ? { ...current, situation_id: situationId || null, situation: optimisticSituation || null } : current);
    const { data, error } = await updateServiceOrderSituation(organizationId, order.id, situationId || null);
    if (error) { setOrders(previousOrders); setDetail(previousDetail); showToast({ msg: `Erro ao alterar situação: ${formatError(error)}`, type: "error" }); return; }
    const nextSituationId = data?.situation_id || situationId; const situation = situations.find(item => item.id === nextSituationId);
    setOrders(current => current.map(item => item.id === order.id ? { ...item, situation_id: nextSituationId, situation: situation || null } : item));
    setDetail((current: any) => current?.id === order.id ? { ...current, situation_id: nextSituationId, situation: situation || null } : current);
    await syncRelatedCaches();
  };

  const handleKanbanDrop = async (statusId: string) => {
    if (!hasPermission("orders.status.change")) return;
    const organizationId = requireActiveOrganization();
    if (!organizationId) return;
    const order = orders.find(item => item.id === draggingId); const previousOrders = dragOriginRef.current;
    setDraggingId(null); setDragOverStatusId(null);
    if (!order || order.organization_id !== organizationId || order.status_id === statusId || !previousOrders) return;
    const nextStatus = statuses.find(status => status.id === statusId);
    setOrders(current => current.map(item => item.id === order.id ? { ...item, status_id: statusId, order_status: nextStatus || item.order_status } : item));
    try {
      const { error } = await updateServiceOrderStatus(organizationId, order.id, statusId); if (error) throw error;
      const { error: historyError } = await insertServiceOrderStatusHistory(order.id, statusId, userId || null);
      if (historyError) console.warn("[ADMIN] OS status history warning:", historyError.message);
      showToast({ msg: `OS ${order.os_number || order.id.slice(0, 8)} movida para ${nextStatus?.name || "o novo status"}.`, type: "success" });
      await syncRelatedCaches();
    } catch (error) { setOrders(previousOrders); showToast({ msg: `Não foi possível alterar o status: ${error instanceof Error ? error.message : String(error)}`, type: "error" }); }
    finally { dragOriginRef.current = null; }
  };

  const handleCardDragStart = (event: DragEvent<HTMLElement>, order: any) => { if (!hasPermission("orders.status.change")) return; dragOriginRef.current = orders; suppressCardClickRef.current = true; setDraggingId(order.id); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", order.id); };
  const handleCardDragEnd = () => { setDraggingId(null); setDragOverStatusId(null); window.setTimeout(() => { suppressCardClickRef.current = false; }, 0); };
  const shouldSuppressCardOpen = () => { if (!suppressCardClickRef.current) return false; suppressCardClickRef.current = false; return true; };
  const handleDragLeave = (statusId: string) => { setDragOverStatusId(current => current === statusId ? null : current); };

  return { draggingId, dragOverStatusId, setDragOverStatusId, updateOrderStatus, updateOrderSituation, handleKanbanDrop, handleCardDragStart, handleCardDragEnd, shouldSuppressCardOpen, handleDragLeave };
}
