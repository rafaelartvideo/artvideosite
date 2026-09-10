import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { Camera, CheckCircle2, ImagePlus, Loader2, ScanLine, Send, Smartphone, Wifi, WifiOff } from "lucide-react";
import { useLocation, useParams } from "react-router";
import {
  connectDeviceCaptureSession,
  sendDeviceCaptureSerial,
  uploadDeviceCapturePhoto,
  type DeviceCapturePhotoKind,
} from "@/features/orders/infrastructure/device-capture.gateway";

const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type ScannerControls = { stop: () => void };

type Notice = { text: string; type: "success" | "error" } | null;

async function normalizeCameraImage(file: File) {
  if (ACCEPTED_IMAGE_TYPES.has(file.type) && file.size <= 8 * 1024 * 1024) return file;

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
    const maxDimension = 1920;
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Não foi possível preparar a foto.");
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(value => value ? resolve(value) : reject(new Error("Não foi possível preparar a foto.")), "image/jpeg", 0.88);
    });
    return new File([blob], `foto-${Date.now()}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
  } finally {
    bitmap?.close();
  }
}

export function MobileDeviceCapturePage() {
  const { sessionId = "" } = useParams();
  const location = useLocation();
  const token = new URLSearchParams(location.search).get("token") || "";
  const [connectionState, setConnectionState] = useState<"checking" | "connected" | "expired">("checking");
  const [expiresAt, setExpiresAt] = useState("");
  const [photoCount, setPhotoCount] = useState(0);
  const [serial, setSerial] = useState("");
  const [serialSending, setSerialSending] = useState(false);
  const [uploadingKind, setUploadingKind] = useState<DeviceCapturePhotoKind | null>(null);
  const [scanning, setScanning] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const scannerControlsRef = useRef<ScannerControls | null>(null);
  const labelInputRef = useRef<HTMLInputElement>(null);
  const equipmentInputRef = useRef<HTMLInputElement>(null);

  const stopScanner = () => {
    scannerControlsRef.current?.stop();
    scannerControlsRef.current = null;
    setScanning(false);
  };

  const heartbeat = async () => {
    if (!sessionId || !token) {
      setConnectionState("expired");
      return;
    }
    try {
      const result = await connectDeviceCaptureSession(sessionId, token);
      setConnectionState("connected");
      setExpiresAt(String(result.expires_at || ""));
      setPhotoCount(Number(result.photo_count || 0));
    } catch (error) {
      stopScanner();
      setConnectionState("expired");
      setNotice({ text: error instanceof Error ? error.message : "A conexão expirou.", type: "error" });
    }
  };

  useEffect(() => {
    document.title = "Captura do equipamento • ArtVideo";
    void heartbeat();
    const timer = window.setInterval(() => void heartbeat(), 15_000);
    return () => {
      window.clearInterval(timer);
      scannerControlsRef.current?.stop();
    };
  }, [sessionId, token]);

  const sendSerial = async (value = serial) => {
    const nextSerial = value.trim();
    if (!nextSerial || connectionState !== "connected") return;
    setSerialSending(true);
    setNotice(null);
    try {
      await sendDeviceCaptureSerial(sessionId, token, nextSerial);
      setSerial(nextSerial);
      setNotice({ text: "Número de série enviado para o computador.", type: "success" });
    } catch (error) {
      setNotice({ text: error instanceof Error ? error.message : "Não foi possível enviar o número de série.", type: "error" });
    } finally {
      setSerialSending(false);
    }
  };

  const startScanner = async () => {
    if (connectionState !== "connected" || scanning) return;
    setNotice(null);
    setScanning(true);
    try {
      const reader = new BrowserMultiFormatReader();
      if (!videoRef.current) throw new Error("Câmera indisponível.");
      const controls = await reader.decodeFromConstraints(
        { audio: false, video: { facingMode: { ideal: "environment" } } },
        videoRef.current,
        (result) => {
          if (!result) return;
          const value = result.getText().trim();
          if (!value) return;
          controls.stop();
          scannerControlsRef.current = null;
          setScanning(false);
          setSerial(value);
          void sendSerial(value);
        },
      );
      scannerControlsRef.current = controls;
    } catch (error) {
      setScanning(false);
      setNotice({ text: error instanceof Error ? error.message : "Não foi possível abrir a câmera para leitura.", type: "error" });
    }
  };

  const uploadPhoto = async (kind: DeviceCapturePhotoKind, file?: File) => {
    if (!file || connectionState !== "connected") return;
    setUploadingKind(kind);
    setNotice(null);
    try {
      const normalized = await normalizeCameraImage(file);
      const result = await uploadDeviceCapturePhoto(sessionId, token, kind, normalized);
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
    return <div className="flex min-h-dvh items-center justify-center bg-[#f5f7fa] p-6"><div className="text-center"><Loader2 className="mx-auto h-8 w-8 animate-spin text-[#0057e7]" /><p className="mt-3 text-sm font-bold text-[#5a6a82]">Conectando ao computador...</p></div></div>;
  }

  if (connectionState === "expired") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#f5f7fa] p-5">
        <div className="w-full max-w-md rounded-3xl border border-[#0d1b2e]/10 bg-white p-6 text-center shadow-xl shadow-[#0d1b2e]/5">
          <WifiOff className="mx-auto h-10 w-10 text-red-500" />
          <h1 className="mt-4 text-xl font-black text-[#0d1b2e]">Conexão encerrada</h1>
          <p className="mt-2 text-sm leading-6 text-[#5a6a82]">Esse QR expirou ou foi encerrado no computador. Gere um novo QR na Nova OS para continuar.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-[#f5f7fa] pb-[calc(2rem+env(safe-area-inset-bottom))]">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#0d1b2e] px-4 pb-4 pt-[calc(1rem+env(safe-area-inset-top))] text-white shadow-lg">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0057e7]"><Smartphone size={20} /></span>
            <div className="min-w-0"><p className="text-sm font-black">ArtVideo • Captura da OS</p><p className="mt-0.5 text-xs text-white/65">Use este celular como dispositivo auxiliar</p></div>
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
          <div className="border-b border-[#0d1b2e]/8 p-4"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#e8eef8] text-[#0057e7]"><ScanLine size={18} /></span><div><h2 className="text-sm font-black text-[#0d1b2e]">Número de série</h2><p className="text-xs text-[#5a6a82]">Leia o código de barras ou QR da etiqueta.</p></div></div></div>
          <div className="space-y-3 p-4">
            {scanning && <div className="relative overflow-hidden rounded-2xl bg-black"><video ref={videoRef} muted playsInline className="aspect-[4/3] w-full object-cover" /><div className="pointer-events-none absolute inset-x-8 top-1/2 h-px bg-red-500 shadow-[0_0_10px_rgba(239,68,68,.9)]" /></div>}
            {!scanning && <button type="button" onClick={() => void startScanner()} className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-[#0057e7] px-4 text-sm font-black text-white active:bg-[#0046c0]"><ScanLine size={20} /> Escanear número de série</button>}
            {scanning && <button type="button" onClick={stopScanner} className="min-h-12 w-full rounded-xl border border-[#0d1b2e]/15 bg-white px-4 text-sm font-black text-[#0d1b2e]">Cancelar leitura</button>}
            <div className="flex gap-2">
              <input value={serial} onChange={event => setSerial(event.target.value)} placeholder="Ou digite a série" autoCapitalize="characters" className="min-w-0 flex-1 rounded-xl border border-[#0d1b2e]/15 bg-white px-3 py-3 text-sm font-bold text-[#0d1b2e] outline-none focus:border-[#0057e7] focus:ring-2 focus:ring-[#0057e7]/15" />
              <button type="button" disabled={!serial.trim() || serialSending} onClick={() => void sendSerial()} aria-label="Enviar série para o computador" className="flex w-12 shrink-0 items-center justify-center rounded-xl bg-[#0d1b2e] text-white disabled:opacity-40">{serialSending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}</button>
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
      </main>
    </div>
  );
}
