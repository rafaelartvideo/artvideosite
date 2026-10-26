import { systemErrorMessage } from "@/shared/domain/error-message";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownWideNarrow, ArrowUpDown, ArrowUpNarrowWide, Check, ClipboardList, Eraser, FileText, MapPin, MessageCircle, Search } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { queryKeys } from "@/infrastructure/query/query-keys";
import {
  createServiceOrderFromQuote,
  findServiceOrderByQuote,
  getQuote,
  listOrderStatuses,
  listQuotesPage,
  listRequestStatuses,
  updateQuoteStatus,
} from "../infrastructure/quotes.repository";
import type { AdminTab } from "@/features/admin-shell/domain/admin.types";
import { initialOrderStatus } from "@/features/orders/domain/order-status";
import { AdminButton, AdminCard, AdminDialog, AdminStickyToolbar, BtnSecondary, PageHeader, Section } from "@/shared/ui/admin/AdminLayout";
import { AdminSearchPanel, AdminSearchClearButton, AdminSearchSortMenu } from "@/shared/ui/admin/AdminSearchPanel";
import { AdminMobileSearchSwitch } from "@/shared/ui/admin/AdminMobileSearchSwitch";
import { cn, formatCnpj, formatCpf, formatPhone, formatCurrency, formatDateTime } from "@/shared/domain/formatters";
import { EmptyState, LoadingState, StatusBadge, Toast } from "@/shared/ui/admin/AdminFeedback";
import { AdminSelect, INPUT } from "@/shared/ui/admin/AdminFormControls";
import { PaginationBar } from "@/shared/ui/admin/AdminPagination";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/shared/ui/primitives/dropdown-menu";
import { QuoteSacDigitalDialog } from "./QuoteSacDigitalDialog";
import { OperationProgressDialog } from "@/shared/ui/admin/OperationProgressDialog";
import { parseQuoteRequestMessage, quoteRequestAddress, quoteAddressLabel } from "../domain/quote-request-details.mjs";

type TabQuotesProps = {
  onNavigate?: (tab: AdminTab) => void;
  routeResourceId?: string | null;
  onRouteChange?: (resourceId: string | null, subpage?: string | null) => void;
  embedded?: boolean;
};

type QuoteMobileFilter = "customer" | "document" | "protocol" | "status";
type QuoteAction = "AGUARDANDO_APROVACAO" | "APROVADO" | "REPROVADO" | "RENEGOCIACAO";
type QuoteSort = "" | "asc" | "desc";

