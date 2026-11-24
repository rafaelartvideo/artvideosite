import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, LoaderCircle, MessageCircle } from "lucide-react";
import {
  listUnionWhatsAppProtocols, listContactOnlyHistoricalProtocols, listUnionWhatsAppMessages, listContactOnlyHistoricalMessages,
  unionWhatsAppProtocolLabel, PROTOCOL_PAGE_SIZE,
  type UnionWhatsAppConversation, type UnionWhatsAppProtocol, type UnionWhatsAppMessage, type UnionWhatsAppMessageCursor,
} from "../infrastructure/union-whatsapp-inbox.repository";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { HistoricalMessageBody } from "./HistoricalMessageBody";

const LiveMessageBody=lazy(()=>import("./UnionWhatsAppInboxPage").then(m=>({default:m.MessageBody})));
const statusName=(status:UnionWhatsAppProtocol["status"])=>({
  waiting:"Aguardando",in_att:"Em atendimento",finished:"Finalizado",abandoned:"Cancelado",
})[status]||status;
export function ProtocolStatus({item}:{item:UnionWhatsAppProtocol}){
  const status=item.read_only?(item.closed_at?"finished":"unknown"):item.status;
  const style:Record<string,string>={
    in_att:"bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    finished:"bg-blue-500/15 text-blue-700 dark:text-blue-300",
    waiting:"bg-amber-500/15 text-amber-700 dark:text-amber-300",
    abandoned:"bg-red-500/15 text-red-700 dark:text-red-300",
    unknown:"bg-muted text-muted-foreground",
  };
  return <span className={"inline-flex shrink-0 rounded-md px-2 py-1 text-[11px] font-semibold "+style[status]}>
    {status==="unknown"?"Encerramento não registrado":statusName(status as UnionWhatsAppProtocol["status"])}
  </span>;
}
export const protocolTitle=(item:UnionWhatsAppProtocol)=>item.read_only?"Atendimento · SAC Digital":unionWhatsAppProtocolLabel(item.protocol_number);
export function HistoryPager({page,count,pageSize,hasMore,busy,onPrevious,onNext}:{page:number;count:number;pageSize:number;hasMore:boolean;busy:boolean;onPrevious:()=>void;onNext:()=>void}){
  return <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
    <span>{count?String(page*pageSize+1)+"–"+String(page*pageSize+count):"0"} registros · Página {page+1}</span>
    <div className="flex items-center gap-1">
      <button type="button" title="Página anterior" aria-label="Página anterior" disabled={busy||page===0} onClick={onPrevious} className="rounded-md border border-border bg-card p-2 hover:bg-muted disabled:opacity-40"><ChevronLeft size={15}/></button>
      <button type="button" title="Próxima página" aria-label="Próxima página" disabled={busy||!hasMore} onClick={onNext} className="rounded-md border border-border bg-card p-2 hover:bg-muted disabled:opacity-40"><ChevronRight size={15}/></button>
    </div>
  </div>;
}

