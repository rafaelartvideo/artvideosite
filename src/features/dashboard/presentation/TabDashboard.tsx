import { systemErrorMessage } from "@/shared/domain/error-message";
import { useEffect, useMemo, useRef, useState, type ElementType, type ReactNode } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  Banknote,
  Building2,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock3,
  FileText,
  LayoutDashboard,
  PieChart,
  BarChart3,
  AlignLeft,
  Package,
  RefreshCw,
  ShoppingCart,
  TrendingUp,
  UserCheck,
  Users,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { cn, formatCurrency, formatDateOnly } from "@/shared/domain/formatters";
import { LoadingState, StatusBadge } from "@/shared/ui/admin/AdminFeedback";
import { AdminButton, AdminCard, PageHeader } from "@/shared/ui/admin/AdminLayout";
import { AdminSelect } from "@/shared/ui/admin/AdminFormControls";
import { PaginationBar } from "@/shared/ui/admin/AdminPagination";
import { queryKeys } from "@/infrastructure/query/query-keys";
import type { AdminTab } from "@/features/admin-shell/domain/admin.types";
import { listInventoryPurchaseAnalytics } from "@/features/inventory/infrastructure/inventory-analytics.repository";
import type {
  DashboardAccess,
  DashboardAppointment,
  DashboardModule,
  DashboardOrder,
  DashboardOrderDistributionItem,
  DashboardOrderGroupItem,
  DashboardQuote,
  DashboardRegistration,
} from "../domain/dashboard";
import {
  loadDashboardOrderGroupPage,
  loadDashboardOrdersSummary,
  loadDashboardOverview,
} from "../infrastructure/dashboard.repository";
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

type TabDashboardProps = {
  onNavigate?: (tab: AdminTab) => void;
  onOpenOrder?: (orderId: string) => void;
};
type Metric = { label: string; value: ReactNode; icon: ElementType; tone?: DashboardMetricTone; hint?: string };

const DAY_MS = 86_400_000;
const DASHBOARD_ORDER_PAGE_SIZE = 10;
const DASHBOARD_RETURN_STATE_KEY = "union-dashboard-return-state-v1";
const DASHBOARD_ORDER_CHART_MODE_KEY = "union-dashboard-order-chart-mode-v1";
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

function purchaseSupplierName(value: { name?: string | null; legal_name?: string | null; trade_name?: string | null } | null | undefined) {
  return value?.name || value?.trade_name || value?.legal_name || "Fornecedor não identificado";
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

type OrderDistributionKind = "situation" | "status";
type OrderDistributionChartMode = "pie" | "vertical" | "horizontal";
type OrderDistributionSelection = {
  kind: OrderDistributionKind;
  id: string | null;
  name: string;
  total: number;
};

type DashboardReturnState = {
  organizationId: string | null;
  activeModule: DashboardModule;
  periodDays: number;
  orderDistributionSelection: OrderDistributionSelection | null;
  orderDistributionPage: number;
};

function distributionPoints(items: DashboardOrderDistributionItem[], kind: OrderDistributionKind): DashboardChartPoint[] {
  return items.map(item => ({
    id: item.id,
    name: item.name,
    value: item.total,
    color: item.color || "#64748b",
    key: `${kind}:${item.id || "none"}`,
  }));
}

function consumeDashboardReturnState(organizationId?: string | null): DashboardReturnState | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(DASHBOARD_RETURN_STATE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as DashboardReturnState;
    if (organizationId && saved.organizationId && saved.organizationId !== organizationId) return null;
    window.sessionStorage.removeItem(DASHBOARD_RETURN_STATE_KEY);
    return saved;
  } catch {
    window.sessionStorage.removeItem(DASHBOARD_RETURN_STATE_KEY);
    return null;
  }
}

function saveDashboardReturnState(state: DashboardReturnState) {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(DASHBOARD_RETURN_STATE_KEY, JSON.stringify(state));
}

