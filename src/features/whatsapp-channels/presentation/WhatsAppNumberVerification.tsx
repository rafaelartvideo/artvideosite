import { useCallback, useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { FPhoneInput } from "@/shared/ui/admin/AdminFormControls";
import { useAuth } from "@/lib/auth";
import { operateUnionWhatsAppInbox } from "@/features/whatsapp-channels/infrastructure/union-whatsapp-inbox.repository";

type VerifiedNumber = {
  kind: "registered";
  name: string;
  nameLabel: string;
  avatar: string | null;
  adjusted: boolean;
  verifiedAt: string | null;
  savedVerification: boolean;
};
type LookupResult =
  | VerifiedNumber
  | { kind: "unregistered" }
  | { kind: "unverified" }
  | { kind: "unavailable"; message: string };
type LookupState = { key: string; result: LookupResult | { kind: "checking" } };
const recentChecks = new Map<string, { expiresAt: number; result: LookupResult }>();

export function brazilianWhatsAppNumber(value: string): string {
  const digits = value.replace(/\D/g, "");
  if (/^[1-9]\d{9,10}$/.test(digits)) return "55" + digits;
  if (/^55[1-9]\d{9,10}$/.test(digits)) return digits;
  return "";
}

function labelForName(source: string | null | undefined, verifiedName: boolean): string {
  if (source === "agenda") return "Nome salvo na Union/agenda";
  if (source === "agenda_whatsapp") return "Nome salvo na agenda do WhatsApp";
  if (source === "conversa") return "Nome registrado em conversa";
  if (verifiedName && !source) return "Nome verificado do WhatsApp Business";
  return "Nome informado pelo WhatsApp";
}

/**
 * The WhatsApp provider check is performed only while creating a new record,
 * or after an explicit click while editing. Previously verified numbers are
 * read from the tenant-scoped server confirmation: opening an existing record
 * never calls WuzAPI. The status is not proof of number ownership.
 */
export function VerifiedWhatsAppPhoneInput({
  value, verificationMode = "create", verificationEnabled = true, onVerifiedName, ...inputProps
}: {
  value: unknown;
  onChange: (event: { target: { value: string } }) => void;
  verificationMode?: "create" | "edit";
  verificationEnabled?: boolean;
  /** Optional suggestion for new contact forms; uses the existing verification result, including cache hits. */
  onVerifiedName?: (name: string) => void;
  [key: string]: any;
}) {
  const phone = String(value ?? "");
  const { activeOrganizationId, hasPermission } = useAuth();
  const canVerify = verificationEnabled && hasPermission("whatsapp.inbox.view") && hasPermission("whatsapp.inbox.send");
  const normalized = brazilianWhatsAppNumber(phone);
  const key = activeOrganizationId && normalized ? activeOrganizationId + ":" + normalized : "";
  const [state, setState] = useState<LookupState | null>(null);
  const requestVersion = useRef(0);
  const currentKey = useRef(key);
  currentKey.current = key;

  const checkAtProvider = useCallback(async (organizationId: string, number: string, requestKey: string, version: number) => {
    let next: LookupResult;
    try {
      const response = await operateUnionWhatsAppInbox(
        organizationId, crypto.randomUUID(), "check_number", { phone: number },
      );
      if (!response.phone) throw new Error("O WhatsApp não retornou confirmação.");
      const name = [response.contact_name, response.verified_name]
        .map(value => String(value || "").trim().slice(0, 120))
        .find(value => value && value !== "Contato WhatsApp" && !/^[+()\d\s-]+$/.test(value)) || "";
      next = {
        kind: "registered",
        name,
        nameLabel: labelForName(response.name_source, !response.contact_name && Boolean(response.verified_name)),
        avatar: response.avatar_url || null,
        adjusted: Boolean(response.adjusted),
        verifiedAt: response.verified_at || null,
        savedVerification: false,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível consultar o WhatsApp.";
      next = /O WhatsApp confirmou que esse telefone não está cadastrado/i.test(message)
        ? { kind: "unregistered" }
        : { kind: "unavailable", message };
    }
    if (requestVersion.current !== version || currentKey.current !== requestKey) return;
    setState({ key: requestKey, result: next });
    if (next.kind === "registered" || next.kind === "unregistered") {
      if (recentChecks.size >= 100) recentChecks.delete(recentChecks.keys().next().value || "");
      recentChecks.set(requestKey, {
        result: next,
        expiresAt: Date.now() + (next.kind === "registered" ? 10 : 5) * 60_000,
      });
    }
  }, []);

  useEffect(() => {
    const version = ++requestVersion.current;
    if (!canVerify || !key || !activeOrganizationId) {
      setState(null);
      return () => { requestVersion.current++; };
    }

    setState({ key, result: { kind: "checking" } });
    if (verificationMode === "create") {
      const cached = recentChecks.get(key);
      if (cached && cached.expiresAt > Date.now()) {
        setState({ key, result: cached.result });
        return () => { requestVersion.current++; };
      }
      const timer = setTimeout(() => {
        void checkAtProvider(activeOrganizationId, normalized, key, version);
      }, 900);
      return () => { clearTimeout(timer); requestVersion.current++; };
    }

    // Editing: only query the small, private confirmation table. No WuzAPI,
    // avatars, conversation creation, or repeat provider verification.
    const timer = setTimeout(async () => {
      let next: LookupResult;
      try {
        const response = await operateUnionWhatsAppInbox(
          activeOrganizationId, crypto.randomUUID(), "number_verification_status", { phone: normalized },
        );
        next = response.verified === true ? {
          kind: "registered", name: "", nameLabel: "", avatar: null, adjusted: false,
          verifiedAt: response.verified_at || null, savedVerification: true,
        } : { kind: "unverified" };
      } catch (error) {
        next = { kind: "unavailable",
          message: error instanceof Error ? error.message : "Não foi possível consultar a confirmação salva." };
      }
      if (requestVersion.current !== version || currentKey.current !== key) return;
      setState({ key, result: next });
    }, 300);
    return () => { clearTimeout(timer); requestVersion.current++; };
  }, [activeOrganizationId, canVerify, checkAtProvider, key, normalized, verificationMode]);

  const verifyManually = () => {
    if (!canVerify || !key || !activeOrganizationId || inputProps.disabled) return;
    const version = ++requestVersion.current;
    setState({ key, result: { kind: "checking" } });
    void checkAtProvider(activeOrganizationId, normalized, key, version);
  };

  const result = canVerify && key && state?.key === key ? state.result : null;
  const suggestedName = result?.kind === "registered" ? result.name : "";
  useEffect(() => {
    if (verificationMode === "create" && verificationEnabled) onVerifiedName?.(suggestedName);
  }, [verificationMode, verificationEnabled, key, suggestedName, onVerifiedName]);
  const showProfile = result?.kind === "registered" && Boolean(result.name || result.avatar);
  const verifiedTitle = result?.kind === "registered" && result.savedVerification && result.verifiedAt
    ? "Confirmado no WhatsApp em " + new Date(result.verifiedAt).toLocaleString("pt-BR") + ". A situação pode mudar com o tempo."
    : "Número confirmado no WhatsApp";
  const inlineStatus = result ? (
    result.kind === "checking" ? (
      <span role="status" aria-label={verificationMode === "edit" ? "Consultando confirmação salva" : "Verificando WhatsApp"}
        className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-semibold text-muted-foreground">
        <Loader2 size={13} className="animate-spin" />
        <span className="hidden min-[431px]:inline">{verificationMode === "edit" ? "Consultando..." : "Verificando..."}</span>
      </span>
    ) : result.kind === "registered" ? (
      <span role="status" aria-label="WhatsApp confirmado" title={verifiedTitle}
        className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md border border-emerald-500/25 bg-emerald-500/10 px-1.5 py-1 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
        <CheckCircle2 size={13} className="shrink-0" />
        <span className="hidden min-[431px]:inline">WhatsApp confirmado</span>
        <span className="min-[431px]:hidden">Confirmado</span>
      </span>
    ) : result.kind === "unregistered" ? (
      <span role="status" aria-label="WhatsApp não encontrado"
        title="Número não cadastrado no WhatsApp. Confira o DDD e os dígitos."
        className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md border border-amber-500/25 bg-amber-500/10 px-1.5 py-1 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
        <AlertCircle size={13} className="shrink-0" />
        <span className="hidden min-[431px]:inline">Não encontrado</span>
        <span className="min-[431px]:hidden">Ausente</span>
      </span>
    ) : result.kind === "unverified" ? (
      <button type="button" disabled={inputProps.disabled}
        aria-label="Verificar número no WhatsApp" title="Ainda não verificado. Clique para consultar o WhatsApp."
        onClick={verifyManually}
        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-primary/25 bg-primary/10 px-1.5 py-1 text-[10px] font-semibold text-primary hover:bg-primary/15 disabled:opacity-50">
        <ShieldCheck size={13} className="shrink-0" />
        <span>Verificar</span>
      </button>
    ) : (
      <span className="inline-flex shrink-0 items-center gap-0.5">
        <span role="status" aria-label="Consulta WhatsApp indisponível" title={result.message}
          className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md bg-muted px-1.5 py-1 text-[10px] font-semibold text-muted-foreground">
          <AlertCircle size={13} />
          <span className="hidden min-[431px]:inline">Indisponível</span>
        </span>
        <button type="button" disabled={inputProps.disabled}
          aria-label="Consultar WhatsApp novamente" title="Tentar novamente"
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-primary hover:bg-primary/10 disabled:opacity-50"
          onClick={verifyManually}>
          <RefreshCw size={13} />
        </button>
      </span>
    )
  ) : null;

  return (
    <div className="min-w-0">
      <FPhoneInput {...inputProps} value={value} statusAccessory={inlineStatus} />
      {verificationMode === "create" && onVerifiedName && result?.kind === "registered" && !result.name && <p role="status" className="mt-1 text-[11px] text-muted-foreground">Número confirmado. O nome não foi disponibilizado pelo WhatsApp; informe-o manualmente.</p>}
      {showProfile && result?.kind === "registered" && (
        <div className="mt-2 flex min-w-0 items-center gap-2.5 rounded-lg border border-border/70 bg-muted/20 px-3 py-2 text-xs"
          aria-label="Informações disponíveis do contato WhatsApp">
          {result.avatar && (
            <img src={result.avatar} alt="" loading="lazy" referrerPolicy="no-referrer"
              className="h-9 w-9 shrink-0 rounded-full border border-border object-cover" />
          )}
          <div className="min-w-0 flex-1">
            {result.name && (
              <>
                <p className="truncate font-semibold text-foreground" title={result.name}>{result.name}</p>
                <p className="text-muted-foreground">{result.nameLabel}</p>
              </>
            )}
            {!result.name && result.avatar && <p className="text-muted-foreground">Foto de perfil do WhatsApp</p>}
          </div>
        </div>
      )}
    </div>
  );
}
