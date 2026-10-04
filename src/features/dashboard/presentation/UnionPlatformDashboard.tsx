import { useQuery } from "@tanstack/react-query";
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
import { loadUnionPlatformDashboard } from "@/features/platform-billing/infrastructure/platform-billing.repository";

type Props = { onNavigate?: (tab: AdminTab) => void };

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
  const query = useQuery({
    queryKey: [...queryKeys.admin.dashboards(), "union-platform"],
    queryFn: loadUnionPlatformDashboard,
  });

  const data = query.data;
  const metrics = data?.metrics;
  const open = (tab: AdminTab) => onNavigate?.(tab);

  return <div className="min-w-0 space-y-4 pb-2">
    <PageHeader
      title="Dashboard"
      subtitle="Visão geral da operação da Union World, empresas parceiras, monitoramento e assinaturas."
    />

    {query.isPending ? <LoadingState text="Carregando indicadores da Union..." /> : query.isError || !data || !metrics ? (
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
        <MetricCard label="Empresas cadastradas" value={metrics.companies_total} hint={`${metrics.companies_active} ativas`} icon={Building2} onClick={() => open("partnerCompanies")} />
        <MetricCard label="Empresas monitoradas" value={metrics.monitored_companies} hint="com tipos de atendimento monitorados" icon={Radio} onClick={() => open("orders")} />
        <MetricCard label="OS monitoradas" value={metrics.monitored_orders_open} hint={`${metrics.monitored_orders_total} no histórico monitorado`} icon={ClipboardList} onClick={() => open("orders")} />
        <MetricCard label="Assinaturas ativas" value={metrics.subscriptions_active} hint={`${metrics.subscriptions_past_due} com pendência`} icon={CreditCard} onClick={() => open("finance")} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="MRR" value={formatCurrency(metrics.mrr)} hint="receita recorrente mensal ativa" icon={TrendingUp} onClick={() => open("finance")} />
        <MetricCard label="A receber no mês" value={formatCurrency(metrics.receivable_month)} hint="cobranças pendentes do mês" icon={Landmark} onClick={() => open("finance")} />
        <MetricCard label="Recebido no mês" value={formatCurrency(metrics.received_month)} hint="assinaturas recebidas no mês" icon={CheckCircle2} onClick={() => open("finance")} />
        <MetricCard label="Em atraso" value={formatCurrency(metrics.overdue_total)} hint="saldo vencido em aberto" icon={Banknote} onClick={() => open("finance")} />
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
