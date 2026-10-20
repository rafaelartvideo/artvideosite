import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, CheckCircle2, CircleAlert, LoaderCircle, MessageCircle, Plus, QrCode, RefreshCw, ShieldCheck, Smartphone, Unplug } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { AdminButton, AdminCard, AdminCardContent, AdminDialog, AdminStickyToolbar, PageHeader } from "@/shared/ui/admin/AdminLayout";
import { LoadingState } from "@/shared/ui/admin/AdminFeedback";
import { operateWhatsAppChannel, type WhatsAppChannel } from "../infrastructure/whatsapp-channels.repository";

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

type ChannelSection = "configuration" | "connections";
const channelSections: Array<{ id: ChannelSection; label: string }> = [
  { id: "configuration", label: "Configuração do canal" },
  { id: "connections", label: "Conexões" },
];

export function WhatsAppChannelsPage({ onBack, onOpenInbox }: { onBack: () => void; onOpenInbox?: () => void }) {
  const { activeOrganizationId, hasPermission } = useAuth();
  const canView = hasPermission("settings.channels.view") || hasPermission("settings.channels.manage");
  const canManage = hasPermission("settings.channels.manage");
  const [section, setSection] = useState<ChannelSection>("configuration");
  const [channel, setChannel] = useState<WhatsAppChannel | null>(null);
  const channelRef = useRef<WhatsAppChannel | null>(null);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [qrOpen, setQrOpen] = useState(false);
  const [statusError, setStatusError] = useState("");
  const [qr, setQr] = useState<string | null>(null);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const statusInFlight = useRef(false);
  const qrInFlight = useRef(false);

  useEffect(() => { channelRef.current = channel; }, [channel]);

  const applyChannel = useCallback((next: WhatsAppChannel) => {
    const previous = channelRef.current;
    channelRef.current = next;
    setChannel(next);
    if (next.state === "connected") {
      setQrOpen(false);
      setQr(null);
      setStatusError("");
      if (previous?.state !== "connected") {
        setError("");
        setNotice(next.webhook_ready ? "WhatsApp conectado e recebimento ativo." : "Número conectado. Configurando o recebimento automaticamente.");
      }
    }
  }, []);

  const load = useCallback(async () => {
    if (!activeOrganizationId || !canView) {
      channelRef.current = null;
      setChannel(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await operateWhatsAppChannel(activeOrganizationId, "list");
      channelRef.current = result.channel ?? null;
      setChannel(result.channel ?? null);
    } catch (e) {
      setError(systemErrorMessage(e, "Não foi possível carregar os canais."));
    } finally {
      setLoading(false);
    }
  }, [activeOrganizationId, canView]);

  useEffect(() => {
    channelRef.current = null;
    setChannel(null);
    setQr(null);
    setQrOpen(false);
    setStatusError("");
    setConfirmLogout(false);
    void load();
  }, [load]);

  // Keep the status fresh while this page is mounted, even after the QR modal
  // closes. A single timeout follows each completed request: no overlapping
  // intervals, no work in hidden tabs, and no constant polling elsewhere.
  useEffect(() => {
    if (!activeOrganizationId || !channel?.id || channel.state === "not_connected" || !canView) return;
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
  }, [activeOrganizationId, channel?.id, canView, applyChannel]);

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

  const perform = useCallback(async (operation: "activate" | "status" | "qr" | "logout" | "webhook_setup") => {
    if (!activeOrganizationId || (!canManage && operation !== "status") || action) return;
    setAction(operation);
    setError("");
    if (operation !== "status") setNotice("");
    try {
      const result = await operateWhatsAppChannel(activeOrganizationId, operation, channelRef.current?.id);
      if (result.channel) applyChannel(result.channel);
      if (operation === "qr") setQr(result.qr || null);
      if (operation === "activate") { setNotice("WhatsApp ativado. Agora basta conectar seu número."); setSection("connections"); }
      if (operation === "webhook_setup") setNotice("Recebimento autenticado por HMAC configurado. Envie uma mensagem de outro número para testar a entrega.");
      if (operation === "logout") {
        setQr(null);
        setQrOpen(false);
        setConfirmLogout(false);
        setNotice("WhatsApp desconectado da Union.");
      }
      if (operation === "status") setStatusError("");
    } catch (e) {
      setError(systemErrorMessage(e, "Não foi possível comunicar com o WhatsApp."));
    } finally {
      setAction(null);
    }
  }, [activeOrganizationId, action, canManage, applyChannel]);

  const openQr = async () => {
    if (!activeOrganizationId || !channel || !canManage || action) return;
    setError("");
    setStatusError("");
    setNotice("");
    setQr(null);
    setQrOpen(true);
    setAction("connect");
    try {
      // Explicitly connect before fetching /session/qr. If the session was
      // already paired on the phone, status is authoritative: don't log out.
      const connection = await operateWhatsAppChannel(activeOrganizationId, "connect", channel.id);
      if (connection.channel) applyChannel(connection.channel);
      if (connection.logged_in) return;
      const code = await operateWhatsAppChannel(activeOrganizationId, "qr", channel.id);
      setQr(code.qr || null);
    } catch (e) {
      setError(systemErrorMessage(e, "Não foi possível iniciar o QR Code."));
      setQrOpen(false);
    } finally {
      setAction(null);
    }
  };

  const statusClass = channel?.state === "connected"
    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
    : channel?.state === "connecting"
      ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
      : channel?.state === "error"
        ? "bg-red-500/10 text-red-600 dark:text-red-400"
        : "bg-muted text-muted-foreground";

  if (!canView) return <div className="p-5 text-sm text-muted-foreground">Você não possui permissão para visualizar canais de atendimento nesta empresa.</div>;

  const enabled = Boolean(channel && channel.state !== "not_connected");
  const connected = channel?.state === "connected";
  const receiving = connected && channel?.webhook_ready === true;


  const connectionState = connected ? "Conectado" :
    channel?.state === "connecting" ? "Conectando" :
    channel?.state === "error" ? "Falha na conexão" : "Desconectado";
  const canStartConnection = canManage && enabled && !connected && !Boolean(action);

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
    {error && <div role="alert" className="rounded-xl border border-red-500/25 bg-red-500/5 p-4 text-sm text-red-600 dark:text-red-400">{error}</div>}
    {notice && <div role="status" className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4 text-sm text-emerald-700 dark:text-emerald-400">{notice}</div>}
    {loading ? <LoadingState text="Carregando canais..." /> : section === "configuration" ?
      <AdminCard>
        <AdminCardContent className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold">WhatsApp da empresa</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                Ative o canal uma única vez. A Union prepara a integração e configura o recebimento automaticamente quando um número é conectado.
              </p>
            </div>
            <span className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${enabled ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-muted text-muted-foreground"}`}>
              {enabled ? "Ativado" : "Desativado"}
            </span>
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
          {connected && !channel?.webhook_ready && canManage &&
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/25 p-3">
              <p className="text-xs text-muted-foreground">Se o recebimento continuar pendente, confira a ponte de integração.</p>
              <AdminButton variant="secondary" size="sm" disabled={Boolean(action)}
                loading={action === "webhook_setup"} onClick={() => void perform("webhook_setup")}>
                <RefreshCw size={15}/> Tentar novamente
              </AdminButton>
            </div>}
        </AdminCardContent>
      </AdminCard> :
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
              {enabled && channel ? <tr key={channel.id}>
                <td><div className="flex items-center gap-2.5">
                  <span className="rounded-lg bg-emerald-500/10 p-2 text-emerald-600"><MessageCircle size={17}/></span>
                  <div><p className="font-semibold">{channel.display_name || "WhatsApp"}</p>
                    <p className="text-xs text-muted-foreground">WhatsApp normal ou Business</p></div>
                </div></td>
                <td className="whitespace-nowrap font-medium tabular-nums">{formatPhone(channel.phone)}</td>
                <td><span className={`inline-flex whitespace-nowrap rounded-lg px-2.5 py-1 text-xs font-semibold ${statusClass}`}>
                  {connectionState}</span></td>
                <td><span className={`text-xs font-semibold ${receiving ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
                  {receiving ? "Ativo" : connected ? "Configurando" : "Inativo"}</span></td>
                <td className="whitespace-nowrap text-xs text-muted-foreground">{dateLabel(channel.last_connected_at)}</td>
                <td><div className="flex justify-end gap-2">
                  {connected && onOpenInbox && <AdminButton variant="secondary" size="sm"
                    disabled={Boolean(action) || !receiving} onClick={onOpenInbox}>Abrir conversas</AdminButton>}
                  {canManage && connected && <AdminButton variant="danger" size="sm"
                    disabled={Boolean(action)} onClick={() => setConfirmLogout(true)}>
                    <Unplug size={15}/> Desconectar</AdminButton>}
                  {!connected && <span className="whitespace-nowrap text-xs text-muted-foreground">Aguardando conexão</span>}
                </div></td>
              </tr> : <tr><td colSpan={6} className="py-12 text-center text-sm text-muted-foreground">
                {enabled ? "Nenhuma conexão encontrada." : "Ative o canal na subseção Configuração do canal para conectar um número."}
              </td></tr>}
            </tbody>
          </table>
        </div>
        {enabled && channel?.state === "connecting" && <p role="status" className="border-t border-border px-4 py-3 text-xs text-muted-foreground">
          O WhatsApp está confirmando a conexão. A verificação ocorre automaticamente.
        </p>}
        {statusError && <div role="alert" className="border-t border-border px-4 py-3 text-xs text-red-600 dark:text-red-400">
          {statusError}
        </div>}
      </AdminCard>}
    <AdminStickyToolbar className="justify-between">
      <AdminButton variant="secondary" onClick={onBack}><ArrowLeft size={16}/> Voltar</AdminButton>
      {section === "connections" && canManage && <AdminButton onClick={() => void openQr()}
        disabled={!canStartConnection} loading={action === "connect"}
        title={!enabled ? "Ative o canal primeiro" :
          connected ? "Esta integração permite um número por empresa. Desconecte o atual antes de adicionar outro." : undefined}>
        <Plus size={16}/> Nova conexão
      </AdminButton>}
    </AdminStickyToolbar>
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

    <AdminDialog open={confirmLogout} onClose={() => setConfirmLogout(false)} title="Desconectar WhatsApp?"
      description="Isso encerra a sessão WhatsApp vinculada a esta empresa."
      footer={<div className="flex gap-2"><AdminButton variant="secondary" onClick={() => setConfirmLogout(false)}>Cancelar</AdminButton>
        <AdminButton variant="danger" loading={action === "logout"} onClick={() => void perform("logout")}>Desconectar</AdminButton></div>}>
      <div className="flex items-center gap-3 p-5 text-sm text-muted-foreground"><CircleAlert size={22}/> Novos atendimentos deixarão de ser recebidos pela Union até uma nova conexão.</div>
    </AdminDialog>
  </div>;
}
