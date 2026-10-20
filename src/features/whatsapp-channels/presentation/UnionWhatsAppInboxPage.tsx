import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CircleAlert, ChevronDown, FileText, Image as ImageIcon, LoaderCircle, MessageCircle, Paperclip, Settings2, Search, Send, Smile, Mic, Square, RotateCcw, CheckCircle2, UserCheck, Volume2, X, Check, CheckCheck, ArrowRightLeft, Plus, Building2, History, Users, ContactRound, Instagram, Facebook } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { SacEmojiPicker } from "@/features/sac-digital/presentation/SacEmojiPicker";
import { UnionWhatsAppContactsDialog } from "./UnionWhatsAppContactsDialog";
import { WhatsAppOperationsSettings, type WhatsAppOperationsSection } from "./WhatsAppOperationsSettings";
import { prepareImageForUpload } from "@/shared/application/upload-file-optimizer";
import { supabase } from "@/lib/supabase";
import { AdminButton, AdminDialog } from "@/shared/ui/admin/AdminLayout";
import { LoadingState } from "@/shared/ui/admin/AdminFeedback";
import { systemErrorMessage } from "@/shared/domain/error-message";
import {
  listUnionWhatsAppConversations, listUnionWhatsAppMessages, operateUnionWhatsAppInbox,
  type UnionWhatsAppInboxAction, type UnionWhatsAppConversation, type UnionWhatsAppMessage, type UnionWhatsAppContact,
} from "../infrastructure/union-whatsapp-inbox.repository";

