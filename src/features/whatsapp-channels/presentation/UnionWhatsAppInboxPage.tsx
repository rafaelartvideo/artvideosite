import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router";
import { ChevronDown, ChevronLeft, ChevronRight, FileText, Image as ImageIcon, LoaderCircle, MessageCircle, Paperclip, Settings2, Search, Send, Smile, Mic, Square, Play, Pause, RotateCcw, RefreshCw, CheckCircle2, UserCheck, Volume2, X, Check, CheckCheck, ArrowRightLeft, Plus, Building2, History, Users, ContactRound, Instagram, Facebook , ShieldCheck, Pencil } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { SacEmojiPicker } from "@/features/sac-digital/presentation/SacEmojiPicker";
import { UnionWhatsAppContactsDialog } from "./UnionWhatsAppContactsDialog";
import { WhatsAppOperationsSettings, type WhatsAppOperationsSection } from "./WhatsAppOperationsSettings";
import { WhatsAppRolePermissions } from "./WhatsAppRolePermissions";
import { prepareImageForUpload } from "@/shared/application/upload-file-optimizer";
import { supabase } from "@/lib/supabase";
import { AdminButton, AdminDialog } from "@/shared/ui/admin/AdminLayout";
import { LoadingState, notifyAdmin } from "@/shared/ui/admin/AdminFeedback";
import { WhatsAppContactAvatar, WhatsAppFormattedText, formatWhatsAppPhone, waitingMinutes, waitingLabel, waitingClasses } from "./WhatsAppInboxVisuals";
import { systemErrorMessage } from "@/shared/domain/error-message";
import {
  listUnionWhatsAppConversations, listUnionWhatsAppConversationCounts, listUnionWhatsAppMessages, listUnionWhatsAppProtocols, getUnionWhatsAppConversation,
  operateUnionWhatsAppInbox, unionWhatsAppProtocolLabel, DEFAULT_WHATSAPP_QUEUE_SETTINGS,
  type UnionWhatsAppInboxAction, type UnionWhatsAppParticipant, type UnionWhatsAppConversation, type UnionWhatsAppMessage, type UnionWhatsAppContact, type UnionWhatsAppProtocol, type UnionWhatsAppQueueSettings, type UnionWhatsAppConversationCounts, type UnionWhatsAppInboxFilter, type UnionWhatsAppMessageCursor,
} from "../infrastructure/union-whatsapp-inbox.repository";

