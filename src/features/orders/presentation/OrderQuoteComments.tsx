import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Heart, Image as ImageIcon, MessageCircle, Paperclip, Send, Smile, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { LoadingSpinner, notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import { Section } from "@/shared/ui/admin/AdminLayout";
import { SacEmojiPicker } from "@/features/sac-digital/presentation/SacEmojiPicker";
import {
  addOrderQuoteComment, getOrderQuoteCommentAttachmentUrl, listOrderQuoteComments,
  setOrderQuoteCommentLike, validateOrderQuoteCommentFiles,
  type OrderQuoteComment, type OrderQuoteCommentAttachment,
} from "../infrastructure/order-quote.repository";

function commentTime(date: string) {
  const timestamp = new Date(date).getTime();
  if (!Number.isFinite(timestamp)) return "";
  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  if (minutes < 1) return "agora";
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} h`;
  if (minutes < 10080) return `${Math.floor(minutes / 1440)} d`;
  return new Date(date).toLocaleDateString("pt-BR");
}

function CommentAvatar({ name, url, small = false }: { name: string; url: string | null; small?: boolean }) {
  const initial = Array.from(name.trim())[0]?.toLocaleUpperCase("pt-BR") || "U";
  return <div className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 font-black text-primary ${small ? "h-8 w-8 text-xs" : "h-10 w-10 text-sm"}`}>
    {url ? <img src={url} alt={name} loading="lazy" className="h-full w-full object-cover" /> : <span aria-hidden="true">{initial}</span>}
  </div>;
}

function CommentAttachments({ files }: { files: OrderQuoteCommentAttachment[] }) {
  const openFile = async (file: OrderQuoteCommentAttachment) => {
    // Assina novamente sob demanda caso a URL temporária tenha expirado.
    const popup = window.open("", "_blank");
    if (popup) popup.opener = null;
    try {
      const url = await getOrderQuoteCommentAttachmentUrl(file.storagePath);
      if (popup) popup.location.replace(url);
      else window.location.assign(url);
    } catch (error) {
      popup?.close();
      notifyAdmin(systemErrorMessage(error, "Não foi possível abrir o anexo."), "error");
    }
  };
  if (!files.length) return null;
  return <div className="mt-2 flex min-w-0 flex-wrap gap-2">
    {files.map(file => {
      const image = file.mimeType.startsWith("image/");
      return <button key={file.id} type="button" onClick={() => void openFile(file)}
        title={"Abrir " + file.fileName} aria-label={"Abrir anexo: " + file.fileName}
        className="flex max-w-full items-center gap-2 overflow-hidden rounded-xl border border-border bg-card text-left transition-colors hover:border-primary/35 hover:bg-primary/5">
        {image && file.url
          ? <img src={file.url} loading="lazy" alt={file.fileName} className="h-24 w-28 max-w-full object-cover" />
          : <span className="flex h-11 w-11 shrink-0 items-center justify-center text-primary">
              {image ? <ImageIcon size={20} /> : <FileText size={20} />}
            </span>}
        <span className="max-w-44 truncate pr-2 text-xs font-semibold text-foreground">{file.fileName}</span>
      </button>;
    })}
  </div>;
}

function CommentEntry({
  comment, isReply, canComment, likeBusy, onLike, onReply,
}: {
  comment: OrderQuoteComment;
  isReply?: boolean;
  canComment: boolean;
  likeBusy: boolean;
  onLike: (comment: OrderQuoteComment) => void;
  onReply: (comment: OrderQuoteComment) => void;
}) {
  return <div className="flex min-w-0 items-start gap-2.5 sm:gap-3">
    <CommentAvatar name={comment.authorName} url={comment.avatarUrl} small={isReply} />
    <div className="min-w-0 flex-1">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <strong className="min-w-0 break-words text-sm font-bold text-foreground">{comment.authorName}</strong>
        <time title={new Date(comment.created_at).toLocaleString("pt-BR")}
          dateTime={comment.created_at} className="text-[11px] text-muted-foreground">
          {commentTime(comment.created_at)}
        </time>
      </div>
      <p className="mt-1 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-foreground">{comment.body}</p>
      <CommentAttachments files={comment.attachments} />
      <div className="mt-2 flex flex-wrap items-center gap-4">
        <button type="button" disabled={!canComment || likeBusy} onClick={() => onLike(comment)}
          aria-label={(comment.likedByMe ? "Descurtir" : "Curtir") + " comentário de " + comment.authorName}
          aria-pressed={comment.likedByMe}
          className={`inline-flex items-center gap-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${comment.likedByMe ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground hover:text-rose-600"}`}>
          <Heart size={15} fill={comment.likedByMe ? "currentColor" : "none"} aria-hidden="true" />
          {comment.likedByMe ? "Curtido" : "Curtir"}
          {comment.likesCount > 0 && <span className="tabular-nums">{comment.likesCount}</span>}
        </button>
        {canComment && <button type="button" onClick={() => onReply(comment)}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:text-primary">
          <MessageCircle size={15} aria-hidden="true" /> Responder
        </button>}
      </div>
    </div>
  </div>;
}

