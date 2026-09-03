import { useEffect, useState, type MouseEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "../../../infrastructure/query/query-keys";
import type {
  CustodyAction,
  PartRequestForReview,
  PartRequestInventoryItem,
  PartRequestItemForReview,
  SelectedPartRequestItem,
  TestResultRow,
} from "../domain/part-request.types";
import {
  confirmServiceOrderPartDelivery,
  dispatchServiceOrderPartRequest,
  listActivePartInventory,
  listServiceOrderPartRequests,
  receiveServiceOrderPartReturn,
  recordServiceOrderTestResults,
  registerServiceOrderPartReturn,
  requestServiceOrderParts,
  reviewServiceOrderPartRequest,
} from "../infrastructure/orders-part-requests.repository";

type ToastMessage = { msg: string; type: "success" | "error" };

export function useOrderPartRequests({
  reloadOrders,
  hasPermission,
  showToast,
  formatError,
}: {
  reloadOrders: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
  showToast: (toast: ToastMessage) => void;
  formatError: (error: unknown) => string;
}) {
  const queryClient = useQueryClient();
  const [activeOrderId, setActiveOrderId] = useState("");
  const [selectedPartRequest, setSelectedPartRequest] = useState<PartRequestForReview | null>(null);
  const [partApprovalOpen, setPartApprovalOpen] = useState(false);
  const [partRejectionOpen, setPartRejectionOpen] = useState(false);
  const [approvalQuantities, setApprovalQuantities] = useState<Record<string, string>>({});
  const [partReviewNotes, setPartReviewNotes] = useState("");
  const [partReviewSubmitting, setPartReviewSubmitting] = useState(false);

  const [partRequestOpen, setPartRequestOpen] = useState(false);
  const [partRequestSearch, setPartRequestSearch] = useState("");
  const [selectedPartRequestItems, setSelectedPartRequestItems] = useState<SelectedPartRequestItem[]>([]);
  const [partRequestNotes, setPartRequestNotes] = useState("");
  const [partRequestSubmitting, setPartRequestSubmitting] = useState(false);
  const [partRequestPurpose, setPartRequestPurpose] = useState<"RESOLUTION" | "TEST">("RESOLUTION");

  const [selectedDeliveryRequest, setSelectedDeliveryRequest] = useState<PartRequestForReview | null>(null);
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [deliverySubmitting, setDeliverySubmitting] = useState(false);
  const [custodyAction, setCustodyAction] = useState<CustodyAction>("DISPATCH");
  const [custodyQuantities, setCustodyQuantities] = useState<Record<string, string>>({});

  const [selectedTestRequest, setSelectedTestRequest] = useState<PartRequestForReview | null>(null);
  const [testResultOpen, setTestResultOpen] = useState(false);
  const [testResultRows, setTestResultRows] = useState<TestResultRow[]>([]);
  const [testResultSubmitting, setTestResultSubmitting] = useState(false);

  const normalize = (data: any[] | null | undefined): PartRequestForReview[] =>
    (data || []).map((request: any) => ({
      ...request,
      requester: request.requested_by_profile || null,
      items: (request.items || []).map((item: any) => ({
        ...item,
        request_status: request.status,
      })),
    }));

  const partRequestsQuery = useQuery({
    queryKey: queryKeys.orders.partRequests(activeOrderId),
    enabled: Boolean(activeOrderId),
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await listServiceOrderPartRequests(activeOrderId);
      if (error) throw error;
      return normalize(data);
    },
  });

  const detailPartRequests = partRequestsQuery.data ?? [];

  const inventoryQuery = useQuery({
    queryKey: queryKeys.inventory.active(),
    enabled: partRequestOpen,
    staleTime: 30_000,
    queryFn: async () => {
      const result = await listActivePartInventory();
      if (result.error) throw result.error;
      return (result.data || []) as PartRequestInventoryItem[];
    },
  });

  const partRequestInventory = inventoryQuery.data ?? [];
  const partRequestInventoryLoading = inventoryQuery.isPending && partRequestOpen;
  const partRequestInventoryError = inventoryQuery.error ? formatError(inventoryQuery.error) : "";

  useEffect(() => {
    if (!inventoryQuery.error) return;
    console.error("[PART REQUEST] inventory load error", inventoryQuery.error);
    showToast({ msg: formatError(inventoryQuery.error), type: "error" });
  }, [inventoryQuery.error, formatError, showToast]);

  const loadPartRequests = async (serviceOrderId: string) => {
    setActiveOrderId(serviceOrderId);
    try {
      return await queryClient.fetchQuery({
        queryKey: queryKeys.orders.partRequests(serviceOrderId),
        staleTime: 0,
        queryFn: async () => {
          const result = await listServiceOrderPartRequests(serviceOrderId);
          if (result.error) throw result.error;
          return normalize(result.data);
        },
      });
    } catch (error) {
      console.error("[ADMIN] part requests load error:", error);
      return [];
    }
  };

  const resetPartRequestForm = () => {
    setPartRequestSearch("");
    setSelectedPartRequestItems([]);
    setPartRequestNotes("");
    setPartRequestPurpose("RESOLUTION");
  };

  const openPartRequestModal = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!hasPermission("orders.request_parts")) {
      showToast({ msg: "Você não possui permissão para pedir peças.", type: "error" });
      return;
    }
    resetPartRequestForm();
    setPartRequestOpen(true);
  };

  const closePartRequestModal = () => {
    if (partRequestSubmitting) return;
    setPartRequestOpen(false);
    resetPartRequestForm();
  };

  const selectPartRequestItem = (item: PartRequestInventoryItem) => {
    setSelectedPartRequestItems(current =>
      current.some(selected => selected.inventory_item_id === item.id)
        ? current
        : [
            ...current,
            {
              inventory_item_id: item.id,
              name: item.name,
              sku: item.sku,
              unit: item.unit || "un",
              available_quantity: Number(item.quantity),
              quantity: "1",
            },
          ],
    );
  };

  const updatePartRequestQuantity = (id: string, quantity: string) => {
    setSelectedPartRequestItems(current =>
      current.map(item => item.inventory_item_id === id ? { ...item, quantity } : item),
    );
  };

  const removePartRequestItem = (id: string) => {
    setSelectedPartRequestItems(current => current.filter(item => item.inventory_item_id !== id));
  };

  const submitPartRequest = async (serviceOrderId: string) => {
    if (!hasPermission("orders.request_parts")) {
      showToast({ msg: "Você não possui permissão para pedir peças.", type: "error" });
      return;
    }
    if (!serviceOrderId || partRequestSubmitting) return;
    if (!selectedPartRequestItems.length) {
      showToast({ msg: "Selecione pelo menos uma peça.", type: "error" });
      return;
    }

    for (const item of selectedPartRequestItems) {
      const quantity = Number(item.quantity);
      if (!item.quantity.trim() || !Number.isFinite(quantity) || quantity <= 0 || quantity > item.available_quantity) {
        showToast({
          msg: `Informe uma quantidade válida para ${item.name}, sem exceder o estoque disponível.`,
          type: "error",
        });
        return;
      }
    }

    setPartRequestSubmitting(true);
    try {
      const { error } = await requestServiceOrderParts({
        serviceOrderId,
        items: selectedPartRequestItems.map(item => ({
          inventory_item_id: item.inventory_item_id,
          quantity: Number(item.quantity),
        })),
        notes: partRequestNotes.trim() || null,
        purpose: partRequestPurpose,
      });
      if (error) throw error;

      setPartRequestOpen(false);
      resetPartRequestForm();
      showToast({ msg: "Solicitação de peças enviada para análise.", type: "success" });
      await loadPartRequests(serviceOrderId);
    } catch (error) {
      console.error("[PART REQUEST] submit error", error);
      showToast({ msg: formatError(error), type: "error" });
    } finally {
      setPartRequestSubmitting(false);
    }
  };

  const openPartApproval = (event: MouseEvent<HTMLButtonElement>, request: PartRequestForReview) => {
    event.preventDefault();
    event.stopPropagation();
    setSelectedPartRequest(request);
    setApprovalQuantities(Object.fromEntries(request.items.map(item => {
      const limit = item.source_test_item_id
        ? Number(item.quantity)
        : Math.min(Number(item.quantity), Number(item.inventory_item?.quantity ?? 0));
      return [item.id, String(limit)];
    })));
    setPartReviewNotes("");
    setPartRejectionOpen(false);
    setPartApprovalOpen(true);
  };

  const openPartRejection = (event: MouseEvent<HTMLButtonElement>, request: PartRequestForReview) => {
    event.preventDefault();
    event.stopPropagation();
    setSelectedPartRequest(request);
    setPartReviewNotes("");
    setPartApprovalOpen(false);
    setPartRejectionOpen(true);
  };

  const closePartReview = () => {
    if (partReviewSubmitting) return;
    setPartApprovalOpen(false);
    setPartRejectionOpen(false);
    setSelectedPartRequest(null);
    setApprovalQuantities({});
    setPartReviewNotes("");
  };

  const updateApprovalQuantity = (itemId: string, value: string) => {
    setApprovalQuantities(current => ({ ...current, [itemId]: value }));
  };

  const finishReview = async (message: string, serviceOrderId: string) => {
    setPartApprovalOpen(false);
    setPartRejectionOpen(false);
    setSelectedPartRequest(null);
    setApprovalQuantities({});
    setPartReviewNotes("");
    showToast({ msg: message, type: "success" });
    await loadPartRequests(serviceOrderId);
    await reloadOrders();
  };

  const approvePartRequest = async () => {
    if (!hasPermission("orders.manage_part_requests")) {
      showToast({ msg: "Você não possui permissão para gerenciar pedidos de peças.", type: "error" });
      return;
    }
    if (!selectedPartRequest || partReviewSubmitting) return;

    const quantities = selectedPartRequest.items.map(item => ({
      item,
      requested: Number(item.quantity),
      available: Number(item.inventory_item?.quantity ?? 0),
      approved: Number(approvalQuantities[item.id]),
    }));

    if (!quantities.length || quantities.some(({ requested, available, approved }) =>
      !Number.isFinite(requested) || requested <= 0 || !Number.isFinite(available) || !Number.isFinite(approved) || approved < 0
    )) {
      showToast({ msg: "Informe quantidades aprovadas válidas.", type: "error" });
      return;
    }
    if (quantities.some(({ requested, approved }) => approved > requested)) {
      showToast({ msg: "A quantidade aprovada não pode ser maior que a quantidade solicitada.", type: "error" });
      return;
    }
    if (quantities.some(({ item, available, approved }) => !item.source_test_item_id && approved > available)) {
      showToast({ msg: "A quantidade aprovada não pode ser maior que o estoque disponível.", type: "error" });
      return;
    }
    if (!quantities.some(({ approved }) => approved > 0)) {
      showToast({ msg: "Aprove uma quantidade maior que zero em pelo menos uma peça.", type: "error" });
      return;
    }

    setPartReviewSubmitting(true);
    try {
      const { error } = await reviewServiceOrderPartRequest({
        requestId: selectedPartRequest.id,
        decision: "APPROVED",
        items: selectedPartRequest.items.map(item => ({
          request_item_id: item.id,
          approved_quantity: Number(approvalQuantities[item.id] || 0),
        })),
        reviewNotes: partReviewNotes.trim() || null,
      });
      if (error) throw error;
      await finishReview("Pedido de peças aprovado.", selectedPartRequest.service_order_id);
    } catch (error) {
      console.error("[PART REQUEST] approval error", error);
      showToast({ msg: formatError(error), type: "error" });
    } finally {
      setPartReviewSubmitting(false);
    }
  };

  const rejectPartRequest = async () => {
    if (!hasPermission("orders.manage_part_requests")) {
      showToast({ msg: "Você não possui permissão para gerenciar pedidos de peças.", type: "error" });
      return;
    }
    if (!selectedPartRequest || partReviewSubmitting) return;
    if (!partReviewNotes.trim()) {
      showToast({ msg: "Informe o motivo da rejeição.", type: "error" });
      return;
    }

    setPartReviewSubmitting(true);
    try {
      const { error } = await reviewServiceOrderPartRequest({
        requestId: selectedPartRequest.id,
        decision: "REJECTED",
        items: [],
        reviewNotes: partReviewNotes.trim(),
      });
      if (error) throw error;
      await finishReview("Pedido de peças rejeitado.", selectedPartRequest.service_order_id);
    } catch (error) {
      console.error("[PART REQUEST] rejection error", error);
      showToast({ msg: formatError(error), type: "error" });
    } finally {
      setPartReviewSubmitting(false);
    }
  };

  const getTestCommittedQuantity = (item: PartRequestItemForReview) =>
    detailPartRequests
      .filter(candidate => (candidate.purpose || "RESOLUTION") === "RESOLUTION")
      .flatMap(candidate => candidate.items || [])
      .filter(candidate => candidate.source_test_item_id === item.id)
      .reduce((sum, candidate) => {
        const status = String(candidate.request_status || "").toUpperCase();
        const amount = status === "APPROVED"
          ? Number(candidate.approved_quantity ?? 0)
          : status === "PENDING" ? Number(candidate.quantity ?? 0) : 0;
        return Number.isFinite(amount) ? sum + amount : sum;
      }, 0);

  const getReturnableQuantity = (item: PartRequestItemForReview) =>
    Math.max(
      0,
      Number(item.technician_received_quantity ?? 0) -
        Number(item.returned_quantity ?? 0) -
        Number(item.return_pending_quantity ?? 0) -
        Number(item.damaged_quantity ?? 0) -
        getTestCommittedQuantity(item),
    );

  const getTestPendingQuantity = (_request: PartRequestForReview, item: PartRequestItemForReview) =>
    Math.max(
      0,
      Number(item.technician_received_quantity ?? item.delivered_quantity ?? 0) -
        Number(item.returned_quantity ?? 0) -
        Number(item.return_pending_quantity ?? 0) -
        Number(item.damaged_quantity ?? 0) -
        getTestCommittedQuantity(item),
    );

  const openCustodyAction = (request: PartRequestForReview, action: CustodyAction) => {
    const permission = action === "DISPATCH"
      ? "orders.dispatch_parts"
      : action === "CONFIRM_DELIVERY"
        ? "orders.confirm_part_delivery"
        : action === "REGISTER_RETURN"
          ? "orders.register_part_return"
          : "orders.receive_returned_parts";

    if (!hasPermission(permission)) {
      showToast({ msg: "Você não possui permissão para executar esta etapa do fluxo de peças.", type: "error" });
      return;
    }

    setSelectedDeliveryRequest(request);
    setCustodyAction(action);
    setCustodyQuantities(Object.fromEntries(
      request.items.map(item => [item.id, String(getReturnableQuantity(item))]),
    ));
    setDeliveryOpen(true);
  };

  const openDeliveryRequest = (request: PartRequestForReview, action: CustodyAction = "DISPATCH") =>
    openCustodyAction(request, action);

  const closeDeliveryRequest = () => {
    if (deliverySubmitting) return;
    setDeliveryOpen(false);
    setSelectedDeliveryRequest(null);
    setCustodyQuantities({});
  };

  const submitCustodyAction = async () => {
    if (!selectedDeliveryRequest || deliverySubmitting) return;
    const serviceOrderId = selectedDeliveryRequest.service_order_id;
    setDeliverySubmitting(true);

    try {
      let result;
      if (custodyAction === "DISPATCH") {
        result = await dispatchServiceOrderPartRequest(selectedDeliveryRequest.id);
      } else if (custodyAction === "CONFIRM_DELIVERY") {
        result = await confirmServiceOrderPartDelivery(selectedDeliveryRequest.id);
      } else if (custodyAction === "RECEIVE_RETURN") {
        result = await receiveServiceOrderPartReturn(selectedDeliveryRequest.id);
      } else {
        const items = selectedDeliveryRequest.items
          .map(item => ({
            request_item_id: item.id,
            quantity: Number(custodyQuantities[item.id] || 0),
          }))
          .filter(item => Number.isFinite(item.quantity) && item.quantity > 0);

        if (!items.length) throw new Error("Informe pelo menos uma quantidade para devolução.");

        for (const item of items) {
          const source = selectedDeliveryRequest.items.find(candidate => candidate.id === item.request_item_id);
          if (!source || item.quantity > getReturnableQuantity(source)) {
            throw new Error("A quantidade devolvida excede a quantidade disponível com o técnico.");
          }
        }

        result = await registerServiceOrderPartReturn({
          requestId: selectedDeliveryRequest.id,
          items,
          notes: null,
        });
      }

      if (result.error) throw result.error;

      const message = custodyAction === "DISPATCH"
        ? "Saída das peças confirmada."
        : custodyAction === "CONFIRM_DELIVERY"
          ? "Entrega ao técnico confirmada."
          : custodyAction === "REGISTER_RETURN"
            ? "Devolução registrada e aguardando recebimento no estoque."
            : "Retorno ao estoque confirmado.";

      setDeliveryOpen(false);
      setSelectedDeliveryRequest(null);
      setCustodyQuantities({});
      showToast({ msg: message, type: "success" });
      await loadPartRequests(serviceOrderId);
      await reloadOrders();
    } catch (error) {
      console.error("[PART CUSTODY] action error", error);
      showToast({ msg: formatError(error), type: "error" });
    } finally {
      setDeliverySubmitting(false);
    }
  };

  const openTestResult = (request: PartRequestForReview) => {
    setSelectedTestRequest(request);
    setTestResultRows([]);
    setTestResultOpen(true);
  };

  const closeTestResult = () => {
    if (testResultSubmitting) return;
    setTestResultOpen(false);
    setSelectedTestRequest(null);
    setTestResultRows([]);
  };

  const submitTestResults = async () => {
    if (!selectedTestRequest || testResultSubmitting) return;
    if (!testResultRows.length) {
      showToast({ msg: "Informe pelo menos um resultado.", type: "error" });
      return;
    }

    const totals = new Map<string, number>();
    for (const row of testResultRows) {
      const quantity = Number(row.quantity);
      const item = selectedTestRequest.items.find(current => current.id === row.requestItemId);
      if (!item || !Number.isFinite(quantity) || quantity <= 0 || row.action === "DAMAGED" && !row.notes.trim()) {
        showToast({
          msg: row.action === "DAMAGED" ? "Informe a justificativa do dano." : "Informe quantidades válidas para o resultado.",
          type: "error",
        });
        return;
      }
      const total = (totals.get(row.requestItemId) || 0) + quantity;
      if (total > getTestPendingQuantity(selectedTestRequest, item)) {
        showToast({ msg: "A soma dos resultados não pode ultrapassar a quantidade aguardando resultado.", type: "error" });
        return;
      }
      totals.set(row.requestItemId, total);
    }

    const serviceOrderId = selectedTestRequest.service_order_id;
    setTestResultSubmitting(true);
    try {
      const { data, error } = await recordServiceOrderTestResults({
        requestId: selectedTestRequest.id,
        actions: testResultRows.map(row => ({
          request_item_id: row.requestItemId,
          action: row.action,
          quantity: Number(row.quantity),
          notes: row.notes.trim() || null,
        })),
      });
      if (error) throw error;

      setTestResultOpen(false);
      setSelectedTestRequest(null);
      setTestResultRows([]);
      showToast({
        msg: data?.resolution_request_id
          ? "Resultado do teste registrado. Um novo pedido para resolução foi criado e aguarda aprovação."
          : "Resultado do teste registrado.",
        type: "success",
      });
      await loadPartRequests(serviceOrderId);
      await reloadOrders();
    } catch (error) {
      console.error("[PART REQUEST] test results error", error);
      showToast({ msg: formatError(error), type: "error" });
    } finally {
      setTestResultSubmitting(false);
    }
  };

  return {
    detailPartRequests,
    selectedPartRequest,
    partApprovalOpen,
    partRejectionOpen,
    approvalQuantities,
    partReviewNotes,
    setPartReviewNotes,
    partReviewSubmitting,
    partRequestOpen,
    partRequestInventory,
    partRequestInventoryLoading,
    partRequestSearch,
    setPartRequestSearch,
    selectedPartRequestItems,
    partRequestNotes,
    setPartRequestNotes,
    partRequestSubmitting,
    partRequestInventoryError,
    partRequestPurpose,
    setPartRequestPurpose,
    selectedDeliveryRequest,
    deliveryOpen,
    deliverySubmitting,
    custodyAction,
    custodyQuantities,
    setCustodyQuantities,
    selectedTestRequest,
    testResultOpen,
    testResultRows,
    setTestResultRows,
    testResultSubmitting,
    loadPartRequests,
    openPartRequestModal,
    closePartRequestModal,
    selectPartRequestItem,
    updatePartRequestQuantity,
    removePartRequestItem,
    submitPartRequest,
    openPartApproval,
    openPartRejection,
    closePartReview,
    updateApprovalQuantity,
    approvePartRequest,
    rejectPartRequest,
    openCustodyAction,
    openDeliveryRequest,
    closeDeliveryRequest,
    submitCustodyAction,
    openTestResult,
    closeTestResult,
    submitTestResults,
    getTestCommittedQuantity,
    getTestPendingQuantity,
    getReturnableQuantity,
  };
}
