import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle2, Clock3, Hash, Loader2, RefreshCw, Smartphone, Wifi, WifiOff } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useAuth } from "@/lib/auth";
import { AdminButton, AdminDialog } from "@/shared/ui/admin/AdminLayout";
import {
  applyDeviceEntryChecklistAnswer,
  applyDeviceEntryChecklistPhoto,
} from "@/features/checklists/application/new-order-entry-checklist";
import {
  bindDeviceCaptureChecklist,
  closeDeviceCaptureSession,
  createDeviceCaptureSession,
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
  equipmentTypeId,
  onSerial,
  onPhoto,
}: {
  disabled?: boolean;
  equipmentTypeId?: string | null;
  onSerial: (serial: string) => void;
  onPhoto: (file: File, kind: DeviceCapturePhotoKind) => void;
}) {
  const { activeOrganizationId } = useAuth();
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState<DeviceCaptureSession | null>(null);
  const [creating, setCreating] = useState(false);
  const [connected, setConnected] = useState(false);
  const [expired, setExpired] = useState(false);
  const [error, setError] = useState("");
  const [receivedPhotos, setReceivedPhotos] = useState(0);
  const [receivedChecklistChanges, setReceivedChecklistChanges] = useState(0);
  const [lastSerial, setLastSerial] = useState("");
  const lastEventIdRef = useRef(0);
  const lastChecklistEventIdRef = useRef(0);
  const pollingRef = useRef(false);
  const sessionRef = useRef<DeviceCaptureSession | null>(null);

  sessionRef.current = session;

  const resetCounters = () => {
    setReceivedPhotos(0);
    setReceivedChecklistChanges(0);
    setLastSerial("");
    lastEventIdRef.current = 0;
    lastChecklistEventIdRef.current = 0;
  };

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
      const nextSession = await createDeviceCaptureSession(activeOrganizationId, equipmentTypeId);
      sessionRef.current = nextSession;
      setSession(nextSession);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Não foi possível iniciar a conexão com o celular.");
      setSession(null);
    } finally {
      setCreating(false);
    }
  }, [activeOrganizationId, disabled, creating, equipmentTypeId]);

  const openBridge = () => {
    setOpen(true);
    if (!sessionRef.current || expired) void startSession();
  };

  const endSession = async () => {
    const current = sessionRef.current;
    if (current) await closeDeviceCaptureSession(current.id, current.token).catch(() => undefined);
    sessionRef.current = null;
    setSession(null);
    setConnected(false);
    setExpired(false);
    resetCounters();
  };

  useEffect(() => () => {
    const current = sessionRef.current;
    if (current) void closeDeviceCaptureSession(current.id, current.token).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!session) return;
    lastChecklistEventIdRef.current = 0;
    void bindDeviceCaptureChecklist(session.id, equipmentTypeId).catch(bindError => {
      setError(bindError instanceof Error ? bindError.message : "Não foi possível vincular o checklist ao celular.");
    });
  }, [session?.id, equipmentTypeId]);

  useEffect(() => {
    if (!session || expired) return;
    let cancelled = false;

    const poll = async () => {
      if (pollingRef.current || cancelled) return;
      pollingRef.current = true;
      try {
        const [captureResult, checklistEvents] = await Promise.all([
          pollDeviceCaptureSession(session.id, lastEventIdRef.current),
          pollDeviceChecklistEvents(session.id, session.token, lastChecklistEventIdRef.current),
        ]);
        if (cancelled) return;

        setConnected(captureResult.connected);
        if (captureResult.status !== "active") {
          setExpired(true);
          setConnected(false);
        }

        for (const event of captureResult.events) {
          if (cancelled || event.id <= lastEventIdRef.current) continue;
          if (event.type === "serial") {
            const value = event.value.trim();
            if (value) {
              onSerial(value);
              setLastSerial(value);
            }
            lastEventIdRef.current = event.id;
            continue;
          }

          try {
            const file = await signedUrlToFile(event.signedUrl, event.fileName, event.mimeType, event.id);
            onPhoto(file, event.kind);
            setReceivedPhotos(current => current + 1);
            lastEventIdRef.current = event.id;
          } catch (photoError) {
            setError(photoError instanceof Error ? photoError.message : "Não foi possível receber uma foto do celular.");
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
            break;
          }
        }
      } catch (pollError) {
        if (!cancelled) setError(pollError instanceof Error ? pollError.message : "Falha na conexão com o celular.");
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
  }, [session?.id, session?.token, expired, onPhoto, onSerial]);

  const captureUrl = session
    ? `${window.location.origin}/captura?session=${encodeURIComponent(session.id)}&token=${encodeURIComponent(session.token)}`
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
        className={connected ? "bg-emerald-600 hover:bg-emerald-700" : "border-[#0057e7]/25 text-[#0057e7] hover:bg-[#0057e7]/5"}
        title="Usar a câmera do celular nesta OS"
      >
        <Smartphone size={14} />
        <span>{connected ? "Celular conectado" : "Usar celular"}</span>
        {connected && <span className="h-2 w-2 rounded-full bg-white" />}
      </AdminButton>

      <AdminDialog
        open={open}
        onClose={() => setOpen(false)}
        title="Conectar celular à Nova OS"
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

            <div className="flex items-center justify-between gap-3 rounded-xl border border-[#0057e7]/20 bg-[#eef5ff] px-3 py-2">
              <p className="flex shrink-0 items-center gap-1.5 text-[9px] font-black uppercase tracking-wider text-[#0057e7]"><Hash size={12} /> Código</p>
              <p className="font-mono text-xl font-black tracking-[0.14em] text-[#0d1b2e] sm:text-2xl">{formatPairingCode(session.pairingCode)}</p>
            </div>

            <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${connected ? "border-emerald-200 bg-emerald-50" : "border-[#0057e7]/20 bg-[#eef5ff]"}`}>
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${connected ? "bg-emerald-600 text-white" : "bg-[#0057e7] text-white"}`}>{connected ? <Wifi size={17} /> : <Smartphone size={17} />}</span>
              <div className="min-w-0 flex-1"><p className={`text-sm font-black ${connected ? "text-emerald-700" : "text-[#0d1b2e]"}`}>{connected ? "Celular conectado" : "Aguardando o celular"}</p><p className="mt-0.5 text-xs text-[#5a6a82]">{connected ? "Série, fotos e checklist aparecem automaticamente nesta OS." : <>Abra <strong>{fixedCaptureUrl}</strong> no celular e use o QR ou o código.</>}</p></div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl border border-[#0d1b2e]/8 bg-[#f8fafc] px-3 py-3"><p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-[#5a6a82]"><Clock3 size={12} /> Expira</p><p className="mt-1 text-sm font-black text-[#0d1b2e]">{expiryLabel}</p></div>
              <div className="rounded-xl border border-[#0d1b2e]/8 bg-[#f8fafc] px-3 py-3"><p className="text-[10px] font-black uppercase tracking-wider text-[#5a6a82]">Fotos</p><p className="mt-1 text-sm font-black text-[#0d1b2e]">{receivedPhotos}</p></div>
              <div className="rounded-xl border border-[#0d1b2e]/8 bg-[#f8fafc] px-3 py-3"><p className="text-[10px] font-black uppercase tracking-wider text-[#5a6a82]">Checklist</p><p className="mt-1 text-sm font-black text-[#0d1b2e]">{receivedChecklistChanges}</p></div>
            </div>

            {lastSerial && <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs font-bold text-emerald-700"><CheckCircle2 size={15} /> Série recebida: <span className="min-w-0 truncate font-black">{lastSerial}</span></div>}
            <p className="text-center text-[11px] leading-5 text-[#5a6a82]">QR e código são temporários e pertencem somente a esta sessão. Eles não dão acesso ao painel administrativo.</p>
            <div className="flex flex-wrap justify-end gap-2">
              <AdminButton variant="secondary" onClick={() => void endSession()}><WifiOff size={14} /> Encerrar conexão</AdminButton>
            </div>
          </>}

          {!creating && expired && <div className="space-y-4 text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-700"><Clock3 size={22} /></div><div><p className="text-base font-black text-[#0d1b2e]">A conexão expirou</p><p className="mt-1 text-sm text-[#5a6a82]">Gere uma nova conexão para receber um novo QR e um novo código.</p></div><AdminButton onClick={() => void startSession()}><RefreshCw size={14} /> Gerar nova conexão</AdminButton></div>}

          {!creating && !session && !error && <AdminButton onClick={() => void startSession()} className="w-full"><Smartphone size={15} /> Gerar conexão</AdminButton>}
          {!creating && !session && error && <div className="flex justify-end"><AdminButton onClick={() => void startSession()}><RefreshCw size={14} /> Tentar novamente</AdminButton></div>}
        </div>
      </AdminDialog>
    </>
  );
}
