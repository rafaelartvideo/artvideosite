import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronUp, LoaderCircle, MessageCircle, Mic, Paperclip, Send, Smile, Sticker } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { EmojiPicker } from "@/shared/ui/whatsapp/EmojiPicker";
import { listWhatsAppQuickReplies, type WhatsAppQuickReply } from "../infrastructure/whatsapp-quick-replies.repository";
import { renderWhatsAppQuickReply } from "../domain/quick-reply-variables.mjs";
import { formatWhatsAppPhone, WhatsAppContactAvatar } from "./WhatsAppInboxVisuals";

/**
 * Render a complete conversation surface without creating a conversation or
 * protocol. The first explicit text send is handled by the same authenticated
 * start + provider-confirmation flow as the normal WhatsApp inbox.
 */
export function WhatsAppDraftConversation({
  organizationId, name, phone, starting, error, onSend, onChangeRecipient, onEditMessage, initialMessage="",
}: {
  organizationId: string;
  name: string;
  phone: string;
  starting: boolean;
  error: string;
  onSend: (message: string) => Promise<void>;
  onChangeRecipient?: () => void;
  onEditMessage: () => void;
  initialMessage?:string;
}) {
  const { profile } = useAuth();
  const [message, setMessage] = useState(initialMessage);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickLoading, setQuickLoading] = useState(false);
  const [quickError, setQuickError] = useState("");
  const [quickReplies, setQuickReplies] = useState<WhatsAppQuickReply[]>([]);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    input.style.height = "48px";
    input.style.height = Math.min(Math.max(input.scrollHeight, 48), 132) + "px";
  }, [message]);

  useEffect(() => {
    if (!emojiOpen && !quickOpen) return;
    const onPointer = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setEmojiOpen(false);
        setQuickOpen(false);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setEmojiOpen(false);
        setQuickOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [emojiOpen, quickOpen]);

  const openQuickReplies = async () => {
    if (quickOpen) { setQuickOpen(false); return; }
    setEmojiOpen(false);
    setQuickOpen(true);
    if (quickReplies.length) return;
    setQuickLoading(true);
    setQuickError("");
    try {
      const replies = await listWhatsAppQuickReplies(organizationId, true);
      setQuickReplies(replies);
    } catch {
      setQuickError("Não foi possível carregar as mensagens rápidas.");
    } finally {
      setQuickLoading(false);
    }
  };

  const submit = () => {
    if (starting || !message.trim()) return;
    void onSend(message.trim());
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-card">
      <div className="flex shrink-0 items-center gap-3 border-b border-border bg-muted/25 px-3 py-3 sm:px-4">
        <WhatsAppContactAvatar name={name || formatWhatsAppPhone(phone)} size="header" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold text-foreground">{name || "Contato WhatsApp"}</span>
          <span className="block truncate text-xs text-muted-foreground">{formatWhatsAppPhone(phone)}</span>
        </span>
        <span className="hidden shrink-0 rounded-md border border-border bg-card px-2 py-1 text-[11px] font-medium text-muted-foreground sm:inline-flex">
          Nova conversa
        </span>
        {onChangeRecipient && (
          <button type="button" disabled={starting} onClick={onChangeRecipient}
            className="shrink-0 rounded-lg border border-border px-3 py-2 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50">
            Trocar número
          </button>
        )}
      </div>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 overflow-y-auto bg-muted/15 px-4 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <MessageCircle size={27} />
        </span>
        <p className="text-sm font-semibold text-foreground">Nenhuma mensagem nesta conversa</p>
        <p className="max-w-sm text-xs leading-5 text-muted-foreground">
          Escreva a primeira mensagem abaixo. O atendimento e seu protocolo só serão iniciados após a confirmação do envio.
        </p>
      </div>
      <div className="shrink-0 border-t border-border bg-card px-3 py-2 sm:px-4 sm:py-3">
        {error && (
          <div role="alert" className="mb-2 rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {error}
          </div>
        )}
        <form ref={menuRef} className="relative flex min-w-0 flex-wrap items-stretch rounded-xl border border-border bg-muted/55 transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 xl:flex-nowrap"
          onSubmit={event => { event.preventDefault(); submit(); }}>
          <button type="button" disabled aria-label="Anexar arquivo após iniciar atendimento"
            title="Anexos disponíveis após enviar a primeira mensagem"
            className="order-1 flex h-10 w-11 shrink-0 items-center justify-center border-r border-border text-muted-foreground/50 xl:order-none xl:h-12 xl:w-12">
            <Paperclip size={22} />
          </button>
          <button type="button" disabled aria-label="Selecionar figurinha após iniciar atendimento"
            title="Figurinhas disponíveis após enviar a primeira mensagem"
            className="order-1 flex h-10 w-11 shrink-0 items-center justify-center border-r border-border text-muted-foreground/50 xl:order-none xl:h-12">
            <Sticker size={21} />
          </button>
          <div className="relative order-1">
            <button type="button" aria-label="Selecionar emoji" disabled={starting}
              onClick={() => {setQuickOpen(false);setEmojiOpen(open => !open);}}
              className="flex h-10 w-11 items-center justify-center border-r border-border text-foreground hover:bg-muted xl:h-12">
              <Smile size={22} />
            </button>
            {emojiOpen && <EmojiPicker recentEmojis={[]} onSelect={emoji => {
              setMessage(current => (current + emoji).slice(0, 3900));
              onEditMessage();
              setEmojiOpen(false);
              inputRef.current?.focus();
            }} />}
          </div>
          <div className="relative order-1">
            <button type="button" aria-label="Mais opções da conversa" title="Mensagens rápidas"
              aria-expanded={quickOpen} disabled={starting}
              onClick={() => void openQuickReplies()}
              className="flex h-10 w-11 items-center justify-center border-r border-border text-foreground hover:bg-muted xl:h-12">
              <ChevronUp size={20} />
            </button>
            {quickOpen && (
              <div role="menu" aria-label="Mensagens rápidas"
                className="absolute bottom-[calc(100%+8px)] left-0 z-[60] w-[min(84vw,540px)] max-h-[min(44dvh,320px)] overflow-y-auto rounded-xl border border-border bg-card p-3 text-foreground shadow-xl">
                <div className="mb-2 flex items-center gap-2">
                  <ChevronLeft size={16} className="text-muted-foreground"/>
                  <span className="text-xs font-bold">Mensagens rápidas</span>
                </div>
                {quickLoading ? <div className="flex items-center gap-2 py-4 text-xs text-muted-foreground">
                  <LoaderCircle className="animate-spin" size={15}/> Carregando...
                </div> : quickError ? <p role="alert" className="text-xs text-destructive">{quickError}</p> :
                quickReplies.length === 0 ? <p className="py-4 text-xs text-muted-foreground">Nenhuma mensagem rápida cadastrada.</p> :
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                  {quickReplies.map(item => (
                    <button type="button" role="menuitem" key={item.id} title={item.message}
                      className="min-h-16 rounded-lg border border-border px-2 py-2 text-center text-xs font-semibold hover:border-primary hover:bg-primary/5"
                      onClick={() => {
                        setMessage(renderWhatsAppQuickReply(item.message, {
                          operatorName: profile?.full_name || "",
                          customerName: name,
                          protocol: "",
                        }).slice(0, 3900));
                        onEditMessage();
                        setQuickOpen(false);
                        inputRef.current?.focus();
                      }}>
                      <span className="line-clamp-2 break-words">{item.title}</span>
                    </button>
                  ))}
                </div>}
              </div>
            )}
          </div>
          <span aria-hidden="true" className="order-1 block h-0 basis-full xl:hidden" />
          <textarea ref={inputRef} aria-label="Mensagem" value={message}
            rows={1} maxLength={3900} autoFocus lang="pt-BR" spellCheck autoCapitalize="sentences"
            placeholder="Digite uma mensagem" disabled={starting}
            onChange={event => {setMessage(event.target.value);onEditMessage();}}
            onKeyDown={event => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                submit();
              }
            }}
            className="order-2 min-h-12 min-w-0 flex-1 resize-none overflow-y-auto bg-transparent px-3 py-3 text-base leading-6 text-foreground outline-none placeholder:text-muted-foreground/65 disabled:opacity-65 xl:order-none xl:text-sm"
          />
          {!message.trim() && (
            <button type="button" disabled aria-label="Gravar áudio após iniciar atendimento"
              title="Áudio disponível após enviar a primeira mensagem"
              className="order-2 flex h-12 w-11 shrink-0 self-end items-center justify-center border-l border-border text-muted-foreground/50 xl:order-none">
              <Mic size={21} />
            </button>
          )}
          <button type="submit" disabled={starting || !message.trim()}
            aria-label="Enviar mensagem" title="Enviar mensagem"
            className="order-2 flex h-12 w-12 shrink-0 self-end items-center justify-center rounded-r-[11px] border-l border-primary/20 bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-45 xl:order-none">
            {starting ? <LoaderCircle size={20} className="animate-spin" /> : <Send size={22}/>}
          </button>
        </form>
      </div>
    </div>
  );
}
