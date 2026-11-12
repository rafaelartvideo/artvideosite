import { AdminSubsectionTabs } from "@/shared/ui/admin/AdminSubsectionTabs";
import { AdminWorkspaceSkeleton } from "@/shared/ui/admin/AdminWorkspaceSkeleton";
import { TopTableScrollbar } from "@/shared/ui/admin/TopTableScrollbar";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, CheckCircle2, CircleAlert, LoaderCircle, Facebook, Instagram, Plus, RefreshCw, ShieldCheck, Trash2, Unplug } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { AdminButton, AdminCard, AdminDialog, AdminStickyToolbar, PageHeader } from "@/shared/ui/admin/AdminLayout";
import { LoadingSpinner, StatusBadge, notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import { operateWhatsAppChannel, type WhatsAppChannel } from "../infrastructure/whatsapp-channels.repository";
import { WhatsAppOperationsSettings } from "./WhatsAppOperationsSettings";
import { WhatsAppRolePermissions } from "./WhatsAppRolePermissions";
import { WhatsAppQuickRepliesSettings } from "./WhatsAppQuickRepliesSettings";
import type { WhatsAppSettingsInlinePaneChange } from "./WhatsAppSettingsInlinePane";

const dateLabel = (value: string | null) =>
  value ? new Date(value).toLocaleString("pt-BR") : "Ainda não verificado";

// The provider may return a full JID or digits with/without the Brazilian country code.
function formatPhone(value: string | null): string {
  if (!value) return "—";
  const digits = value.split("@")[0].replace(/\D/g, "");
  const national = digits.startsWith("55") && (digits.length === 12 || digits.length === 13)
    ? digits.slice(2)
    : digits.length === 10 || digits.length === 11 ? digits : null;
  if (national) {
    const ddd = national.slice(0, 2);
    const subscriber = national.slice(2);
    return `+55 (${ddd}) ${subscriber.slice(0, -4)}-${subscriber.slice(-4)}`;
  }
  return digits ? `+${digits}` : "—";
}

function WhatsAppIcon() {
  return <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.966-.273-.099-.471-.149-.67.149-.198.297-.768.966-.94 1.164-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.76-1.653-2.057-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.173.198-.298.297-.496.099-.198.05-.372-.025-.52-.074-.15-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.01-.372-.012-.57-.012s-.52.074-.793.372-1.04 1.016-1.04 2.479 1.065 2.875 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.71.306 1.263.489 1.695.625.712.226 1.36.194 1.872.118.571-.085 1.758-.718 2.006-1.412.248-.694.248-1.289.173-1.412-.074-.124-.272-.198-.57-.347zm-5.43 7.287h-.003a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.999-3.648-.236-.374a9.86 9.86 0 01-1.51-5.262c.002-5.442 4.429-9.87 9.874-9.87a9.81 9.81 0 016.986 2.895 9.81 9.81 0 012.89 6.99c-.002 5.444-4.43 9.87-9.866 9.87zm8.405-18.284A11.8 11.8 0 0012.04 0C5.495 0 .169 5.325.166 11.87a11.8 11.8 0 001.586 5.925L.064 23.968l6.318-1.657a11.86 11.86 0 005.653 1.44h.005c6.545 0 11.872-5.325 11.875-11.87a11.81 11.81 0 00-3.468-8.396z"/>
  </svg>;
}

type ChannelSection = "configuration" | "connections" | "departments" | "queues" | "operators" | "permissions" | "quick-replies";
const channelSections: Array<{ id: ChannelSection; label: string }> = [
  { id: "configuration", label: "Configuração do canal" },
  { id: "connections", label: "Conexões" },
  { id: "departments", label: "Departamentos" },
  { id: "queues", label: "Filas" },
  { id: "operators", label: "Operadores" },
  { id: "permissions", label: "Perfis e Permissões" },
  { id: "quick-replies", label: "Mensagens rápidas" },
];

// Exibe sucesso e erro no balão global do CRM (sucesso: 3s; erro: 6s).
const showSuccess = (message: string) => { if (message) notifyAdmin(message, "success"); };
const showError = (message: string) => { if (message) notifyAdmin(message, "error"); };

export function WhatsAppChannelsPage({ onBack, onOpenInbox, initialSection = "configuration", embeddedSection, onSectionChange, createConnectionRequest = 0, onCanCreateChange, footerTarget, onInlinePaneChange }: {
  onBack: () => void; onOpenInbox?: () => void; initialSection?: ChannelSection;
  embeddedSection?: ChannelSection; onSectionChange?: (section:ChannelSection)=>void;
  createConnectionRequest?: number; onCanCreateChange?: (ready:boolean)=>void;
  footerTarget?: HTMLElement|null; onInlinePaneChange?: WhatsAppSettingsInlinePaneChange;
}) {
  const { activeOrganizationId, hasPermission } = useAuth();
  const canView = hasPermission("settings.channels.view") || hasPermission("settings.channels.manage") || hasPermission("settings.channels.delete");
  const canManage = hasPermission("settings.channels.manage");
  const canDelete = hasPermission("settings.channels.delete");
  const [section, setSection] = useState<ChannelSection>(embeddedSection || initialSection);
  const [settingsCreateRequest, setSettingsCreateRequest] = useState(0);
  const previousConnectionCreateRequest = useRef(createConnectionRequest);
  useEffect(() => {
    if (previousConnectionCreateRequest.current === createConnectionRequest) return;
    previousConnectionCreateRequest.current = createConnectionRequest;
    if (embeddedSection === "connections") setCreateConnectionOpen(true);
  }, [createConnectionRequest, embeddedSection]);
  const [channel, setChannel] = useState<WhatsAppChannel | null>(null);
  const [channels, setChannels] = useState<WhatsAppChannel[]>([]);
  const channelRef = useRef<WhatsAppChannel | null>(null);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<string | null>(null);
  const [qrOpen, setQrOpen] = useState(false);
  const [createConnectionOpen, setCreateConnectionOpen] = useState(false);
  const [creatingWhatsApp, setCreatingWhatsApp] = useState(false);
  const [connectionName, setConnectionName] = useState("");
  const registerInFlight = useRef(false);
  const [statusError, setStatusError] = useState("");
  const [qr, setQr] = useState<string | null>(null);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<WhatsAppChannel | null>(null);
  const [confirmSwitch, setConfirmSwitch] = useState(false);
  const statusInFlight = useRef(false);
  const qrInFlight = useRef(false);

  useEffect(() => { channelRef.current = channel; }, [channel]);
  // Falhas de sincronização são notificações, não avisos fixos dentro da tabela.
  // O texto é mantido no estado para não repetir o mesmo erro a cada polling.
  useEffect(() => { if (statusError) showError(statusError); }, [statusError]);

  const applyChannel = useCallback((next: WhatsAppChannel) => {
    const previous = channelRef.current;
    channelRef.current = next;
    setChannel(next);
    setChannels(prev=>prev.some(item=>item.id===next.id)
      ?prev.map(item=>item.id===next.id?next:item):[...prev,next]);
    if (next.state === "connected") {
      setQrOpen(false);
      setQr(null);
      setStatusError("");
      if (previous?.state !== "connected") {
        
        showSuccess(next.webhook_ready ? "WhatsApp conectado e recebimento ativo." : "Número conectado. Configurando o recebimento automaticamente.");
      }
    }
  }, []);

  const load = useCallback(async () => {
    if (!activeOrganizationId || !canView) {
      channelRef.current = null;
      setChannel(null);
      setChannels([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    
    try {
      const result = await operateWhatsAppChannel(activeOrganizationId, "list");
      const all=result.channels||(result.channel?[result.channel]:[]);
      setChannels(all);
      channelRef.current = result.channel ?? null;
      setChannel(result.channel ?? null);
    } catch (e) {
      showError(systemErrorMessage(e, "Não foi possível carregar os canais."));
    } finally {
      setLoading(false);
    }
  }, [activeOrganizationId, canView]);

  useEffect(() => {
    channelRef.current = null;
    setChannel(null);
    setChannels([]);
    setQr(null);
    setQrOpen(false);
    setCreateConnectionOpen(false);
    setCreatingWhatsApp(false);
    setConnectionName("");
    setStatusError("");
    setConfirmLogout(false);
    setDeleteTarget(null);
    setConfirmSwitch(false);
    void load();
  }, [load]);

  // Poll the provider only when connected or actively pairing. When the
  // connection is paused or logged out, do not schedule ANY WuzAPI status
  // checks; a user-initiated reconnect resumes the state machine.
  useEffect(() => {
    if (!activeOrganizationId || !channel?.id || !canView ||
      (channel.state!=="connected" && channel.state!=="connecting"))return;
    const org = activeOrganizationId;
    const connectionId = channel.id;
    let cancelled = false;
    let timer: number | undefined;
    let failures = 0;
    const schedule = (delay: number) => {
      if (!cancelled) timer = window.setTimeout(() => { void tick(); }, delay);
    };
    const tick = async () => {
      if (cancelled) return;
      if (document.visibilityState !== "visible" || statusInFlight.current) {
        schedule(5000);
        return;
      }
      statusInFlight.current = true;
      try {
        const result = await operateWhatsAppChannel(org, "status", connectionId);
        if (cancelled) return;
        failures = 0;
        setStatusError("");
        if (result.channel) applyChannel(result.channel);
      } catch (e) {
        if (cancelled) return;
        failures += 1;
        if (failures >= 2) {
          setStatusError(systemErrorMessage(e, "A consulta do WhatsApp falhou. Vamos tentar novamente automaticamente."));
        }
      } finally {
        statusInFlight.current = false;
        const currentState = channelRef.current?.state;
        if(currentState==="connected" || currentState==="connecting") {
          const healthyDelay = currentState === "connecting" ? 5000 : 30000;
          const retryDelay = failures > 0
            ? Math.min(120000, 15000 * (2 ** Math.min(failures - 1, 3)))
            : healthyDelay;
          schedule(retryDelay);
        }
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        if (timer !== undefined) window.clearTimeout(timer);
        schedule(200);
      }
    };
    void tick();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [activeOrganizationId, channel?.id, channel?.state, canView, applyChannel]);

  // Refresh the QR less often than the connection status. The QR can expire;
  // a failed QR retrieval must never stop the status poll.
  useEffect(() => {
    if (!qrOpen || !activeOrganizationId || !channel?.id || !canManage) return;
    let cancelled = false;
    let qrUnavailableCount = 0;
    let automaticReconnects = 0;
    const org = activeOrganizationId;
    const id = channel.id;
    let timer: number | undefined;
    const schedule = (delay: number) => {
      if (!cancelled) timer = window.setTimeout(() => { void refresh(); }, delay);
    };
    const refresh = async () => {
      if (cancelled) return;
      if (document.visibilityState !== "visible" || qrInFlight.current) {
        schedule(15000);
        return;
      }
      qrInFlight.current = true;
      try {
        const result = await operateWhatsAppChannel(org, "qr", id);
        if (cancelled) return;
        if (result.qr) {
          qrUnavailableCount = 0;
          setQr(result.qr);
        }
      } catch {
        // WuzAPI stops the pairing channel when its QR expires. Calling
        // /session/qr again cannot revive it; verify the provider state first.
        qrUnavailableCount += 1;
        if (!cancelled && automaticReconnects < 2) {
          try {
            const status = await operateWhatsAppChannel(org, "status", id);
            if (cancelled) return;
            if (status.channel) applyChannel(status.channel);
            if (status.logged_in) return;
            if (status.channel?.state === "disconnected") {
              // Only restart an explicitly disconnected channel. Keep the
              // saved WuzAPI credentials and never force a logout.
              automaticReconnects += 1;
              const restarted = await operateWhatsAppChannel(org, "connect", id);
              if (cancelled) return;
              if (restarted.channel) applyChannel(restarted.channel);
              if (restarted.logged_in) return;
              const next = await operateWhatsAppChannel(org, "qr", id);
              if (cancelled) return;
              if (next.qr) {
                setQr(next.qr);
                qrUnavailableCount = 0;
              }
            }
          } catch {
            // Network/provider trouble still uses the bounded retry delay.
          }
        }
        if (!cancelled && qrUnavailableCount >= 2 &&
            channelRef.current?.state !== "connected") {
          setQr(null);
        }
      } finally {
        qrInFlight.current = false;
        if (!cancelled) {
          const delay = qrUnavailableCount === 0
            ? 15000
            : Math.min(120000, 15000 * (2 ** Math.min(qrUnavailableCount - 1, 3)));
          schedule(delay);
        }
      }
    };
    schedule(15000);
    return () => {
      cancelled = true;
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [qrOpen, activeOrganizationId, channel?.id, canManage]);

  const perform = useCallback(async (operation: "activate" | "status" | "qr" | "disconnect" | "logout" | "webhook_setup", connectionId?:string) => {
    if (!activeOrganizationId || (!canManage && operation !== "status") || action) return;
    setAction(operation);
    
    if (operation !== "status") 
    try {
      const result = await operateWhatsAppChannel(activeOrganizationId, operation, connectionId || channelRef.current?.id);
      if (result.channel) applyChannel(result.channel);
      if (operation === "qr") setQr(result.qr || null);
      if (operation === "activate") { showSuccess("WhatsApp ativado. Agora basta conectar seu número."); setSection("connections"); }
      if (operation === "webhook_setup") showSuccess("Recebimento autenticado por HMAC configurado. Envie uma mensagem de outro número para testar a entrega.");
      if (operation === "disconnect") {
        setQr(null);
        setQrOpen(false);
        setConfirmLogout(false);
        setStatusError("");
        showSuccess("WhatsApp desconectado. Sessão preservada: use Reconectar para voltar sem QR Code.");
      }
      if (operation === "logout") {
        setQr(null);
        setQrOpen(false);
        setConfirmSwitch(false);
        setStatusError("");
        showSuccess("Sessão encerrada. Para conectar outro número, use Nova conexão e escaneie o QR Code.");
      }
      if (operation === "status") setStatusError("");
    } catch (e) {
      showError(systemErrorMessage(e, "Não foi possível comunicar com o WhatsApp."));
    } finally {
      setAction(null);
    }
  }, [activeOrganizationId, action, canManage, applyChannel]);

  const openQr = async (target?:WhatsAppChannel) => {
    const chosen=target||channelRef.current;
    if (!activeOrganizationId || !chosen || !canManage || action) return;
    channelRef.current=chosen;
    setChannel(chosen);
    
    setStatusError("");
    
    setQr(null);
    setQrOpen(true);
    setAction("connect");
    try {
      // Explicitly connect before fetching /session/qr. If the session was
      // already paired on the phone, status is authoritative: don't log out.
      const connection = await operateWhatsAppChannel(activeOrganizationId, "connect", chosen.id);
      if (connection.channel) applyChannel(connection.channel);
      if (connection.logged_in) {
        showSuccess("Sessão reconectada. O mesmo número e seus atendimentos foram recuperados.");
        return;
      }
      try {
        const code = await operateWhatsAppChannel(activeOrganizationId, "qr", chosen.id);
        setQr(code.qr || null);
      } catch {
        // A retained session can reconnect after /session/connect returns.
        // Don't abort the entire flow on a temporary unavailable QR.
        setQr(null);
        showSuccess("Conexão iniciada. Aguardando a sessão ou um QR Code válido.");
      }
    } catch (e) {
      showError(systemErrorMessage(e, "Não foi possível iniciar o QR Code."));
      setQrOpen(false);
    } finally {
      setAction(null);
    }
  };

  const addConnection = async () => {
    const label=connectionName.trim().replace(/\s+/g," ");
    if(!activeOrganizationId || !canManage || action || registerInFlight.current ||
      channels.length>=3 || !creatingWhatsApp || label.length<2)return;
    registerInFlight.current=true;
    setAction("register");
    try{
      const result=await operateWhatsAppChannel(activeOrganizationId,"register",undefined,label);
      const activeConnection=channels.find(item=>item.state==="connected" || item.state==="connecting");
      if(result.channels)setChannels(result.channels);
      // Cadastrar uma sessão em espera não deve trocar a sessão ativa da tela
      // nem interromper a verificação periódica do número já conectado.
      if(result.channel && !activeConnection){channelRef.current=result.channel;setChannel(result.channel);}
      const hasOtherActive=Boolean(activeConnection);
      setCreateConnectionOpen(false);
      setCreatingWhatsApp(false);
      setConnectionName("");
      setSection("connections");
      showSuccess(hasOtherActive
        ? `Sessão "${label}" criada. Desconecte a conexão atual antes de conectar esse número.`
        : `Sessão "${label}" criada. Clique em Conectar para ler o QR Code.`);
    }catch(e){
      showError(systemErrorMessage(e,"Não foi possível cadastrar a sessão de WhatsApp."));
    }finally{
      registerInFlight.current=false;
      setAction(null);
    }
  };

  const deleteConnection = async () => {
    if (!activeOrganizationId || !canDelete || !deleteTarget || action) return;
    setAction("delete");
    try {
      const result = await operateWhatsAppChannel(activeOrganizationId, "delete", deleteTarget.id);
      const remaining = result.channels || channels.filter(item => item.id !== deleteTarget.id);
      setChannels(remaining);
      const primary = remaining.find(item => item.state === "connected" || item.state === "connecting") || remaining[0] || null;
      channelRef.current = primary;
      setChannel(primary);
      setQr(null);
      setQrOpen(false);
      setStatusError("");
      setDeleteTarget(null);
      showSuccess("Conexão removida definitivamente.");
    } catch (error) {
      showError(systemErrorMessage(error, "Não foi possível excluir a conexão."));
    } finally {
      setAction(null);
    }
  };

  const closeCreateConnection=()=>{
    if(action==="register")return;
    setCreateConnectionOpen(false);
    setCreatingWhatsApp(false);
    setConnectionName("");
  };
  useEffect(() => {
    if (embeddedSection === "connections") {
      onCanCreateChange?.(canManage && !loading && Boolean(channel && channel.state !== "not_connected") &&
        channels.length < 3 && !Boolean(action));
    }
  }, [embeddedSection, onCanCreateChange, canManage, loading, channel, channels.length, action]);

  const inlineStage=embeddedSection ? (
    createConnectionOpen ? (action==="register" ? "connection-progress" :
      creatingWhatsApp ? "connection-form" : "connection-provider") :
    qrOpen ? "qr" : deleteTarget ? "delete" : confirmLogout ? "disconnect" :
    confirmSwitch ? "switch" : null
  ) : null;
  const closeInlineStage=()=>{
    if(action==="register" || action==="delete" || action==="disconnect" || action==="logout")return;
    if(createConnectionOpen){
      if(creatingWhatsApp){setCreatingWhatsApp(false);return;}
      closeCreateConnection();return;
    }
    if(qrOpen){setQrOpen(false);setQr(null);return;}
    if(deleteTarget){setDeleteTarget(null);return;}
    if(confirmLogout){setConfirmLogout(false);return;}
    if(confirmSwitch){setConfirmSwitch(false);}
  };
  useLayoutEffect(()=>{
    if(!embeddedSection || !onInlinePaneChange)return;
    if(!inlineStage){onInlinePaneChange(null);return;}
    const details={
      "connection-progress":{title:"Criando conexão",description:"Preparando a nova sessão do WhatsApp.",compact:true},
      "connection-provider":{title:"Nova conexão",description:"Selecione a rede social que deseja conectar.",compact:true},
      "connection-form":{title:"Nova conexão",description:"Informe o nome para identificar a sessão.",compact:true},
      "qr":{title:"Conectar número",description:"No WhatsApp, acesse Aparelhos conectados e leia o QR Code.",compact:true},
      "delete":{title:"Excluir conexão permanentemente?",description:deleteTarget?.display_name || "Confirme a exclusão da sessão.",compact:true},
      "disconnect":{title:"Desconectar WhatsApp?",description:"A sessão e o número permanecerão vinculados.",compact:true},
      "switch":{title:"Trocar o número do WhatsApp?",description:"O número atual será desconectado.",compact:true},
    }[inlineStage];
    onInlinePaneChange({key:inlineStage,...details,
      blocked:["register","delete","disconnect","logout"].includes(action||"")},closeInlineStage);
  },[embeddedSection,inlineStage,deleteTarget?.display_name,action,onInlinePaneChange]);

  if (!canView) return <div className="p-5 text-sm text-muted-foreground">Você não possui permissão para visualizar canais de atendimento nesta empresa.</div>;

  const enabled = Boolean(channel && channel.state !== "not_connected");
  const connected = channels.some(item=>item.state==="connected");
  const receiving = channels.some(item=>item.state==="connected" && item.webhook_ready);

  const canStartConnection = canManage && enabled && channels.length<3 && !Boolean(action);
  const anotherActive=(id:string)=>channels.some(c=>c.id!==id &&
    (c.state==="connected" || c.state==="connecting"));

  // No módulo de Atendimentos, o formulário ocupa a MESMA instância do modal.
  // As janelas independentes abaixo permanecem apenas para o uso como página.
  if(embeddedSection && inlineStage){
    const cancel=<AdminButton variant="secondary" disabled={Boolean(action)} onClick={closeInlineStage}>Cancelar</AdminButton>;
    const actions=inlineStage==="connection-form" ? <>
      {cancel}
      <AdminButton disabled={Boolean(action)||connectionName.trim().length<2}
        loading={action==="register"} onClick={()=>void addConnection()}>Criar sessão</AdminButton>
    </> : inlineStage==="connection-progress" ? <AdminButton disabled>Preparando...</AdminButton>
      : inlineStage==="delete" ? <>
        {cancel}
        <AdminButton variant="danger" disabled={Boolean(action)} loading={action==="delete"}
          onClick={()=>void deleteConnection()}><Trash2 size={15}/> Excluir definitivamente</AdminButton>
      </> : inlineStage==="disconnect" ? <>
        {cancel}
        <AdminButton variant="danger" disabled={Boolean(action)} loading={action==="disconnect"}
          onClick={()=>void perform("disconnect")}>Desconectar</AdminButton>
      </> : inlineStage==="switch" ? <>
        {cancel}
        <AdminButton variant="danger" disabled={Boolean(action)} loading={action==="logout"}
          onClick={()=>void perform("logout")}>Encerrar sessão</AdminButton>
      </> : inlineStage==="qr" ? <AdminButton variant="secondary" onClick={closeInlineStage}>Fechar QR Code</AdminButton>
      : null;
    return <div className="min-w-0 space-y-4" data-whatsapp-inline-stage={inlineStage}>
      {inlineStage==="connection-progress" ?
        <div role="status" aria-live="polite" aria-busy="true"
          className="flex min-h-48 flex-col items-center justify-center gap-3 px-3 py-8 text-center">
          <p className="text-sm font-semibold">Criando sessão de WhatsApp...</p>
          <LoadingSpinner size="md"/>
          <p className="text-xs text-muted-foreground">Preparando a conexão {connectionName.trim()}.</p>
        </div>
      : inlineStage==="connection-form" ?
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/20 px-4 py-3">
            <span className="rounded-lg bg-emerald-500/10 p-2 text-emerald-600"><WhatsAppIcon/></span>
            <div><p className="text-sm font-bold">WhatsApp</p>
              <p className="text-xs text-muted-foreground">Nome de identificação da sessão</p></div>
          </div>
          <label className="block text-sm font-semibold">
            Nome da sessão <span className="text-red-600">*</span>
            <input autoFocus type="text" maxLength={80} value={connectionName}
              onChange={event=>setConnectionName(event.target.value)}
              onKeyDown={event=>{if(event.key==="Enter"){event.preventDefault();void addConnection();}}}
              placeholder="Ex.: Atendimento principal"
              className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-normal outline-none focus:border-primary"/>
          </label>
          {channels.some(item=>item.state==="connected"||item.state==="connecting") &&
            <p className="text-xs text-muted-foreground">Desconecte a sessão ativa antes de conectar o novo número.</p>}
        </div>
      : inlineStage==="connection-provider" ?
        <div className="grid gap-3 sm:grid-cols-3">
          <button type="button" disabled={!canStartConnection}
            onClick={()=>{setCreatingWhatsApp(true);setConnectionName("");}}
            className="flex min-h-32 flex-col items-center justify-center gap-2 rounded-xl border border-primary/35 bg-primary/10 px-4 py-5 text-primary hover:border-primary hover:bg-primary/15">
            <WhatsAppIcon/><span className="text-sm font-bold">WhatsApp</span>
            <span className="text-xs">Disponível</span>
          </button>
          <div className="flex min-h-32 flex-col items-center justify-center gap-2 rounded-xl border border-border bg-muted/25 p-4 text-muted-foreground opacity-65">
            <Instagram size={19}/><span className="text-sm font-semibold">Instagram</span><span className="text-xs">Em breve</span>
          </div>
          <div className="flex min-h-32 flex-col items-center justify-center gap-2 rounded-xl border border-border bg-muted/25 p-4 text-muted-foreground opacity-65">
            <Facebook size={19}/><span className="text-sm font-semibold">Facebook</span><span className="text-xs">Em breve</span>
          </div>
        </div>
      : inlineStage==="qr" ?
        <div className="flex min-h-[300px] flex-col items-center justify-center gap-4 p-3">
          {qr ? <img src={qr} width={240} height={240} alt="QR Code para conectar WhatsApp"
            className="rounded-lg bg-white p-3"/> :
            <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground">
              <LoaderCircle size={40} className="animate-spin text-primary motion-reduce:animate-none"/>
              <span>{action==="connect"?"Gerando QR Code...":"Aguardando QR Code ou confirmação..."}</span>
            </div>}
          <p className="max-w-sm text-center text-xs leading-relaxed text-muted-foreground">
            Após escanear, a Union reconhece a conexão e ativa o recebimento automaticamente.
          </p>
        </div>
      : inlineStage==="delete" ?
        <div className="flex items-start gap-3 p-3 text-sm text-muted-foreground">
          <CircleAlert size={23} className="shrink-0 text-destructive"/>
          <p>Esta ação é irreversível: removerá a sessão, contatos importados, conversas, mensagens e protocolos vinculados.
            Para manter o histórico, use <strong>Desconectar</strong>.</p>
        </div>
      : inlineStage==="disconnect" ?
        <div className="flex items-start gap-3 p-3 text-sm text-muted-foreground">
          <CircleAlert size={22} className="shrink-0"/>
          O recebimento será pausado, mas a sessão será preservada para reconectar sem QR Code se o WhatsApp não a revogar.
        </div>
      : <div className="flex items-start gap-3 p-3 text-sm text-muted-foreground">
          <CircleAlert size={22} className="shrink-0"/>
          As conversas anteriores permanecerão arquivadas. Para usar outro número, conecte uma nova sessão após encerrar esta.
        </div>}
      {footerTarget && actions && createPortal(<div className="flex flex-wrap gap-2">{actions}</div>,footerTarget)}
    </div>;
  }

  return <div className="space-y-5">
    {!embeddedSection && <>
      <PageHeader title="Canais de Atendimento" subtitle="Configure o canal e gerencie os números conectados." />
      <AdminSubsectionTabs value={section} items={channelSections}
        onChange={setSection} ariaLabel="Subseções de canais de atendimento" />
    </>}
    {loading && (section === "configuration" || section === "connections") ? <AdminWorkspaceSkeleton variant="cards" rows={5} /> : section === "configuration" ?
      <div className={embeddedSection ? "space-y-4" : "space-y-4 rounded-xl border border-border bg-card p-5"}>
          <div className="flex items-start gap-3 rounded-xl border border-border p-4">
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${enabled?"bg-emerald-500/15 text-emerald-600":"bg-primary/10 text-primary"}`}>
              {enabled?<CheckCircle2 size={20}/>:1}
            </span>
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-bold">1. Ativar o canal da empresa</p>
                <StatusBadge status={enabled?"Ativo":"Desativado"}/>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Ative o WhatsApp uma única vez. Cada empresa utiliza suas próprias conexões e permissões.
              </p>
              {!enabled && canManage && <AdminButton size="sm" disabled={Boolean(action)}
                loading={action==="activate"} onClick={()=>void perform("activate")}>Ativar WhatsApp</AdminButton>}
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-xl border border-border p-4">
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${connected?"bg-emerald-500/15 text-emerald-600":"bg-primary/10 text-primary"}`}>
              {connected?<CheckCircle2 size={20}/>:2}
            </span>
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-bold">2. Conectar o número</p>
                <StatusBadge status={connected?"Conectado":"Pendente"}/>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                Cadastre o número, faça a leitura do QR Code e gerencie as sessões do WhatsApp.
              </p>
              {enabled && <AdminButton size="sm" variant="secondary" onClick={()=>
                embeddedSection ? onSectionChange?.("connections") : setSection("connections")}>
                Gerenciar conexões
              </AdminButton>}
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-xl border border-border p-4">
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold ${receiving?"bg-emerald-500/15 text-emerald-600":"bg-primary/10 text-primary"}`}>
              {receiving?<CheckCircle2 size={20}/>:3}
            </span>
            <div className="min-w-0 flex-1 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-bold">3. Recebimento e atendimento</p>
                <StatusBadge status={receiving?"Ativo":connected?"Configurando":"Pendente"}/>
              </div>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {receiving ? "Recebimento, entrega e leitura estão sendo acompanhados automaticamente." :
                  connected ? "O número já está conectado. A Union finaliza o recebimento automaticamente." :
                    "Esta etapa será preparada após conectar o WhatsApp."}
              </p>
            </div>
          </div>
      </div> : section === "departments" || section === "queues" || section === "operators" ?
      <WhatsAppOperationsSettings key={section} section={section} createRequest={settingsCreateRequest}/> : section === "permissions" ?
      <WhatsAppRolePermissions onBack={onBack}/> : section === "quick-replies" ?
      <WhatsAppQuickRepliesSettings/> :
      <AdminCard square>
        <div className="overflow-x-auto"><TopTableScrollbar />
          <table className="min-w-[850px] w-full">
            <thead><tr>
              <th className="text-left">Canal</th>
              <th className="text-left">Número</th>
              <th className="text-left">Conexão</th>
              <th className="text-left">Recebimento</th>
              <th className="text-left">Última conexão</th>
              <th className="text-right">Ações</th>
            </tr></thead>
            <tbody>
              {enabled && channels.length ? channels.map(item=>{
                const connected=item.state==="connected";
                const receiving=connected && item.webhook_ready;
                const canResumeSameSession=Boolean(item.phone && item.webhook_ready);
                const status=connected?"Conectado":item.state==="connecting"?"Conectando":
                  item.state==="error"?"Falha na conexão":"Desconectado";
                return <tr key={item.id}>
                  <td><div className="flex items-center gap-2.5">
                    <span className="rounded-lg bg-emerald-500/10 p-2 text-emerald-600"><WhatsAppIcon/></span>
                    <div className="min-w-0">
                      <p className="font-semibold">{item.display_name||"WhatsApp"}</p>
                      <p className="text-xs text-muted-foreground">{connected?"Conexão ativa":"Sessão armazenada"}</p>
                    </div>
                  </div></td>
                  <td className="whitespace-nowrap font-medium tabular-nums">{formatPhone(item.phone)}</td>
                  <td><StatusBadge status={status}/></td>
                  <td><StatusBadge status={receiving?"Ativo":connected?"Configurando":"Inativo"}/></td>
                  <td className="whitespace-nowrap text-xs text-muted-foreground">{dateLabel(item.last_connected_at)}</td>
                  <td><div className="flex flex-wrap justify-end gap-2">
                    {connected && onOpenInbox && <AdminButton variant="secondary" size="sm"
                      disabled={Boolean(action)||!receiving} onClick={onOpenInbox}>Abrir conversas</AdminButton>}
                    {canManage && connected && <AdminButton variant="danger" size="sm"
                      disabled={Boolean(action)} onClick={()=>{
                        channelRef.current=item;setChannel(item);setConfirmLogout(true);
                      }}><Unplug size={15}/> Desconectar</AdminButton>}
                    {canManage && !connected && item.state!=="connecting" &&
                      <AdminButton variant="secondary" size="sm"
                        disabled={Boolean(action)||anotherActive(item.id)}
                        loading={action==="connect"} onClick={()=>void openQr(item)}
                        title={anotherActive(item.id)?"Desconecte o número ativo antes.":"Conectar esta sessão"}>
                        <RefreshCw size={15}/> {canResumeSameSession?"Reconectar":"Conectar"}
                      </AdminButton>}
                    {!connected && anotherActive(item.id) &&
                      <span className="self-center text-[11px] text-muted-foreground">Em espera</span>}
                    {canDelete && <AdminButton variant="danger" size="sm"
                      disabled={Boolean(action)} onClick={() => setDeleteTarget(item)}><Trash2 size={15}/> Excluir</AdminButton>}
                    {!connected && !canManage && !canDelete && <span className="text-xs text-muted-foreground">Desconectado</span>}
                  </div></td>
                </tr>;
              }) : <tr><td colSpan={6} className="py-12 text-center text-sm text-muted-foreground">
                {enabled ? "Nenhuma conexão encontrada." : "Ative o canal na subseção Configuração do canal para conectar um número."}
              </td></tr>}
            </tbody>
          </table>
        </div>
        {enabled && channel?.state === "connecting" && <p role="status" className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
          O WhatsApp está confirmando a conexão. A verificação ocorre automaticamente.
        </p>}
      </AdminCard>}
    {!embeddedSection && section !== "permissions" && <AdminStickyToolbar className="justify-between">
      {!embeddedSection && <AdminButton variant="secondary" onClick={onBack}><ArrowLeft size={16}/> Voltar</AdminButton>}
      {(section === "departments" || section === "queues") && canManage &&
        <AdminButton onClick={() => setSettingsCreateRequest(value => value + 1)}>Novo</AdminButton>}
      {section === "connections" && canManage && <AdminButton onClick={() => setCreateConnectionOpen(true)}
        disabled={!canStartConnection} loading={action === "connect"}
        title={!enabled ? "Ative o canal primeiro" :
          channels.length>=3 ? "Limite de 3 conexões cadastradas." :
          "Cadastre até três números, com apenas um ativo por empresa."}>
        <Plus size={16}/> Nova conexão
      </AdminButton>}
    </AdminStickyToolbar>}

    <AdminDialog open={createConnectionOpen} onClose={closeCreateConnection}
      title="Nova conexão"
      description={creatingWhatsApp ? "Personalize a sessão de WhatsApp antes de cadastrá-la." :
        "Selecione a rede social que deseja conectar."}
      footer={<div className="flex flex-wrap justify-end gap-2">
        {creatingWhatsApp && action!=="register" &&
          <AdminButton variant="secondary" onClick={()=>setCreatingWhatsApp(false)}>Voltar</AdminButton>}
        <AdminButton variant="secondary" disabled={action==="register"} onClick={closeCreateConnection}>Cancelar</AdminButton>
        {creatingWhatsApp && <AdminButton disabled={Boolean(action) || connectionName.trim().length<2}
          loading={action==="register"} onClick={()=>void addConnection()}>Criar sessão</AdminButton>}
      </div>}>
      {action==="register" ? <div className="flex min-h-48 flex-col items-center justify-center gap-3 px-3 py-8 text-center"
        role="status" aria-live="polite" aria-busy="true">
        <span className="text-sm font-semibold text-foreground">Criando sessão de WhatsApp...</span>
        <span className="text-primary"><LoadingSpinner size="md" /></span>
        <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
          Preparando a conexão ${connectionName.trim()}. O cadastro será confirmado automaticamente.
        </p>
      </div> : creatingWhatsApp ?
        <div className="space-y-4">
          <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/20 px-4 py-3">
            <span className="rounded-lg bg-emerald-500/10 p-2 text-emerald-600"><WhatsAppIcon/></span>
            <div>
              <p className="text-sm font-bold text-foreground">WhatsApp</p>
              <p className="text-xs text-muted-foreground">Nome de identificação da sessão</p>
            </div>
          </div>
          <label className="block text-sm font-semibold text-foreground">
            Nome da sessão <span className="text-red-600">*</span>
            <input type="text" maxLength={80} autoFocus value={connectionName}
              onChange={event=>setConnectionName(event.target.value)}
              onKeyDown={event=>{if(event.key==="Enter"){event.preventDefault();void addConnection();}}}
              placeholder="Ex.: Atendimento principal"
              className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm font-normal outline-none focus:border-primary"/>
          </label>
          {channels.some(item=>item.state==="connected" || item.state==="connecting") &&
            <p className="text-xs leading-relaxed text-muted-foreground">
              Você pode cadastrar esta sessão agora. Para conectá-la, primeiro desconecte a sessão ativa.
            </p>}
        </div> :
        <div className="grid gap-3 sm:grid-cols-3">
          <button type="button" disabled={!canStartConnection}
            onClick={()=>{setCreatingWhatsApp(true);setConnectionName("");}}
            className="flex min-h-32 flex-col items-center justify-center gap-2 rounded-xl border border-primary/35 bg-primary/10 px-4 py-5 text-primary transition-colors hover:border-primary hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:cursor-not-allowed disabled:opacity-50">
            <WhatsAppIcon/>
            <span className="text-sm font-bold">WhatsApp</span>
            <span className="text-xs font-medium">Disponível</span>
          </button>
          <button type="button" disabled title="Instagram · Em breve"
            className="flex min-h-32 cursor-not-allowed flex-col items-center justify-center gap-2 rounded-xl border border-border bg-muted/25 px-4 py-5 text-muted-foreground opacity-65">
            <Instagram size={19}/>
            <span className="text-sm font-semibold">Instagram</span>
            <span className="text-xs">Em breve</span>
          </button>
          <button type="button" disabled title="Facebook · Em breve"
            className="flex min-h-32 cursor-not-allowed flex-col items-center justify-center gap-2 rounded-xl border border-border bg-muted/25 px-4 py-5 text-muted-foreground opacity-65">
            <Facebook size={19}/>
            <span className="text-sm font-semibold">Facebook</span>
            <span className="text-xs">Em breve</span>
          </button>
        </div>}
    </AdminDialog>
    <AdminDialog open={qrOpen} onClose={() => { setQrOpen(false); setQr(null); }}
      title="Conectar número" description="No WhatsApp, acesse Aparelhos conectados e leia o QR Code."
      footer={<AdminButton variant="secondary" onClick={() => { setQrOpen(false); setQr(null); }}>Fechar</AdminButton>}>
      <div className="flex min-h-[310px] flex-col items-center justify-center gap-4 p-5">
        {qr ? <img src={qr} width={240} height={240} className="rounded-lg bg-white p-3" alt="QR Code para conectar o WhatsApp"/> :
          <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground">
            <LoaderCircle size={40} className="animate-spin text-primary motion-reduce:animate-none"/>
            <span>{action === "connect" ? "Gerando QR Code..." : "Aguardando QR Code ou confirmação..."}</span>
          </div>}
        <p className="max-w-sm text-center text-xs leading-relaxed text-muted-foreground">
          Após escanear, a Union reconhece a conexão e ativa o recebimento automaticamente, sem etapas adicionais.
        </p>
      </div>
    </AdminDialog>

    <AdminDialog open={Boolean(deleteTarget)} onClose={() => { if (action !== "delete") setDeleteTarget(null); }}
      title="Excluir conexão permanentemente?"
      description={deleteTarget ? `Conexão: ${deleteTarget.display_name || "WhatsApp"}` : undefined}
      footer={<div className="flex justify-end gap-2">
        <AdminButton variant="secondary" disabled={action === "delete"} onClick={() => setDeleteTarget(null)}>Cancelar</AdminButton>
        <AdminButton variant="danger" loading={action === "delete"} disabled={Boolean(action)} onClick={() => void deleteConnection()}>
          <Trash2 size={15}/> Excluir definitivamente
        </AdminButton>
      </div>}>
      <div className="flex items-start gap-3 p-5 text-sm text-muted-foreground">
        <CircleAlert size={23} className="shrink-0 text-destructive"/>
        <p>Esta ação é irreversível: removerá a sessão do WhatsApp, os contatos importados, as conversas, as mensagens e os protocolos vinculados a esta conexão. Para pausar o atendimento sem apagar o histórico, use <strong>Desconectar</strong>.</p>
      </div>
    </AdminDialog>
    <AdminDialog open={confirmLogout} onClose={() => setConfirmLogout(false)} title="Desconectar WhatsApp?"
      description="A conexão será pausada, mas a sessão e o número permanecerão vinculados."
      footer={<div className="flex gap-2"><AdminButton variant="secondary" onClick={() => setConfirmLogout(false)}>Cancelar</AdminButton>
        <AdminButton variant="danger" loading={action === "disconnect"} disabled={Boolean(action)}
          onClick={() => void perform("disconnect")}>Desconectar</AdminButton></div>}>
      <div className="flex items-center gap-3 p-5 text-sm text-muted-foreground">
        <CircleAlert size={22} className="shrink-0"/>
        A Union deixará de receber mensagens até reconectar. A sessão será preservada para voltar sem QR Code, desde que o WhatsApp não a tenha revogado.
      </div>
    </AdminDialog>
    <AdminDialog open={confirmSwitch} onClose={() => setConfirmSwitch(false)} title="Trocar o número do WhatsApp?"
      description="Esta ação encerra a sessão anterior e exigirá um QR Code para conectar o próximo número."
      footer={<div className="flex gap-2">
        <AdminButton variant="secondary" onClick={() => setConfirmSwitch(false)}>Cancelar</AdminButton>
        <AdminButton variant="danger" disabled={Boolean(action)} loading={action==="logout"}
          onClick={() => void perform("logout")}>Encerrar sessão</AdminButton>
      </div>}>
      <div className="flex items-center gap-3 p-5 text-sm text-muted-foreground">
        <CircleAlert size={22} className="shrink-0"/>
        Os contatos e as conversas do número anterior permanecerão arquivados na Union. Depois, use Nova conexão para ler o QR Code do novo número.
      </div>
    </AdminDialog>
  </div>;
}
