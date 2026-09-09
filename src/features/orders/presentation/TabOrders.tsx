import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import type { AdminTab } from "@/features/admin-shell/domain/admin.types";
import { OSSituationsView } from "@/features/order-situations/presentation/OSSituationsView";
import { useOrderCompletion } from "@/features/orders/application/useOrderCompletion";
import { useOrderCustomerPersistence } from "@/features/orders/application/useOrderCustomerPersistence";
import { useOrderCustomerSelection } from "@/features/orders/application/useOrderCustomerSelection";
import { useOrderDetails } from "@/features/orders/application/useOrderDetails";
import { useOrderEditorWorkflow } from "@/features/orders/application/useOrderEditorWorkflow";
import { useOrderFilters } from "@/features/orders/application/useOrderFilters";
import { useOrderFormState } from "@/features/orders/application/useOrderFormState";
import { useOrderHistory } from "@/features/orders/application/useOrderHistory";
import { useOrderImages } from "@/features/orders/application/useOrderImages";
import { useOrderListMutations } from "@/features/orders/application/useOrderListMutations";
import { useOrderPartRequests } from "@/features/orders/application/useOrderPartRequests";
import { useOrderResolution } from "@/features/orders/application/useOrderResolution";
import { useOrderServiceAddress } from "@/features/orders/application/useOrderServiceAddress";
import { useOrderSituationDocuments } from "@/features/orders/application/useOrderSituationDocuments";
import { useOrdersWorkspace } from "@/features/orders/application/useOrdersWorkspace";
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
import { getServiceOrderForRoute } from "@/features/orders/infrastructure/orders-list.repository";
import { OrderDetailsPage } from "@/features/orders/presentation/OrderDetailsPage";
import { OrderEditorPage } from "@/features/orders/presentation/OrderEditorPage";
import { OrdersListWorkspace } from "@/features/orders/presentation/OrdersListWorkspace";
import { OrderWorkflowModals } from "@/features/orders/presentation/OrderWorkflowModals";
import { Toast } from "@/shared/ui/admin/AdminFeedback";
import { supabaseErrorMessage } from "@/shared/infrastructure/media.repository";

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
  const [saving, setSaving] = useState(false);

  const workspaceBase = useOrdersWorkspace({ showToast: setToast, organizationIdOverride });
  const {
    statuses,
    situations,
    serviceTypeSituations,
    profiles,
    serviceTypes,
    generalServices,
    loading: workspaceLoading,
    reloadWorkspace,
  } = workspaceBase;

  const formState = useOrderFormState();
  const { formOpen, editingOS, form, setForm, closeOrderForm } = formState;

  const imagesController = useOrderImages();
  const { solutionImages, replaceOrderImages, replaceSolutionImages } = imagesController;

  const customerSelection = useOrderCustomerSelection(organizationIdOverride);
  const { selectedCustomer, setSelectedCustomer, setEditingCustomer, customerDraft, customerAddressDraft, setAddressExpanded } = customerSelection;

  const serviceAddress = useOrderServiceAddress({
    form,
    setForm,
    selectedCustomer,
  });
  const { ibgeStates } = serviceAddress;

  const filters = useOrderFilters({
    organizationId: workspaceBase.organizationId,
    stateOptions: ibgeStates,
    matchOrderNumberOrExternal: scopedReadOnly,
  });
  const {
    orders,
    setOrders,
    loading: ordersLoading,
    error: ordersError,
  } = filters;
  const loading = workspaceLoading || ordersLoading;
  const workspace = { ...workspaceBase, orders, setOrders, loading };

  useEffect(() => {
    if (!ordersError) return;
    setToast({
      msg: `Erro ao carregar OS: ${ordersError instanceof Error ? ordersError.message : String(ordersError)}`,
      type: "error",
    });
  }, [ordersError]);

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

  const partRequests = useOrderPartRequests({
    reloadOrders: reloadWorkspace,
    hasPermission: effectiveHasPermission,
    showToast: setToast,
    formatError: supabaseErrorMessage,
  });
  const {
    detailPartRequests,
    loadPartRequests,
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
  const { solveOpen } = resolutionController;

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

  useEffect(() => {
    let cancelled = false;
    if (workspaceLoading) return () => { cancelled = true; };

    if (!initialOrderId) {
      if (detail) closeDetail();
      if (formOpen) closeOrderForm();
      return () => { cancelled = true; };
    }

    if (initialOrderId === "new" || routeSubpage === "edit") {
      if (scopedReadOnly) {
        if (detail) closeDetail();
        if (formOpen) closeOrderForm();
        onOrderRouteChange?.(null, null);
        return () => { cancelled = true; };
      }
      if (initialOrderId === "new") {
        if (detail) closeDetail();
        if (!formOpen || editingOS) openNew();
        return () => { cancelled = true; };
      }
    }

    if (routeSubpage !== "edit" && detail?.id === initialOrderId) {
      return () => { cancelled = true; };
    }
    if (routeSubpage === "edit" && formOpen && editingOS?.id === initialOrderId) {
      return () => { cancelled = true; };
    }

    const openRoutedOrder = (order: any) => {
      if (cancelled) return;
      if (routeSubpage === "edit") {
        if (!formOpen || editingOS?.id !== order.id) {
          void openEdit(order).then(() => {
            if (!cancelled) closeDetail();
          });
        }
        return;
      }
      if (formOpen) closeOrderForm();
      if (detail?.id !== order.id) openDetail(order);
    };

    const orderOnPage = orders.find(item => item.id === initialOrderId);
    if (orderOnPage) {
      openRoutedOrder(orderOnPage);
      return () => { cancelled = true; };
    }

    if (!workspaceBase.organizationId) return () => { cancelled = true; };
    void getServiceOrderForRoute(workspaceBase.organizationId, initialOrderId)
      .then(order => {
        if (!order) {
          if (!cancelled) setToast({ msg: "A OS solicitada não foi encontrada.", type: "error" });
          return;
        }
        openRoutedOrder(order);
      })
      .catch(error => {
        if (!cancelled) {
          setToast({ msg: `Erro ao carregar OS: ${error instanceof Error ? error.message : String(error)}`, type: "error" });
        }
      });

    return () => { cancelled = true; };
  }, [initialOrderId, routeSubpage, workspaceLoading, workspaceBase.organizationId, orders, detail?.id, formOpen, editingOS?.id, scopedReadOnly]);

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
    closeDetail();
    closeOrderForm();
    setDocumentsPageOpen(false);
    orderHistory.closePage();
    if (initialOrderId && onOrderRouteClose) {
      onOrderRouteClose();
      return;
    }
    if (onOrderRouteChange) onOrderRouteChange(null, null);
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
  const getStateLabel = (value: unknown) => stateLabel(value, ibgeStates);
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
