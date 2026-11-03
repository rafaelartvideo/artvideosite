import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/infrastructure/query/query-keys";
import {
  countServiceOrders,
  listOrderNeighborhoodOptions,
  type ExactOrderPage,
  type FilterNeighborhood,
} from "../infrastructure/orders-filtered-page.repository";
import { listServiceOrdersPageWithCustomerName } from "../infrastructure/orders-customer-name-filter.repository";

export type CityFilterOption = { name: string; state: string };
export type NeighborhoodFilterOption = FilterNeighborhood;

const normalizeLocationText = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("pt-BR");

type OrderType = "internal" | "external";
type StateOption = { sigla: string; nome: string };
type CityResponse = { nome: string };

function useDebouncedValue<T>(value: T, delay = 450) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timeout);
  }, [value, delay]);
  return debounced;
}

export function useOrderFilters({
  organizationId,
  stateOptions,
  matchOrderNumberOrExternal = false,
  enabled = true,
  kanbanMode = false,
}: {
  organizationId?: string | null;
  stateOptions: StateOption[];
  matchOrderNumberOrExternal?: boolean;
  enabled?: boolean;
  kanbanMode?: boolean;
}) {
  const queryClient = useQueryClient();
  const [osNumberSearch, setOsNumberSearch] = useState("");
  const [externalOsSearch, setExternalOsSearch] = useState("");
  const [customerNameSearch, setCustomerNameSearch] = useState("");
  const [documentSearch, setDocumentSearch] = useState("");
  const [serialNumberSearch, setSerialNumberSearch] = useState("");
  const [responsibleId, setResponsibleId] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterSituation, setFilterSituation] = useState("");
  const [filterOrderType, setFilterOrderType] = useState<OrderType | "">("");
  const [selectedServiceTypeId, setSelectedServiceTypeId] = useState("");
  const [selectedResponsibleIds, setSelectedResponsibleIds] = useState<string[]>([]);
  const [selectedStatusIds, setSelectedStatusIds] = useState<string[]>([]);
  const [selectedSituationIds, setSelectedSituationIds] = useState<string[]>([]);
  const [selectedServiceTypeIds, setSelectedServiceTypeIds] = useState<string[]>([]);
  const [orderSort, setOrderSort] = useState<"" | "asc" | "desc">("");
  const [selectedStates, setSelectedStates] = useState<string[]>([]);
  const [selectedCities, setSelectedCities] = useState<CityFilterOption[]>([]);
  const [selectedNeighborhoods, setSelectedNeighborhoods] = useState<NeighborhoodFilterOption[]>([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [listPageSize, setListPageSize] = useState(5);
  const [kanbanPageSize, setKanbanPageSize] = useState(30);
  // Quadro precisa mostrar mais que cinco cartões por página, sem consulta
  // ilimitada. Não altera a preferência de paginação da lista convencional.
  const pageSize = kanbanMode ? kanbanPageSize : listPageSize;
  const setPageSize = kanbanMode ? setKanbanPageSize : setListPageSize;
  const debouncedOsNumberSearch = useDebouncedValue(osNumberSearch);
  const debouncedExternalOsSearch = useDebouncedValue(externalOsSearch);
  const debouncedCustomerNameSearch = useDebouncedValue(customerNameSearch);
  const debouncedDocumentSearch = useDebouncedValue(documentSearch);
  const debouncedSerialNumberSearch = useDebouncedValue(serialNumberSearch);

  const selectedStateKey = [...selectedStates].sort().join(",");
  const citiesQuery = useQuery({
    queryKey: ["ibge", "cities", selectedStateKey],
    enabled: enabled && selectedStates.length > 0,
    staleTime: 24 * 60 * 60 * 1000,
    queryFn: async () => {
      const results = await Promise.all(selectedStates.map(async state => {
        const uf = state.trim().toUpperCase();
        const response = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${encodeURIComponent(uf)}/municipios?orderBy=nome`);
        if (!response.ok) return [] as CityFilterOption[];
        const cities = await response.json() as CityResponse[];
        return cities.map(city => ({ name: city.nome, state: uf }));
      }));
      return results.flat().sort((left, right) => left.state.localeCompare(right.state) || left.name.localeCompare(right.name, "pt-BR"));
    },
  });
  const cityFilterOptions = citiesQuery.data ?? [];

  useEffect(() => {
    setSelectedCities(current => current.filter(city => selectedStates.some(state => state.trim().toUpperCase() === city.state.trim().toUpperCase())));
  }, [selectedStates]);


  const neighborhoodOptionsQuery = useQuery({
    queryKey: ["orders", organizationId || "none", "neighborhood-options"],
    enabled: enabled && Boolean(organizationId),
    staleTime: 2 * 60_000,
    queryFn: () => listOrderNeighborhoodOptions(organizationId!),
  });

  const canonicalState = useCallback((value: string) => {
    const valueKey = normalizeLocationText(value);
    const state = stateOptions.find(option =>
      normalizeLocationText(option.sigla) === valueKey || normalizeLocationText(option.nome) === valueKey,
    );
    return state?.sigla.toUpperCase() || valueKey;
  }, [stateOptions]);

  const availableNeighborhoods = useMemo(() => (neighborhoodOptionsQuery.data ?? []).filter(option => {
    const stateMatches = selectedStates.length === 0
      || selectedStates.some(state => canonicalState(state) === canonicalState(option.state));
    const cityMatches = selectedCities.length === 0 || selectedCities.some(city =>
      canonicalState(city.state) === canonicalState(option.state)
      && normalizeLocationText(city.name) === normalizeLocationText(option.city)
    );
    return stateMatches && cityMatches;
  }), [neighborhoodOptionsQuery.data, selectedStates, selectedCities, canonicalState]);

  useEffect(() => {
    if (!neighborhoodOptionsQuery.data) return;
    const available = new Set(availableNeighborhoods.map(option =>
      [normalizeLocationText(option.name), normalizeLocationText(option.city), canonicalState(option.state)].join("|")));
    setSelectedNeighborhoods(current => current.filter(option => available.has(
      [normalizeLocationText(option.name), normalizeLocationText(option.city), canonicalState(option.state)].join("|"))));
  }, [availableNeighborhoods, neighborhoodOptionsQuery.data, canonicalState]);

  const invalidPeriod = Boolean(dateFrom && dateTo && dateFrom > dateTo);
  const stateNames = useMemo(() => selectedStates.map(state => {
    const normalizedState = state.trim().toUpperCase();
    return stateOptions.find(option => option.sigla.trim().toUpperCase() === normalizedState)?.nome || "";
  }), [selectedStates, stateOptions]);
  const queryFilters = useMemo(() => ({
    organizationId: organizationId || "none",
    page,
    pageSize,
    osNumberSearch: debouncedOsNumberSearch,
    externalOsSearch: debouncedExternalOsSearch,
    customerNameSearch: debouncedCustomerNameSearch,
    documentSearch: debouncedDocumentSearch,
    serialNumberSearch: debouncedSerialNumberSearch,
    responsibleIds: [...selectedResponsibleIds].sort(),
    statusIds: [...selectedStatusIds].sort(),
    situationIds: [...selectedSituationIds].sort(),
    orderType: filterOrderType,
    serviceTypeIds: kanbanMode ? (selectedServiceTypeId ? [selectedServiceTypeId] : []) : [...selectedServiceTypeIds].sort(),
    states: [...selectedStates].sort(),
    stateNames: [...stateNames].sort(),
    cities: selectedCities.map(city => `${city.state}:${city.name}`).sort(),
    neighborhoods: selectedNeighborhoods.map(item => `${item.state}:${item.city}:${item.name}`).sort(),
    dateFrom,
    dateTo,
    sort: orderSort,
    matchOrderNumberOrExternal,
  }), [organizationId, page, pageSize, debouncedOsNumberSearch, debouncedExternalOsSearch, debouncedCustomerNameSearch, debouncedDocumentSearch, debouncedSerialNumberSearch, selectedResponsibleIds, selectedStatusIds, selectedSituationIds, filterOrderType, selectedServiceTypeId, selectedServiceTypeIds, kanbanMode, selectedStates, stateNames, selectedCities, selectedNeighborhoods, dateFrom, dateTo, orderSort, matchOrderNumberOrExternal]);
  const listKey = queryKeys.orders.list(queryFilters);
  const hasActiveServerFilters = Boolean(
    debouncedOsNumberSearch
    || debouncedExternalOsSearch
    || debouncedCustomerNameSearch
    || debouncedDocumentSearch
    || debouncedSerialNumberSearch
    || selectedResponsibleIds.length
    || selectedStatusIds.length
    || selectedSituationIds.length
    || filterOrderType
    || (!kanbanMode && selectedServiceTypeIds.length)
    || (kanbanMode && selectedServiceTypeId)
    || selectedStates.length
    || selectedCities.length
    || selectedNeighborhoods.length
    || dateFrom
    || dateTo
  );

  const generalTotalQuery = useQuery({
    queryKey: queryKeys.orders.total(organizationId || "none"),
    enabled: enabled && Boolean(organizationId) && hasActiveServerFilters,
    staleTime: 30 * 60_000,
    queryFn: () => countServiceOrders(organizationId!),
  });

  const ordersQuery = useQuery({
    queryKey: listKey,
    enabled: enabled && Boolean(organizationId) && !invalidPeriod && (!kanbanMode || Boolean(selectedServiceTypeId)),
    placeholderData: keepPreviousData,
    retry: false,
    queryFn: async () => {
      const started = Date.now();
      try {
        return await listServiceOrdersPageWithCustomerName({
          organizationId: organizationId!,
          page,
          pageSize,
          osNumberSearch: debouncedOsNumberSearch,
          externalOsSearch: debouncedExternalOsSearch,
          customerNameSearch: debouncedCustomerNameSearch,
          documentSearch: debouncedDocumentSearch,
          serialNumberSearch: debouncedSerialNumberSearch,
          responsibleIds: selectedResponsibleIds,
          statusIds: selectedStatusIds,
          situationIds: selectedSituationIds,
          orderType: filterOrderType,
          serviceTypeIds: kanbanMode ? (selectedServiceTypeId ? [selectedServiceTypeId] : []) : selectedServiceTypeIds,
          states: selectedStates,
          stateNames,
          cities: selectedCities,
          neighborhoods: selectedNeighborhoods,
          dateFrom,
          dateTo,
          sort: orderSort,
          matchOrderNumberOrExternal,
        });
      } finally {
        const elapsed = Date.now() - started;
        if (elapsed >= 3000) console.warn("[PERF][OS] Lista lenta", { duration_ms: elapsed });
      }
    },
  });

  const orders = invalidPeriod || (kanbanMode && !selectedServiceTypeId) ? [] : ordersQuery.data?.items ?? [];
  const totalItems = invalidPeriod || (kanbanMode && !selectedServiceTypeId) ? 0 : ordersQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(page, totalPages);
  const setOrders: Dispatch<SetStateAction<any[]>> = useCallback(next => {
    queryClient.setQueryData<ExactOrderPage>(listKey, current => {
      if (!current) return current;
      const items = typeof next === "function" ? next(current.items) : next;
      return { ...current, items };
    });
  }, [queryClient, listKey]);
  const orderLabel = orderSort === "asc" ? "OS crescente" : orderSort === "desc" ? "OS decrescente" : "Ordenar";

  const clearFilters = () => {
    setOsNumberSearch("");
    setExternalOsSearch("");
    setCustomerNameSearch("");
    setDocumentSearch("");
    setSerialNumberSearch("");
    setResponsibleId("");
    setFilterStatus("");
    setFilterSituation("");
    setFilterOrderType("");
    setSelectedServiceTypeId("");
    setSelectedResponsibleIds([]);
    setSelectedStatusIds([]);
    setSelectedSituationIds([]);
    setSelectedServiceTypeIds([]);
    setOrderSort("");
    setSelectedStates([]);
    setSelectedCities([]);
    setSelectedNeighborhoods([]);
    setDateFrom("");
    setDateTo("");
    setPage(1);
  };

  useEffect(() => {
    setPage(1);
  }, [osNumberSearch, externalOsSearch, customerNameSearch, documentSearch, serialNumberSearch, responsibleId, filterStatus, filterSituation, selectedResponsibleIds, selectedStatusIds, selectedSituationIds, selectedServiceTypeIds, filterOrderType, selectedServiceTypeId, orderSort, selectedStates, selectedCities, selectedNeighborhoods, dateFrom, dateTo]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    setPage(1);
    setSelectedNeighborhoods([]);
  }, [organizationId, kanbanMode]);

  return {
    orders,
    setOrders,
    totalItems,
    generalTotalItems: hasActiveServerFilters ? (generalTotalQuery.data ?? totalItems) : totalItems,
    // Mantém as linhas em cache ao atualizar filtros/página, sem flash de loading.
    loading: enabled && Boolean(organizationId) && (!kanbanMode || Boolean(selectedServiceTypeId)) && ordersQuery.isPending && !ordersQuery.data,
    isFetching: ordersQuery.isFetching,
    error: ordersQuery.error,
    retryLoadOrders: () => void ordersQuery.refetch(),
    osNumberSearch,
    setOsNumberSearch,
    externalOsSearch,
    setExternalOsSearch,
    customerNameSearch,
    setCustomerNameSearch,
    documentSearch,
    setDocumentSearch,
    serialNumberSearch,
    setSerialNumberSearch,
    responsibleId,
    setResponsibleId,
    filterStatus,
    setFilterStatus,
    filterSituation,
    setFilterSituation,
    filterOrderType,
    setFilterOrderType,
    selectedServiceTypeId,
    setSelectedServiceTypeId,
    selectedResponsibleIds,
    setSelectedResponsibleIds,
    selectedStatusIds,
    setSelectedStatusIds,
    selectedSituationIds,
    setSelectedSituationIds,
    selectedServiceTypeIds,
    setSelectedServiceTypeIds,
    orderSort,
    setOrderSort,
    selectedStates,
    setSelectedStates,
    selectedCities,
    setSelectedCities,
    selectedNeighborhoods,
    setSelectedNeighborhoods,
    neighborhoodFilterOptions: availableNeighborhoods,
    neighborhoodsLoading: neighborhoodOptionsQuery.isPending && Boolean(organizationId),
    cityFilterOptions,
    cityFiltersLoading: selectedStates.length > 0 && citiesQuery.isFetching,
    dateFrom,
    setDateFrom,
    dateTo,
    setDateTo,
    page,
    setPage,
    pageSize,
    setPageSize,
    invalidPeriod,
    filteredOrders: orders,
    pagedOrders: orders,
    totalPages,
    safePage,
    orderLabel,
    clearFilters,
  };
}