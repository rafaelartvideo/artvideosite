import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Clipboard,
  FileText,
  Image as ImageIcon,
  MapPin,
  MessageCircle,
  RefreshCw,
  Send,
  ShieldCheck,
  UserRound,
  Volume2,
} from "lucide-react";
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
  getSacDigitalIntegrationStatus,
  listSacDigitalMessages,
  listSacDigitalProtocols,
  refreshSacDigitalProtocol,
  rotateSacDigitalWebhookToken,
  sacDigitalWebhookUrl,
  saveSacDigitalIntegrationSettings,
  sendSacDigitalTextMessage,
  testSacDigitalConnection,
  type SacDigitalIntegrationSettings,
  type SacDigitalIntegrationStatus,
  type SacDigitalMessage,
  type SacDigitalProtocolListItem,
} from "../infrastructure/sac-digital.repository";

const SAC_API_BASE_URL = "https://api.sac.digital/v2/client";

const statusLabel: Record<string, string> = {
  not_configured: "Não configurado",
  configured: "Configurado",
  receiving: "Recebendo eventos",
  error: "Com erro",
};

const protocolStatusLabel: Record<string, string> = {
  open: "Aberto",
  in_att: "Em atendimento",
  inbox: "Recado",
  finished: "Finalizado",
};

function formatDate(value?: string | null) {
  if (!value) return "Ainda não recebido";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Data indisponível" : date.toLocaleString("pt-BR");
}

