import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import {
  QuickEquipmentModal,
  ServiceTypeModal,
} from "@/features/orders/presentation/OrderQuickCreateModals";
import { QuickCustomerModal } from "@/features/orders/presentation/QuickCustomerModal";
import { OrdersTable } from "@/features/orders/presentation/OrdersTable";
import { OrdersKanban } from "@/features/orders/presentation/OrdersKanban";
import { OrdersHeader } from "@/features/orders/presentation/OrdersHeader";
import { OrdersFilters } from "@/features/orders/presentation/OrdersFilters";
import { OrderSolutionSummary } from "@/features/orders/presentation/OrderSolutionSummary";
import { OrderPartRequestsSection } from "@/features/orders/presentation/OrderPartRequestsSection";
import { InfoRow, OrderDetailsContent } from "@/features/orders/presentation/OrderDetailsContent";
import { OrderDetailsActions } from "@/features/orders/presentation/OrderDetailsActions";
import { OrderCustomerSection } from "@/features/orders/presentation/OrderCustomerSection";
import { OrderEquipmentSection } from "@/features/orders/presentation/OrderEquipmentSection";
import { OrderInformationSection } from "@/features/orders/presentation/OrderInformationSection";
import { OrderServiceLocationSection } from "@/features/orders/presentation/OrderServiceLocationSection";
import { OrderFormActions } from "@/features/orders/presentation/OrderFormActions";
import { OrderResolutionPage } from "@/features/orders/presentation/OrderResolutionPage";
import {
  EmployeeMultiSelect,
  getPriorityLabel,
  getResponsibleName,
  OrderAddressSelect,
  OrderFilterMultiSelect,
  PriorityBadge,
  type MultiSelectOption,
  type ServiceOrderWithRelations,
} from "@/features/orders/presentation/OrderFormControls";
import {
  saveOrderCustomerAddress,
  updateOrderCustomer,
} from "@/features/orders/infrastructure/orders-customer.repository";
import {
  PartRequestModal,
  ReviewPartRequestModal,
  TestDeliveryModal,
  TestResultModal,
} from "@/features/orders/presentation/PartRequestModals";
import { validateOrderResolution } from "@/features/orders/application/order-resolution";
import {
  buildOrderPayload,
  prepareOrderForm,
} from "@/features/orders/application/order-form";
import { persistServiceOrder } from "@/features/orders/application/order-submission";
import {
  fmtReviewDate,
  purposeLabel,
} from "@/features/orders/application/part-request.formatters";
import {
  deleteServiceOrder,
  getServiceOrderResolutionState,
  listOrderStatusOptions,
} from "@/features/orders/infrastructure/orders.repository";
import {
  OrderImageLightbox,
  OrderImagesField,
  uploadOrderImage,
} from "@/features/orders/presentation/OrderImages";
import { useOrderImages } from "@/features/orders/presentation/useOrderImages";
import { useOrderPartRequests } from "@/features/orders/presentation/useOrderPartRequests";
import { useOrdersWorkspace } from "@/features/orders/presentation/useOrdersWorkspace";
import { useOrderFilters } from "@/features/orders/presentation/useOrderFilters";
import { useOrderListMutations } from "@/features/orders/presentation/useOrderListMutations";
import { useOrderCustomerSelection } from "@/features/orders/presentation/useOrderCustomerSelection";
import { useOrderServiceAddress } from "@/features/orders/presentation/useOrderServiceAddress";
import { useOrderResolution } from "@/features/orders/presentation/useOrderResolution";
import { useOrderDetails } from "@/features/orders/presentation/useOrderDetails";
import { useOrderFormState } from "@/features/orders/presentation/useOrderFormState";
import { useMediaUrl } from "@/lib/hooks";
import { AddressFields } from "@/app/components/AddressFields";
import type { Address } from "@/lib/address";
import {
  LayoutDashboard, ClipboardList, Edit2, Trash2, RefreshCw, Search, MessageCircle,
  Users, List, X, Plus, Clock, CheckCircle, Upload, AlertTriangle, ArrowLeft,
  ChevronLeft, ChevronRight, Phone, Star, DollarSign, HelpCircle, ChevronDown,
  AlertCircle, FileText, Camera, Eraser, ArrowUpDown, ArrowUpNarrowWide, ArrowDownWideNarrow, Check, PackagePlus,
} from "lucide-react";
import {
  cn, slugify, initialOrderStatus, getWhatsAppUrl, formatPhone,
  CustomerType, customerPayload, customerUpdatePayload,
  validateCustomerForm, formatCpf, formatCnpj,
  formatFoundationDate, foundationDateToIso, foundationDateFromCustomer, todayDateOnly,
  INPUT, FInput, FTextarea, FSelect, FToggle, CustomerTypeToggle,
  StatusBadge, LoadingState, EmptyState, BtnPrimary, BtnSecondary, Toast, ConfirmDialog,
  PageHeader, Section, AdminPage, PaginationBar, ImageUpload, ProductAdminThumb,
  AdminBackContext, InternalBackButton, supabaseErrorMessage, createMediaRecord, isHexColor,
  type AdminTab,
} from "./shared";
import { getGeneralServices } from "@/lib/queries";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/app/components/ui/dropdown-menu";

