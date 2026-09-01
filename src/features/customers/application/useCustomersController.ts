import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/infrastructure/query/query-keys";
import { emptyAddress, type Address } from "@/lib/address";
import { isValidCpf } from "@/shared/domain/formatters";
import {
  applyCnpjData,
  customerFormFromCustomer,
  customerPayload,
  customerUpdatePayload,
  emptyCustomerForm,
  validateCustomerForm,
  type CustomerForm,
} from "../domain/customer-form";
import {
  createCustomer,
  createCustomerAddress,
  deleteCustomer,
  fetchCnpjData,
  getCustomerHistory,
  listCustomers,
  saveCustomerAddress,
  updateCustomer,
} from "../infrastructure/customers.repository";

type Options = {
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
};

export function useCustomersController({ canCreate, canEdit, canDelete }: Options) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: queryKeys.customers.lists(), queryFn: listCustomers });
  const customers = query.data ?? [];
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [detail, setDetail] = useState<any>(null);
  const [detailQuotes, setDetailQuotes] = useState<any[]>([]);
  const [detailOrders, setDetailOrders] = useState<any[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [editingCustomerData, setEditingCustomerData] = useState(false);
  const [savingCustomer, setSavingCustomer] = useState(false);
  const [savingAddress, setSavingAddress] = useState(false);
  const [editingCustomerAddress, setEditingCustomerAddress] = useState(false);
  const [editForm, setEditForm] = useState<CustomerForm>({ ...emptyCustomerForm });
  const [editAddress, setEditAddress] = useState<Address>({ ...emptyAddress });
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CustomerForm>({ ...emptyCustomerForm });
  const [createAddress, setCreateAddress] = useState<Address>({ ...emptyAddress });
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);
  const [cnpjLoading, setCnpjLoading] = useState(false);
  const [cnpjMessage, setCnpjMessage] = useState("");
  const [cpfError, setCpfError] = useState("");
  const cpfInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!query.error) return;
    setToast({
      msg: `Erro ao carregar clientes: ${query.error instanceof Error ? query.error.message : String(query.error)}`,
      type: "error",
    });
  }, [query.error]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.customers.all });

  const openCreate = () => {
    setCpfError("");
    setCreateOpen(true);
  };

  const closeCreate = () => {
    setCpfError("");
    setCreateOpen(false);
  };

  const openDetail = async (customer: any) => {
    setDetail(customer);
    setEditForm(customerFormFromCustomer(customer));
    setEditAddress({
      ...emptyAddress,
      ...((customer.addresses || []).find((address: Address) => address.is_default) || customer.addresses?.[0] || {}),
    });
    setEditingCustomerData(false);
    setEditingCustomerAddress(false);
    setDetailLoading(true);
    try {
      const history = await getCustomerHistory(customer.id);
      setDetailQuotes(history.quotes);
      setDetailOrders(history.orders);
    } catch (error) {
      setToast({
        msg: `Erro ao carregar histórico do cliente: ${error instanceof Error ? error.message : String(error)}`,
        type: "error",
      });
      setDetailQuotes([]);
      setDetailOrders([]);
    } finally {
      setDetailLoading(false);
    }
  };

  const saveCustomer = async () => {
    if (!canEdit) {
      setToast({ msg: "Você não possui permissão para editar clientes.", type: "error" });
      return;
    }
    const validationError = validateCustomerForm(editForm);
    if (validationError) {
      setToast({ msg: validationError, type: "error" });
      return;
    }
    setSavingCustomer(true);
    try {
      const payload = customerUpdatePayload(editForm);
      await updateCustomer(detail.id, payload);
      setDetail({ ...detail, ...payload });
      setEditingCustomerData(false);
      setToast({ msg: "Dados do cliente atualizados.", type: "success" });
      await refresh();
    } catch (error) {
      setToast({ msg: `Erro ao salvar: ${error instanceof Error ? error.message : String(error)}`, type: "error" });
    } finally {
      setSavingCustomer(false);
    }
  };

  const saveAddress = async () => {
    if (!canEdit) {
      setToast({ msg: "Você não possui permissão para editar clientes.", type: "error" });
      return;
    }
    setSavingAddress(true);
    try {
      const payload = {
        customer_id: detail.id,
        zip_code: editAddress.zip_code || null,
        street: editAddress.street || null,
        number: editAddress.number || null,
        complement: editAddress.complement || null,
        neighborhood: editAddress.neighborhood || null,
        city: editAddress.city || null,
        state: editAddress.state || null,
        is_default: true,
      };
      const existingAddress = (detail.addresses || []).find((address: Address) => address.is_default) || detail.addresses?.[0];
      const savedAddress = await saveCustomerAddress(payload, existingAddress?.id);
      setDetail({ ...detail, addresses: [savedAddress || editAddress] });
      setEditingCustomerAddress(false);
      setToast({ msg: "Endereço atualizado.", type: "success" });
      await refresh();
    } catch (error) {
      setToast({ msg: `Erro ao salvar endereço: ${error instanceof Error ? error.message : String(error)}`, type: "error" });
    } finally {
      setSavingAddress(false);
    }
  };

  const create = async () => {
    if (!canCreate) {
      setToast({ msg: "Você não possui permissão para cadastrar clientes.", type: "error" });
      return;
    }
    if (createForm.customerType === "PF" && !isValidCpf(createForm.document)) {
      setCpfError("CPF inválido. Verifique os números informados.");
      cpfInputRef.current?.focus();
      return;
    }
    const validationError = validateCustomerForm(createForm);
    if (validationError) {
      setToast({ msg: validationError, type: "error" });
      return;
    }

    setSaving(true);
    let customer;
    try {
      customer = await createCustomer(customerPayload(createForm));
    } catch (error) {
      setToast({ msg: `Erro ao cadastrar: ${error instanceof Error ? error.message : "Cliente não criado."}`, type: "error" });
      setSaving(false);
      return;
    }

    if (Object.values(createAddress).some(Boolean)) {
      try {
        await createCustomerAddress({
          customer_id: customer.id,
          zip_code: createAddress.zip_code || null,
          street: createAddress.street || null,
          number: createAddress.number || null,
          complement: createAddress.complement || null,
          neighborhood: createAddress.neighborhood || null,
          city: createAddress.city || null,
          state: createAddress.state || null,
          is_default: true,
        });
      } catch (error) {
        setToast({
          msg: `Cliente criado, mas erro no endereço: ${error instanceof Error ? error.message : String(error)}`,
          type: "error",
        });
        setSaving(false);
        await refresh();
        return;
      }
    }

    setToast({ msg: "Cliente cadastrado com sucesso!", type: "success" });
    setCreateOpen(false);
    setCreateForm({ ...emptyCustomerForm });
    setCreateAddress({ ...emptyAddress });
    setCpfError("");
    setSaving(false);
    await refresh();
  };

  const remove = async (id: string) => {
    if (!canDelete) return;
    try {
      await deleteCustomer(id);
      setToast({ msg: "Cliente excluído.", type: "success" });
      setDetail(null);
      await refresh();
    } catch (error) {
      setToast({
        msg: `Não foi possível excluir o cliente: ${error instanceof Error ? error.message : String(error)}`,
        type: "error",
      });
    } finally {
      setDeleteId(null);
    }
  };

  const lookupCnpj = async (value: string, baseForm = createForm) => {
    const digits = value.replace(/\D/g, "");
    if (digits.length !== 14 || baseForm.customerType !== "PJ") return;
    setCnpjLoading(true);
    setCnpjMessage("");
    try {
      const data = await fetchCnpjData(digits);
      const result = applyCnpjData(baseForm, createAddress, data);
      setCreateForm(result.form);
      setCreateAddress(result.address);
    } catch (error) {
      setCnpjMessage(error instanceof Error ? error.message : "Não foi possível consultar o CNPJ.");
    } finally {
      setCnpjLoading(false);
    }
  };

  const normalizeDocument = (value: string) => value.replace(/\D/g, "");
  const filtered = customers.filter(customer => {
    if (!search) return true;
    const normalizedSearch = search.toLowerCase();
    return (customer.full_name || "").toLowerCase().includes(normalizedSearch)
      || (customer.trade_name || "").toLowerCase().includes(normalizedSearch)
      || (customer.legal_name || "").toLowerCase().includes(normalizedSearch)
      || (customer.whatsapp || "").includes(search)
      || (customer.email || "").toLowerCase().includes(normalizedSearch)
      || normalizeDocument(customer.document || "").includes(normalizeDocument(search))
      || normalizeDocument(customer.cnpj || "").includes(normalizeDocument(search));
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedCustomers = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  useEffect(() => setPage(1), [search]);
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  return {
    customers,
    loading: query.isPending,
    isFetching: query.isFetching,
    refetch: query.refetch,
    search,
    setSearch,
    page,
    setPage,
    pageSize,
    setPageSize,
    filtered,
    totalPages,
    safePage,
    pagedCustomers,
    detail,
    setDetail,
    detailQuotes,
    detailOrders,
    detailLoading,
    editingCustomerData,
    setEditingCustomerData,
    savingCustomer,
    editingCustomerAddress,
    setEditingCustomerAddress,
    savingAddress,
    editForm,
    setEditForm,
    editAddress,
    setEditAddress,
    createOpen,
    createForm,
    setCreateForm,
    createAddress,
    setCreateAddress,
    saving,
    deleteId,
    setDeleteId,
    toast,
    setToast,
    cnpjLoading,
    cnpjMessage,
    setCnpjMessage,
    cpfError,
    setCpfError,
    cpfInputRef,
    openCreate,
    closeCreate,
    openDetail,
    saveCustomer,
    saveAddress,
    create,
    remove,
    lookupCnpj,
  };
}

export type CustomersController = ReturnType<typeof useCustomersController>;
