import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownWideNarrow, ArrowUpDown, ArrowUpNarrowWide, Check, ChevronDown, ClipboardList, Eraser, FileText, RefreshCw, Search } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { queryKeys } from "@/infrastructure/query/query-keys";
import { createServiceOrderFromQuote, findServiceOrderByQuote, insertQuoteStatusHistory, listOrderStatuses, listQuotes, listRequestStatuses, updateQuoteStatus } from "../infrastructure/quotes.repository";
import type { AdminTab } from "@/features/admin-shell/domain/admin.types";
import { initialOrderStatus } from "@/features/orders/domain/order-status";
import { AdminButton, AdminCard, AdminPage, BtnSecondary, PageHeader, Section } from "@/shared/ui/admin/AdminLayout";
import { AdminSearchPanel } from "@/shared/ui/admin/AdminSearchPanel";
import { cn, formatCnpj, formatCpf, formatPhone } from "@/shared/domain/formatters";
import { EmptyState, LoadingState, Toast } from "@/shared/ui/admin/AdminFeedback";
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
const normalizeText = (value: unknown) => String(value ?? "").trim().toLocaleLowerCase("pt-BR");

export function TabQuotes({ onNavigate, routeResourceId, onRouteChange }: TabQuotesProps) {
  const { user, hasPermission } = useAuth();
  const canViewTable = hasPermission("quotes.table.view");
  const canViewDetails = hasPermission("quotes.details.view");
  const canChangeStatus = hasPermission("quotes.status.change");
  const canConvertToOrder = hasPermission("quotes.convert_to_order");
  const canRefresh = hasPermission("quotes.refresh");
  const showProtocol = hasPermission("quotes.table.protocol");
  const showCustomer = hasPermission("quotes.table.customer");
  const showDocument = hasPermission("quotes.table.document");
  const showServiceBrand = hasPermission("quotes.table.service_brand");
  const showStatus = hasPermission("quotes.table.status");
  const showCreatedAt = hasPermission("quotes.table.created_at");
  const showActions = hasPermission("quotes.table.actions");
  const queryClient = useQueryClient();
  const quotesQuery = useQuery({
    queryKey: queryKeys.quotes.lists(), enabled: canViewTable || canViewDetails,
    queryFn: async () => { const [quotesResult, statusResult] = await Promise.all([listQuotes(), listRequestStatuses()]); if (quotesResult.error) throw quotesResult.error; if (statusResult.error) throw statusResult.error; return { quotes: (quotesResult.data || []).map((quote: any) => ({ ...quote, statusName: quote.request_status?.name || "Sem status" })), statuses: statusResult.data || [] }; },
  });
  const quotes = quotesQuery.data?.quotes ?? [];
  const statuses = quotesQuery.data?.statuses ?? [];
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

  useEffect(() => { if (quotesQuery.error) setToast({ msg: `Erro ao carregar orçamentos: ${quotesQuery.error instanceof Error ? quotesQuery.error.message : String(quotesQuery.error)}`, type: "error" }); }, [quotesQuery.error]);
  useEffect(() => {
    if (!routeResourceId) { if (detail) setDetail(null); return; }
    if (!canViewDetails || detail?.id === routeResourceId) return;
    const quote = quotes.find(item => item.id === routeResourceId);
    if (quote) setDetail(quote);
  }, [routeResourceId, quotes, detail?.id, canViewDetails]);
  const syncQuotes = async () => { await Promise.all([queryClient.invalidateQueries({ queryKey: queryKeys.quotes.all }), queryClient.invalidateQueries({ queryKey: queryKeys.customers.all }), queryClient.invalidateQueries({ queryKey: queryKeys.admin.dashboard() })]); };
  const updateStatus = async (id: string, statusId: string) => { if (!canChangeStatus) return; const selectedStatus = statuses.find(status => status.id === statusId); const { error: updateError } = await updateQuoteStatus(id, statusId); if (updateError) { setToast({ msg: `Erro ao atualizar status: ${updateError.message}`, type: "error" }); return; } const { error: historyError } = await insertQuoteStatusHistory(id, statusId, user?.id || null); if (historyError) console.warn("[ADMIN] quote status history warning:", historyError.message); if (detail?.id === id) setDetail({ ...detail, status_id: statusId, statusName: selectedStatus?.name || "Sem status" }); setToast({ msg: "Status atualizado!", type: "success" }); await syncQuotes(); };
  const openDetails = (quote: any) => { if (!canViewDetails) return; if (onRouteChange) onRouteChange(quote.id, null); else setDetail(quote); };
  const closeDetails = () => { setDetail(null); onRouteChange?.(null, null); };
  const fmtDate = (d: string) => new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" });

  const filtered = quotes.filter(q => {
    const customer = q.customer as any;
    const customerName = customer?.full_name || "";
    const customerTradeName = customer?.trade_name || "";
    const customerWa = String(customer?.whatsapp || "");
    const customerDoc = customer?.document || customer?.cnpj || "";
    const protocol = String(q.protocol || "");
    const desktopNeedle = normalizeText(search);
    const desktopMatch = !desktopNeedle || normalizeText(customerName).includes(desktopNeedle) || normalizeText(customerTradeName).includes(desktopNeedle) || customerWa.includes(search) || normalizeDocument(customerDoc).includes(normalizeDocument(search)) || normalizeText(protocol).includes(desktopNeedle);
    const customerNeedle = normalizeText(mobileCustomerSearch);
    const matchCustomer = !customerNeedle || normalizeText(customerName).includes(customerNeedle) || normalizeText(customerTradeName).includes(customerNeedle);
    const documentNeedle = normalizeDocument(mobileDocumentSearch);
    const matchDocument = !documentNeedle || normalizeDocument(customerDoc).includes(documentNeedle);
    const whatsappNeedle = normalizeDocument(mobileWhatsappSearch);
    const matchWhatsapp = !whatsappNeedle || normalizeDocument(customerWa).includes(whatsappNeedle);
    const protocolNeedle = normalizeText(mobileProtocolSearch);
    const matchProtocol = !protocolNeedle || normalizeText(protocol).includes(protocolNeedle);
    return desktopMatch && matchCustomer && matchDocument && matchWhatsapp && matchProtocol && (!filterStatus || q.status_id === filterStatus);
  });

  const sortedFiltered = orderSort ? [...filtered].sort((a, b) => {
    const aProtocol = String(a.protocol || a.id || "");
    const bProtocol = String(b.protocol || b.id || "");
    const comparison = aProtocol.localeCompare(bProtocol, "pt-BR", { numeric: true, sensitivity: "base" });
    return orderSort === "asc" ? comparison : -comparison;
  }) : filtered;

  const totalPages = Math.max(1, Math.ceil(sortedFiltered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedQuotes = sortedFiltered.slice((safePage - 1) * pageSize, safePage * pageSize);
  useEffect(() => { setPage(1); }, [search, filterStatus, mobileCustomerSearch, mobileDocumentSearch, mobileWhatsappSearch, mobileProtocolSearch, orderSort]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);
  const InfoRow = ({ label, value }: { label: string; value?: string | null }) => value ? <div className="min-w-0"><p className="mb-0.5 break-words text-[10px] font-bold uppercase text-[#5a6a82]">{label}</p><p className="break-words whitespace-pre-line text-sm font-medium text-[#0d1b2e]">{value}</p></div> : null;
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
    if (mobileFilter === "document") return <MobileSearchField value={mobileDocumentSearch} onChange={setMobileDocumentSearch} placeholder="Digite o CPF ou CNPJ" inputMode="numeric" />;
    if (mobileFilter === "whatsapp") return <MobileSearchField value={mobileWhatsappSearch} onChange={setMobileWhatsappSearch} placeholder="Digite o WhatsApp" inputMode="numeric" />;
    if (mobileFilter === "protocol") return <MobileSearchField value={mobileProtocolSearch} onChange={setMobileProtocolSearch} placeholder="Digite o protocolo" />;
    return <AdminSelect value={filterStatus} onValueChange={value => { setFilterStatus(value); setPage(1); }} options={[{ value: "", label: "Todos os status" }, ...statuses.map(status => ({ value: status.id, label: status.name }))]} className="h-[42px] text-xs" ariaLabel="Filtrar orçamentos por status" />;
  };

  const sortMenu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={`Ordenação atual: ${sortLabel}`} title={sortLabel} className={cn("inline-flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-lg border bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-[#0057e7]/40", orderSort ? "border-[#0057e7] bg-[#eef5ff] text-[#0057e7]" : "border-[#0d1b2e]/15 text-[#5a6a82]")}><SortIcon size={17} className="text-[#0057e7]" /></button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[220px]">
        {([["", "Ordenação padrão", ArrowUpDown], ["asc", "Protocolo crescente", ArrowUpNarrowWide], ["desc", "Protocolo decrescente", ArrowDownWideNarrow]] as const).map(([value, label, Icon]) => <DropdownMenuItem key={value || "default"} onSelect={() => setOrderSort(value)} className={cn("cursor-pointer", orderSort === value && "bg-[#eef5ff] font-bold text-[#0057e7]")}><Icon size={15} /><span>{label}</span>{orderSort === value && <Check size={15} className="ml-auto text-[#0057e7]" />}</DropdownMenuItem>)}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return <div className="min-w-0 space-y-5">
    {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
    {!routeResourceId && <>
      <PageHeader title="Orçamentos" subtitle={`${quotes.length} solicitaç${quotes.length !== 1 ? "ões" : "ão"} recebida${quotes.length !== 1 ? "s" : ""}`} actions={canRefresh ? <AdminButton variant="secondary" onClick={() => void quotesQuery.refetch()} disabled={quotesQuery.isFetching} className="w-full border-[#0057e7]/30 text-xs text-[#0057e7] hover:bg-[#0057e7]/5 sm:w-auto"><RefreshCw size={13} className={quotesQuery.isFetching ? "animate-spin" : ""} /> Atualizar</AdminButton> : null} />
      {canViewTable && <AdminSearchPanel title="Buscar orçamentos">
        <div className="space-y-3 md:hidden">
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" aria-label={`Buscar por: ${mobileFilterLabel}`} className="flex h-[42px] min-w-0 flex-1 items-center justify-between gap-2 rounded-lg border border-[#0d1b2e]/15 bg-white px-3 text-left text-xs font-bold text-[#0d1b2e] shadow-sm focus:outline-none focus:ring-2 focus:ring-[#0057e7]/40"><span className="min-w-0 truncate"><span className="font-medium text-[#5a6a82]">Buscar por:</span> {mobileFilterLabel}</span><ChevronDown size={15} className="shrink-0 text-[#5a6a82]" /></button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-[220px]">
                {quoteMobileFilters.map(option => <DropdownMenuItem key={option.value} onSelect={() => setMobileFilter(option.value)} className={cn("cursor-pointer", mobileFilter === option.value && "bg-[#eef5ff] font-bold text-[#0057e7]")}><Search size={14} /><span>{option.label}</span>{mobileFilter === option.value && <Check size={14} className="ml-auto text-[#0057e7]" />}</DropdownMenuItem>)}
              </DropdownMenuContent>
            </DropdownMenu>
            {sortMenu}
          </div>
          <div className="min-w-0">{renderMobileFilter()}</div>
          {hasMobileFilters && <div className="flex justify-end"><button type="button" onClick={clearMobileFilters} aria-label="Limpar filtros" title="Limpar filtros" className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-red-200 bg-white text-red-600 hover:bg-red-50"><Eraser size={15} /></button></div>}
        </div>
        <div className="hidden min-w-0 gap-3 md:grid md:grid-cols-[minmax(0,1fr)_220px]"><div className="relative min-w-0"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5a6a82]" /><input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Cliente, CPF/CNPJ, WhatsApp ou protocolo" className={cn(INPUT, "h-[42px] w-full py-2 pl-9 text-xs")} /></div><AdminSelect value={filterStatus} onValueChange={value => { setFilterStatus(value); setPage(1); }} options={[{ value: "", label: "Todos os status" }, ...statuses.map(status => ({ value: status.id, label: status.name }))]} className="h-[42px] text-xs" ariaLabel="Filtrar orçamentos por status" /></div>
      </AdminSearchPanel>}
      {canViewTable && <AdminCard>
        {quotesQuery.isPending ? <LoadingState /> : sortedFiltered.length === 0 ? <EmptyState icon={FileText} title="Nenhuma solicitação" message="As solicitações de orçamento aparecem aqui." /> : <>
          <div className="divide-y divide-[#0d1b2e]/8 md:hidden">{pagedQuotes.map(q => {
            const customer = q.customer as any;
            const customerName = customer?.customer_type === "PJ" ? (customer?.trade_name || customer?.full_name || "—") : (customer?.full_name || "—");
            const document = customer?.customer_type === "PJ" ? (customer?.cnpj ? formatCnpj(customer.cnpj) : "—") : (customer?.document ? formatCpf(customer.document) : "—");
            return <article key={q.id} role={canViewDetails ? "button" : undefined} tabIndex={canViewDetails ? 0 : undefined} onClick={() => openDetails(q)} onKeyDown={event => { if (canViewDetails && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); openDetails(q); } }} className="min-w-0 p-4 transition-colors active:bg-[#f5f7fa]">
              <div className="flex min-w-0 items-start justify-between gap-3"><div className="min-w-0 flex-1">{showProtocol && <div className="flex items-center gap-2"><span className="h-8 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: (q.request_status as any)?.color || "transparent" }} /><span className="font-mono text-xs font-bold text-[#0057e7]">{q.protocol || q.id.slice(0, 8)}</span></div>}{showCustomer && <p className="mt-1 truncate text-sm font-bold text-[#0d1b2e]">{customerName}</p>}</div>{showCreatedAt && <span className="shrink-0 text-[10px] font-medium text-[#8a96a8]">{fmtDate(q.created_at)}</span>}</div>
              <div className="mt-3 grid min-w-0 grid-cols-1 gap-2 xs:grid-cols-2">{showDocument && <MobileInfo label={customer?.customer_type === "PJ" ? "CNPJ" : "CPF"} value={document} />}{showCustomer && <MobileInfo label="WhatsApp" value={formatPhone(customer?.whatsapp) || "—"} />}{showServiceBrand && <MobileInfo label="Serviço" value={(q.service as any)?.title || "—"} />}{showServiceBrand && <MobileInfo label="Marca" value={(q.brand as any)?.name || "—"} />}</div>
              {(showStatus || showActions) && <div onClick={event => event.stopPropagation()} className="mt-3 flex min-w-0 items-center gap-2 border-t border-[#0d1b2e]/8 pt-3">{showStatus && (canChangeStatus ? <div className="min-w-0 flex-1"><AdminSelect value={q.status_id || ""} onValueChange={value => updateStatus(q.id, value)} options={statuses.map(status => ({ value: status.id, label: status.name }))} className="h-9 min-h-9 text-[11px] font-bold" ariaLabel={`Status do orçamento ${q.protocol || ""}`} /></div> : <span className="rounded-full bg-[#f5f7fa] px-2.5 py-1 text-[10px] font-semibold text-[#5a6a82]">{q.statusName}</span>)}{showActions && canViewDetails && <AdminButton variant="ghost" size="sm" onClick={() => openDetails(q)} className="ml-auto shrink-0 px-0 py-1 hover:bg-transparent hover:underline">Detalhes</AdminButton>}</div>}
            </article>;
          })}</div>
          <div className="hidden overflow-x-auto md:block"><table className="min-w-[700px]"><thead><tr>{showProtocol && <th className="text-left">Protocolo</th>}{showCustomer && <th className="text-left">Cliente</th>}{showDocument && <th className="text-left">Tipo / documento</th>}{showServiceBrand && <th className="text-left">Serviço / Marca</th>}{showStatus && <th className="text-left">Status</th>}{showCreatedAt && <th className="text-left">Data</th>}{showActions && <th className="text-right">Ação</th>}</tr></thead><tbody>{pagedQuotes.map(q => <tr key={q.id} onClick={() => openDetails(q)} className="cursor-default">{showProtocol && <td><div className="flex items-center gap-2"><span className="h-8 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: (q.request_status as any)?.color || "transparent" }} /><span className="font-mono text-xs font-bold text-[#0057e7]">{q.protocol || q.id.slice(0, 8)}</span></div></td>}{showCustomer && <td><p className="text-sm font-bold text-[#0d1b2e]">{(q.customer as any)?.customer_type === "PJ" ? ((q.customer as any)?.trade_name || (q.customer as any)?.full_name || "—") : ((q.customer as any)?.full_name || "—")}</p><p className="text-xs text-[#5a6a82]">{formatPhone((q.customer as any)?.whatsapp)}</p></td>}{showDocument && <td className="font-mono text-xs text-[#5a6a82]"><span className="font-bold text-[#0057e7]">{(q.customer as any)?.customer_type === "PJ" ? "PJ" : "PF"}</span> · {(q.customer as any)?.customer_type === "PJ" ? ((q.customer as any)?.cnpj ? formatCnpj((q.customer as any).cnpj) : "—") : ((q.customer as any)?.document ? formatCpf((q.customer as any).document) : "—")}</td>}{showServiceBrand && <td className="text-xs text-[#5a6a82]">{(q.service as any)?.title && <div className="font-medium text-[#0d1b2e]">{(q.service as any).title}</div>}{(q.brand as any)?.name && <div>{(q.brand as any).name}</div>}{!(q.service as any)?.title && !(q.brand as any)?.name && "—"}</td>}{showStatus && <td>{canChangeStatus ? <div className="w-36" onClick={event => event.stopPropagation()}><AdminSelect value={q.status_id || ""} onValueChange={value => updateStatus(q.id, value)} options={statuses.map(status => ({ value: status.id, label: status.name }))} className="min-h-8 py-1 text-xs font-bold" ariaLabel={`Status do orçamento ${q.protocol || ""}`} /></div> : <span className="text-xs text-[#5a6a82]">{q.statusName}</span>}</td>}{showCreatedAt && <td className="text-xs text-[#5a6a82]">{fmtDate(q.created_at)}</td>}{showActions && <td onClick={event => event.stopPropagation()} className="text-right">{canViewDetails && <AdminButton variant="ghost" size="sm" onClick={() => openDetails(q)} className="px-0 py-1 hover:bg-transparent hover:underline">Ver detalhes</AdminButton>}</td>}</tr>)}</tbody></table></div>
        </>}
        <PaginationBar page={safePage} pageSize={pageSize} totalItems={sortedFiltered.length} onPageChange={nextPage => setPage(Math.max(1, Math.min(nextPage, totalPages)))} onPageSizeChange={nextPageSize => { setPageSize(nextPageSize); setPage(1); }} />
      </AdminCard>}
    </>}
    {routeResourceId && !detail && <AdminCard className="p-8"><LoadingState /></AdminCard>}
    {detail && canViewDetails && <AdminPage open={true} onClose={closeDetails} breadcrumb={`Orçamentos > ${detail.protocol || detail.id.slice(0, 8)}`} title={detail.protocol || `Orçamento #${detail.id.slice(0, 8)}`} subtitle="Detalhes da solicitação de orçamento"><div className="min-w-0 space-y-4 p-3 sm:p-5"><Section title="Dados pessoais / empresariais"><div className="grid min-w-0 gap-3 sm:grid-cols-2"><InfoRow label="Tipo" value={(detail.customer as any)?.customer_type === "PJ" ? "Pessoa Jurídica" : "Pessoa Física"} />{(detail.customer as any)?.customer_type === "PJ" ? <><InfoRow label="Nome fantasia" value={(detail.customer as any)?.trade_name || (detail.customer as any)?.full_name} /><InfoRow label="Razão social" value={(detail.customer as any)?.legal_name} /><InfoRow label="CNPJ" value={(detail.customer as any)?.cnpj ? formatCnpj((detail.customer as any).cnpj) : null} /></> : <><InfoRow label="Nome completo" value={(detail.customer as any)?.full_name} /><InfoRow label="CPF" value={(detail.customer as any)?.document ? formatCpf((detail.customer as any).document) : null} /></>}<InfoRow label="E-mail" value={(detail.customer as any)?.email} /><InfoRow label="Telefone" value={formatPhone((detail.customer as any)?.phone)} /><InfoRow label="WhatsApp" value={formatPhone((detail.customer as any)?.whatsapp)} /></div></Section><Section title="Dados do orçamento"><div className="grid min-w-0 gap-3 sm:grid-cols-2"><InfoRow label="Protocolo" value={detail.protocol || detail.id} /><InfoRow label="Serviço" value={(detail.service as any)?.title} /><InfoRow label="Marca" value={(detail.brand as any)?.name} /><InfoRow label="Produto" value={(detail.product as any)?.name} /><InfoRow label="Data de criação" value={fmtDate(detail.created_at)} /><InfoRow label="Valor estimado" value={detail.estimated_price == null ? null : `R$ ${Number(detail.estimated_price).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`} /></div>{detail.customer_message && <div className="mt-4"><InfoRow label="Mensagem do cliente" value={detail.customer_message} /></div>}</Section></div><div className="sticky bottom-0 flex flex-col gap-2 border-t border-[#0d1b2e]/8 bg-white px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5 sm:py-4"><div className="grid min-w-0 grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center">{canChangeStatus && <div className="min-w-0 sm:min-w-36"><AdminSelect value={detail.status_id || ""} onValueChange={value => updateStatus(detail.id, value)} options={statuses.map(status => ({ value: status.id, label: status.name }))} className="py-2 text-sm" ariaLabel="Alterar status do orçamento" /></div>}{canConvertToOrder && <AdminButton className="w-full sm:w-auto" onClick={async () => { if (!detail || !canConvertToOrder) return; const { data: existing } = await findServiceOrderByQuote(detail.id); if (existing) { setToast({ msg: `OS ${existing.os_number || existing.id.slice(0,8)} já existe para este orçamento.`, type: "error" }); return; } const { data: availableStatuses, error: statusError } = await listOrderStatuses(); const status = initialOrderStatus(availableStatuses || []); if (statusError || !status?.id) { setToast({ msg: "Não foi possível identificar um status inicial válido para a OS.", type: "error" }); return; } const { error } = await createServiceOrderFromQuote({ service_id: detail.service_id, quote_request_id: detail.id, customer_id: detail.customer_id, status_id: status.id, customer_notes: detail.customer_message || null }); if (error) { setToast({ msg: `Erro ao criar OS: ${error.message}`, type: "error" }); return; } closeDetails(); setToast({ msg: "OS criada com sucesso e vinculada ao orçamento.", type: "success" }); if (onNavigate) setTimeout(() => onNavigate("orders"), 1200); }}><ClipboardList size={13} /> Converter em OS</AdminButton>}</div><BtnSecondary onClick={closeDetails} className="w-full sm:w-auto">Fechar</BtnSecondary></div></AdminPage>}
  </div>;
}

function MobileInfo({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wide text-[#8a96a8]">{label}</p><p className="truncate text-xs font-medium text-[#5a6a82]">{value}</p></div>;
}

function MobileSearchField({ value, onChange, placeholder, inputMode }: { value: string; onChange: (value: string) => void; placeholder: string; inputMode?: "numeric" }) {
  return <div className="relative min-w-0"><Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#5a6a82]" /><input inputMode={inputMode} value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} className={cn(INPUT, "h-[42px] w-full pl-9 text-xs")} /></div>;
}
