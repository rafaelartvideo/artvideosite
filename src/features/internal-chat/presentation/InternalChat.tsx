import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChatAttachment, loadChatAttachment } from "./ChatAttachment";
import { ChatOrderPicker } from "./ChatOrderPicker";
import { EmojiPicker } from "@/shared/ui/whatsapp/EmojiPicker";
import { UnionWhatsAppMediaViewer } from "@/features/whatsapp-channels/presentation/UnionWhatsAppMediaViewer";
import { ChatRoleSettings } from "./ChatRoleSettings";
import { useChatDock } from "./useChatDock";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, ChevronLeft, MessageSquare, Send, X, Phone, Link2, Paperclip, Users, Settings2, Reply, Check, CheckCheck, Pin, BellOff, Search, Mic, Square, Settings, ChevronDown, ChevronRight, Plus, BarChart3, LocateFixed, Volume2, CornerDownRight, ChevronUp, Loader2, ShieldCheck, Smile, ClipboardList, ArrowDown, Clock, AlertCircle, GripHorizontal } from "lucide-react";
import { PERMISSIONS_CHANGED_EVENT, LEGACY_PERMISSIONS_CHANGED_EVENT } from "@/lib/platform-identifiers";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { useLocation, useNavigate } from "react-router";
import { CHAT_PBX_PREFILL, CHAT_PBX_STATE, getChatPbxBusy } from "../application/pbx-chat-bridge";
import { defaultChatSettings, readSession, writeSession, sendPendingText, transientChatError, notifyOnce, pruneNotices, compressChatImage, type ChatSettings, type PendingText } from "../application/chat-reliability";
import { adminPath } from "@/features/admin-shell/admin-routes";
type Availability = "available"|"away"|"busy"|"dnd"|"on-call";
const availabilityLabels:Record<Availability,string>={available:"Disponível",away:"Ausente",busy:"Ocupado",dnd:"Não perturbe","on-call":"Em ligação"};
const availabilityColors:Record<Availability,string>={available:"bg-green-500",away:"bg-amber-500",busy:"bg-red-500",dnd:"bg-violet-500","on-call":"bg-blue-500"};
const iconButton="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50";
const shareableRoute=/^\/admin\/(orders|customers|inventory|products)\/[a-zA-Z0-9-]+$/;