function readOrderChartMode(): OrderDistributionChartMode {
  if (typeof window === "undefined") return "horizontal";
  const saved = window.localStorage.getItem(DASHBOARD_ORDER_CHART_MODE_KEY);
  return saved === "pie" || saved === "vertical" || saved === "horizontal" ? saved : "horizontal";
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

function registrationHasRole(registration: DashboardRegistration, role: "customer" | "employee" | "supplier") {
  return (registration.roles || []).some(item => item.role === role && item.is_active !== false);
}

function registrationRoleLabel(registration: DashboardRegistration) {
  const labels: string[] = [];
  if (registrationHasRole(registration, "customer")) labels.push("Cliente");
  if (registrationHasRole(registration, "employee")) labels.push("Funcionário");
  if (registrationHasRole(registration, "supplier")) labels.push("Fornecedor");
  return labels.length ? labels.join(" · ") : "Sem vínculo ativo";
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

export function TabDashboard({ onNavigate, onOpenOrder }: TabDashboardProps) {
  const { activeOrganizationId, hasPermission } = useAuth();
  const [returnState] = useState(() => consumeDashboardReturnState(activeOrganizationId));
  const [activeModule, setActiveModule] = useState<DashboardModule>(returnState?.activeModule || "overview");
  const [periodDays, setPeriodDays] = useState(returnState?.periodDays || 30);
  const [orderDistributionSelection, setOrderDistributionSelection] = useState<OrderDistributionSelection | null>(returnState?.orderDistributionSelection || null);
  const [orderDistributionPage, setOrderDistributionPage] = useState(Math.max(1, returnState?.orderDistributionPage || 1));
  const [orderDistributionChartMode, setOrderDistributionChartMode] = useState<OrderDistributionChartMode>(readOrderChartMode);
  const organizationRef = useRef(activeOrganizationId);
  const canViewInventoryMovements = hasPermission("inventory.movements.view");
  const access = useMemo<DashboardAccess>(() => ({
    orders: hasPermission("orders.view"),
    registrations: hasPermission("customers.view") || hasPermission("employees.view"),
    inventory: hasPermission("inventory.view"),
    inventoryCosts: hasPermission("inventory.costs.view"),
    agenda: hasPermission("agenda.view"),
    quotes: hasPermission("quotes.view"),
  }), [hasPermission]);
  const modules = useMemo(() => [
    { id: "overview" as const, label: "Visão geral", icon: LayoutDashboard, visible: true },
    { id: "orders" as const, label: "Ordens de serviço", icon: ClipboardList, visible: access.orders },
    { id: "registrations" as const, label: "Cadastros", icon: Users, visible: access.registrations },
    { id: "inventory" as const, label: "Estoque", icon: Package, visible: access.inventory },
    { id: "agenda" as const, label: "Agenda", icon: CalendarDays, visible: access.agenda },
    { id: "quotes" as const, label: "Orçamentos", icon: FileText, visible: access.quotes },
    { id: "finance" as const, label: "Financeiro", icon: Banknote, visible: access.orders },
  ].filter(item => item.visible), [access]);

  const dashboardAccess = useMemo<DashboardAccess>(() => ({
    orders: access.orders && (activeModule === "overview" || activeModule === "finance" || activeModule === "quotes"),
    registrations: access.registrations && (activeModule === "overview" || activeModule === "registrations"),
    inventory: access.inventory && (activeModule === "overview" || activeModule === "inventory"),
    inventoryCosts: access.inventoryCosts && (activeModule === "overview" || activeModule === "inventory"),
    agenda: access.agenda && (activeModule === "overview" || activeModule === "agenda"),
    quotes: access.quotes && (activeModule === "overview" || activeModule === "quotes"),
  }), [access, activeModule]);
  const accessScope = Object.values(dashboardAccess).map(Boolean).map(Number).join("");

  useEffect(() => {
    if (!modules.some(module => module.id === activeModule)) setActiveModule("overview");
  }, [activeModule, modules]);

  useEffect(() => {
    if (organizationRef.current === activeOrganizationId) return;
    organizationRef.current = activeOrganizationId;
    setOrderDistributionSelection(null);
    setOrderDistributionPage(1);
  }, [activeOrganizationId]);

  const dashboardQuery = useQuery({
    queryKey: queryKeys.admin.dashboard(activeOrganizationId || "no-organization", periodDays, accessScope),
    queryFn: () => loadDashboardOverview({ organizationId: activeOrganizationId!, periodDays, access: dashboardAccess }),
    enabled: Boolean(activeOrganizationId && activeModule !== "orders"),
  });

  const ordersSummaryQuery = useQuery({
    queryKey: ["dashboard", "orders-summary", activeOrganizationId, periodDays],
    queryFn: () => loadDashboardOrdersSummary({
      organizationId: activeOrganizationId!,
      periodDays,
    }),
    enabled: Boolean(activeOrganizationId && activeModule === "orders"),
    staleTime: 60_000,
  });

  const orderGroupPageQuery = useQuery({
    queryKey: [
      "dashboard",
      "orders-group-page",
      activeOrganizationId,
      orderDistributionSelection?.kind || "none",
      orderDistributionSelection?.id || "none",
      orderDistributionPage,
      DASHBOARD_ORDER_PAGE_SIZE,
    ],
    queryFn: () => loadDashboardOrderGroupPage({
      organizationId: activeOrganizationId!,
      kind: orderDistributionSelection!.kind,
      groupId: orderDistributionSelection!.id,
      page: orderDistributionPage,
      pageSize: DASHBOARD_ORDER_PAGE_SIZE,
    }),
    enabled: Boolean(activeOrganizationId && activeModule === "orders" && orderDistributionSelection),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
  const inventoryPurchasesQuery = useQuery({
    queryKey: ["dashboard", "inventory-purchases", activeOrganizationId, periodDays],
    queryFn: () => listInventoryPurchaseAnalytics(activeOrganizationId!, periodDays),
    enabled: Boolean(activeOrganizationId && activeModule === "inventory" && access.inventory && access.inventoryCosts && canViewInventoryMovements),
  });

  const data = dashboardQuery.data ?? { orders: [], registrations: [], inventory: [], appointments: [], quotes: [] };
  const inventoryPurchases = inventoryPurchasesQuery.data ?? [];
  const inventoryPurchaseSummary = (() => {
    const suppliers = new Map<string, { name: string; count: number; total: number }>();
    let total = 0;
    inventoryPurchases.forEach(row => {
      const amount = Number(row.total_cost || 0);
      total += amount;
      const key = row.supplier_entity_id || "unknown";
      const current = suppliers.get(key) || { name: purchaseSupplierName(row.supplier), count: 0, total: 0 };
      current.count += 1;
      current.total += amount;
      suppliers.set(key, current);
    });
    return {
      total,
      count: inventoryPurchases.length,
      bySupplier: Array.from(suppliers.values()).sort((a, b) => b.total - a.total || b.count - a.count),
    };
  })();
  const ordersInPeriod = data.orders.filter(order => insidePeriod(order.created_at, periodDays));
  const completedInPeriod = data.orders.filter(order => insidePeriod(order.completed_at, periodDays));
  const registrationsInPeriod = data.registrations.filter(registration => insidePeriod(registration.created_at, periodDays));
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
  const activeRegistrations = data.registrations.filter(registration => registration.is_active !== false);
  const revenue = completedInPeriod.reduce((total, order) => total + Number(order.final_total || 0), 0);
  const discounts = completedInPeriod.reduce((total, order) => total + Number(order.discount_amount || 0), 0);
  const convertedQuoteIds = new Set(data.orders.map(order => order.quote_request_id).filter(Boolean));
  const fmtDate = (value?: string | null) => formatDateOnly(value, "—");
  const open = (tab: AdminTab) => onNavigate?.(tab);
  const selectedSummaryGroup = orderDistributionSelection && ordersSummaryQuery.data
    ? (orderDistributionSelection.kind === "situation" ? ordersSummaryQuery.data.situations : ordersSummaryQuery.data.statuses)
        .find(item => item.id === orderDistributionSelection.id)
    : null;
  const selectedOrderTotal = selectedSummaryGroup?.total ?? orderDistributionSelection?.total ?? 0;
  const selectedOrderTotalPages = Math.max(1, Math.ceil(selectedOrderTotal / DASHBOARD_ORDER_PAGE_SIZE));
  const safeOrderDistributionPage = Math.min(orderDistributionPage, selectedOrderTotalPages);

  useEffect(() => {
    if (orderDistributionPage > selectedOrderTotalPages) setOrderDistributionPage(selectedOrderTotalPages);
  }, [orderDistributionPage, selectedOrderTotalPages]);

  const openOrderFromDashboard = (orderId: string) => {
    if (onOpenOrder) {
      onOpenOrder(orderId);
      return;
    }

    saveDashboardReturnState({
      organizationId: activeOrganizationId || null,
      activeModule,
      periodDays,
      orderDistributionSelection: orderDistributionSelection
        ? {
            ...orderDistributionSelection,
            name: selectedSummaryGroup?.name || orderDistributionSelection.name,
            total: selectedOrderTotal,
          }
        : null,
      orderDistributionPage: safeOrderDistributionPage,
    });
    open("orders");
  };

  const moduleContent = () => {
    if (activeModule === "orders") {
      const summary = ordersSummaryQuery.data!;
      const metrics: Metric[] = [
        { label: `OS em ${periodDays} dias`, value: summary.orders_in_period, icon: ClipboardList, tone: "blue", hint: "abertas no período" },
        { label: "Em andamento", value: summary.active_orders, icon: Activity, tone: "purple", hint: "ainda não concluídas" },
        { label: "Aguardando", value: summary.waiting_orders, icon: Clock3, tone: summary.waiting_orders ? "amber" : "green", hint: "cliente ou pendência" },
        { label: "Concluídas", value: summary.completed_in_period, icon: CheckCircle2, tone: "green", hint: `nos últimos ${periodDays} dias` },
      ];
      const situationData = distributionPoints(summary.situations, "situation");
      const statusData = distributionPoints(summary.statuses, "status");
      const selectedName = selectedSummaryGroup?.name || orderDistributionSelection?.name || "";
      const selectedTitle = orderDistributionSelection
        ? `OS em ${selectedName}`
        : "Ordens por seleção";
      const selectedSubtitle = orderDistributionSelection
        ? `${selectedOrderTotal} ${selectedOrderTotal === 1 ? "ordem" : "ordens"} · ${orderDistributionSelection.kind === "situation" ? "Situação" : "Status"}`
        : "Clique em um item do gráfico para visualizar as OS";

      const chartInteractionHint = orderDistributionChartMode === "pie"
        ? "Clique em uma fatia para filtrar"
        : "Clique em uma barra para filtrar";
      const setChartMode = (mode: OrderDistributionChartMode) => {
        setOrderDistributionChartMode(mode);
        if (typeof window !== "undefined") window.localStorage.setItem(DASHBOARD_ORDER_CHART_MODE_KEY, mode);
      };
      const selectDistribution = (kind: OrderDistributionKind) => (point: DashboardChartPoint) => {
        setOrderDistributionSelection({
          kind,
          id: point.id || null,
          name: point.name,
          total: point.value,
        });
        setOrderDistributionPage(1);
      };
      const renderDistributionChart = (data: DashboardChartPoint[], kind: OrderDistributionKind) => {
        const selectedKey = orderDistributionSelection?.kind === kind
          ? `${kind}:${orderDistributionSelection.id || "none"}`
          : null;

        if (orderDistributionChartMode === "pie") {
          return (
            <DashboardDonutChart
              data={data}
              minHeight={230}
              innerRadius={0}
              selectedKey={selectedKey}
              onSelect={selectDistribution(kind)}
            />
          );
        }

        return (
          <DashboardBarChart
            data={data}
            layout={orderDistributionChartMode === "horizontal" ? "vertical" : "horizontal"}
            minHeight={orderDistributionChartMode === "horizontal" ? 190 : 270}
            selectedKey={selectedKey}
            onSelect={selectDistribution(kind)}
          />
        );
      };

      const distributions = (
        <DashboardPanel
          title="Distribuição das OS"
          subtitle="Situações e status atuais de todas as ordens visíveis"
          icon={Activity}
          headerAside={
            <div className="flex items-center gap-2">
              <div className="inline-flex shrink-0 rounded-lg border border-border bg-muted/50 p-0.5">
                {([
                  ["pie", PieChart, "Gráfico de pizza"],
                  ["vertical", BarChart3, "Barras verticais"],
                  ["horizontal", AlignLeft, "Barras horizontais"],
                ] as const).map(([mode, Icon, title]) => (
                  <button
                    key={mode}
                    type="button"
                    title={title}
                    aria-label={title}
                    aria-pressed={orderDistributionChartMode === mode}
                    onClick={() => setChartMode(mode)}
                    className={cn(
                      "inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors",
                      orderDistributionChartMode === mode
                        ? "bg-card text-foreground shadow-sm"
                        : "text-muted-foreground hover:bg-card/70 hover:text-foreground",
                    )}
                  >
                    <Icon size={16} strokeWidth={2.2} />
                  </button>
                ))}
              </div>
              <span className="whitespace-nowrap text-[10px] font-bold text-muted-foreground">
                Total <strong className="text-xs text-foreground">{summary.total_orders}</strong>
              </span>
            </div>
          }
        >
          <div className="space-y-5">
            <section>
              <div className="mb-1">
                <h4 className="text-sm font-black text-foreground">Situações</h4>
                <p className="text-[11px] font-semibold text-muted-foreground">{chartInteractionHint}</p>
              </div>
              {renderDistributionChart(situationData, "situation")}
            </section>

            <div className="border-t border-[#0d1b2e]/8" />

            <section>
              <div className="mb-1">
                <h4 className="text-sm font-black text-foreground">Status</h4>
                <p className="text-[11px] font-semibold text-muted-foreground">{chartInteractionHint}</p>
              </div>
              {renderDistributionChart(statusData, "status")}
            </section>
          </div>
        </DashboardPanel>
      );

      const filteredOrders = (
        <DashboardPanel title={selectedTitle} subtitle={selectedSubtitle} icon={ClipboardList} onOpen={() => open("orders")}>
          {!orderDistributionSelection ? (
            <DashboardEmpty text="Selecione uma situação ou um status no gráfico para ver as OS desse grupo." />
          ) : orderGroupPageQuery.isError ? (
            <DashboardEmpty text={systemErrorMessage(orderGroupPageQuery.error)} />
          ) : (
            <div className="-m-3 sm:-m-4">
              <div className="relative min-h-[480px] p-3 sm:p-4">
                <div className={cn("transition-opacity duration-150", orderGroupPageQuery.isFetching && "pointer-events-none opacity-55")}>
                  <OrdersList
                    orders={orderGroupPageQuery.data || []}
                    onOpen={openOrderFromDashboard}
                    badge={orderDistributionSelection.kind === "situation" ? "status" : "situation"}
                  />
                </div>
                {orderGroupPageQuery.isFetching && (
                  <div className="pointer-events-none absolute inset-x-3 top-3 flex justify-end sm:inset-x-4 sm:top-4">
                    <span className="rounded-md border border-[#d9e1ec] bg-white/95 px-2.5 py-1 text-[10px] font-bold text-[#5a6a82] shadow-sm">
                      Carregando...
                    </span>
                  </div>
                )}
              </div>
              <PaginationBar
                page={safeOrderDistributionPage}
                pageSize={DASHBOARD_ORDER_PAGE_SIZE}
                totalItems={selectedOrderTotal}
                defaultPageSize={DASHBOARD_ORDER_PAGE_SIZE}
                showPageSizeSelector={false}
                onPageChange={nextPage => setOrderDistributionPage(Math.max(1, Math.min(nextPage, selectedOrderTotalPages)))}
                onPageSizeChange={() => undefined}
              />
            </div>
          )}
        </DashboardPanel>
      );

      return <DashboardArea metrics={metrics} left={distributions} right={filteredOrders} />;
    }

    if (activeModule === "registrations") {
      const customers = activeRegistrations.filter(registration => registrationHasRole(registration, "customer"));
      const employees = activeRegistrations.filter(registration => registrationHasRole(registration, "employee"));
      const suppliers = activeRegistrations.filter(registration => registrationHasRole(registration, "supplier"));
      const metrics: Metric[] = [
        { label: "Cadastros ativos", value: activeRegistrations.length, icon: Users, tone: "blue", hint: "pessoas e empresas" },
        { label: "Clientes", value: customers.length, icon: UserCheck, tone: "green", hint: "vínculo ativo" },
        { label: "Funcionários", value: employees.length, icon: Users, tone: "purple", hint: "vínculo ativo" },
        { label: "Fornecedores", value: suppliers.length, icon: Building2, tone: "amber", hint: "vínculo ativo" },
      ];
      return <DashboardArea metrics={metrics} left={<DashboardPanel title="Novos cadastros" subtitle={`Entradas nos últimos ${periodDays} dias`} icon={TrendingUp}><DashboardLineChart data={buildTrend(registrationsInPeriod, periodDays, registration => registration.created_at)} /></DashboardPanel>} right={<DashboardPanel title="Cadastros recentes" subtitle="Clientes, funcionários e fornecedores" icon={Users} onOpen={() => open("customers")}><CompactList>{data.registrations.slice(0, 10).map(registration => <CompactRow key={registration.id} title={registration.name} subtitle={`${registrationRoleLabel(registration)} · ${fmtDate(registration.created_at)}`} onClick={() => open("customers")} />)}{!data.registrations.length && <DashboardEmpty text="Nenhum cadastro encontrado." />}</CompactList></DashboardPanel>} />;
    }

    if (activeModule === "inventory") {
      const stockValue = access.inventoryCosts
        ? activeInventory.reduce((total, item) => total + Number(item.quantity || 0) * Number(item.average_cost || 0), 0)
        : 0;
      const metrics: Metric[] = [
        { label: "Itens ativos", value: activeInventory.length, icon: Package, tone: "blue", hint: "cadastros no estoque" },
        { label: "Estoque baixo", value: lowInventory.length, icon: AlertTriangle, tone: lowInventory.length ? "amber" : "green", hint: "no mínimo configurado" },
        { label: "Sem estoque", value: outInventory.length, icon: AlertTriangle, tone: outInventory.length ? "red" : "green", hint: "saldo zerado" },
        ...(access.inventoryCosts ? [{ label: "Valor em estoque", value: formatCurrency(stockValue), icon: Banknote, tone: "purple" as const, hint: "saldo × custo médio" }] : []),
      ];
      const alerts = [...outInventory, ...lowInventory].slice(0, 10);
      const topBalances = [...activeInventory]
        .sort((a, b) => Number(b.quantity || 0) - Number(a.quantity || 0))
        .slice(0, 10);
      const purchasesPanel = access.inventoryCosts && canViewInventoryMovements
        ? <DashboardPanel
            title="Compras por fornecedor"
            subtitle={`${inventoryPurchaseSummary.count} entrada${inventoryPurchaseSummary.count === 1 ? "" : "s"} · ${formatCurrency(inventoryPurchaseSummary.total)} · últimos ${periodDays} dias`}
            icon={ShoppingCart}
          >
            {inventoryPurchasesQuery.isPending ? <LoadingState text="Carregando compras..." /> : inventoryPurchasesQuery.isError ? <DashboardEmpty text="Não foi possível carregar as compras do período." /> : inventoryPurchaseSummary.bySupplier.length ? <CompactList>{inventoryPurchaseSummary.bySupplier.slice(0, 10).map((supplier, index) => <CompactRow key={`${supplier.name}-${index}`} title={supplier.name} subtitle={`${supplier.count} entrada${supplier.count === 1 ? "" : "s"}`} aside={<strong className="text-xs text-[#0d1b2e]">{formatCurrency(supplier.total)}</strong>} />)}</CompactList> : <DashboardEmpty text="Nenhuma compra registrada neste período." />}
          </DashboardPanel>
        : <DashboardPanel title="Maiores saldos" subtitle="Itens ativos com maior quantidade disponível" icon={Package} onOpen={() => open("inventory")}><CompactList>{topBalances.map(item => <CompactRow key={item.id} title={item.name} subtitle={item.sku ? `SKU ${item.sku}` : "Sem SKU"} aside={<span className="text-xs font-black text-[#0057e7]">{Number(item.quantity || 0)} {item.unit || "un"}</span>} />)}{!topBalances.length && <DashboardEmpty text="Nenhum item ativo encontrado." />}</CompactList></DashboardPanel>;
      return <DashboardArea metrics={metrics} left={purchasesPanel} right={<DashboardPanel title="Reposição necessária" subtitle="Itens zerados ou no mínimo" icon={AlertTriangle} onOpen={() => open("inventory")}><CompactList>{alerts.map(item => <CompactRow key={item.id} title={item.name} subtitle={item.sku ? `SKU ${item.sku}` : "Sem SKU"} aside={<span className={cn("text-xs font-black", Number(item.quantity || 0) <= 0 ? "text-red-600" : "text-amber-600")}>{Number(item.quantity || 0)} {item.unit || "un"}</span>} />)}{!alerts.length && <DashboardEmpty text="Nenhum item precisa de reposição." />}</CompactList></DashboardPanel>} />;
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
      return <DashboardArea metrics={metrics} left={<DashboardPanel title="Faturamento por período" subtitle="Valores das OS concluídas" icon={TrendingUp}><DashboardLineChart data={financeTrend} money color="#16a34a" /></DashboardPanel>} right={<DashboardPanel title="Conclusões recentes" subtitle="Últimas OS faturadas" icon={Banknote} onOpen={() => open("orders")}><OrdersList orders={completedInPeriod.slice(0, 8)} onOpen={openOrderFromDashboard} showValue /></DashboardPanel>} />;
    }

    const overviewMetrics: Metric[] = [
      ...(access.orders ? [
        { label: `OS em ${periodDays} dias`, value: ordersInPeriod.length, icon: ClipboardList, tone: "blue" as const, hint: "abertas no período" },
        { label: "OS em andamento", value: activeOrders.length, icon: Activity, tone: "purple" as const, hint: "ainda não concluídas" },
        { label: "Faturamento", value: formatCurrency(revenue), icon: Banknote, tone: "green" as const, hint: `últimos ${periodDays} dias` },
      ] : []),
      ...(access.registrations ? [{ label: "Novos cadastros", value: registrationsInPeriod.length, icon: Users, tone: "blue" as const, hint: `últimos ${periodDays} dias` }] : []),
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
    <div className="min-w-0 space-y-4 pb-2">
      <PageHeader title="Dashboard" subtitle="Indicadores objetivos por área, respeitando as permissões do seu perfil." actions={
        <div className="w-32">
          <AdminSelect
            value={periodDays}
            onValueChange={value => setPeriodDays(Number(value))}
            options={periodOptions}
            ariaLabel="Período do dashboard"
            className="min-h-9 text-xs font-black"
          />
        </div>
      } />

      <DashboardModuleNav items={modules} value={activeModule} onChange={setActiveModule} />

      <div className="min-w-0">
        {(activeModule === "orders" ? ordersSummaryQuery.isPending : dashboardQuery.isPending) ? <LoadingState text="Carregando indicadores..." /> : (activeModule === "orders" ? ordersSummaryQuery.error : dashboardQuery.error) ? (
          <AdminCard className="flex min-h-[280px] flex-col items-center justify-center gap-3 p-6 text-center">
            <AlertTriangle className="text-red-500" size={28} />
            <div><p className="font-black text-[#0d1b2e]">Não foi possível carregar o Dashboard.</p><p className="mt-1 text-xs text-[#5a6a82]">{systemErrorMessage((activeModule === "orders" ? ordersSummaryQuery.error : dashboardQuery.error)!)}</p></div>
            <AdminButton size="sm" onClick={() => activeModule === "orders" ? ordersSummaryQuery.refetch() : dashboardQuery.refetch()}>Tentar novamente</AdminButton>
          </AdminCard>
        ) : moduleContent()}
      </div>
    </div>
  );
}

function DashboardArea({ metrics, left, right }: { metrics: Metric[]; left: ReactNode; right: ReactNode }) {
  return (
    <div className="min-w-0 space-y-3">
      <MetricGrid metrics={metrics} />
      <div className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1.25fr)_minmax(320px,.75fr)] [&>*]:min-h-[280px]">{left}{right}</div>
    </div>
  );
}

type DashboardOrderListRow = Pick<DashboardOrder, "id" | "os_number" | "created_at" | "updated_at" | "completed_at" | "customer" | "order_status" | "situation"> & {
  final_total?: number | null;
};

function OrdersList({
  orders,
  onOpen,
  showValue = false,
  badge = "status",
}: {
  orders: DashboardOrderListRow[] | DashboardOrderGroupItem[];
  onOpen: (orderId: string) => void;
  showValue?: boolean;
  badge?: "status" | "situation";
}) {
  if (!orders.length) return <DashboardEmpty text="Nenhuma ordem encontrada." />;
  return <CompactList>{orders.map(order => {
    const badgeRelation = badge === "situation" ? order.situation : order.order_status;
    return (
      <CompactRow
        key={order.id}
        title={`OS ${order.os_number || order.id.slice(0, 8)}`}
        subtitle={`${relationLabel(order.customer, "Cliente não informado")} · ${fmtListDate(order.completed_at || order.updated_at)}`}
        aside={showValue
          ? <strong className="text-xs text-emerald-700">{formatCurrency(Number(("final_total" in order ? order.final_total : 0) || 0))}</strong>
          : <StatusBadge status={relationLabel(badgeRelation, badge === "situation" ? "Sem situação" : "Em andamento")} color={badgeRelation?.color} />}
        onClick={() => onOpen(order.id)}
      />
    );
  })}</CompactList>;
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
