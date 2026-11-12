import { FInput, AdminSelect, AdminFieldLabel } from "@/shared/ui/admin/AdminFormControls";
import { useEffect, useRef, useState } from "react";
import { Headphones, LoaderCircle, Mic, MicOff, Phone, PhoneIncoming, PhoneOff, ShieldCheck, Unplug, Delete, Radio, ArrowLeft, RefreshCw } from "lucide-react";
import { PageHeader, AdminButton, AdminDialog } from "@/shared/ui/admin/AdminLayout";
import { useAuth } from "@/lib/auth";
import { PHONE_CALL_EVENT } from "@/features/orders/domain/order-contact-actions";
import { supabase } from "@/lib/supabase";
import { UnionPbxAudioDiagnostics } from "./UnionPbxAudioDiagnostics";
import { UnionPbxCallActions } from "./UnionPbxCallActions";
import { UnionPbxDtmfPad } from "./UnionPbxDtmfPad";
import { UnionPbxAudioDevices } from "./UnionPbxAudioDevices";
import type { UnionPbxSection } from "./UnionPbxSectionTabs";
import { UnionPbxOperatorWorkspace, formatPbxNumber } from "./UnionPbxOperatorWorkspace";
import { microphoneConstraints } from "../application/audio-devices";
import { normalizeNationalDestination } from "../application/outbound-dialing";
import {externalDialingAllowed,type ExternalDialGrant} from '../application/external-access';
import { holdCall, transferCall, type CallControlSession } from "../application/call-controls";
import { sendPbxDigit, type PbxDigitSession } from "../application/dtmf";
import { pbxRequest } from "../application/pbx-request";
import { bindRemoteAudio } from "../application/remote-audio";
import { acquireManagedPbxCredentials, findMyManagedPbxExtension, type ManagedPbxExtension } from "@/features/telephony/application/managed-browser-credentials";

// Acesso piloto da Union World; diretório e filas são consultados por organização.
// Credenciais SIP sao inseridas pelo operador e nunca persistidas no navegador.
const SIP_USER = "union-301";
const SIP_HOST = "pbx.unionworld.com.br";
const SIP_WSS = `wss://${SIP_HOST}/ws`;

type RegistrationState = "offline" | "connecting" | "registered" | "error";
type CallState = "idle" | "dialing" | "incoming" | "active";
type InternalDirectoryEntry = { number: number; endpoint_name: string; display_name: string; desired_enabled: boolean; provisioning_status: string; is_managed: boolean };

type SipSession = CallControlSession & PbxDigitSession & {
  direction?: string;
  remote_identity?: { uri?: { user?: string } };
  connection?: RTCPeerConnection;
  on: (event: string, handler: (...args: any[]) => void) => void;
  answer: (options: Record<string, unknown>) => void;
  terminate: () => void;
  mute: (options: { audio: boolean }) => void;
  unmute: (options: { audio: boolean }) => void;
};