function formatCompactDate(value?: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatPhone(value?: string | null) {
  const digits = String(value || "").replace(/\D/g, "");
  const local = digits.startsWith("55") && (digits.length === 12 || digits.length === 13)
    ? digits.slice(2)
    : digits;
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  return value || "";
}

function protocolDisplayName(protocol: SacDigitalProtocolListItem) {
  return protocol.contact?.customer?.full_name
    || protocol.contact?.name
    || formatPhone(protocol.contact?.phone)
    || `Protocolo ${protocol.external_protocol_id}`;
}

function messageKind(message: SacDigitalMessage) {
  switch (message.message_type) {
    case "audio":
      return { label: "Áudio recebido", Icon: Volume2 };
    case "image":
      return { label: "Imagem recebida", Icon: ImageIcon };
    case "video":
      return { label: "Vídeo recebido", Icon: FileText };
    case "file":
      return { label: "Arquivo recebido", Icon: FileText };
    case "location":
      return { label: "Localização recebida", Icon: MapPin };
    case "vcard":
      return { label: "Contato recebido", Icon: UserRound };
    default:
      return { label: "Mensagem recebida", Icon: MessageCircle };
  }
}

export function SacDigitalToolPage({ onBack }: { onBack: () => void }) {
  const { activeOrganizationId, hasPermission } = useAuth();
  const canManage = hasPermission("sac_digital.settings.manage");
  const canViewMessages = hasPermission("sac_digital.messages.view");
  const canSendMessages = hasPermission("sac_digital.messages.send");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [refreshingProtocol, setRefreshingProtocol] = useState(false);
  const [sending, setSending] = useState(false);
  const [inboxLoading, setInboxLoading] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(false);

  const [status, setStatus] = useState<SacDigitalIntegrationStatus | null>(null);
  const [settings, setSettings] = useState<SacDigitalIntegrationSettings | null>(null);
  const [protocols, setProtocols] = useState<SacDigitalProtocolListItem[]>([]);
  const [selectedProtocolId, setSelectedProtocolId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SacDigitalMessage[]>([]);
  const [draft, setDraft] = useState("");

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

  const selectedProtocol = useMemo(
    () => protocols.find(protocol => protocol.id === selectedProtocolId) || null,
    [protocols, selectedProtocolId],
  );

  const loadIntegration = useCallback(async () => {
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
          api_base_url: SAC_API_BASE_URL,
          client_id: next.client_id || "",
          client_secret: "",
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
  }, [activeOrganizationId, canManage]);

  const loadProtocols = useCallback(async (showLoading = false) => {
    if (!activeOrganizationId || !canViewMessages) {
      setProtocols([]);
      setSelectedProtocolId(null);
      return;
    }
    if (showLoading) setInboxLoading(true);
    try {
      const next = await listSacDigitalProtocols(activeOrganizationId);
      setProtocols(next);
      setSelectedProtocolId(current =>
        current && next.some(protocol => protocol.id === current)
          ? current
          : next[0]?.id || null,
      );
    } catch (error) {
      setMessage({
        text: systemErrorMessage(error, "Não foi possível carregar as conversas do SAC Digital."),
        error: true,
      });
    } finally {
      if (showLoading) setInboxLoading(false);
    }
  }, [activeOrganizationId, canViewMessages]);

  const loadMessages = useCallback(async (protocolId: string | null, showLoading = false) => {
    if (!activeOrganizationId || !canViewMessages || !protocolId) {
      setMessages([]);
      return;
    }
    if (showLoading) setMessagesLoading(true);
    try {
      const next = await listSacDigitalMessages(activeOrganizationId, protocolId);
      setMessages(next);
    } catch (error) {
      setMessage({
        text: systemErrorMessage(error, "Não foi possível carregar as mensagens deste atendimento."),
        error: true,
      });
    } finally {
      if (showLoading) setMessagesLoading(false);
    }
  }, [activeOrganizationId, canViewMessages]);

  useEffect(() => {
    void loadIntegration();
  }, [loadIntegration]);

  useEffect(() => {
    void loadProtocols(true);
  }, [loadProtocols]);

  useEffect(() => {
    void loadMessages(selectedProtocolId, true);
  }, [loadMessages, selectedProtocolId]);

  useEffect(() => {
    if (!activeOrganizationId || !canViewMessages) return;

    const realtime = supabase
      .channel(`sac-digital-inbox:${activeOrganizationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "sac_digital_protocols",
          filter: `organization_id=eq.${activeOrganizationId}`,
        },
        () => {
          void loadProtocols(false);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "sac_digital_messages",
          filter: `organization_id=eq.${activeOrganizationId}`,
        },
        payload => {
          void loadProtocols(false);
          const changedProtocolId = String((payload.new as any)?.protocol_id || (payload.old as any)?.protocol_id || "");
          if (selectedProtocolId && (!changedProtocolId || changedProtocolId === selectedProtocolId)) {
            void loadMessages(selectedProtocolId, false);
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(realtime);
    };
  }, [activeOrganizationId, canViewMessages, loadMessages, loadProtocols, selectedProtocolId]);

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
      setStatus(next);
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
        text: systemErrorMessage(error, "Não foi possível salvar a integração SAC Digital."),
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

  const refreshProtocol = async () => {
    if (!activeOrganizationId || !selectedProtocol || refreshingProtocol) return;
    setRefreshingProtocol(true);
    setMessage(null);
    try {
      const result = await refreshSacDigitalProtocol(
        activeOrganizationId,
        selectedProtocol.external_protocol_id,
      );
      await loadProtocols(false);
      setMessage({
        text: result.customer_linked === true
          ? "Atendimento atualizado e vinculado ao cliente cadastrado na Union."
          : result.contact_found === true
            ? "Atendimento atualizado. O contato foi localizado na SAC, mas ainda não corresponde a um cliente cadastrado na Union."
            : "Atendimento atualizado.",
      });
    } catch (error) {
      setMessage({
        text: systemErrorMessage(error, "Não foi possível atualizar os dados deste atendimento."),
        error: true,
      });
    } finally {
      setRefreshingProtocol(false);
    }
  };

  const sendMessage = async () => {
    if (!activeOrganizationId || !selectedProtocol || !canSendMessages || sending) return;
    const text = draft.trim();
    if (!text) return;

    setSending(true);
    setMessage(null);
    try {
      await sendSacDigitalTextMessage(
        activeOrganizationId,
        selectedProtocol.external_protocol_id,
        text,
      );
      setDraft("");
      await Promise.all([
        loadMessages(selectedProtocol.id, false),
        loadProtocols(false),
      ]);
    } catch (error) {
      setMessage({
        text: systemErrorMessage(error, "Não foi possível enviar a mensagem pela SAC Digital."),
        error: true,
      });
    } finally {
      setSending(false);
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
      description="Protocolos e mensagens recebidos pela conta SAC Digital desta empresa."
      actions={canViewMessages ? (
        <AdminButton
          variant="secondary"
          onClick={() => loadProtocols(true)}
          loading={inboxLoading}
          title="Atualizar conversas"
          aria-label="Atualizar conversas"
        >
          <RefreshCw size={15} />
          Atualizar
        </AdminButton>
      ) : undefined}
      flush
    >
      {!canViewMessages ? (
        <div className="p-5 text-sm text-muted-foreground">
          Sua função não possui permissão para visualizar conversas do SAC Digital.
        </div>
      ) : inboxLoading && protocols.length === 0 ? (
        <div className="p-5"><LoadingState text="Carregando conversas..." /></div>
      ) : protocols.length === 0 ? (
        <div className="flex min-h-44 flex-col items-center justify-center gap-2 p-6 text-center">
          <MessageCircle size={28} className="text-muted-foreground" />
          <p className="text-sm font-black text-foreground">Nenhum atendimento recebido</p>
          <p className="max-w-md text-xs leading-5 text-muted-foreground">
            Quando a SAC Digital enviar um protocolo pelo webhook, ele aparecerá aqui em tempo real.
          </p>
        </div>
      ) : (
        <div className="grid min-h-[520px] md:grid-cols-[300px_minmax(0,1fr)]">
          <div className="min-w-0 border-b border-border md:border-b-0 md:border-r">
            <div className="max-h-[520px] overflow-y-auto">
              {protocols.map(protocol => {
                const selected = protocol.id === selectedProtocolId;
                const displayName = protocolDisplayName(protocol);
                return <button
                  key={protocol.id}
                  type="button"
                  onClick={() => setSelectedProtocolId(protocol.id)}
                  className={`block w-full border-b border-border px-4 py-3 text-left transition-colors last:border-b-0 ${selected
                    ? "bg-primary-soft"
                    : "bg-card hover:bg-muted/60"}`}
                >
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-black text-foreground">{displayName}</p>
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                        {protocol.contact?.phone
                          ? formatPhone(protocol.contact.phone)
                          : `Protocolo ${protocol.external_protocol_id}`}
                      </p>
                    </div>
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      {formatCompactDate(protocol.last_message_at)}
                    </span>
                  </div>
                  <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5">
                    <span className="rounded-md border border-border bg-card px-1.5 py-0.5 text-[9px] font-bold text-muted-foreground">
                      {protocolStatusLabel[protocol.status] || protocol.status}
                    </span>
                    {protocol.contact?.customer_id ? (
                      <span className="rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700 dark:text-emerald-300">
                        Cliente CRM
                      </span>
                    ) : protocol.contact ? (
                      <span className="rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold text-amber-700 dark:text-amber-300">
                        Contato SAC
                      </span>
                    ) : null}
                  </div>
                </button>;
              })}
            </div>
          </div>

          <div className="flex min-w-0 flex-col">
            {selectedProtocol ? (
              <>
                <div className="flex min-w-0 items-start justify-between gap-3 border-b border-border px-4 py-3.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-black text-foreground">{protocolDisplayName(selectedProtocol)}</p>
                    <div className="mt-1 flex min-w-0 flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                      <span>Protocolo {selectedProtocol.external_protocol_id}</span>
                      {selectedProtocol.contact?.phone && <span>{formatPhone(selectedProtocol.contact.phone)}</span>}
                      {selectedProtocol.department_name && <span>{selectedProtocol.department_name}</span>}
                      {selectedProtocol.operator_name && <span>{selectedProtocol.operator_name}</span>}
                    </div>
                  </div>
                  <AdminButton
                    variant="secondary"
                    onClick={refreshProtocol}
                    loading={refreshingProtocol}
                    title="Atualizar dados do atendimento"
                    aria-label="Atualizar dados do atendimento"
                  >
                    <RefreshCw size={15} />
                    <span className="hidden sm:inline">Atualizar</span>
                  </AdminButton>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto bg-muted/20 px-4 py-4">
                  {messagesLoading ? <LoadingState text="Carregando mensagens..." /> : messages.length === 0 ? (
                    <div className="flex min-h-64 items-center justify-center text-center text-xs text-muted-foreground">
                      Nenhuma mensagem registrada neste protocolo.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {messages.map(item => {
                        const outgoing = item.direction === "outgoing";
                        const kind = messageKind(item);
                        const KindIcon = kind.Icon;
                        return <div
                          key={item.id}
                          className={`flex ${outgoing ? "justify-end" : "justify-start"}`}
                        >
                          <div className={`max-w-[86%] rounded-xl border px-3 py-2.5 shadow-sm sm:max-w-[72%] ${outgoing
                            ? "border-primary/30 bg-primary text-primary-foreground"
                            : "border-border bg-card text-foreground"}`}>
                            {item.body_text ? (
                              <p className="whitespace-pre-wrap break-words text-sm leading-5">{item.body_text}</p>
                            ) : (
                              <div className="flex items-center gap-2 text-sm font-semibold">
                                <KindIcon size={16} className="shrink-0" />
                                <span>{kind.label}</span>
                              </div>
                            )}
                            <div className={`mt-1.5 flex items-center justify-end gap-2 text-[9px] ${outgoing
                              ? "text-primary-foreground/70"
                              : "text-muted-foreground"}`}>
                              {outgoing && item.sender_name && <span>{item.sender_name}</span>}
                              <span>{formatCompactDate(item.sent_at)}</span>
                            </div>
                          </div>
                        </div>;
                      })}
                    </div>
                  )}
                </div>

                <div className="border-t border-border bg-card p-3">
                  {canSendMessages ? (
                    <form
                      className="flex min-w-0 items-end gap-2"
                      onSubmit={event => {
                        event.preventDefault();
                        void sendMessage();
                      }}
                    >
                      <textarea
                        rows={2}
                        value={draft}
                        disabled={sending || !status?.enabled}
                        placeholder={status?.enabled ? "Digite uma mensagem..." : "Ative a integração para enviar mensagens"}
                        onChange={event => setDraft(event.target.value)}
                        onKeyDown={event => {
                          if (event.key === "Enter" && !event.shiftKey) {
                            event.preventDefault();
                            void sendMessage();
                          }
                        }}
                        className="admin-input min-h-[44px] min-w-0 flex-1 resize-none rounded-lg border border-border bg-muted/55 px-3 py-2.5 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground/65 focus:border-primary focus:bg-card focus:ring-2 focus:ring-primary/25"
                      />
                      <AdminButton
                        type="submit"
                        disabled={!draft.trim() || !status?.enabled}
                        loading={sending}
                        aria-label="Enviar mensagem"
                        title="Enviar mensagem"
                        className="h-[44px] shrink-0 px-3"
                      >
                        <Send size={16} />
                        <span className="hidden sm:inline">Enviar</span>
                      </AdminButton>
                    </form>
                  ) : (
                    <p className="py-2 text-center text-xs text-muted-foreground">
                      Sua função pode visualizar esta conversa, mas não enviar mensagens.
                    </p>
                  )}
                </div>
              </>
            ) : (
              <div className="flex min-h-[520px] items-center justify-center p-6 text-center text-sm text-muted-foreground">
                Selecione um atendimento para visualizar as mensagens.
              </div>
            )}
          </div>
        </div>
      )}
    </Section>

    {canManage && settings && (
      <Section
        title="Configuração da integração"
        description="O Client ID identifica a aplicação. O Client Secret nunca é carregado de volta para o navegador e fica protegido no Supabase Vault."
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
              hint="Endpoint oficial utilizado pela integração Clientes.Online / SAC Digital."
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
              placeholder={settings.credential_configured ? "Deixe em branco para manter o secret atual" : "Cole o client_secret gerado pela SAC Digital"}
              hint={settings.credential_configured
                ? "Já existe um Client Secret protegido. Ele nunca é exibido novamente."
                : "O Client Secret será armazenado criptografado no Supabase Vault."}
              onChange={(event: any) => setForm(current => ({ ...current, client_secret: event.target.value }))}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Webhook da Union</label>
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
              <p className="text-xs text-muted-foreground">Salve a configuração uma vez para gerar o endereço individual desta empresa.</p>
            )}
            <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">
              Este endereço é exclusivo da empresa ativa e deve ser cadastrado na seção Webhooks da SAC Digital.
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
