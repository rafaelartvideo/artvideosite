import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  Building2,
  CreditCard,
  Database,
  HardDrive,
  ListOrdered,
  MapPinned,
  Monitor,
  Phone,
  RotateCcw,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";
import { formatCurrency } from "@/shared/domain/formatters";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { AdminButton, AdminCard, AdminCardContent, AdminCardHeader } from "@/shared/ui/admin/AdminLayout";
import { FInput, FSelect } from "@/shared/ui/admin/AdminFormControls";
import { LoadingState } from "@/shared/ui/admin/AdminFeedback";
import {
  loadUnionSubscriptionUsageOverview,
  usageHealth,
  type UnionSubscriptionUsageRow,
  type UnionUsageHealth,
} from "../infrastructure/subscription-usage-overview.repository";

const healthOptions = [
  { value: "", label: "Todas as situações" },
  { value: "normal", label: "Normal" },
  { value: "warning", label: "Atenção" },
  { value: "critical", label: "Crítico" },
  { value: "reached", label: "Limite atingido" },
  { value: "unconfigured", label: "Sem plano" },
];

const healthLabels: Record<UnionUsageHealth, string> = {
  normal: "Normal",
  warning: "Atenção",
  critical: "Crítico",
  reached: "Limite atingido",
  unconfigured: "Sem plano",
};

const healthClasses: Record<UnionUsageHealth, string> = {
  normal: "border-emerald-200 bg-emerald-50 text-emerald-700",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  critical: "border-rose-200 bg-rose-50 text-rose-700",
  reached: "border-rose-300 bg-rose-100 text-rose-800",
  unconfigured: "border-border bg-muted text-muted-foreground",
};

function formatBytes(value: number) {
  const bytes = Math.max(0, Number(value || 0));
  if (bytes < 1024) return Math.round(bytes) + " B";
  const units = ["KB", "MB", "GB", "TB"];
  let current = bytes / 1024;
  let unit = 0;
  while (current >= 1024 && unit < units.length - 1) {
    current /= 1024;
    unit += 1;
  }
  return current.toFixed(current >= 10 ? 0 : 1).replace(".", ",") + " " + units[unit];
}

function numberRatio(used: number, limit: number) {
  const current = Math.max(0, Number(used || 0));
  const maximum = Math.max(0, Number(limit || 0));
  if (maximum > 0) return current.toLocaleString("pt-BR") + " / " + maximum.toLocaleString("pt-BR");
  if (current > 0) return current.toLocaleString("pt-BR") + " / sem franquia";
  return "0 / —";
}

function bytesRatio(used: number, limit: number) {
  const current = Math.max(0, Number(used || 0));
  const maximum = Math.max(0, Number(limit || 0));
  if (maximum > 0) return formatBytes(current) + " / " + formatBytes(maximum);
  if (current > 0) return formatBytes(current) + " / sem franquia";
  return "0 B / —";
}

function HealthBadge({ health }: { health: UnionUsageHealth }) {
  return <span className={"inline-flex items-center border px-2 py-1 text-[10px] font-black uppercase tracking-wide " + healthClasses[health]}>
    {healthLabels[health]}
  </span>;
}

function SummaryCard({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  icon: typeof Building2;
}) {
  return <div className="border border-border bg-card p-4">
    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-soft text-primary"><Icon size={17} /></span>
    <p className="mt-3 text-[10px] font-black uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
    <strong className="mt-1 block truncate text-lg font-black text-foreground">{value}</strong>
  </div>;
}

function MobileCompanyCard({ row }: { row: UnionSubscriptionUsageRow }) {
  const health = usageHealth(row);
  const usage = row.usage;
  const limits = row.limits;

  return <AdminCard square>
    <AdminCardContent className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-black text-foreground">{row.organization_name}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{row.subscription?.plan_name || "Sem assinatura configurada"}</p>
        </div>
        <HealthBadge health={health} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <MetricBox icon={Users} label="Usuários" value={numberRatio(usage.users || 0, limits.users || 0)} />
        <MetricBox icon={HardDrive} label="Storage" value={bytesRatio(usage.storage_bytes || 0, limits.storage_bytes || 0)} />
        <MetricBox icon={Monitor} label="PDVs" value={numberRatio(usage.pdv_terminals || 0, limits.pdv_terminals || 0)} />
        <MetricBox icon={MapPinned} label="Campo" value={numberRatio(usage.field_devices || 0, limits.field_devices || 0)} />
        <MetricBox icon={ListOrdered} label="Fila" value={numberRatio(usage.queue_units || 0, limits.queue_units || 0)} />
        <MetricBox icon={Phone} label="PABX" value={numberRatio(usage.pbx_extensions || 0, limits.pbx_extensions || 0)} />
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-wide text-muted-foreground">Mensal contratado</p>
          <p className="mt-0.5 text-sm font-black text-foreground">{formatCurrency(row.contracted_monthly_amount)}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-black uppercase tracking-wide text-muted-foreground">Banco estimado</p>
          <p className="mt-0.5 text-xs font-bold text-foreground">{formatBytes(row.database_bytes_estimate)}</p>
        </div>
      </div>
    </AdminCardContent>
  </AdminCard>;
}

