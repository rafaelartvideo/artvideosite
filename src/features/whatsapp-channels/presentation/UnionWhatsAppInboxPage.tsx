import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CircleAlert, FileText, Image as ImageIcon, MessageCircle, RefreshCw, Search, Send, ShieldCheck, RotateCcw, CheckCircle2, UserCheck, Volume2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
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

function MessageBody({ message }: { message: UnionWhatsAppMessage }) {
  if (message.body_text) return <p className="whitespace-pre-wrap break-words text-[13px] leading-5">{message.body_text}</p>;
  const fallback = {
    image: { Icon: ImageIcon, text: "Imagem recebida — visualização de mídia em preparação" },
    audio: { Icon: Volume2, text: "Áudio recebido — reprodução em preparação" },
    video: { Icon: FileText, text: "Vídeo recebido — visualização em preparação" },
    file: { Icon: FileText, text: "Documento recebido — download em preparação" },
    location: { Icon: FileText, text: "Localização recebida" },
    contact: { Icon: FileText, text: "Contato compartilhado" },
    unknown: { Icon: MessageCircle, text: "Mensagem recebida" },
    text: { Icon: MessageCircle, text: "Mensagem sem texto" },
  }[message.message_type];
  return <p className="flex items-center gap-2 text-xs"><fallback.Icon size={15} />{fallback.text}</p>;
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
  const [notice, setNotice] = useState("");
  const [draft, setDraft] = useState("");
  const [runningAction, setRunningAction] = useState<UnionWhatsAppInboxAction | null>(null);
  // Preserve the same request ID if a network timeout leaves delivery uncertain.
  // Regenerating it automatically would risk sending the same message twice.
  const sendRequestIdRef = useRef<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const messageIdentity = useRef(0);
  const messagesBottom = useRef<HTMLDivElement | null>(null);
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
    setNotice("");
    sendRequestIdRef.current = null;
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
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") schedule();
    }, 30000);
    return () => {
      if (debounce !== null) window.clearTimeout(debounce);
      window.clearInterval(timer);
      void supabase.removeChannel(realtime);
    };
  }, [activeOrganizationId, canView, selectedId, refresh, refreshMessages]);

  useEffect(() => {
    if (!selectedId) { setMessages([]); return; }
    setMessages([]);
    void refreshMessages(selectedId);
  }, [selectedId, refreshMessages]);

  useEffect(() => {
    messagesBottom.current?.scrollIntoView({ block: "end" });
  }, [selectedId, messages.length]);

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
    setNotice("");
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
        setNotice("Atendimento assumido. Agora você pode responder.");
        window.setTimeout(() => inputRef.current?.focus(), 100);
      } else if (action === "reopen") {
        setFilter("waiting");
        setSelectedId(null);
        setNotice("Conversa devolvida à fila Aguardando.");
      } else {
        setSelectedId(null);
        setFilter("waiting");
        setNotice(action === "finish" ? "Atendimento finalizado." : "Atendimento devolvido à fila.");
      }
    } catch (reason) {
      setError(systemErrorMessage(reason, "Não foi possível atualizar o atendimento."));
    } finally {
      setRunningAction(null);
    }
  };

  const sendText = async () => {
    if (!selected || !activeOrganizationId || !canReply || runningAction || !draft.trim()) return;
    const requestId = sendRequestIdRef.current || crypto.randomUUID();
    sendRequestIdRef.current = requestId;
    setRunningAction("send_text");
    setError("");
    setNotice("");
    try {
      await operateUnionWhatsAppInbox(activeOrganizationId, selected.id, "send_text", {
        text: draft.trim(), client_message_id: requestId,
      });
      setDraft("");
      sendRequestIdRef.current = null;
      setNotice("Mensagem aceita pelo WhatsApp.");
      await Promise.all([refreshMessages(selected.id, true), refresh(true)]);
      inputRef.current?.focus();
    } catch (reason) {
      setError(systemErrorMessage(reason, "Não foi possível confirmar o envio. Verifique o WhatsApp antes de tentar novamente."));
    } finally {
      setRunningAction(null);
    }
  };

  if (!canView) return <div className="p-5 text-sm text-muted-foreground">Você não possui permissão para visualizar atendimentos WhatsApp nesta empresa.</div>;

  return <div className="space-y-5">
    <PageHeader title="Atendimento WhatsApp" subtitle="Caixa de entrada própria da Union, com o mesmo padrão visual do SAC Digital."
      actions={<div className="flex gap-2">
        <AdminButton variant="secondary" onClick={() => void refresh()}><RefreshCw size={16}/> Atualizar</AdminButton>
        <AdminButton variant="secondary" onClick={onBack}>Voltar</AdminButton>
      </div>} />
    {notice && <div role="status" className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-2 text-xs text-emerald-700 dark:text-emerald-300">{notice}</div>}
    {error && <div role="alert" className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-600 dark:text-red-400">
      <CircleAlert size={17} className="mr-2 inline"/>{error}
    </div>}
    <div className="flex items-start gap-3 rounded-lg border border-blue-500/20 bg-blue-500/5 px-4 py-3 text-xs text-muted-foreground">
      <ShieldCheck size={18} className="shrink-0 text-blue-600"/>
      <div>Atendimento independente do SAC Digital. As mensagens são restritas à empresa ativa.
        O recebimento precisa ser ativado em <button type="button" onClick={onConfigure} className="font-bold text-blue-600 underline underline-offset-2">Canais de Atendimento</button>.
        {lastUpdated && <span className="block pt-1">Atualizado em {compactDate(lastUpdated)}.</span>}
      </div>
    </div>
    <div className="h-[680px] overflow-hidden rounded-none border border-border bg-card shadow-sm">
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
                  <AdminButton variant="secondary" size="sm" disabled={Boolean(runningAction)} onClick={() => void operate("return_queue")}><RotateCcw size={15}/> <span className="hidden sm:inline">Devolver</span></AdminButton>
                  <AdminButton size="sm" disabled={Boolean(runningAction)} onClick={() => void operate("finish")}><CheckCircle2 size={15}/> Finalizar</AdminButton>
                </>}
                {selected.status === "finished" && canManage &&
                  <AdminButton variant="secondary" size="sm" disabled={Boolean(runningAction)} onClick={() => void operate("reopen")}><RotateCcw size={15}/> Reabrir</AdminButton>}
                <AdminButton variant="secondary" size="sm" onClick={() => void refreshMessages(selected.id)}><RefreshCw size={15}/><span className="hidden sm:inline">Atualizar</span></AdminButton>
              </div>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto bg-muted/15 px-4 py-5">
              {messagesLoading ? <LoadingState text="Carregando mensagens..."/>
              : messages.length === 0 ? <p className="p-5 text-center text-xs text-muted-foreground">Nenhuma mensagem armazenada nesta conversa.</p>
              : <div className="flex flex-col gap-3">
                {messages.map(message => <div key={message.id} className={`flex ${message.direction === "outgoing" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] rounded-xl px-3.5 py-2.5 shadow-sm sm:max-w-[72%] ${message.direction === "outgoing" ? "rounded-br-sm border border-emerald-500/15 bg-emerald-500/10 text-foreground" : "rounded-bl-sm border border-border bg-card text-foreground"}`}>
                    {message.direction === "outgoing" && message.sender_name &&
                      <p className="mb-1 text-[11px] font-black">{message.sender_name}</p>}
                    <MessageBody message={message}/>
                    <span className="mt-1 block text-right text-[10px] text-muted-foreground">{clock(message.sent_at)}</span>
                  </div>
                </div>)}
                <div ref={messagesBottom}/>
              </div>}
            </div>
            <footer className="border-t border-border bg-card px-3 py-3 sm:px-4">
              {canReply ? <div className="flex items-end gap-2">
                <textarea
                  ref={inputRef}
                  rows={2}
                  value={draft}
                  onChange={event => { setDraft(event.target.value); sendRequestIdRef.current = null; }}
                  onKeyDown={event => {
                    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                      event.preventDefault();
                      void sendText();
                    }
                  }}
                  placeholder="Digite sua mensagem..."
                  aria-label="Digite sua mensagem"
                  maxLength={4000}
                  disabled={Boolean(runningAction)}
                  className="min-h-[46px] max-h-28 flex-1 resize-y rounded-lg border border-border bg-muted/25 px-3 py-2.5 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 disabled:opacity-60"
                />
                <AdminButton disabled={!draft.trim() || Boolean(runningAction)} onClick={() => void sendText()}>
                  <Send size={16}/>{runningAction === "send_text" ? "Enviando..." : "Enviar"}
                </AdminButton>
              </div> : <p className="py-2 text-center text-xs text-muted-foreground">
                {selected.status === "waiting" ? "Assuma o atendimento para responder." :
                  selected.status === "finished" ? "Atendimento finalizado. Reabra para responder." :
                  "Esta conversa está atribuída a outro atendente."}
              </p>}
              <p className="mt-2 text-center text-[10px] text-muted-foreground">
                Envio pelo WuzAPI · Enter para enviar · Shift+Enter para nova linha
              </p>
            </footer>
          </>}
        </section>
      </div>
    </div>
  </div>;
}
