import { protocolOperationalStatus } from '../../../../supabase/functions/_shared/sac-runtime.mjs';
import { createRefreshQueue, initializeSacScreen } from '../domain/refresh-coordinator.mjs';
import { syncSacDigitalResources } from '../infrastructure/sac-digital.repository';
import { lazy, Suspense } from 'react';
const SacDigitalResources = lazy(() => import('./SacDigitalResources').then(m => ({default: m.SacDigitalResources})));
import { AdminSubnav } from '@/shared/ui/admin/AdminSubnav';
import { FInput, FSelect } from '@/shared/ui/admin/AdminFormControls';
import { SAC_MODULE_SECTIONS } from './sac-navigation';
import { mediaMaximum, deliveryLabel, isOperatorAuthError, liveMessageChanges } from '../domain/resource-ui.mjs';
import { SacMessageOutbox } from '../domain/message-outbox.mjs';
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import {
  FileText,
  Image as ImageIcon,
  MapPin,
  MessageCircle,
  Paperclip,
  X,
  Send,
  UserRound,
  Volume2,
  ChevronDown,
  LoaderCircle,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { LoadingState, notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import { listCustomerEquipments, listCustomers } from "@/features/customers/infrastructure/customers.repository";
import { QuickCustomerModal } from "@/features/orders/presentation/QuickCustomerModal";
import { SacDigitalNewConversationDialog } from "./SacDigitalNewConversationDialog";
import {
  AdminButton,
  BtnSecondary,
  PageHeader,
} from "@/shared/ui/admin/AdminLayout";
import {
  assumeSacDigitalProtocol,
  beginSacOperatorAuthorization,
  finishSacDigitalProtocol,
  forwardSacDigitalProtocol,
  getMySacDigitalOperatorBinding,
  getSacDigitalIntegrationStatus,
  getSacDigitalFinishedProtocolCount,
  listSacDigitalOperatorQueue,
  getSacDigitalRoutingOptions,
  getSacDigitalUnreadCounts,
  linkSacDigitalCustomer,
  listSacDigitalCustomerOrders,
  listSacDigitalMessages,
  listSacDigitalProtocols,
  markSacDigitalProtocolRead,
  refreshSacDigitalProtocol,
  returnSacDigitalProtocolToQueue,
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
  self_service: "Auto Atendimento",
  waiting: "Aguardando atendimento",
  open: "Auto Atendimento",
  in_att: "Em atendimento",
  inbox: "Recados / sem operador",
  abandoned: "Abandonado",
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

function sacContactPhoneMatch(left: string | null | undefined, right: string | null | undefined) {
  const phoneDigits = (value: string | null | undefined) => {
    const digits = String(value || "").replace(/\D/g, "");
    return digits.startsWith("55") && (digits.length === 12 || digits.length === 13)
      ? digits.slice(2) : digits;
  };
  const l = phoneDigits(left);
  const r = phoneDigits(right);
  if (!l || !r) return false;
  if (l === r) return true;

  // O WhatsApp brasileiro pode indexar o celular com ou sem o nono digito.
  const withoutNinth = (value: string) => value.length === 11 && value[2] === "9"
    ? value.slice(0, 2) + value.slice(3) : value;
  const mobile = (value: string) => /^[1-9]\d[6-9]/.test(value);
  return (l.length === 10 || l.length === 11)
    && (r.length === 10 || r.length === 11)
    && mobile(withoutNinth(l)) && mobile(withoutNinth(r))
    && withoutNinth(l) === withoutNinth(r);
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

function safeSacAvatar(value?: string | null) {
  const avatar = String(value || "").trim();
  if (!avatar) return "";
  const lower = avatar.toLowerCase();
  return lower.startsWith("https://") || lower.startsWith("http://") || lower.startsWith("data:image/")
    ? avatar
    : "";
}

function ProtocolAvatar({
  protocol,
  compact = false,
  selected = false,
}: {
  protocol: SacDigitalProtocolListItem;
  compact?: boolean;
  selected?: boolean;
}) {
  const avatar = safeSacAvatar(protocol.contact?.avatar_url);
  const sizeClass = compact ? "h-10 w-10" : "h-11 w-11";
  return (
    <div
      className={`relative flex ${sizeClass} shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-black ${
        selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
      }`}
      aria-label={`Avatar de ${protocolDisplayName(protocol)}`}
    >
      <span>{protocolInitials(protocol)}</span>
      {avatar && (
        <img
          src={avatar}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          className="absolute inset-0 h-full w-full object-cover"
          onError={event => {
            event.currentTarget.style.display = "none";
          }}
        />
      )}
    </div>
  );
}

function deliveryStatus(message: SacDigitalMessage) {
  if (message.direction !== "outgoing") return "";
  const raw = message.raw_metadata || {};
  if (raw.local_submission === "sending") return "Enviando…";
  if (raw.local_submission === "queued") return "Na fila de envio";
  if (raw.local_submission === "failed") return "Falhou";
  if (raw.local_submission === "unknown") return "Confirmação pendente";
  return deliveryLabel(raw);
}

function messageKind(message: SacDigitalMessage) {
  switch (message.message_type) {
    case "audio":
      return { label: "Áudio", Icon: Volume2 };
    case "image":
      return { label: "Imagem", Icon: ImageIcon };
    case "video":
      return { label: "Vídeo", Icon: FileText };
    case "file":
      return { label: "Arquivo", Icon: FileText };
    case "location":
      return { label: "Localização", Icon: MapPin };
    case "vcard":
      return { label: "Contato", Icon: UserRound };
    default:
      return { label: "Mensagem", Icon: MessageCircle };
  }
}

function sacMessagePayload(message: SacDigitalMessage): Record<string, any> {
  const raw = message.raw_metadata || {};
  if (raw.sac_history && typeof raw.sac_history === "object") return raw.sac_history;
  if (raw.message && typeof raw.message === "object") return raw.message;
  if (raw.data?.message && typeof raw.data.message === "object") return raw.data.message;
  return raw;
}

function effectiveMessageDirection(message: SacDigitalMessage): "incoming" | "outgoing" {
  const raw = message.raw_metadata || {};
  if (raw.sent_via_union === true) return "outgoing";
  const history = raw.sac_history && typeof raw.sac_history === "object"
    ? raw.sac_history as Record<string, unknown>
    : null;
  const by = String(history?.by || "").trim().toLowerCase();
  if (by === "operator" || by === "channel") return "outgoing";
  if (by === "contact") return "incoming";
  return message.direction;
}

function messageOperatorName(
  message: SacDigitalMessage,
  protocol: SacDigitalProtocolListItem | null,
) {
  if (effectiveMessageDirection(message) !== "outgoing") return "";
  const explicit = String(message.sender_name || "").trim();
  if (explicit) return explicit;

  const raw = message.raw_metadata || {};
  const history = raw.sac_history && typeof raw.sac_history === "object"
    ? raw.sac_history as Record<string, unknown>
    : {};
  const by = String(history.by || "").trim().toLowerCase();
  if (by === "channel") return "Automação SAC Digital";

  const operatorId = String(history.operator || "").trim();
  if (operatorId && protocol?.operator_id === operatorId && protocol.operator_name?.trim()) {
    return protocol.operator_name.trim();
  }
  return "Operador SAC";
}

function messageLocation(message: SacDigitalMessage) {
  const payload = sacMessagePayload(message);
  const place = String(payload.place || payload.address || "").trim();
  const latitude = payload.lat ?? payload.latitude;
  const longitude = payload.lon ?? payload.lng ?? payload.longitude;
  if (latitude == null || longitude == null || latitude === "" || longitude === "") {
    return { place, url: "" };
  }
  const lat = Number(latitude);
  const lon = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return { place, url: "" };
  }
  return { place: place || `${lat}, ${lon}`, url: `https://www.google.com/maps?q=${lat},${lon}` };
}

function messageContact(message: SacDigitalMessage) {
  const payload = sacMessagePayload(message);
  const name = String(payload.vcard_name || payload.v_name || "").trim();
  const phone = String(payload.vcard_phone || payload.v_number || "").trim();
  const digits = phone.replace(/[^\d+]/g, "");
  return { name, phone, phoneUrl: digits.replace(/\D/g, "").length >= 8 ? `tel:${digits}` : "" };
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
  const { activeOrganizationId, hasPermission, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const routeCustomerId = new URLSearchParams(location.search).get("customer") || "";
  const canManage = hasPermission("sac_digital.settings.manage");
  const canManageProtocols = hasPermission("sac_digital.protocols.manage");
  const canViewMessages = hasPermission("sac_digital.messages.view");
  const canSendMessages = hasPermission("sac_digital.messages.send");
  const canViewCustomers = hasPermission("customers.view");
  const canCreateCustomers = hasPermission("customers.create");
  const canViewOrders = hasPermission("orders.view");
  const canCreateOrders = hasPermission("orders.create");

  useEffect(() => {
    if (!activeOrganizationId || !canViewMessages) return;
    let cancelled = false;
    let running = false;
    const reconcile = async () => {
      if (cancelled || running || document.visibilityState === "hidden") return;
      running = true;
      try {
        await syncSacDigitalResources(activeOrganizationId);
      } catch {
        // Webhook/worker e dados locais continuam disponíveis durante falhas.
      } finally {
        running = false;
      }
    };

    // Uma reconciliação atrasada ao abrir a tela é suficiente. O worker e o
    // webhook mantêm a integração atualizada; não repetir bootstrap completo
    // a cada dois minutos no navegador.
    const initialTimer = window.setTimeout(() => void reconcile(), 20_000);
    return () => {
      cancelled = true;
      window.clearTimeout(initialTimer);
    };
  }, [activeOrganizationId, canViewMessages]);
  const [moduleSection, setModuleSection] = useState('conversations');
  const [loading, setLoading] = useState(true);
  const [inboxLoading, setInboxLoading] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [protocolAction, setProtocolAction] = useState<"routing" | "forward" | "assume" | "inbox" | "finish" | null>(null);
  const [routingOpen, setRoutingOpen] = useState(false);
  const [finishConfirmOpen, setFinishConfirmOpen] = useState(false);
  const [finishVote, setFinishVote] = useState("");
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
  const [customerEquipments, setCustomerEquipments] = useState<Array<{
    id: string;
    equipment_type_name: string | null;
    equipment_brand_name: string | null;
    equipment_model_name: string | null;
    serial_number: string | null;
  }>>([]);
  const [newConversationOpen, setNewConversationOpen] = useState(false);
  const [newConversationStarter, setNewConversationStarter] = useState<{ phone: string; name: string } | null>(null);

  const [status, setStatus] = useState<SacDigitalIntegrationStatus | null>(null);
  const [protocols, setProtocols] = useState<SacDigitalProtocolListItem[]>([]);
  const [finishedProtocolCount, setFinishedProtocolCount] = useState(0);
  const [selectedProtocolId, setSelectedProtocolId] = useState<string | null>(null);
  const [messages, setMessages] = useState<SacDigitalMessage[]>([]);
  const [messagesIdentity, setMessagesIdentity] = useState("");
  const [outboxVersion, setOutboxVersion] = useState(0);
  const [messageOutbox] = useState(() => new SacMessageOutbox({ onChange: () => setOutboxVersion(value => value + 1) }));
  const messageContext = useMemo(() => ({
    organizationId: activeOrganizationId || "", userId: user?.id || "", protocolId: selectedProtocolId || "",
  }), [activeOrganizationId, user?.id, selectedProtocolId]);
  const { text: draft, file: attachment } = messageOutbox.composer(messageContext);
  const setDraft = (text: string) => messageOutbox.compose(messageContext, { text });
  const setAttachment = (file: File | null) => messageOutbox.compose(messageContext, { file });
  const visibleMessages = useMemo(() => messageOutbox.visible(messageContext,
    messagesIdentity === JSON.stringify([activeOrganizationId, user?.id]) ? messages : []),
  [messageOutbox, messageContext, messages, messagesIdentity, activeOrganizationId, user?.id, outboxVersion]);
  const currentIdentityRef = useRef("");
  currentIdentityRef.current = JSON.stringify([activeOrganizationId, user?.id]);
  const [conversationSearch, setConversationSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"self_service" | "waiting" | "in_att" | "finished" | "inbox" | "abandoned">("waiting");
  const [operatorFilter, setOperatorFilter] = useState("all");
  const [waitingProtocolIds, setWaitingProtocolIds] = useState<string[]>([]);
  const [queueError, setQueueError] = useState("");
  const [queueAuthRequired, setQueueAuthRequired] = useState(false);
  const [authorizingOperator, setAuthorizingOperator] = useState(false);
  const oauthResultHandledRef = useRef('');
  const queueRequestIdRef = useRef(0);
  const protocolsRequestIdRef = useRef(0);
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const setMessage = useCallback((next: { text: string; error?: boolean } | null) => {
    if (!next?.text) return;
    notifyAdmin(next.text, next.error ? "error" : "success");
  }, []);
  const [incomingAlert, setIncomingAlert] = useState<{ protocolId: string } | null>(null);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const messagesScrollRef = useRef<HTMLDivElement | null>(null);
  const mediaInputRef = useRef<HTMLInputElement | null>(null);
  const selectedProtocolIdRef = useRef<string | null>(null);
  const messagesRequestIdRef = useRef(0);
  const followLatestRef = useRef(true);
  const lastResumeRefreshRef = useRef(0);
  const activePendingContactIdRef = useRef<string | null>(null);
  const handledCustomerRouteRef = useRef("");

  const selectProtocol = useCallback((protocolId: string | null) => {
    if (selectedProtocolIdRef.current === protocolId) return;
    selectedProtocolIdRef.current = protocolId;
    messagesRequestIdRef.current += 1;
    followLatestRef.current = true;
    setShowJumpToLatest(false);
    setMessages([]);
    setMessagesLoading(Boolean(protocolId));
    setSelectedProtocolId(protocolId);
  }, []);

  const scrollToLatest = useCallback((behavior: ScrollBehavior = "auto") => {
    followLatestRef.current = true;
    setShowJumpToLatest(false);
    window.requestAnimationFrame(() => {
      const container = messagesScrollRef.current;
      if (!container) return;
      container.scrollTo({ top: container.scrollHeight, behavior });
    });
  }, []);

  const handleMessagesScroll = useCallback(() => {
    const container = messagesScrollRef.current;
    if (!container) return;
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    const atLatest = distanceFromBottom <= 72;
    followLatestRef.current = atLatest;
    setShowJumpToLatest(!atLatest);
  }, []);

  useEffect(() => {
    selectedProtocolIdRef.current = selectedProtocolId;
  }, [selectedProtocolId]);

  const selectedProtocolRaw = useMemo(
    () => protocols.find(protocol => protocol.id === selectedProtocolId) || null,
    [protocols, selectedProtocolId],
  );

  useEffect(() => {
    if (selectedProtocolRaw?.is_pending) {
      activePendingContactIdRef.current = selectedProtocolRaw.contact?.id || null;
    } else if (selectedProtocolRaw) {
      activePendingContactIdRef.current = null;
    }
  }, [selectedProtocolRaw]);

  const waitingProtocolSet = useMemo(
    () => new Set(waitingProtocolIds),
    [waitingProtocolIds],
  );

  const isSacManager = operatorBinding?.linked && operatorBinding.access_mode === "manager";

  const visibleProtocols = useMemo(() => {
    if (isSacManager) return protocols;

    const linkedOperatorId = operatorBinding?.linked && operatorBinding.access_mode === "operator"
      ? operatorBinding.operator?.id || ""
      : "";
    if (!linkedOperatorId) return [];

    return protocols.filter(protocol => {
      const operationalStatus = protocolOperationalStatus(protocol, waitingProtocolSet);
      if (operationalStatus === "waiting" || operationalStatus === "pending" || operationalStatus === "inbox" || operationalStatus === "abandoned") return true;
      return protocol.operator_id === linkedOperatorId;
    });
  }, [isSacManager, operatorBinding, protocols, waitingProtocolSet]);

  const selectedProtocol = useMemo(
    () => visibleProtocols.find(protocol => protocol.id === selectedProtocolId) || null,
    [selectedProtocolId, visibleProtocols],
  );

  useEffect(() => {
    if (!selectedProtocolId || selectedProtocol) return;
    selectProtocol(null);
  }, [selectProtocol, selectedProtocol, selectedProtocolId]);

  const operatorFilterOptions = useMemo(
    () => Array.from(new Set(
      visibleProtocols
        .map(protocol => protocol.operator_name?.trim() || "")
        .filter(Boolean),
    )).sort((left, right) => left.localeCompare(right, "pt-BR")),
    [visibleProtocols],
  );

  const unreadConversationCount = useMemo(
    () => visibleProtocols.filter(protocol => Number(unreadCounts[protocol.id] || 0) > 0).length,
    [unreadCounts, visibleProtocols],
  );

  const statusCounts = useMemo(() => {
    const counts = { self_service: 0, waiting: 0, in_att: 0, finished: 0, inbox: 0, abandoned: 0 };
    for (const protocol of visibleProtocols) {
      const operationalStatus = protocolOperationalStatus(protocol, waitingProtocolSet);
      if (operationalStatus === "self_service") counts.self_service += 1;
      else if (operationalStatus === "waiting" || operationalStatus === "pending") counts.waiting += 1;
      else if (operationalStatus === "in_att") counts.in_att += 1;
      else if (operationalStatus === "abandoned") counts.abandoned += 1;
      else if (operationalStatus === "inbox") counts.inbox += 1;
      else counts.finished += 1;
    }
    counts.finished = Math.max(counts.finished, finishedProtocolCount);
    return counts;
  }, [finishedProtocolCount, visibleProtocols, waitingProtocolSet]);

  const filteredProtocols = useMemo(() => {
    const query = conversationSearch.trim().toLocaleLowerCase("pt-BR");
    return visibleProtocols.filter(protocol => {
      const matchesSearch = !query || [
        protocolDisplayName(protocol),
        protocol.contact?.phone || "",
        protocol.external_protocol_id,
        protocol.department_name || "",
        protocol.operator_name || "",
      ].join(" ").toLocaleLowerCase("pt-BR").includes(query);

      const operationalStatus = protocolOperationalStatus(protocol, waitingProtocolSet);
      const matchesStatus = statusFilter === "waiting"
        ? operationalStatus === "waiting" || operationalStatus === "pending"
        : operationalStatus === statusFilter;

      const matchesOperator = operatorFilter === "all"
        || (operatorFilter === "unassigned" && !protocol.operator_name)
        || protocol.operator_name === operatorFilter;

      return matchesSearch && matchesStatus && matchesOperator;
    });
  }, [conversationSearch, operatorFilter, statusFilter, visibleProtocols, waitingProtocolSet]);

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

  const loadProtocols = useCallback(async (showLoading = false,fresh = false) => {
    const requestId=++protocolsRequestIdRef.current;
    if (!activeOrganizationId || !canViewMessages) {
      setProtocols([]);
      selectProtocol(null);
      return;
    }
    if (showLoading) setInboxLoading(true);
    try {
      const [next, totalFinished] = await Promise.all([
        listSacDigitalProtocols(activeOrganizationId,fresh,user?.id || ""),
        getSacDigitalFinishedProtocolCount(activeOrganizationId),
      ]);
      if(requestId!==protocolsRequestIdRef.current)return;
      setFinishedProtocolCount(totalFinished);
      const currentSelectedId = selectedProtocolIdRef.current;
      let resolvedSelectedId: string | null = null;

      // Uma conversa escolhida pelo usuário nunca deve trocar por causa de refresh/realtime.
      // A única troca automática permitida é a conversa pendente virar o protocolo real
      // do mesmo contato.
      if (currentSelectedId?.startsWith("pending:") && activePendingContactIdRef.current) {
        const resolved = next.find(protocol =>
          !protocol.is_pending && protocol.contact?.id === activePendingContactIdRef.current,
        );
        resolvedSelectedId = resolved?.id || null;
      }

      setProtocols(currentProtocols => {
        const selectedIdToKeep = resolvedSelectedId || currentSelectedId;
        if (!selectedIdToKeep || next.some(protocol => protocol.id === selectedIdToKeep)) return next;
        if (!isSacManager) return next;
        const previousSelected = currentProtocols.find(protocol => protocol.id === selectedIdToKeep);
        return previousSelected ? [previousSelected, ...next] : next;
      });

      if (resolvedSelectedId && resolvedSelectedId !== currentSelectedId) {
        selectProtocol(resolvedSelectedId);
      }
    } catch (error) {
      if(requestId!==protocolsRequestIdRef.current)return;
      setMessage({
        text: systemErrorMessage(error, "Não foi possível carregar as conversas do SAC Digital."),
        error: true,
      });
    } finally {
      if (requestId===protocolsRequestIdRef.current) setInboxLoading(false);
    }
  }, [activeOrganizationId, canViewMessages, isSacManager, selectProtocol,user?.id]);

  const loadMessages = useCallback(async (protocolId: string | null, showLoading = false) => {
    if (protocolId && selectedProtocolIdRef.current !== protocolId) return;
    const identity = JSON.stringify([activeOrganizationId, user?.id]);
    if (currentIdentityRef.current !== identity) return;
    const requestId = ++messagesRequestIdRef.current;
    if (!activeOrganizationId || !canViewMessages || !protocolId) {
      setMessages([]);
      if (showLoading) setMessagesLoading(false);
      return;
    }
    if (showLoading) setMessagesLoading(true);
    try {
      const next = await listSacDigitalMessages(activeOrganizationId, protocolId);
      if (currentIdentityRef.current !== identity || requestId !== messagesRequestIdRef.current || selectedProtocolIdRef.current !== protocolId) return;
      setMessagesIdentity(identity);
      setMessages(next);
    } catch (error) {
      if (currentIdentityRef.current !== identity || requestId !== messagesRequestIdRef.current || selectedProtocolIdRef.current !== protocolId) return;
      setMessage({
        text: systemErrorMessage(error, "Não foi possível carregar as mensagens deste atendimento."),
        error: true,
      });
    } finally {
      if (currentIdentityRef.current === identity && requestId === messagesRequestIdRef.current) setMessagesLoading(false);
    }
  }, [activeOrganizationId, canViewMessages, user?.id]);


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

  const authorizeOperator = async () => {
    if(!activeOrganizationId || authorizingOperator) return;
    setAuthorizingOperator(true);
    try {
      const url=await beginSacOperatorAuthorization(activeOrganizationId,location.pathname);
      window.location.assign(url);
    } catch(error) {
      setMessage({text:systemErrorMessage(error,'Não foi possível iniciar a autorização SAC.'),error:true});
      setAuthorizingOperator(false);
    }
  };

  useEffect(() => { queueRequestIdRef.current++; setQueueError(""); setQueueAuthRequired(false); setWaitingProtocolIds([]); return()=>{queueRequestIdRef.current++;}; }, [activeOrganizationId,user?.id, operatorBinding?.access_mode, operatorBinding?.operator?.id]);
  useEffect(()=>{protocolsRequestIdRef.current++;return()=>{protocolsRequestIdRef.current++;};},[activeOrganizationId,user?.id]);

  const loadOperatorQueue = useCallback(async (fresh = false) => {
    const requestId=++queueRequestIdRef.current;
    if (!activeOrganizationId || !canManageProtocols || operatorBinding?.access_mode !== "operator" || !operatorBinding.operator?.id || !status?.enabled) {
      setWaitingProtocolIds([]);
      return;
    }
    try {
      const queue = await listSacDigitalOperatorQueue(activeOrganizationId,fresh,`${user?.id || ""}:${operatorBinding.operator.id}`);
      if(requestId!==queueRequestIdRef.current)return;
      setWaitingProtocolIds(queue.map(item => item.protocol));
      setQueueError("");
      setQueueAuthRequired(false);
    } catch (error) {
      if(requestId!==queueRequestIdRef.current)return;
      setWaitingProtocolIds([]);
      setQueueError(systemErrorMessage(error, "Não foi possível confirmar a fila operacional da SAC Digital."));
      setQueueAuthRequired(isOperatorAuthError(error));
    }
  }, [activeOrganizationId,user?.id, canManageProtocols, operatorBinding?.access_mode, operatorBinding?.operator?.id, status?.enabled]);

  useEffect(() => {
    const params=new URLSearchParams(location.search);
    const result=params.get('sac_oauth');
    if(!result || !activeOrganizationId || oauthResultHandledRef.current===location.search) return;
    if(params.get('sac_oauth_org')!==activeOrganizationId) {
      setMessage({text:'A autorização SAC foi concluída em outra empresa. Selecione a empresa em que iniciou a autorização.',error:true});
      return;
    }
    oauthResultHandledRef.current=location.search;
    const errors:Record<string,string>={
      access_denied:'Você recusou a autorização na SAC. Clique em Autorizar Operador para tentar novamente.',
      operator_identity_mismatch:'A conta autorizada na SAC é de outro Operador. Entre com o Operador vinculado ao seu usuário da Union.',
      operator_profile_incompatible:'A SAC não aceitou a conta como Operador. Autorize usando sua conta de Operador de atendimento.',
      operator_scope_missing:'A SAC não concedeu as permissões de atendimento solicitadas.',
      operator_session_unavailable:'A Central SAC está indisponível. Inicie uma nova autorização.',
      operator_session_busy:'A sessão do Operador está em uso. Aguarde um momento e clique em Autorizar Operador novamente.',
      operator_auth_contract_unverified:'A SAC não confirmou a identificação do perfil. A autorização não foi salva.',
      operator_authorization_required:'A SAC não identificou um Operador nessa autorização. Entre com sua conta de Operador.',
    };
    setMessage({text:result==='success'?'Operador autorizado na SAC Digital.':errors[result] || 'A autorização não foi concluída. Clique em Autorizar Operador para tentar novamente.',error:result!=='success'});
    params.delete('sac_oauth');params.delete('sac_oauth_org');
    navigate({pathname:location.pathname,search:params.toString()?`?${params.toString()}`:''},{replace:true});
    if(result==='success') {setQueueAuthRequired(false);setQueueError('');void loadOperatorQueue();}
  },[activeOrganizationId,location.pathname,location.search,navigate,setMessage,loadOperatorQueue]);

  useEffect(() => {
    if (!activeOrganizationId || !canManageProtocols || operatorBinding?.access_mode !== "operator" || !operatorBinding.operator?.id || !status?.enabled) {
      setWaitingProtocolIds([]);
      return;
    }
    if (queueAuthRequired) return;
    void loadOperatorQueue();
    const timer = window.setInterval(() => void loadOperatorQueue(), 30_000);
    return () => window.clearInterval(timer);
  }, [activeOrganizationId, canManageProtocols, loadOperatorQueue, operatorBinding?.access_mode, operatorBinding?.operator?.id, queueAuthRequired, status?.enabled]);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void initializeSacScreen({
      loadStatus, loadProtocols: () => loadProtocols(true), loadUnreadCounts,
      onReady: () => { if (!alive) return false; setLoading(false); },
    });
    return () => {
      alive = false;
    };
  }, [loadProtocols, loadStatus, loadUnreadCounts]);

  useEffect(() => {
    if (loading || !activeOrganizationId || !routeCustomerId) return;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(routeCustomerId)) {
      setMessage({ text: "Cliente informado no link da OS é inválido.", error: true });
      return;
    }
    const targetKey = `${activeOrganizationId}:${routeCustomerId}`;
    if (handledCustomerRouteRef.current === targetKey) return;
    handledCustomerRouteRef.current = targetKey;

    const match = visibleProtocols.find(item => item.contact?.customer_id === routeCustomerId
      && !item.is_pending && item.status !== "finished")
      || visibleProtocols.find(item => item.contact?.customer_id === routeCustomerId && item.is_pending);

    if (match) {
      selectProtocol(match.id);
      setConversationSearch("");
      setStatusFilter(match.status === "in_att" ? "in_att" : "waiting");
      setOperatorFilter("all");
      return;
    }

    if (!canSendMessages || !canViewCustomers || !status?.enabled) {
      setMessage({
        text: "Não há protocolo ativo deste cliente. Para iniciar uma conversa, você precisa de acesso aos clientes e permissão de envio, com o SAC habilitado.",
        error: true,
      });
      return;
    }

    let cancelled = false;
    void (async () => {
      const { data: customer, error } = await supabase
        .from("customers")
        .select("id,full_name,trade_name,legal_name,phone,whatsapp")
        .eq("organization_id", activeOrganizationId)
        .eq("id", routeCustomerId)
        .maybeSingle();
      if (cancelled) return;
      if (error || !customer) {
        setMessage({ text: "Não foi possível localizar o cliente desta OS nesta empresa.", error: true });
        return;
      }
      const phone = String(customer.whatsapp || customer.phone || "").trim();
      if (!phone) {
        setMessage({ text: "O cliente não tem telefone cadastrado para iniciar o atendimento.", error: true });
        return;
      }

      // O protocolo pode ter chegado pelo webhook antes de existir vinculo no CRM.
      // Nao abrir automaticamente conversa de outro cliente, mesmo com telefone igual.
      const byPhone = visibleProtocols.filter(item => item.status !== "finished"
        && item.contact?.phone
        && (!item.contact.customer_id || item.contact.customer_id === routeCustomerId)
        && sacContactPhoneMatch(item.contact.phone, phone));
      if (byPhone.length === 1) {
        selectProtocol(byPhone[0].id);
        setConversationSearch("");
        setStatusFilter(byPhone[0].status === "in_att" ? "in_att" : "waiting");
        setOperatorFilter("all");
        return;
      }
      if (byPhone.length > 1) {
        setConversationSearch(phone.replace(/\D/g, "").slice(-8));
        setStatusFilter("waiting");
        setOperatorFilter("all");
        setMessage({
          text: "Encontramos mais de um atendimento com este telefone. Selecione a conversa correta na lista.",
        });
        return;
      }

      setNewConversationStarter({
        phone,
        name: String(customer.trade_name || customer.full_name || customer.legal_name || "").trim(),
      });
      setNewConversationOpen(true);
    })();
    return () => { cancelled = true; };
  }, [activeOrganizationId, canSendMessages, canViewCustomers, loading, routeCustomerId, status?.enabled, visibleProtocols]);

  useEffect(() => {
    let cancelled = false;
    if (!activeOrganizationId || !canViewMessages || !status?.enabled) {
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
  }, [activeOrganizationId, canViewMessages, status?.enabled]);

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
        if (!cancelled) {
          setUnreadCounts(current => ({ ...current, [selectedProtocolId]: 0 }));
        }
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
    if (!activeOrganizationId || !canViewMessages) return;
    let updating = false;
    let cancelled = false;

    const refreshWhenActive = async () => {
      if (document.visibilityState === "hidden" || updating) return;
      const now = Date.now();
      // Sem polling: atualizar ao voltar para a aba, no maximo a cada 60s.
      if (now - lastResumeRefreshRef.current < 60_000) return;
      lastResumeRefreshRef.current = now;
      updating = true;
      try {
        if (status?.enabled && selectedProtocol?.external_protocol_id && !selectedProtocol.is_pending) {
          await refreshSacDigitalProtocol(activeOrganizationId, selectedProtocol.external_protocol_id);
          if (!cancelled) await loadMessages(selectedProtocol.id, false);
        }
        if (!cancelled) await Promise.all([loadProtocols(false), loadUnreadCounts()]);
      } catch {
        // O historico local segue acessivel quando nao ha conexao com a SAC.
      } finally {
        updating = false;
      }
    };

    // Realtime cuida do uso normal. Esta reconciliação existe somente para
    // recuperar eventos perdidos quando a aba volta ao foco.
    window.addEventListener("focus", refreshWhenActive);
    document.addEventListener("visibilitychange", refreshWhenActive);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", refreshWhenActive);
      document.removeEventListener("visibilitychange", refreshWhenActive);
    };
  }, [activeOrganizationId, canViewMessages, loadMessages, loadProtocols, loadUnreadCounts,
    selectedProtocol?.external_protocol_id, selectedProtocol?.id, selectedProtocol?.is_pending, status?.enabled]);

  useEffect(() => {
    if (moduleSection !== "conversations" || !selectedProtocolId) return;
    followLatestRef.current = true;
    setShowJumpToLatest(false);
    const frame = window.requestAnimationFrame(() => {
      const container = messagesScrollRef.current;
      if (container) container.scrollTop = container.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [moduleSection, selectedProtocolId]);

  useEffect(() => {
    if (moduleSection !== "conversations" || !selectedProtocolId || messagesLoading) return;
    if (!followLatestRef.current) {
      if (visibleMessages.length > 0) setShowJumpToLatest(true);
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      const container = messagesScrollRef.current;
      if (container) container.scrollTop = container.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [visibleMessages.length, messagesLoading, moduleSection, selectedProtocolId]);

  useEffect(() => {
    if (!activeOrganizationId || !canViewMessages) return;

    let selectedMessagesChanged = false;
    let unreadCountsChanged = false;
    let inboxChanged = false;
    const refreshQueue = createRefreshQueue(async () => {
      const refreshSelected = selectedMessagesChanged;
      const refreshUnread = unreadCountsChanged;
      selectedMessagesChanged = false;
      unreadCountsChanged = false;

      const refreshInbox = inboxChanged;
      inboxChanged = false;
      await Promise.all([
        refreshInbox ? loadProtocols(false) : Promise.resolve(),
        refreshSelected && selectedProtocolId ? loadMessages(selectedProtocolId, false).then(async () => {
          try { await markSacDigitalProtocolRead(activeOrganizationId, selectedProtocolId); } catch { /* Retry on the next update. */ }
        }) : Promise.resolve(),
        refreshUnread ? loadUnreadCounts() : Promise.resolve(),
      ]);
    }, 250);
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
          inboxChanged = true;
          refreshQueue.request();
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
          const changedProtocolId = String((payload.new as any)?.protocol_id || (payload.old as any)?.protocol_id || "");
          const newMessage = payload.new as any;
          const changes = liveMessageChanges(payload, selectedProtocolId);
          selectedMessagesChanged ||= changes.selected;
          unreadCountsChanged ||= changes.unread;
          inboxChanged ||= changes.inbox;
          if (changes.selected || changes.unread || changes.inbox) refreshQueue.request();

          if (payload.eventType === "INSERT" && newMessage?.direction === "incoming"
            && changedProtocolId && changedProtocolId !== selectedProtocolId) {
            setIncomingAlert({ protocolId: changedProtocolId });
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
          inboxChanged = true;
          refreshQueue.request();
        },
      )
      .subscribe();

    return () => {
      refreshQueue.dispose();
      void supabase.removeChannel(realtime);
      void supabase.removeChannel(pendingRealtime);
    };
  }, [activeOrganizationId, canViewMessages, loadMessages, loadProtocols, loadUnreadCounts, selectedProtocolId]);

  const sendMessage = async () => {
    if (!activeOrganizationId || !user?.id || !selectedProtocol || !canSendMessages
      || protocolOperationalStatus(selectedProtocol, waitingProtocolSet) !== "in_att"
      || selectedProtocol.is_pending || !status?.enabled) return;
    const context = {
      ...messageContext, externalProtocolId: selectedProtocol.external_protocol_id,
      senderName: operatorBinding?.operator?.name || selectedProtocol.operator_name || null,
    };
    const identity = currentIdentityRef.current;
    const submission = messageOutbox.send(context, entry => {
      if (currentIdentityRef.current !== identity) {
        throw Object.assign(new Error("Envio cancelado porque a empresa ou o usuário mudou."), { outcome: "rejected" });
      }
      return entry.file
        ? sendSacDigitalMediaMessage(context.organizationId, context.externalProtocolId, entry.file, entry.text, undefined, undefined, entry.id)
        : sendSacDigitalTextMessage(context.organizationId, context.externalProtocolId, entry.text, entry.id);
    });
    if (!submission) return;
    if (mediaInputRef.current) mediaInputRef.current.value = "";
    scrollToLatest("smooth");
    await submission.done;
    // Completion belongs to the original conversation. It never consumes a new
    // draft, scrolls another protocol, or changes another organization's inbox.
    if (currentIdentityRef.current !== identity) return;
    if (submission.state === "failed" || submission.state === "unknown") {
      if (selectedProtocolIdRef.current === context.protocolId) {
        setMessage({ text: submission.state === "unknown"
          ? "Confirmação da mensagem pendente. Aguarde a atualização do histórico."
          : systemErrorMessage(new Error(submission.error), "Não foi possível enviar a mensagem pela SAC Digital."), error: true });
      }
    }
    void Promise.all([
      selectedProtocolIdRef.current === context.protocolId ? loadMessages(context.protocolId, false) : Promise.resolve(),
      loadProtocols(false),
    ]).catch(() => {});
  };

  const reloadSelectedProtocol = async () => {
    if (!selectedProtocol) return;
    await Promise.all([
      loadProtocols(false,true),
      loadMessages(selectedProtocol.id, false),
      loadOperatorQueue(true),
    ]);
  };


  const handleNewConversationStarted = async (result: {
    protocol: string | null;
    pending_start_id: string | null;
  }) => {
    if (!activeOrganizationId) return;

    // A nova conversa deve ficar visivel mesmo com filtros anteriores ativos.
    setConversationSearch("");
    setStatusFilter("waiting");
    setOperatorFilter("all");

    const protocol = result.protocol;
    if (!protocol) {
      await loadProtocols(false);
      if (result.pending_start_id) {
        selectProtocol(`pending:${result.pending_start_id}`);
      }
      setMessage({
        text: result.pending_start_id
          ? "Mensagem inicial aceita pela SAC. A conversa está na lista como aguardando protocolo."
          : "Mensagem aceita pela SAC Digital; a confirmação de entrega e o registro pendente ainda não está disponível na Union. O protocolo aparecerá quando a SAC o criar.",
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
      selectProtocol(foundId);
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
      setCustomerEquipments([]);
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
    if (!activeOrganizationId || !customerId || (!canViewOrders && !canViewCustomers)) return;

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
      const [orders, equipments] = await Promise.all([
        canViewOrders ? listSacDigitalCustomerOrders(activeOrganizationId, customerId) : Promise.resolve([]),
        canViewCustomers ? listCustomerEquipments(activeOrganizationId, customerId) : Promise.resolve([]),
      ]);
      setCustomerOrders(orders);
      setCustomerEquipments(equipments);
    } catch (error) {
      setMessage({
        text: systemErrorMessage(error, "Não foi possível carregar o resumo deste cliente."),
        error: true,
      });
    } finally {
      setCustomerOrdersLoading(false);
    }
  };

  const loadRoutingOptionsIfNeeded = async () => {
    if (routingOptions) return routingOptions;
    if (!activeOrganizationId || !selectedProtocol) return null;
    const identity = currentIdentityRef.current;
    const protocolId = selectedProtocol.id;
    const options = await getSacDigitalRoutingOptions(activeOrganizationId, selectedProtocol.external_protocol_id);
    if (currentIdentityRef.current !== identity || selectedProtocolIdRef.current !== protocolId) return null;
    setRoutingOptions(options);
    return options;
  };

  const assumeProtocol = async () => {
    if (!activeOrganizationId || !selectedProtocol || !canManageProtocols || protocolAction) return;

    setProtocolAction("assume");
    queueRequestIdRef.current++;
    protocolsRequestIdRef.current++;
    setMessage(null);
    try {
      const result = await assumeSacDigitalProtocol(
        activeOrganizationId,
        selectedProtocol.external_protocol_id,
      );
      await refreshSacDigitalProtocol(activeOrganizationId, selectedProtocol.external_protocol_id);
      const operator = result.operator && typeof result.operator === "object"
        ? result.operator as { id: string; name: string }
        : null;
      if (operator) {
        setOperatorBinding({ linked: true, access_mode: "operator", operator });
      }
      setMessage({ text: "Atendimento selecionado. Ele saiu da fila e está em atendimento com você." });
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
    queueRequestIdRef.current++;
    protocolsRequestIdRef.current++;
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
    queueRequestIdRef.current++;
    protocolsRequestIdRef.current++;
    setMessage(null);
    try {
      await returnSacDigitalProtocolToQueue(
        activeOrganizationId,
        selectedProtocol.external_protocol_id,
      );
      setRoutingOpen(false);
      setFinishConfirmOpen(false);
      setMessage({ text: "Atendimento devolvido para a fila do departamento." });
      await reloadSelectedProtocol();
    } catch (error) {
      setMessage({
        text: systemErrorMessage(error, "Não foi possível devolver o atendimento para a fila."),
        error: true,
      });
    } finally {
      setProtocolAction(null);
    }
  };

  const finishProtocol = async () => {
    if (!activeOrganizationId || !selectedProtocol || !canManageProtocols || protocolAction || !finishVote) return;
    setProtocolAction("finish");
    queueRequestIdRef.current++;
    protocolsRequestIdRef.current++;
    setMessage(null);
    try {
      await finishSacDigitalProtocol(
        activeOrganizationId,
        selectedProtocol.external_protocol_id,
        Number(finishVote),
      );
      setFinishConfirmOpen(false);
      setFinishVote("");
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
    if (mediaInputRef.current) mediaInputRef.current.value = "";
    setRoutingOpen(false);
    setRoutingOptions(null);
    setCustomerLinkOpen(false);
    setQuickCustomerOpen(false);
    setOrdersPanelOpen(false);
    setCustomerOrders([]);
    setCustomerEquipments([]);
    setFinishConfirmOpen(false);
    setDepartmentId("");
    setOperatorId("");
    setCustomerSearch("");
    setCustomerResults([]);
  }, [selectedProtocolId, activeOrganizationId, user?.id]);

  const selectedOperationalStatus = selectedProtocol
    ? protocolOperationalStatus(selectedProtocol, waitingProtocolSet)
    : null;

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
      initialContact={newConversationStarter}
      onClose={() => {
        setNewConversationOpen(false);
        setNewConversationStarter(null);
      }}
      onStarted={handleNewConversationStarted}
    />

    <PageHeader
      title="SAC Digital"
      subtitle="Atendimento integrado à SAC Digital."
      actions={
        <>
          {canSendMessages && status?.enabled && (
            <AdminButton onClick={() => {
              setNewConversationStarter(null);
              setNewConversationOpen(true);
            }}>
              Nova conversa
            </AdminButton>
          )}
          {operatorBinding?.linked && operatorBinding.access_mode === 'operator' && status?.enabled && (
            <AdminButton variant="secondary" disabled={authorizingOperator} onClick={() => void authorizeOperator()}>{authorizingOperator ? 'Abrindo SAC...' : 'Autorizar Operador'}</AdminButton>
          )}
          <BtnSecondary onClick={onBack}>Voltar</BtnSecondary>
          {canManage && onOpenSettings && (
            <AdminButton variant="secondary" onClick={onOpenSettings}>Configurações</AdminButton>
          )}

        </>
      }
    />

    <AdminSubnav value={moduleSection} items={SAC_MODULE_SECTIONS} onSelect={setModuleSection} ariaLabel="Seções do SAC Digital" />
    {(moduleSection === 'contacts' || moduleSection === 'whatsapp_groups') &&
      <Suspense fallback={<LoadingState text="Carregando..." />}>
        <SacDigitalResources key={moduleSection} organizationId={activeOrganizationId} hasPermission={hasPermission}
          initialArea={moduleSection === 'contacts' ? 'Contatos' : 'Grupos de WhatsApp'} />
      </Suspense>}


    {incomingAlert && (() => {
      const target = visibleProtocols.find(protocol => protocol.id === incomingAlert.protocolId) || null;
      const targetName = target ? protocolDisplayName(target) : "novo contato";
      return (
        <div
          className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom,0px))] right-4 z-[295] w-[calc(100%-2rem)] max-w-sm rounded-xl border border-border bg-card p-4 text-foreground shadow-[0_18px_45px_rgba(13,27,46,0.22)] sm:bottom-5 sm:right-5"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
              <MessageCircle size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-black text-foreground">Nova mensagem recebida</p>
              <p className="mt-0.5 truncate text-xs text-muted-foreground">{targetName}</p>
            </div>
            <button
              type="button"
              onClick={() => setIncomingAlert(null)}
              className="shrink-0 rounded-md p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
              aria-label="Fechar notificação"
              title="Fechar"
            >
              <X size={16} />
            </button>
          </div>
          <div className="mt-3 flex justify-end">
            <AdminButton
              size="sm"
              onClick={() => {
                const targetStatus = target ? protocolOperationalStatus(target, waitingProtocolSet) : "waiting";
                selectProtocol(incomingAlert.protocolId);
                setConversationSearch("");
                setStatusFilter(targetStatus === "pending" ? "waiting" : targetStatus);
                setOperatorFilter("all");
                setIncomingAlert(null);
              }}
            >
              Abrir conversa
            </AdminButton>
          </div>
        </div>
      );
    })()}

    {!status?.enabled && (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300">
        A integração SAC Digital está desativada. As conversas salvas continuam visíveis, mas novos envios ficam bloqueados.
      </div>
    )}

    {moduleSection === "conversations" && <div className="h-[680px] overflow-hidden rounded-none border border-border bg-card shadow-sm">
      {!canViewMessages ? (
        <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">
          Sua função não possui permissão para visualizar conversas do SAC Digital.
        </div>
      ) : inboxLoading && visibleProtocols.length === 0 ? (
        <div className="flex h-full items-center justify-center p-6">
          <LoadingState text="Carregando conversas..." />
        </div>
      ) : visibleProtocols.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
          <MessageCircle size={32} className="text-muted-foreground" />
          <p className="text-sm font-black text-foreground">
            {isSacManager ? "Nenhum atendimento recebido" : operatorBinding?.linked ? "Nenhuma conversa atribuída a você" : "Perfil SAC não vinculado"}
          </p>
          <p className="max-w-md text-xs leading-5 text-muted-foreground">
            {isSacManager
              ? "Como Gestor SAC, você acompanha todas as conversas da empresa."
              : operatorBinding?.linked
                ? "Como Operador SAC, você verá a fila disponível e somente as conversas atribuídas ao seu operador."
                : "Peça a um administrador da Union para definir seu Perfil SAC Digital nas configurações."}
          </p>
        </div>
      ) : (
        <div className="grid h-full min-h-0 grid-rows-[280px_minmax(0,1fr)] md:grid-cols-[340px_minmax(0,1fr)] md:grid-rows-1">
          <aside className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden border-b border-border bg-card md:border-b-0 md:border-r">
            <div className="border-b border-border bg-muted/35 p-3">
              <div className="min-w-0">
                <p className="text-base font-black text-foreground">Conversas</p>
                <p className="text-[10px] text-muted-foreground">
                  {statusCounts.self_service + statusCounts.waiting + statusCounts.in_att + statusCounts.inbox + statusCounts.abandoned} ativa(s) · {statusCounts.finished} finalizada(s){unreadConversationCount > 0 ? ` · ${unreadConversationCount} não lida(s)` : ""}
                </p>
              </div>
              {queueError && (
                <div role="alert" className="mt-3 border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-foreground">
                  <p>{queueAuthRequired ? "Autorize sua conta de Operador na SAC Digital para acessar a fila e atender pela Union." : queueError}</p>
                  <p className="mt-2">A fila Aguardando será exibida quando a SAC confirmar a sessão operacional.</p>
                  {queueAuthRequired
                    ? <button type="button" disabled={authorizingOperator} className="mt-2 font-bold underline disabled:opacity-50" onClick={() => void authorizeOperator()}>{authorizingOperator ? 'Abrindo SAC...' : 'Autorizar Operador'}</button>
                    : <button type="button" className="mt-2 font-bold underline" onClick={() => void loadOperatorQueue()}>Verificar sessão novamente</button>}
                </div>
              )}
              <div className="mt-3 grid grid-cols-3 overflow-hidden rounded-lg border border-border bg-card">
                {(isSacManager
                  ? ([
                      ["self_service", "Auto", statusCounts.self_service],
                      ["waiting", "Aguardando", statusCounts.waiting],
                      ["in_att", "Em atendimento", statusCounts.in_att],
                      ["abandoned", "Abandonados", statusCounts.abandoned],
                      ["inbox", "Recados", statusCounts.inbox],
                      ["finished", "Finalizadas", statusCounts.finished],
                    ] as const)
                  : ([
                      ["waiting", "Aguardando", statusCounts.waiting],
                      ["in_att", "Em atendimento", statusCounts.in_att],
                      ["abandoned", "Abandonados", statusCounts.abandoned],
                      ["inbox", "Recados", statusCounts.inbox],
                      ["finished", "Finalizadas", statusCounts.finished],
                    ] as const)
                ).map(([value, label, count]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setStatusFilter(value)}
                    className={`min-w-0 border-r border-border px-2 py-2 text-center text-[10px] font-bold transition-colors last:border-r-0 ${statusFilter === value ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}
                  >
                    <span className="block truncate">{label}</span>
                    <span className="mt-0.5 block text-xs font-black">{count}</span>
                  </button>
                ))}
              </div>
              <div className="mt-3"><FInput label="Buscar conversa" aria-label="Buscar conversa" value={conversationSearch} onChange={(event: any) => setConversationSearch(event.target.value)} placeholder="Nome, telefone ou protocolo" /></div>
              {isSacManager && (
                <div className="mt-3">
                  <FSelect label="Atendente" value={operatorFilter} onChange={(event: any) => setOperatorFilter(event.target.value)} options={[
                    {value:'all',label:'Todos'}, {value:'unassigned',label:'Sem atendente'}, ...operatorFilterOptions.map(name=>({value:name,label:name})),
                  ]} />
                </div>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
              {statusFilter === "finished" && finishedProtocolCount > visibleProtocols.filter(protocol => protocolOperationalStatus(protocol, waitingProtocolSet) === "finished").length && (
                <div className="border-b border-border bg-muted/25 px-3 py-2 text-[10px] text-muted-foreground">
                  Mostrando as finalizadas mais recentes. Total no histórico: {finishedProtocolCount}.
                </div>
              )}
              {filteredProtocols.length === 0 ? (
                <div className="p-5 text-center text-xs text-muted-foreground">
                  Nenhuma conversa encontrada.
                </div>
              ) : filteredProtocols.map(protocol => {
                const selected = protocol.id === selectedProtocolId;
                const unread = Number(unreadCounts[protocol.id] || 0);
                const operationalStatus = protocolOperationalStatus(protocol, waitingProtocolSet);
                return <button
                  key={protocol.id}
                  type="button"
                  onClick={() => selectProtocol(protocol.id)}
                  className={`flex w-full items-start gap-3 border-b border-border px-3 py-3 text-left transition-colors last:border-b-0 ${selected
                    ? "bg-primary-soft"
                    : unread > 0 ? "border-l-2 border-l-primary bg-primary-soft/45 hover:bg-primary-soft/65"
                      : "bg-card hover:bg-muted/55"}`}
                >
                  <ProtocolAvatar protocol={protocol} selected={selected} />
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
                        {protocol.is_pending
                          ? protocolStatusLabel.pending
                          : protocolStatusLabel[operationalStatus] || operationalStatus}
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
                  <ProtocolAvatar protocol={selectedProtocol} compact />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-black text-foreground">{protocolDisplayName(selectedProtocol)}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatPhone(selectedProtocol.contact?.phone)} · Aguardando abertura de protocolo
                    </p>
                  </div>
                </div>
                <div
                  className="min-h-0 flex-1 overflow-y-auto bg-muted/25 px-3 py-4 sm:px-5"
                  style={{
                    backgroundImage: "radial-gradient(circle at 1px 1px, rgba(148, 163, 184, 0.18) 1px, transparent 0)",
                    backgroundSize: "22px 22px",
                  }}
                >
                  <div className="mx-auto max-w-4xl">
                    <div className="flex justify-end">
                      <div className="max-w-[88%] rounded-lg bg-emerald-100 px-3 py-2 text-emerald-950 shadow-sm dark:bg-emerald-950/55 dark:text-emerald-50 sm:max-w-[72%]">
                        <p className="whitespace-pre-wrap break-words text-sm leading-5">
                          {selectedProtocol.pending_message}
                        </p>
                        <p className="mt-1 text-right text-[9px] opacity-60">
                          {deliveryLabel({status: selectedProtocol.delivery_state})} · {formatCompactDate(selectedProtocol.last_message_at)}
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
                  <ProtocolAvatar protocol={selectedProtocol} compact />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-black text-foreground">{protocolDisplayName(selectedProtocol)}</p>
                    <div className="mt-0.5 flex min-w-0 flex-wrap gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
                      {selectedProtocol.contact?.phone && <span>{formatPhone(selectedProtocol.contact.phone)}</span>}
                      <span>Protocolo {selectedProtocol.external_protocol_id}</span>
                      <span className={`rounded px-1.5 py-0.5 font-semibold ${selectedOperationalStatus === "finished"
                        ? "bg-muted text-muted-foreground"
                        : selectedOperationalStatus === "in_att"
                          ? "bg-blue-500/10 text-blue-700 dark:text-blue-300"
                          : "bg-amber-500/10 text-amber-700 dark:text-amber-300"}`}>
                        {selectedOperationalStatus
                          ? protocolStatusLabel[selectedOperationalStatus] || selectedOperationalStatus
                          : selectedProtocol.status}
                      </span>
                      <span>Atendente: {selectedProtocol.operator_name || "não atribuído"}</span>
                      <span>Departamento: {selectedProtocol.department_name || "não atribuído"}</span>
                    </div>
                  </div>
                </div>

                {(
                  (canManageProtocols && selectedOperationalStatus !== "finished")
                  || (canViewCustomers && Boolean(selectedProtocol.contact))
                  || (canViewOrders && Boolean(selectedProtocol.contact?.customer_id))
                ) && (
                  <div className="flex min-w-0 items-center gap-2 overflow-x-auto border-b border-border bg-card px-4 py-2.5">
                    {canManageProtocols && selectedOperationalStatus === "waiting" && operatorBinding?.access_mode === "operator" && operatorBinding?.linked && (
                      <AdminButton
                        onClick={() => void assumeProtocol()}
                        loading={protocolAction === "assume"}
                        disabled={Boolean(protocolAction && protocolAction !== "assume")}
                        className="shrink-0"
                      >
                        Pegar atendimento
                      </AdminButton>
                    )}
                    {canManageProtocols && selectedOperationalStatus === "waiting" && !operatorBinding?.linked && (
                      <span className="shrink-0 rounded-lg bg-amber-500/10 px-3 py-2 text-xs font-bold text-amber-700 dark:text-amber-300">
                        Supervisão Gestor · vincule um Operador para pegar
                      </span>
                    )}
                    {canManageProtocols && selectedOperationalStatus === "self_service" && (
                      <span className="shrink-0 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs font-bold text-emerald-700 dark:text-emerald-300">
                        Auto Atendimento · sessão Gestor
                      </span>
                    )}
                    {canManageProtocols && selectedOperationalStatus === "in_att" && isMyProtocol && (
                      <span className="shrink-0 rounded-lg bg-blue-500/10 px-3 py-2 text-xs font-bold text-blue-700 dark:text-blue-300">
                        Em atendimento com você
                      </span>
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

                    {selectedProtocol.contact?.customer_id && (canViewOrders || canViewCustomers) && (
                      <AdminButton
                        variant="secondary"
                        onClick={() => void openCustomerOrders()}
                        loading={customerOrdersLoading}
                        className="shrink-0"
                      >
                        Dados do cliente
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

                    {canManageProtocols && (selectedOperationalStatus === "in_att" || selectedOperationalStatus === "abandoned") && isMyProtocol && (
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
                        <AdminButton
                          variant="secondary"
                          onClick={() => void returnToInbox()}
                          loading={protocolAction === "inbox"}
                          disabled={Boolean(protocolAction && protocolAction !== "inbox")}
                          className="shrink-0"
                        >
                          Devolver à fila
                        </AdminButton>
                      </>
                    )}
                    {canManageProtocols && (selectedOperationalStatus === "in_att" || selectedOperationalStatus === "abandoned") && isMyProtocol && (
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
                    )}
                    {canManageProtocols && selectedOperationalStatus === "in_att" && !isMyProtocol && isSacManager && (
                      <span className="shrink-0 rounded-lg bg-sky-500/10 px-3 py-2 text-xs font-bold text-sky-700 dark:text-sky-300">
                        Gestor SAC · atendimento de {selectedProtocol.operator_name || "outro Operador"}
                      </span>
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
                      className="mt-3 flex min-w-0 flex-wrap items-end gap-2"
                      onSubmit={event => {
                        event.preventDefault();
                        void searchCustomerCandidates();
                      }}
                    >
                      <div className="min-w-0 flex-1"><FInput label="Buscar cliente" aria-label="Buscar cliente" value={customerSearch} onChange={(event: any) => setCustomerSearch(event.target.value)} placeholder="Nome, CPF ou CNPJ" /></div>
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

                {ordersPanelOpen && (canViewOrders || canViewCustomers) && selectedProtocol.contact?.customer_id && (
                  <div className="border-b border-border bg-muted/30 px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-black text-foreground">Dados do cliente</p>
                        <p className="text-[10px] text-muted-foreground">
                          {protocolDisplayName(selectedProtocol)} · {formatPhone(selectedProtocol.contact.phone)}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        {canViewCustomers && onOpenCustomer && (
                          <AdminButton size="sm" variant="secondary"
                            onClick={() => onOpenCustomer(selectedProtocol.contact!.customer_id!)}>
                            Abrir cadastro
                          </AdminButton>
                        )}
                        <AdminButton size="sm" variant="secondary"
                          onClick={() => setOrdersPanelOpen(false)}>
                          Fechar
                        </AdminButton>
                      </div>
                    </div>
                    {customerOrdersLoading ? (
                      <LoadingState text="Carregando dados do cliente..." />
                    ) : (
                      <div className="mt-3 grid min-w-0 gap-3 lg:grid-cols-2">
                        {canViewOrders && (
                          <section className="min-w-0">
                            <p className="mb-2 text-xs font-black text-foreground">
                              Últimas OS · {customerOrders.filter(order => !order.is_solved).length} não resolvida(s)
                            </p>
                            <div className="max-h-44 overflow-y-auto rounded-lg border border-border bg-card">
                              {customerOrders.length === 0 ? (
                                <p className="p-3 text-xs text-muted-foreground">Nenhuma OS vinculada.</p>
                              ) : customerOrders.map(order => (
                                <div key={order.id}
                                  className="flex items-center justify-between gap-2 border-b border-border px-3 py-2 last:border-b-0">
                                  <div className="min-w-0">
                                    <p className="truncate text-xs font-semibold">
                                      OS {order.os_number || order.external_os_number || order.id.slice(0, 8)}
                                      {order.is_solved ? " · Resolvida" : ""}
                                    </p>
                                    <p className="truncate text-[10px] text-muted-foreground">
                                      {[order.order_status?.name, order.situation?.name, formatCompactDate(order.created_at)]
                                        .filter(Boolean).join(" · ")}
                                    </p>
                                  </div>
                                  {onOpenOrder && (
                                    <AdminButton size="sm" variant="secondary"
                                      onClick={() => onOpenOrder(order.id)}>Abrir</AdminButton>
                                  )}
                                </div>
                              ))}
                            </div>
                          </section>
                        )}
                        {canViewCustomers && (
                          <section className="min-w-0">
                            <p className="mb-2 text-xs font-black text-foreground">
                              Equipamentos · {customerEquipments.length}
                            </p>
                            <div className="max-h-44 overflow-y-auto rounded-lg border border-border bg-card">
                              {customerEquipments.length === 0 ? (
                                <p className="p-3 text-xs text-muted-foreground">Nenhum equipamento cadastrado.</p>
                              ) : customerEquipments.slice(0, 10).map(equipment => (
                                <div key={equipment.id} className="border-b border-border px-3 py-2 last:border-b-0">
                                  <p className="truncate text-xs font-semibold text-foreground">
                                    {[equipment.equipment_type_name, equipment.equipment_brand_name,
                                      equipment.equipment_model_name].filter(Boolean).join(" · ") || "Equipamento"}
                                  </p>
                                  {equipment.serial_number && (
                                    <p className="text-[10px] text-muted-foreground">
                                      Série: {equipment.serial_number}
                                    </p>
                                  )}
                                </div>
                              ))}
                            </div>
                          </section>
                        )}
                      </div>
                    )}
                    {canCreateOrders && onCreateOrder && (
                      <div className="mt-3 flex justify-end">
                        <AdminButton onClick={() => onCreateOrder(selectedProtocol.contact!.customer_id!)}>
                          Nova OS
                        </AdminButton>
                      </div>
                    )}
                  </div>
                )}

                {routingOpen && canManageProtocols && (
                  <div className="border-b border-border bg-muted/30 px-4 py-3">
                    {routingOptions?.department_authorization_required && (
                      <p className="mb-2 text-xs text-amber-700 dark:text-amber-300">Para listar outros departamentos, autorize seu Operador novamente.</p>
                    )}
                    <div className="grid gap-2 sm:grid-cols-2">
                      <FSelect label="Departamento" value={departmentId} onChange={(event: any) => {setDepartmentId(event.target.value);setOperatorId("");}}
                        disabled={protocolAction === "routing" || protocolAction === "forward"}
                        options={[{value:'',label:'Selecionar (opcional)'}, ...(routingOptions?.departments || []).filter(item=>item.active).map(item=>({value:item.id,label:item.name}))]} />
                      <FSelect label="Operador" value={operatorId} onChange={(event: any) => {setOperatorId(event.target.value);setDepartmentId("");}}
                        disabled={protocolAction === "routing" || protocolAction === "forward"}
                        options={[{value:'',label:'Selecionar (opcional)'}, ...(routingOptions?.operators || []).map(item=>({value:item.id,label:item.name+(item.online?' — online':'')}))]} />
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
                    <div className="w-full sm:w-60"><FSelect label="Avaliação do atendimento" value={finishVote} disabled={protocolAction === "finish"} onChange={(event: any) => setFinishVote(event.target.value)} options={[{value:"",label:"Selecionar avaliação"}, ...[0,1,2,3,4,5].map(vote=>({value:String(vote),label:String(vote)}))]} /></div>
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
                        disabled={!finishVote}
                        loading={protocolAction === "finish"}
                      >
                        Finalizar
                      </AdminButton>
                    </div>
                  </div>
                )}

                <div className="relative min-h-0 flex-1">
                  <div
                    ref={messagesScrollRef}
                    onScroll={handleMessagesScroll}
                    className="h-full overflow-y-auto overscroll-contain bg-muted/25 px-3 py-4 [scrollbar-gutter:stable] sm:px-5"
                    style={{
                      backgroundImage: "radial-gradient(circle at 1px 1px, rgba(148, 163, 184, 0.18) 1px, transparent 0)",
                      backgroundSize: "22px 22px",
                    }}
                  >
                  {messagesLoading && visibleMessages.length === 0 ? <LoadingState text="Carregando mensagens..." /> : visibleMessages.length === 0 ? (
                    <div className="flex min-h-64 items-center justify-center text-center text-xs text-muted-foreground">
                      Nenhuma mensagem registrada neste protocolo.
                    </div>
                  ) : (
                    <div className="mx-auto max-w-4xl">
                      {visibleMessages.map((item, index) => {
                        const outgoing = effectiveMessageDirection(item) === "outgoing";
                        const previous = index > 0 ? visibleMessages[index - 1] : null;
                        const previousOutgoing = previous ? effectiveMessageDirection(previous) === "outgoing" : null;
                        const operatorName = messageOperatorName(item, selectedProtocol);
                        const previousOperatorName = previous ? messageOperatorName(previous, selectedProtocol) : "";
                        const grouped = Boolean(previous)
                          && previousOutgoing === outgoing
                          && (!outgoing || previousOperatorName === operatorName);
                        const kind = messageKind(item);
                        const KindIcon = kind.Icon;
                        return <div
                          key={item.id}
                          className={`flex ${grouped ? "mt-1" : index === 0 ? "" : "mt-3"} ${outgoing ? "justify-end" : "justify-start"}`}
                        >
                          <div className={`max-w-[88%] rounded-lg px-3 py-2 shadow-sm sm:max-w-[72%] ${outgoing
                            ? "bg-emerald-100 text-emerald-950 dark:bg-emerald-950/55 dark:text-emerald-50"
                            : "border border-border bg-card text-foreground"}`}>
                            {outgoing && operatorName && (
                              <p className="mb-1 text-[10px] font-black leading-4 opacity-80">
                                {operatorName}
                              </p>
                            )}
                            {(() => {
                              const mediaUrl = sacDigitalMediaUrl(item.media_url);
                              return <div className="space-y-2">
                                {mediaUrl && item.message_type === "image" && (
                                  <a href={mediaUrl} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-md">
                                    <img
                                      src={mediaUrl}
                                      alt="Imagem recebida no SAC Digital"
                                      loading="lazy"
                                      onLoad={() => {
                                        if (followLatestRef.current) scrollToLatest("auto");
                                      }}
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
                                  <div className="flex flex-wrap items-center gap-3 rounded-md border border-border/70 px-3 py-2 text-xs font-bold">
                                    <FileText size={16} className="shrink-0" />
                                    <a href={mediaUrl} target="_blank" rel="noopener noreferrer"
                                      className="underline-offset-2 hover:underline">Abrir arquivo</a>
                                    <a href={mediaUrl} download target="_blank" rel="noopener noreferrer"
                                      className="underline-offset-2 hover:underline">Baixar</a>
                                  </div>
                                )}
                                {item.message_type === "location" && (() => {
                                  const location = messageLocation(item);
                                  return <div className="flex items-center gap-2 text-sm">
                                    <MapPin size={17} className="shrink-0" />
                                    {location.url ? (
                                      <a href={location.url} target="_blank" rel="noopener noreferrer"
                                        className="break-words font-semibold underline-offset-2 hover:underline">
                                        {location.place || "Ver localização no mapa"}
                                      </a>
                                    ) : (
                                      <span className="break-words">{location.place || "Localização recebida"}</span>
                                    )}
                                  </div>;
                                })()}
                                {item.message_type === "vcard" && (() => {
                                  const contact = messageContact(item);
                                  return <div className="flex items-start gap-2 text-sm">
                                    <UserRound size={17} className="mt-0.5 shrink-0" />
                                    <div className="min-w-0">
                                      <p className="font-semibold">{contact.name || "Contato compartilhado"}</p>
                                      {contact.phone && (contact.phoneUrl ? (
                                        <a href={contact.phoneUrl} className="underline-offset-2 hover:underline">
                                          {contact.phone}
                                        </a>
                                      ) : <p>{contact.phone}</p>)}
                                    </div>
                                  </div>;
                                })()}
                                {item.raw_metadata?.local_file_name && (
                                  <p className="flex items-center gap-2 text-xs"><Paperclip size={14} />{item.raw_metadata.local_file_name}</p>
                                )}
                                {item.body_text && (
                                  <p className="whitespace-pre-wrap break-words text-sm leading-5">{item.body_text}</p>
                                )}
                                {!item.body_text && !mediaUrl && item.message_type !== "location" && item.message_type !== "vcard" && (
                                  <div className="flex items-center gap-2 text-sm font-semibold">
                                    <KindIcon size={16} className="shrink-0" />
                                    <span>{kind.label}</span>
                                  </div>
                                )}
                              </div>;
                            })()}
                            {item.raw_metadata?.local_submission === "failed" && (
                              <div className="mt-2 space-y-1 text-xs">
                                <p role="alert" className="text-red-700 dark:text-red-300">{item.raw_metadata.local_error || "Não foi possível enviar esta mensagem."}</p>
                                <button type="button" disabled={!messageOutbox.canRestore(messageContext, String(item.raw_metadata?.client_request_id))}
                                  onClick={() => messageOutbox.restore(messageContext, String(item.raw_metadata?.client_request_id))}
                                  className="font-semibold underline disabled:opacity-50">Editar e tentar novamente</button>
                              </div>
                            )}
                            <div className="mt-1 flex items-center justify-end gap-2 text-[9px] opacity-60" aria-live="polite">
                              {item.raw_metadata?.local_submission === "sending" && <LoaderCircle size={12} className="animate-spin" aria-hidden="true" />}
                              {outgoing && deliveryStatus(item) && <span>{deliveryStatus(item)}</span>}
                              <span>{formatCompactDate(item.sent_at)}</span>
                            </div>
                          </div>
                        </div>;
                      })}
                    </div>
                  )}
                  </div>
                  {showJumpToLatest && (
                    <button
                      type="button"
                      onClick={() => scrollToLatest("smooth")}
                      className="absolute bottom-4 right-4 z-20 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-lg transition hover:bg-muted sm:right-5"
                      aria-label="Ir para a última mensagem"
                      title="Ir para a última mensagem"
                    >
                      <ChevronDown size={19} />
                    </button>
                  )}
                </div>

                <div className="border-t border-border bg-card p-3">
                  {selectedOperationalStatus === "finished" ? (
                    <p className="py-2 text-center text-xs text-muted-foreground">
                      Este protocolo está finalizado. Não é possível enviar novas mensagens nele.
                    </p>
                  ) : selectedOperationalStatus === "waiting" ? (
                    <p className="py-2 text-center text-xs font-semibold text-amber-700 dark:text-amber-300">
                      Este atendimento está na fila. Um Operador SAC deve pegar o atendimento antes de responder.
                    </p>
                  ) : selectedOperationalStatus === "inbox" || selectedOperationalStatus === "abandoned" ? (
                    <p className="py-2 text-center text-xs text-muted-foreground">
                      {selectedOperationalStatus === "abandoned" ? "A SAC registrou este atendimento como abandonado." : "Este protocolo não foi confirmado na fila operacional."} Inicie uma nova conversa ou aguarde a confirmação da fila para assumir.
                    </p>
                  ) : selectedOperationalStatus === "in_att" && !isMyProtocol && isSacManager ? (
                    <p className="py-2 text-center text-xs font-semibold text-sky-700 dark:text-sky-300">
                      Você está acompanhando este atendimento como Gestor SAC. O atendimento está atribuído a {selectedProtocol.operator_name || "outro Operador SAC"}.
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
                            if (file.size > mediaMaximum(file.type)) {
                              setMessage({ text: `O arquivo deve ter no máximo ${mediaMaximum(file.type) / (1024 * 1024)} MB.`, error: true });
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
                          disabled={!status?.enabled}
                          onClick={() => mediaInputRef.current?.click()}
                          aria-label="Anexar imagem, áudio, vídeo ou arquivo"
                          title="Anexar arquivo (imagens 1 MB; áudio 3 MB; vídeo/arquivos 5 MB)"
                          className="h-11 w-11 shrink-0 rounded-full px-0"
                        >
                          <Paperclip size={17} />
                        </AdminButton>
                        <textarea
                          aria-label={attachment ? "Legenda do anexo" : "Mensagem"}
                          rows={1}
                          value={draft}
                          disabled={!status?.enabled}
                          placeholder={attachment ? "Legenda (opcional)" : status?.enabled ? "Digite uma mensagem" : "Integração desativada"}
                          onChange={event => setDraft(event.target.value)}
                          onKeyDown={event => {
                            if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                              event.preventDefault();
                              void sendMessage();
                            }
                          }}
                          className="admin-input min-h-[44px] min-w-0 flex-1 resize-none rounded-full border border-border bg-muted/55 px-4 py-2.5 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground/65 focus:border-primary focus:bg-card focus:ring-2 focus:ring-primary/20"
                        />
                        <AdminButton
                          type="submit"
                          disabled={(!draft.trim() && !attachment) || !status?.enabled}
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
    </div>}

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

