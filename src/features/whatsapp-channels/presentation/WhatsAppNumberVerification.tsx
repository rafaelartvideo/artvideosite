import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2, RefreshCw } from "lucide-react";
import { FPhoneInput } from "@/shared/ui/admin/AdminFormControls";
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
export function VerifiedWhatsAppPhoneInput({ value, ...inputProps }: {
  value: unknown;
  onChange: (event: { target: { value: string } }) => void;
  [key: string]: any;
}) {
  const phone = String(value ?? "");
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

  // Only render a status for the current, complete number. No separate
  // status card: the badge belongs inside the phone field alongside copy.
  const result = canVerify && key && state?.key === key ? state.result : null;
  const showProfile = result?.kind === "registered" && Boolean(result.name || result.avatar);
  const inlineStatus = result ? (
    result.kind === "checking" ? (
      <span role="status" aria-label="Verificando WhatsApp" title="Consultando número no WhatsApp"
        className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-semibold text-muted-foreground">
        <Loader2 size={13} className="animate-spin" />
        <span className="hidden min-[431px]:inline">Verificando...</span>
      </span>
    ) : result.kind === "registered" ? (
      <span role="status" aria-label="WhatsApp confirmado"
        title={result.adjusted ? "WhatsApp confirmado com tratamento do nono dígito" : "Número confirmado no WhatsApp"}
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
    ) : (
      <span className="inline-flex shrink-0 items-center gap-0.5">
        <span role="status" aria-label="Consulta WhatsApp indisponível"
          title={result.message}
          className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md bg-muted px-1.5 py-1 text-[10px] font-semibold text-muted-foreground">
          <AlertCircle size={13} />
          <span className="hidden min-[431px]:inline">Indisponível</span>
        </span>
        <button type="button" aria-label="Consultar WhatsApp novamente" title="Tentar verificar novamente"
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-primary hover:bg-primary/10"
          onClick={() => { recentChecks.delete(key); setRetry(value => value + 1); }}>
          <RefreshCw size={13} />
        </button>
      </span>
    )
  ) : null;

  return (
    <div className="min-w-0">
      <FPhoneInput {...inputProps} value={value} statusAccessory={inlineStatus} />
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
            {!result.name && result.avatar && (
              <p className="text-muted-foreground">Foto de perfil do WhatsApp</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
