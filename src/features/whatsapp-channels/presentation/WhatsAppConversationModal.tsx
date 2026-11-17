import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { Plus } from "lucide-react";
import { adminPath } from "@/features/admin-shell/admin-routes";
import { WhatsAppBrandIcon } from "@/shared/ui/icons/WhatsAppBrandIcon";
import { useAuth } from "@/lib/auth";
import { AdminButton, AdminDialog } from "@/shared/ui/admin/AdminLayout";
import { LoadingState, notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { operateUnionWhatsAppInbox } from "@/features/whatsapp-channels/infrastructure/union-whatsapp-inbox.repository";

const EmbeddedWhatsAppConversation = lazy(() =>
  import("@/features/whatsapp-channels/presentation/UnionWhatsAppInboxPage")
    .then(({ UnionWhatsAppInboxPage }) => ({ default: UnionWhatsAppInboxPage })),
);
// Compartilha o formulario, as regras e o fluxo de persistencia do modulo OS.
const EmbeddedNewOrder = lazy(() =>
  import("@/features/orders/presentation/TabOrders")
    .then(({ TabOrders }) => ({ default: TabOrders })),
);

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

export type WhatsAppModalContext = {
  organizationId: string;
  source:
    | {
        kind: "order";
        orderId: string;
        customerId?: string;
        phone: string;
        customerName: string;
        documentOptions?: Array<{id:string;label:string}>;
        prepareDocument?: (templateId:string)=>Promise<File>;
      }
    | {
        kind: "contact";
        phone: string;
        customerName: string;
        entityId?: string;
        entityContactId?: string;
        customerId?: string;
      }
    | { kind: "conversation"; conversationId: string };
};
type Props = { open: boolean; onClose: () => void; context: WhatsAppModalContext };

export function WhatsAppConversationModal({ open, onClose, context }: Props) {
  const { organizationId, source } = context;
  const phone = source.kind==="conversation" ? "" : source.phone;
  const customerName = source.kind==="conversation" ? "" : source.customerName;
  // Depender do objeto source reinicializava o modal quando o painel flutuante
  // atualizava sua lista. Identidade da conversa é o que determina o join.
  const sourceKey = source.kind==="conversation"
    ? "conversation:"+source.conversationId
    : source.kind==="order"
      ? "order:"+source.orderId+":"+(source.customerId||"")
      : "contact:"+(source.entityId||"")+":"+(source.entityContactId||"")+":"+(source.customerId||"");
  const { activeOrganizationId, hasPermission } = useAuth();
  const navigate = useNavigate();
  const canViewInbox = hasPermission("whatsapp.inbox.view");
  const canCreateOrder = hasPermission("orders.create");
  const [state, setState] = useState<State>({ status: "loading" });
  const [starting, setStarting] = useState(false);
  const [embeddedReady, setEmbeddedReady] = useState(false);
  const [startError, setStartError] = useState("");
  const startGateRef = useRef(false);
  const [newOrder, setNewOrder] = useState<{ customerId: string | null; key: string } | null>(null);
  const [preparingNewOrder, setPreparingNewOrder] = useState(false);
  const newOrderGateRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const set = (value: State) => { if (!cancelled) setState(value); };
    set({ status: "loading" });
    setEmbeddedReady(false);
    setStartError("");

    if (organizationId !== activeOrganizationId || !canViewInbox) {
      set({ status: "unauthorized", message: "Você não possui acesso aos atendimentos WhatsApp desta empresa." });
      return () => { cancelled = true; };
    }

    if (source.kind==="conversation") {
      set({status:"ready",conversationId:source.conversationId});
      return () => { cancelled = true; };
    }
    const candidates = phoneCandidates(phone);
    if (!candidates.length) {
      set({ status: "empty", message: "O cliente não possui um WhatsApp válido para localizar o histórico.", canStart: false });
      return () => { cancelled = true; };
    }

    void (async () => {
      try {
        // Resolve the registered contact on the server before sharing a thread.
        // The browser's phone is never used to authorize access.
        const found = await operateUnionWhatsAppInbox(
          organizationId, crypto.randomUUID(),
          source.kind==="order" ? "os_join" : "contact_join",
          source.kind==="order" ? { service_order_id: source.orderId } : {
            entity_id: source.entityId,
            entity_contact_id: source.entityContactId,
            customer_id: source.customerId,
          },
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
  }, [open, organizationId, phone, sourceKey, activeOrganizationId, canViewInbox]);

  const openNewOrder = async () => {
    if (!canCreateOrder || !canViewInbox || organizationId !== activeOrganizationId ||
        newOrderGateRef.current || newOrder) return;
    newOrderGateRef.current = true;
    setPreparingNewOrder(true);
    try {
      // Priorizar o vinculo exato da OS/cadastro, sem inferir apenas pelo telefone.
      let customerId = source.kind === "conversation" ? null : source.customerId || null;
      if (!customerId && state.status === "ready") {
        try {
          const found = await operateUnionWhatsAppInbox(
            organizationId, state.conversationId, "customer_match",
          );
          // Nunca vincular automaticamente um cliente quando houver ambiguidade.
          if (!found.ambiguous) customerId = found.customer?.id || null;
        } catch {
          // Sem vinculo confirmado, a Nova OS conserva a busca manual de clientes.
        }
      }
      // Importar antes de abrir evita janela vazia durante o primeiro carregamento.
      await import("@/features/orders/presentation/TabOrders");
      setNewOrder({ customerId, key: crypto.randomUUID() });
    } catch (error) {
      notifyAdmin(systemErrorMessage(error, "Não foi possível abrir a Nova OS."), "error");
    } finally {
      newOrderGateRef.current = false;
      setPreparingNewOrder(false);
    }
  };

  const startConversation = async () => {
    if (source.kind==="conversation" || startGateRef.current || state.status !== "empty" || !state.canStart ||
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

  return <>
  <AdminDialog
    open={open}
    onClose={onClose}
    title="Atendimento WhatsApp"
    draggable
    floating
    headerActions={canCreateOrder && organizationId === activeOrganizationId && canViewInbox
      ? <AdminButton variant="secondary" size="sm" disabled={preparingNewOrder || Boolean(newOrder)}
          loading={preparingNewOrder} onClick={() => void openNewOrder()}>
          <Plus size={15}/> Nova OS
        </AdminButton>
      : undefined}
    className="!h-[min(80dvh,760px)] !min-h-0 !w-[calc(100vw-1rem)] !max-w-[1080px] sm:!w-[calc(100vw-2rem)] max-md:!left-0 max-md:!right-0 max-md:!top-[var(--admin-shell-header-height,4rem)] max-md:!bottom-0 max-md:!h-[calc(100dvh-var(--admin-shell-header-height,4rem))] max-md:!max-h-none max-md:!w-screen max-md:!max-w-none max-md:!translate-x-0 max-md:!translate-y-0 max-md:!rounded-none max-md:!border-0 max-md:!shadow-none"
    bodyClassName="!flex !min-h-0 !flex-col !overflow-hidden !p-0"
  >
    {state.status === "loading" ? <div className="flex h-full items-center justify-center">
      <LoadingState text="Carregando atendimento..." />
    </div> : state.status === "ready" ? <div className="flex h-full min-h-0 flex-col">
      {state.participating && <div role="status" className="flex shrink-0 items-center gap-2 border-b border-sky-200 bg-sky-50 px-4 py-2 text-xs text-sky-800 dark:border-sky-900 dark:bg-sky-950/45 dark:text-sky-200">
        <span className="h-2 w-2 shrink-0 rounded-full bg-sky-500" />
        <span>{state.responsibleName ? `Atendimento com ${state.responsibleName}.` : "Atendimento com outro operador."} Você entrou como <strong>Participando</strong>, sem alterar o responsável.</span>
      </div>}
      <div className="relative min-h-0 flex-1">
        {!embeddedReady && <div role="status" aria-live="polite" className="absolute inset-0 z-10 flex items-center justify-center bg-card">
          <LoadingState text="Carregando atendimento..." />
        </div>}
        <div className={`h-full min-h-0 ${embeddedReady ? "" : "invisible"}`}>
        <Suspense fallback={null}>
          <EmbeddedWhatsAppConversation
            key={state.conversationId}
            embedded
            embeddedFullControls
            initialConversationId={state.conversationId}
            onEmbeddedReady={setEmbeddedReady}
            orderDocumentOptions={source.kind==="order" ? source.documentOptions : undefined}
            onPrepareOrderDocument={source.kind==="order" ? source.prepareDocument : undefined}
            onBack={onClose}
            onConfigure={() => {
              onClose();
              navigate(adminPath("tools", "union-whatsapp", "configuracoes"));
            }}
          />
        </Suspense>
        </div>
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
  {newOrder && <Suspense fallback={null}>
    <EmbeddedNewOrder
      key={newOrder.key}
      initialOrderId="new"
      initialCustomerId={newOrder.customerId}
      organizationIdOverride={organizationId}
      detailOnly
      embeddedCreate
      onEmbeddedClose={() => setNewOrder(null)}
      onEmbeddedCreated={() => {
        setNewOrder(null);
        notifyAdmin("OS criada com sucesso.", "success");
      }}
    />
  </Suspense>}
  </AdminDialog>
  </>;
}

/** Reusable WhatsApp launcher for verified OS, registration, customer and thread contexts. */
export function useWhatsAppConversationModal() {
  const [context,setContext]=useState<WhatsAppModalContext|null>(null);
  const openWhatsAppConversation=useCallback((next:WhatsAppModalContext)=>setContext(next),[]);
  const closeWhatsAppConversation=useCallback(()=>setContext(null),[]);
  return {
    isWhatsAppModalOpen:Boolean(context),
    openWhatsAppConversation,
    closeWhatsAppConversation,
    whatsAppModal:context ? <WhatsAppConversationModal
      key={context.source.kind==="conversation" ? context.source.conversationId
        : context.source.kind==="order" ? context.source.orderId
        : context.source.entityContactId || context.source.entityId || context.source.customerId}
      open context={context} onClose={closeWhatsAppConversation}/> : null,
  };
}

