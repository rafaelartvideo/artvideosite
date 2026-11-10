import { AdminWorkspaceSkeleton } from "@/shared/ui/admin/AdminWorkspaceSkeleton";
import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { AlertTriangle, Banknote, CalendarClock, ClipboardList, Clock3, TrendingDown, TrendingUp, WalletCards } from "lucide-react";
import { Area, AreaChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCurrency } from "@/shared/domain/formatters";
import { FInput } from "@/shared/ui/admin/AdminFormControls";
import { EmptyState } from "@/shared/ui/admin/AdminFeedback";
import { AdminCard, AdminCardContent, AdminCardHeader } from "@/shared/ui/admin/AdminLayout";
import { useFinanceReports } from "../application/useFinanceReports";
import type { FinancialEntryType, FinancialReportFilters, FinanceSection } from "../domain/finance.types";
import { FinanceMetricDetailsDialog, type FinanceMetricKind } from "./FinanceMetricDetailsDialog";

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

function MetricCard({ title, value, detail, icon: Icon, onClick }: {
  title: string;
  value: number;
  detail: string;
  icon: typeof Banknote;
  onClick: () => void;
}) {
  return <button type="button" onClick={onClick} aria-label={`Ver detalhes de ${title}`}
    className="min-w-0 rounded-xl text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
    <AdminCard className="h-full min-w-0 p-4 transition-colors hover:border-primary/40 hover:bg-muted/30 sm:p-5">
    <div className="flex items-center justify-between gap-3">
      <p className="text-xs font-semibold text-muted-foreground">{title}</p>
      <Icon size={18} className="shrink-0 text-primary" aria-hidden="true" />
    </div>
    <p className="mt-3 break-words text-xl font-bold tracking-tight text-foreground sm:text-2xl">{formatCurrency(value)}</p>
    <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </AdminCard>
  </button>;
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

type OpenOsProjection = { count: number; withEstimate: number; estimatedAmount: number };

/** Previsão comercial: OS ainda não concluídas não são títulos financeiros. */
async function getOpenOsProjection(organizationId: string): Promise<OpenOsProjection> {
  const projection: OpenOsProjection = { count: 0, withEstimate: 0, estimatedAmount: 0 };
  const pageSize = 500;
  let offset = 0;
  for (;;) {
    const { data, error } = await supabase.from("service_orders")
      .select("id,final_total,subtotal,estimated_price")
      .eq("organization_id", organizationId)
      .is("completed_at", null)
      .is("cancelled_at", null)
      .order("id", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    const rows = data || [];
    for (const row of rows) {
      projection.count += 1;
      const estimate = [row.final_total, row.subtotal, row.estimated_price]
        .map(value => Number(value || 0)).find(value => Number.isFinite(value) && value > 0) || 0;
      if (estimate > 0) {
        projection.withEstimate += 1;
        projection.estimatedAmount += estimate;
      }
    }
    if (rows.length < pageSize) break;
    offset += pageSize;
  }
  return projection;
}

function InsightTile({ title, amount, detail, tone = "default", onClick }: {
  title: string; amount: number; detail: string;
  tone?: "default" | "positive" | "negative" | "warning";
  onClick?: () => void;
}) {
  const amountColor = {
    default: "text-foreground",
    positive: "text-emerald-600 dark:text-emerald-400",
    negative: "text-red-600 dark:text-red-400",
    warning: "text-amber-600 dark:text-amber-400",
  }[tone];
  const content = <>
    <p className="text-sm font-semibold text-muted-foreground">{title}</p>
    <p className={`mt-2 break-words text-xl font-bold tabular-nums ${amountColor}`}>{formatCurrency(amount)}</p>
    <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
  </>;
  return onClick
    ? <button type="button" onClick={onClick} className="min-w-0 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-primary/40 hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">{content}</button>
    : <div className="min-w-0 rounded-xl border border-border bg-card p-4">{content}</div>;
}

export function FinanceOverviewFoundation({ onSelectEntry, onSelectSection, onInitialReady }: {
  onSelectEntry: (type: FinancialEntryType, id: string) => void;
  onSelectSection: (section: FinanceSection) => void;
  onInitialReady?: () => void;
}) {
  const { activeOrganizationId, hasPermission } = useAuth();
  const canViewOpenOs = hasPermission("orders.view_all");
  const openOsQuery = useQuery({
    queryKey: ["finance", activeOrganizationId || "none", "open-os-projection"],
    enabled: Boolean(activeOrganizationId && hasPermission("finance.dashboard.view") && canViewOpenOs),
    staleTime: 60_000,
    queryFn: () => getOpenOsProjection(activeOrganizationId!),
  });
  const [period, setPeriod] = useState(defaultPeriod);
  const [metricKind, setMetricKind] = useState<FinanceMetricKind | null>(null);
  const filters = useMemo<FinancialReportFilters>(() => ({ ...period }), [period]);
  const reports = useFinanceReports(filters, { dre: false });
  const dashboard = reports.dashboardQuery.data;
  const visible = dashboard?.visibility;
  const flowTotals = reports.cashFlowQuery.data?.totals;
  const receivableAfterWeek = Math.max(0, (dashboard?.receivable_open || 0) - (dashboard?.overdue_receivable || 0) - (dashboard?.due_today_receivable || 0) - (dashboard?.upcoming_receivable || 0));
  const payableAfterWeek = Math.max(0, (dashboard?.payable_open || 0) - (dashboard?.overdue_payable || 0) - (dashboard?.due_today_payable || 0) - (dashboard?.upcoming_payable || 0));
  const chartRows = useMemo(() => (reports.cashFlowQuery.data?.rows || []).map(row => ({
    ...row,
    label: new Date(`${row.date.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
  })), [reports.cashFlowQuery.data?.rows]);

  useEffect(() => {
    if (!reports.dashboardQuery.isPending && (!reports.canCashFlow || !reports.cashFlowQuery.isPending)) onInitialReady?.();
  }, [onInitialReady, reports.dashboardQuery.isPending, reports.cashFlowQuery.isPending, reports.canCashFlow]);

  return <div className="space-y-5">
    {dashboard && metricKind && <FinanceMetricDetailsDialog
      key={metricKind} kind={metricKind} dashboard={dashboard} period={period}
      onClose={() => setMetricKind(null)} onNavigateTo={onSelectSection} onSelectEntry={onSelectEntry}
    />}
    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <h2 className="text-lg font-bold text-foreground">Resumo financeiro</h2>
        <p className="mt-1 text-sm text-muted-foreground">Posição atual, vencimentos, projeções e resultado da empresa.</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <FInput label="De" type="date" value={period.from} onChange={(event: any) => setPeriod(current => ({ ...current, from: event.target.value }))} />
        <FInput label="Até" type="date" value={period.to} onChange={(event: any) => setPeriod(current => ({ ...current, to: event.target.value }))} />
      </div>
    </div>

    <p className="text-xs text-muted-foreground">O período selecionado altera o resultado e o fluxo de caixa; saldos e vencimentos mostram a posição atual.</p>

    {reports.dashboardQuery.error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{reports.dashboardQuery.error instanceof Error ? reports.dashboardQuery.error.message : "Não foi possível carregar o resumo financeiro."}</div>}

    {reports.dashboardQuery.isLoading ? <AdminWorkspaceSkeleton variant="cards" rows={3} /> : dashboard && <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {visible?.balance && <MetricCard title="Saldo disponível" value={dashboard.available_balance} detail="Dinheiro nas contas e caixas" icon={Banknote} onClick={() => setMetricKind("balance")} />}
        {visible?.receivables && <MetricCard title="A receber" value={dashboard.receivable_open} detail="Valores que ainda devem entrar" icon={TrendingUp} onClick={() => setMetricKind("receivables")} />}
        {visible?.payables && <MetricCard title="A pagar" value={dashboard.payable_open} detail="Valores que ainda devem sair" icon={TrendingDown} onClick={() => setMetricKind("payables")} />}
        {visible?.result && <MetricCard title="Resultado do período" value={dashboard.period_result} detail="Receitas menos despesas" icon={WalletCards} onClick={() => setMetricKind("result")} />}
      </div>
      {(visible?.receivables || visible?.payables) && <>
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="flex items-center gap-2"><CalendarClock size={18} className="text-primary" /><h3 className="text-base font-bold text-foreground">Agenda financeira de hoje</h3></div>
          <span className="text-xs font-semibold text-muted-foreground">{new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {visible?.receivables && <InsightTile title="A receber hoje" amount={dashboard.due_today_receivable} detail="Parcelas pendentes com vencimento hoje" tone="positive" onClick={() => onSelectSection("receivables")} />}
          {visible?.payables && <InsightTile title="A pagar hoje" amount={dashboard.due_today_payable} detail="Parcelas pendentes com vencimento hoje" tone="negative" onClick={() => onSelectSection("payables")} />}
          {visible?.receivables && <InsightTile title="Recebimentos vencidos" amount={dashboard.overdue_receivable} detail="Saldo de parcelas já atrasadas" tone="warning" onClick={() => onSelectSection("receivables")} />}
          {visible?.payables && <InsightTile title="Pagamentos vencidos" amount={dashboard.overdue_payable} detail="Saldo de parcelas já atrasadas" tone="warning" onClick={() => onSelectSection("payables")} />}
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <AdminCard>
            <AdminCardHeader><div className="flex items-center gap-2"><Clock3 size={17} className="text-primary" /><h3 className="text-sm font-bold text-foreground">Próximos 7 dias</h3></div></AdminCardHeader>
            <AdminCardContent>
              {visible?.receivables && <DueCard title="Entradas previstas" amount={dashboard.upcoming_receivable} detail="A vencer nos próximos 7 dias, sem incluir hoje" />}
              {visible?.payables && <DueCard title="Saídas previstas" amount={dashboard.upcoming_payable} detail="A vencer nos próximos 7 dias, sem incluir hoje" />}
              {visible?.receivables && visible?.payables && <DueCard title="Diferença prevista" amount={dashboard.upcoming_receivable - dashboard.upcoming_payable} detail="Entradas menos saídas previstas" />}
            </AdminCardContent>
          </AdminCard>
          <AdminCard>
            <AdminCardHeader><div className="flex items-center gap-2"><CalendarClock size={17} className="text-primary" /><h3 className="text-sm font-bold text-foreground">Após 7 dias</h3></div></AdminCardHeader>
            <AdminCardContent>
              {visible?.receivables && <DueCard title="A receber mais à frente" amount={receivableAfterWeek} detail="Parcelas futuras, fora dos próximos 7 dias" />}
              {visible?.payables && <DueCard title="A pagar mais à frente" amount={payableAfterWeek} detail="Parcelas futuras, fora dos próximos 7 dias" />}
              {visible?.receivables && visible?.payables && <DueCard title="Diferença futura" amount={receivableAfterWeek - payableAfterWeek} detail="Projeção líquida após os próximos 7 dias" />}
            </AdminCardContent>
          </AdminCard>
        </div>
        <AdminCard>
        <AdminCardHeader><div className="flex items-center gap-2"><WalletCards size={17} className="text-primary" /><h3 className="text-sm font-bold text-foreground">Posição consolidada</h3></div></AdminCardHeader>
        <AdminCardContent className="grid gap-x-8 md:grid-cols-2">
          {visible?.receivables && <DueCard title="Total a receber" amount={dashboard.receivable_open} detail="Todos os recebíveis ainda não baixados" />}
          {visible?.payables && <DueCard title="Total a pagar" amount={dashboard.payable_open} detail="Todas as obrigações ainda não baixadas" />}
          {visible?.balance && visible?.receivables && visible?.payables && <DueCard title="Saldo + carteira líquida" amount={dashboard.available_balance + dashboard.receivable_open - dashboard.payable_open} detail="Projeção bruta, sem considerar prazos ou taxas" />}
          {visible?.receivables && visible?.payables && <DueCard title="Diferença de hoje" amount={dashboard.due_today_receivable - dashboard.due_today_payable} detail="Vencimentos de hoje, sem incluir atrasados" />}
        </AdminCardContent>
      </AdminCard>
      </>}
      {canViewOpenOs && <AdminCard>
        <AdminCardHeader><div className="flex items-center gap-2"><ClipboardList size={17} className="text-primary" /><div><h3 className="text-sm font-bold text-foreground">OS não concluídas — receita potencial</h3><p className="mt-1 text-xs text-muted-foreground">Projeção comercial separada dos títulos a receber e do saldo disponível.</p></div></div></AdminCardHeader>
        <AdminCardContent>
          {openOsQuery.isPending ? <AdminWorkspaceSkeleton variant="cards" rows={1} /> : openOsQuery.error
            ? <p role="alert" className="text-sm text-red-600">Não foi possível consultar as OS em andamento.</p>
            : <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg bg-muted/35 p-4"><p className="text-xs font-semibold text-muted-foreground">OS em aberto</p><p className="mt-2 text-2xl font-bold tabular-nums text-foreground">{openOsQuery.data?.count.toLocaleString("pt-BR") || "0"}</p></div>
                <div className="rounded-lg bg-muted/35 p-4"><p className="text-xs font-semibold text-muted-foreground">OS com valor estimado</p><p className="mt-2 text-2xl font-bold tabular-nums text-foreground">{openOsQuery.data?.withEstimate.toLocaleString("pt-BR") || "0"}</p></div>
                <div className="rounded-lg bg-primary/5 p-4"><p className="text-xs font-semibold text-muted-foreground">Potencial ainda não faturado</p><p className="mt-2 text-2xl font-bold tabular-nums text-primary">{formatCurrency(openOsQuery.data?.estimatedAmount || 0)}</p></div>
              </div>}
          <p className="mt-3 text-xs text-muted-foreground">Somente OS não concluídas e não canceladas. Valores estimados podem mudar e não representam dinheiro confirmado a receber.</p>
        </AdminCardContent>
      </AdminCard>}
      {(visible?.approvals || visible?.collections || visible?.scheduled_settlements) && <div className="grid gap-3 sm:grid-cols-3">
        {visible?.approvals && <AdminCard className="p-4"><p className="text-xs font-semibold text-muted-foreground">Aprovações pendentes</p><p className="mt-2 text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-400">{dashboard.pending_approvals.toLocaleString("pt-BR")}</p></AdminCard>}
        {visible?.collections && <AdminCard className="p-4"><p className="text-xs font-semibold text-muted-foreground">Cobranças com retorno em 7 dias</p><p className="mt-2 text-2xl font-bold tabular-nums text-foreground">{dashboard.collection_followups.toLocaleString("pt-BR")}</p></AdminCard>}
        {visible?.scheduled_settlements && <AdminCard className="p-4"><p className="text-xs font-semibold text-muted-foreground">Liquidações programadas em atraso</p><p className="mt-2 text-2xl font-bold tabular-nums text-amber-600 dark:text-amber-400">{dashboard.overdue_scheduled_settlements.toLocaleString("pt-BR")}</p></AdminCard>}
      </div>}
      {reports.canCashFlow && flowTotals && <AdminCard>
        <AdminCardHeader><div><h3 className="text-sm font-bold text-foreground">Realizado e previsto no período</h3><p className="mt-1 text-xs text-muted-foreground">Valores do fluxo de caixa no intervalo selecionado.</p></div></AdminCardHeader>
        <AdminCardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <InsightTile title="Entradas realizadas" amount={flowTotals.realized_in} detail="Recebimentos efetivados" tone="positive" onClick={() => onSelectSection("movements")} />
          <InsightTile title="Saídas realizadas" amount={flowTotals.realized_out} detail="Pagamentos efetivados" tone="negative" onClick={() => onSelectSection("movements")} />
          <InsightTile title="Entradas previstas" amount={flowTotals.forecast_in} detail="Previsão do fluxo de caixa" />
          <InsightTile title="Saídas previstas" amount={flowTotals.forecast_out} detail="Previsão do fluxo de caixa" />
        </AdminCardContent>
      </AdminCard>}
    </>}

    {reports.canCashFlow && <AdminCard>
      <AdminCardHeader>
        <div><h3 className="text-sm font-bold text-foreground">Entradas e saídas</h3><p className="mt-1 text-xs text-muted-foreground">Comparativo entre o valor previsto e o realizado no período.</p></div>
      </AdminCardHeader>
      <AdminCardContent>
        {reports.cashFlowQuery.isLoading ? <AdminWorkspaceSkeleton variant="table" columns={6} rows={4} /> : chartRows.length === 0 ? <EmptyState icon={AlertTriangle} title="Nenhuma movimentação no período" /> : <div className="h-64 w-full sm:h-72">
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

  </div>;
}
