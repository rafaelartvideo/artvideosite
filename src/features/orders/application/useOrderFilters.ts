import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/infrastructure/query/query-keys";
import { type ExactOrderPage } from "../infrastructure/orders-filtered-page.repository";
import { listServiceOrdersPageWithCustomerName } from "../infrastructure/orders-customer-name-filter.repository";

export type CityFilterOption = { name: string; state: string };

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
}: {
  organizationId?: string | null;
  stateOptions: StateOption[];
  matchOrderNumberOrExternal?: boolean;
}) {
  const queryClient = useQueryClient();
  const [osNumberSearch, setOsNumberSearch] = useState("");
  const [externalOsSearch, setExternalOsSearch] = useState("");
  const [customerNameSearch, setCustomerNameSearch] = useState("");
  const [documentSearch, setDocumentSearch] = useState("");
  const [serialNumberSearch, setSerialNumberSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterSituation, setFilterSituation] = useState("");
  const [filterOrderType, setFilterOrderType] = useState<OrderType | "">("");
  const [selectedServiceTypeId, setSelectedServiceTypeId] = useState("");
  const [orderSort, setOrderSort] = useState<"" | "asc" | "desc">("");
  const [selectedStates, setSelectedStates] = useState<string[]>([]);
  const [selectedCities, setSelectedCities] = useState<CityFilterOption[]>([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const debouncedOsNumberSearch = useDebouncedValue(osNumberSearch);
  const debouncedExternalOsSearch = useDebouncedValue(externalOsSearch);
  const debouncedCustomerNameSearch = useDebouncedValue(customerNameSearch);
  const debouncedDocumentSearch = useDebouncedValue(documentSearch);
  const debouncedSerialNumberSearch = useDebouncedValue(serialNumberSearch);

  const selectedStateKey = [...selectedStates].sort().join(",");
  const citiesQuery = useQuery({
    queryKey: ["ibge", "cities", selectedStateKey],
    enabled: selectedStates.length > 0,
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
    statusId: filterStatus,
    situationId: filterSituation,
    orderType: filterOrderType,
    serviceTypeId: selectedServiceTypeId,
    states: [...selectedStates].sort(),
    stateNames: [...stateNames].sort(),
    cities: selectedCities.map(city => `${city.state}:${city.name}`).sort(),
    dateFrom,
    dateTo,
    sort: orderSort,
    matchOrderNumberOrExternal,
  }), [organizationId, page, pageSize, debouncedOsNumberSearch, debouncedExternalOsSearch, debouncedCustomerNameSearch, debouncedDocumentSearch, debouncedSerialNumberSearch, filterStatus, filterSituation, filterOrderType, selectedServiceTypeId, selectedStates, stateNames, selectedCities, dateFrom, dateTo, orderSort, matchOrderNumberOrExternal]);
  const listKey = queryKeys.orders.list(queryFilters);

  const ordersQuery = useQuery({
    queryKey: listKey,
    enabled: Boolean(organizationId) && !invalidPeriod,
    placeholderData: keepPreviousData,
    queryFn: () => listServiceOrdersPageWithCustomerName({
      organizationId: organizationId!,
      page,
      pageSize,
      osNumberSearch: debouncedOsNumberSearch,
      externalOsSearch: debouncedExternalOsSearch,
      customerNameSearch: debouncedCustomerNameSearch,
      documentSearch: debouncedDocumentSearch,
      serialNumberSearch: debouncedSerialNumberSearch,
      statusId: filterStatus,
      situationId: filterSituation,
      orderType: filterOrderType,
      serviceTypeId: selectedServiceTypeId,
      states: selectedStates,
      stateNames,
      cities: selectedCities,
      dateFrom,
      dateTo,
      sort: orderSort,
      matchOrderNumberOrExternal,
    }),
  });

  const orders = invalidPeriod ? [] : ordersQuery.data?.items ?? [];
  const totalItems = invalidPeriod ? 0 : ordersQuery.data?.total ?? 0;
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
    setFilterStatus("");
    setFilterSituation("");
    setFilterOrderType("");
    setSelectedServiceTypeId("");
    setOrderSort("");
    setSelectedStates([]);
    setSelectedCities([]);
    setDateFrom("");
    setDateTo("");
    setPage(1);
  };

  useEffect(() => {
    setPage(1);
  }, [osNumberSearch, externalOsSearch, customerNameSearch, documentSearch, serialNumberSearch, filterStatus, filterSituation, filterOrderType, selectedServiceTypeId, orderSort, selectedStates, selectedCities, dateFrom, dateTo]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    setPage(1);
  }, [organizationId]);

  return {
    orders,
    setOrders,
    totalItems,
    loading: Boolean(organizationId) && (ordersQuery.isPending || ordersQuery.isPlaceholderData),
    isFetching: ordersQuery.isFetching,
    error: ordersQuery.error,
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