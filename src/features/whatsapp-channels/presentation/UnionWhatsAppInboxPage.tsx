import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CircleAlert, ChevronDown, FileText, Image as ImageIcon, LoaderCircle, MessageCircle, Paperclip, RefreshCw, Search, Send, Smile, RotateCcw, CheckCircle2, UserCheck, Volume2, X, Check, CheckCheck, ArrowRightLeft } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { SacEmojiPicker } from "@/features/sac-digital/presentation/SacEmojiPicker";
import { supabase } from "@/lib/supabase";
import { AdminButton, PageHeader } from "@/shared/ui/admin/AdminLayout";
import { LoadingState } from "@/shared/ui/admin/AdminFeedback";
import { systemErrorMessage } from "@/shared/domain/error-message";
import {
  listUnionWhatsAppConversations, listUnionWhatsAppMessages, operateUnionWhatsAppInbox,
  type UnionWhatsAppInboxAction, type UnionWhatsAppConversation, type UnionWhatsAppMessage,
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

export function UnionWhatsAppInboxPage({ onBack, onConfigure }: { onBack: () => void; onConfigure: () => void }) {
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
  const mediaInputRef = useRef<HTMLInputElement | null>(null);
  const [routingOpen, setRoutingOpen] = useState(false);
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
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const messageIdentity = useRef(0);

  const loadingList = useRef(false);
  const organizationRef = useRef(activeOrganizationId);
  organizationRef.current = activeOrganizationId;

  const refresh = useCallback(async (silent = false) => {
    if (!activeOrganizationId || !canView || loadingList.current) return;
    loadingList.current = true;
    if (!silent) setLoading(true);
    try {
      const items = await listUnionWhatsAppConversations(activeOrganizationId);
      if (organizationRef.current !== activeOrganizationId) return;
      setConversations(items);
      setLastUpdated(new Date().toISOString());
      setError("");
    } catch (reason) {
      if (organizationRef.current === activeOrganizationId) setError(systemErrorMessage(reason, "Não foi possível consultar as conversas."));
    } finally {
      loadingList.current = false;
      if (organizationRef.current === activeOrganizationId) setLoading(false);
    }
  }, [activeOrganizationId, canView]);

  const refreshMessages = useCallback(async (conversationId: string, silent = false) => {
    if (!activeOrganizationId || !canView) return;
    const identity = ++messageIdentity.current;
    if (!silent) setMessagesLoading(true);
    try {
      const list = await listUnionWhatsAppMessages(activeOrganizationId, conversationId);
      if (identity === messageIdentity.current && organizationRef.current === activeOrganizationId) setMessages(list);
    } catch (reason) {
      if (identity === messageIdentity.current && organizationRef.current === activeOrganizationId) setError(systemErrorMessage(reason, "Não foi possível consultar as mensagens."));
    } finally {
      if (identity === messageIdentity.current) setMessagesLoading(false);
    }
  }, [activeOrganizationId, canView]);

  useEffect(() => {
    loadingList.current = false;
    setConversations([]);
    setMessages([]);
    setSelectedId(null);
    setFilter("waiting");
    setDraft("");
    setAttachment(null);
    setMediaPreview(null);
    setPending([]);
    setRoutingOpen(false);
    setMembers([]);
    setError("");
    messageIdentity.current += 1;
    setLoading(true);
    void refresh();
  }, [refresh]);

  // Realtime only while the inbox page is open. A bounded foreground refresh
  // is kept as fallback when tenant replication is temporarily unavailable.
  useEffect(() => {
    if (!activeOrganizationId || !canView) return;
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
        filter: `organization_id=eq.${activeOrganizationId}` }, schedule)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "union_whatsapp_messages",
        filter: `organization_id=eq.${activeOrganizationId}` }, schedule)
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
  }, [activeOrganizationId, canView, selectedId, refresh, refreshMessages]);

  useEffect(() => {
    if (!selectedId) { setMessages([]); return; }
    setMessages([]);
    void refreshMessages(selectedId);
  }, [selectedId, refreshMessages]);

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

  const scopedConversations = conversations.filter(item => item.organization_id === activeOrganizationId);
  const selected = scopedConversations.find(item => item.id === selectedId) || null;
  const counts = useMemo(() => {
    const result: Record<Filter, number> = { waiting: 0, in_att: 0, abandoned: 0, finished: 0 };
    scopedConversations.forEach(item => { result[item.status] = (result[item.status] || 0) + 1; });
    return result;
  }, [scopedConversations]);
  const visible = useMemo(() => {
    const search = query.trim().toLocaleLowerCase("pt-BR");
    return scopedConversations.filter(item => item.status === filter && (!search ||
      [item.contact_name, item.contact_phone || "", item.chat_jid].some(value => value.toLocaleLowerCase("pt-BR").includes(search))));
  }, [scopedConversations, filter, query]);

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

  const showRouting = async () => {
    if (!selected || !activeOrganizationId || !canManage || runningAction) return;
    setRunningAction("members");
    setError("");
    try {
      const response = await operateUnionWhatsAppInbox(activeOrganizationId, selected.id, "members");
      setMembers(response.members || []);
      setTargetUserId("");
      setRoutingOpen(true);
    } catch (reason) {
      setError(systemErrorMessage(reason, "Não foi possível carregar os atendentes."));
    } finally {
      setRunningAction(null);
    }
  };

  const transfer = async () => {
    if (!selected || !activeOrganizationId || !targetUserId || runningAction) return;
    setRunningAction("transfer");
    try {
      await operateUnionWhatsAppInbox(activeOrganizationId, selected.id, "transfer", {
        target_user_id: targetUserId,
      });
      setRoutingOpen(false);
      setSelectedId(null);
      await refresh(true);
    } catch (reason) {
      setError(systemErrorMessage(reason, "Não foi possível encaminhar o atendimento."));
    } finally {
      setRunningAction(null);
    }
  };

  const onChooseMedia = (file: File | null) => {
    if (!file) return;
    const type = file.type;
    const max = type.startsWith("image/") ? 1024 * 1024 :
      type.startsWith("audio/") ? 3 * 1024 * 1024 : 5 * 1024 * 1024;
    const allowed = type.startsWith("image/") ? ["image/jpeg","image/png"].includes(type)
      : type.startsWith("audio/") ? ["audio/ogg","audio/opus"].includes(type)
      : type.startsWith("video/") ? ["video/mp4","video/3gpp"].includes(type)
      : ["application/pdf","text/plain","application/zip","application/octet-stream"].includes(type);
    if (!allowed || file.size === 0 || file.size > max) {
      setError("Tipo de arquivo não aceito ou limite excedido. Imagens: 1 MB; áudio Opus/Ogg: 3 MB; vídeo MP4/documentos: 5 MB.");
      if (mediaInputRef.current) mediaInputRef.current.value = "";
      return;
    }
    if (mediaPreview) URL.revokeObjectURL(mediaPreview);
    setMediaPreview(type.startsWith("image/") ? URL.createObjectURL(file) : null);
    setAttachment(file);
    setError("");
    inputRef.current?.focus({ preventScroll:true });
  };

  const sendText = () => {
    if (!selected || !activeOrganizationId || !canReply || submitGateRef.current || (!draft.trim() && !attachment)) return;
    submitGateRef.current = true;
    queueMicrotask(() => { submitGateRef.current = false; });
    const text = draft.trim();
    const file = attachment;
    const preview = mediaPreview;
    const fileType = file ? file.type.startsWith("image/") ? "image" :
      file.type.startsWith("audio/") ? "audio" : file.type.startsWith("video/") ? "video" : "file" : null;
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
        let extra: {text:string;client_message_id:string;media_base64?:string;media_name?:string;media_mime?:string;media_type?:string} =
          { text, client_message_id: requestId };
        if (file && fileType) {
          const bytes = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result || "").split(",")[1] || "");
            reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
            reader.readAsDataURL(file);
          });
          extra = { ...extra, media_base64:bytes, media_name:file.name, media_mime:file.type, media_type:fileType };
        }
        await operateUnionWhatsAppInbox(organizationId, threadId, file ? "send_media" : "send_text", extra);
        if (organizationRef.current !== organizationId) return;
        await Promise.all([refreshMessages(threadId, true), refresh(true)]);
        setPending(current => current.filter(item => item.id !== requestId));
        if (preview) URL.revokeObjectURL(preview);
      } catch (reason) {
        if (organizationRef.current !== organizationId) return;
        const detail = systemErrorMessage(reason, "Não foi possível confirmar o envio.");
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
    <PageHeader title="Atendimento WhatsApp" subtitle="Caixa de entrada própria da Union, com o mesmo padrão visual do SAC Digital."
      actions={<div className="flex gap-2">
        <AdminButton variant="secondary" onClick={() => void refresh()}><RefreshCw size={16}/> Atualizar</AdminButton>
        <AdminButton variant="secondary" onClick={onBack}>Voltar</AdminButton>
      </div>} />
    {error && <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-600 dark:text-red-400">
      <CircleAlert size={17} className="mr-2 inline"/>{error}
    </div>}
    <div className="h-[min(76vh,850px)] min-h-[520px] overflow-hidden rounded-none border border-border bg-card shadow-sm">
      <div className="grid h-full min-h-0 grid-rows-[280px_minmax(0,1fr)] md:grid-cols-[340px_minmax(0,1fr)] md:grid-rows-1">
        <aside className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden border-b border-border bg-card md:border-b-0 md:border-r">
          <div className="border-b border-border bg-muted/35 p-3">
            <p className="text-base font-black text-foreground">Conversas</p>
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
            <div className="relative mt-3">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-blue-600"/>
              <input value={query} onChange={event => setQuery(event.target.value)} type="search" aria-label="Buscar conversa"
                placeholder="Nome, telefone ou contato"
                className="w-full rounded-lg border border-border bg-card py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/25"/>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain [scrollbar-gutter:stable]">
            {loading ? <div className="p-5"><LoadingState text="Carregando conversas..."/></div>
            : visible.length === 0 ? <div className="flex flex-col items-center gap-2 p-6 text-center text-xs text-muted-foreground">
              <MessageCircle size={26}/><p>Nenhuma conversa encontrada.</p>
              {scopedConversations.length === 0 && <p>Ative o recebimento do canal e envie uma mensagem de outro aparelho para testar.</p>}
            </div>
            : visible.map(item => {
              const selected = item.id === selectedId;
              const name = item.contact_name || item.contact_phone || "Contato";
              return <button key={item.id} type="button" onClick={() => setSelectedId(item.id)}
                className={`flex w-full items-start gap-3 border-b border-border px-3 py-3 text-left transition-colors last:border-b-0 ${selected ? "bg-primary-soft" : item.unread_count > 0 ? "border-l-2 border-l-primary bg-primary-soft/45 hover:bg-primary-soft/65" : "bg-card hover:bg-muted/55"}`}>
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xs font-black ${selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                  {initials(name)}
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
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-black">{initials(selected.contact_name)}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-black text-foreground">{selected.contact_name}</p>
                <p className="text-xs text-muted-foreground">{selected.contact_phone || "Contato WhatsApp"} · {filters.find(item => item.value === selected.status)?.label}</p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
                {selected.status === "waiting" && (canSend || canManage) &&
                  <AdminButton size="sm" disabled={Boolean(runningAction)} onClick={() => void operate("assume")}><UserCheck size={15}/> Assumir</AdminButton>}
                {selected.status === "in_att" && canOperateSelected && <>
                  {canManage && <AdminButton variant="secondary" size="sm" disabled={Boolean(runningAction)} onClick={() => void showRouting()}>
                    <ArrowRightLeft size={15}/> <span className="hidden sm:inline">Encaminhar</span>
                  </AdminButton>}
                  <AdminButton variant="secondary" size="sm" disabled={Boolean(runningAction)} onClick={() => void operate("return_queue")}><RotateCcw size={15}/> <span className="hidden sm:inline">Devolver</span></AdminButton>
                  <AdminButton size="sm" disabled={Boolean(runningAction)} onClick={() => void operate("finish")}><CheckCircle2 size={15}/> Finalizar</AdminButton>
                </>}
                {selected.status === "finished" && canManage &&
                  <AdminButton variant="secondary" size="sm" disabled={Boolean(runningAction)} onClick={() => void operate("reopen")}><RotateCcw size={15}/> Reabrir</AdminButton>}
                <AdminButton variant="secondary" size="sm" onClick={() => void refreshMessages(selected.id)}><RefreshCw size={15}/><span className="hidden sm:inline">Atualizar</span></AdminButton>
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
                      {item.status === "failed" && <button type="button" className="mt-1 text-[10px] font-semibold underline"
                        onClick={() => { setDraft(current => current || item.text); setPending(current => current.filter(x => x.id !== item.id)); inputRef.current?.focus(); }}>
                        Editar mensagem
                      </button>}
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
                    accept="image/jpeg,image/png,audio/ogg,audio/opus,video/mp4,video/3gpp,application/pdf,text/plain,application/zip,application/octet-stream"
                    aria-label="Selecionar anexo" onChange={event => onChooseMedia(event.target.files?.[0] || null)}/>
                  <button type="button" aria-label="Anexar imagem, áudio, vídeo ou arquivo"
                    title="Anexar (imagens 1 MB; áudio 3 MB; vídeo/documentos 5 MB)"
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
                  <button type="submit" disabled={!draft.trim() && !attachment} aria-label="Enviar mensagem" title="Enviar mensagem"
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
    </div>
    {routingOpen && selected && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-3" role="presentation"
      onClick={event => { if (event.target === event.currentTarget) setRoutingOpen(false); }}>
      <div role="dialog" aria-modal="true" aria-label="Encaminhar atendimento" className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl">
        <div className="flex items-center justify-between gap-3">
          <p className="font-black text-foreground">Encaminhar atendimento</p>
          <button type="button" onClick={() => setRoutingOpen(false)} aria-label="Fechar" className="rounded-md p-1 hover:bg-muted"><X size={18}/></button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">A conversa será atribuída a outro funcionário da mesma empresa.</p>
        <label htmlFor="union-whatsapp-routing" className="mt-4 block text-xs font-semibold">Atendente *</label>
        <select id="union-whatsapp-routing" value={targetUserId} onChange={event => setTargetUserId(event.target.value)}
          className="mt-2 w-full rounded-lg border border-border bg-background px-3 py-3 text-sm outline-none focus:border-primary">
          <option value="">Selecione um atendente</option>
          {members.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
        {members.length === 0 && <p className="mt-2 text-xs text-amber-700 dark:text-amber-300">Nenhum atendente autorizado foi encontrado.</p>}
        <div className="mt-5 flex justify-end gap-2">
          <AdminButton variant="secondary" onClick={() => setRoutingOpen(false)}>Cancelar</AdminButton>
          <AdminButton disabled={!targetUserId || Boolean(runningAction)} onClick={() => void transfer()}>Encaminhar</AdminButton>
        </div>
      </div>
    </div>}
  </div>;
}
