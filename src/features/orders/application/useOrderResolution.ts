import {
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import type { PartRequestForReview } from "../domain/part-request.types";
import {
  getFullServiceOrder,
  getServiceOrderResolutionState,
  insertServiceOrderMedia,
  listApprovedResolutionPartRequests,
  listServiceOrderMedia,
  listServiceOrderUsedItems,
  markServiceOrderSolvable,
  markServiceOrderUnsolvable,
  resolveServiceOrder,
} from "../infrastructure/orders.repository";
import {
  uploadOrderImage,
  type OrderImage,
} from "../domain/order-image";

type ToastMessage = { msg: string; type: "success" | "error" };
type SolveDraft = {
  diagnosis: string;
  solution: string;
  usedItems: any[];
  cannotSolve: boolean;
  cannotSolveReason: string;
};

const emptySolveDraft: SolveDraft = {
  diagnosis: "",
  solution: "",
  usedItems: [],
  cannotSolve: false,
  cannotSolveReason: "",
};

export function useOrderResolution({
  detail,
  setDetail,
  setOrders,
  detailPartRequests,
  getTestPendingQuantity,
  solutionImages,
  replaceOrderImages,
  replaceSolutionImages,
  setDetailUsedItems,
  setDetailSolutionImages,
  reloadOrders,
  hasPermission,
  showToast,
  formatError,
  setSaving,
}: {
  detail: any;
  setDetail: Dispatch<SetStateAction<any>>;
  setOrders: Dispatch<SetStateAction<any[]>>;
  detailPartRequests: PartRequestForReview[];
  getTestPendingQuantity: (
    request: PartRequestForReview,
    item: PartRequestForReview["items"][number],
  ) => number;
  solutionImages: OrderImage[];
  replaceOrderImages: (images: OrderImage[]) => void;
  replaceSolutionImages: (images: OrderImage[]) => void;
  setDetailUsedItems: Dispatch<SetStateAction<any[]>>;
  setDetailSolutionImages: Dispatch<SetStateAction<OrderImage[]>>;
  reloadOrders: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
  showToast: (toast: ToastMessage) => void;
  formatError: (error: unknown) => string;
  setSaving: Dispatch<SetStateAction<boolean>>;
}) {
  const [inventoryItems, setInventoryItems] = useState<any[]>([]);
  const [solveOpen, setSolveOpen] = useState(false);
  const [solveDraft, setSolveDraft] = useState<SolveDraft>(emptySolveDraft);

  const hasPendingTestParts = () => detailPartRequests.some(request =>
    (request.purpose || "RESOLUTION") === "TEST" &&
    request.items.some(item => getTestPendingQuantity(request, item) > 0),
  );

  const openSolveOrder = async (order: any) => {
    if (!hasPermission("orders.solve")) {
      showToast({
        msg: "Você não possui permissão para resolver a OS.",
        type: "error",
      });
      return;
    }

    const { data: currentOrder, error: currentOrderError } =
      await getServiceOrderResolutionState(order.id);
    if (currentOrderError) {
      showToast({
        msg: `Não foi possível verificar o estado da OS: ${formatError(currentOrderError)}`,
        type: "error",
      });
      return;
    }
    if (currentOrder?.is_solved || order.is_solved) {
      showToast({
        msg: "Esta OS já foi solucionada e não pode ser solucionada novamente.",
        type: "error",
      });
      return;
    }
    if (currentOrder?.cannot_be_solved || order.cannot_be_solved) {
      showToast({
        msg: "Esta OS está marcada como não solucionável e não pode ser resolvida novamente.",
        type: "error",
      });
      return;
    }
    if (hasPendingTestParts()) {
      showToast({
        msg: "Existem peças de teste aguardando devolução, dano ou solicitação para resolução.",
        type: "error",
      });
      return;
    }

    const [
      { data: approvedRequests, error: approvedRequestsError },
      { data: mediaLinks },
    ] = await Promise.all([
      listApprovedResolutionPartRequests(order.id),
      listServiceOrderMedia(order.id),
    ]);
    if (approvedRequestsError) {
      showToast({
        msg: `Não foi possível carregar as peças aprovadas: ${formatError(approvedRequestsError)}`,
        type: "error",
      });
      return;
    }

    const approvedByInventory = new Map<string, any>();
    (approvedRequests || [])
      .flatMap((request: any) => request.items || [])
      .forEach((item: any) => {
        const quantity = Number(item.approved_quantity);
        if (
          !item.inventory_item_id ||
          !Number.isFinite(quantity) ||
          quantity <= 0
        ) return;
        const current = approvedByInventory.get(item.inventory_item_id);
        approvedByInventory.set(item.inventory_item_id, {
          ...item,
          approved_quantity:
            Number(current?.approved_quantity || 0) + quantity,
          prewithdrawn_quantity:
            Number(current?.prewithdrawn_quantity || 0) +
            (item.source_test_item_id ? quantity : 0),
        });
      });

    const approvedItems = Array.from(approvedByInventory.values());
    setInventoryItems(
      approvedItems.map((item: any) => item.inventory_item).filter(Boolean),
    );
    replaceOrderImages(
      (mediaLinks || [])
        .filter((item: any) => Number(item.sort_order ?? 0) < 1000)
        .map((item: any) => ({
          key: item.id,
          mediaId: item.media_id,
          name: item.media?.file_name || "Imagem da OS",
        })),
    );
    replaceSolutionImages(
      (mediaLinks || [])
        .filter((item: any) => Number(item.sort_order ?? 0) >= 1000)
        .map((item: any) => ({
          key: item.id,
          mediaId: item.media_id,
          name: item.media?.file_name || "Imagem da solução",
        })),
    );
    setSolveDraft({
      diagnosis: currentOrder?.diagnosis || order.diagnosis || "",
      solution: currentOrder?.solution || order.solution || "",
      usedItems: approvedItems.map((item: any) => ({
        id: item.id,
        inventory_item_id: item.inventory_item_id,
        name: item.inventory_item?.name || "",
        unit: item.inventory_item?.unit || "un",
        quantity: Number(item.approved_quantity),
        approved_quantity: Number(item.approved_quantity),
        prewithdrawn_quantity: Number(item.prewithdrawn_quantity || 0),
      })),
      cannotSolve:
        currentOrder?.cannot_be_solved ?? order.cannot_be_solved ?? false,
      cannotSolveReason:
        currentOrder?.cannot_be_solved_reason ||
        order.cannot_be_solved_reason ||
        "",
    });
    setSolveOpen(true);
  };

  const saveOrderSolution = async (orderId: string) => {
    if (!hasPermission("orders.solve")) {
      showToast({
        msg: "Você não possui permissão para resolver ordens de serviço.",
        type: "error",
      });
      return;
    }

    if (detail?.cannot_be_solved && !solveDraft.cannotSolve) {
      setSaving(true);
      try {
        const { error } = await markServiceOrderSolvable(orderId);
        if (error) throw error;
        setDetail((current: any) => ({
          ...current,
          cannot_be_solved: false,
          cannot_be_solved_reason: null,
        }));
        setOrders(current => current.map(order =>
          order.id === orderId
            ? {
                ...order,
                cannot_be_solved: false,
                cannot_be_solved_reason: null,
              }
            : order,
        ));
        setSolveOpen(false);
        showToast({
          msg: "Estado não solucionável removido. A OS continua pendente de resolução.",
          type: "success",
        });
      } catch (error) {
        showToast({
          msg: `Não foi possível remover o estado não solucionável: ${formatError(error)}`,
          type: "error",
        });
      } finally {
        setSaving(false);
      }
      return;
    }

    if (solveDraft.cannotSolve) {
      const reason = solveDraft.cannotSolveReason.trim();
      if (!reason) {
        showToast({
          msg: "Informe a justificativa para esta OS não solucionável.",
          type: "error",
        });
        return;
      }

      setSaving(true);
      try {
        const { error } = await markServiceOrderUnsolvable(orderId, reason);
        if (error) throw error;
        setDetail((current: any) => ({
          ...current,
          cannot_be_solved: true,
          cannot_be_solved_reason: reason,
        }));
        setOrders(current => current.map(order =>
          order.id === orderId
            ? {
                ...order,
                cannot_be_solved: true,
                cannot_be_solved_reason: reason,
              }
            : order,
        ));
        setSolveOpen(false);
        showToast({
          msg: "OS marcada como não solucionável.",
          type: "success",
        });
      } catch (error) {
        showToast({
          msg: `Não foi possível salvar a justificativa: ${formatError(error)}`,
          type: "error",
        });
      } finally {
        setSaving(false);
      }
      return;
    }

    const diagnosis = solveDraft.diagnosis.trim();
    const solution = solveDraft.solution.trim();
    if (!diagnosis) {
      showToast({
        msg: "Informe o diagnóstico antes de concluir a solução.",
        type: "error",
      });
      return;
    }
    if (!solution) {
      showToast({
        msg: "Informe a solução antes de concluir a OS.",
        type: "error",
      });
      return;
    }
    if (hasPendingTestParts()) {
      showToast({
        msg: "Existem peças de teste aguardando devolução, dano ou solicitação para resolução.",
        type: "error",
      });
      return;
    }

    setSaving(true);
    try {
      const { error: resolveError } = await resolveServiceOrder({
        serviceOrderId: orderId,
        diagnosis,
        solution,
        usedItems: solveDraft.usedItems.map(item => ({
          inventory_item_id: item.inventory_item_id,
          quantity: Number(item.quantity),
        })),
      });
      if (resolveError) throw resolveError;

      let solutionImageError: unknown = null;
      try {
        for (const [sortOrder, image] of solutionImages.entries()) {
          if (!image.file) continue;
          const mediaId = await uploadOrderImage(image.file);
          const { error: insertError } = await insertServiceOrderMedia(
            orderId,
            mediaId,
            sortOrder + 1000,
          );
          if (insertError) throw insertError;
        }
      } catch (error) {
        solutionImageError = error;
      }

      const freshDetail = await getFullServiceOrder(orderId);
      if (freshDetail.data) setDetail(freshDetail.data);
      const { data: usedData } = await listServiceOrderUsedItems(orderId);
      const { data: mediaLinks } = await listServiceOrderMedia(orderId);
      setDetailUsedItems(usedData || []);
      replaceOrderImages(
        (mediaLinks || [])
          .filter((item: any) => Number(item.sort_order ?? 0) < 1000)
          .map((item: any) => ({
            key: item.id,
            mediaId: item.media_id,
            name: item.media?.file_name || "Imagem da OS",
          })),
      );
      setDetailSolutionImages(
        (mediaLinks || [])
          .filter((item: any) => Number(item.sort_order ?? 0) >= 1000)
          .map((item: any) => ({
            key: item.id,
            mediaId: item.media_id,
            name: item.media?.file_name || "Imagem da solução",
          })),
      );
      setSolveOpen(false);
      showToast({
        msg: solutionImageError
          ? `OS resolvida, mas não foi possível salvar todas as imagens da solução: ${formatError(solutionImageError)}`
          : "OS resolvida com sucesso.",
        type: solutionImageError ? "error" : "success",
      });
      await reloadOrders();
    } catch (error) {
      showToast({
        msg: `Não foi possível concluir a solução da OS: ${formatError(error)}. Nenhuma alteração de estoque foi aplicada.`,
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  return {
    inventoryItems,
    solveOpen,
    setSolveOpen,
    solveDraft,
    setSolveDraft,
    openSolveOrder,
    saveOrderSolution,
  };
}
