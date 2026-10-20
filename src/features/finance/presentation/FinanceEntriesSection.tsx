import { STATUS_TONE_CLASSES } from "@/shared/domain/status-tone";
import { useEffect, useRef, useState } from "react";
import { BanknoteArrowDown, BanknoteArrowUp, CheckCircle2, MoreHorizontal } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { formatCurrency } from "@/shared/domain/formatters";
import { FInput, FSelect } from "@/shared/ui/admin/AdminFormControls";
import { EmptyState, LoadingState } from "@/shared/ui/admin/AdminFeedback";
import { AdminButton, AdminDialog, AdminStickyToolbar } from "@/shared/ui/admin/AdminLayout";
import { FinanceTableRow } from "./FinanceTableRow";
import { FinanceTableSurface } from "./FinanceTableSurface";
import { PaginationBar } from "@/shared/ui/admin/AdminPagination";
import { useFinanceEntries } from "../application/useFinanceEntries";
import { useFinanceFoundation } from "../application/useFinanceFoundation";
import type { FinancialEntry, FinancialEntryDetail, FinancialEntryType, FinancialSettlementDraft } from "../domain/finance.types";
import { FinanceEntryDetail } from "./FinanceEntryDetail";
import { FinanceEntryEditorDialog } from "./FinanceEntryEditorDialog";
import { formatFinancialDocument } from "./financeDisplay";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/shared/ui/primitives/dropdown-menu";

