import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { Camera, CheckCircle2, Hash, ImagePlus, Loader2, ScanLine, Send, Smartphone, Unplug, Wifi, WifiOff } from "lucide-react";
import { useLocation, useParams } from "react-router";
import { MobileEntryChecklist } from "./MobileEntryChecklist";
import {
  connectDeviceCaptureByCode,
  connectDeviceCaptureSession,
  sendDeviceCaptureSerial,
  uploadDeviceCapturePhoto,
  type DeviceCapturePhotoKind,
} from "@/features/orders/infrastructure/device-capture.gateway";

const SERIAL_BARCODE_FORMATS = [
  "code_128",
  "code_39",
  "code_93",
  "codabar",
  "ean_13",
  "ean_8",
  "itf",
  "upc_a",
  "upc_e",
  "qr_code",
  "data_matrix",
] as const;

type ScannerControls = { stop: () => void };
type Notice = { text: string; type: "success" | "error" } | null;
type Pairing = { sessionId: string; token: string };
type NativeBarcode = { rawValue?: string | null };
type NativeBarcodeDetector = { detect: (source: unknown) => Promise<NativeBarcode[]> };
type NativeBarcodeDetectorConstructor = {
  new (options?: { formats?: string[] }): NativeBarcodeDetector;
  getSupportedFormats?: () => Promise<string[]>;
};

function parsePairingPayload(value: string): Pairing | null {
  const raw = value.trim();
  if (!raw) return null;

  if (raw.startsWith("ARTVIDEO_CAPTURE|")) {
    const [, sessionId, token] = raw.split("|");
    return sessionId && token ? { sessionId, token } : null;
  }

  try {
    const url = new URL(raw, window.location.origin);
    if (url.origin !== window.location.origin) return null;
    const routeMatch = url.pathname.match(/^\/captura\/([^/]+)$/);
    const sessionId = url.searchParams.get("session") || routeMatch?.[1] || "";
    const token = url.searchParams.get("token") || "";
    return sessionId && token
      ? { sessionId: decodeURIComponent(sessionId), token }
      : null;
  } catch {
    return null;
  }
}

function pairingCodeDigits(value: string) {
  return value.replace(/\D/g, "").slice(0, 8);
}

function formatPairingCode(value: string) {
  const digits = pairingCodeDigits(value);
  return digits.length > 4 ? `${digits.slice(0, 4)} ${digits.slice(4)}` : digits;
}

async function decodeSerialFromPhoto(file: File) {
  const Detector = (globalThis as typeof globalThis & { BarcodeDetector?: NativeBarcodeDetectorConstructor }).BarcodeDetector;

  if (Detector && typeof createImageBitmap === "function") {
    let bitmap: ImageBitmap | null = null;
    try {
      let formats: string[] | undefined;
      if (typeof Detector.getSupportedFormats === "function") {
        const supported = await Detector.getSupportedFormats();
        const supportedSet = new Set(supported);
        formats = SERIAL_BARCODE_FORMATS.filter(format => supportedSet.has(format));
      }
      const detector = formats?.length ? new Detector({ formats }) : new Detector();
      bitmap = await createImageBitmap(file);
      const results = await detector.detect(bitmap);
      const value = results.find(item => item.rawValue?.trim())?.rawValue?.trim();
      if (value) return value;
    } catch {
      // ZXing abaixo continua como fallback para fotos e navegadores sem BarcodeDetector completo.
    } finally {
      bitmap?.close();
    }
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const reader = new BrowserMultiFormatReader();
    const result = await reader.decodeFromImageUrl(objectUrl);
    const value = result.getText().trim();
    if (value) return value;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }

  throw new Error("Não foi possível identificar um código nessa foto.");
}

