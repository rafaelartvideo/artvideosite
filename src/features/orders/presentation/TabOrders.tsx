import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { OrdersListWorkspace } from "@/features/orders/presentation/OrdersListWorkspace";
import { OrderDetailsPage } from "@/features/orders/presentation/OrderDetailsPage";
import { useOrderEditorWorkflow } from "@/features/orders/application/useOrderEditorWorkflow";
import { removeServiceOrder } from "@/features/orders/application/order-management";
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
import { useOrderDetails } from "@/features/orders/application/useOrderDetails";
import { useOrderHistory } from "@/features/orders/application/useOrderHistory";
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
import { Toast, ConfirmDialog } from "@/shared/ui/admin/AdminFeedback";
import { supabaseErrorMessage } from "@/shared/infrastructure/media.repository";

type OrderType = "internal" | "external";

export function TabOrders({ onNavigate, initialOrderId, onFocused }: { onNavigate?: (tab: AdminTab) => void; initialOrderId?: string | null; onFocused?: () => void }) {
  const { user, profile, hasPermission } = useAuth();
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [subView, setSubView] = useState<"list" | "situations">("list");
  const [displayMode, setDisplayMode] = useState<"list" | "kanban">(() => {
    if (typeof window === "undefined") return "list";
    return window.localStorage.getItem("os_view_mode") === "kanban" ? "kanban" : "list";
  });
  const workspace = useOrdersWorkspace({ showToast: setToast });
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
  const [deleteId, setDeleteId] = useState<string | null>(null);
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

  const customerSelection = useOrderCustomerSelection();
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
    hasPermission,
    showToast: setToast,
  })
  const {
    saveCustomer,
    saveCustomerBeforeOrder,
  } = customerPersistence;

  const partRequests = useOrderPartRequests({
    reloadOrders: reloadWorkspace,
    hasPermission,
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
    hasPermission,
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

  const orderEditor = useOrderEditorWorkflow({
    userId: user?.id,
    workspace,
    formState,
    images: imagesController,
    customers: customerSelection,
    address: serviceAddress,
    customerPersistence,
    details: detailsController,
    hasPermission,
    showToast: setToast,
    setSaving,
    formatError: supabaseErrorMessage,
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
    hasPermission,
    showToast: setToast,
    formatError: supabaseErrorMessage,
    syncRelatedCaches: reloadWorkspace,
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
    if (!initialOrderId || loading) return;
    const order = orders.find(item => item.id === initialOrderId);
    if (order) openDetail(order);
    onFocused?.();
  }, [initialOrderId, loading, orders]);


  const handleDeleteOrder = async (id: string) => {
    if (!hasPermission("orders.delete")) return;
    const { error } = await removeServiceOrder(id);
    if (error) {
      setToast({ msg: `Não foi possível excluir a OS: ${error.message}`, type: "error" });
      setDeleteId(null);
      return;
    }
    setToast({ msg: "OS excluída.", type: "success" });
    setDeleteId(null);
    closeDetail();
    await reloadWorkspace();
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
    search,
    setSearch,
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


  if (subView === "situations") return <OSSituationsView onBack={() => setSubView("list")} />;

  const formatCurrency = formatOrderCurrency;
  const detailUsedItemsTotal = usedItemsTotal(detailUsedItems);

  return (
    <div className="space-y-5">
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      {deleteId && <ConfirmDialog message="Excluir esta OS? Esta ação remove o registro principal da tabela de ordens de serviço." onConfirm={() => { void handleDeleteOrder(deleteId); }} onCancel={() => setDeleteId(null)} />}

      <OrdersListWorkspace
        visible={!detail && !formOpen && !solveOpen}
        displayMode={displayMode}
        workspace={workspace}
        filters={filters}
        mutations={listMutations}
        serviceAddress={serviceAddress}
        canCreate={hasPermission("orders.create")}
        hasPermission={hasPermission}
        onDisplayModeChange={setViewMode}
        onCreate={openNew}
        onOpenDetail={openDetail}
        onOpenEdit={(order) => { void openEdit(order); }}
        onDelete={setDeleteId}
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
        images={imagesController}
        partRequests={partRequests}
        resolution={resolutionController}
        mutations={listMutations}
        hasPermission={hasPermission}
        usedItemsTotal={detailUsedItemsTotal}
        formatDate={fmtDate}
        formatState={getStateLabel}
        formatSolvedAt={formatSolvedAt}
        formatCurrency={formatCurrency}
        getSituations={getSituationsForType}
        getSla={getSlaForOrder}
        onEdit={(order) => { void openEdit(order); }}
        onDelete={setDeleteId}
      />

      <OrderEditorPage
        visible={formOpen}
        saving={saving}
        workspace={workspace}
        formState={formState}
        images={imagesController}
        customers={customerSelection}
        address={serviceAddress}
        customerPersistence={customerPersistence}
        hasPermission={hasPermission}
        getSituations={getSituationsForType}
        getSla={getSlaForOrder}
        onSelectCustomer={selectCustomer}
        onSave={saveOS}
      />
      <OrderWorkflowModals
        detail={detail}
        saving={saving}
        workspace={workspace}
        formState={formState}
        images={imagesController}
        resolution={resolutionController}
        partRequests={partRequests}
        onSelectCustomer={selectCustomer}
        setToast={setToast}
      />
    </div>
  );
}