function formatDate(value?: string | null) {
  if (!value) return "—";
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

const operationLabels: Record<string, string> = { open: "A vencer", overdue: "Vencida", partial: "Parcial", settled: "Liquidada", cancelled: "Cancelada" };

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

export function FinanceEntriesSection({ entryType, selectedEntryId, onSelectEntry }: { entryType: FinancialEntryType; selectedEntryId?: string | null; onSelectEntry: (id: string | null) => void }) {
  const { user, hasPermission } = useAuth();
  const foundation = useFinanceFoundation();
  const [search, setSearch] = useState("");
  const [operationalFilter, setOperationalFilter] = useState("pending");
  const [name, setName] = useState("");
  const [document, setDocument] = useState("");
  const [os, setOs] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [quickSettlementId, setQuickSettlementId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const receivableScrollRef = useRef<HTMLDivElement>(null);
  const [pageSize, setPageSize] = useState(10);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<FinancialEntryDetail | null>(null);
  const [counterpartySearch, setCounterpartySearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const debouncedName = useDebouncedValue(name);
  const debouncedDocument = useDebouncedValue(document);
  const debouncedOs = useDebouncedValue(os);
  const debouncedCounterpartySearch = useDebouncedValue(counterpartySearch);
  const finance = useFinanceEntries(
    entryType,
    selectedEntryId,
    {
      page,
      pageSize,
      search: debouncedSearch,
      approvalStatus: "all",
      name: debouncedName,
      document: debouncedDocument,
      os: debouncedOs,
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
  }, [search, name, document, os, dateFrom, dateTo, operationalFilter, pageSize, entryType]);

  const isReceivable = entryType === "receivable";
  const canCreate = hasPermission(isReceivable ? "finance.receivables.create" : "finance.payables.create");
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

  const Icon = isReceivable ? BanknoteArrowUp : BanknoteArrowDown;
  return <div className="space-y-4">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm font-semibold text-muted-foreground">{totalItems} {totalItems === 1 ? "conta cadastrada" : "contas cadastradas"}</p>

    </div>
    <div className="grid gap-3 border-b border-border pb-4 sm:grid-cols-2 lg:grid-cols-4">
      <div className="lg:col-span-2"><FInput label="Busca geral" value={search} onChange={(event: any) => setSearch(event.target.value)} placeholder="Descrição e referência" /></div>
      <FSelect label="Situação" value={operationalFilter} options={[{ value: "pending", label: "Pendentes / parciais" }, { value: "all", label: "Todas" }, { value: "settled", label: "Baixadas" }]} onChange={(event: any) => setOperationalFilter(event.target.value)} />
      <FInput label="Nome do cliente / favorecido" value={name} onChange={(event: any) => setName(event.target.value)} placeholder="Nome" />
      <FInput label="CPF / CNPJ" value={document} onChange={(event: any) => setDocument(event.target.value)} placeholder="CPF ou CNPJ" />
      <FInput label="OS" value={os} onChange={(event: any) => setOs(event.target.value)} placeholder="Número da OS" />
      <FInput label="Vencimento de" type="date" value={dateFrom} onChange={(event: any) => setDateFrom(event.target.value)} />
      <FInput label="Vencimento até" type="date" value={dateTo} onChange={(event: any) => setDateTo(event.target.value)} />
    </div>
      {finance.entriesQuery.isLoading ? <div className="p-10"><LoadingState /></div> : finance.entriesQuery.error ? <div className="m-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{finance.entriesQuery.error instanceof Error ? finance.entriesQuery.error.message : "Não foi possível carregar os lançamentos."}</div> : entries.length === 0 ? <div className="p-10"><EmptyState icon={Icon} title={`Nenhum lançamento ${isReceivable ? "a receber" : "a pagar"}`} /></div> : <>
        <div className="overflow-hidden rounded-xl border border-border bg-card md:hidden">
          <div className="divide-y divide-border">
            {entries.map(entry => <button key={entry.id} type="button" onClick={() => onSelectEntry(entry.id)}
              className="block w-full p-4 text-left transition-colors hover:bg-muted/50">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0"><p className="truncate text-sm font-bold text-foreground">{entry.description}</p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">{entry.counterpart_name_snapshot || "Sem contraparte"} · {formatFinancialDocument(entry.counterpart_document_snapshot)}</p></div>
                <p className="shrink-0 text-sm font-bold tabular-nums text-primary">{formatCurrency(entry.original_amount)}</p>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <span>Vencimento: <strong className="text-foreground">{formatDate(entry.next_due_date)}</strong></span>
                <span>Pagamento: <strong className="text-foreground">{entry.payment_method_summary || "A definir"}</strong></span>
                <span>{isReceivable ? "Recebido" : "Pago"}: <strong className="text-foreground">{formatCurrency(entry.settled_amount || 0)}</strong></span>
                <span>Saldo: <strong className="text-foreground">{formatCurrency(entry.remaining_amount ?? entry.original_amount)}</strong></span>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Badge tone="blue">{originText(entry)}</Badge>
                <Badge tone={operationalTone(entry.operational_status)}>{operationLabels[entry.operational_status || "open"] || entry.operational_status}</Badge>
              </div>
            </button>)}
          </div>
          {pagination}
        </div>
        <FinanceTableSurface className="hidden md:block" pagination={pagination}>
          <table className="w-full min-w-[1160px]">
            <thead><tr>
              <th className="text-left">Descrição / Origem</th>
              <th className="text-left">Cliente / Fornecedor</th>
              <th className="text-left">Forma de pagamento</th>
              <th className="text-left">Vencimento</th>
              <th className="text-right">Valor</th>
              <th className="text-right">{isReceivable ? "Recebido" : "Pago"}</th>
              <th className="text-left">Situação</th>
              <th className="text-right">Ações</th>
            </tr></thead>
            <tbody>{entries.map((entry: FinancialEntry) =>
              <FinanceTableRow key={entry.id} label={`Abrir ${entry.description}`} onOpen={() => onSelectEntry(entry.id)}>
                <td><p className="font-bold text-foreground">{entry.description}</p><p className="text-[10px] font-semibold uppercase text-primary">{originText(entry)}</p></td>
                <td><p className="text-xs font-semibold text-foreground">{entry.counterpart_name_snapshot || "—"}</p><p className="mt-1 text-[11px] text-muted-foreground">{formatFinancialDocument(entry.counterpart_document_snapshot)}</p></td>
                <td className="text-xs text-muted-foreground">{entry.payment_method_summary || "A definir"}</td>
                <td className="text-xs font-semibold">{formatDate(entry.next_due_date)}</td>
                <td className="text-right font-bold tabular-nums text-primary">{formatCurrency(entry.original_amount)}</td>
                <td className="text-right tabular-nums">{formatCurrency(entry.settled_amount || 0)}</td>
                <td><Badge tone={operationalTone(entry.operational_status)}>{operationLabels[entry.operational_status || "open"] || entry.operational_status}</Badge></td>
                <td><div className="flex justify-end"><DropdownMenu>
                     <DropdownMenuTrigger asChild><button type="button" aria-label={`Ações de ${entry.description}`} className="flex h-9 w-9 items-center justify-center rounded-lg border border-border hover:bg-muted" onClick={event => event.stopPropagation()}><MoreHorizontal size={17} /></button></DropdownMenuTrigger>
                     <DropdownMenuContent align="end">
                       <DropdownMenuItem onSelect={() => { setQuickSettlementId(null); onSelectEntry(entry.id); }}>Abrir extrato</DropdownMenuItem>
                       {canSettle && Number(entry.remaining_amount ?? entry.original_amount) > 0.005 && !["cancelled", "reversed"].includes(entry.approval_status) && <DropdownMenuItem onSelect={() => { setQuickSettlementId(entry.id); onSelectEntry(entry.id); }}><CheckCircle2 size={15} /> Dar baixa</DropdownMenuItem>}
                     </DropdownMenuContent>
                   </DropdownMenu></div></td>
              </FinanceTableRow>)}
            </tbody>
          </table>
        </FinanceTableSurface>
      </>}

    {canCreate && <AdminStickyToolbar className="justify-end">
      <AdminButton onClick={() => { setCounterpartySearch(""); setEditing(null); setEditorOpen(true); }}>Novo</AdminButton>
    </AdminStickyToolbar>}

    {selectedEntryId && <AdminDialog
      open
      onClose={() => { setQuickSettlementId(null); onSelectEntry(null); }}
      title={isReceivable ? "Conta a receber" : "Conta a pagar"}
      description={finance.detailQuery.data?.description || "Extrato e movimentações da conta"}
      minimizedDescription={[finance.detailQuery.data?.counterpart_name_snapshot, finance.detailQuery.data ? formatCurrency(finance.detailQuery.data.original_amount) : null].filter(Boolean).join(" · ")}
      className="h-[calc(100dvh-1.5rem)] max-w-5xl sm:h-[min(820px,calc(100dvh-2rem))]"
      bodyClassName="overscroll-contain"
      bodyRef={receivableScrollRef}
    >
      {finance.detailQuery.isLoading
        ? <div className="py-10"><LoadingState text="Carregando extrato..." /></div>
        : finance.detailQuery.error
          ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{finance.detailQuery.error instanceof Error ? finance.detailQuery.error.message : "Não foi possível carregar a conta."}</div>
          : finance.detailQuery.data
            ? <FinanceEntryDetail
              scrollContainerRef={receivableScrollRef}
              initialSettlementOpen={quickSettlementId === selectedEntryId}
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
              confirmSettlementPending={finance.confirmSettlementMutation.isPending}
              reverseSettlementPending={finance.reverseSettlementMutation.isPending}
              settlementError={finance.settlementMutation.error || finance.confirmSettlementMutation.error || finance.reverseSettlementMutation.error}
              onBack={() => onSelectEntry(null)}
              onEdit={() => {
                setCounterpartySearch("");
                setEditing(finance.detailQuery.data || null);
                setEditorOpen(true);
              }}
              onApprove={async () => { await finance.decisionMutation.mutateAsync({ id: finance.detailQuery.data!.id, action: "approve" }); }}
              onReject={async note => { await finance.decisionMutation.mutateAsync({ id: finance.detailQuery.data!.id, action: "reject", note }); }}
              onRegisterSettlement={async (draft: FinancialSettlementDraft) => { await finance.settlementMutation.mutateAsync(draft); }}
              onConfirmSettlement={async settlementId => { await finance.confirmSettlementMutation.mutateAsync({ settlementId }); }}
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
