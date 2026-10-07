import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  FileText,
  Image as ImageIcon,
  MapPin,
  MessageCircle,
  Paperclip,
  X,
  Search,
  Send,
  Settings,
  UserRound,
  Volume2,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { LoadingState } from "@/shared/ui/admin/AdminFeedback";
import { listCustomers } from "@/features/customers/infrastructure/customers.repository";
import { QuickCustomerModal } from "@/features/orders/presentation/QuickCustomerModal";
import { SacDigitalNewConversationDialog } from "./SacDigitalNewConversationDialog";
import {
  AdminButton,
  BtnSecondary,
  PageHeader,
} from "@/shared/ui/admin/AdminLayout";
import {
  assumeSacDigitalProtocol,
  finishSacDigitalProtocol,
  forwardSacDigitalProtocol,
  getMySacDigitalOperatorBinding,
  getSacDigitalIntegrationStatus,
  getSacDigitalRoutingOptions,
  getSacDigitalUnreadCounts,
  linkSacDigitalCustomer,
  listSacDigitalCustomerOrders,
  listSacDigitalMessages,
  listSacDigitalProtocols,
  markSacDigitalProtocolRead,
  refreshSacDigitalProtocol,
  returnSacDigitalProtocolToInbox,
  sacDigitalMediaUrl,
  sendSacDigitalTextMessage,
  sendSacDigitalMediaMessage,
  type SacDigitalIntegrationStatus,
  type SacDigitalCustomerOrder,
  type SacDigitalMessage,
  type SacDigitalOperatorBinding,
  type SacDigitalProtocolListItem,
  type SacDigitalRoutingOptions,
} from "../infrastructure/sac-digital.repository";