const filters = [
  { value: "waiting", label: "Aguardando", tone: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
  { value: "in_att", label: "Em atendimento", tone: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" },
  { value: "abandoned", label: "Abandonados", tone: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" },
  { value: "finished", label: "Finalizados", tone: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300" },
] as const;
type Filter = UnionWhatsAppConversation["status"];
const initials = (text: string) => {
  const parts = text.trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : (parts[0] || "?").slice(0, 2)).toUpperCase();
};
const brazilNumberDigits = (raw: string) => {
  const digits=raw.replace(/\D/g, "");
  const national=digits.startsWith("55") && digits.length>11 ? digits.slice(2) : digits;
  return national.slice(0,11);
};
const brazilPhoneMask = (raw: string) => {
  const digits=brazilNumberDigits(raw);
  if(!digits) return "";
  if(digits.length<3) return "(" + digits;
  const ddd=digits.slice(0,2);
  const local=digits.slice(2);
  const initial=local.startsWith("9")?5:4;
  return "(" + ddd + ") " + (local.length>initial
    ? local.slice(0,initial)+"-"+local.slice(initial):local);
};
const compactDate = (value: string | null) => value && !Number.isNaN(new Date(value).getTime())
  ? new Date(value).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
  : "";
const clock = (value: string) => new Date(value).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

function MessageBody({ message, organizationId, onMediaLoad }: {
  message: UnionWhatsAppMessage; organizationId: string; onMediaLoad?: () => void;
}) {
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaLoading, setMediaLoading] = useState(false);
  const [mediaError, setMediaError] = useState("");
  const hasStoredMedia = Boolean(message.media_path || message.media_available);
  const loadMedia = useCallback(async () => {
    if (!hasStoredMedia || mediaLoading || !organizationId) return;
    setMediaLoading(true);
    setMediaError("");
    try {
      const data = await operateUnionWhatsAppInbox(organizationId, message.conversation_id, "media_view", {
        message_id: message.id,
      });
      if (!data.url) throw new Error("Mídia não disponível.");
      setMediaUrl(data.url);
    } catch (reason) {
      setMediaError(systemErrorMessage(reason, "Não foi possível abrir o arquivo."));
    } finally {
      setMediaLoading(false);
    }
  }, [message.id, message.conversation_id, organizationId, hasStoredMedia, mediaLoading]);

  useEffect(() => {
    setMediaUrl("");
    setMediaError("");
    if (hasStoredMedia && message.message_type === "image") void loadMedia();
    // Avoid repeatedly fetching large files when switching conversation.
  }, [message.id, hasStoredMedia, message.message_type, organizationId]);

  if (message.message_type === "text" || message.message_type === "unknown") {
    return <p className="whitespace-pre-wrap break-words text-sm leading-5">{message.body_text || "Mensagem"}</p>;
  }
  const mediaIcons = { image:ImageIcon, video:FileText, audio:Volume2, file:FileText,
    location:FileText, contact:FileText };
  const Icon = (mediaIcons as Record<string, typeof FileText>)[message.message_type] || FileText;
  const label = ({image:"Imagem", video:"Vídeo", audio:"Áudio", file:"Documento",
    location:"Localização", contact:"Contato"} as Record<string,string>)[message.message_type] || "Mensagem";
  return <div className="space-y-2">
    {mediaUrl && message.message_type === "image" && <a href={mediaUrl} target="_blank" rel="noopener noreferrer"
      className="block overflow-hidden rounded-md"><img src={mediaUrl} alt={message.media_name || "Imagem do WhatsApp"}
        onLoad={onMediaLoad} loading="lazy" className="max-h-80 w-auto max-w-full rounded-md object-contain"/></a>}
    {mediaUrl && message.message_type === "video" && <video src={mediaUrl} preload="metadata" controls
      className="max-h-80 w-full rounded-md" />}
    {mediaUrl && message.message_type === "audio" && <audio src={mediaUrl} controls preload="metadata"
      className="w-full min-w-[240px] max-w-full" />}
    {mediaUrl && message.message_type === "file" && message.media_mime?.startsWith("audio/") &&
      <audio src={mediaUrl} controls preload="metadata" className="min-w-[240px] max-w-full"/>}
    {mediaUrl && message.message_type === "file" && <div className="flex items-center gap-3 rounded-md border border-border/70 px-3 py-2 text-xs">
      <FileText size={17}/><a href={mediaUrl} target="_blank" rel="noopener noreferrer" className="font-bold hover:underline">Abrir {message.media_name || "documento"}</a>
      <a href={mediaUrl} target="_blank" rel="noopener noreferrer" download={message.media_name || undefined} className="font-semibold hover:underline">Baixar</a>
    </div>}
    {!mediaUrl && <div className="flex items-center gap-2 text-sm">
      <Icon size={17}/>
      <span className="font-semibold">{message.media_name || label}</span>
      {hasStoredMedia && <button type="button" disabled={mediaLoading} onClick={() => void loadMedia()}
        className="text-xs font-semibold text-primary underline-offset-2 hover:underline disabled:opacity-40">
        {mediaLoading ? "Carregando..." : "Abrir"}
      </button>}
      {!hasStoredMedia && <span className="text-[10px] opacity-60">(arquivo não sincronizado)</span>}
    </div>}
    {message.body_text && <p className="whitespace-pre-wrap break-words text-sm leading-5">{message.body_text}</p>}
    {mediaError && <p role="alert" className="text-xs text-red-600">{mediaError}</p>}
  </div>;
}

function WhatsAppIcon() {
  return <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.966-.273-.099-.471-.149-.67.149-.198.297-.768.966-.94 1.164-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.76-1.653-2.057-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.173.198-.298.297-.496.099-.198.05-.372-.025-.52-.074-.15-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.01-.372-.012-.57-.012s-.52.074-.793.372-1.04 1.016-1.04 2.479 1.065 2.875 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.71.306 1.263.489 1.695.625.712.226 1.36.194 1.872.118.571-.085 1.758-.718 2.006-1.412.248-.694.248-1.289.173-1.412-.074-.124-.272-.198-.57-.347zm-5.43 7.287h-.003a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.999-3.648-.236-.374a9.86 9.86 0 01-1.51-5.262c.002-5.442 4.429-9.87 9.874-9.87a9.81 9.81 0 016.986 2.895 9.81 9.81 0 012.89 6.99c-.002 5.444-4.43 9.87-9.866 9.87zm8.405-18.284A11.8 11.8 0 0012.04 0C5.495 0 .169 5.325.166 11.87a11.8 11.8 0 001.586 5.925L.064 23.968l6.318-1.657a11.86 11.86 0 005.653 1.44h.005c6.545 0 11.872-5.325 11.875-11.87a11.81 11.81 0 00-3.468-8.396z"/>
  </svg>;
}
export function UnionWhatsAppInboxPage({ onBack, onConfigure, onOpenCustomer, onOpenOrder }: {
  onBack: () => void; onConfigure: () => void; onOpenCustomer?: (customerId:string) => void; onOpenOrder?: (orderId:string) => void;
}) {
  const { activeOrganizationId, hasPermission, user } = useAuth();
  const canView = hasPermission("whatsapp.inbox.view");
  const canSend = hasPermission("whatsapp.inbox.send");
  const canManage = hasPermission("whatsapp.inbox.manage");
  const [conversations, setConversations] = useState<UnionWhatsAppConversation[]>([]);
  const [messages, setMessages] = useState<UnionWhatsAppMessage[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("waiting");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [error, setError] = useState("");

  const [draft, setDraft] = useState("");
  const [runningAction, setRunningAction] = useState<UnionWhatsAppInboxAction | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [imageOptimizing, setImageOptimizing] = useState(false);
  const optimizeSeq = useRef(0);
  const mediaInputRef = useRef<HTMLInputElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const discardRecordingRef = useRef(false);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [routingOpen, setRoutingOpen] = useState(false);
  const [routingMode,setRoutingMode] = useState<"operator"|"department">("operator");
  const [targetDepartmentId,setTargetDepartmentId] = useState("");
  const [departments,setDepartments] = useState<Array<{id:string;name:string;is_active:boolean}>>([]);
  const [departmentFilter,setDepartmentFilter] = useState("all");
  const [settingsOpen,setSettingsOpen] = useState(false);
  const [settingsModal,setSettingsModal] = useState<WhatsAppOperationsSection|null>(null);
  const [settingsCreateRequest,setSettingsCreateRequest] = useState(0);
  const settingsMenuRef=useRef<HTMLDivElement|null>(null);
  const [ordersOpen,setOrdersOpen] = useState(false);
  const [possibleOrders,setPossibleOrders] = useState<Array<{id:string;os_number:string;created_at:string}>>([]);
  const [savingOrder,setSavingOrder] = useState(false);
  const [historyOpen,setHistoryOpen] = useState(false);
  const [handoffs,setHandoffs] = useState<Array<{id:string;action:string;actor_id:string;to_user_id:string|null;to_department_id:string|null;created_at:string}>>([]);
  const [newConversationOpen, setNewConversationOpen] = useState(false);
  const [contactsOpen,setContactsOpen] = useState(false);
  const [editContactId,setEditContactId]=useState<string|null>(null);
  const [newPhone, setNewPhone] = useState("");
  const [newName, setNewName] = useState("");
  const [starting, setStarting] = useState(false);
  const [members, setMembers] = useState<Array<{id:string;name:string}>>([]);
  const [targetUserId, setTargetUserId] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const followLatestRef = useRef(true);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  type PendingEntry = { id: string; conversationId: string; organizationId: string; text: string;
    status: "sending" | "unknown" | "failed"; error?: string; sentAt: string; fileName?: string; mediaType?: string };
  const [pending, setPending] = useState<PendingEntry[]>([]);
  const sendingIds = useRef(new Set<string>());
  const submitGateRef = useRef(false);
  // Preserve the same request ID if a network timeout leaves delivery uncertain.
  // Regenerating it automatically would risk sending the same message twice.
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const [channelReady, setChannelReady] = useState<boolean | null>(null);
  const [activeChannelId,setActiveChannelId]=useState<string|null>(null);
  const [activeChannelPhone,setActiveChannelPhone]=useState<string|null>(null);
  const [channelError, setChannelError] = useState("");
  const [avatars, setAvatars] = useState<Record<string,string|null>>({});
  const [linkedCustomers,setLinkedCustomers] = useState<Record<string,{id:string;name:string}|null>>({});
  const messageIdentity = useRef(0);

  useEffect(() => {
    if (!settingsOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (!settingsMenuRef.current?.contains(event.target as Node)) setSettingsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSettingsOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [settingsOpen]);

  const loadingList = useRef(false);
  const organizationRef = useRef(activeOrganizationId);
  organizationRef.current = activeOrganizationId;

  const refresh = useCallback(async (silent = false) => {
    if (!activeOrganizationId || !activeChannelId || channelReady!==true ||
      !canView || loadingList.current) return;
    loadingList.current = true;
    if (!silent) setLoading(true);
    try {
      const items = await listUnionWhatsAppConversations(activeOrganizationId,activeChannelId);
      if (organizationRef.current !== activeOrganizationId) return;
      setConversations(items);
      setError("");
    } catch (reason) {
      if (organizationRef.current === activeOrganizationId) setError(systemErrorMessage(reason, "Não foi possível consultar as conversas."));
    } finally {
      loadingList.current = false;
      if (organizationRef.current === activeOrganizationId) setLoading(false);
    }
  }, [activeOrganizationId, activeChannelId, channelReady, canView]);

  const refreshMessages = useCallback(async (conversationId: string, silent = false) => {
    if (!activeOrganizationId || !activeChannelId || channelReady!==true || !canView) return;
    const identity = ++messageIdentity.current;
    if (!silent) setMessagesLoading(true);
    try {
      const list = await listUnionWhatsAppMessages(activeOrganizationId, conversationId,activeChannelId);
      if (identity === messageIdentity.current && organizationRef.current === activeOrganizationId) setMessages(list);
    } catch (reason) {
      if (identity === messageIdentity.current && organizationRef.current === activeOrganizationId) setError(systemErrorMessage(reason, "Não foi possível consultar as mensagens."));
    } finally {
      if (identity === messageIdentity.current) setMessagesLoading(false);
    }
  }, [activeOrganizationId, activeChannelId, channelReady, canView]);

  useEffect(() => {
    loadingList.current = false;
    setConversations([]);
    setMessages([]);
    setAvatars({});
    setLinkedCustomers({});
    setSelectedId(null);
    setFilter("waiting");
    setDraft("");
    setAttachment(null);
    setMediaPreview(null);
    setPending([]);
    setRoutingOpen(false);
    setNewConversationOpen(false);
    setContactsOpen(false);
    setEditContactId(null);
    setSettingsOpen(false);
    setSettingsModal(null);
    setOrdersOpen(false);
    setDepartments([]);
    setDepartmentFilter("all");
    setMembers([]);
    setError("");
    messageIdentity.current += 1;
    setLoading(false);
  }, [activeOrganizationId]);
  useEffect(()=>{
    if(channelReady===true && activeChannelId)void refresh();
  },[channelReady,activeChannelId,refresh]);
  // Never keep chats or previews in memory after a disconnection.
  useEffect(()=>{
    if(channelReady===true && activeChannelId)return;
    setConversations([]);setMessages([]);setSelectedId(null);
    setAvatars({});setLinkedCustomers({});setContactsOpen(false);
    setLoading(false);
    messageIdentity.current+=1;
  },[channelReady,activeChannelId]);

  const checkChannel = useCallback(async () => {
    if (!activeOrganizationId || !canView) return;
    try {
      const response = await operateUnionWhatsAppInbox(
        activeOrganizationId, crypto.randomUUID(), "channel_status",
      );
      if (organizationRef.current === activeOrganizationId) {
        const ready=Boolean(response.channel_connected && response.channel_id);
        setChannelReady(ready);
        setActiveChannelId(ready?response.channel_id||null:null);
        setActiveChannelPhone(ready?response.channel_phone||null:null);
        setChannelError("");
      }
    } catch (reason) {
      if (organizationRef.current === activeOrganizationId) {
        setChannelReady(null);setActiveChannelId(null);setActiveChannelPhone(null);
        setChannelError(systemErrorMessage(reason, "Não foi possível consultar o canal."));
      }
    }
  }, [activeOrganizationId, canView]);
  useEffect(() => { setChannelReady(null);setActiveChannelId(null);setActiveChannelPhone(null); setChannelError(""); void checkChannel(); }, [checkChannel]);
  // When disconnected, the conversation subscription is deliberately absent.
  // Recheck identity on returning to the tab without continuously polling.
  useEffect(()=>{
    if(!activeOrganizationId||!canView)return;
    let last=0;
    const onResume=()=>{
      if(document.visibilityState!=="visible"||Date.now()-last<30000)return;
      last=Date.now();
      void checkChannel();
    };
    window.addEventListener("focus",onResume);
    document.addEventListener("visibilitychange",onResume);
    return()=>{
      window.removeEventListener("focus",onResume);
      document.removeEventListener("visibilitychange",onResume);
    };
  },[activeOrganizationId,canView,checkChannel]);

  // Realtime only while the inbox page is open. A bounded foreground refresh
  // is kept as fallback when tenant replication is temporarily unavailable.
  useEffect(() => {
    if (!activeOrganizationId || !activeChannelId || channelReady!==true || !canView) return;
    let debounce: number | null = null;
    const schedule = () => {
      if (debounce !== null) window.clearTimeout(debounce);
      debounce = window.setTimeout(() => {
        void refresh(true);
        if (selectedId) void refreshMessages(selectedId, true);
      }, 250);
    };
    const realtime = supabase.channel(`union-whatsapp-${activeOrganizationId}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "union_whatsapp_conversations",
        filter: `channel_id=eq.${activeChannelId}` }, schedule)
      .on("postgres_changes", { event: "*", schema: "public", table: "union_whatsapp_messages",
        filter: `channel_id=eq.${activeChannelId}` }, schedule)
      .subscribe();
    // Reconcile on returning to the tab, not an expensive 30-second poll.
    let lastResume = 0;
    const onResume = () => {
      if (document.visibilityState !== "visible" || Date.now() - lastResume < 30000) return;
      lastResume = Date.now();
      schedule();
    };
    window.addEventListener("focus", onResume);
    document.addEventListener("visibilitychange", onResume);
    return () => {
      if (debounce !== null) window.clearTimeout(debounce);
      window.removeEventListener("focus", onResume);
      document.removeEventListener("visibilitychange", onResume);
      void supabase.removeChannel(realtime);
    };
  }, [activeOrganizationId, activeChannelId, channelReady, canView, selectedId, refresh, refreshMessages, checkChannel]);

  useEffect(() => {
    if (!selectedId || channelReady!==true || !activeChannelId) { setMessages([]); return; }
    setMessages([]);
    void refreshMessages(selectedId);
  }, [selectedId, channelReady,activeChannelId, refreshMessages]);

  // Reconcile WhatsApp address-book names by exact recipient JID, never
  // from the sender PushName of an outgoing mobile message.
  useEffect(() => {
    if(!selectedId || !activeOrganizationId || !canView || channelReady!==true) return;
    let cancelled=false;
    const org=activeOrganizationId;
    void operateUnionWhatsAppInbox(org,selectedId,"resolve_contact")
      .then(result=>{
        if(cancelled || organizationRef.current!==org || !result.contact_name) return;
        setConversations(current=>current.map(item=>item.id===selectedId
          ? {...item,contact_name:result.contact_name!} : item));
      }).catch(()=>undefined);
    return ()=>{cancelled=true;};
  },[selectedId,activeOrganizationId,canView,channelReady]);

  useEffect(() => {
    if(!selectedId || !activeOrganizationId || !canView || channelReady!==true ||
      Object.prototype.hasOwnProperty.call(avatars,selectedId)) return;
    let cancelled=false;
    const org=activeOrganizationId;
    void operateUnionWhatsAppInbox(org,selectedId,"contact_avatar")
      .then(result=>{
        if(cancelled || organizationRef.current!==org) return;
        setAvatars(old=>({...old,[selectedId]:result.avatar_url||null}));
      }).catch(()=>{if(!cancelled) setAvatars(old=>({...old,[selectedId]:null}));});
    return()=>{cancelled=true;};
  },[selectedId,activeOrganizationId,canView,channelReady,avatars]);
  useEffect(() => {
    if(!onOpenCustomer || !hasPermission("customers.view") || !selectedId ||
       !activeOrganizationId || channelReady!==true ||
       Object.prototype.hasOwnProperty.call(linkedCustomers,selectedId)) return;
    let cancelled=false;
    const org=activeOrganizationId;
    void operateUnionWhatsAppInbox(org,selectedId,"customer_match")
      .then(result=>{
        if(cancelled || organizationRef.current!==org) return;
        setLinkedCustomers(old=>({...old,[selectedId]:result.customer||null}));
      }).catch(()=>{if(!cancelled)setLinkedCustomers(old=>({...old,[selectedId]:null}));});
    return()=>{cancelled=true;};
  },[onOpenCustomer,selectedId,activeOrganizationId,channelReady,hasPermission,linkedCustomers]);

  useEffect(()=>{
    if(!activeOrganizationId || !selectedId || channelReady!==true)return;
    void operateUnionWhatsAppInbox(activeOrganizationId,selectedId,"presence_subscribe")
      .catch(()=>undefined);
  },[activeOrganizationId,selectedId,channelReady]);
  const scrollToLatest = useCallback((behavior: ScrollBehavior = "auto") => {
    followLatestRef.current = true;
    setShowJumpToLatest(false);
    const box = scrollRef.current;
    if (box) box.scrollTo({ top: box.scrollHeight, behavior });
  }, []);
  useEffect(() => {
    followLatestRef.current = true;
    setShowJumpToLatest(false);
    const frame = requestAnimationFrame(() => scrollToLatest("auto"));
    return () => cancelAnimationFrame(frame);
  }, [selectedId, scrollToLatest]);
  useEffect(() => {
    if (!followLatestRef.current || messagesLoading) return;
    const frame = requestAnimationFrame(() => scrollToLatest("auto"));
    return () => cancelAnimationFrame(frame);
  }, [messages.length, pending.length, messagesLoading, selectedId, scrollToLatest]);
  const handleMessagesScroll = () => {
    const box = scrollRef.current;
    if (!box) return;
    const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 100;
    followLatestRef.current = atBottom;
    setShowJumpToLatest(!atBottom);
  };

  const scopedConversations = conversations.filter(item => channelReady===true && item.organization_id === activeOrganizationId && item.channel_id === activeChannelId);
  const selected = scopedConversations.find(item => item.id === selectedId) || null;
  const counts = useMemo(() => {
    const result: Record<Filter, number> = { waiting: 0, in_att: 0, abandoned: 0, finished: 0 };
    scopedConversations.forEach(item => { result[item.status] = (result[item.status] || 0) + 1; });
    return result;
  }, [scopedConversations]);
  const visible = useMemo(() => {
    const search = query.trim().toLocaleLowerCase("pt-BR");
    return scopedConversations.filter(item => item.status === filter && (departmentFilter === "all" || (departmentFilter === "none" ? !item.department_id : item.department_id === departmentFilter)) && (!search ||
      [item.contact_name, item.contact_phone || "", item.chat_jid].some(value => value.toLocaleLowerCase("pt-BR").includes(search))));
  }, [scopedConversations, filter, query, departmentFilter]);

  // Fetch photo previews for the first visible rows, in small batches so
  // scrolling and messaging never wait for WhatsApp profile requests.
  // Always prioritize the open conversation, including those not in the
  // first 12 visible rows or from a previously selected filter.
  const previewIds=[...new Set([selectedId,...visible.slice(0,12).map(item=>item.id)]
    .filter((id):id is string=>Boolean(id)))].join(",");
  const avatarRequestsRef=useRef(new Set<string>());
  useEffect(()=>{
    if(!activeOrganizationId || channelReady!==true || !previewIds)return;
    const toLoad=previewIds.split(",")
      .filter(id=>id && !Object.prototype.hasOwnProperty.call(avatars,id) &&
        !avatarRequestsRef.current.has(id))
      .slice(0,3);
    if(!toLoad.length)return;
    const org=activeOrganizationId;
    for(const id of toLoad){
      avatarRequestsRef.current.add(id);
      void operateUnionWhatsAppInbox(org,id,"contact_avatar")
        .then(result=>{
          if(organizationRef.current===org)setAvatars(old=>({...old,[id]:result.avatar_url||null}));
        })
        .catch(()=>{
          if(organizationRef.current===org)setAvatars(old=>({...old,[id]:null}));
        })
        .finally(()=>avatarRequestsRef.current.delete(id));
    }
  },[activeOrganizationId,channelReady,previewIds,avatars]);

  useEffect(() => {
    if (!activeOrganizationId || !selected || selected.status !== "in_att"
      || selected.assigned_to !== user?.id || selected.unread_count <= 0) return;
    const threadId=selected.id;
    void operateUnionWhatsAppInbox(activeOrganizationId,threadId,"mark_read")
      .then(() => { setConversations(current => current.map(item =>
        item.id === threadId ? {...item,unread_count:0} : item)); })
      .catch(() => undefined);
  }, [activeOrganizationId,selected?.id,selected?.status,selected?.assigned_to,selected?.unread_count,user?.id]);

  const loadDepartments = async () => {
    if(!activeOrganizationId) return [];
    const result=await operateUnionWhatsAppInbox(activeOrganizationId,crypto.randomUUID(),"departments_list");
    const rows=result.departments||[];
    setDepartments(rows);
    return rows;
  };
  const viewHistory = async () => {
    if(!selected || !activeOrganizationId)return;
    try{
      const result=await operateUnionWhatsAppInbox(activeOrganizationId,selected.id,"handoff_history");
      setHandoffs(result.history||[]);setHistoryOpen(true);
    }catch(reason){setError(systemErrorMessage(reason,"Não foi possível consultar o histórico."));}
  };
  useEffect(()=>{
    if(!activeOrganizationId || !canView || channelReady!==true)return;
    let cancelled=false;const org=activeOrganizationId;
    void operateUnionWhatsAppInbox(org,crypto.randomUUID(),"departments_list")
      .then(result=>{if(!cancelled && organizationRef.current===org) setDepartments(result.departments||[]);})
      .catch(()=>undefined);
    return()=>{cancelled=true;};
  },[activeOrganizationId,canView,channelReady]);

  const showOrders = async () => {
    if(!activeOrganizationId || !selected)return;
    setError("");setSavingOrder(true);
    try{
      const result=await operateUnionWhatsAppInbox(activeOrganizationId,selected.id,"order_options");
      setPossibleOrders(result.orders||[]);setOrdersOpen(true);
    }catch(reason){setError(systemErrorMessage(reason,"Não foi possível consultar as OS deste cliente."));}
    finally{setSavingOrder(false);}
  };
  const linkOrder = async (id:string) => {
    if(!activeOrganizationId || !selected)return;
    setSavingOrder(true);
    try{
      await operateUnionWhatsAppInbox(activeOrganizationId,selected.id,"order_link",{service_order_id:id});
      setConversations(old=>old.map(item=>item.id===selected.id?{...item,service_order_id:id||null}:item));
      setOrdersOpen(false);
    }catch(reason){setError(systemErrorMessage(reason,"Não foi possível vincular a OS."));}
    finally{setSavingOrder(false);}
  };
  const isMine = Boolean(selected && user?.id && selected.assigned_to === user.id);
  const canOperateSelected = Boolean(selected && (isMine || canManage));
  const canReply = Boolean(selected && canSend && selected.status === "in_att" && (isMine || canManage));

  const operate = async (action: Exclude<UnionWhatsAppInboxAction, "send_text" | "mark_read">) => {
    if (!selected || !activeOrganizationId || runningAction) return;
    setRunningAction(action);
    setError("");
    try {
      await operateUnionWhatsAppInbox(activeOrganizationId, selected.id, action);
      if (action === "assume") {
        // Mark the newly claimed conversation as read without affecting other
        // operators who have not claimed it.
        await operateUnionWhatsAppInbox(activeOrganizationId, selected.id, "mark_read").catch(() => null);
      }
      await refresh(true);
      if (action === "assume") {
        setFilter("in_att");
          window.setTimeout(() => inputRef.current?.focus(), 100);
      } else if (action === "reopen") {
        setFilter("waiting");
        setSelectedId(null);
      } else {
        setSelectedId(null);
        setFilter("waiting");
      }
    } catch (reason) {
      setError(systemErrorMessage(reason, "Não foi possível atualizar o atendimento."));
    } finally {
      setRunningAction(null);
    }
  };

  const openFromContact = (contact:UnionWhatsAppContact):boolean => {
    const existing=conversations.find(item=>item.chat_jid===contact.chat_jid);
    if(existing){
      setDepartmentFilter("all");
      setFilter(existing.status);
      setSelectedId(existing.id);
      setContactsOpen(false);
      return true;
    }
    if(!canSend || !contact.contact_phone){
      setError("Este contato não possui número verificável ou você não tem permissão para iniciar conversa.");
      return false;
    }
    const display=contact.display_name||contact.imported_name||contact.profile_name||"";
    setNewPhone(brazilPhoneMask(contact.contact_phone));
    setNewName(display);
    setNewConversationOpen(true);
    setContactsOpen(false);
    return true;
  };

  const startConversation = async () => {
    if (!activeOrganizationId || !canSend || starting) return;
    const digits = brazilNumberDigits(newPhone);
    if(!/^[1-9][0-9][0-9]{8,9}$/.test(digits)) {
      setError("Informe o DDD e um telefone brasileiro válido.");
      return;
    }
    setStarting(true);
    setError("");
    try {
      const result = await operateUnionWhatsAppInbox(
        activeOrganizationId, crypto.randomUUID(), "start",
        {phone:"55"+digits,contact_name:newName.trim()},
      );
      if (!result.conversation_id) throw new Error("A conversa não foi confirmada.");
      await refresh(true);
      setFilter("in_att");
      setSelectedId(result.conversation_id);
      setNewConversationOpen(false);
      setNewPhone("");
      setNewName("");
      requestAnimationFrame(() => inputRef.current?.focus());
    } catch(reason) {
      setError(systemErrorMessage(reason, "Não foi possível iniciar esta conversa."));
    } finally { setStarting(false); }
  };

  const showRouting = async () => {
    if (!selected || !activeOrganizationId || (!canSend && !canManage) || (!canManage && selected.assigned_to !== user?.id) || runningAction) return;
    setRunningAction("members");
    setError("");
    try {
      const response = await operateUnionWhatsAppInbox(activeOrganizationId, selected.id, "members");
      setMembers(response.members || []);
      setTargetUserId("");
      setTargetDepartmentId("");
      setRoutingMode("operator");
      await loadDepartments();
      setRoutingOpen(true);
    } catch (reason) {
      setError(systemErrorMessage(reason, "Não foi possível carregar os atendentes."));
    } finally {
      setRunningAction(null);
    }
  };

  const transfer = async () => {
    if (!selected || !activeOrganizationId || !(routingMode==="department"?targetDepartmentId:targetUserId) || runningAction) return;
    setRunningAction("transfer");
    try {
      await operateUnionWhatsAppInbox(activeOrganizationId,selected.id,
        routingMode==="department"?"transfer_department":"transfer",
        routingMode==="department"?{department_id:targetDepartmentId}:{target_user_id:targetUserId});
      setRoutingOpen(false);
      setSelectedId(null);
      await refresh(true);
    } catch (reason) {
      setError(systemErrorMessage(reason, "Não foi possível encaminhar o atendimento."));
    } finally {
      setRunningAction(null);
    }
  };

  const stopRecording = (discard = false) => {
    const recorder=recorderRef.current;
    if(!recorder) return;
    discardRecordingRef.current=discard;
    if(recorder.state!=="inactive") recorder.stop();
    micStreamRef.current?.getTracks().forEach(track=>track.stop());
    micStreamRef.current=null;
    setRecording(false);
  };

  const startRecording = async () => {
    if(!canReply || recording || imageOptimizing || attachment) return;
    if(!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder==="undefined") {
      setError("Este navegador não permite gravar áudio. Use o anexo para enviar um arquivo.");return;
    }
    const formats=["audio/ogg;codecs=opus","audio/mp4","audio/webm;codecs=opus","audio/webm"];
    const selectedFormat=formats.find(value=>MediaRecorder.isTypeSupported(value));
    if(!selectedFormat) {setError("O navegador não oferece um formato de gravação compatível.");return;}
    try {
      const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}});
      const recorder=new MediaRecorder(stream,{mimeType:selectedFormat,audioBitsPerSecond:64000});
      micStreamRef.current=stream;
      recorderRef.current=recorder;
      discardRecordingRef.current=false;
      const pieces:Blob[]=[];
      recorder.ondataavailable=event=>{if(event.data.size) pieces.push(event.data);};
      recorder.onstop=()=>{
        stream.getTracks().forEach(track=>track.stop());
        if(recorderRef.current===recorder) recorderRef.current=null;
        if(micStreamRef.current===stream) micStreamRef.current=null;
        setRecording(false);
        if(discardRecordingRef.current || !pieces.length)return;
        const realMime=recorder.mimeType.split(";")[0];
        const ext=realMime==="audio/ogg"?"ogg":realMime==="audio/mp4"?"m4a":"webm";
        const file=new File(pieces,`gravacao-${new Date().toISOString().replace(/[:.]/g,"-")}.${ext}`,{
          type:realMime,lastModified:Date.now(),
        });
        void onChooseMedia(file);
      };
      recorder.onerror=()=>{
        stream.getTracks().forEach(track=>track.stop());
        setRecording(false);
        setError("A gravação de áudio foi interrompida.");
      };
      recorder.start(500);
      setRecordingSeconds(0);
      setRecording(true);
      setError("");
    } catch {
      setError("Não foi possível acessar o microfone. Verifique a permissão do navegador.");
    }
  };
  useEffect(() => {
    if(!recording) return;
    const ticker=window.setInterval(()=>setRecordingSeconds(s=>s+1),1000);
    return()=>window.clearInterval(ticker);
  },[recording]);
  useEffect(()=>()=>{
    discardRecordingRef.current=true;
    if(recorderRef.current && recorderRef.current.state!=="inactive") recorderRef.current.stop();
    micStreamRef.current?.getTracks().forEach(track=>track.stop());
  },[selectedId,activeOrganizationId]);

  const onChooseMedia = async (file: File | null) => {
    if(!file) return;
    const seq=++optimizeSeq.current;
    const type=file.type;
    const image=["image/jpeg","image/png","image/webp"].includes(type);
    const audio=["audio/ogg","audio/opus","audio/mp4","audio/mpeg"].includes(type);
    const video=["video/mp4","video/3gpp"].includes(type);
    const doc=["application/pdf","text/plain","application/zip","application/octet-stream","audio/webm",
      "application/msword","application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-powerpoint","application/vnd.openxmlformats-officedocument.presentationml.presentation"].includes(type);
    const sourceLimit=image ? 25*1048576 : audio ? 16*1048576 : 25*1048576;
    if((!image && !audio && !video && !doc) || !file.size || file.size>sourceLimit) {
      setError("Formato não permitido ou arquivo maior que 25 MB. Áudios têm limite de 16 MB.");
      if(mediaInputRef.current) mediaInputRef.current.value="";
      return;
    }
    setImageOptimizing(image);
    setError("");
    try {
      const prepared=image ? await prepareImageForUpload(file,"whatsapp-image") : file;
      if(seq!==optimizeSeq.current) return;
      const limit=image ? 10*1048576 : audio ? 16*1048576 : 25*1048576;
      if(prepared.size>limit || (image && !["image/jpeg","image/png"].includes(prepared.type))) {
        setError("Não foi possível otimizar a imagem para até 10 MB em JPEG ou PNG.");
        if(mediaInputRef.current) mediaInputRef.current.value="";
        return;
      }
      if(mediaPreview) URL.revokeObjectURL(mediaPreview);
      setMediaPreview(image ? URL.createObjectURL(prepared) : null);
      setAttachment(prepared);
      inputRef.current?.focus({preventScroll:true});
    } catch(reason) {
      if(seq===optimizeSeq.current) setError(systemErrorMessage(reason,"Falha ao preparar a imagem."));
      if(mediaInputRef.current) mediaInputRef.current.value="";
    } finally {
      if(seq===optimizeSeq.current) setImageOptimizing(false);
    }
  };

  const sendText = () => {
    if (!selected || !activeOrganizationId || !canReply || submitGateRef.current || imageOptimizing || (!draft.trim() && !attachment)) return;
    submitGateRef.current = true;
    queueMicrotask(() => { submitGateRef.current = false; });
    const text = draft.trim();
    const file = attachment;
    const preview = mediaPreview;
    const fileType = file ? file.type.startsWith("image/") ? "image" :
      file.type.startsWith("audio/") && file.type!=="audio/webm" ? "audio" : file.type.startsWith("video/") ? "video" : "file" : null;
    const threadId = selected.id;
    const organizationId = activeOrganizationId;
    const requestId = crypto.randomUUID();
    // Capture and clear the current draft before awaiting. The composer stays
    // interactive for subsequent messages, matching the SAC outbox UX.
    setDraft("");
    setAttachment(null);
    setMediaPreview(null);
    if (mediaInputRef.current) mediaInputRef.current.value = "";
    setEmojiOpen(false);
    setPending(current => [...current, {
      id: requestId, conversationId: threadId, organizationId,
      text, status: "sending", sentAt: new Date().toISOString(), fileName:file?.name, mediaType:fileType || undefined,
    }]);
    scrollToLatest("smooth");
    inputRef.current?.focus({ preventScroll: true });
    sendingIds.current.add(requestId);
    void (async () => {
      try {
        let extra: {text:string;client_message_id:string;media_name?:string;media_mime?:string;
          media_type?:string;media_size?:number;media_path?:string} =
          { text, client_message_id: requestId };
        if (file && fileType) {
          const base={media_name:file.name,media_mime:file.type,
            media_type:fileType,media_size:file.size,client_message_id:requestId};
          const upload=await operateUnionWhatsAppInbox(organizationId,threadId,"prepare_media",base);
          if(!upload.upload_path || !upload.upload_token)
            throw Error("O envio seguro do arquivo não foi autorizado.");
          const {error:uploadError}=await supabase.storage.from("union-whatsapp-media")
            .uploadToSignedUrl(upload.upload_path,upload.upload_token,file,{contentType:file.type});
          if(uploadError) throw uploadError;
          extra={...extra,...base,media_path:upload.upload_path};
        }
        await operateUnionWhatsAppInbox(organizationId, threadId, file ? "send_media" : "send_text", extra);
        if (organizationRef.current !== organizationId) return;
        await Promise.all([refreshMessages(threadId, true), refresh(true)]);
        setPending(current => current.filter(item => item.id !== requestId));
        if (preview) URL.revokeObjectURL(preview);
      } catch (reason) {
        if (organizationRef.current !== organizationId) return;
        const detail = systemErrorMessage(reason, "Não foi possível confirmar o envio.");
        if (/mensagem ou anexo inv[aá]lido|assuma o atendimento|conversa n[aã]o atribu[ií]da/i.test(detail)) {
          if (!file) setDraft(current => current || text);
          setPending(current => current.filter(item => item.id !== requestId));
          setError(detail);
          return;
        }
        setPending(current => current.map(item => item.id === requestId
          ? { ...item, status: /confirm|pendente|verifique/i.test(detail) ? "unknown" : "failed", error: detail }
          : item));
      } finally {
        sendingIds.current.delete(requestId);
      }
    })();
  };


  if (!canView) return <div className="p-5 text-sm text-muted-foreground">Você não possui permissão para visualizar atendimentos WhatsApp nesta empresa.</div>;

  return <div className="space-y-5">
    <header className="flex min-w-0 items-center justify-between gap-3 border-b border-border pb-5">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <h1 className="shrink-0 whitespace-nowrap text-lg font-black leading-tight text-foreground sm:text-2xl">Atendimentos</h1>
        <span aria-hidden="true" className="h-8 w-px shrink-0 bg-border"/>
        <nav aria-label="Canais de atendimento" className="flex min-w-0 items-center gap-2 overflow-x-auto whitespace-nowrap">

      <button type="button" aria-current="page" aria-label="WhatsApp, canal selecionado"
        className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-primary/35 bg-primary/10 px-3.5 py-2 text-sm font-bold text-primary">
        <WhatsAppIcon/> WhatsApp
      </button>
      <button type="button" disabled aria-label="Instagram, em breve" title="Instagram · Em breve"
        className="inline-flex min-h-10 cursor-not-allowed items-center gap-2 rounded-lg border border-border px-3.5 py-2 text-sm font-semibold text-muted-foreground opacity-65">
        <Instagram size={19}/> Instagram
      </button>
      <button type="button" disabled aria-label="Facebook, em breve" title="Facebook · Em breve"
        className="inline-flex min-h-10 cursor-not-allowed items-center gap-2 rounded-lg border border-border px-3.5 py-2 text-sm font-semibold text-muted-foreground opacity-65">
        <Facebook size={19}/> Facebook
      </button>
    </nav>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {(hasPermission("settings.channels.view") || hasPermission("settings.channels.manage") || canManage) &&
          <div ref={settingsMenuRef} className="relative">
            <button type="button" aria-label="Configurações dos atendimentos" aria-haspopup="menu"
              aria-expanded={settingsOpen} title="Configurações" onClick={() => setSettingsOpen(value => !value)}
              className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-lg border border-border bg-card text-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              <Settings2 size={28} strokeWidth={2.2}/>
            </button>
            {settingsOpen && <div role="menu" aria-label="Configurações dos atendimentos"
              className="absolute right-0 top-full z-40 mt-2 w-64 rounded-lg border border-border bg-card p-1.5 shadow-xl">
              {(hasPermission("settings.channels.view") || hasPermission("settings.channels.manage")) &&
                <button role="menuitem" type="button" onClick={() => {setSettingsOpen(false);onConfigure();}}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-left text-sm hover:bg-muted">
                  <Settings2 size={18}/> Canais de Atendimento
                </button>}
              {canManage && <>
                <button role="menuitem" type="button" onClick={() => {setSettingsOpen(false);setSettingsModal("departments");}}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-left text-sm hover:bg-muted">
                  <Building2 size={18}/> Departamentos e equipe
                </button>
                <button role="menuitem" type="button" onClick={() => {setSettingsOpen(false);setSettingsModal("queues");}}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-left text-sm hover:bg-muted">
                  <MessageCircle size={18}/> Configurar filas
                </button>
                <button role="menuitem" type="button" onClick={() => {setSettingsOpen(false);setSettingsModal("operators");}}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-left text-sm hover:bg-muted">
                  <Users size={18}/> Operadores
                </button>
              </>}
            </div>}
          </div>}
        <AdminButton variant="secondary" onClick={onBack}>Voltar</AdminButton>
      </div>
    </header>
    {error && <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-600 dark:text-red-400">
      <CircleAlert size={17} className="mr-2 inline"/>{error}
    </div>}
    {channelError && <p role="alert" className="text-xs text-red-600">{channelError}</p>}
    {channelReady === null ? <div className="flex min-h-[440px] items-center justify-center text-sm text-muted-foreground">{channelError?"Não foi possível verificar a conexão do WhatsApp.":"Verificando conexão do WhatsApp..."}</div> :
     channelReady === false ? <div className="flex min-h-[440px] flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border bg-card p-6 text-center">
      <MessageCircle size={36} className="text-muted-foreground"/>
      <div className="space-y-2">
        <p className="text-base font-bold">Nenhum canal WhatsApp conectado</p>
        <p className="max-w-sm text-sm text-muted-foreground">Configure e conecte um canal para começar a receber e enviar mensagens.</p>
      </div>
      {(hasPermission("settings.channels.view") || hasPermission("settings.channels.manage")) &&
        <AdminButton onClick={() => onConfigure()}><Settings2 size={16}/> Configurar canal</AdminButton>}
    </div> : <div className="h-[min(76vh,850px)] min-h-[520px] overflow-hidden rounded-none border border-border bg-card shadow-sm">
      <div className="grid h-full min-h-0 grid-rows-[280px_minmax(0,1fr)] md:grid-cols-[340px_minmax(0,1fr)] md:grid-rows-1">
        <aside className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden border-b border-border bg-card md:border-b-0 md:border-r">
          <div className="border-b border-border bg-muted/35 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-base font-black text-foreground">Conversas</p>
              <div className="flex items-center gap-2">
                <button type="button" onClick={()=>{setEditContactId(null);setContactsOpen(true);}} title="Contatos"
                  className="flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-xs font-semibold text-foreground hover:bg-muted">
                  <ContactRound size={15}/> Contatos
                </button>
                {canSend && <button type="button" onClick={() => setNewConversationOpen(true)}
                  className="flex h-8 items-center gap-1.5 rounded-lg border border-primary/25 bg-primary/10 px-2.5 text-xs font-bold text-primary hover:bg-primary/15">
                  <Plus size={15}/> Nova
                </button>}
              </div>
            </div>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              {scopedConversations.length} conversa(s) · {scopedConversations.filter(item => item.unread_count > 0).length} não lida(s)
            </p>
            <div className="mt-3 grid grid-cols-2 gap-1.5">
              {filters.map(item => <button key={item.value} type="button" onClick={() => setFilter(item.value)}
                aria-pressed={filter === item.value}
                className={`flex min-w-0 items-center justify-between gap-1.5 rounded-lg border px-2 py-2 text-[10px] font-bold transition-colors ${filter === item.value ? "border-primary bg-primary-soft text-foreground" : "border-border bg-card text-muted-foreground hover:bg-muted"}`}>
                <span className="truncate">{item.label}</span>
                <span className={`inline-flex min-w-6 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-black ${item.tone}`}>{counts[item.value]}</span>
              </button>)}
            </div>
            {departments.length>0 && <select aria-label="Filtrar departamento" value={departmentFilter}
              onChange={event=>setDepartmentFilter(event.target.value)}
              className="mt-3 w-full rounded-lg border border-border bg-card px-2 py-2 text-xs outline-none focus:border-primary">
              <option value="all">Todos os departamentos</option>
              <option value="none">Sem departamento</option>
              {departments.filter(d=>d.is_active).map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
            </select>}
            <div className="relative mt-3">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-blue-600"/>
              <input value={query} onChange={event => setQuery(event.target.value)} type="search" aria-label="Buscar conversa"
                placeholder="Nome, telefone ou contato"
                className="w-full rounded-lg border border-border bg-card py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/25"/>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {loading ? <div className="p-5"><LoadingState text="Carregando conversas..."/></div>
            : visible.length === 0 ? <div className="flex flex-col items-center gap-2 p-6 text-center text-xs text-muted-foreground">
              <MessageCircle size={26}/><p>Nenhuma conversa encontrada.</p>
              {scopedConversations.length === 0 && <p>Ative o recebimento do canal e envie uma mensagem de outro aparelho para testar.</p>}
            </div>
            : visible.map(item => {
              const selected = item.id === selectedId;
              const name = item.contact_name || item.contact_phone || "Contato";
              return <button key={item.id} type="button" onClick={() => setSelectedId(item.id)}
                className={`box-border flex w-full min-w-0 items-start gap-3 border-b border-border px-3 py-3 text-left transition-colors last:border-b-0 ${selected ? "border-l-[3px] border-l-primary bg-primary-soft" : item.unread_count > 0 ? "border-l-[3px] border-l-primary/50 bg-primary-soft/45 hover:bg-primary-soft/65" : "bg-card hover:bg-muted/55"}`}>
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-black ${selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                  {avatars[item.id] ? <img src={avatars[item.id]!} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" onError={()=>setAvatars(old=>({...old,[item.id]:null}))}/> : initials(name)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex justify-between gap-2">
                    <span className="truncate text-sm font-black text-foreground">{name}</span>
                    <span className="shrink-0 text-[9px] text-muted-foreground">{compactDate(item.last_message_at)}</span>
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground">{item.contact_phone || "WhatsApp"}</span>
                  <span className="mt-1.5 flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-[11px] text-muted-foreground">{item.last_message || "Conversa recebida"}</span>
                    {item.unread_count > 0 && <span className="rounded-full bg-blue-600 px-1.5 py-0.5 text-[10px] font-bold text-white">{item.unread_count}</span>}
                  </span>
                </span>
              </button>;
            })}
          </div>
        </aside>
        <section className="flex min-h-0 min-w-0 flex-col bg-card">
          {!selected ? <div role="status" className="flex h-full flex-col items-center justify-center px-6 py-10 text-center">
            <p className="text-base font-semibold tracking-tight text-foreground sm:text-lg">Selecione uma conversa</p>
            <div aria-hidden="true" className="mt-4 flex gap-2">
              {[0,1,2].map(index => <span key={index} className="h-2.5 w-2.5 animate-bounce rounded-full bg-primary motion-reduce:animate-none" style={{ animationDelay: `${index * 160}ms` }}/>)}
            </div>
          </div> : <>
            <header className="flex min-h-16 items-center gap-3 border-b border-border bg-muted/30 px-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-xs font-black">
                 {avatars[selected.id] ? <img src={avatars[selected.id]!} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover" onError={()=>setAvatars(old=>({...old,[selected.id]:null}))}/> : initials(selected.contact_name)}
               </span>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  <p className="min-w-0 flex-1 truncate text-sm font-black text-foreground">{selected.contact_name}</p>
                  {(canSend||canManage) && <button type="button"
                    title="Salvar ou alterar o nome deste contato na Union"
                    onClick={()=>{setEditContactId(selected.id);setContactsOpen(true);}}
                    className="shrink-0 text-[11px] font-semibold text-primary hover:underline">
                    Editar contato
                  </button>}
                </div>
                <p className="text-xs text-muted-foreground">
                   {selected.contact_phone || "Contato WhatsApp"} · {filters.find(item => item.value === selected.status)?.label}
                   {selected.contact_presence==="online" && selected.contact_presence_at &&
                     Date.now()-new Date(selected.contact_presence_at).getTime()<120000 &&
                     <span className="ml-2 font-semibold text-emerald-600">Online</span>}
                 </p>
                 {onOpenCustomer && linkedCustomers[selected.id] && <button type="button"
                   onClick={()=>onOpenCustomer(linkedCustomers[selected.id]!.id)}
                   className="mt-0.5 max-w-full truncate text-left text-[11px] font-semibold text-blue-600 hover:underline dark:text-blue-400"
                   title="Abrir cadastro do cliente vinculado pelo telefone">
                   Cliente: {linkedCustomers[selected.id]!.name} · Abrir cadastro
                 </button>}
              </div>
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                {selected.status === "waiting" && (canSend || canManage) &&
                  <AdminButton size="sm" disabled={Boolean(runningAction)} onClick={() => void operate("assume")}><UserCheck size={15}/> Assumir</AdminButton>}
                {selected.status === "in_att" && canOperateSelected && <>
                  {onOpenOrder && selected.service_order_id && <button type="button" title="Abrir OS vinculada"
                    onClick={()=>onOpenOrder(selected.service_order_id!)} className="rounded-md border border-border px-2 py-1 text-xs font-semibold hover:bg-muted">OS</button>}
                  {onOpenOrder && hasPermission("orders.details.view") && <button type="button" title="Vincular OS deste cliente"
                    onClick={()=>void showOrders()} disabled={savingOrder}
                    className="rounded-md border border-border px-2 py-1 text-xs font-semibold hover:bg-muted">Vincular OS</button>}
                  {canManage && <button type="button" title="Histórico do atendimento" aria-label="Histórico do atendimento"
                    onClick={()=>void viewHistory()} className="flex h-8 w-8 items-center justify-center rounded-md border border-border hover:bg-muted">
                    <History size={15}/>
                  </button>}
                  {(canSend || canManage) && <AdminButton variant="secondary" size="sm" disabled={Boolean(runningAction)} onClick={() => void showRouting()}>
                    <ArrowRightLeft size={15}/> <span className="hidden sm:inline">Encaminhar</span>
                  </AdminButton>}
                  <AdminButton variant="secondary" size="sm" disabled={Boolean(runningAction)} onClick={() => void operate("return_queue")}><RotateCcw size={15}/> <span className="hidden sm:inline">Devolver</span></AdminButton>
                  <AdminButton size="sm" disabled={Boolean(runningAction)} onClick={() => void operate("finish")}><CheckCircle2 size={15}/> Finalizar</AdminButton>
                </>}
                {selected.status === "finished" && canManage &&
                  <AdminButton variant="secondary" size="sm" disabled={Boolean(runningAction)} onClick={() => void operate("reopen")}><RotateCcw size={15}/> Reabrir</AdminButton>}
              </div>
            </header>
            <div className="relative min-h-0 flex-1">
              <div ref={scrollRef} onScroll={handleMessagesScroll}
                className="h-full overflow-y-auto overscroll-contain bg-muted/25 px-3 py-4 [scrollbar-gutter:stable] sm:px-5"
                style={{ backgroundImage: "radial-gradient(circle at 1px 1px, rgba(148,163,184,0.18) 1px, transparent 0)", backgroundSize: "22px 22px" }}>
              {messagesLoading && messages.length === 0 ? <LoadingState text="Carregando mensagens..."/>
              : messages.length === 0 && pending.filter(item => item.conversationId === selected.id).length === 0 ?
                <p className="p-5 text-center text-xs text-muted-foreground">Nenhuma mensagem armazenada nesta conversa.</p>
              : <div className="mx-auto flex max-w-4xl flex-col gap-1">
                {messages.map(message => <div key={message.id} className={`mt-2 flex ${message.direction === "outgoing" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[88%] rounded-lg px-3 py-2 shadow-sm sm:max-w-[72%] ${message.direction === "outgoing" ? "bg-emerald-100 text-emerald-950 dark:bg-emerald-950/55 dark:text-emerald-50" : "border border-border bg-card text-foreground"}`}>
                    {message.direction === "outgoing" && message.sender_name &&
                      <p className="mb-1 text-[11px] font-black">{message.sender_name}</p>}
                    <MessageBody message={message} organizationId={activeOrganizationId || ""} onMediaLoad={() => { if (followLatestRef.current) scrollToLatest("auto"); }}/>
                    <span className="mt-1 flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
                      {clock(message.sent_at)}
                      {message.direction === "outgoing" && (message.delivery_status === "read"
                        ? <CheckCheck size={13} className="text-sky-600" aria-label="Visualizada" />
                        : message.delivery_status === "delivered"
                          ? <CheckCheck size={13} aria-label="Entregue" />
                          : <Check size={13} aria-label="Enviada" />)}
                    </span>
                  </div>
                </div>)}
                {pending.filter(item => item.conversationId === selected.id && item.organizationId === activeOrganizationId)
                  .map(item => <div key={item.id} className="mt-2 flex justify-end">
                    <div className="max-w-[88%] rounded-lg bg-emerald-100 px-3 py-2 text-emerald-950 shadow-sm dark:bg-emerald-950/55 dark:text-emerald-50 sm:max-w-[72%]">
                      {item.fileName && <p className="mb-1 flex items-center gap-2 text-xs"><Paperclip size={13}/>{item.fileName}</p>}
                      {item.text && <p className="whitespace-pre-wrap break-words text-sm">{item.text}</p>}
                      <div className="mt-1 flex items-center justify-end gap-1.5 text-[10px] opacity-70">
                        {item.status === "sending" ? <><LoaderCircle size={12} className="animate-spin"/> Enviando</>
                          : <span role="alert" className="text-red-700 dark:text-red-300">{item.error || "Envio não confirmado"}</span>}
                      </div>
                      {item.status !== "sending" && <p className="mt-1 text-[10px] opacity-70">
                        Confira no WhatsApp antes de tentar outro envio.
                      </p>}
                    </div>
                  </div>)}
              </div>}
              </div>
              {showJumpToLatest && <button type="button" onClick={() => scrollToLatest("smooth")}
                className="absolute bottom-4 right-4 z-20 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-lg transition hover:bg-muted"
                aria-label="Ir para a última mensagem" title="Ir para a última mensagem"><ChevronDown size={19}/></button>}
            </div>
            <footer className="border-t border-border bg-card px-3 py-3">
              {canReply ? <div className="mx-auto max-w-4xl">
                {imageOptimizing && <div role="status" className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <LoaderCircle size={14} className="animate-spin"/> Otimizando imagem antes do envio...
                </div>}
                {recording && <div role="status" className="mb-2 flex items-center gap-2 text-xs font-semibold text-red-600">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-red-600"/>
                  Gravando · {String(Math.floor(recordingSeconds/60)).padStart(2,"0")}:{String(recordingSeconds%60).padStart(2,"0")}
                  <button type="button" onClick={()=>stopRecording(true)} className="ml-auto rounded-md border border-border px-2 py-1 text-muted-foreground hover:bg-muted">Cancelar</button>
                  <button type="button" onClick={()=>stopRecording(false)} className="rounded-md bg-primary px-2 py-1 text-primary-foreground">Concluir</button>
                </div>}
                {attachment && <div className="mb-2 flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs">
                  {mediaPreview && <img src={mediaPreview} alt="Prévia do anexo" className="h-10 w-10 rounded object-cover" />}
                  <Paperclip size={15} className="shrink-0"/>
                  <span className="min-w-0 flex-1 truncate">{attachment.name} · {(attachment.size/1048576).toFixed(2)} MB</span>
                  <button type="button" onClick={() => {setAttachment(null); if (mediaPreview) URL.revokeObjectURL(mediaPreview); setMediaPreview(null); if(mediaInputRef.current) mediaInputRef.current.value="";}}
                    aria-label="Remover anexo" className="rounded p-1 hover:bg-muted"><X size={17}/></button>
                </div>}
                <form className="relative flex min-w-0 items-stretch rounded-xl border border-border bg-muted/55 transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20"
                  onSubmit={event => { event.preventDefault(); sendText(); }}>
                  <input ref={mediaInputRef} type="file" className="hidden"
                    accept="image/jpeg,image/png,image/webp,audio/ogg,audio/opus,audio/mp4,audio/mpeg,audio/webm,video/mp4,video/3gpp,application/pdf,text/plain,application/zip,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                    aria-label="Selecionar anexo" onChange={event => { void onChooseMedia(event.target.files?.[0] || null); }}/>
                  <button type="button" aria-label="Anexar imagem, áudio, vídeo ou arquivo"
                    title="Anexar (imagens 10 MB; áudio 16 MB; vídeo/documentos 25 MB)"
                    onClick={() => mediaInputRef.current?.click()}
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-l-[11px] border-r border-border text-foreground hover:bg-muted">
                    <Paperclip size={22}/>
                  </button>
                  <div className="relative flex h-12 shrink-0">
                    <button type="button" aria-label="Selecionar emoji" aria-expanded={emojiOpen}
                      onClick={() => setEmojiOpen(v => !v)}
                      className={`flex h-12 w-12 items-center justify-center border-r border-border text-foreground hover:bg-muted ${emojiOpen ? "bg-primary-soft text-primary" : ""}`}>
                      <Smile size={22}/>
                    </button>
                    {emojiOpen && <SacEmojiPicker recentEmojis={[]} onSelect={emoji => { setDraft(current => current + emoji); inputRef.current?.focus(); setEmojiOpen(false); }}/>}
                  </div>
                  <textarea ref={inputRef} rows={1} aria-label="Mensagem" value={draft} maxLength={4000}
                    placeholder={attachment ? "Legenda (opcional)" : "Digite uma mensagem"}
                    onChange={event => setDraft(event.target.value)}
                    onKeyDown={event => {
                      if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                        event.preventDefault(); sendText();
                      }
                    }}
                    className="min-h-12 min-w-0 flex-1 resize-none bg-transparent px-3 py-3 text-sm leading-6 text-foreground outline-none placeholder:text-muted-foreground/65"
                  />
                  {!draft.trim() && !attachment && <button type="button" aria-label={recording?"Parar gravação":"Gravar áudio"}
                    title="Gravar áudio" onClick={()=>recording ? stopRecording(false) : void startRecording()}
                    className={`flex h-12 w-12 shrink-0 items-center justify-center border-l border-border hover:bg-muted ${recording?"text-red-600":"text-foreground"}`}>
                    {recording ? <Square size={20}/> : <Mic size={21}/>}
                  </button>}
                  <button type="submit" disabled={recording || imageOptimizing || (!draft.trim() && !attachment)} aria-label="Enviar mensagem" title="Enviar mensagem"
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-r-[11px] border-l border-primary/20 bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-45">
                    <Send size={22}/>
                  </button>
                </form>
              </div> : <p className="py-2 text-center text-xs text-muted-foreground">
                {selected.status === "waiting" ? "Assuma o atendimento para responder." :
                  selected.status === "finished" ? "Atendimento finalizado. Reabra para responder." :
                  "Esta conversa está atribuída a outro atendente."}
              </p>}
            </footer>
          </>}
        </section>
      </div>
    </div>}
    {contactsOpen && activeOrganizationId && <UnionWhatsAppContactsDialog
      organizationId={activeOrganizationId} canImport={canManage}
      canEdit={canSend || canManage}
      initialContact={editContactId?(()=>{
        const thread=scopedConversations.find(item=>item.id===editContactId);
        return thread?{id:thread.id,chat_jid:thread.chat_jid,
          contact_phone:thread.contact_phone,display_name:null,device_name:null,
          imported_name:null,profile_name:null,updated_at:""}:null;
      })():null}
      initialName={editContactId?scopedConversations.find(item=>item.id===editContactId)?.contact_name:""}
      onClose={()=>{setContactsOpen(false);setEditContactId(null);}}
      onSaved={()=>void refresh(true)}
      onChoose={openFromContact}
    />}
    {newConversationOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-3"
      onClick={event => { if (event.target === event.currentTarget) setNewConversationOpen(false); }}>
      <form onSubmit={event => {event.preventDefault(); void startConversation();}}
        role="dialog" aria-modal="true" aria-label="Nova conversa WhatsApp"
        className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <p className="font-black">Nova conversa</p>
          <button type="button" aria-label="Fechar" onClick={() => setNewConversationOpen(false)} className="rounded p-1 hover:bg-muted"><X size={18}/></button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Informe o DDD e o telefone. O código do Brasil (+55) é aplicado automaticamente.</p>
        <label className="mt-4 block text-xs font-semibold" htmlFor="union-new-phone">WhatsApp *</label>
        <div className="mt-1 flex w-full items-stretch overflow-hidden rounded-lg border border-border bg-background focus-within:border-primary">
          <span className="flex shrink-0 items-center border-r border-border bg-muted/45 px-3 text-sm font-semibold text-foreground">+55</span>
          <input id="union-new-phone" required autoFocus inputMode="tel" autoComplete="tel-national"
            value={newPhone} onChange={event => setNewPhone(brazilPhoneMask(event.target.value))}
            maxLength={16} placeholder="(79) 98803-7605"
            className="min-w-0 flex-1 px-3 py-2.5 text-sm outline-none"/>
        </div>
        <label className="mt-3 block text-xs font-semibold" htmlFor="union-new-name">Nome do contato (opcional)</label>
        <input id="union-new-name" value={newName} maxLength={120} onChange={event => setNewName(event.target.value)}
          placeholder="Nome" className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"/>
        <div className="mt-5 flex justify-end gap-2">
          <AdminButton variant="secondary" onClick={() => setNewConversationOpen(false)}>Cancelar</AdminButton>
          <AdminButton disabled={starting || !newPhone.trim()} onClick={() => void startConversation()}>{starting ? "Abrindo..." : "Abrir conversa"}</AdminButton>
        </div>
      </form>
    </div>}
    {routingOpen && selected && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-3" role="presentation"
      onClick={event => { if (event.target === event.currentTarget) setRoutingOpen(false); }}>
      <div role="dialog" aria-modal="true" aria-label="Encaminhar atendimento" className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl">
        <div className="flex items-center justify-between gap-3">
          <p className="font-black text-foreground">Encaminhar atendimento</p>
          <button type="button" onClick={() => setRoutingOpen(false)} aria-label="Fechar" className="rounded-md p-1 hover:bg-muted"><X size={18}/></button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" onClick={()=>setRoutingMode("operator")}
            className={`rounded-lg border px-3 py-2 text-xs font-semibold ${routingMode==="operator"?"border-primary bg-primary/10 text-primary":"border-border"}`}>
            Atendente
          </button>
          <button type="button" onClick={()=>setRoutingMode("department")}
            className={`rounded-lg border px-3 py-2 text-xs font-semibold ${routingMode==="department"?"border-primary bg-primary/10 text-primary":"border-border"}`}>
            Departamento
          </button>
        </div>
        {routingMode==="operator" ? <>
          <label htmlFor="union-whatsapp-routing" className="mt-4 block text-xs font-semibold">Atendente *</label>
          <select id="union-whatsapp-routing" value={targetUserId} onChange={event => setTargetUserId(event.target.value)}
            className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-3 text-sm">
            <option value="">Selecione um atendente</option>
            {members.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          {members.length===0 && <p className="mt-2 text-xs text-muted-foreground">Nenhum atendente autorizado.</p>}
        </> : <>
          <label htmlFor="union-whatsapp-department-target" className="mt-4 block text-xs font-semibold">Departamento *</label>
          <select id="union-whatsapp-department-target" value={targetDepartmentId}
            onChange={event=>setTargetDepartmentId(event.target.value)}
            className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-3 text-sm">
            <option value="">Selecione o departamento</option>
            {departments.filter(item=>item.is_active).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          {departments.filter(item=>item.is_active).length===0 &&
            <p className="mt-2 text-xs text-muted-foreground">Cadastre um departamento nas configurações.</p>}
        </>}
        <div className="mt-5 flex justify-end gap-2">
          <AdminButton variant="secondary" onClick={() => setRoutingOpen(false)}>Cancelar</AdminButton>
          <AdminButton disabled={!(routingMode==="department"?targetDepartmentId:targetUserId) || Boolean(runningAction)} onClick={() => void transfer()}>Encaminhar</AdminButton>
        </div>
      </div>
    </div>}
    {ordersOpen && selected && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-3"
      role="presentation" onClick={event=>{if(event.target===event.currentTarget)setOrdersOpen(false);}}>
      <div role="dialog" aria-modal="true" aria-label="Vincular ordem de serviço"
        className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <p className="font-bold">Vincular ordem de serviço</p>
          <button type="button" aria-label="Fechar" onClick={()=>setOrdersOpen(false)}><X size={18}/></button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Apenas OS do cadastro verificado por este telefone.</p>
        <div className="mt-4 max-h-72 space-y-1 overflow-y-auto">
          {possibleOrders.length===0 && <p className="py-4 text-center text-xs text-muted-foreground">Nenhuma OS encontrada para este cliente.</p>}
          {possibleOrders.map(order=><button key={order.id} type="button" onClick={()=>void linkOrder(order.id)}
            disabled={savingOrder} className="flex w-full items-center justify-between rounded-lg border border-border px-3 py-2.5 text-sm hover:bg-muted">
            <span>OS {order.os_number}</span>
            {selected.service_order_id===order.id && <Check size={16} className="text-primary"/>}
          </button>)}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          {selected.service_order_id && <AdminButton variant="secondary" disabled={savingOrder} onClick={()=>void linkOrder("")}>Desvincular</AdminButton>}
          <AdminButton variant="secondary" onClick={()=>setOrdersOpen(false)}>Fechar</AdminButton>
        </div>
      </div>
    </div>}
    {settingsModal && <AdminDialog open={true} onClose={() => setSettingsModal(null)}
      title={settingsModal === "departments" ? "Departamentos e equipe" : settingsModal === "queues" ? "Configurar filas" : "Operadores"}
      className="w-full max-w-4xl" bodyClassName="p-3 sm:p-5" minimizable={false}
      footer={settingsModal !== "operators" && canManage ? <div className="flex justify-end">
        <AdminButton onClick={() => setSettingsCreateRequest(value => value + 1)}>Novo</AdminButton>
      </div> : undefined}>
      <WhatsAppOperationsSettings key={settingsModal} section={settingsModal} createRequest={settingsCreateRequest}/>
    </AdminDialog>}
    {historyOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-3"
      onClick={event=>{if(event.target===event.currentTarget)setHistoryOpen(false);}}>
      <div role="dialog" aria-modal="true" aria-label="Histórico do atendimento"
        className="flex max-h-[70vh] w-full max-w-md flex-col rounded-xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="font-bold">Histórico do atendimento</p>
          <button aria-label="Fechar" type="button" onClick={()=>setHistoryOpen(false)}><X size={18}/></button>
        </div>
        <div className="min-h-0 space-y-2 overflow-y-auto p-4">
          {handoffs.length===0 && <p className="text-xs text-muted-foreground">Nenhum encaminhamento registrado.</p>}
          {handoffs.map(item=><div key={item.id} className="border-b border-border py-2 text-xs">
            <p className="font-semibold">{({
              assume:"Atendimento assumido",return_queue:"Devolvido à fila",
              finish:"Finalizado",reopen:"Reaberto",
              transfer_operator:"Encaminhado ao atendente",transfer_department:"Encaminhado ao departamento",
              start:"Conversa iniciada",
            } as Record<string,string>)[item.action]||item.action}</p>
            <p className="text-muted-foreground">{new Date(item.created_at).toLocaleString("pt-BR")}</p>
          </div>)}
        </div>
      </div>
    </div>}
  </div>;
}
