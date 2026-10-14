import { useEffect, useState } from "react";
import { BanknoteArrowDown, BanknoteArrowUp, Eye, Search } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { formatCurrency } from "@/shared/domain/formatters";
import { FInput, FSelect } from "@/shared/ui/admin/AdminFormControls";
import { EmptyState, LoadingState } from "@/shared/ui/admin/AdminFeedback";
import { AdminButton, AdminDialog, AdminIconButton, AdminStickyToolbar } from "@/shared/ui/admin/AdminLayout";
import { FinanceTableRow } from "./FinanceTableRow";
import { FinanceTableSurface } from "./FinanceTableSurface";
import { PaginationBar } from "@/shared/ui/admin/AdminPagination";
import { useFinanceEntries } from "../application/useFinanceEntries";
import { useFinanceFoundation } from "../application/useFinanceFoundation";
import type { FinancialEntry, FinancialEntryDetail, FinancialEntryType, FinancialSettlementDraft } from "../domain/finance.types";
import { FinanceEntryDetail } from "./FinanceEntryDetail";
import { FinanceEntryEditorDialog } from "./FinanceEntryEditorDialog";
import { formatFinancialDocument } from "./financeDisplay";

function formatDate(value?: string | null) {
  if (!value) return "—";
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}

const approvalLabels: Record<string, string> = { draft: "Rascunho", pending: "Pendente", approved: "Aprovado", rejected: "Rejeitado", cancelled: "Cancelado", reversed: "Estornado" };
const operationLabels: Record<string, string> = { open: "A vencer", overdue: "Vencida", partial: "Parcial", settled: "Liquidada", cancelled: "Cancelada" };

function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "warning" | "danger" | "success" | "blue" }) {
  const tones = { neutral: "bg-slate-100 text-slate-600", warning: "bg-amber-100 text-amber-700", danger: "bg-red-100 text-red-700", success: "bg-emerald-100 text-emerald-700", blue: "bg-blue-100 text-blue-700" };
  return <span className={`inline-flex rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-wide ${tones[tone]}`}>{children}</span>;
}

function approvalTone(status: string) { return status === "approved" ? "success" as const : status === "rejected" ? "danger" as const : status === "pending" ? "warning" as const : "neutral" as const; }
function operationalTone(status?: string) { return status === "overdue" ? "danger" as const : status === "settled" ? "success" as const : status === "partial" ? "warning" as const : "blue" as const; }
function approvalText(entry: FinancialEntry) {
  const base = approvalLabels[entry.approval_status] || entry.approval_status;
  return entry.approval_status === "pending" ? `${base} ${entry.approval_count || 0}/${entry.required_approvals}` : base;
}

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
  const [approvalFilter, setApprovalFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<FinancialEntryDetail | null>(null);
  const [counterpartySearch, setCounterpartySearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const debouncedCounterpartySearch = useDebouncedValue(counterpartySearch);
  const finance = useFinanceEntries(
    entryType,
    selectedEntryId,
    {
      page,
      pageSize,
      search: debouncedSearch,
      approvalStatus: approvalFilter,
    },
    editorOpen,
    debouncedCounterpartySearch,
    editing?.counterpart_entity_id || "",
  );

  useEffect(() => {
    setPage(1);
  }, [search, approvalFilter, pageSize, entryType]);

  const isReceivable = entryType === "receivable";
  const canCreate = hasPermission(isReceivable ? "finance.receivables.create" : "finance.payables.create");
  const canEdit = hasPermission(isReceivable ? "finance.receivables.edit" : "finance.payables.edit");
  const canApprove = hasPermission(isReceivable ? "finance.receivables.approve" : "finance.payables.approve");
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

  if (selectedEntryId && !isReceivable) {
    if (finance.detailQuery.isLoading) return <div className="py-10"><LoadingState text="Carregando lançamento..." /></div>;
    if (finance.detailQuery.error) return <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{finance.detailQuery.error instanceof Error ? finance.detailQuery.error.message : "Não foi possível carregar o lançamento."}</div>;
    if (finance.detailQuery.data) return <>
      <FinanceEntryDetail
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
      <FinanceEntryEditorDialog
        open={editorOpen}
        entryType={entryType}
        initial={editing}
        counterparties={counterparties}
        counterpartySearch={counterpartySearch}
        counterpartyLoading={finance.counterpartiesQuery.isFetching}
        onCounterpartySearchChange={setCounterpartySearch}
        categories={categories}
        saving={finance.saveMutation.isPending}
        onClose={closeEditor}
        onSave={save}
      />
    </>;
  }

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
    <div className="grid gap-3 border-b border-border pb-4 sm:grid-cols-[minmax(0,1fr)_220px] sm:items-end">
      <div className="relative"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><FInput aria-label="Pesquisar contas" className="pl-9" value={search} onChange={(event: any) => setSearch(event.target.value)} placeholder="Descrição, cliente, fornecedor, OS ou documento" /></div>
      <FSelect label="Aprovação" value={approvalFilter} options={[{ value: "all", label: "Todas" }, { value: "pending", label: "Pendente" }, { value: "approved", label: "Aprovada" }, { value: "rejected", label: "Rejeitada" }, { value: "cancelled", label: "Cancelada" }]} onChange={(event: any) => setApprovalFilter(event.target.value)} />
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
                <span>Recebido: <strong className="text-foreground">{formatCurrency(entry.settled_amount || 0)}</strong></span>
                <span>Saldo: <strong className="text-foreground">{formatCurrency(entry.remaining_amount ?? entry.original_amount)}</strong></span>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <Badge tone="blue">{originText(entry)}</Badge>
                <Badge tone={approvalTone(entry.approval_status)}>{approvalText(entry)}</Badge>
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
              <th className="text-right">Recebido</th>
              <th className="text-left">Aprovação</th>
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
                <td><Badge tone={approvalTone(entry.approval_status)}>{approvalText(entry)}</Badge></td>
                <td><Badge tone={operationalTone(entry.operational_status)}>{operationLabels[entry.operational_status || "open"] || entry.operational_status}</Badge></td>
                <td><div className="flex justify-end"><AdminIconButton ariaLabel="Ver detalhes" onClick={() => onSelectEntry(entry.id)}><Eye size={15} /></AdminIconButton></div></td>
              </FinanceTableRow>)}
            </tbody>
          </table>
        </FinanceTableSurface>
      </>}

    {canCreate && <AdminStickyToolbar className="justify-end">
      <AdminButton onClick={() => { setCounterpartySearch(""); setEditing(null); setEditorOpen(true); }}>Novo</AdminButton>
    </AdminStickyToolbar>}

    {isReceivable && selectedEntryId && <AdminDialog
      open
      onClose={() => onSelectEntry(null)}
      title="Conta a receber"
      description={finance.detailQuery.data?.description || "Extrato e movimentações da conta"}
      minimizedDescription={[finance.detailQuery.data?.counterpart_name_snapshot, finance.detailQuery.data ? formatCurrency(finance.detailQuery.data.original_amount) : null].filter(Boolean).join(" · ")}
      className="max-w-5xl"
    >
      {finance.detailQuery.isLoading
        ? <div className="py-10"><LoadingState text="Carregando extrato..." /></div>
        : finance.detailQuery.error
          ? <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{finance.detailQuery.error instanceof Error ? finance.detailQuery.error.message : "Não foi possível carregar a conta."}</div>
          : finance.detailQuery.data
            ? <FinanceEntryDetail
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
      saving={finance.saveMutation.isPending}
      onClose={closeEditor}
      onSave={save}
    />
  </div>;
}
