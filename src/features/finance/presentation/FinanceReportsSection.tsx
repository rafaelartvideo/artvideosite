import { useMemo, useState } from "react";
import { BarChart3, CalendarRange, RefreshCcw, TrendingUp } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAuth } from "@/lib/auth";
import { formatCurrency } from "@/shared/domain/formatters";
import { FInput, FSelect } from "@/shared/ui/admin/AdminFormControls";
import { EmptyState, LoadingState } from "@/shared/ui/admin/AdminFeedback";
import { AdminButton, AdminCard, AdminCardContent, AdminCardHeader } from "@/shared/ui/admin/AdminLayout";
import { useFinanceFoundation } from "../application/useFinanceFoundation";
import { useFinanceReports } from "../application/useFinanceReports";
import type { FinancialEntryOriginType, FinancialReportFilters } from "../domain/finance.types";

type ReportTab = "dre" | "cash-flow";

const ORIGIN_OPTIONS = [
  { value: "all", label: "Todas as origens" },
  { value: "manual", label: "Manual" },
  { value: "service_order", label: "Ordem de serviço" },
  { value: "inventory_purchase", label: "Compra de estoque" },
  { value: "recurring", label: "Recorrência" },
  { value: "other", label: "Outra" },
];

function dateValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function currentMonthFilters(): FinancialReportFilters {
  const now = new Date();
  return {
    from: dateValue(new Date(now.getFullYear(), now.getMonth(), 1)),
    to: dateValue(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
    category_id: null,
    cost_center_id: null,
    origin_type: null,
    account_id: null,
    payment_method_id: null,
  };
}

function monthLabel(value: string) {
  if (!value) return "—";
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
}

function dayLabel(value: string) {
  if (!value) return "—";
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function ReportMetric({ label, value, detail }: { label: string; value: number; detail: string }) {
  return <AdminCard className="p-4">
    <p className="text-[10px] font-bold uppercase tracking-wider text-[#5a6a82]">{label}</p>
    <p className="mt-1 text-xl font-black text-[#0d1b2e]">{formatCurrency(value)}</p>
    <p className="mt-1 text-xs text-[#5a6a82]">{detail}</p>
  </AdminCard>;
}

export function FinanceReportsSection() {
  const { hasPermission } = useAuth();
  const canDre = hasPermission("finance.reports.view") && hasPermission("finance.reports.dre");
  const canCashFlow = hasPermission("finance.reports.view") && hasPermission("finance.reports.cash_flow");
  const [tab, setTab] = useState<ReportTab>(canDre ? "dre" : "cash-flow");
  const [filters, setFilters] = useState<FinancialReportFilters>(() => currentMonthFilters());
  const foundation = useFinanceFoundation();
  const reports = useFinanceReports(filters);

  const categories = foundation.categoriesQuery.data || [];
  const costCenters = foundation.costCentersQuery.data || [];
  const accounts = foundation.accountsQuery.data || [];
  const paymentMethods = foundation.paymentMethodsQuery.data || [];

  const dre = reports.dreQuery.data;
  const cashFlow = reports.cashFlowQuery.data;

  const dreChart = useMemo(() => {
    const grouped = new Map<string, { month: string; revenue: number; expense: number }>();
    for (const row of dre?.rows || []) {
      const key = row.competence_month;
      const current = grouped.get(key) || { month: key, revenue: 0, expense: 0 };
      if (row.nature === "revenue") current.revenue += row.amount;
      else current.expense += row.amount;
      grouped.set(key, current);
    }
    return [...grouped.values()]
      .sort((a, b) => a.month.localeCompare(b.month))
      .map(item => ({ ...item, label: monthLabel(item.month) }));
  }, [dre?.rows]);

  const cashChart = useMemo(() => (cashFlow?.rows || []).map(row => ({
    ...row,
    label: dayLabel(row.date),
  })), [cashFlow?.rows]);

  const setFilter = <K extends keyof FinancialReportFilters>(key: K, value: FinancialReportFilters[K]) => {
    setFilters(current => ({ ...current, [key]: value }));
  };

  const resetFilters = () => setFilters(currentMonthFilters());
  const activeError = tab === "dre" ? reports.dreQuery.error : reports.cashFlowQuery.error;
  const errorText = activeError instanceof Error ? activeError.message : "";

  return <div className="space-y-4">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h2 className="text-lg font-black text-[#0d1b2e]">Relatórios financeiros</h2>
        <p className="mt-1 text-xs leading-relaxed text-[#5a6a82]">DRE por competência e Fluxo de Caixa previsto x realizado, sempre isolados pela empresa ativa.</p>
      </div>
      <AdminButton variant="secondary" onClick={resetFilters}><RefreshCcw size={15} /> Limpar filtros</AdminButton>
    </div>

    <div className="flex gap-1 overflow-x-auto border-b border-[#0d1b2e]/10">
      {canDre && <button type="button" onClick={() => setTab("dre")} className={`border-b-2 px-4 py-2.5 text-xs font-bold whitespace-nowrap ${tab === "dre" ? "border-[#0057e7] text-[#0057e7]" : "border-transparent text-[#5a6a82]"}`}>DRE</button>}
      {canCashFlow && <button type="button" onClick={() => setTab("cash-flow")} className={`border-b-2 px-4 py-2.5 text-xs font-bold whitespace-nowrap ${tab === "cash-flow" ? "border-[#0057e7] text-[#0057e7]" : "border-transparent text-[#5a6a82]"}`}>Fluxo de Caixa</button>}
    </div>

    <AdminCard className="p-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <FInput label="De" type="date" value={filters.from} onChange={(event: any) => setFilter("from", event.target.value)} />
        <FInput label="Até" type="date" value={filters.to} onChange={(event: any) => setFilter("to", event.target.value)} />
        <FSelect
          label="Categoria"
          value={filters.category_id || "all"}
          onChange={(event: any) => setFilter("category_id", event.target.value === "all" ? null : event.target.value)}
          options={[{ value: "all", label: "Todas as categorias" }, ...categories.map(item => ({ value: item.id, label: item.name }))]}
        />
        <FSelect
          label="Centro de custo"
          value={filters.cost_center_id || "all"}
          onChange={(event: any) => setFilter("cost_center_id", event.target.value === "all" ? null : event.target.value)}
          options={[{ value: "all", label: "Todos os centros" }, ...costCenters.map(item => ({ value: item.id, label: item.name }))]}
        />
        <FSelect
          label="Origem"
          value={filters.origin_type || "all"}
          onChange={(event: any) => setFilter("origin_type", event.target.value === "all" ? null : event.target.value as FinancialEntryOriginType)}
          options={ORIGIN_OPTIONS}
        />
        {tab === "cash-flow" && <FSelect
          label="Conta financeira"
          value={filters.account_id || "all"}
          onChange={(event: any) => setFilter("account_id", event.target.value === "all" ? null : event.target.value)}
          options={[{ value: "all", label: "Todas as contas" }, ...accounts.map(item => ({ value: item.id, label: item.name }))]}
        />}
        {tab === "cash-flow" && <FSelect
          label="Forma de pagamento"
          value={filters.payment_method_id || "all"}
          onChange={(event: any) => setFilter("payment_method_id", event.target.value === "all" ? null : event.target.value)}
          options={[{ value: "all", label: "Todas as formas" }, ...paymentMethods.map(item => ({ value: item.id, label: item.name }))]}
        />}
      </div>
      {tab === "cash-flow" && (filters.account_id || filters.payment_method_id) && <p className="mt-3 text-[11px] text-[#5a6a82]">Títulos ainda em aberto não possuem conta ou forma de pagamento definida; ao filtrar por esses campos, o previsto considera os repasses já programados.</p>}
    </AdminCard>

    {errorText && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorText}</div>}

    {tab === "dre" && canDre && <>
      {reports.dreQuery.isLoading ? <AdminCard className="p-10"><LoadingState text="Carregando DRE..." /></AdminCard> : !dre ? null : <>
        <div className="grid gap-3 sm:grid-cols-3">
          <ReportMetric label="Receitas" value={dre.totals.revenue} detail="Receitas aprovadas pela competência." />
          <ReportMetric label="Despesas" value={dre.totals.expense} detail="Despesas aprovadas pela competência." />
          <ReportMetric label="Resultado" value={dre.totals.result} detail="Receitas menos despesas no período." />
        </div>

        <AdminCard>
          <AdminCardHeader>
            <div><h3 className="text-sm font-black text-[#0d1b2e]">Receitas x despesas</h3><p className="mt-1 text-xs text-[#5a6a82]">Consolidação mensal por data de competência.</p></div>
          </AdminCardHeader>
          <AdminCardContent>
            {dreChart.length === 0 ? <EmptyState icon={BarChart3} title="Sem dados na DRE para o período" /> : <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dreChart}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(value: any) => Number(value).toLocaleString("pt-BR", { notation: "compact" })} />
                  <Tooltip formatter={(value: any) => formatCurrency(Number(value || 0))} />
                  <Legend />
                  <Bar dataKey="revenue" name="Receitas" fill="#16a34a" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="expense" name="Despesas" fill="#dc2626" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>}
          </AdminCardContent>
        </AdminCard>

        <AdminCard>
          <AdminCardHeader>
            <div><h3 className="text-sm font-black text-[#0d1b2e]">Detalhamento da DRE</h3><p className="mt-1 text-xs text-[#5a6a82]">{dre.rows.length} linhas consolidadas por categoria, centro de custo e origem.</p></div>
          </AdminCardHeader>
          <AdminCardContent className="p-0">
            {dre.rows.length === 0 ? <div className="p-8"><EmptyState icon={TrendingUp} title="Nenhum lançamento aprovado no período" /></div> : <div className="overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead className="border-b border-[#0d1b2e]/8 bg-slate-50 text-[#5a6a82]"><tr>
                  <th className="px-4 py-3">Competência</th><th className="px-4 py-3">Natureza</th><th className="px-4 py-3">Grupo</th><th className="px-4 py-3">Categoria</th><th className="px-4 py-3">Centro de custo</th><th className="px-4 py-3">Origem</th><th className="px-4 py-3 text-right">Valor</th>
                </tr></thead>
                <tbody className="divide-y divide-[#0d1b2e]/6">{dre.rows.map((row, index) => <tr key={`${row.competence_month}-${row.category_id}-${row.cost_center_id || "none"}-${row.origin_type}-${index}`}>
                  <td className="px-4 py-3 font-semibold text-[#0d1b2e]">{monthLabel(row.competence_month)}</td>
                  <td className="px-4 py-3"><span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${row.nature === "revenue" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}>{row.nature === "revenue" ? "Receita" : "Despesa"}</span></td>
                  <td className="px-4 py-3 text-[#5a6a82]">{row.report_group}</td>
                  <td className="px-4 py-3 text-[#0d1b2e]">{row.category_name}</td>
                  <td className="px-4 py-3 text-[#5a6a82]">{row.cost_center_name}</td>
                  <td className="px-4 py-3 text-[#5a6a82]">{row.origin_type}</td>
                  <td className="px-4 py-3 text-right font-black text-[#0d1b2e]">{formatCurrency(row.amount)}</td>
                </tr>)}</tbody>
              </table>
            </div>}
          </AdminCardContent>
        </AdminCard>
      </>}
    </>}

    {tab === "cash-flow" && canCashFlow && <>
      {reports.cashFlowQuery.isLoading ? <AdminCard className="p-10"><LoadingState text="Carregando Fluxo de Caixa..." /></AdminCard> : !cashFlow ? null : <>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <ReportMetric label="Previsto — entradas" value={cashFlow.totals.forecast_in} detail="Recebimentos e repasses previstos." />
          <ReportMetric label="Previsto — saídas" value={cashFlow.totals.forecast_out} detail="Pagamentos previstos." />
          <ReportMetric label="Previsto — líquido" value={cashFlow.totals.forecast_net} detail="Entradas previstas menos saídas previstas." />
          <ReportMetric label="Realizado — entradas" value={cashFlow.totals.realized_in} detail="Créditos efetivamente movimentados." />
          <ReportMetric label="Realizado — saídas" value={cashFlow.totals.realized_out} detail="Débitos efetivamente movimentados." />
          <ReportMetric label="Realizado — líquido" value={cashFlow.totals.realized_net} detail="Variação real do caixa no período." />
        </div>

        <AdminCard>
          <AdminCardHeader>
            <div><h3 className="text-sm font-black text-[#0d1b2e]">Previsto x realizado</h3><p className="mt-1 text-xs text-[#5a6a82]">Comparação diária entre compromissos previstos e dinheiro efetivamente movimentado.</p></div>
          </AdminCardHeader>
          <AdminCardContent>
            {cashChart.length === 0 ? <EmptyState icon={CalendarRange} title="Sem fluxo financeiro no período" /> : <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={cashChart}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(value: any) => Number(value).toLocaleString("pt-BR", { notation: "compact" })} />
                  <Tooltip formatter={(value: any) => formatCurrency(Number(value || 0))} />
                  <Legend />
                  <Bar dataKey="forecast_in" name="Entrada prevista" fill="#93c5fd" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="forecast_out" name="Saída prevista" fill="#fca5a5" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="realized_in" name="Entrada realizada" fill="#16a34a" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="realized_out" name="Saída realizada" fill="#dc2626" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>}
          </AdminCardContent>
        </AdminCard>

        <AdminCard>
          <AdminCardHeader>
            <div><h3 className="text-sm font-black text-[#0d1b2e]">Fluxo diário</h3><p className="mt-1 text-xs text-[#5a6a82]">Valores líquidos previstos e realizados por data.</p></div>
          </AdminCardHeader>
          <AdminCardContent className="p-0">
            {cashFlow.rows.length === 0 ? <div className="p-8"><EmptyState icon={CalendarRange} title="Nenhum movimento ou previsão encontrada" /></div> : <div className="overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead className="border-b border-[#0d1b2e]/8 bg-slate-50 text-[#5a6a82]"><tr>
                  <th className="px-4 py-3">Data</th><th className="px-4 py-3 text-right">Entrada prevista</th><th className="px-4 py-3 text-right">Saída prevista</th><th className="px-4 py-3 text-right">Líquido previsto</th><th className="px-4 py-3 text-right">Entrada realizada</th><th className="px-4 py-3 text-right">Saída realizada</th><th className="px-4 py-3 text-right">Líquido realizado</th>
                </tr></thead>
                <tbody className="divide-y divide-[#0d1b2e]/6">{cashFlow.rows.map(row => <tr key={row.date}>
                  <td className="px-4 py-3 font-semibold text-[#0d1b2e]">{new Date(`${row.date}T12:00:00`).toLocaleDateString("pt-BR")}</td>
                  <td className="px-4 py-3 text-right text-emerald-700">{formatCurrency(row.forecast_in)}</td>
                  <td className="px-4 py-3 text-right text-red-700">{formatCurrency(row.forecast_out)}</td>
                  <td className="px-4 py-3 text-right font-bold text-[#0d1b2e]">{formatCurrency(row.forecast_net)}</td>
                  <td className="px-4 py-3 text-right text-emerald-700">{formatCurrency(row.realized_in)}</td>
                  <td className="px-4 py-3 text-right text-red-700">{formatCurrency(row.realized_out)}</td>
                  <td className="px-4 py-3 text-right font-black text-[#0d1b2e]">{formatCurrency(row.realized_net)}</td>
                </tr>)}</tbody>
              </table>
            </div>}
          </AdminCardContent>
        </AdminCard>
      </>}
    </>}
  </div>;
}