type OrderType = "internal" | "external";
type ServiceAddressSource = "customer" | "custom";
const normalizeSearchIdentifier = (value: unknown) => String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");

export function TabOrders({ onNavigate, initialOrderId, onFocused }: { onNavigate?: (tab: AdminTab) => void; initialOrderId?: string | null; onFocused?: () => void }) {
  const { user, profile, hasPermission } = useAuth();
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [subView, setSubView] = useState<"list" | "situations">("list");
  const [displayMode, setDisplayMode] = useState<"list" | "kanban">(() => {
    if (typeof window === "undefined") return "list";
    return window.localStorage.getItem("os_view_mode") === "kanban" ? "kanban" : "list";
  });
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
  } = useOrdersWorkspace({ showToast: setToast });
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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
  } = useOrderFormState();

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
  } = useOrderImages();

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
  } = useOrderCustomerSelection();

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
  } = useOrderServiceAddress({
    form,
    setForm,
    selectedCustomer,
  });

  const selectCustomer = (customer: any) => {
    const address = selectCustomerState(customer);
    upF("customer_id", customer.id);
    if (form.order_type !== "external" || !serviceUseCustomerAddress) return;
    if (address) {
      setServiceAddressMessage("");
      setServiceCustomerAddressOverride(true);
      copyCustomerAddressToForm(address);
    } else {
      setServiceUseCustomerAddress(false);
      setServiceAddressMessage(
        "Este cliente não possui endereço cadastrado. Preencha o local do atendimento.",
      );
      clearServiceAddress();
    }
  };

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
  } = useOrderPartRequests({
    reloadOrders: reloadWorkspace,
    showToast: setToast,
    formatError: supabaseErrorMessage,
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
  } = useOrderDetails({
    loadPartRequests,
    replaceOrderImages,
  });

  const {
    inventoryItems,
    solveOpen,
    setSolveOpen,
    solveDraft,
    setSolveDraft,
    openSolveOrder,
    saveOrderSolution,
  } = useOrderResolution({
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
  } = useOrderListMutations({
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
  });

  useEffect(() => {
    if (!initialOrderId || loading) return;
    const order = orders.find(item => item.id === initialOrderId);
    if (order) openDetail(order);
    onFocused?.();
  }, [initialOrderId, loading, orders]);


  const openNew = () => {
    openNewForm();
    resetServiceAddressState();
    clearOrderImages();
    setViewImage(null);
    clearCustomer();
  };

  const openEdit = async (o: any) => {
    const { data: currentOrder, error: currentOrderError } = await getServiceOrderResolutionState(o.id);
    if (currentOrderError) {
      setToast({ msg: `Não foi possível verificar o estado da OS: ${supabaseErrorMessage(currentOrderError)}`, type: "error" });
      return;
    }
    if (currentOrder?.is_solved || o.is_solved) {
      setToast({ msg: "Esta OS está solucionada e é somente leitura.", type: "error" });
      return;
    }
    await loadOrderImages(o.id);
    hydrateOrderForm(o);
    hydrateServiceAddress({
      useCustomerAddress: o.order_type === "external" && o.service_address_source === "customer",
      state: o.order_type === "external" ? o.service_state : undefined,
      city: o.order_type === "external" ? o.service_city : undefined,
    });
    hydrateCustomer((o.customer as any) || null);
  };

  const saveCustomer = async () => {
    if (!hasPermission("customers.edit")) return;
    if (!selectedCustomer?.id) return;
    const validationError = validateCustomerForm(customerDraft);
    if (validationError) { setToast({ msg: validationError, type: "error" }); return; }
    setSaving(true);
    const { error: customerError } = await updateOrderCustomer(selectedCustomer.id, customerUpdatePayload(customerDraft));
    if (customerError) { console.error("[ADMIN] customer update error:", customerError); setToast({ msg: `Erro ao atualizar cliente: ${customerError.message}`, type: "error" }); setSaving(false); return; }
    const address = (selectedCustomer.addresses || []).find((item: Address) => item.is_default) || selectedCustomer.addresses?.[0];
    const addressPayload = { customer_id: selectedCustomer.id, zip_code: customerAddressDraft.zip_code || null, street: customerAddressDraft.street || null, number: customerAddressDraft.number || null, complement: customerAddressDraft.complement || null, neighborhood: customerAddressDraft.neighborhood || null, city: customerAddressDraft.city || null, state: customerAddressDraft.state || null, is_default: true };
    const addressResult = await saveOrderCustomerAddress(address?.id || null, addressPayload);
    setSaving(false);
    if (addressResult.error) { console.error("[ADMIN] customer address update error:", addressResult.error); setToast({ msg: `Cliente salvo, mas erro no endereço: ${addressResult.error.message}`, type: "error" }); return; }
    setSelectedCustomer({ ...selectedCustomer, ...customerUpdatePayload(customerDraft), addresses: [customerAddressDraft] });
    setEditingCustomer(false);
    setAddressExpanded(true);
    setToast({ msg: "Dados do cliente atualizados.", type: "success" });
  };

  const saveOS = async () => {
    if (editingOS ? !hasPermission("orders.edit") : !hasPermission("orders.create")) { setToast({ msg: "Você não possui permissão para esta ação na OS.", type: "error" }); return; }
    const preparation = prepareOrderForm({
      form,
      editingOrder: editingOS,
      userId: user?.id,
      selectedCustomerId: selectedCustomer?.id,
      serviceUseCustomerAddress,
      serviceCustomerAddressOverride,
      selectedServiceAddress,
      needsScheduling,
      equipmentBrands,
      equipmentModels,
    });
    if ("error" in preparation) {
      setToast({ msg: preparation.error, type: "error" });
      return;
    }
    const { data: availableStatuses, error: statusError } = await listOrderStatusOptions();
    const status = editingOS ? (availableStatuses || []).find(item => item.id === form.status_id) : initialOrderStatus(availableStatuses || []);
    if (statusError || !status?.id) { setToast({ msg: "Não foi possível identificar um status válido para a OS.", type: "error" }); return; }
    setSaving(true);
    if (editingCustomer && selectedCustomer?.id) {
      const validationError = validateCustomerForm(customerDraft);
      if (validationError) { setToast({ msg: validationError, type: "error" }); setSaving(false); return; }
      const { error: customerError } = await updateOrderCustomer(selectedCustomer.id, customerUpdatePayload(customerDraft));
      if (customerError) { setToast({ msg: `Erro ao atualizar cliente: ${customerError.message}`, type: "error" }); setSaving(false); return; }
      const address = (selectedCustomer.addresses || []).find((item: Address) => item.is_default) || selectedCustomer.addresses?.[0];
      const addressPayload = { customer_id: selectedCustomer.id, zip_code: customerAddressDraft.zip_code || null, street: customerAddressDraft.street || null, number: customerAddressDraft.number || null, complement: customerAddressDraft.complement || null, neighborhood: customerAddressDraft.neighborhood || null, city: customerAddressDraft.city || null, state: customerAddressDraft.state || null, is_default: true };
      const addressResult = await saveOrderCustomerAddress(address?.id || null, addressPayload);
      if (addressResult.error) { setToast({ msg: `Cliente atualizado, mas erro no endereço: ${addressResult.error.message}`, type: "error" }); setSaving(false); return; }
      setSelectedCustomer({ ...selectedCustomer, ...customerUpdatePayload(customerDraft), addresses: [customerAddressDraft] });
      setEditingCustomer(false);
    }
    const payload = buildOrderPayload({
      form,
      editingOrder: editingOS,
      userId: user?.id,
      statusId: status.id,
      prepared: preparation.prepared,
      selectedTechnicianIds,
      selectedSellerIds,
      needsScheduling,
      serviceUseCustomerAddress,
    });
    const submission = await persistServiceOrder({
      editingOrder: editingOS,
      payload,
      selectedTechnicianIds,
      selectedSellerIds,
      orderImages,
      uploadImage: uploadOrderImage,
    });
    if (!submission.success) {
      setSaving(false);
      const message = submission.stage === "record"
        ? `Erro ao salvar OS: ${supabaseErrorMessage(submission.error)}`
        : submission.stage === "relations"
          ? `OS salva, mas não foi possível atualizar técnicos/vendedores: ${supabaseErrorMessage(submission.error)}`
          : `OS salva, mas houve erro nas imagens: ${supabaseErrorMessage(submission.error)}`;
      setToast({ msg: message, type: "error" });
      return;
    }
    setSaving(false);
    setToast({ msg: `OS ${editingOS ? "atualizada" : "criada"} com sucesso!`, type: "success" });
    closeOrderForm(); closeDetail(); reloadWorkspace();
  };

  const handleDeleteOrder = async (id: string) => {
    if (!hasPermission("orders.delete")) return;
    const { error } = await deleteServiceOrder(id);
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

  const fmtDate = (d?: string | null, time = false) => {
    if (!d) return "—";
    return new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", ...(time ? { hour: "2-digit", minute: "2-digit" } : {}) });
  };

  const equipmentSummary = (o: any) => {
    const type = (o.equipment_type as any)?.name;
    const brand = (o.equipment_brand as any)?.name;
    const model = (o.equipment_model as any)?.name || o.model;
    const pieces = [type, [brand, model].filter(Boolean).join(" ")].filter(Boolean);
    return pieces.join(" • ") || "—";
  };

  const stateLabel = (state: unknown) => {
    const sigla = String(state ?? "").trim().toUpperCase();
    if (!sigla) return "";
    const ibgeState = ibgeStates.find(item => item.sigla.trim().toUpperCase() === sigla);
    return ibgeState ? `${sigla} — ${ibgeState.nome}` : sigla;
  };

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
  } = useOrderFilters({
    orders,
    stateOptions: ibgeStates,
    getStateLabel: stateLabel,
    getEquipmentSummary: equipmentSummary,
  });
  const OrderSortIcon = orderSort === "asc"
    ? ArrowUpNarrowWide
    : orderSort === "desc" ? ArrowDownWideNarrow : ArrowUpDown;

  const getSituationsForType = (serviceTypeId: string, currentSituationId?: string, currentSituation?: any) => {
    const links = serviceTypeSituations.filter(link => link.service_type_id === serviceTypeId).sort((left, right) => Number(left.sort_order ?? 0) - Number(right.sort_order ?? 0));
    if (links.length === 0) return situations;
    const linkedSituationIds = new Set(links.map(link => link.situation_id));
    const allowed = links.map(link => situations.find(situation => situation.id === link.situation_id)).filter(Boolean);
    const historical = currentSituationId && !linkedSituationIds.has(currentSituationId) ? [currentSituation || situations.find(situation => situation.id === currentSituationId)].filter(Boolean) : [];
    return [...historical, ...allowed];
  };

  const getSlaForOrder = (serviceTypeId?: string, situationId?: string, relatedSituation?: any) => {
    const link = serviceTypeSituations.find(item => item.service_type_id === serviceTypeId && item.situation_id === situationId);
    const situation = situations.find(item => item.id === situationId) || relatedSituation;
    if (!link || !situation) return null;
    const hours = Number(link.use_default_hours ? situation.hours : link.sla_hours);
    return Number.isFinite(hours) && hours > 0 ? { hours, isDefault: link.use_default_hours !== false } : null;
  };

  if (subView === "situations") return <OSSituationsView onBack={() => setSubView("list")} />;

  const formatSolvedAt = (value: string) => Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value)).replace(", ", " às ");
  const formatCurrency = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
  const detailUsedItemsTotal = detailUsedItems.reduce((total, item) => {
    if (item.total_sale_price == null) return total;
    const itemTotal = Number(item.total_sale_price);
    return Number.isFinite(itemTotal) ? total + itemTotal : total;
  }, 0);

  return (
    <div className="space-y-5">
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      {deleteId && <ConfirmDialog message="Excluir esta OS? Esta ação remove o registro principal da tabela de ordens de serviço." onConfirm={() => { void handleDeleteOrder(deleteId); }} onCancel={() => setDeleteId(null)} />}

      {!detail && !formOpen && !solveOpen && <>
      <OrdersHeader
        total={filtered.length}
        displayMode={displayMode}
        canCreate={hasPermission("orders.create")}
        onDisplayModeChange={setViewMode}
        onCreate={openNew}
        onRefresh={() => { void reloadWorkspace(); }}
      />

      <OrdersFilters
        search={search}
        statusId={filterStatus}
        situationId={filterSituation}
        orderType={filterOrderType}
        serviceTypeId={selectedServiceTypeId}
        selectedStates={selectedStates}
        selectedCities={selectedCities}
        dateFrom={dateFrom}
        dateTo={dateTo}
        orderSort={orderSort}
        statuses={statuses}
        situations={situations}
        serviceTypes={serviceTypes}
        stateOptions={ibgeStates}
        cityOptions={cityFilterOptions}
        statesLoading={ibgeStatesLoading}
        citiesLoading={cityFiltersLoading}
        invalidPeriod={invalidPeriod}
        onSearchChange={(value) => { setSearch(value); setPage(1); }}
        onStatusChange={(value) => { setFilterStatus(value); setPage(1); }}
        onSituationChange={(value) => { setFilterSituation(value); setPage(1); }}
        onOrderTypeChange={(value) => { setFilterOrderType(value as OrderType | ""); setPage(1); }}
        onServiceTypeChange={(value) => { setSelectedServiceTypeId(value); setPage(1); }}
        onStateSelect={(value) => setSelectedStates(current => current.includes(value) ? current : [...current, value])}
        onStateRemove={(value) => setSelectedStates(current => current.filter(state => state !== value))}
        onStatesClear={() => setSelectedStates([])}
        onCitySelect={(value) => {
          const option = cityFilterOptions.find(city => `${city.state}:${city.name}` === value);
          if (option && !selectedCities.some(city => city.name === option.name && city.state === option.state)) {
            setSelectedCities(current => [...current, option]);
          }
        }}
        onCityRemove={(value) => setSelectedCities(current => current.filter(city => `${city.state}:${city.name}` !== value))}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
        onOrderSortChange={(value) => { setOrderSort(value); setPage(1); }}
        onClear={clearFilters}
      />

      {displayMode === "list" ? <OrdersTable
        loading={loading}
        filteredOrders={filtered}
        pagedOrders={pagedOrders}
        statuses={statuses}
        hasActiveFilters={Boolean(search || filterStatus || filterSituation || filterOrderType || selectedServiceTypeId || orderSort || selectedStates.length || selectedCities.length || dateFrom || dateTo)}
        hasPermission={hasPermission}
        onOpen={openDetail}
        onStatusChange={updateOrderStatus}
        onSituationChange={updateOrderSituation}
        getSituations={getSituationsForType}
        onEdit={(order) => { void openEdit(order); }}
        onDelete={setDeleteId}
        formatDate={fmtDate}
        equipmentSummary={equipmentSummary}
        page={safePage}
        pageSize={pageSize}
        totalPages={totalPages}
        onPageChange={(nextPage) => setPage(Math.max(1, Math.min(nextPage, totalPages)))}
        onPageSizeChange={(nextPageSize) => { setPageSize(nextPageSize); setPage(1); }}
      /> : <OrdersKanban
        statuses={statuses}
        filteredOrders={filtered}
        situations={situations}
        draggingId={draggingId}
        dragOverStatusId={dragOverStatusId}
        hasPermission={hasPermission}
        onDragOver={setDragOverStatusId}
        onDragLeave={handleDragLeave}
        onDrop={(statusId) => { void handleKanbanDrop(statusId); }}
        onCardDragStart={handleCardDragStart}
        onCardDragEnd={handleCardDragEnd}
        onOpen={(order) => {
          if (!shouldSuppressCardOpen()) openDetail(order);
        }}
        onSituationChange={(order, situationId) => { void updateOrderSituation(order, situationId); }}
        onEdit={(order) => { void openEdit(order); }}
        formatDate={fmtDate}
      />}
      </>}

      {/* OS Detail Drawer */}
      {detail && !solveOpen && (
        <AdminPage open={true} onClose={() => closeDetail()} breadcrumb="Ordens de Serviço" title={detail.os_number || "Ordem de Serviço"} subtitle={(detail.service as any)?.title || "Ordem de Serviço"} maxW="max-w-2xl">
            <div className="p-5 space-y-5">
              <OrderDetailsContent
                detail={detail}
                images={orderImages}
                history={detailHistory}
                formatDate={fmtDate}
                formatState={stateLabel}
                getSla={getSlaForOrder}
                onViewImage={setViewImage}
              />
              <OrderPartRequestsSection
                requests={detailPartRequests}
                assignedTo={detail.assigned_to}
                currentUserId={user?.id}
                hasPermission={hasPermission}
                formatDate={fmtDate}
                getCommittedQuantity={getTestCommittedQuantity}
                getPendingQuantity={getTestPendingQuantity}
                onApprove={openPartApproval}
                onReject={openPartRejection}
                onDelivery={openDeliveryRequest}
                onTestResult={openTestResult}
              />
              <OrderSolutionSummary
                detail={detail}
                profileName={profile?.full_name}
                usedItems={detailUsedItems}
                solutionImages={detailSolutionImages}
                usedItemsTotal={detailUsedItemsTotal}
                formatSolvedAt={formatSolvedAt}
                formatCurrency={formatCurrency}
                onViewImage={setViewImage}
              />
            </div>
            <OrderDetailsActions
              detail={detail}
              statuses={statuses}
              situations={getSituationsForType(detail.service_type_id, detail.situation_id, detail.situation)}
              hasPermission={hasPermission}
              onClose={() => closeDetail()}
              onStatusChange={(statusId) => updateOrderStatus(detail, statusId)}
              onSituationChange={(situationId) => { void updateOrderSituation(detail, situationId); }}
              onRequestParts={openPartRequestModal}
              onResolve={() => openSolveOrder(detail)}
              onEdit={() => { closeDetail(); void openEdit(detail); }}
              onDelete={() => setDeleteId(detail.id)}
            />
        </AdminPage>
      )}

      {/* OS Create/Edit Page */}
      {formOpen && (
        <AdminPage open={true} onClose={closeOrderForm} breadcrumb={editingOS ? `Ordens de Serviço > OS #${editingOS.os_number || editingOS.id.slice(0,8)}` : "Ordens de Serviço"} title={editingOS ? "Editar OS" : "Nova OS"} subtitle={editingOS ? "Atualize os dados do atendimento" : "Cadastre os dados do atendimento"} maxW="max-w-2xl" fullPage={Boolean(editingOS)}>
          <div className="p-5 space-y-5">
            {/* Cliente */}
            <OrderCustomerSection
              selectedCustomer={selectedCustomer}
              editingCustomer={editingCustomer}
              customerDraft={customerDraft}
              customerAddressDraft={customerAddressDraft}
              saving={saving}
              editingOrder={Boolean(editingOS)}
              addressExpanded={addressExpanded}
              customerSearch={customerSearch}
              customerResults={customerResults}
              hasPermission={hasPermission}
              setCustomerDraft={setCustomerDraft}
              setCustomerAddressDraft={setCustomerAddressDraft}
              setEditingCustomer={setEditingCustomer}
              setAddressExpanded={setAddressExpanded}
              saveCustomer={() => { void saveCustomer(); }}
              searchCustomers={(query) => { void searchCustomers(query); }}
              selectCustomer={selectCustomer}
              onClearCustomer={() => { clearCustomer(); upF("customer_id", ""); }}
              onCreateCustomer={() => setQuickCustomer(true)}
            />

            <OrderEquipmentSection
              form={form}
              equipmentTypes={equipmentTypes}
              equipmentBrands={equipmentBrands}
              equipmentModels={equipmentModels}
              editing={Boolean(editingOS)}
              canCreate={hasPermission("equipment.create")}
              onFieldChange={upF}
              onCreateEquipment={() => setQuickEquipment(true)}
            />

            <OrderServiceLocationSection
              form={form}
              setForm={setForm}
              serviceUseCustomerAddress={serviceUseCustomerAddress}
              setServiceUseCustomerAddress={setServiceUseCustomerAddress}
              setServiceCustomerAddressOverride={setServiceCustomerAddressOverride}
              selectedServiceAddress={selectedServiceAddress}
              serviceAddressPreview={serviceAddressPreview}
              serviceAddressMessage={serviceAddressMessage}
              setServiceAddressMessage={setServiceAddressMessage}
              ibgeStates={ibgeStates}
              ibgeCities={ibgeCities}
              ibgeStatesLoading={ibgeStatesLoading}
              ibgeCitiesLoading={ibgeCitiesLoading}
              onFieldChange={upF}
              clearServiceAddress={clearServiceAddress}
              copyCustomerAddressToForm={copyCustomerAddressToForm}
              loadIbgeCities={loadIbgeCities}
            />

            <OrderImagesField images={orderImages} onAdd={addOrderImages} onRemove={removeOrderImage} onView={setViewImage} canEdit={editingOS ? hasPermission("orders.edit") : hasPermission("orders.create")} />

            <OrderInformationSection
              form={form}
              editingOrder={editingOS}
              serviceTypes={serviceTypes}
              serviceTypeSituations={serviceTypeSituations}
              generalServices={generalServices}
              employees={employees}
              selectedTechnicianIds={selectedTechnicianIds}
              selectedSellerIds={selectedSellerIds}
              canAssign={hasPermission("orders.assign")}
              situations={situations}
              onFieldChange={upF}
              onTechniciansChange={setSelectedTechnicianIds}
              onSellersChange={setSelectedSellerIds}
              getSituations={getSituationsForType}
              getSla={getSlaForOrder}
            />
          </div>
          <OrderFormActions
            saving={saving}
            canSave={editingOS ? hasPermission("orders.edit") : hasPermission("orders.create")}
            onCancel={closeOrderForm}
            onSave={() => { void saveOS(); }}
          />
        </AdminPage>
      )}
      {quickEquipment && <QuickEquipmentModal
        onClose={() => setQuickEquipment(false)}
        onSaved={({ type, brand, model }) => {
          setEquipmentTypes(current => [...current, type]);
          setEquipmentBrands(current => [...current, brand]);
          setEquipmentModels(current => [...current, model]);
          setForm(current => ({ ...current, equipment_type_id: type.id, equipment_brand_id: brand.id, equipment_model_id: model.id }));
        }}
      />}
      {quickCustomer && <QuickCustomerModal
        onClose={() => setQuickCustomer(false)}
        onSaved={selectCustomer}
      />}
      <OrderResolutionPage
        open={solveOpen}
        detail={detail}
        solveDraft={solveDraft}
        setSolveDraft={setSolveDraft}
        inventoryItems={inventoryItems}
        orderImages={orderImages}
        solutionImages={solutionImages}
        onAddSolutionImages={addSolutionImages}
        onRemoveSolutionImage={removeSolutionImage}
        saving={saving}
        onClose={() => setSolveOpen(false)}
        onViewImage={setViewImage}
        onSubmit={() => {
          const validationError = validateOrderResolution(solveDraft, inventoryItems);
          if (validationError) {
            setToast({ msg: validationError, type: "error" });
            return;
          }
          void saveOrderSolution(detail.id);
        }}
      />
      {viewImage && <OrderImageLightbox image={viewImage} onClose={() => setViewImage(null)} />}
      {partRequestOpen && detail && (
        <PartRequestModal orderNumber={detail.os_number} inventoryItems={partRequestInventory} inventoryLoading={partRequestInventoryLoading} inventoryError={partRequestInventoryError} selectedItems={selectedPartRequestItems} search={partRequestSearch} notes={partRequestNotes} purpose={partRequestPurpose} submitting={partRequestSubmitting} onPurposeChange={setPartRequestPurpose} onSearchChange={setPartRequestSearch} onNotesChange={setPartRequestNotes} onSelect={selectPartRequestItem} onQuantityChange={updatePartRequestQuantity} onRemove={removePartRequestItem} onClose={closePartRequestModal} onSubmit={() => void submitPartRequest(detail.id)} />
      )}
      {partApprovalOpen && selectedPartRequest && detail && <ReviewPartRequestModal request={selectedPartRequest} orderNumber={detail.os_number} rejection={false} approvalQuantities={approvalQuantities} notes={partReviewNotes} submitting={partReviewSubmitting} onNotesChange={setPartReviewNotes} onQuantityChange={updateApprovalQuantity} onClose={closePartReview} onSubmit={approvePartRequest} />}
      {partRejectionOpen && selectedPartRequest && detail && <ReviewPartRequestModal request={selectedPartRequest} orderNumber={detail.os_number} rejection={true} approvalQuantities={approvalQuantities} notes={partReviewNotes} submitting={partReviewSubmitting} onNotesChange={setPartReviewNotes} onQuantityChange={updateApprovalQuantity} onClose={closePartReview} onSubmit={rejectPartRequest} />}
      {deliveryOpen && selectedDeliveryRequest && <TestDeliveryModal request={selectedDeliveryRequest} orderNumber={detail?.os_number} submitting={deliverySubmitting} onClose={closeDeliveryRequest} onSubmit={() => void deliverTestRequest()} />}
      {testResultOpen && selectedTestRequest && <TestResultModal request={selectedTestRequest} rows={testResultRows} submitting={testResultSubmitting} getPendingQuantity={getTestPendingQuantity} onRowsChange={setTestResultRows} onClose={closeTestResult} onSubmit={() => void submitTestResults()} />}
    </div>
  );
}

