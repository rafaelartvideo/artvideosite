import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Clock3, Hash, Loader2, RefreshCw, Smartphone, Wifi, WifiOff } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { queryKeys } from "@/infrastructure/query/query-keys";
import { AdminButton, AdminDialog } from "@/shared/ui/admin/AdminLayout";
import {
  closeMobileOrderEditSession,
  createMobileOrderEditSession,
  pollMobileOrderEditSession,
  type MobileOrderEditSession,
} from "../infrastructure/order-mobile-edit.gateway";

function formatPairingCode(code: string) {
  const digits = code.replace(/\D/g, "").slice(0, 8);
  return digits.length > 4 ? `${digits.slice(0, 4)} ${digits.slice(4)}` : digits;
}

export function OrderMobileEditBridge({
  orderId,
  osNumber,
  disabled = false,
}: {
  orderId: string;
  osNumber?: string | null;
  disabled?: boolean;
}) {
  const { activeOrganizationId } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState<MobileOrderEditSession | null>(null);
  const [creating, setCreating] = useState(false);
  const [connected, setConnected] = useState(false);
  const [expired, setExpired] = useState(false);
  const [error, setError] = useState("");
  const [savedChanges, setSavedChanges] = useState(0);
  const sessionRef = useRef<MobileOrderEditSession | null>(null);
  const lastOrderUpdateRef = useRef("");
  const pollingRef = useRef(false);

  sessionRef.current = session;

  const startSession = useCallback(async () => {
    if (!activeOrganizationId || disabled || creating || !orderId) return;
    setCreating(true);
    setError("");
    setExpired(false);
    setConnected(false);
    setSavedChanges(0);
    lastOrderUpdateRef.current = "";
    try {
      if (sessionRef.current) await closeMobileOrderEditSession(sessionRef.current.id).catch(() => undefined);
      const next = await createMobileOrderEditSession(activeOrganizationId, orderId);
      sessionRef.current = next;
      setSession(next);
    } catch (nextError) {
      setSession(null);
      setError(nextError instanceof Error ? nextError.message : "Não foi possível iniciar a edição pelo celular.");
    } finally {
      setCreating(false);
    }
  }, [activeOrganizationId, creating, disabled, orderId]);

  const openBridge = () => {
    setOpen(true);
    if (!sessionRef.current || expired) void startSession();
  };

  const endSession = async () => {
    const current = sessionRef.current;
    if (current) await closeMobileOrderEditSession(current.id).catch(() => undefined);
    sessionRef.current = null;
    setSession(null);
    setConnected(false);
    setExpired(false);
    setSavedChanges(0);
    lastOrderUpdateRef.current = "";
  };

  useEffect(() => () => {
    const current = sessionRef.current;
    if (current) void closeMobileOrderEditSession(current.id).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!session || expired) return;
    let cancelled = false;
    const poll = async () => {
      if (cancelled || pollingRef.current) return;
      pollingRef.current = true;
      try {
        const result = await pollMobileOrderEditSession(session.id);
        if (cancelled) return;
        const status = String(result.status || "active");
        setConnected(Boolean(result.connected));
        if (status !== "active") {
          setExpired(true);
          setConnected(false);
        }
        const updatedAt = String(result.order_updated_at || "");
        if (updatedAt && updatedAt !== lastOrderUpdateRef.current) {
          if (lastOrderUpdateRef.current) setSavedChanges(current => current + 1);
          else setSavedChanges(1);
          lastOrderUpdateRef.current = updatedAt;
          void queryClient.invalidateQueries({ queryKey: queryKeys.orders.all });
        }
      } catch (pollError) {
        if (!cancelled) setError(pollError instanceof Error ? pollError.message : "Falha ao acompanhar o celular.");
      } finally {
        pollingRef.current = false;
      }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 1500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [session?.id, expired, queryClient]);

  const editUrl = session
    ? `${window.location.origin}/editar-os-mobile?session=${encodeURIComponent(session.id)}&token=${encodeURIComponent(session.token)}`
    : "";
  const expiryLabel = session?.expiresAt
    ? new Date(session.expiresAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : "";

  return (
    <>
      <AdminButton
        variant={connected ? "primary" : "secondary"}
        size="sm"
        disabled={disabled || !activeOrganizationId}
        onClick={openBridge}
        className={connected ? "bg-emerald-600 hover:bg-emerald-700" : "border-[#0057e7]/25 text-[#0057e7] hover:bg-[#0057e7]/5"}
        title="Abrir a edição desta OS no celular"
      >
        <Smartphone size={14} />
        <span>{connected ? "Celular conectado" : "Editar pelo celular"}</span>
        {connected && <span className="h-2 w-2 rounded-full bg-white" />}
      </AdminButton>

      <AdminDialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Editar OS ${osNumber ? `#${osNumber}` : ""} pelo celular`}
        description="Escaneie o QR no celular. A conexão é temporária, abre somente esta OS e não exige login no celular."
        className="max-w-md"
      >
        <div className="space-y-4">
          {creating && <div className="flex min-h-64 flex-col items-center justify-center text-center"><Loader2 className="h-8 w-8 animate-spin text-[#0057e7]" /><p className="mt-3 text-sm font-bold text-[#5a6a82]">Gerando conexão segura...</p></div>}
          {!creating && error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div>}

          {!creating && session && !expired && <>
            <div className="flex justify-center rounded-2xl border border-[#0d1b2e]/8 bg-white p-5">
              <QRCodeSVG value={editUrl} size={220} level="M" marginSize={2} />
            </div>
            <div className="flex items-center justify-between gap-3 rounded-xl border border-[#0057e7]/20 bg-[#eef5ff] px-3 py-2">
              <p className="flex shrink-0 items-center gap-1.5 text-[9px] font-black uppercase tracking-wider text-[#0057e7]"><Hash size={12} /> Código</p>
              <p className="font-mono text-xl font-black tracking-[0.14em] text-[#0d1b2e] sm:text-2xl">{formatPairingCode(session.pairingCode)}</p>
            </div>
            <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${connected ? "border-emerald-200 bg-emerald-50" : "border-[#0057e7]/20 bg-[#eef5ff]"}`}>
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${connected ? "bg-emerald-600 text-white" : "bg-[#0057e7] text-white"}`}>{connected ? <Wifi size={17} /> : <Smartphone size={17} />}</span>
              <div className="min-w-0 flex-1"><p className={`text-sm font-black ${connected ? "text-emerald-700" : "text-[#0d1b2e]"}`}>{connected ? "Celular conectado" : "Aguardando o celular"}</p><p className="mt-0.5 text-xs text-[#5a6a82]">{connected ? "As alterações salvas no celular são aplicadas diretamente nesta OS." : "O QR abre diretamente a edição desta OS."}</p></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-[#0d1b2e]/8 bg-[#f8fafc] px-3 py-3"><p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-[#5a6a82]"><Clock3 size={12} /> Expira</p><p className="mt-1 text-sm font-black text-[#0d1b2e]">{expiryLabel}</p></div>
              <div className="rounded-xl border border-[#0d1b2e]/8 bg-[#f8fafc] px-3 py-3"><p className="text-[10px] font-black uppercase tracking-wider text-[#5a6a82]">Salvamentos</p><p className="mt-1 text-sm font-black text-[#0d1b2e]">{savedChanges}</p></div>
            </div>
            {savedChanges > 0 && <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs font-bold text-emerald-700"><CheckCircle2 size={15} /> Alterações recebidas do celular.</div>}
            <p className="text-center text-[11px] leading-5 text-[#5a6a82]">O token expira automaticamente e permite acesso somente à OS vinculada.</p>
            <div className="flex justify-end"><AdminButton variant="secondary" onClick={() => void endSession()}><WifiOff size={14} /> Encerrar conexão</AdminButton></div>
          </>}

          {!creating && expired && <div className="space-y-4 text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-700"><Clock3 size={22} /></div><div><p className="text-base font-black text-[#0d1b2e]">A conexão expirou</p><p className="mt-1 text-sm text-[#5a6a82]">Gere outra conexão para continuar editando pelo celular.</p></div><AdminButton onClick={() => void startSession()}><RefreshCw size={14} /> Gerar nova conexão</AdminButton></div>}
          {!creating && !session && !error && <AdminButton onClick={() => void startSession()} className="w-full"><Smartphone size={15} /> Gerar conexão</AdminButton>}
          {!creating && !session && error && <div className="flex justify-end"><AdminButton onClick={() => void startSession()}><RefreshCw size={14} /> Tentar novamente</AdminButton></div>}
        </div>
      </AdminDialog>
    </>
  );
}
