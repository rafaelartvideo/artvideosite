import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { ExternalLink, PanelTop, Plus, X } from "lucide-react";
import { WhatsAppDraftConversation } from "./WhatsAppDraftConversation";
import { adminPath } from "@/features/admin-shell/admin-routes";
import { WhatsAppBrandIcon } from "@/shared/ui/icons/WhatsAppBrandIcon";
import { useAuth } from "@/lib/auth";
import { AdminButton, AdminDialog } from "@/shared/ui/admin/AdminLayout";
import { LoadingState, notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { operateUnionWhatsAppInbox, startUnionWhatsAppWithFirstMessage } from "@/features/whatsapp-channels/infrastructure/union-whatsapp-inbox.repository";
import { formatWhatsAppPhone, WhatsAppContactAvatar } from "./WhatsAppInboxVisuals";
import {
  addDetachedReattachListener, detachedWhatsAppOrderUrl, detachedWhatsAppPopupName,
  registerDetachedWhatsAppWindow, reuseDetachedWhatsAppWindow,
} from "./DetachedWhatsAppWindowManager";

const EmbeddedWhatsAppConversation = lazy(() =>
  import("@/features/whatsapp-channels/presentation/UnionWhatsAppInboxPage")
    .then(({ UnionWhatsAppInboxPage }) => ({ default: UnionWhatsAppInboxPage })),
);
// Compartilha o formulario, as regras e o fluxo de persistencia do modulo OS.
const EmbeddedNewOrder = lazy(() =>
  import("@/features/orders/presentation/TabOrders")
    .then(({ TabOrders }) => ({ default: TabOrders })),
);

type Recipient={kind:"registered"|"linked";name:string;phone:string;field?:"whatsapp"|"phone";
  conversation_id?:string;account_phone?:string;chat_jid?:string};
type State =
  | { status: "loading"; message?: string }
  | { status: "choosing"; recipients:Recipient[] }
  | { status: "ready"; conversationId: string; participating?: boolean; responsibleName?: string | null }
  | { status: "empty"; message: string; canStart: boolean;phone?:string;contactName?:string }
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
        preferredRecipient?: {kind:"registered"|"linked";phone:string;field?:"whatsapp"|"phone";conversation_id?:string};
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
type Props = {
  open: boolean;
  onClose: () => void;
  context: WhatsAppModalContext;
  detached?: boolean;
  onDetach?: (popup: Window) => void;
  onReintegrate?: (recipient: Recipient | null) => void;
};

export function WhatsAppConversationModal({ open, onClose, context, detached=false, onDetach, onReintegrate }: Props) {
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
  const orderId=source.kind==="order"?source.orderId:"";
  const [state, setState] = useState<State>({ status: "loading" });
  const [orderRecipients,setOrderRecipients] = useState<Recipient[]>([]);
  const [chosenRecipient,setChosenRecipient] = useState<Recipient|null>(null);
  const [starting, setStarting] = useState(false);
  const [embeddedReady, setEmbeddedReady] = useState(false);
  const [embeddedSlow, setEmbeddedSlow] = useState(false);
  // Do not hide the entire inbox forever if its readiness callback never fires.
  useEffect(() => {
    if (!open || state.status !== "ready" || embeddedReady) {
      setEmbeddedSlow(false);
      return;
    }
    const timer = window.setTimeout(() => setEmbeddedSlow(true), 12000);
    return () => window.clearTimeout(timer);
  }, [open, state.status, state.status === "ready" ? state.conversationId : "", embeddedReady]);
  const [startError, setStartError] = useState("");
  const startGateRef = useRef(false);
  // Retain the idempotency key across a retry of the same first message.
  const firstSendIdRef = useRef<{ key: string; id: string } | null>(null);
  const [newOrder, setNewOrder] = useState<{ customerId: string | null; key: string } | null>(null);
  const [preparingNewOrder, setPreparingNewOrder] = useState(false);
  const newOrderGateRef = useRef(false);

  const chooseOrderRecipient=useCallback(async(recipient:Recipient)=>{
    if(!open||!orderId||!canViewInbox||organizationId!==activeOrganizationId)return;
    setChosenRecipient(recipient);
    setState({status:"loading",message:"Abrindo a conversa selecionada..."});setEmbeddedReady(false);
    try{
      const found=await operateUnionWhatsAppInbox(organizationId,crypto.randomUUID(),"os_join",{
        service_order_id:orderId,
        ...(recipient.kind==="linked"
          ?{linked_conversation_id:recipient.conversation_id}
          :{registered_phone_field:recipient.field||"whatsapp"}),
      });
      if(found.found&&found.conversation_id){
        setState({status:"ready",conversationId:found.conversation_id,
          participating:found.participating===true,responsibleName:found.responsible_name});
      }else{
        setState({status:"empty",canStart:found.can_start===true,
          message:found.can_start
            ?"Este número ainda não possui conversa no WhatsApp da empresa."
            :"Não foi possível iniciar atendimento com este contato.",
          phone:recipient.phone,contactName:recipient.name});
      }
    }catch(error){
      setState({status:"error",
        message:systemErrorMessage(error,"Não foi possível abrir a conversa deste contato.")});
    }
  },[open,orderId,canViewInbox,organizationId,activeOrganizationId]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const set = (value: State) => { if (!cancelled) setState(value); };
    set({ status: "loading", message: source.kind==="order" ? "Consultando os números da OS..." : "Carregando atendimento..." });
    setOrderRecipients([]);
    setChosenRecipient(null);
    setEmbeddedReady(false);
    setStartError("");
    firstSendIdRef.current = null;

    if (organizationId !== activeOrganizationId || !canViewInbox) {
      set({ status: "unauthorized", message: "Você não possui acesso aos atendimentos WhatsApp desta empresa." });
      return () => { cancelled = true; };
    }

    if (source.kind==="conversation") {
      set({status:"ready",conversationId:source.conversationId});
      return () => { cancelled = true; };
    }
    if(source.kind==="order"){
      // Escolher uma pessoa ANTES de entrar na conversa. O backend valida
      // cada opção contra os números cadastrados ou a tabela de vínculos.
      void operateUnionWhatsAppInbox(organizationId,crypto.randomUUID(),
        "order_recipients",{service_order_id:source.orderId})
        .then(result=>{
          if(cancelled)return;
          const recipients=result.recipients||[];
          setOrderRecipients(recipients);
          // Não pedir escolha quando há apenas um número de destino.
          // A API retorna números normalizados e únicos, evitando repetir
          // o telefone do cadastro caso ele também tenha sido vinculado à OS.
          const preferred=source.preferredRecipient;
          const matching=preferred && recipients.find((item:Recipient)=>
            item.kind===preferred.kind && item.phone===preferred.phone &&
            (item.kind==="linked"
              ? item.conversation_id===preferred.conversation_id
              : item.field===preferred.field));
          if(matching)void chooseOrderRecipient(matching);
          else if(recipients.length>1)set({status:"choosing",recipients});
          else if(recipients.length===1)void chooseOrderRecipient(recipients[0]);
          else set({status:"empty",canStart:false,
            message:"Esta OS não possui número WhatsApp cadastrado ou vinculado."});
        }).catch(error=>{
          if(!cancelled)set({status:"error",
            message:systemErrorMessage(error,"Não foi possível consultar os números da OS.")});
        });
      return ()=>{cancelled=true;};
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
  }, [open, organizationId, phone, sourceKey, activeOrganizationId, canViewInbox,chooseOrderRecipient]);

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

  const sendFirstMessage = async (message: string) => {
    // Opening the draft never writes a conversation. Only an explicit send does.
    if (source.kind==="conversation" || startGateRef.current || state.status!=="empty" ||
        !state.canStart || !message.trim() || message.length>3900 ||
        organizationId!==activeOrganizationId || !canViewInbox)return;
    const number=phoneCandidates(state.phone||chosenRecipient?.phone||phone)[0];
    if(!number)return;
    const key=number+":"+message;
    if(firstSendIdRef.current?.key!==key)
      firstSendIdRef.current={key,id:crypto.randomUUID()};
    startGateRef.current=true;
    setStarting(true);
    setStartError("");
    try {
      // The server's "start" action already checks WuzAPI, and only creates
      // an attendance/protocol after it confirms the first message delivery.
      const conversationId=await startUnionWhatsAppWithFirstMessage(
        organizationId,number,(state.contactName||chosenRecipient?.name||customerName).trim(),
        message,firstSendIdRef.current.id,
      );
      firstSendIdRef.current=null;
      setEmbeddedReady(false);
      setState({status:"ready",conversationId});
    }catch(reason){
      setStartError(systemErrorMessage(reason,"Não foi possível enviar a primeira mensagem."));
    }finally{
      startGateRef.current=false;
      setStarting(false);
    }
  };

  const canDetach=source.kind==="order" && !detached && Boolean(onDetach)
    && organizationId===activeOrganizationId && canViewInbox;
  const detachOrder=()=>{
    if(!canDetach || source.kind!=="order")return;
    // A stable window name prevents duplicate floating windows for each OS.
    // Browsers can ignore "resizable=no" (an advisory feature, not a lock).
    // The actual window is opened synchronously inside the operator's click.
    const popup=window.open(detachedWhatsAppOrderUrl(context),
      detachedWhatsAppPopupName(),
      "popup=yes,width=1120,height=850,resizable=no,scrollbars=yes");
    if(!popup){
      notifyAdmin("O navegador bloqueou a janela. Permita pop-ups da Union World e tente novamente.","error");
      return;
    }
    onDetach?.(popup);
    popup.focus();
    onClose();
  };
  const headerActions=<>
    {canDetach && <AdminButton variant="secondary" size="sm" aria-label="Destacar janela"
      title="Abrir o Atendimento WhatsApp em uma janela independente"
      onClick={detachOrder}>
      <ExternalLink size={15}/> <span className="hidden sm:inline">Destacar janela</span>
    </AdminButton>}
    {detached && onReintegrate && <AdminButton variant="secondary" size="sm"
      title="Reintegrar o atendimento ao modal na OS"
      onClick={()=>onReintegrate(chosenRecipient)}>
      <PanelTop size={15}/> Reintegrar ao CRM
    </AdminButton>}
    {canCreateOrder && organizationId===activeOrganizationId && canViewInbox &&
      <AdminButton variant="secondary" size="sm"
        disabled={preparingNewOrder||Boolean(newOrder)}
        loading={preparingNewOrder} onClick={()=>void openNewOrder()}>
        <Plus size={15}/> Nova OS
      </AdminButton>}
  </>;
  const content=<>
    {state.status === "loading" ? <div className="flex h-full items-center justify-center">
      <LoadingState text={state.message || "Consultando números..."} />
    </div> : state.status === "choosing" ? <div className="flex min-h-0 h-full flex-col items-center overflow-y-auto px-4 py-6 sm:px-6">
      <div className="w-full max-w-2xl">
        <h3 className="text-base font-bold text-foreground">Escolha com quem falar sobre esta OS</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Selecione o número para abrir o atendimento. Cada contato mantém a própria conversa e seu histórico.
        </p>
        <div className="mt-5 grid gap-3">
          {state.recipients.map((recipient,index)=><button key={recipient.kind+":"+recipient.phone+":"+(recipient.conversation_id||recipient.field||index)}
            type="button" onClick={()=>void chooseOrderRecipient(recipient)}
            className="group flex w-full min-w-0 items-center gap-3 rounded-xl border border-border bg-card px-3 py-3.5 text-left transition-colors hover:border-primary hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 sm:px-4">
            <WhatsAppContactAvatar name={recipient.name} size="list"
              identity={recipient.account_phone&&recipient.chat_jid
                ? {organizationId,accountPhone:recipient.account_phone,chatJid:recipient.chat_jid,
                    conversationId:recipient.conversation_id||null}
                : null} />
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 truncate text-sm font-bold text-foreground">{recipient.name}</span>
                <span className={recipient.kind==="linked"
                  ?"shrink-0 rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary"
                  :"shrink-0 rounded-md bg-muted px-2 py-0.5 text-[10px] font-bold text-muted-foreground"}>
                  {recipient.kind==="linked" ? "Vinculado" : "Cadastro"}
                </span>
              </span>
              <span className="mt-1 block text-sm text-muted-foreground">{formatWhatsAppPhone(recipient.phone)}</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">{recipient.kind==="linked"
                ?"Número vinculado à OS" : recipient.field==="phone" ? "Telefone do cadastro" : "WhatsApp do cadastro"}</span>
            </span>
            <WhatsAppBrandIcon size={21} className="shrink-0 text-[#25D366]" />
          </button>)}
        </div>
      </div>
    </div> : state.status === "ready" ? <div className="flex h-full min-h-0 flex-col">
      {state.participating && <div role="status" className="flex shrink-0 items-center gap-2 border-b border-sky-200 bg-sky-50 px-4 py-2 text-xs text-sky-800 dark:border-sky-900 dark:bg-sky-950/45 dark:text-sky-200">
        <span className="h-2 w-2 shrink-0 rounded-full bg-sky-500" />
        <span>{state.responsibleName ? `Atendimento com ${state.responsibleName}.` : "Atendimento com outro operador."} Você entrou como <strong>Participando</strong>, sem alterar o responsável.</span>
      </div>}
      <div className="relative min-h-0 flex-1">
        {!embeddedReady && !embeddedSlow && <div role="status" aria-live="polite" className="absolute inset-0 z-10 flex items-center justify-center bg-card">
          <LoadingState text="Carregando atendimento..." />
        </div>}
        {embeddedSlow && !embeddedReady && <div role="status" className="absolute inset-x-0 top-0 z-20 border-b border-amber-300 bg-amber-50 px-3 py-2 text-center text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-100">O atendimento está demorando para carregar. Exibindo o módulo para permitir identificar o problema.</div>}
        <div className={`h-full min-h-0 ${embeddedReady || embeddedSlow ? "" : "invisible"}`}>
        <Suspense fallback={null}>
          <EmbeddedWhatsAppConversation
            key={state.conversationId}
            embedded
            embeddedFullControls
            detachedWindow={detached}
            initialConversationId={state.conversationId}
            onEmbeddedReady={setEmbeddedReady}
            onChangeRecipient={source.kind==="order" && orderRecipients.length>1
              ? ()=>{setEmbeddedReady(false);setChosenRecipient(null);setState({status:"choosing",recipients:orderRecipients});}
              : undefined}
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
    </div> : state.status === "empty" && state.canStart ? <WhatsAppDraftConversation
      organizationId={organizationId}
      phone={state.phone || chosenRecipient?.phone || phone}
      name={state.contactName || chosenRecipient?.name || customerName}
      starting={starting}
      error={startError}
      onEditMessage={()=>setStartError("")}
      onSend={sendFirstMessage}
      onChangeRecipient={source.kind==="order" && orderRecipients.length>1
        ? ()=>{firstSendIdRef.current=null;setChosenRecipient(null);setState({status:"choosing",recipients:orderRecipients});}
        : undefined}
    /> : <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="max-w-md text-sm text-muted-foreground">{state.message}</p>
      {source.kind==="order" && orderRecipients.length>0 && state.status==="error" && <AdminButton
        variant="secondary" size="sm" onClick={()=>setState({status:"choosing",recipients:orderRecipients})}>
        Voltar aos números
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
  </>;
  return detached
    ? <section className="admin-crm flex h-dvh min-h-0 w-full flex-col overflow-hidden bg-card text-foreground"
        data-whatsapp-detached-order={orderId}>
        <header className="flex min-h-14 shrink-0 flex-wrap items-center justify-between gap-2 border-b border-border bg-card px-3 py-2 sm:px-4">
          <div className="flex min-w-0 items-center gap-2">
            <span className="text-sm font-bold">Atendimento WhatsApp</span>
            <span className="hidden rounded-md bg-primary/10 px-2 py-1 text-[10px] font-semibold text-primary sm:inline-flex">
              Janela destacada
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {headerActions}
            <button type="button" aria-label="Fechar janela destacada"
              title="Fechar somente esta janela; não finalizar atendimento"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground">
              <X size={17}/>
            </button>
          </div>
        </header>
        <main className="min-h-0 flex-1 overflow-hidden">{content}</main>
      </section>
    : <AdminDialog
        open={open} onClose={onClose} title="Atendimento WhatsApp"
        draggable floating headerActions={headerActions}
        className="!h-[min(80dvh,760px)] !min-h-0 !w-[calc(100vw-1rem)] !max-w-[1080px] sm:!w-[calc(100vw-2rem)] max-md:!left-0 max-md:!right-0 max-md:!top-[var(--admin-shell-header-height,4rem)] max-md:!bottom-0 max-md:!h-[calc(100dvh-var(--admin-shell-header-height,4rem))] max-md:!max-h-none max-md:!w-screen max-md:!max-w-none max-md:!translate-x-0 max-md:!translate-y-0 max-md:!rounded-none max-md:!border-0 max-md:!shadow-none"
        bodyClassName="!flex !min-h-0 !flex-col !overflow-hidden !p-0">
        {content}
      </AdminDialog>;
}

/** Reusable WhatsApp launcher for verified OS, registration, customer and thread contexts. */
export function useWhatsAppConversationModal() {
  const [context,setContext]=useState<WhatsAppModalContext|null>(null);
  const openWhatsAppConversation=useCallback((next:WhatsAppModalContext)=>{
    // If the detached popup is alive, the OS toolbar always routes its
    // WhatsApp button to that same popup, even across OS route unmounts.
    if(next.source.kind==="order" && reuseDetachedWhatsAppWindow(next)){
      setContext(null);
      return;
    }
    setContext(next);
  },[]);
  const closeWhatsAppConversation=useCallback(()=>setContext(null),[]);
  const detachWhatsAppConversation=useCallback((popup:Window)=>{
    if(!context || context.source.kind!=="order")return;
    registerDetachedWhatsAppWindow(popup,context);
    setContext(null);
  },[context]);

  // Registered at the module-level window manager so its state survives
  // navigation to another OS. This hook only handles restoring the UI.
  useEffect(()=>addDetachedReattachListener(next=>setContext(next)),[]);

  return {
    isWhatsAppModalOpen:Boolean(context),
    openWhatsAppConversation,
    closeWhatsAppConversation,
    whatsAppModal:context ? <WhatsAppConversationModal
      key={context.source.kind==="conversation" ? context.source.conversationId
        : context.source.kind==="order" ? context.source.orderId
        : context.source.entityContactId || context.source.entityId || context.source.customerId}
      open context={context} onClose={closeWhatsAppConversation}
      onDetach={context.source.kind==="order" ? detachWhatsAppConversation : undefined}/> : null,
  };
}