const quoteMobileFilters: Array<{ value: QuoteMobileFilter; label: string }> = [
  { value: "customer", label: "Cliente" },
  { value: "document", label: "CPF / CNPJ" },
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

export function TabQuotes({ onNavigate, routeResourceId, onRouteChange, embedded = false }: TabQuotesProps) {
  const { user, hasPermission, activeOrganizationId } = useAuth();
  const organizationId = activeOrganizationId || "";
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

  const [filterStatus, setFilterStatus] = useState("");
  const [mobileFilter, setMobileFilter] = useState<QuoteMobileFilter>("customer");
  const [mobileCustomerSearch, setMobileCustomerSearch] = useState("");
  const [mobileDocumentSearch, setMobileDocumentSearch] = useState("");
  const [mobileProtocolSearch, setMobileProtocolSearch] = useState("");
  const [orderSort, setOrderSort] = useState<QuoteSort>("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [detail, setDetail] = useState<any>(null);
  const [confirmAction, setConfirmAction] = useState<QuoteAction | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [progressState, setProgressState] = useState<"loading" | "success" | null>(null);
  const [sacQuoteOpen, setSacQuoteOpen] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: "success" | "error" } | null>(null);

  const debouncedCustomerSearch = useDebouncedValue(mobileCustomerSearch);
  const debouncedDocumentSearch = useDebouncedValue(mobileDocumentSearch);
  const debouncedProtocolSearch = useDebouncedValue(mobileProtocolSearch);

  const statusesQuery = useQuery({
    queryKey: [...queryKeys.quotes.all, organizationId, "statuses"],
    queryFn: async () => {
      const { data, error } = await listRequestStatuses(organizationId);
      if (error) throw error;
      return data || [];
    },
    enabled: Boolean(organizationId) && (canViewTable || canViewDetails),
  });
  const statuses = statusesQuery.data ?? [];

  const listFilters = useMemo(() => ({
    page,
    pageSize,
    search: "",
    customerSearch: debouncedCustomerSearch,
    documentSearch: debouncedDocumentSearch,
    whatsappSearch: "",
    protocolSearch: debouncedProtocolSearch,
    statusId: filterStatus,
    sort: orderSort,
  }), [page, pageSize, debouncedCustomerSearch, debouncedDocumentSearch, debouncedProtocolSearch, filterStatus, orderSort]);

  const quotesQuery = useQuery({
    queryKey: [...queryKeys.quotes.lists(), organizationId, listFilters],
    enabled: Boolean(organizationId) && canViewTable,
    queryFn: () => listQuotesPage(organizationId, listFilters),
  });
  const quotes = quotesQuery.data?.items ?? [];
  const totalItems = quotesQuery.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(page, totalPages);

  useEffect(() => {
    if (quotesQuery.error || statusesQuery.error) {
      const error = quotesQuery.error || statusesQuery.error;
      setToast({ msg: `Erro ao carregar orçamentos: ${systemErrorMessage(error)}`, type: "error" });
    }
  }, [quotesQuery.error, statusesQuery.error]);

  useEffect(() => {
    setPage(1);
  }, [filterStatus, mobileCustomerSearch, mobileDocumentSearch, mobileProtocolSearch, orderSort]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  useEffect(() => {
    let cancelled = false;
    if (!routeResourceId) {
      if (detail) setDetail(null);
      return () => { cancelled = true; };
    }
    if (!canViewDetails || detail?.id === routeResourceId) return () => { cancelled = true; };
    if (!organizationId) return () => { cancelled = true; };
    void getQuote(organizationId, routeResourceId).then(quote => {
      if (cancelled) return;
      if (!quote) {
        setToast({ msg: "Orçamento não encontrado.", type: "error" });
        onRouteChange?.(null, null);
        return;
      }
      setDetail(quote);
    }).catch(error => {
      if (!cancelled) setToast({ msg: `Erro ao carregar orçamento: ${systemErrorMessage(error)}`, type: "error" });
    });
    return () => { cancelled = true; };
  }, [routeResourceId, detail?.id, canViewDetails, organizationId]);

  const syncQuotes = () => {
    void queryClient.invalidateQueries({ queryKey: queryKeys.quotes.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.customers.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.admin.dashboards() });
  };

  const openDetails = (quote: any) => {
    if (!canViewDetails) return;
    setDetail(quote);

    if (onRouteChange) onRouteChange(quote.id, null);
  };
  const closeDetails = () => { setSacQuoteOpen(false); setDetail(null); setConfirmAction(null); onRouteChange?.(null, null); };

  const sortLabel = orderSort === "asc" ? "Protocolo crescente" : orderSort === "desc" ? "Protocolo decrescente" : "Ordenação padrão";
  const SortIcon = orderSort === "asc" ? ArrowUpNarrowWide : orderSort === "desc" ? ArrowDownWideNarrow : ArrowUpDown;
  const hasMobileFilters = Boolean(mobileCustomerSearch || mobileDocumentSearch || mobileProtocolSearch || filterStatus || orderSort);

  const clearMobileFilters = () => {
    setMobileCustomerSearch("");
    setMobileDocumentSearch("");
    setMobileProtocolSearch("");
    setFilterStatus("");
    setOrderSort("");
    setPage(1);
  };

  const renderMobileFilter = () => {
    if (mobileFilter === "customer") return <MobileSearchField value={mobileCustomerSearch} onChange={setMobileCustomerSearch} placeholder="Digite o nome do cliente" ariaLabel="Buscar por nome do cliente" />;
    if (mobileFilter === "document") return <MobileSearchField value={mobileDocumentSearch} onChange={value => setMobileDocumentSearch(formatDocumentSearch(value))} placeholder="Digite o CPF ou CNPJ" ariaLabel="Buscar por CPF ou CNPJ" inputMode="numeric" />;
    if (mobileFilter === "protocol") return <MobileSearchField value={mobileProtocolSearch} onChange={setMobileProtocolSearch} placeholder="Digite o protocolo" ariaLabel="Buscar por protocolo" />;
    return <AdminSelect value={filterStatus} onValueChange={value => { setFilterStatus(value); setPage(1); }} options={[{ value: "", label: "Todos os status" }, ...statuses.map(status => ({ value: status.id, label: status.name }))]} className="h-[42px] text-xs" ariaLabel="Filtrar orçamentos por status" />;
  };

  const sortMenu = (mobile = false) => <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <button
        type="button"
        aria-label={`Ordenação atual: ${sortLabel}`}
        title={`Ordenação: ${sortLabel}`}
        className={cn(
          "inline-flex shrink-0 items-center justify-center rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-2",
          mobile
            ? "h-[42px] w-[42px] border-[#0d1b2e]/15 bg-white text-[#5a6a82] shadow-sm focus-visible:ring-[#0057e7]/40"
            : "h-9 w-9 border-[#0d1b2e]/15 bg-white text-[#5a6a82] shadow-sm focus-visible:ring-[#0057e7]/40",
          orderSort && "border-[#0057e7] bg-[#eef5ff] text-[#0057e7]",
        )}
      >
        <SortIcon size={mobile ? 17 : 16} className={cn("shrink-0", mobile && "text-[#0057e7]")} />
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" className="min-w-[220px]">
      {([["", "Ordenação padrão", ArrowUpDown], ["asc", "Protocolo crescente", ArrowUpNarrowWide], ["desc", "Protocolo decrescente", ArrowDownWideNarrow]] as const).map(([value, label, Icon]) => <DropdownMenuItem key={value || "default"} onSelect={() => setOrderSort(value)} className={cn("cursor-pointer", orderSort === value && "bg-[#eef5ff] font-bold text-[#0057e7] focus:bg-[#eef5ff] focus:text-[#0057e7]")}><Icon size={15} className={orderSort === value ? "text-[#0057e7]" : "text-[#5a6a82]"} /><span>{label}</span>{orderSort === value && <Check size={15} className="ml-auto text-[#0057e7]" />}</DropdownMenuItem>)}
    </DropdownMenuContent>
  </DropdownMenu>;

  const InfoRow = ({ label, value }: { label: string; value?: string | null }) => value ? <div className="min-w-0"><p className="mb-0.5 break-words text-[10px] font-bold uppercase text-[#5a6a82]">{label}</p><p className="break-words whitespace-pre-line text-sm font-medium text-[#0d1b2e]">{value}</p></div> : null;

  const parsedQuote=detail?parseQuoteRequestMessage(detail.customer_message):null;
  const quoteAddress=detail?quoteRequestAddress(detail):null;
  const currentAddress=quoteAddress?.address;
  const displayAddress=quoteAddressLabel(quoteAddress);
  const mapsUrl=displayAddress?"https://www.google.com/maps/search/?api=1&query="+encodeURIComponent(displayAddress):"";
  const quoteWhatsapp=String(detail?.customer?.whatsapp||detail?.customer?.phone||"").replace(/\D/g,"");
  const canMessageQuote=hasPermission("sac_digital.messages.send") && Boolean(detail?.customer_id && quoteWhatsapp && organizationId);
  return <div className="min-w-0 space-y-5">
    {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

    <>
      {!embedded && <PageHeader title="Orçamentos" subtitle={`${totalItems} solicitaç${totalItems !== 1 ? "ões" : "ão"} recebida${totalItems !== 1 ? "s" : ""}`} />}
      {canViewTable && <AdminSearchPanel title="Buscar orçamentos" headerActions={<>
        {hasMobileFilters && <AdminSearchClearButton onClick={clearMobileFilters} />}
        <AdminSearchSortMenu value={orderSort} onChange={setOrderSort}
          options={[{ value: "", label: "Ordenação padrão" }, { value: "asc", label: "Protocolo crescente" }, { value: "desc", label: "Protocolo decrescente" }]} />
      </>}>
        <AdminMobileSearchSwitch
          value={mobileFilter}
          options={quoteMobileFilters}
          onChange={setMobileFilter}
        >
          {renderMobileFilter()}
        </AdminMobileSearchSwitch>
        <div className="hidden min-w-0 gap-2 md:grid md:grid-cols-4">
          <label className="min-w-0"><span className="mb-1 block text-xs font-semibold text-foreground">Cliente</span><SearchField value={mobileCustomerSearch} onChange={setMobileCustomerSearch} placeholder="Nome do cliente" /></label>
          <label className="min-w-0"><span className="mb-1 block text-xs font-semibold text-foreground">CPF/CNPJ</span><SearchField value={mobileDocumentSearch} onChange={value => setMobileDocumentSearch(formatDocumentSearch(value))} placeholder="CPF ou CNPJ" /></label>
          <label className="min-w-0"><span className="mb-1 block text-xs font-semibold text-foreground">Protocolo</span><SearchField value={mobileProtocolSearch} onChange={setMobileProtocolSearch} placeholder="Número do protocolo" /></label>
          <label className="min-w-0"><span className="mb-1 block text-xs font-semibold text-foreground">Status</span><AdminSelect value={filterStatus} onValueChange={setFilterStatus} options={[{ value: "", label: "Todos os status" }, ...statuses.map(status => ({ value: status.id, label: status.name }))]} className="h-9 text-xs" ariaLabel="Filtrar por status" /></label>
        </div>
      </AdminSearchPanel>}

      {canViewTable && <AdminCard className="[&_th]:md:py-2 [&_td]:md:py-2.5">
        {quotesQuery.isPending ? <LoadingState /> : quotes.length === 0 ? <EmptyState icon={FileText} title="Nenhum orçamento encontrado" message="Ajuste os filtros ou aguarde novas solicitações." /> : <>
          <div className="divide-y divide-[#0d1b2e]/8 md:hidden">{quotes.map(quote => {
            const customer = quote.customer as any;
            return <article key={quote.id} role={canViewDetails ? "button" : undefined} tabIndex={canViewDetails ? 0 : undefined} onClick={() => openDetails(quote)} className="space-y-3 p-4">
              <div className="flex items-start justify-between gap-3"><div className="min-w-0">{showProtocol && <p className="font-mono text-xs font-black text-[#0057e7]">{quote.protocol || quote.id.slice(0, 8)}</p>}{showCustomer && <p className="truncate text-sm font-bold text-[#0d1b2e]">{customer?.full_name || customer?.trade_name || "—"}</p>}</div>{showStatus && <StatusBadge status={quote.statusName || "Sem status"} color={quote.request_status?.color} />}</div>
              <div className="grid grid-cols-2 gap-2">{showDocument && <MobileInfo label="Documento" value={customer?.customer_type === "PJ" ? formatCnpj(customer?.cnpj || "") : formatCpf(customer?.document || "")} />}{showCreatedAt && <MobileInfo label="Recebido em" value={formatDateTime(quote.created_at)} />}{showServiceBrand && <MobileInfo label="Serviço" value={(quote.service as any)?.title || "—"} />}{showServiceBrand && <MobileInfo label="Marca" value={(quote.brand as any)?.name || "—"} />}</div>
              {showActions && <div onClick={event => event.stopPropagation()} className="border-t border-[#0d1b2e]/8 pt-3"><span className="text-xs text-muted-foreground">Abra o orçamento para gerenciar a aprovação.</span></div>}
            </article>;
          })}</div>
          <div className="hidden overflow-x-auto md:block"><table className="min-w-[850px]"><thead><tr>{showProtocol && <th className="text-left">Protocolo</th>}{showCustomer && <th className="text-left">Cliente</th>}{showDocument && <th className="text-left">CPF/CNPJ</th>}{showServiceBrand && <th className="text-left">Serviço / Marca</th>}{showStatus && <th className="text-left">Status</th>}{showCreatedAt && <th className="text-left">Recebido em</th>}{showActions && <th className="text-right">Ações</th>}</tr></thead><tbody>{quotes.map(quote => { const customer = quote.customer as any; return <tr key={quote.id} onClick={() => openDetails(quote)} className="cursor-default">{showProtocol && <td className="font-mono text-xs font-black text-[#0057e7]">{quote.protocol || quote.id.slice(0,8)}</td>}{showCustomer && <td><p className="font-bold text-[#0d1b2e]">{customer?.full_name || customer?.trade_name || "—"}</p><p className="text-xs text-[#5a6a82]">{formatPhone(customer?.whatsapp || customer?.phone)}</p></td>}{showDocument && <td className="text-xs text-[#5a6a82]">{customer?.customer_type === "PJ" ? formatCnpj(customer?.cnpj || "") : formatCpf(customer?.document || "")}</td>}{showServiceBrand && <td className="text-xs text-[#5a6a82]">{(quote.service as any)?.title || "—"} · {(quote.brand as any)?.name || "—"}</td>}{showStatus && <td><StatusBadge status={quote.statusName || "Sem status"} color={quote.request_status?.color} /></td>}{showCreatedAt && <td className="text-xs text-[#5a6a82]">{formatDateTime(quote.created_at)}</td>}{showActions && <td onClick={event => event.stopPropagation()}><div className="flex justify-end"><span className="text-xs text-muted-foreground">Abrir para avaliar</span></div></td>}</tr>; })}</tbody></table></div>
        </>}
        <PaginationBar page={safePage} pageSize={pageSize} totalItems={totalItems} onPageChange={setPage} onPageSizeChange={nextPageSize => { setPageSize(nextPageSize); setPage(1); }} />
      </AdminCard>}
    </>

    {routeResourceId && !detail && <AdminCard className="p-8"><LoadingState /></AdminCard>}
    {detail && canViewDetails && <AdminDialog open onClose={closeDetails} title={detail.protocol || `Orçamento #${detail.id.slice(0, 8)}`} description="Detalhes da solicitação de orçamento" className="max-w-4xl">
      <div className="min-w-0 space-y-4 p-3 sm:p-5">
        <Section title="Dados pessoais / empresariais"
         actions={<button type="button" onClick={()=>setSacQuoteOpen(true)}
           disabled={!canMessageQuote} title={canMessageQuote?"Enviar WhatsApp pelo SAC Digital":"Envio indisponível para este orçamento"}
           aria-label="Enviar WhatsApp pelo SAC Digital"
           className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#25d366]/40 bg-[#e7f9ed] px-3 text-[#148c47] hover:bg-[#d8f4e1] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-emerald-950/30 dark:text-emerald-300"><MessageCircle size={16}/><span>WhatsApp</span></button>}>
          <div className="grid min-w-0 gap-4 sm:grid-cols-2">
           <InfoRow label="Tipo" value={(detail.customer as any)?.customer_type==="PJ"?"Pessoa Jurídica":"Pessoa Física"}/>
           {(detail.customer as any)?.customer_type==="PJ"?<>
             <InfoRow label="Nome fantasia" value={(detail.customer as any)?.trade_name||(detail.customer as any)?.full_name}/>
             <InfoRow label="Razão social" value={(detail.customer as any)?.legal_name}/>
             <InfoRow label="CNPJ" value={(detail.customer as any)?.cnpj?formatCnpj((detail.customer as any).cnpj):null}/>
            </>:<>
             <InfoRow label="Nome completo" value={(detail.customer as any)?.full_name}/>
             <InfoRow label="CPF" value={(detail.customer as any)?.document?formatCpf((detail.customer as any).document):null}/>
            </>}
           <InfoRow label="E-mail" value={(detail.customer as any)?.email}/>
           <InfoRow label="Telefone" value={formatPhone((detail.customer as any)?.phone)}/>
           <InfoRow label="WhatsApp" value={formatPhone((detail.customer as any)?.whatsapp)}/>
          </div>
        </Section>
        <Section title="Endereço do atendimento"
         description={quoteAddress?"Endereço informado para esta solicitação.":"Nenhum endereço específico foi informado nesta solicitação."}
         actions={mapsUrl?<a href={mapsUrl} target="_blank" rel="noopener noreferrer"
           title="Abrir endereço no mapa" aria-label="Abrir endereço no mapa"
           className="inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-[#0057e7]/25 bg-[#eef5ff] px-3 text-xs font-semibold text-[#0057e7] hover:bg-[#e4f0ff]"><MapPin size={16}/> Mapa</a>:undefined}>
         {currentAddress?<div className="grid gap-4 sm:grid-cols-2">
          <InfoRow label="CEP" value={currentAddress.zip_code}/>
          <InfoRow label="Rua / Avenida" value={currentAddress.street}/>
          <InfoRow label="Número" value={currentAddress.number}/>
          <InfoRow label="Complemento" value={currentAddress.complement}/>
          <InfoRow label="Bairro" value={currentAddress.neighborhood}/>
          <InfoRow label="Cidade" value={currentAddress.city}/>
          <InfoRow label="Estado" value={currentAddress.state}/>
          {currentAddress.text&&<InfoRow label="Endereço registrado" value={currentAddress.text}/>}
         </div>:<p className="text-sm text-muted-foreground">Endereço não informado neste orçamento.</p>}
        </Section>
        <Section title="Dados do orçamento">
         <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          <InfoRow label="Protocolo" value={detail.protocol||detail.id}/>
          <InfoRow label="Serviço" value={(detail.service as any)?.title||parsedQuote?.service||parsedQuote?.repairType||null}/>
          <InfoRow label="Equipamento" value={parsedQuote?.equipment}/>
          <InfoRow label="Marca" value={(detail.brand as any)?.name||parsedQuote?.brand}/>
          <InfoRow label="Modelo" value={parsedQuote?.model}/>
          <InfoRow label="Produto" value={(detail.product as any)?.name}/>
          <InfoRow label="Quantidade" value={parsedQuote?.quantity}/>
          <InfoRow label="Preferência de atendimento" value={parsedQuote?.schedule}/>
          <InfoRow label="Modalidade de atendimento" value={parsedQuote?.repairLocation}/>
          <InfoRow label="Data de criação" value={formatDateTime(detail.created_at)}/>
          <InfoRow label="Valor estimado" value={detail.estimated_price==null?null:formatCurrency(detail.estimated_price)}/>
         </div>
        </Section>
        {(parsedQuote?.issue||parsedQuote?.notes)&&<Section title="Observações do cliente">
          {parsedQuote.issue&&<InfoRow label="Problema relatado" value={parsedQuote.issue}/>}
          {parsedQuote.notes&&<div className={parsedQuote.issue?"mt-4":""}><InfoRow label="Mensagem" value={parsedQuote.notes}/></div>}
        </Section>}
      </div>
      <AdminStickyToolbar className="flex flex-wrap items-center justify-end gap-2">
        {canChangeStatus && (() => {
          const current = String(detail.request_status?.slug || "").toUpperCase();
          return <>
            {!["AGUARDANDO_APROVACAO", "APROVADO"].includes(current) && <AdminButton variant="secondary" disabled={actionBusy} onClick={() => setConfirmAction("AGUARDANDO_APROVACAO")}>Enviar para aprovação</AdminButton>}
            {current === "AGUARDANDO_APROVACAO" && <>
              <AdminButton variant="success" disabled={actionBusy} onClick={() => setConfirmAction("APROVADO")}><Check size={15} /> Aprovar</AdminButton>
              <AdminButton variant="danger" disabled={actionBusy} onClick={() => setConfirmAction("REPROVADO")}>Reprovar</AdminButton>
            </>}
            {["REPROVADO", "APROVADO"].includes(current) && <AdminButton variant="secondary" disabled={actionBusy} onClick={() => setConfirmAction("RENEGOCIACAO")}>Reabrir negociação</AdminButton>}
          </>;
        })()}
        {canConvertToOrder && String(detail.request_status?.slug || "").toUpperCase() === "APROVADO" && <AdminButton disabled={actionBusy} onClick={async () => {
          if (actionBusy) return;
          setActionBusy(true);
          setProgressState("loading");
          try {
            const { data: existing, error: existingError } = await findServiceOrderByQuote(organizationId, detail.id);
            if (existingError) throw existingError;
            if (existing) throw new Error(`OS ${existing.os_number || existing.id.slice(0, 8)} já vinculada a este orçamento.`);
            const { data: availableStatuses, error: statusError } = await listOrderStatuses(organizationId);
            if (statusError) throw statusError;
            const status = initialOrderStatus(availableStatuses || []);
            if (!status?.id) throw new Error("Não foi possível identificar o status inicial da OS.");
            const { error } = await createServiceOrderFromQuote(organizationId, {
              service_id: detail.service_id, quote_request_id: detail.id, customer_id: detail.customer_id,
              status_id: status.id, situation_id: null, customer_notes: detail.customer_message || null,
            });
            if (error) throw error;
            syncQuotes();
            setProgressState("success");
          } catch (error) {
            setProgressState(null);
            setToast({ msg: systemErrorMessage(error), type: "error" });
          } finally { setActionBusy(false); }
        }}><ClipboardList size={15} /> Criar OS</AdminButton>}
        <BtnSecondary onClick={closeDetails} disabled={actionBusy}>Fechar</BtnSecondary>
      </AdminStickyToolbar>
    </AdminDialog>}
    <AdminDialog open={Boolean(confirmAction)} onClose={() => { if (!actionBusy) setConfirmAction(null); }}
      title={confirmAction === "APROVADO" ? "Aprovar orçamento?" : confirmAction === "REPROVADO" ? "Reprovar orçamento?" : confirmAction === "RENEGOCIACAO" ? "Reabrir negociação?" : "Enviar para aprovação?"}
      description="A situação será atualizada também na consulta do cliente pelo site."
      footer={<div className="flex justify-end gap-2">
        <BtnSecondary disabled={actionBusy} onClick={() => setConfirmAction(null)}>Cancelar</BtnSecondary>
        <AdminButton disabled={actionBusy} loading={actionBusy} onClick={async () => {
          if (!confirmAction || actionBusy) return;
          const selectedStatus = statuses.find(status => String(status.slug || "").toUpperCase() === confirmAction);
          if (!selectedStatus) { setToast({ msg: "Status não configurado nesta empresa.", type: "error" }); return; }
          setActionBusy(true);
          setProgressState("loading");
          const currentId = detail?.id;
          try {
            const { error } = await updateQuoteStatus(organizationId, currentId, selectedStatus.id);
            if (error) throw error;
            // O trigger trg_quote_status_history grava automaticamente o histórico da aprovação.
            setDetail((current: any) => current?.id === currentId ? { ...current, status_id: selectedStatus.id, statusName: selectedStatus.name, request_status: selectedStatus } : current);
            syncQuotes();
            setConfirmAction(null);
            setProgressState("success");
          } catch (error) {
            setProgressState(null);
            setToast({ msg: systemErrorMessage(error), type: "error" });
          } finally { setActionBusy(false); }
        }}>Confirmar</AdminButton>
      </div>}>
      <p className="text-sm text-muted-foreground">Confirme para registrar a mudança no orçamento.</p>
    </AdminDialog>
    <OperationProgressDialog open={progressState !== null} state={progressState || "loading"}
      loadingTitle="Atualizando orçamento..." successTitle="Operação concluída!"
      onFinished={() => { setProgressState(null); }} />
    {sacQuoteOpen && detail && <QuoteSacDigitalDialog quote={detail} organizationId={organizationId} onClose={()=>setSacQuoteOpen(false)}/>}
  </div>;
}

function SearchField({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return <div className="relative min-w-0"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#5a6a82]" /><input value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} className={cn(INPUT, "h-[42px] w-full pl-9 text-xs md:h-9 md:py-1.5")} /></div>;
}

function MobileSearchField({ value, onChange, placeholder, ariaLabel, inputMode }: { value: string; onChange: (value: string) => void; placeholder: string; ariaLabel: string; inputMode?: "numeric" }) {
  return <div className="relative min-w-0 overflow-hidden rounded-lg"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#5a6a82]" /><input inputMode={inputMode} aria-label={ariaLabel} value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} className={cn(INPUT, "h-[42px] min-w-0 w-full overflow-hidden text-ellipsis whitespace-nowrap py-2 pl-9 text-sm")} /></div>;
}

function MobileInfo({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wide text-[#8a96a8]">{label}</p><p className="truncate text-xs font-medium text-[#5a6a82]">{value}</p></div>;
}
