import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { WhatsAppBrandIcon } from "@/shared/ui/icons/WhatsAppBrandIcon";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { AdminButton, AdminDialog } from "@/shared/ui/admin/AdminLayout";
import { LoadingState } from "@/shared/ui/admin/AdminFeedback";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { operateUnionWhatsAppInbox } from "@/features/whatsapp-channels/infrastructure/union-whatsapp-inbox.repository";

const EmbeddedWhatsAppConversation = lazy(() =>
  import("@/features/whatsapp-channels/presentation/UnionWhatsAppInboxPage")
    .then(({ UnionWhatsAppInboxPage }) => ({ default: UnionWhatsAppInboxPage })),
);

// Temporarily enabled only for the isolated "Teste" CRM organization.
// No database schema, WhatsApp provider configuration, or other organization is changed.
export const TESTE_WHATSAPP_OS_ORGANIZATION_ID = "5bcd7ec7-38f0-4dda-a84c-10429bd46b23";

type State =
  | { status: "loading" }
  | { status: "ready"; conversationId: string }
  | { status: "empty"; message: string; canStart: boolean }
  | { status: "disconnected" | "unauthorized" | "error"; message: string };

function phoneCandidates(value: string): string[] {
  const digits = String(value || "").replace(/\D/g, "");
  const withCountry = digits.length === 10 || digits.length === 11 ? "55" + digits : digits;
  if (!/^55[1-9]\d{9,10}$/.test(withCountry)) return [];
  // Historic imports sometimes stored the national number without +55.
  // Never add or remove the ninth digit: it may be a different WhatsApp identity.
  return [withCountry, withCountry.slice(2)];
}

type Props = {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  phone: string;
  customerName: string;
};

export function OrderWhatsAppConversationDialog({ open, onClose, organizationId, phone, customerName }: Props) {
  const { activeOrganizationId, hasPermission } = useAuth();
  const canViewInbox = hasPermission("whatsapp.inbox.view");
  const [state, setState] = useState<State>({ status: "loading" });
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState("");
  const startGateRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const set = (value: State) => { if (!cancelled) setState(value); };
    set({ status: "loading" });
    setStartError("");

    if (organizationId !== TESTE_WHATSAPP_OS_ORGANIZATION_ID ||
      organizationId !== activeOrganizationId || !canViewInbox) {
      set({ status: "unauthorized", message: "Você não possui acesso aos atendimentos WhatsApp desta empresa." });
      return () => { cancelled = true; };
    }

    const candidates = phoneCandidates(phone);
    if (!candidates.length) {
      set({ status: "empty", message: "O cliente não possui um WhatsApp válido para localizar o histórico.", canStart: false });
      return () => { cancelled = true; };
    }

    void (async () => {
      try {
        // The backend verifies the operator and resolves the active organization channel.
        const channel = await operateUnionWhatsAppInbox(organizationId, crypto.randomUUID(), "channel_status");
        if (cancelled) return;
        if (!channel.channel_connected || !channel.channel_id || !channel.channel_phone) {
          set({ status: "disconnected", message: "A empresa Teste ainda não possui um canal WhatsApp conectado." });
          return;
        }

        // RLS is preserved: do not use service-role credentials or merge other
        // organizations/channels to try to locate a private conversation.
        const { data, error } = await supabase.from("union_whatsapp_conversations")
          .select("id")
          .eq("organization_id", organizationId)
          .eq("channel_id", channel.channel_id)
          .eq("account_phone", channel.channel_phone)
          .in("contact_phone", candidates)
          .order("last_message_at", { ascending: false, nullsFirst: false })
          .limit(1);
        if (error) throw error;
        if (cancelled) return;
        const conversationId = data?.[0]?.id;
        if (conversationId) {
          set({ status: "ready", conversationId });
        } else {
          set({ status: "empty", message: "Este cliente ainda não possui uma conversa no WhatsApp da empresa.", canStart: channel.capabilities?.start === true });
        }
      } catch (error) {
        set({ status: "error", message: systemErrorMessage(error, "Não foi possível carregar a conversa do cliente.") });
      }
    })();

    return () => { cancelled = true; };
  }, [open, organizationId, phone, activeOrganizationId, canViewInbox]);

  const startConversation = async () => {
    if (startGateRef.current || state.status !== "empty" || !state.canStart ||
      organizationId !== activeOrganizationId || !canViewInbox) return;
    const number = phoneCandidates(phone)[0];
    if (!number) return;
    startGateRef.current = true;
    setStarting(true);
    setStartError("");
    try {
      // Follow the same verified flow as Atendimentos > Nova conversa.
      // The server checks the identity again before creating a protocol.
      const verified = await operateUnionWhatsAppInbox(
        organizationId, crypto.randomUUID(), "check_number", { phone: number },
      );
      if (!verified.phone || !/^55[1-9]\d{9,10}$/.test(verified.phone)) {
        throw new Error("O número não foi confirmado pelo WhatsApp.");
      }
      const created = await operateUnionWhatsAppInbox(
        organizationId, crypto.randomUUID(), "start",
        { phone: verified.phone, contact_name: customerName.trim() },
      );
      if (!created.conversation_id) throw new Error("Não foi possível confirmar a conversa.");
      // Existing contacts are reopened by the backend, preserving previous history.
      // New conversations get their protocol from the database lifecycle trigger.
      setState({ status: "ready", conversationId: created.conversation_id });
    } catch (reason) {
      setStartError(systemErrorMessage(reason, "Não foi possível iniciar a conversa."));
    } finally {
      startGateRef.current = false;
      setStarting(false);
    }
  };

  return <AdminDialog
    open={open}
    onClose={onClose}
    title="Atendimento WhatsApp"
    className="!h-[calc(100dvh-var(--admin-shell-header-height,4rem)-var(--admin-browser-bottom-inset,0px)-1.5rem)] !min-h-0 !w-[calc(100vw-1rem)] !max-w-[1160px] sm:!w-[calc(100vw-2rem)] max-md:!left-0 max-md:!right-0 max-md:!top-[var(--admin-shell-header-height,4rem)] max-md:!bottom-0 max-md:!h-[calc(100dvh-var(--admin-shell-header-height,4rem))] max-md:!max-h-none max-md:!w-screen max-md:!max-w-none max-md:!translate-x-0 max-md:!translate-y-0 max-md:!rounded-none max-md:!border-0 max-md:!shadow-none"
    bodyClassName="!flex !min-h-0 !flex-col !overflow-hidden !p-0"
  >
    {state.status === "loading" ? <div className="flex h-full items-center justify-center">
      <LoadingState text="Preparando conversa do cliente..." />
    </div> : state.status === "ready" ? <Suspense fallback={<div className="flex h-full items-center justify-center">
      <LoadingState text="Carregando conversa..." />
    </div>}>
      <EmbeddedWhatsAppConversation
        key={state.conversationId}
        embedded
        embeddedFullControls
        initialConversationId={state.conversationId}
        onBack={onClose}
        onConfigure={onClose}
      />
    </Suspense> : <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <WhatsAppBrandIcon size={42} className="text-[#25D366]" />
      <p className="max-w-md text-sm text-muted-foreground">{state.message}</p>
      {state.status === "empty" && state.canStart && <AdminButton
        disabled={starting} loading={starting} onClick={() => void startConversation()}>
        {starting ? "Iniciando conversa..." : "Iniciar conversa"}
      </AdminButton>}
      {startError && <p role="alert" className="max-w-md text-sm text-destructive">{startError}</p>}
    </div>}
  </AdminDialog>;
}