type Scope={organizationId:string;conversation?:UnionWhatsAppConversation|null;contactId?:string;channelId?:string;accountPhone?:string};
function ProtocolConversation({scope,item,onBack}:{scope:Scope;item:UnionWhatsAppProtocol;onBack:()=>void}){
  const [messages,setMessages]=useState<UnionWhatsAppMessage[]>([]);
  const [cursor,setCursor]=useState<UnionWhatsAppMessageCursor|null>(null);
  const [hasMore,setHasMore]=useState(false);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [revision,setRevision]=useState(0);
  const box=useRef<HTMLDivElement>(null);
  const active=useRef(false);
  const getPage=(before:UnionWhatsAppMessageCursor|null)=>scope.conversation
    ?listUnionWhatsAppMessages(scope.organizationId,scope.conversation.id,scope.conversation.channel_id,scope.conversation.account_phone,item.id,before)
    :listContactOnlyHistoricalMessages(scope.organizationId,scope.contactId!,scope.channelId!,scope.accountPhone!,before,item.id);
  useEffect(()=>{
    let cancelled=false;active.current=true;setLoading(true);setError("");setMessages([]);
    void getPage(null).then(result=>{
      if(cancelled)return;
      setMessages(result.items);setCursor(result.nextCursor);setHasMore(result.hasMore);
      if(result.historyUnavailable)setError("Histórico incompleto.");
      requestAnimationFrame(()=>{if(!cancelled&&box.current)box.current.scrollTop=box.current.scrollHeight;});
    }).catch(reason=>{if(!cancelled)setError(systemErrorMessage(reason,"Não foi possível consultar as mensagens."));})
      .finally(()=>{if(!cancelled)setLoading(false);});
    return()=>{cancelled=true;active.current=false;};
  },[item.id,revision]);
  const older=async()=>{
    if(loading||!cursor||!hasMore)return;
    const height=box.current?.scrollHeight||0,top=box.current?.scrollTop||0;
    setLoading(true);setError("");
    try{
      const result=await getPage(cursor);if(!active.current)return;
      setMessages(current=>Array.from(new Map([...result.items,...current].map(m=>[m.id,m])).values()).sort((a,b)=>Date.parse(a.sent_at)-Date.parse(b.sent_at)||a.id.localeCompare(b.id)));
      setCursor(result.nextCursor);setHasMore(result.hasMore);
      requestAnimationFrame(()=>{if(box.current)box.current.scrollTop=top+box.current.scrollHeight-height;});
    }catch(reason){if(active.current)setError(systemErrorMessage(reason,"Não foi possível consultar as mensagens anteriores."));}
    finally{if(active.current)setLoading(false);}
  };
  return <div className="overflow-hidden rounded-lg border border-border">
    <div className="flex items-center gap-2 border-b border-border bg-card px-3 py-3">
      <button type="button" aria-label="Voltar aos protocolos" title="Voltar aos protocolos" onClick={onBack} className="rounded-md p-2 hover:bg-muted"><ArrowLeft size={17}/></button>
      <div className="min-w-0 flex-1"><strong className="block truncate text-sm">{protocolTitle(item)}</strong><span className="text-[11px] text-muted-foreground">Histórico do atendimento</span></div><ProtocolStatus item={item}/>
    </div>
    <div ref={box} className="h-[min(48vh,440px)] space-y-2 overflow-y-auto bg-muted/25 p-3" style={{backgroundImage:"url('/assets/crm/whatsapp-chat-pattern.svg')",backgroundSize:"270px 270px"}}>
      {hasMore&&<div className="text-center"><button type="button" disabled={loading} onClick={()=>void older()} className="rounded-full border border-border bg-card px-3 py-2 text-xs disabled:opacity-50">Carregar mensagens anteriores</button></div>}
      {loading&&<div className="flex justify-center py-2"><LoaderCircle size={16} className="animate-spin"/></div>}
      {error&&<div role="alert" className="rounded-lg border border-destructive/30 bg-card p-2 text-center text-xs text-destructive">{error} <button type="button" className="underline" onClick={()=>setRevision(v=>v+1)}>Tentar novamente</button></div>}
      {!loading&&!error&&!messages.length&&<p className="py-6 text-center text-xs text-muted-foreground">Nenhuma mensagem neste protocolo.</p>}
      {messages.map((message,index)=>{
        const day=new Date(message.sent_at).toLocaleDateString("pt-BR");
        const previous=index>0?new Date(messages[index-1].sent_at).toLocaleDateString("pt-BR"):"";
        return <div key={message.id}>
          {day!==previous&&<div className="my-2 text-center"><span className="rounded-lg border border-border bg-card px-3 py-1 text-[11px] text-muted-foreground">{day}</span></div>}
          <div className={"flex "+(message.historical_system?"justify-center":message.direction==="outgoing"?"justify-end":"justify-start")}>
            <div className={"max-w-[88%] break-words rounded-lg px-3 py-2 shadow-sm "+(message.direction==="outgoing"&&!message.historical_system?"bg-emerald-100 text-emerald-950 dark:bg-emerald-950/55 dark:text-emerald-50":"border border-border bg-card")}>
              {message.sender_name&&<p className="mb-1 text-[11px] font-semibold">{message.sender_name}</p>}
              {message.historical_system&&<p className="text-[10px] text-muted-foreground">Sistema · SAC Digital</p>}
              {message.read_only?<HistoricalMessageBody message={message}/>:<Suspense fallback={<LoaderCircle size={15} className="animate-spin"/>}><LiveMessageBody organizationId={scope.organizationId} message={message}/></Suspense>}
              <p className="mt-1 text-right text-[10px] text-muted-foreground">{message.unknown_date?"Data não registrada":new Date(message.sent_at).toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"})}</p>
            </div>
          </div>
        </div>;
      })}
    </div>
    <div className="border-t border-border bg-muted/20 px-3 py-2 text-center text-[11px] text-muted-foreground">Somente consulta · Nenhum atendimento será iniciado.</div>
  </div>;
}

export function UnionWhatsAppProtocolHistory(props:Scope&{onSelect?:(item:UnionWhatsAppProtocol)=>void}){
  const {conversation,organizationId,contactId,channelId,accountPhone,onSelect}=props;
  const scopeKey=[organizationId,conversation?.id||contactId,conversation?.channel_id||channelId,conversation?.account_phone||accountPhone].join(":");
  return <ProtocolList key={scopeKey} {...props} onSelect={onSelect}/>;
}
function ProtocolList(scope:Scope&{onSelect?:(item:UnionWhatsAppProtocol)=>void}){
  const {conversation,organizationId,contactId,channelId,accountPhone,onSelect}=scope;
  const [items,setItems]=useState<UnionWhatsAppProtocol[]>([]);
  const [loading,setLoading]=useState(true);
  const [hasMore,setHasMore]=useState(false);
  const [page,setPage]=useState(0);
  const [cursors,setCursors]=useState<(UnionWhatsAppMessageCursor|null)[]>([null]);
  const [nextCursor,setNextCursor]=useState<UnionWhatsAppMessageCursor|null>(null);
  const [error,setError]=useState("");
  const [revision,setRevision]=useState(0);
  const [selected,setSelected]=useState<UnionWhatsAppProtocol|null>(null);
  useEffect(()=>{
    let cancelled=false;setLoading(true);setError("");
    const request=conversation
      ?listUnionWhatsAppProtocols(organizationId,conversation.id,conversation.channel_id,conversation.account_phone,page,cursors[page])
      :listContactOnlyHistoricalProtocols(organizationId,contactId!,channelId!,accountPhone!,cursors[page]);
    void request.then(result=>{
      if(cancelled)return;
      setItems(result.items);setHasMore(result.hasMore);setNextCursor(result.nextCursor||null);
    }).catch(reason=>{if(!cancelled)setError(systemErrorMessage(reason,"Não foi possível carregar os protocolos."));})
      .finally(()=>{if(!cancelled)setLoading(false);});
    return()=>{cancelled=true;};
  },[page,revision]);
  if(selected)return <ProtocolConversation key={selected.id} scope={scope} item={selected} onBack={()=>setSelected(null)}/>;
  return <div aria-label="Histórico de atendimentos e protocolos" className="overflow-hidden rounded-lg border border-border">
    <div className="divide-y divide-border">
      {loading?<div role="status" className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground"><LoaderCircle size={16} className="animate-spin"/> Consultando protocolos...</div>:
        error?<p role="alert" className="p-3 text-center text-xs text-destructive">{error} <button type="button" className="underline" onClick={()=>setRevision(v=>v+1)}>Tentar novamente</button></p>:
        !items.length?<p className="py-5 text-center text-xs text-muted-foreground">Nenhum atendimento registrado para este contato.</p>:
        items.map(item=><button key={item.id} type="button" onClick={()=>onSelect?onSelect(item):setSelected(item)} className="group block w-full space-y-1.5 px-3 py-3 text-left text-xs hover:bg-muted/40 focus-visible:outline-primary">
          <div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-sm text-foreground">{protocolTitle(item)}</strong><ProtocolStatus item={item}/></div>
          <p className="text-muted-foreground">Abertura: {item.unknown_date?"Data não registrada":new Date(item.opened_at).toLocaleString("pt-BR")}</p>
          <p className="text-muted-foreground">{item.closed_at?"Encerramento: "+new Date(item.closed_at).toLocaleString("pt-BR"):item.read_only?"Encerramento não registrado":"Em aberto"}</p>
          <div className="flex items-center justify-between gap-2 text-muted-foreground"><span>{item.message_count} mensagem(ns)</span><span className="inline-flex items-center gap-1 font-semibold text-primary"><MessageCircle size={13}/> Ver conversa <ChevronRight size={13}/></span></div>
        </button>)}
    </div>
    <HistoryPager page={page} pageSize={PROTOCOL_PAGE_SIZE} count={loading||error?0:items.length} hasMore={hasMore} busy={loading||Boolean(error)} onPrevious={()=>setPage(v=>Math.max(0,v-1))} onNext={()=>{setCursors(current=>[...current.slice(0,page+1),nextCursor]);setPage(v=>v+1);}}/>
  </div>;
}
