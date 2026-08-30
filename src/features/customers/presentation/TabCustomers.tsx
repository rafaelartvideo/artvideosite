import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Edit2, Plus, RefreshCw, Search, Trash2, Users } from "lucide-react";
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
import { AddressFields } from "@/app/components/AddressFields";
import { emptyAddress, type Address } from "@/lib/address";
import {
  AdminPage,
  BtnPrimary,
  BtnSecondary,
  cn,
  ConfirmDialog,
  CustomerTypeToggle,
  EmptyState,
  emptyCustomerForm,
  FInput,
  formatCnpj,
  formatCpf,
  formatDateOnly,
  formatFoundationDate,
  formatPhone,
  INPUT,
  isValidCpf,
  LoadingState,
  PageHeader,
  PaginationBar,
  Section,
  StatusBadge,
  Toast,
  todayDateOnly,
  customerFormFromCustomer,
  customerPayload,
  customerUpdatePayload,
  validateCustomerForm,
  type CustomerForm,
} from "@/app/admin/shared";

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

  const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" }) : "—";

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

      <PageHeader title="Clientes" subtitle={`${customers.length} cliente${customers.length !== 1 ? "s" : ""} cadastrado${customers.length !== 1 ? "s" : ""}`} actions={
        <div className="flex gap-2">
          {hasPermission("customers.create") && <button onClick={() => { setCpfError(""); setCreateOpen(true); }} className="flex items-center gap-1.5 text-xs text-white font-bold bg-[#0057e7] px-3 py-2 rounded-lg hover:bg-[#0046c0] transition-colors"><Plus size={13} /> Cadastrar Cliente</button>}
          <button onClick={() => void customersQuery.refetch()} disabled={customersQuery.isFetching} className="flex items-center gap-1.5 text-xs text-[#0057e7] font-bold border border-[#0057e7]/30 px-3 py-2 rounded-lg hover:bg-[#0057e7]/5 transition-colors disabled:opacity-60">
            <RefreshCw size={13} className={customersQuery.isFetching ? "animate-spin" : ""} /> Atualizar
          </button>
        </div>
      } />
      <div className="bg-white rounded-xl border border-[#0d1b2e]/8 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-[#0d1b2e]/8">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5a6a82]" />
            <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Buscar por nome, documento, WhatsApp ou e-mail..." className={cn(INPUT, "pl-9 py-2 text-xs")} />
          </div>
        </div>
        {customersQuery.isPending ? <LoadingState /> : filtered.length === 0 ? (
          <EmptyState icon={Users} title="Nenhum cliente cadastrado" message="Os clientes aparecem aqui ao enviar um orçamento." onAdd={hasPermission("customers.create") ? () => { setCpfError(""); setCreateOpen(true); } : undefined} addLabel="Cadastrar Cliente" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[700px]">
              <thead className="bg-[#f8fafc] text-[#5a6a82] text-[10px] uppercase font-bold border-b border-[#0d1b2e]/8">
                <tr>
                  <th className="px-4 py-3 text-left">Nome</th>
                  <th className="px-4 py-3 text-left">Tipo / documento</th>
                  <th className="px-4 py-3 text-left">WhatsApp</th>
                  <th className="px-4 py-3 text-left">E-mail</th>
                  <th className="px-4 py-3 text-left">Cadastrado em</th>
                  <th className="px-4 py-3 text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#0d1b2e]/5">
                {pagedCustomers.map(c => (
                  <tr key={c.id} onClick={() => openDetail(c)} className="hover:bg-[#f8fafc]/80 cursor-pointer">
                    <td className="px-4 py-3.5 font-bold text-[#0d1b2e]">{c.full_name}</td>
                    <td className="px-4 py-3.5 text-xs font-mono text-[#5a6a82]"><span className="font-bold text-[#0057e7]">{c.customer_type === "PJ" ? "PJ" : "PF"}</span> · {c.customer_type === "PJ" ? (c.cnpj ? formatCnpj(c.cnpj) : "—") : (c.document ? formatCpf(c.document) : "—")}</td>
                    <td className="px-4 py-3.5 text-xs text-[#5a6a82]">{formatPhone(c.whatsapp) || "—"}</td>
                    <td className="px-4 py-3.5 text-xs text-[#5a6a82] truncate max-w-[160px]">{c.email || "—"}</td>
                    <td className="px-4 py-3.5 text-xs text-[#5a6a82]">{fmtDate(c.created_at)}</td>
                    <td className="px-4 py-3.5" onClick={(event) => event.stopPropagation()}>
                      <div className="flex items-center justify-end gap-2">
                        <button onClick={() => openDetail(c)} className="flex items-center gap-1 text-xs font-bold text-[#0057e7] hover:underline ml-auto">Ver detalhes</button>
                        {hasPermission("customers.delete") && (
                          <button type="button" onClick={() => setDeleteId(c.id)} title="Excluir cliente" aria-label="Excluir cliente" className="p-1.5 text-[#5a6a82] hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={14} /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <PaginationBar
          page={safePage}
          pageSize={pageSize}
          totalItems={filtered.length}
          onPageChange={(nextPage) => setPage(Math.max(1, Math.min(nextPage, totalPages)))}
          onPageSizeChange={(nextPageSize) => { setPageSize(nextPageSize); setPage(1); }}
        />
      </div>

      {/* Customer Detail Drawer */}
      {detail && (
        <AdminPage open={true} onClose={() => setDetail(null)} breadcrumb="Clientes" title={detail.full_name} subtitle={detail.customer_type === "PJ" ? (detail.cnpj ? formatCnpj(detail.cnpj) : "Pessoa Jurídica") : (detail.document ? formatCpf(detail.document) : "Pessoa Física")} maxW="max-w-2xl">
          <div className="p-5 space-y-5">
            {/* Customer info */}
            <Section title="Informações do cliente">
              {editingCustomerData ? (
                <div className="space-y-3">
                  <div className="grid sm:grid-cols-2 gap-3">
                    <CustomerTypeToggle value={editForm.customerType} disabled onChange={customerType => setEditForm({ ...editForm, customerType })} />
                    {editForm.customerType === "PF" ? <>
                    <FInput label="Nome completo" value={editForm.full_name} required onChange={(e: any) => setEditForm({ ...editForm, full_name: e.target.value })} />
                    <FInput label="CPF" value={editForm.document} disabled />
                    <div><FInput label="Data de nascimento" type="date" required value={editForm.birth_date} max={todayDateOnly()} onChange={(e: any) => setEditForm({ ...editForm, birth_date: e.target.value })} />{!editForm.birth_date && <p className="mt-1 text-xs text-red-600">Informe a data de nascimento.</p>}{editForm.birth_date > todayDateOnly() && <p className="mt-1 text-xs text-red-600">A data não pode ser futura.</p>}</div>
                    </> : <>
                    <FInput label="Nome fantasia" value={editForm.trade_name} required onChange={(e: any) => setEditForm({ ...editForm, trade_name: e.target.value })} />
                    <FInput label="CNPJ" value={editForm.cnpj} required disabled placeholder="00.000.000/0000-00" />
                    <FInput label="Razão social" value={editForm.legal_name} onChange={(e: any) => setEditForm({ ...editForm, legal_name: e.target.value })} />
                    <FInput label="Inscrição estadual" value={editForm.state_registration} hint="Deixe em branco se não for contribuinte · ISENTO se isento" onChange={(e: any) => setEditForm({ ...editForm, state_registration: e.target.value })} />
                    <FInput label="Fundação" value={editForm.foundation_date} placeholder="dd/mm/aaaa" maxLength={10} onChange={(e: any) => setEditForm({ ...editForm, foundation_date: formatFoundationDate(e.target.value) })} />
                    </>}
                    <FInput label="WhatsApp" value={editForm.whatsapp} onChange={(e: any) => setEditForm({ ...editForm, whatsapp: formatPhone(e.target.value) })} />
                    <FInput label="Telefone" value={editForm.phone} onChange={(e: any) => setEditForm({ ...editForm, phone: formatPhone(e.target.value) })} />
                    <div className="sm:col-span-2"><FInput label="E-mail" type="email" value={editForm.email} onChange={(e: any) => setEditForm({ ...editForm, email: e.target.value })} /></div>
                  </div>
                  <div className="flex gap-2 pt-1">
                    {hasPermission("customers.edit") && <BtnPrimary onClick={() => void handleSaveCustomerData()} disabled={savingCustomer}>{savingCustomer ? "Salvando..." : "Salvar alterações"}</BtnPrimary>}
                    <BtnSecondary onClick={() => { setEditForm(customerFormFromCustomer(detail)); setEditingCustomerData(false); }}>Cancelar</BtnSecondary>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="grid sm:grid-cols-2 gap-3 text-sm mb-3">
                    <div><p className="text-[10px] text-[#5a6a82] font-bold uppercase">Nome</p><p className="font-bold text-[#0d1b2e]">{detail.full_name}</p></div>
                    {detail.customer_type === "PJ" ? <>
                      <div><p className="text-[10px] text-[#5a6a82] font-bold uppercase">Tipo</p><p className="font-medium text-[#0d1b2e]">Pessoa Jurídica</p></div>
                      <div><p className="text-[10px] text-[#5a6a82] font-bold uppercase">CNPJ</p><p className="font-medium text-[#0d1b2e]">{detail.cnpj ? formatCnpj(detail.cnpj) : "—"}</p></div>
                      <div><p className="text-[10px] text-[#5a6a82] font-bold uppercase">Nome fantasia</p><p className="font-medium text-[#0d1b2e]">{detail.trade_name || detail.full_name || "—"}</p></div>
                      <div><p className="text-[10px] text-[#5a6a82] font-bold uppercase">Razão social</p><p className="font-medium text-[#0d1b2e]">{detail.legal_name || "—"}</p></div>
                    </> : <>
                      <div><p className="text-[10px] text-[#5a6a82] font-bold uppercase">CPF</p><p className="font-medium text-[#0d1b2e]">{detail.document ? formatCpf(detail.document) : "—"}</p></div>
                      {detail.birth_date && <div><p className="text-[10px] text-[#5a6a82] font-bold uppercase">Data de nascimento</p><p className="font-medium text-[#0d1b2e]">{formatDateOnly(detail.birth_date)}</p></div>}
                    </>}
                    <div><p className="text-[10px] text-[#5a6a82] font-bold uppercase">WhatsApp</p><p className="font-medium text-[#0d1b2e]">{formatPhone(detail.whatsapp) || "—"}</p></div>
                    <div><p className="text-[10px] text-[#5a6a82] font-bold uppercase">Telefone</p><p className="font-medium text-[#0d1b2e]">{formatPhone(detail.phone) || "—"}</p></div>
                    <div className="sm:col-span-2"><p className="text-[10px] text-[#5a6a82] font-bold uppercase">E-mail</p><p className="font-medium text-[#0d1b2e]">{detail.email || "—"}</p></div>
                    <div><p className="text-[10px] text-[#5a6a82] font-bold uppercase">Cadastrado em</p><p className="font-medium text-[#0d1b2e]">{fmtDate(detail.created_at)}</p></div>
                  </div>
                  {hasPermission("customers.edit") && <button onClick={() => setEditingCustomerData(true)} className="flex items-center gap-1.5 text-xs font-bold text-[#0057e7] hover:bg-[#0057e7]/5 px-3 py-1.5 rounded-lg border border-[#0057e7]/30 transition-colors">
                    <Edit2 size={12} /> Editar dados
                  </button>}
                </div>
              )}
            </Section>

            <Section title="Endereço">
              {editingCustomerAddress ? (
                <div className="space-y-3">
                  <AddressFields value={editAddress} onChange={setEditAddress} inputClassName={INPUT} />
                  <div className="flex gap-2 pt-1">
                    {hasPermission("customers.edit") && <BtnPrimary onClick={() => void handleSaveCustomerAddress()} disabled={savingAddress}>{savingAddress ? "Salvando..." : "Salvar endereço"}</BtnPrimary>}
                    <BtnSecondary onClick={() => { setEditingCustomerAddress(false); setEditAddress({ ...emptyAddress, ...((detail.addresses || []).find((address: Address) => address.is_default) || detail.addresses?.[0] || {}) }); }}>Cancelar</BtnSecondary>
                  </div>
                </div>
              ) : (
                <>
                  {((detail.addresses || []).length > 0) ? (
                    <div className="grid sm:grid-cols-2 gap-3 text-sm">
                      {(["zip_code", "street", "number", "complement", "neighborhood", "city", "state"] as const).map((key) => {
                        const labels: Record<string, string> = { zip_code: "CEP", street: "Rua", number: "Número", complement: "Complemento", neighborhood: "Bairro", city: "Cidade", state: "Estado" };
                        const address = (detail.addresses || []).find((item: Address) => item.is_default) || detail.addresses?.[0];
                        return address?.[key] ? <div key={key}><p className="text-[10px] text-[#5a6a82] font-bold uppercase">{labels[key]}</p><p className="font-medium text-[#0d1b2e]">{address[key]}</p></div> : null;
                      })}
                    </div>
                  ) : <p className="text-sm text-[#5a6a82]">Nenhum endereço cadastrado.</p>}
                  {hasPermission("customers.edit") && <button onClick={() => setEditingCustomerAddress(true)} className="mt-3 flex items-center gap-1.5 text-xs font-bold text-[#0057e7] hover:bg-[#0057e7]/5 px-3 py-1.5 rounded-lg border border-[#0057e7]/30 transition-colors">
                    <Edit2 size={12} /> Editar endereço
                  </button>}
                </>
              )}
            </Section>

            {detailLoading ? <LoadingState text="Carregando histórico..." /> : (
              <>
                {/* Quotes */}
                <Section title={`Orçamentos (${detailQuotes.length})`}>
                  {detailQuotes.length === 0 ? (
                    <p className="text-xs text-[#5a6a82]">Nenhum orçamento para este cliente.</p>
                  ) : (
                    <div className="space-y-2">
                      {detailQuotes.map(q => (
                        <div key={q.id} className="bg-[#f8fafc] border border-[#0d1b2e]/8 rounded-lg p-3">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-mono text-xs font-bold text-[#0057e7]">{q.protocol || q.id.slice(0, 8)}</span>
                            <StatusBadge status={(q.request_status as any)?.name || "—"} />
                          </div>
                          <p className="text-xs text-[#5a6a82]">{(q.service as any)?.title || "Serviço não informado"}{(q.brand as any)?.name ? ` — ${(q.brand as any).name}` : ""}</p>
                          {q.customer_message && <p className="text-xs text-[#0d1b2e] mt-1 italic">&quot;{q.customer_message}&quot;</p>}
                          <div className="flex items-center gap-3 mt-1 text-[10px] text-[#5a6a82]">
                            <span>{fmtDate(q.created_at)}</span>
                            {q.estimated_price && <span>Est: R$ {Number(q.estimated_price).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>}
                            {q.final_price && <span>Final: R$ {Number(q.final_price).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Section>

                {/* Orders */}
                <Section title={`Ordens de Serviço (${detailOrders.length})`}>
                  {detailOrders.length === 0 ? (
                    <p className="text-xs text-[#5a6a82]">Nenhuma OS para este cliente.</p>
                  ) : (
                    <div className="space-y-2">
                      {detailOrders.map(o => (
                        <button key={o.id} type="button" onClick={() => onOpenOrder?.(o.id)} className="w-full text-left bg-[#f8fafc] border border-[#0d1b2e]/8 rounded-lg p-3 hover:bg-[#eef5ff] transition-colors">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-black text-xs text-[#0057e7]">#{o.os_number || o.id.slice(0, 8)}</span>
                            <StatusBadge status={(o.order_status as any)?.name || "—"} color={(o.order_status as any)?.color} />
                          </div>
                          <p className="text-xs font-semibold text-[#0d1b2e]">{(o.service as any)?.title || "Ordem de Serviço"}</p>
                          {o.customer_notes && <p className="text-xs text-[#5a6a82] mt-0.5">{o.customer_notes}</p>}
                          <div className="flex items-center gap-3 mt-1 text-[10px] text-[#5a6a82]">
                            <span>Criada: {fmtDate(o.created_at)}</span>
                            {o.scheduled_at && <span>Agendado: {fmtDate(o.scheduled_at)}</span>}
                            {o.completed_at && <span>Concluído: {fmtDate(o.completed_at)}</span>}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </Section>
              </>
            )}
          </div>

          <div className="sticky bottom-0 bg-white border-t border-[#0d1b2e]/8 px-6 py-4 text-right">
            <BtnSecondary onClick={() => setDetail(null)}>Fechar</BtnSecondary>
          </div>
        </AdminPage>
      )}

      {createOpen && (
        <AdminPage open={true} onClose={() => { setCpfError(""); setCreateOpen(false); }} breadcrumb="Clientes" title="Novo cliente" subtitle="Preencha os dados do cliente" maxW="max-w-2xl">
          <div className="p-5 space-y-5">
            <Section title="Dados do cliente">
              <div className="grid sm:grid-cols-2 gap-4">
                <CustomerTypeToggle value={createForm.customerType} onChange={customerType => { setCpfError(""); setCreateForm({ ...createForm, customerType }); }} />
                {createForm.customerType === "PF" ? <>
                  <FInput label="Nome completo" required value={createForm.full_name} onChange={(e: any) => setCreateForm({ ...createForm, full_name: e.target.value })} />
                  <div>
                    <label className="block text-[11px] font-bold text-[#5a6a82] uppercase tracking-wider mb-1.5">CPF<span className="text-red-400">*</span></label>
                    <input ref={cpfInputRef} aria-invalid={Boolean(cpfError)} aria-describedby={cpfError ? "create-cpf-error" : undefined} required value={formatCpf(createForm.document)} placeholder="000.000.000-00" onBlur={() => { if (createForm.document.trim() && !isValidCpf(createForm.document)) setCpfError("CPF inválido. Verifique os números informados."); }} onChange={e => { const nextValue = formatCpf(e.target.value); setCreateForm({ ...createForm, document: nextValue }); if (!nextValue || isValidCpf(nextValue)) setCpfError(""); }} className={cn(INPUT, cpfError && "border-red-500 focus:border-red-500 focus:ring-red-500/50")} />
                    {cpfError && <p id="create-cpf-error" className="mt-1 text-xs text-red-600">{cpfError}</p>}
                  </div>
                  <div><FInput label="Data de nascimento" type="date" required value={createForm.birth_date} max={todayDateOnly()} onChange={(e: any) => setCreateForm({ ...createForm, birth_date: e.target.value })} />{!createForm.birth_date && <p className="mt-1 text-xs text-red-600">Informe a data de nascimento.</p>}{createForm.birth_date > todayDateOnly() && <p className="mt-1 text-xs text-red-600">A data não pode ser futura.</p>}</div>
                </> : <>
                  <FInput label="Nome fantasia" required value={createForm.trade_name} onChange={(e: any) => setCreateForm({ ...createForm, trade_name: e.target.value })} />
                    <FInput label="CNPJ" required value={createForm.cnpj} placeholder="00.000.000/0000-00" onBlur={(e: any) => lookupCreateCnpj(e.target.value)} onChange={(e: any) => { const nextCnpj = formatCnpj(e.target.value); setCnpjMessage(""); setCreateForm({ ...createForm, cnpj: nextCnpj }); if (nextCnpj.replace(/\D/g, "").length === 14) void lookupCreateCnpj(nextCnpj, { ...createForm, cnpj: nextCnpj }); }} hint={cnpjLoading ? "Consultando CNPJ..." : cnpjMessage || undefined} />
                  <FInput label="Razão social" value={createForm.legal_name} onChange={(e: any) => setCreateForm({ ...createForm, legal_name: e.target.value })} />
                  <FInput label="Inscrição estadual" value={createForm.state_registration} hint="Deixe em branco se não for contribuinte · ISENTO se isento" onChange={(e: any) => setCreateForm({ ...createForm, state_registration: e.target.value })} />
                  <FInput label="Fundação" value={createForm.foundation_date} placeholder="dd/mm/aaaa" maxLength={10} onChange={(e: any) => setCreateForm({ ...createForm, foundation_date: formatFoundationDate(e.target.value) })} />
                </>}
                <FInput label="Email" type="email" value={createForm.email} onChange={(e: any) => setCreateForm({ ...createForm, email: e.target.value })} />
                <FInput label="Telefone" required value={createForm.phone} onChange={(e: any) => setCreateForm({ ...createForm, phone: formatPhone(e.target.value) })} />
                <FInput label="WhatsApp" value={createForm.whatsapp} onChange={(e: any) => setCreateForm({ ...createForm, whatsapp: formatPhone(e.target.value) })} />
              </div>
            </Section>
            <Section title="Dados de endereço">
              <AddressFields value={createAddress} onChange={setCreateAddress} inputClassName={INPUT} />
            </Section>
          </div>
          <div className="sticky bottom-0 bg-white border-t border-[#0d1b2e]/8 px-5 py-4 flex justify-end gap-3">
            <BtnSecondary onClick={() => { setCpfError(""); setCreateOpen(false); }}>Cancelar</BtnSecondary>
            {hasPermission("customers.create") && <BtnPrimary onClick={handleCreate} disabled={saving}>{saving ? "Salvando..." : "Cadastrar Cliente"}</BtnPrimary>}
          </div>
        </AdminPage>
      )}
    </div>
  );
}

/* ─────────────────────────── TAB: EMPLOYEES ─────────────────────────── */
