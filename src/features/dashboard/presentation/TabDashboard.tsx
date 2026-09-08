import { useEffect, useMemo, useState, type ElementType, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  Banknote,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock3,
  FileText,
  LayoutDashboard,
  Package,
  RefreshCw,
  TrendingUp,
  UserCheck,
  Users,
  UserX,
  Wrench,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { cn, formatCurrency, formatDateOnly } from "@/shared/domain/formatters";
import { LoadingState, StatusBadge } from "@/shared/ui/admin/AdminFeedback";
import { AdminButton, AdminCard, PageHeader } from "@/shared/ui/admin/AdminLayout";
import { queryKeys } from "@/infrastructure/query/query-keys";
import type { AdminTab } from "@/features/admin-shell/domain/admin.types";
import type {
  DashboardAccess,
  DashboardAppointment,
  DashboardModule,
  DashboardOrder,
  DashboardQuote,
} from "../domain/dashboard";
import { loadDashboardOverview } from "../infrastructure/dashboard.repository";
import {
  DashboardBarChart,
  DashboardDonutChart,
  DashboardEmpty,
  DashboardLineChart,
  DashboardMetricCard,
  DashboardModuleNav,
  DashboardPanel,
  type DashboardChartPoint,
  type DashboardMetricTone,
} from "./DashboardUi";

type TabDashboardProps = { onNavigate?: (tab: AdminTab) => void };
type Metric = { label: string; value: ReactNode; icon: ElementType; tone?: DashboardMetricTone; hint?: string };

const DAY_MS = 86_400_000;
const periodOptions = [
  { value: 7, label: "7 dias" },
  { value: 30, label: "30 dias" },
  { value: 90, label: "90 dias" },
  { value: 365, label: "12 meses" },
];

function normalized(value?: string | null) {
  return (value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function relationLabel(value: { name?: string | null; title?: string | null; full_name?: string | null } | null | undefined, fallback = "Sem informação") {
  return value?.name || value?.title || value?.full_name || fallback;
}

function insidePeriod(value: string | null | undefined, days: number) {
  if (!value) return false;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) && timestamp >= Date.now() - days * DAY_MS;
}

function localDateKey(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isWaiting(value?: string | null) {
  return /aguard|client|pendent/.test(normalized(value));
}

function isAnalysis(value?: string | null) {
  return /analis|analise/.test(normalized(value));
}

function isPending(value?: string | null) {
  return /pendent|novo|solicit/.test(normalized(value));
}

function groupByLabel<T>(items: T[], getLabel: (item: T) => string): DashboardChartPoint[] {
  const grouped = new Map<string, number>();
  items.forEach(item => {
    const label = getLabel(item);
    grouped.set(label, (grouped.get(label) || 0) + 1);
  });
  return [...grouped.entries()]
    .map(([name, value]) => ({ name: name.length > 16 ? `${name.slice(0, 14)}…` : name, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 7);
}

function buildTrend<T>(items: T[], days: number, dateOf: (item: T) => string | null | undefined, valueOf: (item: T) => number = () => 1): DashboardChartPoint[] {
  const bucketCount = days <= 7 ? 7 : days <= 30 ? 10 : days <= 90 ? 9 : 12;
  const bucketDays = Math.max(1, Math.ceil(days / bucketCount));
  const now = new Date();
  now.setHours(23, 59, 59, 999);
  const start = new Date(now.getTime() - days * DAY_MS);
  start.setHours(0, 0, 0, 0);

  return Array.from({ length: bucketCount }, (_, index) => {
    const bucketStart = new Date(start.getTime() + index * bucketDays * DAY_MS);
    const bucketEnd = new Date(Math.min(now.getTime(), bucketStart.getTime() + bucketDays * DAY_MS));
    const value = items.reduce((total, item) => {
      const timestamp = new Date(dateOf(item) || "").getTime();
      return timestamp >= bucketStart.getTime() && timestamp < bucketEnd.getTime() ? total + valueOf(item) : total;
    }, 0);
    const name = bucketStart.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
    return { name, value: Number(value.toFixed(2)) };
  });
}

function appointmentTime(appointment: DashboardAppointment) {
  if (appointment.start_time) return appointment.start_time.slice(0, 5);
  const labels: Record<string, string> = { morning: "Manhã", afternoon: "Tarde", evening: "Noite", no_time: "Sem horário" };
  return labels[appointment.period || ""] || "Sem horário";
}

function MetricGrid({ metrics }: { metrics: Metric[] }) {
  return (
    <div className={cn("grid gap-3", metrics.length >= 5 ? "grid-cols-2 xl:grid-cols-6" : "grid-cols-2 xl:grid-cols-4")}>
      {metrics.map(metric => <DashboardMetricCard key={metric.label} {...metric} />)}
    </div>
  );
}

function CompactList({ children }: { children: ReactNode }) {
  return <div className="h-full min-h-[190px] divide-y divide-[#0d1b2e]/6 overflow-y-auto pr-1">{children}</div>;
}

function CompactRow({ title, subtitle, aside, onClick }: { title: string; subtitle: string; aside?: ReactNode; onClick?: () => void }) {
  const content = (
    <>
      <div className="min-w-0 flex-1 text-left">
        <p className="truncate text-xs font-black text-[#0d1b2e]">{title}</p>
        <p className="mt-0.5 truncate text-[10px] font-semibold text-[#7a879a]">{subtitle}</p>
      </div>
      {aside && <div className="shrink-0 text-right">{aside}</div>}
    </>
  );
  return onClick ? <button type="button" onClick={onClick} className="flex w-full cursor-default items-center gap-3 px-1 py-2.5 hover:bg-[#f8fafc]">{content}</button> : <div className="flex items-center gap-3 px-1 py-2.5">{content}</div>;
}

export function TabDashboard({ onNavigate }: TabDashboardProps) {
  const { hasPermission } = useAuth();
  const [activeModule, setActiveModule] = useState<DashboardModule>("overview");
  const [periodDays, setPeriodDays] = useState(30);
  const access = useMemo<DashboardAccess>(() => ({
    orders: hasPermission("orders.view"),
    customers: hasPermission("customers.view"),
    employees: hasPermission("employees.view"),
    inventory: hasPermission("inventory.view"),
    agenda: hasPermission("agenda.view"),
    quotes: hasPermission("quotes.view"),
  }), [hasPermission]);
  const accessScope = Object.values(access).map(Boolean).map(Number).join("");
  const modules = useMemo(() => [
    { id: "overview" as const, label: "Visão geral", icon: LayoutDashboard, visible: true },
    { id: "orders" as const, label: "Ordens de serviço", icon: ClipboardList, visible: access.orders },
    { id: "customers" as const, label: "Clientes", icon: Users, visible: access.customers },
    { id: "employees" as const, label: "Funcionários", icon: UserCheck, visible: access.employees },
    { id: "inventory" as const, label: "Estoque", icon: Package, visible: access.inventory },
    { id: "agenda" as const, label: "Agenda", icon: CalendarDays, visible: access.agenda },
    { id: "quotes" as const, label: "Orçamentos", icon: FileText, visible: access.quotes },
    { id: "finance" as const, label: "Financeiro", icon: Banknote, visible: access.orders },
  ].filter(item => item.visible), [access]);

  useEffect(() => {
    if (!modules.some(module => module.id === activeModule)) setActiveModule("overview");
  }, [activeModule, modules]);

  const dashboardQuery = useQuery({
    queryKey: queryKeys.admin.dashboard(periodDays, accessScope),
    queryFn: () => loadDashboardOverview({ periodDays, access }),
  });
  const data = dashboardQuery.data ?? { orders: [], customers: [], employees: [], inventory: [], appointments: [], quotes: [] };
  const ordersInPeriod = data.orders.filter(order => insidePeriod(order.created_at, periodDays));
  const completedInPeriod = data.orders.filter(order => insidePeriod(order.completed_at, periodDays));
  const customersInPeriod = data.customers.filter(customer => insidePeriod(customer.created_at, periodDays));
  const quotesInPeriod = data.quotes.filter(quote => insidePeriod(quote.created_at, periodDays));
  const todayKey = localDateKey(new Date());
  const weekLimit = localDateKey(new Date(Date.now() + 7 * DAY_MS));
  const todayAppointments = data.appointments.filter(appointment => appointment.appointment_date === todayKey);
  const weekAppointments = data.appointments.filter(appointment => appointment.appointment_date >= todayKey && appointment.appointment_date <= weekLimit);
  const activeOrders = data.orders.filter(order => !order.completed_at);
  const waitingOrders = activeOrders.filter(order => isWaiting(relationLabel(order.order_status, "")) || isWaiting(relationLabel(order.situation, "")));
  const activeInventory = data.inventory.filter(item => item.is_active !== false);
  const lowInventory = activeInventory.filter(item => Number(item.quantity || 0) > 0 && Number(item.quantity || 0) <= Number(item.min_quantity || 0));
  const outInventory = activeInventory.filter(item => Number(item.quantity || 0) <= 0);
  const activeEmployees = data.employees.filter(employee => employee.is_active !== false);
  const revenue = completedInPeriod.reduce((total, order) => total + Number(order.final_total || 0), 0);
  const discounts = completedInPeriod.reduce((total, order) => total + Number(order.discount_amount || 0), 0);
  const convertedQuoteIds = new Set(data.orders.map(order => order.quote_request_id).filter(Boolean));
  const fmtDate = (value?: string | null) => formatDateOnly(value, "—");
  const open = (tab: AdminTab) => onNavigate?.(tab);

  const moduleContent = () => {
    if (activeModule === "orders") {
      const metrics: Metric[] = [
        { label: `OS em ${periodDays} dias`, value: ordersInPeriod.length, icon: ClipboardList, tone: "blue", hint: "abertas no período" },
        { label: "Em andamento", value: activeOrders.length, icon: Activity, tone: "purple", hint: "ainda não concluídas" },
        { label: "Aguardando", value: waitingOrders.length, icon: Clock3, tone: waitingOrders.length ? "amber" : "green", hint: "cliente ou pendência" },
        { label: "Concluídas", value: completedInPeriod.length, icon: CheckCircle2, tone: "green", hint: `nos últimos ${periodDays} dias` },
      ];
      return <DashboardArea metrics={metrics} left={<DashboardPanel title="OS por status" subtitle="Distribuição das ordens visíveis" icon={Activity}><DashboardDonutChart data={groupByLabel(activeOrders, order => relationLabel(order.order_status, "Sem status"))} /></DashboardPanel>} right={<DashboardPanel title="Ordens recentes" subtitle="Últimas atualizações" icon={ClipboardList} onOpen={() => open("orders")}><OrdersList orders={data.orders.slice(0, 8)} onOpen={() => open("orders")} /></DashboardPanel>} />;
    }

    if (activeModule === "customers") {
      const customersWithOrders = new Set(ordersInPeriod.map(order => order.customer_id).filter(Boolean));
      const orderCounts = new Map<string, number>();
      data.orders.forEach(order => order.customer_id && orderCounts.set(order.customer_id, (orderCounts.get(order.customer_id) || 0) + 1));
      const recurring = [...orderCounts.values()].filter(count => count > 1).length;
      const metrics: Metric[] = [
        { label: "Total de clientes", value: data.customers.length, icon: Users, tone: "blue", hint: "visíveis para seu perfil" },
        { label: "Novos clientes", value: customersInPeriod.length, icon: UserCheck, tone: "green", hint: `nos últimos ${periodDays} dias` },
        { label: "Com OS no período", value: customersWithOrders.size, icon: Wrench, tone: "purple", hint: "clientes atendidos" },
        { label: "Recorrentes", value: recurring, icon: TrendingUp, tone: "amber", hint: "mais de uma OS" },
      ];
      return <DashboardArea metrics={metrics} left={<DashboardPanel title="Entrada de clientes" subtitle={`Novos cadastros em ${periodDays} dias`} icon={TrendingUp}><DashboardLineChart data={buildTrend(customersInPeriod, periodDays, customer => customer.created_at)} /></DashboardPanel>} right={<DashboardPanel title="Clientes recentes" subtitle="Últimos cadastros" icon={Users} onOpen={() => open("customers")}><CompactList>{data.customers.slice(0, 8).map(customer => <CompactRow key={customer.id} title={customer.full_name} subtitle={`Cadastrado em ${fmtDate(customer.created_at)}`} onClick={() => open("customers")} />)}{!data.customers.length && <DashboardEmpty text="Nenhum cliente cadastrado." />}</CompactList></DashboardPanel>} />;
    }

    if (activeModule === "employees") {
      const workload = new Map<string, { name: string; value: number }>();
      activeOrders.forEach(order => {
        const linked = order.technician_links?.length ? order.technician_links : order.technician_id ? [{ employee_id: order.technician_id, employee: order.technician }] : [];
        linked.forEach(link => {
          const name = relationLabel(link.employee, "Sem nome");
          const current = workload.get(link.employee_id) || { name, value: 0 };
          workload.set(link.employee_id, { ...current, value: current.value + 1 });
        });
      });
      const workloadData = [...workload.values()].sort((a, b) => b.value - a.value).slice(0, 8);
      const technicians = activeEmployees.filter(employee => /tecnic/.test(normalized(employee.function_name))).length;
      const metrics: Metric[] = [
        { label: "Funcionários ativos", value: activeEmployees.length, icon: UserCheck, tone: "green", hint: "com acesso operacional" },
        { label: "Inativos", value: data.employees.length - activeEmployees.length, icon: UserX, tone: "red", hint: "cadastros desativados" },
        { label: "Técnicos", value: technicians, icon: Wrench, tone: "blue", hint: "função técnica ativa" },
        { label: "Com OS ativa", value: workload.size, icon: ClipboardList, tone: "purple", hint: "carga atual" },
      ];
      return <DashboardArea metrics={metrics} left={<DashboardPanel title="Carga por técnico" subtitle="Ordens ainda em andamento" icon={Activity}><DashboardBarChart data={workloadData} color="#7c3aed" /></DashboardPanel>} right={<DashboardPanel title="Equipe ativa" subtitle="Funcionários disponíveis" icon={UserCheck} onOpen={() => open("employees")}><CompactList>{activeEmployees.slice(0, 10).map(employee => <CompactRow key={employee.id} title={employee.full_name} subtitle={employee.function_name || "Funcionário"} />)}{!activeEmployees.length && <DashboardEmpty text="Nenhum funcionário ativo." />}</CompactList></DashboardPanel>} />;
    }

    if (activeModule === "inventory") {
      const stockValue = activeInventory.reduce((total, item) => total + Number(item.quantity || 0) * Number(item.purchase_price || 0), 0);
      const metrics: Metric[] = [
        { label: "Itens ativos", value: activeInventory.length, icon: Package, tone: "blue", hint: "cadastros no estoque" },
        { label: "Estoque baixo", value: lowInventory.length, icon: AlertTriangle, tone: lowInventory.length ? "amber" : "green", hint: "no mínimo configurado" },
        { label: "Sem estoque", value: outInventory.length, icon: AlertTriangle, tone: outInventory.length ? "red" : "green", hint: "saldo zerado" },
        { label: "Custo em estoque", value: formatCurrency(stockValue), icon: Banknote, tone: "purple", hint: "saldo × custo unitário" },
      ];
      const stockChart = [
        { name: "Normal", value: Math.max(0, activeInventory.length - lowInventory.length - outInventory.length) },
        { name: "Baixo", value: lowInventory.length },
        { name: "Zerado", value: outInventory.length },
      ].filter(item => item.value > 0);
      const alerts = [...outInventory, ...lowInventory].slice(0, 10);
      return <DashboardArea metrics={metrics} left={<DashboardPanel title="Saúde do estoque" subtitle="Distribuição dos itens ativos" icon={Package}><DashboardDonutChart data={stockChart} colors={["#16a34a", "#f59e0b", "#dc2626"]} /></DashboardPanel>} right={<DashboardPanel title="Reposição necessária" subtitle="Itens zerados ou no mínimo" icon={AlertTriangle} onOpen={() => open("inventory")}><CompactList>{alerts.map(item => <CompactRow key={item.id} title={item.name} subtitle={item.sku ? `SKU ${item.sku}` : "Sem SKU"} aside={<span className={cn("text-xs font-black", Number(item.quantity || 0) <= 0 ? "text-red-600" : "text-amber-600")}>{Number(item.quantity || 0)} {item.unit || "un"}</span>} />)}{!alerts.length && <DashboardEmpty text="Nenhum item precisa de reposição." />}</CompactList></DashboardPanel>} />;
    }

    if (activeModule === "agenda") {
      const returns = weekAppointments.filter(appointment => appointment.is_return).length;
      const awaiting = weekAppointments.filter(appointment => isPending(relationLabel(appointment.situation, ""))).length;
      const metrics: Metric[] = [
        { label: "Hoje", value: todayAppointments.length, icon: CalendarDays, tone: "blue", hint: "compromissos do dia" },
        { label: "Próximos 7 dias", value: weekAppointments.length, icon: Clock3, tone: "purple", hint: "agenda próxima" },
        { label: "Retornos", value: returns, icon: RefreshCw, tone: "amber", hint: "nos próximos 7 dias" },
        { label: "A confirmar", value: awaiting, icon: AlertTriangle, tone: awaiting ? "amber" : "green", hint: "situação pendente" },
      ];
      return <DashboardArea metrics={metrics} left={<DashboardPanel title="Agenda por situação" subtitle={`Próximos ${periodDays} dias`} icon={Activity}><DashboardDonutChart data={groupByLabel(data.appointments, appointment => relationLabel(appointment.situation, "Sem situação"))} /></DashboardPanel>} right={<DashboardPanel title="Próximos atendimentos" subtitle="Agenda em ordem cronológica" icon={CalendarDays} onOpen={() => open("agenda")}><AppointmentsList appointments={data.appointments.slice(0, 10)} /></DashboardPanel>} />;
    }

    if (activeModule === "quotes") {
      const pending = data.quotes.filter(quote => isPending(relationLabel(quote.request_status, ""))).length;
      const analysis = data.quotes.filter(quote => isAnalysis(relationLabel(quote.request_status, ""))).length;
      const converted = quotesInPeriod.filter(quote => convertedQuoteIds.has(quote.id)).length;
      const metrics: Metric[] = [
        { label: `Solicitações em ${periodDays} dias`, value: quotesInPeriod.length, icon: FileText, tone: "blue", hint: "recebidas no período" },
        { label: "Pendentes", value: pending, icon: Clock3, tone: pending ? "amber" : "green", hint: "aguardando atendimento" },
        { label: "Em análise", value: analysis, icon: Activity, tone: "purple", hint: "sendo avaliadas" },
        { label: "Convertidos em OS", value: converted, icon: CheckCircle2, tone: "green", hint: `nos últimos ${periodDays} dias` },
      ];
      return <DashboardArea metrics={metrics} left={<DashboardPanel title="Orçamentos por status" subtitle="Distribuição das solicitações" icon={Activity}><DashboardDonutChart data={groupByLabel(data.quotes, quote => relationLabel(quote.request_status, "Sem status"))} /></DashboardPanel>} right={<DashboardPanel title="Solicitações recentes" subtitle="Últimos orçamentos recebidos" icon={FileText} onOpen={() => open("quotes")}><QuotesList quotes={data.quotes.slice(0, 8)} onOpen={() => open("quotes")} /></DashboardPanel>} />;
    }

    if (activeModule === "finance") {
      const ticket = completedInPeriod.length ? revenue / completedInPeriod.length : 0;
      const metrics: Metric[] = [
        { label: "Faturamento", value: formatCurrency(revenue), icon: Banknote, tone: "green", hint: `concluído em ${periodDays} dias` },
        { label: "OS faturadas", value: completedInPeriod.length, icon: CheckCircle2, tone: "blue", hint: "com conclusão financeira" },
        { label: "Ticket médio", value: formatCurrency(ticket), icon: TrendingUp, tone: "purple", hint: "média por OS concluída" },
        { label: "Descontos", value: formatCurrency(discounts), icon: Activity, tone: "amber", hint: "total concedido" },
      ];
      const financeTrend = buildTrend(completedInPeriod, periodDays, order => order.completed_at, order => Number(order.final_total || 0));
      return <DashboardArea metrics={metrics} left={<DashboardPanel title="Faturamento por período" subtitle="Valores das OS concluídas" icon={TrendingUp}><DashboardLineChart data={financeTrend} money color="#16a34a" /></DashboardPanel>} right={<DashboardPanel title="Conclusões recentes" subtitle="Últimas OS faturadas" icon={Banknote} onOpen={() => open("orders")}><OrdersList orders={completedInPeriod.slice(0, 8)} onOpen={() => open("orders")} showValue /></DashboardPanel>} />;
    }

    const overviewMetrics: Metric[] = [
      ...(access.orders ? [
        { label: `OS em ${periodDays} dias`, value: ordersInPeriod.length, icon: ClipboardList, tone: "blue" as const, hint: "abertas no período" },
        { label: "OS em andamento", value: activeOrders.length, icon: Activity, tone: "purple" as const, hint: "ainda não concluídas" },
        { label: "Faturamento", value: formatCurrency(revenue), icon: Banknote, tone: "green" as const, hint: `últimos ${periodDays} dias` },
      ] : []),
      ...(access.customers ? [{ label: "Novos clientes", value: customersInPeriod.length, icon: Users, tone: "blue" as const, hint: `últimos ${periodDays} dias` }] : []),
      ...(access.agenda ? [{ label: "Agenda hoje", value: todayAppointments.length, icon: CalendarDays, tone: "amber" as const, hint: "compromissos" }] : []),
      ...(access.inventory ? [{ label: "Alertas de estoque", value: lowInventory.length + outInventory.length, icon: AlertTriangle, tone: lowInventory.length + outInventory.length ? "red" as const : "green" as const, hint: "baixo ou zerado" }] : []),
    ];
    const activityTrend = buildTrend([...ordersInPeriod, ...quotesInPeriod], periodDays, item => item.created_at);
    const alerts: Array<{ title: string; subtitle: string; tone: string; tab: AdminTab }> = [
      ...(waitingOrders.length ? [{ title: `${waitingOrders.length} OS aguardando`, subtitle: "Verifique clientes ou pendências", tone: "text-amber-700 bg-amber-50", tab: "orders" as AdminTab }] : []),
      ...(outInventory.length ? [{ title: `${outInventory.length} itens sem estoque`, subtitle: "Reposição necessária", tone: "text-red-700 bg-red-50", tab: "inventory" as AdminTab }] : []),
      ...(lowInventory.length ? [{ title: `${lowInventory.length} itens com estoque baixo`, subtitle: "Próximos do mínimo", tone: "text-amber-700 bg-amber-50", tab: "inventory" as AdminTab }] : []),
      ...(todayAppointments.length ? [{ title: `${todayAppointments.length} compromissos hoje`, subtitle: "Confira a agenda do dia", tone: "text-blue-700 bg-blue-50", tab: "agenda" as AdminTab }] : []),
    ];
    return <DashboardArea metrics={overviewMetrics} left={<DashboardPanel title="Movimentação do período" subtitle="OS e orçamentos recebidos" icon={TrendingUp}><DashboardLineChart data={activityTrend} /></DashboardPanel>} right={<DashboardPanel title="Atenção agora" subtitle="Prioridades operacionais" icon={AlertTriangle}><CompactList>{alerts.slice(0, 8).map(alert => <button key={alert.title} type="button" onClick={() => open(alert.tab)} className="flex w-full cursor-default items-center gap-3 px-1 py-2.5 text-left hover:bg-[#f8fafc]"><span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg", alert.tone)}><AlertTriangle size={14} /></span><span className="min-w-0"><strong className="block truncate text-xs text-[#0d1b2e]">{alert.title}</strong><span className="block truncate text-[10px] font-semibold text-[#7a879a]">{alert.subtitle}</span></span></button>)}{!alerts.length && <DashboardEmpty text="Nenhuma prioridade crítica agora." />}</CompactList></DashboardPanel>} />;
  };

  return (
    <div className="flex min-h-0 flex-col gap-4 lg:h-full">
      <PageHeader title="Dashboard" subtitle="Indicadores objetivos por área, respeitando as permissões do seu perfil." actions={
        <div className="flex items-center gap-2">
          <label className="sr-only" htmlFor="dashboard-period">Período do dashboard</label>
          <select id="dashboard-period" value={periodDays} onChange={event => setPeriodDays(Number(event.target.value))} className="h-9 cursor-default rounded-lg border border-[#0d1b2e]/15 bg-white px-3 text-xs font-black text-[#0d1b2e] outline-none focus:border-[#0057e7]">
            {periodOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
      } />

      <DashboardModuleNav items={modules} value={activeModule} onChange={setActiveModule} />

      <div className="min-h-0 flex-1 lg:overflow-hidden">
        {dashboardQuery.isPending ? <LoadingState text="Carregando indicadores..." /> : dashboardQuery.error ? (
          <AdminCard className="flex min-h-[280px] flex-col items-center justify-center gap-3 p-6 text-center">
            <AlertTriangle className="text-red-500" size={28} />
            <div><p className="font-black text-[#0d1b2e]">Não foi possível carregar o Dashboard.</p><p className="mt-1 text-xs text-[#5a6a82]">{dashboardQuery.error instanceof Error ? dashboardQuery.error.message : String(dashboardQuery.error)}</p></div>
            <AdminButton size="sm" onClick={() => dashboardQuery.refetch()}>Tentar novamente</AdminButton>
          </AdminCard>
        ) : moduleContent()}
      </div>
    </div>
  );
}

function DashboardArea({ metrics, left, right }: { metrics: Metric[]; left: ReactNode; right: ReactNode }) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <MetricGrid metrics={metrics} />
      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1.25fr)_minmax(320px,.75fr)] [&>*]:min-h-[280px] lg:[&>*]:min-h-0">{left}{right}</div>
    </div>
  );
}

function OrdersList({ orders, onOpen, showValue = false }: { orders: DashboardOrder[]; onOpen: () => void; showValue?: boolean }) {
  if (!orders.length) return <DashboardEmpty text="Nenhuma ordem encontrada." />;
  return <CompactList>{orders.map(order => <CompactRow key={order.id} title={`OS ${order.os_number || order.id.slice(0, 8)}`} subtitle={`${relationLabel(order.customer, "Cliente não informado")} · ${fmtListDate(order.completed_at || order.updated_at)}`} aside={showValue ? <strong className="text-xs text-emerald-700">{formatCurrency(Number(order.final_total || 0))}</strong> : <StatusBadge status={relationLabel(order.order_status, "Em andamento")} color={order.order_status?.color} />} onClick={onOpen} />)}</CompactList>;
}

function QuotesList({ quotes, onOpen }: { quotes: DashboardQuote[]; onOpen: () => void }) {
  if (!quotes.length) return <DashboardEmpty text="Nenhum orçamento encontrado." />;
  return <CompactList>{quotes.map(quote => <CompactRow key={quote.id} title={quote.protocol || relationLabel(quote.customer, "Solicitação")} subtitle={`${relationLabel(quote.customer, "Cliente não informado")} · ${fmtListDate(quote.created_at)}`} aside={<StatusBadge status={relationLabel(quote.request_status, "Pendente")} color={quote.request_status?.color} />} onClick={onOpen} />)}</CompactList>;
}

function AppointmentsList({ appointments }: { appointments: DashboardAppointment[] }) {
  if (!appointments.length) return <DashboardEmpty text="Nenhum atendimento agendado." />;
  return <CompactList>{appointments.map(appointment => <CompactRow key={appointment.id} title={relationLabel(appointment.customer, "Cliente não informado")} subtitle={`${fmtListDate(appointment.appointment_date)} · ${appointmentTime(appointment)}`} aside={<StatusBadge status={relationLabel(appointment.situation, "Agendado")} color={appointment.situation?.color} />} />)}</CompactList>;
}

function fmtListDate(value?: string | null) {
  return formatDateOnly(value, "—");
}