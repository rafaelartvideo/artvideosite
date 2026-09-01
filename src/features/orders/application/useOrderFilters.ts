import { useEffect, useRef, useState } from "react";
import {
  filterServiceOrders,
  sortServiceOrders,
} from "./order-list";
import { normalizeSearchText } from "./order-search";

export type CityFilterOption = { name: string; state: string };

type OrderType = "internal" | "external";
type StateOption = { sigla: string; nome: string };
type CityResponse = { nome: string };

export function useOrderFilters({
  orders,
  stateOptions,
  getStateLabel,
  getEquipmentSummary,
}: {
  orders: any[];
  stateOptions: StateOption[];
  getStateLabel: (value: string) => string;
  getEquipmentSummary: (order: any) => string;
}) {
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterSituation, setFilterSituation] = useState("");
  const [filterOrderType, setFilterOrderType] = useState<OrderType | "">("");
  const [selectedServiceTypeId, setSelectedServiceTypeId] = useState("");
  const [orderSort, setOrderSort] = useState<"" | "asc" | "desc">("");
  const [selectedStates, setSelectedStates] = useState<string[]>([]);
  const [selectedCities, setSelectedCities] = useState<CityFilterOption[]>([]);
  const [cityFilterOptions, setCityFilterOptions] = useState<CityFilterOption[]>([]);
  const [cityFiltersLoading, setCityFiltersLoading] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const cityCacheRef = useRef<Record<string, CityResponse[]>>({});
  const cityRequestRef = useRef(0);

  useEffect(() => {
    const loadCities = async () => {
      const requestId = ++cityRequestRef.current;
      if (selectedStates.length === 0) {
        setCityFilterOptions([]);
        setCityFiltersLoading(false);
        return;
      }

      setCityFiltersLoading(true);
      const citiesByState = await Promise.all(selectedStates.map(async state => {
        const uf = state.trim().toUpperCase();
        const cached = cityCacheRef.current[uf];
        if (cached) return cached.map(city => ({ name: city.nome, state: uf }));
        try {
          const response = await fetch(
            `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios?orderBy=nome`,
          );
          if (!response.ok) return [];
          const cities = await response.json() as CityResponse[];
          cityCacheRef.current[uf] = cities;
          return cities.map(city => ({ name: city.nome, state: uf }));
        } catch {
          return [];
        }
      }));

      if (requestId !== cityRequestRef.current) return;
      const uniqueCities = new Map<string, CityFilterOption>();
      citiesByState.flat().forEach(city => {
        uniqueCities.set(`${city.state}:${normalizeSearchText(city.name)}`, city);
      });
      setCityFilterOptions(
        Array.from(uniqueCities.values()).sort((left, right) =>
          left.state.localeCompare(right.state) || left.name.localeCompare(right.name),
        ),
      );
      setCityFiltersLoading(false);
    };

    void loadCities();
    return () => {
      cityRequestRef.current += 1;
    };
  }, [selectedStates]);

  useEffect(() => {
    setSelectedCities(current =>
      current.filter(city => selectedStates.includes(city.state)),
    );
  }, [selectedStates]);

  const invalidPeriod = Boolean(dateFrom && dateTo && dateFrom > dateTo);
  const filteredOrders = filterServiceOrders({
    orders,
    search,
    statusId: filterStatus,
    situationId: filterSituation,
    orderType: filterOrderType,
    serviceTypeId: selectedServiceTypeId,
    states: selectedStates,
    stateOptions,
    cities: selectedCities,
    dateFrom,
    dateTo,
    invalidPeriod,
    getStateLabel,
    getEquipmentSummary,
  });
  const sortedOrders = sortServiceOrders(filteredOrders, orderSort);
  const totalPages = Math.max(1, Math.ceil(sortedOrders.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedOrders = sortedOrders.slice(
    (safePage - 1) * pageSize,
    safePage * pageSize,
  );
  const orderLabel = orderSort === "asc"
    ? "OS crescente"
    : orderSort === "desc" ? "OS decrescente" : "Ordenar";

  const clearFilters = () => {
    setSearch("");
    setFilterStatus("");
    setFilterSituation("");
    setFilterOrderType("");
    setSelectedServiceTypeId("");
    setSelectedStates([]);
    setSelectedCities([]);
    setDateFrom("");
    setDateTo("");
  };

  useEffect(() => {
    setPage(1);
  }, [
    search,
    filterStatus,
    filterSituation,
    filterOrderType,
    selectedServiceTypeId,
    orderSort,
    selectedStates,
    selectedCities,
    dateFrom,
    dateTo,
  ]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  return {
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
    filteredOrders,
    pagedOrders,
    totalPages,
    safePage,
    orderLabel,
    clearFilters,
  };
}