type Employee = { user_id: string; full_name: string; function_name?:string|null; role_name?:string|null };
type Group = {id:string;name:string;created_by:string;unread:number;last_read_at:string};
type Recent = {peer_id:string;created_at:string;kind:string;body:string;attachment:boolean;unread:number};
type Metrics = {messages:number;attachments:number;calls:number;answered:number;mean_response_seconds:number|null;pending:number};
type GroupEdit = {id:string|null;name:string;members:string[]};
const allowedFileTypes=new Set(["image/jpeg","image/png","image/webp","image/gif","application/pdf","text/plain","application/msword","application/vnd.openxmlformats-officedocument.wordprocessingml.document","application/vnd.ms-excel","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","audio/webm","audio/ogg","audio/mp4","audio/mpeg","audio/wav"]);
type ChatRow = { id:string; sender_id:string; recipient_id:string|null; group_id:string|null; attachment_path:string|null; attachment_mime:string|null; mentions:string[]; reply_to:string|null; edited_at:string|null; deleted_at:string|null; kind:"text"|"call"; body:string; created_at:string; read_at:string|null; response:"coming"|"busy"|"cancelled"|null };
const fields = "id,sender_id,recipient_id,group_id,attachment_path,attachment_mime,mentions,reply_to,edited_at,deleted_at,kind,body,created_at,read_at,response";
const pageSize = 30;
const chatDayKey=(value:string|number|Date):string=>{
 const d=value instanceof Date?value:new Date(value);
 return Number.isFinite(d.getTime())?[d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-"):"";
};
const chatDayLabel=(key:string,now=Date.now())=>{
 if(!key)return "Data indisponível";
 if(key===chatDayKey(now))return "Hoje";
 const d=new Date(now);if(key===chatDayKey(new Date(d.getFullYear(),d.getMonth(),d.getDate()-1,12)))return "Ontem";
 const [y,m,day]=key.split("-").map(Number);return new Date(y,m-1,day,12).toLocaleDateString("pt-BR",{day:"numeric",month:"long",year:"numeric"});
};
const chatClock=(value:string)=>new Date(value).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});
const quoteSummary=(m:ChatRow|undefined)=>!m?"Mensagem anterior":m.deleted_at?"Mensagem excluída":m.attachment_path?(m.attachment_mime?.startsWith("image/")?"Imagem":m.attachment_mime?.startsWith("audio/")?"Áudio":m.body):m.kind==="call"?"Chamada interna":shareableRoute.test(m.body)?"Registro compartilhado":m.body.slice(0,180);
const retryRead=(count:number,error:unknown)=>count<1&&transientChatError(error);
const fadeText={maskImage:"linear-gradient(to right, black calc(100% - 20px), transparent)"};
const actionClass = "rounded-md border border-border px-3 py-2 text-xs font-semibold hover:bg-muted disabled:opacity-50";
const callLabels = { coming:"Já estou indo", busy:"Estou ocupado", cancelled:"Cancelada" };
function playNotice() {
  try {
    const audio = new AudioContext();
    const tone = audio.createOscillator();
    const gain = audio.createGain();
    tone.type="sine"; tone.frequency.value=620; gain.gain.value=.035;
    tone.connect(gain); gain.connect(audio.destination);
    tone.start(); tone.stop(audio.currentTime+.18);
    tone.onended=()=>{void audio.close();};
    if(audio.state==="suspended") void audio.resume().catch(()=>audio.close());
  } catch { /* Visual notification remains available. */ }
}
export function InternalChat() {
  const {activeOrganizationId,user,hasPermission}=useAuth();
  const qc=useQueryClient();
  const permissionKey=["internal-chat-permissions",activeOrganizationId,user?.id];
  const permissions=useQuery({queryKey:permissionKey,enabled:!!activeOrganizationId&&!!user?.id,queryFn:async()=>{
    const {data,error}=await supabase.rpc("internal_chat_my_permissions_v1",{p_org:activeOrganizationId});
    if(error)throw error;
    return (data??[]) as string[];
  },staleTime:30000,retry:false,refetchOnWindowFocus:true,refetchOnReconnect:true});
  useEffect(()=>{
    const refresh=()=>void qc.invalidateQueries({queryKey:["internal-chat-permissions",activeOrganizationId,user?.id]});
    window.addEventListener(PERMISSIONS_CHANGED_EVENT,refresh);window.addEventListener(LEGACY_PERMISSIONS_CHANGED_EVENT,refresh);
    return()=>{window.removeEventListener(PERMISSIONS_CHANGED_EVENT,refresh);window.removeEventListener(LEGACY_PERMISSIONS_CHANGED_EVENT,refresh);};
  },[qc,activeOrganizationId,user?.id]);
  const hasChatPermission=(key:string)=>!permissions.isError&&!!permissions.data?.includes(key);
  if(!activeOrganizationId || !user?.id || !hasChatPermission("internal_chat.use")) return null;
  return <ChatSession key={activeOrganizationId+":"+user.id} org={activeOrganizationId} uid={user.id} canShareOrders={hasPermission("orders.view")} canCall={hasChatPermission("internal_chat.call")} canPhone={hasPermission("pbx.view")} canCreateGroup={hasChatPermission("internal_chat.groups.create")} canManageGroup={hasChatPermission("internal_chat.groups.manage")} canAttach={hasChatPermission("internal_chat.attachments.send")} canMetrics={hasChatPermission("internal_chat.metrics.view")} canSettings={hasChatPermission("internal_chat.settings.manage")} canViewRoles={hasPermission("roles.view")&&(hasPermission("roles.details.view")||hasPermission("roles.permissions.manage"))} canManageRoles={hasPermission("roles.permissions.manage")} />;
}
function ChatSession({org,uid,canShareOrders,canCall,canPhone,canCreateGroup,canManageGroup,canAttach,canMetrics,canSettings,canViewRoles,canManageRoles}:{org:string;uid:string;canShareOrders:boolean;canCall:boolean;canPhone:boolean;canCreateGroup:boolean;canManageGroup:boolean;canAttach:boolean;canMetrics:boolean;canSettings:boolean;canViewRoles:boolean;canManageRoles:boolean}) {
  const qc=useQueryClient();
  const location=useLocation();
  const navigate=useNavigate();
  const key=useMemo(()=>["internal-chat",org,uid] as const,[org,uid]);
  const [open,setOpen]=useState(false);
  const [expanded,setExpanded]=useState(true);
  const [peer,setPeer]=useState<string|null>(null);
  const [group,setGroup]=useState<string|null>(null);
  const [groupEdit,setGroupEdit]=useState<GroupEdit|null>(null);
  const [metricsOpen,setMetricsOpen]=useState(false);
  const fileRef=useRef<HTMLInputElement>(null);
  const [search,setSearch]=useState("");
  const storagePrefix="union-chat:"+org+":"+uid+":";
  const [draft,setDraft]=useState("");
  const [composerMenu,setComposerMenu]=useState<"emoji"|"actions"|"orders"|null>(null);
  const [recentEmojis,setRecentEmojis]=useState<string[]>([]);
  const composerRef=useRef<HTMLInputElement>(null);
  const [stagedFile,setStagedFile]=useState<File|null>(null);
  const [stagedUrl,setStagedUrl]=useState<string|null>(null);
  useEffect(()=>{if(!stagedFile?.type.startsWith("image/")){setStagedUrl(null);return;}const url=URL.createObjectURL(stagedFile);setStagedUrl(url);return()=>URL.revokeObjectURL(url);},[stagedFile]);
  const [reply,setReply]=useState<ChatRow|null>(null);
  const [historySearch,setHistorySearch]=useState(false);
  const [historyTerm,setHistoryTerm]=useState("");
  const [results,setResults]=useState<ChatRow[]|null>(null);
  const [settingsOpen,setSettingsOpen]=useState(false);
  const [settingsDraft,setSettingsDraft]=useState<ChatSettings>(defaultChatSettings);
  const [pendingTexts,setPendingTexts]=useState<PendingText[]>(()=>readSession(storagePrefix+"pending",[]));
  const outboxRef=useRef(pendingTexts);
  const [failedTokens,setFailedTokens]=useState<string[]>([]);
  const followLatest=useRef(true);
  const previousScroll=useRef<{height:number;top:number}|null>(null);
  const [awayFromLatest,setAwayFromLatest]=useState(false);
  const contentRef=useRef<HTMLDivElement>(null);
  const deliveryLock=useRef(false);
  const sessionAlive=useRef(true);
  const [preview,setPreview]=useState<{url:string;mime:string;name:string}|null>(null);
  const previewRef=useRef<string|null>(null);
  const [recording,setRecording]=useState(false);
  const recorderRef=useRef<MediaRecorder|null>(null);
  const recordStream=useRef<MediaStream|null>(null);
  const recordTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const cancelRecording=useRef(false);
  const [desktopAllowed,setDesktopAllowed]=useState(typeof Notification!=="undefined"&&Notification.permission==="granted");
  const settings=useQuery({queryKey:[...key,"settings"],queryFn:async()=>{
    const {data,error}=await supabase.from("internal_chat_settings").select("*").eq("organization_id",org).maybeSingle();
    if(error)throw error;return {...defaultChatSettings,...data} as ChatSettings;
  },retry:false,staleTime:60000});
  const config=settings.data??defaultChatSettings;
  type Preference={target_id:string;target_type:"direct"|"group";pinned:boolean;muted:boolean};
  const preferences=useQuery({queryKey:[...key,"preferences"],queryFn:async()=>{
    const {data,error}=await supabase.from("internal_chat_preferences").select("target_id,target_type,pinned,muted").eq("organization_id",org).eq("user_id",uid);
    if(error)throw error;return (data??[]) as Preference[];
  },retry:false,staleTime:60000});
  const pref=(id:string,type:"direct"|"group")=>preferences.data?.find(p=>p.target_id===id&&p.target_type===type);
  const draftTarget=group?"group:"+group:peer?"direct:"+peer:null;
  function saveDraft(value:string){setDraft(value);if(draftTarget)writeSession(storagePrefix+"draft:"+draftTarget,value);}
  function saveOutbox(next:PendingText[]){outboxRef.current=next;writeSession(storagePrefix+"pending",next);if(sessionAlive.current)setPendingTexts(next);}
  useEffect(()=>{
    sessionAlive.current=true;pruneNotices(storagePrefix+"notice:");
    return()=>{sessionAlive.current=false;cancelRecording.current=true;if(recordTimer.current)clearTimeout(recordTimer.current);if(recorderRef.current?.state==="recording")recorderRef.current.stop();recordStream.current?.getTracks().forEach(t=>t.stop());if(previewRef.current)URL.revokeObjectURL(previewRef.current);};
  },[storagePrefix]);
  useEffect(()=>{setDraft(draftTarget?readSession(storagePrefix+"draft:"+draftTarget,""):"");setReply(null);setHistorySearch(false);setHistoryTerm("");setResults(null);},[draftTarget,storagePrefix]);

  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const [older,setOlder]=useState<ChatRow[]>([]);
  const [more,setMore]=useState(true);
  const [anchors,setAnchors]=useState<HTMLElement[]>([]);
  const dock=useChatDock(open,anchors,storagePrefix+"dock:v3",expanded);
  const [availabilityMenu,setAvailabilityMenu]=useState(false);
  const [settingsPage,setSettingsPage]=useState<"menu"|"company"|"roles">("menu");
  const [sound,setSound]=useState(true);
  const [availability,setAvailability]=useState<Availability>("available");
  const [pbxBusy,setPbxBusy]=useState(()=>getChatPbxBusy(org));
  const [presence,setPresence]=useState<Record<string,Availability>>({});
  const presenceRef=useRef<ReturnType<typeof supabase.channel>|null>(null);
  const presenceReady=useRef(false);
  const effectiveAvailability=pbxBusy?"on-call":availability;
  const stateRef=useRef<Availability>(effectiveAvailability);
  const [visibility,setVisibility]=useState(document.visibilityState);
  useEffect(()=>{
    const update=()=>setPbxBusy(getChatPbxBusy(org));
    window.addEventListener(CHAT_PBX_STATE,update);
    update();return()=>window.removeEventListener(CHAT_PBX_STATE,update);
  },[org]);
  useEffect(()=>{
    const update=()=>setVisibility(document.visibilityState);
    document.addEventListener("visibilitychange",update);
    return()=>document.removeEventListener("visibilitychange",update);
  },[]);
  const advertised=effectiveAvailability==="available"&&visibility==="hidden"?"away":effectiveAvailability;
  useEffect(()=>{
    stateRef.current=advertised;
    if(presenceReady.current)void presenceRef.current?.track({availability:advertised});
  },[advertised]);
  useEffect(()=>{
    let active=true;
    const channel=supabase.channel("internal-chat-presence:"+org,{config:{private:true,presence:{key:uid}}});
    presenceRef.current=channel;
    channel.on("presence",{event:"sync"},()=>{
      if(!active)return;
      const next:Record<string,Availability>={};
      for(const [id,entries] of Object.entries(channel.presenceState<{availability:Availability}>())){
        const states=entries.map(item=>item.availability).filter(item=>Object.prototype.hasOwnProperty.call(availabilityLabels,item));
        const status=(["on-call","dnd","busy","available","away"] as Availability[]).find(item=>states.includes(item));
        if(status)next[id]=status;
      }
      setPresence(next);
    }).subscribe(status=>{
      if(!active)return;
      presenceReady.current=status==="SUBSCRIBED";
      if(presenceReady.current)void channel.track({availability:stateRef.current});
      else setPresence({});
    });
    return()=>{active=false;presenceReady.current=false;presenceRef.current=null;void supabase.removeChannel(channel);};
  },[org,uid]);
  const statusLabel=(id:string)=>presence[id]?availabilityLabels[presence[id]]:"Offline";
  const statusColor=(id:string)=>presence[id]?availabilityColors[presence[id]]:"bg-muted-foreground/60";
  const seenCalls=useRef(new Set<string>());
  const notificationState=useRef({sound,availability,pbxBusy,config,desktopAllowed,preferences:preferences.data});
  notificationState.current={sound,availability,pbxBusy,config,desktopAllowed,preferences:preferences.data};
  const historyRef=useRef<HTMLDivElement>(null);
  const [connected,setConnected]=useState(false);
  const pending=useQuery({queryKey:[...key,"pending"],queryFn:async()=>{
    const {data,error}=await supabase.from("internal_chat_messages").select(fields).eq("organization_id",org)
      .eq("recipient_id",uid).eq("kind","call").is("response",null).order("created_at").limit(50);
    if(error) throw error; return data as ChatRow[];
  },retry:false,staleTime:Infinity,refetchOnWindowFocus:true});
  const unread=useQuery({queryKey:[...key,"unread"],queryFn:async()=>{
    const {count,error}=await supabase.from("internal_chat_messages").select("id",{count:"exact",head:true})
      .eq("organization_id",org).eq("recipient_id",uid).is("read_at",null);
    if(error) throw error; return count??0;
  },retry:false,staleTime:Infinity,refetchOnWindowFocus:true});
  const outgoing=useQuery({queryKey:[...key,"outgoing"],enabled:open&&expanded,queryFn:async()=>{
    const {data,error}=await supabase.from("internal_chat_messages").select(fields).eq("organization_id",org)
      .eq("sender_id",uid).eq("kind","call").is("response",null).order("created_at").limit(100);
    if(error)throw error;return data as ChatRow[];
  },retry:false,staleTime:Infinity});
  const calls=pending.data??[];
  const incoming=calls[0];
  const directory=useQuery({queryKey:[...key,"directory"],enabled:(open&&expanded)||!!incoming,queryFn:async()=>{
    const {data,error}=await supabase.rpc("internal_chat_directory_v2",{p_org:org});
    if(error) throw error; return (data??[]) as Employee[];
  },staleTime:300000,retry:false});
  const employees=directory.data??[];
  const name=(id:string)=>employees.find(e=>e.user_id===id)?.full_name??"Funcionário";
  const employeeDetails=(id:string)=>{const e=employees.find(x=>x.user_id===id);return [...new Set([e?.function_name,e?.role_name].filter(Boolean))].join(" · ");};
  const matches=(...values:(string|null|undefined)[])=>values.join(" ").normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").toLocaleLowerCase("pt-BR").includes(search.normalize("NFD").replace(/[\\u0300-\\u036f]/g,"").toLocaleLowerCase("pt-BR"));
  const groups=useQuery({queryKey:[...key,"groups"],queryFn:async()=>{
    const {data,error}=await supabase.rpc("internal_chat_groups_v1",{p_org:org});
    if(error)throw error;return (data??[]) as Group[];
  },retry:false,staleTime:Infinity});
  const recent=useQuery({queryKey:[...key,"recent"],enabled:open&&expanded&&!peer&&!group&&!groupEdit&&!metricsOpen&&!settingsOpen,queryFn:async()=>{
    const {data,error}=await supabase.rpc("internal_chat_recent_v1",{p_org:org});
    if(error)throw error;return (data??[]) as Recent[];
  },retry:false,staleTime:Infinity});
  const metrics=useQuery({queryKey:[...key,"metrics"],enabled:open&&expanded&&metricsOpen&&canMetrics,queryFn:async()=>{
    const start=performance.now();
    const {data,error}=await supabase.rpc("internal_chat_metrics_v1",{p_org:org});
    if(error)throw error;
    return {values:data as Metrics,requestMs:Math.round(performance.now()-start)};
  },retry:false,staleTime:Infinity,refetchOnWindowFocus:false,refetchOnReconnect:false});
  const currentGroup=groups.data?.find(g=>g.id===group);
  const groupParticipants=useQuery({queryKey:[...key,"participants",group],enabled:open&&expanded&&!!group,queryFn:async()=>{const {data,error}=await supabase.from("internal_chat_group_members").select("user_id").eq("organization_id",org).eq("group_id",group);if(error)throw error;return (data??[]).map(x=>x.user_id) as string[];},staleTime:300000,retry:false});
  const target=group??peer;
  useEffect(()=>{setComposerMenu(null);setStagedFile(null);},[target]);
  useEffect(()=>{if(!open||!expanded||settingsOpen||metricsOpen||groupEdit)setComposerMenu(null);},[open,expanded,settingsOpen,metricsOpen,groupEdit]);
  useEffect(()=>{if(group&&groups.isSuccess&&!groups.isFetching&&!currentGroup){setGroup(null);setOlder([]);setGroupEdit(null);setDraft("");setError("Você não faz mais parte deste grupo.");}},[group,groups.isSuccess,groups.isFetching,currentGroup]);
  const totalUnread=(unread.data??0)+(groups.data??[]).reduce((n,g)=>n+Number(g.unread),0);
  const thread=useQuery({queryKey:[...key,"thread",target],enabled:open&&expanded&&!!target,queryFn:async()=>{
    let query=supabase.from("internal_chat_messages").select(fields).eq("organization_id",org);
    query=group?query.eq("group_id",group):query.is("group_id",null).or(`and(sender_id.eq.${uid},recipient_id.eq.${peer}),and(sender_id.eq.${peer},recipient_id.eq.${uid})`);
    const {data,error}=await query.order("created_at",{ascending:false}).order("id",{ascending:false}).limit(pageSize);
    if(error) throw error; return data as ChatRow[];
  },staleTime:Infinity,retry:retryRead,retryDelay:650});
  const rows=useMemo(()=>Array.from(new Map([...older,...(thread.data??[])].map(m=>[m.id,m])).values())
    .sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id)),[older,thread.data]);
  const latestId=thread.data?.[0]?.id;
  function scrollToLatest(){const el=historyRef.current;if(el){el.scrollTop=el.scrollHeight;followLatest.current=true;setAwayFromLatest(false);}}
  useLayoutEffect(()=>{followLatest.current=true;previousScroll.current=null;setAwayFromLatest(false);if(open&&expanded)scrollToLatest();},[open,expanded,target,settingsOpen,metricsOpen]);
  useLayoutEffect(()=>{
    const el=historyRef.current;if(!el||!open||!expanded)return;
    if(previousScroll.current){const saved=previousScroll.current;previousScroll.current=null;el.scrollTop=saved.top+Math.max(0,el.scrollHeight-saved.height);return;}
    if(!results&&followLatest.current)scrollToLatest();
  },[latestId,older,pendingTexts,open,expanded,results,target]);
  useEffect(()=>{
    if(!open||!expanded||!contentRef.current||typeof ResizeObserver==="undefined")return;
    const observer=new ResizeObserver(()=>{if(followLatest.current&&!results)scrollToLatest();});observer.observe(contentRef.current);return()=>observer.disconnect();
  },[open,expanded,target,results,settingsOpen,metricsOpen]);
  function onHistoryScroll(){const el=historyRef.current;if(!el)return;const near=el.scrollHeight-el.scrollTop-el.clientHeight<72;followLatest.current=near;setAwayFromLatest(!near);}
  const missingReplyIds=useMemo(()=>Array.from(new Set((results??rows).map(m=>m.reply_to).filter((id):id is string=>!!id&&!rows.some(m=>m.id===id)))).slice(0,60),[rows,results]);
  const quotedMessages=useQuery({queryKey:[...key,"quotes",target,missingReplyIds],enabled:open&&expanded&&!!target&&missingReplyIds.length>0,queryFn:async()=>{
    let q=supabase.from("internal_chat_messages").select(fields).eq("organization_id",org).in("id",missingReplyIds);
    q=group?q.eq("group_id",group):q.is("group_id",null).or(`and(sender_id.eq.${uid},recipient_id.eq.${peer}),and(sender_id.eq.${peer},recipient_id.eq.${uid})`);
    const {data,error}=await q;if(error)throw error;return (data??[]) as ChatRow[];
  },staleTime:60000,retry:retryRead,retryDelay:650});
  const quotedMessage=(id:string|null)=>id?(rows.find(m=>m.id===id)??quotedMessages.data?.find(m=>m.id===id)):undefined;
  function jumpToQuote(id:string){const el=historyRef.current?.querySelector<HTMLElement>('[data-chat-message-id="'+id+'"]');if(el){el.scrollIntoView({block:"center",behavior:"smooth"});el.animate([{outline:"2px solid var(--primary)"},{outline:"2px solid transparent"}],{duration:1200});}}

  useEffect(()=>{
    setAnchors(["internal-chat-desktop","internal-chat-mobile"].map(id=>document.getElementById(id)).filter((v):v is HTMLElement=>!!v));
  },[]);
  useEffect(()=>{
    let timer:ReturnType<typeof setTimeout>|undefined;
    let active=true;
    let dirtyDirect=false,dirtyAll=false;
    const dirtyGroups=new Set<string>();
    const invalidate=()=>{
      dirtyAll=true;schedule();
    };
    function schedule(){
      if(timer)return;
      timer=setTimeout(()=>{
        timer=undefined;if(!active)return;
        const all=dirtyAll,direct=dirtyDirect,groupIds=new Set(dirtyGroups);
        dirtyAll=false;dirtyDirect=false;dirtyGroups.clear();
        void qc.invalidateQueries({queryKey:key,predicate:q=>{
          const type=q.queryKey[3];
          if(type==="directory"||type==="metrics"||type==="settings"||type==="preferences")return false;
          if(type==="participants")return all||groupIds.has(String(q.queryKey[4]));
          if(all)return true;
          if(type==="groups")return groupIds.size>0;
          if(type==="thread")return direct||groupIds.has(String(q.queryKey[4]));
          return direct;
        }});
      },120);
    }
    const channel=supabase.channel("internal-chat:"+org+":"+uid,{config:{private:true}})
      .on("broadcast",{event:"changed"},event=>{
        const payload=event.payload;
        if(payload?.chat_permissions){void qc.invalidateQueries({queryKey:["internal-chat-permissions",org,uid]});void qc.invalidateQueries({queryKey:[...key,"directory"]});return;}
        if(payload?.settings){void qc.invalidateQueries({queryKey:[...key,"settings"]});return;}
        if(payload?.preferences){void qc.invalidateQueries({queryKey:[...key,"preferences"]});return;}
        const groupId=payload?.group_id;
        if(typeof groupId==="string")dirtyGroups.add(groupId);else dirtyDirect=true;
        if(payload?.new_message===true&&payload.kind==="text"&&payload.sender_id!==uid&&typeof payload.id==="string"){
          const n=notificationState.current;
          const muted=n.preferences?.some(p=>p.target_type===(groupId?"group":"direct")&&p.target_id===(groupId||payload.sender_id)&&p.muted);
          if(document.hidden&&n.preferences&&n.config.desktop_notifications&&n.desktopAllowed&&!muted&&n.availability!=="dnd"){
            void notifyOnce(storagePrefix+"notice:"+payload.id,()=>{try{new Notification("Chat interno",{body:Array.isArray(payload.mentions)&&payload.mentions.includes(uid)?"Você foi mencionado em um grupo.":"Você recebeu uma mensagem."});}catch{/* Browser restriction. */}});
          }
        }
        schedule();
      })
      .subscribe(status=>{
        if(!active)return;
        setConnected(status==="SUBSCRIBED");
        if(status==="SUBSCRIBED")invalidate();
      });
    const recover=()=>{if(document.visibilityState==="visible"){invalidate();void qc.invalidateQueries({queryKey:[...key,"settings"]});void qc.invalidateQueries({queryKey:[...key,"preferences"]});}};
    document.addEventListener("visibilitychange",recover);
    window.addEventListener("online",invalidate);
    return ()=>{active=false;if(timer)clearTimeout(timer);document.removeEventListener("visibilitychange",recover);
      window.removeEventListener("online",invalidate);void supabase.removeChannel(channel);};
  },[org,uid,qc,key]);
  useEffect(()=>{
    if(!incoming||!preferences.isSuccess||!settings.isSuccess)return;
    if(!seenCalls.current.has(incoming.id)){
      seenCalls.current.add(incoming.id);
      if(availability!=="dnd"&&!pref(incoming.sender_id,"direct")?.muted)void notifyOnce(storagePrefix+"notice:"+incoming.id,()=>{if(sound&&!pbxBusy)playNotice();if(config.desktop_notifications&&desktopAllowed&&document.hidden)try{new Notification("Chamada interna",{body:"Você tem uma chamada de atenção pendente."});}catch{/* Browser restriction. */}});
    }
  },[incoming?.id,sound,availability,pbxBusy,preferences.isSuccess,settings.isSuccess,config.desktop_notifications,desktopAllowed]);
  useEffect(()=>{
    if(!open||!expanded||!peer||settingsOpen||metricsOpen||document.visibilityState!=="visible")return;
    const ids=(thread.data??[]).filter(m=>m.recipient_id===uid&&!m.read_at).map(m=>m.id);
    if(!ids.length)return;
    void supabase.from("internal_chat_messages").update({read_at:new Date().toISOString()})
      .eq("organization_id",org).eq("recipient_id",uid).is("read_at",null).in("id",ids)
      .then(({error})=>{if(!error)void qc.invalidateQueries({queryKey:[...key,"unread"]});});
  },[open,expanded,peer,settingsOpen,metricsOpen,thread.data,uid,org,qc,key,visibility]);
  useEffect(()=>{
    if(!open||!expanded||!group||settingsOpen||metricsOpen||!currentGroup||document.visibilityState!=="visible")return;
    const newest=thread.data?.[0];
    if(!newest||newest.created_at<=currentGroup.last_read_at)return;
    void supabase.rpc("internal_chat_group_read_v1",{p_org:org,p_group:group,p_through:newest.created_at})
      .then(({error})=>{if(!error)void qc.invalidateQueries({queryKey:[...key,"groups"]});});
  },[open,expanded,group,settingsOpen,metricsOpen,currentGroup,thread.data,org,qc,key,visibility]);
  function selectPeer(id:string|null){if(busy||recording)return;setSettingsOpen(false);setGroup(null);setGroupEdit(null);setMetricsOpen(false);setPeer(id);setOlder([]);setMore(true);setDraft("");setError("");}
  function selectGroup(id:string){if(busy||recording)return;setSettingsOpen(false);setPeer(null);setGroup(id);setGroupEdit(null);setMetricsOpen(false);setOlder([]);setMore(true);setDraft("");setError("");}
  async function editGroup(){
    if(!currentGroup||busy)return;setBusy(true);setError("");
    try{
      const {data,error}=await supabase.from("internal_chat_group_members").select("user_id").eq("organization_id",org).eq("group_id",currentGroup.id);
      if(error)throw error;
      setGroupEdit({id:currentGroup.id,name:currentGroup.name,members:(data??[]).map(m=>m.user_id).filter(id=>id!==uid)});
    }catch{setError("Não foi possível consultar os participantes.");}
    finally{setBusy(false);}
  }
  async function saveGroup(){
    if(!groupEdit||busy||!groupEdit.name.trim()||!groupEdit.members.length)return;
    setBusy(true);setError("");
    try{
      const {data,error}=await supabase.rpc("internal_chat_group_save_v1",{p_org:org,p_group:groupEdit.id,p_name:groupEdit.name,p_members:groupEdit.members});
      if(error)throw error;
      await qc.invalidateQueries({queryKey:[...key,"groups"]});
      setPeer(null);setGroup(String(data));setGroupEdit(null);setOlder([]);setMore(true);setDraft("");
    }catch{setError("Não foi possível salvar o grupo. Confira os participantes e permissões.");}
    finally{setBusy(false);}
  }
  async function sendFile(file:File){
    if(!target||busy||!canAttach||!config.attachments_enabled||!config.enabled||(file.type.startsWith("audio/")&&!config.audio_enabled))return;
    if(!allowedFileTypes.has(file.type)||!file.size){setError("Tipo de arquivo não permitido.");return;}
    setBusy(true);setError("");
    const path=org+"/"+uid+"/"+crypto.randomUUID();
    let uploaded=false;
    try{
      file=await compressChatImage(file);
      if(file.size>config.max_file_bytes)throw new Error("Arquivo acima do limite da empresa.");
      const {error}=await supabase.storage.from("internal-chat-files").upload(path,file,{upsert:false,contentType:file.type});
      if(error)throw error;uploaded=true;
      const {error:insertError}=await supabase.from("internal_chat_messages").insert({organization_id:org,sender_id:uid,recipient_id:group?null:peer,group_id:group,kind:"text",body:file.name.slice(0,500)||"Arquivo",attachment_path:path,reply_to:reply?.id??null});
      if(insertError)throw insertError;
      setReply(null);setStagedFile(null);
      void qc.invalidateQueries({queryKey:[...key,"thread",target]});
    }catch{if(uploaded)await supabase.storage.from("internal-chat-files").remove([path]);setError("Não foi possível enviar o arquivo.");}
    finally{setBusy(false);}
  }
  async function downloadFile(message:ChatRow){
    if(!message.attachment_path||busy)return;
    setBusy(true);setError("");
    try{
      const data=await loadChatAttachment(org,uid,message.attachment_path);
      const url=URL.createObjectURL(data);
      const a=document.createElement("a");a.href=url;a.download=message.body;a.click();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
    }catch{setError("Não foi possível baixar o arquivo.");}
    finally{setBusy(false);}
  }
  async function flushOutbox(){
    if(deliveryLock.current||!navigator.onLine||!sessionAlive.current)return;
    deliveryLock.current=true;
    try{
      // Drain the live queue, including messages added during an in-flight send.
      while(outboxRef.current.length&&sessionAlive.current){
        const item=outboxRef.current[0];
        setFailedTokens(old=>old.filter(t=>t!==item.token));
        try{
          const confirmed=await sendPendingText<ChatRow>(org,uid,item,fields);
          if(!sessionAlive.current)break;
          const threadKey=[...key,"thread",item.group??item.peer];
          qc.setQueryData<ChatRow[]>(threadKey,old=>[confirmed,...(old??[]).filter(m=>m.id!==confirmed.id)].sort((a,b)=>b.created_at.localeCompare(a.created_at)||b.id.localeCompare(a.id)).slice(0,pageSize));
          saveOutbox(outboxRef.current.filter(x=>x.token!==item.token));
          void qc.invalidateQueries({queryKey:threadKey});
          void qc.invalidateQueries({queryKey:[...key,"recent"]});
        }catch(e){if(sessionAlive.current&&navigator.onLine){setFailedTokens(old=>[...new Set([...old,item.token])]);console.warn("Internal chat send failed",(e as {code?:string})?.code??"network");}break;}
      }
    }finally{deliveryLock.current=false;}
  }
  useEffect(()=>{
    if(connected)void flushOutbox();
    const online=()=>void flushOutbox();
    window.addEventListener("online",online);return()=>window.removeEventListener("online",online);
  },[connected,org,uid]);
  async function send(kind:"text"|"call",shared?:string){
    if(!target||busy||recording||!config.enabled||(kind==="call"&&(!peer||group||!config.calls_enabled))||(kind==="text"&&!(shared??draft).trim()))return;
    setError("");
    if(kind==="text"){
      if(outboxRef.current.length>=30){setError("Há muitas mensagens aguardando envio. Tente novamente primeiro.");return;}
      followLatest.current=true;saveOutbox([...outboxRef.current,{token:crypto.randomUUID(),peer,group,body:(shared??draft).trim(),reply:reply?.id??null,mentions:group&&!shared?employees.filter(e=>groupParticipants.data?.includes(e.user_id)&&draft.includes("@"+e.full_name+" ")).slice(0,20).map(e=>e.user_id):[]}]);
      if(!shared)saveDraft("");setReply(null);void flushOutbox();return;
    }
    setBusy(true);
    try{
      const {error}=await supabase.from("internal_chat_messages").insert({organization_id:org,sender_id:uid,recipient_id:peer,group_id:null,kind:"call",body:""});
      if(error){if(error.code==="23505")throw new Error("Já existe uma chamada aguardando resposta.");throw error;}
      void qc.invalidateQueries({queryKey:[...key,"thread",target]});void qc.invalidateQueries({queryKey:[...key,"outgoing"]});
    }catch(e){setError(e instanceof Error?e.message:"Não foi possível chamar. Tente novamente.");}
    finally{setBusy(false);}
  }
  async function changePreference(field:"pinned"|"muted"){
    if(!target||busy)return;const type=group?"group":"direct";const current=pref(target,type);
    const {error}=await supabase.from("internal_chat_preferences").upsert({organization_id:org,user_id:uid,target_id:target,target_type:type,pinned:current?.pinned??false,muted:current?.muted??false,[field]:!current?.[field]},{onConflict:"organization_id,user_id,target_type,target_id"});
    if(error)setError("Não foi possível salvar a preferência.");else void preferences.refetch();
  }
  async function searchHistory(){
    if(!target||historyTerm.trim().length<2||busy)return;setBusy(true);setError("");
    try{const {data,error}=await supabase.rpc("internal_chat_search_v1",{p_org:org,p_peer:peer,p_group:group,p_query:historyTerm.trim()});if(error)throw error;setResults((data??[]) as ChatRow[]);}catch{setError("Não foi possível buscar mensagens.");}finally{setBusy(false);}
  }
  async function saveSettings(){
    setBusy(true);setError("");try{const {error}=await supabase.rpc("internal_chat_settings_save_v1",{p_org:org,p_value:settingsDraft});if(error)throw error;await settings.refetch();setSettingsOpen(false);}catch{setError("Não foi possível salvar as configurações.");}finally{setBusy(false);}
  }
  async function openChatImage(mime:string,name:string,path:string|null){
    if(!path)return;
    try{const blob=await loadChatAttachment(org,uid,path);if(!sessionAlive.current)return;const url=URL.createObjectURL(blob);if(previewRef.current)URL.revokeObjectURL(previewRef.current);previewRef.current=url;setPreview({url,mime,name});}catch{setError("Não foi possível abrir a imagem.");}
  }
  function closePreview(){if(previewRef.current)URL.revokeObjectURL(previewRef.current);previewRef.current=null;setPreview(null);}
  async function startRecording(){
    if(!target||busy||recording||!config.audio_enabled||!config.attachments_enabled||!canAttach)return;
    if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==="undefined"){setError("Gravação de áudio indisponível neste navegador.");return;}
    setError("");cancelRecording.current=false;setBusy(true);
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});if(!sessionAlive.current){stream.getTracks().forEach(t=>t.stop());return;}
      recordStream.current=stream;
      const mime=["audio/webm","audio/mp4","audio/ogg"].find(t=>MediaRecorder.isTypeSupported(t));
      if(!mime)throw new Error("Formato indisponível");
      const recorder=new MediaRecorder(stream,{mimeType:mime});recorderRef.current=recorder;
      const chunks:Blob[]=[];let bytes=0;
      recorder.ondataavailable=e=>{if(e.data.size){bytes+=e.data.size;chunks.push(e.data);if(bytes>config.max_file_bytes&&recorder.state==="recording"){cancelRecording.current=true;recorder.stop();setError("Áudio acima do limite.");}}};
      recorder.onstop=()=>{if(recordTimer.current)clearTimeout(recordTimer.current);stream.getTracks().forEach(t=>t.stop());recordStream.current=null;recorderRef.current=null;if(!sessionAlive.current)return;setRecording(false);if(!cancelRecording.current&&chunks.length)void sendFile(new File(chunks,"Áudio."+mime.split("/")[1],{type:mime}));};
      recorder.start(500);setRecording(true);recordTimer.current=setTimeout(()=>{if(recorder.state==="recording")recorder.stop();},120000);
    }catch{recordStream.current?.getTracks().forEach(t=>t.stop());recordStream.current=null;setError("Não foi possível acessar o microfone.");}finally{setBusy(false);}
  }
  async function dialPeer(){
    if(!peer||busy||!canPhone||!config.enabled||!config.pbx_enabled)return;
    setBusy(true);setError("");
    try{
      const {data,error}=await supabase.rpc("internal_chat_extension_v1",{p_org:org,p_peer:peer});
      if(error)throw error;
      if(!Number.isSafeInteger(data)||Number(data)<1){setError("Este funcionário não possui ramal ativo.");return;}
      const event=new CustomEvent(CHAT_PBX_PREFILL,{detail:{organizationId:org,number:data},cancelable:true});
      if(window.dispatchEvent(event)){setError("Abra o PABX para conectar seu ramal e tente novamente.");navigate(adminPath("tools","union-pbx"));}
    }catch{setError("Não foi possível consultar o ramal.");}
    finally{setBusy(false);}
  }
  async function respond(row:ChatRow,response:ChatRow["response"]){
    if(busy||!response)return;
    setBusy(true);setError("");
    try{
      const {data,error}=await supabase.from("internal_chat_messages").update({response})
        .eq("organization_id",org).eq("id",row.id).is("response",null).select("id");
      if(error)throw error;
      if(!data?.length)setError("A chamada já foi respondida ou cancelada.");
      void qc.invalidateQueries({queryKey:key,predicate:q=>q.queryKey[3]!=="directory"});
    }catch{setError("Não foi possível responder à chamada. Tente novamente.");}
    finally{setBusy(false);}
  }
  async function loadOlder(){
    if(!target||busy||!rows.length)return;
    const first=rows[0];setBusy(true);setError("");
    try{
      let query=supabase.from("internal_chat_messages").select(fields).eq("organization_id",org);
      const cursor=`or(created_at.lt.${first.created_at},and(created_at.eq.${first.created_at},id.lt.${first.id}))`;
      query=group?query.eq("group_id",group).or(`created_at.lt.${first.created_at},and(created_at.eq.${first.created_at},id.lt.${first.id})`):
        query.is("group_id",null).or(`and(or(and(sender_id.eq.${uid},recipient_id.eq.${peer}),and(sender_id.eq.${peer},recipient_id.eq.${uid})),${cursor})`);
      const {data,error}=await query.order("created_at",{ascending:false}).order("id",{ascending:false}).limit(pageSize);
      if(error)throw error;
      const el=historyRef.current;if(el)previousScroll.current={height:el.scrollHeight,top:el.scrollTop};followLatest.current=false;
      setOlder(previous=>[...previous,...(data as ChatRow[])]);setMore((data?.length??0)===pageSize);
    }catch{setError("Não foi possível carregar mensagens anteriores.");}
    finally{setBusy(false);}
  }
  const avatar=(id:string)=><span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">{name(id).split(/\\s+/).slice(0,2).map(n=>n[0]).join("").toUpperCase()}<span title={statusLabel(id)} className={"absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card "+statusColor(id)}/></span>;
  useEffect(()=>{if(!open||!expanded||target||settingsOpen||metricsOpen||groupEdit)setAvailabilityMenu(false);},[open,expanded,target,settingsOpen,metricsOpen,groupEdit]);
  const currentPref=target?pref(target,group?"group":"direct"):undefined;
  const visibleRows=results?[...results].sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id)):rows;
  const miniUnread=Math.max(totalUnread,calls.length);
  const localStatus=connected?availabilityLabels[advertised]:"Reconectando";
  const localStatusColor=connected?availabilityColors[advertised]:"bg-muted-foreground/60";
  const button=<button type="button" title="Chat interno" aria-label="Chat interno" aria-expanded={open&&expanded}
    onClick={e=>{dock.anchor(e.currentTarget);if(!open){dock.reset();setOpen(true);setExpanded(true);}else setExpanded(v=>!v);setError("");}}
    className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:text-primary">
    <MessageSquare size={17}/>
    {(totalUnread>0||calls.length>0)&&<span className="absolute right-0 top-0 rounded-full bg-primary px-1 text-[10px] font-bold text-white">{Math.min(99,Math.max(totalUnread,calls.length))}</span>}
  </button>;
  const outgoingCall=peer?outgoing.data?.find(m=>m.recipient_id===peer):undefined;
  const pendingOut=!!outgoingCall||rows.some(m=>m.kind==="call"&&m.sender_id===uid&&!m.response);
  return <>
    {anchors.map(a=>createPortal(button,a,a.id))}
    {createPortal(<>
      {incoming&&<aside aria-live="polite" className="fixed right-3 top-20 z-[120] w-[min(350px,calc(100vw-24px))] rounded-xl border border-border bg-card p-4 text-foreground shadow-xl">
        <div className="mb-2 flex items-center gap-2 text-xs text-muted-foreground"><BellRing size={16}/> Chamada interna {calls.length>1&&<span>· {calls.length} pendentes</span>}</div>
        <p className="text-sm font-bold">{name(incoming.sender_id)} está chamando você</p>
        <p className="mb-3 text-xs text-muted-foreground">Aguardando sua resposta desde {new Date(incoming.created_at).toLocaleString("pt-BR")}</p>
        <div className="flex flex-wrap gap-2">
          <button className={actionClass} disabled={busy} onClick={()=>void respond(incoming,"busy")}>Estou ocupado</button>
          <button className="rounded-md bg-primary px-3 py-2 text-xs font-bold text-white disabled:opacity-50" disabled={busy} onClick={()=>void respond(incoming,"coming")}>Já estou indo</button>
          <button className={actionClass} onClick={()=>{selectPeer(incoming.sender_id);setOpen(true);setExpanded(true);}}>Abrir conversa</button>
        </div>
        {error&&<p role="alert" className="mt-2 text-xs text-red-500">{error}</p>}
      </aside>}
      {preview&&<UnionWhatsAppMediaViewer url={preview.url} type={preview.mime.startsWith("image/")?"image":"audio"} name={preview.name} onClose={closePreview}/>}
      {open&&<section ref={dock.panel} aria-label="Chat interno" style={{left:dock.position.x,top:dock.position.y,maxHeight:dock.maxHeight}} data-admin-floating-panel="true" data-internal-chat-floating="true" className={"admin-crm fixed z-[110] flex flex-col rounded-2xl border border-border bg-card text-foreground shadow-[0_16px_52px_rgba(0,0,0,0.19)] "+(expanded?"h-[min(530px,calc(100dvh-100px))] w-[min(360px,calc(100vw-20px))]":"h-auto w-[min(320px,calc(100vw-20px))]")}>
        {dock.arrow&&<span aria-hidden="true" data-internal-chat-arrow={dock.arrow.bottom?"above":"below"} style={{left:dock.arrow.left-6,borderColor:"inherit"}} className={"pointer-events-none absolute h-3 w-3 rotate-45 bg-card "+(dock.arrow.bottom?"-bottom-[6px] border-b border-r":"-top-[6px] border-l border-t")}/>}
        <header {...dock.handlers} className={"relative flex shrink-0 touch-none select-none items-center gap-1 rounded-t-2xl px-2 "+(expanded?"border-b border-border py-1.5 ":"py-2 ")+(dock.dragging?"cursor-grabbing":"cursor-grab")}>
          {expanded&&(target||groupEdit||metricsOpen||settingsOpen)&&<button title="Voltar" className={iconButton} onClick={()=>{if(metricsOpen){setMetricsOpen(false);setSettingsOpen(true);setSettingsPage("menu");}else if(settingsOpen&&settingsPage!=="menu"){setSettingsPage("menu");}else if(settingsOpen){setSettingsOpen(false);}else selectPeer(null);}}><ChevronLeft size={17}/></button>}
          <div className={"flex min-w-0 flex-1 items-center "+(expanded?"gap-1":"gap-2 rounded-lg px-1 py-1.5 hover:bg-muted/60")} title="Arraste para mover o chat interno">
            {(!expanded||!target)&&<><GripHorizontal size={16} className="shrink-0 text-muted-foreground" aria-hidden="true"/><span className="relative shrink-0" title={localStatus} aria-label={"Disponibilidade: "+localStatus}><MessageSquare size={18} className="text-primary"/><span aria-hidden="true" className={"absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full border border-card "+localStatusColor}/></span></>}
            <div className="min-w-0 flex-1"><p className="block overflow-hidden whitespace-nowrap text-xs font-bold" style={fadeText} title={peer?name(peer):group?currentGroup?.name:undefined}>{!expanded?"Chat interno":settingsOpen?"Configurações":metricsOpen?"Indicadores":groupEdit?"Grupo":group?currentGroup?.name??"Grupo":peer?name(peer):"Chat interno"}</p>
            {expanded&&peer&&!settingsOpen&&!metricsOpen&&<p className="flex min-w-0 items-center gap-1 text-[10px] text-muted-foreground"><span className={"h-2 w-2 shrink-0 rounded-full "+statusColor(peer)}/><span className="min-w-0 overflow-hidden whitespace-nowrap" style={fadeText} title={statusLabel(peer)+" · "+employeeDetails(peer)}>{statusLabel(peer)}{employeeDetails(peer)&&" · "+employeeDetails(peer)}</span></p>}</div>
            {(!expanded||!target)&&miniUnread>0&&<span aria-label={miniUnread+" mensagens ou chamadas pendentes"} className="shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">{miniUnread>99?"99+":miniUnread}</span>}
          </div>
          {expanded&&!settingsOpen&&!metricsOpen&&peer&&canCall&&config.enabled&&config.calls_enabled&&<button title={pendingOut?"Aguardando resposta":"Chamar funcionário"} className={iconButton} disabled={busy||pendingOut} onClick={()=>void send("call")}><BellRing size={16} className={pendingOut?"text-primary":""}/></button>}
          {expanded&&!settingsOpen&&!metricsOpen&&currentGroup&&(currentGroup.created_by===uid||canManageGroup)&&!groupEdit&&<button title="Gerenciar grupo" className={iconButton} disabled={busy} onClick={()=>void editGroup()}><Settings2 size={15}/></button>}
          {expanded&&!settingsOpen&&!metricsOpen&&peer&&canPhone&&config.enabled&&config.pbx_enabled&&<button type="button" className={iconButton} title="Ligar pelo PABX" disabled={busy} onClick={()=>void dialPeer()}><Phone size={15}/></button>}
          {expanded&&<button type="button" title="Configurações" aria-label="Configurações" className={iconButton} onClick={()=>{setMetricsOpen(false);setSettingsPage("menu");setSettingsOpen(v=>!v);setSettingsDraft(config);}}><Settings size={16}/></button>}
          <button type="button" className={expanded?iconButton:"flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-primary"} title="Restaurar posição original" aria-label="Restaurar posição original" onClick={dock.reset}><CornerDownRight size={16}/></button>
          <button type="button" className={(expanded?iconButton:"flex h-8 w-8 shrink-0 items-center justify-center rounded-lg")+" text-primary hover:bg-primary/10"} title={expanded?"Minimizar":"Expandir"} aria-label={expanded?"Minimizar chat":"Expandir chat"} aria-expanded={expanded} onClick={()=>setExpanded(v=>!v)}>{expanded?<ChevronDown size={18}/>:<ChevronUp size={18}/>}</button>
          <button className={expanded?iconButton:"flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-primary"} title="Fechar" onClick={()=>{if(recording){cancelRecording.current=true;recorderRef.current?.stop();}setOpen(false);selectPeer(null);}}><X size={16}/></button>
        </header>
        {expanded&&<>
        {error&&<p role="alert" className="px-3 py-2 text-xs text-red-500">{error}</p>}
        {settingsOpen&&settingsPage==="menu"?<div className="min-h-0 flex-1 overflow-y-auto p-3 space-y-2"><label className="flex items-center gap-2 rounded-md p-2 text-sm hover:bg-muted"><Volume2 size={16}/><span className="flex-1">Som de chamada</span><input type="checkbox" checked={sound} onChange={e=>setSound(e.target.checked)}/></label>{config.desktop_notifications&&typeof Notification!=="undefined"&&!desktopAllowed&&<button className="flex w-full items-center gap-2 rounded-md p-2 text-left text-sm hover:bg-muted" onClick={()=>void Notification.requestPermission().then(p=>setDesktopAllowed(p==="granted"))}><BellRing size={16}/>Ativar notificações</button>}{canSettings&&<button className="flex w-full items-center gap-2 rounded-md p-2 text-left text-sm hover:bg-muted" onClick={()=>{setSettingsDraft(config);setSettingsPage("company");}}><Settings2 size={16}/><span className="flex-1">Configurações da empresa</span><ChevronRight size={15}/></button>}{canViewRoles&&<button type="button" className="flex w-full items-center gap-2 rounded-md p-2 text-left text-sm hover:bg-muted" onClick={()=>setSettingsPage("roles")}><ShieldCheck size={16}/><span className="flex-1">Perfis e permissões</span><ChevronRight size={15}/></button>}{canMetrics&&<button className="flex w-full items-center gap-2 rounded-md p-2 text-left text-sm hover:bg-muted" onClick={()=>{setSettingsOpen(false);setMetricsOpen(true);}}><BarChart3 size={16}/><span className="flex-1">Indicadores do chat</span><ChevronRight size={15}/></button>}<button className="flex w-full items-center gap-2 rounded-md p-2 text-left text-sm hover:bg-muted" onClick={dock.reset}><LocateFixed size={16}/>Restaurar posição original</button></div>:settingsOpen&&settingsPage==="roles"&&canViewRoles?<ChatRoleSettings org={org} canManage={canManageRoles} onBack={()=>setSettingsPage("menu")} onOpenFull={()=>{setExpanded(false);navigate(adminPath("roles"));}}/>:settingsOpen&&settingsPage==="company"&&canSettings?<div className="min-h-0 flex-1 overflow-y-auto p-3 space-y-3">{([["enabled","Habilitar chat"],["calls_enabled","Permitir chamadas de atenção"],["groups_enabled","Permitir grupos"],["attachments_enabled","Permitir anexos"],["audio_enabled","Permitir áudio"],["pbx_enabled","Integração com PABX"],["desktop_notifications","Notificações do navegador"]] as const).map(([field,label])=><label key={field} className="flex gap-2 items-center text-sm"><input type="checkbox" checked={settingsDraft[field]} onChange={e=>setSettingsDraft({...settingsDraft,[field]:e.target.checked})}/>{label}</label>)}<label className="block text-sm">Limite por arquivo<select className="ml-2 border rounded bg-card" value={settingsDraft.max_file_bytes} onChange={e=>setSettingsDraft({...settingsDraft,max_file_bytes:Number(e.target.value)})}>{[1,5,10].map(n=><option key={n} value={n*1048576}>{n} MB</option>)}</select></label><label className="block text-sm">Armazenamento<select className="ml-2 border rounded bg-card" value={settingsDraft.quota_bytes} onChange={e=>setSettingsDraft({...settingsDraft,quota_bytes:Number(e.target.value)})}>{[100,500,1024,5120,10240].map(n=><option key={n} value={n*1048576}>{n} MB</option>)}</select></label><p className="text-xs text-muted-foreground">Chamadas sem expiração. Desativar impede novos envios, preservando histórico e respostas pendentes.</p><button className={actionClass} disabled={busy} onClick={()=>void saveSettings()}>Salvar</button></div>:metricsOpen?<div className="min-h-0 flex-1 overflow-y-auto p-3 space-y-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground"><span>Últimas 24 horas · dados agregados</span><button disabled={metrics.isFetching} className={actionClass} onClick={()=>void metrics.refetch()}>Atualizar</button></div>
          {metrics.isError&&<p role="alert" className="text-xs text-red-500">Não foi possível consultar indicadores.</p>}
          {metrics.isPending&&<p className="text-xs text-muted-foreground">Carregando…</p>}
          {metrics.data&&<div className="grid grid-cols-2 gap-2">{[["Funcionários conectados",Object.keys(presence).length],["Mensagens",metrics.data.values.messages],["Anexos",metrics.data.values.attachments],["Chamadas",metrics.data.values.calls],["Respondidas",metrics.data.values.answered],["Pendentes (total)",metrics.data.values.pending],["Tempo médio de resposta",metrics.data.values.mean_response_seconds==null?"—":metrics.data.values.mean_response_seconds+" s"],["Tempo da consulta",metrics.data.requestMs+" ms"]].map(([label,value])=><div key={label} className="rounded-md border border-border p-2"><p className="text-[11px] text-muted-foreground">{label}</p><p className="font-bold text-base">{value}</p></div>)}</div>}
          <p className="text-xs text-muted-foreground">Tempo da consulta não representa latência de entrega. CPU, RAM, Disk I/O e franquia Realtime são acompanhados no Supabase.</p>
        </div>:groupEdit?<div className="min-h-0 flex-1 overflow-y-auto p-3 space-y-2">
          <input maxLength={100} value={groupEdit.name} onChange={e=>setGroupEdit({...groupEdit,name:e.target.value})} placeholder="Nome do grupo" className="w-full rounded-md border border-border bg-card p-2 text-sm"/>
          <p className="text-xs text-muted-foreground">Participantes · até 50 funcionários, incluindo você</p>
          {employees.map(e=><label key={e.user_id} className="flex gap-2 items-center text-sm"><input type="checkbox" checked={groupEdit.members.includes(e.user_id)} onChange={event=>setGroupEdit({...groupEdit,members:event.target.checked?[...groupEdit.members,e.user_id]:groupEdit.members.filter(id=>id!==e.user_id)})}/>{e.full_name}</label>)}
          <button disabled={busy||!groupEdit.name.trim()||!groupEdit.members.length} className={actionClass} onClick={()=>void saveGroup()}>Salvar grupo</button>
        </div>:!target?<div className="min-h-0 flex-1 flex flex-col overflow-hidden rounded-b-xl">
          <div className="shrink-0 px-3 pt-3 pb-2 space-y-2">
            <div className="relative"><Search size={15} className="pointer-events-none absolute left-2.5 top-2.5 text-muted-foreground"/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar funcionários ou grupos" className="w-full rounded-lg border border-border bg-background py-2 pl-8 pr-2 text-xs outline-none focus:ring-1 focus:ring-primary"/></div>
            <div className="flex items-center justify-between gap-2"><div className="relative"><button type="button" aria-expanded={availabilityMenu} className="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs hover:bg-muted" onClick={()=>setAvailabilityMenu(v=>!v)}><span className={"h-2.5 w-2.5 rounded-full "+availabilityColors[effectiveAvailability]}/>{availabilityLabels[effectiveAvailability]}<ChevronDown size={13} className="text-muted-foreground"/></button>
            {availabilityMenu&&<><button aria-label="Fechar disponibilidade" className="fixed inset-0 z-[111] cursor-default" onClick={()=>setAvailabilityMenu(false)}/><div className="absolute left-0 top-full z-[112] mt-1 w-40 rounded-lg border border-border bg-card p-1 shadow-lg">{(["available","away","busy","dnd"] as Availability[]).map(v=><button key={v} type="button" className={"flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted "+(availability===v?"bg-muted font-semibold":"")} onClick={()=>{setAvailability(v);setAvailabilityMenu(false);}}><span className={"h-2.5 w-2.5 rounded-full "+availabilityColors[v]}/>{availabilityLabels[v]}</button>)}</div></>}</div>
            {canCreateGroup&&config.enabled&&config.groups_enabled&&<button title="Novo grupo" className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground" onClick={()=>setGroupEdit({id:null,name:"",members:[]})}><Plus size={14}/>Grupo</button>}</div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
          {directory.isPending&&<div className="flex min-h-48 flex-col items-center justify-center gap-2 text-xs text-muted-foreground" role="status"><Loader2 size={23} className="animate-spin text-primary"/>Carregando funcionários…</div>}
          {directory.isLoadingError&&!directory.isFetching&&<button className={actionClass} onClick={()=>void directory.refetch()}>Tentar carregar novamente</button>}
          {((preferences.data??[]).some(p=>p.pinned&&(p.target_type==="direct"?employees.some(e=>e.user_id===p.target_id&&matches(e.full_name,e.function_name,e.role_name)):(groups.data??[]).some(g=>g.id===p.target_id&&matches(g.name)))))&&<p className="px-2 pt-2 pb-1 text-[11px] font-medium text-muted-foreground">Fixados</p>}
          {employees.filter(e=>pref(e.user_id,"direct")?.pinned&&matches(e.full_name,e.function_name,e.role_name)).map(e=><button type="button" key={"pin-"+e.user_id} onClick={()=>selectPeer(e.user_id)} className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-muted">{avatar(e.user_id)}<span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold">{e.full_name}</span><span title={[e.function_name&&"Função: "+e.function_name,e.role_name&&"Perfil: "+e.role_name].filter(Boolean).join(" · ")} className="block truncate text-[11px] text-muted-foreground">{employeeDetails(e.user_id)||statusLabel(e.user_id)}</span></span>{Number(recent.data?.find(c=>c.peer_id===e.user_id)?.unread??0)>0&&<span className="rounded-full bg-primary px-1.5 text-xs text-white">{recent.data?.find(c=>c.peer_id===e.user_id)?.unread}</span>}<Pin size={13} className="text-muted-foreground"/></button>)}
          {(groups.data??[]).filter(g=>pref(g.id,"group")?.pinned&&matches(g.name)).map(g=><button type="button" key={"pin-"+g.id} onClick={()=>selectGroup(g.id)} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs hover:bg-muted"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-muted"><Users size={16}/></span><span className="flex-1 truncate font-semibold">{g.name}</span>{Number(g.unread)>0&&<span className="rounded-full bg-primary px-1.5 text-xs text-white">{g.unread}</span>}<Pin size={13}/></button>)}
          {(recent.data??[]).some(c=>!pref(c.peer_id,"direct")?.pinned&&matches(name(c.peer_id),employeeDetails(c.peer_id)))&&<p className="px-2 pt-2 pb-1 text-[11px] font-medium text-muted-foreground">Conversas recentes</p>}
          {(recent.data??[]).filter(c=>!pref(c.peer_id,"direct")?.pinned&&matches(name(c.peer_id),employeeDetails(c.peer_id))).map(c=><button type="button" key={c.peer_id} onClick={()=>selectPeer(c.peer_id)} className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-muted">{avatar(c.peer_id)}<span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold">{name(c.peer_id)}</span>{employeeDetails(c.peer_id)&&<span className="block truncate text-[11px] text-muted-foreground">{employeeDetails(c.peer_id)}</span>}<span className="block truncate text-[11px] text-muted-foreground">{c.kind==="call"?"Chamada interna":c.attachment?"Anexo":shareableRoute.test(c.body)?"Registro compartilhado":c.body}</span></span>{Number(c.unread)>0&&<span className="rounded-full bg-primary px-1.5 text-xs text-white">{c.unread}</span>}</button>)}
          {(groups.data??[]).some(g=>!pref(g.id,"group")?.pinned&&matches(g.name))&&<p className="px-2 pt-2 pb-1 text-[11px] font-medium text-muted-foreground">Grupos</p>}
          {(groups.data??[]).filter(g=>!pref(g.id,"group")?.pinned&&matches(g.name)).map(g=><button type="button" key={g.id} onClick={()=>selectGroup(g.id)} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs hover:bg-muted"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-muted"><Users size={16}/></span><span className="flex-1 truncate font-semibold">{g.name}</span>{Number(g.unread)>0&&<span className="rounded-full bg-primary px-1.5 text-xs text-white">{g.unread}</span>}</button>)}
          {!directory.isPending&&<p className="px-2 pt-2 pb-1 text-[11px] font-medium text-muted-foreground">Funcionários</p>}
          {[...employees].filter(e=>!pref(e.user_id,"direct")?.pinned&&matches(e.full_name,e.function_name,e.role_name)).sort((a,b)=>Number(!!presence[b.user_id])-Number(!!presence[a.user_id])||a.full_name.localeCompare(b.full_name,"pt-BR")).map(e=><button type="button" key={e.user_id} onClick={()=>selectPeer(e.user_id)} className="flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-muted">{avatar(e.user_id)}<span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold">{e.full_name}</span>{employeeDetails(e.user_id)&&<span title={[e.function_name&&"Função: "+e.function_name,e.role_name&&"Perfil: "+e.role_name].filter(Boolean).join(" · ")} className="block truncate text-[11px] text-muted-foreground">{employeeDetails(e.user_id)}</span>}<span className="flex items-center gap-1 text-[10px] text-muted-foreground">{statusLabel(e.user_id)}</span></span></button>)}
          </div>
        </div>:<>
          <div className="flex shrink-0 items-center gap-1 border-b border-border bg-card px-2 py-1"><button type="button" className={iconButton+" border "+(currentPref?.pinned?"border-primary/30 bg-primary/10 text-primary":"border-transparent")} title={currentPref?.pinned?"Desafixar conversa":"Fixar conversa"} aria-label={currentPref?.pinned?"Desafixar conversa":"Fixar conversa"} aria-pressed={!!currentPref?.pinned} onClick={()=>void changePreference("pinned")}><Pin size={16} className={currentPref?.pinned?"fill-current":""}/></button><button type="button" className={iconButton+" border "+(currentPref?.muted?"border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400":"border-transparent")} title={currentPref?.muted?"Reativar notificações":"Silenciar conversa"} aria-label={currentPref?.muted?"Reativar notificações":"Silenciar conversa"} aria-pressed={!!currentPref?.muted} onClick={()=>void changePreference("muted")}><BellOff size={16}/></button><button type="button" className={iconButton+" border "+(historySearch?"border-primary/30 bg-primary/10 text-primary":"border-transparent")} title="Buscar mensagens" aria-label="Buscar mensagens" aria-pressed={historySearch} onClick={()=>{setHistorySearch(!historySearch);setResults(null);}}><Search size={16}/></button></div>
          {historySearch&&<form onSubmit={e=>{e.preventDefault();void searchHistory();}} className="flex gap-1 p-2"><input maxLength={100} value={historyTerm} onChange={e=>setHistoryTerm(e.target.value)} placeholder="Buscar no histórico" className="min-w-0 flex-1 border rounded bg-card p-1 text-xs"/><button className={actionClass} disabled={busy}>Buscar</button></form>}
          {outgoingCall&&<div className="flex items-center gap-2 border-b border-border px-3 py-2 text-xs"><BellRing size={14}/><span className="flex-1">Chamando · aguardando resposta</span><button disabled={busy} className="underline" onClick={()=>void respond(outgoingCall,"cancelled")}>Cancelar</button></div>}
          <div ref={historyRef} onScroll={onHistoryScroll} className="min-h-0 min-w-0 flex-1 space-y-1.5 overflow-x-hidden overflow-y-auto overscroll-contain bg-muted/25 px-2 py-2 [scrollbar-gutter:stable]" style={{backgroundImage:"url('/assets/crm/whatsapp-chat-pattern.svg')",backgroundRepeat:"repeat",backgroundSize:"270px 270px",overflowAnchor:"none"}}>
            <div ref={contentRef} className="min-w-0 space-y-1.5">
            {thread.isPending&&!thread.data&&<div role="status" className="flex min-h-32 items-center justify-center"><Loader2 size={22} className="animate-spin text-primary"/></div>}
            {thread.isLoadingError&&!thread.isFetching&&<button className={actionClass} onClick={()=>void thread.refetch()}>Tentar novamente</button>}
            {more&&(thread.data?.length??0)>=pageSize&&<button className={actionClass} disabled={busy} onClick={()=>void loadOlder()}>Mensagens anteriores</button>}
            {results&&<p className="text-xs text-muted-foreground">{results.length} resultados</p>}
            {visibleRows.map((m,index)=><Fragment key={m.id}>{(index===0||chatDayKey(visibleRows[index-1].created_at)!==chatDayKey(m.created_at))&&<div className="flex justify-center py-1"><span className="rounded-md border border-border bg-card/95 px-2 py-1 text-[10px] font-semibold text-muted-foreground shadow-sm">{chatDayLabel(chatDayKey(m.created_at))}</span></div>}<div data-chat-message-id={m.id} className={"min-w-0 w-fit max-w-[88%] overflow-hidden rounded-lg border border-border/50 px-2 py-1.5 text-xs shadow-sm [overflow-wrap:anywhere] "+(m.sender_id===uid?"ml-auto bg-primary/10 dark:bg-primary/20":"bg-card")}>
              {group&&m.sender_id!==uid&&<p className="text-xs font-semibold text-primary">{name(m.sender_id)}</p>}
              {m.mentions?.includes(uid)&&!m.deleted_at&&<p className="mb-1 text-xs font-semibold text-primary">Mencionou você</p>}
              {m.reply_to&&<button type="button" title="Ir para mensagem original" disabled={!rows.some(x=>x.id===m.reply_to)} onClick={()=>jumpToQuote(m.reply_to!)} className="mb-1 flex w-full min-w-0 flex-col gap-0.5 rounded-md border-l-[3px] border-primary bg-background/60 px-2 py-1.5 text-left"><span className="truncate text-[10px] font-bold text-primary">{quotedMessage(m.reply_to)?.sender_id===uid?"Você":quotedMessage(m.reply_to)?name(quotedMessage(m.reply_to)!.sender_id):"Mensagem original"}</span><span className="max-w-full truncate text-xs text-foreground/80">{quoteSummary(quotedMessage(m.reply_to))}</span></button>}
              {m.deleted_at?<p className="italic text-muted-foreground">Mensagem excluída</p>:m.attachment_path?<ChatAttachment key={m.id+":"+m.attachment_path} org={org} uid={uid} message={m} onPreview={(_url,mime,name)=>void openChatImage(mime,name,m.attachment_path)} onDownload={()=>void downloadFile(m)}/>:m.kind==="text"?(shareableRoute.test(m.body)?<button type="button" className="flex max-w-full items-center gap-2 rounded-md border border-border bg-card px-2 py-2 text-left font-semibold text-primary hover:bg-muted" disabled={m.body.includes("/orders/")&&!canShareOrders} onClick={()=>navigate(m.body)}>{m.body.includes("/orders/")?<ClipboardList size={17} className="shrink-0"/>:<Link2 size={15} className="shrink-0"/>}Abrir {m.body.includes("/orders/")?"ordem de serviço":m.body.includes("/customers/")?"cadastro":"produto"}</button>:<p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{m.body}</p>):<><p className="font-semibold"><BellRing className="mr-1 inline" size={14}/> {m.response?callLabels[m.response]:"Chamada aguardando resposta"}</p>
                {!m.response&&m.sender_id===uid&&<button disabled={busy} className="mt-1 text-xs underline" onClick={()=>void respond(m,"cancelled")}>Cancelar chamada</button>}
              </>}
              <div className="mt-1 flex min-w-0 flex-wrap items-center justify-end gap-1 text-[10px] text-muted-foreground">
                {!m.deleted_at&&m.kind==="text"&&<button type="button" title="Responder mensagem" aria-label="Responder mensagem" className="mr-1 inline-flex min-h-6 items-center gap-1 rounded px-0.5 text-[10px] font-semibold text-primary hover:underline" onClick={()=>{setReply(m);composerRef.current?.focus();}}><Reply size={12}/>Responder</button>}
                <span>{m.edited_at&&!m.deleted_at?"Editada · ":""}{chatClock(m.created_at)}</span>
                {m.sender_id===uid&&!group&&(m.read_at?<CheckCheck size={13} className="shrink-0 text-sky-600 dark:text-sky-400" aria-label="Visualizada"/>:<Check size={13} className="shrink-0" aria-label="Enviada"/>)}
              </div>
            </div></Fragment>)}
            {!results&&pendingTexts.filter(x=>(x.group??x.peer)===target).map(x=><div key={x.token} className="ml-auto w-fit max-w-[88%] rounded-lg border border-border/50 bg-primary/10 px-2 py-1.5 text-xs [overflow-wrap:anywhere]"><p className="whitespace-pre-wrap">{x.body}</p><div className="mt-1 flex items-center justify-end gap-1 text-[10px] text-muted-foreground">{failedTokens.includes(x.token)?<><AlertCircle size={12} className="text-destructive"/><button type="button" className="text-destructive underline" onClick={()=>void flushOutbox()}>Tentar novamente</button><button type="button" className="underline" onClick={()=>{if(!deliveryLock.current){saveOutbox(outboxRef.current.filter(y=>y.token!==x.token));setFailedTokens(old=>old.filter(t=>t!==x.token));void flushOutbox();}}}>Descartar</button></>:<><Clock size={12}/>Aguardando envio</>}</div></div>)}
            </div>
          </div>
          {awayFromLatest&&!results&&<div className="relative h-0"><button type="button" title="Ir para mensagens recentes" className="absolute bottom-2 right-3 flex h-8 w-8 items-center justify-center rounded-full border border-border bg-card text-primary shadow-md" onClick={scrollToLatest}><ArrowDown size={17}/></button></div>}
          {reply&&<div className="mx-2 my-1 flex items-center gap-2 rounded-lg border-l-[3px] border-primary bg-muted/50 px-3 py-2 text-xs"><Reply size={17} className="shrink-0 text-primary"/><div className="min-w-0 flex-1"><p className="font-bold text-primary">{reply.sender_id===uid?"Respondendo à sua mensagem":"Respondendo a "+name(reply.sender_id)}</p><p className="truncate text-muted-foreground">{quoteSummary(reply)}</p></div><button type="button" aria-label="Cancelar resposta" title="Cancelar resposta" className="rounded p-1 text-muted-foreground hover:bg-background" onClick={()=>setReply(null)}><X size={18}/></button></div>}
          {group&&draft.includes("@")&&!draft.endsWith(" ")&&<div className="max-h-20 overflow-auto px-2">{employees.filter(e=>groupParticipants.data?.includes(e.user_id)&&e.full_name.toLowerCase().includes(draft.slice(draft.lastIndexOf("@")+1).toLowerCase())).slice(0,5).map(e=><button key={e.user_id} type="button" className="block text-xs p-1" onClick={()=>saveDraft(draft.slice(0,draft.lastIndexOf("@"))+"@"+e.full_name+" ")}>@{e.full_name}</button>)}</div>}
          {recording&&<div className="flex items-center justify-between border-t border-border p-2 text-xs text-red-500"><span>Gravando áudio · até 2 minutos</span><button className="underline" onClick={()=>{cancelRecording.current=true;recorderRef.current?.stop();}}>Cancelar gravação</button></div>}
          {stagedFile&&<div className="flex min-w-0 items-center gap-2 border-t border-border bg-card px-2 py-2">{stagedUrl?<img src={stagedUrl} alt="Prévia do anexo" className="h-12 w-12 shrink-0 rounded object-cover"/>:<Paperclip size={18}/>}<span className="min-w-0 flex-1 truncate text-xs" title={stagedFile.name}>{stagedFile.name}</span><button type="button" title="Remover anexo pendente" disabled={busy} className={iconButton} onClick={()=>setStagedFile(null)}><X size={16}/></button></div>}
          <form onSubmit={e=>{e.preventDefault();setComposerMenu(null);if(stagedFile)void sendFile(stagedFile);else void send("text");}} className="relative shrink-0 border-t border-border bg-card p-2">
            {composerMenu&&<div className="absolute inset-x-2 bottom-full z-40 mb-1 rounded-xl border border-border bg-card p-2 shadow-xl">
              {composerMenu==="emoji"?<div className="h-[min(320px,42dvh)]"><EmojiPicker embedded recentEmojis={recentEmojis} onSelect={emoji=>{const input=composerRef.current;const start=input?.selectionStart??draft.length,end=input?.selectionEnd??start;saveDraft((draft.slice(0,start)+emoji+draft.slice(end)).slice(0,4000));setRecentEmojis(old=>[emoji,...old.filter(x=>x!==emoji)].slice(0,16));setComposerMenu(null);requestAnimationFrame(()=>{input?.focus();input?.setSelectionRange(start+emoji.length,start+emoji.length);});}}/></div>:composerMenu==="orders"&&canShareOrders?<ChatOrderPicker org={org} onBack={()=>setComposerMenu("actions")} onSelect={path=>{setComposerMenu(null);void send("text",path);}}/>:<div className="space-y-1"><p className="px-2 py-1 text-xs font-semibold text-muted-foreground">Opções da conversa</p>{canShareOrders&&<button type="button" className="flex w-full items-center gap-2 rounded-md p-2 text-left text-xs hover:bg-muted" onClick={()=>setComposerMenu("orders")}><ClipboardList size={16}/>Enviar ordem de serviço</button>}{shareableRoute.test(location.pathname)&&(!location.pathname.startsWith("/admin/orders/")||canShareOrders)&&<button type="button" className="flex w-full items-center gap-2 rounded-md p-2 text-left text-xs hover:bg-muted" onClick={()=>{setComposerMenu(null);void send("text",location.pathname);}}><Link2 size={16}/>Compartilhar registro atual</button>}</div>}
            </div>}
            <div className="flex min-w-0 items-stretch overflow-hidden rounded-lg border border-border bg-background focus-within:border-primary">
              {canAttach&&config.enabled&&config.attachments_enabled&&<><input ref={fileRef} type="file" accept=".jpg,.jpeg,.png,.webp,.gif,.pdf,.txt,.doc,.docx,.xls,.xlsx,.webm,.ogg,.mp4,.mp3,.wav" className="hidden" onChange={e=>{const file=e.target.files?.[0];e.target.value="";if(file){setComposerMenu(null);setStagedFile(file);}}}/><button type="button" aria-label="Anexar arquivo" title="Anexar arquivo" className="flex h-9 w-8 shrink-0 items-center justify-center border-r border-border text-foreground hover:bg-muted disabled:opacity-40" disabled={busy||recording} onClick={()=>fileRef.current?.click()}><Paperclip size={17}/></button></>}
              <button type="button" title="Emojis" aria-label="Emojis" aria-expanded={composerMenu==="emoji"} disabled={recording||!!stagedFile||!config.enabled} className={"flex h-9 w-8 shrink-0 items-center justify-center border-r border-border hover:bg-muted "+(composerMenu==="emoji"?"bg-primary/10 text-primary":"text-foreground")} onClick={()=>setComposerMenu(v=>v==="emoji"?null:"emoji")}><Smile size={17}/></button>
              {(canShareOrders||(shareableRoute.test(location.pathname)&&!location.pathname.startsWith("/admin/orders/")))&&<button type="button" title="Mais opções" aria-label="Mais opções" aria-expanded={composerMenu==="actions"||composerMenu==="orders"} disabled={busy||recording||!!stagedFile||!config.enabled} className={"flex h-9 w-7 shrink-0 items-center justify-center border-r border-border hover:bg-muted "+(composerMenu==="actions"||composerMenu==="orders"?"bg-primary/10 text-primary":"text-foreground")} onClick={()=>setComposerMenu(v=>v==="actions"||v==="orders"?null:"actions")}><ChevronUp size={17}/></button>}
              <input ref={composerRef} maxLength={4000} value={draft} disabled={!config.enabled||!!stagedFile} onChange={e=>saveDraft(e.target.value)} onFocus={()=>setComposerMenu(null)} placeholder={stagedFile?"Arquivo pronto":"Digite uma mensagem"} className="h-9 min-w-0 flex-1 bg-transparent px-2 text-xs outline-none"/>
              {!draft.trim()&&!stagedFile&&canAttach&&config.enabled&&config.audio_enabled&&config.attachments_enabled&&<button type="button" aria-label={recording?"Parar gravação":"Gravar áudio"} title={recording?"Parar gravação":"Gravar áudio"} className={"flex h-9 w-8 shrink-0 items-center justify-center border-l border-border hover:bg-muted "+(recording?"text-red-600":"text-foreground")} onClick={()=>recording?recorderRef.current?.stop():void startRecording()}>{recording?<Square size={16}/>:<Mic size={17}/>}</button>}
              <button type="submit" disabled={busy||(!draft.trim()&&!stagedFile)||!config.enabled||recording} title="Enviar mensagem" aria-label="Enviar mensagem" className="flex h-9 w-9 shrink-0 items-center justify-center bg-primary text-primary-foreground disabled:opacity-45"><Send size={16}/></button>
            </div>
          </form>
        </>}
        </>}
      </section>}
    </>,document.body)}
  </>;
}
