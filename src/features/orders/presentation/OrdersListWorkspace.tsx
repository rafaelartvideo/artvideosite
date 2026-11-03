import { useMemo } from "react";
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
import { AdminButton } from "@/shared/ui/admin/AdminLayout";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { LoadingState } from "@/shared/ui/admin/AdminFeedback";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

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

  const { statuses, situations, serviceTypes, serviceTypeSituations, profiles, isOrganizationOverride } = workspace;
  const {
    osNumberSearch, setOsNumberSearch, externalOsSearch, customerNameSearch, setCustomerNameSearch, documentSearch, setDocumentSearch,
    serialNumberSearch, setSerialNumberSearch, setFilterSituation, filterOrderType,
    selectedServiceTypeId, setSelectedServiceTypeId, selectedResponsibleIds, setSelectedResponsibleIds, selectedStatusIds, setSelectedStatusIds,
    selectedSituationIds, setSelectedSituationIds, selectedServiceTypeIds, setSelectedServiceTypeIds, orderSort, setOrderSort, selectedStates, setSelectedStates,
    selectedCities, setSelectedCities, cityFilterOptions, cityFiltersLoading, dateFrom, setDateFrom, dateTo, setDateTo,
    page, setPage, pageSize, setPageSize, invalidPeriod, filteredOrders, pagedOrders, totalItems, generalTotalItems, totalPages, safePage,
    clearFilters, loading: listLoading,
  } = filters;
  const {
    draggingId, dragOverSituationId, cancellingId, setDragOverSituationId, cancelOrder, updateOrderSituation,
    handleKanbanDrop, handleCardDragStart, handleCardDragEnd, shouldSuppressCardOpen, handleDragLeave,
  } = mutations;
  const { ibgeStates, ibgeStatesLoading } = serviceAddress;
  const queryClient = useQueryClient();
  const organizationId = workspace.organizationId;
  const unassignedKey = ["orders", "kanban", "unassigned", organizationId || "none"] as const;
  // Consulta independente da situação, filtros, atendimento e paginação do quadro.
  // O count é da organização inteira. Os cartões são carregados em lotes para
  // não repetir milhares de registros nem contornar RLS.
  const unassignedQuery = useInfiniteQuery({
    queryKey: unassignedKey,
    enabled: visible && displayMode === "kanban" && !compactSharedView && !workspace.isOrganizationOverride
      && Boolean(organizationId) && hasPermission("orders.kanban.view"),
    initialPageParam: 0,
    staleTime: 120_000,
    retry: false,
    queryFn: async ({ pageParam, signal }) => {
      const pageSize = 40;
      const { data, error, count } = await supabase.from("service_orders")
        .select("id,organization_id,os_number,service_type_id,situation_id,created_at,scheduled_at,completed_at,cancelled_at,is_solved,cannot_be_solved,order_status:order_statuses(id,name,color),customer:customers(id,full_name),service:services(id,title),general_service:general_services(id,name)", { count: pageParam === 0 ? "exact" : undefined })
        .eq("organization_id", organizationId!)
        .is("situation_id", null)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(pageParam * pageSize, (pageParam + 1) * pageSize - 1)
        .abortSignal(signal);
      if (error) throw error;
      return { items: data || [], total: count ?? 0 };
    },
    getNextPageParam: (lastPage, pages) => {
      const received = pages.reduce((sum, page) => sum + page.items.length, 0);
      return lastPage.items.length > 0 && received < (pages[0]?.total ?? 0) ? pages.length : undefined;
    },
  });
  const unassignedOrders = useMemo(
    () => unassignedQuery.data?.pages.flatMap(page => page.items) || [],
    [unassignedQuery.data],
  );
  const unassignedTotal = unassignedQuery.data?.pages[0]?.total ?? 0;
  const refreshUnassigned = () => void queryClient.invalidateQueries({ queryKey: unassignedKey });
  const sharedView = compactSharedView || isOrganizationOverride;
  const resolvedDisplayMode: "list" | "kanban" = sharedView ? "list" : displayMode;
  // A tabela depende apenas da consulta paginada. Os dados auxiliares (catálogos,
  // situações, funcionários) carregam em paralelo e não bloqueiam as OS já prontas.
  const loading = listLoading;
  const changeKanbanServiceType = (serviceTypeId: string) => {
    // O quadro tem um único atendimento ativo; situações incompatíveis são limpas.
    setFilterSituation("");
    setSelectedSituationIds([]);
    setSelectedServiceTypeId(serviceTypeId);
    setPage(1);
  };
  const hasActiveFilters = sharedView
    ? Boolean(osNumberSearch || documentSearch)
    : Boolean(osNumberSearch || externalOsSearch || customerNameSearch || documentSearch || serialNumberSearch || selectedResponsibleIds.length || selectedStatusIds.length || selectedSituationIds.length || filterOrderType || (resolvedDisplayMode === "list" ? selectedServiceTypeIds.length : selectedServiceTypeId) || selectedStates.length || selectedCities.length || dateFrom || dateTo);

  if (!visible) return null;

  return <>
    <OrdersHeader total={generalTotalItems} displayMode={resolvedDisplayMode} canCreate={canCreate} onDisplayModeChange={setViewMode} onCreate={openNew} showViewToggle={!sharedView} />

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
      customerNameSearch={customerNameSearch}
      documentSearch={documentSearch}
      serialNumberSearch={serialNumberSearch}
      responsibleIds={selectedResponsibleIds}
      statusIds={selectedStatusIds}
      situationIds={selectedSituationIds}
      serviceTypeIds={selectedServiceTypeIds}
      selectedStates={selectedStates}
      selectedCities={selectedCities}
      dateFrom={dateFrom}
      dateTo={dateTo}
      orderSort={orderSort}
      statuses={statuses}
      situations={resolvedDisplayMode === "kanban" && selectedServiceTypeId
        ? situations.filter(situation => serviceTypeSituations.some(link =>
          link.service_type_id === selectedServiceTypeId && link.situation_id === situation.id))
        : situations}
      serviceTypes={serviceTypes}
      showServiceTypeFilter={resolvedDisplayMode !== "kanban"}
      responsibles={profiles}
      stateOptions={ibgeStates}
      cityOptions={cityFilterOptions}
      statesLoading={ibgeStatesLoading}
      citiesLoading={cityFiltersLoading}
      invalidPeriod={invalidPeriod}
      onOsNumberSearchChange={(value) => { setOsNumberSearch(value); setPage(1); }}
      onCustomerNameSearchChange={(value) => { setCustomerNameSearch(value); setPage(1); }}
      onDocumentSearchChange={(value) => { setDocumentSearch(value); setPage(1); }}
      onSerialNumberSearchChange={(value) => { setSerialNumberSearch(value); setPage(1); }}
      onResponsibleChange={(value) => setSelectedResponsibleIds(current => current.includes(value) ? current.filter(id => id !== value) : [...current, value])}
      onStatusChange={(value) => setSelectedStatusIds(current => current.includes(value) ? current.filter(id => id !== value) : [...current, value])}
      onSituationChange={(value) => setSelectedSituationIds(current => current.includes(value) ? current.filter(id => id !== value) : [...current, value])}
      onServiceTypeChange={(value) => setSelectedServiceTypeIds(current => current.includes(value) ? current.filter(id => id !== value) : [...current, value])}
      onStateSelect={(value) => setSelectedStates(current => current.includes(value) ? current : [...current, value])}
      onStateRemove={(value) => setSelectedStates(current => current.filter(state => state !== value))}
      onStatesClear={() => setSelectedStates([])}
      onCitySelect={(value) => {
        const option = cityFilterOptions.find(city => `${city.state}:${city.name}` === value);
        if (option && !selectedCities.some(city => city.name === option.name && city.state === option.state)) setSelectedCities(current => [...current, option]);
      }}
      onCityRemove={(value) => setSelectedCities(current => current.filter(city => `${city.state}:${city.name}` !== value))}
      onCitiesClear={() => setSelectedCities([])}
      onDateFromChange={setDateFrom}
      onDateToChange={setDateTo}
      onOrderSortChange={(value) => { setOrderSort(value); setPage(1); }}
      onClear={() => {
        // O tipo é uma subseção do Kanban, não um filtro descartável.
        // Limpar a busca não deve desmontar o quadro selecionado.
        const activeType = selectedServiceTypeId;
        clearFilters();
        if (resolvedDisplayMode === "kanban") setSelectedServiceTypeId(activeType);
      }}
    />}

    {(filters.error || workspace.error) && <div role="alert"
      className="flex flex-col items-start justify-between gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm sm:flex-row sm:items-center">
      <div className="space-y-1">
        <p className="font-bold text-foreground">A conexão com os dados da OS está lenta ou indisponível.</p>
        <p className="text-xs text-muted-foreground">{systemErrorMessage(filters.error || workspace.error, "Não foi possível consultar as ordens de serviço.")} Os dados já carregados foram preservados.</p>
      </div>
      <AdminButton variant="tertiary" size="sm" onClick={() => {
        if (filters.error) filters.retryLoadOrders();
        if (workspace.error) workspace.retryLoadWorkspace();
      }}>Tentar novamente</AdminButton>
    </div>}

    {filters.error && !filteredOrders.length && !loading ? null : resolvedDisplayMode === "list" ? <OrdersTable
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
    /> : workspace.loading ? <LoadingState text="Preparando quadro de ordens" /> : <>
      <OrdersKanban
        filteredOrders={filteredOrders}
        unassignedOrders={unassignedOrders}
        unassignedTotal={unassignedTotal}
        unassignedLoading={unassignedQuery.isPending && unassignedQuery.isFetching}
        unassignedLoadingMore={unassignedQuery.isFetchingNextPage}
        unassignedHasMore={Boolean(unassignedQuery.hasNextPage)}
        unassignedError={Boolean(unassignedQuery.isError)}
        onLoadUnassignedMore={() => { void unassignedQuery.fetchNextPage(); }}
        onRefreshUnassigned={refreshUnassigned}
        situations={situations}
        serviceTypeSituations={serviceTypeSituations}
        serviceTypes={serviceTypes}
        selectedServiceTypeId={selectedServiceTypeId}
        onServiceTypeChange={changeKanbanServiceType}
        topPagination={<PaginationBar
          page={safePage}
          pageSize={pageSize}
          totalItems={totalItems}
          pageSizeOptions={[30, 50, 100]}
          defaultPageSize={30}
          pageSizeLabel="OS por página:"
          storageKey="union-kanban-page-size-v1"
          showFilteredTotal
          onPageChange={setPage}
          onPageSizeChange={nextPageSize => { setPageSize(nextPageSize); setPage(1); }}
        />}
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
      {selectedServiceTypeId && <PaginationBar
        page={safePage}
        pageSize={pageSize}
        totalItems={totalItems}
        pageSizeOptions={[30, 50, 100]}
        defaultPageSize={30}
        pageSizeLabel="OS por página:"
        storageKey="union-kanban-page-size-v1"
        onPageChange={setPage}
        onPageSizeChange={nextPageSize => { setPageSize(nextPageSize); setPage(1); }}
      />}
    </>}
  </>;
}