import { resultItems, usableChannels, cloudChannel, approvedTemplates } from '../domain/resource-ui.mjs';
import { FInput, FSelect, FTextarea } from '@/shared/ui/admin/AdminFormControls';
import { StructuredEditor } from './SacDigitalResources';
import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, MessageCircle, XCircle } from "lucide-react";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import { AdminButton, AdminDialog, BtnSecondary } from "@/shared/ui/admin/AdminLayout";
import {
  operateSacDigitalResource,
  prepareSacDigitalNewConversationContact,
  searchSacDigitalNewConversation,
  startSacDigitalNewConversation,
  type SacDigitalNewConversationCandidate,
  type SacDigitalPreparedContact,
} from "../infrastructure/sac-digital.repository";

function normalizePhone(value: string) {
  let digits = String(value || "").replace(/\D/g, "");
  if ((digits.length === 10 || digits.length === 11) && !digits.startsWith("55")) {
    digits = `55${digits}`;
  }
  return digits;
}

function phoneKey(value: string) {
  const digits = normalizePhone(value);
  return digits.startsWith("55") && (digits.length === 12 || digits.length === 13)
    ? digits.slice(2)
    : digits;
}

function formatPhone(value: string) {
  const digits = normalizePhone(value);
  const local = digits.startsWith("55") && (digits.length === 12 || digits.length === 13)
    ? digits.slice(2)
    : digits;
  if (local.length === 11) return `(${local.slice(0, 2)}) ${local.slice(2, 7)}-${local.slice(7)}`;
  if (local.length === 10) return `(${local.slice(0, 2)}) ${local.slice(2, 6)}-${local.slice(6)}`;
  return value;
}

function candidateKey(candidate: SacDigitalNewConversationCandidate) {
  return candidate.external_contact_id || `${candidate.source}:${candidate.customer_id || phoneKey(candidate.phone)}`;
}

