import { useMemo, useState } from "react";
import { AlertTriangle, Banknote, CalendarClock, TrendingDown, TrendingUp, WalletCards } from "lucide-react";
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCurrency } from "@/shared/domain/formatters";
import { FInput } from "@/shared/ui/admin/AdminFormControls";
import { EmptyState, LoadingState } from "@/shared/ui/admin/AdminFeedback";
import { AdminCard, AdminCardContent, AdminCardHeader } from "@/shared/ui/admin/AdminLayout";
import { useFinanceReports } from "../application/useFinanceReports";
import type { FinancialEntryType, FinancialReportFilters } from "../domain/finance.types";
import { FinancePendingApprovals } from "./FinancePendingApprovals";

function dateValue(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function defaultPeriod(): Pick<FinancialReportFilters, "from" | "to"> {
  const today = new Date();
  return {
    from: dateValue(new Date(today.getFullYear(), today.getMonth(), 1)),
    to: dateValue(new Date(today.getFullYear(), today.getMonth() + 1, 0)),
  };
}

function MetricCard({ title, value, detail, icon: Icon }: {
  title: string;
  value: number;
  detail: string;
  icon: typeof Banknote;
}) {
  return <AdminCard className="min-w-0 p-4 sm:p-5">
    <div className="flex items-center justify-between gap-3">
      <p className="text-xs font-semibold text-muted-foreground">{title}</p>
      <Icon size={18} className="shrink-0 text-primary" aria-hidden="true" />
    </div>
    <p className="mt-3 break-words text-xl font-bold tracking-tight text-foreground sm:text-2xl">{formatCurrency(value)}</p>
    <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
  </AdminCard>;
}

function DueCard({ title, amount, detail, warning = false }: {
  title: string;
  amount: number;
  detail: string;
  warning?: boolean;
}) {
  return <div className="flex items-center justify-between gap-3 border-b border-border py-3 last:border-0">
    <div className="min-w-0"><p className="text-sm font-semibold text-foreground">{title}</p><p className="text-xs text-muted-foreground">{detail}</p></div>
    <span className={`shrink-0 text-sm font-bold tabular-nums ${warning && amount > 0 ? "text-red-600 dark:text-red-400" : "text-foreground"}`}>{formatCurrency(amount)}</span>
  </div>;
}

export function FinanceOverviewFoundation({ onSelectEntry }: {
  onSelectEntry: (type: FinancialEntryType, id: string) => void;
}) {
  const [period, setPeriod] = useState(defaultPeriod);
  const filters = useMemo<FinancialReportFilters>(() => ({ ...period }), [period]);
  const reports = useFinanceReports(filters, { dre: false });
  const dashboard = reports.dashboardQuery.data;
  const visible = dashboard?.visibility;
  const chartRows = useMemo(() => (reports.cashFlowQuery.data?.rows || []).map(row => ({
    ...row,
    label: new Date(`${row.date.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
  })), [reports.cashFlowQuery.data?.rows]);

  return <div className="space-y-5">
    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <h2 className="text-lg font-bold text-foreground">Resumo financeiro</h2>
        <p className="mt-1 text-sm text-muted-foreground">Acompanhe saldos, contas e vencimentos da empresa.</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <FInput label="De" type="date" value={period.from} onChange={(event: any) => setPeriod(current => ({ ...current, from: event.target.value }))} />
        <FInput label="Até" type="date" value={period.to} onChange={(event: any) => setPeriod(current => ({ ...current, to: event.target.value }))} />
      </div>
    </div>

    {reports.dashboardQuery.error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{reports.dashboardQuery.error instanceof Error ? reports.dashboardQuery.error.message : "Não foi possível carregar o resumo financeiro."}</div>}

    {reports.dashboardQuery.isLoading ? <AdminCard className="p-8"><LoadingState text="Carregando resumo financeiro..." /></AdminCard> : dashboard && <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {visible?.balance && <MetricCard title="Saldo disponível" value={dashboard.available_balance} detail="Dinheiro nas contas e caixas" icon={Banknote} />}
        {visible?.receivables && <MetricCard title="A receber" value={dashboard.receivable_open} detail="Valores que ainda devem entrar" icon={TrendingUp} />}
        {visible?.payables && <MetricCard title="A pagar" value={dashboard.payable_open} detail="Valores que ainda devem sair" icon={TrendingDown} />}
        {visible?.result && <MetricCard title="Resultado do período" value={dashboard.period_result} detail="Receitas menos despesas" icon={WalletCards} />}
      </div>
      {(visible?.receivables || visible?.payables) && <AdminCard>
        <AdminCardHeader><div className="flex items-center gap-2"><CalendarClock size={17} className="text-primary" /><h3 className="text-sm font-bold text-foreground">Vencimentos e pendências</h3></div></AdminCardHeader>
        <AdminCardContent className="grid gap-x-8 md:grid-cols-2">
          {visible?.receivables && <DueCard title="Receber hoje" amount={dashboard.due_today_receivable} detail="Contas com vencimento hoje" />}
          {visible?.payables && <DueCard title="Pagar hoje" amount={dashboard.due_today_payable} detail="Contas com vencimento hoje" />}
          {visible?.receivables && <DueCard title="Recebimentos atrasados" amount={dashboard.overdue_receivable} detail="Contas vencidas e não recebidas" warning />}
          {visible?.payables && <DueCard title="Pagamentos atrasados" amount={dashboard.overdue_payable} detail="Contas vencidas e não pagas" warning />}
        </AdminCardContent>
      </AdminCard>}
    </>}

    {reports.canCashFlow && <AdminCard>
      <AdminCardHeader>
        <div><h3 className="text-sm font-bold text-foreground">Entradas e saídas</h3><p className="mt-1 text-xs text-muted-foreground">Comparativo entre o valor previsto e o realizado no período.</p></div>
      </AdminCardHeader>
      <AdminCardContent>
        {reports.cashFlowQuery.isLoading ? <LoadingState text="Carregando movimentações..." /> : chartRows.length === 0 ? <EmptyState icon={AlertTriangle} title="Nenhuma movimentação no período" /> : <div className="h-64 w-full sm:h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartRows}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(value: any) => Number(value).toLocaleString("pt-BR", { notation: "compact" })} />
              <Tooltip formatter={(value: any) => formatCurrency(Number(value || 0))} />
              <Legend />
              <Area type="monotone" dataKey="forecast_net" name="Previsto" stroke="#0057e7" fill="#dbeafe" />
              <Area type="monotone" dataKey="realized_net" name="Realizado" stroke="#16a34a" fill="#dcfce7" />
            </AreaChart>
          </ResponsiveContainer>
        </div>}
      </AdminCardContent>
    </AdminCard>}

    {visible?.approvals && <FinancePendingApprovals onSelectEntry={onSelectEntry} />}
  </div>;
}
