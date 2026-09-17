import { OrdersFilters } from "./OrdersFilters";
import { OrdersHeader } from "./OrdersHeader";
import { OrdersKanban } from "./OrdersKanban";
import { OrdersTable } from "./OrdersTable";
import { PartnerOrdersFilters } from "./PartnerOrdersFilters";
import type { useOrderFilters } from "../application/useOrderFilters";
import type { useOrderListMutations } from "../application/useOrderListMutations";
import type { useOrdersWorkspace } from "../application/useOrdersWorkspace";
import type { useOrderServiceAddress } from "../application/useOrderServiceAddress";
import { PaginationBar } from "@/shared/ui/admin/AdminPagination";

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
  onComplete: (order: any) => void;
  getSituations: (serviceTypeId: string, currentSituationId?: string, currentSituation?: any) => any[];
  formatDate: (value?: string | null, time?: boolean) => string;
  equipmentSummary: (order: any) => string;
  compactSharedView?: boolean;
};

export function OrdersListWorkspace(props: Props) {
  const {
    visible, displayMode, workspace, filters, mutations, serviceAddress, canCreate, hasPermission,
    onDisplayModeChange: setViewMode, onCreate: openNew, onOpenDetail: openDetail, onOpenEdit: openEdit, onComplete: completeOrder,
    getSituations: getSituationsForType, formatDate: fmtDate, equipmentSummary, compactSharedView = false,
  } = props;

  const { statuses, situations, serviceTypes, isOrganizationOverride } = workspace;
  const {
    osNumberSearch, setOsNumberSearch, externalOsSearch, documentSearch, setDocumentSearch, serialNumberSearch, setSerialNumberSearch,
    filterStatus, setFilterStatus, filterSituation, setFilterSituation, filterOrderType, setFilterOrderType,
    selectedServiceTypeId, setSelectedServiceTypeId, orderSort, setOrderSort, selectedStates, setSelectedStates,
    selectedCities, setSelectedCities, cityFilterOptions, cityFiltersLoading, dateFrom, setDateFrom, dateTo, setDateTo,
    page, setPage, pageSize, setPageSize, invalidPeriod, filteredOrders, pagedOrders, totalItems, totalPages, safePage,
    clearFilters, loading: listLoading,
  } = filters;
  const {
    draggingId, dragOverSituationId, cancellingId, setDragOverSituationId, cancelOrder, updateOrderSituation,
    handleKanbanDrop, handleCardDragStart, handleCardDragEnd, shouldSuppressCardOpen, handleDragLeave,
  } = mutations;
  const { ibgeStates, ibgeStatesLoading } = serviceAddress;
  const sharedView = compactSharedView || isOrganizationOverride;
  const resolvedDisplayMode: "list" | "kanban" = sharedView ? "list" : displayMode;
  const loading = workspace.loading || listLoading;
  const hasActiveFilters = sharedView
    ? Boolean(osNumberSearch || documentSearch)
    : Boolean(osNumberSearch || externalOsSearch || documentSearch || serialNumberSearch || filterStatus || filterSituation || filterOrderType || selectedServiceTypeId || selectedStates.length || selectedCities.length || dateFrom || dateTo);

  if (!visible) return null;

  return <>
    <OrdersHeader total={totalItems} hasActiveFilters={hasActiveFilters} displayMode={resolvedDisplayMode} canCreate={canCreate} onDisplayModeChange={setViewMode} onCreate={openNew} showViewToggle={!sharedView} />

    {sharedView ? <PartnerOrdersFilters
      numberSearch={osNumberSearch}
      documentSearch={documentSearch}
      orderSort={orderSort}
      onNumberSearchChange={(value) => { setOsNumberSearch(value); setPage(1); }}
      onDocumentSearchChange={(value) => { setDocumentSearch(value); setPage(1); }}
      onOrderSortChange={(value) => { setOrderSort(value); setPage(1); }}
      onClear={() => { setOsNumberSearch(""); setDocumentSearch(""); setOrderSort(""); setPage(1); }}
    /> : <OrdersFilters
      osNumberSearch={osNumberSearch}
      documentSearch={documentSearch}
      serialNumberSearch={serialNumberSearch}
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
      onDocumentSearchChange={(value) => { setDocumentSearch(value); setPage(1); }}
      onSerialNumberSearchChange={(value) => { setSerialNumberSearch(value); setPage(1); }}
      onStatusChange={(value) => { setFilterStatus(value); setPage(1); }}
      onSituationChange={(value) => { setFilterSituation(value); setPage(1); }}
      onOrderTypeChange={(value) => { setFilterOrderType(value as OrderType | ""); setPage(1); }}
      onServiceTypeChange={(value) => { setSelectedServiceTypeId(value); setPage(1); }}
      onStateSelect={(value) => setSelectedStates(current => current.includes(value) ? current : [...current, value])}
      onStateRemove={(value) => setSelectedStates(current => current.filter(state => state !== value))}
      onStatesClear={() => setSelectedStates([])}
      onCitySelect={(value) => {
        const option = cityFilterOptions.find(city => `${city.state}:${city.name}` === value);
        if (option && !selectedCities.some(city => city.name === option.name && city.state === option.state)) setSelectedCities(current => [...current, option]);
      }}
      onCityRemove={(value) => setSelectedCities(current => current.filter(city => `${city.state}:${city.name}` !== value))}
      onDateFromChange={setDateFrom}
      onDateToChange={setDateTo}
      onOrderSortChange={(value) => { setOrderSort(value); setPage(1); }}
      onClear={clearFilters}
    />}

    {resolvedDisplayMode === "list" ? <OrdersTable
      loading={loading}
      filteredOrders={filteredOrders}
      pagedOrders={pagedOrders}
      totalItems={totalItems}
      hasActiveFilters={hasActiveFilters}
      hasPermission={hasPermission}
      onOpen={openDetail}
      onSituationChange={updateOrderSituation}
      getSituations={getSituationsForType}
      onEdit={(order) => { void openEdit(order); }}
      onComplete={completeOrder}
      formatDate={fmtDate}
      equipmentSummary={equipmentSummary}
      page={safePage}
      pageSize={pageSize}
      totalPages={totalPages}
      onPageChange={(nextPage) => setPage(Math.max(1, Math.min(nextPage, totalPages)))}
      onPageSizeChange={(nextPageSize) => { setPageSize(nextPageSize); setPage(1); }}
    /> : <>
      <OrdersKanban
        filteredOrders={filteredOrders}
        situations={situations}
        draggingId={draggingId}
        dragOverSituationId={dragOverSituationId}
        hasPermission={hasPermission}
        onDragOver={setDragOverSituationId}
        onDragLeave={handleDragLeave}
        onDrop={(situationId) => { void handleKanbanDrop(situationId); }}
        onCardDragStart={handleCardDragStart}
        onCardDragEnd={handleCardDragEnd}
        onOpen={(order) => { if (!shouldSuppressCardOpen()) openDetail(order); }}
        onSituationChange={(order, situationId) => { void updateOrderSituation(order, situationId); }}
        onEdit={(order) => { void openEdit(order); }}
        onCancel={cancelOrder}
        cancellingId={cancellingId}
        formatDate={fmtDate}
      />
      <PaginationBar page={safePage} pageSize={pageSize} totalItems={totalItems} onPageChange={setPage} onPageSizeChange={(nextPageSize) => { setPageSize(nextPageSize); setPage(1); }} />
    </>}
  </>;
}
