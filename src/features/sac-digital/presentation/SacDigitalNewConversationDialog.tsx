import { resultItems, usableChannels, cloudChannel, approvedTemplates } from '../domain/resource-ui.mjs';
import { FInput, FSelect, FTextarea } from '@/shared/ui/admin/AdminFormControls';
import { StructuredEditor } from './SacDigitalResources';
import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, MessageCircle, XCircle } from "lucide-react";
import { systemErrorMessage } from "@/shared/domain/error-message";
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

function isUsablePhone(value: string) {
  const digits = normalizePhone(value);
  return digits.length >= 10 && digits.length <= 15;
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
}: {
  open: boolean;
  organizationId: string;
  initialContact?: { phone: string; name: string } | null;
  onClose: () => void;
  onStarted: (result: Awaited<ReturnType<typeof startSacDigitalNewConversation>>) => Promise<void> | void;
}) {
  const [query, setQuery] = useState("");
  const [manualName, setManualName] = useState("");
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
  const [channelError,setChannelError] = useState('');
  const [templateError,setTemplateError] = useState('');
  const currentChannel = channels.find(item => String(item.id)===channel);
  const cloud = cloudChannel(currentChannel);
  const currentTemplate = templates.find(item => String(item.id??item.name)===template);
  useEffect(()=>{if(!open)return;let cancelled=false;setChannelLoading(true);setChannelError('');operateSacDigitalResource(organizationId,14,{}).then(response=>{if(cancelled)return;const usable=usableChannels(resultItems(response.data));setChannels(usable);if(!usable.length)setChannelError('Nenhum canal ativo disponível para iniciar uma conversa. Confira a conexão e as permissões na SAC.');}).catch(caught=>{if(!cancelled)setChannelError(caught instanceof Error?caught.message:'Não foi possível carregar os canais.');}).finally(()=>{if(!cancelled)setChannelLoading(false);});return()=>{cancelled=true;};},[open,organizationId]);
  useEffect(()=>{setTemplate('');setTemplates([]);setVariables({});if(!open||!channel)return;let cancelled=false;setTemplateLoading(true);setTemplateError('');if(cloud)setMessageType('template');operateSacDigitalResource(organizationId,15,{id:channel}).then(response=>{if(cancelled)return;const approved=approvedTemplates(resultItems(response.data));setTemplates(approved);if(!approved.length)setTemplateError('Nenhum template aprovado disponível neste canal.');}).catch(caught=>{if(!cancelled)setTemplateError(caught instanceof Error?caught.message:'Não foi possível carregar templates aprovados.');}).finally(()=>{if(!cancelled)setTemplateLoading(false);});return()=>{cancelled=true;};},[open,channel,organizationId,cloud]);
  const [messageType, setMessageType] = useState("text");
  const [template, setTemplate] = useState("");
  const [variables, setVariables] = useState<Record<string, string[]>>({});
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
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
    setManualName(initialContact.name || "");
    setContacts([]);
    setCustomers([]);
    setPrepared(null);
    setSearching(false);
    setPreparingKey(null);
    setError("");
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
    setManualName("");
    setContacts([]);
    setCustomers([]);
    setPrepared(null);
    setDraft("");
    setError("");
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
    setError("");
    try {
      const data = await searchSacDigitalNewConversation(organizationId, value);
      if (requestId !== searchRequestRef.current) return;
      setContacts(data.contacts);
      setCustomers(data.customers);
      if (data.contacts.length === 0 && data.customers.length === 0 && !isUsablePhone(value)) {
        setError("Nenhum contato encontrado. Para um número novo, informe o telefone com DDD.");
      }
    } catch (caught) {
      if (requestId === searchRequestRef.current) {
        setError(systemErrorMessage(caught, "Não foi possível pesquisar os contatos."));
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
    setError("");
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
              name: manualName.trim() || undefined,
              phone: query.trim(),
            },
      );
      if (requestId !== prepareRequestRef.current) return;

      if (!result.prepared || !result.contact) {
        setError(result.error || "A SAC Digital não conseguiu validar este contato.");
        setPrepared(result);
        return;
      }

      setPrepared(result);
      const firstName = result.contact.name.trim().split(/\s+/).filter(Boolean)[0] || "";
      setDraft(firstName ? `Olá, ${firstName}!` : "Olá!");
    } catch (caught) {
      if (requestId === prepareRequestRef.current) {
        setError(systemErrorMessage(caught, "Não foi possível validar o número na SAC Digital."));
      }
    } finally {
      if (requestId === prepareRequestRef.current) setPreparingKey(null);
    }
  };

  const startConversation = async () => {
    const contact = prepared?.contact;
    const message = draft.trim();
    if (error.includes("Confirmação pendente") || !contact?.external_contact_id || (!message && messageType !== 'template') || (!currentChannel || (messageType === 'template' && !currentTemplate) || (cloud && messageType !== 'template')) || sending || sendInFlightRef.current) return;

    sendInFlightRef.current = true;
    setSending(true);
    setError("");
    try {
      const result = messageType === "template"
        ? await operateSacDigitalResource(organizationId, 39, {
            contact: contact.external_contact_id,
            channel: channel.trim(),
            type: messageType,
            template: template.trim(),
            variables,
          }) as unknown as Awaited<ReturnType<typeof startSacDigitalNewConversation>>
        : await startSacDigitalNewConversation(
            organizationId,
            contact.external_contact_id,
            message,
            channel,
          );
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
      setError(systemErrorMessage(caught, "Não foi possível iniciar a conversa."));
    } finally {
      sendInFlightRef.current = false;
      setSending(false);
    }
  };

  const manualPhoneReady = isUsablePhone(query);
  const selectedContact = prepared?.contact || null;
  // Um contato recém-importado pode ainda não ter canal confirmado na consulta.
  // Deixar a SAC decidir no envio, sem bloquear apenas por ausência no índice.
  const canCompose = Boolean(prepared?.prepared && selectedContact?.external_contact_id && !selectedContact.blocked);

  return (
    <AdminDialog
      open={open}
      onClose={close}
      title="Nova conversa"
      description="Busque um contato existente ou informe um número para iniciar um atendimento pelo SAC Digital."
      className="max-w-2xl"
      minimizable
      footer={
        canCompose ? (
          <div className="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-between">
            <BtnSecondary
              onClick={() => {
                setPrepared(null);
                setDraft("");
                setError("");
              }}
              disabled={sending}
            >
              Voltar
            </BtnSecondary>
            <AdminButton
              onClick={() => void startConversation()}
              loading={sending}
              loadingText="Iniciando..."
              disabled={error.includes("Confirmação pendente") || !currentChannel || channelLoading || (messageType === "template" ? !currentTemplate || templateLoading : !draft.trim())}
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
                    setQuery(event.target.value); setManualName(""); setPrepared(null); setContacts([]); setCustomers([]);
                    setSearching(false); setPreparingKey(null); setError("");
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

            {manualPhoneReady && !results.some(item => phoneKey(item.phone) === phoneKey(query)) && (
              <div className="rounded-lg border border-border bg-muted/25 p-3">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-black text-foreground">Número novo — iniciar conversa</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{formatPhone(query)}</p>
                    <div className="mt-3"><FInput label="Nome do contato" aria-label="Nome do contato" value={manualName} onChange={(event: any) => setManualName(event.target.value)} placeholder="Opcional" /></div>
                  </div>
                  <AdminButton
                    onClick={() => void prepare()}
                    loading={preparingKey === "manual"}
                    disabled={Boolean(preparingKey && preparingKey !== "manual")}
                  >
                    Continuar
                  </AdminButton>
                </div>
                <p className="mt-2 text-[10px] leading-4 text-muted-foreground">
                  O número não precisa estar cadastrado na SAC nem no CRM. O envio direto valida o número na SAC; selecione o canal e, se necessário, um template aprovado.
                </p>
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

            {canCompose ? (
              <div>
                <div className="mb-4 space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <FSelect label="Canal de atendimento" value={channel} disabled={channelLoading || sending}
                      onChange={(e: any) => setChannel(e.target.value)}
                      options={[{value:"",label:channelLoading?"Carregando canais…":"Selecione um canal ativo"}, ...channels.map(item=>({value:String(item.id),label:(item.name||item.title||"Canal")+(item.number?" · "+formatPhone(String(item.number)):"")+(item.primary===true?" · Principal":item.primary===false?" · Secundário":"")+(cloudChannel(item)?" · WhatsApp Cloud":"")}))]} />
                    <FSelect label="Tipo de mensagem" value={messageType} disabled={cloud || sending}
                      onChange={(e: any) => setMessageType(e.target.value)}
                      options={[{value:"text",label:"Texto"},{value:"template",label:"Template aprovado"}]} />
                  </div>
                  {channelError && <p role="alert" className="text-xs text-red-700 dark:text-red-300">{channelError}</p>}
                  {cloud && <p className="text-xs text-muted-foreground">Este canal WhatsApp Cloud exige template aprovado para iniciar a conversa.</p>}
                  {messageType === "template" && <>
                    <FSelect label="Template aprovado" value={template} disabled={templateLoading || !channel || sending}
                      onChange={(e: any) => setTemplate(e.target.value)}
                      options={[{value:"",label:templateLoading?"Carregando templates…":"Selecione um template aprovado"}, ...templates.map(item=>({value:String(item.id??item.name),label:(item.name||item.title||"Template aprovado")+(item.language?" · "+(typeof item.language==="object"?item.language.code:item.language):"")}))]} />
                    {templateError && <p role="alert" className="text-xs text-red-700 dark:text-red-300">{templateError}</p>}
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

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs font-semibold text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
            {error}
          </div>
        )}
      </div>
    </AdminDialog>
  );
}
