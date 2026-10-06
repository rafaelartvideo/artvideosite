import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FileText,
  Image as ImageIcon,
  MapPin,
  MessageCircle,
  RefreshCw,
  Send,
  Settings,
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
  BtnSecondary,
  PageHeader,
  Section,
} from "@/shared/ui/admin/AdminLayout";
import {
  getSacDigitalIntegrationStatus,
  listSacDigitalMessages,
  listSacDigitalProtocols,
  refreshSacDigitalProtocol,
  sacDigitalMediaUrl,
  sendSacDigitalTextMessage,
  type SacDigitalIntegrationStatus,
  type SacDigitalMessage,
  type SacDigitalProtocolListItem,
} from "../infrastructure/sac-digital.repository";

const protocolStatusLabel: Record<string, string> = {
  open: "Aberto",
  in_att: "Em atendimento",
  inbox: "Recado",
  finished: "Finalizado",
};

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

function deliveryStatus(message: SacDigitalMessage) {
  if (message.direction !== "outgoing") return "";
  const raw = message.raw_metadata || {};
  const historyStatus = String(raw?.sac_history?.status?.status || "").toLowerCase();
  const labels: Record<string, string> = {
    read: "Lida",
    delivered: "Entregue",
    sent: "Enviada",
    failed: "Falhou",
    deleted: "Excluída",
  };
  if (labels[historyStatus]) return labels[historyStatus];
  return raw?.sent_via_union || raw?.recovered_from_sac_history ? "Enviada" : "";
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

export function SacDigitalToolPage({
  onBack,
  onOpenSettings,
}: {
  onBack: () => void;
  onOpenSettings?: () => void;
}) {
  const { activeOrganizationId, hasPermission } = useAuth();
  const canManage = hasPermission("sac_digital.settings.manage");
  const canViewMessages = hasPermission("sac_digital.messages.view");
  const canSendMessages = hasPermission("sac_digital.messages.send");

  const [loading, setLoading] = useState(true);
  const [inboxLoading, setInboxLoading] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [refreshingProtocol, setRefreshingProtocol] = useState(false);
  const [sending, setSending] = useState(false);

  const [status, setStatus] = useState<SacDigitalIntegrationStatus | null>(null);
  const [protocols, setProtocols] = useState<SacDigitalProtocolListItem[]>([]);
  const [selectedProtocolId, setSelectedProtocolId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SacDigitalMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const messagesScrollRef = useRef<HTMLDivElement | null>(null);
  const syncedProtocolsRef = useRef(new Set<string>());

  const selectedProtocol = useMemo(
    () => protocols.find(protocol => protocol.id === selectedProtocolId) || null,
    [protocols, selectedProtocolId],
  );

  const loadStatus = useCallback(async () => {
    if (!activeOrganizationId) return;
    try {
      const next = await getSacDigitalIntegrationStatus(activeOrganizationId);
      setStatus(next);
    } catch (error) {
      setMessage({
        text: systemErrorMessage(error, "Não foi possível verificar o estado da integração SAC Digital."),
        error: true,
      });
    }
  }, [activeOrganizationId]);

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
    let alive = true;
    const start = async () => {
      setLoading(true);
      await Promise.all([loadStatus(), loadProtocols(true)]);
      if (alive) setLoading(false);
    };
    void start();
    return () => {
      alive = false;
    };
  }, [loadProtocols, loadStatus]);

  useEffect(() => {
    let cancelled = false;

    const openConversation = async () => {
      await loadMessages(selectedProtocolId, true);
      if (
        cancelled
        || !activeOrganizationId
        || !selectedProtocolId
        || !selectedProtocol?.external_protocol_id
      ) return;

      const syncKey = `${activeOrganizationId}:${selectedProtocol.external_protocol_id}`;
      if (syncedProtocolsRef.current.has(syncKey)) return;
      syncedProtocolsRef.current.add(syncKey);

      try {
        await refreshSacDigitalProtocol(
          activeOrganizationId,
          selectedProtocol.external_protocol_id,
        );
        if (cancelled) return;
        await Promise.all([
          loadMessages(selectedProtocolId, false),
          loadProtocols(false),
        ]);
      } catch {
        syncedProtocolsRef.current.delete(syncKey);
      }
    };

    void openConversation();
    return () => {
      cancelled = true;
    };
  }, [
    activeOrganizationId,
    loadMessages,
    loadProtocols,
    selectedProtocol?.external_protocol_id,
    selectedProtocolId,
  ]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const container = messagesScrollRef.current;
      if (container) container.scrollTop = container.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [messages.length, selectedProtocolId]);

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

  const refreshProtocol = async () => {
    if (!activeOrganizationId || !selectedProtocol || refreshingProtocol) return;
    setRefreshingProtocol(true);
    setMessage(null);
    try {
      const result = await refreshSacDigitalProtocol(
        activeOrganizationId,
        selectedProtocol.external_protocol_id,
      );
      await Promise.all([
        loadProtocols(false),
        loadMessages(selectedProtocol.id, false),
      ]);
      const imported = Number(result.history_imported || 0);
      setMessage({
        text: imported > 0
          ? `Atendimento sincronizado. ${imported} mensagem(ns) do histórico foram adicionadas à Union.`
          : result.customer_linked === true
            ? "Atendimento sincronizado e vinculado ao cliente cadastrado na Union."
            : result.contact_found === true
              ? "Atendimento sincronizado. O contato foi localizado na SAC, mas ainda não corresponde a um cliente cadastrado na Union."
              : "Atendimento sincronizado com a SAC Digital.",
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

  if (!activeOrganizationId || loading) return <LoadingState text="Carregando SAC Digital..." />;

  return <div className="min-w-0 space-y-5">
    <PageHeader
      title="SAC Digital"
      subtitle="Atenda e responda as conversas da empresa ativa sem sair da Union."
    />

    {message && (
      <div className={`rounded-lg border px-3 py-2 text-sm font-semibold ${message.error
        ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300"
        : "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300"}`}>
        {message.text}
      </div>
    )}

    {!status?.enabled && (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300">
        A integração SAC Digital está desativada. As conversas salvas continuam visíveis, mas novos envios ficam bloqueados.
      </div>
    )}

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
        <div className="grid h-[680px] min-h-0 grid-rows-[220px_minmax(0,1fr)] overflow-hidden md:h-[560px] md:grid-cols-[300px_minmax(0,1fr)] md:grid-rows-1">
          <div className="min-h-0 min-w-0 overflow-hidden border-b border-border md:border-b-0 md:border-r">
            <div className="h-full min-h-0 overflow-y-auto overscroll-contain">
              {protocols.map(protocol => {
                const selected = protocol.id === selectedProtocolId;
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
                      <p className="truncate text-sm font-black text-foreground">{protocolDisplayName(protocol)}</p>
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

          <div className="flex min-h-0 min-w-0 flex-col overflow-hidden">
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

                <div ref={messagesScrollRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-muted/20 px-4 py-4">
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
                            {(() => {
                              const mediaUrl = sacDigitalMediaUrl(item.media_url);
                              return <div className="space-y-2">
                                {mediaUrl && item.message_type === "image" && (
                                  <a href={mediaUrl} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg">
                                    <img
                                      src={mediaUrl}
                                      alt="Imagem recebida no SAC Digital"
                                      loading="lazy"
                                      className="max-h-80 w-auto max-w-full rounded-lg object-contain"
                                    />
                                  </a>
                                )}
                                {mediaUrl && item.message_type === "video" && (
                                  <video
                                    src={mediaUrl}
                                    controls
                                    preload="metadata"
                                    className="max-h-80 w-full rounded-lg"
                                  />
                                )}
                                {mediaUrl && item.message_type === "audio" && (
                                  <audio
                                    src={mediaUrl}
                                    controls
                                    preload="metadata"
                                    className="w-full min-w-[240px] max-w-full"
                                  />
                                )}
                                {mediaUrl && item.message_type === "file" && (
                                  <a
                                    href={mediaUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold underline-offset-2 hover:underline ${outgoing
                                      ? "border-primary-foreground/25 text-primary-foreground"
                                      : "border-border text-foreground"}`}
                                  >
                                    <FileText size={16} className="shrink-0" />
                                    Abrir arquivo
                                  </a>
                                )}
                                {item.body_text && (
                                  <p className="whitespace-pre-wrap break-words text-sm leading-5">{item.body_text}</p>
                                )}
                                {!item.body_text && !mediaUrl && (
                                  <div className="flex items-center gap-2 text-sm font-semibold">
                                    <KindIcon size={16} className="shrink-0" />
                                    <span>{kind.label}</span>
                                  </div>
                                )}
                              </div>;
                            })()}
                            <div className={`mt-1.5 flex items-center justify-end gap-2 text-[9px] ${outgoing
                              ? "text-primary-foreground/70"
                              : "text-muted-foreground"}`}>
                              {outgoing && item.sender_name && <span>{item.sender_name}</span>}
                              {outgoing && deliveryStatus(item) && <span>{deliveryStatus(item)}</span>}
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
                        placeholder={status?.enabled ? "Digite uma mensagem..." : "Integração desativada"}
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
              <div className="flex h-full min-h-0 items-center justify-center p-6 text-center text-sm text-muted-foreground">
                Selecione um atendimento para visualizar as mensagens.
              </div>
            )}
          </div>
        </div>
      )}
    </Section>

    <AdminStickyToolbar>
      <BtnSecondary onClick={onBack}>Voltar para Ferramentas</BtnSecondary>
      {canManage && onOpenSettings && (
        <AdminButton variant="secondary" onClick={onOpenSettings}>
          <Settings size={15} />
          Configurações
        </AdminButton>
      )}
    </AdminStickyToolbar>
  </div>;
}
