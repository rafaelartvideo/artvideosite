import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { queryKeys } from "@/infrastructure/query/query-keys";
import {
  createCustomer,
  createCustomerAddress,
  deleteCustomer,
  getCustomerHistory,
  listCustomers,
  saveCustomerAddress,
  updateCustomer,
} from "../infrastructure/customers.repository";
import { emptyAddress, type Address } from "@/lib/address";
import { isValidCpf } from "@/shared/domain/formatters";
import { ConfirmDialog, Toast } from "@/shared/ui/admin/AdminFeedback";
import {
  emptyCustomerForm,
  customerFormFromCustomer,
  customerPayload,
  customerUpdatePayload,
  validateCustomerForm,
  type CustomerForm,
} from "@/features/customers/domain/customer-form";
import { CustomersList } from "./CustomersList";
import { CustomerDetailsPage } from "./CustomerDetailsPage";
import { CreateCustomerPage } from "./CreateCustomerPage";

export function TabCustomers({ onOpenOrder }: { onOpenOrder?: (id: string) => void }) {
  const { hasPermission } = useAuth();
  const queryClient = useQueryClient();
  const customersQuery = useQuery({
    queryKey: queryKeys.customers.lists(),
    queryFn: listCustomers,
  });
  const customers = customersQuery.data ?? [];
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
    if (!customersQuery.error) return;
    const message = customersQuery.error instanceof Error
      ? customersQuery.error.message
      : String(customersQuery.error);
    setToast({ msg: `Erro ao carregar clientes: ${message}`, type: "error" });
  }, [customersQuery.error]);

  const refreshCustomers = () => queryClient.invalidateQueries({
    queryKey: queryKeys.customers.all,
  });

  const openDetail = async (c: any) => {
    setDetail(c);
    setEditForm(customerFormFromCustomer(c));
    setEditAddress({ ...emptyAddress, ...((c.addresses || []).find((address: Address) => address.is_default) || c.addresses?.[0] || {}) });
    setEditingCustomerData(false);
    setEditingCustomerAddress(false);
    setDetailLoading(true);
    try {
      const history = await getCustomerHistory(c.id);
      setDetailQuotes(history.quotes);
      setDetailOrders(history.orders);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setToast({ msg: `Erro ao carregar histórico do cliente: ${message}`, type: "error" });
      setDetailQuotes([]);
      setDetailOrders([]);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleSaveCustomerData = async () => {
    if (!hasPermission("customers.edit")) { setToast({ msg: "Você não possui permissão para editar clientes.", type: "error" }); return; }
    const validationError = validateCustomerForm(editForm);
    if (validationError) { setToast({ msg: validationError, type: "error" }); return; }
    setSavingCustomer(true);
    try {
      await updateCustomer(detail.id, customerUpdatePayload(editForm));
      setToast({ msg: "Dados do cliente atualizados.", type: "success" });
      setEditingCustomerData(false);
      setDetail({ ...detail, ...customerUpdatePayload(editForm) });
      await refreshCustomers();
    } catch (error) {
      setToast({ msg: `Erro ao salvar: ${error instanceof Error ? error.message : String(error)}`, type: "error" });
    } finally {
      setSavingCustomer(false);
    }
  };

  const handleSaveCustomerAddress = async () => {
    if (!hasPermission("customers.edit")) { setToast({ msg: "Você não possui permissão para editar clientes.", type: "error" }); return; }
    setSavingAddress(true);
    try {
      const addressPayload = { customer_id: detail.id, zip_code: editAddress.zip_code || null, street: editAddress.street || null, number: editAddress.number || null, complement: editAddress.complement || null, neighborhood: editAddress.neighborhood || null, city: editAddress.city || null, state: editAddress.state || null, is_default: true };
      const addressExists = (detail.addresses || []).find((address: Address) => address.is_default) || detail.addresses?.[0];
      const savedAddress = await saveCustomerAddress(addressPayload, addressExists?.id);
      setDetail({ ...detail, addresses: [savedAddress || editAddress] });
      setToast({ msg: "Endereço atualizado.", type: "success" });
      setEditingCustomerAddress(false);
      await refreshCustomers();
    } catch (error) {
      setToast({ msg: `Erro ao salvar endereço: ${error instanceof Error ? error.message : String(error)}`, type: "error" });
    } finally {
      setSavingAddress(false);
    }
  };

  const handleCreate = async () => {
    if (!hasPermission("customers.create")) { setToast({ msg: "Você não possui permissão para cadastrar clientes.", type: "error" }); return; }
    if (createForm.customerType === "PF" && !isValidCpf(createForm.document)) {
      setCpfError("CPF inválido. Verifique os números informados.");
      cpfInputRef.current?.focus();
      return;
    }
    const validationError = validateCustomerForm(createForm);
    if (validationError) { setToast({ msg: validationError, type: "error" }); return; }
    setSaving(true);
    let customer;
    try {
      customer = await createCustomer(customerPayload(createForm));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Cliente não criado.";
      setToast({ msg: `Erro ao cadastrar: ${message}`, type: "error" });
      setSaving(false);
      return;
    }
    const hasAddress = Object.values(createAddress).some(Boolean);
    if (hasAddress) {
      try {
        await createCustomerAddress({ customer_id: customer.id, zip_code: createAddress.zip_code || null, street: createAddress.street || null, number: createAddress.number || null, complement: createAddress.complement || null, neighborhood: createAddress.neighborhood || null, city: createAddress.city || null, state: createAddress.state || null, is_default: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setToast({ msg: `Cliente criado, mas erro no endereço: ${message}`, type: "error" });
        setSaving(false);
        await refreshCustomers();
        return;
      }
    }
    setToast({ msg: "Cliente cadastrado com sucesso!", type: "success" });
    setCreateOpen(false);
    setCreateForm({ ...emptyCustomerForm });
    setCreateAddress({ ...emptyAddress });
    setCpfError("");
    setSaving(false);
    await refreshCustomers();
  };

  const handleDeleteCustomer = async (id: string) => {
    if (!hasPermission("customers.delete")) return;
    try {
      await deleteCustomer(id);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setToast({ msg: `Não foi possível excluir o cliente: ${message}`, type: "error" });
      setDeleteId(null);
      return;
    }
    setToast({ msg: "Cliente excluído.", type: "success" });
    setDeleteId(null);
    setDetail(null);
    await refreshCustomers();
  };

  const normalizeDoc = (doc: string) => doc.replace(/\D/g, "");

  const lookupCreateCnpj = async (value: string, baseForm = createForm) => {
    const digits = value.replace(/\D/g, "");
    if (digits.length !== 14 || createForm.customerType !== "PJ") return;
    setCnpjLoading(true); setCnpjMessage("");
    try {
      const data = await fetchCnpjData(digits);
      const result = applyCnpjData(baseForm, createAddress, data);
      setCreateForm(result.form); setCreateAddress(result.address);
    } catch (error) {
      setCnpjMessage(error instanceof Error ? error.message : "Não foi possível consultar o CNPJ.");
    } finally { setCnpjLoading(false); }
  };

  const filtered = customers.filter(c => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (c.full_name || "").toLowerCase().includes(s) || (c.trade_name || "").toLowerCase().includes(s) || (c.legal_name || "").toLowerCase().includes(s) || (c.whatsapp || "").includes(search) || (c.email || "").toLowerCase().includes(s) || normalizeDoc(c.document || "").includes(normalizeDoc(search)) || normalizeDoc(c.cnpj || "").includes(normalizeDoc(search));
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedCustomers = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  useEffect(() => { setPage(1); }, [search]);
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  return (
    <div className="space-y-5">
      {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      {deleteId && <ConfirmDialog message="Excluir este cliente? Esta ação remove o registro principal e pode falhar se houver dependências existentes no schema." onConfirm={() => { void handleDeleteCustomer(deleteId); }} onCancel={() => setDeleteId(null)} />}

      <CustomersList
        customers={customers}
        filtered={filtered}
        pagedCustomers={pagedCustomers}
        loading={customersQuery.isPending}
        isFetching={customersQuery.isFetching}
        search={search}
        page={page}
        safePage={safePage}
        pageSize={pageSize}
        totalPages={totalPages}
        canCreate={hasPermission("customers.create")}
        canDelete={hasPermission("customers.delete")}
        onSearchChange={(value) => { setSearch(value); setPage(1); }}
        onPageChange={setPage}
        onPageSizeChange={(value) => { setPageSize(value); setPage(1); }}
        onCreate={() => { setCpfError(""); setCreateOpen(true); }}
        onRefresh={() => { void customersQuery.refetch(); }}
        onOpenDetail={(customer) => { void openDetail(customer); }}
        onDelete={setDeleteId}
      />
      <CustomerDetailsPage
        detail={detail}
        detailQuotes={detailQuotes}
        detailOrders={detailOrders}
        detailLoading={detailLoading}
        editForm={editForm}
        setEditForm={setEditForm}
        editAddress={editAddress}
        setEditAddress={setEditAddress}
        editingCustomerData={editingCustomerData}
        setEditingCustomerData={setEditingCustomerData}
        editingCustomerAddress={editingCustomerAddress}
        setEditingCustomerAddress={setEditingCustomerAddress}
        savingCustomer={savingCustomer}
        savingAddress={savingAddress}
        canEdit={hasPermission("customers.edit")}
        onSaveCustomer={() => { void handleSaveCustomerData(); }}
        onSaveAddress={() => { void handleSaveCustomerAddress(); }}
        onOpenOrder={onOpenOrder}
        onClose={() => setDetail(null)}
      />
      <CreateCustomerPage
        open={createOpen}
        form={createForm}
        setForm={setCreateForm}
        address={createAddress}
        setAddress={setCreateAddress}
        saving={saving}
        canCreate={hasPermission("customers.create")}
        cpfError={cpfError}
        setCpfError={setCpfError}
        cpfInputRef={cpfInputRef}
        cnpjLoading={cnpjLoading}
        cnpjMessage={cnpjMessage}
        setCnpjMessage={setCnpjMessage}
        onLookupCnpj={lookupCreateCnpj}
        onCreate={() => { void handleCreate(); }}
        onClose={() => { setCpfError(""); setCreateOpen(false); }}
      />
    </div>
  );
}

/* ─────────────────────────── TAB: EMPLOYEES ─────────────────────────── */
