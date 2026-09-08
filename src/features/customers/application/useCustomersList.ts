import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/infrastructure/query/query-keys";
import { listCustomers } from "../infrastructure/customers.repository";

type Options = {
  organizationId: string | null;
  onToast: (message: string, type: "success" | "error") => void;
};

export type CustomerSort = "" | "asc" | "desc";

const normalizeDocument = (value: string) => value.replace(/\D/g, "");
const normalizeText = (value: unknown) => String(value ?? "").trim().toLocaleLowerCase("pt-BR");

export function useCustomersList({ organizationId, onToast }: Options) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: [...queryKeys.customers.lists(), organizationId],
    enabled: Boolean(organizationId),
    queryFn: () => listCustomers(organizationId!),
  });
  const customers = query.data ?? [];
  const [nameSearch, setNameSearch] = useState("");
  const [documentSearch, setDocumentSearch] = useState("");
  const [selectedStates, setSelectedStates] = useState<string[]>([]);
  const [selectedCities, setSelectedCities] = useState<string[]>([]);
  const [orderSort, setOrderSort] = useState<CustomerSort>("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);

  useEffect(() => {
    if (!query.error) return;
    onToast(`Erro ao carregar clientes: ${query.error instanceof Error ? query.error.message : String(query.error)}`, "error");
  }, [query.error]);

  useEffect(() => {
    setNameSearch("");
    setDocumentSearch("");
    setSelectedStates([]);
    setSelectedCities([]);
    setOrderSort("");
    setPage(1);
  }, [organizationId]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.customers.all });

  const stateOptions = useMemo(() => {
    const states = new Set<string>();
    customers.forEach((customer: any) => (customer.addresses || []).forEach((address: any) => {
      const state = String(address?.state || "").trim().toUpperCase();
      if (state) states.add(state);
    }));
    return [...states].sort().map(state => ({ value: state, label: state }));
  }, [customers]);

  const cityOptions = useMemo(() => {
    const cities = new Map<string, { value: string; label: string }>();
    customers.forEach((customer: any) => (customer.addresses || []).forEach((address: any) => {
      const state = String(address?.state || "").trim().toUpperCase();
      const city = String(address?.city || "").trim();
      if (!city || !state || (selectedStates.length && !selectedStates.includes(state))) return;
      const value = `${state}:${city}`;
      cities.set(value, { value, label: `${city} — ${state}` });
    }));
    return [...cities.values()].sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }, [customers, selectedStates]);

  useEffect(() => {
    if (!selectedStates.length) return;
    setSelectedCities(current => current.filter(value => selectedStates.includes(value.split(":")[0])));
  }, [selectedStates]);

  const filtered = useMemo(() => {
    const result = customers.filter((customer: any) => {
      const nameNeedle = normalizeText(nameSearch);
      const matchName = !nameNeedle
        || normalizeText(customer.full_name).includes(nameNeedle)
        || normalizeText(customer.trade_name).includes(nameNeedle)
        || normalizeText(customer.legal_name).includes(nameNeedle);
      const documentNeedle = normalizeDocument(documentSearch);
      const matchDocument = !documentNeedle
        || normalizeDocument(customer.document || "").includes(documentNeedle)
        || normalizeDocument(customer.cnpj || "").includes(documentNeedle);
      const addresses = customer.addresses || [];
      const matchState = !selectedStates.length || addresses.some((address: any) => selectedStates.includes(String(address?.state || "").trim().toUpperCase()));
      const matchCity = !selectedCities.length || addresses.some((address: any) => selectedCities.includes(`${String(address?.state || "").trim().toUpperCase()}:${String(address?.city || "").trim()}`));
      return matchName && matchDocument && matchState && matchCity;
    });

    if (!orderSort) return result;
    return [...result].sort((a: any, b: any) => {
      const aName = String(a.trade_name || a.full_name || a.legal_name || "");
      const bName = String(b.trade_name || b.full_name || b.legal_name || "");
      const comparison = aName.localeCompare(bName, "pt-BR", { sensitivity: "base", numeric: true });
      return orderSort === "asc" ? comparison : -comparison;
    });
  }, [customers, nameSearch, documentSearch, selectedStates, selectedCities, orderSort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedCustomers = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);
  const hasFilters = Boolean(nameSearch || documentSearch || selectedStates.length || selectedCities.length || orderSort);
  const clearFilters = () => { setNameSearch(""); setDocumentSearch(""); setSelectedStates([]); setSelectedCities([]); setOrderSort(""); setPage(1); };

  useEffect(() => setPage(1), [nameSearch, documentSearch, selectedStates, selectedCities, orderSort]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  return {
    customers,
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
    hasFilters,
    clearFilters,
    page,
    setPage,
    pageSize,
    setPageSize,
    filtered,
    totalPages,
    safePage,
    pagedCustomers,
  };
}