export function SacDigitalNewConversationDialog({
  open,
  organizationId,
  initialContact,
  onClose,
  onStarted,
  onOpenExisting,
}: {
  open: boolean;
  organizationId: string;
  initialContact?: { phone: string; name: string } | null;
  onClose: () => void;
  onStarted: (result: Awaited<ReturnType<typeof startSacDigitalNewConversation>>) => Promise<void> | void;
  onOpenExisting: (protocol: string) => Promise<boolean>;
}) {
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [preparingKey, setPreparingKey] = useState<string | null>(null);
  const [contacts, setContacts] = useState<SacDigitalNewConversationCandidate[]>([]);
  const [customers, setCustomers] = useState<SacDigitalNewConversationCandidate[]>([]);
  const [prepared, setPrepared] = useState<SacDigitalPreparedContact | null>(null);
  const [draft, setDraft] = useState("");
  const [channel, setChannel] = useState("");
  const [channels,setChannels] = useState<any[]>([]);
  const [templates,setTemplates] = useState<any[]>([]);
  const [channelLoading,setChannelLoading] = useState(false);
  const [templateLoading,setTemplateLoading] = useState(false);
  const currentChannel = channels.find(item => String(item.id)===channel);
  const cloud = cloudChannel(currentChannel);
  const currentTemplate = templates.find(item => String(item.id??item.name)===template);
  useEffect(()=>{if(!open)return;let cancelled=false;setChannelLoading(true);operateSacDigitalResource(organizationId,14,{}).then(response=>{if(cancelled)return;const usable=usableChannels(resultItems(response.data));setChannels(usable);if(!usable.length)notifyAdmin('Nenhum canal ativo disponível para iniciar uma conversa. Confira a conexão e as permissões na SAC.','error');}).catch(caught=>{if(!cancelled)notifyAdmin(systemErrorMessage(caught,'Não foi possível carregar os canais.'),'error');}).finally(()=>{if(!cancelled)setChannelLoading(false);});return()=>{cancelled=true;};},[open,organizationId]);
  useEffect(()=>{setTemplate('');setTemplates([]);setVariables({});if(!open||!channel)return;let cancelled=false;setTemplateLoading(true);if(cloud)setMessageType('template');else setMessageType('text');operateSacDigitalResource(organizationId,15,{id:channel}).then(response=>{if(cancelled)return;const approved=approvedTemplates(resultItems(response.data));setTemplates(approved);if(!approved.length&&cloud)notifyAdmin('Nenhum template aprovado disponível neste canal.','warning');}).catch(caught=>{if(!cancelled&&cloud)notifyAdmin(systemErrorMessage(caught,'Não foi possível carregar templates aprovados.'),'error');}).finally(()=>{if(!cancelled)setTemplateLoading(false);});return()=>{cancelled=true;};},[open,channel,organizationId,cloud]);
  const [messageType, setMessageType] = useState("text");
  const [template, setTemplate] = useState("");
  const [variables, setVariables] = useState<Record<string, string[]>>({});
  const [sending, setSending] = useState(false);
  const [confirmationPending, setConfirmationPending] = useState(false);
  const reportError = (message: string) => {
    setConfirmationPending(message.includes("Confirmação pendente"));
    notifyAdmin(message, "error");
  };
  const searchRequestRef = useRef(0);
  const prepareRequestRef = useRef(0);
  const sendInFlightRef = useRef(false);

  // Pré-preencher somente: criar/importar o contato continua exigindo ação
  // explícita de quem iniciou a conversa, sem envio automático.
  useEffect(() => {
    if (!open || !initialContact?.phone) return;
    searchRequestRef.current += 1;
    prepareRequestRef.current += 1;
    setQuery(initialContact.phone);
    setContacts([]);
    setCustomers([]);
    setPrepared(null);
    setSearching(false);
    setPreparingKey(null);
    setConfirmationPending(false);
  }, [open, initialContact?.phone, initialContact?.name]);

  const results = useMemo(() => {
    const combined = [...contacts, ...customers];
    const seen = new Set<string>();
    return combined.filter(candidate => {
      const key = candidate.external_contact_id
        ? `contact:${candidate.external_contact_id}`
        : `phone:${phoneKey(candidate.phone)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [contacts, customers]);

  const reset = () => {
    searchRequestRef.current += 1;
    prepareRequestRef.current += 1;
    setChannel("");
    setTemplate("");
    setVariables({});
    setQuery("");
    setContacts([]);
    setCustomers([]);
    setPrepared(null);
    setDraft("");
    setConfirmationPending(false);
    setSearching(false);
    setPreparingKey(null);
    setSending(false);
  };

  const close = () => {
    if (sending || preparingKey) return;
    reset();
    onClose();
  };

  const search = async () => {
    const value = query.trim();
    if (value.length < 2 || searching) return;

    const requestId = ++searchRequestRef.current;
    setSearching(true);
    setPrepared(null);
    setConfirmationPending(false);
    try {
      const data = await searchSacDigitalNewConversation(organizationId, value);
      if (requestId !== searchRequestRef.current) return;
      setContacts(data.contacts);
      setCustomers(data.customers);
      if (data.contacts.length === 0 && data.customers.length === 0) {
        notifyAdmin("Nenhum contato encontrado. Por enquanto, selecione apenas contatos já cadastrados.", "warning");
      }
    } catch (caught) {
      if (requestId === searchRequestRef.current) {
        reportError(systemErrorMessage(caught, "Não foi possível pesquisar os contatos."));
      }
    } finally {
      if (requestId === searchRequestRef.current) setSearching(false);
    }
  };

  const prepare = async (candidate?: SacDigitalNewConversationCandidate) => {
    const key = candidate ? candidateKey(candidate) : "manual";
    if (preparingKey) return;

    const requestId = ++prepareRequestRef.current;
    setPreparingKey(key);
    setPrepared(null);
    setConfirmationPending(false);
    try {
      const result = await prepareSacDigitalNewConversationContact(
        organizationId,
        candidate
          ? {
              externalContactId: candidate.external_contact_id || undefined,
              customerId: candidate.customer_id || undefined,
              name: candidate.name,
              phone: candidate.phone,
            }
          : {
              phone: query.trim(),
            },
      );
      if (requestId !== prepareRequestRef.current) return;

      if (!result.prepared || !result.contact) {
        reportError(result.error || "A SAC Digital não conseguiu validar este contato.");
        setPrepared(result);
        return;
      }

      setPrepared(result);
      const firstName = result.contact.name.trim().split(/\s+/).filter(Boolean)[0] || "";
      setDraft(firstName ? `Olá, ${firstName}!` : "Olá!");
    } catch (caught) {
      if (requestId === prepareRequestRef.current) {
        reportError(systemErrorMessage(caught, "Não foi possível validar o número na SAC Digital."));
      }
    } finally {
      if (requestId === prepareRequestRef.current) setPreparingKey(null);
    }
  };

  const startConversation = async () => {
    const contact = prepared?.contact;
    const message = draft.trim();
    if (confirmationPending || !contact?.external_contact_id || (!message && messageType !== 'template') || (!currentChannel || (messageType === 'template' && !currentTemplate) || (cloud && messageType !== 'template')) || sending || sendInFlightRef.current) return;

    sendInFlightRef.current = true;
    setSending(true);
    setConfirmationPending(false);
    try {
      // Nova conversa não deve ser disparada por /notification/contact,
      // nem por template: ambos podem enviar sem abrir protocolo.
      if (messageType !== "text" || cloud) {
        reportError("Este canal exige template de notificação, mas a SAC Digital não oferece abertura de protocolo por template nesta integração. Escolha um canal compatível; nenhuma mensagem foi enviada.");
        return;
      }
      const result = await startSacDigitalNewConversation(
        organizationId,
        contact.external_contact_id,
        message,
        channel,
      );
      if (result.mode === "existing") {
        // Corrida entre a preparação e o envio: nunca enviar novamente
        // quando a SAC já possui um protocolo para o contato.
        if (await onOpenExisting(result.protocol)) {
          reset();
          onClose();
        }
        return;
      }
      // O envio já foi confirmado pela SAC. Uma falha no refresh da tela
      // nunca pode ser tratada como falha de envio, evitando duplicação.
      reset();
      onClose();
      try {
        await onStarted(result);
      } catch {
        // O realtime/webhook fará a conciliação após a entrega confirmada.
      }
    } catch (caught) {
      reportError(systemErrorMessage(caught, "Não foi possível iniciar a conversa."));
    } finally {
      sendInFlightRef.current = false;
      setSending(false);
    }
  };

  const selectedContact = prepared?.contact || null;
  // Um contato recém-importado pode ainda não ter canal confirmado na consulta.
  // Deixar a SAC decidir no envio, sem bloquear apenas por ausência no índice.
  const canCompose = Boolean(prepared?.prepared && selectedContact?.external_contact_id && !selectedContact.blocked);

  const openExistingConversation = async () => {
    const protocol = prepared?.active_protocol?.protocol;
    if (!protocol || sending) return;
    setSending(true);
    try {
      const opened = await onOpenExisting(protocol);
      if (opened) {
        reset();
        onClose();
      }
    } catch (caught) {
      reportError(systemErrorMessage(caught, "Não foi possível abrir o atendimento existente."));
    } finally {
      setSending(false);
    }
  };

  return (
    <AdminDialog
      open={open}
      onClose={close}
      title="Nova conversa"
      description="Busque um contato existente ou informe um número para iniciar um atendimento pelo SAC Digital."
      className="max-w-2xl"
      minimizable
      footer={
        prepared?.active_protocol ? (
          <div className="flex w-full items-center justify-between gap-2">
            <BtnSecondary onClick={() => { setPrepared(null); setDraft(""); }} disabled={sending}>Voltar</BtnSecondary>
            <AdminButton onClick={() => void openExistingConversation()} loading={sending}>
              Abrir conversa
            </AdminButton>
          </div>
        ) : canCompose ? (
          <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <BtnSecondary
              onClick={() => {
                setPrepared(null);
                setDraft("");
                setConfirmationPending(false);
              }}
              disabled={sending}
            >
              Voltar
            </BtnSecondary>
            <AdminButton
              onClick={() => void startConversation()}
              loading={sending}
              loadingText="Iniciando..."
              disabled={confirmationPending || !currentChannel || channelLoading || cloud || messageType !== "text" || !draft.trim()}
            >
              Iniciar conversa
            </AdminButton>
          </div>
        ) : (
          <div className="flex w-full justify-end">
            <BtnSecondary onClick={close}>Fechar</BtnSecondary>
          </div>
        )
      }
    >
      <div className="space-y-4">
        {!prepared?.prepared ? (
          <>
            <form
              className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-end"
              onSubmit={event => {
                event.preventDefault();
                void search();
              }}
            >
              <div className="min-w-0 flex-1">
                <FInput label="Buscar contato" aria-label="Buscar contato" value={query} placeholder="Nome ou número com DDD"
                  onChange={(event: any) => {
                    searchRequestRef.current += 1; prepareRequestRef.current += 1;
                    setQuery(event.target.value); setPrepared(null); setContacts([]); setCustomers([]);
                    setSearching(false); setPreparingKey(null); setConfirmationPending(false);
                  }} />
              </div>
              <AdminButton
                type="submit"
                loading={searching}
                disabled={query.trim().length < 2}
              >
                Buscar
              </AdminButton>
            </form>

            {results.length > 0 && (
              <div className="max-h-64 overflow-y-auto rounded-lg border border-border bg-card">
                {results.map(candidate => (
                  <div
                    key={candidateKey(candidate)}
                    className="flex min-w-0 items-center justify-between gap-3 border-b border-border px-3 py-3 last:border-b-0"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-black text-foreground">
                          {candidate.name || formatPhone(candidate.phone)}
                        </p>
                        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-bold text-muted-foreground">
                          {candidate.source === "customer" ? "Cliente" : "SAC"}
                        </span>
                        {candidate.blocked ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-1.5 py-0.5 text-[9px] font-bold text-red-700 dark:text-red-300">
                            <XCircle size={10} /> Bloqueado
                          </span>
                        ) : candidate.whatsapp_available ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700 dark:text-emerald-300">
                            <CheckCircle2 size={10} /> Canal SAC associado
                          </span>
                        ) : (
                          <span className="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-bold text-amber-800 dark:text-amber-300">
                            Verificar na SAC
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{formatPhone(candidate.phone)}</p>
                    </div>
                    <AdminButton
                      size="sm"
                      variant="secondary"
                      onClick={() => void prepare(candidate)}
                      loading={preparingKey === candidateKey(candidate)}
                      disabled={Boolean(candidate.blocked || (preparingKey && preparingKey !== candidateKey(candidate)))}
                    >
                      {candidate.whatsapp_available ? "Usar" : "Verificar"}
                    </AdminButton>
                  </div>
                ))}
              </div>
            )}

          </>
        ) : selectedContact ? (
          <>
            <div className="rounded-lg border border-border bg-muted/25 p-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-foreground">
                    {selectedContact.name || formatPhone(selectedContact.phone)}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{formatPhone(selectedContact.phone)}</p>
                </div>
                {selectedContact.blocked ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-500/10 px-2 py-1 text-[10px] font-bold text-red-700 dark:text-red-300">
                    <XCircle size={12} /> Contato bloqueado
                  </span>
                ) : prepared.whatsapp_available ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                    <CheckCircle2 size={12} /> Canal SAC associado
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-1 text-[10px] font-bold text-amber-800 dark:text-amber-300">
                    <MessageCircle size={12} /> Canal não confirmado
                  </span>
                )}
              </div>
            </div>

            {prepared.active_protocol ? (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-4">
                <p className="text-sm font-bold text-foreground">Este contato já possui um atendimento aberto.</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {prepared.active_protocol.operator_name
                    ? `Atendente: ${prepared.active_protocol.operator_name}.`
                    : "Atendimento ainda sem atendente confirmado."}
                  {" "}Abra a conversa existente, sem criar outro protocolo ou reenviar a primeira mensagem.
                </p>
              </div>
            ) : canCompose ? (
              <div>
                <div className="mb-4 space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FSelect label="Canal de atendimento" value={channel} disabled={channelLoading || sending}
                      onChange={(e: any) => setChannel(e.target.value)}
                      options={[{value:"",label:channelLoading?"Carregando canais…":"Selecione um canal ativo"}, ...channels.map(item=>({value:String(item.id),label:(item.name||item.title||"Canal")+(item.number?" · "+formatPhone(String(item.number)):"")+(item.primary===true?" · Principal":item.primary===false?" · Secundário":"")+(cloudChannel(item)?" · WhatsApp Cloud":"")}))]} />
                    <FSelect label="Tipo de mensagem" value={messageType} disabled={cloud || sending}
                      onChange={(e: any) => setMessageType(e.target.value)}
                      options={[{value:"text",label:"Texto"}]} />
                  </div>
                  {cloud && <p role="alert" className="text-xs text-amber-700 dark:text-amber-300">Este canal exige template, mas o envio de template da SAC não abre um protocolo. Nova conversa por este canal está indisponível para evitar notificação avulsa.</p>}
                  {messageType === "template" && <>
                    <FSelect label="Template aprovado" value={template} disabled={templateLoading || !channel || sending}
                      onChange={(e: any) => setTemplate(e.target.value)}
                      options={[{value:"",label:templateLoading?"Carregando templates…":"Selecione um template aprovado"}, ...templates.map(item=>({value:String(item.id??item.name),label:(item.name||item.title||"Template aprovado")+(item.language?" · "+(typeof item.language==="object"?item.language.code:item.language):"")}))]} />
                    {currentTemplate && <div className="space-y-2 border-l-2 border-primary bg-muted/30 p-3 text-sm">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Prévia do template</p>
                      {Array.isArray(currentTemplate.components)?currentTemplate.components.map((component:any,index:number)=><p key={index}><strong>{({HEADER:"Cabeçalho",BODY:"Corpo",FOOTER:"Rodapé",BUTTONS:"Botões"} as Record<string,string>)[component.type]||"Conteúdo"}: </strong>{component.text||component.buttons?.map((button:any)=>button.text).filter(Boolean).join(" · ")||"Conteúdo de mídia"}</p>):<p>{currentTemplate.text||currentTemplate.body||currentTemplate.content||"A prévia textual não foi fornecida pela SAC para este template."}</p>}
                    </div>}
                    <div><p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">Variáveis do template</p><fieldset disabled={sending}><StructuredEditor field={{name:"variables",label:"Variáveis",type:"variables"}} value={variables} onChange={setVariables} /></fieldset></div>
                  </>}
                </div>
                <p className="mb-3 text-[11px] text-muted-foreground">
                  {prepared.whatsapp_available
                    ? "O contato está associado a um canal SAC, mas o envio ainda depende da validação do WhatsApp pela SAC Digital."
                    : "O contato foi preparado, mas o canal ainda não está confirmado. Você pode tentar iniciar a conversa; se houver restrição, a SAC Digital informará o motivo."}
                </p>
                {messageType === "text" && <><FTextarea label="Primeira mensagem" aria-label="Primeira mensagem" rows={6} maxLength={5000} disabled={sending} value={draft} onChange={(event: any) => setDraft(event.target.value)} placeholder="Digite a primeira mensagem" />
                <p className="mt-1 text-right text-[10px] text-muted-foreground">{draft.length}/5000</p></>}
              </div>
            ) : (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs font-semibold text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300">
                A SAC Digital não confirmou um canal ativo para este contato. Isso não prova que o número não tenha WhatsApp; confira a conexão do canal e tente novamente.
              </div>
            )}
          </>
        ) : null}

      </div>
    </AdminDialog>
  );
}
