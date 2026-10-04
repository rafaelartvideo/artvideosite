import { useQuery } from "@tanstack/react-query";
import { Boxes, CreditCard, FileImage, HardDrive, MapPinned, Users } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { formatCurrency, formatDateOnly } from "@/shared/domain/formatters";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { AdminCard, AdminCardContent, PageHeader } from "@/shared/ui/admin/AdminLayout";
import { LoadingState } from "@/shared/ui/admin/AdminFeedback";
import { loadOrganizationPlanUsage } from "../infrastructure/subscription-usage.repository";

const statusLabels: Record<string, string> = {
  trial: "Período de teste",
  active: "Ativa",
  past_due: "Em atraso",
  suspended: "Suspensa",
  cancelled: "Cancelada",
};

const featureLabels: Record<string, string> = {
  finance_full: "Financeiro completo",
  advanced_reports: "Relatórios avançados",
  advanced_automation: "Automações avançadas",
  api_access: "Acesso à API",
  webhooks: "Webhooks",
  white_label: "White label",
  custom_domain: "Domínio próprio",
  marketplace_catalog: "Catálogo no Marketplace",
  advanced_backup_export: "Backup e exportação avançados",
  priority_support: "Suporte prioritário",
  dedicated_support: "Suporte dedicado",
};

function formatBytes(value: number) {
  const bytes = Math.max(0, Number(value || 0));
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let current = bytes / 1024;
  let unitIndex = 0;
  while (current >= 1024 && unitIndex < units.length - 1) {
    current /= 1024;
    unitIndex += 1;
  }
  const precision = current >= 10 ? 0 : 1;
  return `${current.toFixed(precision).replace(".", ",")} ${units[unitIndex]}`;
}

