import { createContext, lazy, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import {
  listUnionWhatsAppConversationCounts, listUnionWhatsAppConversations, operateUnionWhatsAppInbox,
  type UnionWhatsAppConversation, type UnionWhatsAppConversationCounts,
} from "../infrastructure/union-whatsapp-inbox.repository";
import { UnionWhatsAppFloatingPanel, type FloatingWhatsAppAlert } from "./UnionWhatsAppFloatingPanel";

const ConversationModal=lazy(()=>import("./WhatsAppConversationModal")
  .then(({WhatsAppConversationModal})=>({default:WhatsAppConversationModal})));

export type WhatsAppActivityEvent={
  kind:"message"|"conversation";
  eventType:string;
  row:Record<string,unknown>;
};
type WhatsAppActivityContextValue={
  isPageOpen:boolean;
  channelReady:boolean|null;
  channelId:string|null;
  channelPhone:string|null;
  capabilities:Record<string,boolean>;
  subscribe:(listener:(event:WhatsAppActivityEvent)=>void)=>()=>void;
};
const ActivityContext=createContext<WhatsAppActivityContextValue|null>(null);
export const useWhatsAppActivity=()=>useContext(ActivityContext);
const zeroCounts:UnionWhatsAppConversationCounts={
  waiting:0,in_att:0,forwarded:0,finished:0,total:0,unread:0,
};
const recentFirst=(a:UnionWhatsAppConversation,b:UnionWhatsAppConversation)=>
  (Date.parse(b.last_message_at||"")||0)-(Date.parse(a.last_message_at||"")||0)
  || b.id.localeCompare(a.id);
const mediaLabel=(kind:unknown)=>({
  image:"Imagem",video:"Vídeo",audio:"Áudio",file:"Documento",sticker:"Figurinha",
  location:"Localização",contact:"Contato",
} as Record<string,string>)[String(kind||"")]||"Nova mensagem";

type Filter="in_att"|"waiting";
type MiniList={items:UnionWhatsAppConversation[];fetchedAt:number;loading:boolean;loaded:boolean};
const emptyLists=():Record<Filter,MiniList>=>({
  in_att:{items:[],fetchedAt:0,loading:false,loaded:false},
  waiting:{items:[],fetchedAt:0,loading:false,loaded:false},
});
const MINI_LIST_TTL=45_000;
const MINI_LIST_EVENT_THROTTLE=6_000;
type Incoming={messageId:string;preview:string;receivedAt:number};
type Account={organizationId:string;channelId:string;phone:string;capabilities:Record<string,boolean>};

/**
 * Um único canal Realtime por sessão/empresa, fora das rotas do CRM.
 * Não carrega histórico, avatar, mídia ou protocolo enquanto recolhido.
 * O inbox e os modais compartilham o mesmo stream; sem outro websocket.
 */
export function UnionWhatsAppActivityProvider({
  enabled,isPageOpen,onOpenFull,children,
}:{
  enabled:boolean;
  isPageOpen:boolean;
  onOpenFull:()=>void;
  children:ReactNode;
}){
  const {activeOrganizationId,user}=useAuth();
  const organizationId=activeOrganizationId||"";
  const userId=user?.id||"";
  const [channelReady,setChannelReady]=useState<boolean|null>(null);
  const [account,setAccount]=useState<Account|null>(null);
  const activeAccount=account?.organizationId===organizationId?account:null;
  const channelId=activeAccount?.channelId||null;
  const channelPhone=activeAccount?.phone||null;
  const capabilities=activeAccount?.capabilities||null;
  const [counts,setCounts]=useState<UnionWhatsAppConversationCounts>(zeroCounts);
  const [expanded,setExpanded]=useState(false);
  const [filter,setFilter]=useState<Filter>("in_att");
  const [lists,setLists]=useState<Record<Filter,MiniList>>(emptyLists);
  const listsRef=useRef(lists);
  listsRef.current=lists;
  const rows=lists[filter].items;
  const rowsLoading=lists[filter].loading;
  const rowsLoaded=lists[filter].loaded;
  const [avatars,setAvatars]=useState<Record<string,string|null>>({});
  const avatarRequestsRef=useRef(new Set<string>());
  const avatarCheckedAtRef=useRef(new Map<string,number>());
  const [alert,setAlert]=useState<FloatingWhatsAppAlert|null>(null);
  const [conversationId,setConversationId]=useState<string|null>(null);

  const disposedRef=useRef(false);
  const checkingRef=useRef(false);
  const lastChannelCheckRef=useRef(0);
  const channelSeqRef=useRef(0);
  const accountKey=channelId&&channelPhone?organizationId+":"+channelId+":"+channelPhone:"";
  const currentAccountRef=useRef(accountKey);
  currentAccountRef.current=accountKey;
  const pageOpenRef=useRef(isPageOpen);
  pageOpenRef.current=isPageOpen;
  const conversationOpenRef=useRef(Boolean(conversationId));
  conversationOpenRef.current=Boolean(conversationId);
  const expandedRef=useRef(expanded);
  expandedRef.current=expanded;
  const filterRef=useRef(filter);
  filterRef.current=filter;
  const rowsRef=useRef(rows);
  rowsRef.current=rows;
  const capabilitiesRef=useRef(capabilities);
  capabilitiesRef.current=capabilities;
  const listenersRef=useRef(new Set<(event:WhatsAppActivityEvent)=>void>());
  const pendingIncomingRef=useRef(new Map<string,Incoming>());
  const recentConversationRef=useRef(new Map<string,UnionWhatsAppConversation>());
  const notifiedRef=useRef(new Set<string>());
  const reconcileTimerRef=useRef<ReturnType<typeof setTimeout>|null>(null);
  const countsInFlightRef=useRef(false);
  const lastCountsRef=useRef(0);
  const countsRetryAfterRef=useRef(0);
  const listGenerationRef=useRef(0);
  const listRequestsRef=useRef<Record<Filter,{running:boolean;retryAfter:number}>>({
    in_att:{running:false,retryAfter:0},waiting:{running:false,retryAfter:0},
  });

  useEffect(()=>{
    // Compatível com a montagem dupla do React StrictMode.
    disposedRef.current=false;
    return ()=>{
      disposedRef.current=true;
    if(reconcileTimerRef.current!==null)clearTimeout(reconcileTimerRef.current);
      listenersRef.current.clear();
    };
  },[]);

  const subscribe=useCallback((listener:(event:WhatsAppActivityEvent)=>void)=>{
    listenersRef.current.add(listener);
    return ()=>{listenersRef.current.delete(listener);};
  },[]);

  const checkChannel=useCallback(async(force=false)=>{
    if(!enabled||!organizationId||!userId||disposedRef.current)return;
    const now=Date.now();
    if(checkingRef.current||(!force&&now-lastChannelCheckRef.current<90_000))return;
    checkingRef.current=true;
    lastChannelCheckRef.current=now;
    const sequence=++channelSeqRef.current;
    try{
      const response=await operateUnionWhatsAppInbox(organizationId,crypto.randomUUID(),"channel_status");
      if(disposedRef.current||sequence!==channelSeqRef.current)return;
      const ready=Boolean(response.channel_connected&&response.channel_id&&response.channel_phone);
      setChannelReady(ready);
      setAccount(ready?{
        organizationId,channelId:response.channel_id!,phone:response.channel_phone!,
        capabilities:response.capabilities||{},
      }:null);
    }catch{
      if(disposedRef.current||sequence!==channelSeqRef.current)return;
      // Falhas recebem backoff. Não insistir em cada navegação ou evento.
      setChannelReady(false);
      setAccount(null);
    }finally{
      if(sequence===channelSeqRef.current)checkingRef.current=false;
    }
  },[enabled,organizationId,userId]);

  useEffect(()=>{
    channelSeqRef.current+=1;
    checkingRef.current=false;
    lastChannelCheckRef.current=0;
    countsInFlightRef.current=false;
    lastCountsRef.current=0;
    countsRetryAfterRef.current=0;
    listGenerationRef.current+=1;
    listRequestsRef.current={
      in_att:{running:false,retryAfter:0},waiting:{running:false,retryAfter:0},
    };
    pendingIncomingRef.current.clear();
    recentConversationRef.current.clear();
    notifiedRef.current.clear();
    setChannelReady(null);
    setAccount(null);
    setCounts(zeroCounts);
    setLists(emptyLists());
    setAvatars({});
    avatarCheckedAtRef.current.clear();
    avatarRequestsRef.current.clear();
    setAlert(null);
    setConversationId(null);
    setExpanded(false);
    if(enabled)void checkChannel(true);
    return()=>{channelSeqRef.current+=1;};
  },[enabled,checkChannel]);

  const refreshCounts=useCallback(async(force=false)=>{
    if(!enabled||!organizationId||!channelId||!channelPhone||disposedRef.current)return;
    const now=Date.now();
    if(countsInFlightRef.current||now<countsRetryAfterRef.current||
      (!force&&now-lastCountsRef.current<8_000))return;
    countsInFlightRef.current=true;
    lastCountsRef.current=now;
    const scope=accountKey;
    try{
      const result=await listUnionWhatsAppConversationCounts(organizationId,channelId,channelPhone);
      if(!disposedRef.current&&currentAccountRef.current===scope)setCounts(result);
      countsRetryAfterRef.current=0;
    }catch{
      countsRetryAfterRef.current=Date.now()+30_000;
    }finally{countsInFlightRef.current=false;}
  },[enabled,organizationId,channelId,channelPhone,accountKey]);

  const refreshLists=useCallback(async(targets:Filter[],urgent=false)=>{
    if(!enabled||!organizationId||!channelId||!channelPhone||
      !expandedRef.current||pageOpenRef.current||disposedRef.current)return;
    const scope=accountKey,gen=listGenerationRef.current;
    // Precarregar ambas as abas; 45s de cache e 6s de mínimo entre eventos.
    await Promise.all(targets.map(async tab=>{
      const request=listRequestsRef.current[tab],snapshot=listsRef.current[tab];
      const now=Date.now();
      if(request.running||now<request.retryAfter||
        (snapshot.loaded&&now-snapshot.fetchedAt<(urgent?MINI_LIST_EVENT_THROTTLE:MINI_LIST_TTL)))return;
      request.running=true;
      setLists(prev=>({...prev,[tab]:{...prev[tab],loading:true}}));
      try{
        const response=await listUnionWhatsAppConversations(organizationId,channelId,channelPhone,{
          filter:tab,department:"all",search:"",page:0,pageSize:8,sortByRecent:true,
          viewerId:userId,canViewAll:capabilities?.view_all===true,
        });
        if(disposedRef.current||scope!==currentAccountRef.current||
          gen!==listGenerationRef.current)return;
        const sorted=[...response.items].sort(recentFirst);
        setLists(prev=>({...prev,[tab]:{
          items:sorted,fetchedAt:Date.now(),loaded:true,loading:false,
        }}));
        sorted.forEach(row=>recentConversationRef.current.set(row.id,row));
      }catch{
        if(scope===currentAccountRef.current&&gen===listGenerationRef.current){
          request.retryAfter=Date.now()+25_000;
          setLists(prev=>({...prev,[tab]:{...prev[tab],loading:false}}));
        }
      }finally{request.running=false;}
    }));
  },[enabled,organizationId,channelId,channelPhone,accountKey,userId,capabilities]);

  const countsFnRef=useRef(refreshCounts);
  countsFnRef.current=refreshCounts;
  const listsFnRef=useRef(refreshLists);
  listsFnRef.current=refreshLists;
  const scheduleReconcile=useCallback(()=>{
    if(document.visibilityState!=="visible"||reconcileTimerRef.current!==null)return;
    reconcileTimerRef.current=setTimeout(()=>{
      reconcileTimerRef.current=null;
      // O inbox completo já reconcilia a própria lista: não duplicar sua RPC.
      if(pageOpenRef.current||conversationOpenRef.current)return;
      void countsFnRef.current();
      if(expandedRef.current)void listsFnRef.current(["in_att","waiting"],true);
    },1_200);
  },[]);

  useEffect(()=>{
    if(!channelId||!channelPhone||!enabled)return;
    void refreshCounts(true);
  },[channelId,channelPhone,enabled,refreshCounts]);

  useEffect(()=>{
    if(expanded&&!isPageOpen)void refreshLists(["in_att","waiting"]);
  },[expanded,isPageOpen,refreshLists]);

  useEffect(()=>{
    if(isPageOpen){
      setExpanded(false);
      setAlert(null);
      return;
    }
    // Ao voltar dos módulos, retomar os indicadores com uma única consulta.
    if(channelId&&channelPhone)void refreshCounts(true);
  },[isPageOpen,channelId,channelPhone,refreshCounts]);

  useEffect(()=>{
    if(!alert)return;
    const timer=setTimeout(()=>setAlert(current=>current?.messageId===alert.messageId?null:current),7_000);
    return()=>clearTimeout(timer);
  },[alert]);

  // Mensagens só geram avisos após confirmação da conversa no mesmo canal.
  // Não notificamos um operador sobre atendimento de outro, salvo view_all.
  const notifyFor=useCallback((row:UnionWhatsAppConversation,incoming:Incoming)=>{
    if(pageOpenRef.current||expandedRef.current||document.visibilityState!=="visible"||
       Date.now()-incoming.receivedAt>20_000||notifiedRef.current.has(incoming.messageId))return;
    const activeParticipant=rowsRef.current.some(item=>item.id===row.id&&item.viewer_participating);
    const allowed=row.status==="waiting"||row.assigned_to===userId||
      activeParticipant||(capabilitiesRef.current?.view_all===true&&row.status==="in_att");
    if(!allowed)return;
    notifiedRef.current.add(incoming.messageId);
    if(notifiedRef.current.size>150)notifiedRef.current.clear();
    setAlert({id:row.id,messageId:incoming.messageId,
      name:row.contact_name||row.contact_phone||"Cliente",preview:incoming.preview});
    pendingIncomingRef.current.delete(row.id);
  },[userId]);

  useEffect(()=>{
    if(!enabled||!organizationId||!channelId||!channelPhone||!userId)return;
    const scope=accountKey;
    const validRow=(row:Record<string,unknown>)=>
      row.organization_id===organizationId&&row.channel_id===channelId&&
      row.account_phone===channelPhone;
    const deliver=(kind:WhatsAppActivityEvent["kind"])=>(
      payload:{eventType?:string;new?:Record<string,unknown>;old?:Record<string,unknown>}
    )=>{
      const row=payload.new||payload.old||{};
      if(!validRow(row)||disposedRef.current||currentAccountRef.current!==scope)return;
      const eventType=String(payload.eventType||"UPDATE");
      const event={kind,eventType,row};
      listenersRef.current.forEach(listener=>listener(event));
      scheduleReconcile();
      if(kind==="message"&&eventType==="INSERT"&&row.direction==="incoming"){
        const id=String(row.conversation_id||""),messageId=String(row.provider_message_id||row.id||"");
        const sentAt=Date.parse(String(row.sent_at||""));
        if(!id||!messageId||!Number.isFinite(sentAt)||Date.now()-sentAt>120_000)return;
        const incoming={messageId,receivedAt:Date.now(),
          preview:String(row.body_text||"").trim().slice(0,130)||mediaLabel(row.message_type)};
        pendingIncomingRef.current.set(id,incoming);
        if(pendingIncomingRef.current.size>40)
          pendingIncomingRef.current.delete(pendingIncomingRef.current.keys().next().value||"");
        const known=recentConversationRef.current.get(id);
        if(known)notifyFor(known,incoming);
      }else if(kind==="conversation"&&row.id&&eventType!=="DELETE"){
        const record=row as unknown as UnionWhatsAppConversation;
        const previous=recentConversationRef.current.get(record.id);
        recentConversationRef.current.set(record.id,previous?{...previous,...record}:record);
        if(recentConversationRef.current.size>100)
          recentConversationRef.current.delete(recentConversationRef.current.keys().next().value||"");
        const incoming=pendingIncomingRef.current.get(record.id);
        if(incoming)notifyFor(record,incoming);
        if(expandedRef.current&&rowsRef.current.some(item=>item.id===record.id)){
          setRows(current=>{
            const merged=current.map(item=>item.id===record.id?{...item,...record}:item);
            return filterRef.current==="in_att"?merged.sort(recentFirst):merged;
          });
        }
      }
    };
    const realtime=supabase.channel("union-whatsapp-activity:"+organizationId+":"+channelId)
      .on("postgres_changes",{event:"*",schema:"public",table:"union_whatsapp_conversations",
        filter:"account_phone=eq."+channelPhone},deliver("conversation"))
      .on("postgres_changes",{event:"*",schema:"public",table:"union_whatsapp_messages",
        filter:"account_phone=eq."+channelPhone},deliver("message"))
      .subscribe(status=>{
        if(status==="SUBSCRIBED")scheduleReconcile();
      });
    return()=>{
      if(reconcileTimerRef.current!==null){
        clearTimeout(reconcileTimerRef.current);
        reconcileTimerRef.current=null;
      }
      void supabase.removeChannel(realtime);
    };
  },[enabled,organizationId,channelId,channelPhone,userId,accountKey,notifyFor,scheduleReconcile]);

  useEffect(()=>{
    if(!enabled)return;
    let lastResume=0;
    const resume=()=>{
      if(document.visibilityState!=="visible"||Date.now()-lastResume<30_000)return;
      lastResume=Date.now();
      void checkChannel();
      // Sem polling de 30s. Reconciliar só ao retornar à aba.
      if(!pageOpenRef.current&&!conversationOpenRef.current){
        if(Date.now()-lastCountsRef.current>120_000)void countsFnRef.current(true);
        if(expandedRef.current)void listsFnRef.current(["in_att","waiting"],true);
      }
    };
    window.addEventListener("focus",resume);
    document.addEventListener("visibilitychange",resume);
    return()=>{window.removeEventListener("focus",resume);
      document.removeEventListener("visibilitychange",resume);};
  },[enabled,checkChannel]);

  const contextValue=useMemo<WhatsAppActivityContextValue>(()=>({
    isPageOpen,channelReady,channelId,channelPhone,capabilities:capabilities||{},subscribe,
  }),[isPageOpen,channelReady,channelId,channelPhone,capabilities,subscribe]);

  const selectConversation=(id:string)=>{
    setAlert(null);
    setConversationId(id);
  };
  return <ActivityContext.Provider value={enabled?contextValue:null}>
    {children}
    {enabled&&channelReady===true&&channelId&&channelPhone&&!isPageOpen&&
      <UnionWhatsAppFloatingPanel
        expanded={expanded} onToggle={()=>setExpanded(value=>!value)}
        counts={counts} filter={filter} onFilter={setFilter}
        rows={rows} loading={rowsLoading} onSelect={selectConversation}
        onOpenFull={onOpenFull} alert={alert} onDismissAlert={()=>setAlert(null)}
      />}
    {enabled&&conversationId&&activeOrganizationId&&
      <Suspense fallback={null}>
        <ConversationModal
          key={conversationId}
          open onClose={()=>{
            setConversationId(null);
            void refreshCounts(true);
            if(expandedRef.current)void listsFnRef.current(["in_att","waiting"],true);
          }}
          context={{organizationId:activeOrganizationId,
            source:{kind:"conversation",conversationId}}}
        />
      </Suspense>}
  </ActivityContext.Provider>;
}
