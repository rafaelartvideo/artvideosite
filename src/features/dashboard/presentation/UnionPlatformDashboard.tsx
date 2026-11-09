import { AdminWorkspaceSkeleton } from "@/shared/ui/admin/AdminWorkspaceSkeleton";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  AlertTriangle,
  Banknote,
  Building2,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  Landmark,
  Radio,
  TrendingUp,
} from "lucide-react";
import type { ElementType, ReactNode } from "react";
import type { AdminTab } from "@/features/admin-shell/domain/admin.types";
import { queryKeys } from "@/infrastructure/query/query-keys";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { formatCurrency, formatDateOnly } from "@/shared/domain/formatters";
import { AdminButton, AdminCard, AdminCardContent, AdminCardHeader, PageHeader } from "@/shared/ui/admin/AdminLayout";
import { LoadingState, StatusBadge } from "@/shared/ui/admin/AdminFeedback";
import { AdminMetricDetailDialog, type AdminMetricDetailRow } from "@/shared/ui/admin/AdminMetricDetailDialog";
import { loadUnionPlatformDashboard, loadUnionPlatformFinance } from "@/features/platform-billing/infrastructure/platform-billing.repository";

type Props = { onNavigate?: (tab: AdminTab) => void };
type UnionMetric = "companies" | "monitoredCompanies" | "orders" | "subscriptions" | "mrr" | "receivable" | "received" | "overdue";

function MetricCard({
  label,
  value,
  hint,
  icon: Icon,
  onClick,
}: {
  label: string;
  value: ReactNode;
  hint: string;
  icon: ElementType;
  onClick?: () => void;
}) {
  const content = <div className="flex min-w-0 items-start gap-3">
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
      <Icon size={18} />
    </span>
    <span className="min-w-0">
      <span className="block text-[10px] font-black uppercase tracking-[0.12em] text-muted-foreground">{label}</span>
      <strong className="mt-1 block truncate text-xl font-black text-foreground">{value}</strong>
      <span className="mt-1 block text-[10px] font-semibold text-muted-foreground">{hint}</span>
    </span>
  </div>;

  return onClick
    ? <button type="button" onClick={onClick} className="min-w-0 border border-border bg-card p-4 text-left transition-colors hover:bg-muted/50">{content}</button>
    : <div className="min-w-0 border border-border bg-card p-4">{content}</div>;
}

