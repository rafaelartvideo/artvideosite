import { InlineLoading } from "@/shared/ui/admin/AdminFeedback";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowDownWideNarrow, ArrowUpNarrowWide, Check, ClipboardList, Eraser, Search } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { cn, formatCnpj, formatCpf, formatPhone } from "@/shared/domain/formatters";
import { AdminButton, AdminCard, AdminDialog, BtnPrimary, BtnSecondary, PageHeader, Section } from "@/shared/ui/admin/AdminLayout";
import { AdminSelect, INPUT } from "@/shared/ui/admin/AdminFormControls";
import { AdminSearchPanel } from "@/shared/ui/admin/AdminSearchPanel";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/shared/ui/primitives/dropdown-menu";
import { PaginationBar } from "@/shared/ui/admin/AdminPagination";
import { EmptyState, LoadingState, notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import { getCustomer } from "@/features/customers/infrastructure/customers.repository";
import { QuickCustomerModal } from "@/features/orders/presentation/QuickCustomerModal";
import {
  createCustomerRequest, findRequestCustomers, listCustomerRequests,
  requestCustomerName, updateCustomerRequestStatus,
  type CustomerRequest, type RequestCustomer, type RequestKind, type RequestSort, type RequestStatus,
} from "../infrastructure/customer-requests.repository";

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
const kindLabel = (value: RequestKind) => value === "product" ? "Produto" : "Serviço";
const statusLabel = (value: RequestStatus) => statusOptions.find(option => option.value === value)?.label || "—";
const dateLabel = (value: string) => new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

function StatusTag({ value }: { value: RequestStatus }) {
  return <span className={cn("inline-flex items-center rounded-lg border px-2.5 py-1.5 text-xs font-bold", statusStyles[value])}>{statusLabel(value)}</span>;
}

function DetailValue({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="min-w-0"><p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{title}</p>
    <div className="break-words text-sm font-semibold text-foreground">{children || "—"}</div></div>;
}

function primaryAddressLabel(customer: any) {
  const addresses = Array.isArray(customer?.addresses) ? customer.addresses : [];
  const address = addresses.find((item: any) => item.is_default) || addresses[0];
  if (!address) return "Nenhum endereço cadastrado.";
  const street = [address.street, address.number].filter(Boolean).join(", ");
  const locality = [address.neighborhood, [address.city, address.state].filter(Boolean).join(" / ")].filter(Boolean).join(" · ");
  return [street, address.complement, locality, address.zip_code ? "CEP " + address.zip_code : "", address.reference ? "Referência: " + address.reference : ""].filter(Boolean).join(" — ") || "Nenhum endereço cadastrado.";
}

function searchableLabel(title: string, value: string, onChange: (value: string) => void, placeholder: string) {
  return <div className="min-w-0">
    <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">{title}</label>
    <div className="relative">
      <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
      <input className={cn(INPUT, "h-[42px] pl-9 text-xs md:h-9 md:py-1.5")} value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} />
    </div>
  </div>;
}

export function TabCustomerRequests() {
  const { activeOrganizationId, hasPermission } = useAuth();
  const canCreate = hasPermission("customer_requests.create");
  const canUpdate = hasPermission("customer_requests.update");
  const [status, setStatus] = useState<RequestStatus | "all">("all");
  const [kind, setKind] = useState<RequestKind | "all">("all");
  const [sort, setSort] = useState<RequestSort>("newest");
  const [search, setSearch] = useState("");
  const [customerFilter, setCustomerFilter] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [debouncedCustomerFilter, setDebouncedCustomerFilter] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [version, setVersion] = useState(0);
  const [items, setItems] = useState<CustomerRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [open, setOpen] = useState(false);
  const [quickCustomerOpen, setQuickCustomerOpen] = useState(false);
  const [quickCustomerInitial, setQuickCustomerInitial] = useState<{ customerType: "PF" | "PJ"; document?: string; cnpj?: string } | undefined>();
  const [selectedCustomer, setSelectedCustomer] = useState<RequestCustomer | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [matches, setMatches] = useState<RequestCustomer[]>([]);
  const [searchedCustomerTerm, setSearchedCustomerTerm] = useState("");
  const [searchingCustomer, setSearchingCustomer] = useState(false);
  const [kindDraft, setKindDraft] = useState<RequestKind>("product");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [detail, setDetail] = useState<CustomerRequest | null>(null);
  const [detailCustomer, setDetailCustomer] = useState<any>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState("");

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(search);
      setDebouncedCustomerFilter(customerFilter);
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [search, customerFilter]);

  useEffect(() => {
    if (!activeOrganizationId) { setItems([]); setTotal(0); setLoading(false); return; }
    let alive = true;
    setLoading(true);
    void listCustomerRequests({
      organizationId: activeOrganizationId, status, kind, sort, page, pageSize,
      search: debouncedSearch, customerSearch: debouncedCustomerFilter,
    }).then(result => {
      if (alive) { setItems(result.items); setTotal(result.total); }
    }).catch(error => {
      if (alive) { setItems([]); setTotal(0); notifyAdmin(error instanceof Error ? error.message : "Não foi possível carregar os pedidos.", "error"); }
    }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [activeOrganizationId, status, kind, sort, page, pageSize, debouncedSearch, debouncedCustomerFilter, version]);

  useEffect(() => {
    if (!open || selectedCustomer || !activeOrganizationId || customerSearch.trim().length < 2 || quickCustomerOpen) {
      setSearchingCustomer(false);
      return;
    }
    let alive = true;
    setSearchingCustomer(true);
    const term = customerSearch.trim();
    const timeout = window.setTimeout(() => {
      void findRequestCustomers(activeOrganizationId, term).then(result => {
        if (alive) { setMatches(result); setSearchedCustomerTerm(term); }
      }).catch(error => {
        if (alive) { setSearchedCustomerTerm(""); notifyAdmin(error instanceof Error ? error.message : "Falha na busca de clientes.", "error"); }
      }).finally(() => { if (alive) setSearchingCustomer(false); });
    }, 300);
    return () => { alive = false; window.clearTimeout(timeout); };
  }, [activeOrganizationId, open, customerSearch, selectedCustomer, quickCustomerOpen]);

  useEffect(() => {
    if (!detail || !activeOrganizationId) { setDetailCustomer(null); setDetailError(""); return; }
    let alive = true;
    setDetailLoading(true);
    setDetailCustomer(null);
    setDetailError("");
    void getCustomer(activeOrganizationId, detail.customer_id)
      .then(result => { if (alive) setDetailCustomer(result); })
      .catch(error => { if (alive) setDetailError(error instanceof Error ? error.message : "Não foi possível carregar os dados do cliente."); })
      .finally(() => { if (alive) setDetailLoading(false); });
    return () => { alive = false; };
  }, [activeOrganizationId, detail?.id, detail?.customer_id]);

  const resetForm = () => {
    setSelectedCustomer(null);
    setCustomerSearch("");
    setMatches([]);
    setSearchedCustomerTerm("");
    setQuickCustomerInitial(undefined);
    setDescription("");
    setKindDraft("product");
  };

  const closeForm = () => {
    if (!saving && !quickCustomerOpen) { setOpen(false); resetForm(); }
  };

  const handleChangeStatus = async (request: CustomerRequest, next: RequestStatus) => {
    if (!activeOrganizationId || !canUpdate || updating || request.status === next) return;
    setUpdating(true);
    try {
      await updateCustomerRequestStatus(activeOrganizationId, request.id, next);
      setDetail(current => current?.id === request.id ? { ...current, status: next } : current);
      setItems(current => current.map(item => item.id === request.id ? { ...item, status: next } : item));
      setVersion(current => current + 1);
      notifyAdmin("Situação atualizada.", "success");
    } catch (error) {
      notifyAdmin(error instanceof Error ? error.message : "Não foi possível alterar o pedido.", "error");
    } finally { setUpdating(false); }
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeOrganizationId || !selectedCustomer || description.trim().length < 3 || saving) {
      notifyAdmin("Selecione um cliente e descreva o pedido.", "error");
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

  const resetFilters = () => { setSearch(""); setCustomerFilter(""); setKind("all"); setStatus("all"); setSort("newest"); setPage(1); };
  const hasFilters = Boolean(search || customerFilter || kind !== "all" || status !== "all" || sort !== "newest");
  const canOfferRegister = canCreate && customerSearch.trim().length >= 2
    && searchedCustomerTerm === customerSearch.trim() && !searchingCustomer && matches.length === 0;

  const registerCustomer = () => {
    const digits = customerSearch.replace(/\D/g, "");
    setQuickCustomerInitial(digits.length === 11
      ? { customerType: "PF", document: formatCpf(digits) }
      : digits.length === 14 ? { customerType: "PJ", cnpj: formatCnpj(digits) } : undefined);
    setQuickCustomerOpen(true);
  };

  return <div className="min-w-0 space-y-5">
    <PageHeader title="Pedidos Avulsos"
      subtitle={`${total} ${total === 1 ? "pedido registrado" : "pedidos registrados"}`}
      actions={canCreate ? <BtnPrimary onClick={() => { resetForm(); setOpen(true); }}>Novo</BtnPrimary> : undefined} />

    <AdminSearchPanel title="Buscar pedidos" headerActions={<>
      {hasFilters && <button type="button" onClick={resetFilters} aria-label="Limpar filtros" title="Limpar filtros"
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/20 bg-white/10 px-2.5 text-[11px] font-bold text-white transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70">
        <Eraser size={13} /> <span className="hidden sm:inline">Limpar filtros</span>
      </button>}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label={`Ordenação: ${sort === "newest" ? "Mais recentes" : "Mais antigos"}`}
            title={`Ordenar pedidos: ${sort === "newest" ? "Mais recentes" : "Mais antigos"}`}
            className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/10 text-white transition-colors hover:bg-white/[0.14] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60">
            {sort === "newest" ? <ArrowDownWideNarrow size={15} /> : <ArrowUpNarrowWide size={15} />}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-[185px]">
          {([{ value: "newest", label: "Mais recentes", icon: ArrowDownWideNarrow }, { value: "oldest", label: "Mais antigos", icon: ArrowUpNarrowWide }] as const).map(option => {
            const Icon = option.icon;
            return <DropdownMenuItem key={option.value} onSelect={() => { setSort(option.value); setPage(1); }}
              className={cn("cursor-pointer", sort === option.value && "bg-primary-soft font-bold text-primary")}>
              <Icon size={15} /> <span>{option.label}</span>
              {sort === option.value && <Check size={15} className="ml-auto text-primary" />}
            </DropdownMenuItem>;
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </>}>
      <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {searchableLabel("Pedido", search, value => { setSearch(value); setPage(1); }, "Descreva o produto ou serviço")}
        {searchableLabel("Cliente / CPF / CNPJ", customerFilter, value => { setCustomerFilter(value); setPage(1); }, "Nome ou documento do cliente")}
        <div className="min-w-0">
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Tipo</label>
          <AdminSelect value={kind} onValueChange={value => { setKind(value as RequestKind | "all"); setPage(1); }}
            options={[{ value: "all", label: "Todos os tipos" }, { value: "product", label: "Produto" }, { value: "service", label: "Serviço" }]}
            className="h-[42px] min-h-0 text-xs md:h-9" ariaLabel="Tipo do pedido" />
        </div>
        <div className="min-w-0">
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Situação</label>
          <AdminSelect value={status} onValueChange={value => { setStatus(value as RequestStatus | "all"); setPage(1); }}
            options={[{ value: "all", label: "Todas as situações" }, ...statusOptions]} className="h-[42px] min-h-0 text-xs md:h-9"
            ariaLabel="Situação do pedido" />
        </div>
      </div>
    </AdminSearchPanel>

    <AdminCard className="[&_th]:md:py-2 [&_td]:md:py-2.5">
      {loading ? <LoadingState text="Carregando pedidos..." /> : items.length === 0
        ? <EmptyState icon={ClipboardList} title="Nenhum pedido encontrado" message={hasFilters ? "Ajuste os filtros para encontrar um pedido." : "Registre o primeiro pedido com o botão Novo."} />
        : <>
          <div className="divide-y divide-border md:hidden">
            {items.map(item => <article key={item.id} role="button" tabIndex={0}
              onClick={() => setDetail(item)}
              onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setDetail(item); } }}
              className="min-w-0 space-y-3 p-4 transition-colors hover:bg-muted/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-foreground">{requestCustomerName(item.customer)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{kindLabel(item.request_kind)} · {dateLabel(item.created_at)}</p>
                </div><StatusTag value={item.status} />
              </div>
              <p className="line-clamp-2 break-words text-sm text-foreground">{item.description}</p>
              <p className="text-xs text-muted-foreground">Atendente: {item.creatorName}</p>
            </article>)}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="min-w-[890px]">
              <thead><tr>
                <th className="text-left">Cliente</th>
                <th className="w-28 text-left">Tipo</th>
                <th className="text-left">Pedido</th>
                <th className="w-40 text-left">Registrado em</th>
                <th className="w-44 text-left">Atendente</th>
                <th className="w-32 text-left">Situação</th>
              </tr></thead>
              <tbody>{items.map(item => <tr key={item.id} tabIndex={0} role="button"
                aria-label={`Abrir pedido de ${requestCustomerName(item.customer)}`}
                onClick={() => setDetail(item)}
                onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setDetail(item); } }}
                className="cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                <td><span className="font-semibold text-foreground">{requestCustomerName(item.customer)}</span>
                  <p className="text-xs text-muted-foreground">{formatPhone(item.customer?.whatsapp || item.customer?.phone || "")}</p>
                </td>
                <td className="text-xs text-muted-foreground">{kindLabel(item.request_kind)}</td>
                <td className="max-w-sm"><p className="line-clamp-2 break-words text-sm text-foreground">{item.description}</p></td>
                <td className="whitespace-nowrap text-xs text-muted-foreground">{dateLabel(item.created_at)}</td>
                <td className="text-xs text-muted-foreground">{item.creatorName}</td>
                <td><StatusTag value={item.status} /></td>
              </tr>)}</tbody>
            </table>
          </div>
        </>}
      <PaginationBar page={page} pageSize={pageSize} totalItems={total}
        onPageChange={setPage} onPageSizeChange={size => { setPageSize(size); setPage(1); }} />
    </AdminCard>

    <AdminDialog open={open} onClose={closeForm} title="Novo pedido" className="max-w-xl"
      footer={<div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <BtnSecondary disabled={saving} onClick={closeForm}>Cancelar</BtnSecondary>
        <BtnPrimary loading={saving} loadingText="Salvando..." disabled={!selectedCustomer || description.trim().length < 3}
          onClick={() => { const form = document.getElementById("customer-request-form") as HTMLFormElement | null; form?.requestSubmit(); }}>Salvar</BtnPrimary>
      </div>}>
      <form id="customer-request-form" onSubmit={event => void save(event)} className="space-y-5">
        <div>
          <label className="mb-1.5 block text-xs font-bold text-foreground" htmlFor="customer-request-customer">Cliente *</label>
          {selectedCustomer
            ? <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-muted/50 p-3">
                <span className="min-w-0 truncate text-sm font-semibold">{requestCustomerName(selectedCustomer)}</span>
                <AdminButton variant="secondary" size="sm" disabled={saving} onClick={() => { setSelectedCustomer(null); setCustomerSearch(""); setMatches([]); setSearchedCustomerTerm(""); }}>Trocar</AdminButton>
              </div>
            : <div className="relative">
                <div className="flex min-w-0 items-center gap-2">
                  <input id="customer-request-customer" autoComplete="off" className={cn(INPUT, "h-[42px] flex-1")}
                    placeholder="Nome, CPF, CNPJ ou telefone" value={customerSearch}
                    onChange={event => { setCustomerSearch(event.target.value); setSearchedCustomerTerm(""); setMatches([]); }} />
                  {canOfferRegister && <BtnPrimary className="h-[42px] shrink-0" onClick={registerCustomer}>Cadastrar</BtnPrimary>}
                </div>
                {customerSearch.trim().length >= 2 && (searchingCustomer || (searchedCustomerTerm === customerSearch.trim() && matches.length > 0)) &&
                  <div className="absolute left-0 right-0 top-full z-[60] mt-1 max-h-52 overflow-y-auto rounded-lg border border-border bg-card shadow-xl">
                    {searchingCustomer ? <InlineLoading className="p-3" text="Buscando clientes..." />
                      : matches.map(customer => <button key={customer.id} type="button"
                          className="block w-full border-b border-border px-3 py-3 text-left text-sm hover:bg-muted last:border-0"
                          onClick={() => { setSelectedCustomer(customer); setCustomerSearch(""); setMatches([]); setSearchedCustomerTerm(""); }}>
                          <span className="block font-semibold">{requestCustomerName(customer)}</span>
                          {(customer.whatsapp || customer.phone) && <span className="text-xs text-muted-foreground">{formatPhone(customer.whatsapp || customer.phone || "")}</span>}
                        </button>)}
                  </div>}
                {canOfferRegister && <p className="mt-2 text-xs text-muted-foreground">Cadastro não encontrado. Use Cadastrar para incluir o cliente.</p>}
              </div>}
        </div>
        <div>
          <span className="mb-1.5 block text-xs font-bold text-foreground">Tipo do pedido *</span>
          <div className="grid grid-cols-2 gap-2">
            {(["product", "service"] as RequestKind[]).map(value => <button key={value} type="button" aria-pressed={kindDraft === value}
              onClick={() => setKindDraft(value)}
              className={cn("h-[42px] rounded-lg border text-sm font-bold transition-colors",
                kindDraft === value ? "border-primary bg-primary-soft text-primary" : "border-border bg-card text-foreground hover:bg-muted")}>
              {kindLabel(value)}
            </button>)}
          </div>
        </div>
        <div>
          <label htmlFor="customer-request-description" className="mb-1.5 block text-xs font-bold text-foreground">Descreva o pedido *</label>
          <textarea id="customer-request-description" maxLength={1000} rows={4} required value={description}
            onChange={event => setDescription(event.target.value)}
            placeholder={kindDraft === "product" ? "Ex.: controle remoto para TV modelo..." : "Ex.: instalação de suporte para TV de 55 polegadas..."}
            className={cn(INPUT, "h-auto min-h-28 resize-y py-3")} />
          <p className="mt-1 text-right text-xs text-muted-foreground">{description.length}/1000</p>
        </div>
      </form>
    </AdminDialog>

    {quickCustomerOpen && <QuickCustomerModal allowCustomerRequests initialValues={quickCustomerInitial}
      description="Cadastre o cliente para vinculá-lo ao pedido avulso."
      onClose={() => setQuickCustomerOpen(false)}
      onSaved={customer => {
        setSelectedCustomer({ id: customer.id, full_name: customer.full_name || null, trade_name: customer.trade_name || null,
          legal_name: customer.legal_name || null, phone: customer.phone || null, whatsapp: customer.whatsapp || null });
        setCustomerSearch("");
        setMatches([]);
        setSearchedCustomerTerm("");
        setQuickCustomerOpen(false);
      }} />}

    <AdminDialog open={Boolean(detail)} onClose={() => setDetail(null)}
      title="Detalhes do pedido" description={detail ? requestCustomerName(detail.customer) : undefined}
      className="max-w-3xl" footer={<div className="flex justify-end"><BtnSecondary onClick={() => setDetail(null)}>Fechar</BtnSecondary></div>}>
      {detail && <div className="space-y-5">
        {detailLoading && <LoadingState text="Carregando dados do cliente..." />}
        {detailError && <p role="alert" className="text-sm text-red-600">{detailError}</p>}
        <Section title="Cliente" description="Dados do cliente vinculado ao pedido.">
          <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
            <DetailValue title="Nome">{requestCustomerName(detailCustomer || detail.customer)}</DetailValue>
            <DetailValue title={detailCustomer?.customer_type === "PJ" ? "CNPJ" : "CPF"}>
              {detailCustomer?.customer_type === "PJ" ? (detailCustomer.cnpj ? formatCnpj(detailCustomer.cnpj) : "—")
                : (detailCustomer?.document ? formatCpf(detailCustomer.document) : "—")}
            </DetailValue>
            <DetailValue title="Telefone">{detailCustomer?.phone ? formatPhone(detailCustomer.phone) : (detail.customer?.phone ? formatPhone(detail.customer.phone) : "—")}</DetailValue>
            <DetailValue title="WhatsApp">{detailCustomer?.whatsapp ? formatPhone(detailCustomer.whatsapp) : (detail.customer?.whatsapp ? formatPhone(detail.customer.whatsapp) : "—")}</DetailValue>
            <DetailValue title="E-mail">{detailCustomer?.email || "—"}</DetailValue>
          </div>
          <div className="mt-5 border-t border-border pt-4">
            <DetailValue title="Endereço">{detailLoading ? "Carregando..." : primaryAddressLabel(detailCustomer)}</DetailValue>
          </div>
        </Section>
        <Section title="Pedido" description="Solicitação registrada pelo atendente.">
          <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
            <DetailValue title="Tipo">{kindLabel(detail.request_kind)}</DetailValue>
            <DetailValue title="Registrado em">{dateLabel(detail.created_at)}</DetailValue>
            <DetailValue title="Atendente">{detail.creatorName}</DetailValue>
            <div className="sm:col-span-2 lg:col-span-3">
              <DetailValue title="Descrição"><p className="whitespace-pre-wrap font-normal">{detail.description}</p></DetailValue>
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Situação</label>
              {canUpdate ? <div className="max-w-xs">
                <AdminSelect value={detail.status} onValueChange={value => void handleChangeStatus(detail, value as RequestStatus)}
                  options={statusOptions} disabled={updating} ariaLabel="Alterar situação do pedido" />
              </div> : <StatusTag value={detail.status} />}
            </div>
          </div>
        </Section>
      </div>}
    </AdminDialog>
  </div>;
}
