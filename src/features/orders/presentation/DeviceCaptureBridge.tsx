import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Clock3, Hash, Loader2, RefreshCw, Smartphone, Wifi, WifiOff } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useAuth } from "@/lib/auth";
import { AdminButton, AdminDialog } from "@/shared/ui/admin/AdminLayout";
import {
  subscribeMobileSessionRealtime,
  type MobileSessionRealtimeRow,
} from "@/features/device-capture/infrastructure/mobile-session-realtime";
import {
  applyDeviceEntryChecklistAnswer,
  applyDeviceEntryChecklistPhoto,
  getNewOrderEntryChecklistDraft,
  subscribeNewOrderEntryChecklistDraft,
} from "@/features/checklists/application/new-order-entry-checklist";
import {
  bindDeviceCaptureChecklist,
  closeDeviceCaptureSession,
  createDeviceCaptureSession,
  syncProductCapturePhotos,
  pollDeviceCaptureSession,
  pollDeviceChecklistEvents,
  type DeviceCapturePhotoKind,
  type DeviceCaptureSession,
} from "../infrastructure/device-capture.gateway";

function formatPairingCode(code: string) {
  const digits = code.replace(/\D/g, "").slice(0, 8);
  return digits.length > 4 ? `${digits.slice(0, 4)} ${digits.slice(4)}` : digits;
}

async function signedUrlToFile(signedUrl: string, fileName: string, mimeType: string, fallbackId: number) {
  const response = await fetch(signedUrl);
  if (!response.ok) throw new Error("Não foi possível baixar a foto recebida.");
  const blob = await response.blob();
  return new File([blob], fileName || `foto-${fallbackId}.jpg`, {
    type: mimeType || blob.type || "image/jpeg",
    lastModified: Date.now(),
  });
}

