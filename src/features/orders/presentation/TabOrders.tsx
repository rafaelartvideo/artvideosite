import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { OrdersListWorkspace } from "@/features/orders/presentation/OrdersListWorkspace";
import { OrderDetailsPage } from "@/features/orders/presentation/OrderDetailsPage";
import { useOrderEditorWorkflow } from "@/features/orders/application/useOrderEditorWorkflow";
import { OrderWorkflowModals } from "@/features/orders/presentation/OrderWorkflowModals";
import { OrderEditorPage } from "@/features/orders/presentation/OrderEditorPage";
import { OSSituationsView } from "@/features/order-situations/presentation/OSSituationsView";
import { useOrderImages } from "@/features/orders/application/useOrderImages";
import { useOrderPartRequests } from "@/features/orders/application/useOrderPartRequests";
import { useOrdersWorkspace } from "@/features/orders/application/useOrdersWorkspace";
import { useOrderFilters } from "@/features/orders/application/useOrderFilters";
import { useOrderListMutations } from "@/features/orders/application/useOrderListMutations";
import { useOrderCustomerSelection } from "@/features/orders/application/useOrderCustomerSelection";
import { useOrderServiceAddress } from "@/features/orders/application/useOrderServiceAddress";
import { useOrderResolution } from "@/features/orders/application/useOrderResolution";
import { useOrderCompletion } from "@/features/orders/application/useOrderCompletion";
import { useOrderDetails } from "@/features/orders/application/useOrderDetails";
import { useOrderHistory } from "@/features/orders/application/useOrderHistory";
import { useOrderSituationDocuments } from "@/features/orders/application/useOrderSituationDocuments";
import { useOrderFormState } from "@/features/orders/application/useOrderFormState";
import { useOrderCustomerPersistence } from "@/features/orders/application/useOrderCustomerPersistence";
import {
  equipmentSummary,
  formatOrderCurrency,
  formatOrderDate,
  formatSolvedAt,
  slaForOrder,
  stateLabel,
  situationsForType,
  usedItemsTotal,
} from "@/features/orders/application/order-display-rules";
import type { AdminTab } from "@/features/admin-shell/domain/admin.types";
import { Toast } from "@/shared/ui/admin/AdminFeedback";
import { supabaseErrorMessage } from "@/shared/infrastructure/media.repository";

type OrderType = "internal" | "external";
type SharedAccessMode = "default" | "read";

type TabOrdersProps = {
  onNavigate?: (tab: AdminTab) => void;
  initialOrderId?: string | null;
  routeSubpage?: string | null;
  onOrderRouteChange?: (id: string | null, subpage?: string | null) => void;
  onOrderRouteClose?: () => void;
  organizationIdOverride?: string | null;
  accessMode?: SharedAccessMode;
};

const READ_ONLY_PERMISSION_MARKERS = [
  ".create",
  ".edit",
  ".update",
  ".delete",
  ".change",
  ".manage",
  ".request",
  ".dispatch",
  ".confirm",
  ".register",
  ".receive",
  ".resolve",
  ".complete",
  ".upload",
  ".remove",
  ".attach",
  ".print",
  ".email",
  ".send",
  ".export",
];

function isBlockedReadOnlyPermission(permission: string) {
  return permission.startsWith("orders.toolbar.")
    || READ_ONLY_PERMISSION_MARKERS.some(marker => permission.includes(marker));
}