export function MobileDeviceCapturePage() {
  const { sessionId: routeSessionId = "" } = useParams();
  const location = useLocation();
  const initialParams = new URLSearchParams(location.search);
  const initialSessionId = initialParams.get("session") || routeSessionId;
  const initialToken = initialParams.get("token") || "";
  const initialPairing = initialSessionId && initialToken
    ? { sessionId: initialSessionId, token: initialToken }
    : null;

  const [pairing, setPairing] = useState<Pairing | null>(() => initialPairing);
  const [connectionState, setConnectionState] = useState<"idle" | "checking" | "connected" | "expired">(
    initialPairing ? "checking" : "idle",
  );
  const [expiresAt, setExpiresAt] = useState("");
  const [photoCount, setPhotoCount] = useState(0);
  const [serial, setSerial] = useState("");
  const [serialSending, setSerialSending] = useState(false);
  const [serialPhotoReading, setSerialPhotoReading] = useState(false);
  const [pairingCode, setPairingCode] = useState("");
  const [pairingCodeBusy, setPairingCodeBusy] = useState(false);
  const [uploadingKind, setUploadingKind] = useState<DeviceCapturePhotoKind | null>(null);
  const [pairScannerOpen, setPairScannerOpen] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerControlsRef = useRef<ScannerControls | null>(null);
  const serialCaptureInputRef = useRef<HTMLInputElement>(null);
  const labelInputRef = useRef<HTMLInputElement>(null);
  const equipmentInputRef = useRef<HTMLInputElement>(null);

  const stopPairScanner = () => {
    scannerControlsRef.current?.stop();
    scannerControlsRef.current = null;
    setPairScannerOpen(false);
  };

  const keepFixedCaptureUrl = () => {
    if (window.location.pathname !== "/captura" || window.location.search) {
      window.history.replaceState(window.history.state, "", "/captura");
    }
  };

  const disconnectDevice = () => {
    stopPairScanner();
    setPairing(null);
    setConnectionState("idle");
    setExpiresAt("");
    setPhotoCount(0);
    setSerial("");
    setPairingCode("");
    setNotice(null);
    keepFixedCaptureUrl();
  };

  useEffect(() => {
    document.title = "ArtVideo Captura";
    return () => {
      scannerControlsRef.current?.stop();
    };
  }, []);

  useEffect(() => {
    if (!pairing) return;
    let cancelled = false;

    const heartbeat = async () => {
      try {
        const result = await connectDeviceCaptureSession(pairing.sessionId, pairing.token);
        if (cancelled) return;
        setConnectionState("connected");
        setExpiresAt(String(result.expires_at || ""));
        setPhotoCount(Number(result.photo_count || 0));
        keepFixedCaptureUrl();
      } catch (error) {
        if (cancelled) return;
        stopPairScanner();
        setConnectionState("expired");
        setNotice({ text: error instanceof Error ? error.message : "A conexão expirou.", type: "error" });
        keepFixedCaptureUrl();
      }
    };

    setConnectionState("checking");
    void heartbeat();
    const timer = window.setInterval(() => void heartbeat(), 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [pairing?.sessionId, pairing?.token]);

  const connectByCode = async () => {
    const code = pairingCodeDigits(pairingCode);
    if (code.length !== 8 || pairingCodeBusy) return;
    stopPairScanner();
    setPairingCodeBusy(true);
    setNotice(null);
    try {
      const result = await connectDeviceCaptureByCode(code);
      setPairing({ sessionId: result.sessionId, token: result.token });
      setConnectionState("checking");
      setExpiresAt(result.expiresAt);
      setPhotoCount(0);
      setSerial("");
    } catch (error) {
      setNotice({ text: error instanceof Error ? error.message : "Não foi possível conectar com esse código.", type: "error" });
    } finally {
      setPairingCodeBusy(false);
    }
  };

  const sendSerial = async (value = serial) => {
    const nextSerial = value.trim();
    if (!nextSerial || connectionState !== "connected" || !pairing) return;
    setSerialSending(true);
    setNotice(null);
    try {
      await sendDeviceCaptureSerial(pairing.sessionId, pairing.token, nextSerial);
      setSerial(nextSerial);
      setNotice({ text: "Número de série enviado para o computador.", type: "success" });
    } catch (error) {
      setNotice({ text: error instanceof Error ? error.message : "Não foi possível enviar o número de série.", type: "error" });
    } finally {
      setSerialSending(false);
    }
  };

  const startPairScanner = async () => {
    if (pairScannerOpen) return;
    setNotice(null);
    setPairScannerOpen(true);
    try {
      await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
      const video = videoRef.current;
      if (!video) throw new Error("Não foi possível preparar a câmera.");
      const reader = new BrowserMultiFormatReader();
      const controls = await reader.decodeFromConstraints(
        { audio: false, video: { facingMode: { ideal: "environment" } } },
        video,
        (result, _error, callbackControls) => {
          if (!result) return;
          const value = result.getText().trim();
          if (!value) return;
          callbackControls.stop();
          scannerControlsRef.current = null;
          setPairScannerOpen(false);

          const nextPairing = parsePairingPayload(value);
          if (!nextPairing) {
            setNotice({ text: "Esse QR não é uma conexão válida da ArtVideo.", type: "error" });
            return;
          }
          setPairing(nextPairing);
          setConnectionState("checking");
          setPhotoCount(0);
          setSerial("");
          setExpiresAt("");
        },
      );
      scannerControlsRef.current = controls;
    } catch (error) {
      scannerControlsRef.current?.stop();
      scannerControlsRef.current = null;
      setPairScannerOpen(false);
      setNotice({ text: error instanceof Error ? error.message : "Não foi possível abrir a câmera.", type: "error" });
    }
  };

  const readSerialPhoto = async (file?: File) => {
    if (!file || connectionState !== "connected" || !pairing || serialPhotoReading) return;
    setSerialPhotoReading(true);
    setNotice(null);
    try {
      const value = await decodeSerialFromPhoto(file);
      setSerial(value);
      setNotice({ text: "Número de série identificado. Revise e toque no aviãozinho para enviar.", type: "success" });
    } catch (error) {
      setNotice({
        text: error instanceof Error
          ? `${error.message} Tire outra foto aproximando a etiqueta e garantindo que o código esteja nítido.`
          : "Não foi possível ler o código da foto. Tire outra foto da etiqueta.",
        type: "error",
      });
    } finally {
      setSerialPhotoReading(false);
    }
  };

  const uploadPhoto = async (kind: DeviceCapturePhotoKind, file?: File) => {
    if (!file || connectionState !== "connected" || !pairing) return;
    setUploadingKind(kind);
    setNotice(null);
    try {
      const result = await uploadDeviceCapturePhoto(pairing.sessionId, pairing.token, kind, file);
      setPhotoCount(result.photoCount);
      setNotice({
        text: kind === "label" ? "Foto da etiqueta enviada para o computador." : "Foto do equipamento enviada para o computador.",
        type: "success",
      });
    } catch (error) {
      setNotice({ text: error instanceof Error ? error.message : "Não foi possível enviar a foto.", type: "error" });
    } finally {
      setUploadingKind(null);
    }
  };

  const expiryLabel = expiresAt
    ? new Date(expiresAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : "";

  if (connectionState === "checking") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#f5f7fa] p-6">
        <div className="text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-[#0057e7]" />
          <p className="mt-3 text-sm font-bold text-[#5a6a82]">Conectando ao computador...</p>
        </div>
      </div>
    );
  }

  if (connectionState === "idle" || connectionState === "expired") {
    return (
      <div className="min-h-dvh bg-[#f5f7fa] pb-[calc(2rem+env(safe-area-inset-bottom))]">
        <header className="border-b border-white/10 bg-[#0d1b2e] px-4 pb-5 pt-[calc(1rem+env(safe-area-inset-top))] text-white shadow-lg">
          <div className="mx-auto flex max-w-lg items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#0057e7]"><Smartphone size={22} /></span>
            <div><h1 className="text-base font-black">ArtVideo Captura</h1><p className="mt-0.5 text-xs text-white/65">Dispositivo auxiliar para Ordens de Serviço</p></div>
          </div>
        </header>

        <main className="mx-auto max-w-lg space-y-4 p-4">
          {notice && <div role={notice.type === "error" ? "alert" : "status"} className={`rounded-xl border px-4 py-3 text-sm font-bold ${notice.type === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{notice.text}</div>}

          <section className="overflow-hidden rounded-3xl border border-[#0d1b2e]/8 bg-white shadow-sm">
            <div className="p-5 text-center">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#e8eef8] text-[#0057e7]"><ScanLine size={28} /></span>
              <h2 className="mt-4 text-xl font-black text-[#0d1b2e]">Conectar a uma OS</h2>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-[#5a6a82]">No computador, abra a Nova OS e gere a conexão em <strong>Usar celular</strong>. Depois use o QR ou o código exibido.</p>
            </div>

            <div className="border-t border-[#0d1b2e]/8 p-4">
              {pairScannerOpen && (
                <div className="mb-3 overflow-hidden rounded-2xl bg-black">
                  <div className="relative">
                    <video ref={videoRef} muted playsInline className="aspect-[4/3] w-full object-cover" />
                    <div className="pointer-events-none absolute inset-8 rounded-2xl border-2 border-white/80 shadow-[0_0_0_999px_rgba(0,0,0,.28)]" />
                    <div className="pointer-events-none absolute inset-x-12 top-1/2 h-px bg-red-500 shadow-[0_0_10px_rgba(239,68,68,.9)]" />
                  </div>
                </div>
              )}

              {!pairScannerOpen ? (
                <button type="button" onClick={() => void startPairScanner()} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#0057e7] px-4 text-sm font-black text-white active:bg-[#0046c0]"><ScanLine size={20} /> Escanear QR da OS</button>
              ) : (
                <button type="button" onClick={stopPairScanner} className="min-h-12 w-full rounded-xl border border-[#0d1b2e]/15 bg-white px-4 text-sm font-black text-[#0d1b2e]">Cancelar leitura</button>
              )}

              <div className="my-4 flex items-center gap-3"><span className="h-px flex-1 bg-[#0d1b2e]/10" /><span className="text-[10px] font-black uppercase tracking-widest text-[#8a97a8]">ou</span><span className="h-px flex-1 bg-[#0d1b2e]/10" /></div>

              <div className="rounded-2xl border border-[#0d1b2e]/10 bg-[#f8fafc] p-3">
                <label htmlFor="capture-pair-code" className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-[#5a6a82]"><Hash size={13} /> Código de conexão</label>
                <div className="mt-2 flex gap-2">
                  <input
                    id="capture-pair-code"
                    value={formatPairingCode(pairingCode)}
                    onChange={event => setPairingCode(pairingCodeDigits(event.target.value))}
                    onKeyDown={event => { if (event.key === "Enter") void connectByCode(); }}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9 ]*"
                    maxLength={9}
                    placeholder="0000 0000"
                    aria-label="Código de conexão de 8 dígitos"
                    className="min-w-0 flex-1 rounded-xl border border-[#0d1b2e]/15 bg-white px-3 py-3 text-center font-mono text-lg font-black tracking-[0.16em] text-[#0d1b2e] outline-none focus:border-[#0057e7] focus:ring-2 focus:ring-[#0057e7]/15"
                  />
                  <button
                    type="button"
                    disabled={pairingCodeDigits(pairingCode).length !== 8 || pairingCodeBusy}
                    onClick={() => void connectByCode()}
                    className="flex min-w-24 shrink-0 items-center justify-center gap-2 rounded-xl bg-[#0d1b2e] px-4 text-sm font-black text-white disabled:opacity-40"
                  >
                    {pairingCodeBusy ? <Loader2 size={17} className="animate-spin" /> : <Wifi size={17} />}
                    Conectar
                  </button>
                </div>
                <p className="mt-2 text-xs leading-5 text-[#5a6a82]">Digite os 8 números mostrados abaixo do QR no computador.</p>
              </div>
            </div>
          </section>

          <div className="rounded-2xl border border-[#0057e7]/15 bg-[#eef5ff] px-4 py-3 text-xs leading-5 text-[#5a6a82]">
            <p className="font-black text-[#0057e7]">Endereço fixo</p>
            <p className="mt-1">Salve esta página na tela inicial do celular. Você poderá reutilizá-la para todas as próximas OS e apenas escanear um novo QR ou digitar o novo código.</p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-[#f5f7fa] pb-[calc(2rem+env(safe-area-inset-bottom))]">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#0d1b2e] px-4 pb-4 pt-[calc(1rem+env(safe-area-inset-top))] text-white shadow-lg">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0057e7]"><Smartphone size={20} /></span>
            <div className="min-w-0"><p className="text-sm font-black">ArtVideo • Captura da OS</p><p className="mt-0.5 text-xs text-white/65">Celular conectado ao computador</p></div>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-1.5 text-[11px] font-black text-emerald-300"><Wifi size={12} /> CONECTADO</span>
        </div>
      </header>

      <main className="mx-auto max-w-lg space-y-4 p-4">
        <div className="rounded-2xl border border-[#0d1b2e]/8 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <div><p className="text-xs font-black uppercase tracking-wider text-[#5a6a82]">Sessão ativa</p><p className="mt-1 text-sm font-bold text-[#0d1b2e]">{photoCount} de 5 fotos enviadas</p></div>
            {expiryLabel && <div className="text-right"><p className="text-[10px] font-bold uppercase text-[#5a6a82]">Expira</p><p className="text-sm font-black text-[#0d1b2e]">{expiryLabel}</p></div>}
          </div>
        </div>

        {notice && <div role={notice.type === "error" ? "alert" : "status"} className={`rounded-xl border px-4 py-3 text-sm font-bold ${notice.type === "error" ? "border-red-200 bg-red-50 text-red-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>{notice.text}</div>}

        <section className="overflow-hidden rounded-2xl border border-[#0d1b2e]/8 bg-white shadow-sm">
          <div className="border-b border-[#0d1b2e]/8 p-4">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#e8eef8] text-[#0057e7]"><ScanLine size={18} /></span>
              <div><h2 className="text-sm font-black text-[#0d1b2e]">Número de série</h2><p className="text-xs text-[#5a6a82]">Fotografe o código de barras ou QR da etiqueta.</p></div>
            </div>
          </div>
          <div className="space-y-3 p-4">
            <button
              type="button"
              disabled={serialPhotoReading || serialSending}
              onClick={() => serialCaptureInputRef.current?.click()}
              className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#0057e7] px-4 text-sm font-black text-white active:bg-[#0046c0] disabled:opacity-50"
            >
              {serialPhotoReading ? <Loader2 size={20} className="animate-spin" /> : <Camera size={20} />}
              {serialPhotoReading ? "Lendo foto..." : "Fotografar código de série"}
            </button>
            <p className="rounded-xl bg-[#f8fafc] px-3 py-2.5 text-center text-[11px] leading-4 text-[#5a6a82]">A câmera padrão do celular será aberta. Foque a etiqueta, tire a foto e confirme; a leitura será feita depois que você voltar para esta tela.</p>
            <input
              ref={serialCaptureInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={event => {
                const file = event.target.files?.[0];
                event.currentTarget.value = "";
                void readSerialPhoto(file);
              }}
            />
            <div className="flex gap-2">
              <input value={serial} onChange={event => setSerial(event.target.value)} placeholder="Ou digite a série" autoCapitalize="characters" className="min-w-0 flex-1 rounded-xl border border-[#0d1b2e]/15 bg-white px-3 py-3 text-sm font-bold text-[#0d1b2e] outline-none focus:border-[#0057e7] focus:ring-2 focus:ring-[#0057e7]/15" />
              <button type="button" disabled={!serial.trim() || serialSending || serialPhotoReading} onClick={() => void sendSerial()} aria-label="Enviar série para o computador" className="flex w-12 shrink-0 items-center justify-center rounded-xl bg-[#0d1b2e] text-white disabled:opacity-40">{serialSending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}</button>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-[#0d1b2e]/8 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#eef5ff] text-[#0057e7]"><Camera size={18} /></span><div><h2 className="text-sm font-black text-[#0d1b2e]">Fotos do equipamento</h2><p className="text-xs text-[#5a6a82]">As fotos aparecem automaticamente na OS do computador.</p></div></div>
          <div className="mt-4 grid gap-3">
            <button type="button" disabled={photoCount >= 5 || uploadingKind !== null} onClick={() => labelInputRef.current?.click()} className="flex min-h-16 items-center justify-between gap-3 rounded-xl border border-[#0057e7]/25 bg-[#eef5ff] px-4 text-left disabled:opacity-45"><span><span className="block text-sm font-black text-[#0057e7]">Foto da etiqueta</span><span className="mt-0.5 block text-xs text-[#5a6a82]">Identificação, modelo e dados técnicos</span></span>{uploadingKind === "label" ? <Loader2 className="shrink-0 animate-spin text-[#0057e7]" size={20} /> : <Camera className="shrink-0 text-[#0057e7]" size={20} />}</button>
            <button type="button" disabled={photoCount >= 5 || uploadingKind !== null} onClick={() => equipmentInputRef.current?.click()} className="flex min-h-16 items-center justify-between gap-3 rounded-xl border border-[#0d1b2e]/10 bg-white px-4 text-left disabled:opacity-45"><span><span className="block text-sm font-black text-[#0d1b2e]">Outras fotos</span><span className="mt-0.5 block text-xs text-[#5a6a82]">Estado geral, avarias e outros detalhes</span></span>{uploadingKind === "equipment" ? <Loader2 className="shrink-0 animate-spin text-[#0057e7]" size={20} /> : <ImagePlus className="shrink-0 text-[#5a6a82]" size={20} />}</button>
          </div>
          {photoCount >= 5 && <div className="mt-3 flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2.5 text-xs font-bold text-emerald-700"><CheckCircle2 size={16} /> Limite de 5 fotos atingido.</div>}
          <input ref={labelInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={event => { const file = event.target.files?.[0]; event.currentTarget.value = ""; void uploadPhoto("label", file); }} />
          <input ref={equipmentInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={event => { const file = event.target.files?.[0]; event.currentTarget.value = ""; void uploadPhoto("equipment", file); }} />
        </section>

        <MobileEntryChecklist sessionId={pairing.sessionId} token={pairing.token} />

        <button type="button" onClick={disconnectDevice} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-[#0d1b2e]/15 bg-white px-4 text-sm font-black text-[#0d1b2e]"><Unplug size={17} /> Desconectar e conectar outra OS</button>
        <div className="flex items-center justify-center gap-1.5 text-[11px] font-semibold text-[#5a6a82]"><WifiOff size={12} /> A conexão também encerra automaticamente quando o QR/código expirar ou o PC fechar a sessão.</div>
      </main>
    </div>
  );
}
