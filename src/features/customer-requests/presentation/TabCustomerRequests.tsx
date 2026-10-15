import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "@/lib/auth";
import { AdminButton, AdminCard, AdminCardToolbar, AdminDialog, BtnPrimary, BtnSecondary, PageHeader } from "@/shared/ui/admin/AdminLayout";
import { notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import { QuickCustomerModal } from "@/features/orders/presentation/QuickCustomerModal";
import {
  createCustomerRequest, findRequestCustomers, listCustomerRequests,
  requestCustomerName, updateCustomerRequestStatus,
  type CustomerRequest, type RequestCustomer, type RequestKind, type RequestStatus,
} from "../infrastructure/customer-requests.repository";

const fieldClass = "h-10 w-full min-w-0 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none focus:border-primary";
const labelClass = "mb-1.5 block text-xs font-semibold text-foreground";
const statusOptions: Array<{ value: RequestStatus; label: string }> = [
  { value: "pending", label: "Pendente" },
  { value: "fulfilled", label: "Atendido" },
  { value: "cancelled", label: "Cancelado" },
];
const statusStyles: Record<RequestStatus, string> = {
  pending: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  fulfilled: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  cancelled: "border-border bg-muted text-muted-foreground",
};
const typeLabel = (kind: RequestKind) => kind === "product" ? "Produto" : "Serviço";
const dateLabel = (value: string) => new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

export function TabCustomerRequests() {
  const { activeOrganizationId, hasPermission } = useAuth();
  const canCreate = hasPermission("customers.requests.create");
  const canUpdate = hasPermission("customers.requests.update");
  const canCreateCustomer = hasPermission("customers.create");
  const [status, setStatus] = useState<RequestStatus | "all">("all");
  const [kind, setKind] = useState<RequestKind | "all">("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [version, setVersion] = useState(0);
  const [items, setItems] = useState<CustomerRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [quickCustomerOpen, setQuickCustomerOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<RequestCustomer | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [matches, setMatches] = useState<RequestCustomer[]>([]);
  const [searchingCustomer, setSearchingCustomer] = useState(false);
  const [kindDraft, setKindDraft] = useState<RequestKind>("product");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const pageSize = 10;

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(search), 300);
    return () => window.clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    if (!activeOrganizationId) { setItems([]); setTotal(0); setLoading(false); return; }
    let alive = true;
    setLoading(true);
    void listCustomerRequests({
      organizationId: activeOrganizationId, status, kind, page, pageSize, search: debouncedSearch,
    }).then(result => {
      if (alive) { setItems(result.items); setTotal(result.total); }
    }).catch(error => {
      if (alive) notifyAdmin(error instanceof Error ? error.message : "Não foi possível carregar os pedidos.", "error");
    }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [activeOrganizationId, status, kind, page, debouncedSearch, version]);

  useEffect(() => {
    if (!open || selectedCustomer || !activeOrganizationId || customerSearch.trim().length < 2) {
      setMatches([]);
      setSearchingCustomer(false);
      return;
    }
    let alive = true;
    const timeout = window.setTimeout(() => {
      setSearchingCustomer(true);
      void findRequestCustomers(activeOrganizationId, customerSearch)
        .then(result => { if (alive) setMatches(result); })
        .catch(error => { if (alive) notifyAdmin(error instanceof Error ? error.message : "Falha na busca de clientes.", "error"); })
        .finally(() => { if (alive) setSearchingCustomer(false); });
    }, 250);
    return () => { alive = false; window.clearTimeout(timeout); };
  }, [activeOrganizationId, open, customerSearch, selectedCustomer]);

  const resetForm = () => {
    setSelectedCustomer(null);
    setCustomerSearch("");
    setMatches([]);
    setDescription("");
    setKindDraft("product");
  };
  const closeForm = () => { if (!saving && !quickCustomerOpen) { setOpen(false); resetForm(); } };
  const changeStatus = async (id: string, nextStatus: RequestStatus) => {
    if (!activeOrganizationId || !canUpdate || updating) return;
    setUpdating(id);
    try {
      await updateCustomerRequestStatus(activeOrganizationId, id, nextStatus);
      setItems(current => current.map(item => item.id === id ? { ...item, status: nextStatus } : item));
      setVersion(current => current + 1);
      notifyAdmin("Situação do pedido atualizada.", "success");
    } catch (error) {
      notifyAdmin(error instanceof Error ? error.message : "Não foi possível atualizar a situação.", "error");
    } finally {
      setUpdating(null);
    }
  };
  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeOrganizationId || !selectedCustomer || !description.trim() || saving) {
      notifyAdmin("Selecione um cliente e descreva o pedido.", "error");
      return;
    }
    if (description.trim().length < 3) {
      notifyAdmin("Descreva o pedido com pelo menos 3 caracteres.", "error");
      return;
    }
    setSaving(true);
    try {
      await createCustomerRequest({ organizationId: activeOrganizationId, customerId: selectedCustomer.id, kind: kindDraft, description });
      setOpen(false);
      resetForm();
      setPage(1);
      setVersion(current => current + 1);
      notifyAdmin("Pedido avulso registrado.", "success");
    } catch (error) {
      notifyAdmin(error instanceof Error ? error.message : "Não foi possível salvar o pedido.", "error");
    } finally { setSaving(false); }
  };
  const chooseStatus = (next: RequestStatus | "all") => { setStatus(next); setPage(1); };
  const chooseKind = (next: RequestKind | "all") => { setKind(next); setPage(1); };
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return <div className="min-w-0 space-y-5">
    <PageHeader title="Pedidos Avulsos" subtitle="Registre produtos e serviços procurados pelos clientes, sem criar OS nem orçamento."
      actions={canCreate ? <BtnPrimary onClick={() => { resetForm(); setOpen(true); }}>Novo pedido</BtnPrimary> : undefined} />

    <AdminCard square>
      <AdminCardToolbar className="gap-3">
        <div className="min-w-0 flex-1">
          <label htmlFor="request-filter" className="sr-only">Buscar descrição</label>
          <input id="request-filter" className={fieldClass} placeholder="Buscar na descrição do pedido" value={search}
            onChange={event => { setSearch(event.target.value); setPage(1); }} />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
          <select aria-label="Filtrar por tipo" className={fieldClass + " sm:w-40"} value={kind}
            onChange={event => chooseKind(event.target.value as RequestKind | "all")}>
            <option value="all">Todos os tipos</option>
            <option value="product">Produtos</option>
            <option value="service">Serviços</option>
          </select>
          <select aria-label="Filtrar por situação" className={fieldClass + " sm:w-44"} value={status}
            onChange={event => chooseStatus(event.target.value as RequestStatus | "all")}>
            <option value="all">Todas situações</option>
            {statusOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
      </AdminCardToolbar>
      <div className="w-full overflow-x-auto">
        <table className="w-full min-w-[750px] text-left text-sm">
          <thead className="border-b border-border bg-muted/70 text-[11px] uppercase text-muted-foreground">
            <tr><th className="px-4 py-3">Cliente</th><th className="px-4 py-3">Tipo</th><th className="px-4 py-3">Pedido</th>
              <th className="px-4 py-3">Registrado em</th><th className="px-4 py-3">Atendente</th><th className="px-4 py-3">Situação</th></tr>
          </thead>
          <tbody className="divide-y divide-border">
            {!loading && items.length === 0 && <tr><td colSpan={6} className="px-4 py-12 text-center text-sm text-muted-foreground">Nenhum pedido encontrado.</td></tr>}
            {loading && <tr><td colSpan={6} className="px-4 py-10 text-center text-sm text-muted-foreground">Carregando pedidos...</td></tr>}
            {!loading && items.map(item => <tr key={item.id} className="align-middle hover:bg-muted/40">
              <td className="px-4 py-3 font-semibold text-foreground">{requestCustomerName(item.customer)}</td>
              <td className="px-4 py-3 text-muted-foreground">{typeLabel(item.request_kind)}</td>
              <td className="max-w-sm whitespace-pre-wrap break-words px-4 py-3 text-foreground">{item.description}</td>
              <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{dateLabel(item.created_at)}</td>
              <td className="px-4 py-3 text-muted-foreground">{item.creatorName}</td>
              <td className="px-4 py-3">{canUpdate
                ? <select aria-label={"Alterar situação do pedido de " + requestCustomerName(item.customer)}
                    disabled={updating !== null} value={item.status}
                    onChange={event => void changeStatus(item.id, event.target.value as RequestStatus)}
                    className={"rounded-lg border px-2 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-primary/40 " + statusStyles[item.status]}>
                    {statusOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                : <span className={"inline-flex rounded-lg border px-2.5 py-1.5 text-xs font-bold " + statusStyles[item.status]}>
                    {statusOptions.find(option => option.value === item.status)?.label}
                  </span>}
              </td>
            </tr>)}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-xs text-muted-foreground">
        <span>{total} {total === 1 ? "pedido" : "pedidos"} · Página {page} de {pageCount}</span>
        <div className="flex gap-2">
          <AdminButton variant="secondary" size="sm" disabled={page <= 1 || loading} onClick={() => setPage(current => current - 1)}>Anterior</AdminButton>
          <AdminButton variant="secondary" size="sm" disabled={page >= pageCount || loading} onClick={() => setPage(current => current + 1)}>Próxima</AdminButton>
        </div>
      </div>
    </AdminCard>

    <AdminDialog open={open} onClose={closeForm} title="Novo pedido avulso"
      description="O pedido fica registrado na lista de desejos da loja." className="max-w-xl"
      footer={<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <BtnSecondary disabled={saving} onClick={closeForm}>Cancelar</BtnSecondary>
        <BtnPrimary loading={saving} loadingText="Salvando..." disabled={!selectedCustomer || description.trim().length < 3} type="submit"
          onClick={() => { const form = document.getElementById("customer-request-form") as HTMLFormElement | null; form?.requestSubmit(); }}>Salvar pedido</BtnPrimary>
      </div>}>
      <form id="customer-request-form" onSubmit={event => void save(event)} className="space-y-5">
        <div>
          <label className={labelClass} htmlFor="customer-request-customer">Cliente *</label>
          {selectedCustomer ? <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/50 p-3">
            <span className="min-w-0 truncate text-sm font-semibold">{requestCustomerName(selectedCustomer)}</span>
            <AdminButton variant="secondary" size="sm" disabled={saving} onClick={() => { setSelectedCustomer(null); setCustomerSearch(""); }}>Trocar</AdminButton>
          </div> : <div className="relative">
            <input id="customer-request-customer" autoComplete="off" className={fieldClass} placeholder="Buscar nome, CPF, CNPJ ou telefone"
              value={customerSearch} onChange={event => setCustomerSearch(event.target.value)} />
            {customerSearch.trim().length >= 2 && <div className="absolute left-0 right-0 top-full z-[60] mt-1 max-h-56 overflow-y-auto rounded-lg border border-border bg-card shadow-xl">
              {searchingCustomer ? <p className="px-3 py-3 text-sm text-muted-foreground">Buscando clientes...</p>
                : matches.length ? matches.map(customer => <button key={customer.id} type="button"
                    className="block w-full border-b border-border px-3 py-3 text-left text-sm hover:bg-muted last:border-0"
                    onClick={() => { setSelectedCustomer(customer); setCustomerSearch(""); setMatches([]); }}>
                    <span className="block font-semibold">{requestCustomerName(customer)}</span>
                    {(customer.whatsapp || customer.phone) && <span className="text-xs text-muted-foreground">{customer.whatsapp || customer.phone}</span>}
                  </button>)
                  : <p className="px-3 py-3 text-sm text-muted-foreground">Nenhum cliente encontrado.</p>}
            </div>}
          </div>}
          {canCreateCustomer && <div className="mt-2 flex justify-end"><AdminButton variant="secondary" size="sm" onClick={() => setQuickCustomerOpen(true)}>Cadastrar novo cliente</AdminButton></div>}
        </div>
        <div>
          <span className={labelClass}>O que o cliente procura? *</span>
          <div className="grid grid-cols-2 gap-2">
            {(["product", "service"] as RequestKind[]).map(value => <button key={value} type="button" aria-pressed={kindDraft === value}
              onClick={() => setKindDraft(value)}
              className={"h-10 rounded-lg border text-sm font-bold transition-colors " + (kindDraft === value ? "border-primary bg-primary/10 text-primary" : "border-border bg-card text-foreground hover:bg-muted")}>
              {typeLabel(value)}
            </button>)}
          </div>
        </div>
        <div>
          <label htmlFor="customer-request-description" className={labelClass}>Descreva o pedido *</label>
          <textarea id="customer-request-description" maxLength={1000} rows={4} required value={description}
            onChange={event => setDescription(event.target.value)} placeholder={kindDraft === "product" ? "Ex.: controle remoto para TV modelo..." : "Ex.: instalação de suporte para TV de 55 polegadas..."}
            className={fieldClass + " h-auto min-h-28 resize-y py-3"} />
          <p className="mt-1 text-right text-xs text-muted-foreground">{description.length}/1000</p>
        </div>
      </form>
    </AdminDialog>
    {quickCustomerOpen && <QuickCustomerModal
      description="Cadastre o cliente para vinculá-lo ao pedido avulso."
      onClose={() => setQuickCustomerOpen(false)}
      onSaved={customer => {
        setSelectedCustomer({
          id: customer.id,
          full_name: customer.full_name || null,
          trade_name: customer.trade_name || null,
          legal_name: customer.legal_name || null,
          phone: customer.phone || null,
          whatsapp: customer.whatsapp || null,
        });
        setCustomerSearch("");
        setQuickCustomerOpen(false);
      }} />}
  </div>;
}
