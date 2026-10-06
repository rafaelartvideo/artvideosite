import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clipboard, RefreshCw, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth";
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
  rotateSacDigitalWebhookToken,
  sacDigitalWebhookUrl,
  saveSacDigitalIntegrationSettings,
  testSacDigitalConnection,
  type SacDigitalIntegrationSettings,
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
  const [settings, setSettings] = useState<SacDigitalIntegrationSettings | null>(null);
  const [form, setForm] = useState({
    enabled: false,
    workspace_name: "",
    api_base_url: SAC_API_BASE_URL,
    client_id: "",
    client_secret: "",
  });
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  const webhookUrl = useMemo(
    () => sacDigitalWebhookUrl(settings?.webhook_token),
    [settings?.webhook_token],
  );

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
      </div>
    </Section>

    <AdminStickyToolbar>
      <BtnSecondary onClick={onBack} disabled={saving}>Voltar</BtnSecondary>
      <BtnPrimary onClick={save} loading={saving} loadingText="Salvando...">
        Salvar configuração
      </BtnPrimary>
    </AdminStickyToolbar>
  </div>;
}
