import { useEffect, useMemo, useRef, useState } from "react";
import { ChatRoleSettings } from "./ChatRoleSettings";
import { useChatDock } from "./useChatDock";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, ChevronLeft, MessageSquare, Minus, Send, X, Phone, Link2, Paperclip, Users, Settings2, Reply, Pencil, Trash2, Pin, BellOff, Search, Mic, Square, Settings, ChevronDown, ChevronRight, Plus, BarChart3, LocateFixed, Volume2, CornerDownRight, ChevronUp, Loader2, ShieldCheck } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { useLocation, useNavigate } from "react-router";
import { CHAT_PBX_PREFILL, CHAT_PBX_STATE, getChatPbxBusy } from "../application/pbx-chat-bridge";
import { defaultChatSettings, readSession, writeSession, sendPendingText, notifyOnce, pruneNotices, compressChatImage, type ChatSettings, type PendingText } from "../application/chat-reliability";
import { adminPath } from "@/features/admin-shell/admin-routes";
type Availability = "available"|"away"|"busy"|"dnd"|"on-call";
const availabilityLabels:Record<Availability,string>={available:"Disponível",away:"Ausente",busy:"Ocupado",dnd:"Não perturbe","on-call":"Em ligação"};
const availabilityColors:Record<Availability,string>={available:"bg-green-500",away:"bg-amber-500",busy:"bg-red-500",dnd:"bg-violet-500","on-call":"bg-blue-500"};
const iconButton="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50";
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
  if(!activeOrganizationId || !user?.id || !hasPermission("internal_chat.use")) return null;
  return <ChatSession key={activeOrganizationId+":"+user.id} org={activeOrganizationId} uid={user.id} canCall={hasPermission("internal_chat.call")} canPhone={hasPermission("pbx.view")} canCreateGroup={hasPermission("internal_chat.groups.create")} canManageGroup={hasPermission("internal_chat.groups.manage")} canAttach={hasPermission("internal_chat.attachments.send")} canMetrics={hasPermission("internal_chat.metrics.view")} canSettings={hasPermission("internal_chat.settings.manage")} canViewRoles={hasPermission("roles.view")&&hasPermission("roles.details.view")} canManageRoles={hasPermission("roles.permissions.manage")} />;
}
function ChatSession({org,uid,canCall,canPhone,canCreateGroup,canManageGroup,canAttach,canMetrics,canSettings,canViewRoles,canManageRoles}:{org:string;uid:string;canCall:boolean;canPhone:boolean;canCreateGroup:boolean;canManageGroup:boolean;canAttach:boolean;canMetrics:boolean;canSettings:boolean;canViewRoles:boolean;canManageRoles:boolean}) {
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
  const [reply,setReply]=useState<ChatRow|null>(null);
  const [editing,setEditing]=useState<ChatRow|null>(null);
  const [historySearch,setHistorySearch]=useState(false);
  const [historyTerm,setHistoryTerm]=useState("");
  const [results,setResults]=useState<ChatRow[]|null>(null);
  const [settingsOpen,setSettingsOpen]=useState(false);
  const [settingsDraft,setSettingsDraft]=useState<ChatSettings>(defaultChatSettings);
  const [pendingTexts,setPendingTexts]=useState<PendingText[]>(()=>readSession(storagePrefix+"pending",[]));
  const outboxRef=useRef(pendingTexts);
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
  useEffect(()=>{setDraft(draftTarget?readSession(storagePrefix+"draft:"+draftTarget,""):"");setReply(null);setEditing(null);setHistorySearch(false);setHistoryTerm("");setResults(null);},[draftTarget,storagePrefix]);

  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const [older,setOlder]=useState<ChatRow[]>([]);
  const [more,setMore]=useState(true);
  const [anchors,setAnchors]=useState<HTMLElement[]>([]);
  const dock=useChatDock(open,anchors,storagePrefix+"dock:v2",expanded);
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
  const outgoing=useQuery({queryKey:[...key,"outgoing"],enabled:open,queryFn:async()=>{
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
  useEffect(()=>{if(group&&groups.isSuccess&&!groups.isFetching&&!currentGroup){setGroup(null);setOlder([]);setGroupEdit(null);setDraft("");setError("Você não faz mais parte deste grupo.");}},[group,groups.isSuccess,groups.isFetching,currentGroup]);
  const totalUnread=(unread.data??0)+(groups.data??[]).reduce((n,g)=>n+Number(g.unread),0);
  const thread=useQuery({queryKey:[...key,"thread",target],enabled:open&&expanded&&!!target,queryFn:async()=>{
    let query=supabase.from("internal_chat_messages").select(fields).eq("organization_id",org);
    query=group?query.eq("group_id",group):query.is("group_id",null).or(`and(sender_id.eq.${uid},recipient_id.eq.${peer}),and(sender_id.eq.${peer},recipient_id.eq.${uid})`);
    const {data,error}=await query.order("created_at",{ascending:false}).order("id",{ascending:false}).limit(pageSize);
    if(error) throw error; return data as ChatRow[];
  },staleTime:Infinity,retry:false});
  const rows=useMemo(()=>Array.from(new Map([...older,...(thread.data??[])].map(m=>[m.id,m])).values())
    .sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id)),[older,thread.data]);
  const latestId=thread.data?.[0]?.id;
  useEffect(()=>{if(open&&expanded&&historyRef.current)historyRef.current.scrollTop=historyRef.current.scrollHeight;},[open,expanded,target,latestId]);
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
      setReply(null);
      void qc.invalidateQueries({queryKey:[...key,"thread",target]});
    }catch{if(uploaded)await supabase.storage.from("internal-chat-files").remove([path]);setError("Não foi possível enviar o arquivo.");}
    finally{setBusy(false);}
  }
  async function downloadFile(message:ChatRow,view=false){
    if(!message.attachment_path||busy)return;
    setBusy(true);setError("");
    try{
      const {data,error}=await supabase.storage.from("internal-chat-files").download(message.attachment_path);
      if(error||!data)throw error;
      const url=URL.createObjectURL(data);
      if(view){if(previewRef.current)URL.revokeObjectURL(previewRef.current);previewRef.current=url;setPreview({url,mime:data.type,name:message.body});return;}
      const a=document.createElement("a");a.href=url;a.download=message.body;a.click();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
    }catch{setError("Não foi possível baixar o arquivo.");}
    finally{setBusy(false);}
  }
  async function flushOutbox(){
    if(deliveryLock.current||!navigator.onLine||!sessionAlive.current)return;
    deliveryLock.current=true;
    try{
      for(const item of [...outboxRef.current]){
        if(!sessionAlive.current)break;
        try{
          await sendPendingText(org,uid,item);
          saveOutbox(outboxRef.current.filter(x=>x.token!==item.token));
          if(sessionAlive.current)void qc.invalidateQueries({queryKey:[...key,"thread",item.group??item.peer]});
        }catch{if(sessionAlive.current)setError("Mensagem não enviada. Será tentada novamente ao reconectar ou ao clicar em tentar novamente.");break;}
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
      if(editing&&!shared){await editMessage(editing,false);return;}
      if(outboxRef.current.length>=30){setError("Há muitas mensagens aguardando envio. Tente novamente primeiro.");return;}
      saveOutbox([...outboxRef.current,{token:crypto.randomUUID(),peer,group,body:(shared??draft).trim(),reply:reply?.id??null,mentions:group&&!shared?employees.filter(e=>groupParticipants.data?.includes(e.user_id)&&draft.includes("@"+e.full_name+" ")).slice(0,20).map(e=>e.user_id):[]}]);
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
  async function editMessage(message:ChatRow,remove:boolean){
    if(busy)return;if(remove&&!window.confirm("Excluir esta mensagem para todos os participantes?"))return;
    setBusy(true);setError("");
    try{
      const {error}=await supabase.rpc("internal_chat_edit_v1",{p_org:org,p_id:message.id,p_body:remove?"":draft,p_delete:remove});
      if(error)throw error;
      setOlder(old=>old.map(m=>m.id===message.id?{...m,body:remove?"Mensagem excluída":draft,deleted_at:remove?new Date().toISOString():m.deleted_at,edited_at:remove?m.edited_at:new Date().toISOString()}:m));
      if(!remove){setEditing(null);saveDraft("");}setResults(null);void qc.invalidateQueries({queryKey:[...key,"thread",target]});
    }catch{setError("Não foi possível alterar a mensagem.");}finally{setBusy(false);}
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
    const first=rows[0];setBusy(true);
    try{
      let query=supabase.from("internal_chat_messages").select(fields).eq("organization_id",org);
      const cursor=`or(created_at.lt.${first.created_at},and(created_at.eq.${first.created_at},id.lt.${first.id}))`;
      query=group?query.eq("group_id",group).or(`created_at.lt.${first.created_at},and(created_at.eq.${first.created_at},id.lt.${first.id})`):
        query.is("group_id",null).or(`and(or(and(sender_id.eq.${uid},recipient_id.eq.${peer}),and(sender_id.eq.${peer},recipient_id.eq.${uid})),${cursor})`);
      const {data,error}=await query.order("created_at",{ascending:false}).order("id",{ascending:false}).limit(pageSize);
      if(error)throw error;
      setOlder(previous=>[...previous,...(data as ChatRow[])]);setMore((data?.length??0)===pageSize);
    }catch{setError("Não foi possível carregar mensagens anteriores.");}
    finally{setBusy(false);}
  }
  const avatar=(id:string)=><span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">{name(id).split(/\\s+/).slice(0,2).map(n=>n[0]).join("").toUpperCase()}<span title={statusLabel(id)} className={"absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card "+statusColor(id)}/></span>;
  useEffect(()=>{if(!open||!expanded||target||settingsOpen||metricsOpen||groupEdit)setAvailabilityMenu(false);},[open,expanded,target,settingsOpen,metricsOpen,groupEdit]);
  const currentPref=target?pref(target,group?"group":"direct"):undefined;
  const visibleRows=results??rows;
  const button=<button type="button" title="Chat interno" aria-label="Chat interno" aria-expanded={open&&expanded}
    onClick={e=>{dock.anchor(e.currentTarget);if(!open){setOpen(true);setExpanded(true);}else setExpanded(v=>!v);setError("");}}
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
      {preview&&<aside role="dialog" aria-label="Pré-visualização" className="fixed inset-0 z-[130] flex items-center justify-center bg-black/60 p-4"><div className="max-h-[85vh] max-w-[90vw] rounded-lg bg-card p-3"><div className="mb-2 flex justify-between gap-3"><span className="text-sm">{preview.name}</span><button title="Fechar" onClick={closePreview}><X size={18}/></button></div>{preview.mime.startsWith("image/")?<img src={preview.url} alt={preview.name} className="max-h-[70vh] max-w-full object-contain"/>:<audio controls src={preview.url}/>}</div></aside>}
      {open&&<section ref={dock.panel} aria-label="Chat interno" style={{left:dock.position.x,top:dock.position.y}} data-admin-floating-panel="true" className={"admin-crm fixed z-[110] flex w-[min(360px,calc(100vw-20px))] flex-col rounded-xl border border-border bg-card text-foreground shadow-[0_16px_52px_rgba(0,0,0,0.19)] "+(expanded?"h-[min(530px,calc(100dvh-100px))]":"h-auto")}>
        {dock.arrow&&<span aria-hidden="true" style={{left:dock.arrow.left-6}} className={"pointer-events-none absolute h-3 w-3 rotate-45 border-border bg-card "+(dock.arrow.bottom?"-bottom-[7px] border-b border-r":"-top-[7px] border-l border-t")}/>}
        <header {...dock.handlers} className={"relative flex touch-none select-none items-center gap-1.5 rounded-t-xl px-2 py-2 "+(expanded?"border-b border-border ":"")+(dock.dragging?"cursor-grabbing":"cursor-grab")}>
          {expanded&&(target||groupEdit||metricsOpen||settingsOpen)&&<button title="Voltar" className={iconButton} onClick={()=>{if(metricsOpen){setMetricsOpen(false);setSettingsOpen(true);setSettingsPage("menu");}else if(settingsOpen&&settingsPage!=="menu"){setSettingsPage("menu");}else if(settingsOpen){setSettingsOpen(false);}else selectPeer(null);}}><ChevronLeft size={18}/></button>}
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{!expanded?"Chat interno":settingsOpen?"Configurações":metricsOpen?"Indicadores":groupEdit?"Grupo":group?currentGroup?.name??"Grupo":peer?name(peer):"Chat interno"}</p>
            <p className="text-[10px] text-muted-foreground">{!expanded?<span className="truncate">{totalUnread?totalUnread+" não lidas":connected?"Conectado":"Reconectando…"}</span>:peer?<span className="flex min-w-0 items-center gap-1"><span className={"h-2 w-2 shrink-0 rounded-full "+statusColor(peer)}/><span className="truncate">{statusLabel(peer)}{employeeDetails(peer)&&" · "+employeeDetails(peer)}</span></span>:connected?<span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-green-500"/>Conectado</span>:"Reconectando…"}</p></div>
          {expanded&&!settingsOpen&&!metricsOpen&&peer&&canCall&&config.enabled&&config.calls_enabled&&<button title={pendingOut?"Aguardando resposta":"Chamar funcionário"} className={iconButton} disabled={busy||pendingOut} onClick={()=>void send("call")}><BellRing size={16} className={pendingOut?"text-primary":""}/></button>}
          {expanded&&!settingsOpen&&!metricsOpen&&currentGroup&&(currentGroup.created_by===uid||canManageGroup)&&!groupEdit&&<button title="Gerenciar grupo" className={iconButton} disabled={busy} onClick={()=>void editGroup()}><Settings2 size={15}/></button>}
          {!settingsOpen&&!metricsOpen&&peer&&canPhone&&config.enabled&&config.pbx_enabled&&<button type="button" className={iconButton} title="Ligar pelo PABX" disabled={busy} onClick={()=>void dialPeer()}><Phone size={15}/></button>}
          {expanded&&<button type="button" title="Configurações" aria-label="Configurações" className={iconButton} onClick={()=>{setMetricsOpen(false);setSettingsPage("menu");setSettingsOpen(v=>!v);setSettingsDraft(config);}}><Settings size={16}/></button>}
          <button type="button" className={iconButton+" border border-border"} title="Restaurar posição original" aria-label="Restaurar posição original" onClick={dock.reset}><CornerDownRight size={16}/></button>
          <button type="button" className={iconButton+" text-primary hover:bg-primary/10"} title={expanded?"Minimizar":"Expandir"} aria-label={expanded?"Minimizar chat":"Expandir chat"} aria-expanded={expanded} onClick={()=>setExpanded(v=>!v)}>{expanded?<ChevronDown size={18}/>:<ChevronUp size={18}/>}</button>
          <button className={iconButton} title="Fechar" onClick={()=>{if(recording){cancelRecording.current=true;recorderRef.current?.stop();}setOpen(false);selectPeer(null);}}><X size={16}/></button>
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
          {directory.isError&&<button className={actionClass} onClick={()=>void directory.refetch()}>Tentar carregar novamente</button>}
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
          <div className="flex shrink-0 items-center gap-1.5 border-b border-border px-2 py-1.5"><button type="button" className={iconButton+" border "+(currentPref?.pinned?"border-primary/30 bg-primary/10 text-primary":"border-transparent")} title={currentPref?.pinned?"Desafixar conversa":"Fixar conversa"} aria-label={currentPref?.pinned?"Desafixar conversa":"Fixar conversa"} aria-pressed={!!currentPref?.pinned} onClick={()=>void changePreference("pinned")}><Pin size={16} className={currentPref?.pinned?"fill-current":""}/></button><button type="button" className={iconButton+" border "+(currentPref?.muted?"border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400":"border-transparent")} title={currentPref?.muted?"Reativar notificações":"Silenciar conversa"} aria-label={currentPref?.muted?"Reativar notificações":"Silenciar conversa"} aria-pressed={!!currentPref?.muted} onClick={()=>void changePreference("muted")}><BellOff size={16}/></button><button type="button" className={iconButton+" border "+(historySearch?"border-primary/30 bg-primary/10 text-primary":"border-transparent")} title="Buscar mensagens" aria-label="Buscar mensagens" aria-pressed={historySearch} onClick={()=>{setHistorySearch(!historySearch);setResults(null);}}><Search size={16}/></button></div>
          {historySearch&&<form onSubmit={e=>{e.preventDefault();void searchHistory();}} className="flex gap-1 p-2"><input maxLength={100} value={historyTerm} onChange={e=>setHistoryTerm(e.target.value)} placeholder="Buscar no histórico" className="min-w-0 flex-1 border rounded bg-card p-1 text-xs"/><button className={actionClass} disabled={busy}>Buscar</button></form>}
          {outgoingCall&&<div className="flex items-center gap-2 border-b border-border px-3 py-2 text-xs"><BellRing size={14}/><span className="flex-1">Chamando · aguardando resposta</span><button disabled={busy} className="underline" onClick={()=>void respond(outgoingCall,"cancelled")}>Cancelar</button></div>}
          <div ref={historyRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
            {thread.isPending&&<div role="status" className="flex min-h-32 items-center justify-center"><Loader2 size={22} className="animate-spin text-primary"/></div>}
            {thread.isError&&<button className={actionClass} onClick={()=>void thread.refetch()}>Tentar novamente</button>}
            {more&&(thread.data?.length??0)>=pageSize&&<button className={actionClass} disabled={busy} onClick={()=>void loadOlder()}>Mensagens anteriores</button>}
            {results&&<p className="text-xs text-muted-foreground">{results.length} resultados</p>}
            {visibleRows.map(m=><div key={m.id} className={"w-fit max-w-[88%] rounded-lg px-3 py-2 text-sm "+(m.sender_id===uid?"ml-auto bg-primary/10":"bg-muted")}>
              {group&&m.sender_id!==uid&&<p className="text-xs font-semibold text-primary">{name(m.sender_id)}</p>}
              {m.mentions?.includes(uid)&&!m.deleted_at&&<p className="mb-1 text-xs font-semibold text-primary">Mencionou você</p>}
              {m.reply_to&&<p className="mb-1 border-l-2 border-primary pl-2 text-xs text-muted-foreground truncate">{rows.find(x=>x.id===m.reply_to)?.body??"Mensagem anterior"}</p>}
              {m.deleted_at?<p className="italic text-muted-foreground">Mensagem excluída</p>:m.attachment_path?<><button type="button" className="flex items-center gap-2 text-left underline" disabled={busy} onClick={()=>void downloadFile(m)}><Paperclip size={15}/>{m.body}</button>{(m.attachment_mime?.startsWith("image/")||m.attachment_mime?.startsWith("audio/"))&&<button title="Pré-visualizar" className="text-xs underline" onClick={()=>void downloadFile(m,true)}>{m.attachment_mime.startsWith("audio/")?"Ouvir":"Visualizar"}</button>}</>:m.kind==="text"?(shareableRoute.test(m.body)?<button type="button" className="flex items-center gap-2 text-left underline" onClick={()=>navigate(m.body)}><Link2 size={15}/>Abrir {m.body.includes("/orders/")?"ordem de serviço":m.body.includes("/customers/")?"cadastro":"produto"}</button>:<p className="whitespace-pre-wrap break-words">{m.body}</p>):<><p className="font-semibold"><BellRing className="mr-1 inline" size={14}/> {m.response?callLabels[m.response]:"Chamada aguardando resposta"}</p>
                {!m.response&&m.sender_id===uid&&<button disabled={busy} className="mt-1 text-xs underline" onClick={()=>void respond(m,"cancelled")}>Cancelar chamada</button>}
              </>}
              {!m.deleted_at&&m.kind==="text"&&<div className="mt-1 flex gap-2 justify-end"><button title="Responder" onClick={()=>{setEditing(null);setReply(m);}}><Reply size={13}/></button>{m.sender_id===uid&&<>{!m.attachment_path&&<button title="Editar" onClick={()=>{setReply(null);setEditing(m);saveDraft(m.body);}}><Pencil size={13}/></button>}<button title="Excluir" onClick={()=>void editMessage(m,true)}><Trash2 size={13}/></button></>}</div>}
              <p className="mt-1 text-right text-[10px] text-muted-foreground">{m.edited_at&&!m.deleted_at?"Editada · ":""}{new Date(m.created_at).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}{m.sender_id===uid&&!group?(m.read_at?" ✓✓":" ✓"):""}</p>
            </div>)}
          </div>
          {pendingTexts.filter(x=>(x.group??x.peer)===target).map(x=><div key={x.token} className="border-t border-border p-2 text-xs"><span className="text-muted-foreground">{x.body} · Aguardando envio</span><button className="ml-2 underline" onClick={()=>void flushOutbox()}>Tentar novamente</button><button className="ml-2 underline" onClick={()=>{if(!deliveryLock.current)saveOutbox(outboxRef.current.filter(y=>y.token!==x.token));}}>Descartar</button></div>)}
          {(reply||editing)&&<div className="flex items-center justify-between gap-2 border-t border-border p-2 text-xs"><span className="truncate">{editing?"Editando: ":"Respondendo: "}{(editing??reply)?.body}</span><button title="Cancelar" onClick={()=>{if(editing)saveDraft("");setEditing(null);setReply(null);}}><X size={14}/></button></div>}
          {group&&draft.includes("@")&&!draft.endsWith(" ")&&<div className="max-h-20 overflow-auto px-2">{employees.filter(e=>groupParticipants.data?.includes(e.user_id)&&e.full_name.toLowerCase().includes(draft.slice(draft.lastIndexOf("@")+1).toLowerCase())).slice(0,5).map(e=><button key={e.user_id} type="button" className="block text-xs p-1" onClick={()=>saveDraft(draft.slice(0,draft.lastIndexOf("@"))+"@"+e.full_name+" ")}>@{e.full_name}</button>)}</div>}
          {recording&&<div className="flex items-center justify-between border-t border-border p-2 text-xs text-red-500"><span>Gravando áudio · até 2 minutos</span><button className="underline" onClick={()=>{cancelRecording.current=true;recorderRef.current?.stop();}}>Cancelar gravação</button></div>}
          <form onSubmit={e=>{e.preventDefault();void send("text");}} className="flex gap-2 border-t border-border p-3">
            {canAttach&&config.enabled&&config.attachments_enabled&&<><input ref={fileRef} type="file" accept=".jpg,.jpeg,.png,.webp,.gif,.pdf,.txt,.doc,.docx,.xls,.xlsx,.webm,.ogg,.mp4,.mp3,.wav" className="hidden" onChange={e=>{const file=e.target.files?.[0];e.target.value="";if(file)void sendFile(file);}}/><button type="button" title="Adicionar anexo" className={actionClass} disabled={busy||recording} onClick={()=>fileRef.current?.click()}><Paperclip size={16}/></button></>}
            {shareableRoute.test(location.pathname)&&<button type="button" title="Compartilhar registro atual" className={actionClass} disabled={busy} onClick={()=>void send("text",location.pathname)}><Link2 size={16}/></button>}
            {canAttach&&config.enabled&&config.audio_enabled&&config.attachments_enabled&&<button type="button" title={recording?"Parar e enviar áudio":"Gravar áudio"} className={actionClass} onClick={()=>recording?recorderRef.current?.stop():void startRecording()}>{recording?<Square size={15}/>:<Mic size={15}/>}</button>}
            <input maxLength={4000} value={draft} disabled={!config.enabled} onChange={e=>saveDraft(e.target.value)} placeholder="Digite uma mensagem" className="min-w-0 flex-1 rounded-md border border-border bg-card px-2 text-sm"/>
            <button type="submit" disabled={busy||!draft.trim()||!config.enabled||recording} title="Enviar mensagem" className="rounded-md bg-primary p-2 text-white disabled:opacity-50"><Send size={17}/></button>
          </form>
        </>}
        </>}
      </section>}
    </>,document.body)}
  </>;
}
