import { useMemo, useState } from "react";
import { CheckCircle2, MessageCircle, Search, XCircle } from "lucide-react";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { AdminButton, AdminDialog, BtnSecondary } from "@/shared/ui/admin/AdminLayout";
import {
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
  onClose,
  onStarted,
}: {
  open: boolean;
  organizationId: string;
  onClose: () => void;
  onStarted: (protocol: string | null) => Promise<void> | void;
}) {
  const [query, setQuery] = useState("");
  const [manualName, setManualName] = useState("");
  const [searching, setSearching] = useState(false);
  const [preparingKey, setPreparingKey] = useState<string | null>(null);
  const [contacts, setContacts] = useState<SacDigitalNewConversationCandidate[]>([]);
  const [customers, setCustomers] = useState<SacDigitalNewConversationCandidate[]>([]);
  const [prepared, setPrepared] = useState<SacDigitalPreparedContact | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

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

    setSearching(true);
    setPrepared(null);
    setError("");
    try {
      const data = await searchSacDigitalNewConversation(organizationId, value);
      setContacts(data.contacts);
      setCustomers(data.customers);
      if (data.contacts.length === 0 && data.customers.length === 0 && !isUsablePhone(value)) {
        setError("Nenhum contato encontrado. Para um número novo, informe o telefone com DDD.");
      }
    } catch (caught) {
      setError(systemErrorMessage(caught, "Não foi possível pesquisar os contatos."));
    } finally {
      setSearching(false);
    }
  };

  const prepare = async (candidate?: SacDigitalNewConversationCandidate) => {
    const key = candidate ? candidateKey(candidate) : "manual";
    if (preparingKey) return;

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

      if (!result.prepared || !result.contact) {
        setError(result.error || "A SAC Digital não conseguiu validar este contato.");
        setPrepared(result);
        return;
      }

      setPrepared(result);
      const firstName = result.contact.name.trim().split(/\s+/).filter(Boolean)[0] || "";
      setDraft(firstName ? `Olá, ${firstName}!` : "Olá!");
    } catch (caught) {
      setError(systemErrorMessage(caught, "Não foi possível validar o número na SAC Digital."));
    } finally {
      setPreparingKey(null);
    }
  };

  const startConversation = async () => {
    const contact = prepared?.contact;
    const message = draft.trim();
    if (!contact?.external_contact_id || !message || sending) return;

    setSending(true);
    setError("");
    try {
      const result = await startSacDigitalNewConversation(
        organizationId,
        contact.external_contact_id,
        message,
      );
      await onStarted(result.protocol);
      reset();
      onClose();
    } catch (caught) {
      setError(systemErrorMessage(caught, "Não foi possível iniciar a conversa."));
    } finally {
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
              disabled={!draft.trim()}
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
              className="flex min-w-0 flex-col gap-2 sm:flex-row"
              onSubmit={event => {
                event.preventDefault();
                void search();
              }}
            >
              <div className="relative min-w-0 flex-1">
                <Search
                  size={15}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <input
                  value={query}
                  onChange={event => {
                    setQuery(event.target.value);
                    setPrepared(null);
                    setContacts([]);
                    setCustomers([]);
                    setError("");
                  }}
                  placeholder="Nome ou número com DDD"
                  className="admin-input h-10 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground/65 focus:border-primary focus:ring-2 focus:ring-primary/20"
                  autoFocus
                />
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
                    <label className="mt-3 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      Nome do contato
                    </label>
                    <input
                      value={manualName}
                      onChange={event => setManualName(event.target.value)}
                      placeholder="Opcional"
                      className="admin-input mt-1 h-10 w-full rounded-lg border border-border bg-card px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground/65 focus:border-primary focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <AdminButton
                    onClick={() => void prepare()}
                    loading={preparingKey === "manual"}
                    disabled={Boolean(preparingKey && preparingKey !== "manual")}
                  >
                    Criar contato e continuar
                  </AdminButton>
                </div>
                <p className="mt-2 text-[10px] leading-4 text-muted-foreground">
                  Não precisa estar na base da SAC. Ao continuar, a Union cadastra o contato se necessário e libera a primeira mensagem quando a importação for aceita.
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
                <p className="mb-3 text-[11px] text-muted-foreground">
                  O contato está associado a um canal SAC, mas isso não comprova que o canal esteja operacional nem que o número tenha WhatsApp. O envio depende da validação da SAC Digital.
                </p>
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Primeira mensagem
                </label>
                <textarea
                  rows={6}
                  maxLength={5000}
                  value={draft}
                  onChange={event => setDraft(event.target.value)}
                  placeholder="Digite a primeira mensagem"
                  className="admin-input min-h-32 w-full resize-y rounded-lg border border-border bg-card px-3 py-2.5 text-sm leading-5 text-foreground outline-none placeholder:text-muted-foreground/65 focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
                <p className="mt-1 text-right text-[9px] text-muted-foreground">{draft.length}/5000</p>
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
