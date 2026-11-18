import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { operateUnionWhatsAppInbox } from "@/features/whatsapp-channels/infrastructure/union-whatsapp-inbox.repository";

type VerifiedNumber = {
  kind: "registered";
  name: string;
  nameLabel: string;
  avatar: string | null;
  adjusted: boolean;
};
type LookupResult =
  | VerifiedNumber
  | { kind: "unregistered" }
  | { kind: "unavailable"; message: string };
type LookupState = { key: string; result: LookupResult | { kind: "checking" } };
const recentChecks = new Map<string, { expiresAt: number; result: LookupResult }>();

function brazilianWhatsAppNumber(value: string): string {
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
 * Preview-only: does not create a contact, conversation or protocol, does not
 * change the typed customer name and never exposes WuzAPI tokens to the UI.
 * The existing Edge Function enforces organization, operator and capability
 * permissions. Use one component for every CRM registration flow.
 */
export function WhatsAppNumberVerification({ phone, className = "" }: {
  phone: string;
  className?: string;
}) {
  const { activeOrganizationId, hasPermission } = useAuth();
  const canVerify = hasPermission("whatsapp.inbox.view") && hasPermission("whatsapp.inbox.send");
  const normalized = brazilianWhatsAppNumber(phone);
  const key = activeOrganizationId && normalized ? activeOrganizationId + ":" + normalized : "";
  const [state, setState] = useState<LookupState | null>(null);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!canVerify || !key || !activeOrganizationId) {
      setState(null);
      return;
    }
    const cached = recentChecks.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      setState({ key, result: cached.result });
      return;
    }

    let active = true;
    setState({ key, result: { kind: "checking" } });
    const timer = setTimeout(async () => {
      let next: LookupResult;
      try {
        const response = await operateUnionWhatsAppInbox(
          activeOrganizationId, crypto.randomUUID(), "check_number", { phone: normalized },
        );
        if (!response.phone) throw new Error("O WhatsApp não retornou confirmação.");
        const name = String(response.contact_name || response.verified_name || "").trim().slice(0, 120);
        next = {
          kind: "registered",
          name,
          nameLabel: labelForName(response.name_source, !response.contact_name && Boolean(response.verified_name)),
          avatar: response.avatar_url || null,
          adjusted: Boolean(response.adjusted),
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Não foi possível consultar o WhatsApp.";
        next = /O WhatsApp confirmou que esse telefone não está cadastrado/i.test(message)
          ? { kind: "unregistered" }
          : { kind: "unavailable", message };
      }
      // Do not apply the result of an old field value or an unmounted modal.
      if (!active) return;
      setState({ key, result: next });
      if (next.kind === "registered" || next.kind === "unregistered") {
        if (recentChecks.size >= 100) recentChecks.delete(recentChecks.keys().next().value || "");
        recentChecks.set(key, {
          result: next,
          expiresAt: Date.now() + (next.kind === "registered" ? 10 : 5) * 60_000,
        });
      }
    }, 900);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [activeOrganizationId, canVerify, key, normalized, retry]);

  // Missing permissions, incomplete numbers and stale responses produce no UI.
  // They do not prevent the normal customer/OS save flow.
  if (!canVerify || !key || state?.key !== key) return null;
  const result = state.result;
  return (
    <div className={"mt-2 min-w-0 rounded-lg border border-border/70 bg-muted/30 px-3 py-2 text-xs " + className}
      aria-live="polite" aria-label="Verificação do WhatsApp">
      {result.kind === "checking" && (
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 size={14} className="shrink-0 animate-spin" />
          <span>Verificando número no WhatsApp...</span>
        </div>
      )}
      {result.kind === "registered" && (
        <div className="min-w-0 space-y-1.5">
          <div className="flex items-center gap-2 font-medium text-emerald-700 dark:text-emerald-300">
            <CheckCircle2 size={15} className="shrink-0" />
            <span>Número confirmado no WhatsApp</span>
          </div>
          <div className="flex min-w-0 items-center gap-2">
            {result.avatar && (
              <img src={result.avatar} alt="" loading="lazy" referrerPolicy="no-referrer"
                className="h-9 w-9 shrink-0 rounded-full border border-border object-cover" />
            )}
            <div className="min-w-0">
              {result.name ? (
                <>
                  <p className="truncate font-semibold text-foreground" title={result.name}>{result.name}</p>
                  <p className="text-muted-foreground">{result.nameLabel}</p>
                </>
              ) : <p className="text-muted-foreground">Nome não disponibilizado pelo WhatsApp</p>}
            </div>
          </div>
          {result.adjusted && (
            <p className="text-muted-foreground">O WhatsApp reconheceu uma variante do número com ou sem o nono dígito.</p>
          )}
        </div>
      )}
      {result.kind === "unregistered" && (
        <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300">
          <AlertCircle size={15} className="shrink-0" />
          <span>Número não cadastrado no WhatsApp. Confira o DDD e os dígitos.</span>
        </div>
      )}
      {result.kind === "unavailable" && (
        <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
          <AlertCircle size={15} className="shrink-0" />
          <span title={result.message}>Consulta indisponível. O cadastro pode continuar normalmente.</span>
          <button type="button" className="inline-flex items-center gap-1 font-medium text-primary hover:underline"
            onClick={() => { recentChecks.delete(key); setRetry(value => value + 1); }}>
            <RefreshCw size={12} /> Tentar novamente
          </button>
        </div>
      )}
    </div>
  );
}