export function DeviceCaptureBridge({
  disabled = false,
  context = "order",
  equipmentTypeId,
  onSerial,
  onPhoto,
  productPhotoCount,
  productHasCover,
}: {
  disabled?: boolean;
  context?: "order" | "product";
  equipmentTypeId?: string | null;
  onSerial: (serial: string) => void;
  onPhoto: (file: File, kind: DeviceCapturePhotoKind) => void | Promise<void>;
  productPhotoCount?: number;
  productHasCover?: boolean;
}) {
  const { activeOrganizationId } = useAuth();
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState<DeviceCaptureSession | null>(null);
  const [creating, setCreating] = useState(false);
  const [ending, setEnding] = useState(false);
  const [connected, setConnected] = useState(false);
  const [expired, setExpired] = useState(false);
  const [error, setError] = useState("");
  const [receivedPhotos, setReceivedPhotos] = useState(0);
  const [receivedChecklistChanges, setReceivedChecklistChanges] = useState(0);
  const [lastSerial, setLastSerial] = useState("");
  const lastEventIdRef = useRef(0);
  const lastChecklistEventIdRef = useRef(0);
  const pollingRef = useRef(false);
  const refreshQueuedRef = useRef(false);
  const sessionRef = useRef<DeviceCaptureSession | null>(null);
  const errorRef = useRef("");
  const onSerialRef = useRef(onSerial);
  const onPhotoRef = useRef(onPhoto);
  const photoSyncQueueRef = useRef<Promise<void>>(Promise.resolve());

  sessionRef.current = session;
  errorRef.current = error;
  onSerialRef.current = onSerial;
  onPhotoRef.current = onPhoto;

  const resetCounters = () => {
    setReceivedPhotos(0);
    setReceivedChecklistChanges(0);
    setLastSerial("");
    lastEventIdRef.current = 0;
    lastChecklistEventIdRef.current = 0;
  };

  const currentEquipmentTypeId = () => context === "product" ? null : equipmentTypeId || getNewOrderEntryChecklistDraft()?.equipmentTypeId || null;

  const startSession = useCallback(async () => {
    if (!activeOrganizationId || disabled || creating) return;
    setCreating(true);
    setError("");
    setExpired(false);
    setConnected(false);
    resetCounters();
    try {
      if (sessionRef.current) {
        await closeDeviceCaptureSession(sessionRef.current.id, sessionRef.current.token).catch(() => undefined);
      }
      const nextSession = await createDeviceCaptureSession(activeOrganizationId, currentEquipmentTypeId(), context);
      sessionRef.current = nextSession;
      setSession(nextSession);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Não foi possível iniciar a conexão com o celular.");
      setSession(null);
    } finally {
      setCreating(false);
    }
  }, [activeOrganizationId, disabled, creating, equipmentTypeId, context]);

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
      await closeDeviceCaptureSession(current.id, current.token);
      sessionRef.current = null;
      setSession(null);
      setConnected(false);
      setExpired(false);
      resetCounters();
    } catch (closeError) {
      setOpen(true);
      setError(closeError instanceof Error ? closeError.message : "Não foi possível encerrar a conexão. Tente novamente.");
    } finally {
      setEnding(false);
    }
  };

  useEffect(() => {
    if (context !== "product" || !session?.id || expired || typeof productPhotoCount !== "number") return;
    const sessionId = session.id;
    const count = Math.min(4, Math.max(0, productPhotoCount));
    const hasCover = Boolean(productHasCover);
    // Serializar mudanças rápidas (remover, trocar, definir capa) evita aplicar contagem antiga.
    photoSyncQueueRef.current = photoSyncQueueRef.current.catch(() => undefined).then(async () => {
      if (sessionRef.current?.id !== sessionId) return;
      await syncProductCapturePhotos(sessionId, count, hasCover);
    }).catch(syncError => {
      if (sessionRef.current?.id === sessionId) {
        setError(syncError instanceof Error ? syncError.message : "Falha ao sincronizar fotos com o celular.");
        setOpen(true);
      }
    });
  }, [context, session?.id, expired, productPhotoCount, productHasCover]);

  useEffect(() => () => {
    const current = sessionRef.current;
    if (current) void closeDeviceCaptureSession(current.id, current.token).catch(() => undefined);
  }, []);

  useEffect(() => {
    const bindCurrentDraft = () => {
      const current = sessionRef.current;
      if (!current) return;
      lastChecklistEventIdRef.current = 0;
      void bindDeviceCaptureChecklist(current.id, currentEquipmentTypeId()).catch(bindError => {
        setError(bindError instanceof Error ? bindError.message : "Não foi possível vincular o checklist ao celular.");
      });
    };
    const unsubscribe = context === "order" ? subscribeNewOrderEntryChecklistDraft(bindCurrentDraft) : () => undefined;
    if (context === "order") bindCurrentDraft();
    return unsubscribe;
  }, [session?.id, equipmentTypeId, context]);

  useEffect(() => {
    if (!session || expired) return;
    let cancelled = false;

    const applySessionRow = (row: MobileSessionRealtimeRow) => {
      if (cancelled) return;
      const status = String(row.status || "active");
      const expiresAt = row.expires_at ? Date.parse(row.expires_at) : NaN;
      const isExpired = status !== "active" || (Number.isFinite(expiresAt) && expiresAt <= Date.now());
      if (isExpired) {
        setExpired(true);
        setConnected(false);
      }
    };

    const refresh = async () => {
      if (cancelled || document.visibilityState !== "visible") return;
      if (pollingRef.current) {
        refreshQueuedRef.current = true;
        return;
      }

      pollingRef.current = true;
      try {
        do {
          refreshQueuedRef.current = false;
          const checklistEnabled = context === "order" && Boolean(currentEquipmentTypeId());
          const [captureResult, checklistEvents] = await Promise.all([
            pollDeviceCaptureSession(session.id, lastEventIdRef.current),
            checklistEnabled
              ? pollDeviceChecklistEvents(session.id, session.token, lastChecklistEventIdRef.current)
              : Promise.resolve([]),
          ]);
          if (cancelled) return;

          if (captureResult.status !== "active") {
            setExpired(true);
            setConnected(false);
          } else if (captureResult.connected && !errorRef.current) {
            setConnected(true);
            setOpen(false);
          }

          for (const event of captureResult.events) {
            if (cancelled || event.id <= lastEventIdRef.current) continue;
            if (event.type === "serial") {
              const value = event.value.trim();
              if (value) {
                onSerialRef.current(value);
                setLastSerial(value);
              }
              lastEventIdRef.current = event.id;
              continue;
            }

            try {
              const file = await signedUrlToFile(event.signedUrl, event.fileName, event.mimeType, event.id);
              await onPhotoRef.current(file, event.kind);
              setReceivedPhotos(current => current + 1);
              lastEventIdRef.current = event.id;
            } catch (photoError) {
              setError(photoError instanceof Error ? photoError.message : "Não foi possível receber uma foto do celular.");
              setOpen(true);
              break;
            }
          }

          for (const event of checklistEvents) {
            if (cancelled || event.id <= lastChecklistEventIdRef.current) continue;
            if (event.type === "checklist") {
              applyDeviceEntryChecklistAnswer(event.itemKey, event.payload);
              setReceivedChecklistChanges(current => current + 1);
              lastChecklistEventIdRef.current = event.id;
              continue;
            }

            try {
              const file = await signedUrlToFile(event.signedUrl, event.fileName, event.mimeType, event.id);
              applyDeviceEntryChecklistPhoto(event.itemKey, file);
              setReceivedChecklistChanges(current => current + 1);
              lastChecklistEventIdRef.current = event.id;
            } catch (photoError) {
              setError(photoError instanceof Error ? photoError.message : "Não foi possível receber a foto do checklist.");
              setOpen(true);
              break;
            }
          }
        } while (refreshQueuedRef.current && !cancelled);
      } catch (pollError) {
        if (!cancelled) {
          setError(pollError instanceof Error ? pollError.message : "Falha na conexão com o celular.");
          setOpen(true);
        }
      } finally {
        pollingRef.current = false;
      }
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
      onEventInsert: () => void refresh(),
      onReady: () => void refresh(),
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

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      cancelled = true;
      refreshQueuedRef.current = false;
      if (expiryTimer !== null) window.clearTimeout(expiryTimer);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      unsubscribe();
    };
  }, [session?.id, session?.token, expired, equipmentTypeId, context]);

  const captureUrl = session
    ? `${window.location.origin}/captura?session=${encodeURIComponent(session.id)}&token=${encodeURIComponent(session.token)}&context=${context}`
    : "";
  const fixedCaptureUrl = `${window.location.origin}/captura`;
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
        className={connected ? "hidden md:inline-flex bg-[#1651ea] text-white hover:bg-[#1045ce]" : "hidden md:inline-flex border-[#0057e7]/25 text-[#0057e7] hover:bg-[#0057e7]/5"}
        title={context === "product" ? "Fotografar o produto e escanear seus códigos pelo celular" : "Usar a câmera do celular nesta OS"}
      >
        <Smartphone size={14} />
        <span>{connected ? "Celular conectado" : "Usar celular"}</span>
        {connected && <span className="relative ml-1 inline-flex h-2.5 w-2.5 shrink-0"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-300 opacity-70" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400 ring-1 ring-white/70" /></span>}
      </AdminButton>

      <AdminDialog
        open={open}
        onClose={() => setOpen(false)}
        title={context === "product" ? "Conectar celular ao produto" : "Conectar celular à Nova OS"}
        description="No celular, abra a página fixa de captura. Conecte escaneando o QR ou digitando o código exibido abaixo."
        className="max-w-md"
      >
        <div className="space-y-4">
          {creating && <div className="flex min-h-64 flex-col items-center justify-center text-center"><Loader2 className="h-8 w-8 animate-spin text-[#0057e7]" /><p className="mt-3 text-sm font-bold text-[#5a6a82]">Gerando conexão segura...</p></div>}

          {!creating && error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</div>}

          {!creating && session && !expired && <>
            <div className="flex justify-center rounded-2xl border border-[#0d1b2e]/8 bg-white p-5">
              <QRCodeSVG value={captureUrl} size={220} level="M" marginSize={2} />
            </div>

                        <div className="flex min-w-0 items-center gap-2 rounded-xl border border-[#0057e7]/20 bg-[#eef5ff] px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1 text-[9px] font-black uppercase tracking-wider text-[#0057e7]"><Hash size={12} /> Código</p>
                <p className="whitespace-nowrap font-mono text-base font-black tracking-[0.07em] text-[#0d1b2e] sm:text-xl">{formatPairingCode(session.pairingCode)}</p>
              </div>
              <AdminButton variant="secondary" size="sm" className="shrink-0 !px-2 sm:!px-3"
                disabled={ending} loading={ending} loadingText="Encerrando..."
                onClick={() => void endSession()}><WifiOff size={14} /> Encerrar conexão</AdminButton>
            </div>
            <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${connected ? "border-emerald-200 bg-emerald-50" : "border-[#0057e7]/20 bg-[#eef5ff]"}`}>
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${connected ? "bg-emerald-600 text-white" : "bg-[#0057e7] text-white"}`}>{connected ? <Wifi size={17} /> : <Smartphone size={17} />}</span>
              <div className="min-w-0 flex-1"><p className={`text-sm font-black ${connected ? "text-emerald-700" : "text-[#0d1b2e]"}`}>{connected ? "Celular conectado" : "Aguardando o celular"}</p><p className="mt-0.5 text-xs text-[#5a6a82]">{connected ? (context === "product" ? "Fotos e códigos aparecem automaticamente no cadastro do produto." : "Série, fotos e checklist aparecem automaticamente nesta OS.") : <>Abra <strong>{fixedCaptureUrl}</strong> no celular e use o QR ou o código.</>}</p></div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl border border-[#0d1b2e]/8 bg-[#f8fafc] px-3 py-3"><p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-[#5a6a82]"><Clock3 size={12} /> Expira</p><p className="mt-1 text-sm font-black text-[#0d1b2e]">{expiryLabel}</p></div>
              <div className="rounded-xl border border-[#0d1b2e]/8 bg-[#f8fafc] px-3 py-3"><p className="text-[10px] font-black uppercase tracking-wider text-[#5a6a82]">Fotos</p><p className="mt-1 text-sm font-black text-[#0d1b2e]">{receivedPhotos}</p></div>
              <div className="rounded-xl border border-[#0d1b2e]/8 bg-[#f8fafc] px-3 py-3"><p className="text-[10px] font-black uppercase tracking-wider text-[#5a6a82]">Checklist</p><p className="mt-1 text-sm font-black text-[#0d1b2e]">{receivedChecklistChanges}</p></div>
            </div>

            {lastSerial && <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs font-bold text-emerald-700"><CheckCircle2 size={15} /> {context === "product" ? "Código recebido:" : "Série recebida:"} <span className="min-w-0 truncate font-black">{lastSerial}</span></div>}
            <p className="text-center text-[11px] leading-5 text-[#5a6a82]">QR e código são temporários e pertencem somente a esta sessão. Eles não dão acesso ao painel administrativo.</p>
          </>}

          {!creating && expired && <div className="space-y-4 text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-700"><Clock3 size={22} /></div><div><p className="text-base font-black text-[#0d1b2e]">A conexão expirou</p><p className="mt-1 text-sm text-[#5a6a82]">Gere uma nova conexão para receber um novo QR e um novo código.</p></div><AdminButton onClick={() => void startSession()}><RefreshCw size={14} /> Gerar nova conexão</AdminButton></div>}

          {!creating && !session && !error && <AdminButton onClick={() => void startSession()} className="w-full"><Smartphone size={15} /> Gerar conexão</AdminButton>}
          {!creating && !session && error && <div className="flex justify-end"><AdminButton onClick={() => void startSession()}><RefreshCw size={14} /> Tentar novamente</AdminButton></div>}
        </div>
      </AdminDialog>
    </>
  );
}