export function UnionPbxToolPage({ onBack, onOpen, onManage, onManageQueues, onManageFlows, onManageTrunks, onManageInbound, onHistory, onRecordings, isPageOpen, allowExternalCalls = false }: { onBack: () => void; onOpen: () => void; onManage?: () => void; onManageQueues?: () => void; onManageFlows?: () => void; onManageTrunks?: () => void; onManageInbound?: () => void; onHistory?: () => void; onRecordings?: () => void; isPageOpen: boolean; allowExternalCalls?: boolean }) {
  const { activeOrganizationId, organizations } = useAuth();
  const isPlatformOperatorOrganization = organizations.find(item => item.organization_id === activeOrganizationId)?.is_platform_operator === true;
  const [password, setPassword] = useState("");
  const [connectionDialogOpen, setConnectionDialogOpen] = useState(false);
  const [deviceDialogOpen, setDeviceDialogOpen] = useState(false);
  const [sipUser, setSipUser] = useState(isPlatformOperatorOrganization ? SIP_USER : "");
  const [managedExtension, setManagedExtension] = useState<ManagedPbxExtension | null>(null);
  const [externalGrant,setExternalGrant]=useState<ExternalDialGrant|null>(null);
  const canUseExternal=externalDialingAllowed(allowExternalCalls,isPlatformOperatorOrganization,activeOrganizationId,sipUser,externalGrant);
  useEffect(()=>{
    const controller=new AbortController();
    setExternalGrant(null);
    const endpoint=managedExtension?.endpoint_name;
    if(!activeOrganizationId||!endpoint||isPlatformOperatorOrganization||!isPageOpen)return()=>controller.abort();
    const refresh=()=>void pbxRequest(signal=>supabase.rpc('pbx_can_dial_external',{
      p_organization_id:activeOrganizationId,p_endpoint_name:endpoint,
    }).abortSignal(signal),'Autorização de saída',{signal:controller.signal})
      .then(({data,error})=>{if(!controller.signal.aborted)setExternalGrant({organizationId:activeOrganizationId,endpoint,allowed:!error&&data===true});})
      .catch(()=>{if(!controller.signal.aborted)setExternalGrant(null);});
    refresh();const timer=setInterval(refresh,30000);
    return()=>{controller.abort();clearInterval(timer);};
  },[activeOrganizationId,managedExtension?.endpoint_name,isPlatformOperatorOrganization,isPageOpen]);
  const [checkingManaged, setCheckingManaged] = useState(false);
  const [managedLookupError, setManagedLookupError] = useState("");
  const [directoryRevision, setDirectoryRevision] = useState(0);
  const [manualMode, setManualMode] = useState(false);
  const [directory, setDirectory] = useState<InternalDirectoryEntry[]>([]);
  const [testQueues, setTestQueues] = useState<{number:number; name:string}[]>([]);
  const [testFlows, setTestFlows] = useState<{number:number; name:string}[]>([]);
  const [testFlowError, setTestFlowError] = useState("");
  const [directoryLoading, setDirectoryLoading] = useState(false);
  const [directoryError, setDirectoryError] = useState("");
  const [testQueueError, setTestQueueError] = useState("");
  const [dialTarget, setDialTarget] = useState("");
  const [dialMode, setDialMode] = useState<"internal" | "external">("internal");
  const [externalTarget, setExternalTarget] = useState("");
  const [pendingDialRequest, setPendingDialRequest] = useState<{ phone: string } | null>(null);
  const [registration, setRegistration] = useState<RegistrationState>("offline");
  const [callState, setCallState] = useState<CallState>("idle");
  const [remoteParty, setRemoteParty] = useState("");
  const [muted, setMuted] = useState(false);
  const [microphoneId, setMicrophoneId] = useState("");
  const [outputPending, setOutputPending] = useState(false);
  const outputPendingRef = useRef(false);
  const [notice, setNotice] = useState("Conecte o ramal para iniciar o teste de audio.");
  const [audioBlocked, setAudioBlocked] = useState(false);
  const [held, setHeld] = useState(false);
  const [holdUncertain, setHoldUncertain] = useState(false);
  const [transferUncertain, setTransferUncertain] = useState(false);
  const [controlBusy, setControlBusy] = useState<'hold' | 'transfer' | null>(null);
  const [transferDestination, setTransferDestination] = useState("");

  const uaRef = useRef<any>(null);
  const sessionRef = useRef<SipSession | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const generationRef = useRef(0);
  const controlAbortRef = useRef<AbortController | null>(null);
  const controlLockRef = useRef(false);
  const transferUncertainRef = useRef(false);
  const credentialAbortRef = useRef<AbortController | null>(null);
  const registrationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    if ((!isPageOpen && !pendingDialRequest) || !activeOrganizationId) { setCheckingManaged(false); return () => { cancelled = true; }; }
    setCheckingManaged(true);
    setManagedLookupError("");
    void findMyManagedPbxExtension(activeOrganizationId, controller.signal)
      .then(extension => { if (!cancelled) setManagedExtension(extension); })
      .catch(error => { if (!cancelled) {
        setManagedExtension(null);
        setManagedLookupError(error instanceof Error ? error.message : 'Falha na consulta do ramal vinculado.');
      } })
      .finally(() => { if (!cancelled) setCheckingManaged(false); });
    return () => { cancelled = true; controller.abort(); };
  }, [activeOrganizationId,isPageOpen,Boolean(pendingDialRequest),directoryRevision]);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    if (!activeOrganizationId || !isPageOpen) { setDirectoryLoading(false); return () => { cancelled = true; }; }
    setDirectoryLoading(true);
    setDirectoryError("");
    setDirectory([]);
    void pbxRequest(signal => supabase.from("pbx_extensions")
      .select("number,endpoint_name,display_name,desired_enabled,provisioning_status,is_managed")
      .eq("organization_id",activeOrganizationId)
      .order("number")
      .limit(100)
      .abortSignal(signal), 'Consulta dos ramais internos', { signal: controller.signal })
      .then(({data,error}) => {
        if (cancelled) return;
        if (error) setDirectoryError("Não foi possível carregar os ramais internos.");
        else setDirectory(((data || []) as InternalDirectoryEntry[]).filter(item =>
          item.desired_enabled && (item.provisioning_status === "applied" || item.provisioning_status === "manual") &&
          (isPlatformOperatorOrganization || item.is_managed && item.endpoint_name !== SIP_USER)
        ));
      })
      .catch(error => { if (!cancelled) setDirectoryError(error instanceof Error ? error.message : 'Falha na consulta dos ramais internos.'); })
      .finally(() => { if (!cancelled) setDirectoryLoading(false); });
    return () => { cancelled = true; controller.abort(); };
  }, [activeOrganizationId,isPageOpen,directoryRevision]);

  useEffect(() => {
    let cancelled=false;
    const controller = new AbortController();
    setTestQueues([]);
    setTestQueueError("");
    if(!activeOrganizationId || !isPageOpen) return () => { cancelled=true; };
    void pbxRequest(signal => supabase.rpc("pbx_available_test_queues",{p_organization_id:activeOrganizationId}).abortSignal(signal),
      'Consulta das filas', { signal: controller.signal })
      .then(({data,error})=>{
        if(cancelled) return;
        if(error) { setTestQueueError('Não foi possível consultar as filas da empresa.'); return; }
        setTestQueues(((data||[]) as {test_extension:number;name:string}[]).map(item=>({
          number:item.test_extension,name:item.name,
        })));
      }).catch(error => { if (!cancelled) setTestQueueError(error instanceof Error ? error.message : 'Falha na consulta das filas.'); });
    return () => { cancelled=true; controller.abort(); };
  },[activeOrganizationId,isPageOpen,directoryRevision]);

  useEffect(() => {
    const controller=new AbortController();let cancelled=false;
    setTestFlows([]);setTestFlowError('');
    if(!activeOrganizationId || !isPageOpen)return()=>{cancelled=true;};
    void pbxRequest(signal=>supabase.rpc("pbx_available_test_flows",{p_organization_id:activeOrganizationId}).abortSignal(signal),
      'Consulta dos fluxos de atendimento',{signal:controller.signal})
      .then(({data,error})=>{
        if(cancelled)return;
        if(error){setTestFlowError('Não foi possível consultar os fluxos de atendimento.');return;}
        setTestFlows(((data||[]) as {test_extension:number;name:string}[]).map(item=>({number:item.test_extension,name:item.name})));
      }).catch(()=>{if(!cancelled)setTestFlowError('Não foi possível consultar os fluxos de atendimento.');});
    return()=>{cancelled=true;controller.abort();};
  },[activeOrganizationId,isPageOpen,directoryRevision]);

  const ownNumber = sipUser === SIP_USER ? 301 : managedExtension?.number;
  const dialableExtensions = directory.filter(item => item.number !== ownNumber && item.endpoint_name !== sipUser);
  const transferExtensions = dialableExtensions.filter(item => String(item.number) !== remoteParty && item.endpoint_name !== remoteParty);
  const dialableNumbers = new Set([
    ...dialableExtensions.map(item=>item.number),
    ...testQueues.map(item=>item.number),
    ...testFlows.map(item=>item.number),
  ]);

  const internalDestinationReady = dialTarget === "900" || dialableNumbers.has(Number(dialTarget));
  const registeredAndIdle = registration === "registered" && callState === "idle" && !outputPending;
  const selectSection = (section: UnionPbxSection) => {
    if (section === "historico") onHistory?.();
    else if (section === "gravacoes") onRecordings?.();
    else if (section === "ramais") onManage?.();
    else if (section === "filas") onManageQueues?.();
    else if (section === "fluxos") onManageFlows?.();
    else if (section === "troncos") onManageTrunks?.();
    else if (section === "entrada") onManageInbound?.();
  };

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
    credentialAbortRef.current?.abort();
    credentialAbortRef.current = null;
    if (registrationTimerRef.current) clearTimeout(registrationTimerRef.current);
    registrationTimerRef.current = null;
    controlAbortRef.current?.abort();
    controlAbortRef.current = null;
    controlLockRef.current = false;
    transferUncertainRef.current = false;
    setTransferUncertain(false);
    setHoldUncertain(false);
    setControlBusy(null);
    setHeld(false);
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
    setSipUser(isPlatformOperatorOrganization ? SIP_USER : "");
    setNotice("Ramal desconectado.");
  };

  useEffect(() => () => {
    generationRef.current += 1;
    credentialAbortRef.current?.abort();
    if (registrationTimerRef.current) clearTimeout(registrationTimerRef.current);
    controlAbortRef.current?.abort();
    try { sessionRef.current?.terminate(); } catch { /* liberacao */ }
    try { uaRef.current?.stop(); } catch { /* liberacao */ }
    const audio = remoteAudioRef.current;
    if (audio) { audio.pause(); audio.srcObject = null; }
  }, []);

  const attachMedia = (session: SipSession, generation: number) => {
    bindRemoteAudio(session, {
      isCurrent: () => generationRef.current === generation && sessionRef.current === session,
      getAudio: () => remoteAudioRef.current,
      onBlocked: setAudioBlocked,
    });
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
      const module = await pbxRequest(() => import("jssip"), 'Carregamento do telefone');
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

      const isCurrent = () => generationRef.current === generation && uaRef.current === ua;
      let transportConnected = false;
      ua.on('connected', () => {
        if (!isCurrent()) return;
        transportConnected = true;
        if (!sessionRef.current?.isEstablished()) setNotice('Conexão segura aberta. Aguardando o registro SIP...');
      });
      ua.on("registered", () => {
        if (!isCurrent()) return;
        if (registrationTimerRef.current) clearTimeout(registrationTimerRef.current);
        registrationTimerRef.current = null;
        setRegistration("registered");
        setNotice("Ramal conectado. Ligue para 900 para testar o audio.");
      });
      ua.on("registrationFailed", () => {
        if (!isCurrent()) return;
        if (registrationTimerRef.current) clearTimeout(registrationTimerRef.current);
        registrationTimerRef.current = null;
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
        controlAbortRef.current?.abort();
        controlAbortRef.current = new AbortController();
        controlLockRef.current = false;
        transferUncertainRef.current = false;
        setTransferUncertain(false);
        setHoldUncertain(false);
        setControlBusy(null);
        setHeld(false);
        setTransferDestination("");
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
          controlAbortRef.current?.abort();
          controlAbortRef.current = null;
          controlLockRef.current = false;
          transferUncertainRef.current = false;
          setTransferUncertain(false);
          setHoldUncertain(false);
          setControlBusy(null);
          setHeld(false);
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
      registrationTimerRef.current = setTimeout(() => {
        if (!isCurrent() || ua.isRegistered?.()) return;
        registrationTimerRef.current = null;
        if (!sessionRef.current?.isEstablished()) {
          uaRef.current = null;
          try { ua.stop(); } catch { /* conexão já encerrada */ }
        }
        setRegistration('error');
        setNotice(transportConnected
          ? 'Registro SIP: o PABX não confirmou o ramal em 25 segundos. Verifique o ramal e tente novamente.'
          : 'Conexão segura: o WebSocket do PABX não ficou disponível em 25 segundos. Verifique a rede e tente novamente.');
      }, 25_000);
      ua.start();
    } catch (error) {
      if (generation !== generationRef.current) return;
      if (registrationTimerRef.current) clearTimeout(registrationTimerRef.current);
      registrationTimerRef.current = null;
      setRegistration("error");
      setNotice(error instanceof Error ? `Inicialização do telefone: ${error.message}` : 'Não foi possível iniciar o telefone. Desconecte e tente novamente.');
    }
  };


  const connect = () => {
    if (!isPlatformOperatorOrganization) return;
    if (uaRef.current || registration === "connecting") return;
    if (!password.trim()) { setNotice("Informe a senha SIP exclusiva do ramal union-301."); return; }
    const generation = ++generationRef.current;
    void startSip(SIP_USER,password,generation);
  };

  const connectManaged = async () => {
    if (uaRef.current || registration === "connecting" || !activeOrganizationId ||
        !managedExtension || managedExtension.provisioning_status !== "applied") return;
    const generation=++generationRef.current;
    credentialAbortRef.current?.abort();
    const controller = new AbortController();
    credentialAbortRef.current = controller;
    setRegistration("connecting");
    setNotice("Solicitando acesso criptografado ao seu ramal...");
    try {
      const sip=await acquireManagedPbxCredentials(
        activeOrganizationId,
        () => generationRef.current !== generation,
        message => { if (generationRef.current === generation) setNotice(message); },
        controller.signal,
      );
      if(generationRef.current !== generation) return;
      await startSip(sip.username,sip.password,generation);
    } catch (error) {
      if(generationRef.current !== generation) return;
      setRegistration("error");
      setNotice(error instanceof Error?error.message:"Não foi possível conectar o ramal.");
    } finally {
      if (credentialAbortRef.current === controller) credentialAbortRef.current = null;
    }
  };

  const callEcho = () => {
    if (outputPendingRef.current) { setNotice('Aguarde a confirmação da saída de áudio antes de ligar.'); return; }
    if (registration !== "registered" || !uaRef.current?.isRegistered?.() || sessionRef.current) return;
    setNotice("Chamando extensao de teste 900...");
    try {
      uaRef.current.call(`sip:900@${SIP_HOST}`, {
        mediaConstraints: microphoneConstraints(microphoneId),
        pcConfig: { iceServers: [] },
      });
    } catch {
      setNotice("Falha ao iniciar o teste. Confira a permissao de microfone.");
    }
  };

  const callInternal = () => {
    if (dialTarget === "900") { callEcho(); return; }
    if (outputPendingRef.current) { setNotice('Aguarde a confirmação da saída de áudio antes de ligar.'); return; }
    const destination = Number(dialTarget);
    if (!dialTarget || !Number.isInteger(destination) ||
        !dialableNumbers.has(destination) ||
        registration !== "registered" || !uaRef.current?.isRegistered?.() || sessionRef.current) return;
    setNotice("Chamando destino interno " + destination + "...");
    try {
      uaRef.current.call(`sip:${destination}@${SIP_HOST}`, {
        mediaConstraints: microphoneConstraints(microphoneId),
        pcConfig: { iceServers: [] },
      });
    } catch {
      setNotice("Não foi possível ligar para o ramal. Verifique o microfone e o PABX.");
    }
  };

  const originateExternal = (destination: string, label: string) => {
    setNotice("Chamando " + label + " pela operadora configurada...");
    try {
      uaRef.current.call(`sip:${destination}@${SIP_HOST}`, {
        mediaConstraints: microphoneConstraints(microphoneId),
        pcConfig: { iceServers: [] },
      });
    } catch {
      setNotice("Não foi possível iniciar a ligação. Confira o ramal e o microfone.");
    }
  };

  const callExternal = () => {
    const destination = normalizeNationalDestination(externalTarget);
    if (!canUseExternal || !destination || outputPendingRef.current ||
        registration !== "registered" || !uaRef.current?.isRegistered?.() || sessionRef.current) return;
    originateExternal(destination, externalTarget);
  };

  // Click-to-call reutiliza a unica sessao SIP, inclusive fora da rota PABX.
  // Nao intercepta outras empresas: a saida externa piloto e exclusiva da Union.
  useEffect(() => {
    if (!isPlatformOperatorOrganization || !canUseExternal || !activeOrganizationId) return;

    const requestCall = (rawPhone: string, requestedOrganizationId?: string | null) => {
      if (requestedOrganizationId && requestedOrganizationId !== activeOrganizationId) return false;
      const destination = normalizeNationalDestination(rawPhone);
      setExternalTarget(rawPhone);
      setDialMode("external");

      if (!destination) {
        setNotice("Telefone inválido. Informe um número nacional com DDD.");
        setPendingDialRequest({ phone: rawPhone });
        return true;
      }
      if (registration !== "registered" || !uaRef.current?.isRegistered?.()) {
        setNotice("Conecte seu ramal para ligar.");
        setPendingDialRequest({ phone: rawPhone });
        return true;
      }
      if (callState !== "idle" || sessionRef.current || outputPendingRef.current) {
        setNotice("Já existe uma chamada em andamento ou o áudio está sendo preparado.");
        onOpen();
        return true;
      }
      originateExternal(destination, rawPhone);
      return true;
    };

    const handleIntegrationCall = (event: Event) => {
      const detail = (event as CustomEvent<{phone?: string; organizationId?: string | null}>).detail;
      if (detail?.phone && requestCall(detail.phone, detail.organizationId)) event.preventDefault();
    };
    const handlePhoneAnchorClick = (event: MouseEvent) => {
      if (event.defaultPrevented || !(event.target instanceof Element)) return;
      const anchor = event.target.closest<HTMLAnchorElement>('a[href^="tel:"]');
      // A OS ja usa o evento de integracao. Nao originar duas chamadas pelo mesmo clique.
      if (!anchor || anchor.hasAttribute("data-phone-number")) return;
      const rawPhone = anchor.getAttribute("href")?.slice(4) || "";
      if (requestCall(rawPhone)) event.preventDefault();
    };

    window.addEventListener(PHONE_CALL_EVENT, handleIntegrationCall);
    document.addEventListener("click", handlePhoneAnchorClick, true);
    return () => {
      window.removeEventListener(PHONE_CALL_EVENT, handleIntegrationCall);
      document.removeEventListener("click", handlePhoneAnchorClick, true);
    };
  }, [activeOrganizationId, isPlatformOperatorOrganization, canUseExternal, registration, callState, microphoneId, onOpen]);

  const answer = () => {
    if (outputPendingRef.current) { setNotice('Aguarde a confirmação da saída de áudio antes de atender.'); return; }
    if (callState !== "incoming" || !sessionRef.current) return;
    try {
      sessionRef.current.answer({ mediaConstraints: microphoneConstraints(microphoneId) });
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

  const dtmfDisabled = callState !== 'active' || held || holdUncertain || transferUncertain || Boolean(controlBusy)
    || controlLockRef.current || transferUncertainRef.current || !sessionRef.current?.isEstablished();

  const sendDigit = (digit: string) => {
    const session = sessionRef.current;
    if (!session || callState !== 'active' || held || holdUncertain || transferUncertain || controlBusy
      || controlLockRef.current || transferUncertainRef.current) {
      setNotice('O teclado fica disponível durante uma chamada ativa, fora da espera e de negociações.');
      return;
    }
    try {
      if (!session.isEstablished()) {
        setNotice('Não há chamada ativa para enviar a tecla.');
        return;
      }
      sendPbxDigit(session, digit);
      setNotice(`Tecla ${digit} enviada à chamada.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Não foi possível enviar a tecla.');
    }
  };

  const runControl = async (kind: 'hold' | 'transfer') => {
    const session = sessionRef.current;
    const signal = controlAbortRef.current?.signal;
    if (!session || !signal || callState !== 'active' || controlLockRef.current) return;
    if (kind === 'transfer' && transferUncertainRef.current) return;
    const generation = generationRef.current;
    const isCurrent = () => sessionRef.current === session && generationRef.current === generation && !signal.aborted;
    controlLockRef.current = true;
    setControlBusy(kind);
    try {
      if (kind === 'hold') {
        const nextHeld = !held;
        setNotice(nextHeld ? 'Solicitando espera...' : 'Solicitando retomada...');
        await holdCall(session, nextHeld, { signal });
        if (!isCurrent()) return;
        setHeld(nextHeld);
        setHoldUncertain(false);
        setNotice(nextHeld ? 'Chamada em espera.' : 'Chamada retomada.');
      } else {
        const destination = transferDestination;
        setNotice('Solicitando transferência para o ramal ' + destination + '...');
        await transferCall(session, destination, new Set(transferExtensions.map(item => String(item.number))), {
          signal,
          onProgress: stage => { if (isCurrent()) setNotice(stage === 'ringing'
            ? 'Aguardando atendimento do ramal ' + destination + '...'
            : 'O PABX recebeu a transferência. Aguardando confirmação do destino...'); },
        });
        if (!isCurrent()) return;
        try {
          // Only a successful final NOTIFY permits releasing our original leg.
          session.terminate();
          setNotice('Transferência concluída para o ramal ' + destination + '.');
        } catch {
          setNotice('Transferência confirmada. Use Desligar para encerrar este trecho se ele continuar ativo.');
        }
      }
    } catch (error) {
      if (isCurrent()) {
        if (error instanceof Error && error.name === 'CallControlTimeoutError') {
          if (kind === 'transfer') {
            transferUncertainRef.current = true;
            setTransferUncertain(true);
          } else {
            setHeld(Boolean(session.isOnHold?.().local));
            setHoldUncertain(true);
          }
        }
        setNotice(error instanceof Error ? error.message : 'Não foi possível concluir a operação.');
      }
    } finally {
      if (isCurrent()) { controlLockRef.current = false; setControlBusy(null); }
    }
  };

  return <>
    {/* Mantido montado mesmo fora da rota: WebSocket, sessao SIP e audio nao sao interrompidos na navegacao. */}
    {/* Audio fica montado durante toda a navegação para não interromper chamadas. */}
    <audio ref={remoteAudioRef} autoPlay playsInline aria-label="Áudio da ligação" className="hidden" />
    <div className={isPageOpen ? "min-w-0" : "hidden"} aria-hidden={!isPageOpen}>
      <UnionPbxOperatorWorkspace
        isActive={isPageOpen}
        lineLabel={isPlatformOperatorOrganization ? "(11) 4290-1575 · Union World" : "Telefonia interna"}
        extensionLabel={sipUser ? `Ramal ${ownNumber || sipUser}` : managedExtension ? `Ramal ${managedExtension.number}` : "Ramal não conectado"}
        connectionStatus={registration} callState={callState} remoteParty={remoteParty}
        directory={directory} queues={testQueues} directoryLoading={directoryLoading}
        onBack={onBack} onConnectionSettings={() => setConnectionDialogOpen(true)}
        onDeviceSettings={() => setDeviceDialogOpen(true)} onDirectoryChange={() => setDirectoryRevision(value => value + 1)}
        onSelectSection={selectSection} canManage={Boolean(onManage || onManageQueues || onManageFlows)}
        canManageInbound={Boolean(isPlatformOperatorOrganization && onManageInbound)}
        canRecordings={Boolean(onRecordings)}
        onDialNumber={number => {
          if (callState !== "idle") return;
          const digits = number.replace(/\D/g, "");
          if (digits.length <= 6 && (digits === "900" || dialableNumbers.has(Number(digits)))) {
            setDialMode("internal"); setDialTarget(digits);
          } else if (canUseExternal) {
            setDialMode("external"); setExternalTarget(number);
          } else setNotice("O número selecionado não é um destino interno permitido.");
        }}
        dialer={<div className="space-y-3">
          {callState !== "idle" && <div role="status" className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-center">
            <p className="text-sm font-semibold">{callState === "incoming" ? "Chamada recebida" : callState === "dialing" ? "Chamando..." : "Em ligação"}</p>
            <p className="mt-1 truncate text-xs text-muted-foreground">{remoteParty}</p>
          </div>}
          {callState === "idle" && canUseExternal && <div role="group" aria-label="Tipo de ligação" className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
            <button type="button" aria-pressed={dialMode === "internal"} onClick={() => setDialMode("internal")}
              className={`rounded-md px-2 py-2 text-sm font-semibold ${dialMode === "internal" ? "bg-card text-primary shadow-sm" : "text-muted-foreground"}`}>Interna</button>
            <button type="button" aria-pressed={dialMode === "external"} onClick={() => setDialMode("external")}
              className={`rounded-md px-2 py-2 text-sm font-semibold ${dialMode === "external" ? "bg-card text-primary shadow-sm" : "text-muted-foreground"}`}>Externa</button>
          </div>}
          {callState === "idle" && <div className="space-y-2">
            <AdminFieldLabel label={dialMode === "external" && canUseExternal ? "Número com DDD" : "Ramal, fila ou URA"} />
            <div className="relative">
              <FInput type="tel" inputMode="tel" autoComplete="off"
                aria-label="Digite nome ou número" placeholder={dialMode === "external" && canUseExternal ? "DDD + telefone" : "Digite um número"}
                value={dialMode === "external" && canUseExternal ? formatPbxNumber(externalTarget) : dialTarget}
                onChange={event => {
                  if (dialMode === "external" && canUseExternal) setExternalTarget(event.target.value.replace(/[^\d+()\s-]/g, "").slice(0,32));
                  else setDialTarget(event.target.value.replace(/\D/g,"").slice(0,6));
                }} />
              <button type="button" aria-label="Apagar último dígito" title="Apagar último dígito"
                onClick={() => dialMode === "external" && canUseExternal ? setExternalTarget(value => value.slice(0,-1)) : setDialTarget(value => value.slice(0,-1))}
                className="absolute right-2 top-1/2 -translate-y-1/2 bg-transparent p-1.5 text-muted-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"><Delete size={18}/></button>
            </div>
            {(dialMode === "internal" || !canUseExternal) && <div>
              <AdminSelect value={dialableNumbers.has(Number(dialTarget)) ? dialTarget : ""}
                onValueChange={setDialTarget} ariaLabel="Selecionar ramal ou fila"
                disabled={directoryLoading}
                options={[{value:"",label:"Selecionar destino interno"},
                  ...dialableExtensions.map(item => ({value:String(item.number),label:`${item.number} · Ramal · ${item.display_name}`})),
                  ...testQueues.map(item => ({value:String(item.number),label:`${item.number} · Fila · ${item.name}`})),
                  ...testFlows.map(item => ({value:String(item.number),label:`${item.number} · URA · ${item.name}`}))]} />
            </div>}
          </div>}
          <div className="grid grid-cols-3 gap-2" aria-label="Teclado de discagem">
            {([["1",""],["2","ABC"],["3","DEF"],["4","GHI"],["5","JKL"],["6","MNO"],["7","PQRS"],["8","TUV"],["9","WXYZ"],["*",""],["0","+"],["#",""]] as const).map(([digit, letters]) =>
              <button key={digit} type="button" aria-label={`Tecla ${digit}`}
                disabled={callState === "idle" && (digit === "*" || digit === "#") || (callState !== "idle" && callState !== "active") || (callState === "active" && dtmfDisabled)}
                onClick={() => {
                  if (callState === "active") sendDigit(digit);
                  else if (dialMode === "external" && canUseExternal) setExternalTarget(value => (value.replace(/\D/g, "") + digit).slice(0,11));
                  else setDialTarget(value => (value + digit).slice(0,6));
                }}
                className="flex h-[60px] flex-col items-center justify-center rounded-lg border border-border bg-background text-xl font-semibold text-foreground transition-colors hover:border-primary/30 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 disabled:opacity-35">
                {digit}<span className="text-[10px] font-normal tracking-wide text-muted-foreground">{letters || "\u00a0"}</span>
              </button>)}
          </div>
          {callState === "idle" && <>
            <AdminButton variant="primary" className="!w-full" disabled={!registeredAndIdle || (dialMode === "external" && canUseExternal ? !normalizeNationalDestination(externalTarget) : !internalDestinationReady)}
              onClick={dialMode === "external" && canUseExternal ? callExternal : callInternal}>
              <Phone size={17}/> Ligar
            </AdminButton>
            
          </>}
          {callState === "incoming" && <AdminButton variant="success" className="!w-full" onClick={answer} disabled={outputPending}>
            <PhoneIncoming size={17}/> Atender chamada
          </AdminButton>}
          {callState === "active" && <AdminButton variant="secondary" className="!w-full" onClick={toggleMute}>
            {muted ? <MicOff size={16}/> : <Mic size={16}/>} {muted ? "Ativar microfone" : "Silenciar"}
          </AdminButton>}
          {callState !== "idle" && <AdminButton variant="danger" className="!w-full" onClick={hangup}>
            <PhoneOff size={17}/> Desligar
          </AdminButton>}
          {callState === "active" && <UnionPbxCallActions idPrefix="pbx-full" held={held} holdUncertain={holdUncertain} transferUncertain={transferUncertain} busy={controlBusy}
            destination={transferDestination} extensions={transferExtensions} onDestination={setTransferDestination}
            onHold={() => void runControl("hold")} onTransfer={() => void runControl("transfer")} />}
          {audioBlocked && <AdminButton variant="secondary" className="!w-full" onClick={() => {
            void remoteAudioRef.current?.play().then(() => setAudioBlocked(false)).catch(() => setNotice("Habilite o áudio do site nas configurações do navegador."));
          }}>Habilitar áudio da chamada</AdminButton>}
          {(registration === "error" || /falha|erro|não foi possível|aguarde|bloquead|sem confirmação/i.test(notice)) && <p role="alert" className="break-words text-xs leading-5 text-destructive">{notice}</p>}
          {(directoryError || testQueueError || testFlowError) && <p className="text-xs text-muted-foreground">{directoryError || testQueueError || testFlowError}</p>}
        </div>}
      />
    </div>
    <AdminDialog open={isPageOpen && connectionDialogOpen} onClose={() => setConnectionDialogOpen(false)}
      title="Conexão do ramal" description="Conecte ou desconecte seu ramal telefônico."
      className="w-[min(680px,calc(100vw-1.5rem))] max-w-[680px]" minimizable={false}>
      <div className="space-y-4">
      <section className="rounded-xl border border-border bg-card p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-foreground">{isPlatformOperatorOrganization ? "Linha Union World" : "Telefonia interna"}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{isPlatformOperatorOrganization ? "(11) 4290-1575 · " : ""}{sipUser ? `Ramal ${sipUser}` : "Seu ramal individual"}</p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${registration === "registered" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" : registration === "connecting" ? "bg-blue-500/10 text-blue-700 dark:text-blue-300" : "bg-muted text-muted-foreground"}`}>
            {registration === "registered" ? "Conectado" : registration === "connecting" ? "Conectando" : registration === "error" ? "Falha na conexao" : "Desconectado"}
          </span>
        </div>

        {registration === "offline" && <div className="mt-5 space-y-3">
          {managedLookupError && <div role="alert" className="space-y-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-foreground">
            <p>{managedLookupError}</p>
            <AdminButton variant="secondary" size="sm" onClick={() => setDirectoryRevision(value => value + 1)}>Tentar consultar novamente</AdminButton>
          </div>}
          {managedExtension && !manualMode && (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-foreground">Meu ramal {managedExtension.number} · {managedExtension.display_name}</p>
              <p className="text-xs text-muted-foreground">
                {managedExtension.provisioning_status === "applied"
                  ? "Acesso individual protegido. A senha permanece na VPS e é enviada somente criptografada para este navegador."
                  : "Ramal ainda não ativado na VPS."}
              </p>
              <AdminButton variant="primary" type="button" onClick={() => void connectManaged()}
                disabled={checkingManaged || managedExtension.provisioning_status !== "applied"}
                >
                <Phone size={16} /> Conectar meu ramal {managedExtension.number}
              </AdminButton>
              {isPlatformOperatorOrganization && <AdminButton variant="ghost" type="button" onClick={() => setManualMode(true)}
                >Usar o ramal manual 301</AdminButton>}
            </div>
          )}
          {!isPlatformOperatorOrganization && !managedExtension && !checkingManaged && !managedLookupError &&
            <p className="text-sm text-muted-foreground">Nenhum ramal vinculado ao seu usuário. Peça ao administrador para cadastrar e vincular seu ramal.</p>}
          {isPlatformOperatorOrganization && (!managedExtension || manualMode) && <>
          {checkingManaged && <p className="text-xs text-muted-foreground">Verificando ramal vinculado...</p>}
          <label htmlFor="union-sip-password" className="block text-sm font-medium text-foreground">Senha SIP do ramal {SIP_USER}</label>
          <FInput id="union-sip-password" type="password" value={password} onChange={event => setPassword(event.target.value)}
            autoComplete="off" spellCheck={false} placeholder="Digite a senha protegida na VPS"
             />
          <p className="text-xs text-muted-foreground">A senha nao e salva no banco, em cookies nem no armazenamento local. Nao utilize a senha do tronco FVX.</p>
          <AdminButton variant="primary" type="button" onClick={() => void connect()} disabled={!password.trim()}
            >
            <Phone size={16} /> Conectar ramal
          </AdminButton>
          {managedExtension && <AdminButton variant="ghost" type="button" onClick={() => setManualMode(false)}
            >Voltar para meu ramal {managedExtension.number}</AdminButton>}
          </>}
        </div>}

        {registration !== "offline" && <div className="mt-5 flex flex-wrap gap-2">
          <AdminButton variant="secondary" type="button" onClick={stop}
            >
            <Unplug size={16} /> Desconectar
          </AdminButton>
          {registration === "connecting" && <LoaderCircle size={20} className="animate-spin self-center text-primary" />}
        </div>}
      </section>


      </div>
    </AdminDialog>

    <AdminDialog open={isPageOpen && deviceDialogOpen} onClose={() => setDeviceDialogOpen(false)}
      title="Dispositivos e testes de áudio" description="Escolha o microfone, a saída de som e teste a conexão."
      className="w-[min(680px,calc(100vw-1.5rem))] max-w-[680px]" minimizable={false}>
      <div className="space-y-4">
        <UnionPbxAudioDevices locked={callState !== "idle"} microphoneId={microphoneId} onMicrophone={setMicrophoneId}
          onOutputPending={pending => { outputPendingRef.current = pending; setOutputPending(pending); }} getAudio={() => remoteAudioRef.current} />
        {outputPending && <p role="status" className="text-sm text-muted-foreground">Aguardando confirmação da saída de áudio.</p>}

        <AdminButton variant="secondary" disabled={!registeredAndIdle} onClick={callEcho}>
          <Headphones size={16}/> Testar áudio no ramal 900
        </AdminButton>
        {callState === "active" && <UnionPbxAudioDiagnostics connection={sessionRef.current?.connection} />}
        {registration !== "registered" && <p className="text-xs text-muted-foreground">Conecte o ramal para testar o áudio.</p>}
      </div>
    </AdminDialog>
    {!isPageOpen && (registration !== "offline" || callState !== "idle") && (
      <section
        role={callState === "incoming" ? "alert" : "region"}
        aria-label="Telefone PABX Union"
        className="fixed bottom-[calc(env(safe-area-inset-bottom)+1rem)] left-3 right-3 z-[95] max-h-[calc(100dvh-2rem-env(safe-area-inset-bottom))] space-y-3 overflow-y-auto rounded-xl border border-border bg-card p-4 text-foreground shadow-[0_15px_50px_rgba(0,0,0,0.18)] sm:bottom-5 sm:left-auto sm:right-5 sm:w-[350px]"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold">PABX Union <span className="ml-1 text-xs font-normal text-muted-foreground">· {sipUser}</span></p>
            <p className="mt-1 text-xs text-muted-foreground">
              {callState === "incoming" ? "Chamada recebida" : callState === "active" ? "Em ligação" : callState === "dialing" ? "Chamando" : registration === "registered" ? "Ramal conectado" : registration === "connecting" ? "Conectando" : "Falha na conexão"}
            </p>
          </div>
          <AdminButton variant="secondary" type="button" onClick={onOpen} className="shrink-0" aria-label="Abrir telefone completo">
            Abrir
          </AdminButton>
        </div>
        {callState !== "idle" && <p className="truncate text-sm font-semibold">{remoteParty || "Chamada"}</p>}
        {callState === "active" && <>
          <p role="status" className="text-xs leading-5 text-muted-foreground">{notice}</p>
          <UnionPbxCallActions idPrefix="pbx-floating" held={held} holdUncertain={holdUncertain} transferUncertain={transferUncertain} busy={controlBusy}
            destination={transferDestination} extensions={transferExtensions} onDestination={setTransferDestination}
            onHold={() => void runControl('hold')} onTransfer={() => void runControl('transfer')} />
          <UnionPbxDtmfPad disabled={dtmfDisabled} onDigit={sendDigit} />
        </>}
        {outputPending && <p role="status" className="text-xs text-muted-foreground">Saída de áudio em confirmação. Aguarde antes de atender.</p>}
        {callState === "incoming" && <p className="text-xs text-muted-foreground">Clique em Atender para usar o microfone do computador.</p>}
        <div className="flex flex-wrap items-center gap-2">
          {callState === "incoming" && (
            <AdminButton variant="success" type="button" onClick={answer} disabled={outputPending} className="flex-1">
              <PhoneIncoming size={16} /> Atender
            </AdminButton>
          )}
          {callState === "active" && (
            <AdminButton variant="secondary" type="button" onClick={toggleMute} className="flex-1">
              {muted ? <MicOff size={16} /> : <Mic size={16} />} {muted ? "Ativar microfone" : "Silenciar"}
            </AdminButton>
          )}
          {callState !== "idle" && (
            <AdminButton variant="danger" type="button" onClick={hangup} className="flex-1">
              <PhoneOff size={16} /> Desligar
            </AdminButton>
          )}
          {callState === "idle" && (
            <AdminButton variant="secondary" type="button" onClick={stop} >
              <Unplug size={15} /> {registration === "registered" ? "Desconectar" : "Reiniciar conexão"}
            </AdminButton>
          )}
          {registration === "connecting" && <LoaderCircle size={18} className="animate-spin text-primary" />}
        </div>
        {audioBlocked && (
          <AdminButton variant="secondary" type="button" onClick={() => {
            void remoteAudioRef.current?.play().then(() => setAudioBlocked(false)).catch(() => setNotice("Habilite o audio do site nas configuracoes do navegador."));
          }} className="w-full">
            Habilitar áudio da chamada
          </AdminButton>
        )}
      </section>
    )}
    <AdminDialog
      open={Boolean(pendingDialRequest)}
      onClose={() => { setPendingDialRequest(null); setPassword(""); }}
      title="Ligar pelo PABX Union"
      description="Conecte seu ramal aqui, sem sair da tela atual. A ligação só será iniciada ao confirmar."
      minimizable={false}
      footer={<div className="flex flex-wrap justify-end gap-2">
        <AdminButton variant="secondary" onClick={() => setPendingDialRequest(null)}>Cancelar</AdminButton>
        <AdminButton variant="primary" disabled={registration !== "registered" || callState !== "idle" || outputPending || !normalizeNationalDestination(pendingDialRequest?.phone || "")}
          onClick={() => {
            const raw = pendingDialRequest?.phone || "";
            const destination = normalizeNationalDestination(raw);
            if (!canUseExternal || !destination || !uaRef.current?.isRegistered?.() || sessionRef.current || outputPendingRef.current) return;
            setPendingDialRequest(null);
            originateExternal(destination, raw);
          }}><Phone size={16}/> Ligar</AdminButton>
      </div>}
    >
      <div className="space-y-4">
        <FInput label="Número com DDD" type="tel" inputMode="tel" autoComplete="off" maxLength={32}
          value={pendingDialRequest?.phone || ""} onChange={event => setPendingDialRequest(current => current ? { ...current, phone: event.target.value } : null)} />
        {pendingDialRequest && !normalizeNationalDestination(pendingDialRequest.phone) && <p role="alert" className="text-xs text-destructive">Informe um telefone nacional válido com DDD.</p>}
        <div className="rounded-lg border border-border bg-muted/30 p-3 text-sm">
          <p className="font-semibold text-foreground">Ramal {sipUser || managedExtension?.number || "Union"}</p>
          <p role="status" className="mt-1 text-xs text-muted-foreground">{registration === "registered" ? "Conectado. Confirme a ligação abaixo." : registration === "connecting" ? "Conectando o ramal..." : registration === "error" ? notice : "Conecte seu ramal para continuar."}</p>
        </div>
        {registration === "connecting" && <div role="status" className="flex items-center gap-2 text-sm text-primary"><LoaderCircle size={16} className="animate-spin"/> Conectando...</div>}
        {registration === "error" && <AdminButton variant="secondary" onClick={stop}>Tentar conectar novamente</AdminButton>}
        {registration === "offline" && <>
          {checkingManaged && <p className="text-xs text-muted-foreground">Consultando seu ramal...</p>}
          {managedLookupError && <p role="alert" className="text-xs text-destructive">{managedLookupError}</p>}
          {managedExtension && !manualMode && <div className="space-y-2">
            <p className="text-xs text-muted-foreground">{managedExtension.number} · {managedExtension.display_name}</p>
            <AdminButton variant="primary" disabled={managedExtension.provisioning_status !== "applied"} onClick={() => void connectManaged()}>
              <Phone size={16}/> Conectar meu ramal
            </AdminButton>
            <AdminButton variant="ghost" onClick={() => setManualMode(true)}>Usar ramal manual 301</AdminButton>
          </div>}
          {(!managedExtension || manualMode) && <>
            <FInput label="Senha SIP do ramal 301" type="password" autoComplete="off" spellCheck={false}
              value={password} onChange={event => setPassword(event.target.value)} placeholder="Senha do ramal, não do tronco FVX" />
            <AdminButton variant="primary" disabled={!password.trim()} onClick={connect}><Phone size={16}/> Conectar ramal 301</AdminButton>
            {managedExtension && <AdminButton variant="ghost" onClick={() => setManualMode(false)}>Usar meu ramal vinculado</AdminButton>}
          </>}
        </>}
      </div>
    </AdminDialog>
  </>;
}
