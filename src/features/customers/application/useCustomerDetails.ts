import { useEffect, useState } from "react";
import { emptyAddress, normalizeSharedMapUrl, type Address } from "@/lib/address";
import {
  customerFormFromCustomer,
  customerUpdatePayload,
  emptyCustomerForm,
  validateCustomerForm,
  type CustomerForm,
} from "../domain/customer-form";
import {
  getCustomerHistory,
  saveCustomerAddress,
  updateCustomer,
} from "../infrastructure/customers.repository";

type Options = {
  organizationId: string | null;
  canEdit: boolean;
  canEditAddress: boolean;
  onRefresh: () => Promise<unknown>;
  onToast: (message: string, type: "success" | "error") => void;
};

export function useCustomerDetails({ organizationId, canEdit, canEditAddress, onRefresh, onToast }: Options) {
  const [detail, setDetail] = useState<any>(null);
  const [quotes, setQuotes] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingData, setEditingData] = useState(false);
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [editingAddress, setEditingAddress] = useState(false);
  const [savingAddress, setSavingAddress] = useState(false);
  const [form, setForm] = useState<CustomerForm>({ ...emptyCustomerForm });
  const [address, setAddress] = useState<Address>({ ...emptyAddress });

  useEffect(() => {
    setDetail(null);
    setQuotes([]);
    setOrders([]);
    setLoading(false);
    setEditingData(false);
    setSavingCustomer(false);
    setEditingAddress(false);
    setSavingAddress(false);
    setForm({ ...emptyCustomerForm });
    setAddress({ ...emptyAddress });
  }, [organizationId]);

  const close = () => {
    setDetail(null);
    setQuotes([]);
    setOrders([]);
    setEditingData(false);
    setEditingAddress(false);
  };

  const open = async (customer: any) => {
    if (!organizationId) return;
    setDetail(customer);
    setForm(customerFormFromCustomer(customer));
    setAddress({
      ...emptyAddress,
      ...((customer.addresses || []).find((item: Address) => item.is_default) || customer.addresses?.[0] || {}),
    });
    setEditingData(false);
    setEditingAddress(false);
    setLoading(true);
    try {
      const history = await getCustomerHistory(organizationId, customer.id);
      setQuotes(history.quotes);
      setOrders(history.orders);
    } catch (error) {
      onToast(
        `Erro ao carregar histórico do cliente: ${error instanceof Error ? error.message : String(error)}`,
        "error",
      );
      setQuotes([]);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  const saveCustomer = async () => {
    if (!organizationId) {
      onToast("Selecione uma empresa ativa antes de editar o cliente.", "error");
      return;
    }
    if (!canEdit) {
      onToast("Você não possui permissão para editar clientes.", "error");
      return;
    }
    const validationError = validateCustomerForm(form);
    if (validationError) {
      onToast(validationError, "error");
      return;
    }
    setSavingCustomer(true);
    try {
      const payload = customerUpdatePayload(form);
      await updateCustomer(organizationId, detail.id, payload);
      setDetail({ ...detail, ...payload });
      setEditingData(false);
      onToast("Dados do cliente atualizados.", "success");
      await onRefresh();
    } catch (error) {
      onToast(`Erro ao salvar: ${error instanceof Error ? error.message : String(error)}`, "error");
    } finally {
      setSavingCustomer(false);
    }
  };

  const saveAddress = async () => {
    if (!organizationId) {
      onToast("Selecione uma empresa ativa antes de editar o endereço.", "error");
      return;
    }
    if (!canEditAddress) {
      onToast("Você não possui permissão para editar endereços de clientes.", "error");
      return;
    }
    setSavingAddress(true);
    try {
      const payload = {
        customer_id: detail.id,
        zip_code: address.zip_code || null,
        street: address.street || null,
        number: address.number || null,
        complement: address.complement || null,
        neighborhood: address.neighborhood || null,
        city: address.city || null,
        state: address.state || null,
        shared_map_url: normalizeSharedMapUrl(address.shared_map_url) || null,
        is_default: true,
      };
      const existing = (detail.addresses || []).find((item: Address) => item.is_default) || detail.addresses?.[0];
      const saved = await saveCustomerAddress(organizationId, payload, existing?.id);
      setDetail({ ...detail, addresses: [saved || address] });
      setEditingAddress(false);
      onToast("Endereço atualizado.", "success");
      await onRefresh();
    } catch (error) {
      onToast(
        `Erro ao salvar endereço: ${error instanceof Error ? error.message : String(error)}`,
        "error",
      );
    } finally {
      setSavingAddress(false);
    }
  };

  return {
    detail,
    setDetail,
    quotes,
    orders,
    loading,
    editingData,
    setEditingData,
    savingCustomer,
    editingAddress,
    setEditingAddress,
    savingAddress,
    form,
    setForm,
    address,
    setAddress,
    open,
    close,
    saveCustomer,
    saveAddress,
  };
}
