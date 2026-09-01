import { useState, useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { QuickEquipmentModal } from "@/features/orders/presentation/OrderQuickCreateModals";
import { QuickCustomerModal } from "@/features/orders/presentation/QuickCustomerModal";
import { OrdersListWorkspace } from "@/features/orders/presentation/OrdersListWorkspace";
import { OrderDetailsPage } from "@/features/orders/presentation/OrderDetailsPage";
import { OrderCustomerSection } from "@/features/orders/presentation/OrderCustomerSection";
import { OrderEquipmentSection } from "@/features/orders/presentation/OrderEquipmentSection";
import { OrderInformationSection } from "@/features/orders/presentation/OrderInformationSection";
import { OrderServiceLocationSection } from "@/features/orders/presentation/OrderServiceLocationSection";
import { OrderFormActions } from "@/features/orders/presentation/OrderFormActions";
import { OrderResolutionPage } from "@/features/orders/presentation/OrderResolutionPage";
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
  getOrderEditState,
  getOrderSubmissionStatus,
  removeServiceOrder,
} from "@/features/orders/application/order-management";
import {
  OrderImageLightbox,
  OrderImagesField,
  uploadOrderImage,
} from "@/features/orders/presentation/OrderImages";
import { useOrderImages } from "@/features/orders/application/useOrderImages";
import { useOrderPartRequests } from "@/features/orders/application/useOrderPartRequests";
import { useOrdersWorkspace } from "@/features/orders/application/useOrdersWorkspace";
import { useOrderFilters } from "@/features/orders/application/useOrderFilters";
import { useOrderListMutations } from "@/features/orders/application/useOrderListMutations";
import { useOrderCustomerSelection } from "@/features/orders/application/useOrderCustomerSelection";
import { useOrderServiceAddress } from "@/features/orders/application/useOrderServiceAddress";
import { useOrderResolution } from "@/features/orders/application/useOrderResolution";
import { useOrderDetails } from "@/features/orders/application/useOrderDetails";
import { useOrderFormState } from "@/features/orders/application/useOrderFormState";
import { useOrderCustomerPersistence } from "@/features/orders/application/useOrderCustomerPersistence";
import type { AdminTab } from "@/features/admin-shell/domain/admin.types";
import { Toast, ConfirmDialog } from "@/shared/ui/admin/AdminFeedback";
import { AdminPage } from "@/shared/ui/admin/AdminLayout";
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

  const {
    saveCustomer,
    saveCustomerBeforeOrder,
  } = useOrderCustomerPersistence({
    selectedCustomer,
    setSelectedCustomer,
    setEditingCustomer,
    customerDraft,
    customerAddressDraft,
    setAddressExpanded,
    setSaving,
    hasPermission,
    showToast: setToast,
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


  const openNew = () => {
    openNewForm();
    resetServiceAddressState();
    clearOrderImages();
    setViewImage(null);
    clearCustomer();
  };

  const openEdit = async (o: any) => {
    const { data: currentOrder, error: currentOrderError } = await getOrderEditState(o.id);
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
    const { status, error: statusError } = await getOrderSubmissionStatus({
      editingOrder: editingOS,
      statusId: form.status_id,
    });
    if (statusError || !status?.id) { setToast({ msg: "Não foi possível identificar um status válido para a OS.", type: "error" }); return; }
    setSaving(true);
    if (
      editingCustomer &&
      selectedCustomer?.id &&
      !(await saveCustomerBeforeOrder())
    ) return;
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

  const filters = useOrderFilters({
    orders,
    stateOptions: ibgeStates,
    getStateLabel: stateLabel,
    getEquipmentSummary: equipmentSummary,
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
        images={imagesController}
        partRequests={partRequests}
        resolution={resolutionController}
        mutations={listMutations}
        hasPermission={hasPermission}
        usedItemsTotal={detailUsedItemsTotal}
        formatDate={fmtDate}
        formatState={stateLabel}
        formatSolvedAt={formatSolvedAt}
        formatCurrency={formatCurrency}
        getSituations={getSituationsForType}
        getSla={getSlaForOrder}
        onEdit={(order) => { void openEdit(order); }}
        onDelete={setDeleteId}
      />

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
