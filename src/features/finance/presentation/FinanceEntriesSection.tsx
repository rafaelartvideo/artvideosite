import { useMemo, useState } from "react";
import { BanknoteArrowDown, BanknoteArrowUp, Eye, Plus, Search } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { formatCurrency } from "@/shared/domain/formatters";
import { FInput, FSelect } from "@/shared/ui/admin/AdminFormControls";
import { EmptyState, LoadingState } from "@/shared/ui/admin/AdminFeedback";
import { AdminButton, AdminCard, AdminCardToolbar, AdminIconButton } from "@/shared/ui/admin/AdminLayout";
import { useFinanceEntries } from "../application/useFinanceEntries";
import { useFinanceFoundation } from "../application/useFinanceFoundation";
import type { FinancialEntry, FinancialEntryDetail, FinancialEntryType, FinancialSettlementDraft } from "../domain/finance.types";
import { FinanceEntryDetail } from "./FinanceEntryDetail";
import { FinanceEntryEditorDialog } from "./FinanceEntryEditorDialog";

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

export function FinanceEntriesSection({ entryType, selectedEntryId, onSelectEntry }: { entryType: FinancialEntryType; selectedEntryId?: string | null; onSelectEntry: (id: string | null) => void }) {
  const { user, hasPermission } = useAuth();
  const finance = useFinanceEntries(entryType, selectedEntryId);
  const foundation = useFinanceFoundation();
  const [search, setSearch] = useState("");
  const [approvalFilter, setApprovalFilter] = useState("all");
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<FinancialEntryDetail | null>(null);

  const isReceivable = entryType === "receivable";
  const title = isReceivable ? "Contas a receber" : "Contas a pagar";
  const canCreate = hasPermission(isReceivable ? "finance.receivables.create" : "finance.payables.create");
  const canEdit = hasPermission(isReceivable ? "finance.receivables.edit" : "finance.payables.edit");
  const canApprove = hasPermission(isReceivable ? "finance.receivables.approve" : "finance.payables.approve");
  const canSettle = hasPermission("finance.settlements.create");
  const canReverseSettlement = hasPermission("finance.settlements.reverse");
  const entries = finance.entriesQuery.data || [];
  const counterparties = finance.counterpartiesQuery.data || [];
  const categories = foundation.categoriesQuery.data || [];
  const costCenters = foundation.costCentersQuery.data || [];
  const accounts = foundation.accountsQuery.data || [];
  const paymentMethods = foundation.paymentMethodsQuery.data || [];

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return entries.filter(entry => {
      if (approvalFilter !== "all" && entry.approval_status !== approvalFilter) return false;
      if (!term) return true;
      return [
        entry.description,
        entry.counterpart_name_snapshot,
        entry.counterpart_document_snapshot,
        entry.origin_reference,
        originText(entry),
        sourceValue(entry, "os_number"),
        sourceValue(entry, "inventory_item_name"),
        sourceValue(entry, "inventory_item_sku"),
        sourceValue(entry, "document_reference"),
        sourceValue(entry, "purchase_reference"),
      ].some(value => String(value || "").toLocaleLowerCase("pt-BR").includes(term));
    });
  }, [entries, search, approvalFilter]);

  const save = async (draft: any) => {
    const id = await finance.saveMutation.mutateAsync(draft);
    setEditorOpen(false);
    setEditing(null);
    onSelectEntry(id);
  };

  if (selectedEntryId) {
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
        onEdit={() => { setEditing(finance.detailQuery.data || null); setEditorOpen(true); }}
        onApprove={async () => { await finance.decisionMutation.mutateAsync({ id: finance.detailQuery.data!.id, action: "approve" }); }}
        onReject={async note => { await finance.decisionMutation.mutateAsync({ id: finance.detailQuery.data!.id, action: "reject", note }); }}
        onRegisterSettlement={async (draft: FinancialSettlementDraft) => { await finance.settlementMutation.mutateAsync(draft); }}
        onConfirmSettlement={async settlementId => { await finance.confirmSettlementMutation.mutateAsync({ settlementId }); }}
        onReverseSettlement={async (settlementId, reason) => { await finance.reverseSettlementMutation.mutateAsync({ settlementId, reason }); }}
      />
      <FinanceEntryEditorDialog open={editorOpen} entryType={entryType} initial={editing} counterparties={counterparties} categories={categories} costCenters={costCenters} saving={finance.saveMutation.isPending} onClose={() => { if (!finance.saveMutation.isPending) { setEditorOpen(false); setEditing(null); } }} onSave={save} />
    </>;
  }

  const Icon = isReceivable ? BanknoteArrowUp : BanknoteArrowDown;
  return <div className="space-y-4">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="text-lg font-black text-[#0d1b2e]">{title}</h2><p className="mt-1 text-xs text-[#5a6a82]">Lançamentos, parcelas, rateio, aprovações, baixas e histórico financeiro.</p></div>{canCreate && <AdminButton onClick={() => { setEditing(null); setEditorOpen(true); }}><Plus size={16} /> Novo lançamento</AdminButton>}</div>

    <AdminCard>
      <AdminCardToolbar><div className="grid w-full gap-3 sm:grid-cols-[1fr_220px_auto] sm:items-end"><div className="relative"><Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#5a6a82]" /><FInput aria-label="Pesquisar lançamentos" className="pl-9" value={search} onChange={(event: any) => setSearch(event.target.value)} placeholder="Descrição, contraparte, OS, item ou documento" /></div><FSelect label="Aprovação" value={approvalFilter} options={[{ value: "all", label: "Todos" }, { value: "pending", label: "Pendente" }, { value: "approved", label: "Aprovado" }, { value: "rejected", label: "Rejeitado" }, { value: "cancelled", label: "Cancelado" }]} onChange={(event: any) => setApprovalFilter(event.target.value)} /><p className="pb-2 text-xs font-semibold text-[#5a6a82]">{filtered.length} {filtered.length === 1 ? "lançamento" : "lançamentos"}</p></div></AdminCardToolbar>
      {finance.entriesQuery.isLoading ? <div className="p-10"><LoadingState /></div> : finance.entriesQuery.error ? <div className="m-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{finance.entriesQuery.error instanceof Error ? finance.entriesQuery.error.message : "Não foi possível carregar os lançamentos."}</div> : filtered.length === 0 ? <div className="p-10"><EmptyState icon={Icon} title={`Nenhum lançamento ${isReceivable ? "a receber" : "a pagar"}`} /></div> : <>
        <div className="grid gap-3 p-3 md:hidden">{filtered.map(entry => <button key={entry.id} type="button" onClick={() => onSelectEntry(entry.id)} className="rounded-xl border border-[#0d1b2e]/8 bg-white p-4 text-left shadow-sm"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-black text-[#0d1b2e]">{entry.description}</p><p className="mt-1 truncate text-xs text-[#5a6a82]">{entry.counterpart_name_snapshot || "Sem contraparte"}</p></div><p className="shrink-0 text-sm font-black text-[#0057e7]">{formatCurrency(entry.original_amount)}</p></div><div className="mt-3 flex flex-wrap gap-1.5"><Badge tone="blue">{originText(entry)}</Badge><Badge tone={approvalTone(entry.approval_status)}>{approvalText(entry)}</Badge><Badge tone={operationalTone(entry.operational_status)}>{operationLabels[entry.operational_status || "open"] || entry.operational_status}</Badge></div><div className="mt-3 grid grid-cols-2 gap-2 text-xs text-[#5a6a82]"><span>Emissão: <strong>{formatDate(entry.issue_date)}</strong></span><span>Vencimento: <strong>{formatDate(entry.next_due_date)}</strong></span></div></button>)}</div>
        <div className="hidden overflow-x-auto md:block"><table className="min-w-[1020px]"><thead><tr><th className="text-left">Descrição</th><th className="text-left">Contraparte</th><th className="text-left">Emissão</th><th className="text-left">Próx. vencimento</th><th className="text-right">Valor</th><th className="text-left">Aprovação</th><th className="text-left">Situação</th><th className="text-right">Ações</th></tr></thead><tbody>{filtered.map((entry: FinancialEntry) => <tr key={entry.id}><td><p className="font-bold text-[#0d1b2e]">{entry.description}</p><p className="text-[10px] font-bold uppercase text-[#0057e7]">{originText(entry)}</p></td><td className="text-xs text-[#5a6a82]">{entry.counterpart_name_snapshot || "—"}</td><td className="text-xs">{formatDate(entry.issue_date)}</td><td className="text-xs font-semibold">{formatDate(entry.next_due_date)}</td><td className="text-right font-black text-[#0057e7]">{formatCurrency(entry.original_amount)}</td><td><Badge tone={approvalTone(entry.approval_status)}>{approvalText(entry)}</Badge></td><td><Badge tone={operationalTone(entry.operational_status)}>{operationLabels[entry.operational_status || "open"] || entry.operational_status}</Badge></td><td><div className="flex justify-end"><AdminIconButton ariaLabel="Ver detalhes" onClick={() => onSelectEntry(entry.id)}><Eye size={15} /></AdminIconButton></div></td></tr>)}</tbody></table></div>
      </>}
    </AdminCard>

    <FinanceEntryEditorDialog open={editorOpen} entryType={entryType} initial={editing} counterparties={counterparties} categories={categories} costCenters={costCenters} saving={finance.saveMutation.isPending} onClose={() => { if (!finance.saveMutation.isPending) { setEditorOpen(false); setEditing(null); } }} onSave={save} />
  </div>;
}
