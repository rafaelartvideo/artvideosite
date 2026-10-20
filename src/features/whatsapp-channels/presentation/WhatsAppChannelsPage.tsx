import { useCallback, useEffect, useRef, useState } from "react";
import { CircleAlert, LoaderCircle, MessageCircle, QrCode, RefreshCw, ShieldCheck, Smartphone, Unplug, Wifi } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { AdminButton, AdminCard, AdminCardContent, AdminCardHeader, AdminDialog, PageHeader } from "@/shared/ui/admin/AdminLayout";
import { LoadingState } from "@/shared/ui/admin/AdminFeedback";
import { operateWhatsAppChannel, type WhatsAppChannel } from "../infrastructure/whatsapp-channels.repository";

const stateLabels: Record<WhatsAppChannel["state"], string> = {
  not_connected: "Não conectado",
  connecting: "Aguardando conexão",
  connected: "Conectado",
  disconnected: "Desconectado",
  error: "Falha de conexão",
};
const dateLabel = (value: string | null) =>
  value ? new Date(value).toLocaleString("pt-BR") : "Ainda não verificado";

export function WhatsAppChannelsPage({ onBack }: { onBack: () => void }) {
  const { activeOrganizationId, hasPermission } = useAuth();
  const canView = hasPermission("settings.channels.view") || hasPermission("settings.channels.manage");
  const canManage = hasPermission("settings.channels.manage");
  const [channel, setChannel] = useState<WhatsAppChannel | null>(null);
  const channelRef = useRef<WhatsAppChannel | null>(null);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [qrOpen, setQrOpen] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const [syncSeconds, setSyncSeconds] = useState(0);
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
      setSyncOpen(false);
      setQr(null);
      setStatusError("");
      if (previous?.state !== "connected") {
        setError("");
        setNotice("WhatsApp conectado e pronto para uso na Union.");
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
    setSyncOpen(false);
    setStatusError("");
    setConfirmLogout(false);
    void load();
  }, [load]);

  // Keep the status fresh while this page is mounted, even after the QR modal
  // closes. A single timeout follows each completed request: no overlapping
  // intervals, no work in hidden tabs, and no constant polling elsewhere.
  useEffect(() => {
    if (!activeOrganizationId || !channel?.id || !canView) return;
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
    const org = activeOrganizationId;
    const id = channel.id;
    const interval = window.setInterval(async () => {
      if (document.visibilityState !== "visible" || qrInFlight.current) return;
      qrInFlight.current = true;
      try {
        const result = await operateWhatsAppChannel(org, "qr", id);
        if (!cancelled && result.qr) setQr(result.qr);
      } catch {
        // During pairing, WuzAPI can stop serving QR before status is logged in.
        // The separate status poll remains active and shows any persistent errors.
      } finally {
        qrInFlight.current = false;
      }
    }, 25000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [qrOpen, activeOrganizationId, channel?.id, canManage]);

  useEffect(() => {
    if (!syncOpen) return;
    setSyncSeconds(0);
    const timer = window.setInterval(() => setSyncSeconds(seconds => seconds + 1), 1000);
    return () => window.clearInterval(timer);
  }, [syncOpen]);

  const perform = useCallback(async (operation: "register" | "provision" | "status" | "qr" | "logout") => {
    if (!activeOrganizationId || (!canManage && operation !== "status") || action) return;
    setAction(operation);
    setError("");
    if (operation !== "status") setNotice("");
    try {
      const result = await operateWhatsAppChannel(activeOrganizationId, operation, channelRef.current?.id);
      if (result.channel) applyChannel(result.channel);
      if (operation === "qr") setQr(result.qr || null);
      if (operation === "register") setNotice("Canal cadastrado para esta empresa.");
      if (operation === "provision") setNotice("Sessão preparada na VPS. Você já pode conectar o WhatsApp.");
      if (operation === "logout") {
        setQr(null);
        setQrOpen(false);
        setSyncOpen(false);
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
    setSyncOpen(false);
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

  const startSyncing = () => {
    setQrOpen(false);
    setQr(null);
    setStatusError("");
    setSyncOpen(true);
  };

  const closeSyncing = () => setSyncOpen(false);
  const statusClass = channel?.state === "connected"
    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
    : channel?.state === "connecting"
      ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
      : channel?.state === "error"
        ? "bg-red-500/10 text-red-600 dark:text-red-400"
        : "bg-muted text-muted-foreground";

  if (!canView) return <div className="p-5 text-sm text-muted-foreground">Você não possui permissão para visualizar canais de atendimento nesta empresa.</div>;

  return <div className="space-y-5">
    <PageHeader title="Canais de Atendimento" subtitle="Conecte o WhatsApp da empresa ativa por QR Code e acompanhe a sincronização e o estado da sessão."
      actions={<AdminButton variant="secondary" onClick={onBack}>Voltar</AdminButton>} />
    {error && <div role="alert" className="rounded-xl border border-red-500/25 bg-red-500/5 p-4 text-sm text-red-600 dark:text-red-400">{error}</div>}
    {notice && <div role="status" className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4 text-sm text-emerald-700 dark:text-emerald-400">{notice}</div>}
    {loading ? <LoadingState text="Carregando canais..." /> :
      <AdminCard>
        <AdminCardHeader>
          <div className="flex min-w-0 items-center gap-3">
            <span className="rounded-lg bg-blue-500/10 p-2 text-blue-600"><MessageCircle size={21}/></span>
            <div><h2 className="text-sm font-bold">WhatsApp</h2>
              <p className="text-xs text-muted-foreground">WuzAPI · WhatsApp normal ou Business</p></div>
          </div>
          <span className={`rounded-lg px-2 py-1 text-xs font-bold ${statusClass}`}>
            {channel ? stateLabels[channel.state] : "Não cadastrado"}
          </span>
        </AdminCardHeader>
        <AdminCardContent className="space-y-5">
          {!channel ? <>
            <div className="flex items-start gap-3">
              <Smartphone className="mt-0.5 shrink-0 text-muted-foreground" size={20}/>
              <p className="text-sm text-muted-foreground">Nenhum canal foi cadastrado nesta empresa. O cadastro não conecta nem modifica o WhatsApp existente.</p>
            </div>
            {canManage && <AdminButton disabled={Boolean(action)} loading={action === "register"} onClick={() => void perform("register")}>
              Cadastrar WhatsApp
            </AdminButton>}
          </> : <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div><p className="text-xs text-muted-foreground">Nome do canal</p><p className="mt-1 text-sm font-semibold">{channel.display_name}</p></div>
              <div><p className="text-xs text-muted-foreground">Número</p><p className="mt-1 text-sm font-semibold">
                {channel.phone || (channel.state === "connected" ? "Conectado · número não identificado" : "Aguardando vinculação")}
              </p></div>
              <div><p className="text-xs text-muted-foreground">Última verificação</p><p className="mt-1 text-sm">{dateLabel(channel.last_checked_at)}</p></div>
              <div><p className="text-xs text-muted-foreground">Última conexão</p><p className="mt-1 text-sm">{dateLabel(channel.last_connected_at)}</p></div>
            </div>
            {channel.state === "connecting" && <div role="status" className="flex items-start gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-sm">
              <LoaderCircle size={19} className="mt-0.5 shrink-0 animate-spin text-amber-600 motion-reduce:animate-none"/>
              <div><p className="font-semibold">Aguardando confirmação do WhatsApp</p>
                <p className="mt-1 text-xs text-muted-foreground">Se você já escaneou o QR Code, a sincronização inicial pode levar alguns minutos. A Union consulta o estado automaticamente enquanto esta página estiver aberta.</p>
              </div>
            </div>}
            {statusError && <div role="alert" className="flex items-start gap-2 rounded-lg border border-red-500/25 bg-red-500/5 p-3 text-xs text-red-600 dark:text-red-400">
              <CircleAlert size={16} className="shrink-0"/>{statusError}
            </div>}
            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
              {canManage && channel.state === "not_connected" && <AdminButton disabled={Boolean(action)} loading={action === "provision"} onClick={() => void perform("provision")}>Preparar sessão</AdminButton>}
              {canManage && channel.state !== "connected" && channel.state !== "not_connected" && <AdminButton disabled={Boolean(action)} onClick={() => void openQr()}><QrCode size={16}/> Conectar QR Code</AdminButton>}
              {canManage && channel.state === "connecting" && <AdminButton variant="tertiary" onClick={startSyncing}><LoaderCircle size={16}/> Acompanhar sincronização</AdminButton>}
              <AdminButton variant="secondary" disabled={Boolean(action)} loading={action === "status"} onClick={() => void perform("status")}><RefreshCw size={16}/> Atualizar estado</AdminButton>
              {canManage && channel.state === "connected" && <AdminButton variant="danger" disabled={Boolean(action)} onClick={() => setConfirmLogout(true)}><Unplug size={16}/> Desconectar</AdminButton>}
            </div>
          </>}
        </AdminCardContent>
      </AdminCard>
    }
    <div className="flex gap-3 rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">
      <ShieldCheck className="shrink-0 text-blue-600" size={20}/>
      <div>As credenciais de sessão são mantidas somente na VPS. Cada conexão pertence à empresa ativa e o acesso é controlado pelas permissões da Union. O WhatsApp por QR Code usa uma integração não oficial.</div>
    </div>

    <AdminDialog open={qrOpen} onClose={() => { setQrOpen(false); setQr(null); }} title="Conectar WhatsApp"
      description="No WhatsApp normal ou Business, abra Aparelhos conectados e escaneie o QR Code."
      footer={<div className="flex flex-wrap justify-end gap-2">
        <AdminButton variant="secondary" onClick={() => { setQrOpen(false); setQr(null); }}>Fechar</AdminButton>
        <AdminButton onClick={startSyncing} disabled={!qr}>Já escaneei o QR Code</AdminButton>
      </div>}>
      <div className="flex min-h-[300px] flex-col items-center justify-center gap-4 p-5">
        {qr
          ? <img src={qr} width={240} height={240} className="rounded-lg bg-white p-3" alt="QR Code temporário para conectar WhatsApp da empresa"/>
          : <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground">
            <LoaderCircle size={40} className="animate-spin text-primary motion-reduce:animate-none"/><span>Gerando QR Code...</span>
          </div>}
        <p className="text-center text-xs text-muted-foreground">Depois da leitura, clique em “Já escaneei o QR Code” para acompanhar a sincronização.</p>
        <AdminButton variant="secondary" disabled={Boolean(action)} loading={action === "qr"} onClick={() => void perform("qr")}><RefreshCw size={16}/> Atualizar QR Code</AdminButton>
      </div>
    </AdminDialog>

    <AdminDialog open={syncOpen} onClose={closeSyncing} title="Sincronizando WhatsApp"
      description="O aparelho já pode aparecer como ativo no celular antes de a Union confirmar a sessão."
      footer={<div className="flex justify-end gap-2">
        <AdminButton variant="secondary" onClick={closeSyncing}>Continuar em segundo plano nesta página</AdminButton>
        <AdminButton loading={action === "status"} onClick={() => void perform("status")} disabled={Boolean(action)}><RefreshCw size={16}/> Verificar agora</AdminButton>
      </div>}>
      <div role="status" aria-live="polite" className="flex min-h-[280px] flex-col items-center justify-center gap-5 px-4 py-6 text-center">
        <div className="relative flex h-24 w-24 items-center justify-center">
          <span className="absolute inset-0 animate-ping rounded-full bg-blue-500/10 motion-reduce:animate-none"/>
          <span className="absolute inset-2 rounded-full border border-blue-500/25 bg-blue-500/10"/>
          <Wifi size={35} className="relative text-primary"/>
          <LoaderCircle size={20} className="absolute -bottom-1 -right-1 animate-spin rounded-full bg-card text-primary motion-reduce:animate-none"/>
        </div>
        <div>
          <p className="text-base font-bold">Confirmando a conexão...</p>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
            {syncSeconds < 90
              ? "Aguardando o WhatsApp finalizar a sincronização e confirmar que a sessão está pronta."
              : "Esta sincronização está levando mais tempo que o habitual. A Union continuará verificando; não é necessário escanear novamente."}
          </p>
          <p className="mt-3 text-xs text-muted-foreground">Tempo decorrido: {Math.floor(syncSeconds / 60)}m {String(syncSeconds % 60).padStart(2, "0")}s · Verificação automática a cada 5 segundos</p>
        </div>
        {statusError && <div role="alert" className="rounded-lg border border-red-500/25 bg-red-500/5 p-3 text-xs text-red-600 dark:text-red-400">{statusError}</div>}
        <p className="text-xs text-muted-foreground">A confirmação depende do estado real da sessão no servidor; não marcamos como conectado antes disso.</p>
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