export function UnionPlatformDashboard({ onNavigate }: Props) {
  const [selectedMetric, setSelectedMetric] = useState<UnionMetric | null>(null);
  const requiresBilling = Boolean(selectedMetric && ["subscriptions", "mrr", "receivable", "received", "overdue"].includes(selectedMetric));
  const financeQuery = useQuery({
    queryKey: ["union-platform-finance"],
    queryFn: loadUnionPlatformFinance,
    enabled: requiresBilling,
    staleTime: 30_000,
  });
  const query = useQuery({
    queryKey: [...queryKeys.admin.dashboards(), "union-platform"],
    queryFn: loadUnionPlatformDashboard,
  });

  const data = query.data;
  const metrics = data?.metrics;
  const open = (tab: AdminTab) => onNavigate?.(tab);
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const monthKey = todayKey.slice(0, 7);
  const selectionTitles: Record<UnionMetric, string> = {
    companies: "Empresas cadastradas", monitoredCompanies: "Empresas monitoradas", orders: "OS monitoradas",
    subscriptions: "Assinaturas ativas", mrr: "MRR", receivable: "A receber no mês",
    received: "Recebido no mês", overdue: "Em atraso",
  };
  const selectionValues = metrics && {
    companies: String(metrics.companies_total), monitoredCompanies: String(metrics.monitored_companies),
    orders: String(metrics.monitored_orders_open), subscriptions: String(metrics.subscriptions_active),
    mrr: formatCurrency(metrics.mrr), receivable: formatCurrency(metrics.receivable_month),
    received: formatCurrency(metrics.received_month), overdue: formatCurrency(metrics.overdue_total),
  };
  const detailTarget: AdminTab = selectedMetric === "companies" ? "partnerCompanies" : selectedMetric === "monitoredCompanies" || selectedMetric === "orders" ? "orders" : "finance";
  let detailRows: AdminMetricDetailRow[] = [];
  let detailDescription = "Registros recentes relacionados ao indicador. Abra a seção completa para consultar todos os registros.";
  if (selectedMetric === "companies" && data) {
    detailRows = data.recent_companies.map(item => ({
      id: item.id, title: item.name,
      subtitle: `${item.status === "active" ? "Ativa" : "Suspensa"} · ${formatDateOnly(item.created_at, "—")}`,
      onClick: () => open("partnerCompanies"),
    }));
  } else if ((selectedMetric === "orders" || selectedMetric === "monitoredCompanies") && data) {
    detailRows = data.recent_orders.map(item => ({
      id: item.id, title: selectedMetric === "orders" ? `OS ${item.os_number}` : item.organization_name,
      subtitle: selectedMetric === "orders" ? `${item.organization_name} · ${item.situation_name || "Sem situação"}` : `OS ${item.os_number} · ${formatDateOnly(item.updated_at, "—")}`,
      onClick: () => open("orders"),
    }));
  } else if (requiresBilling && financeQuery.data) {
    const billing = financeQuery.data;
    detailDescription = "Cobranças e assinaturas vinculadas ao indicador. Os totais continuam sendo calculados pelo resumo oficial da plataforma.";
    if (selectedMetric === "subscriptions" || selectedMetric === "mrr") {
      detailRows = billing.subscriptions.filter(item => item.status === "active").map(item => ({
        id: item.id, title: item.organization_name,
        subtitle: `${item.plan_name} · Assinatura ativa`,
        amount: formatCurrency(item.net_amount),
        onClick: () => open("finance"),
      }));
    } else {
      const charges = billing.charges.filter(item => selectedMetric === "receivable"
        ? (item.status === "pending" || item.status === "overdue") && item.due_date.startsWith(monthKey)
        : selectedMetric === "received" ? item.status === "paid" && Boolean(item.paid_at?.startsWith(monthKey))
        : item.status === "overdue" || (item.status === "pending" && item.due_date < todayKey));
      detailRows = charges.map(item => ({
        id: item.id, title: item.organization_name,
        subtitle: `${item.plan_name} · Vencimento ${formatDateOnly(item.due_date, "—")}`,
        amount: formatCurrency(item.amount),
        onClick: () => open("finance"),
      }));
    }
  }

  return <div className="min-w-0 space-y-4 pb-2">
    {selectedMetric && selectionValues && <AdminMetricDetailDialog
      open title={selectionTitles[selectedMetric]} value={selectionValues[selectedMetric]}
      description={detailDescription} rows={detailRows}
      loading={requiresBilling && financeQuery.isPending}
      error={requiresBilling && financeQuery.isError ? systemErrorMessage(financeQuery.error) : null}
      emptyText={requiresBilling ? "Nenhum registro localizado nessa seleção." : "Nenhum registro recente localizado."}
      onClose={() => setSelectedMetric(null)} onViewAll={() => open(detailTarget)}
    />}
    <PageHeader
      title="Dashboard"
      subtitle="Visão geral da operação da Union World, empresas parceiras, monitoramento e assinaturas."
    />

    {query.isPending ? <AdminWorkspaceSkeleton variant="cards" rows={6} /> : query.isError || !data || !metrics ? (
      <AdminCard className="flex min-h-[260px] flex-col items-center justify-center gap-3 p-6 text-center">
        <AlertTriangle size={28} className="text-red-500" />
        <div>
          <p className="font-black text-foreground">Não foi possível carregar a dashboard da Union.</p>
          <p className="mt-1 text-xs text-muted-foreground">{systemErrorMessage(query.error)}</p>
        </div>
        <AdminButton size="sm" onClick={() => query.refetch()}>Tentar novamente</AdminButton>
      </AdminCard>
    ) : <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Empresas cadastradas" value={metrics.companies_total} hint={`${metrics.companies_active} ativas`} icon={Building2} onClick={() => setSelectedMetric("companies")} />
        <MetricCard label="Empresas monitoradas" value={metrics.monitored_companies} hint="com tipos de atendimento monitorados" icon={Radio} onClick={() => setSelectedMetric("monitoredCompanies")} />
        <MetricCard label="OS monitoradas" value={metrics.monitored_orders_open} hint={`${metrics.monitored_orders_total} no histórico monitorado`} icon={ClipboardList} onClick={() => setSelectedMetric("orders")} />
        <MetricCard label="Assinaturas ativas" value={metrics.subscriptions_active} hint={`${metrics.subscriptions_past_due} com pendência`} icon={CreditCard} onClick={() => setSelectedMetric("subscriptions")} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="MRR" value={formatCurrency(metrics.mrr)} hint="receita recorrente mensal ativa" icon={TrendingUp} onClick={() => setSelectedMetric("mrr")} />
        <MetricCard label="A receber no mês" value={formatCurrency(metrics.receivable_month)} hint="cobranças pendentes do mês" icon={Landmark} onClick={() => setSelectedMetric("receivable")} />
        <MetricCard label="Recebido no mês" value={formatCurrency(metrics.received_month)} hint="assinaturas recebidas no mês" icon={CheckCircle2} onClick={() => setSelectedMetric("received")} />
        <MetricCard label="Em atraso" value={formatCurrency(metrics.overdue_total)} hint="saldo vencido em aberto" icon={Banknote} onClick={() => setSelectedMetric("overdue")} />
      </div>

      <div className="grid min-h-0 gap-4 xl:grid-cols-2">
        <AdminCard>
          <AdminCardHeader>
            <div>
              <h3 className="text-xs font-black uppercase tracking-[0.12em] text-foreground">Empresas recentes</h3>
              <p className="mt-1 text-xs text-muted-foreground">Últimas empresas cadastradas na plataforma.</p>
            </div>
            <AdminButton size="sm" variant="secondary" onClick={() => open("partnerCompanies")}>Ver empresas</AdminButton>
          </AdminCardHeader>
          <div className="divide-y divide-border">
            {data.recent_companies.length ? data.recent_companies.map(company => <button
              key={company.id}
              type="button"
              onClick={() => open("partnerCompanies")}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 sm:px-5"
            >
              <span className="min-w-0">
                <strong className="block truncate text-sm text-foreground">{company.name}</strong>
                <span className="mt-0.5 block text-[10px] font-semibold text-muted-foreground">Cadastrada em {formatDateOnly(company.created_at, "—")}</span>
              </span>
              <StatusBadge status={company.status === "active" ? "Ativa" : "Suspensa"} />
            </button>) : <AdminCardContent><p className="text-sm text-muted-foreground">Nenhuma empresa parceira cadastrada.</p></AdminCardContent>}
          </div>
        </AdminCard>

        <AdminCard>
          <AdminCardHeader>
            <div>
              <h3 className="text-xs font-black uppercase tracking-[0.12em] text-foreground">OS monitoradas recentes</h3>
              <p className="mt-1 text-xs text-muted-foreground">Últimas alterações recebidas das empresas parceiras.</p>
            </div>
            <AdminButton size="sm" variant="secondary" onClick={() => open("orders")}>Abrir monitor</AdminButton>
          </AdminCardHeader>
          <div className="divide-y divide-border">
            {data.recent_orders.length ? data.recent_orders.map(order => <button
              key={order.id}
              type="button"
              onClick={() => open("orders")}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 sm:px-5"
            >
              <span className="min-w-0">
                <strong className="block truncate font-mono text-sm text-primary">OS {order.os_number}</strong>
                <span className="mt-0.5 block truncate text-[10px] font-semibold text-muted-foreground">
                  {order.organization_name}{order.external_os_number ? ` · Externa ${order.external_os_number}` : ""}
                </span>
              </span>
              <StatusBadge status={order.situation_name || "Sem situação"} color={order.situation_color} />
            </button>) : <AdminCardContent><p className="text-sm text-muted-foreground">Nenhuma OS monitorada encontrada.</p></AdminCardContent>}
          </div>
        </AdminCard>
      </div>
    </>}
  </div>;
}
