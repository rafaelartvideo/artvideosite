import { useEffect, useRef, useState } from "react";
import { Headphones, LoaderCircle, Mic, MicOff, Phone, PhoneIncoming, PhoneOff, ShieldCheck, Unplug } from "lucide-react";
import { PageHeader } from "@/shared/ui/admin/AdminLayout";

// Primeira etapa: somente a Union World e a extensao 900 (teste de eco).
// Credenciais SIP sao inseridas pelo operador e nunca persistidas no navegador.
const SIP_USER = "union-301";
const SIP_HOST = "pbx.unionworld.com.br";
const SIP_WSS = `wss://${SIP_HOST}/ws`;

type RegistrationState = "offline" | "connecting" | "registered" | "error";
type CallState = "idle" | "dialing" | "incoming" | "active";

type SipSession = {
  direction?: string;
  remote_identity?: { uri?: { user?: string } };
  connection?: RTCPeerConnection;
  on: (event: string, handler: (...args: any[]) => void) => void;
  answer: (options: Record<string, unknown>) => void;
  terminate: () => void;
  mute: (options: { audio: boolean }) => void;
  unmute: (options: { audio: boolean }) => void;
};

export function UnionPbxToolPage({ onBack }: { onBack: () => void }) {
  const [password, setPassword] = useState("");
  const [registration, setRegistration] = useState<RegistrationState>("offline");
  const [callState, setCallState] = useState<CallState>("idle");
  const [remoteParty, setRemoteParty] = useState("");
  const [muted, setMuted] = useState(false);
  const [notice, setNotice] = useState("Conecte o ramal para iniciar o teste de audio.");
  const [audioBlocked, setAudioBlocked] = useState(false);

  const uaRef = useRef<any>(null);
  const sessionRef = useRef<SipSession | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const generationRef = useRef(0);

  const clearAudio = () => {
    const element = remoteAudioRef.current;
    if (element) {
      element.pause();
      element.srcObject = null;
    }
    setAudioBlocked(false);
  };

  const stop = () => {
    generationRef.current += 1;
    try { sessionRef.current?.terminate(); } catch { /* chamada ja encerrada */ }
    sessionRef.current = null;
    try { uaRef.current?.stop(); } catch { /* websocket ja desconectado */ }
    uaRef.current = null;
    clearAudio();
    setMuted(false);
    setRemoteParty("");
    setCallState("idle");
    setRegistration("offline");
    setPassword("");
    setNotice("Ramal desconectado.");
  };

  useEffect(() => () => {
    generationRef.current += 1;
    try { sessionRef.current?.terminate(); } catch { /* liberacao */ }
    try { uaRef.current?.stop(); } catch { /* liberacao */ }
    const audio = remoteAudioRef.current;
    if (audio) { audio.pause(); audio.srcObject = null; }
  }, []);

  const attachMedia = (session: SipSession, generation: number) => {
    const bindPeer = (pc: RTCPeerConnection) => {
      pc.addEventListener("track", event => {
        if (generationRef.current !== generation) return;
        const element = remoteAudioRef.current;
        if (!element) return;
        element.srcObject = event.streams[0] || new MediaStream([event.track]);
        void element.play().then(() => setAudioBlocked(false)).catch(() => setAudioBlocked(true));
      });
    };

    session.on("peerconnection", ({ peerconnection }: { peerconnection?: RTCPeerConnection }) => {
      if (peerconnection) bindPeer(peerconnection);
    });
    if (session.connection) bindPeer(session.connection);
  };

  const connect = async () => {
    if (uaRef.current || registration === "connecting") return;
    if (!password.trim()) {
      setNotice("Informe a senha SIP exclusiva do ramal union-301.");
      return;
    }
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setRegistration("error");
      setNotice("Este navegador precisa de HTTPS e permissao de microfone para usar WebRTC.");
      return;
    }

    const generation = ++generationRef.current;
    setRegistration("connecting");
    setNotice("Conectando ao PABX Union...");
    try {
      // Carregado somente ao abrir o telefone: nao pesa no restante do CRM.
      const module = await import("jssip");
      if (generation !== generationRef.current) return;
      const JsSIP = (module as any).default || module;
      const ua = new JsSIP.UA({
        sockets: [new JsSIP.WebSocketInterface(SIP_WSS)],
        uri: `sip:${SIP_USER}@${SIP_HOST}`,
        authorization_user: SIP_USER,
        password,
        display_name: "Union World",
        register: true,
        session_timers: false,
      });
      uaRef.current = ua;
      setPassword(""); // O segredo fica apenas na instancia SIP enquanto conectada.

      const isCurrent = () => generationRef.current === generation;
      ua.on("registered", () => {
        if (!isCurrent()) return;
        setRegistration("registered");
        setNotice("Ramal conectado. Ligue para 900 para testar o audio.");
      });
      ua.on("registrationFailed", () => {
        if (!isCurrent()) return;
        setRegistration("error");
        setNotice("O Asterisk recusou o registro. Confira a senha do ramal na VPS.");
      });
      ua.on("disconnected", () => {
        if (!isCurrent()) return;
        setRegistration("error");
        setNotice("Conexao WebSocket interrompida. Desconecte e tente novamente.");
      });
      ua.on("newRTCSession", ({ session }: { session: SipSession }) => {
        if (!isCurrent()) {
          try { session.terminate(); } catch { /* sessao encerrada */ }
          return;
        }
        if (sessionRef.current && sessionRef.current !== session) {
          try { session.terminate(); } catch { /* ocupada */ }
          return;
        }
        sessionRef.current = session;
        setRemoteParty(session.remote_identity?.uri?.user || "Chamada");
        setMuted(false);
        setCallState(session.direction === "incoming" ? "incoming" : "dialing");
        attachMedia(session, generation);
        session.on("confirmed", () => {
          if (!isCurrent()) return;
          setCallState("active");
          setNotice("Chamada em andamento.");
        });
        const finish = (failed: boolean) => {
          if (!isCurrent() || sessionRef.current !== session) return;
          sessionRef.current = null;
          setCallState("idle");
          setRemoteParty("");
          setMuted(false);
          clearAudio();
          setNotice(failed ? "Nao foi possivel completar a chamada. Consulte o console do Asterisk." : "Chamada encerrada.");
        };
        session.on("ended", () => finish(false));
        session.on("failed", () => finish(true));
      });
      ua.start();
    } catch {
      if (generation !== generationRef.current) return;
      setRegistration("error");
      setNotice("Nao foi possivel iniciar o telefone. Desconecte e tente novamente.");
    }
  };

  const callEcho = () => {
    if (registration !== "registered" || !uaRef.current?.isRegistered?.() || sessionRef.current) return;
    setNotice("Chamando extensao de teste 900...");
    try {
      uaRef.current.call(`sip:900@${SIP_HOST}`, {
        mediaConstraints: { audio: true, video: false },
        pcConfig: { iceServers: [] },
      });
    } catch {
      setNotice("Falha ao iniciar o teste. Confira a permissao de microfone.");
    }
  };

  const answer = () => {
    if (callState !== "incoming" || !sessionRef.current) return;
    try {
      sessionRef.current.answer({ mediaConstraints: { audio: true, video: false } });
      setNotice("Atendendo chamada...");
    } catch {
      setNotice("Nao foi possivel atender. Verifique o microfone.");
    }
  };

  const hangup = () => {
    try { sessionRef.current?.terminate(); }
    catch { setNotice("Nao foi possivel encerrar a chamada."); }
  };

  const toggleMute = () => {
    if (!sessionRef.current || callState !== "active") return;
    try {
      if (muted) sessionRef.current.unmute({ audio: true });
      else sessionRef.current.mute({ audio: true });
      setMuted(!muted);
    } catch {
      setNotice("Nao foi possivel alterar o microfone.");
    }
  };

  return <div className="min-w-0 space-y-5">
    <PageHeader title="PABX Union" subtitle="Telefone WebRTC do CRM - primeiro teste de conexao e audio." />

    <div className="mx-auto w-full max-w-2xl space-y-4">
      <section className="rounded-xl border border-border bg-card p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-foreground">Linha Union World</h2>
            <p className="mt-1 text-sm text-muted-foreground">(11) 4290-1575 · Ramal {SIP_USER}</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${registration === "registered" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : registration === "connecting" ? "bg-blue-500/10 text-blue-700 dark:text-blue-300" : "bg-muted text-muted-foreground"}`}>
            {registration === "registered" ? "Conectado" : registration === "connecting" ? "Conectando" : registration === "error" ? "Falha na conexao" : "Desconectado"}
          </span>
        </div>

        {registration === "offline" && <div className="mt-5 space-y-3">
          <label htmlFor="union-sip-password" className="block text-sm font-medium text-foreground">Senha SIP do ramal {SIP_USER}</label>
          <input id="union-sip-password" type="password" value={password} onChange={event => setPassword(event.target.value)}
            autoComplete="off" spellCheck={false} placeholder="Digite a senha protegida na VPS"
            className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-primary" />
          <p className="text-xs text-muted-foreground">A senha nao e salva no banco, em cookies nem no armazenamento local. Nao utilize a senha do tronco FVX.</p>
          <button type="button" onClick={() => void connect()} disabled={!password.trim()}
            className="flex h-10 items-center justify-center gap-2 rounded-lg bg-[#0057e7] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
            <Phone size={16} /> Conectar ramal
          </button>
        </div>}

        {registration !== "offline" && <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" onClick={stop}
            className="flex h-10 items-center gap-2 rounded-lg border border-border px-4 text-sm font-semibold text-foreground">
            <Unplug size={16} /> Desconectar
          </button>
          {registration === "connecting" && <LoaderCircle size={20} className="animate-spin self-center text-primary" />}
        </div>}
      </section>

      <section className="rounded-xl border border-border bg-card p-4 sm:p-6" aria-live="polite">
        <div className="flex flex-col items-center gap-3 rounded-lg bg-muted/40 p-5 text-center">
          <Headphones className="text-primary" size={30} />
          <p className="text-lg font-semibold text-foreground">{callState === "incoming" ? "Chamada recebida" : callState === "active" ? "Em ligacao" : callState === "dialing" ? "Chamando" : "Teste de audio"}</p>
          <p className="text-sm text-muted-foreground">{callState === "idle" ? "Disque 900 para ouvir sua propria voz." : remoteParty}</p>
          <p className="max-w-md text-xs leading-5 text-muted-foreground">{notice}</p>
        </div>

        <audio ref={remoteAudioRef} autoPlay playsInline aria-label="Audio da ligacao" />
        {audioBlocked && <button type="button" onClick={() => {
          void remoteAudioRef.current?.play().then(() => setAudioBlocked(false)).catch(() => setNotice("Habilite o audio do site nas configuracoes do navegador."));
        }} className="mt-3 w-full rounded-lg border border-amber-500/40 p-2.5 text-sm font-semibold text-foreground">
          Habilitar audio da chamada
        </button>}

        <div className="mt-4 flex flex-wrap justify-center gap-3">
          {callState === "idle" && <button type="button" disabled={registration !== "registered"} onClick={callEcho}
            className="flex h-11 items-center gap-2 rounded-lg bg-[#0057e7] px-5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
            <Phone size={17} /> Testar ramal 900
          </button>}
          {callState === "incoming" && <button type="button" onClick={answer}
            className="flex h-11 items-center gap-2 rounded-lg bg-emerald-600 px-5 text-sm font-semibold text-white">
            <PhoneIncoming size={17} /> Atender
          </button>}
          {callState === "active" && <button type="button" onClick={toggleMute}
            className="flex h-11 items-center gap-2 rounded-lg border border-border px-4 text-sm font-semibold text-foreground">
            {muted ? <MicOff size={17} /> : <Mic size={17} />} {muted ? "Ativar microfone" : "Silenciar"}
          </button>}
          {callState !== "idle" && <button type="button" onClick={hangup}
            className="flex h-11 items-center gap-2 rounded-lg bg-red-600 px-5 text-sm font-semibold text-white">
            <PhoneOff size={17} /> Desligar
          </button>}
        </div>
      </section>

      <div className="flex gap-2 rounded-lg border border-border bg-muted/30 p-3 text-xs leading-5 text-muted-foreground">
        <ShieldCheck size={18} className="mt-0.5 shrink-0 text-primary" />
        <p>Etapa segura de teste: somente a extensao interna 900 esta liberada. O encaminhamento da linha externa e as chamadas para numeros publicos ainda nao foram ativados. A conexao termina ao sair desta pagina.</p>
      </div>
      <button type="button" onClick={onBack} className="text-sm font-semibold text-primary hover:underline">Voltar para Ferramentas</button>
    </div>
  </div>;
}
