import { SacDigitalMenuConfiguration } from './SacDigitalMenuSettings';
import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clipboard, MessageCircle, MessageSquare, Phone, RefreshCw, ShieldCheck, UsersRound } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { LoadingState } from "@/shared/ui/admin/AdminFeedback";
import {
  AdminButton,
  AdminStickyToolbar,
  BtnPrimary,
  BtnSecondary,
  PageHeader,
  Section,
} from "@/shared/ui/admin/AdminLayout";
import { FInput, FToggle } from "@/shared/ui/admin/AdminFormControls";
import {
  getSacDigitalIntegrationSettings,
  getSacDigitalOperatorBindingsAdmin,
  rotateSacDigitalWebhookToken,
  retrySacDigitalWebhookEvent,
  sacDigitalWebhookUrl,
  saveSacDigitalIntegrationSettings,
  setSacDigitalOperatorBindingAdmin,
  testSacDigitalConnection,
  type SacDigitalIntegrationSettings,
  type SacDigitalOperatorAdminData,
} from "../infrastructure/sac-digital.repository";

const SAC_API_BASE_URL = "https://api.sac.digital/v2/client";

const statusLabel: Record<string, string> = {
  not_configured: "Não configurado",
  configured: "Configurado",
  receiving: "Recebendo eventos",
  error: "Com erro",
};

function formatDate(value?: string | null) {
  if (!value) return "Ainda não recebido";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Data indisponível" : date.toLocaleString("pt-BR");
}