const filters = [
  { value: "waiting", label: "Aguardando", tone: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300" },
  { value: "in_att", label: "Em atendimento", tone: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" },
  { value: "forwarded", label: "Encaminhadas", tone: "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300" },
  { value: "finished", label: "Finalizados", tone: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300" },
] as const;
type Filter = "waiting" | "in_att" | "forwarded" | "finished";
const hasForwarding=(item:UnionWhatsAppConversation)=>
  Boolean(item.forwarded_at && item.status!=="finished" && item.status!=="abandoned");
const queueOnly=(item:UnionWhatsAppConversation)=>item.status==="waiting" && !hasForwarding(item);
const isForwardedFor=(item:UnionWhatsAppConversation,userId:string|undefined)=>
  hasForwarding(item) && (!userId || item.forwarded_by===userId ||
    item.forwarded_to===userId || item.status==="waiting");

const brazilNumberDigits = (raw: string) => {
  const digits=raw.replace(/\D/g, "");
  const national=digits.startsWith("55") && digits.length>11 ? digits.slice(2) : digits;
  return national.slice(0,11);
};
const brazilPhoneMask = (raw: string) => {
  const digits=brazilNumberDigits(raw);
  if(!digits) return "";
  if(digits.length<3) return "(" + digits;
  const ddd=digits.slice(0,2);
  const local=digits.slice(2);
  const initial=local.startsWith("9")?5:4;
  return "(" + ddd + ") " + (local.length>initial
    ? local.slice(0,initial)+"-"+local.slice(initial):local);
};
const compactDate = (value: string | null) => value && !Number.isNaN(new Date(value).getTime())
  ? new Date(value).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
  : "";
const clock = (value: string) => new Date(value).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

const voiceTime=(value:number)=>{
  if(!Number.isFinite(value) || value<0)return "0:00";
  const total=Math.floor(value);
  return Math.floor(total/60)+":"+String(total%60).padStart(2,"0");
};
const voiceBars=[8,13,19,12,25,16,9,22,15,28,12,19,26,15,10,22,17,29,12,18,25,11,17,23,14,20,10,16];

function WhatsAppVoicePlayer({src,loading=false,error="",onRetry,compact=false}:{
  src?:string|null;loading?:boolean;error?:string;onRetry?:()=>void;compact?:boolean;
}) {
  const audioRef=useRef<HTMLAudioElement|null>(null);
  const [playing,setPlaying]=useState(false);
  const [duration,setDuration]=useState(0);
  const [elapsed,setElapsed]=useState(0);
  const [rate,setRate]=useState(1);
  const [playbackError,setPlaybackError]=useState("");
  useEffect(()=>{
    setPlaying(false);setDuration(0);setElapsed(0);setPlaybackError("");
  },[src]);
  const toggle=async()=>{
    const audio=audioRef.current;
    if(!audio || !src)return;
    if(!audio.paused){audio.pause();return;}
    setPlaybackError("");
    try {audio.playbackRate=rate;await audio.play();}
    catch {setPlaybackError("Não foi possível reproduzir este áudio.");}
  };
  const seek=(value:number)=>{
    const audio=audioRef.current;
    if(audio && duration>0){audio.currentTime=value;setElapsed(value);}
  };
  const progress=duration>0?Math.min(100,elapsed/duration*100):0;
  return <div className={`min-w-[230px] max-w-full ${compact?"w-full":"w-[300px]"}`}>
    <div className="flex items-center gap-2.5">
      <button type="button" disabled={!src || loading}
        onClick={()=>void toggle()} aria-label={playing?"Pausar áudio":"Reproduzir áudio"}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white transition hover:bg-emerald-700 disabled:opacity-50">
        {loading ? <LoaderCircle size={19} className="animate-spin"/> :
          playing ? <Pause size={19} fill="currentColor"/> : <Play size={19} fill="currentColor" className="ml-0.5"/>}
      </button>
      <div className="min-w-0 flex-1">
        <div className="relative flex h-8 items-center justify-between gap-[2px]" aria-hidden="true">
          {voiceBars.map((h,i)=><span key={i}
            className={`w-[3px] min-w-0 flex-1 rounded-full ${i/voiceBars.length*100<=progress?"bg-emerald-600 dark:bg-emerald-400":"bg-emerald-700/30 dark:bg-emerald-200/40"}`}
            style={{height:h}}/>)}
          <input type="range" aria-label="Posição do áudio" min={0} max={duration||1} step={0.1}
            value={Math.min(elapsed,duration||1)} disabled={!src||duration<=0}
            onChange={event=>seek(Number(event.target.value))}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-default"/>
        </div>
        <div className="mt-0.5 flex items-center justify-between gap-2 text-[10px] text-emerald-900/70 dark:text-emerald-100/75">
          <span className="tabular-nums">{voiceTime(elapsed)} / {duration?voiceTime(duration):"--:--"}</span>
          <button type="button" disabled={!src} aria-label="Alterar velocidade de reprodução"
            title="Velocidade de reprodução"
            onClick={()=>{const next=rate===1?1.5:rate===1.5?2:1;setRate(next);if(audioRef.current)audioRef.current.playbackRate=next;}}
            className="rounded-full bg-emerald-600/10 px-2 py-0.5 font-bold text-emerald-900 disabled:opacity-50 dark:text-emerald-100">
            {rate}x
          </button>
        </div>
      </div>
    </div>
    {src && <audio ref={audioRef} src={src} preload="metadata"
      onLoadedMetadata={event=>{const d=event.currentTarget.duration;if(Number.isFinite(d))setDuration(d);}}
      onDurationChange={event=>{const d=event.currentTarget.duration;if(Number.isFinite(d))setDuration(d);}}
      onTimeUpdate={event=>setElapsed(event.currentTarget.currentTime)}
      onPlay={()=>setPlaying(true)} onPause={()=>setPlaying(false)}
      onEnded={()=>{setPlaying(false);setElapsed(0);}}
      onError={()=>setPlaybackError("O arquivo de áudio não pôde ser reproduzido.")}/>}
    {(error||playbackError) && <div className="mt-2 flex items-center gap-2 text-xs text-red-700 dark:text-red-300">
      <span className="min-w-0 flex-1">{error||playbackError}</span>
      {onRetry && <button type="button" onClick={onRetry} className="shrink-0 underline">Tentar novamente</button>}
    </div>}
    {!src && !loading && !error && <p className="mt-1 text-[10px] opacity-70">Áudio indisponível</p>}
  </div>;
}

function MessageBody({ message, organizationId, onMediaLoad }: {
  message: UnionWhatsAppMessage; organizationId: string; onMediaLoad?: () => void;
}) {
  const [mediaUrl, setMediaUrl] = useState("");
  const [mediaLoading, setMediaLoading] = useState(false);
  const [mediaError, setMediaError] = useState("");
  const hasStoredMedia = Boolean(message.media_path || message.media_available);
  const loadMedia = useCallback(async () => {
    if (!hasStoredMedia || mediaLoading || !organizationId) return;
    setMediaLoading(true);
    setMediaError("");
    try {
      const data = await operateUnionWhatsAppInbox(organizationId, message.conversation_id, "media_view", {
        message_id: message.id,
      });
      if (!data.url) throw new Error("Mídia não disponível.");
      setMediaUrl(data.url);
    } catch (reason) {
      setMediaError(systemErrorMessage(reason, "Não foi possível abrir o arquivo."));
    } finally {
      setMediaLoading(false);
    }
  }, [message.id, message.conversation_id, organizationId, hasStoredMedia, mediaLoading]);

  useEffect(() => {
    setMediaUrl("");
    setMediaError("");
    if (hasStoredMedia && (["image","sticker","audio"].includes(message.message_type) ||
      (message.message_type==="file" && message.media_mime?.startsWith("audio/")))) void loadMedia();
    // Avoid repeatedly fetching large files when switching conversation.
  }, [message.id, hasStoredMedia, message.message_type, organizationId]);

  if(message.message_type==="audio" ||
    (message.message_type==="file" && message.media_mime?.startsWith("audio/"))) {
    return <WhatsAppVoicePlayer src={mediaUrl} loading={mediaLoading} error={mediaError}
      onRetry={()=>void loadMedia()}/>;
  }
  if (message.message_type === "text" || message.message_type === "unknown") {
    return <p className="text-sm leading-5"><WhatsAppFormattedText text={message.body_text || "Mensagem"}/></p>;
  }
  const mediaIcons = { image:ImageIcon, video:FileText, audio:Volume2, file:FileText,
    location:FileText, contact:FileText, sticker:ImageIcon };
  const Icon = (mediaIcons as Record<string, typeof FileText>)[message.message_type] || FileText;
  const label = ({image:"Imagem", video:"Vídeo", audio:"Áudio", file:"Documento",
    location:"Localização", contact:"Contato",sticker:"Figurinha"} as Record<string,string>)[message.message_type] || "Mensagem";
  return <div className="space-y-2">
    {mediaUrl && ["image","sticker"].includes(message.message_type) && <a href={mediaUrl} target="_blank" rel="noopener noreferrer"
      className="block overflow-hidden rounded-md"><img src={mediaUrl} alt={message.media_name || "Imagem do WhatsApp"}
        onLoad={onMediaLoad} loading="lazy" className="max-h-80 w-auto max-w-full rounded-md object-contain"/></a>}
    {mediaUrl && message.message_type === "video" && <video src={mediaUrl} preload="metadata" controls
      className="max-h-80 w-full rounded-md" />}
    {mediaUrl && message.message_type === "file" && <div className="flex items-center gap-3 rounded-md border border-border/70 px-3 py-2 text-xs">
      <FileText size={17}/><a href={mediaUrl} target="_blank" rel="noopener noreferrer" className="font-bold hover:underline">Abrir {message.media_name || "documento"}</a>
      <a href={mediaUrl} target="_blank" rel="noopener noreferrer" download={message.media_name || undefined} className="font-semibold hover:underline">Baixar</a>
    </div>}
    {!mediaUrl && <div className="flex items-center gap-2 text-sm">
      <Icon size={17}/>
      <span className="font-semibold">{message.media_name || label}</span>
      {hasStoredMedia && <button type="button" disabled={mediaLoading} onClick={() => void loadMedia()}
        className="text-xs font-semibold text-primary underline-offset-2 hover:underline disabled:opacity-40">
        {mediaLoading ? "Carregando..." : "Abrir"}
      </button>}
      {!hasStoredMedia && <span className="text-[10px] opacity-60">(arquivo não sincronizado)</span>}
    </div>}
    {message.body_text && <p className="text-sm leading-5"><WhatsAppFormattedText text={message.body_text}/></p>}
    {mediaError && <p role="alert" className="text-xs text-red-600">{mediaError}</p>}
  </div>;
}

function WhatsAppIcon({size=19}:{size?:number}={}) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.966-.273-.099-.471-.149-.67.149-.198.297-.768.966-.94 1.164-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.76-1.653-2.057-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.173.198-.298.297-.496.099-.198.05-.372-.025-.52-.074-.15-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.01-.372-.012-.57-.012s-.52.074-.793.372-1.04 1.016-1.04 2.479 1.065 2.875 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.71.306 1.263.489 1.695.625.712.226 1.36.194 1.872.118.571-.085 1.758-.718 2.006-1.412.248-.694.248-1.289.173-1.412-.074-.124-.272-.198-.57-.347zm-5.43 7.287h-.003a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.999-3.648-.236-.374a9.86 9.86 0 01-1.51-5.262c.002-5.442 4.429-9.87 9.874-9.87a9.81 9.81 0 016.986 2.895 9.81 9.81 0 012.89 6.99c-.002 5.444-4.43 9.87-9.866 9.87zm8.405-18.284A11.8 11.8 0 0012.04 0C5.495 0 .169 5.325.166 11.87a11.8 11.8 0 001.586 5.925L.064 23.968l6.318-1.657a11.86 11.86 0 005.653 1.44h.005c6.545 0 11.872-5.325 11.875-11.87a11.81 11.81 0 00-3.468-8.396z"/>
  </svg>;
}
export function UnionWhatsAppInboxPage({ onBack, onConfigure, onOpenCustomer, onOpenOrder }: {
  onBack: () => void; onConfigure: () => void; onOpenCustomer?: (customerId:string) => void; onOpenOrder?: (orderId:string) => void;
}) {
  const { activeOrganizationId, hasPermission, user } = useAuth();
  const location = useLocation();
  const canView = hasPermission("whatsapp.inbox.view");
  const [capabilities,setCapabilities] = useState<Record<string,boolean>>({});
  const canAction=(key:string)=>capabilities[key]===true;
  const canSend=canAction("send");
  const canManage=canAction("view_all");
  const [conversations, setConversations] = useState<UnionWhatsAppConversation[]>([]);
  const [messages, setMessages] = useState<UnionWhatsAppMessage[]>([]);
  const [messagesHasMore,setMessagesHasMore]=useState(false);
  const [messagesOlderLoading,setMessagesOlderLoading]=useState(false);
  const messageCursorRef=useRef<UnionWhatsAppMessageCursor|null>(null);
  const [protocolFilter,setProtocolFilter] = useState<{id:string;label:string}|null>(null);
  const [protocolsOpen,setProtocolsOpen] = useState(false);
  const [protocolsLoading,setProtocolsLoading] = useState(false);
  const [protocolsMoreLoading,setProtocolsMoreLoading] = useState(false);
  const [protocols,setProtocols] = useState<UnionWhatsAppProtocol[]>([]);
  const [protocolsHasMore,setProtocolsHasMore]=useState(false);
  const [protocolsPage,setProtocolsPage]=useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedFallback,setSelectedFallback]=useState<UnionWhatsAppConversation|null>(null);
  const [filter, setFilter] = useState<Filter>("waiting");
  const [query, setQuery] = useState("");
  const [debouncedQuery,setDebouncedQuery]=useState("");
  const [conversationPage,setConversationPage]=useState(0);
  const [conversationHasMore,setConversationHasMore]=useState(false);
  const [conversationPageLoading,setConversationPageLoading]=useState(false);
  const [conversationCounts,setConversationCounts]=useState<UnionWhatsAppConversationCounts>({
    waiting:0,in_att:0,forwarded:0,finished:0,total:0,unread:0,
  });
  useEffect(()=>{
    const timer=window.setTimeout(()=>setDebouncedQuery(query.trim()),300);
    return()=>window.clearTimeout(timer);
  },[query]);
  const [readyAccount,setReadyAccount] = useState<string|null>(null);
  const [clockNow,setClockNow] = useState(()=>Date.now());
  const [documentVisible,setDocumentVisible]=useState(()=>document.visibilityState==="visible");
  useEffect(()=>{
    const handle=()=>setDocumentVisible(document.visibilityState==="visible");
    document.addEventListener("visibilitychange",handle);
    return()=>document.removeEventListener("visibilitychange",handle);
  },[]);
  const [queueSettings,setQueueSettings]=useState<UnionWhatsAppQueueSettings>(DEFAULT_WHATSAPP_QUEUE_SETTINGS);
  const [routingLoading,setRoutingLoading]=useState(false);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const lastFeedbackRef = useRef<{message:string;at:number}|null>(null);
  const reportError = useCallback((message:string) => {
    if (!message) return;
    const now = Date.now();
    if (lastFeedbackRef.current?.message === message && now-lastFeedbackRef.current.at < 6000) return;
    lastFeedbackRef.current = {message,at:now};
    notifyAdmin(message,"error");
  },[]);

  const [draft, setDraft] = useState("");
  const [runningAction, setRunningAction] = useState<UnionWhatsAppInboxAction | null>(null);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [imageOptimizing, setImageOptimizing] = useState(false);
  const optimizeSeq = useRef(0);
  const mediaInputRef = useRef<HTMLInputElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const discardRecordingRef = useRef(false);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [routingOpen, setRoutingOpen] = useState(false);
  const [routingMode,setRoutingMode] = useState<"operator"|"department">("operator");
  const [targetDepartmentId,setTargetDepartmentId] = useState("");
  const [departments,setDepartments] = useState<Array<{id:string;name:string;is_active:boolean}>>([]);
  const [departmentFilter,setDepartmentFilter] = useState("all");
  const [settingsOpen,setSettingsOpen] = useState(false);
  const [settingsModal,setSettingsModal] = useState<WhatsAppOperationsSection|"permissions"|null>(null);
  const [settingsCreateRequest,setSettingsCreateRequest] = useState(0);
  const settingsMenuRef=useRef<HTMLDivElement|null>(null);
  const [ordersOpen,setOrdersOpen] = useState(false);
  const [possibleOrders,setPossibleOrders] = useState<Array<{id:string;os_number:string;created_at:string}>>([]);
  const [savingOrder,setSavingOrder] = useState(false);
  const [handoffs,setHandoffs] = useState<Array<{id:string;protocol_id:string|null;action:string;actor_id:string;to_user_id:string|null;to_department_id:string|null;created_at:string}>>([]);
  const [newConversationOpen, setNewConversationOpen] = useState(false);
  const [contactsOpen,setContactsOpen] = useState(false);
  const [editContactId,setEditContactId]=useState<string|null>(null);
  const [newPhone, setNewPhone] = useState("");
  const [newName, setNewName] = useState("");
  const [starting, setStarting] = useState(false);
  const [checkingNumber, setCheckingNumber] = useState(false);
  const [numberNotice, setNumberNotice] = useState("");
  const [numberError, setNumberError] = useState("");
  const [verifiedContact,setVerifiedContact]=useState<{
    phone:string;name:string;avatarUrl:string|null;nameSource:"agenda"|"agenda_whatsapp"|"conversa"|"whatsapp"|null;
  }|null>(null);
  const numberCheckSequence=useRef(0);
  const [members, setMembers] = useState<Array<{id:string;name:string}>>([]);
  const [targetUserId, setTargetUserId] = useState("");
  const [participantsOpen,setParticipantsOpen] = useState(false);
  const [participants,setParticipants] = useState<UnionWhatsAppParticipant[]>([]);
  const [participantsRevision,setParticipantsRevision] = useState(0);
  const [participantsBusy,setParticipantsBusy] = useState(false);
  const [participantUserId,setParticipantUserId] = useState("");
  const [requestOpen,setRequestOpen] = useState(false);
  const [requestProtocol,setRequestProtocol] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const messagesContentRef = useRef<HTMLDivElement | null>(null);
  const chatScrollReadyRef = useRef(false);
  const messageHistoryLoadedRef = useRef(false);
  const followLatestRef = useRef(true);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  type PendingEntry = { id: string; conversationId: string; organizationId: string; text: string; previewUrl?:string;
    status: "sending" | "sent" | "unknown" | "failed"; providerMessageId?: string;
    error?: string; sentAt: string; fileName?: string; mediaType?: string };
  const [pending, setPending] = useState<PendingEntry[]>([]);
  const pendingAudioUrlsRef=useRef(new Set<string>());
  useEffect(()=>{
    const retained=new Set(pending.map(item=>item.previewUrl).filter((url):url is string=>Boolean(url)));
    for(const url of pendingAudioUrlsRef.current){
      if(!retained.has(url)){URL.revokeObjectURL(url);pendingAudioUrlsRef.current.delete(url);}
    }
  },[pending]);
  useEffect(()=>()=>{
    for(const url of pendingAudioUrlsRef.current)URL.revokeObjectURL(url);
    pendingAudioUrlsRef.current.clear();
  },[]);
  const sendingIds = useRef(new Set<string>());
  const submitGateRef = useRef(false);
  // Preserve the same request ID if a network timeout leaves delivery uncertain.
  // Regenerating it automatically would risk sending the same message twice.
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const [channelReady, setChannelReady] = useState<boolean | null>(null);
  const [activeChannelId,setActiveChannelId]=useState<string|null>(null);
  const [activeChannelPhone,setActiveChannelPhone]=useState<string|null>(null);

  const [avatars, setAvatars] = useState<Record<string,string|null>>({});
  const [linkedCustomers,setLinkedCustomers] = useState<Record<string,{id:string;name:string}|null>>({});
  const messageIdentity = useRef(0);

  useEffect(() => {
    if (!settingsOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (!settingsMenuRef.current?.contains(event.target as Node)) setSettingsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSettingsOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [settingsOpen]);

  const organizationRef = useRef(activeOrganizationId);
  organizationRef.current=activeOrganizationId;
  const accountRef=useRef(activeChannelPhone);
  accountRef.current=activeChannelPhone;
  const listQueryRef=useRef<{filter:UnionWhatsAppInboxFilter;department:string;search:string;page:number;viewerId?:string;canViewAll?:boolean}>({
    filter:"waiting",department:"all",search:"",page:0,
  });
  listQueryRef.current={filter,department:departmentFilter,search:debouncedQuery,page:conversationPage,
    viewerId:user?.id,canViewAll:canManage};
  const conversationLoadSeq=useRef(0);
  const lastListQueryRef=useRef("");
  const refresh=useCallback(async(silent=false)=>{
    if(!activeOrganizationId||!activeChannelId||!activeChannelPhone||channelReady!==true||!canView)return;
    const sequence=++conversationLoadSeq.current;
    const options={...listQueryRef.current};
    const queryKey=JSON.stringify([activeOrganizationId,activeChannelId,activeChannelPhone,options]);
    if(!silent)setConversationPageLoading(true);
    try{
      const [page,counts]=await Promise.all([
        listUnionWhatsAppConversations(activeOrganizationId,activeChannelId,activeChannelPhone,options),
        listUnionWhatsAppConversationCounts(activeOrganizationId,activeChannelId,activeChannelPhone),
      ]);
      if(sequence!==conversationLoadSeq.current ||
        organizationRef.current!==activeOrganizationId||accountRef.current!==activeChannelPhone)return;
      setConversations(page.items);
      lastListQueryRef.current=queryKey;
      setConversationHasMore(page.hasMore);
      setConversationCounts(counts);
      
    }catch(reason){
      if(sequence===conversationLoadSeq.current&&organizationRef.current===activeOrganizationId)
        reportError(systemErrorMessage(reason,"Não foi possível consultar as conversas."));
    }finally{
      if(sequence===conversationLoadSeq.current)setConversationPageLoading(false);
    }
  },[activeOrganizationId,activeChannelId,activeChannelPhone,channelReady,canView,reportError]);

  const refreshMessages=useCallback(async(conversationId:string,silent=false)=>{
    if(!activeOrganizationId||!activeChannelId||!activeChannelPhone||channelReady!==true||!canView)return;
    const identity=++messageIdentity.current;
    if(!silent)setMessagesLoading(true);
    try{
      const page=await listUnionWhatsAppMessages(activeOrganizationId,conversationId,
        activeChannelId,activeChannelPhone,protocolFilter?.id);
      if(identity!==messageIdentity.current ||
        organizationRef.current!==activeOrganizationId ||
        accountRef.current!==activeChannelPhone)return;
      if(!silent)messageHistoryLoadedRef.current=true;
      setMessages(current=>{
        if(!silent)return page.items;
        const merged=new Map<string,UnionWhatsAppMessage>(current.map(item=>[item.id,item]));
        for(const item of page.items)merged.set(item.id,item);
        return [...merged.values()].sort((a,b)=>
          Date.parse(a.sent_at)-Date.parse(b.sent_at)||a.id.localeCompare(b.id));
      });
      if(!silent||!messageCursorRef.current){
        messageCursorRef.current=page.nextCursor;
        setMessagesHasMore(page.hasMore);
      }
    }catch(reason){
      if(identity===messageIdentity.current && organizationRef.current===activeOrganizationId)
        reportError(systemErrorMessage(reason,"Não foi possível consultar as mensagens."));
    }finally{
      if(identity===messageIdentity.current)setMessagesLoading(false);
    }
  },[activeOrganizationId,activeChannelId,activeChannelPhone,channelReady,canView,protocolFilter?.id,reportError]);

  const loadOlderMessages=async()=>{
    if(!selectedId||!activeOrganizationId||!activeChannelId||!activeChannelPhone ||
      !messagesHasMore||messagesOlderLoading||!messageCursorRef.current)return;
    const cursor={...messageCursorRef.current};
    const threadId=selectedId;
    const identity=messageIdentity.current;
    const scroll=scrollRef.current;
    const previousHeight=scroll?.scrollHeight||0;
    const previousTop=scroll?.scrollTop||0;
    followLatestRef.current=false;
    setMessagesOlderLoading(true);
    try{
      const page=await listUnionWhatsAppMessages(activeOrganizationId,threadId,
        activeChannelId,activeChannelPhone,protocolFilter?.id,cursor);
      if(identity!==messageIdentity.current||accountRef.current!==activeChannelPhone)return;
      setMessages(current=>{
        const joined=new Map<string,UnionWhatsAppMessage>();
        for(const item of [...page.items,...current])joined.set(item.id,item);
        return [...joined.values()].sort((a,b)=>
          Date.parse(a.sent_at)-Date.parse(b.sent_at)||a.id.localeCompare(b.id));
      });
      messageCursorRef.current=page.nextCursor;
      setMessagesHasMore(page.hasMore);
      requestAnimationFrame(()=>{
        const area=scrollRef.current;
        if(area)area.scrollTop=area.scrollHeight-previousHeight+previousTop;
      });
    }catch(reason){
      reportError(systemErrorMessage(reason,"Não foi possível carregar mensagens anteriores."));
    }finally{setMessagesOlderLoading(false);}
  };

  useEffect(() => {
    conversationLoadSeq.current++;
    lastListQueryRef.current="";
    setConversations([]);
    setMessagesHasMore(false);messageCursorRef.current=null;setMessagesOlderLoading(false);
    setConversationHasMore(false);
    setConversationPage(0);
    setQuery("");
    setDebouncedQuery("");
    setConversationCounts({waiting:0,in_att:0,forwarded:0,finished:0,total:0,unread:0});
    setMessages([]);
    setProtocolFilter(null);
    setProtocolsOpen(false);
    setProtocols([]);
    setAvatars({});
    setLinkedCustomers({});
    setSelectedId(null);
    setSelectedFallback(null);
    setFilter("waiting");
    setDraft("");
    setAttachment(null);
    setMediaPreview(null);
    setPending([]);
    setRoutingOpen(false);
    setNewConversationOpen(false);
    setContactsOpen(false);
    setEditContactId(null);
    setSettingsOpen(false);
    setSettingsModal(null);
    setOrdersOpen(false);
    setDepartments([]);
    setQueueSettings(DEFAULT_WHATSAPP_QUEUE_SETTINGS);
    setDepartmentFilter("all");
    setMembers([]);
    
    messageIdentity.current += 1;
  }, [activeOrganizationId]);
  const shownAccountRef=useRef<string|null>(null);
  // Immediately clear the previous account on disconnect AND on number swap.
  // Never display account A's preview while account B's list is loading.
  useEffect(()=>{
    const identity=channelReady===true && activeChannelId && activeChannelPhone
      ? activeOrganizationId+":"+activeChannelId+":"+activeChannelPhone:null;
    if(shownAccountRef.current===identity)return;
    shownAccountRef.current=identity;
    conversationLoadSeq.current++;
    lastListQueryRef.current="";
    listQueryRef.current={filter:"waiting",department:"all",search:"",page:0};
    setConversations([]);setMessagesHasMore(false);messageCursorRef.current=null;
    setConversationHasMore(false);setConversationPage(0);setQuery("");setDebouncedQuery("");
    setMessages([]);setSelectedId(null);setSelectedFallback(null);setProtocolFilter(null);setProtocolsOpen(false);setProtocols([]);
    setAvatars({});setLinkedCustomers({});setContactsOpen(false);
    setQueueSettings(DEFAULT_WHATSAPP_QUEUE_SETTINGS);
    setNewConversationOpen(false);
    messageIdentity.current+=1;
  },[activeOrganizationId,channelReady,activeChannelId,activeChannelPhone]);
  // Não liberar os painéis até lista e departamentos terminarem de carregar.
  useEffect(()=>{
    if(channelReady!==true || !activeOrganizationId || !activeChannelId || !activeChannelPhone){
      setReadyAccount(null);return;
    }
    const identity=activeOrganizationId+":"+activeChannelId+":"+activeChannelPhone;
    let cancelled=false;
    void Promise.allSettled([
      refresh(true),
      operateUnionWhatsAppInbox(activeOrganizationId,crypto.randomUUID(),"departments_list")
        .then(result=>{if(!cancelled && organizationRef.current===activeOrganizationId)
          setDepartments(result.departments||[]);})
        .catch(reason=>{if(!cancelled)reportError(systemErrorMessage(reason,"Não foi possível carregar os departamentos."));}),
      operateUnionWhatsAppInbox(activeOrganizationId,crypto.randomUUID(),"queue_settings_get")
        .then(result=>{if(!cancelled && organizationRef.current===activeOrganizationId)
          setQueueSettings(result.queue_settings||DEFAULT_WHATSAPP_QUEUE_SETTINGS);})
        .catch(()=>undefined),
    ]).then(()=>{if(!cancelled && organizationRef.current===activeOrganizationId &&
      accountRef.current===activeChannelPhone)setReadyAccount(identity);});
    return()=>{cancelled=true;};
  },[channelReady,activeOrganizationId,activeChannelId,activeChannelPhone,refresh]);

  // Mudanças de aba, departamento ou pesquisa buscam diretamente uma página
  // nova no servidor, sem remontar toda a interface nem recarregar canais.
  useEffect(()=>{
    if(channelReady!==true||!activeOrganizationId||!activeChannelId||!activeChannelPhone)return;
    const identity=activeOrganizationId+":"+activeChannelId+":"+activeChannelPhone;
    if(readyAccount!==identity)return;
    const key=JSON.stringify([activeOrganizationId,activeChannelId,activeChannelPhone,listQueryRef.current]);
    if(lastListQueryRef.current===key)return;
    setConversationPageLoading(true);
    setConversations([]);
    void refresh(true);
  },[filter,departmentFilter,debouncedQuery,conversationPage,readyAccount,
      activeOrganizationId,activeChannelId,activeChannelPhone,channelReady,refresh]);

  // Abrir diretamente a conversa autorizada a partir do Painel do Técnico.
  useEffect(() => {
    const conversationId=new URLSearchParams(location.search).get("conversation");
    if(!conversationId || !/^[0-9a-f-]{36}$/i.test(conversationId) ||
      channelReady!==true || !activeOrganizationId || !activeChannelId || !activeChannelPhone ||
      readyAccount!==activeOrganizationId+":"+activeChannelId+":"+activeChannelPhone)return;
    setFilter("in_att");
    setSelectedId(conversationId);
  },[location.search,activeOrganizationId,activeChannelId,activeChannelPhone,channelReady,readyAccount]);

  const checkChannel = useCallback(async () => {
    if (!activeOrganizationId || !canView) return;
    try {
      const response = await operateUnionWhatsAppInbox(
        activeOrganizationId, crypto.randomUUID(), "channel_status",
      );
      if (organizationRef.current === activeOrganizationId) {
        const ready=Boolean(response.channel_connected && response.channel_id);
        setCapabilities(response.capabilities || {});
        setChannelReady(ready);
        setActiveChannelId(ready?response.channel_id||null:null);
        setActiveChannelPhone(ready?response.channel_phone||null:null);
        
      }
    } catch (reason) {
      if (organizationRef.current === activeOrganizationId) {
        setChannelReady(false);setActiveChannelId(null);setActiveChannelPhone(null);
        setCapabilities({});
        reportError(systemErrorMessage(reason, "Não foi possível consultar o canal."));
      }
    }
  }, [activeOrganizationId, canView, reportError]);
  useEffect(() => { setChannelReady(null);setActiveChannelId(null);setActiveChannelPhone(null); setCapabilities({});  void checkChannel(); }, [checkChannel]);
  // When disconnected, the conversation subscription is deliberately absent.
  // Recheck identity on returning to the tab without continuously polling.
  useEffect(()=>{
    if(!activeOrganizationId||!canView)return;
    let last=0;
    const onResume=()=>{
      // No provider or database polling while disconnected. Users reconnect
      // from Canais or explicitly click Verificar conexão below.
      if(channelReady===false || document.visibilityState!=="visible"||
        Date.now()-last<30000)return;
      last=Date.now();
      void checkChannel();
    };
    window.addEventListener("focus",onResume);
    document.addEventListener("visibilitychange",onResume);
    return()=>{
      window.removeEventListener("focus",onResume);
      document.removeEventListener("visibilitychange",onResume);
    };
  },[activeOrganizationId,canView,channelReady,checkChannel]);

  // A assinatura é estável por conta, sem reconectar o websocket
  // a cada troca de conversa, protocolo ou filtro.
  const selectedIdRef=useRef(selectedId);
  selectedIdRef.current=selectedId;
  const refreshMessagesRef=useRef(refreshMessages);
  refreshMessagesRef.current=refreshMessages;
  // Realtime only while the inbox page is open. A bounded foreground refresh
  // is kept as fallback when tenant replication is temporarily unavailable.
  useEffect(() => {
    if (!activeOrganizationId || !activeChannelId || !activeChannelPhone || channelReady!==true || !canView) return;
    let debounce:number|null=null;
    let refreshSelected=false;
    const schedule=(conversationId?:string,shouldReloadMessages=false)=>{
      if(shouldReloadMessages && (!conversationId||conversationId===selectedIdRef.current))
        refreshSelected=true;
      if(debounce!==null)window.clearTimeout(debounce);
      debounce=window.setTimeout(()=>{
        debounce=null;
        void refresh(true);
        if(refreshSelected && selectedIdRef.current)
          void refreshMessagesRef.current(selectedIdRef.current,true);
        refreshSelected=false;
      },350);
    };
    const changedConversation=(payload:{new?:Record<string,unknown>;old?:Record<string,unknown>})=>{
      const row=payload.new||payload.old||{};
      if(row.organization_id && row.organization_id!==activeOrganizationId)return;
      if(String(row.id||"")===selectedIdRef.current)setParticipantsRevision(value=>value+1);
      schedule(String(row.id||""),false);
    };
    const changedMessage=(payload:{new?:Record<string,unknown>;old?:Record<string,unknown>})=>{
      const row=payload.new||payload.old||{};
      if(row.organization_id && row.organization_id!==activeOrganizationId)return;
      schedule(String(row.conversation_id||""),true);
    };
    const realtime=supabase.channel(`union-whatsapp-${activeOrganizationId}-${activeChannelId}`)
      .on("postgres_changes",{event:"*",schema:"public",table:"union_whatsapp_conversations",
        filter:`account_phone=eq.${activeChannelPhone}`},changedConversation)
      .on("postgres_changes",{event:"*",schema:"public",table:"union_whatsapp_messages",
        filter:`account_phone=eq.${activeChannelPhone}`},changedMessage)
      .subscribe();
    // Reconcile on returning to the tab, not an expensive 30-second poll.
    let lastResume = 0;
    const onResume = () => {
      if (document.visibilityState !== "visible" || Date.now() - lastResume < 30000) return;
      lastResume = Date.now();
      schedule(undefined,true);
    };
    window.addEventListener("focus", onResume);
    document.addEventListener("visibilitychange", onResume);
    return () => {
      if (debounce !== null) window.clearTimeout(debounce);
      window.removeEventListener("focus", onResume);
      document.removeEventListener("visibilitychange", onResume);
      void supabase.removeChannel(realtime);
    };
  }, [activeOrganizationId, activeChannelId, activeChannelPhone, channelReady, canView, refresh, checkChannel]);

  useLayoutEffect(() => {
    messageCursorRef.current=null;
    messageHistoryLoadedRef.current=false;
    chatScrollReadyRef.current=false;
    followLatestRef.current=true;
    setShowJumpToLatest(false);
    setMessagesHasMore(false);
    setMessagesOlderLoading(false);
    if (!selectedId || channelReady!==true || !activeChannelId || !activeChannelPhone) {
      setMessages([]);
      return;
    }
    setMessages([]);
    void refreshMessages(selectedId);
  }, [selectedId, channelReady,activeChannelId,activeChannelPhone, refreshMessages]);
  useEffect(() => {setProtocolFilter(null);setProtocolsOpen(false);setProtocols([]);setProtocolsHasMore(false);setProtocolsPage(0);setHandoffs([]);}, [selectedId]);

  // Reconcile WhatsApp address-book names by exact recipient JID, never
  // from the sender PushName of an outgoing mobile message.
  useEffect(() => {
    if(!selectedId || !activeOrganizationId || !canView || channelReady!==true) return;
    let cancelled=false;
    const org=activeOrganizationId;
    void operateUnionWhatsAppInbox(org,selectedId,"resolve_contact")
      .then(result=>{
        if(cancelled || organizationRef.current!==org || !result.contact_name) return;
        setConversations(current=>current.map(item=>item.id===selectedId
          ? {...item,contact_name:result.contact_name!} : item));
      }).catch(()=>undefined);
    return ()=>{cancelled=true;};
  },[selectedId,activeOrganizationId,canView,channelReady]);

  useEffect(() => {
    if(!selectedId || !activeOrganizationId || !canView || channelReady!==true ||
      Object.prototype.hasOwnProperty.call(avatars,selectedId)) return;
    let cancelled=false;
    const org=activeOrganizationId;
    void operateUnionWhatsAppInbox(org,selectedId,"contact_avatar")
      .then(result=>{
        if(cancelled || organizationRef.current!==org) return;
        setAvatars(old=>({...old,[selectedId]:result.avatar_url||null}));
      }).catch(()=>{if(!cancelled) setAvatars(old=>({...old,[selectedId]:null}));});
    return()=>{cancelled=true;};
  },[selectedId,activeOrganizationId,canView,channelReady,avatars]);
  useEffect(() => {
    if(!onOpenCustomer || !hasPermission("customers.view") || !selectedId ||
       !activeOrganizationId || channelReady!==true ||
       Object.prototype.hasOwnProperty.call(linkedCustomers,selectedId)) return;
    let cancelled=false;
    const org=activeOrganizationId;
    void operateUnionWhatsAppInbox(org,selectedId,"customer_match")
      .then(result=>{
        if(cancelled || organizationRef.current!==org) return;
        setLinkedCustomers(old=>({...old,[selectedId]:result.customer||null}));
      }).catch(()=>{if(!cancelled)setLinkedCustomers(old=>({...old,[selectedId]:null}));});
    return()=>{cancelled=true;};
  },[onOpenCustomer,selectedId,activeOrganizationId,channelReady,hasPermission,linkedCustomers]);

  useEffect(()=>{
    if(!activeOrganizationId || !selectedId || channelReady!==true)return;
    void operateUnionWhatsAppInbox(activeOrganizationId,selectedId,"presence_subscribe")
      .catch(()=>undefined);
  },[activeOrganizationId,selectedId,channelReady]);
  const scrollToLatest = useCallback((behavior: ScrollBehavior = "auto") => {
    followLatestRef.current = true;
    setShowJumpToLatest(false);
    const box = scrollRef.current;
    if (box) box.scrollTo({ top: box.scrollHeight, behavior });
  }, []);
  useLayoutEffect(() => {
    if (!selectedId || messagesLoading || !messageHistoryLoadedRef.current) return;
    if (!chatScrollReadyRef.current || followLatestRef.current) {
      scrollToLatest("auto");
      chatScrollReadyRef.current = true;
    }
  }, [selectedId, messages.length, pending.length, messagesLoading, scrollToLatest]);
  useEffect(() => {
    const box=scrollRef.current;
    const content=messagesContentRef.current;
    if(!box || !content || !selectedId || typeof ResizeObserver==="undefined") return;
    const observer=new ResizeObserver(() => {
      if(chatScrollReadyRef.current && followLatestRef.current && !messagesLoading) scrollToLatest("auto");
    });
    observer.observe(content);
    observer.observe(box);
    return ()=>observer.disconnect();
  }, [selectedId,messagesLoading,scrollToLatest]);
  const handleMessagesScroll = () => {
    const box = scrollRef.current;
    if (!box || !chatScrollReadyRef.current || !messageHistoryLoadedRef.current) return;
    const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 100;
    followLatestRef.current = atBottom;
    setShowJumpToLatest(!atBottom);
  };

  const accountIdentity=channelReady===true && activeChannelId && activeChannelPhone && activeOrganizationId
    ? activeOrganizationId+":"+activeChannelId+":"+activeChannelPhone:null;
  const bootLoading=channelReady===null || (channelReady===true && readyAccount!==accountIdentity);
  useEffect(()=>{
    if(bootLoading || (filter!=="waiting" && !selectedId))return;
    setClockNow(Date.now());
    const id=window.setInterval(()=>setClockNow(Date.now()),selectedId?4000:30000);
    return()=>window.clearInterval(id);
  },[filter,bootLoading,selectedId]);

  const scopedConversations = conversations.filter(item => channelReady===true && item.organization_id === activeOrganizationId && item.channel_id === activeChannelId && item.account_phone===activeChannelPhone);
  const selectedInPage=scopedConversations.find(item=>item.id===selectedId)||null;
  const selected=selectedInPage||(selectedFallback?.id===selectedId?selectedFallback:null);
  useEffect(()=>{
    if(!selectedId||!activeOrganizationId||!activeChannelId||!activeChannelPhone||
      channelReady!==true){
      setSelectedFallback(null);return;
    }
    if(conversations.some(item=>item.id===selectedId)){
      setSelectedFallback(null);return;
    }
    let cancelled=false;
    void getUnionWhatsAppConversation(activeOrganizationId,selectedId,activeChannelId,activeChannelPhone)
      .then(row=>{if(!cancelled && organizationRef.current===activeOrganizationId &&
        accountRef.current===activeChannelPhone)setSelectedFallback(row);})
      .catch(()=>{if(!cancelled)setSelectedFallback(null);});
    return()=>{cancelled=true;};
  },[selectedId,activeOrganizationId,activeChannelId,activeChannelPhone,channelReady,conversations]);

  useEffect(()=>{
    setParticipants([]);
    if(!selected || !activeOrganizationId || selected.status!=="in_att" || channelReady!==true)return;
    let cancelled=false;
    void operateUnionWhatsAppInbox(activeOrganizationId,selected.id,"participants")
      .then(result=>{if(!cancelled)setParticipants(result.participants||[]);})
      .catch(()=>{if(!cancelled)setParticipants([]);});
    return()=>{cancelled=true;};
  },[activeOrganizationId,selected?.id,selected?.status,participantsRevision,channelReady]);

  // Todos os filtros são executados no Supabase, não apenas na página atual.
  const counts=conversationCounts;
  const visible=scopedConversations;
  const timeline=useMemo(()=>{
    const local=pending.filter(item=>item.conversationId===selectedId &&
      item.organizationId===activeOrganizationId);
    const acknowledged=new Set(local.map(item=>item.providerMessageId).filter(
      (id):id is string=>Boolean(id)));
    return [
      ...messages.filter(message=>!acknowledged.has(message.provider_message_id))
        .map(message=>({kind:"persisted" as const,id:message.id,sentAt:message.sent_at,message})),
      ...local.map(item=>({kind:"optimistic" as const,id:item.id,sentAt:item.sentAt,pending:item})),
    ].sort((a,b)=>Date.parse(a.sentAt)-Date.parse(b.sentAt)||a.id.localeCompare(b.id));
  },[pending,messages,selectedId,activeOrganizationId]);
  useEffect(()=>{
    // The persisted history is authoritative when returning to a conversation.
    // Keep only pending errors/in-flight sends for conversations no longer open.
    setPending(current=>current.some(item=>item.status==="sent" && item.conversationId!==selectedId)
      ? current.filter(item=>item.status!=="sent" || item.conversationId===selectedId) : current);
  },[selectedId]);
  const queuePositions=useMemo(()=>{
    return new Map(scopedConversations.filter(queueOnly).map((item,index)=>[
      item.id,conversationPage*50+index+1,
    ]));
  },[scopedConversations,conversationPage]);
  const forwardedBadge=(item:UnionWhatsAppConversation)=>{
    if(!queueSettings.show_forward_badges || !hasForwarding(item))return null;
    const label="Encaminhada por: "+(item.forwarded_by_name||"Atendente");
    return <span className="inline-flex max-w-full min-w-0 items-center gap-1 rounded-md border border-violet-500/25 bg-violet-500/10 px-2 py-0.5 text-[10px] font-bold text-violet-700 dark:text-violet-300">
      <ArrowRightLeft size={12} className="shrink-0"/>
      <span className="truncate">{label}</span>
    </span>;
  };

  // Fetch photo previews for the first visible rows, in small batches so
  // scrolling and messaging never wait for WhatsApp profile requests.
  // Always prioritize the open conversation, including those not in the
  // first 12 visible rows or from a previously selected filter.
  const previewIds=[...new Set([selectedId,...visible.slice(0,12).map(item=>item.id)]
    .filter((id):id is string=>Boolean(id)))].join(",");
  const avatarRequestsRef=useRef(new Set<string>());
  useEffect(()=>{
    if(!activeOrganizationId || channelReady!==true || !previewIds)return;
    const toLoad=previewIds.split(",")
      .filter(id=>id && !Object.prototype.hasOwnProperty.call(avatars,id) &&
        !avatarRequestsRef.current.has(id))
      .slice(0,3);
    if(!toLoad.length)return;
    const org=activeOrganizationId;
    for(const id of toLoad){
      avatarRequestsRef.current.add(id);
      void operateUnionWhatsAppInbox(org,id,"contact_avatar")
        .then(result=>{
          if(organizationRef.current===org)setAvatars(old=>({...old,[id]:result.avatar_url||null}));
        })
        .catch(()=>{
          if(organizationRef.current===org)setAvatars(old=>({...old,[id]:null}));
        })
        .finally(()=>avatarRequestsRef.current.delete(id));
    }
  },[activeOrganizationId,channelReady,previewIds,avatars]);

  useEffect(() => {
    if (!documentVisible || !activeOrganizationId || !selected || selected.unread_count <= 0 ||
      (selected.assigned_to !== user?.id && !canManage && !(selected.status==="waiting" && canAction("view_queues")))) return;
    const threadId=selected.id;
    setConversations(current => current.map(item =>
      item.id === threadId ? {...item,unread_count:0} : item));
    setConversationCounts(current=>({...current,unread:Math.max(0,current.unread-1)}));
    void operateUnionWhatsAppInbox(activeOrganizationId,threadId,"mark_read")
      .then(() => void refresh(true))
      .catch(reason => {
        reportError(systemErrorMessage(reason,"Não foi possível marcar a conversa como lida."));
        void refresh(true);
      });
  }, [activeOrganizationId,selected?.id,selected?.status,selected?.assigned_to,selected?.unread_count,user?.id,canManage,capabilities,reportError,refresh,documentVisible]);

  const loadDepartments = async () => {
    if(!activeOrganizationId) return [];
    const result=await operateUnionWhatsAppInbox(activeOrganizationId,crypto.randomUUID(),"departments_list");
    const rows=result.departments||[];
    setDepartments(rows);
    return rows;
  };
  const closeSettingsModal=()=>{
    const closing=settingsModal;
    setSettingsModal(null);
    if(closing==="queues" && activeOrganizationId){
      void operateUnionWhatsAppInbox(activeOrganizationId,crypto.randomUUID(),"queue_settings_get")
        .then(result=>setQueueSettings(result.queue_settings||DEFAULT_WHATSAPP_QUEUE_SETTINGS))
        .catch(()=>undefined);
    }
  };
  const viewProtocols = async () => {
    if(!selected || !activeOrganizationId || !activeChannelId || !activeChannelPhone || protocolsLoading)return;
    setProtocolsOpen(true);setProtocolsLoading(true);setProtocolsMoreLoading(false);
    try{
      const [data,audit]=await Promise.all([
        listUnionWhatsAppProtocols(activeOrganizationId,selected.id,activeChannelId,activeChannelPhone),
        canAction("view_history")
          ? operateUnionWhatsAppInbox(activeOrganizationId,selected.id,"handoff_history").catch(()=>null)
          : Promise.resolve(null),
      ]);
      if(organizationRef.current===activeOrganizationId && accountRef.current===activeChannelPhone){
        setProtocols(data.items);
        setProtocolsHasMore(data.hasMore);
        setProtocolsPage(0);
        setHandoffs(audit?.history||[]);
      }
    }catch(reason){reportError(systemErrorMessage(reason,"Não foi possível consultar os protocolos."));}
    finally{setProtocolsLoading(false);}
  };
  const loadMoreProtocols=async()=>{
    if(!selected||!activeOrganizationId||!activeChannelId||!activeChannelPhone||
      protocolsLoading||protocolsMoreLoading||!protocolsHasMore)return;
    const next=protocolsPage+1;
    setProtocolsMoreLoading(true);
    try{
      const result=await listUnionWhatsAppProtocols(activeOrganizationId,selected.id,
        activeChannelId,activeChannelPhone,next);
      if(organizationRef.current!==activeOrganizationId||accountRef.current!==activeChannelPhone)return;
      setProtocols(old=>{
        const unique=new Map(old.map(item=>[item.id,item]));
        for(const item of result.items)unique.set(item.id,item);
        return [...unique.values()];
      });
      setProtocolsHasMore(result.hasMore);
      setProtocolsPage(next);
    }catch(reason){
      reportError(systemErrorMessage(reason,"Não foi possível consultar protocolos anteriores."));
    }finally{setProtocolsMoreLoading(false);}
  };
  const showOrders = async () => {
    if(!activeOrganizationId || !selected)return;
    setSavingOrder(true);
    try{
      const result=await operateUnionWhatsAppInbox(activeOrganizationId,selected.id,"order_options");
      setPossibleOrders(result.orders||[]);setOrdersOpen(true);
    }catch(reason){reportError(systemErrorMessage(reason,"Não foi possível consultar as OS deste cliente."));}
    finally{setSavingOrder(false);}
  };
  const linkOrder = async (id:string) => {
    if(!activeOrganizationId || !selected)return;
    setSavingOrder(true);
    try{
      await operateUnionWhatsAppInbox(activeOrganizationId,selected.id,"order_link",{service_order_id:id});
      setConversations(old=>old.map(item=>item.id===selected.id?{...item,service_order_id:id||null}:item));
      setOrdersOpen(false);
    }catch(reason){reportError(systemErrorMessage(reason,"Não foi possível vincular a OS."));}
    finally{setSavingOrder(false);}
  };
  const isMine = Boolean(selected && user?.id && selected.assigned_to === user.id);
  const canOperateSelected = Boolean(selected && (isMine || canManage));
  const isActiveCollaborator = Boolean(user?.id && participants.some(item=>item.user_id===user.id && item.status==="active"));
  const canReply = Boolean(selected && !protocolFilter && canSend && selected.status === "in_att" && (isMine || canManage || isActiveCollaborator));
  const openParticipants = async () => {
    if(!selected||!activeOrganizationId)return;
    setParticipantsOpen(true);setParticipantUserId("");setParticipantsBusy(true);
    try {
      const [list,operators]=await Promise.all([
        operateUnionWhatsAppInbox(activeOrganizationId,selected.id,"participants"),
        canOperateSelected ? operateUnionWhatsAppInbox(activeOrganizationId,selected.id,"members") : Promise.resolve({members:[]}),
      ]);
      setParticipants(list.participants||[]);
      setMembers(operators.members||[]);
    }catch(reason){reportError(systemErrorMessage(reason,"Não foi possível consultar os participantes."));}
    finally{setParticipantsBusy(false);}
  };
  const changeParticipant = async(action:"participant_add"|"participant_respond"|"participant_remove",targetId:string,approve?:boolean) => {
    if(!selected||!activeOrganizationId||participantsBusy)return;
    setParticipantsBusy(true);
    try {
      await operateUnionWhatsAppInbox(activeOrganizationId,selected.id,action,
        {target_user_id:targetId,...(approve===undefined?{}:{approve})});
      const list=await operateUnionWhatsAppInbox(activeOrganizationId,selected.id,"participants")
        .catch(()=>({participants:[] as UnionWhatsAppParticipant[]}));
      setParticipants(list.participants||[]);
      setParticipantUserId("");
      setParticipantsRevision(value=>value+1);
      if(action==="participant_remove"&&targetId===user?.id){
        setParticipantsOpen(false);setSelectedId(null);
      }
      notifyAdmin(action==="participant_add"?"Operador adicionado à conversa.":
        action==="participant_remove"?"Participação encerrada.":
        approve?"Participação aprovada.":"Solicitação recusada.","success");
    }catch(reason){reportError(systemErrorMessage(reason,"Não foi possível atualizar a participação."));}
    finally{setParticipantsBusy(false);}
  };
  const requestParticipation=async()=>{
    if(!activeOrganizationId||participantsBusy)return;
    const match=requestProtocol.trim().match(/^(?:ATD[-\\s]*)?(\\d{1,12})$/i);
    if(!match){reportError("Informe um protocolo no formato ATD-000020.");return;}
    setParticipantsBusy(true);
    try {
      const response=await operateUnionWhatsAppInbox(activeOrganizationId,crypto.randomUUID(),
        "participant_request_protocol",{protocol_number:Number(match[1])});
      setRequestOpen(false);setRequestProtocol("");
      if(response.participation_status==="active" && response.conversation_id){
        setFilter("in_att");setSelectedId(response.conversation_id);
        notifyAdmin("Você já participa desta conversa.","success");
      }else notifyAdmin("Solicitação enviada ao responsável pelo atendimento.","success");
    }catch(reason){reportError(systemErrorMessage(reason,"Não foi possível solicitar participação."));}
    finally{setParticipantsBusy(false);}
  };

  const operate = async (action: Exclude<UnionWhatsAppInboxAction, "send_text" | "mark_read">) => {
    if (!selected || !activeOrganizationId || runningAction) return;
    setRunningAction(action);
    try {
      await operateUnionWhatsAppInbox(activeOrganizationId, selected.id, action);
      if (action === "assume") {
        // Only mark messages read after successfully claiming the conversation.
        await operateUnionWhatsAppInbox(activeOrganizationId, selected.id, "mark_read").catch(() => null);
      }
      const nextFilter:Filter = action==="assume"
        ? (hasForwarding(selected) ? "forwarded" : "in_att") : "waiting";
      if (action!=="assume") setSelectedId(null);
      if (filter!==nextFilter) {
        // Changing tabs triggers one background list query; do not block the chat
        // waiting for an unnecessary refresh using the previous filter.
        setConversationPage(0);
        setFilter(nextFilter);
      } else {
        void refresh(true);
      }
      if (action==="assume") window.setTimeout(() => inputRef.current?.focus(), 100);
      const successMessages:Partial<Record<typeof action,string>> = {
        assume:"Atendimento assumido com sucesso.",
        finish:"Atendimento finalizado com sucesso.",
        return_queue:"Atendimento devolvido à fila.",
        reopen:"Atendimento reaberto com sucesso.",
      };
      if (successMessages[action]) notifyAdmin(successMessages[action],"success");
    } catch (reason) {
      reportError(systemErrorMessage(reason, "Não foi possível atualizar o atendimento."));
    } finally {
      setRunningAction(null);
    }
  };

  useEffect(()=>{
    if(newConversationOpen)return;
    // Invalidate an in-flight verification when the dialog closes. No stale
    // result should unlock a conversation after the operator opens it again.
    numberCheckSequence.current+=1;
    setVerifiedContact(null);setNumberNotice("");setNumberError("");
    setCheckingNumber(false);setNewPhone("");setNewName("");
  },[newConversationOpen]);

  const openFromContact = (contact:UnionWhatsAppContact):boolean => {
    const existing=conversations.find(item=>item.chat_jid===contact.chat_jid ||
      (contact.contact_phone && item.contact_phone===contact.contact_phone));
    if(existing){
      setDepartmentFilter("all");
      setFilter(hasForwarding(existing)?"forwarded":existing.status==="abandoned"?"waiting":existing.status);
      setSelectedId(existing.id);
      setContactsOpen(false);
      return true;
    }
    if(!canAction("start") || !contact.contact_phone){
      reportError("Este contato não possui número verificável ou você não tem permissão para iniciar conversa.");
      return false;
    }
    const display=contact.display_name||contact.imported_name||contact.profile_name||"";
    setNewPhone(brazilPhoneMask(contact.contact_phone));
    setNewName(display);
    setNewConversationOpen(true);
    setContactsOpen(false);
    return true;
  };

  const checkNewNumber = async () => {
    if(!activeOrganizationId || checkingNumber || starting)return;
    const sequence=++numberCheckSequence.current;
    setVerifiedContact(null);setNumberNotice("");setNumberError("");setCheckingNumber(true);
    try {
      const phone=brazilNumberDigits(newPhone);
      if(!/^[1-9][0-9][0-9]{8,9}$/.test(phone))throw Error("Informe DDD e número válido.");
      const result=await operateUnionWhatsAppInbox(activeOrganizationId,crypto.randomUUID(),
        "check_number",{phone:"55"+phone});
      if(sequence!==numberCheckSequence.current)return;
      if(!result.phone)throw Error("O WhatsApp não confirmou este número.");
      const displayName=String(result.contact_name||"").trim();
      setNewPhone(brazilPhoneMask(result.phone));
      setNewName(old=>displayName||old);
      setVerifiedContact({
        phone:result.phone,name:displayName,avatarUrl:result.avatar_url??null,
        nameSource:result.name_source??null,
      });
      setNumberNotice(result.distinct_identities
        ? "Número confirmado. As variantes do nono dígito correspondem a contas diferentes."
        : result.adjusted ? "Número confirmado e normalizado pelo WhatsApp."
        : "Número confirmado no WhatsApp.");
    }catch(err){
      if(sequence===numberCheckSequence.current){
        setVerifiedContact(null);
        setNumberError(systemErrorMessage(err,"Não foi possível verificar este número."));
      }
    }finally{
      if(sequence===numberCheckSequence.current)setCheckingNumber(false);
    }
  };

  const startConversation = async () => {
    if (!activeOrganizationId || !canAction("start") || starting || checkingNumber || !verifiedContact)return;
    const digits = brazilNumberDigits(newPhone);
    // Client-side gate only. The server still checks the WhatsApp identity
    // again before creating or reopening a conversation.
    if("55"+digits!==verifiedContact.phone){
      setVerifiedContact(null);
      setNumberError("O telefone foi alterado. Verifique novamente antes de abrir.");
      return;
    }
    if(!/^[1-9][0-9][0-9]{8,9}$/.test(digits)) {
      reportError("Informe o DDD e um telefone brasileiro válido.");
      return;
    }
    setStarting(true);
    
    try {
      const result = await operateUnionWhatsAppInbox(
        activeOrganizationId, crypto.randomUUID(), "start",
        {phone:"55"+digits,contact_name:newName.trim()},
      );
      if (!result.conversation_id) throw new Error("A conversa não foi confirmada.");
      await refresh(true);
      setFilter("in_att");
      setSelectedId(result.conversation_id);
      setNewConversationOpen(false);
      setNewPhone("");
      setNewName("");
      setNumberNotice("");
      setNumberError("");
      setVerifiedContact(null);
      requestAnimationFrame(() => inputRef.current?.focus());
    } catch(reason) {
      setNumberError(systemErrorMessage(reason, "Não foi possível iniciar esta conversa."));
    } finally { setStarting(false); }
  };

  const showRouting = async () => {
    if (!selected || !activeOrganizationId || !canAction("transfer") ||
      (!canManage && selected.assigned_to !== user?.id) || runningAction)return;
    setRoutingOpen(true);
    setRoutingLoading(true);
    setMembers([]);
    setTargetUserId("");
    setTargetDepartmentId("");
    setRoutingMode("operator");
    
    try {
      const [response]=await Promise.all([
        operateUnionWhatsAppInbox(activeOrganizationId,selected.id,"members"),
        loadDepartments(),
      ]);
      setMembers(response.members||[]);
    }catch(reason){
      reportError(systemErrorMessage(reason,"Não foi possível carregar os destinos do encaminhamento."));
    }finally{setRoutingLoading(false);}
  };

  const transfer = async () => {
    if (!selected || !activeOrganizationId || !(routingMode==="department"?targetDepartmentId:targetUserId) || runningAction) return;
    setRunningAction("transfer");
    try {
      await operateUnionWhatsAppInbox(activeOrganizationId,selected.id,
        routingMode==="department"?"transfer_department":"transfer",
        routingMode==="department"?{department_id:targetDepartmentId}:{target_user_id:targetUserId});
      setRoutingOpen(false);
      setSelectedId(null);
      setSelectedFallback(null);
      if(filter!=="forwarded") {
        setConversationPage(0);
        setFilter("forwarded");
      } else {
        void refresh(true);
      }
      notifyAdmin("Atendimento encaminhado com sucesso.","success");
    } catch (reason) {
      reportError(systemErrorMessage(reason, "Não foi possível encaminhar o atendimento."));
    } finally {
      setRunningAction(null);
    }
  };

  const stopRecording = (discard = false) => {
    const recorder=recorderRef.current;
    if(!recorder) return;
    discardRecordingRef.current=discard;
    if(recorder.state!=="inactive") recorder.stop();
    micStreamRef.current?.getTracks().forEach(track=>track.stop());
    micStreamRef.current=null;
    setRecording(false);
  };

  const startRecording = async () => {
    if(!canReply || recording || imageOptimizing || attachment) return;
    if(!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder==="undefined") {
      reportError("Este navegador não permite gravar áudio. Use o anexo para enviar um arquivo.");return;
    }
    const formats=["audio/ogg;codecs=opus","audio/webm;codecs=opus","audio/webm","audio/mp4"];
    const selectedFormat=formats.find(value=>MediaRecorder.isTypeSupported(value));
    if(!selectedFormat) {reportError("O navegador não oferece um formato de gravação compatível.");return;}
    let stream:MediaStream|null=null;
    try {
      const acquiredStream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}});
      stream=acquiredStream;
      const recorder=new MediaRecorder(acquiredStream,{mimeType:selectedFormat,audioBitsPerSecond:64000});
      micStreamRef.current=acquiredStream;
      recorderRef.current=recorder;
      discardRecordingRef.current=false;
      const pieces:Blob[]=[];
      recorder.ondataavailable=event=>{if(event.data.size) pieces.push(event.data);};
      recorder.onstop=()=>{
        acquiredStream.getTracks().forEach(track=>track.stop());
        if(recorderRef.current===recorder) recorderRef.current=null;
        if(micStreamRef.current===acquiredStream) micStreamRef.current=null;
        setRecording(false);
        if(discardRecordingRef.current || !pieces.length)return;
        const realMime=recorder.mimeType.split(";")[0];
        const ext=realMime==="audio/ogg"?"ogg":realMime==="audio/mp4"?"m4a":"webm";
        const file=new File(pieces,`gravacao-${new Date().toISOString().replace(/[:.]/g,"-")}.${ext}`,{
          type:realMime,lastModified:Date.now(),
        });
        void onChooseMedia(file);
      };
      recorder.onerror=()=>{
        acquiredStream.getTracks().forEach(track=>track.stop());
        setRecording(false);
        reportError("A gravação de áudio foi interrompida.");
      };
      // MP4/AAC timesliced chunks can contain independent fragment metadata.
      // Produce one finalized recording blob to avoid a 1-second playable file.
      recorder.start();
      setRecordingSeconds(0);
      setRecording(true);
      
    } catch (reason) {
      stream?.getTracks().forEach(track=>track.stop());
      const name=reason instanceof DOMException ? reason.name : "";
      reportError(name==="NotAllowedError" || name==="PermissionDeniedError"
        ? "Permita o acesso ao microfone nas configurações do navegador e tente novamente."
        : name==="NotFoundError"
          ? "Nenhum microfone foi encontrado neste dispositivo."
          : name==="NotReadableError"
            ? "Não foi possível usar o microfone. Verifique se outro aplicativo está utilizando-o."
            : "Não foi possível acessar o microfone. Verifique a permissão do navegador.");
    }
  };
  useEffect(() => {
    if(!recording) return;
    const ticker=window.setInterval(()=>setRecordingSeconds(s=>s+1),1000);
    return()=>window.clearInterval(ticker);
  },[recording]);
  useEffect(()=>()=>{
    discardRecordingRef.current=true;
    if(recorderRef.current && recorderRef.current.state!=="inactive") recorderRef.current.stop();
    micStreamRef.current?.getTracks().forEach(track=>track.stop());
  },[selectedId,activeOrganizationId]);

  const onChooseMedia = async (file: File | null) => {
    if(!file) return;
    const seq=++optimizeSeq.current;
    const type=file.type;
    const sticker=type==="image/webp";
    const image=["image/jpeg","image/png"].includes(type);
    const audio=["audio/ogg","audio/opus","audio/mp4","audio/mpeg","audio/webm"].includes(type);
    const video=["video/mp4","video/3gpp"].includes(type);
    const doc=["application/pdf","text/plain","application/zip","application/octet-stream",
      "application/msword","application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-powerpoint","application/vnd.openxmlformats-officedocument.presentationml.presentation"].includes(type);
    const sourceLimit=sticker ? 1048576 : image ? 25*1048576 : audio ? 16*1048576 : 25*1048576;
    if((!sticker && !image && !audio && !video && !doc) || !file.size || file.size>sourceLimit) {
      reportError("Formato não permitido ou arquivo maior que 25 MB. Áudios têm limite de 16 MB.");
      if(mediaInputRef.current) mediaInputRef.current.value="";
      return;
    }
    setImageOptimizing(image);
    
    try {
      const prepared=image ? await prepareImageForUpload(file,"whatsapp-image") : file;
      if(seq!==optimizeSeq.current) return;
      const limit=sticker ? 1048576 : image ? 10*1048576 : audio ? 16*1048576 : 25*1048576;
      if(prepared.size>limit || (image && !["image/jpeg","image/png"].includes(prepared.type))) {
        reportError("Não foi possível otimizar a imagem para até 10 MB em JPEG ou PNG.");
        if(mediaInputRef.current) mediaInputRef.current.value="";
        return;
      }
      if(mediaPreview && !pendingAudioUrlsRef.current.has(mediaPreview)) URL.revokeObjectURL(mediaPreview);
      setMediaPreview(image || sticker || audio ? URL.createObjectURL(prepared) : null);
      setAttachment(prepared);
      inputRef.current?.focus({preventScroll:true});
    } catch(reason) {
      if(seq===optimizeSeq.current) reportError(systemErrorMessage(reason,"Falha ao preparar a imagem."));
      if(mediaInputRef.current) mediaInputRef.current.value="";
    } finally {
      if(seq===optimizeSeq.current) setImageOptimizing(false);
    }
  };

  const sendText = () => {
    if (!selected || !activeOrganizationId || !canReply || submitGateRef.current || imageOptimizing || (!draft.trim() && !attachment)) return;
    if(attachment?.type==="image/webp" && draft.trim()){
      reportError("Figurinhas não aceitam legenda. Envie o texto em uma mensagem separada.");return;
    }
    submitGateRef.current = true;
    queueMicrotask(() => { submitGateRef.current = false; });
    const text = draft.trim();
    const file = attachment;
    const preview = mediaPreview;
    const fileType = file ? file.type==="image/webp" ? "sticker" : file.type.startsWith("image/") ? "image" :
      file.type.startsWith("audio/") ? "audio" : file.type.startsWith("video/") ? "video" : "file" : null;
    const threadId = selected.id;
    const organizationId = activeOrganizationId;
    const requestId = crypto.randomUUID();
    // Capture and clear the current draft before awaiting. The composer stays
    // interactive for subsequent messages, matching the SAC outbox UX.
    setDraft("");
    setAttachment(null);
    setMediaPreview(null);
    if (mediaInputRef.current) mediaInputRef.current.value = "";
    setEmojiOpen(false);
    if(fileType==="audio" && preview) pendingAudioUrlsRef.current.add(preview);
    setPending(current => [...current, {
      id: requestId, conversationId: threadId, organizationId,
      text, status: "sending", sentAt: new Date().toISOString(), fileName:file?.name,
      mediaType:fileType || undefined, previewUrl:fileType==="audio" ? preview||undefined : undefined,
    }]);
    scrollToLatest("auto");
    inputRef.current?.focus({ preventScroll: true });
    sendingIds.current.add(requestId);
    void (async () => {
      try {
        let extra: {text:string;client_message_id:string;media_name?:string;media_mime?:string;
          media_type?:string;media_size?:number;media_path?:string} =
          { text, client_message_id: requestId };
        if (file && fileType) {
          const base={media_name:file.name,media_mime:file.type,
            media_type:fileType,media_size:file.size,client_message_id:requestId};
          const upload=await operateUnionWhatsAppInbox(organizationId,threadId,"prepare_media",base);
          if(!upload.upload_path || !upload.upload_token)
            throw Error("O envio seguro do arquivo não foi autorizado.");
          const {error:uploadError}=await supabase.storage.from("union-whatsapp-media")
            .uploadToSignedUrl(upload.upload_path,upload.upload_token,file,{contentType:file.type});
          if(uploadError) throw uploadError;
          extra={...extra,...base,media_path:upload.upload_path};
        }
        const result=await operateUnionWhatsAppInbox(organizationId, threadId, file ? "send_media" : "send_text", extra);
        if (organizationRef.current !== organizationId) return;
        setPending(current=>current.map(item=>item.id===requestId
          ? {...item,status:"sent",providerMessageId:result.provider_message_id||undefined,error:undefined}
          : item));
        void Promise.allSettled([refreshMessages(threadId, true), refresh(true)]);
        if (preview && fileType!=="audio") URL.revokeObjectURL(preview);
      } catch (reason) {
        if (organizationRef.current !== organizationId) return;
        const detail = systemErrorMessage(reason, "Não foi possível confirmar o envio.");
        if (/mensagem ou anexo inv[aá]lido|assuma o atendimento|conversa n[aã]o atribu[ií]da/i.test(detail)) {
          if (!file) setDraft(current => current || text);
          setPending(current => current.filter(item => item.id !== requestId));
          reportError(detail);
          return;
        }
        setPending(current => current.map(item => item.id === requestId
          ? { ...item, status: /confirm|pendente|verifique/i.test(detail) ? "unknown" : "failed", error: detail }
          : item));
      } finally {
        sendingIds.current.delete(requestId);
      }
    })();
  };


  if (!canView) return <div className="p-5 text-sm text-muted-foreground">Você não possui permissão para visualizar atendimentos WhatsApp nesta empresa.</div>;

  return <div className="space-y-5">
    <header className="flex min-w-0 items-center justify-between gap-3 border-b border-border pb-5">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <h1 className="shrink-0 whitespace-nowrap text-lg font-black leading-tight text-foreground sm:text-2xl">Atendimentos</h1>
        <span aria-hidden="true" className="h-8 w-px shrink-0 bg-border"/>
        <nav aria-label="Canais de atendimento" className="flex min-w-0 items-center gap-2 overflow-x-auto whitespace-nowrap">

      <button type="button" aria-current="page" aria-label="WhatsApp, canal selecionado"
        className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-primary/35 bg-primary/10 px-3.5 py-2 text-sm font-bold text-primary">
        <WhatsAppIcon/> WhatsApp
      </button>
      <button type="button" disabled aria-label="Instagram, em breve" title="Instagram · Em breve"
        className="inline-flex min-h-10 cursor-not-allowed items-center gap-2 rounded-lg border border-border px-3.5 py-2 text-sm font-semibold text-muted-foreground opacity-65">
        <Instagram size={19}/> Instagram
      </button>
      <button type="button" disabled aria-label="Facebook, em breve" title="Facebook · Em breve"
        className="inline-flex min-h-10 cursor-not-allowed items-center gap-2 rounded-lg border border-border px-3.5 py-2 text-sm font-semibold text-muted-foreground opacity-65">
        <Facebook size={19}/> Facebook
      </button>
    </nav>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {(hasPermission("settings.channels.view") || hasPermission("settings.channels.manage") || canAction("manage_operators") || canAction("manage_queues")) &&
          <div ref={settingsMenuRef} className="relative">
            <button type="button" aria-label="Configurações dos atendimentos" aria-haspopup="menu"
              aria-expanded={settingsOpen} title="Configurações" onClick={() => setSettingsOpen(value => !value)}
              className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-lg border border-border bg-card text-foreground transition hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              <Settings2 size={20} strokeWidth={2}/>
            </button>
            {settingsOpen && <div role="menu" aria-label="Configurações dos atendimentos"
              className="absolute right-0 top-full z-40 mt-2 w-64 rounded-lg border border-border bg-card p-1.5 shadow-xl">
              {(hasPermission("settings.channels.view") || hasPermission("settings.channels.manage")) &&
                <button role="menuitem" type="button" onClick={() => {setSettingsOpen(false);onConfigure();}}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-left text-sm hover:bg-muted">
                  <Settings2 size={18}/> Canais de Atendimento
                </button>}
              {(canAction("manage_operators") || canAction("manage_queues")) && <>
                {canAction("manage_queues") && <button role="menuitem" type="button" onClick={() => {setSettingsOpen(false);setSettingsModal("departments");}}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-left text-sm hover:bg-muted">
                  <Building2 size={18}/> Departamentos e equipe
                </button>}
                {canAction("manage_queues") && <button role="menuitem" type="button" onClick={() => {setSettingsOpen(false);setSettingsModal("queues");}}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-left text-sm hover:bg-muted">
                  <MessageCircle size={18}/> Configurar filas
                </button>}
                {canAction("manage_operators") && <button role="menuitem" type="button" onClick={() => {setSettingsOpen(false);setSettingsModal("operators");}}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-left text-sm hover:bg-muted">
                  <Users size={18}/> Operadores
                </button>}
                {canAction("manage_operators") && <button role="menuitem" type="button"
                  onClick={() => {setSettingsOpen(false);setSettingsModal("permissions");}}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-left text-sm hover:bg-muted">
                  <ShieldCheck size={18}/> Perfis e Permissões
                </button>}
              </>}
            </div>}
          </div>}
        {canAction("collaborate") && canSend && <AdminButton variant="secondary" onClick={()=>setRequestOpen(true)}>
          <Users size={15} className="mr-1.5"/> Solicitar participação
        </AdminButton>}
        <AdminButton variant="secondary" onClick={onBack}>Voltar</AdminButton>
      </div>
    </header>
    {bootLoading ? <div className="flex min-h-[520px] items-center justify-center"><LoadingState text="Carregando atendimentos..."/></div> :
     channelReady === false ? <div className="flex min-h-[440px] flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border bg-card p-6 text-center">
      <MessageCircle size={36} className="text-muted-foreground"/>
      <div className="space-y-2">
        <p className="text-base font-bold">Nenhum canal WhatsApp conectado</p>
        <p className="max-w-sm text-sm text-muted-foreground">Configure e conecte um canal para começar a receber e enviar mensagens.</p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <AdminButton variant="secondary" onClick={()=>void checkChannel()}>
          <RefreshCw size={16}/> Verificar conexão
        </AdminButton>
        {(hasPermission("settings.channels.view") || hasPermission("settings.channels.manage")) &&
          <AdminButton onClick={() => onConfigure()}>
            <Settings2 size={16}/> Reconectar WhatsApp
          </AdminButton>}
      </div>
    </div> : <div className="h-[calc(100dvh-210px)] min-h-[420px] overflow-hidden rounded-none border border-border bg-card shadow-sm md:h-[min(76vh,850px)] md:min-h-[520px]">
      <div className="grid h-full min-h-0 grid-cols-1 grid-rows-1 md:grid-cols-[340px_minmax(0,1fr)] md:grid-rows-1">
        <aside className={`${selectedId ? "hidden md:flex" : "flex"} h-full min-h-0 min-w-0 flex-col overflow-hidden border-b border-border bg-card md:border-b-0 md:border-r`}>
          <div className="border-b border-border bg-muted/35 p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-base font-black text-foreground">Conversas</p>
              <div className="flex items-center gap-2">
                {canAction("view_contacts") && <button type="button" onClick={()=>{setEditContactId(null);setContactsOpen(true);}} title="Contatos"
                  className="flex h-8 items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-xs font-semibold text-foreground hover:bg-muted">
                  <ContactRound size={15}/> Contatos
                </button>}
                {canAction("start") && <button type="button" onClick={() => {
                  numberCheckSequence.current+=1;
                  setNewPhone("");setNewName("");setVerifiedContact(null);setNumberNotice("");setNumberError("");
                  setNewConversationOpen(true);
                }}
                  className="flex h-8 items-center gap-1.5 rounded-lg border border-primary/25 bg-primary/10 px-2.5 text-xs font-bold text-primary hover:bg-primary/15">
                  <Plus size={15}/> Nova
                </button>}
              </div>
            </div>
            <p className="mt-0.5 text-[10px] text-muted-foreground">
              {counts.total} conversa(s) · {counts.unread} não lida(s)
            </p>
            <div className="mt-3 flex gap-1.5 overflow-x-auto pb-1 md:grid md:grid-cols-2 md:overflow-visible md:pb-0">
              {filters.map(item => <button key={item.value} type="button" onClick={() => {setSelectedId(null);setConversationPage(0);setFilter(item.value);}}
                aria-pressed={filter === item.value}
                className={`flex shrink-0 items-center justify-between gap-1.5 rounded-full border px-3 py-2 text-[11px] font-bold transition-colors md:min-w-0 md:rounded-lg md:px-2 md:text-[10px] ${filter === item.value ? "border-primary bg-primary-soft text-foreground" : "border-border bg-card text-muted-foreground hover:bg-muted"}`}>
                <span className="truncate">{item.label}</span>
                <span className={`inline-flex min-w-6 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-black ${item.tone}`}>{counts[item.value]}</span>
              </button>)}
            </div>
            {<select aria-label="Filtrar departamento" value={departmentFilter}
              onChange={event=>{setSelectedId(null);setConversationPage(0);setDepartmentFilter(event.target.value);}}
              className="mt-3 w-full rounded-lg border border-border bg-card px-2 py-2 text-xs outline-none focus:border-primary">
              <option value="all">Todos os departamentos</option>
              <option value="none">Sem departamento</option>
              {departments.filter(d=>d.is_active).map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
            </select>}
            <div className="relative mt-3">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"/>
              <input value={query} onChange={event => {setSelectedId(null);setConversationPage(0);setQuery(event.target.value);}} type="search" aria-label="Buscar conversa"
                placeholder="Nome, telefone ou protocolo"
                className="w-full rounded-lg border border-border bg-card py-2.5 pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/25"/>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            {conversationPageLoading && visible.length===0 ?
              <div role="status" aria-label="Carregando lista de conversas" className="space-y-1 px-3 py-2">
                {[0,1,2].map(index=><div key={index} aria-hidden="true" className="flex items-center gap-3 rounded-md px-2 py-3">
                  <span className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-muted"/>
                  <span className="flex-1 space-y-2">
                    <span className="block h-2.5 w-1/2 animate-pulse rounded bg-muted"/>
                    <span className="block h-2 w-4/5 animate-pulse rounded bg-muted"/>
                  </span>
                </div>)}
              </div>
            : visible.length === 0 ? <div className="flex flex-col items-center gap-2 p-6 text-center text-xs text-muted-foreground">
              <WhatsAppIcon size={30}/><p>Nenhuma conversa encontrada.</p>
              {counts.total===0 && <p>Ative o recebimento do canal e envie uma mensagem de outro aparelho para testar.</p>}
            </div>
            : visible.map(item => {
              const selected = item.id === selectedId;
              const name = item.contact_name || item.contact_phone || "Contato";
              return <button key={item.id} type="button" onClick={() => setSelectedId(item.id)}
                className={`box-border flex w-full min-w-0 items-start gap-3 border-b border-border px-3 py-3 text-left transition-colors last:border-b-0 ${selected ? "border-l-[3px] border-l-primary bg-primary-soft" : item.unread_count > 0 ? "border-l-[3px] border-l-emerald-500/70 bg-emerald-500/10 hover:bg-emerald-500/15" : "bg-card hover:bg-muted/55"}`}>
                <WhatsAppContactAvatar key={item.id} name={name} src={avatars[item.id]} selected={selected}
                  onError={()=>setAvatars(old=>({...old,[item.id]:null}))}/>
                <span className="min-w-0 flex-1">
                  <span className="flex justify-between gap-2">
                    <span className="truncate text-sm font-black text-foreground">{name}</span>
                    <span className="shrink-0 text-[9px] text-muted-foreground">{compactDate(item.last_message_at)}</span>
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground">{formatWhatsAppPhone(item.contact_phone)}</span>
                  <span className="mt-1.5 flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-[11px] text-muted-foreground">{item.last_message || "Conversa recebida"}</span>
                    {item.unread_count > 0 && !selected && <span className="rounded-full bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold text-white">{item.unread_count}</span>}
                  </span>
                  {queueOnly(item) && (queueSettings.show_wait_time||queueSettings.show_queue_position) &&
                    <span className={`mt-1.5 inline-flex items-center rounded-md border px-2 py-1 text-[10px] font-bold ${waitingClasses(waitingMinutes(item.queue_entered_at||item.created_at,clockNow),queueSettings.warning_minutes,queueSettings.critical_minutes)}`}>
                      {queueSettings.show_queue_position && `#${queuePositions.get(item.id)||"–"} · `}
                      {queueSettings.show_wait_time && `Na fila ${waitingLabel(waitingMinutes(item.queue_entered_at||item.created_at,clockNow))}`}
                    </span>}
                  {forwardedBadge(item)}
                </span>
              </button>;
            })}
          </div>
          {(conversationPage>0||conversationHasMore) && <div className="flex shrink-0 items-center justify-between border-t border-border bg-card px-3 py-2">
            <span className="text-xs text-muted-foreground">Página {conversationPage+1}</span>
            <div className="flex items-center gap-2">
              <button type="button" aria-label="Página anterior de conversas"
                disabled={conversationPage===0||conversationPageLoading}
                onClick={()=>{setSelectedId(null);setConversationPage(p=>Math.max(0,p-1));}}
                className="flex h-8 w-8 items-center justify-center rounded-md border border-border disabled:opacity-40 hover:bg-muted">
                <ChevronLeft size={16}/>
              </button>
              <button type="button" aria-label="Próxima página de conversas"
                disabled={!conversationHasMore||conversationPageLoading}
                onClick={()=>{setSelectedId(null);setConversationPage(p=>p+1);}}
                className="flex h-8 w-8 items-center justify-center rounded-md border border-border disabled:opacity-40 hover:bg-muted">
                <ChevronRight size={16}/>
              </button>
            </div>
          </div>}
        </aside>
        <section className={`${selectedId ? "fixed inset-x-0 bottom-0 top-[var(--admin-shell-header-height,4rem)] z-[45] flex w-full overflow-hidden overscroll-contain md:static md:inset-auto md:h-auto md:w-auto" : "hidden md:flex"} min-h-0 min-w-0 flex-col bg-card`}>
          {!selected ? <div role="status" className="flex h-full flex-col items-center justify-center px-6 py-10 text-center">
            {selectedId && <button type="button" onClick={()=>{setSelectedId(null);setProtocolFilter(null);}} aria-label="Voltar para conversas"
              className="mb-6 flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-foreground md:hidden"><ChevronLeft size={22}/> Conversas</button>}
            <p className="text-base font-semibold tracking-tight text-foreground sm:text-lg">Selecione uma conversa</p>
            <div aria-hidden="true" className="mt-4 flex gap-2">
              {[0,1,2].map(index => <span key={index} className="h-2.5 w-2.5 animate-bounce rounded-full bg-primary motion-reduce:animate-none" style={{ animationDelay: `${index * 160}ms` }}/>)}
            </div>
          </div> : <>
            <header className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-0 border-b border-border bg-muted/30 px-2 pt-2 md:min-h-16 md:flex-nowrap md:gap-3 md:px-4 md:py-0">
              <button type="button" onClick={()=>{setSelectedId(null);setProtocolFilter(null);setEmojiOpen(false);}} aria-label="Voltar para conversas"
                className="flex h-10 w-8 shrink-0 items-center justify-center rounded-full text-foreground hover:bg-muted md:hidden"><ChevronLeft size={25}/></button>
              <WhatsAppContactAvatar key={selected.id} name={selected.contact_name} size="header"
                src={avatars[selected.id]} onError={()=>setAvatars(old=>({...old,[selected.id]:null}))}/>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  <p className="min-w-0 flex-1 truncate text-sm font-black text-foreground">{selected.contact_name}</p>

                </div>
                <p className="truncate text-xs text-muted-foreground md:whitespace-normal">
                   {formatWhatsAppPhone(selected.contact_phone)}{selected.last_protocol_number ? ` · ${unionWhatsAppProtocolLabel(selected.last_protocol_number)}` : ""}
                   <span className="ml-2 inline-flex max-w-full min-w-0 items-center gap-1 align-middle">
                   <span className={`inline-flex shrink-0 items-center rounded-md px-2 py-0.5 text-[10px] font-bold ${hasForwarding(selected)?"bg-violet-500/15 text-violet-700 dark:text-violet-300":selected.status==="in_att"?"bg-emerald-500/15 text-emerald-700 dark:text-emerald-300":selected.status==="waiting"?"bg-amber-500/15 text-amber-700 dark:text-amber-300":selected.status==="finished"?"bg-blue-500/15 text-blue-700 dark:text-blue-300":"bg-red-500/15 text-red-700 dark:text-red-300"}`}>
                     {hasForwarding(selected)?"Encaminhada":filters.find(item=>item.value===selected.status)?.label}
                   </span>
                   {hasForwarding(selected) && <span className="shrink-0 text-muted-foreground">›</span>}
                   {forwardedBadge(selected)}
                   </span>
                   {selected.contact_presence==="online" && selected.contact_presence_at &&
                     Date.now()-new Date(selected.contact_presence_at).getTime()<120000 &&
                     <span className="ml-2 font-semibold text-emerald-600">Online</span>}
                 </p>
                 {(selected.contact_presence==="composing"||selected.contact_presence==="recording") &&
                   selected.contact_presence_at &&
                   clockNow-Date.parse(selected.contact_presence_at)<12000 && clockNow>=Date.parse(selected.contact_presence_at) &&
                   <p role="status" className="mt-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                     {selected.contact_presence==="recording"?"Gravando áudio...":"Digitando..."}
                   </p>}
                 {onOpenCustomer && linkedCustomers[selected.id] && <button type="button"
                   onClick={()=>onOpenCustomer(linkedCustomers[selected.id]!.id)}
                   className="mt-0.5 max-w-full truncate text-left text-[11px] font-semibold text-blue-600 hover:underline dark:text-blue-400"
                   title="Abrir cadastro do cliente vinculado pelo telefone">
                   Cliente: {linkedCustomers[selected.id]!.name} · Abrir cadastro
                 </button>}
              </div>
              <div className="flex w-full shrink-0 items-center gap-1.5 overflow-x-auto border-t border-border/60 py-2 md:w-auto md:flex-wrap md:justify-end md:overflow-visible md:border-t-0 md:py-0">
                {canAction("manage_contacts") && <button type="button"
                  title="Editar contato" aria-label="Editar contato"
                  onClick={()=>{setEditContactId(selected.id);setContactsOpen(true);}}
                  className="flex h-8 items-center gap-1.5 rounded-md border border-border px-2 text-xs font-semibold hover:bg-muted">
                  <Pencil size={15}/><span className="hidden xl:inline">Editar</span>
                </button>}
                <button type="button" onClick={()=>void viewProtocols()} title="Histórico de atendimentos e protocolos"
                  aria-label="Histórico do atendimento" className="flex h-8 items-center gap-1.5 rounded-md border border-border px-2 text-xs font-semibold hover:bg-muted">
                  <History size={15}/><span className="hidden xl:inline">Histórico</span>
                </button>
                {!protocolFilter && selected.status==="in_att" && canAction("collaborate") &&
                  (canOperateSelected || isActiveCollaborator) &&
                  <AdminButton variant="secondary" size="sm" onClick={()=>void openParticipants()}>
                    <Users size={15}/> <span className="hidden sm:inline">Participantes</span>
                    {participants.filter(item=>item.status==="requested").length>0 && canOperateSelected &&
                      <span className="rounded-full bg-amber-100 px-1.5 text-[10px] text-amber-900">
                        {participants.filter(item=>item.status==="requested").length}
                      </span>}
                  </AdminButton>}
                {!protocolFilter && selected.status === "waiting" && canAction("assume") &&
                  <AdminButton size="sm" disabled={Boolean(runningAction)} onClick={() => void operate("assume")}><UserCheck size={15}/> Assumir</AdminButton>}
                {!protocolFilter && selected.status === "in_att" && canOperateSelected && <>
                  {onOpenOrder && selected.service_order_id && <button type="button" title="Abrir OS vinculada"
                    onClick={()=>onOpenOrder(selected.service_order_id!)} className="rounded-md border border-border px-2 py-1 text-xs font-semibold hover:bg-muted">OS</button>}
                  {onOpenOrder && hasPermission("orders.details.view") && canAction("link_orders") && <button type="button" title="Vincular OS deste cliente"
                    onClick={()=>void showOrders()} disabled={savingOrder}
                    className="rounded-md border border-border px-2 py-1 text-xs font-semibold hover:bg-muted">Vincular OS</button>}
                  
                  {canAction("transfer") && <AdminButton variant="secondary" size="sm" disabled={Boolean(runningAction)} onClick={() => void showRouting()}>
                    <ArrowRightLeft size={15}/> <span className="hidden sm:inline">Encaminhar</span>
                  </AdminButton>}
                  {canAction("return_queue") && <AdminButton variant="secondary" size="sm" disabled={Boolean(runningAction)} onClick={() => void operate("return_queue")}><RotateCcw size={15}/> <span className="hidden sm:inline">Devolver</span></AdminButton>}
                  {canAction("finish") && <AdminButton size="sm" disabled={Boolean(runningAction)} onClick={() => void operate("finish")}>
                     {runningAction==="finish" ? <LoaderCircle size={15} className="animate-spin"/> : <CheckCircle2 size={15}/>}
                     {runningAction==="finish" ? "Finalizando..." : "Finalizar"}
                   </AdminButton>}
                </>}
                {!protocolFilter && selected.status === "finished" && canAction("reopen") &&
                  <AdminButton variant="secondary" size="sm" disabled={Boolean(runningAction)} onClick={() => void operate("reopen")}><RotateCcw size={15}/> Reabrir</AdminButton>}
              </div>
            </header>
            {protocolFilter && <div className="flex items-center justify-between gap-2 border-b border-border bg-primary/5 px-4 py-2 text-xs">
              <span>Protocolo <strong>{protocolFilter.label}</strong></span>
              <button type="button" onClick={()=>setProtocolFilter(null)} className="font-bold text-primary hover:underline">Ver conversa completa</button>
            </div>}
            <div className="relative min-h-0 flex-1">
              <div ref={scrollRef} onScroll={handleMessagesScroll}
                className="h-full overflow-y-auto overscroll-contain bg-muted/25 px-3 py-4 [scrollbar-gutter:stable] sm:px-5"
                style={{ backgroundImage: "url('/assets/crm/whatsapp-chat-pattern.svg')", backgroundRepeat:"repeat", backgroundSize:"270px 270px", overflowAnchor:"none" }}>
              <div ref={messagesContentRef} className="min-h-full">
              {messagesHasMore && <div className="mb-3 flex justify-center">
                <button type="button" disabled={messagesOlderLoading}
                  onClick={()=>void loadOlderMessages()}
                  className="rounded-full border border-border bg-card px-4 py-2 text-xs font-semibold shadow-sm hover:bg-muted disabled:opacity-50">
                  {messagesOlderLoading?"Carregando mensagens anteriores...":"Carregar mensagens anteriores"}
                </button>
              </div>}
              {messagesLoading && timeline.length === 0 ? <LoadingState text="Carregando mensagens..."/>
              : timeline.length === 0 ?
                <p className="p-5 text-center text-xs text-muted-foreground">Nenhuma mensagem armazenada nesta conversa.</p>
              : <div className="mx-auto flex max-w-4xl flex-col gap-1">
                {timeline.map(entry => entry.kind==="persisted" ? (
                  <div key={entry.id} className={`mt-2 flex ${entry.message.direction === "outgoing" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[88%] rounded-lg px-3 py-2 shadow-sm sm:max-w-[72%] ${entry.message.direction === "outgoing" ? "bg-emerald-100 text-emerald-950 dark:bg-emerald-950/55 dark:text-emerald-50" : "border border-border bg-card text-foreground"}`}>
                      <MessageBody message={entry.message} organizationId={activeOrganizationId || ""} onMediaLoad={() => { if (followLatestRef.current) scrollToLatest("auto"); }}/>
                      <span className="mt-1 flex items-center justify-end gap-1 text-[10px] text-muted-foreground">
                        {clock(entry.message.sent_at)}
                        {entry.message.direction === "outgoing" && (entry.message.delivery_status === "read"
                          ? <CheckCheck size={13} className="text-sky-600" aria-label="Visualizada"/>
                          : entry.message.delivery_status === "delivered"
                            ? <CheckCheck size={13} aria-label="Entregue"/>
                            : <Check size={13} aria-label="Enviada"/>)}
                      </span>
                    </div>
                  </div>
                ) : (
                  <div key={entry.id} className="mt-2 flex justify-end">
                    <div className="max-w-[88%] rounded-lg bg-emerald-100 px-3 py-2 text-emerald-950 shadow-sm dark:bg-emerald-950/55 dark:text-emerald-50 sm:max-w-[72%]">
                      {entry.pending.mediaType==="audio"
                        ? <WhatsAppVoicePlayer src={entry.pending.previewUrl} compact/>
                        : entry.pending.fileName && <p className="mb-1 flex items-center gap-2 text-xs"><Paperclip size={13}/>{entry.pending.fileName}</p>}
                      {entry.pending.text && <p className="text-sm"><WhatsAppFormattedText text={entry.pending.text}/></p>}
                      <div className="mt-1 flex min-h-4 items-center justify-end gap-1.5 text-[10px] opacity-70">
                        {entry.pending.status==="sending" ? <><LoaderCircle size={12} className="animate-spin"/> Enviando</>
                          : entry.pending.status==="sent" ? <>
                            {messages.find(message=>message.provider_message_id===entry.pending.providerMessageId)?.delivery_status==="read"
                              ? <CheckCheck size={13} className="text-sky-600" aria-label="Visualizada"/>
                              : messages.find(message=>message.provider_message_id===entry.pending.providerMessageId)?.delivery_status==="delivered"
                                ? <CheckCheck size={13} aria-label="Entregue"/>
                                : <Check size={13} aria-label="Enviada"/>}
                            {clock(entry.pending.sentAt)}
                          </>
                          : <span role="alert" className="text-red-700 dark:text-red-300">{entry.pending.error||"Envio não confirmado"}</span>}
                      </div>
                      {(entry.pending.status==="unknown" || entry.pending.status==="failed") && <p className="mt-1 text-[10px] opacity-70">
                        Confira no WhatsApp antes de tentar outro envio.
                      </p>}
                    </div>
                  </div>
                ))}
              </div>}
              </div>
              </div>
              {(runningAction==="assume" || runningAction==="finish") && <div
                className="absolute inset-0 z-30 flex items-center justify-center bg-card/75 backdrop-blur-[1px]">
                <LoadingState text={runningAction==="assume"?"Assumindo atendimento...":"Finalizando atendimento..."}/>
              </div>}
              {showJumpToLatest && <button type="button" onClick={() => scrollToLatest("smooth")}
                className="absolute bottom-4 right-4 z-20 flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-lg transition hover:bg-muted"
                aria-label="Ir para a última mensagem" title="Ir para a última mensagem"><ChevronDown size={19}/></button>}
            </div>
            <footer className="shrink-0 border-t border-border bg-card px-2 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-3 sm:pt-3 sm:pb-3">
              {canReply ? <div className="mx-auto max-w-4xl">
                {imageOptimizing && <div role="status" className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <LoaderCircle size={14} className="animate-spin"/> Otimizando imagem antes do envio...
                </div>}
                {recording && <div role="status" className="mb-2 flex items-center gap-2 text-xs font-semibold text-red-600">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-red-600"/>
                  Gravando · {String(Math.floor(recordingSeconds/60)).padStart(2,"0")}:{String(recordingSeconds%60).padStart(2,"0")}
                  <button type="button" onClick={()=>stopRecording(true)} className="ml-auto rounded-md border border-border px-2 py-1 text-muted-foreground hover:bg-muted">Cancelar</button>
                  <button type="button" onClick={()=>stopRecording(false)} className="rounded-md bg-primary px-2 py-1 text-primary-foreground">Concluir</button>
                </div>}
                {attachment && <div className="mb-2 flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs">
                  {mediaPreview && attachment.type.startsWith("image/") && <img src={mediaPreview} alt="Prévia do anexo" className="h-10 w-10 rounded object-cover" />}
                  {attachment.type.startsWith("audio/") ?
                    <WhatsAppVoicePlayer src={mediaPreview} compact/> :
                    <><Paperclip size={15} className="shrink-0"/>
                      <span className="min-w-0 flex-1 truncate">{attachment.name} · {(attachment.size/1048576).toFixed(2)} MB</span></>}
                  <button type="button" onClick={() => {setAttachment(null); if (mediaPreview) URL.revokeObjectURL(mediaPreview); setMediaPreview(null); if(mediaInputRef.current) mediaInputRef.current.value="";}}
                    aria-label="Remover anexo" className="rounded p-1 hover:bg-muted"><X size={17}/></button>
                </div>}
                <form className="relative flex min-w-0 items-stretch rounded-xl border border-border bg-muted/55 transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20"
                  onSubmit={event => { event.preventDefault(); sendText(); }}>
                  <input ref={mediaInputRef} type="file" className="hidden"
                    accept="image/jpeg,image/png,image/webp,audio/ogg,audio/opus,audio/mp4,audio/mpeg,audio/webm,video/mp4,video/3gpp,application/pdf,text/plain,application/zip,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
                    aria-label="Selecionar anexo" onChange={event => { void onChooseMedia(event.target.files?.[0] || null); }}/>
                  <button type="button" aria-label="Anexar imagem, áudio, vídeo ou arquivo"
                    title="Anexar (figurinhas WebP até 1 MB; imagens 10 MB; áudio 16 MB; vídeo/documentos 25 MB)"
                    onClick={() => mediaInputRef.current?.click()}
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-l-[11px] border-r border-border text-foreground hover:bg-muted">
                    <Paperclip size={22}/>
                  </button>
                  <div className="relative flex h-12 shrink-0">
                    <button type="button" aria-label="Selecionar emoji" aria-expanded={emojiOpen}
                      onClick={() => setEmojiOpen(v => !v)}
                      className={`flex h-12 w-12 items-center justify-center border-r border-border text-foreground hover:bg-muted ${emojiOpen ? "bg-primary-soft text-primary" : ""}`}>
                      <Smile size={22}/>
                    </button>
                    {emojiOpen && <SacEmojiPicker recentEmojis={[]} onSelect={emoji => { setDraft(current => current + emoji); inputRef.current?.focus(); setEmojiOpen(false); }}/>}
                  </div>
                  <textarea ref={inputRef} rows={1} aria-label="Mensagem" value={draft} maxLength={4000}
                    placeholder={attachment ? "Legenda (opcional)" : "Digite uma mensagem"}
                    onChange={event => setDraft(event.target.value)}
                    onKeyDown={event => {
                      if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                        event.preventDefault(); sendText();
                      }
                    }}
                    className="min-h-12 min-w-0 flex-1 resize-none bg-transparent px-3 py-3 text-sm leading-6 text-foreground outline-none placeholder:text-muted-foreground/65"
                  />
                  {!draft.trim() && !attachment && <button type="button" aria-label={recording?"Parar gravação":"Gravar áudio"}
                    title="Gravar áudio" onClick={()=>recording ? stopRecording(false) : void startRecording()}
                    className={`flex h-12 w-12 shrink-0 items-center justify-center border-l border-border hover:bg-muted ${recording?"text-red-600":"text-foreground"}`}>
                    {recording ? <Square size={20}/> : <Mic size={21}/>}
                  </button>}
                  <button type="submit" disabled={recording || imageOptimizing || (!draft.trim() && !attachment)} aria-label="Enviar mensagem" title="Enviar mensagem"
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-r-[11px] border-l border-primary/20 bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-45">
                    <Send size={22}/>
                  </button>
                </form>
              </div> : <p className="py-2 text-center text-xs text-muted-foreground">
                {selected.status === "waiting" ? "Assuma o atendimento para responder." :
                  selected.status === "finished" ? "Atendimento finalizado. Reabra para responder." :
                  "Esta conversa está atribuída a outro atendente."}
              </p>}
            </footer>
          </>}
        </section>
      </div>
    </div>}
    {contactsOpen && activeOrganizationId && <UnionWhatsAppContactsDialog
      key={activeChannelPhone}
      organizationId={activeOrganizationId} accountPhone={activeChannelPhone!} channelId={activeChannelId!}
      canImport={canAction("import_contacts")}
      canEdit={canAction("manage_contacts")}
      initialContact={editContactId?(()=>{
        const thread=scopedConversations.find(item=>item.id===editContactId);
        return thread?{id:thread.id,chat_jid:thread.chat_jid,
          contact_phone:thread.contact_phone,display_name:null,device_name:null,
          imported_name:null,profile_name:null,updated_at:""}:null;
      })():null}
      initialName={editContactId?scopedConversations.find(item=>item.id===editContactId)?.contact_name:""}
      onClose={()=>{setContactsOpen(false);setEditContactId(null);}}
      onSaved={()=>void refresh(true)}
      onChoose={openFromContact}
    />}
    {newConversationOpen && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-3"
      onClick={event => { if (event.target === event.currentTarget) setNewConversationOpen(false); }}>
      <form onSubmit={event => {
          event.preventDefault();
          if(verifiedContact)void startConversation();
          else void checkNewNumber();
        }}
        role="dialog" aria-modal="true" aria-label="Nova conversa WhatsApp"
        className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <p className="font-black">Nova conversa</p>
          <button type="button" aria-label="Fechar" onClick={() => setNewConversationOpen(false)} className="rounded p-1 hover:bg-muted"><X size={18}/></button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Informe o DDD e o telefone. O código do Brasil (+55) é aplicado automaticamente.</p>
        <label className="mt-4 block text-xs font-semibold" htmlFor="union-new-phone">WhatsApp *</label>
        <div className="mt-1 flex w-full items-stretch overflow-hidden rounded-lg border border-border bg-background focus-within:border-primary">
          <span className="flex shrink-0 items-center border-r border-border bg-muted/45 px-3 text-sm font-semibold text-foreground">+55</span>
          <input id="union-new-phone" required autoFocus inputMode="tel" autoComplete="tel-national"
            value={newPhone} onChange={event => {
              numberCheckSequence.current+=1;
              setNewPhone(brazilPhoneMask(event.target.value));setNumberNotice("");setNumberError("");
              setVerifiedContact(null);setNewName("");setCheckingNumber(false);
            }}
            maxLength={16} placeholder="(79) 98803-7605"
            className="min-w-0 flex-1 px-3 py-2.5 text-sm outline-none"/>
          <button type="button" onClick={()=>void checkNewNumber()}
            disabled={checkingNumber || starting || !newPhone.trim()}
            aria-label="Verificar número no WhatsApp" title="Verificar número no WhatsApp"
            className="inline-flex shrink-0 items-center justify-center gap-2 border-l border-border px-3 text-xs font-semibold text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50">
            {checkingNumber ? <LoaderCircle size={16} className="animate-spin"/> :
              verifiedContact ? <CheckCircle2 size={16}/> : <ShieldCheck size={16}/>}
            <span className="hidden sm:inline">{checkingNumber?"Verificando":"Verificar"}</span>
          </button>
        </div>
        {numberNotice && <p role="status" className="mt-2 text-xs font-medium text-emerald-600">{numberNotice}</p>}
        {numberError && <p role="alert" className="mt-2 text-xs font-medium text-red-600">{numberError}</p>}
        {checkingNumber && <div role="status" className="mt-3 flex items-center gap-2 rounded-lg border border-border bg-muted/35 p-3 text-xs text-muted-foreground">
          <LoaderCircle size={16} className="animate-spin"/> Verificando WhatsApp e buscando o contato...
        </div>}
        {verifiedContact && <div className="mt-3 space-y-3">
          <div className="flex items-center gap-3 rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-3">
            <WhatsAppContactAvatar name={verifiedContact.name||newName||"Contato WhatsApp"}
              src={verifiedContact.avatarUrl} size="list"
              onError={()=>setVerifiedContact(current=>current?{...current,avatarUrl:null}:null)}/>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-bold text-foreground">{verifiedContact.name||newName||"Nome não disponível"}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{formatWhatsAppPhone(verifiedContact.phone)}</p>
              <p className="mt-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 size={12} className="mr-1 inline"/>
                {verifiedContact.nameSource==="agenda"?"Salvo na agenda da Union":
                 verifiedContact.nameSource==="agenda_whatsapp"?"Salvo na agenda do WhatsApp":
                 verifiedContact.nameSource==="conversa"?"Nome do atendimento anterior":
                 verifiedContact.nameSource==="whatsapp"?"Nome disponível no WhatsApp":
                 "Conta confirmada no WhatsApp"}
              </p>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold" htmlFor="union-new-name">Nome do contato (opcional)</label>
            <input id="union-new-name" value={newName} maxLength={120} onChange={event => setNewName(event.target.value)}
              placeholder="Informe um nome, se desejar"
              className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus:border-primary"/>
            {!verifiedContact.name && <p className="mt-1 text-xs text-muted-foreground">
              O WhatsApp não disponibilizou um nome público para este número.
            </p>}
          </div>
        </div>}
        <div className="mt-5 flex justify-end gap-2">
          <AdminButton variant="secondary" onClick={() => setNewConversationOpen(false)}>Cancelar</AdminButton>
          {verifiedContact && <AdminButton disabled={starting || checkingNumber} onClick={() => void startConversation()}>
            {starting ? "Abrindo..." : "Abrir conversa"}
          </AdminButton>}
        </div>
      </form>
    </div>}
    <AdminDialog open={routingOpen && Boolean(selected)}
      onClose={()=>{if(!routingLoading && runningAction!=="transfer")setRoutingOpen(false);}}
      title="Encaminhar atendimento" className="w-full max-w-lg"
      footer={<div className="flex justify-end gap-2">
        <AdminButton variant="secondary" disabled={routingLoading||Boolean(runningAction)}
          onClick={()=>setRoutingOpen(false)}>Cancelar</AdminButton>
        <AdminButton loading={runningAction==="transfer"} disabled={routingLoading||
          Boolean(runningAction)||!(routingMode==="department"?targetDepartmentId:targetUserId)}
          onClick={()=>void transfer()}>Encaminhar</AdminButton>
      </div>}>
      {routingLoading ? <div className="flex min-h-44 items-center justify-center">
        <LoadingState text="Carregando destinos de encaminhamento..."/>
      </div> : <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={()=>setRoutingMode("operator")}
            className={`rounded-lg border px-3 py-2.5 text-xs font-semibold ${routingMode==="operator"?"border-primary bg-primary/10 text-primary":"border-border"}`}>Atendente</button>
          <button type="button" onClick={()=>setRoutingMode("department")}
            className={`rounded-lg border px-3 py-2.5 text-xs font-semibold ${routingMode==="department"?"border-primary bg-primary/10 text-primary":"border-border"}`}>Departamento</button>
        </div>
        {routingMode==="operator" ? <label className="block text-xs font-semibold">
          Atendente <span className="text-red-600">*</span>
          <select value={targetUserId} onChange={event=>setTargetUserId(event.target.value)}
            className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-3 text-sm">
            <option value="">Selecione um atendente</option>
            {members.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          {members.length===0 && <span className="mt-2 block text-xs font-normal text-muted-foreground">Nenhum atendente autorizado.</span>}
        </label> : <label className="block text-xs font-semibold">
          Departamento <span className="text-red-600">*</span>
          <select value={targetDepartmentId} onChange={event=>setTargetDepartmentId(event.target.value)}
            className="mt-1.5 w-full rounded-lg border border-border bg-background px-3 py-3 text-sm">
            <option value="">Selecione o departamento</option>
            {departments.filter(item=>item.is_active).map(item=><option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>}
      </div>}
    </AdminDialog>

    <AdminDialog open={requestOpen} onClose={()=>{if(!participantsBusy)setRequestOpen(false);}}
      title="Solicitar participação" description="Informe o protocolo de uma conversa em andamento. O responsável precisará aprovar seu acesso."
      className="max-w-md" footer={<div className="flex justify-end gap-2">
        <AdminButton variant="secondary" disabled={participantsBusy} onClick={()=>setRequestOpen(false)}>Cancelar</AdminButton>
        <AdminButton disabled={participantsBusy || !requestProtocol.trim()} loading={participantsBusy}
          onClick={()=>void requestParticipation()}>Solicitar</AdminButton>
      </div>}>
      <label className="block text-sm font-semibold">Protocolo do atendimento
        <input value={requestProtocol} onChange={event=>setRequestProtocol(event.target.value)}
          placeholder="ATD-000020" maxLength={24}
          className="mt-2 h-11 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"/>
      </label>
    </AdminDialog>
    <AdminDialog open={participantsOpen} onClose={()=>{if(!participantsBusy)setParticipantsOpen(false);}}
      title="Participantes da conversa" description="O operador responsável continua com o controle do atendimento."
      className="max-w-lg" footer={<AdminButton variant="secondary" disabled={participantsBusy}
        onClick={()=>setParticipantsOpen(false)}>Fechar</AdminButton>}>
      {participantsBusy && participants.length===0 ? <LoadingState text="Carregando participantes..."/> :
      <div className="space-y-3">
        {canOperateSelected && selected?.status==="in_att" && <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-0 flex-1 text-xs font-semibold">Adicionar operador
            <select value={participantUserId} onChange={event=>setParticipantUserId(event.target.value)}
              className="mt-1.5 h-10 w-full rounded-lg border border-border bg-background px-2 text-sm">
              <option value="">Selecione um operador</option>
              {members.filter(member=>member.id!==selected.assigned_to &&
                !participants.some(p=>p.user_id===member.id && p.status==="active"))
                .map(member=><option key={member.id} value={member.id}>{member.name}</option>)}
            </select>
          </label>
          <AdminButton disabled={!participantUserId||participantsBusy}
            onClick={()=>void changeParticipant("participant_add",participantUserId)}>Adicionar</AdminButton>
        </div>}
        {participants.length===0 ? <p className="py-5 text-center text-xs text-muted-foreground">
          Nenhum participante adicional neste atendimento.
        </p> : <div className="divide-y divide-border rounded-lg border border-border">
          {participants.map(participant=><div key={participant.user_id}
            className="flex flex-wrap items-center justify-between gap-2 px-3 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{participant.name}</p>
              <p className="text-xs text-muted-foreground">
                {participant.status==="requested"?"Solicitou participação":"Participando"}
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {participant.status==="requested"&&canOperateSelected && <>
                <AdminButton size="sm" disabled={participantsBusy}
                  onClick={()=>void changeParticipant("participant_respond",participant.user_id,true)}>Aprovar</AdminButton>
                <AdminButton size="sm" variant="secondary" disabled={participantsBusy}
                  onClick={()=>void changeParticipant("participant_respond",participant.user_id,false)}>Recusar</AdminButton>
              </>}
              {participant.status==="active" && (canOperateSelected||participant.user_id===user?.id) &&
                <AdminButton variant="secondary" size="sm" disabled={participantsBusy}
                  onClick={()=>void changeParticipant("participant_remove",participant.user_id)}>
                  {participant.user_id===user?.id?"Sair":"Remover"}
                </AdminButton>}
            </div>
          </div>)}
        </div>}
      </div>}
    </AdminDialog>
    {ordersOpen && selected && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-3"
      role="presentation" onClick={event=>{if(event.target===event.currentTarget)setOrdersOpen(false);}}>
      <div role="dialog" aria-modal="true" aria-label="Vincular ordem de serviço"
        className="w-full max-w-md rounded-xl border border-border bg-card p-5 shadow-xl">
        <div className="flex items-center justify-between">
          <p className="font-bold">Vincular ordem de serviço</p>
          <button type="button" aria-label="Fechar" onClick={()=>setOrdersOpen(false)}><X size={18}/></button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Apenas OS do cadastro verificado por este telefone.</p>
        <div className="mt-4 max-h-72 space-y-1 overflow-y-auto">
          {possibleOrders.length===0 && <p className="py-4 text-center text-xs text-muted-foreground">Nenhuma OS encontrada para este cliente.</p>}
          {possibleOrders.map(order=><button key={order.id} type="button" onClick={()=>void linkOrder(order.id)}
            disabled={savingOrder} className="flex w-full items-center justify-between rounded-lg border border-border px-3 py-2.5 text-sm hover:bg-muted">
            <span>OS {order.os_number}</span>
            {selected.service_order_id===order.id && <Check size={16} className="text-primary"/>}
          </button>)}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          {selected.service_order_id && <AdminButton variant="secondary" disabled={savingOrder} onClick={()=>void linkOrder("")}>Desvincular</AdminButton>}
          <AdminButton variant="secondary" onClick={()=>setOrdersOpen(false)}>Fechar</AdminButton>
        </div>
      </div>
    </div>}
    {settingsModal === "permissions" && <WhatsAppRolePermissions
      onClose={() => setSettingsModal(null)}
      onSaved={() => void checkChannel()}
    />}
    {settingsModal && settingsModal !== "permissions" && <AdminDialog open={true}
      onClose={closeSettingsModal}
      title={settingsModal === "departments" ? "Departamentos e equipe" :
        settingsModal === "queues" ? "Configurar filas" : "Operadores"}
      description={settingsModal === "operators" ? "Vincule funcionários e defina seus perfis de atendimento." :
        settingsModal === "queues" ? "Defina a fila principal e gerencie os responsáveis por cada fila." :
        "Organize os departamentos e as equipes de atendimento."}
      className="w-full max-w-4xl"
      footer={<div className="flex flex-wrap items-center justify-end gap-2">
        <AdminButton variant="secondary" onClick={closeSettingsModal}>Fechar</AdminButton>
        {(settingsModal === "departments" || settingsModal === "queues") && canAction("manage_queues") &&
          <AdminButton onClick={() => setSettingsCreateRequest(value => value + 1)}>Novo</AdminButton>}
      </div>}>
      <WhatsAppOperationsSettings key={settingsModal} section={settingsModal}
        createRequest={settingsCreateRequest}/>
    </AdminDialog>}
    <AdminDialog open={protocolsOpen} onClose={()=>setProtocolsOpen(false)}
      title="Histórico de atendimentos" className="w-full max-w-2xl"
      footer={<div className="flex justify-end">
        <AdminButton variant="secondary" onClick={()=>setProtocolsOpen(false)}>Fechar</AdminButton>
      </div>}>
      {protocolsLoading ? <LoadingState text="Consultando protocolos..."/> :
        protocols.length ? <div className="space-y-2">
          {protocols.map(protocol=>{
            const label=unionWhatsAppProtocolLabel(protocol.protocol_number);
            const duration=protocol.closed_at ? Math.max(0,Math.round(
              (Date.parse(protocol.closed_at)-Date.parse(protocol.opened_at))/60000
            )) : null;
            return <button key={protocol.id} type="button" onClick={()=>{
                setProtocolFilter({id:protocol.id,label});
                setProtocolsOpen(false);
              }}
              className="flex w-full flex-col gap-2 rounded-lg border border-border px-4 py-3 text-left transition-colors hover:border-primary/40 hover:bg-muted/35">
              <span className="flex w-full flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-bold text-foreground">{label}</span>
                <span className="text-xs font-semibold text-muted-foreground">
                  {filters.find(item=>item.value===protocol.status)?.label}
                </span>
              </span>
              <span className="text-xs text-muted-foreground">
                Abertura: {new Date(protocol.opened_at).toLocaleString("pt-BR")}
                {protocol.closed_at ? ` · Encerramento: ${new Date(protocol.closed_at).toLocaleString("pt-BR")}` : " · Em aberto"}
              </span>
              <span className="text-xs text-muted-foreground">
                {protocol.message_count} mensagem(ns)
                {duration!==null ? ` · Duração: ${duration} min` : ""}
                {protocol.first_reply_at ? ` · Primeira resposta: ${Math.max(0,Math.round((Date.parse(protocol.first_reply_at)-Date.parse(protocol.opened_at))/60000))} min` : ""}
              </span>
              {canAction("view_history") && handoffs.filter(event=>event.protocol_id===protocol.id).slice(0,6)
                .map(event=><span key={event.id} className="text-[11px] text-muted-foreground">
                  {({
                    assume:"Assumido",return_queue:"Devolvido à fila",finish:"Finalizado",
                    reopen:"Reaberto",transfer_operator:"Encaminhado ao atendente",
                    transfer_department:"Encaminhado ao departamento",start:"Iniciado",
                  } as Record<string,string>)[event.action]||event.action}
                  {" · "}{new Date(event.created_at).toLocaleString("pt-BR")}
                </span>)}
              <span className="text-xs font-semibold text-primary">Visualizar mensagens deste protocolo</span>
            </button>;
          })}
          {protocolsHasMore && <div className="pt-3 text-center">
            <AdminButton variant="secondary" loading={protocolsMoreLoading}
              disabled={protocolsMoreLoading} onClick={()=>void loadMoreProtocols()}>
              Carregar protocolos anteriores
            </AdminButton>
          </div>}
        </div> : <p className="py-6 text-center text-sm text-muted-foreground">Nenhum protocolo encontrado.</p>}
    </AdminDialog>
  </div>;
}
