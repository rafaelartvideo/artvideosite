import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { completeServiceOrder } from "../infrastructure/orders.repository";

type Toast = { msg: string; type: "success" | "error" };

export function useOrderCompletion({
  detail,
  usedItems,
  setDetail,
  setOrders,
  reloadOrders,
  hasPermission,
  showToast,
  formatError,
  setSaving,
}: {
  detail: any;
  usedItems: any[];
  setDetail: Dispatch<SetStateAction<any>>;
  setOrders: Dispatch<SetStateAction<any[]>>;
  reloadOrders: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
  showToast: (toast: Toast) => void;
  formatError: (error: unknown) => string;
  setSaving: Dispatch<SetStateAction<boolean>>;
}) {
  const [open, setOpen] = useState(false);
  const [discount, setDiscount] = useState("0");
  const servicePrice = Number(detail?.general_service?.price || 0);
  const partsTotal = useMemo(() => usedItems.reduce((total, item) =>
    total + Number(item.total_sale_price ?? Number(item.quantity || 0) * Number(item.unit_sale_price || item.inventory_item?.sale_price || 0)), 0), [usedItems]);
  const subtotal = servicePrice + partsTotal;
  const maxDiscount = Number(detail?.general_service?.max_discount_percentage || 0);
  const discountPercentage = Math.max(0, Number(discount) || 0);
  const discountAmount = subtotal * discountPercentage / 100;
  const finalTotal = Math.max(0, subtotal - discountAmount);

  const openCompletion = () => {
    if (!hasPermission("orders.complete")) {
      showToast({ msg: "Você não possui permissão para concluir a OS.", type: "error" });
      return;
    }
    if (!detail?.is_solved) {
      showToast({ msg: "Resolva a OS antes de concluir.", type: "error" });
      return;
    }
    if (detail?.completed_at) {
      showToast({ msg: "Esta OS já foi concluída.", type: "error" });
      return;
    }
    setDiscount("0");
    setOpen(true);
  };

  const submit = async () => {
    if (!detail?.id || discountPercentage > maxDiscount) return;
    setSaving(true);
    try {
      const { data, error } = await completeServiceOrder(detail.id, discountPercentage);
      if (error) throw error;
      const financial = (data || {}) as any;
      setDetail((current: any) => ({ ...current, ...financial }));
      setOrders(current => current.map(order => order.id === detail.id ? { ...order, ...financial } : order));
      setOpen(false);
      showToast({ msg: "OS concluída com sucesso.", type: "success" });
      await reloadOrders();
    } catch (error) {
      showToast({ msg: `Não foi possível concluir a OS: ${formatError(error)}`, type: "error" });
    } finally {
      setSaving(false);
    }
  };

  return {
    open, setOpen, discount, setDiscount, usedItems, servicePrice, partsTotal, subtotal,
    maxDiscount, discountPercentage, discountAmount, finalTotal,
    openCompletion, submit,
  };
}
