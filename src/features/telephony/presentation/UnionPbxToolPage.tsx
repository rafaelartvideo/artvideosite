import { useEffect, useRef, useState } from "react";
import { Headphones, LoaderCircle, Mic, MicOff, Phone, PhoneIncoming, PhoneOff, ShieldCheck, Unplug } from "lucide-react";
import { PageHeader } from "@/shared/ui/admin/AdminLayout";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { UnionPbxAudioDiagnostics } from "./UnionPbxAudioDiagnostics";
import { acquireManagedPbxCredentials, findMyManagedPbxExtension, type ManagedPbxExtension } from "@/features/telephony/application/managed-browser-credentials";

// Primeira etapa: somente a Union World e a extensao 900 (teste de eco).
// Credenciais SIP sao inseridas pelo operador e nunca persistidas no navegador.
const SIP_USER = "union-301";
const SIP_HOST = "pbx.unionworld.com.br";
const SIP_WSS = `wss://${SIP_HOST}/ws`;

type RegistrationState = "offline" | "connecting" | "registered" | "error";
type CallState = "idle" | "dialing" | "incoming" | "active";
type InternalDirectoryEntry = { number: number; display_name: string; desired_enabled: boolean; provisioning_status: string };

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

export function UnionPbxToolPage({ onBack, onOpen, onManage, onManageQueues, onManageInbound, isPageOpen }: { onBack: () => void; onOpen: () => void; onManage?: () => void; onManageQueues?: () => void; onManageInbound?: () => void; isPageOpen: boolean }) {
  const { activeOrganizationId } = useAuth();
  const [password, setPassword] = useState("");
  const [sipUser, setSipUser] = useState(SIP_USER);
  const [managedExtension, setManagedExtension] = useState<ManagedPbxExtension | null>(null);
  const [checkingManaged, setCheckingManaged] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [directory, setDirectory] = useState<InternalDirectoryEntry[]>([]);
  const [testQueues, setTestQueues] = useState<{number:number; name:string}[]>([]);
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [directoryError, setDirectoryError] = useState("");
  const [dialTarget, setDialTarget] = useState("");
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

  useEffect(() => {
    let cancelled = false;
    if (!isPageOpen || !activeOrganizationId) return () => { cancelled = true; };
    setCheckingManaged(true);
    void findMyManagedPbxExtension(activeOrganizationId)
      .then(extension => { if (!cancelled) setManagedExtension(extension); })
      .catch(() => { if (!cancelled) setManagedExtension(null); })
      .finally(() => { if (!cancelled) setCheckingManaged(false); });
    return () => { cancelled = true; };
  }, [activeOrganizationId,isPageOpen]);

  useEffect(() => {
    let cancelled = false;
    if (!activeOrganizationId || !isPageOpen) return () => { cancelled = true; };
    setDirectoryLoading(true);
    setDirectoryError("");
    setDirectory([]);
    void supabase.from("pbx_extensions")
      .select("number,display_name,desired_enabled,provisioning_status")
      .eq("organization_id",activeOrganizationId)
      .order("number")
      .limit(100)
      .then(({data,error}) => {
        if (cancelled) return;
        if (error) setDirectoryError("Não foi possível carregar os ramais internos.");
        else setDirectory(((data || []) as InternalDirectoryEntry[]).filter(item =>
          item.desired_enabled && (item.provisioning_status === "applied" || item.provisioning_status === "manual")
        ));
      })
      .finally(() => { if (!cancelled) setDirectoryLoading(false); });
    return () => { cancelled = true; };
  }, [activeOrganizationId,isPageOpen]);

  useEffect(() => {
    let cancelled=false;
    setTestQueues([]);
    if(!activeOrganizationId || !isPageOpen) return () => { cancelled=true; };
    void supabase.rpc("pbx_available_test_queues",{p_organization_id:activeOrganizationId})
      .then(({data,error})=>{
        if(cancelled || error) return;
        setTestQueues(((data||[]) as {test_extension:number;name:string}[]).map(item=>({
          number:item.test_extension,name:item.name,
        })));
      });
    return () => { cancelled=true; };
  },[activeOrganizationId,isPageOpen]);

  const ownNumber = sipUser === SIP_USER ? 301 : managedExtension?.number;
  const dialableExtensions = directory.filter(item => item.number !== ownNumber);
  const dialableNumbers = new Set([
    ...dialableExtensions.map(item=>item.number),
    ...testQueues.map(item=>item.number),
  ]);

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
    setSipUser(SIP_USER);
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

  const startSip = async (username: string, secret: string, generation: number) => {
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setRegistration("error");
      setNotice("Este navegador precisa de HTTPS e permissao de microfone para usar WebRTC.");
      return;
    }

    setSipUser(username);
    setRegistration("connecting");
    setNotice("Conectando ao PABX Union...");
    try {
      // Carregado somente ao abrir o telefone: nao pesa no restante do CRM.
      const module = await import("jssip");
      if (generation !== generationRef.current) return;
      const JsSIP = (module as any).default || module;
      const ua = new JsSIP.UA({
        sockets: [new JsSIP.WebSocketInterface(SIP_WSS)],
        uri: `sip:${username}@${SIP_HOST}`,
        authorization_user: username,
        password: secret,
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


  const connect = () => {
    if (uaRef.current || registration === "connecting") return;
    if (!password.trim()) { setNotice("Informe a senha SIP exclusiva do ramal union-301."); return; }
    const generation = ++generationRef.current;
    void startSip(SIP_USER,password,generation);
  };

  const connectManaged = async () => {
    if (uaRef.current || registration === "connecting" || !activeOrganizationId ||
        !managedExtension || managedExtension.provisioning_status !== "applied") return;
    const generation=++generationRef.current;
    setRegistration("connecting");
    setNotice("Solicitando acesso criptografado ao seu ramal...");
    try {
      const sip=await acquireManagedPbxCredentials(
        activeOrganizationId,
        () => generationRef.current !== generation,
        message => { if (generationRef.current === generation) setNotice(message); }
      );
      if(generationRef.current !== generation) return;
      await startSip(sip.username,sip.password,generation);
    } catch (error) {
      if(generationRef.current !== generation) return;
      setRegistration("error");
      setNotice(error instanceof Error?error.message:"Não foi possível conectar o ramal.");
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

  const callInternal = () => {
    const destination = Number(dialTarget);
    if (!dialTarget || !Number.isInteger(destination) ||
        !dialableNumbers.has(destination) ||
        registration !== "registered" || !uaRef.current?.isRegistered?.() || sessionRef.current) return;
    setNotice("Chamando destino interno " + destination + "...");
    try {
      uaRef.current.call(`sip:${destination}@${SIP_HOST}`, {
        mediaConstraints: { audio: true, video: false },
        pcConfig: { iceServers: [] },
      });
    } catch {
      setNotice("Não foi possível ligar para o ramal. Verifique o microfone e o PABX.");
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

  return <>
    {/* Mantido montado mesmo fora da rota: WebSocket, sessao SIP e audio nao sao interrompidos na navegacao. */}
    <div className={isPageOpen ? "min-w-0 space-y-5" : "hidden"} aria-hidden={!isPageOpen}>
    <PageHeader title="PABX Union" subtitle="Telefone WebRTC da Union World. Continue conectado enquanto navega pelo CRM." />

    <div className="mx-auto w-full max-w-2xl space-y-4">
      <section className="rounded-xl border border-border bg-card p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-foreground">Linha Union World</h2>
            <p className="mt-1 text-sm text-muted-foreground">(11) 4290-1575 · Ramal {sipUser}</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${registration === "registered" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : registration === "connecting" ? "bg-blue-500/10 text-blue-700 dark:text-blue-300" : "bg-muted text-muted-foreground"}`}>
            {registration === "registered" ? "Conectado" : registration === "connecting" ? "Conectando" : registration === "error" ? "Falha na conexao" : "Desconectado"}
          </span>
        </div>

        {registration === "offline" && <div className="mt-5 space-y-3">
          {managedExtension && !manualMode && (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-foreground">Meu ramal {managedExtension.number} · {managedExtension.display_name}</p>
              <p className="text-xs text-muted-foreground">
                {managedExtension.provisioning_status === "applied"
                  ? "Acesso individual protegido. A senha permanece na VPS e é enviada somente criptografada para este navegador."
                  : "Ramal ainda não ativado na VPS."}
              </p>
              <button type="button" onClick={() => void connectManaged()}
                disabled={checkingManaged || managedExtension.provisioning_status !== "applied"}
                className="flex h-10 items-center justify-center gap-2 rounded-lg bg-[#0057e7] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
                <Phone size={16} /> Conectar meu ramal {managedExtension.number}
              </button>
              <button type="button" onClick={() => setManualMode(true)}
                className="block text-xs font-semibold text-primary hover:underline">Usar o ramal manual 301</button>
            </div>
          )}
          {(!managedExtension || manualMode) && <>
          {checkingManaged && <p className="text-xs text-muted-foreground">Verificando ramal vinculado...</p>}
          <label htmlFor="union-sip-password" className="block text-sm font-medium text-foreground">Senha SIP do ramal {SIP_USER}</label>
          <input id="union-sip-password" type="password" value={password} onChange={event => setPassword(event.target.value)}
            autoComplete="off" spellCheck={false} placeholder="Digite a senha protegida na VPS"
            className="h-11 w-full rounded-lg border border-input bg-background px-3 text-sm text-foreground outline-none focus:border-primary" />
          <p className="text-xs text-muted-foreground">A senha nao e salva no banco, em cookies nem no armazenamento local. Nao utilize a senha do tronco FVX.</p>
          <button type="button" onClick={() => void connect()} disabled={!password.trim()}
            className="flex h-10 items-center justify-center gap-2 rounded-lg bg-[#0057e7] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
            <Phone size={16} /> Conectar ramal
          </button>
          {managedExtension && <button type="button" onClick={() => setManualMode(false)}
            className="block text-xs font-semibold text-primary hover:underline">Voltar para meu ramal {managedExtension.number}</button>}
          </>}
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
          <p className="text-sm text-muted-foreground">{callState === "idle" ? "Teste o áudio no 900 ou ligue para outro ramal da Union." : remoteParty}</p>
          <p className="max-w-md text-xs leading-5 text-muted-foreground">{notice}</p>
        </div>

        <audio ref={remoteAudioRef} autoPlay playsInline aria-label="Audio da ligacao" />
        {audioBlocked && <button type="button" onClick={() => {
          void remoteAudioRef.current?.play().then(() => setAudioBlocked(false)).catch(() => setNotice("Habilite o audio do site nas configuracoes do navegador."));
        }} className="mt-3 w-full rounded-lg border border-amber-500/40 p-2.5 text-sm font-semibold text-foreground">
          Habilitar audio da chamada
        </button>}

        {callState === "idle" && <div className="mt-4 space-y-2 rounded-lg border border-border p-3">
          <label htmlFor="pbx-internal-destination" className="text-sm font-semibold text-foreground">Ligações internas e filas</label>
          <div className="flex flex-wrap items-center gap-2">
            <select id="pbx-internal-destination" value={dialTarget}
              onChange={event => setDialTarget(event.target.value)}
              className="h-10 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-sm text-foreground"
              disabled={directoryLoading || registration !== "registered"}>
              <option value="">Selecione um ramal ou fila</option>
              {dialableExtensions.map(item => (
                <option key={item.number} value={String(item.number)}>{item.number} · Ramal · {item.display_name}</option>
              ))}
              {testQueues.map(item=>(
                <option key={"fila-"+item.number} value={String(item.number)}>
                  {item.number} · Fila · {item.name}
                </option>
              ))}
            </select>
            <button type="button" onClick={callInternal}
              disabled={registration !== "registered" || !dialableNumbers.has(Number(dialTarget))}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#0057e7] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
              <Phone size={16}/> Ligar
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            {directoryLoading ? "Carregando ramais" : directoryError || "A lista mostra ramais e filas internas aplicadas. A disponibilidade é confirmada ao chamar. Ligações externas continuam desabilitadas."}
          </p>
        </div>}
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

      {callState === "active" && <UnionPbxAudioDiagnostics connection={sessionRef.current?.connection} />}
      <div className="flex gap-2 rounded-lg border border-border bg-muted/30 p-3 text-xs leading-5 text-muted-foreground">
        <ShieldCheck size={18} className="mt-0.5 shrink-0 text-primary" />
        <p>O ramal 301 recebe chamadas da linha da Union World; ramais gerenciados novos ainda não entram na rota de chamadas externas. Todos podem testar o áudio interno pelo 900. Discagem externa ainda não foi habilitada. A conexao fica ativa ao navegar entre as paginas do CRM e termina ao desconectar, trocar de empresa, sair da conta ou fechar esta aba.</p>
      </div>
      <div className="flex flex-wrap gap-4">
        {onManage && <button type="button" onClick={onManage} className="text-sm font-semibold text-primary hover:underline">Gerenciar ramais</button>}
        {onManageQueues && <button type="button" onClick={onManageQueues} className="text-sm font-semibold text-primary hover:underline">Gerenciar filas</button>}
        {onManageInbound && <button type="button" onClick={onManageInbound} className="text-sm font-semibold text-primary hover:underline">Planejar entrada FVX</button>}
        <button type="button" onClick={onBack} className="text-sm font-semibold text-primary hover:underline">Voltar para Ferramentas</button>
      </div>
    </div>
    </div>
    {!isPageOpen && (registration !== "offline" || callState !== "idle") && (
      <section
        role={callState === "incoming" ? "alert" : "region"}
        aria-label="Telefone PABX Union"
        className="fixed bottom-[calc(env(safe-area-inset-bottom)+1rem)] left-3 right-3 z-[95] space-y-3 rounded-xl border border-border bg-card p-4 text-foreground shadow-[0_15px_50px_rgba(0,0,0,0.18)] sm:bottom-5 sm:left-auto sm:right-5 sm:w-[350px]"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold">PABX Union <span className="ml-1 text-xs font-normal text-muted-foreground">· {sipUser}</span></p>
            <p className="mt-1 text-xs text-muted-foreground">
              {callState === "incoming" ? "Chamada recebida" : callState === "active" ? "Em ligação" : callState === "dialing" ? "Chamando" : registration === "registered" ? "Ramal conectado" : registration === "connecting" ? "Conectando" : "Falha na conexão"}
            </p>
          </div>
          <button type="button" onClick={onOpen} className="shrink-0 rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-muted" aria-label="Abrir telefone completo">
            Abrir
          </button>
        </div>
        {callState !== "idle" && <p className="truncate text-sm font-semibold">{remoteParty || "Chamada"}</p>}
        {callState === "incoming" && <p className="text-xs text-muted-foreground">Clique em Atender para usar o microfone do computador.</p>}
        <div className="flex flex-wrap items-center gap-2">
          {callState === "incoming" && (
            <button type="button" onClick={answer} className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 text-sm font-semibold text-white">
              <PhoneIncoming size={16} /> Atender
            </button>
          )}
          {callState === "active" && (
            <button type="button" onClick={toggleMute} className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg border border-border px-3 text-sm font-semibold">
              {muted ? <MicOff size={16} /> : <Mic size={16} />} {muted ? "Ativar microfone" : "Silenciar"}
            </button>
          )}
          {callState !== "idle" && (
            <button type="button" onClick={hangup} className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-red-600 px-3 text-sm font-semibold text-white">
              <PhoneOff size={16} /> Desligar
            </button>
          )}
          {callState === "idle" && (
            <button type="button" onClick={stop} className="inline-flex h-10 items-center gap-2 rounded-lg border border-border px-3 text-xs font-semibold">
              <Unplug size={15} /> {registration === "registered" ? "Desconectar" : "Reiniciar conexão"}
            </button>
          )}
          {registration === "connecting" && <LoaderCircle size={18} className="animate-spin text-primary" />}
        </div>
        {audioBlocked && (
          <button type="button" onClick={() => {
            void remoteAudioRef.current?.play().then(() => setAudioBlocked(false)).catch(() => setNotice("Habilite o audio do site nas configuracoes do navegador."));
          }} className="w-full rounded-lg border border-amber-500/40 px-3 py-2 text-sm font-semibold">
            Habilitar áudio da chamada
          </button>
        )}
      </section>
    )}
  </>;
}
