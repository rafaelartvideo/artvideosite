import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/infrastructure/query/query-keys";
import { listExactCustomersPage } from "../infrastructure/customers-filtered-page.repository";

type Options = {
  organizationId: string | null;
  onToast: (message: string, type: "success" | "error") => void;
};

type IbgeState = { sigla: string; nome: string };
type IbgeCity = { nome: string };

export type CustomerSort = "" | "asc" | "desc";

function useDebouncedValue<T>(value: T, delay = 450) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timeout);
  }, [value, delay]);
  return debounced;
}

export function useCustomersList({ organizationId, onToast }: Options) {
  const queryClient = useQueryClient();
  const [nameSearch, setNameSearch] = useState("");
  const [documentSearch, setDocumentSearch] = useState("");
  const [selectedStates, setSelectedStates] = useState<string[]>([]);
  const [selectedCities, setSelectedCities] = useState<string[]>([]);
  const [orderSort, setOrderSort] = useState<CustomerSort>("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const debouncedNameSearch = useDebouncedValue(nameSearch);
  const debouncedDocumentSearch = useDebouncedValue(documentSearch);

  const statesQuery = useQuery({
    queryKey: ["ibge", "states"],
    queryFn: async () => {
      const response = await fetch("https://servicodados.ibge.gov.br/api/v1/localidades/estados?orderBy=nome");
      if (!response.ok) throw new Error("Não foi possível carregar os estados.");
      return response.json() as Promise<IbgeState[]>;
    },
    staleTime: 24 * 60 * 60 * 1000,
  });

  const selectedStateKey = [...selectedStates].sort().join(",");
  const citiesQuery = useQuery({
    queryKey: ["ibge", "cities", selectedStateKey],
    enabled: selectedStates.length > 0,
    queryFn: async () => {
      const results = await Promise.all(selectedStates.map(async state => {
        const response = await fetch(`https://servicodados.ibge.gov.br/api/v1/localidades/estados/${encodeURIComponent(state)}/municipios?orderBy=nome`);
        if (!response.ok) return [] as Array<{ state: string; name: string }>;
        const cities = await response.json() as IbgeCity[];
        return cities.map(city => ({ state, name: city.nome }));
      }));
      return results.flat();
    },
    staleTime: 24 * 60 * 60 * 1000,
  });

  const queryFilters = useMemo(() => ({
    organizationId,
    page,
    pageSize,
    nameSearch: debouncedNameSearch,
    documentSearch: debouncedDocumentSearch,
    states: [...selectedStates].sort(),
    cities: [...selectedCities].sort(),
    sort: orderSort,
  }), [organizationId, page, pageSize, debouncedNameSearch, debouncedDocumentSearch, selectedStates, selectedCities, orderSort]);

  const query = useQuery({
    queryKey: [...queryKeys.customers.lists(), queryFilters],
    enabled: Boolean(organizationId),
    placeholderData: keepPreviousData,
    queryFn: () => listExactCustomersPage({
      organizationId: organizationId!,
      page,
      pageSize,
      nameSearch: debouncedNameSearch,
      documentSearch: debouncedDocumentSearch,
      states: selectedStates,
      cities: selectedCities,
      sort: orderSort,
    }),
  });

  const customers = query.data?.items ?? [];
  const totalItems = query.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(page, totalPages);

  useEffect(() => {
    if (!query.error) return;
    onToast(`Erro ao carregar clientes: ${query.error instanceof Error ? query.error.message : String(query.error)}`, "error");
  }, [query.error, onToast]);

  useEffect(() => {
    setNameSearch("");
    setDocumentSearch("");
    setSelectedStates([]);
    setSelectedCities([]);
    setOrderSort("");
    setPage(1);
  }, [organizationId]);

  useEffect(() => {
    setSelectedCities(current => current.filter(value => selectedStates.includes(value.split(":")[0])));
  }, [selectedStates]);

  useEffect(() => {
    setPage(1);
  }, [nameSearch, documentSearch, selectedStates, selectedCities, orderSort]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.customers.all });
  const stateOptions = useMemo(
    () => (statesQuery.data ?? []).map(state => ({ value: state.sigla, label: `${state.sigla} — ${state.nome}` })),
    [statesQuery.data],
  );
  const cityOptions = useMemo(
    () => (citiesQuery.data ?? []).map(city => ({ value: `${city.state}:${city.name}`, label: `${city.name} — ${city.state}` })),
    [citiesQuery.data],
  );
  const hasFilters = Boolean(nameSearch || documentSearch || selectedStates.length || selectedCities.length || orderSort);
  const clearFilters = () => {
    setNameSearch("");
    setDocumentSearch("");
    setSelectedStates([]);
    setSelectedCities([]);
    setOrderSort("");
    setPage(1);
  };

  return {
    customers,
    totalItems,
    loading: query.isPending,
    isFetching: query.isFetching,
    refetch: query.refetch,
    refresh,
    nameSearch,
    setNameSearch,
    documentSearch,
    setDocumentSearch,
    selectedStates,
    setSelectedStates,
    selectedCities,
    setSelectedCities,
    orderSort,
    setOrderSort,
    stateOptions,
    cityOptions,
    statesLoading: statesQuery.isPending,
    citiesLoading: selectedStates.length > 0 && citiesQuery.isFetching,
    hasFilters,
    clearFilters,
    page,
    setPage,
    pageSize,
    setPageSize,
    filtered: customers,
    totalPages,
    safePage,
    pagedCustomers: customers,
  };
}
