import {
  useEffect,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/infrastructure/query/query-keys";
import type { PartRequestForReview } from "../domain/part-request.types";
import {
  getFullServiceOrder,
  getServiceOrderResolutionState,
  insertServiceOrderMedia,
  listServiceOrderMedia,
  listServiceOrderTechnicalValues,
  listServiceOrderUsedItems,
  markServiceOrderSolvable,
  markServiceOrderUnsolvable,
} from "../infrastructure/orders.repository";
import {
  getServiceOrderLooseParts,
  resolveServiceOrderWithLooseParts,
  saveServiceOrderLooseParts,
} from "../infrastructure/order-resolution-extra.repository";
import {
  listAvailableResolutionPartRequests,
  listServiceOrderSolutionAttempts,
  undoServiceOrderSolution,
  type ServiceOrderSolutionAttempt,
} from "../infrastructure/order-solution-history.repository";
import { orderImageKindFromSortOrder, type OrderImage } from "../domain/order-image";
import { uploadServiceOrderMediaFile } from "@/shared/infrastructure/media.repository";

type ToastMessage = { msg: string; type: "success" | "error" };
type SolveDraft = {
  diagnosis: string;
  solution: string;
  looseParts: string;
  usedItems: any[];
  cannotSolve: boolean;
  cannotSolveReason: string;
};

const emptySolveDraft: SolveDraft = {
  diagnosis: "",
  solution: "",
  looseParts: "",
  usedItems: [],
  cannotSolve: false,
  cannotSolveReason: "",
};

export function useOrderResolution({
  organizationId,
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
  organizationId?: string | null;
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
  const queryClient = useQueryClient();
  const [inventoryItems, setInventoryItems] = useState<any[]>([]);
  const [solveOpen, setSolveOpen] = useState(false);
  const [solveDraft, setSolveDraft] = useState<SolveDraft>(emptySolveDraft);
  const [solutionAttempts, setSolutionAttempts] = useState<ServiceOrderSolutionAttempt[]>([]);
  const [solutionHistoryLoading, setSolutionHistoryLoading] = useState(false);
  const [solutionHistoryError, setSolutionHistoryError] = useState("");
  const [undoOpen, setUndoOpen] = useState(false);
  const [undoSubmitting, setUndoSubmitting] = useState(false);

  const targetOrganizationIdFor = (order?: any) => organizationId || order?.organization_id || detail?.organization_id || null;

  const loadSolutionAttempts = async (serviceOrderId?: string | null, organizationOverride?: string | null) => {
    const orderId = serviceOrderId || detail?.id;
    const targetOrganizationId = organizationOverride || targetOrganizationIdFor(detail);
    if (!orderId || !targetOrganizationId) {
      setSolutionAttempts([]);
      setSolutionHistoryError("");
      return [];
    }

    setSolutionHistoryLoading(true);
    try {
      const attempts = await listServiceOrderSolutionAttempts(targetOrganizationId, orderId);
      setSolutionAttempts(attempts);
      setSolutionHistoryError("");
      return attempts;
    } catch (error) {
      const message = formatError(error);
      setSolutionHistoryError(message);
      return [];
    } finally {
      setSolutionHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (!detail?.id) {
      setSolutionAttempts([]);
      setSolutionHistoryError("");
      setUndoOpen(false);
      return;
    }
    const targetOrganizationId = targetOrganizationIdFor(detail);
    if (!targetOrganizationId) return;
    void loadSolutionAttempts(detail.id, targetOrganizationId);
  }, [detail?.id, detail?.organization_id, organizationId]);

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

    const targetOrganizationId = targetOrganizationIdFor(order);
    if (!targetOrganizationId || order?.organization_id !== targetOrganizationId) {
      showToast({
        msg: "A OS não pertence à empresa deste atendimento.",
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

    let looseParts = "";
    try {
      looseParts = await getServiceOrderLooseParts(targetOrganizationId, order.id) || "";
    } catch (error) {
      showToast({
        msg: `Não foi possível carregar as peças avulsas da OS: ${formatError(error)}`,
        type: "error",
      });
      return;
    }

    const [
      { data: approvedRequests, error: approvedRequestsError },
      { data: mediaLinks },
    ] = await Promise.all([
      listAvailableResolutionPartRequests(order.id),
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
        const sourceTest = Boolean(item.source_test_item_id);
        const quantity = sourceTest
          ? Math.max(0, Number(item.approved_quantity || 0) - Number(item.resolution_reverted_quantity || 0))
          : Math.max(0, Number(item.technician_received_quantity || 0) - Number(item.returned_quantity || 0) - Number(item.damaged_quantity || 0));
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
            (sourceTest ? quantity : 0),
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
          kind: orderImageKindFromSortOrder(item.sort_order),
        })),
    );
    replaceSolutionImages(
      (mediaLinks || [])
        .filter((item: any) => Number(item.sort_order ?? 0) >= 1000)
        .map((item: any) => ({
          key: item.id,
          mediaId: item.media_id,
          name: item.media?.file_name || "Imagem da solução",
          kind: "solution" as const,
        })),
    );
    setSolveDraft({
      diagnosis: currentOrder?.diagnosis || order.diagnosis || "",
      solution: currentOrder?.solution || order.solution || "",
      looseParts,
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

    const targetOrganizationId = targetOrganizationIdFor(detail);
    if (!targetOrganizationId || detail?.organization_id !== targetOrganizationId) {
      showToast({
        msg: "A OS não pertence à empresa deste atendimento.",
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
        await saveServiceOrderLooseParts(targetOrganizationId, orderId, solveDraft.looseParts);
        const { error } = await markServiceOrderUnsolvable(orderId, reason);
        if (error) throw error;
        setDetail((current: any) => ({
          ...current,
          loose_parts: solveDraft.looseParts.trim() || null,
          cannot_be_solved: true,
          cannot_be_solved_reason: reason,
        }));
        setOrders(current => current.map(order =>
          order.id === orderId
            ? {
                ...order,
                loose_parts: solveDraft.looseParts.trim() || null,
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
      const { error: resolveError } = await resolveServiceOrderWithLooseParts({
        organizationId: targetOrganizationId,
        serviceOrderId: orderId,
        diagnosis,
        solution,
        looseParts: solveDraft.looseParts,
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
          const mediaId = await uploadServiceOrderMediaFile(
            orderId,
            "solution",
            image.file,
            targetOrganizationId,
          );
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

      const [freshDetail, technicalValuesResult] = await Promise.all([
        getFullServiceOrder(orderId),
        listServiceOrderTechnicalValues(orderId),
      ]);
      if (freshDetail.data) setDetail({ ...freshDetail.data, technical_values: technicalValuesResult.data || [] });
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
            kind: orderImageKindFromSortOrder(item.sort_order),
          })),
      );
      const currentSolutionImages = (mediaLinks || [])
        .filter((item: any) => Number(item.sort_order ?? 0) >= 1000)
        .map((item: any) => ({
          key: item.id,
          mediaId: item.media_id,
          name: item.media?.file_name || "Imagem da solução",
          kind: "solution" as const,
        }));
      replaceSolutionImages(currentSolutionImages);
      setDetailSolutionImages(currentSolutionImages);
      setSolveOpen(false);
      await loadSolutionAttempts(orderId, targetOrganizationId);
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

  const openUndoSolution = () => {
    if (!detail?.id || !detail?.is_solved) {
      showToast({ msg: "Esta OS não possui uma solução ativa para desfazer.", type: "error" });
      return;
    }
    if (!hasPermission("orders.solve")) {
      showToast({ msg: "Você não possui permissão para desfazer a solução desta OS.", type: "error" });
      return;
    }
    if (detail.completed_at) {
      showToast({ msg: "Uma OS fechada não pode ter a solução desfeita.", type: "error" });
      return;
    }
    setUndoOpen(true);
  };

  const undoOrderSolution = async (reason: string) => {
    const orderId = detail?.id;
    const targetOrganizationId = targetOrganizationIdFor(detail);
    if (!orderId || !targetOrganizationId || undoSubmitting) return;
    if (!reason.trim()) {
      showToast({ msg: "Informe o motivo para desfazer a solução.", type: "error" });
      return;
    }

    setUndoSubmitting(true);
    try {
      const result = await undoServiceOrderSolution({
        organizationId: targetOrganizationId,
        serviceOrderId: orderId,
        reason: reason.trim(),
      });

      const [freshDetail, technicalValuesResult, usedResult, mediaResult] = await Promise.all([
        getFullServiceOrder(orderId),
        listServiceOrderTechnicalValues(orderId),
        listServiceOrderUsedItems(orderId),
        listServiceOrderMedia(orderId),
      ]);

      if (freshDetail.data) setDetail({ ...freshDetail.data, technical_values: technicalValuesResult.data || [] });
      setDetailUsedItems(usedResult.data || []);
      const mediaLinks = mediaResult.data || [];
      replaceOrderImages(
        mediaLinks
          .filter((item: any) => Number(item.sort_order ?? 0) < 1000)
          .map((item: any) => ({
            key: item.id,
            mediaId: item.media_id,
            name: item.media?.file_name || "Imagem da OS",
            kind: orderImageKindFromSortOrder(item.sort_order),
          })),
      );
      replaceSolutionImages([]);
      setDetailSolutionImages([]);
      setOrders(current => current.map(order => order.id === orderId ? {
        ...order,
        is_solved: false,
        solved_at: null,
        diagnosis: null,
        solution: null,
        loose_parts: null,
      } : order));

      setUndoOpen(false);
      await Promise.all([
        loadSolutionAttempts(orderId, targetOrganizationId),
        reloadOrders(),
        queryClient.invalidateQueries({ queryKey: queryKeys.orders.partRequests(orderId) }),
      ]);
      showToast({
        msg: result.parts_return_pending
          ? "Solução desfeita. As peças utilizadas ficaram com devolução pendente e voltarão ao estoque após a confirmação do estoquista."
          : "Solução desfeita com sucesso.",
        type: "success",
      });
    } catch (error) {
      showToast({
        msg: `Não foi possível desfazer a solução da OS: ${formatError(error)}`,
        type: "error",
      });
    } finally {
      setUndoSubmitting(false);
    }
  };

  const activeSolutionAttempt = solutionAttempts.find(attempt => !attempt.reverted_at) || null;

  return {
    inventoryItems,
    solveOpen,
    setSolveOpen,
    solveDraft,
    setSolveDraft,
    openSolveOrder,
    saveOrderSolution,
    solutionAttempts,
    solutionCount: solutionAttempts.length,
    activeSolutionAttempt,
    solutionHistoryLoading,
    solutionHistoryError,
    loadSolutionAttempts,
    undoOpen,
    setUndoOpen,
    undoSubmitting,
    openUndoSolution,
    undoOrderSolution,
  };
}
