import { STATUS_TONE_CLASSES } from "@/shared/domain/status-tone";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BanknoteArrowDown, BanknoteArrowUp, CheckCircle2, CircleX, MoreVertical, Search, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { formatCurrency } from "@/shared/domain/formatters";
import { AdminFieldLabel, FInput, FSelect, FTextarea, INPUT } from "@/shared/ui/admin/AdminFormControls";
import { AdminSearchPanel, AdminSearchClearButton, AdminSearchSortMenu } from "@/shared/ui/admin/AdminSearchPanel";
import { AdminMobileSearchSwitch } from "@/shared/ui/admin/AdminMobileSearchSwitch";
import { EmptyState, LoadingState, notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import { AdminButton, AdminDialog } from "@/shared/ui/admin/AdminLayout";
import { FinanceTableRow } from "./FinanceTableRow";
import { FinanceTableSurface } from "./FinanceTableSurface";
import { PaginationBar } from "@/shared/ui/admin/AdminPagination";
import { useFinanceEntries } from "../application/useFinanceEntries";
import { listFinancialReceivableCreators } from "../infrastructure/finance-entries.repository";
import { useFinanceFoundation } from "../application/useFinanceFoundation";
import type { FinancialEntry, FinancialEntryDetail, FinancialEntryType, FinancialSettlementDraft } from "../domain/finance.types";
import { FinanceEntryDetail } from "./FinanceEntryDetail";
import { FinanceSettlementDialog } from "./FinanceSettlementDialog";
import { FinanceEntryEditorDialog } from "./FinanceEntryEditorDialog";
import { useFinanceRecurring } from "../application/useFinanceRecurring";
import { formatFinancialDocument } from "./financeDisplay";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/shared/ui/primitives/dropdown-menu";

function formatDate(value?: string | null) {
  if (!value) return "—";
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

const operationLabels: Record<string, string> = { open: "Pendente", overdue: "Vencida", partial: "Parcialmente baixada", settled: "Baixada", cancelled: "Cancelada" };

function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "warning" | "danger" | "success" | "blue" }) {
  const tones = {
    neutral: STATUS_TONE_CLASSES.neutral.badge,
    warning: STATUS_TONE_CLASSES.pending.badge,
    danger: STATUS_TONE_CLASSES.danger.badge,
    success: STATUS_TONE_CLASSES.success.badge,
    blue: STATUS_TONE_CLASSES.progress.badge,
  };
  return <span className={`inline-flex rounded-full border px-2 py-1 text-[10px] font-black uppercase tracking-wide ${tones[tone]}`}>{children}</span>;
}

function operationalTone(status?: string) { return ["overdue","cancelled"].includes(status || "") ? "danger" as const : status === "settled" ? "success" as const : ["partial","open"].includes(status || "") ? "warning" as const : "neutral" as const; }


function sourceValue(entry: FinancialEntry, key: string) {
  const value = entry.source_details?.[key];
  return value == null ? "" : String(value).trim();
}

function originText(entry: FinancialEntry) {
  if (entry.origin_type === "manual") return "Manual";
  if (entry.origin_type === "service_order") {
    const osNumber = sourceValue(entry, "os_number");
    return osNumber ? `OS #${osNumber}` : "Ordem de Serviço";
  }
  if (entry.origin_type === "inventory_purchase") return "Compra de estoque";
  if (entry.origin_type === "recurring") return "Recorrência";
  return "Outra origem";
}

function useDebouncedValue<T>(value: T, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timeout = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timeout);
  }, [value, delay]);
  return debounced;
}

