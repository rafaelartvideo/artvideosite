import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownWideNarrow, ArrowUpDown, ArrowUpNarrowWide, Check, ChevronDown, ClipboardList, Eraser, FileText, Search } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { queryKeys } from "@/infrastructure/query/query-keys";
import {
  createServiceOrderFromQuote,
  findServiceOrderByQuote,
  getQuote,
  insertQuoteStatusHistory,
  listOrderStatuses,
  listQuotesPage,
  listRequestStatuses,
  updateQuoteStatus,
} from "../infrastructure/quotes.repository";
import type { AdminTab } from "@/features/admin-shell/domain/admin.types";
import { initialOrderStatus } from "@/features/orders/domain/order-status";
import { AdminButton, AdminCard, AdminPage, BtnSecondary, PageHeader, Section } from "@/shared/ui/admin/AdminLayout";
import { AdminSearchPanel } from "@/shared/ui/admin/AdminSearchPanel";
import { cn, formatCnpj, formatCpf, formatPhone, formatCurrency, formatDateTime } from "@/shared/domain/formatters";
import { EmptyState, LoadingState, StatusBadge, Toast } from "@/shared/ui/admin/AdminFeedback";
import { AdminSelect, INPUT } from "@/shared/ui/admin/AdminFormControls";
import { PaginationBar } from "@/shared/ui/admin/AdminPagination";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/shared/ui/primitives/dropdown-menu";

type TabQuotesProps = {
  onNavigate?: (tab: AdminTab) => void;
  routeResourceId?: string | null;
  onRouteChange?: (resourceId: string | null, subpage?: string | null) => void;
};

type QuoteMobileFilter = "customer" | "document" | "whatsapp" | "protocol" | "status";
type QuoteSort = "" | "asc" | "desc";

const quoteMobileFilters: Array<{ value: QuoteMobileFilter; label: string }> = [
  { value: "customer", label: "Cliente" },
  { value: "document", label: "CPF / CNPJ" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "protocol", label: "Protocolo" },
  { value: "status", label: "Status" },
];

const normalizeDocument = (value: unknown) => String(value ?? "").replace(/\D/g, "");
const formatDocumentSearch = (value: string) => {
  const digits = normalizeDocument(value).slice(0, 14);
  return digits.length <= 11 ? formatCpf(digits) : formatCnpj(digits);
};

function useDebouncedValue<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timeout);
  }, [value, delay]);
  return debounced;
}

