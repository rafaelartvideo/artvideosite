import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, CircleAlert, LoaderCircle, MessageCircle, QrCode, RefreshCw, Settings2, ShieldCheck, Smartphone, Unplug } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { AdminButton, AdminCard, AdminCardContent, AdminCardHeader, AdminDialog, PageHeader } from "@/shared/ui/admin/AdminLayout";
import { LoadingState } from "@/shared/ui/admin/AdminFeedback";
import { operateWhatsAppChannel, type WhatsAppChannel } from "../infrastructure/whatsapp-channels.repository";

const dateLabel = (value: string | null) =>
  value ? new Date(value).toLocaleString("pt-BR") : "Ainda não verificado";

export function WhatsAppChannelsPage({ onBack, onOpenInbox }: { onBack: () => void; onOpenInbox?: () => void }) {
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
      if (operation === "activate") setNotice("WhatsApp ativado. Agora basta conectar seu número.");
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

  return <div className="space-y-5">
    <PageHeader title="Canais de Atendimento" subtitle="Ative o canal e gerencie os números conectados em áreas separadas."
      actions={<AdminButton variant="secondary" onClick={onBack}>Voltar</AdminButton>} />
    {error && <div role="alert" className="rounded-xl border border-red-500/25 bg-red-500/5 p-4 text-sm text-red-600 dark:text-red-400">{error}</div>}
    {notice && <div role="status" className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4 text-sm text-emerald-700 dark:text-emerald-400">{notice}</div>}
    {loading ? <LoadingState text="Carregando canais..." /> : <>
      <AdminCard>
        <AdminCardHeader>
          <div className="flex min-w-0 items-center gap-3">
            <span className="rounded-xl bg-blue-500/10 p-2.5 text-blue-600"><Settings2 size={20}/></span>
            <div><h2 className="text-sm font-bold">Configuração do canal</h2>
              <p className="mt-1 text-xs text-muted-foreground">Ativação e recebimento de mensagens</p></div>
          </div>
          <span className={enabled ? "rounded-lg bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400" : "rounded-lg bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground"}>
            {enabled ? "Ativado" : "Desativado"}
          </span>
        </AdminCardHeader>
        <AdminCardContent className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold">WhatsApp da empresa</p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">Ao ativar, a Union cadastra e prepara a integração segura de uma vez. Depois você só precisa conectar o número.</p>
            </div>
            {!enabled && canManage && <AdminButton disabled={Boolean(action)} loading={action === "activate"} onClick={() => void perform("activate")}>Ativar WhatsApp</AdminButton>}
          </div>
          {enabled && <div className="grid gap-4 rounded-xl border border-border bg-muted/20 p-4 sm:grid-cols-2">
            <div className="flex items-start gap-2.5">
              <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-600"/>
              <div><p className="text-sm font-semibold">Integração preparada</p><p className="mt-1 text-xs text-muted-foreground">Canal habilitado e sessão segura criada para esta empresa.</p></div>
            </div>
            <div className="flex items-start gap-2.5">
              {receiving ? <ShieldCheck size={18} className="mt-0.5 shrink-0 text-emerald-600"/> :
                connected ? <LoaderCircle size={18} className="mt-0.5 shrink-0 animate-spin text-amber-600 motion-reduce:animate-none"/> :
                  <CircleAlert size={18} className="mt-0.5 shrink-0 text-muted-foreground"/>}
              <div><p className="text-sm font-semibold">Recebimento de mensagens</p>
                <p className="mt-1 text-xs text-muted-foreground">{receiving ? "Autenticado e ativo." :
                  connected ? "Número conectado. Finalizando configuração automaticamente." :
                    "Será ativado automaticamente após conectar o número."}</p></div>
            </div>
          </div>}
          {connected && !channel?.webhook_ready && canManage && <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-500/25 p-3">
            <p className="text-xs text-muted-foreground">Se a ativação do recebimento continuar pendente, confira a ponte de integração.</p>
            <AdminButton variant="secondary" size="sm" disabled={Boolean(action)} loading={action === "webhook_setup"} onClick={() => void perform("webhook_setup")}>
              <RefreshCw size={15}/> Tentar novamente
            </AdminButton>
          </div>}
        </AdminCardContent>
      </AdminCard>

      <AdminCard>
        <AdminCardHeader>
          <div className="flex min-w-0 items-center gap-3">
            <span className="rounded-xl bg-blue-500/10 p-2.5 text-blue-600"><Smartphone size={20}/></span>
            <div><h2 className="text-sm font-bold">Conexões</h2>
              <p className="mt-1 text-xs text-muted-foreground">Gerencie o número vinculado ao canal</p></div>
          </div>
          <span className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${statusClass}`}>
            {!enabled ? "Não habilitado" : connected ? "Conectado" : channel?.state === "connecting" ? "Conectando" : "Sem número"}
          </span>
        </AdminCardHeader>
        <AdminCardContent className="space-y-4">
          {!enabled ? <div className="flex items-center gap-3 rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">
            <Smartphone size={21} className="shrink-0"/>Ative o canal acima para conectar um número.
          </div> : <>
            <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border p-4">
              <div className="flex min-w-0 items-center gap-3">
                <span className="rounded-xl bg-emerald-500/10 p-3 text-emerald-600"><MessageCircle size={20}/></span>
                <div><p className="text-sm font-semibold">{channel?.display_name || "WhatsApp"}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{connected ?
                    (channel?.phone || "Conectado · número não identificado") :
                    channel?.state === "connecting" ? "Aguardando confirmação do WhatsApp" : "Nenhum número conectado"}</p></div>
              </div>
              <div className="flex flex-wrap gap-2">
                {canManage && !connected && <AdminButton disabled={Boolean(action)} loading={action === "connect"} onClick={() => void openQr()}>
                  <QrCode size={16}/> Conectar número
                </AdminButton>}
                {connected && onOpenInbox && <AdminButton disabled={Boolean(action) || !receiving} onClick={onOpenInbox}>
                  <MessageCircle size={16}/> Abrir conversas
                </AdminButton>}
                {canManage && connected && <AdminButton variant="danger" disabled={Boolean(action)} onClick={() => setConfirmLogout(true)}>
                  <Unplug size={16}/> Desconectar
                </AdminButton>}
              </div>
            </div>
            <div className="grid gap-3 px-1 text-xs text-muted-foreground sm:grid-cols-2">
              <p>Última verificação: <span className="font-medium text-foreground">{dateLabel(channel?.last_checked_at ?? null)}</span></p>
              <p>Última conexão: <span className="font-medium text-foreground">{dateLabel(channel?.last_connected_at ?? null)}</span></p>
            </div>
            {channel?.state === "connecting" && <div role="status" className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3 text-sm">
              <LoaderCircle size={18} className="mt-0.5 shrink-0 animate-spin text-amber-600 motion-reduce:animate-none"/>
              <span>Esperando o WhatsApp confirmar o número. A verificação é automática.</span>
            </div>}
            {statusError && <div role="alert" className="flex items-start gap-2 text-xs text-red-600 dark:text-red-400"><CircleAlert size={16}/>{statusError}</div>}
          </>}
        </AdminCardContent>
      </AdminCard>
    </>}
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
