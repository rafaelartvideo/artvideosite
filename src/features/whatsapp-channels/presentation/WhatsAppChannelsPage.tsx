import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, CircleAlert, MessageCircle, QrCode, RefreshCw, ShieldCheck, Smartphone, Unplug } from "lucide-react";
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
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [qrOpen, setQrOpen] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [confirmLogout, setConfirmLogout] = useState(false);

  const load = useCallback(async () => {
    if (!activeOrganizationId || !canView) {
      setChannel(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const result = await operateWhatsAppChannel(activeOrganizationId, "list");
      setChannel(result.channel ?? null);
    } catch (e) {
      setError(systemErrorMessage(e, "Não foi possível carregar os canais."));
    } finally {
      setLoading(false);
    }
  }, [activeOrganizationId, canView]);

  useEffect(() => {
    setQr(null);
    setQrOpen(false);
    setConfirmLogout(false);
    void load();
  }, [load]);

  const perform = useCallback(async (operation: "register" | "provision" | "connect" | "status" | "qr" | "logout") => {
    if (!activeOrganizationId || !canManage && operation !== "status" || action) return;
    setAction(operation);
    setError("");
    setNotice("");
    try {
      const result = await operateWhatsAppChannel(activeOrganizationId, operation, channel?.id);
      if (result.channel) setChannel(result.channel);
      if (operation === "qr") setQr(result.qr || null);
      if (operation === "register") setNotice("Canal cadastrado para esta empresa.");
      if (operation === "provision") setNotice("Sessão provisionada na VPS.");
      if (operation === "connect") setNotice("Conexão iniciada. Escaneie o QR Code.");
      if (operation === "logout") {
        setQr(null); setQrOpen(false); setConfirmLogout(false);
        setNotice("WhatsApp desconectado da Union.");
      }
      if (operation === "status" && result.logged_in) {
        setQr(null); setQrOpen(false);
      }
    } catch (e) {
      setError(systemErrorMessage(e, "Não foi possível comunicar com o WuzAPI."));
    } finally {
      setAction(null);
    }
  }, [activeOrganizationId, action, canManage, channel?.id]);

  // Only poll while the QR dialog is open. Never run a background polling loop.
  useEffect(() => {
    if (!qrOpen || !channel || !activeOrganizationId || !canManage) return;
    const timer = window.setInterval(async () => {
      try {
        const result = await operateWhatsAppChannel(activeOrganizationId, "status", channel.id);
        if (result.channel) setChannel(result.channel);
        if (result.logged_in) { setQr(null); setQrOpen(false); return; }
        const next = await operateWhatsAppChannel(activeOrganizationId, "qr", channel.id);
        if (next.qr) setQr(next.qr);
      } catch { /* Keep manual retry available; do not spam global notifications. */ }
    }, 7000);
    return () => window.clearInterval(timer);
  }, [qrOpen, channel?.id, activeOrganizationId, canManage]);

  const openQr = async () => {
    setQrOpen(true);
    if (!channel) return;
    if (channel.state === "not_connected" || channel.state === "disconnected" || channel.state === "error") {
      await perform("connect");
    }
    await perform("qr");
  };

  if (!canView) return <div className="p-5 text-sm text-muted-foreground">Você não possui permissão para visualizar canais de atendimento nesta empresa.</div>;

  return <div className="space-y-5">
    <PageHeader title="Canais de Atendimento" subtitle="Conecte o WhatsApp Business da empresa ativa por QR Code e acompanhe o estado da sessão."
      actions={<AdminButton variant="secondary" onClick={onBack}>Voltar</AdminButton>} />
    {error && <div role="alert" className="rounded-xl border border-red-500/25 bg-red-500/5 p-4 text-sm text-red-600 dark:text-red-400">{error}</div>}
    {notice && <div role="status" className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-4 text-sm text-emerald-700 dark:text-emerald-400">{notice}</div>}
    {loading ? <LoadingState text="Carregando canais..." /> :
      <AdminCard>
        <AdminCardHeader>
          <div className="flex min-w-0 items-center gap-3">
            <span className="rounded-lg bg-blue-500/10 p-2 text-blue-600"><MessageCircle size={21}/></span>
            <div><h2 className="text-sm font-bold">WhatsApp Business</h2>
              <p className="text-xs text-muted-foreground">WuzAPI · conexão via QR Code</p></div>
          </div>
          <span className={`rounded-lg px-2 py-1 text-xs font-bold ${channel?.state === "connected" ? "bg-emerald-500/10 text-emerald-600" : "bg-muted text-muted-foreground"}`}>
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
              <div><p className="text-xs text-muted-foreground">Número</p><p className="mt-1 text-sm font-semibold">{channel.phone || "Aguardando vinculação"}</p></div>
              <div><p className="text-xs text-muted-foreground">Última verificação</p><p className="mt-1 text-sm">{dateLabel(channel.last_checked_at)}</p></div>
              <div><p className="text-xs text-muted-foreground">Última conexão</p><p className="mt-1 text-sm">{dateLabel(channel.last_connected_at)}</p></div>
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-border pt-4">
              {canManage && channel.state === "not_connected" && <AdminButton disabled={Boolean(action)} loading={action === "provision"} onClick={() => void perform("provision")}>Preparar sessão</AdminButton>}
              {canManage && channel.state !== "connected" && channel.state !== "not_connected" && <AdminButton disabled={Boolean(action)} onClick={() => void openQr()}><QrCode size={16}/> Conectar QR Code</AdminButton>}
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
    <AdminDialog open={qrOpen} onClose={() => {setQrOpen(false);setQr(null);}} title="Conectar WhatsApp"
      description="Abra WhatsApp Business no celular, entre em Aparelhos conectados e escaneie o QR Code."
      footer={<AdminButton variant="secondary" onClick={() => {setQrOpen(false);setQr(null);}}>Fechar</AdminButton>}>
      <div className="flex min-h-[300px] flex-col items-center justify-center gap-4 p-5">
        {qr
          ? <img src={qr} width={240} height={240} className="rounded-lg bg-white p-3" alt="QR Code temporário para conectar WhatsApp da empresa"/>
          : <div className="flex flex-col items-center gap-3 text-sm text-muted-foreground"><QrCode size={64}/><span>Gerando QR Code...</span></div>}
        <AdminButton variant="secondary" loading={action === "qr"} disabled={Boolean(action)} onClick={() => void perform("qr")}><RefreshCw size={16}/> Atualizar QR Code</AdminButton>
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