const protocolStatusLabel: Record<string, string> = {
  open: "Aberto",
  in_att: "Em atendimento",
  inbox: "Recado",
  pending: "Aguardando protocolo",
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

function protocolInitials(protocol: SacDigitalProtocolListItem) {
  const name = protocolDisplayName(protocol).trim();
  const parts = name.split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ""}${parts[parts.length - 1][0] || ""}`.toUpperCase();
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
  onOpenCustomer,
  onOpenOrder,
  onCreateOrder,
}: {
  onBack: () => void;
  onOpenSettings?: () => void;
  onOpenCustomer?: (customerId: string) => void;
  onOpenOrder?: (orderId: string) => void;
  onCreateOrder?: (customerId: string) => void;
}) {
  const { activeOrganizationId, hasPermission } = useAuth();
  const canManage = hasPermission("sac_digital.settings.manage");
  const canManageProtocols = hasPermission("sac_digital.protocols.manage");
  const canViewMessages = hasPermission("sac_digital.messages.view");
  const canSendMessages = hasPermission("sac_digital.messages.send");
  const canViewCustomers = hasPermission("customers.view");
  const canCreateCustomers = hasPermission("customers.create");
  const canViewOrders = hasPermission("orders.view");
  const canCreateOrders = hasPermission("orders.create");

  const [loading, setLoading] = useState(true);
  const [inboxLoading, setInboxLoading] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [protocolAction, setProtocolAction] = useState<"routing" | "forward" | "assume" | "inbox" | "finish" | null>(null);
  const [routingOpen, setRoutingOpen] = useState(false);
  const [finishConfirmOpen, setFinishConfirmOpen] = useState(false);
  const [routingOptions, setRoutingOptions] = useState<SacDigitalRoutingOptions | null>(null);
  const [departmentId, setDepartmentId] = useState("");
  const [operatorId, setOperatorId] = useState("");
  const [operatorBinding, setOperatorBinding] = useState<SacDigitalOperatorBinding | null>(null);
  const [customerLinkOpen, setCustomerLinkOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerResults, setCustomerResults] = useState<any[]>([]);
  const [customerSearchLoading, setCustomerSearchLoading] = useState(false);
  const [customerLinkingId, setCustomerLinkingId] = useState<string | null>(null);
  const [quickCustomerOpen, setQuickCustomerOpen] = useState(false);
  const [ordersPanelOpen, setOrdersPanelOpen] = useState(false);
  const [customerOrdersLoading, setCustomerOrdersLoading] = useState(false);
  const [customerOrders, setCustomerOrders] = useState<SacDigitalCustomerOrder[]>([]);
  const [newConversationOpen, setNewConversationOpen] = useState(false);

  const [status, setStatus] = useState<SacDigitalIntegrationStatus | null>(null);
  const [protocols, setProtocols] = useState<SacDigitalProtocolListItem[]>([]);
  const [selectedProtocolId, setSelectedProtocolId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SacDigitalMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [conversationSearch, setConversationSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [operatorFilter, setOperatorFilter] = useState("all");
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const messagesScrollRef = useRef<HTMLDivElement | null>(null);
  const mediaInputRef = useRef<HTMLInputElement | null>(null);
  const sendingRef = useRef(false);
  const activePendingContactIdRef = useRef<string | null>(null);

  const selectedProtocol = useMemo(
    () => protocols.find(protocol => protocol.id === selectedProtocolId) || null,
    [protocols, selectedProtocolId],
  );

  useEffect(() => {
    if (selectedProtocol?.is_pending) {
      activePendingContactIdRef.current = selectedProtocol.contact?.id || null;
    } else if (selectedProtocol) {
      activePendingContactIdRef.current = null;
    }
  }, [selectedProtocol]);

  const operatorFilterOptions = useMemo(
    () => Array.from(new Set(
      protocols
        .map(protocol => protocol.operator_name?.trim() || "")
        .filter(Boolean),
    )).sort((left, right) => left.localeCompare(right, "pt-BR")),
    [protocols],
  );

  const unreadConversationCount = useMemo(
    () => protocols.filter(protocol => Number(unreadCounts[protocol.id] || 0) > 0).length,
    [protocols, unreadCounts],
  );

  const filteredProtocols = useMemo(() => {
    const query = conversationSearch.trim().toLocaleLowerCase("pt-BR");
    return protocols.filter(protocol => {
      const matchesSearch = !query || [
        protocolDisplayName(protocol),
        protocol.contact?.phone || "",
        protocol.external_protocol_id,
        protocol.department_name || "",
        protocol.operator_name || "",
      ].join(" ").toLocaleLowerCase("pt-BR").includes(query);

      const matchesStatus = statusFilter === "all"
        || (statusFilter === "unread" && Number(unreadCounts[protocol.id] || 0) > 0)
        || protocol.status === statusFilter;

      const matchesOperator = operatorFilter === "all"
        || (operatorFilter === "unassigned" && !protocol.operator_name)
        || protocol.operator_name === operatorFilter;

      return matchesSearch && matchesStatus && matchesOperator;
    });
  }, [conversationSearch, operatorFilter, protocols, statusFilter, unreadCounts]);

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
      setSelectedProtocolId(current => {
        if (current && next.some(protocol => protocol.id === current)) return current;
        // A SAC abriu um protocolo: selecionar a conversa real no lugar da pendente.
        if (current?.startsWith("pending:") && activePendingContactIdRef.current) {
          const resolved = next.find(protocol =>
            !protocol.is_pending && protocol.contact?.id === activePendingContactIdRef.current,
          );
          if (resolved) return resolved.id;
        }
        return next[0]?.id || null;
      });
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


  const loadUnreadCounts = useCallback(async () => {
    if (!activeOrganizationId || !canViewMessages) {
      setUnreadCounts({});
      return;
    }
    try {
      const counts = await getSacDigitalUnreadCounts(activeOrganizationId);
      setUnreadCounts(counts);
    } catch {
      // A conversa continua funcional mesmo se o contador falhar temporariamente.
    }
  }, [activeOrganizationId, canViewMessages]);

  useEffect(() => {
    let alive = true;
    const start = async () => {
      setLoading(true);
      await Promise.all([loadStatus(), loadProtocols(true), loadUnreadCounts()]);
      if (alive) setLoading(false);
    };
    void start();
    return () => {
      alive = false;
    };
  }, [loadProtocols, loadStatus, loadUnreadCounts]);

  useEffect(() => {
    let cancelled = false;
    if (!activeOrganizationId || !canManageProtocols || !status?.enabled) {
      setOperatorBinding(null);
      return;
    }

    const loadBinding = async () => {
      try {
        const binding = await getMySacDigitalOperatorBinding(activeOrganizationId);
        if (!cancelled) setOperatorBinding(binding);
      } catch {
        if (!cancelled) setOperatorBinding(null);
      }
    };

    void loadBinding();
    return () => {
      cancelled = true;
    };
  }, [activeOrganizationId, canManageProtocols, status?.enabled]);

  useEffect(() => {
    let cancelled = false;

    const openConversation = async () => {
      if (selectedProtocol?.is_pending) {
        setMessages([]);
        return;
      }
      await loadMessages(selectedProtocolId, true);
      if (
        cancelled
        || !activeOrganizationId
        || !selectedProtocolId
        || !selectedProtocol?.external_protocol_id
      ) return;

      try {
        await markSacDigitalProtocolRead(activeOrganizationId, selectedProtocolId);
        if (!cancelled) await loadUnreadCounts();
      } catch {
        // Não bloqueia a abertura da conversa.
      }

      // Ao reabrir uma conversa, buscar novamente o historico na SAC.
      // Nao reter uma marca permanente de sincronizado: mensagens externas
      // podem ter ocorrido enquanto a Union estava fechada/offline.
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
        await markSacDigitalProtocolRead(activeOrganizationId, selectedProtocolId);
        if (!cancelled) await loadUnreadCounts();
      } catch {
        // Mantem as mensagens locais quando a SAC estiver indisponivel.
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
    loadUnreadCounts,
    selectedProtocol?.external_protocol_id,
    selectedProtocol?.is_pending,
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
            void (async () => {
              await loadMessages(selectedProtocolId, false);
              if (activeOrganizationId) {
                try {
                  await markSacDigitalProtocolRead(activeOrganizationId, selectedProtocolId);
                } catch {
                  // Mantém o realtime da conversa mesmo se o marcador de leitura falhar.
                }
              }
              await loadUnreadCounts();
            })();
          } else {
            void loadUnreadCounts();
          }
        },
      )
      .subscribe();

    // Separar esta assinatura da principal: antes da migracao do recurso
    // pendente, um erro no canal novo nao interrompe mensagens/protocolos.
    const pendingRealtime = supabase
      .channel(`sac-digital-outbound:${activeOrganizationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "sac_digital_outbound_starts",
          filter: `organization_id=eq.${activeOrganizationId}`,
        },
        () => {
          void loadProtocols(false);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(realtime);
      void supabase.removeChannel(pendingRealtime);
    };
  }, [activeOrganizationId, canViewMessages, loadMessages, loadProtocols, loadUnreadCounts, selectedProtocolId]);

  const sendMessage = async () => {
    if (!activeOrganizationId || !selectedProtocol || !canSendMessages || sendingRef.current
      || selectedProtocol.status === "finished" || selectedProtocol.is_pending || !status?.enabled) return;
    const text = draft.trim();
    const selectedFile = attachment;
    if (!text && !selectedFile) return;

    sendingRef.current = true;
    setSending(true);
    setMessage(null);
    try {
      if (selectedFile) {
        await sendSacDigitalMediaMessage(
          activeOrganizationId,
          selectedProtocol.external_protocol_id,
          selectedFile,
          text,
        );
      } else {
        await sendSacDigitalTextMessage(
          activeOrganizationId,
          selectedProtocol.external_protocol_id,
          text,
        );
      }
    } catch (error) {
      setMessage({
        text: systemErrorMessage(error, "Não foi possível enviar a mensagem pela SAC Digital."),
        error: true,
      });
      sendingRef.current = false;
      setSending(false);
      return;
    }

    // O envio ja foi aceito. Uma falha ao recarregar nao deve sugerir reenvio.
    setDraft("");
    setAttachment(null);
    if (mediaInputRef.current) mediaInputRef.current.value = "";
    try {
      await Promise.all([
        loadMessages(selectedProtocol.id, false),
        loadProtocols(false),
      ]);
    } catch {
      setMessage({ text: "Mensagem enviada pela SAC Digital. A atualização do histórico será retomada na próxima abertura." });
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };

  const reloadSelectedProtocol = async () => {
    if (!selectedProtocol) return;
    await Promise.all([
      loadProtocols(false),
      loadMessages(selectedProtocol.id, false),
    ]);
  };


  const handleNewConversationStarted = async (result: {
    protocol: string | null;
    pending_start_id: string | null;
  }) => {
    if (!activeOrganizationId) return;

    // A nova conversa deve ficar visivel mesmo com filtros anteriores ativos.
    setConversationSearch("");
    setStatusFilter("all");
    setOperatorFilter("all");

    const protocol = result.protocol;
    if (!protocol) {
      await loadProtocols(false);
      if (result.pending_start_id) {
        setSelectedProtocolId(`pending:${result.pending_start_id}`);
      }
      setMessage({
        text: result.pending_start_id
          ? "Mensagem inicial enviada. A conversa está na lista como aguardando protocolo."
          : "Mensagem enviada pela SAC Digital, mas o registro pendente ainda não está disponível na Union. O protocolo aparecerá quando a SAC o criar.",
      });
      return;
    }

    let foundId: string | null = null;
    for (let attempt = 0; attempt < 4 && !foundId; attempt += 1) {
      if (attempt > 0) await new Promise(resolve => setTimeout(resolve, 400));
      try {
        const next = await listSacDigitalProtocols(activeOrganizationId);
        setProtocols(next);
        foundId = next.find(item => item.external_protocol_id === protocol)?.id || null;
      } catch {
        // O realtime/webhook pode concluir a projeção logo em seguida.
      }
    }

    if (foundId) {
      setSelectedProtocolId(foundId);
      setMessage({ text: "Conversa iniciada com sucesso." });
    } else {
      setMessage({
        text: "Conversa iniciada na SAC Digital. O protocolo será exibido assim que a sincronização concluir.",
      });
      await loadProtocols(false);
    }
  };

  const customerDisplayName = (customer: any) =>
    String(customer?.trade_name || customer?.full_name || customer?.legal_name || "Cliente").trim();

  const searchCustomerCandidates = async () => {
    if (!activeOrganizationId || !canViewCustomers || customerSearchLoading) return;
    const query = customerSearch.trim();
    if (!query) {
      setCustomerResults([]);
      return;
    }

    setCustomerSearchLoading(true);
    setMessage(null);
    try {
      const digits = query.replace(/\D/g, "");
      const page = await listCustomers({
        organizationId: activeOrganizationId,
        page: 1,
        pageSize: 20,
        ...(digits.length >= 6 ? { documentSearch: query } : { nameSearch: query }),
      });
      setCustomerResults(page.items || []);
    } catch (error) {
      setMessage({
        text: systemErrorMessage(error, "Não foi possível buscar clientes."),
        error: true,
      });
    } finally {
      setCustomerSearchLoading(false);
    }
  };

  const openCustomerLink = () => {
    if (!canViewCustomers || !selectedProtocol?.contact) return;
    setRoutingOpen(false);
    setOrdersPanelOpen(false);
    setFinishConfirmOpen(false);
    setCustomerLinkOpen(true);
    setCustomerResults([]);
    setCustomerSearch(selectedProtocol.contact.name || "");
  };

  const linkCustomer = async (customerId: string) => {
    if (
      !activeOrganizationId
      || !selectedProtocol?.contact?.id
      || !canViewCustomers
      || customerLinkingId
    ) return;

    setCustomerLinkingId(customerId);
    setMessage(null);
    try {
      await linkSacDigitalCustomer(
        activeOrganizationId,
        selectedProtocol.contact.id,
        customerId,
      );
      setCustomerLinkOpen(false);
      setOrdersPanelOpen(false);
      setCustomerOrders([]);
      setCustomerResults([]);
      setCustomerSearch("");
      setMessage({ text: "Cliente vinculado ao atendimento SAC." });
      await loadProtocols(false);
    } catch (error) {
      setMessage({
        text: systemErrorMessage(error, "Não foi possível vincular o cliente ao atendimento."),
        error: true,
      });
    } finally {
      setCustomerLinkingId(null);
    }
  };

  const handleQuickCustomerSaved = async (customer: any) => {
    if (!customer?.id) return;
    await linkCustomer(String(customer.id));
  };

  const openCustomerOrders = async () => {
    const customerId = selectedProtocol?.contact?.customer_id;
    if (!activeOrganizationId || !customerId || !canViewOrders) return;

    if (ordersPanelOpen) {
      setOrdersPanelOpen(false);
      return;
    }

    setCustomerLinkOpen(false);
    setRoutingOpen(false);
    setFinishConfirmOpen(false);
    setOrdersPanelOpen(true);
    setCustomerOrdersLoading(true);
    setMessage(null);
    try {
      const rows = await listSacDigitalCustomerOrders(activeOrganizationId, customerId);
      setCustomerOrders(rows);
    } catch (error) {
      setMessage({
        text: systemErrorMessage(error, "Não foi possível carregar as OS deste cliente."),
        error: true,
      });
    } finally {
      setCustomerOrdersLoading(false);
    }
  };

  const loadRoutingOptionsIfNeeded = async () => {
    if (routingOptions) return routingOptions;
    if (!activeOrganizationId) return null;
    const options = await getSacDigitalRoutingOptions(activeOrganizationId);
    setRoutingOptions(options);
    return options;
  };

  const assumeProtocol = async () => {
    if (!activeOrganizationId || !selectedProtocol || !canManageProtocols || protocolAction) return;

    setProtocolAction("assume");
    setMessage(null);
    try {
      const result = await assumeSacDigitalProtocol(
        activeOrganizationId,
        selectedProtocol.external_protocol_id,
      );
      const operator = result.operator && typeof result.operator === "object"
        ? result.operator as { id: string; name: string }
        : null;
      if (operator) {
        setOperatorBinding({ linked: true, operator });
      }
      setMessage({ text: "Atendimento assumido por você." });
      await reloadSelectedProtocol();
    } catch (error) {
      setMessage({
        text: systemErrorMessage(error, "Não foi possível assumir o atendimento."),
        error: true,
      });
    } finally {
      setProtocolAction(null);
    }
  };

  const openRouting = async () => {
    if (!activeOrganizationId || !canManageProtocols) return;
    setRoutingOpen(true);
    setCustomerLinkOpen(false);
    setOrdersPanelOpen(false);
    setFinishConfirmOpen(false);
    if (routingOptions || protocolAction === "routing") return;
    setProtocolAction("routing");
    setMessage(null);
    try {
      await loadRoutingOptionsIfNeeded();
    } catch (error) {
      setRoutingOpen(false);
      setMessage({
        text: systemErrorMessage(error, "Não foi possível carregar os destinos de encaminhamento."),
        error: true,
      });
    } finally {
      setProtocolAction(null);
    }
  };

  const forwardProtocol = async () => {
    if (
      !activeOrganizationId
      || !selectedProtocol
      || !canManageProtocols
      || protocolAction
      || (!departmentId && !operatorId)
    ) return;

    setProtocolAction("forward");
    setMessage(null);
    try {
      await forwardSacDigitalProtocol(
        activeOrganizationId,
        selectedProtocol.external_protocol_id,
        { departmentId, operatorId },
      );
      setRoutingOpen(false);
      setDepartmentId("");
      setOperatorId("");
      setMessage({ text: "Atendimento encaminhado com sucesso." });
      await reloadSelectedProtocol();
    } catch (error) {
      setMessage({
        text: systemErrorMessage(error, "Não foi possível encaminhar o atendimento."),
        error: true,
      });
    } finally {
      setProtocolAction(null);
    }
  };

  const returnToInbox = async () => {
    if (!activeOrganizationId || !selectedProtocol || !canManageProtocols || protocolAction) return;
    setProtocolAction("inbox");
    setMessage(null);
    try {
      await returnSacDigitalProtocolToInbox(
        activeOrganizationId,
        selectedProtocol.external_protocol_id,
      );
      setRoutingOpen(false);
      setFinishConfirmOpen(false);
      setMessage({ text: "Atendimento devolvido para a caixa de entrada da SAC Digital." });
      await reloadSelectedProtocol();
    } catch (error) {
      setMessage({
        text: systemErrorMessage(error, "Não foi possível devolver o atendimento para a caixa de entrada."),
        error: true,
      });
    } finally {
      setProtocolAction(null);
    }
  };

  const finishProtocol = async () => {
    if (!activeOrganizationId || !selectedProtocol || !canManageProtocols || protocolAction) return;
    setProtocolAction("finish");
    setMessage(null);
    try {
      await finishSacDigitalProtocol(
        activeOrganizationId,
        selectedProtocol.external_protocol_id,
      );
      setFinishConfirmOpen(false);
      setRoutingOpen(false);
      setMessage({ text: "Atendimento finalizado com sucesso." });
      await reloadSelectedProtocol();
    } catch (error) {
      setMessage({
        text: systemErrorMessage(error, "Não foi possível finalizar o atendimento."),
        error: true,
      });
    } finally {
      setProtocolAction(null);
    }
  };

  useEffect(() => {
    setAttachment(null);
    if (mediaInputRef.current) mediaInputRef.current.value = "";
    setRoutingOpen(false);
    setCustomerLinkOpen(false);
    setQuickCustomerOpen(false);
    setOrdersPanelOpen(false);
    setCustomerOrders([]);
    setFinishConfirmOpen(false);
    setDepartmentId("");
    setOperatorId("");
    setCustomerSearch("");
    setCustomerResults([]);
  }, [selectedProtocolId]);

  const isMyProtocol = Boolean(
    selectedProtocol
    && operatorBinding?.operator?.id
    && selectedProtocol.operator_id === operatorBinding.operator.id,
  );

  if (!activeOrganizationId || loading) return <LoadingState text="Carregando SAC Digital..." />;

  return <div className="min-w-0 space-y-3">
    <SacDigitalNewConversationDialog
      open={newConversationOpen}
      organizationId={activeOrganizationId}
      onClose={() => setNewConversationOpen(false)}
      onStarted={handleNewConversationStarted}
    />

    <PageHeader
      title="SAC Digital"
      subtitle="Atendimento integrado à SAC Digital."
      actions={
        <>
          {canSendMessages && status?.enabled && (
            <AdminButton onClick={() => setNewConversationOpen(true)}>
              Nova conversa
            </AdminButton>
          )}
          <BtnSecondary onClick={onBack}>Voltar</BtnSecondary>
          {canManage && onOpenSettings && (
            <AdminButton variant="secondary" onClick={onOpenSettings}>
              <Settings size={15} />
              Configurações
            </AdminButton>
          )}
        </>
      }
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

    <div className="h-[680px] overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      {!canViewMessages ? (
        <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
          Sua função não possui permissão para visualizar conversas do SAC Digital.
        </div>
      ) : inboxLoading && protocols.length === 0 ? (
        <div className="flex h-full items-center justify-center p-6">
          <LoadingState text="Carregando conversas..." />
        </div>
      ) : protocols.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
          <MessageCircle size={32} className="text-muted-foreground" />
          <p className="text-sm font-black text-foreground">Nenhum atendimento recebido</p>
          <p className="max-w-md text-xs leading-5 text-muted-foreground">
            Quando a SAC Digital enviar um protocolo pelo webhook, ele aparecerá aqui em tempo real.
          </p>
        </div>
      ) : (
        <div className="grid h-full min-h-0 grid-rows-[230px_minmax(0,1fr)] md:grid-cols-[340px_minmax(0,1fr)] md:grid-rows-1">
          <aside className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden border-b border-border bg-card md:border-b-0 md:border-r">
            <div className="border-b border-border bg-muted/35 p-3">
              <div className="min-w-0">
                <p className="text-base font-black text-foreground">Conversas</p>
                <p className="text-[10px] text-muted-foreground">
                  {protocols.length} conversa(s) · {unreadConversationCount > 0 ? `${unreadConversationCount} não lida(s)` : "tempo real"}
                </p>
              </div>
              <div className="relative mt-3">
                <Search
                  size={15}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <input
                  value={conversationSearch}
                  onChange={event => setConversationSearch(event.target.value)}
                  placeholder="Buscar conversa"
                  className="admin-input h-10 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground/65 focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <select
                  value={statusFilter}
                  onChange={event => setStatusFilter(event.target.value)}
                  className="admin-input h-9 min-w-0 rounded-lg border border-border bg-card px-2 text-xs text-foreground"
                  aria-label="Filtrar por situação"
                >
                  <option value="all">Todas</option>
                  <option value="unread">Não lidas</option>
                  <option value="open">Abertas</option>
                  <option value="in_att">Em atendimento</option>
                  <option value="inbox">Caixa de entrada</option>
                  <option value="pending">Aguardando protocolo</option>
                  <option value="finished">Finalizadas</option>
                </select>
                <select
                  value={operatorFilter}
                  onChange={event => setOperatorFilter(event.target.value)}
                  className="admin-input h-9 min-w-0 rounded-lg border border-border bg-card px-2 text-xs text-foreground"
                  aria-label="Filtrar por atendente"
                >
                  <option value="all">Todos atendentes</option>
                  <option value="unassigned">Sem atendente</option>
                  {operatorFilterOptions.map(name => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
              {filteredProtocols.length === 0 ? (
                <div className="p-5 text-center text-xs text-muted-foreground">
                  Nenhuma conversa encontrada.
                </div>
              ) : filteredProtocols.map(protocol => {
                const selected = protocol.id === selectedProtocolId;
                const unread = Number(unreadCounts[protocol.id] || 0);
                return <button
                  key={protocol.id}
                  type="button"
                  onClick={() => setSelectedProtocolId(protocol.id)}
                  className={`flex w-full items-start gap-3 border-b border-border px-3 py-3 text-left transition-colors last:border-b-0 ${selected
                    ? "bg-primary-soft"
                    : "bg-card hover:bg-muted/55"}`}
                >
                  <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xs font-black ${selected
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"}`}>
                    {protocolInitials(protocol)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-start justify-between gap-2">
                      <p className="truncate text-sm font-black text-foreground">{protocolDisplayName(protocol)}</p>
                      <span className="shrink-0 text-[9px] text-muted-foreground">
                        {formatCompactDate(protocol.last_message_at)}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                      {protocol.contact?.phone
                        ? formatPhone(protocol.contact.phone)
                        : protocol.is_pending ? "Mensagem inicial enviada" : `Protocolo ${protocol.external_protocol_id}`}
                    </p>
                    <div className="mt-1.5 flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-[9px] font-bold text-muted-foreground">
                        {protocolStatusLabel[protocol.status] || protocol.status}
                      </span>
                      {protocol.contact?.customer_id && (
                        <span className="shrink-0 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[8px] font-bold text-emerald-700 dark:text-emerald-300">
                          CRM
                        </span>
                      )}
                      {unread > 0 && (
                        <span className="ml-auto flex min-w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 px-1.5 py-0.5 text-[9px] font-black text-white">
                          {unread > 99 ? "99+" : unread}
                        </span>
                      )}
                    </div>
                  </div>
                </button>;
              })}
            </div>
          </aside>

          <main className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden bg-muted/15">
            {selectedProtocol?.is_pending ? (
              <div className="flex h-full min-h-0 flex-col">
                <div className="flex items-center gap-3 border-b border-border bg-card px-4 py-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-black text-primary">
                    {protocolInitials(selectedProtocol)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-black text-foreground">{protocolDisplayName(selectedProtocol)}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatPhone(selectedProtocol.contact?.phone)} · Aguardando abertura de protocolo
                    </p>
                  </div>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto bg-muted/25 px-3 py-4 sm:px-5">
                  <div className="mx-auto max-w-4xl">
                    <div className="flex justify-end">
                      <div className="max-w-[88%] rounded-lg bg-emerald-100 px-3 py-2 text-emerald-950 shadow-sm dark:bg-emerald-950/55 dark:text-emerald-50 sm:max-w-[72%]">
                        <p className="whitespace-pre-wrap break-words text-sm leading-5">
                          {selectedProtocol.pending_message}
                        </p>
                        <p className="mt-1 text-right text-[9px] opacity-60">
                          Enviada à SAC · {formatCompactDate(selectedProtocol.last_message_at)}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="border-t border-border bg-card px-4 py-3 text-center text-xs text-muted-foreground">
                  A mensagem inicial foi aceita pela SAC Digital. Assim que existir um protocolo,
                  esta conversa será substituída pelo atendimento, com as ações e mensagens disponíveis.
                </div>
              </div>
            ) : selectedProtocol ? (
              <>
                <div className="flex min-w-0 items-center gap-3 border-b border-border bg-card px-4 py-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-black text-primary">
                    {protocolInitials(selectedProtocol)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-black text-foreground">{protocolDisplayName(selectedProtocol)}</p>
                    <div className="mt-0.5 flex min-w-0 flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
                      {selectedProtocol.contact?.phone && <span>{formatPhone(selectedProtocol.contact.phone)}</span>}
                      <span>Protocolo {selectedProtocol.external_protocol_id}</span>
                      {selectedProtocol.department_name && <span>{selectedProtocol.department_name}</span>}
                      {selectedProtocol.operator_name && <span>{selectedProtocol.operator_name}</span>}
                    </div>
                  </div>
                </div>

                {(
                  (canManageProtocols && selectedProtocol.status !== "finished")
                  || (canViewCustomers && Boolean(selectedProtocol.contact))
                  || (canViewOrders && Boolean(selectedProtocol.contact?.customer_id))
                ) && (
                  <div className="flex min-w-0 items-center gap-2 overflow-x-auto border-b border-border bg-card px-4 py-2.5">
                    {canManageProtocols && selectedProtocol.status !== "finished" && (
                      <AdminButton
                        onClick={() => void assumeProtocol()}
                        loading={protocolAction === "assume"}
                        disabled={isMyProtocol || Boolean(protocolAction && protocolAction !== "assume")}
                        className="shrink-0"
                      >
                        {isMyProtocol ? "Assumido por você" : "Assumir"}
                      </AdminButton>
                    )}

                    {canViewCustomers && selectedProtocol.contact?.customer_id ? (
                      <>
                        {onOpenCustomer && (
                          <AdminButton
                            variant="secondary"
                            onClick={() => onOpenCustomer(selectedProtocol.contact!.customer_id!)}
                            className="shrink-0"
                          >
                            Abrir cliente
                          </AdminButton>
                        )}
                        <AdminButton
                          variant="secondary"
                          onClick={openCustomerLink}
                          className="shrink-0"
                        >
                          Trocar vínculo
                        </AdminButton>
                      </>
                    ) : canViewCustomers && selectedProtocol.contact ? (
                      <AdminButton
                        variant="secondary"
                        onClick={openCustomerLink}
                        className="shrink-0"
                      >
                        Vincular cliente
                      </AdminButton>
                    ) : null}

                    {selectedProtocol.contact?.customer_id && canViewOrders && (
                      <AdminButton
                        variant="secondary"
                        onClick={() => void openCustomerOrders()}
                        loading={customerOrdersLoading}
                        className="shrink-0"
                      >
                        OS do cliente
                      </AdminButton>
                    )}

                    {selectedProtocol.contact?.customer_id && canCreateOrders && onCreateOrder && (
                      <AdminButton
                        variant="secondary"
                        onClick={() => onCreateOrder(selectedProtocol.contact!.customer_id!)}
                        className="shrink-0"
                      >
                        Nova OS
                      </AdminButton>
                    )}

                    {canManageProtocols && selectedProtocol.status !== "finished" && (
                      <>
                        <AdminButton
                          variant="secondary"
                          onClick={() => void openRouting()}
                          loading={protocolAction === "routing"}
                          disabled={Boolean(protocolAction && protocolAction !== "routing")}
                          className="shrink-0"
                        >
                          Encaminhar
                        </AdminButton>
                        {selectedProtocol.status !== "inbox" && (
                          <AdminButton
                            variant="secondary"
                            onClick={() => void returnToInbox()}
                            loading={protocolAction === "inbox"}
                            disabled={Boolean(protocolAction && protocolAction !== "inbox")}
                            className="shrink-0"
                          >
                            Caixa de entrada
                          </AdminButton>
                        )}
                        <AdminButton
                          variant="secondary"
                          onClick={() => {
                            setRoutingOpen(false);
                            setCustomerLinkOpen(false);
                            setOrdersPanelOpen(false);
                            setFinishConfirmOpen(true);
                          }}
                          disabled={Boolean(protocolAction)}
                          className="shrink-0"
                        >
                          Finalizar
                        </AdminButton>
                      </>
                    )}
                  </div>
                )}

                {customerLinkOpen && canViewCustomers && selectedProtocol.contact && (
                  <div className="border-b border-border bg-muted/30 px-4 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-black text-foreground">
                          {selectedProtocol.contact.customer_id ? "Trocar cliente vinculado" : "Vincular cliente do CRM"}
                        </p>
                        <p className="mt-0.5 text-[10px] text-muted-foreground">
                          Busque por nome, CPF ou CNPJ.
                        </p>
                      </div>
                      {canCreateCustomers && (
                        <AdminButton
                          variant="secondary"
                          onClick={() => setQuickCustomerOpen(true)}
                        >
                          Novo cliente
                        </AdminButton>
                      )}
                    </div>

                    <form
                      className="mt-3 flex min-w-0 gap-2"
                      onSubmit={event => {
                        event.preventDefault();
                        void searchCustomerCandidates();
                      }}
                    >
                      <input
                        value={customerSearch}
                        onChange={event => setCustomerSearch(event.target.value)}
                        placeholder="Nome, CPF ou CNPJ"
                        className="admin-input h-10 min-w-0 flex-1 rounded-lg border border-border bg-card px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground/65 focus:border-primary focus:ring-2 focus:ring-primary/20"
                      />
                      <AdminButton
                        type="submit"
                        loading={customerSearchLoading}
                        disabled={!customerSearch.trim()}
                      >
                        Buscar
                      </AdminButton>
                      <AdminButton
                        type="button"
                        variant="secondary"
                        onClick={() => {
                          setCustomerLinkOpen(false);
                          setCustomerResults([]);
                          setCustomerSearch("");
                        }}
                      >
                        Fechar
                      </AdminButton>
                    </form>

                    {customerResults.length > 0 && (
                      <div className="mt-3 max-h-48 overflow-y-auto rounded-lg border border-border bg-card">
                        {customerResults.map(customer => {
                          const document = customer.customer_type === "PJ"
                            ? String(customer.cnpj || "")
                            : String(customer.document || "");
                          const phone = String(customer.whatsapp || customer.phone || "");
                          return (
                            <div
                              key={customer.id}
                              className="flex min-w-0 items-center justify-between gap-3 border-b border-border px-3 py-2.5 last:border-b-0"
                            >
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-xs font-black text-foreground">{customerDisplayName(customer)}</p>
                                <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                                  {[document, phone ? formatPhone(phone) : ""].filter(Boolean).join(" · ") || "Sem documento/telefone"}
                                </p>
                              </div>
                              <AdminButton
                                size="sm"
                                onClick={() => void linkCustomer(String(customer.id))}
                                loading={customerLinkingId === customer.id}
                                disabled={Boolean(customerLinkingId && customerLinkingId !== customer.id)}
                              >
                                Vincular
                              </AdminButton>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}

                {ordersPanelOpen && canViewOrders && selectedProtocol.contact?.customer_id && (
                  <div className="border-b border-border bg-muted/30 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-black text-foreground">Ordens de Serviço do cliente</p>
                        <p className="mt-0.5 text-[10px] text-muted-foreground">Últimas OS vinculadas a este cadastro.</p>
                      </div>
                      <AdminButton
                        variant="secondary"
                        onClick={() => setOrdersPanelOpen(false)}
                      >
                        Fechar
                      </AdminButton>
                    </div>

                    {customerOrdersLoading ? (
                      <div className="py-4">
                        <LoadingState text="Carregando OS..." />
                      </div>
                    ) : customerOrders.length === 0 ? (
                      <div className="mt-3 rounded-lg border border-border bg-card px-3 py-3 text-xs text-muted-foreground">
                        Este cliente ainda não possui OS cadastrada.
                      </div>
                    ) : (
                      <div className="mt-3 max-h-56 overflow-y-auto rounded-lg border border-border bg-card">
                        {customerOrders.map(order => (
                          <div
                            key={order.id}
                            className="flex min-w-0 items-center justify-between gap-3 border-b border-border px-3 py-2.5 last:border-b-0"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex min-w-0 items-center gap-2">
                                <p className="truncate text-xs font-black text-foreground">
                                  OS {order.os_number || order.id.slice(0, 8)}
                                </p>
                                {order.is_solved && (
                                  <span className="shrink-0 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[8px] font-bold text-emerald-700 dark:text-emerald-300">
                                    Resolvida
                                  </span>
                                )}
                              </div>
                              <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                                {[
                                  order.order_status?.name || "",
                                  order.situation?.name || "",
                                  formatCompactDate(order.created_at),
                                ].filter(Boolean).join(" · ")}
                              </p>
                            </div>
                            {onOpenOrder && (
                              <AdminButton
                                size="sm"
                                variant="secondary"
                                onClick={() => onOpenOrder(order.id)}
                              >
                                Abrir
                              </AdminButton>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {canCreateOrders && onCreateOrder && (
                      <div className="mt-3 flex justify-end">
                        <AdminButton
                          onClick={() => onCreateOrder(selectedProtocol.contact!.customer_id!)}
                        >
                          Nova OS
                        </AdminButton>
                      </div>
                    )}
                  </div>
                )}

                {routingOpen && canManageProtocols && (
                  <div className="border-b border-border bg-muted/30 px-4 py-3">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <select
                        value={departmentId}
                        onChange={event => setDepartmentId(event.target.value)}
                        disabled={protocolAction === "routing" || protocolAction === "forward"}
                        className="admin-input h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground"
                      >
                        <option value="">Departamento (opcional)</option>
                        {(routingOptions?.departments || [])
                          .filter(item => item.active)
                          .map(item => (
                            <option key={item.id} value={item.id}>{item.name}</option>
                          ))}
                      </select>
                      <select
                        value={operatorId}
                        onChange={event => setOperatorId(event.target.value)}
                        disabled={protocolAction === "routing" || protocolAction === "forward"}
                        className="admin-input h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground"
                      >
                        <option value="">Operador (opcional)</option>
                        {(routingOptions?.operators || []).map(item => (
                          <option key={item.id} value={item.id}>
                            {item.name}{item.online ? " — online" : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="mt-2 flex justify-end gap-2">
                      <AdminButton
                        variant="secondary"
                        onClick={() => {
                          setRoutingOpen(false);
                          setDepartmentId("");
                          setOperatorId("");
                        }}
                        disabled={protocolAction === "forward"}
                      >
                        Cancelar
                      </AdminButton>
                      <AdminButton
                        onClick={() => void forwardProtocol()}
                        loading={protocolAction === "forward"}
                        disabled={!departmentId && !operatorId}
                      >
                        Encaminhar
                      </AdminButton>
                    </div>
                  </div>
                )}

                {finishConfirmOpen && canManageProtocols && (
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-amber-50 px-4 py-3 text-amber-900 dark:bg-amber-950/25 dark:text-amber-200">
                    <p className="text-xs font-semibold">
                      Finalizar este atendimento na SAC Digital? Esta ação encerra o protocolo.
                    </p>
                    <div className="flex gap-2">
                      <AdminButton
                        variant="secondary"
                        onClick={() => setFinishConfirmOpen(false)}
                        disabled={protocolAction === "finish"}
                      >
                        Cancelar
                      </AdminButton>
                      <AdminButton
                        onClick={() => void finishProtocol()}
                        loading={protocolAction === "finish"}
                      >
                        Finalizar
                      </AdminButton>
                    </div>
                  </div>
                )}

                <div
                  ref={messagesScrollRef}
                  className="min-h-0 flex-1 overflow-y-auto overscroll-contain bg-muted/25 px-3 py-4 [scrollbar-gutter:stable] sm:px-5"
                >
                  {messagesLoading ? <LoadingState text="Carregando mensagens..." /> : messages.length === 0 ? (
                    <div className="flex min-h-64 items-center justify-center text-center text-xs text-muted-foreground">
                      Nenhuma mensagem registrada neste protocolo.
                    </div>
                  ) : (
                    <div className="mx-auto max-w-4xl space-y-2">
                      {messages.map(item => {
                        const outgoing = item.direction === "outgoing";
                        const kind = messageKind(item);
                        const KindIcon = kind.Icon;
                        return <div
                          key={item.id}
                          className={`flex ${outgoing ? "justify-end" : "justify-start"}`}
                        >
                          <div className={`max-w-[88%] rounded-lg px-3 py-2 shadow-sm sm:max-w-[72%] ${outgoing
                            ? "bg-emerald-100 text-emerald-950 dark:bg-emerald-950/55 dark:text-emerald-50"
                            : "border border-border bg-card text-foreground"}`}>
                            {(() => {
                              const mediaUrl = sacDigitalMediaUrl(item.media_url);
                              return <div className="space-y-2">
                                {mediaUrl && item.message_type === "image" && (
                                  <a href={mediaUrl} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-md">
                                    <img
                                      src={mediaUrl}
                                      alt="Imagem recebida no SAC Digital"
                                      loading="lazy"
                                      className="max-h-80 w-auto max-w-full rounded-md object-contain"
                                    />
                                  </a>
                                )}
                                {mediaUrl && item.message_type === "video" && (
                                  <video
                                    src={mediaUrl}
                                    controls
                                    preload="metadata"
                                    className="max-h-80 w-full rounded-md"
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
                                    className="flex items-center gap-2 rounded-md border border-border/70 px-3 py-2 text-xs font-bold underline-offset-2 hover:underline"
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
                            <div className="mt-1 flex items-center justify-end gap-2 text-[9px] opacity-60">
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
                  {selectedProtocol.status === "finished" ? (
                    <p className="py-2 text-center text-xs text-muted-foreground">
                      Este protocolo está finalizado. Não é possível enviar novas mensagens nele.
                    </p>
                  ) : canSendMessages ? (
                    <div className="mx-auto max-w-4xl space-y-2">
                      {attachment && (
                        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs">
                          <Paperclip size={15} className="shrink-0 text-muted-foreground" />
                          <span className="min-w-0 flex-1 truncate text-foreground">
                            {attachment.name} · {(attachment.size / (1024 * 1024)).toFixed(2)} MB
                          </span>
                          <button
                            type="button"
                            disabled={sending}
                            onClick={() => {
                              setAttachment(null);
                              if (mediaInputRef.current) mediaInputRef.current.value = "";
                            }}
                            aria-label="Remover anexo"
                            className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      )}
                      <form
                        className="flex min-w-0 items-end gap-2"
                        onSubmit={event => {
                          event.preventDefault();
                          void sendMessage();
                        }}
                      >
                        <input
                          ref={mediaInputRef}
                          type="file"
                          className="hidden"
                          aria-label="Selecionar anexo"
                          onChange={event => {
                            const file = event.target.files?.[0] || null;
                            if (!file) return;
                            if (file.size > 25 * 1024 * 1024) {
                              setMessage({ text: "O arquivo deve ter no máximo 25 MB.", error: true });
                              event.target.value = "";
                              return;
                            }
                            if (file.type.startsWith("image/") && file.size > 1024 * 1024) {
                              setMessage({ text: "Imagens devem ter no máximo 1 MB na SAC Digital.", error: true });
                              event.target.value = "";
                              return;
                            }
                            setMessage(null);
                            setAttachment(file);
                          }}
                        />
                        <AdminButton
                          type="button"
                          variant="secondary"
                          disabled={sending || !status?.enabled}
                          onClick={() => mediaInputRef.current?.click()}
                          aria-label="Anexar imagem, áudio, vídeo ou arquivo"
                          title="Anexar arquivo (até 25 MB; imagens até 1 MB)"
                          className="h-11 w-11 shrink-0 rounded-full px-0"
                        >
                          <Paperclip size={17} />
                        </AdminButton>
                        <textarea
                          rows={1}
                          value={draft}
                          disabled={sending || !status?.enabled}
                          placeholder={attachment ? "Legenda (opcional)" : status?.enabled ? "Digite uma mensagem" : "Integração desativada"}
                          onChange={event => setDraft(event.target.value)}
                          onKeyDown={event => {
                            if (event.key === "Enter" && !event.shiftKey) {
                              event.preventDefault();
                              void sendMessage();
                            }
                          }}
                          className="admin-input min-h-[44px] min-w-0 flex-1 resize-none rounded-full border border-border bg-muted/55 px-4 py-2.5 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground/65 focus:border-primary focus:bg-card focus:ring-2 focus:ring-primary/20"
                        />
                        <AdminButton
                          type="submit"
                          disabled={(!draft.trim() && !attachment) || !status?.enabled || sending}
                          loading={sending}
                          aria-label="Enviar mensagem"
                          title="Enviar mensagem"
                          className="h-11 w-11 shrink-0 rounded-full px-0"
                        >
                          <Send size={17} />
                        </AdminButton>
                      </form>
                    </div>
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
          </main>
        </div>
      )}
    </div>

    {quickCustomerOpen && selectedProtocol?.contact && (
      <QuickCustomerModal
        onClose={() => setQuickCustomerOpen(false)}
        onSaved={customer => void handleQuickCustomerSaved(customer)}
        initialValues={{
          customerType: "PF",
          full_name: selectedProtocol.contact.name || "",
          phone: selectedProtocol.contact.phone || "",
          whatsapp: selectedProtocol.contact.phone || "",
        }}
        description="Cadastre o cliente sem sair do atendimento SAC Digital."
      />
    )}
  </div>;
}
