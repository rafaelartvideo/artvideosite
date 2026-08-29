import { useState, type MouseEvent } from "react";
import type {
  PartRequestForReview,
  PartRequestInventoryItem,
  PartRequestItemForReview,
  SelectedPartRequestItem,
  TestResultRow,
} from "../domain/part-request.types";
import {
  deliverServiceOrderTestRequest,
  listActivePartInventory,
  listServiceOrderPartRequests,
  recordServiceOrderTestResults,
  requestServiceOrderParts,
  reviewServiceOrderPartRequest,
} from "../infrastructure/orders-part-requests.repository";

type ToastMessage = { msg: string; type: "success" | "error" };

export function useOrderPartRequests({
  orderId,
  reloadOrders,
  showToast,
  formatError,
}: {
  orderId?: string;
  reloadOrders: () => Promise<void>;
  showToast: (toast: ToastMessage) => void;
  formatError: (error: unknown) => string;
}) {
  const [detailPartRequests, setDetailPartRequests] = useState<PartRequestForReview[]>([]);
  const [selectedPartRequest, setSelectedPartRequest] = useState<PartRequestForReview | null>(null);
  const [partApprovalOpen, setPartApprovalOpen] = useState(false);
  const [partRejectionOpen, setPartRejectionOpen] = useState(false);
  const [approvalQuantities, setApprovalQuantities] = useState<Record<string, string>>({});
  const [partReviewNotes, setPartReviewNotes] = useState("");
  const [partReviewSubmitting, setPartReviewSubmitting] = useState(false);
  const [partRequestOpen, setPartRequestOpen] = useState(false);
  const [partRequestInventory, setPartRequestInventory] = useState<PartRequestInventoryItem[]>([]);
  const [partRequestInventoryLoading, setPartRequestInventoryLoading] = useState(false);
  const [partRequestSearch, setPartRequestSearch] = useState("");
  const [selectedPartRequestItems, setSelectedPartRequestItems] = useState<SelectedPartRequestItem[]>([]);
  const [partRequestNotes, setPartRequestNotes] = useState("");
  const [partRequestSubmitting, setPartRequestSubmitting] = useState(false);
  const [partRequestInventoryError, setPartRequestInventoryError] = useState("");
  const [partRequestPurpose, setPartRequestPurpose] = useState<"RESOLUTION" | "TEST">("RESOLUTION");
  const [selectedDeliveryRequest, setSelectedDeliveryRequest] = useState<PartRequestForReview | null>(null);
  const [deliveryOpen, setDeliveryOpen] = useState(false);
  const [deliverySubmitting, setDeliverySubmitting] = useState(false);
  const [selectedTestRequest, setSelectedTestRequest] = useState<PartRequestForReview | null>(null);
  const [testResultOpen, setTestResultOpen] = useState(false);
  const [testResultRows, setTestResultRows] = useState<TestResultRow[]>([]);
  const [testResultSubmitting, setTestResultSubmitting] = useState(false);

  const loadPartRequestInventory = async () => {
    setPartRequestInventoryLoading(true);
    try {
      const { data, error } = await listActivePartInventory();
      if (error) throw error;
      setPartRequestInventory((data || []) as PartRequestInventoryItem[]);
      setPartRequestInventoryError("");
    } catch (error) {
      console.error("[PART REQUEST] inventory load error", error);
      const message = formatError(error);
      setPartRequestInventory([]);
      setPartRequestInventoryError(message);
      showToast({ msg: message, type: "error" });
    } finally {
      setPartRequestInventoryLoading(false);
    }
  };

  const loadPartRequests = async (serviceOrderId: string) => {
    const { data, error } = await listServiceOrderPartRequests(serviceOrderId);
    if (error) {
      console.error("[ADMIN] part requests load error:", error);
      setDetailPartRequests([]);
      return;
    }
    setDetailPartRequests((data || []).map((request: any) => ({
      ...request,
      requester: request.requested_by_profile || null,
      items: (request.items || []).map((item: any) => ({
        ...item,
        request_status: request.status,
      })),
    })));
  };

  const openPartRequestModal = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setPartRequestSearch("");
    setPartRequestPurpose("RESOLUTION");
    setSelectedPartRequestItems([]);
    setPartRequestNotes("");
    setPartRequestInventoryError("");
    setPartRequestOpen(true);
    void loadPartRequestInventory();
  };

  const closePartRequestModal = () => {
    if (partRequestSubmitting) return;
    setPartRequestOpen(false);
    setPartRequestSearch("");
    setSelectedPartRequestItems([]);
    setPartRequestNotes("");
    setPartRequestPurpose("RESOLUTION");
  };

  const selectPartRequestItem = (item: PartRequestInventoryItem) => {
    setSelectedPartRequestItems(current =>
      current.some(selected => selected.inventory_item_id === item.id)
        ? current
        : [...current, {
            inventory_item_id: item.id,
            name: item.name,
            sku: item.sku,
            unit: item.unit || "un",
            available_quantity: Number(item.quantity),
            quantity: "1",
          }],
    );
  };

  const updatePartRequestQuantity = (id: string, quantity: string) => {
    setSelectedPartRequestItems(current =>
      current.map(item => item.inventory_item_id === id ? { ...item, quantity } : item),
    );
  };

  const removePartRequestItem = (id: string) => {
    setSelectedPartRequestItems(current =>
      current.filter(item => item.inventory_item_id !== id),
    );
  };

  const submitPartRequest = async () => {
    if (!orderId || partRequestSubmitting) return;
    if (selectedPartRequestItems.length === 0) {
      showToast({ msg: "Selecione pelo menos uma peça.", type: "error" });
      return;
    }
    for (const item of selectedPartRequestItems) {
      const quantity = Number(item.quantity);
      if (!item.quantity.trim() || !Number.isFinite(quantity) || quantity <= 0 || quantity > item.available_quantity) {
        showToast({ msg: `Informe uma quantidade válida para ${item.name}, sem exceder o estoque disponível.`, type: "error" });
        return;
      }
    }

    setPartRequestSubmitting(true);
    try {
      const { error } = await requestServiceOrderParts({
        serviceOrderId: orderId,
        items: selectedPartRequestItems.map(item => ({
          inventory_item_id: item.inventory_item_id,
          quantity: Number(item.quantity),
        })),
        notes: partRequestNotes.trim() || null,
        purpose: partRequestPurpose,
      });
      if (error) throw error;
      setPartRequestOpen(false);
      setPartRequestSearch("");
      setSelectedPartRequestItems([]);
      setPartRequestNotes("");
      setPartRequestPurpose("RESOLUTION");
      showToast({ msg: "Solicitação de peças enviada para análise.", type: "success" });
      await loadPartRequests(orderId);
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

  const finishReview = async (message: string) => {
    setPartApprovalOpen(false);
    setPartRejectionOpen(false);
    setSelectedPartRequest(null);
    setApprovalQuantities({});
    setPartReviewNotes("");
    showToast({ msg: message, type: "success" });
    if (orderId) await loadPartRequests(orderId);
    await reloadOrders();
  };

  const approvePartRequest = async () => {
    if (!selectedPartRequest || partReviewSubmitting) return;
    const quantities = selectedPartRequest.items.map(item => ({
      item,
      requestedQuantity: Number(item.quantity),
      availableQuantity: Number(item.inventory_item?.quantity ?? 0),
      approved: Number(approvalQuantities[item.id]),
    }));
    if (!quantities.length || quantities.some(({ requestedQuantity, availableQuantity, approved }) =>
      !Number.isFinite(requestedQuantity) || requestedQuantity <= 0 ||
      !Number.isFinite(availableQuantity) || !Number.isFinite(approved) || approved < 0
    )) {
      showToast({ msg: "Informe quantidades aprovadas válidas.", type: "error" });
      return;
    }
    if (quantities.some(({ requestedQuantity, approved }) => approved > requestedQuantity)) {
      showToast({ msg: "A quantidade aprovada não pode ser maior que a quantidade solicitada.", type: "error" });
      return;
    }
    if (quantities.some(({ item, availableQuantity, approved }) =>
      !item.source_test_item_id && approved > availableQuantity
    )) {
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
      await finishReview("Pedido de peças aprovado.");
    } catch (error) {
      console.error("[PART REQUEST] approval error", error);
      showToast({ msg: formatError(error), type: "error" });
    } finally {
      setPartReviewSubmitting(false);
    }
  };

  const rejectPartRequest = async () => {
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
      await finishReview("Pedido de peças rejeitado.");
    } catch (error) {
      console.error("[PART REQUEST] rejection error", error);
      showToast({ msg: formatError(error), type: "error" });
    } finally {
      setPartReviewSubmitting(false);
    }
  };

  const openDeliveryRequest = (request: PartRequestForReview) => {
    setSelectedDeliveryRequest(request);
    setDeliveryOpen(true);
  };

  const closeDeliveryRequest = () => {
    if (deliverySubmitting) return;
    setDeliveryOpen(false);
    setSelectedDeliveryRequest(null);
  };

  const deliverTestRequest = async () => {
    if (!selectedDeliveryRequest || deliverySubmitting || !orderId) return;
    setDeliverySubmitting(true);
    try {
      const { error } = await deliverServiceOrderTestRequest(selectedDeliveryRequest.id);
      if (error) throw error;
      setDeliveryOpen(false);
      setSelectedDeliveryRequest(null);
      showToast({ msg: "Peças entregues para teste.", type: "success" });
      await loadPartRequests(orderId);
      await reloadOrders();
    } catch (error) {
      console.error("[PART REQUEST] delivery error", error);
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

  const getTestCommittedQuantity = (item: PartRequestItemForReview) => detailPartRequests
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

  const getTestPendingQuantity = (_request: PartRequestForReview, item: PartRequestItemForReview) => {
    const delivered = Number(item.delivered_quantity ?? 0);
    const returned = Number(item.returned_quantity ?? 0);
    const damaged = Number(item.damaged_quantity ?? 0);
    const committedForResolution = getTestCommittedQuantity(item);
    return Math.max(0, delivered - returned - damaged - committedForResolution);
  };

  const submitTestResults = async () => {
    if (!selectedTestRequest || testResultSubmitting || !orderId) return;
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
          msg: row.action === "DAMAGED"
            ? "Informe a justificativa do dano."
            : "Informe quantidades válidas para o resultado.",
          type: "error",
        });
        return;
      }
      const pending = getTestPendingQuantity(selectedTestRequest, item);
      const total = (totals.get(row.requestItemId) || 0) + quantity;
      if (total > pending) {
        showToast({ msg: "A soma dos resultados não pode ultrapassar a quantidade aguardando resultado.", type: "error" });
        return;
      }
      totals.set(row.requestItemId, total);
    }

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
      await loadPartRequests(orderId);
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
    openPartApproval,
    openPartRejection,
    closePartReview,
    updateApprovalQuantity,
    approvePartRequest,
    rejectPartRequest,
    openDeliveryRequest,
    closeDeliveryRequest,
    deliverTestRequest,
    openTestResult,
    closeTestResult,
    submitTestResults,
    getTestCommittedQuantity,
    getTestPendingQuantity,
  };
}
