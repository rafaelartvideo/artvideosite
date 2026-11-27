import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { BellRing, ChevronLeft, MessageSquare, Minus, Send, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

type Employee = { user_id: string; full_name: string };
type ChatRow = { id:string; sender_id:string; recipient_id:string; kind:"text"|"call"; body:string; created_at:string; read_at:string|null; response:"coming"|"busy"|"cancelled"|null };
const fields = "id,sender_id,recipient_id,kind,body,created_at,read_at,response";
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
  return <ChatSession key={activeOrganizationId+":"+user.id} org={activeOrganizationId} uid={user.id} canCall={hasPermission("internal_chat.call")} />;
}
function ChatSession({org,uid,canCall}:{org:string;uid:string;canCall:boolean}) {
  const qc=useQueryClient();
  const key=useMemo(()=>["internal-chat",org,uid] as const,[org,uid]);
  const [open,setOpen]=useState(false);
  const [peer,setPeer]=useState<string|null>(null);
  const [search,setSearch]=useState("");
  const [draft,setDraft]=useState("");
  const [error,setError]=useState("");
  const [busy,setBusy]=useState(false);
  const [older,setOlder]=useState<ChatRow[]>([]);
  const [more,setMore]=useState(true);
  const [anchors,setAnchors]=useState<HTMLElement[]>([]);
  const [sound,setSound]=useState(true);
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
  const thread=useQuery({queryKey:[...key,"thread",peer],enabled:open&&!!peer,queryFn:async()=>{
    const {data,error}=await supabase.from("internal_chat_messages").select(fields).eq("organization_id",org)
      .or(`and(sender_id.eq.${uid},recipient_id.eq.${peer}),and(sender_id.eq.${peer},recipient_id.eq.${uid})`)
      .order("created_at",{ascending:false}).order("id",{ascending:false}).limit(pageSize);
    if(error) throw error; return data as ChatRow[];
  },staleTime:Infinity,retry:false});
  const rows=useMemo(()=>Array.from(new Map([...older,...(thread.data??[])].map(m=>[m.id,m])).values())
    .sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id)),[older,thread.data]);
  const latestId=thread.data?.[0]?.id;
  useEffect(()=>{if(open&&historyRef.current)historyRef.current.scrollTop=historyRef.current.scrollHeight;},[open,peer,latestId]);
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
      if(sound)playNotice();
    }
  },[incoming?.id,sound]);
  useEffect(()=>{
    if(!open||!peer||document.visibilityState!=="visible")return;
    const ids=(thread.data??[]).filter(m=>m.recipient_id===uid&&!m.read_at).map(m=>m.id);
    if(!ids.length)return;
    void supabase.from("internal_chat_messages").update({read_at:new Date().toISOString()})
      .eq("organization_id",org).eq("recipient_id",uid).is("read_at",null).in("id",ids)
      .then(({error})=>{if(!error)void qc.invalidateQueries({queryKey:[...key,"unread"]});});
  },[open,peer,thread.data,uid,org,qc,key]);
  function selectPeer(id:string|null){if(busy)return;setPeer(id);setOlder([]);setMore(true);setDraft("");setError("");}
  async function send(kind:"text"|"call"){
    if(!peer||busy||(kind==="text"&&!draft.trim()))return;
    setBusy(true);setError("");
    try{
      const {error}=await supabase.from("internal_chat_messages").insert({organization_id:org,sender_id:uid,recipient_id:peer,kind,body:kind==="text"?draft.trim():""});
      if(error){if(error.code==="23505")throw new Error("Já existe uma chamada aguardando resposta.");throw error;}
      if(kind==="text")setDraft("");
      void qc.invalidateQueries({queryKey:[...key,"thread",peer]});
      if(kind==="call")void qc.invalidateQueries({queryKey:[...key,"outgoing"]});
    }catch(e){setError(e instanceof Error?e.message:"Não foi possível enviar. Tente novamente.");}
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
    if(!peer||busy||!rows.length)return;
    const first=rows[0];setBusy(true);
    try{
      const {data,error}=await supabase.from("internal_chat_messages").select(fields).eq("organization_id",org)
        .or(`and(or(and(sender_id.eq.${uid},recipient_id.eq.${peer}),and(sender_id.eq.${peer},recipient_id.eq.${uid})),or(created_at.lt.${first.created_at},and(created_at.eq.${first.created_at},id.lt.${first.id})))`)
        .order("created_at",{ascending:false}).order("id",{ascending:false}).limit(pageSize);
      if(error)throw error;
      setOlder(previous=>[...previous,...(data as ChatRow[])]);setMore((data?.length??0)===pageSize);
    }catch{setError("Não foi possível carregar mensagens anteriores.");}
    finally{setBusy(false);}
  }
  const button=<button type="button" title="Chat interno" aria-label="Chat interno" aria-expanded={open}
    onClick={()=>{setOpen(v=>!v);setError("");}}
    className="relative inline-flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:text-primary">
    <MessageSquare size={17}/>
    {((unread.data??0)>0||calls.length>0)&&<span className="absolute right-0 top-0 rounded-full bg-primary px-1 text-[10px] font-bold text-white">{Math.min(99,Math.max(unread.data??0,calls.length))}</span>}
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
          {peer&&<button title="Voltar" onClick={()=>selectPeer(null)}><ChevronLeft size={18}/></button>}
          <div className="min-w-0 flex-1"><p className="truncate text-sm font-bold">{peer?name(peer):"Chat interno"}</p>
            <p className="text-[10px] text-muted-foreground">{connected?"Conectado":"Reconectando…"}</p></div>
          {peer&&canCall&&<button className={actionClass} disabled={busy||pendingOut} onClick={()=>void send("call")}><BellRing size={13} className="mr-1 inline"/> {pendingOut?"Chamando":"Chamar"}</button>}
          <button title="Minimizar" onClick={()=>setOpen(false)}><Minus size={16}/></button>
          <button title="Fechar" onClick={()=>{setOpen(false);selectPeer(null);}}><X size={16}/></button>
        </header>
        {error&&<p role="alert" className="px-3 py-2 text-xs text-red-500">{error}</p>}
        {!peer?<div className="min-h-0 flex-1 overflow-y-auto p-3">
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar funcionário" className="mb-2 w-full rounded-md border border-border bg-card p-2 text-sm"/>
          <label className="mb-2 flex items-center gap-2 text-xs text-muted-foreground"><input type="checkbox" checked={sound} onChange={e=>setSound(e.target.checked)}/> Som de chamada</label>
          {directory.isPending&&<p className="text-xs text-muted-foreground">Carregando funcionários…</p>}
          {directory.isError&&<button className={actionClass} onClick={()=>void directory.refetch()}>Tentar carregar novamente</button>}
          {employees.filter(e=>e.full_name.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR"))).map(e=><button type="button" key={e.user_id} onClick={()=>selectPeer(e.user_id)} className="flex w-full items-center gap-3 rounded-md p-2 text-left text-sm hover:bg-muted"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted font-bold">{e.full_name[0]}</span><span className="truncate">{e.full_name}</span></button>)}
        </div>:<>
          {outgoingCall&&<div className="flex items-center gap-2 border-b border-border px-3 py-2 text-xs"><BellRing size={14}/><span className="flex-1">Chamando · aguardando resposta</span><button disabled={busy} className="underline" onClick={()=>void respond(outgoingCall,"cancelled")}>Cancelar</button></div>}
          <div ref={historyRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
            {thread.isPending&&<p className="text-xs text-muted-foreground">Carregando conversa…</p>}
            {thread.isError&&<button className={actionClass} onClick={()=>void thread.refetch()}>Tentar novamente</button>}
            {more&&(thread.data?.length??0)>=pageSize&&<button className={actionClass} disabled={busy} onClick={()=>void loadOlder()}>Mensagens anteriores</button>}
            {rows.map(m=><div key={m.id} className={"w-fit max-w-[88%] rounded-lg px-3 py-2 text-sm "+(m.sender_id===uid?"ml-auto bg-primary/10":"bg-muted")}>
              {m.kind==="text"?<p className="whitespace-pre-wrap break-words">{m.body}</p>:<><p className="font-semibold"><BellRing className="mr-1 inline" size={14}/> {m.response?callLabels[m.response]:"Chamada aguardando resposta"}</p>
                {!m.response&&m.sender_id===uid&&<button disabled={busy} className="mt-1 text-xs underline" onClick={()=>void respond(m,"cancelled")}>Cancelar chamada</button>}
              </>}
              <p className="mt-1 text-right text-[10px] text-muted-foreground">{new Date(m.created_at).toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}{m.sender_id===uid?(m.read_at?" ✓✓":" ✓"):""}</p>
            </div>)}
          </div>
          <form onSubmit={e=>{e.preventDefault();void send("text");}} className="flex gap-2 border-t border-border p-3">
            <input maxLength={4000} value={draft} onChange={e=>setDraft(e.target.value)} placeholder="Digite uma mensagem" className="min-w-0 flex-1 rounded-md border border-border bg-card px-2 text-sm"/>
            <button type="submit" disabled={busy||!draft.trim()} title="Enviar mensagem" className="rounded-md bg-primary p-2 text-white disabled:opacity-50"><Send size={17}/></button>
          </form>
        </>}
      </section>}
    </>,document.body)}
  </>;
}
