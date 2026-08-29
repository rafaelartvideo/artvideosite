import { useState } from "react";
import {
  customerFormFromCustomer,
  emptyCustomerForm,
  type CustomerForm,
} from "@/app/admin/shared";
import { emptyAddress, type Address } from "@/lib/address";
import { searchOrderCustomers } from "../infrastructure/orders-customer.repository";

export function useOrderCustomerSelection({
  onCustomerSelected,
}: {
  onCustomerSelected: (customer: any, address: Address | null) => void;
}) {
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerResults, setCustomerResults] = useState<any[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<any>(null);
  const [editingCustomer, setEditingCustomer] = useState(false);
  const [customerDraft, setCustomerDraft] = useState<CustomerForm>({
    ...emptyCustomerForm,
  });
  const [customerAddressDraft, setCustomerAddressDraft] = useState<Address>({
    ...emptyAddress,
  });
  const [addressExpanded, setAddressExpanded] = useState(false);

  const searchCustomers = async (query: string) => {
    setCustomerSearch(query);
    if (query.length < 2) {
      setCustomerResults([]);
      return;
    }
    const { data } = await searchOrderCustomers(query);
    setCustomerResults(data || []);
  };

  const hydrateCustomer = (customer: any) => {
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
    setCustomerResults([]);
    return address as Address | null;
  };

  const selectCustomer = (customer: any) => {
    const address = hydrateCustomer(customer);
    onCustomerSelected(customer, address);
  };

  const clearCustomer = () => {
    setSelectedCustomer(null);
    setEditingCustomer(false);
    setAddressExpanded(false);
    setCustomerDraft({ ...emptyCustomerForm });
    setCustomerAddressDraft({ ...emptyAddress });
    setCustomerSearch("");
    setCustomerResults([]);
  };

  return {
    customerSearch,
    setCustomerSearch,
    customerResults,
    setCustomerResults,
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