function MetricBox({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Users;
  label: string;
  value: string;
}) {
  return <div className="border border-border p-2.5">
    <div className="flex items-center gap-1.5 text-muted-foreground">
      <Icon size={13} />
      <span className="text-[9px] font-black uppercase tracking-wide">{label}</span>
    </div>
    <p className="mt-1 truncate text-xs font-black text-foreground">{value}</p>
  </div>;
}

export function UnionSubscriptionUsageOverview() {
  const [search, setSearch] = useState("");
  const [planFilter, setPlanFilter] = useState("");
  const [healthFilter, setHealthFilter] = useState("");

  const query = useQuery({
    queryKey: ["union-subscription-usage-overview"],
    queryFn: loadUnionSubscriptionUsageOverview,
  });

  const rows = query.data || [];
  const planOptions = useMemo(() => {
    const names = Array.from(new Set(rows.map(row => row.subscription?.plan_name).filter((name): name is string => Boolean(name)))).sort();
    return [{ value: "", label: "Todos os planos" }, ...names.map(name => ({ value: name, label: name }))];
  }, [rows]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows
      .filter(row => !term || row.organization_name.toLowerCase().includes(term))
      .filter(row => !planFilter || row.subscription?.plan_name === planFilter)
      .filter(row => !healthFilter || usageHealth(row) === healthFilter)
      .sort((a, b) => {
        const rank: Record<UnionUsageHealth, number> = { reached: 5, critical: 4, warning: 3, unconfigured: 2, normal: 1 };
        const diff = rank[usageHealth(b)] - rank[usageHealth(a)];
        return diff || a.organization_name.localeCompare(b.organization_name, "pt-BR");
      });
  }, [healthFilter, planFilter, rows, search]);

  const metrics = useMemo(() => {
    const healths = rows.map(usageHealth);
    return {
      companies: rows.length,
      withoutPlan: healths.filter(health => health === "unconfigured").length,
      warning: healths.filter(health => health === "warning").length,
      critical: healths.filter(health => health === "critical" || health === "reached").length,
      contracted: rows.reduce((total, row) => total + row.contracted_monthly_amount, 0),
    };
  }, [rows]);

  const hasFilters = Boolean(search || planFilter || healthFilter);
  const clearFilters = () => {
    setSearch("");
    setPlanFilter("");
    setHealthFilter("");
  };

  if (query.isPending) return <LoadingState text="Carregando consumo das empresas..." />;

  if (query.isError) {
    return <AdminCard square>
      <AdminCardContent className="p-6">
        <p className="font-black text-foreground">Não foi possível carregar o painel de consumo.</p>
        <p className="mt-1 text-sm text-muted-foreground">{systemErrorMessage(query.error)}</p>
        <AdminButton className="mt-4" size="sm" variant="secondary" onClick={() => query.refetch()}>Tentar novamente</AdminButton>
      </AdminCardContent>
    </AdminCard>;
  }

  return <div className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <SummaryCard label="Empresas monitoradas" value={metrics.companies} icon={Building2} />
      <SummaryCard label="Sem plano" value={metrics.withoutPlan} icon={CreditCard} />
      <SummaryCard label="Em atenção" value={metrics.warning} icon={AlertTriangle} />
      <SummaryCard label="Crítico / atingido" value={metrics.critical} icon={TrendingUp} />
      <SummaryCard label="Mensal contratado" value={formatCurrency(metrics.contracted)} icon={CreditCard} />
    </div>

    <AdminCard square>
      <AdminCardHeader>
        <div>
          <h3 className="text-xs font-black uppercase tracking-[0.12em] text-foreground">Consumo por empresa</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Visão consolidada da assinatura, consumo medido e situação comercial. Nenhum indicador abaixo bloqueia operações.
          </p>
        </div>
        <AdminButton size="sm" variant="secondary" onClick={() => query.refetch()}><RotateCcw size={14} /> Atualizar painel</AdminButton>
      </AdminCardHeader>

      <AdminCardContent className="border-b border-border p-4">
        <div className="grid gap-3 md:grid-cols-[minmax(220px,1fr)_210px_210px_auto] md:items-end">
          <FInput label="Buscar empresa" value={search} onChange={(event: any) => setSearch(event.target.value)} placeholder="Nome da empresa" />
          <FSelect label="Plano" value={planFilter} onChange={(event: any) => setPlanFilter(event.target.value)} options={planOptions} />
          <FSelect label="Situação" value={healthFilter} onChange={(event: any) => setHealthFilter(event.target.value)} options={healthOptions} />
          <AdminButton variant="secondary" disabled={!hasFilters} onClick={clearFilters}><RotateCcw size={14} /> Limpar filtros</AdminButton>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">{filteredRows.length} de {rows.length} empresa{rows.length === 1 ? "" : "s"}.</p>
      </AdminCardContent>

      {!filteredRows.length ? <AdminCardContent className="p-6 text-sm text-muted-foreground">Nenhuma empresa encontrada com os filtros atuais.</AdminCardContent> : <>
        <div className="grid gap-3 p-3 lg:hidden">
          {filteredRows.map(row => <MobileCompanyCard key={row.organization_id} row={row} />)}
        </div>

        <div className="hidden overflow-x-auto lg:block">
          <table className="min-w-[1540px]">
            <thead>
              <tr>
                <th className="text-left">Empresa</th>
                <th className="text-left">Plano</th>
                <th className="text-left">Situação</th>
                <th className="text-left">Mensal</th>
                <th className="text-left">Usuários</th>
                <th className="text-left">Storage</th>
                <th className="text-left">Banco</th>
                <th className="text-left">PDV</th>
                <th className="text-left">Campo</th>
                <th className="text-left">Fila</th>
                <th className="text-left">PABX</th>
                <th className="text-left">IA</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map(row => {
                const health = usageHealth(row);
                const usage = row.usage;
                const limits = row.limits;
                return <tr key={row.organization_id}>
                  <td>
                    <strong className="block text-foreground">{row.organization_name}</strong>
                    <span className="mt-0.5 block text-[10px] font-semibold uppercase text-muted-foreground">{row.organization_status}</span>
                  </td>
                  <td>
                    <span className="font-bold text-foreground">{row.subscription?.plan_name || "Sem plano"}</span>
                    {row.addons_count > 0 && <span className="mt-0.5 block text-[10px] text-muted-foreground">{row.addons_count} add-on{row.addons_count === 1 ? "" : "s"} · {formatCurrency(row.addons_amount)}</span>}
                  </td>
                  <td><HealthBadge health={health} /></td>
                  <td className="font-black text-foreground">{formatCurrency(row.contracted_monthly_amount)}</td>
                  <td className="text-xs font-bold text-foreground">{numberRatio(usage.users || 0, limits.users || 0)}</td>
                  <td className="text-xs font-bold text-foreground">{bytesRatio(usage.storage_bytes || 0, limits.storage_bytes || 0)}</td>
                  <td className="text-xs font-bold text-foreground">{formatBytes(row.database_bytes_estimate)}</td>
                  <td className="text-xs font-bold text-foreground">{numberRatio(usage.pdv_terminals || 0, limits.pdv_terminals || 0)}</td>
                  <td className="text-xs font-bold text-foreground">{numberRatio(usage.field_devices || 0, limits.field_devices || 0)}</td>
                  <td>
                    <span className="text-xs font-bold text-foreground">{numberRatio(usage.queue_units || 0, limits.queue_units || 0)}</span>
                    {Number(usage.queue_attendants || 0) > 0 && <span className="mt-0.5 block text-[10px] text-muted-foreground">{Number(usage.queue_attendants).toLocaleString("pt-BR")} atendentes</span>}
                  </td>
                  <td className="text-xs font-bold text-foreground">{numberRatio(usage.pbx_extensions || 0, limits.pbx_extensions || 0)}</td>
                  <td>
                    <span className="text-xs font-bold text-foreground">{numberRatio(usage.ai_credits || 0, limits.ai_credits || 0)}</span>
                    {Number(usage.ai_requests_30d || 0) > 0 && <span className="mt-0.5 block text-[10px] text-muted-foreground">{Number(usage.ai_requests_30d).toLocaleString("pt-BR")} req. / 30 dias</span>}
                  </td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
      </>}
    </AdminCard>

    {rows[0]?.monitoring && <p className="px-1 text-[11px] leading-5 text-muted-foreground">
      Faixas atuais: Atenção em {rows[0].monitoring.warning_percent}% e Crítico em {rows[0].monitoring.critical_percent}%. O modo global permanece em monitoramento, sem bloqueio.
    </p>}
  </div>;
}
