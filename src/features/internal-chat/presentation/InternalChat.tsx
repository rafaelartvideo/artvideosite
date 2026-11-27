import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, ChevronLeft, MessageSquare, Minus, Send, X, Phone, Link2, Paperclip, Users, Settings2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import { useLocation, useNavigate } from "react-router";
import { CHAT_PBX_PREFILL, CHAT_PBX_STATE, getChatPbxBusy } from "../application/pbx-chat-bridge";
import { adminPath } from "@/features/admin-shell/admin-routes";
type Availability = "available"|"away"|"busy"|"dnd"|"on-call";
const availabilityLabels:Record<Availability,string>={available:"Disponível",away:"Ausente",busy:"Ocupado",dnd:"Não perturbe","on-call":"Em ligação"};
const shareableRoute=/^\/admin\/(orders|customers|inventory|products)\/[a-zA-Z0-9-]+$/;

type Employee = { user_id: string; full_name: string };
type Group = {id:string;name:string;created_by:string;unread:number;last_read_at:string};
type GroupEdit = {id:string|null;name:string;members:string[]};
const allowedFileTypes=new Set(["image/jpeg","image/png","image/webp","image/gif","application/pdf","text/plain","application/msword","application/vnd.openxmlformats-officedocument.wordprocessingml.document","application/vnd.ms-excel","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]);
type ChatRow = { id:string; sender_id:string; recipient_id:string|null; group_id:string|null; attachment_path:string|null; kind:"text"|"call"; body:string; created_at:string; read_at:string|null; response:"coming"|"busy"|"cancelled"|null };
const fields = "id,sender_id,recipient_id,group_id,attachment_path,kind,body,created_at,read_at,response";
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
  return <ChatSession key={activeOrganizationId+":"+user.id} org={activeOrganizationId} uid={user.id} canCall={hasPermission("internal_chat.call")} canPhone={hasPermission("pbx.view")} canCreateGroup={hasPermission("internal_chat.groups.create")} canManageGroup={hasPermission("internal_chat.groups.manage")} canAttach={hasPermission("internal_chat.attachments.send")} />;
}
function ChatSession({org,uid,canCall,canPhone,canCreateGroup,canManageGroup,canAttach}:{org:string;uid:string;canCall:boolean;canPhone:boolean;canCreateGroup:boolean;canManageGroup:boolean;canAttach:boolean}) {
  const qc=useQueryClient();
  const location=useLocation();
  const navigate=useNavigate();
  const key=useMemo(()=>["internal-chat",org,uid] as const,[org,uid]);
  const [open,setOpen]=useState(false);
  const [peer,setPeer]=useState<string|null>(null);
  const [group,setGroup]=useState<string|null>(null);
  const [groupEdit,setGroupEdit]=useState<GroupEdit|null>(null);
  const fileRef=useRef<HTMLInputElement>(null);
  const [search,setSearch]=useState("");
  const [draft,setDraft]=useState("");
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const [older,setOlder]=useState<ChatRow[]>([]);
  const [more,setMore]=useState(true);
  const [anchors,setAnchors]=useState<HTMLElement[]>([]);
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
  const statusColor=(id:string)=>!presence[id]?"bg-muted-foreground":presence[id]==="available"?"bg-green-500":presence[id]==="away"?"bg-amber-500":"bg-red-500";
  const seenCalls=useRef(new Set<string>());
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
  const directory=useQuery({queryKey:[...key,"directory"],enabled:open||!!incoming,queryFn:async()=>{
    const {data,error}=await supabase.rpc("internal_chat_directory_v1",{p_org:org});
    if(error) throw error; return (data??[]) as Employee[];
  },staleTime:300000,retry:false});
  const employees=directory.data??[];
  const name=(id:string)=>employees.find(e=>e.user_id===id)?.full_name??"Funcionário";
  const groups=useQuery({queryKey:[...key,"groups"],queryFn:async()=>{
    const {data,error}=await supabase.rpc("internal_chat_groups_v1",{p_org:org});
    if(error)throw error;return (data??[]) as Group[];
  },retry:false,staleTime:Infinity});
  const currentGroup=groups.data?.find(g=>g.id===group);
  const target=group??peer;
  const totalUnread=(unread.data??0)+(groups.data??[]).reduce((n,g)=>n+Number(g.unread),0);
  const thread=useQuery({queryKey:[...key,"thread",target],enabled:open&&!!target,queryFn:async()=>{
    let query=supabase.from("internal_chat_messages").select(fields).eq("organization_id",org);
    query=group?query.eq("group_id",group):query.is("group_id",null).or(`and(sender_id.eq.${uid},recipient_id.eq.${peer}),and(sender_id.eq.${peer},recipient_id.eq.${uid})`);
    const {data,error}=await query.order("created_at",{ascending:false}).order("id",{ascending:false}).limit(pageSize);
    if(error) throw error; return data as ChatRow[];
  },staleTime:Infinity,retry:false});
  const rows=useMemo(()=>Array.from(new Map([...older,...(thread.data??[])].map(m=>[m.id,m])).values())
    .sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id)),[older,thread.data]);
  const latestId=thread.data?.[0]?.id;
  useEffect(()=>{if(open&&historyRef.current)historyRef.current.scrollTop=historyRef.current.scrollHeight;},[open,target,latestId]);
  useEffect(()=>{
    setAnchors(["internal-chat-desktop","internal-chat-mobile"].map(id=>document.getElementById(id)).filter((v):v is HTMLElement=>!!v));
  },[]);
  useEffect(()=>{
    let timer:ReturnType<typeof setTimeout>|undefined;
    let active=true;
    const invalidate=()=>{
      if(timer)clearTimeout(timer);
      timer=setTimeout(()=>{if(active)void qc.invalidateQueries({queryKey:key,predicate:q=>q.queryKey[3]!=="directory"});},120);
    };
    const channel=supabase.channel("internal-chat:"+org+":"+uid,{config:{private:true}})
      .on("broadcast",{event:"changed"},invalidate)
      .subscribe(status=>{
        if(!active)return;
        setConnected(status==="SUBSCRIBED");
        if(status==="SUBSCRIBED")invalidate();
      });
    const recover=()=>{if(document.visibilityState==="visible")invalidate();};
    document.addEventListener("visibilitychange",recover);
    window.addEventListener("online",invalidate);
    return ()=>{active=false;if(timer)clearTimeout(timer);document.removeEventListener("visibilitychange",recover);
      window.removeEventListener("online",invalidate);void supabase.removeChannel(channel);};
  },[org,uid,qc,key]);
  useEffect(()=>{
    if(!incoming)return;
    if(!seenCalls.current.has(incoming.id)){
      seenCalls.current.add(incoming.id);
      if(sound&&availability!=="dnd"&&!pbxBusy)playNotice();
    }
  },[incoming?.id,sound,availability,pbxBusy]);
  useEffect(()=>{
    if(!open||!peer||document.visibilityState!=="visible")return;
    const ids=(thread.data??[]).filter(m=>m.recipient_id===uid&&!m.read_at).map(m=>m.id);
    if(!ids.length)return;
    void supabase.from("internal_chat_messages").update({read_at:new Date().toISOString()})
      .eq("organization_id",org).eq("recipient_id",uid).is("read_at",null).in("id",ids)
      .then(({error})=>{if(!error)void qc.invalidateQueries({queryKey:[...key,"unread"]});});
  },[open,peer,thread.data,uid,org,qc,key]);
  useEffect(()=>{
    if(!open||!group||!currentGroup||document.visibilityState!=="visible")return;
    const newest=thread.data?.[0];
    if(!newest||newest.created_at<=currentGroup.last_read_at)return;
    void supabase.rpc("internal_chat_group_read_v1",{p_org:org,p_group:group,p_through:newest.created_at})
      .then(({error})=>{if(!error)void qc.invalidateQueries({queryKey:[...key,"groups"]});});
  },[open,group,currentGroup,thread.data,org,qc,key,visibility]);
  function selectPeer(id:string|null){if(busy)return;setGroup(null);setGroupEdit(null);setPeer(id);setOlder([]);setMore(true);setDraft("");setError("");}
  function selectGroup(id:string){if(busy)return;setPeer(null);setGroup(id);setGroupEdit(null);setOlder([]);setMore(true);setDraft("");setError("");}
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
    if(!target||busy||!canAttach)return;
    if(!allowedFileTypes.has(file.type)||file.size>10485760||!file.size){setError("Selecione uma imagem ou documento permitido de até 10 MB.");return;}
    setBusy(true);setError("");
    const path=org+"/"+uid+"/"+crypto.randomUUID();
    let uploaded=false;
    try{
      const {error}=await supabase.storage.from("internal-chat-files").upload(path,file,{upsert:false,contentType:file.type});
      if(error)throw error;uploaded=true;
      const {error:insertError}=await supabase.from("internal_chat_messages").insert({organization_id:org,sender_id:uid,recipient_id:group?null:peer,group_id:group,kind:"text",body:file.name.slice(0,500)||"Arquivo",attachment_path:path});
      if(insertError)throw insertError;
      void qc.invalidateQueries({queryKey:[...key,"thread",target]});
    }catch{if(uploaded)await supabase.storage.from("internal-chat-files").remove([path]);setError("Não foi possível enviar o arquivo.");}
    finally{setBusy(false);}
  }
  async function downloadFile(message:ChatRow){
    if(!message.attachment_path||busy)return;
    setBusy(true);setError("");
    try{
      const {data,error}=await supabase.storage.from("internal-chat-files").download(message.attachment_path);
      if(error||!data)throw error;
      const url=URL.createObjectURL(data);
      const a=document.createElement("a");a.href=url;a.download=message.body;a.click();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
    }catch{setError("Não foi possível baixar o arquivo.");}
    finally{setBusy(false);}
  }
  async function send(kind:"text"|"call",shared?:string){
    if(!target||busy||(kind==="call"&&(!peer||group))||(kind==="text"&&!(shared??draft).trim()))return;
    setBusy(true);setError("");
    try{
      const {error}=await supabase.from("internal_chat_messages").insert({organization_id:org,sender_id:uid,recipient_id:group?null:peer,group_id:group,kind,body:kind==="text"?(shared??draft).trim():""});
      if(error){if(error.code==="23505")throw new Error("Já existe uma chamada aguardando resposta.");throw error;}
      if(kind==="text"&&!shared)setDraft("");
      void qc.invalidateQueries({queryKey:[...key,"thread",target]});
      if(kind==="call")void qc.invalidateQueries({queryKey:[...key,"outgoing"]});
    }catch(e){setError(e instanceof Error?e.message:"Não foi possível enviar. Tente novamente.");}
    finally{setBusy(false);}
  }
  async function dialPeer(){
    if(!peer||busy||!canPhone)return;
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
  const button=<button type="button" title="Chat interno" aria-label="Chat interno" aria-expanded={open}
    onClick={()=>{setOpen(v=>!v);setError("");}}
    className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:text-primary">
    <MessageSquare size={17}/>
    {(totalUnread>0||calls.length>0)&&<span className="absolute right-0 top-0 rounded-full bg-primary px-1 text-[10px] font-bold text-white">{Math.min(99,Math.max(totalUnread,calls.length))}</span>}
  </button>;
  const outgoingCall=outgoing.data?.find(m=>m.recipient_id===peer);
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
          <button className={actionClass} onClick={()=>{selectPeer(incoming.sender_id);setOpen(true);}}>Abrir conversa</button>
        </div>
        {error&&<p role="alert" className="mt-2 text-xs text-red-500">{error}</p>}
      </aside>}
      {open&&<section aria-label="Chat interno" className="fixed bottom-3 right-3 z-[110] flex h-[min(510px,calc(100dvh-100px))] w-[min(370px,calc(100vw-24px))] flex-col overflow-hidden rounded-xl border border-border bg-card text-foreground shadow-xl">
        <header className="flex items-center gap-2 border-b border-border p-3">
          {(target||groupEdit)&&<button title="Voltar" onClick={()=>selectPeer(null)}><ChevronLeft size={18}/></button>}
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{groupEdit?"Grupo":group?currentGroup?.name??"Grupo":peer?name(peer):"Chat interno"}</p>
            <p className="text-[10px] text-muted-foreground">{peer?statusLabel(peer):connected?"Conectado":"Reconectando…"}</p></div>
          {peer&&canCall&&<button className={actionClass} disabled={busy||pendingOut} onClick={()=>void send("call")}><BellRing size={13} className="mr-1 inline"/> {pendingOut?"Chamando":"Chamar"}</button>}
          {currentGroup&&(currentGroup.created_by===uid||canManageGroup)&&!groupEdit&&<button title="Gerenciar grupo" className={actionClass} disabled={busy} onClick={()=>void editGroup()}><Settings2 size={15}/></button>}
          {peer&&canPhone&&<button type="button" className={actionClass} title="Ligar pelo PABX" disabled={busy} onClick={()=>void dialPeer()}><Phone size={15}/></button>}
          <button title="Minimizar" onClick={()=>setOpen(false)}><Minus size={16}/></button>
          <button title="Fechar" onClick={()=>{setOpen(false);selectPeer(null);}}><X size={16}/></button>
        </header>
        {error&&<p role="alert" className="px-3 py-2 text-xs text-red-500">{error}</p>}
        {groupEdit?<div className="min-h-0 flex-1 overflow-y-auto p-3 space-y-2">
          <input maxLength={100} value={groupEdit.name} onChange={e=>setGroupEdit({...groupEdit,name:e.target.value})} placeholder="Nome do grupo" className="w-full rounded-md border border-border bg-card p-2 text-sm"/>
          <p className="text-xs text-muted-foreground">Participantes · até 50 funcionários, incluindo você</p>
          {employees.map(e=><label key={e.user_id} className="flex gap-2 items-center text-sm"><input type="checkbox" checked={groupEdit.members.includes(e.user_id)} onChange={event=>setGroupEdit({...groupEdit,members:event.target.checked?[...groupEdit.members,e.user_id]:groupEdit.members.filter(id=>id!==e.user_id)})}/>{e.full_name}</label>)}
          <button disabled={busy||!groupEdit.name.trim()||!groupEdit.members.length} className={actionClass} onClick={()=>void saveGroup()}>Salvar grupo</button>
        </div>:!target?<div className="min-h-0 flex-1 overflow-y-auto p-3">
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar funcionário" className="mb-2 w-full rounded-md border border-border bg-card p-2 text-sm"/>
          <label className="mb-2 flex items-center gap-2 text-xs text-muted-foreground">Disponibilidade<select value={availability} onChange={e=>setAvailability(e.target.value as Availability)} className="rounded-md border border-border bg-card p-1 text-foreground">{(["available","away","busy","dnd"] as Availability[]).map(v=><option key={v} value={v}>{availabilityLabels[v]}</option>)}</select></label>
          <label className="mb-2 flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={sound} onChange={e=>setSound(e.target.checked)}/> Som de chamada</label>
          {directory.isPending&&<p className="text-xs text-muted-foreground">Carregando funcionários…</p>}
          {directory.isError&&<button className={actionClass} onClick={()=>void directory.refetch()}>Tentar carregar novamente</button>}
          {(groups.data??[]).length>0&&<p className="mb-1 text-xs font-semibold text-muted-foreground">Grupos</p>}
          {(groups.data??[]).filter(g=>g.name.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR"))).map(g=><button key={g.id} type="button" onClick={()=>selectGroup(g.id)} className="flex w-full items-center gap-2 rounded-md p-2 text-left text-sm hover:bg-muted"><Users size={17}/><span className="flex-1 truncate">{g.name}</span>{Number(g.unread)>0&&<span className="rounded-full bg-primary px-1 text-xs text-white">{g.unread}</span>}</button>)}
          {canCreateGroup&&<button className={actionClass+" mb-2"} onClick={()=>setGroupEdit({id:null,name:"",members:[]})}>Novo grupo</button>}
          <p className="mb-1 text-xs font-semibold text-muted-foreground">Funcionários</p>
          {employees.filter(e=>e.full_name.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR"))).map(e=><button type="button" key={e.user_id} onClick={()=>selectPeer(e.user_id)} className="flex w-full items-center gap-3 rounded-md p-2 text-left text-sm hover:bg-muted"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted font-bold">{e.full_name[0]}</span><span className="min-w-0 flex-1"><span className="block truncate">{e.full_name}</span><span className="flex items-center gap-1 text-xs text-muted-foreground"><span className={"h-2 w-2 rounded-full "+statusColor(e.user_id)}/>{statusLabel(e.user_id)}</span></span></button>)}
        </div>:<>
          {outgoingCall&&<div className="flex items-center gap-2 border-b border-border px-3 py-2 text-xs"><BellRing size={14}/><span className="flex-1">Chamando · aguardando resposta</span><button disabled={busy} className="underline" onClick={()=>void respond(outgoingCall,"cancelled")}>Cancelar</button></div>}
          <div ref={historyRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
            {thread.isPending&&<p className="text-xs text-muted-foreground">Carregando conversa…</p>}
            {thread.isError&&<button className={actionClass} onClick={()=>void thread.refetch()}>Tentar novamente</button>}
            {more&&(thread.data?.length??0)>=pageSize&&<button className={actionClass} disabled={busy} onClick={()=>void loadOlder()}>Mensagens anteriores</button>}
            {rows.map(m=><div key={m.id} className={"w-fit max-w-[88%] rounded-lg px-3 py-2 text-sm "+(m.sender_id===uid?"ml-auto bg-primary/10":"bg-muted")}>
              {group&&m.sender_id!==uid&&<p className="text-xs font-semibold text-primary">{name(m.sender_id)}</p>}
              {m.attachment_path?<button type="button" className="flex items-center gap-2 text-left underline" disabled={busy} onClick={()=>void downloadFile(m)}><Paperclip size={15}/>{m.body}</button>:m.kind==="text"?(shareableRoute.test(m.body)?<button type="button" className="flex items-center gap-2 text-left underline" onClick={()=>navigate(m.body)}><Link2 size={15}/>Abrir {m.body.includes("/orders/")?"ordem de serviço":m.body.includes("/customers/")?"cadastro":"produto"}</button>:<p className="whitespace-pre-wrap break-words">{m.body}</p>):<><p className="font-semibold"><BellRing className="mr-1 inline" size={14}/> {m.response?callLabels[m.response]:"Chamada aguardando resposta"}</p>
                {!m.response&&m.sender_id===uid&&<button disabled={busy} className="mt-1 text-xs underline" onClick={()=>void respond(m,"cancelled")}>Cancelar chamada</button>}
              </>}
              <p className="mt-1 text-right text-[10px] text-muted-foreground">{new Date(m.created_at).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}{m.sender_id===uid?(m.read_at?" ✓✓":" ✓"):""}</p>
            </div>)}
          </div>
          <form onSubmit={e=>{e.preventDefault();void send("text");}} className="flex gap-2 border-t border-border p-3">
            {canAttach&&<><input ref={fileRef} type="file" accept=".jpg,.jpeg,.png,.webp,.gif,.pdf,.txt,.doc,.docx,.xls,.xlsx" className="hidden" onChange={e=>{const file=e.target.files?.[0];e.target.value="";if(file)void sendFile(file);}}/><button type="button" title="Adicionar anexo" className={actionClass} disabled={busy} onClick={()=>fileRef.current?.click()}><Paperclip size={16}/></button></>}
            {shareableRoute.test(location.pathname)&&<button type="button" title="Compartilhar registro atual" className={actionClass} disabled={busy} onClick={()=>void send("text",location.pathname)}><Link2 size={16}/></button>}
            <input maxLength={4000} value={draft} onChange={e=>setDraft(e.target.value)} placeholder="Digite uma mensagem" className="min-w-0 flex-1 rounded-md border border-border bg-card px-2 text-sm"/>
            <button type="submit" disabled={busy||!draft.trim()} title="Enviar mensagem" className="rounded-md bg-primary p-2 text-white disabled:opacity-50"><Send size={17}/></button>
          </form>
        </>}
      </section>}
    </>,document.body)}
  </>;
}
