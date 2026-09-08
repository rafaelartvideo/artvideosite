import { OrdersFilters } from "./OrdersFilters";
import { OrdersHeader } from "./OrdersHeader";
import { OrdersKanban } from "./OrdersKanban";
import { OrdersTable } from "./OrdersTable";
import { PartnerOrdersFilters } from "./PartnerOrdersFilters";
import { sortServiceOrders } from "../application/order-list";
import type { useOrderFilters } from "../application/useOrderFilters";
import type { useOrderListMutations } from "../application/useOrderListMutations";
import type { useOrdersWorkspace } from "../application/useOrdersWorkspace";
import type { useOrderServiceAddress } from "../application/useOrderServiceAddress";

type OrderType = "internal" | "external";
type PermissionCheck = (permission: string) => boolean;

type Props = {
  visible: boolean;
  displayMode: "list" | "kanban";
  workspace: ReturnType<typeof useOrdersWorkspace>;
  filters: ReturnType<typeof useOrderFilters>;
  mutations: ReturnType<typeof useOrderListMutations>;
  serviceAddress: ReturnType<typeof useOrderServiceAddress>;
  canCreate: boolean;
  hasPermission: PermissionCheck;
  onDisplayModeChange: (mode: "list" | "kanban") => void;
  onCreate: () => void;
  onOpenDetail: (order: any) => void;
  onOpenEdit: (order: any) => void;
  getSituations: (serviceTypeId: string, currentSituationId?: string, currentSituation?: any) => any[];
  formatDate: (value?: string | null, time?: boolean) => string;
  equipmentSummary: (order: any) => string;
  compactSharedView?: boolean;
};

const normalizeIdentifier = (value: unknown) => String(value ?? "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
const normalizeDigits = (value: unknown) => String(value ?? "").replace(/\D/g, "");

export function OrdersListWorkspace(props: Props) {
  const {
    visible, displayMode, workspace, filters, mutations, serviceAddress,
    canCreate, hasPermission, onDisplayModeChange: setViewMode, onCreate: openNew,
    onOpenDetail: openDetail, onOpenEdit: openEdit,
    getSituations: getSituationsForType, formatDate: fmtDate, equipmentSummary,
    compactSharedView = false,
  } = props;
  const {
    orders, statuses, situations, serviceTypes, loading, isOrganizationOverride,
  } = workspace;
  const {
    osNumberSearch, setOsNumberSearch, externalOsSearch, setExternalOsSearch,
    documentSearch, setDocumentSearch, filterStatus, setFilterStatus, filterSituation,
    setFilterSituation, filterOrderType, setFilterOrderType,
    selectedServiceTypeId, setSelectedServiceTypeId, orderSort, setOrderSort,
    selectedStates, setSelectedStates, selectedCities, setSelectedCities,
    cityFilterOptions, cityFiltersLoading, dateFrom, setDateFrom, dateTo,
    setDateTo, page, setPage, pageSize, setPageSize, invalidPeriod,
    filteredOrders: filtered, pagedOrders, totalPages, safePage, clearFilters,
  } = filters;
  const {
    draggingId, dragOverStatusId, setDragOverStatusId, updateOrderStatus,
    updateOrderSituation, handleKanbanDrop, handleCardDragStart,
    handleCardDragEnd, shouldSuppressCardOpen, handleDragLeave,
  } = mutations;
  const { ibgeStates, ibgeStatesLoading } = serviceAddress;
  const sharedView = compactSharedView || isOrganizationOverride;
  const resolvedDisplayMode: "list" | "kanban" = sharedView ? "list" : displayMode;

  const sharedFiltered = sharedView ? sortServiceOrders(orders.filter((order: any) => {
    const numberSearch = normalizeIdentifier(osNumberSearch);
    const document = normalizeDigits(documentSearch);
    const orderNumber = normalizeIdentifier(order.os_number);
    const externalNumber = normalizeIdentifier(order.external_os_number);
    const customer = order.customer || {};
    const customerDocuments = [customer.document, customer.cnpj].map(normalizeDigits);
    const matchesNumber = !numberSearch || orderNumber.includes(numberSearch) || externalNumber.includes(numberSearch);
    const matchesDocument = !document || customerDocuments.some(value => value.includes(document));
    return matchesNumber && matchesDocument;
  }), orderSort) : filtered;

  const sharedTotalPages = Math.max(1, Math.ceil(sharedFiltered.length / pageSize));
  const sharedSafePage = Math.min(page, sharedTotalPages);
  const sharedPaged = sharedFiltered.slice((sharedSafePage - 1) * pageSize, sharedSafePage * pageSize);
  const resolvedFiltered = sharedView ? sharedFiltered : filtered;
  const resolvedPaged = sharedView ? sharedPaged : pagedOrders;
  const resolvedTotalPages = sharedView ? sharedTotalPages : totalPages;
  const resolvedSafePage = sharedView ? sharedSafePage : safePage;

  if (!visible) return null;
  return <>
    <OrdersHeader
      total={resolvedFiltered.length}
      displayMode={resolvedDisplayMode}
      canCreate={canCreate}
      onDisplayModeChange={setViewMode}
      onCreate={openNew}
      showViewToggle={!sharedView}
    />

    {sharedView ? <PartnerOrdersFilters
      numberSearch={osNumberSearch}
      documentSearch={documentSearch}
      orderSort={orderSort}
      onNumberSearchChange={(value) => { setOsNumberSearch(value); setPage(1); }}
      onDocumentSearchChange={(value) => { setDocumentSearch(value); setPage(1); }}
      onOrderSortChange={(value) => { setOrderSort(value); setPage(1); }}
      onClear={() => {
        setOsNumberSearch("");
        setDocumentSearch("");
        setOrderSort("");
        setPage(1);
      }}
    /> : <OrdersFilters
      osNumberSearch={osNumberSearch}
      externalOsSearch={externalOsSearch}
      documentSearch={documentSearch}
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
      onOsNumberSearchChange={(value) => { setOsNumberSearch(value); setPage(1); }}
      onExternalOsSearchChange={(value) => { setExternalOsSearch(value); setPage(1); }}
      onDocumentSearchChange={(value) => { setDocumentSearch(value); setPage(1); }}
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
    />}

    {resolvedDisplayMode === "list" ? <OrdersTable
      loading={loading}
      filteredOrders={resolvedFiltered}
      pagedOrders={resolvedPaged}
      statuses={statuses}
      hasActiveFilters={sharedView
        ? Boolean(osNumberSearch || documentSearch || orderSort)
        : Boolean(osNumberSearch || externalOsSearch || documentSearch || filterStatus || filterSituation || filterOrderType || selectedServiceTypeId || orderSort || selectedStates.length || selectedCities.length || dateFrom || dateTo)}
      hasPermission={hasPermission}
      onOpen={openDetail}
      onStatusChange={updateOrderStatus}
      onSituationChange={updateOrderSituation}
      getSituations={getSituationsForType}
      onEdit={(order) => { void openEdit(order); }}
      formatDate={fmtDate}
      equipmentSummary={equipmentSummary}
      page={resolvedSafePage}
      pageSize={pageSize}
      totalPages={resolvedTotalPages}
      onPageChange={(nextPage) => setPage(Math.max(1, Math.min(nextPage, resolvedTotalPages)))}
      onPageSizeChange={(nextPageSize) => { setPageSize(nextPageSize); setPage(1); }}
    /> : <OrdersKanban
      statuses={statuses}
      filteredOrders={resolvedFiltered}
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
  </>;
}