export function FinanceEntriesSection({ entryType, selectedEntryId, onSelectEntry, newEntrySignal = 0 }: { entryType: FinancialEntryType; selectedEntryId?: string | null; onSelectEntry: (id: string | null) => void; newEntrySignal?: number }) {
  const { user, hasPermission, activeOrganizationId } = useAuth();
  const foundation = useFinanceFoundation();
  const [operationalFilter, setOperationalFilter] = useState("pending");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const [name, setName] = useState("");
  const [documentSearch, setDocumentSearch] = useState("");
  const [os, setOs] = useState("");
  const [originSearch, setOriginSearch] = useState("");
  const [mobileCriterion, setMobileCriterion] = useState<"os" | "name" | "document" | "origin" | "status" | "creator" | "dueFrom" | "dueTo">("name");
  const [creatorId, setCreatorId] = useState("");
  const [creatorSearch, setCreatorSearch] = useState("");
  const [creatorOpen, setCreatorOpen] = useState(false);
  const creatorContainerRef = useRef<HTMLDivElement>(null);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [settlementDialogOpen, setSettlementDialogOpen] = useState(false);
  const [lastSettledEntryId, setLastSettledEntryId] = useState<string | null>(null);
  const openSettlement = (entryId?: string) => {
    if (entryId) onSelectEntry(entryId);
    setSettlementDialogOpen(true);
  };
  const [page, setPage] = useState(1);
  const receivableScrollRef = useRef<HTMLDivElement>(null);
  const [pageSize, setPageSize] = useState(10);
  const [editorOpen, setEditorOpen] = useState(false);
  const [cancelRecurringEntry, setCancelRecurringEntry] = useState<{ ruleId: string; title: string } | null>(null);
  const [cancellationReason, setCancellationReason] = useState("");
  const [editing, setEditing] = useState<FinancialEntryDetail | null>(null);
  const [counterpartySearch, setCounterpartySearch] = useState("");
  useEffect(() => {
    if (newEntrySignal <= 0) return;
    setEditing(null);
    setCounterpartySearch("");
    setEditorOpen(true);
  }, [newEntrySignal]);
  const debouncedName = useDebouncedValue(name);
  const debouncedDocument = useDebouncedValue(documentSearch);
  const debouncedOs = useDebouncedValue(os);
  const debouncedOrigin = useDebouncedValue(originSearch);
  const debouncedCounterpartySearch = useDebouncedValue(counterpartySearch);
  const creatorsQuery = useQuery({
    queryKey: ["finance", activeOrganizationId || "none", "receivable-creators"],
    enabled: Boolean(activeOrganizationId && entryType === "receivable"),
    staleTime: 60_000,
    queryFn: () => listFinancialReceivableCreators(String(activeOrganizationId)),
  });
  // Lista local pesquisável: evita o auto-dismiss do Popover ao focar o input.
  useEffect(() => {
    if (!creatorOpen) return;
    const closeOnOutside = (event: PointerEvent) => {
      if (creatorContainerRef.current && !creatorContainerRef.current.contains(event.target as Node)) setCreatorOpen(false);
    };
    window.document.addEventListener("pointerdown", closeOnOutside);
    return () => window.document.removeEventListener("pointerdown", closeOnOutside);
  }, [creatorOpen]);
  const filteredCreators = useMemo(() => {
    const search = creatorSearch.trim().toLocaleLowerCase("pt-BR");
    const choices = creatorsQuery.data || [];
    return (search && !creatorId
      ? choices.filter(item => item.name.toLocaleLowerCase("pt-BR").includes(search))
      : choices);
  }, [creatorsQuery.data, creatorSearch, creatorId]);
  const finance = useFinanceEntries(
    entryType,
    selectedEntryId,
    {
      page,
      pageSize,
      search: debouncedOrigin,
      sort,
      approvalStatus: "all",
      name: debouncedName,
      document: debouncedDocument,
      os: debouncedOs,
      createdBy: entryType === "receivable" ? creatorId : "",
      dateFrom,
      dateTo,
      operationalStatus: operationalFilter,
    },
    editorOpen,
    debouncedCounterpartySearch,
    editing?.counterpart_entity_id || "",
  );

  useEffect(() => {
    setPage(1);
  }, [name, documentSearch, os, originSearch, creatorId, dateFrom, dateTo, operationalFilter, sort, pageSize, entryType]);

  const isReceivable = entryType === "receivable";
  const canManageRecurring = !isReceivable && hasPermission("finance.recurring.manage");
  const recurring = useFinanceRecurring(!isReceivable && (hasPermission("finance.recurring.view") || canManageRecurring));
  const recurringById = useMemo(() => new Map((recurring.rulesQuery.data || []).map(rule => [rule.id, rule])), [recurring.rulesQuery.data]);
  const recurringRuleFor = (entry: FinancialEntry) => recurringById.get(sourceValue(entry, "recurring_rule_id"));
  const isRecurringCancelled = (entry: FinancialEntry) => Boolean(sourceValue(entry, "recurring_cancelled_at")) || Boolean(recurringRuleFor(entry)?.cancelled_at);
  const recurringBadge = (entry: FinancialEntry) => {
    if (entry.origin_type !== "recurring") return null;
    if (isRecurringCancelled(entry)) return <Badge tone="danger">Assinatura cancelada</Badge>;
    if (recurringRuleFor(entry)?.is_active === false) return <Badge>Recorrência encerrada</Badge>;
    return <Badge tone="blue">Recorrente</Badge>;
  };
  const canCancelRecurring = (entry: FinancialEntry) =>
    canManageRecurring && entry.origin_type === "recurring"
    && Boolean(sourceValue(entry, "recurring_rule_id"))
    && !isRecurringCancelled(entry)
    && recurringRuleFor(entry)?.is_active !== false;
  const askCancelRecurring = (entry: FinancialEntry) => {
    const ruleId = sourceValue(entry, "recurring_rule_id");
    if (!ruleId) return;
    setCancellationReason("");
    setCancelRecurringEntry({ ruleId, title: entry.description });
  };
  const cancelRecurring = async () => {
    if (!cancelRecurringEntry || recurring.cancelMutation.isPending) return;
    try {
      await recurring.cancelMutation.mutateAsync({ id: cancelRecurringEntry.ruleId, reason: cancellationReason.trim() || null });
      notifyAdmin("Recorrência cancelada. Novos lançamentos interrompidos; pagamentos anteriores preservados.", "success");
      setCancelRecurringEntry(null);
      setCancellationReason("");
    } catch (error) {
      notifyAdmin(error instanceof Error ? error.message : "Não foi possível cancelar a recorrência.", "error");
    }
  };
  const canEdit = hasPermission(isReceivable ? "finance.receivables.edit" : "finance.payables.edit");
  const canApprove = false;
  const canSettle = hasPermission("finance.settlements.create");
  const canReverseSettlement = hasPermission("finance.settlements.reverse");
  const entries = finance.entriesQuery.data?.items || [];
  const totalItems = finance.entriesQuery.data?.total || 0;
  const counterparties = finance.counterpartiesQuery.data || [];
  const categories = foundation.categoriesQuery.data || [];
  const accounts = foundation.accountsQuery.data || [];
  const paymentMethods = foundation.paymentMethodsQuery.data || [];
  const displayPaymentMethods = (entry: FinancialEntry) => {
    if (entry.payment_method_summary) return entry.payment_method_summary;
    const planned = Array.isArray(entry.source_details?.payment_plan) ? entry.source_details.payment_plan as Array<{payment_method_id:string}> : [];
    const names = planned.map(part => paymentMethods.find(method=>method.id===part.payment_method_id)?.name).filter(Boolean);
    return names.length ? `${names.join(", ")} (previsto)` : "A definir";
  };

  const closeEditor = () => {
    if (finance.saveMutation.isPending) return;
    setEditorOpen(false);
    setEditing(null);
    setCounterpartySearch("");
  };

  const save = async (draft: any) => {
    const id = await finance.saveMutation.mutateAsync(draft);
    setEditorOpen(false);
    setEditing(null);
    setCounterpartySearch("");
    onSelectEntry(id);
  };

  const pagination = <PaginationBar
    page={page} pageSize={pageSize} totalItems={totalItems}
    onPageChange={setPage} onPageSizeChange={setPageSize}
    defaultPageSize={10} pageSizeOptions={[10, 20, 50, 100]}
  />;

  const hasFilters = Boolean(operationalFilter !== "pending" || name || documentSearch || os || originSearch || creatorId || creatorSearch || dateFrom || dateTo || sort !== "newest");
  const resetFilters = () => {
    setOperationalFilter("pending");
    setName(""); setDocumentSearch(""); setOs(""); setOriginSearch(""); setCreatorId(""); setCreatorSearch(""); setCreatorOpen(false); setDateFrom(""); setDateTo("");
    setSort("newest"); setPage(1);
  };

  const Icon = isReceivable ? BanknoteArrowUp : BanknoteArrowDown;
  return <div className="space-y-4">
    <AdminSearchPanel
      title={isReceivable ? "Buscar contas a receber" : "Buscar contas a pagar"}
      allowOverflow={isReceivable}
      headerActions={<>
        {hasFilters && <AdminSearchClearButton onClick={resetFilters} />}
        <AdminSearchSortMenu value={sort} onChange={setSort} label="Ordenação das contas"
          options={[{ value: "newest", label: "Mais recentes" }, { value: "oldest", label: "Mais antigas" }]} />
      </>}
    >
      <AdminMobileSearchSwitch
        value={mobileCriterion}
        options={[
          { value: "name", label: isReceivable ? "Nome do cliente" : "Nome do favorecido" },
          { value: "document", label: isReceivable ? "CPF / CNPJ" : "CPF / CNPJ do fornecedor" },
          ...(isReceivable ? [{ value: "os" as const, label: "Número da OS" }] : []),
          { value: "origin" as const, label: "Origem" },
          { value: "status", label: "Situação" },
          ...(isReceivable ? [{ value: "creator" as const, label: "Responsável" }] : []),
          { value: "dueFrom", label: "Vencimento de" },
          { value: "dueTo", label: "Vencimento até" },
        ]}
        onChange={value => {
          setMobileCriterion(value);
          setName(""); setDocumentSearch(""); setOs(""); setOriginSearch("");
          setOperationalFilter("pending"); setCreatorId(""); setCreatorSearch(""); setCreatorOpen(false);
          setDateFrom(""); setDateTo(""); setPage(1);
        }}
      >
        {mobileCriterion === "status"
          ? <FSelect value={operationalFilter}
              options={[{ value: "pending", label: "Pendentes / parciais" }, { value: "all", label: "Todas" }, { value: "settled", label: "Baixadas" }]}
              onChange={(event: any) => { setOperationalFilter(event.target.value); setPage(1); }} />
          : mobileCriterion === "creator" && isReceivable
            ? <FSelect value={creatorId}
                options={[{ value: "", label: "Todos os responsáveis" }, ...(creatorsQuery.data || []).map(person => ({ value: person.id, label: person.name }))]}
                onChange={(event: any) => {
                  const id = event.target.value;
                  setCreatorId(id);
                  setCreatorSearch((creatorsQuery.data || []).find(person => person.id === id)?.name || "");
                  setPage(1);
                }} />
            : mobileCriterion === "dueFrom" || mobileCriterion === "dueTo"
              ? <input type="date" className={INPUT + " h-[42px] w-full min-w-0 text-sm"}
                  aria-label={mobileCriterion === "dueFrom" ? "Vencimento de" : "Vencimento até"}
                  value={mobileCriterion === "dueFrom" ? dateFrom : dateTo}
                  onChange={event => {
                    if (mobileCriterion === "dueFrom") setDateFrom(event.target.value);
                    else setDateTo(event.target.value);
                    setPage(1);
                  }} />
              : <div className="relative min-w-0">
                  <Search size={15} aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input type="search" className={INPUT + " h-[42px] w-full min-w-0 pl-9 text-sm"}
                    value={mobileCriterion === "name" ? name : mobileCriterion === "document" ? documentSearch : mobileCriterion === "origin" ? originSearch : os}
                    onChange={event => {
                      const value = event.target.value;
                      if (mobileCriterion === "name") setName(value);
                      else if (mobileCriterion === "document") setDocumentSearch(value);
                      else if (mobileCriterion === "origin") setOriginSearch(value);
                      else setOs(value);
                      setPage(1);
                    }}
                    inputMode={mobileCriterion === "document" ? "numeric" : "text"}
                    aria-label={mobileCriterion === "name" ? "Buscar por nome" : mobileCriterion === "document" ? "Buscar por CPF ou CNPJ" : mobileCriterion === "origin" ? "Buscar por origem" : "Buscar por número da OS"}
                    placeholder={mobileCriterion === "name" ? "Digite o nome" : mobileCriterion === "document" ? "Digite o CPF ou CNPJ" : mobileCriterion === "origin" ? "Descrição, OS, compra ou recorrência" : "Digite o número da OS"} />
                </div>}
      </AdminMobileSearchSwitch>
      <div className={`hidden min-w-0 grid-cols-1 items-end gap-3 md:grid ${isReceivable ? "md:grid-cols-4" : "md:grid-cols-3"}`}>
        {isReceivable && <div className="hidden md:block"><FInput label="Número da OS" value={os} onChange={(event: any) => setOs(event.target.value)} placeholder="Número da OS" /></div>}
        <div className="hidden md:block"><FInput label={isReceivable ? "Nome do cliente" : "Nome do favorecido"} value={name} onChange={(event: any) => setName(event.target.value)} placeholder="Nome" /></div>
        <div className="hidden md:block"><FInput label={isReceivable ? "CPF / CNPJ" : "CPF / CNPJ do fornecedor"} inputMode="numeric" value={documentSearch}
          onChange={(event: any) => setDocumentSearch(event.target.value)} placeholder="CPF ou CNPJ" /></div>
        <div className="hidden md:block"><FInput label="Origem" value={originSearch} onChange={(event: any) => setOriginSearch(event.target.value)} placeholder="Descrição ou origem do lançamento" /></div>
        <FSelect label="Situação" value={operationalFilter} options={[
          { value: "pending", label: "Pendentes / parciais" },
          { value: "all", label: "Todas" },
          { value: "settled", label: "Baixadas" },
        ]} onChange={(event: any) => setOperationalFilter(event.target.value)} />
        {isReceivable && <div ref={creatorContainerRef} className="relative z-20 min-w-0 space-y-1">
          <AdminFieldLabel label="Responsável" />
          <div className="relative">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input className={INPUT + " w-full pl-9 pr-9"} value={creatorSearch}
              role="combobox" aria-expanded={creatorOpen} aria-controls="finance-creator-options"
              aria-autocomplete="list"
              placeholder="Buscar ou selecionar responsável"
              onFocus={() => setCreatorOpen(true)}
              onClick={() => setCreatorOpen(true)}
              onKeyDown={event => { if (event.key === "Escape") setCreatorOpen(false); }}
              onChange={event => { setCreatorSearch(event.target.value); setCreatorId(""); setCreatorOpen(true); }}
              aria-label="Filtrar pelo responsável que cadastrou o lançamento" />
            {creatorSearch && <button type="button" aria-label="Limpar responsável" title="Limpar responsável"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
              onClick={() => { setCreatorSearch(""); setCreatorId(""); setCreatorOpen(false); }}>
              <X size={15} />
            </button>}
          </div>
          {creatorOpen && <div id="finance-creator-options" role="listbox"
            className="absolute left-0 right-0 top-full z-[90] mt-1 max-h-[176px] overflow-y-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-xl animate-in fade-in-0 slide-in-from-top-1 duration-150">
            <button type="button" role="option" aria-selected={!creatorId}
              className="flex h-[42px] w-full items-center rounded-md px-3 text-left text-xs font-semibold hover:bg-muted"
              onClick={() => { setCreatorSearch(""); setCreatorId(""); setCreatorOpen(false); }}>
              Todos os responsáveis
            </button>
            {filteredCreators.map(person => <button type="button" role="option" aria-selected={creatorId === person.id} key={person.id}
              className="flex h-[42px] w-full items-center rounded-md px-3 text-left text-xs font-semibold hover:bg-muted"
              onClick={() => { setCreatorId(person.id); setCreatorSearch(person.name); setCreatorOpen(false); }}>
              {person.name}
            </button>)}
            {creatorsQuery.isLoading && <p className="px-3 py-2 text-xs text-muted-foreground">Carregando responsáveis...</p>}
            {creatorsQuery.isError && <p className="px-3 py-2 text-xs text-red-600">Não foi possível carregar os responsáveis.</p>}
            {!creatorsQuery.isLoading && !creatorsQuery.isError && filteredCreators.length === 0 &&
              <p className="px-3 py-2 text-xs text-muted-foreground">Nenhum responsável encontrado.</p>}
          </div>}
        </div>}
        <FInput label="Vencimento de" type="date" value={dateFrom} onChange={(event: any) => setDateFrom(event.target.value)} />
        <FInput label="Vencimento até" type="date" value={dateTo} onChange={(event: any) => setDateTo(event.target.value)} />
      </div>
    </AdminSearchPanel>
      {finance.entriesQuery.isLoading ? <div className="p-10"><LoadingState /></div> : finance.entriesQuery.error ? <div className="m-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{finance.entriesQuery.error instanceof Error ? finance.entriesQuery.error.message : "Não foi possível carregar os lançamentos."}</div> : entries.length === 0 ? <div className="p-10"><EmptyState icon={Icon} title={`Nenhum lançamento ${isReceivable ? "a receber" : "a pagar"}`} /></div> : <>
        <div className="overflow-hidden rounded-xl border border-border bg-card md:hidden">
          <div className="divide-y divide-border">
            {entries.map(entry => <div key={entry.id}><button type="button" onClick={() => onSelectEntry(entry.id)}
              className="block w-full p-4 text-left transition-colors hover:bg-muted/50">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0"><p className="truncate text-sm font-bold text-foreground">{entry.origin_type === "manual" || entry.origin_type === "recurring" ? entry.description : originText(entry)}</p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">{entry.counterpart_name_snapshot || "Sem contraparte"} · {formatFinancialDocument(entry.counterpart_document_snapshot)}</p></div>
                <p className="shrink-0 text-sm font-bold tabular-nums text-foreground">{formatCurrency(entry.original_amount)}</p>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <span>Vencimento: <strong className="text-foreground">{formatDate(entry.next_due_date)}</strong></span>
                <span>Pagamento: <strong className="text-foreground">{displayPaymentMethods(entry)}</strong></span>
                <span>{isReceivable ? "Recebido" : "Pago"}: <strong className="text-emerald-600 dark:text-emerald-400">{formatCurrency(entry.settled_amount || 0)}</strong></span>
                <span>Saldo: <strong className={["cancelled", "reversed"].includes(entry.approval_status) ? "text-muted-foreground" : isReceivable ? "text-foreground" : "text-amber-600 dark:text-amber-400"}>{["cancelled", "reversed"].includes(entry.approval_status) ? "—" : formatCurrency(entry.remaining_amount ?? entry.original_amount)}</strong></span>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Badge tone={operationalTone(entry.operational_status)}>{operationLabels[entry.operational_status || "open"] || entry.operational_status}</Badge>{recurringBadge(entry)}
              </div>
            </button>
            <div className="flex justify-end border-t border-border/60 px-4 pb-2 pt-2">
              <DropdownMenu><DropdownMenuTrigger asChild>
                <button type="button" aria-label={`Ações de ${entry.description}`} className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"><MoreVertical size={18}/></button>
              </DropdownMenuTrigger><DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => { setSettlementDialogOpen(false); onSelectEntry(entry.id); }}>Abrir extrato</DropdownMenuItem>
                {canSettle && Number(entry.remaining_amount ?? entry.original_amount)>0.005 && !["cancelled","reversed"].includes(entry.approval_status) && <DropdownMenuItem onSelect={() => { openSettlement(entry.id); }}><CheckCircle2 size={15}/> Dar baixa</DropdownMenuItem>}
                 {canCancelRecurring(entry) && <DropdownMenuItem className="text-red-600 focus:text-red-600" onSelect={() => askCancelRecurring(entry)}><CircleX size={15} /> Cancelar recorrência</DropdownMenuItem>}
              </DropdownMenuContent></DropdownMenu>
            </div>
          </div>)}
          </div>
          {pagination}
        </div>
        <FinanceTableSurface className="hidden md:block" pagination={pagination}>
          <table className="w-full min-w-[1160px]">
            <thead><tr>
              <th className="text-left">Origem</th>
              <th className="text-left">Cliente / Fornecedor</th>
              <th className="text-left">Forma de pagamento</th>
              <th className="text-left">Vencimento</th>
              <th className="text-right">Valor</th>
              <th className="text-right">{isReceivable ? "Recebido" : "Pago"}</th>
               {!isReceivable && <th className="text-right">Pendente</th>}
              <th className="text-left">Situação</th>
              <th className="text-right">Ações</th>
            </tr></thead>
            <tbody>{entries.map((entry: FinancialEntry) =>
              <FinanceTableRow key={entry.id} label={`Abrir ${entry.description}`} onOpen={() => onSelectEntry(entry.id)}>
                <td><p className="font-bold text-foreground">{entry.origin_type === "manual" || entry.origin_type === "recurring" ? entry.description : originText(entry)}</p>{entry.origin_type === "recurring" && <p className="mt-1 text-[11px] text-muted-foreground">Assinatura / recorrência</p>}</td>
                <td><p className="text-xs font-semibold text-foreground">{entry.counterpart_name_snapshot || "—"}</p><p className="mt-1 text-[11px] text-muted-foreground">{formatFinancialDocument(entry.counterpart_document_snapshot)}</p></td>
                <td className="text-xs text-muted-foreground">{entry.payment_method_summary || "A definir"}</td>
                <td className="text-xs font-semibold">{formatDate(entry.next_due_date)}</td>
                <td className="text-right font-bold tabular-nums text-foreground">{formatCurrency(entry.original_amount)}</td>
                <td className="text-right font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">{formatCurrency(entry.settled_amount || 0)}</td>
                 {!isReceivable && <td className={`text-right font-semibold tabular-nums ${["cancelled", "reversed"].includes(entry.approval_status) ? "text-muted-foreground" : "text-amber-600 dark:text-amber-400"}`}>{["cancelled", "reversed"].includes(entry.approval_status) ? "—" : formatCurrency(entry.remaining_amount ?? entry.original_amount)}</td>}
                <td><div className="flex flex-wrap gap-1"><Badge tone={operationalTone(entry.operational_status)}>{operationLabels[entry.operational_status || "open"] || entry.operational_status}</Badge>{recurringBadge(entry)}</div></td>
                <td><div className="flex justify-end"><DropdownMenu>
                     <DropdownMenuTrigger asChild><button type="button" aria-label={`Ações de ${entry.description}`} className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground" onClick={event => event.stopPropagation()}><MoreVertical size={18} /></button></DropdownMenuTrigger>
                     <DropdownMenuContent align="end">
                       <DropdownMenuItem onSelect={() => { setSettlementDialogOpen(false); onSelectEntry(entry.id); }}>Abrir extrato</DropdownMenuItem>
                       {canSettle && Number(entry.remaining_amount ?? entry.original_amount) > 0.005 && !["cancelled", "reversed"].includes(entry.approval_status) && <DropdownMenuItem onSelect={() => { openSettlement(entry.id); }}><CheckCircle2 size={15} /> Dar baixa</DropdownMenuItem>}
                        {canCancelRecurring(entry) && <DropdownMenuItem className="text-red-600 focus:text-red-600" onSelect={() => askCancelRecurring(entry)}><CircleX size={15} /> Cancelar recorrência</DropdownMenuItem>}
                     </DropdownMenuContent>
                   </DropdownMenu></div></td>
              </FinanceTableRow>)}
            </tbody>
          </table>
        </FinanceTableSurface>
      </>}


    {cancelRecurringEntry && <AdminDialog open
      onClose={() => { if (!recurring.cancelMutation.isPending) { setCancelRecurringEntry(null); setCancellationReason(""); } }}
      title="Cancelar recorrência" description={cancelRecurringEntry.title} className="max-w-lg"
      footer={<div className="flex flex-wrap justify-end gap-2">
        <AdminButton variant="secondary" disabled={recurring.cancelMutation.isPending} onClick={() => { setCancelRecurringEntry(null); setCancellationReason(""); }}>Voltar</AdminButton>
        <AdminButton variant="danger" loading={recurring.cancelMutation.isPending} onClick={() => void cancelRecurring()}><CircleX size={16} /> Confirmar cancelamento</AdminButton>
      </div>}>
      <div className="space-y-4">
        <p className="text-sm text-foreground">Novas contas desta assinatura deixarão de ser geradas. Contas futuras ainda não pagas serão canceladas. Contas anteriores e pagamentos registrados permanecerão no histórico.</p>
        <FTextarea label="Motivo do cancelamento (opcional)" rows={3} value={cancellationReason} onChange={(event: any) => setCancellationReason(event.target.value)} />
      </div>
    </AdminDialog>}

    {selectedEntryId && <AdminDialog
      open
      onClose={() => {
        if (finance.settlementMutation.isPending) return;
        if (settlementDialogOpen) setSettlementDialogOpen(false);
        else { setLastSettledEntryId(null); onSelectEntry(null); }
      }}
      title={settlementDialogOpen ? (isReceivable ? "Receber lançamento" : "Pagar lançamento") : isReceivable ? "Conta a receber" : "Conta a pagar"}
      description={settlementDialogOpen ? (finance.detailQuery.data?.description || "Preencher baixa financeira") : (finance.detailQuery.data?.description || "Extrato e movimentações da conta")}
      minimizedDescription={[finance.detailQuery.data?.counterpart_name_snapshot, finance.detailQuery.data ? formatCurrency(finance.detailQuery.data.original_amount) : null].filter(Boolean).join(" · ")}
      className={settlementDialogOpen
        ? "h-auto max-h-[calc(100dvh-1.5rem)] max-w-3xl transition-[max-width,height] duration-300 ease-out"
        : "h-[calc(100dvh-1.5rem)] max-w-5xl sm:h-[min(820px,calc(100dvh-2rem))]"}
      bodyClassName={settlementDialogOpen ? "flex-none overscroll-contain px-4 py-4 sm:px-5 sm:py-5" : "overscroll-contain"}
      bodyRef={receivableScrollRef}
      footer={settlementDialogOpen ? null : <div className="flex flex-wrap items-center justify-between gap-3">
        <AdminButton variant="secondary" onClick={() => { setSettlementDialogOpen(false); setLastSettledEntryId(null); onSelectEntry(null); }}>Fechar</AdminButton>
        {finance.detailQuery.data?.id === selectedEntryId && canCancelRecurring(finance.detailQuery.data)
          && <AdminButton variant="danger" onClick={() => askCancelRecurring(finance.detailQuery.data!)}><CircleX size={16} /> Cancelar recorrência</AdminButton>}
        {finance.detailQuery.data?.id === selectedEntryId && canSettle
          && !["cancelled", "reversed"].includes(finance.detailQuery.data.approval_status)
          && finance.detailQuery.data.installments.some(item => Number(item.original_amount) - Number(item.settled_amount) > 0.0001)
          && <AdminButton onClick={() => openSettlement()}><CheckCircle2 size={16} /> Dar baixa</AdminButton>}
      </div>}
    >
      {settlementDialogOpen && finance.detailQuery.data?.id === selectedEntryId
        ? <FinanceSettlementDialog
          open={settlementDialogOpen}
          detail={finance.detailQuery.data}
          accounts={accounts}
          paymentMethods={paymentMethods}
          saving={finance.settlementMutation.isPending}
          onClose={() => { if (!finance.settlementMutation.isPending) setSettlementDialogOpen(false); }}
          onSave={async (draft: FinancialSettlementDraft) => {
            await finance.settlementMutation.mutateAsync(draft);
            setLastSettledEntryId(selectedEntryId);
            notifyAdmin("Baixa de " + formatCurrency(draft.principal_amount) + " registrada com sucesso.", "success");
          }}
        />
        : finance.detailQuery.isLoading
        ? <div className="flex min-h-52 w-full items-center justify-center text-center"><LoadingState text="Carregando extrato" /></div>
        : finance.detailQuery.error
          ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{finance.detailQuery.error instanceof Error ? finance.detailQuery.error.message : "Não foi possível carregar a conta."}</div>
          : finance.detailQuery.data
            ? <FinanceEntryDetail
              key={selectedEntryId + (lastSettledEntryId === selectedEntryId ? "-baixas" : "-resumo")}
              scrollContainerRef={receivableScrollRef}
              initialSettlementOpen={lastSettledEntryId === selectedEntryId}
              detail={finance.detailQuery.data}
              accounts={accounts}
              paymentMethods={paymentMethods}
              canEdit={canEdit}
              canApprove={canApprove}
              canSettle={canSettle}
              canReverseSettlement={canReverseSettlement}
              currentUserId={user?.id || null}
              decisionPending={finance.decisionMutation.isPending}
              decisionError={finance.decisionMutation.error}
              settlementPending={finance.settlementMutation.isPending}
              reverseSettlementPending={finance.reverseSettlementMutation.isPending}
              settlementError={finance.settlementMutation.error || finance.reverseSettlementMutation.error}
              onBack={() => onSelectEntry(null)}
              onEdit={() => {
                setCounterpartySearch("");
                setEditing(finance.detailQuery.data || null);
                setEditorOpen(true);
              }}
              onApprove={async () => { await finance.decisionMutation.mutateAsync({ id: finance.detailQuery.data!.id, action: "approve" }); }}
              onReject={async note => { await finance.decisionMutation.mutateAsync({ id: finance.detailQuery.data!.id, action: "reject", note }); }}
              onRegisterSettlement={async (draft: FinancialSettlementDraft) => { await finance.settlementMutation.mutateAsync(draft); }}
              onReverseSettlement={async (settlementId, reason) => { await finance.reverseSettlementMutation.mutateAsync({ settlementId, reason }); }}
            />
            : <p className="text-sm text-muted-foreground">Conta não encontrada.</p>}
    </AdminDialog>}


    <FinanceEntryEditorDialog
      open={editorOpen}
      entryType={entryType}
      initial={editing}
      counterparties={counterparties}
      counterpartySearch={counterpartySearch}
      counterpartyLoading={finance.counterpartiesQuery.isFetching}
      onCounterpartySearchChange={setCounterpartySearch}
      categories={categories}
      paymentMethods={paymentMethods}
      saving={finance.saveMutation.isPending}
      onClose={closeEditor}
      onSave={save}
    />
  </div>;
}