export function TabOrders({
  onNavigate,
  initialOrderId,
  routeSubpage,
  onOrderRouteChange,
  onOrderRouteClose,
  organizationIdOverride,
  accessMode = "default",
}: TabOrdersProps) {
  const { user, profile, hasPermission } = useAuth();
  const scopedReadOnly = accessMode === "read";
  const effectiveHasPermission = (permission: string) => {
    if (!hasPermission(permission)) return false;
    if (!scopedReadOnly) return true;
    if (permission.startsWith("customers.") || permission.startsWith("equipment.")) return false;
    return !isBlockedReadOnlyPermission(permission);
  };

  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [subView, setSubView] = useState<"list" | "situations">("list");
  const [displayMode, setDisplayMode] = useState<"list" | "kanban">(() => {
    if (typeof window === "undefined") return "list";
    return window.localStorage.getItem("os_view_mode") === "kanban" ? "kanban" : "list";
  });
  const workspace = useOrdersWorkspace({ showToast: setToast, organizationIdOverride });
  const {
    orders,
    setOrders,
    statuses,
    situations,
    serviceTypeSituations,
    profiles,
    services,
    brands,
    products,
    equipmentTypes,
    setEquipmentTypes,
    equipmentBrands,
    setEquipmentBrands,
    equipmentModels,
    setEquipmentModels,
    employees,
    serviceTypes,
    generalServices,
    loading,
    reloadWorkspace,
  } = workspace;
  const [saving, setSaving] = useState(false);

  const formState = useOrderFormState();
  const {
    formOpen,
    editingOS,
    selectedTechnicianIds,
    setSelectedTechnicianIds,
    selectedSellerIds,
    setSelectedSellerIds,
    quickEquipment,
    setQuickEquipment,
    quickCustomer,
    setQuickCustomer,
    form,
    setForm,
    needsScheduling,
    setNeedsScheduling,
    updateField: upF,
    openNewForm,
    hydrateOrderForm,
    closeOrderForm,
  } = formState;

  const imagesController = useOrderImages();
  const {
    orderImages,
    solutionImages,
    viewImage,
    setViewImage,
    loadOrderImages,
    replaceOrderImages,
    clearOrderImages,
    addOrderImages,
    removeOrderImage,
    replaceSolutionImages,
    addSolutionImages,
    removeSolutionImage,
  } = imagesController;

  const customerSelection = useOrderCustomerSelection(organizationIdOverride);
  const {
    customerSearch,
    customerResults,
    selectedCustomer,
    setSelectedCustomer,
    editingCustomer,
    setEditingCustomer,
    customerDraft,
    setCustomerDraft,
    customerAddressDraft,
    setCustomerAddressDraft,
    addressExpanded,
    setAddressExpanded,
    searchCustomers,
    selectCustomer: selectCustomerState,
    hydrateCustomer,
    clearCustomer,
  } = customerSelection;

  const serviceAddress = useOrderServiceAddress({
    form,
    setForm,
    selectedCustomer,
  });
  const {
    serviceUseCustomerAddress,
    setServiceUseCustomerAddress,
    serviceCustomerAddressOverride,
    setServiceCustomerAddressOverride,
    serviceAddressMessage,
    setServiceAddressMessage,
    ibgeStates,
    ibgeStatesLoading,
    ibgeCities,
    ibgeCitiesLoading,
    selectedServiceAddress,
    serviceAddressPreview,
    clearServiceAddress,
    copyCustomerAddressToForm,
    loadIbgeCities,
    resetServiceAddressState,
    hydrateServiceAddress,
  } = serviceAddress;

  const customerPersistence = useOrderCustomerPersistence({
    selectedCustomer,
    setSelectedCustomer,
    setEditingCustomer,
    customerDraft,
    customerAddressDraft,
    setAddressExpanded,
    setSaving,
    hasPermission: effectiveHasPermission,
    showToast: setToast,
    organizationIdOverride,
  });
  const {
    saveCustomer,
    saveCustomerBeforeOrder,
  } = customerPersistence;

  const partRequests = useOrderPartRequests({
    reloadOrders: reloadWorkspace,
    hasPermission: effectiveHasPermission,
    showToast: setToast,
    formatError: supabaseErrorMessage,
  });
  const {
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
  } = partRequests;

  const detailsController = useOrderDetails({
    loadPartRequests,
    replaceOrderImages,
    organizationIdOverride,
    loadPartRequestsEnabled: !scopedReadOnly,
  });
  const {
    detail,
    setDetail,
    detailHistory,
    detailUsedItems,
    setDetailUsedItems,
    detailSolutionImages,
    setDetailSolutionImages,
    openDetail,
    closeDetail,
  } = detailsController;

  const orderHistory = useOrderHistory({
    orderId: detail?.id,
    userId: user?.id,
    statusHistory: detailHistory,
    profiles,
    showToast: setToast,
  });
  const [documentsPageOpen, setDocumentsPageOpen] = useState(false);
  const orderDocuments = useOrderSituationDocuments({
    orderId: detail?.id,
    serviceTypeId: detail?.service_type_id,
    situations,
    serviceTypeSituations,
    hasPermission: effectiveHasPermission,
  });

  const resolutionController = useOrderResolution({
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
    reloadOrders: reloadWorkspace,
    hasPermission: effectiveHasPermission,
    showToast: setToast,
    formatError: supabaseErrorMessage,
    setSaving,
  });
  const {
    inventoryItems,
    solveOpen,
    setSolveOpen,
    solveDraft,
    setSolveDraft,
    openSolveOrder,
    saveOrderSolution,
  } = resolutionController;
  const completionController = useOrderCompletion({
    detail,
    usedItems: detailUsedItems,
    setDetail,
    setOrders,
    reloadOrders: reloadWorkspace,
    hasPermission: effectiveHasPermission,
    showToast: setToast,
    formatError: supabaseErrorMessage,
    setSaving,
  });

  const orderEditor = useOrderEditorWorkflow({
    userId: user?.id,
    workspace,
    formState,
    images: imagesController,
    customers: customerSelection,
    address: serviceAddress,
    customerPersistence,
    details: detailsController,
    hasPermission: effectiveHasPermission,
    showToast: setToast,
    setSaving,
    formatError: supabaseErrorMessage,
    organizationIdOverride,
  });
  const { selectCustomer, openNew, openEdit, save: saveOS } = orderEditor;

  const listMutations = useOrderListMutations({
    orders,
    setOrders,
    statuses,
    situations,
    detail,
    setDetail,
    userId: user?.id,
    hasPermission: effectiveHasPermission,
    showToast: setToast,
    formatError: supabaseErrorMessage,
    syncRelatedCaches: reloadWorkspace,
    organizationIdOverride,
  });
  const {
    draggingId,
    dragOverStatusId,
    setDragOverStatusId,
    updateOrderStatus,
    updateOrderSituation,
    handleKanbanDrop,
    handleCardDragStart,
    handleCardDragEnd,
    shouldSuppressCardOpen,
    handleDragLeave,
  } = listMutations;

  useEffect(() => {
    if (loading) return;
    if (!initialOrderId) {
      if (detail) closeDetail();
      if (formOpen) closeOrderForm();
      return;
    }
    if (initialOrderId === "new" || routeSubpage === "edit") {
      if (scopedReadOnly) {
        if (detail) closeDetail();
        if (formOpen) closeOrderForm();
        onOrderRouteChange?.(null, null);
        return;
      }
      if (initialOrderId === "new") {
        if (detail) closeDetail();
        if (!formOpen || editingOS) openNew();
        return;
      }
    }
    const order = orders.find(item => item.id === initialOrderId);
    if (!order) return;
    if (routeSubpage === "edit") {
      if (!formOpen || editingOS?.id !== order.id) void openEdit(order).then(() => closeDetail());
      return;
    }
    if (formOpen) closeOrderForm();
    if (detail?.id !== order.id) openDetail(order);
  }, [initialOrderId, routeSubpage, loading, orders, detail?.id, formOpen, editingOS?.id, scopedReadOnly]);

  const openRoutedDetail = (order: any) => {
    if (onOrderRouteChange) {
      onOrderRouteChange(order.id, null);
      return;
    }
    openDetail(order);
  };

  const openRoutedNew = () => {
    if (!effectiveHasPermission("orders.create")) return;
    if (onOrderRouteChange) {
      onOrderRouteChange("new", null);
      return;
    }
    openNew();
  };

  const openRoutedEdit = async (order: any) => {
    if (!effectiveHasPermission("orders.edit")) return;
    if (onOrderRouteChange) {
      onOrderRouteChange(order.id, "edit");
      return;
    }
    await openEdit(order);
    closeDetail();
  };

  const closeRoutedPage = () => {
    if (initialOrderId && onOrderRouteClose) {
      onOrderRouteClose();
      return;
    }
    if (onOrderRouteChange) {
      onOrderRouteChange(null, null);
      return;
    }
    closeDetail();
    closeOrderForm();
  };

  const saveRoutedOrder = async () => {
    const saved = await saveOS();
    if (saved) onOrderRouteChange?.(null, null);
  };

  const setViewMode = (mode: "list" | "kanban") => {
    setDisplayMode(mode);
    window.localStorage.setItem("os_view_mode", mode);
  };

  const fmtDate = formatOrderDate;
  const getEquipmentSummary = equipmentSummary;
  const getStateLabel = (value: unknown) => stateLabel(value, ibgeStates);

  const filters = useOrderFilters({
    orders,
    stateOptions: ibgeStates,
    getStateLabel,
    getEquipmentSummary,
  });
  const {
    osNumberSearch,
    setOsNumberSearch,
    externalOsSearch,
    setExternalOsSearch,
    documentSearch,
    setDocumentSearch,
    filterStatus,
    setFilterStatus,
    filterSituation,
    setFilterSituation,
    filterOrderType,
    setFilterOrderType,
    selectedServiceTypeId,
    setSelectedServiceTypeId,
    orderSort,
    setOrderSort,
    selectedStates,
    setSelectedStates,
    selectedCities,
    setSelectedCities,
    cityFilterOptions,
    cityFiltersLoading,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    page,
    setPage,
    pageSize,
    setPageSize,
    invalidPeriod,
    filteredOrders: filtered,
    pagedOrders,
    totalPages,
    safePage,
    orderLabel,
    clearFilters,
  } = filters;
  const getSituationsForType = (serviceTypeId: string, currentSituationId?: string, currentSituation?: any) =>
    situationsForType(serviceTypeId, serviceTypeSituations, situations, currentSituationId, currentSituation);

  const getSlaForOrder = (serviceTypeId?: string, situationId?: string, relatedSituation?: any) =>
    slaForOrder(serviceTypeId, situationId, relatedSituation, serviceTypeSituations, situations);

  if (subView === "situations" && !scopedReadOnly) return <OSSituationsView onBack={() => setSubView("list")} />;

  const formatCurrency = formatOrderCurrency;
  const detailUsedItemsTotal = usedItemsTotal(detailUsedItems);

  return (
    <div className="space-y-5">
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      <OrdersListWorkspace
        visible={!detail && !formOpen && !solveOpen}
        displayMode={displayMode}
        workspace={workspace}
        filters={filters}
        mutations={listMutations}
        serviceAddress={serviceAddress}
        canCreate={effectiveHasPermission("orders.create")}
        hasPermission={effectiveHasPermission}
        onDisplayModeChange={setViewMode}
        onCreate={openRoutedNew}
        onOpenDetail={openRoutedDetail}
        onOpenEdit={openRoutedEdit}
        getSituations={getSituationsForType}
        formatDate={fmtDate}
        equipmentSummary={equipmentSummary}
      />

      <OrderDetailsPage
        visible={Boolean(detail && !solveOpen)}
        userId={user?.id}
        profileName={profile?.full_name}
        workspace={workspace}
        details={detailsController}
        history={orderHistory}
        documents={orderDocuments}
        documentsPageOpen={documentsPageOpen}
        onDocumentsPageOpenChange={setDocumentsPageOpen}
        images={imagesController}
        partRequests={partRequests}
        resolution={resolutionController}
        completion={completionController}
        mutations={listMutations}
        hasPermission={effectiveHasPermission}
        usedItemsTotal={detailUsedItemsTotal}
        formatDate={fmtDate}
        formatState={getStateLabel}
        formatSolvedAt={formatSolvedAt}
        formatCurrency={formatCurrency}
        getSituations={getSituationsForType}
        getSla={getSlaForOrder}
        onEdit={openRoutedEdit}
        onClose={closeRoutedPage}
      />

      {!scopedReadOnly && <OrderEditorPage
        visible={formOpen}
        saving={saving}
        workspace={workspace}
        formState={formState}
        images={imagesController}
        customers={customerSelection}
        address={serviceAddress}
        customerPersistence={customerPersistence}
        hasPermission={effectiveHasPermission}
        getSituations={getSituationsForType}
        getSla={getSlaForOrder}
        onSelectCustomer={selectCustomer}
        onSave={saveRoutedOrder}
        onClose={closeRoutedPage}
      />}
      {!scopedReadOnly && <OrderWorkflowModals
        detail={detail}
        saving={saving}
        workspace={workspace}
        formState={formState}
        images={imagesController}
        resolution={resolutionController}
        completion={completionController}
        partRequests={partRequests}
        onSelectCustomer={selectCustomer}
        setToast={setToast}
        formatCurrency={formatCurrency}
      />}
    </div>
  );
}