export function TabQuotes({ onNavigate, routeResourceId, onRouteChange }: TabQuotesProps) {
  const { user, hasPermission } = useAuth();
  const canViewTable = hasPermission("quotes.table.view");
  const canViewDetails = hasPermission("quotes.details.view");
  const canChangeStatus = hasPermission("quotes.status.change");
  const canConvertToOrder = hasPermission("quotes.convert_to_order");
  const showProtocol = hasPermission("quotes.table.protocol");
  const showCustomer = hasPermission("quotes.table.customer");
  const showDocument = hasPermission("quotes.table.document");
  const showServiceBrand = hasPermission("quotes.table.service_brand");
  const showStatus = hasPermission("quotes.table.status");
  const showCreatedAt = hasPermission("quotes.table.created_at");
  const showActions = hasPermission("quotes.table.actions");
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [mobileFilter, setMobileFilter] = useState<QuoteMobileFilter>("customer");
  const [mobileCustomerSearch, setMobileCustomerSearch] = useState("");
  const [mobileDocumentSearch, setMobileDocumentSearch] = useState("");
  const [mobileWhatsappSearch, setMobileWhatsappSearch] = useState("");
  const [mobileProtocolSearch, setMobileProtocolSearch] = useState("");
  const [orderSort, setOrderSort] = useState<QuoteSort>("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [detail, setDetail] = useState<any>(null);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const debouncedSearch = useDebouncedValue(search);
  const debouncedCustomerSearch = useDebouncedValue(mobileCustomerSearch);
  const debouncedDocumentSearch = useDebouncedValue(mobileDocumentSearch);
  const debouncedWhatsappSearch = useDebouncedValue(mobileWhatsappSearch);
  const debouncedProtocolSearch = useDebouncedValue(mobileProtocolSearch);

  const statusesQuery = useQuery({
    queryKey: [...queryKeys.quotes.all, "statuses"],
    queryFn: async () => {
      const { data, error } = await listRequestStatuses();
      if (error) throw error;
      return data || [];
    },
    enabled: canViewTable || canViewDetails,
  });
  const statuses = statusesQuery.data ?? [];

  const listFilters = useMemo(() => ({
    page,
    pageSize,
    search: debouncedSearch,
    customerSearch: debouncedCustomerSearch,
    documentSearch: debouncedDocumentSearch,
    whatsappSearch: debouncedWhatsappSearch,
    protocolSearch: debouncedProtocolSearch,
    statusId: filterStatus,
    sort: orderSort,
  }), [page, pageSize, debouncedSearch, debouncedCustomerSearch, debouncedDocumentSearch, debouncedWhatsappSearch, debouncedProtocolSearch, filterStatus, orderSort]);

  const quotesQuery = useQuery({
    queryKey: [...queryKeys.quotes.lists(), listFilters],
    enabled: canViewTable && !routeResourceId,
    queryFn: () => listQuotesPage(listFilters),
  });
  const quotes = quotesQuery.data?.items ?? [];
  const totalItems = quotesQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(page, totalPages);

  useEffect(() => {
    if (quotesQuery.error || statusesQuery.error) {
      const error = quotesQuery.error || statusesQuery.error;
      setToast({ msg: `Erro ao carregar orçamentos: ${error instanceof Error ? error.message : String(error)}`, type: "error" });
    }
  }, [quotesQuery.error, statusesQuery.error]);

  useEffect(() => {
    setPage(1);
  }, [search, filterStatus, mobileCustomerSearch, mobileDocumentSearch, mobileWhatsappSearch, mobileProtocolSearch, orderSort]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  useEffect(() => {
    let cancelled = false;
    if (!routeResourceId) {
      if (detail) setDetail(null);
      return () => { cancelled = true; };
    }
    if (!canViewDetails || detail?.id === routeResourceId) return () => { cancelled = true; };
    void getQuote(routeResourceId).then(quote => {
      if (cancelled) return;
      if (!quote) {
        setToast({ msg: "Orçamento não encontrado.", type: "error" });
        onRouteChange?.(null, null);
        return;
      }
      setDetail(quote);
    }).catch(error => {
      if (!cancelled) setToast({ msg: `Erro ao carregar orçamento: ${error instanceof Error ? error.message : String(error)}`, type: "error" });
    });
    return () => { cancelled = true; };
  }, [routeResourceId, detail?.id, canViewDetails]);

  const syncQuotes = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.quotes.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.customers.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.admin.dashboard() }),
    ]);
  };

  const updateStatus = async (id: string, statusId: string) => {
    if (!canChangeStatus) return;
    const selectedStatus = statuses.find(status => status.id === statusId);
    const { error: updateError } = await updateQuoteStatus(id, statusId);
    if (updateError) {
      setToast({ msg: `Erro ao atualizar status: ${updateError.message}`, type: "error" });
      return;
    }
    const { error: historyError } = await insertQuoteStatusHistory(id, statusId, user?.id || null);
    if (historyError) console.warn("[ADMIN] quote status history warning:", historyError.message);
    if (detail?.id === id) setDetail({ ...detail, status_id: statusId, statusName: selectedStatus?.name || "Sem status", request_status: selectedStatus || detail.request_status });
    setToast({ msg: "Status atualizado!", type: "success" });
    await syncQuotes();
  };

  const openDetails = (quote: any) => {
    if (!canViewDetails) return;
    setDetail(quote);
    if (onRouteChange) onRouteChange(quote.id, null);
  };
  const closeDetails = () => { setDetail(null); onRouteChange?.(null, null); };

  const mobileFilterLabel = quoteMobileFilters.find(option => option.value === mobileFilter)?.label || "Cliente";
  const sortLabel = orderSort === "asc" ? "Protocolo crescente" : orderSort === "desc" ? "Protocolo decrescente" : "Ordenação padrão";
  const SortIcon = orderSort === "asc" ? ArrowUpNarrowWide : orderSort === "desc" ? ArrowDownWideNarrow : ArrowUpDown;
  const hasMobileFilters = Boolean(mobileCustomerSearch || mobileDocumentSearch || mobileWhatsappSearch || mobileProtocolSearch || filterStatus || orderSort);

  const clearMobileFilters = () => {
    setMobileCustomerSearch("");
    setMobileDocumentSearch("");
    setMobileWhatsappSearch("");
    setMobileProtocolSearch("");
    setFilterStatus("");
    setOrderSort("");
    setPage(1);
  };

  const renderMobileFilter = () => {
    if (mobileFilter === "customer") return <MobileSearchField value={mobileCustomerSearch} onChange={setMobileCustomerSearch} placeholder="Digite o nome do cliente" />;
    if (mobileFilter === "document") return <MobileSearchField value={mobileDocumentSearch} onChange={value => setMobileDocumentSearch(formatDocumentSearch(value))} placeholder="Digite o CPF ou CNPJ" inputMode="numeric" />;
    if (mobileFilter === "whatsapp") return <MobileSearchField value={mobileWhatsappSearch} onChange={value => setMobileWhatsappSearch(formatPhone(value))} placeholder="Digite o WhatsApp" inputMode="numeric" />;
    if (mobileFilter === "protocol") return <MobileSearchField value={mobileProtocolSearch} onChange={setMobileProtocolSearch} placeholder="Digite o protocolo" />;
    return <AdminSelect value={filterStatus} onValueChange={value => { setFilterStatus(value); setPage(1); }} options={[{ value: "", label: "Todos os status" }, ...statuses.map(status => ({ value: status.id, label: status.name }))]} className="h-[42px] text-xs" ariaLabel="Filtrar orçamentos por status" />;
  };

  const sortMenu = <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <button type="button" aria-label={`Ordenação atual: ${sortLabel}`} title={sortLabel} className={cn("inline-flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-lg border bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-[#0057e7]/40", orderSort ? "border-[#0057e7] bg-[#eef5ff] text-[#0057e7]" : "border-[#0d1b2e]/15 text-[#5a6a82]")}><SortIcon size={17} /></button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="min-w-[220px]">
      {([["", "Ordenação padrão", ArrowUpDown], ["asc", "Protocolo crescente", ArrowUpNarrowWide], ["desc", "Protocolo decrescente", ArrowDownWideNarrow]] as const).map(([value, label, Icon]) => <DropdownMenuItem key={value || "default"} onSelect={() => setOrderSort(value)} className={cn("cursor-pointer", orderSort === value && "bg-[#eef5ff] font-bold text-[#0057e7]")}><Icon size={15} /><span>{label}</span>{orderSort === value && <Check size={15} className="ml-auto" />}</DropdownMenuItem>)}
    </DropdownMenuContent>
  </DropdownMenu>;

  const InfoRow = ({ label, value }: { label: string; value?: string | null }) => value ? <div className="min-w-0"><p className="mb-0.5 break-words text-[10px] font-bold uppercase text-[#5a6a82]">{label}</p><p className="break-words whitespace-pre-line text-sm font-medium text-[#0d1b2e]">{value}</p></div> : null;

  return <div className="min-w-0 space-y-5">
    {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

    {!routeResourceId && <>
      <PageHeader title="Orçamentos" subtitle={`${totalItems} solicitaç${totalItems !== 1 ? "ões" : "ão"} recebida${totalItems !== 1 ? "s" : ""}`} />
      {canViewTable && <AdminSearchPanel title="Buscar orçamentos">
        <div className="space-y-3 md:hidden">
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild><button type="button" aria-label={`Buscar por: ${mobileFilterLabel}`} className="flex h-[42px] min-w-0 flex-1 items-center justify-between gap-2 rounded-lg border border-[#0d1b2e]/15 bg-white px-3 text-left text-xs font-bold text-[#0d1b2e] shadow-sm"><span className="min-w-0 truncate"><span className="font-medium text-[#5a6a82]">Buscar por:</span> {mobileFilterLabel}</span><ChevronDown size={15} /></button></DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-[220px]">{quoteMobileFilters.map(option => <DropdownMenuItem key={option.value} onSelect={() => setMobileFilter(option.value)} className={cn("cursor-pointer", mobileFilter === option.value && "bg-[#eef5ff] font-bold text-[#0057e7]")}><Search size={14} /><span>{option.label}</span>{mobileFilter === option.value && <Check size={14} className="ml-auto" />}</DropdownMenuItem>)}</DropdownMenuContent>
            </DropdownMenu>
            {sortMenu}
          </div>
          {renderMobileFilter()}
          {hasMobileFilters && <div className="flex justify-end"><button type="button" onClick={clearMobileFilters} aria-label="Limpar filtros" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-red-200 bg-white text-red-600 hover:bg-red-50"><Eraser size={15} /></button></div>}
        </div>
        <div className="hidden min-w-0 gap-3 md:grid md:grid-cols-[minmax(0,1fr)_220px_42px]">
          <SearchField value={search} onChange={setSearch} placeholder="Cliente, CPF/CNPJ, WhatsApp ou protocolo" />
          <AdminSelect value={filterStatus} onValueChange={setFilterStatus} options={[{ value: "", label: "Todos os status" }, ...statuses.map(status => ({ value: status.id, label: status.name }))]} className="h-[42px] text-xs" ariaLabel="Filtrar por status" />
          {sortMenu}
        </div>
      </AdminSearchPanel>}

      {canViewTable && <AdminCard>
        {quotesQuery.isPending ? <LoadingState /> : quotes.length === 0 ? <EmptyState icon={FileText} title="Nenhum orçamento encontrado" message="Ajuste os filtros ou aguarde novas solicitações." /> : <>
          <div className="divide-y divide-[#0d1b2e]/8 md:hidden">{quotes.map(quote => {
            const customer = quote.customer as any;
            return <article key={quote.id} role={canViewDetails ? "button" : undefined} tabIndex={canViewDetails ? 0 : undefined} onClick={() => openDetails(quote)} className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-3"><div className="min-w-0">{showProtocol && <p className="font-mono text-xs font-black text-[#0057e7]">{quote.protocol || quote.id.slice(0, 8)}</p>}{showCustomer && <p className="truncate text-sm font-bold text-[#0d1b2e]">{customer?.full_name || customer?.trade_name || "—"}</p>}</div>{showStatus && <StatusBadge status={quote.statusName || "Sem status"} color={quote.request_status?.color} />}</div>
              <div className="grid grid-cols-2 gap-2">{showDocument && <MobileInfo label="Documento" value={customer?.customer_type === "PJ" ? formatCnpj(customer?.cnpj || "") : formatCpf(customer?.document || "")} />}{showCreatedAt && <MobileInfo label="Recebido em" value={formatDateTime(quote.created_at)} />}{showServiceBrand && <MobileInfo label="Serviço" value={(quote.service as any)?.title || "—"} />}{showServiceBrand && <MobileInfo label="Marca" value={(quote.brand as any)?.name || "—"} />}</div>
              {showActions && <div onClick={event => event.stopPropagation()} className="border-t border-[#0d1b2e]/8 pt-3">{canChangeStatus && <AdminSelect value={quote.status_id || ""} onValueChange={value => void updateStatus(quote.id, value)} options={statuses.map(status => ({ value: status.id, label: status.name }))} className="h-9 text-xs" ariaLabel="Alterar status" />}</div>}
            </article>;
          })}</div>
          <div className="hidden overflow-x-auto md:block"><table className="min-w-[850px]"><thead><tr>{showProtocol && <th className="text-left">Protocolo</th>}{showCustomer && <th className="text-left">Cliente</th>}{showDocument && <th className="text-left">CPF/CNPJ</th>}{showServiceBrand && <th className="text-left">Serviço / Marca</th>}{showStatus && <th className="text-left">Status</th>}{showCreatedAt && <th className="text-left">Recebido em</th>}{showActions && <th className="text-right">Ações</th>}</tr></thead><tbody>{quotes.map(quote => { const customer = quote.customer as any; return <tr key={quote.id} onClick={() => openDetails(quote)} className="cursor-default">{showProtocol && <td className="font-mono text-xs font-black text-[#0057e7]">{quote.protocol || quote.id.slice(0,8)}</td>}{showCustomer && <td><p className="font-bold text-[#0d1b2e]">{customer?.full_name || customer?.trade_name || "—"}</p><p className="text-xs text-[#5a6a82]">{formatPhone(customer?.whatsapp || customer?.phone)}</p></td>}{showDocument && <td className="text-xs text-[#5a6a82]">{customer?.customer_type === "PJ" ? formatCnpj(customer?.cnpj || "") : formatCpf(customer?.document || "")}</td>}{showServiceBrand && <td className="text-xs text-[#5a6a82]">{(quote.service as any)?.title || "—"} · {(quote.brand as any)?.name || "—"}</td>}{showStatus && <td><StatusBadge status={quote.statusName || "Sem status"} color={quote.request_status?.color} /></td>}{showCreatedAt && <td className="text-xs text-[#5a6a82]">{formatDateTime(quote.created_at)}</td>}{showActions && <td onClick={event => event.stopPropagation()}><div className="flex justify-end">{canChangeStatus && <div className="w-40"><AdminSelect value={quote.status_id || ""} onValueChange={value => void updateStatus(quote.id, value)} options={statuses.map(status => ({ value: status.id, label: status.name }))} className="h-9 text-xs" ariaLabel="Alterar status" /></div>}</div></td>}</tr>; })}</tbody></table></div>
        </>}
        <PaginationBar page={safePage} pageSize={pageSize} totalItems={totalItems} onPageChange={setPage} onPageSizeChange={nextPageSize => { setPageSize(nextPageSize); setPage(1); }} />
      </AdminCard>}
    </>}

    {routeResourceId && !detail && <AdminCard className="p-8"><LoadingState /></AdminCard>}
    {detail && canViewDetails && <AdminPage open onClose={closeDetails} breadcrumb={`Orçamentos > ${detail.protocol || detail.id.slice(0, 8)}`} title={detail.protocol || `Orçamento #${detail.id.slice(0, 8)}`} subtitle="Detalhes da solicitação de orçamento">
      <div className="min-w-0 space-y-4 p-3 sm:p-5">
        <Section title="Dados pessoais / empresariais"><div className="grid min-w-0 gap-3 sm:grid-cols-2"><InfoRow label="Tipo" value={(detail.customer as any)?.customer_type === "PJ" ? "Pessoa Jurídica" : "Pessoa Física"} />{(detail.customer as any)?.customer_type === "PJ" ? <><InfoRow label="Nome fantasia" value={(detail.customer as any)?.trade_name || (detail.customer as any)?.full_name} /><InfoRow label="Razão social" value={(detail.customer as any)?.legal_name} /><InfoRow label="CNPJ" value={(detail.customer as any)?.cnpj ? formatCnpj((detail.customer as any).cnpj) : null} /></> : <><InfoRow label="Nome completo" value={(detail.customer as any)?.full_name} /><InfoRow label="CPF" value={(detail.customer as any)?.document ? formatCpf((detail.customer as any).document) : null} /></>}<InfoRow label="E-mail" value={(detail.customer as any)?.email} /><InfoRow label="Telefone" value={formatPhone((detail.customer as any)?.phone)} /><InfoRow label="WhatsApp" value={formatPhone((detail.customer as any)?.whatsapp)} /></div></Section>
        <Section title="Dados do orçamento"><div className="grid min-w-0 gap-3 sm:grid-cols-2"><InfoRow label="Protocolo" value={detail.protocol || detail.id} /><InfoRow label="Serviço" value={(detail.service as any)?.title} /><InfoRow label="Marca" value={(detail.brand as any)?.name} /><InfoRow label="Produto" value={(detail.product as any)?.name} /><InfoRow label="Data de criação" value={formatDateTime(detail.created_at)} /><InfoRow label="Valor estimado" value={detail.estimated_price == null ? null : formatCurrency(detail.estimated_price)} /></div>{detail.customer_message && <div className="mt-4"><InfoRow label="Mensagem do cliente" value={detail.customer_message} /></div>}</Section>
      </div>
      <div className="sticky bottom-0 flex flex-col gap-2 border-t border-[#0d1b2e]/8 bg-white px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5 sm:py-4"><div className="grid min-w-0 grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center">{canChangeStatus && <div className="min-w-0 sm:min-w-36"><AdminSelect value={detail.status_id || ""} onValueChange={value => void updateStatus(detail.id, value)} options={statuses.map(status => ({ value: status.id, label: status.name }))} className="py-2 text-sm" ariaLabel="Alterar status do orçamento" /></div>}{canConvertToOrder && <AdminButton className="w-full sm:w-auto" onClick={async () => {
        const { data: existing } = await findServiceOrderByQuote(detail.id);
        if (existing) { setToast({ msg: `OS ${existing.os_number || existing.id.slice(0,8)} já existe para este orçamento.`, type: "error" }); return; }
        const { data: availableStatuses, error: statusError } = await listOrderStatuses();
        const status = initialOrderStatus(availableStatuses || []);
        if (statusError || !status?.id) { setToast({ msg: "Não foi possível identificar um status inicial válido para a OS.", type: "error" }); return; }
        const { error } = await createServiceOrderFromQuote({ service_id: detail.service_id, quote_request_id: detail.id, customer_id: detail.customer_id, status_id: status.id, customer_notes: detail.customer_message || null });
        if (error) { setToast({ msg: `Erro ao criar OS: ${error.message}`, type: "error" }); return; }
        closeDetails();
        setToast({ msg: "OS criada com sucesso e vinculada ao orçamento.", type: "success" });
        await syncQuotes();
        onNavigate?.("orders");
      }}><ClipboardList size={13} /> Converter em OS</AdminButton>}</div><BtnSecondary onClick={closeDetails} className="w-full sm:w-auto">Fechar</BtnSecondary></div>
    </AdminPage>}
  </div>;
}

function SearchField({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return <div className="relative min-w-0"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#5a6a82]" /><input value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} className={cn(INPUT, "h-[42px] w-full pl-9 text-xs")} /></div>;
}

function MobileSearchField({ value, onChange, placeholder, inputMode }: { value: string; onChange: (value: string) => void; placeholder: string; inputMode?: "numeric" }) {
  return <div className="relative min-w-0"><Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#5a6a82]" /><input inputMode={inputMode} value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} className={cn(INPUT, "h-[42px] w-full pl-9 text-xs")} /></div>;
}

function MobileInfo({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wide text-[#8a96a8]">{label}</p><p className="truncate text-xs font-medium text-[#5a6a82]">{value}</p></div>;
}
