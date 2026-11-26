import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { customerFormFromCustomer, emptyCustomerForm, type CustomerForm } from "@/features/customers/domain/customer-form";
import { emptyAddress, type Address } from "@/lib/address";
import { useAuth } from "@/lib/auth";
import { getOrderCustomerById, searchOrderCustomers } from "../infrastructure/orders-customer.repository";

export function useOrderCustomerSelection(organizationIdOverride?: string | null) {
  const { activeOrganizationId } = useAuth();
  const organizationId = organizationIdOverride || activeOrganizationId;
  const [customerSearch, setCustomerSearch] = useState("");
  const [debouncedTerm, setDebouncedTerm] = useState("");
  const [selectingCustomer, setSelectingCustomer] = useState(false);
  const [customerSelectionError, setCustomerSelectionError] = useState(false);
  const selectionRequest = useRef<AbortController | null>(null);
  const cancelSearchSelection = useCallback(() => {
    selectionRequest.current?.abort();
    selectionRequest.current = null;
    setSelectingCustomer(false);
    setCustomerSelectionError(false);
  }, []);
  useEffect(() => {
    cancelSearchSelection();
    return () => { selectionRequest.current?.abort(); selectionRequest.current = null; };
  }, [organizationId, cancelSearchSelection]);
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [editingCustomer, setEditingCustomer] = useState(false);
  const [customerDraft, setCustomerDraft] = useState<CustomerForm>({
    ...emptyCustomerForm,
  });
  const [customerAddressDraft, setCustomerAddressDraft] = useState<Address>({
    ...emptyAddress,
  });
  const [addressExpanded, setAddressExpanded] = useState(false);

  const term = customerSearch.trim().replace(/\s+/g, " ");
  const canSearch = Boolean(organizationId && !selectedCustomer && term.length >= 2);
  useEffect(() => {
    if (!canSearch) {
      setDebouncedTerm("");
      return;
    }
    const timer = window.setTimeout(() => setDebouncedTerm(term), 450);
    return () => window.clearTimeout(timer);
  }, [canSearch, term]);

  // Observe the current input key immediately, even during debounce. An older
  // request can never publish into this key, including after clearing the input.
  const customerQuery = useQuery({
    queryKey: ["orders", "customer-search", organizationId, term],
    enabled: canSearch && debouncedTerm === term,
    queryFn: async ({ signal }) => {
      if (!organizationId || term.length < 2) return [];
      const { data, error } = await searchOrderCustomers(organizationId, term, signal);
      if (error) throw error;
      return data || [];
    },
    staleTime: 60_000,
    gcTime: 120_000,
    refetchOnReconnect: false,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const customerResults = canSearch ? customerQuery.data || [] : [];
  const customerSearchLoading = canSearch && (debouncedTerm !== term || customerQuery.isFetching || customerQuery.isPending);
  const customerSearchError = canSearch && !customerSearchLoading && customerQuery.isError;
  const searchCustomers = (query: string) => {
    cancelSearchSelection();
    setCustomerSearch(query);
  };
  const selectSearchCustomer = async (customerId: string, onSelect: (customer: any) => void) => {
    if (!organizationId || !canSearch) return;
    cancelSearchSelection();
    const controller = new AbortController();
    selectionRequest.current = controller;
    setSelectingCustomer(true);
    try {
      const { data, error } = await getOrderCustomerById(organizationId, customerId, controller.signal);
      if (controller.signal.aborted || selectionRequest.current !== controller) return;
      if (error || !data) throw error || new Error("Cliente não encontrado.");
      onSelect(data);
    } catch {
      if (!controller.signal.aborted && selectionRequest.current === controller) setCustomerSelectionError(true);
    } finally {
      if (selectionRequest.current === controller) {
        selectionRequest.current = null;
        setSelectingCustomer(false);
      }
    }
  };
  const retryCustomerSearch = () => {
    if (canSearch && debouncedTerm === term) void customerQuery.refetch();
  };

  const hydrateCustomer = (customer: any) => {
    cancelSearchSelection();
    const address = (customer?.addresses || []).find(
      (item: Address) => item.is_default,
    ) || customer?.addresses?.[0] || null;
    setSelectedCustomer(customer || null);
    setCustomerDraft(
      customer ? customerFormFromCustomer(customer) : { ...emptyCustomerForm },
    );
    setCustomerAddressDraft({ ...emptyAddress, ...(address || {}) });
    setEditingCustomer(false);
    setAddressExpanded(false);
    setCustomerSearch("");
    setDebouncedTerm("");
    return address as Address | null;
  };

  const selectCustomer = (customer: any) => {
    const address = hydrateCustomer(customer);
    return address;
  };

  const clearCustomer = () => {
    cancelSearchSelection();
    setSelectedCustomer(null);
    setEditingCustomer(false);
    setAddressExpanded(false);
    setCustomerDraft({ ...emptyCustomerForm });
    setCustomerAddressDraft({ ...emptyAddress });
    setCustomerSearch("");
    setDebouncedTerm("");
  };

  return {
    organizationId,
    customerSearch,
    setCustomerSearch,
    customerResults,
    customerSearchLoading,
    customerSearchError,
    selectingCustomer,
    customerSelectionError,
    selectSearchCustomer,
    cancelSearchSelection,
    retryCustomerSearch,
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
    selectCustomer,
    hydrateCustomer,
    clearCustomer,
  };
}
