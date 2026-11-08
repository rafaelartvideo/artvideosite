import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Clock3, Hash, Loader2, RefreshCw, Smartphone, Wifi, WifiOff } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import { queryKeys } from "@/infrastructure/query/query-keys";
import { AdminButton, AdminDialog } from "@/shared/ui/admin/AdminLayout";
import { AdminUseMobileButton } from "@/shared/ui/admin/AdminUseMobileButton";
import {
  subscribeMobileSessionRealtime,
  type MobileSessionRealtimeRow,
} from "@/features/device-capture/infrastructure/mobile-session-realtime";
import {
  closeMobileOrderChecklistSession,
  createMobileOrderChecklistSession,
  type MobileOrderChecklistSession,
} from "../infrastructure/order-mobile-checklist.gateway";

function formatPairingCode(code: string) {
  const digits = code.replace(/\D/g, "").slice(0, 8);
  return digits.length > 4 ? `${digits.slice(0, 4)} ${digits.slice(4)}` : digits;
}

export function OrderChecklistMobileBridge({
  orderId,
  osNumber,
  disabled = false,
  scope = "checklist",
  onDocumentsUpdated,
}: {
  orderId: string;
  osNumber?: string | null;
  disabled?: boolean;
  scope?: "checklist" | "documents" | "payment-proof";
  onDocumentsUpdated?: () => void;
}) {
  const { activeOrganizationId } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState<MobileOrderChecklistSession | null>(null);
  const [creating, setCreating] = useState(false);
  const [ending, setEnding] = useState(false);
  const [connected, setConnected] = useState(false);
  const [expired, setExpired] = useState(false);
  const [error, setError] = useState("");
  const [savedChanges, setSavedChanges] = useState(0);
  const sessionRef = useRef<MobileOrderChecklistSession | null>(null);
  const lastChecklistUpdateRef = useRef("");
  const errorRef = useRef("");

  sessionRef.current = session;
  errorRef.current = error;

  const startSession = useCallback(async () => {
    if (!activeOrganizationId || disabled || creating || !orderId) return;
    setCreating(true);
    setError("");
    setExpired(false);
    setConnected(false);
    setSavedChanges(0);
    lastChecklistUpdateRef.current = "";

    try {
      if (sessionRef.current) {
        await closeMobileOrderChecklistSession(sessionRef.current.id).catch(() => undefined);
      }
      const next = await createMobileOrderChecklistSession(activeOrganizationId, orderId, scope);
      sessionRef.current = next;
      setSession(next);
    } catch (nextError) {
      setSession(null);
      setError(nextError instanceof Error ? nextError.message : "Não foi possível iniciar o checklist pelo celular.");
    } finally {
      setCreating(false);
    }
  }, [activeOrganizationId, creating, disabled, orderId, scope]);

  const openBridge = () => {
    setOpen(true);
    if (!sessionRef.current || expired) void startSession();
  };

  const endSession = async () => {
    const current = sessionRef.current;
    if (!current || ending) return;
    setEnding(true);
    setError("");
    try {
      await closeMobileOrderChecklistSession(current.id);
      sessionRef.current = null;
      setSession(null);
      setConnected(false);
      setExpired(false);
      setSavedChanges(0);
      lastChecklistUpdateRef.current = "";
    } catch (closeError) {
      setOpen(true);
      setError(closeError instanceof Error ? closeError.message : "Não foi possível encerrar a conexão.");
    } finally {
      setEnding(false);
    }
  };

  useEffect(() => {
    if (!session || expired) return;
    let cancelled = false;

    const applyUpdatedAt = (updatedAt: string) => {
      if (!updatedAt || updatedAt === lastChecklistUpdateRef.current) return;
      if (lastChecklistUpdateRef.current) setSavedChanges(current => current + 1);
      else setSavedChanges(1);
      lastChecklistUpdateRef.current = updatedAt;
      if (scope === "payment-proof") {
        void Promise.resolve().then(() => onDocumentsUpdated?.()).catch(error => {
          setError(error instanceof Error ? error.message : "Não foi possível confirmar o comprovante recebido.");
        });
      }
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.checklists.order(orderId) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.orders.all }),
        queryClient.invalidateQueries({
          predicate: query => query.queryKey[0] === "orders"
            && query.queryKey[2] === orderId && query.queryKey[3] === "situation-documents",
        }),
      ]);
    };

    const applySessionRow = (row: MobileSessionRealtimeRow) => {
      if (cancelled) return;
      const status = String(row.status || "active");
      const expiresAt = row.expires_at ? Date.parse(row.expires_at) : NaN;
      const isExpired = status !== "active" || (Number.isFinite(expiresAt) && expiresAt <= Date.now());
      if (isExpired) {
        setExpired(true);
        setConnected(false);
        return;
      }

      applyUpdatedAt(String(row.order_updated_at || ""));
    };

    const unsubscribe = subscribeMobileSessionRealtime({
      sessionId: session.id,
      presenceRole: "desktop",
      onMobilePresenceChange: value => {
        if (!cancelled) {
          setConnected(value);
          if (value && !errorRef.current) setOpen(false);
        }
      },
      onSessionChange: applySessionRow,
    });

    const expiresAtMs = Date.parse(session.expiresAt);
    const expiryTimer = Number.isFinite(expiresAtMs)
      ? window.setTimeout(() => {
          if (!cancelled) {
            setExpired(true);
            setConnected(false);
          }
        }, Math.max(0, expiresAtMs - Date.now()) + 250)
      : null;

    return () => {
      cancelled = true;
      if (expiryTimer !== null) window.clearTimeout(expiryTimer);
      unsubscribe();
    };
  }, [session?.id, expired, orderId, queryClient, scope, onDocumentsUpdated]);

  const checklistUrl = session
    ? `${window.location.origin}/checklist-mobile?session=${encodeURIComponent(session.id)}&token=${encodeURIComponent(session.token)}${scope === "payment-proof" ? "&mode=payment-proof" : scope === "documents" ? "&mode=documents" : ""}`
    : "";
  const expiryLabel = session?.expiresAt
    ? new Date(session.expiresAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : "";

  return (
    <>
      <AdminUseMobileButton
        connected={connected}
        showOnMobile={scope === "payment-proof"}
        disabled={disabled || !activeOrganizationId}
        onClick={openBridge}
        title={scope === "payment-proof" ? "Anexar comprovante de pagamento pelo celular" : scope === "documents" ? "Adicionar anexos, preencher checklist e fotografar situações da OS" : "Fazer o checklist desta OS pelo celular"}
      />

      <AdminDialog
        open={open}
        onClose={() => setOpen(false)}
        title={`${scope === "payment-proof" ? "Comprovante de pagamento" : scope === "documents" ? "Documentos" : "Checklist"} da OS ${osNumber ? `#${osNumber}` : ""} pelo celular`}
        description={scope === "payment-proof" ? "Escaneie o QR ou informe o código na página de captura. Envie a foto ou PDF do comprovante com vinculação automática à OS."
          : scope === "documents"
          ? "Escaneie o QR Code para acessar os documentos da OS pelo celular, sem precisar fazer login."
          : "Escaneie o QR no celular. A conexão é temporária e abre somente o checklist desta OS, sem exigir login no celular."}
        className="max-w-md"
      >
        <div className="space-y-4">
          {creating && (
            <div className="flex min-h-64 flex-col items-center justify-center text-center">
              <Loader2 className="h-8 w-8 animate-spin text-[#0057e7]" />
              <p className="mt-3 text-sm font-bold text-[#5a6a82]">Gerando conexão segura...</p>
            </div>
          )}

          {!creating && error && (
            <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              {error}
            </div>
          )}

          {!creating && session && !expired && (
            <>
              <div className="flex justify-center rounded-2xl border border-[#0d1b2e]/8 bg-white p-5">
                <QRCodeSVG value={checklistUrl} size={220} level="M" marginSize={2} />
              </div>

                            <div className="flex min-w-0 items-center gap-2 rounded-xl border border-[#0057e7]/20 bg-[#eef5ff] px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-[#0057e7]"><Hash size={12} /> Código</p>
                  <p className="whitespace-nowrap font-mono text-base font-black tracking-[0.07em] text-[#0d1b2e] sm:text-xl">{formatPairingCode(session.pairingCode)}</p>
                </div>
                <AdminButton variant="secondary" size="sm" className="shrink-0 !px-2 sm:!px-3"
                  disabled={ending} loading={ending} loadingText="Encerrando..."
                  onClick={() => void endSession()}><WifiOff size={14} /> <span className="sm:hidden">Encerrar</span><span className="hidden sm:inline">Encerrar conexão</span></AdminButton>
              </div>
              <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${connected ? "border-emerald-200 bg-emerald-50" : "border-[#0057e7]/20 bg-[#eef5ff]"}`}>
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${connected ? "bg-emerald-600 text-white" : "bg-[#0057e7] text-white"}`}>
                  {connected ? <Wifi size={17} /> : <Smartphone size={17} />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-black ${connected ? "text-emerald-700" : "text-[#0d1b2e]"}`}>
                    {connected ? "Celular conectado" : "Aguardando o celular"}
                  </p>
                  <p className="mt-0.5 text-xs text-[#5a6a82]">
                    {connected ? "Os registros enviados pelo celular aparecem automaticamente na OS." : scope === "payment-proof" ? "O comprovante aparece automaticamente na conclusão da OS." : scope === "documents" ? "O QR abre anexos, checklist e fotos das situações desta OS." : "O QR abre diretamente o checklist desta OS."}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl border border-[#0d1b2e]/8 bg-[#f8fafc] px-3 py-3">
                  <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-[#5a6a82]">
                    <Clock3 size={12} /> Expira
                  </p>
                  <p className="mt-1 text-sm font-black text-[#0d1b2e]">{expiryLabel}</p>
                </div>
                <div className="rounded-xl border border-[#0d1b2e]/8 bg-[#f8fafc] px-3 py-3">
                  <p className="text-[10px] font-black uppercase tracking-wider text-[#5a6a82]">Alterações</p>
                  <p className="mt-1 text-sm font-black text-[#0d1b2e]">{savedChanges}</p>
                </div>
              </div>

              {savedChanges > 0 && (
                <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs font-bold text-emerald-700">
                  <CheckCircle2 size={15} /> {scope === "documents" ? "Documentos atualizados pelo celular." : "Checklist atualizado pelo celular."}
                </div>
              )}

              <p className="text-center text-[11px] leading-5 text-[#5a6a82]">
                O token expira automaticamente e permite acesso somente aos recursos autorizados desta OS.
              </p>

            </>
          )}

          {!creating && expired && (
            <div className="space-y-4 text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                <Clock3 size={22} />
              </div>
              <div>
                <p className="text-base font-black text-[#0d1b2e]">A conexão expirou</p>
                <p className="mt-1 text-sm text-[#5a6a82]">{scope === "documents" ? "Gere outra conexão para continuar os documentos pelo celular." : "Gere outra conexão para continuar o checklist pelo celular."}</p>
              </div>
              <AdminButton onClick={() => void startSession()}>
                <RefreshCw size={14} /> Gerar nova conexão
              </AdminButton>
            </div>
          )}

          {!creating && !session && !error && (
            <AdminButton onClick={() => void startSession()} className="w-full">
              <Smartphone size={15} /> Gerar conexão
            </AdminButton>
          )}

          {!creating && !session && error && (
            <div className="flex justify-end">
              <AdminButton onClick={() => void startSession()}>
                <RefreshCw size={14} /> Tentar novamente
              </AdminButton>
            </div>
          )}
        </div>
      </AdminDialog>
    </>
  );
}