function UsageBar({ used, limit }: { used: number; limit: number }) {
  const percent = limit > 0 ? Math.min(100, Math.max(0, (used / limit) * 100)) : 0;
  return <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
    <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${percent}%` }} />
  </div>;
}

function UsageMetric({
  label,
  used,
  limit,
  icon: Icon,
  formatter = value => String(Math.round(value)),
}: {
  label: string;
  used: number;
  limit: number;
  icon: typeof Users;
  formatter?: (value: number) => string;
}) {
  return <AdminCard square>
    <AdminCardContent className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.11em] text-muted-foreground">{label}</p>
          <p className="mt-2 text-lg font-black text-foreground">
            {formatter(used)} <span className="text-xs font-semibold text-muted-foreground">de {formatter(limit)}</span>
          </p>
        </div>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
          <Icon size={17} />
        </span>
      </div>
      <UsageBar used={used} limit={limit} />
    </AdminCardContent>
  </AdminCard>;
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-4 py-3">
    <span className="text-muted-foreground">{label}</span>
    <strong className="text-right text-foreground">{value}</strong>
  </div>;
}

export function PlanUsagePage() {
  const { activeOrganizationId } = useAuth();
  const query = useQuery({
    queryKey: ["organization-plan-usage", activeOrganizationId],
    queryFn: () => loadOrganizationPlanUsage(activeOrganizationId || ""),
    enabled: Boolean(activeOrganizationId),
  });

  if (!activeOrganizationId) {
    return <AdminCard><AdminCardContent className="p-6 text-sm text-muted-foreground">Selecione uma empresa para visualizar o plano.</AdminCardContent></AdminCard>;
  }

  if (query.isPending) return <LoadingState text="Carregando plano e uso..." />;

  if (query.isError || !query.data) {
    return <AdminCard><AdminCardContent className="p-6">
      <p className="font-bold text-foreground">Não foi possível carregar o plano.</p>
      <p className="mt-1 text-sm text-muted-foreground">{systemErrorMessage(query.error)}</p>
    </AdminCardContent></AdminCard>;
  }

  const data = query.data;
  const subscription = data.subscription;
  const limits = data.limits;
  const usage = data.usage;

  return <div className="min-w-0 space-y-4">
    <PageHeader
      title="Plano e uso"
      subtitle="Acompanhe a assinatura e o consumo medido da empresa. Os limites ainda são apenas informativos."
    />

    {!subscription ? <AdminCard square>
      <AdminCardContent className="p-5">
        <p className="font-black text-foreground">Assinatura ainda não configurada</p>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          A Union ainda não vinculou um plano a esta empresa. Nenhuma limitação de uso é aplicada.
        </p>
      </AdminCardContent>
    </AdminCard> : <>
      <AdminCard square>
        <AdminCardContent className="p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-soft text-primary"><CreditCard size={17} /></span>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.11em] text-muted-foreground">Plano atual</p>
                  <h2 className="text-xl font-black text-foreground">{subscription.plan_name}</h2>
                </div>
              </div>
              <p className="mt-3 text-sm text-muted-foreground">
                {statusLabels[subscription.status] || subscription.status}
                {subscription.next_due_date ? ` · Próximo vencimento ${formatDateOnly(subscription.next_due_date, "—")}` : ""}
              </p>
            </div>
            <div className="md:text-right">
              <p className="text-[10px] font-black uppercase tracking-[0.11em] text-muted-foreground">Mensalidade</p>
              <p className="mt-1 text-2xl font-black text-foreground">{formatCurrency(subscription.net_amount)}</p>
            </div>
          </div>
        </AdminCardContent>
      </AdminCard>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <UsageMetric label="Usuários ativos" used={usage.users || 0} limit={limits.users || 0} icon={Users} />
        <UsageMetric label="Armazenamento real" used={usage.storage_bytes || 0} limit={limits.storage_bytes || 0} icon={HardDrive} formatter={formatBytes} />
        <UsageMetric label="Dispositivos de campo" used={usage.field_devices || 0} limit={limits.field_devices || 0} icon={MapPinned} />
        <UsageMetric label="Maior OS em fotos" used={usage.max_os_photos || 0} limit={limits.os_photos_per_order || 0} icon={FileImage} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <AdminCard square>
          <AdminCardContent className="p-5">
            <div className="flex items-center gap-2">
              <FileImage size={17} className="text-primary" />
              <h3 className="text-sm font-black text-foreground">Consumo de arquivos</h3>
            </div>
            <div className="mt-4 divide-y divide-border text-sm">
              <Row label="Objetos físicos no Storage" value={(usage.storage_files || 0).toLocaleString("pt-BR")} />
              <Row label="Fotos vinculadas às OS" value={(usage.os_photos_total || 0).toLocaleString("pt-BR")} />
              <Row label="Maior quantidade de fotos em uma OS" value={`${usage.max_os_photos || 0} / ${limits.os_photos_per_order || 0}`} />
              <Row label="Anexos vinculados às OS" value={(usage.os_attachments_total || 0).toLocaleString("pt-BR")} />
              <Row label="Maior quantidade de anexos em uma OS" value={`${usage.max_os_attachments || 0} / ${limits.os_attachments_per_order || 0}`} />
              <Row label="Fotos vinculadas a produtos" value={(usage.product_photos_total || 0).toLocaleString("pt-BR")} />
              <Row label="Maior quantidade de fotos em um produto" value={`${usage.max_product_photos || 0} / ${limits.product_photos || 0}`} />
              <Row label="Anexos financeiros" value={(usage.financial_attachments || 0).toLocaleString("pt-BR")} />
              <Row label="Documentos assinados armazenados" value={(usage.signed_documents || 0).toLocaleString("pt-BR")} />
              <Row label="Retenção contratada da auditoria" value={`${limits.audit_retention_days || 0} dias`} />
            </div>
          </AdminCardContent>
        </AdminCard>

        <AdminCard square>
          <AdminCardContent className="p-5">
            <div className="flex items-center gap-2">
              <Boxes size={17} className="text-primary" />
              <h3 className="text-sm font-black text-foreground">Medição do consumo</h3>
            </div>
            <div className="mt-4 divide-y divide-border text-sm">
              {[
                ["Usuários", data.usage_sources.users],
                ["Armazenamento", data.usage_sources.storage_bytes],
                ["Mapa de Campo", data.usage_sources.field_devices],
                ["PDV", data.usage_sources.pdv_terminals],
                ["Union Senhas", data.usage_sources.queue_units],
                ["PABX", data.usage_sources.pbx_extensions],
                ["IA", data.usage_sources.ai_credits],
              ].map(([label, source]) => <Row
                key={String(label)}
                label={String(label)}
                value={source === "measured"
                  ? "Medido automaticamente"
                  : source === "manual"
                    ? "Contador manual"
                    : source === "configured"
                      ? "Contratual"
                      : "Ainda não mensurável"}
              />)}
            </div>
            <p className="mt-4 text-xs leading-5 text-muted-foreground">
              Valores ainda não mensuráveis não são tratados como zero consumo e não geram bloqueio.
            </p>
          </AdminCardContent>
        </AdminCard>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <AdminCard square>
          <AdminCardContent className="p-5">
            <div className="flex items-center gap-2">
              <Boxes size={17} className="text-primary" />
              <h3 className="text-sm font-black text-foreground">Módulos incluídos</h3>
            </div>
            {data.modules.length ? <div className="mt-4 flex flex-wrap gap-2">
              {data.modules.map(module => <span key={module.key + module.source} className="border border-border bg-muted/30 px-2.5 py-1.5 text-xs font-bold text-foreground">{module.name}</span>)}
            </div> : <p className="mt-4 text-sm text-muted-foreground">Nenhum módulo comercial foi configurado para este plano ainda.</p>}
          </AdminCardContent>
        </AdminCard>

        <AdminCard square>
          <AdminCardContent className="p-5">
            <div className="flex items-center gap-2">
              <Boxes size={17} className="text-primary" />
              <h3 className="text-sm font-black text-foreground">Recursos do contrato</h3>
            </div>
            {Object.keys(data.features).length ? <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {Object.entries(data.features).map(([key, enabled]) => <div key={key} className="flex items-center justify-between gap-3 border border-border px-3 py-2 text-xs">
                <span className="font-semibold text-foreground">{featureLabels[key] || key.replace(/_/g, " ")}</span>
                <span className={enabled ? "font-black text-emerald-600" : "font-bold text-muted-foreground"}>{enabled ? "Incluído" : "Não incluído"}</span>
              </div>)}
            </div> : <p className="mt-4 text-sm text-muted-foreground">Nenhum recurso comercial foi configurado para este plano ainda.</p>}
          </AdminCardContent>
        </AdminCard>
      </div>

      <AdminCard square>
        <AdminCardContent className="p-5">
          <div className="flex items-center gap-2">
            <Boxes size={17} className="text-primary" />
            <h3 className="text-sm font-black text-foreground">Módulos adicionais</h3>
          </div>
          {data.addons.length ? <div className="mt-4 divide-y divide-border">
            {data.addons.map(addon => <div key={addon.id} className="flex items-start justify-between gap-4 py-3">
              <div className="min-w-0">
                <p className="font-bold text-foreground">{addon.name}</p>
                {addon.description && <p className="mt-0.5 text-xs leading-5 text-muted-foreground">{addon.description}</p>}
              </div>
              <span className="shrink-0 text-sm font-black text-foreground">{formatCurrency(addon.amount)}</span>
            </div>)}
          </div> : <p className="mt-4 text-sm leading-6 text-muted-foreground">Nenhum módulo adicional está contratado nesta assinatura.</p>}
        </AdminCardContent>
      </AdminCard>
    </>}
  </div>;
}
