import { useEffect, useRef, useState } from "react";
import { CheckCircle2, LocateFixed, MapPinned, Pause, Radio, ShieldCheck, Smartphone, WifiOff } from "lucide-react";
import { useParams } from "react-router";
import {
  redeemFieldTrackingPairing,
  stopPairedFieldTracking,
  updatePairedFieldLocation,
} from "../infrastructure/field-tracking.repository";

const STORAGE_KEY = "artvideo-field-tracker-token-v1";

function deviceLabel() {
  const agent = navigator.userAgent;
  if (/Android/i.test(agent)) return "Android";
  if (/iPhone/i.test(agent)) return "iPhone";
  if (/iPad/i.test(agent)) return "iPad";
  if (/Windows/i.test(agent)) return "Windows";
  if (/Macintosh|Mac OS X/i.test(agent)) return "Mac";
  return "Navegador";
}

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return "Não foi possível concluir a operação.";
}

export function FieldTrackerDevicePage() {
  const { token: routeToken } = useParams();
  const watchIdRef = useRef<number | null>(null);
  const wakeLockRef = useRef<any>(null);
  const lastSentRef = useRef(0);
  const [pairingCode, setPairingCode] = useState("");
  const [trackerToken, setTrackerToken] = useState(() => window.localStorage.getItem(STORAGE_KEY) || "");
  const [unitName, setUnitName] = useState("");
  const [busy, setBusy] = useState(false);
  const [tracking, setTracking] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<string | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [error, setError] = useState("");
  const pairingToken = String(routeToken || "").trim();

  useEffect(() => {
    return () => {
      if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
      try { void wakeLockRef.current?.release?.(); } catch {}
    };
  }, []);

  const sendPosition = async (token: string, position: GeolocationPosition) => {
    await updatePairedFieldLocation(token, {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
      accuracy: position.coords.accuracy,
      speed: position.coords.speed,
      heading: position.coords.heading,
      recordedAt: new Date(position.timestamp).toISOString(),
      deviceLabel: deviceLabel(),
    });
    setAccuracy(position.coords.accuracy);
    setLastUpdate(new Date().toISOString());
    setError("");
  };

  const beginWatch = async (token: string, name?: string) => {
    if (!navigator.geolocation) {
      setError("Este aparelho não disponibiliza geolocalização no navegador.");
      return;
    }

    setBusy(true);
    setError("");

    navigator.geolocation.getCurrentPosition(
      position => {
        void sendPosition(token, position)
          .then(async () => {
            if (name) setUnitName(name);
            if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
            watchIdRef.current = navigator.geolocation.watchPosition(
              nextPosition => {
                const now = Date.now();
                if (now - lastSentRef.current < 12_000) return;
                lastSentRef.current = now;
                void sendPosition(token, nextPosition).catch(nextError => {
                  setError(errorMessage(nextError));
                });
              },
              geoError => {
                if (geoError.code === geoError.PERMISSION_DENIED) {
                  setError("O acesso à localização foi bloqueado. Libere a localização deste site nas configurações do navegador.");
                } else {
                  setError("Sinal de localização temporariamente indisponível.");
                }
              },
              { enableHighAccuracy: true, maximumAge: 8_000, timeout: 20_000 },
            );
            setTracking(true);
            lastSentRef.current = Date.now();

            try {
              const wakeLock = (navigator as any).wakeLock;
              if (wakeLock?.request) wakeLockRef.current = await wakeLock.request("screen");
            } catch {}
          })
          .catch(sendError => setError(errorMessage(sendError)))
          .finally(() => setBusy(false));
      },
      geoError => {
        setBusy(false);
        setError(
          geoError.code === geoError.PERMISSION_DENIED
            ? "Autorize o acesso à localização para ativar este rastreador."
            : "Não foi possível obter a posição atual.",
        );
      },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: 20_000 },
    );
  };

  const activate = async () => {
    setBusy(true);
    setError("");
    try {
      let activeToken = trackerToken;
      let name = unitName;

      if (!trackerToken && (pairingToken || pairingCode.trim())) {
        const response = await redeemFieldTrackingPairing({
          pairingToken: pairingToken || null,
          pairingCode: pairingToken ? null : pairingCode.trim(),
          deviceLabel: deviceLabel(),
        });
        activeToken = String(response.tracker_token || "");
        name = String(response.unit?.name || "Rastreador");
        if (!activeToken) throw new Error("O servidor não retornou a credencial do rastreador.");
        window.localStorage.setItem(STORAGE_KEY, activeToken);
        setTrackerToken(activeToken);
        setUnitName(name);
      }

      if (!activeToken) {
        throw new Error("Abra o QR de pareamento ou informe o código gerado no Mapa de Campo.");
      }

      setBusy(false);
      await beginWatch(activeToken, name);
    } catch (activationError) {
      setBusy(false);
      setError(errorMessage(activationError));
    }
  };

  const pause = async () => {
    if (!trackerToken) return;
    setBusy(true);
    try {
      if (watchIdRef.current != null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      try { await wakeLockRef.current?.release?.(); } catch {}
      wakeLockRef.current = null;
      await stopPairedFieldTracking(trackerToken);
      setTracking(false);
      setError("");
    } catch (pauseError) {
      setError(errorMessage(pauseError));
    } finally {
      setBusy(false);
    }
  };

  const forget = () => {
    if (tracking) return;
    window.localStorage.removeItem(STORAGE_KEY);
    setTrackerToken("");
    setUnitName("");
    setLastUpdate(null);
    setAccuracy(null);
  };

  const hasPairing = Boolean(pairingToken || pairingCode.trim());
  const ready = Boolean(trackerToken);

  return <div className="min-h-dvh bg-[#0a101c] px-4 py-6 text-white sm:py-10">
    <main className="mx-auto w-full max-w-md">
      <div className="mb-5 flex items-center justify-center gap-2">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#1032dc] shadow-lg shadow-blue-900/30">
          <MapPinned size={20} />
        </span>
        <div>
          <p className="text-base font-black leading-none">Mapa de Campo</p>
          <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-white/45">Rastreador de campo</p>
        </div>
      </div>

      <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#111827] shadow-2xl shadow-black/25">
        <div className="border-b border-white/8 px-5 py-5 text-center">
          <span className={"mx-auto flex h-16 w-16 items-center justify-center rounded-2xl " + (tracking ? "bg-emerald-500/12 text-emerald-300" : "bg-[#17224d] text-[#91a0ff]")}>
            {tracking ? <Radio size={30} className="field-tracking-live-dot" /> : <Smartphone size={30} />}
          </span>
          <h1 className="mt-4 text-xl font-black">
            {tracking ? "Localização sendo enviada" : ready ? "Dispositivo pareado" : "Parear rastreador"}
          </h1>
          <p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-white/55">
            {tracking
              ? (unitName || "Este rastreador") + " está compartilhando a posição com o Mapa de Campo."
              : ready
                ? "Toque em iniciar para voltar a compartilhar a posição deste dispositivo."
                : hasPairing
                  ? "Autorize a localização para vincular este aparelho ao rastreador cadastrado."
                  : "Digite o código exibido no Mapa de Campo para vincular este aparelho."}
          </p>
        </div>

        <div className="space-y-4 p-5">
          {!ready && !pairingToken && <div>
            <label className="mb-1.5 block text-[10px] font-black uppercase tracking-[0.12em] text-white/45">Código de pareamento</label>
            <input
              value={pairingCode}
              onChange={event => setPairingCode(event.target.value.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 12))}
              placeholder="EX.: A1B2C3D4E5F6"
              className="h-12 w-full rounded-xl border border-white/10 bg-white/5 px-4 text-center font-mono text-base font-black uppercase tracking-[0.12em] text-white outline-none transition focus:border-[#7185f5]"
            />
          </div>}

          {ready && <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-white/8 bg-white/[0.03] p-3">
              <p className="text-[9px] font-black uppercase tracking-wider text-white/35">Status</p>
              <p className={"mt-1 text-sm font-black " + (tracking ? "text-emerald-300" : "text-white/70")}>
                {tracking ? "Ao vivo" : "Pausado"}
              </p>
            </div>
            <div className="rounded-xl border border-white/8 bg-white/[0.03] p-3">
              <p className="text-[9px] font-black uppercase tracking-wider text-white/35">Precisão GPS</p>
              <p className="mt-1 text-sm font-black text-white/70">{accuracy == null ? "—" : "~" + Math.round(accuracy) + " m"}</p>
            </div>
          </div>}

          {lastUpdate && <div className="flex items-center gap-2 rounded-xl border border-emerald-400/15 bg-emerald-500/[0.06] px-3 py-2.5 text-xs font-semibold text-emerald-200">
            <CheckCircle2 size={15} />
            Última posição enviada às {new Date(lastUpdate).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </div>}

          {error && <div className="flex items-start gap-2 rounded-xl border border-red-400/20 bg-red-500/10 px-3 py-3 text-xs font-semibold leading-5 text-red-200">
            <WifiOff size={15} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>}

          {!tracking ? <button
            type="button"
            disabled={busy || (!ready && !hasPairing)}
            onClick={() => void activate()}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#1032dc] px-4 text-sm font-black text-white transition hover:bg-[#2447e8] disabled:cursor-not-allowed disabled:opacity-45"
          >
            <LocateFixed size={17} />
            {busy ? "Obtendo localização..." : ready ? "Iniciar localização" : "Ativar neste dispositivo"}
          </button> : <button
            type="button"
            disabled={busy}
            onClick={() => void pause()}
            className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-white/12 bg-white/5 px-4 text-sm font-black text-white transition hover:bg-white/10 disabled:opacity-45"
          >
            <Pause size={17} />
            {busy ? "Pausando..." : "Pausar rastreamento"}
          </button>}

          {ready && !tracking && <button
            type="button"
            onClick={forget}
            className="w-full py-1 text-xs font-bold text-white/40 transition hover:text-white/70"
          >
            Remover pareamento deste aparelho
          </button>}
        </div>
      </section>

      <div className="mt-4 rounded-xl border border-white/8 bg-white/[0.025] p-4">
        <div className="flex items-start gap-3">
          <ShieldCheck size={18} className="mt-0.5 shrink-0 text-[#7185f5]" />
          <p className="text-[11px] leading-5 text-white/45">
            O aparelho envia somente coordenadas necessárias ao rastreamento operacional. O IMEI, quando cadastrado, é usado apenas para identificação e não fornece localização por conta própria.
          </p>
        </div>
      </div>

      <p className="mt-4 text-center text-[10px] leading-5 text-white/30">
        Para melhor continuidade, mantenha esta página aberta. Navegadores podem limitar GPS quando a tela fica bloqueada; rastreadores veiculares dedicados podem ser integrados por API.
      </p>
    </main>
  </div>;
}
