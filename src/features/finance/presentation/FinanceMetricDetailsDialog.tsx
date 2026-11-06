import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { queryKeys } from "@/infrastructure/query/query-keys";
import { formatCurrency, formatDateOnly } from "@/shared/domain/formatters";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { AdminMetricDetailDialog, type AdminMetricDetailRow } from "@/shared/ui/admin/AdminMetricDetailDialog";
import type { FinancialDashboardSummary, FinancialEntryType, FinanceSection } from "../domain/finance.types";
import { loadFinanceFoundation } from "../infrastructure/finance-foundation.repository";
import { getFinancialAccountBalances } from "../infrastructure/finance-movements.repository";
import { listFinancialEntriesPage } from "../infrastructure/finance-entries.repository";

export type FinanceMetricKind = "balance" | "receivables" | "payables" | "result";
const PAGE_SIZE = 10;
const ENTRY_FILTERS = [
  { value: "open", label: "Em aberto" },
  { value: "partial", label: "Parciais" },
  { value: "overdue", label: "Vencidas" },
] as const;

export function FinanceMetricDetailsDialog({
  kind, dashboard, period, onClose, onNavigateTo, onSelectEntry,
}: {
  kind: FinanceMetricKind;
  dashboard: FinancialDashboardSummary;
  period: { from: string; to: string };
  onClose: () => void;
  onNavigateTo: (section: FinanceSection) => void;
  onSelectEntry: (type: FinancialEntryType, id: string) => void;
}) {
  const { activeOrganizationId, hasPermission } = useAuth();
  const organizationId = activeOrganizationId || "";
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<"open" | "partial" | "overdue">("open");
  const isBalance = kind === "balance";
  const entryType: FinancialEntryType = kind === "payables" ? "payable" : "receivable";
  const isEntries = kind === "receivables" || kind === "payables";
  const canRead = isBalance ? hasPermission("finance.accounts.view")
    : kind === "result" ? hasPermission("finance.dashboard.view")
    : hasPermission(kind === "receivables" ? "finance.receivables.view" : "finance.payables.view");

  // Queries activate only after a card is clicked and only with the matching permission.
  const accountsQuery = useQuery({
    queryKey: queryKeys.finance.foundation(organizationId || "none"),
    queryFn: () => loadFinanceFoundation(organizationId),
    enabled: Boolean(isBalance && canRead && organizationId),
    staleTime: 60_000,
  });
  const balancesQuery = useQuery({
    queryKey: queryKeys.finance.balances(organizationId || "none"),
    queryFn: () => getFinancialAccountBalances(organizationId),
    enabled: Boolean(isBalance && canRead && organizationId),
    staleTime: 30_000,
  });
  const entriesQuery = useQuery({
    queryKey: [...queryKeys.finance.entries(organizationId || "none", entryType), "metric-detail", status, page],
    queryFn: () => listFinancialEntriesPage({
      organizationId, entryType, page, pageSize: PAGE_SIZE, operationalStatus: status,
    }),
    enabled: Boolean(isEntries && canRead && organizationId),
    staleTime: 30_000,
  });

  const title = { balance: "Saldo disponível", receivables: "A receber", payables: "A pagar", result: "Resultado do período" }[kind];
  const value = formatCurrency({
    balance: dashboard.available_balance, receivables: dashboard.receivable_open,
    payables: dashboard.payable_open, result: dashboard.period_result,
  }[kind]);

  let rows: AdminMetricDetailRow[] = [];
  let totalRows: number | undefined;
  let loading = false;
  let error: string | null = null;
  if (isBalance) {
    loading = accountsQuery.isPending || balancesQuery.isPending;
    const problem = accountsQuery.error || balancesQuery.error;
    if (problem) error = systemErrorMessage(problem);
    rows = (accountsQuery.data?.accounts || []).map(account => ({
      id: account.id,
      title: account.name,
      subtitle: account.account_type === "cash" ? "Caixa físico" : account.account_type === "bank" ? "Conta bancária" : account.account_type === "pix" ? "PIX" : "Outra conta",
      amount: formatCurrency(Number(balancesQuery.data?.[account.id] || 0)),
      onClick: () => onNavigateTo("accounts"),
    }));
  } else if (isEntries) {
    loading = entriesQuery.isPending;
    if (entriesQuery.error) error = systemErrorMessage(entriesQuery.error);
    totalRows = entriesQuery.data?.total;
    rows = (entriesQuery.data?.items || []).map(entry => ({
      id: entry.id,
      title: entry.description,
      subtitle: [entry.counterpart_name_snapshot, entry.next_due_date ? `Vence: ${formatDateOnly(entry.next_due_date)}` : null].filter(Boolean).join(" · "),
      amount: formatCurrency(Number(entry.remaining_amount || 0)),
      onClick: () => onSelectEntry(entryType, entry.id),
    }));
  } else if (kind === "result") {
    rows = [
      { id: "revenue", title: "Receitas do período", subtitle: `${formatDateOnly(period.from)} a ${formatDateOnly(period.to)}`, amount: formatCurrency(dashboard.period_revenue) },
      { id: "expense", title: "Despesas do período", subtitle: `${formatDateOnly(period.from)} a ${formatDateOnly(period.to)}`, amount: formatCurrency(dashboard.period_expense) },
    ];
  }

  const section: FinanceSection = isBalance ? "accounts" : kind === "result" ? "reports" : entryType === "receivable" ? "receivables" : "payables";
  const canNavigate = section !== "reports" || (hasPermission("finance.reports.view") && (hasPermission("finance.reports.dre") || hasPermission("finance.reports.cash_flow")));
  return <AdminMetricDetailDialog
      open onClose={onClose} title={title} value={value}
      description={kind === "result" ? "Receitas menos despesas, conforme o período selecionado." :
        isBalance ? "Composição do saldo por conta e caixa." : "Lançamentos organizados por situação. Valores pendentes aparecem na coluna à direita."}
      rows={canRead ? rows : []}
      toolbar={isEntries && canRead ? <label className="block space-y-1.5 text-xs font-semibold text-muted-foreground">
        Situação dos lançamentos
        <select aria-label="Filtrar situação dos lançamentos"
          value={status} onChange={event => { setStatus(event.target.value as typeof status); setPage(1); }}
          className="block min-h-10 w-full rounded-lg border border-border bg-card px-3 text-sm font-medium text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
          {ENTRY_FILTERS.map(filter => <option key={filter.value} value={filter.value}>{filter.label}</option>)}
        </select>
      </label> : undefined}
      loading={canRead && loading}
      error={!canRead ? "Você não possui permissão para consultar esses detalhes." : error}
      page={isEntries ? page : undefined} pageSize={PAGE_SIZE} totalRows={isEntries ? totalRows : undefined}
      onPageChange={isEntries ? setPage : undefined}
      emptyText="Nenhum lançamento nesta situação."
      onViewAll={canRead && canNavigate ? () => onNavigateTo(section) : undefined}
    />;
}
