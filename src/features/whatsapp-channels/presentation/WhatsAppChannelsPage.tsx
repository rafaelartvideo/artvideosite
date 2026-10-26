import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, CheckCircle2, CircleAlert, LoaderCircle, Facebook, Instagram, Plus, RefreshCw, ShieldCheck, Trash2, Unplug } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { AdminButton, AdminCard, AdminCardContent, AdminDialog, AdminStickyToolbar, PageHeader } from "@/shared/ui/admin/AdminLayout";
import { LoadingDots, LoadingState, StatusBadge, notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import { operateWhatsAppChannel, type WhatsAppChannel } from "../infrastructure/whatsapp-channels.repository";
import { WhatsAppOperationsSettings } from "./WhatsAppOperationsSettings";
import { WhatsAppRolePermissions } from "./WhatsAppRolePermissions";

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

type ChannelSection = "configuration" | "connections" | "departments" | "queues" | "operators" | "permissions";
const channelSections: Array<{ id: ChannelSection; label: string }> = [
  { id: "configuration", label: "Configuração do canal" },
  { id: "connections", label: "Conexões" },
  { id: "departments", label: "Departamentos" },
  { id: "queues", label: "Filas" },
  { id: "operators", label: "Operadores" },
  { id: "permissions", label: "Perfis e Permissões" },
];

// Exibe sucesso e erro no balão global do CRM (sucesso: 3s; erro: 6s).
const showSuccess = (message: string) => { if (message) notifyAdmin(message, "success"); };
const showError = (message: string) => { if (message) notifyAdmin(message, "error"); };

export function WhatsAppChannelsPage({ onBack, onOpenInbox, initialSection = "configuration" }: { onBack: () => void; onOpenInbox?: () => void; initialSection?: ChannelSection }) {
  const { activeOrganizationId, hasPermission } = useAuth();
  const canView = hasPermission("settings.channels.view") || hasPermission("settings.channels.manage") || hasPermission("settings.channels.delete");
  const canManage = hasPermission("settings.channels.manage");
  const canDelete = hasPermission("settings.channels.delete");
  const [section, setSection] = useState<ChannelSection>(initialSection);
  const [settingsCreateRequest, setSettingsCreateRequest] = useState(0);
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
        if(currentState==="connected" || currentState==="connecting")
          schedule(currentState === "connecting" ? 5000 : 30000);
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
    const org = activeOrganizationId;
    const id = channel.id;
    const interval = window.setInterval(async () => {
      if (document.visibilityState !== "visible" || qrInFlight.current) return;
      qrInFlight.current = true;
      try {
        const result = await operateWhatsAppChannel(org, "qr", id);
        if (cancelled) return;
        if (result.qr) {
          qrUnavailableCount = 0;
          setQr(result.qr);
        }
      } catch {
        // A QR that stops being available after it was displayed can mean
        // that pairing started. Two failures avoid transitioning on one hiccup.
        // This is only a progress indicator, never proof of connection.
        qrUnavailableCount += 1;
        if (!cancelled && qrUnavailableCount >= 2 && channelRef.current?.state === "connecting") {
          // QR can disappear when pairing begins; wait for actual status.
          setQr(null);
        }
      } finally {
        qrInFlight.current = false;
      }
    }, 15000);
    return () => { cancelled = true; window.clearInterval(interval); };
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
  if (!canView) return <div className="p-5 text-sm text-muted-foreground">Você não possui permissão para visualizar canais de atendimento nesta empresa.</div>;

  const enabled = Boolean(channel && channel.state !== "not_connected");
  const connected = channels.some(item=>item.state==="connected");
  const receiving = channels.some(item=>item.state==="connected" && item.webhook_ready);

  const canStartConnection = canManage && enabled && channels.length<3 && !Boolean(action);
  const anotherActive=(id:string)=>channels.some(c=>c.id!==id &&
    (c.state==="connected" || c.state==="connecting"));

  return <div className="space-y-5">
    <PageHeader title="Canais de Atendimento" subtitle="Configure o canal e gerencie os números conectados." />
    <nav aria-label="Subseções de canais de atendimento" className="mr-auto flex w-fit max-w-full justify-start overflow-x-auto">
      <div className="flex w-max items-center justify-start gap-1">
        {channelSections.map(item => <button key={item.id} type="button"
          onClick={() => setSection(item.id)} aria-current={section === item.id ? "page" : undefined}
          className={`relative inline-flex min-h-11 shrink-0 items-center justify-center bg-transparent px-3 text-xs font-black transition-colors duration-200 after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:origin-center after:rounded-full after:bg-primary after:transition-transform after:duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${section === item.id ? "text-primary after:scale-x-100" : "text-muted-foreground after:scale-x-0 hover:text-primary"}`}>
          {item.label}
        </button>)}
      </div>
    </nav>
    {loading && (section === "configuration" || section === "connections") ? <LoadingState text="Carregando canais..." /> : section === "configuration" ?
      <AdminCard>
        <AdminCardContent className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold">WhatsApp da empresa</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                Ative o canal uma única vez. A Union prepara a integração e configura o recebimento automaticamente quando um número é conectado.
              </p>
            </div>
            <StatusBadge status={enabled ? "Ativo" : "Desativado"} />
          </div>
          {!enabled && canManage && <AdminButton disabled={Boolean(action)} loading={action === "activate"}
            onClick={() => void perform("activate")}>Ativar WhatsApp</AdminButton>}
          {enabled && <div className="grid gap-4 rounded-xl border border-border bg-muted/20 p-4 sm:grid-cols-2">
            <div className="flex items-start gap-2.5">
              <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-600"/>
              <div><p className="text-sm font-semibold">Integração preparada</p>
                <p className="mt-1 text-xs text-muted-foreground">Sessão segura criada para esta empresa.</p></div>
            </div>
            <div className="flex items-start gap-2.5">
              {receiving ? <ShieldCheck size={18} className="mt-0.5 shrink-0 text-emerald-600"/> :
                connected ? <LoaderCircle size={18} className="mt-0.5 shrink-0 animate-spin text-amber-600 motion-reduce:animate-none"/> :
                  <CircleAlert size={18} className="mt-0.5 shrink-0 text-muted-foreground"/>}
              <div><p className="text-sm font-semibold">Recebimento de mensagens</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {receiving ? "Autenticado e ativo." :
                    connected ? "Número conectado. Finalizando configuração automaticamente." :
                      "Será configurado após conectar um número."}
                </p></div>
            </div>
          </div>}
          {connected && canManage &&
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/25 p-3">
              <p className="text-xs text-muted-foreground">Sincronize os eventos de recebimento, entrega e leitura após atualizar a ponte da VPS.</p>
              <AdminButton variant="secondary" size="sm" disabled={Boolean(action)}
                loading={action === "webhook_setup"} onClick={() => void perform("webhook_setup", channels.find(c=>c.state==="connected")?.id)}>
                <RefreshCw size={15}/> Tentar novamente
              </AdminButton>
            </div>}
        </AdminCardContent>
      </AdminCard> : section === "departments" || section === "queues" || section === "operators" ?
      <WhatsAppOperationsSettings key={section} section={section} createRequest={settingsCreateRequest}/> : section === "permissions" ?
      <WhatsAppRolePermissions/> :
      <AdminCard square>
        <div className="overflow-x-auto">
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
    <AdminStickyToolbar className="justify-between">
      <AdminButton variant="secondary" onClick={onBack}><ArrowLeft size={16}/> Voltar</AdminButton>
      {(section === "departments" || section === "queues") && canManage &&
        <AdminButton onClick={() => setSettingsCreateRequest(value => value + 1)}>Novo</AdminButton>}
      {section === "connections" && canManage && <AdminButton onClick={() => setCreateConnectionOpen(true)}
        disabled={!canStartConnection} loading={action === "connect"}
        title={!enabled ? "Ative o canal primeiro" :
          channels.length>=3 ? "Limite de 3 conexões cadastradas." :
          "Cadastre até três números, com apenas um ativo por empresa."}>
        <Plus size={16}/> Nova conexão
      </AdminButton>}
    </AdminStickyToolbar>

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
        <LoadingDots/>
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
        <AdminButton variant="secondary" disabled={Boolean(action)} loading={action === "qr"} onClick={() => void perform("qr")}>
          <RefreshCw size={16}/> Atualizar QR Code
        </AdminButton>
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
