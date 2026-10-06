import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clipboard, MessageCircle, RefreshCw, ShieldCheck } from "lucide-react";
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
  getSacDigitalIntegrationStatus,
  rotateSacDigitalWebhookToken,
  sacDigitalWebhookUrl,
  saveSacDigitalIntegrationSettings,
  type SacDigitalIntegrationSettings,
  type SacDigitalIntegrationStatus,
} from "../infrastructure/sac-digital.repository";

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

export function SacDigitalToolPage({ onBack }: { onBack: () => void }) {
  const { activeOrganizationId, hasPermission } = useAuth();
  const canManage = hasPermission("sac_digital.settings.manage");
  const canViewMessages = hasPermission("sac_digital.messages.view");
  const canSendMessages = hasPermission("sac_digital.messages.send");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [status, setStatus] = useState<SacDigitalIntegrationStatus | null>(null);
  const [settings, setSettings] = useState<SacDigitalIntegrationSettings | null>(null);
  const [form, setForm] = useState({
    enabled: false,
    workspace_name: "",
    api_base_url: "",
    api_key: "",
  });
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  const webhookUrl = useMemo(
    () => sacDigitalWebhookUrl(settings?.webhook_token),
    [settings?.webhook_token],
  );

  const load = async () => {
    if (!activeOrganizationId) return;
    setLoading(true);
    setMessage(null);
    try {
      if (canManage) {
        const next = await getSacDigitalIntegrationSettings(activeOrganizationId);
        setSettings(next);
        setStatus(next);
        setForm({
          enabled: next.enabled,
          workspace_name: next.workspace_name || "",
          api_base_url: next.api_base_url || "",
          api_key: "",
        });
      } else {
        const next = await getSacDigitalIntegrationStatus(activeOrganizationId);
        setStatus(next);
        setSettings(null);
      }
    } catch (error) {
      setMessage({
        text: systemErrorMessage(error, "Não foi possível carregar a integração SAC Digital."),
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
      const next = await saveSacDigitalIntegrationSettings(activeOrganizationId, form);
      setSettings(next);
      setStatus(next);
      setForm(current => ({ ...current, api_key: "" }));
      setMessage({
        text: form.api_key.trim()
          ? "Configuração salva e credencial protegida no Vault."
          : "Configuração do SAC Digital salva.",
      });
    } catch (error) {
      setMessage({
        text: systemErrorMessage(error, "Não foi possível salvar a integração SAC Digital."),
        error: true,
      });
    } finally {
      setSaving(false);
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

  if (!activeOrganizationId || loading) return <LoadingState text="Carregando SAC Digital..." />;

  return <div className="min-w-0 space-y-5">
    <PageHeader
      title="SAC Digital"
      subtitle="Atendimento integrado por empresa. Cada organização utiliza suas próprias credenciais, canais e webhook."
    />

    {message && (
      <div className={`rounded-lg border px-3 py-2 text-sm font-semibold ${message.error
        ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300"
        : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300"}`}>
        {message.text}
      </div>
    )}

    <div className="grid gap-3 sm:grid-cols-3">
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Integração</p>
        <p className="mt-1 text-sm font-black text-foreground">{status?.enabled ? "Ativada" : "Desativada"}</p>
      </div>
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Credencial</p>
        <p className="mt-1 flex items-center gap-1.5 text-sm font-black text-foreground">
          {status?.credential_configured && <ShieldCheck size={15} className="text-emerald-600" />}
          {status?.credential_configured ? "Protegida no Vault" : "Não cadastrada"}
        </p>
      </div>
      <div className="rounded-xl border border-border bg-card p-4">
        <p className="text-[10px] font-black uppercase tracking-wider text-muted-foreground">Conexão</p>
        <p className="mt-1 text-sm font-black text-foreground">{statusLabel[status?.connection_status || "not_configured"] || "Não configurado"}</p>
        <p className="mt-1 text-[10px] text-muted-foreground">Último evento: {formatDate(status?.last_webhook_at)}</p>
      </div>
    </div>

    <Section
      title="Caixa de entrada"
      description="A estrutura multiempresa já está preparada. A próxima etapa liga os protocolos e mensagens recebidas ao chat da Union."
    >
      <div className="flex items-start gap-3 rounded-xl border border-border bg-muted/35 p-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
          <MessageCircle size={20} />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-black text-foreground">Atendimento dentro da Union</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {canViewMessages
              ? canSendMessages
                ? "Seu acesso já permite visualizar e enviar mensagens. Falta apenas mapear o primeiro payload real da SAC."
                : "Seu acesso permite visualizar conversas, mas não enviar mensagens."
              : "Sua função ainda não possui permissão para visualizar conversas."}
          </p>
        </div>
      </div>
    </Section>

    {canManage && settings && (
      <Section
        title="Configuração da integração"
        description="A API key nunca é carregada de volta para o navegador. Ao salvar uma nova chave, ela substitui a anterior dentro do Supabase Vault."
      >
        <div className="space-y-5">
          <FToggle
            label="Ativar integração"
            description="Só ative depois de cadastrar a credencial e configurar o webhook no painel da SAC Digital."
            checked={form.enabled}
            disabled={saving}
            onChange={enabled => setForm(current => ({ ...current, enabled }))}
          />

          <div className="grid gap-4 md:grid-cols-2">
            <FInput
              label="Workspace / conta"
              value={form.workspace_name}
              disabled={saving}
              placeholder="Ex.: Union CRM"
              onChange={(event: any) => setForm(current => ({ ...current, workspace_name: event.target.value }))}
            />
            <FInput
              label="URL base da API"
              value={form.api_base_url}
              disabled={saving}
              placeholder="Será confirmada com a credencial da conta"
              hint="Pode ficar em branco nesta primeira etapa. Não vamos adivinhar o endpoint antes do teste real."
              onChange={(event: any) => setForm(current => ({ ...current, api_base_url: event.target.value }))}
            />
          </div>

          <FInput
            label="Credencial / API key"
            type="password"
            autoComplete="new-password"
            value={form.api_key}
            disabled={saving}
            placeholder={settings.credential_configured ? "Deixe em branco para manter a credencial atual" : "Cole a credencial gerada no painel da SAC"}
            hint={settings.credential_configured
              ? "Já existe uma credencial protegida. Ela nunca é exibida novamente."
              : "A chave será enviada somente para o banco e armazenada criptografada no Vault."}
            onChange={(event: any) => setForm(current => ({ ...current, api_key: event.target.value }))}
          />

          <div>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Webhook da Union</label>
            {webhookUrl ? (
              <div className="flex min-w-0 gap-2">
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
              <p className="text-xs text-muted-foreground">Salve a configuração uma vez para gerar o endereço individual desta empresa.</p>
            )}
            <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
              Este endereço é exclusivo da empresa ativa. Ele será cadastrado em Webhooks na plataforma SAC Digital.
            </p>
          </div>

          {status?.last_event_type && (
            <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300">
              <CheckCircle2 size={15} className="mt-0.5 shrink-0" />
              <span>Último evento recebido: <strong>{status.last_event_type}</strong> em {formatDate(status.last_webhook_at)}.</span>
            </div>
          )}
        </div>
      </Section>
    )}

    <AdminStickyToolbar>
      <BtnSecondary onClick={onBack}>Voltar para Ferramentas</BtnSecondary>
      {canManage && settings && (
        <BtnPrimary onClick={save} loading={saving} loadingText="Salvando...">
          Salvar configuração
        </BtnPrimary>
      )}
    </AdminStickyToolbar>
  </div>;
}