export function OrderQuoteComments({
  organizationId, orderId, canComment,
}: {
  organizationId: string;
  orderId: string;
  canComment: boolean;
}) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = ["orders", "quote-comments", organizationId, orderId, user?.id || "none"] as const;
  const commentsQuery = useQuery({
    queryKey,
    enabled: Boolean(organizationId && orderId),
    queryFn: () => listOrderQuoteComments(organizationId, orderId, user?.id),
    staleTime: 30_000,
  });
  const notes = commentsQuery.data || [];
  const fileRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const [draft, setDraft] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [replyTo, setReplyTo] = useState<{ id: string; author: string } | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [recentEmojis, setRecentEmojis] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [pendingLikes, setPendingLikes] = useState<string[]>([]);
  const [expandedReplies, setExpandedReplies] = useState<string[]>([]);

  const byParent = useMemo(() => {
    const map = new Map<string, OrderQuoteComment[]>();
    notes.forEach(note => {
      if (!note.parent_id) return;
      map.set(note.parent_id, [...(map.get(note.parent_id) || []), note]);
    });
    map.forEach(children => children.sort((a, b) => a.created_at.localeCompare(b.created_at)));
    return map;
  }, [notes]);
  const allIds = useMemo(() => new Set(notes.map(note => note.id)), [notes]);
  const roots = useMemo(() => notes.filter(note => !note.parent_id || !allIds.has(note.parent_id)), [notes, allIds]);

  const selectFiles = (selected: File[]) => {
    try {
      const merged = [...files, ...selected];
      validateOrderQuoteCommentFiles(merged);
      setFiles(merged);
    } catch (error) {
      notifyAdmin(systemErrorMessage(error), "error");
    }
  };
  const send = async () => {
    if (submitting || !canComment || !user?.id || (!draft.trim() && !files.length)) return;
    setSubmitting(true);
    setEmojiOpen(false);
    try {
      await addOrderQuoteComment(organizationId, orderId, draft, files, replyTo?.id || null);
      setDraft("");
      setFiles([]);
      setReplyTo(null);
      if (textRef.current) textRef.current.style.height = "";
      await queryClient.invalidateQueries({ queryKey: ["orders", "quote-comments", organizationId, orderId] });
    } catch (error) {
      notifyAdmin(systemErrorMessage(error, "Não foi possível enviar o comentário."), "error");
    } finally {
      setSubmitting(false);
    }
  };
  const toggleLike = async (comment: OrderQuoteComment) => {
    if (!canComment || !user?.id || pendingLikes.includes(comment.id)) return;
    const nextLiked = !comment.likedByMe;
    const before = queryClient.getQueryData<OrderQuoteComment[]>(queryKey);
    setPendingLikes(previous => [...previous, comment.id]);
    queryClient.setQueryData<OrderQuoteComment[]>(queryKey, previous =>
      previous?.map(item => item.id === comment.id ? {
        ...item, likedByMe: nextLiked,
        likesCount: Math.max(0, item.likesCount + (nextLiked ? 1 : -1)),
      } : item));
    try {
      await setOrderQuoteCommentLike(organizationId, orderId, comment.id, user.id, nextLiked);
    } catch (error) {
      if (before) queryClient.setQueryData(queryKey, before);
      notifyAdmin(systemErrorMessage(error, "Não foi possível atualizar a curtida."), "error");
    } finally {
      setPendingLikes(previous => previous.filter(id => id !== comment.id));
    }
  };
  const beginReply = (comment: OrderQuoteComment) => {
    setReplyTo({ id: comment.parent_id || comment.id, author: comment.authorName });
    setEmojiOpen(false);
    textRef.current?.focus();
  };

  return <Section title={<span className="inline-flex items-center gap-2">Comentários do orçamento
    <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">{notes.length}</span>
  </span>}>
    <div className="space-y-5">
      {canComment && <div className="space-y-2">
        {replyTo && <div className="flex items-center justify-between gap-2 rounded-lg bg-primary/5 px-3 py-2 text-xs text-foreground">
          <span className="min-w-0 truncate">Respondendo a <strong>{replyTo.author}</strong></span>
          <button type="button" onClick={() => setReplyTo(null)} aria-label="Cancelar resposta"
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X size={14}/></button>
        </div>}
        {files.length > 0 && <div className="flex flex-wrap gap-2" aria-label="Arquivos selecionados">
          {files.map((file, index) => <div key={index} className="inline-flex max-w-full items-center gap-2 rounded-lg border border-border bg-muted/30 px-2.5 py-1.5">
            <Paperclip size={13} className="shrink-0 text-muted-foreground"/>
            <span className="max-w-40 truncate text-xs text-foreground" title={file.name}>{file.name}</span>
            <button type="button" onClick={() => setFiles(previous => previous.filter((_, i) => i !== index))}
              aria-label={"Remover " + file.name} className="text-muted-foreground hover:text-red-600"><X size={14}/></button>
          </div>)}
        </div>}
        <div className="flex min-w-0 items-end gap-1 rounded-2xl border border-border bg-card px-2 py-1.5 shadow-sm transition-colors focus-within:border-primary/60 focus-within:ring-2 focus-within:ring-primary/10">
          <div className="relative shrink-0">
            <button type="button" aria-label="Inserir emoji" title="Emojis"
              disabled={submitting} aria-expanded={emojiOpen}
              onClick={() => setEmojiOpen(value => !value)}
              className="flex h-10 w-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-primary">
              <Smile size={20} />
            </button>
            {emojiOpen && <SacEmojiPicker recentEmojis={recentEmojis} onSelect={emoji => {
              setDraft(value => value + emoji);
              setRecentEmojis(previous => [emoji, ...previous.filter(item => item !== emoji)].slice(0, 20));
              setEmojiOpen(false);
              textRef.current?.focus();
            }} />}
          </div>
          <textarea ref={textRef} rows={1} value={draft} maxLength={4000}
            disabled={submitting} aria-label={replyTo ? "Escrever resposta" : "Escrever comentário"}
            placeholder={replyTo ? "Escreva uma resposta..." : "Escreva um comentário..."}
            onChange={event => {
              setDraft(event.target.value);
              event.currentTarget.style.height = "auto";
              event.currentTarget.style.height = Math.min(event.currentTarget.scrollHeight, 120) + "px";
            }}
            onKeyDown={event => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                void send();
              }
            }}
            className="min-h-10 min-w-0 flex-1 resize-none overflow-y-auto bg-transparent px-1.5 py-2.5 text-sm leading-5 text-foreground outline-none placeholder:text-muted-foreground" />
          <input ref={fileRef} type="file" className="sr-only" multiple
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf,text/plain,.doc,.docx"
            onChange={event => {
              selectFiles(Array.from(event.currentTarget.files || []));
              event.currentTarget.value = "";
            }} />
          <button type="button" title="Anexar arquivo" aria-label="Anexar arquivo"
            disabled={submitting || files.length >= 3} onClick={() => fileRef.current?.click()}
            className="flex h-10 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-primary disabled:opacity-40">
            <Paperclip size={19} />
          </button>
          <button type="button" title="Enviar comentário" aria-label="Enviar comentário"
            disabled={submitting || (!draft.trim() && !files.length)}
            onClick={() => void send()}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40">
            {submitting ? <LoadingSpinner size="sm" /> : <Send size={18} />}
          </button>
        </div>
        <p className="text-right text-[11px] text-muted-foreground">Até 3 anexos de 20 MB · Enter envia, Shift+Enter quebra linha</p>
      </div>}
      {commentsQuery.isLoading && <div className="flex justify-center py-6"><LoadingSpinner size="md" /></div>}
      {commentsQuery.error && <div role="alert" className="space-y-2 text-sm text-destructive">
        Não foi possível carregar os comentários: {systemErrorMessage(commentsQuery.error)}
        <button type="button" onClick={() => void commentsQuery.refetch()} className="ml-2 font-semibold underline">Tentar novamente</button>
      </div>}
      {!commentsQuery.isLoading && !commentsQuery.error && !notes.length &&
        <p className="py-6 text-center text-xs text-muted-foreground">Ainda não há comentários. Seja o primeiro a comentar.</p>}
      {roots.length > 0 && <div className="divide-y divide-border/70">
        {roots.map(note => {
          const replies = byParent.get(note.id) || [];
          const showReplies = expandedReplies.includes(note.id);
          return <article key={note.id} className="min-w-0 space-y-3 py-4 first:pt-0 last:pb-0">
            <CommentEntry comment={note} canComment={canComment} likeBusy={pendingLikes.includes(note.id)}
              onLike={comment => void toggleLike(comment)} onReply={beginReply} />
            {replies.length > 0 && <div className="ml-9 border-l-2 border-border/70 pl-4 sm:ml-12">
              <button type="button" onClick={() => setExpandedReplies(previous =>
                showReplies ? previous.filter(id => id !== note.id) : [...previous, note.id])}
                className="mb-3 text-xs font-semibold text-muted-foreground hover:text-primary">
                {showReplies ? "Ocultar respostas" : `Ver ${replies.length} ${replies.length === 1 ? "resposta" : "respostas"}`}
              </button>
              {showReplies && <div className="space-y-4">
                {replies.map(reply => <CommentEntry key={reply.id} comment={reply} isReply
                  canComment={canComment} likeBusy={pendingLikes.includes(reply.id)}
                  onLike={comment => void toggleLike(comment)} onReply={beginReply} />)}
              </div>}
            </div>}
          </article>;
        })}
      </div>}
    </div>
  </Section>;
}
