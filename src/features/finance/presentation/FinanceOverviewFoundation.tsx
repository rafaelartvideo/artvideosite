import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Banknote,
  CalendarClock,
  CreditCard,
  Landmark,
  Settings2,
  Tags,
  Target,
  TrendingDown,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAuth } from "@/lib/auth";
import { formatCurrency } from "@/shared/domain/formatters";
import { FInput } from "@/shared/ui/admin/AdminFormControls";
import { EmptyState, LoadingState } from "@/shared/ui/admin/AdminFeedback";
import { AdminCard, AdminCardContent, AdminCardHeader } from "@/shared/ui/admin/AdminLayout";
import { useFinanceFoundation } from "../application/useFinanceFoundation";
import { useFinanceReports } from "../application/useFinanceReports";
import type { FinancialEntryType, FinancialReportFilters } from "../domain/finance.types";
import { FinancePendingApprovals } from "./FinancePendingApprovals";

function dateValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function defaultPeriod(): Pick<FinancialReportFilters, "from" | "to"> {
  const now = new Date();
  return {
    from: dateValue(new Date(now.getFullYear(), now.getMonth(), 1)),
    to: dateValue(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  };
}

function dayLabel(value: string) {
  if (!value) return "";
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function MetricCard({
  title,
  value,
  detail,
  icon: Icon,
  tone = "neutral",
}: {
  title: string;
  value: number;
  detail: string;
  icon: typeof Landmark;
  tone?: "neutral" | "positive" | "negative" | "warning";
}) {
  const toneClass = tone === "positive"
    ? "bg-emerald-50 text-emerald-700"
    : tone === "negative"
      ? "bg-red-50 text-red-700"
      : tone === "warning"
        ? "bg-amber-50 text-amber-700"
        : "bg-[#eaf1ff] text-[#0057e7]";
  return <AdminCard className="p-4 sm:p-5">
    <div className="flex items-start gap-3">
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${toneClass}`}><Icon size={19} /></div>
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-wide text-[#7b899c]">{title}</p>
        <p className="mt-1 break-words text-xl font-black text-[#0d1b2e]">{formatCurrency(value)}</p>
        <p className="mt-1 text-xs leading-relaxed text-[#5a6a82]">{detail}</p>
      </div>
    </div>
  </AdminCard>;
}

function CounterCard({
  title,
  value,
  detail,
  icon: Icon,
  warning = false,
}: {
  title: string;
  value: string | number;
  detail: string;
  icon: typeof CalendarClock;
  warning?: boolean;
}) {
  const highlighted = warning && typeof value === "number" && value > 0;
  return <div className={`rounded-xl border p-3 ${highlighted ? "border-amber-200 bg-amber-50/60" : "border-[#0d1b2e]/8 bg-white"}`}>
    <div className="flex items-start gap-2">
      <Icon size={16} className={highlighted ? "mt-0.5 text-amber-600" : "mt-0.5 text-[#0057e7]"} />
      <div><p className="text-[10px] font-bold uppercase tracking-wide text-[#7b899c]">{title}</p><p className="mt-0.5 text-lg font-black text-[#0d1b2e]">{value}</p><p className="text-[11px] text-[#5a6a82]">{detail}</p></div>
    </div>
  </div>;
}

function ReadinessCard({ title, value, detail, icon: Icon }: { title: string; value: string | number; detail: string; icon: typeof Landmark }) {
  return <AdminCard className="p-4">
    <div className="flex items-start gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#eaf1ff] text-[#0057e7]"><Icon size={17} /></div>
      <div className="min-w-0"><p className="text-[10px] font-bold uppercase tracking-wide text-[#7b899c]">{title}</p><p className="mt-1 break-words text-base font-black text-[#0d1b2e]">{value}</p><p className="mt-1 text-[11px] leading-relaxed text-[#5a6a82]">{detail}</p></div>
    </div>
  </AdminCard>;
}

export function FinanceOverviewFoundation({ onSelectEntry }: { onSelectEntry: (type: FinancialEntryType, id: string) => void }) {
  const { hasPermission } = useAuth();
  const [period, setPeriod] = useState(() => defaultPeriod());
  const filters = useMemo<FinancialReportFilters>(() => ({ ...period }), [period]);
  const foundation = useFinanceFoundation();
  const reports = useFinanceReports(filters);
  const canViewAccounts = hasPermission("finance.accounts.view") || hasPermission("finance.accounts.manage");

  const dashboard = reports.dashboardQuery.data;
  const cashFlow = reports.cashFlowQuery.data;
  const chartRows = useMemo(() => (cashFlow?.rows || []).map(row => ({ ...row, label: dayLabel(row.date) })), [cashFlow?.rows]);

  const foundationLoading = foundation.categoriesQuery.isLoading
    || foundation.costCentersQuery.isLoading
    || foundation.paymentMethodsQuery.isLoading
    || foundation.settingsQuery.isLoading
    || (canViewAccounts && foundation.accountsQuery.isLoading);

  const dashboardError = reports.dashboardQuery.error instanceof Error ? reports.dashboardQuery.error.message : "";
  const accounts = foundation.accountsQuery.data || [];
  const categories = foundation.categoriesQuery.data || [];
  const costCenters = foundation.costCentersQuery.data || [];
  const paymentMethods = foundation.paymentMethodsQuery.data || [];
  const settings = foundation.settingsQuery.data;

  return <div className="space-y-4">
    <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
      <div>
        <h2 className="text-lg font-black text-[#0d1b2e]">Visão geral financeira</h2>
        <p className="mt-1 text-xs leading-relaxed text-[#5a6a82]">Saldo, obrigações, recebíveis, resultado por competência e alertas operacionais da empresa ativa.</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <FInput label="Período de" type="date" value={period.from} onChange={(event: any) => setPeriod(current => ({ ...current, from: event.target.value }))} />
        <FInput label="Até" type="date" value={period.to} onChange={(event: any) => setPeriod(current => ({ ...current, to: event.target.value }))} />
      </div>
    </div>

    {dashboardError && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{dashboardError}</div>}

    {reports.dashboardQuery.isLoading ? <AdminCard className="p-10"><LoadingState text="Carregando indicadores financeiros..." /></AdminCard> : dashboard && <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <MetricCard title="Saldo disponível" value={dashboard.available_balance} detail="Saldo derivado das movimentações financeiras realizadas." icon={Banknote} />
        <MetricCard title="A receber" value={dashboard.receivable_open} detail="Saldo aberto de títulos aprovados." icon={TrendingUp} tone="positive" />
        <MetricCard title="A pagar" value={dashboard.payable_open} detail="Saldo aberto de obrigações aprovadas." icon={TrendingDown} tone="negative" />
        <MetricCard title="Vencido a receber" value={dashboard.overdue_receivable} detail="Recebíveis vencidos e ainda em aberto." icon={AlertTriangle} tone={dashboard.overdue_receivable > 0 ? "warning" : "neutral"} />
        <MetricCard title="Vencido a pagar" value={dashboard.overdue_payable} detail="Obrigações vencidas e ainda em aberto." icon={AlertTriangle} tone={dashboard.overdue_payable > 0 ? "warning" : "neutral"} />
        <MetricCard title="Resultado do período" value={dashboard.period_result} detail={`Receitas ${formatCurrency(dashboard.period_revenue)} · despesas ${formatCurrency(dashboard.period_expense)}`} icon={WalletCards} tone={dashboard.period_result >= 0 ? "positive" : "negative"} />
      </div>

      <AdminCard>
        <AdminCardHeader>
          <div><h3 className="text-sm font-black text-[#0d1b2e]">Pendências e próximos compromissos</h3><p className="mt-1 text-xs text-[#5a6a82]">Alertas para ação imediata e próximos sete dias.</p></div>
        </AdminCardHeader>
        <AdminCardContent>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <CounterCard title="Aprovações" value={dashboard.pending_approvals} detail="lançamentos pendentes" icon={CalendarClock} warning />
            <CounterCard title="Cobranças" value={dashboard.collection_followups} detail="retornos em até 7 dias" icon={CalendarClock} warning />
            <CounterCard title="Repasses atrasados" value={dashboard.overdue_scheduled_settlements} detail="liquidações a confirmar" icon={AlertTriangle} warning />
            <CounterCard title="Receber hoje" value={formatCurrency(dashboard.due_today_receivable)} detail="vencimentos com data de hoje" icon={TrendingUp} />
            <CounterCard title="Pagar hoje" value={formatCurrency(dashboard.due_today_payable)} detail="vencimentos com data de hoje" icon={TrendingDown} />
            <CounterCard title="Próximos 7 dias" value={formatCurrency(dashboard.upcoming_receivable - dashboard.upcoming_payable)} detail={`${formatCurrency(dashboard.upcoming_receivable)} a receber · ${formatCurrency(dashboard.upcoming_payable)} a pagar`} icon={CalendarClock} />
          </div>
        </AdminCardContent>
      </AdminCard>
    </>}

    {reports.canCashFlow && <AdminCard>
      <AdminCardHeader>
        <div><h3 className="text-sm font-black text-[#0d1b2e]">Fluxo previsto x realizado</h3><p className="mt-1 text-xs text-[#5a6a82]">Entradas e saídas do período selecionado.</p></div>
      </AdminCardHeader>
      <AdminCardContent>
        {reports.cashFlowQuery.isLoading ? <LoadingState text="Carregando fluxo..." /> : chartRows.length === 0 ? <EmptyState icon={TrendingUp} title="Sem fluxo financeiro no período" /> : <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartRows}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 11 }} tickFormatter={(value: any) => Number(value).toLocaleString("pt-BR", { notation: "compact" })} />
              <Tooltip formatter={(value: any) => formatCurrency(Number(value || 0))} />
              <Legend />
              <Area type="monotone" dataKey="forecast_net" name="Líquido previsto" stroke="#0057e7" fill="#dbeafe" />
              <Area type="monotone" dataKey="realized_net" name="Líquido realizado" stroke="#16a34a" fill="#dcfce7" />
            </AreaChart>
          </ResponsiveContainer>
        </div>}
      </AdminCardContent>
    </AdminCard>}

    <FinancePendingApprovals onSelectEntry={onSelectEntry} />

    <div>
      <h3 className="text-sm font-black text-[#0d1b2e]">Estrutura financeira</h3>
      <p className="mt-1 text-xs text-[#5a6a82]">Resumo dos cadastros que sustentam a operação.</p>
    </div>

    {foundationLoading ? <AdminCard className="p-8"><LoadingState text="Carregando estrutura financeira..." /></AdminCard> : <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      <ReadinessCard title="Caixas e contas" value={canViewAccounts ? accounts.filter(item => item.is_active).length : "Sem acesso"} detail="Contas financeiras ativas configuradas." icon={Landmark} />
      <ReadinessCard title="Categorias" value={categories.filter(item => item.is_active).length} detail="Categorias de receita e despesa ativas." icon={Tags} />
      <ReadinessCard title="Centros de custo" value={costCenters.filter(item => item.is_active).length} detail="Centros de custo disponíveis para rateios." icon={Target} />
      <ReadinessCard title="Formas de pagamento" value={paymentMethods.filter(item => item.is_active).length} detail="Formas de pagamento ativas, com taxas e prazos." icon={CreditCard} />
      <ReadinessCard title="Limite de 2 aprovações" value={settings?.second_approval_threshold == null ? "Não definido" : formatCurrency(settings.second_approval_threshold)} detail="Contas a pagar acima desse valor exigem duas aprovações distintas." icon={Settings2} />
      <ReadinessCard title="Sessão de caixa" value={settings?.cash_session_enabled ? "Ativada" : "Desativada"} detail="Controle opcional de abertura e fechamento do caixa físico." icon={Landmark} />
    </div>}
  </div>;
}
