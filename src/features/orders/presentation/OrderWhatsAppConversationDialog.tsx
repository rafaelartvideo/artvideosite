import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { adminPath } from "@/features/admin-shell/admin-routes";
import { WhatsAppBrandIcon } from "@/shared/ui/icons/WhatsAppBrandIcon";
import { useAuth } from "@/lib/auth";
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
  | { status: "ready"; conversationId: string; participating?: boolean; responsibleName?: string | null }
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
  serviceOrderId: string;
};

export function OrderWhatsAppConversationDialog({ open, onClose, organizationId, phone, customerName, serviceOrderId }: Props) {
  const { activeOrganizationId, hasPermission } = useAuth();
  const navigate = useNavigate();
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
        // The server verifies the OS/customer, contact phone, tenant, operator
        // permissions and active channel before sharing or joining a thread.
        const found = await operateUnionWhatsAppInbox(
          organizationId, crypto.randomUUID(), "os_join", { service_order_id: serviceOrderId },
        );
        if (cancelled) return;
        if (found.found && found.conversation_id) {
          set({ status: "ready", conversationId: found.conversation_id,
            participating: found.participating === true, responsibleName: found.responsible_name });
        } else {
          set({ status: "empty", message: found.can_start === false
            ? "O cliente não possui um WhatsApp válido para iniciar o atendimento."
            : "Este cliente ainda não possui uma conversa no WhatsApp da empresa.",
            canStart: found.can_start === true });
        }
      } catch (error) {
        set({ status: "error", message: systemErrorMessage(error, "Não foi possível abrir o atendimento WhatsApp.") });
      }
    })();

    return () => { cancelled = true; };
  }, [open, organizationId, phone, serviceOrderId, activeOrganizationId, canViewInbox]);

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
    </div> : state.status === "ready" ? <div className="flex h-full min-h-0 flex-col">
      {state.participating && <div role="status" className="flex shrink-0 items-center gap-2 border-b border-sky-200 bg-sky-50 px-4 py-2 text-xs text-sky-800 dark:border-sky-900 dark:bg-sky-950/45 dark:text-sky-200">
        <span className="h-2 w-2 shrink-0 rounded-full bg-sky-500" />
        <span>{state.responsibleName ? `Atendimento com ${state.responsibleName}.` : "Atendimento com outro operador."} Você entrou como <strong>Participando</strong>, sem alterar o responsável.</span>
      </div>}
      <div className="min-h-0 flex-1">
        <Suspense fallback={<div className="flex h-full items-center justify-center">
          <LoadingState text="Carregando conversa..." />
        </div>}>
          <EmbeddedWhatsAppConversation
            key={state.conversationId}
            embedded
            embeddedFullControls
            initialConversationId={state.conversationId}
            onBack={onClose}
            onConfigure={() => {
              onClose();
              navigate(adminPath("tools", "union-whatsapp", "canais"));
            }}
          />
        </Suspense>
      </div>
    </div> : <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
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