export function SacDigitalSettingsPage({ onBack }: { onBack: () => void }) {
  const { activeOrganizationId, hasPermission } = useAuth();
  const canManage = hasPermission("sac_digital.settings.manage");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [operatorLoading, setOperatorLoading] = useState(false);
  const [bindingSavingUserId, setBindingSavingUserId] = useState<string | null>(null);
  const [operatorData, setOperatorData] = useState<SacDigitalOperatorAdminData | null>(null);
  const [settings, setSettings] = useState<SacDigitalIntegrationSettings | null>(null);
  const [form, setForm] = useState({
    enabled: false,
    workspace_name: "",
    api_base_url: SAC_API_BASE_URL,
    client_id: "",
    client_secret: "",
  });
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [webhookHealth, setWebhookHealth] = useState<{
    pending: number;
    failed: number;
    recent: Array<{
      id: number;
      event_type: string;
      received_at: string;
      processed_at: string | null;
      processing_error: string | null;
    }>;
  } | null>(null);
  const [webhookHealthLoading, setWebhookHealthLoading] = useState(false);
  const [webhookHealthError, setWebhookHealthError] = useState("");
  const [retryingWebhookId, setRetryingWebhookId] = useState<number | null>(null);

  const webhookUrl = useMemo(
    () => sacDigitalWebhookUrl(settings?.webhook_token),
    [settings?.webhook_token],
  );

  const loadWebhookHealth = useCallback(async () => {
    if (!activeOrganizationId || !canManage) {
      setWebhookHealth(null);
      return;
    }
    setWebhookHealthLoading(true);
    setWebhookHealthError("");
    try {
      // Somente metadados: nunca consultar o JSON bruto do webhook na interface.
      const [recent, pending, failed] = await Promise.all([
        supabase.from("sac_digital_webhook_events")
          .select("id,event_type,received_at,processed_at,processing_error")
          .eq("organization_id", activeOrganizationId)
          .order("received_at", { ascending: false })
          .limit(10),
        supabase.from("sac_digital_webhook_events")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", activeOrganizationId)
          .is("processed_at", null)
          .is("processing_error", null),
        supabase.from("sac_digital_webhook_events")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", activeOrganizationId)
          .not("processing_error", "is", null),
      ]);
      if (recent.error || pending.error || failed.error) {
        throw recent.error || pending.error || failed.error;
      }
      setWebhookHealth({
        pending: Number(pending.count || 0),
        failed: Number(failed.count || 0),
        recent: (recent.data || []) as Array<{
          id: number;
          event_type: string;
          received_at: string;
          processed_at: string | null;
          processing_error: string | null;
        }>,
      });
    } catch (error) {
      setWebhookHealthError(systemErrorMessage(error, "Não foi possível consultar os últimos eventos do webhook."));
    } finally {
      setWebhookHealthLoading(false);
    }
  }, [activeOrganizationId, canManage]);

  useEffect(() => {
    void loadWebhookHealth();
  }, [loadWebhookHealth]);

  const retryWebhookEvent = async (eventId: number) => {
    if (!activeOrganizationId || !canManage || retryingWebhookId !== null) return;
    setRetryingWebhookId(eventId);
    setMessage(null);
    try {
      const result = await retrySacDigitalWebhookEvent(activeOrganizationId, eventId);
      await loadWebhookHealth();
      const updated = await getSacDigitalIntegrationSettings(activeOrganizationId);
      setSettings(updated);
      setMessage({
        text: result.already_processed
          ? "Este evento já estava processado."
          : "Evento reprocessado. As mensagens e os protocolos foram atualizados sem duplicação.",
      });
    } catch (error) {
      setMessage({
        text: systemErrorMessage(error, "Não foi possível reprocessar este evento."),
        error: true,
      });
      await loadWebhookHealth();
    } finally {
      setRetryingWebhookId(null);
    }
  };

  const load = async () => {
    if (!activeOrganizationId || !canManage) return;
    setLoading(true);
    setMessage(null);
    try {
      const next = await getSacDigitalIntegrationSettings(activeOrganizationId);
      setSettings(next);
      setForm({
        enabled: next.enabled,
        workspace_name: next.workspace_name || "",
        api_base_url: SAC_API_BASE_URL,
        client_id: next.client_id || "",
        client_secret: "",
      });
    } catch (error) {
      setMessage({
        text: systemErrorMessage(error, "Não foi possível carregar a configuração do SAC Digital."),
        error: true,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [activeOrganizationId, canManage]);

  const loadOperatorBindings = async () => {
    if (
      !activeOrganizationId
      || !canManage
      || !settings?.enabled
      || !settings?.credential_configured
    ) {
      setOperatorData(null);
      return;
    }

    setOperatorLoading(true);
    try {
      const data = await getSacDigitalOperatorBindingsAdmin(activeOrganizationId);
      setOperatorData(data);
    } catch (error) {
      setOperatorData(null);
      setMessage({
        text: systemErrorMessage(error, "Não foi possível carregar os vínculos de operadores do SAC Digital."),
        error: true,
      });
    } finally {
      setOperatorLoading(false);
    }
  };

  useEffect(() => {
    void loadOperatorBindings();
  }, [
    activeOrganizationId,
    canManage,
    settings?.credential_configured,
    settings?.enabled,
  ]);

  const saveOperatorBinding = async (userId: string, operatorId: string) => {
    if (!activeOrganizationId || !canManage || bindingSavingUserId) return;
    setBindingSavingUserId(userId);
    setMessage(null);
    try {
      await setSacDigitalOperatorBindingAdmin(activeOrganizationId, userId, operatorId);
      const data = await getSacDigitalOperatorBindingsAdmin(activeOrganizationId);
      setOperatorData(data);
      setMessage({
        text: operatorId
          ? "Operador SAC vinculado ao funcionário."
          : "Vínculo do operador SAC removido.",
      });
    } catch (error) {
      setMessage({
        text: systemErrorMessage(error, "Não foi possível alterar o vínculo do operador SAC."),
        error: true,
      });
    } finally {
      setBindingSavingUserId(null);
    }
  };


  const save = async () => {
    if (!activeOrganizationId || !canManage || saving) return;
    setSaving(true);
    setMessage(null);
    try {
      const next = await saveSacDigitalIntegrationSettings(activeOrganizationId, {
        ...form,
        api_base_url: SAC_API_BASE_URL,
      });
      setSettings(next);
      setForm(current => ({
        ...current,
        api_base_url: SAC_API_BASE_URL,
        client_secret: "",
      }));
      setMessage({
        text: form.client_secret.trim()
          ? "Configuração salva e Client Secret protegido no Vault."
          : "Configuração do SAC Digital salva.",
      });
    } catch (error) {
      setMessage({
        text: systemErrorMessage(error, "Não foi possível salvar a configuração do SAC Digital."),
        error: true,
      });
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    if (!activeOrganizationId || !canManage || testingConnection) return;
    setTestingConnection(true);
    setMessage(null);
    try {
      const result = await testSacDigitalConnection(activeOrganizationId);
      const seconds = Number(result.expires_in || 0);
      const days = seconds > 0 ? Math.max(1, Math.round(seconds / 86400)) : null;
      setMessage({
        text: days
          ? `Conexão confirmada com a API SAC Digital. Token válido por aproximadamente ${days} dias.`
          : "Conexão confirmada com a API SAC Digital.",
      });
    } catch (error) {
      setMessage({
        text: systemErrorMessage(error, "Não foi possível autenticar na API SAC Digital."),
        error: true,
      });
    } finally {
      setTestingConnection(false);
    }
  };

  const rotateWebhook = async () => {
    if (!activeOrganizationId || !canManage || rotating) return;
    setRotating(true);
    setMessage(null);
    try {
      const token = await rotateSacDigitalWebhookToken(activeOrganizationId);
      setSettings(current => current ? { ...current, webhook_token: token } : current);
      setMessage({ text: "Novo endereço de webhook gerado. Atualize a URL no painel da SAC Digital." });
    } catch (error) {
      setMessage({
        text: systemErrorMessage(error, "Não foi possível gerar um novo webhook."),
        error: true,
      });
    } finally {
      setRotating(false);
    }
  };

  const copyWebhook = async () => {
    if (!webhookUrl) return;
    await navigator.clipboard.writeText(webhookUrl);
    setMessage({ text: "URL do webhook copiada." });
  };

  if (!canManage) return null;
  if (!activeOrganizationId || loading) return <LoadingState text="Carregando integração..." />;

  return <div className="min-w-0 space-y-5">
    <PageHeader
      title="Integrações"
      subtitle="Configure as conexões externas utilizadas pela empresa ativa."
    />

    <div className="grid gap-3 md:grid-cols-3">
      <div className="rounded-xl border border-primary/30 bg-primary-soft/30 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-soft text-primary">
            <MessageSquare size={20} />
          </div>
          <span className="text-[10px] font-semibold text-primary">
            {settings?.enabled ? "Ativado" : "Disponível"}
          </span>
        </div>
        <p className="mt-3 text-sm font-black text-foreground">SAC Digital</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Mensagens, operadores, protocolos e webhook da empresa ativa.
        </p>
      </div>
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <Phone size={20} />
          </div>
          <span className="text-[10px] font-semibold text-muted-foreground">Integração futura</span>
        </div>
        <p className="mt-3 text-sm font-black text-foreground">PABX</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Configuração dos ramais e telefonia, quando o conector estiver disponível.
        </p>
      </div>
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <MessageCircle size={20} />
          </div>
          <span className="text-[10px] font-semibold text-muted-foreground">Integração futura</span>
        </div>
        <p className="mt-3 text-sm font-black text-foreground">WhatsApp e outros canais</p>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Outras conexões de mensagens serão configuradas individualmente por empresa.
        </p>
      </div>
    </div>

    {message && (
      <div className={`rounded-lg border px-3 py-2 text-sm font-semibold ${message.error
        ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300"
        : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300"}`}>
        {message.text}
      </div>
    )}

    <Section
      title="SAC Digital"
      description="Credenciais, webhook e estado da integração desta empresa."
      actions={
        <AdminButton
          variant="secondary"
          onClick={testConnection}
          loading={testingConnection}
          title="Testar conexão"
          aria-label="Testar conexão"
        >
          <CheckCircle2 size={15} />
          Testar conexão
        </AdminButton>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Integração</p>
            <p className="mt-1 text-sm font-black text-foreground">{settings?.enabled ? "Ativada" : "Desativada"}</p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Credencial</p>
            <p className="mt-1 flex items-center gap-1.5 text-sm font-black text-foreground">
              {settings?.credential_configured && <ShieldCheck size={15} className="text-emerald-600" />}
              {settings?.credential_configured ? "Protegida no Vault" : "Não cadastrada"}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Conexão</p>
            <p className="mt-1 text-sm font-black text-foreground">
              {statusLabel[settings?.connection_status || "not_configured"] || "Não configurado"}
            </p>
            <p className="mt-1 text-[10px] text-muted-foreground">
              Último evento: {formatDate(settings?.last_webhook_at)}
            </p>
          </div>
        </div>

        <FToggle
          label="Ativar integração"
          description="Quando ativada, a Union recebe eventos e permite operações pela conta SAC Digital desta empresa."
          checked={form.enabled}
          disabled={saving}
          onChange={enabled => setForm(current => ({ ...current, enabled }))}
        />

        <div className="grid gap-4 md:grid-cols-2">
          <FInput
            label="Workspace / conta"
            value={form.workspace_name}
            disabled={saving}
            placeholder="Ex.: Artvideo"
            onChange={(event: any) => setForm(current => ({ ...current, workspace_name: event.target.value }))}
          />
          <FInput
            label="Endpoint da API"
            value={SAC_API_BASE_URL}
            disabled
            hint="Endpoint utilizado pela integração Clientes.Online / SAC Digital."
          />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <FInput
            label="Client ID"
            value={form.client_id}
            disabled={saving}
            autoComplete="off"
            placeholder="Cole o client_id gerado pela SAC Digital"
            hint="Identifica a aplicação cadastrada para esta empresa."
            onChange={(event: any) => setForm(current => ({ ...current, client_id: event.target.value }))}
          />
          <FInput
            label="Client Secret"
            type="password"
            autoComplete="new-password"
            value={form.client_secret}
            disabled={saving}
            placeholder={settings?.credential_configured ? "Deixe em branco para manter o secret atual" : "Cole o client_secret gerado pela SAC Digital"}
            hint={settings?.credential_configured
              ? "Já existe um Client Secret protegido. Ele nunca é exibido novamente."
              : "O Client Secret será armazenado criptografado no Supabase Vault."}
            onChange={(event: any) => setForm(current => ({ ...current, client_secret: event.target.value }))}
          />
        </div>

        <div>
          <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
            Webhook da Union
          </label>
          {webhookUrl ? (
            <div className="flex min-w-0 flex-col gap-2 sm:flex-row">
              <input
                readOnly
                value={webhookUrl}
                className="admin-input min-w-0 flex-1 rounded-lg border border-border bg-muted/55 px-3 py-2.5 text-sm text-foreground outline-none"
              />
              <AdminButton variant="secondary" onClick={copyWebhook} title="Copiar webhook" aria-label="Copiar webhook">
                <Clipboard size={16} />
                <span className="hidden sm:inline">Copiar</span>
              </AdminButton>
              <AdminButton
                variant="secondary"
                onClick={rotateWebhook}
                loading={rotating}
                title="Gerar novo webhook"
                aria-label="Gerar novo webhook"
              >
                <RefreshCw size={16} />
                <span className="hidden sm:inline">Gerar novo</span>
              </AdminButton>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Salve a configuração uma vez para gerar o endereço individual desta empresa.
            </p>
          )}
          <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
            Este endereço é exclusivo da empresa ativa e deve ser cadastrado na seção Webhooks da SAC Digital.
          </p>
        </div>

        {settings?.last_event_type && (
          <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300">
            <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
            <span>
              Último evento recebido: <strong>{settings.last_event_type}</strong> em {formatDate(settings.last_webhook_at)}.
            </span>
          </div>
        )}
        {settings?.last_error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-800 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
            <p className="font-black">Último erro registrado na integração</p>
            <p className="mt-1 break-words">{settings.last_error}</p>
          </div>
        )}
      </div>
    </Section>

    <Section
      title="Saúde do webhook"
      description="Diagnóstico da empresa ativa, com contagem de falhas e eventos pendentes. O conteúdo das mensagens não é exibido aqui."
      actions={
        <AdminButton
          variant="secondary"
          onClick={() => void loadWebhookHealth()}
          loading={webhookHealthLoading}
          aria-label="Atualizar diagnóstico do webhook"
        >
          <RefreshCw size={15} /> Atualizar
        </AdminButton>
      }
    >
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-border bg-card px-4 py-3">
            <p className="text-[10px] font-bold text-muted-foreground">Último evento</p>
            <p className="mt-1 text-xs font-black text-foreground">{formatDate(settings?.last_webhook_at)}</p>
          </div>
          <div className="rounded-lg border border-border bg-card px-4 py-3">
            <p className="text-[10px] font-bold text-muted-foreground">Aguardando processamento</p>
            <p className="mt-1 text-lg font-black text-foreground">{webhookHealth?.pending ?? "—"}</p>
          </div>
          <div className="rounded-lg border border-border bg-card px-4 py-3">
            <p className="text-[10px] font-bold text-muted-foreground">Eventos com erro</p>
            <p className={`mt-1 text-lg font-black ${webhookHealth?.failed ? "text-red-600 dark:text-red-300" : "text-foreground"}`}>
              {webhookHealth?.failed ?? "—"}
            </p>
          </div>
        </div>
        {webhookHealthError && (
          <p className="text-xs text-red-600 dark:text-red-300">{webhookHealthError}</p>
        )}
        {webhookHealth?.recent.length ? (
          <div className="max-h-56 overflow-y-auto rounded-lg border border-border">
            {webhookHealth.recent.map(event => (
              <div key={event.id}
                className="flex min-w-0 items-start justify-between gap-3 border-b border-border px-3 py-2.5 last:border-b-0">
                <div className="min-w-0">
                  <p className="truncate text-xs font-bold text-foreground">{event.event_type || "Evento"}</p>
                  <p className="text-[10px] text-muted-foreground">{formatDate(event.received_at)}</p>
                  {event.processing_error && (
                    <p className="mt-1 break-words text-[10px] text-red-600 dark:text-red-300">
                      {event.processing_error}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <span className={`text-[10px] font-bold ${
                    event.processing_error ? "text-red-600 dark:text-red-300"
                      : event.processed_at ? "text-emerald-600 dark:text-emerald-300"
                        : "text-amber-600 dark:text-amber-300"
                  }`}>
                    {event.processing_error ? "Com erro" : event.processed_at ? "Processado" : "Pendente"}
                  </span>
                  {(!event.processed_at || Boolean(event.processing_error)) && (
                    <AdminButton
                      size="sm"
                      variant="secondary"
                      onClick={() => void retryWebhookEvent(event.id)}
                      loading={retryingWebhookId === event.id}
                      disabled={retryingWebhookId !== null}
                    >
                      Reprocessar
                    </AdminButton>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : !webhookHealthLoading && !webhookHealthError ? (
          <p className="text-xs text-muted-foreground">Ainda não há eventos de webhook registrados.</p>
        ) : null}
        <p className="text-[10px] leading-5 text-muted-foreground">
          O JSON bruto de eventos processados com sucesso é esvaziado após 45 dias.
          Hashes, status e histórico de conversas permanecem preservados.
        </p>
      </div>
    </Section>

    {canManage && activeOrganizationId && <SacDigitalMenuConfiguration organizationId={activeOrganizationId} token={settings?.webhook_token} />}

    <Section
      title="Operadores e funcionários"
      description="O gestor define qual operador da SAC Digital corresponde a cada usuário da Union."
      actions={
        settings?.enabled && settings?.credential_configured ? (
          <AdminButton
            variant="secondary"
            onClick={() => void loadOperatorBindings()}
            loading={operatorLoading}
            title="Recarregar operadores"
            aria-label="Recarregar operadores"
          >
            <RefreshCw size={15} />
            Recarregar
          </AdminButton>
        ) : undefined
      }
    >
      {!settings?.enabled || !settings?.credential_configured ? (
        <div className="rounded-lg border border-border bg-muted/25 px-4 py-3 text-sm text-muted-foreground">
          Ative a integração e configure as credenciais para vincular funcionários aos operadores da SAC Digital.
        </div>
      ) : operatorLoading && !operatorData ? (
        <LoadingState text="Carregando operadores e funcionários..." />
      ) : !operatorData?.employees.length ? (
        <div className="rounded-lg border border-border bg-muted/25 px-4 py-3 text-sm text-muted-foreground">
          Nenhum funcionário ativo foi encontrado nesta empresa.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          <div className="hidden grid-cols-[minmax(0,1fr)_minmax(260px,0.9fr)] gap-4 border-b border-border bg-muted/35 px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-muted-foreground md:grid">
            <span>Funcionário Union</span>
            <span>Operador SAC Digital</span>
          </div>
          <div className="divide-y divide-border">
            {operatorData.employees.map(employee => {
              const selectedOperatorId = employee.operator?.id || "";
              const usedByOther = new Map(
                operatorData.employees
                  .filter(item => item.user_id !== employee.user_id && item.operator?.id)
                  .map(item => [item.operator!.id, item.full_name]),
              );

              return (
                <div
                  key={employee.user_id}
                  className="grid gap-3 bg-card px-4 py-3 md:grid-cols-[minmax(0,1fr)_minmax(260px,0.9fr)] md:items-center md:gap-4"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
                      <UsersRound size={16} />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-black text-foreground">
                        {employee.full_name}
                        {employee.is_owner ? " · Proprietário" : ""}
                      </p>
                      {employee.email && (
                        <p className="truncate text-[10px] text-muted-foreground">{employee.email}</p>
                      )}
                    </div>
                  </div>

                  <select
                    value={selectedOperatorId}
                    disabled={bindingSavingUserId === employee.user_id}
                    onChange={event => void saveOperatorBinding(employee.user_id, event.target.value)}
                    className="admin-input h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground"
                    aria-label={`Operador SAC de ${employee.full_name}`}
                  >
                    <option value="">Não vinculado</option>
                    {operatorData.operators.map(operator => {
                      const usedBy = usedByOther.get(operator.id);
                      return (
                        <option
                          key={operator.id}
                          value={operator.id}
                          disabled={Boolean(usedBy)}
                        >
                          {operator.name}
                          {operator.online ? " — online" : ""}
                          {usedBy ? ` — vinculado a ${usedBy}` : ""}
                        </option>
                      );
                    })}
                  </select>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">
        O botão “Assumir” usa este vínculo. Um operador SAC só pode ficar associado a um funcionário da Union por empresa.
      </p>
    </Section>

    <AdminStickyToolbar>
      <BtnSecondary onClick={onBack} disabled={saving}>Voltar</BtnSecondary>
      <BtnPrimary onClick={save} loading={saving} loadingText="Salvando...">
        Salvar configuração
      </BtnPrimary>
    </AdminStickyToolbar>
  </div>;
}
