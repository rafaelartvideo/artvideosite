import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth";
import { FileText, History, Image, Link as LinkIcon, LoaderCircle, MessageCircle, Mic, Pencil, Video } from "lucide-react";
import {
  listUnionWhatsAppMessages, operateUnionWhatsAppInbox, listContactOnlyHistoricalMessages, isUnifiedHistoryPilotEnabled,
  type UnionWhatsAppContactChange, type UnionWhatsAppConversation, type UnionWhatsAppMessage,
  type UnionWhatsAppMessageCursor,
} from "../infrastructure/union-whatsapp-inbox.repository";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { HistoryPager, UnionWhatsAppProtocolHistory } from "./UnionWhatsAppProtocolHistory";
import { HistoricalMessageBody } from "./HistoricalMessageBody";

const formatWhen=(iso:string)=>{
  const date=new Date(iso);
  return Number.isFinite(date.getTime())?date.toLocaleString("pt-BR"):"Data indisponível";
};
const messageLabel=(message:UnionWhatsAppMessage)=>{
  switch(message.message_type){
    case "image":return "Imagem";
    case "sticker":return "Figurinha";
    case "video":return "Vídeo";
    case "audio":return "Áudio";
    case "file":return "Documento";
    case "location":return "Localização";
    case "contact":return "Contato compartilhado";
    default:return /(?:https?:\/\/|www\.)/i.test(message.body_text||"")?"Mensagem com link":"Mensagem";
  }
};
const description=(message:UnionWhatsAppMessage)=>{
  if(message.media_name)return message.media_name;
  const raw=String(message.body_text||"").trim();
  if(raw)return raw.replace(/\s+/g," ").slice(0,180);
  return messageLabel(message);
};
const IconForMessage=({item}:{item:UnionWhatsAppMessage})=>{
  const kind=item.message_type;
  if(kind==="image"||kind==="sticker")return <Image size={17}/>;
  if(kind==="audio")return <Mic size={17}/>;
  if(kind==="video")return <Video size={17}/>;
  if(kind==="file")return <FileText size={17}/>;
  if(/(?:https?:\/\/|www\.)/i.test(item.body_text||""))return <LinkIcon size={17}/>;
  return <MessageCircle size={17}/>;
};

const fieldLabels:Record<string,string>={
  display_name:"Nome salvo na Union",
  contact_phone:"WhatsApp",
  chat_jid:"Identidade WhatsApp",
};
const fieldValue=(value:unknown,key:string)=>{
  if(value===null||value===undefined||value==="")return "Não informado";
  if(typeof value!=="string")return String(value);
  if(key==="contact_phone"||key==="chat_jid"){
    const phone=value.split("@")[0].replace(/\D/g,"");
    if(phone.startsWith("55")&&(phone.length===12||phone.length===13)){
      const national=phone.slice(2);
      const split=national.length===11?7:6;
      return "(" + national.slice(0,2) + ") " + national.slice(2,split) + "-" + national.slice(split);
    }
  }
  return value;
};
const changeTitle=(change:UnionWhatsAppContactChange)=>{
  if(change.action==="created")return "Contato cadastrado na Union";
  const keys=Object.keys(change.changed_fields||{});
  if(keys.length===1&&keys[0]==="display_name")return "Nome do contato alterado";
  if(keys.length===1&&keys[0]==="contact_phone")return "WhatsApp alterado";
  return "Dados do contato alterados";
};
function ChangeCard({change}:{change:UnionWhatsAppContactChange}){
  return <div className="flex items-start gap-3 rounded-lg border border-border px-3 py-2.5">
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-primary">
      <Pencil size={16}/>
    </span>
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center justify-between gap-1">
        <strong className="text-xs text-foreground">{changeTitle(change)}</strong>
        <span className="text-[10px] text-muted-foreground">{formatWhen(change.created_at)}</span>
      </div>
      <p className="mt-0.5 text-[11px] text-muted-foreground">
        {change.action==="created"?"Cadastrado por: ":"Alterado por: "}
        <span className="font-semibold text-foreground">{change.actor_name_snapshot||"Responsável não identificado"}</span>
      </p>
      <div className="mt-2 space-y-2">
        {Object.entries(change.changed_fields||{}).filter(([,values])=>change.action!=="created"||(values?.after!==null&&values?.after!==undefined&&values?.after!=="")).map(([key,values])=>
          <div key={key} className="rounded-md bg-muted/60 p-2 text-[11px]">
            <p className="mb-1 font-semibold text-foreground">{fieldLabels[key]||key}</p>
            {change.action!=="created"&&<p className="break-words text-muted-foreground">
              <span className="font-medium">Anterior: </span>{Object.prototype.hasOwnProperty.call(values||{},"before")
                ? (values?.before===null||values?.before===undefined||values?.before==="" ? "Não preenchido anteriormente" : fieldValue(values.before,key))
                : "Valor anterior não registrado neste evento"}
            </p>}
            <p className="mt-0.5 break-words text-foreground">
              <span className="font-medium">{change.action==="created"?"Cadastrado: ":"Novo: "}</span>{values?.after===null?"Campo esvaziado":fieldValue(values?.after,key)}
            </p>
          </div>
        )}
      </div>
    </div>
  </div>;
}

type TimelineEntry={
  key:string;
  at:string;
  message?:UnionWhatsAppMessage;
  change?:UnionWhatsAppContactChange;
};

// Histórico único do contato. As fontes são paginadas separadamente e
// a página visível só avança quando ambas garantem a ordem cronológica.
const GENERAL_PAGE_SIZE=5;
type Props={
  conversation?:UnionWhatsAppConversation|null;
  organizationId:string;
  contactJid?:string;
  accountPhone?:string;
  contactId?:string;
  channelId?:string;
};
type SourceCache={
  items:UnionWhatsAppMessage[];changes:UnionWhatsAppContactChange[];
  cursor:UnionWhatsAppMessageCursor|null;changesPage:number;
  messageMore:boolean;changeMore:boolean;messageLoaded:boolean;changeLoaded:boolean;
};
const emptySources=():SourceCache=>({items:[],changes:[],cursor:null,changesPage:0,messageMore:false,changeMore:false,messageLoaded:false,changeLoaded:false});
export function UnionWhatsAppContactHistory(props:Props){
  const key=[props.organizationId,props.conversation?.id||props.contactId||props.contactJid,props.conversation?.channel_id||props.channelId,props.accountPhone||props.conversation?.account_phone].join(":");
  return <ContactHistory key={key} {...props}/>;
}
function ContactHistory({conversation,organizationId,contactJid,accountPhone,contactId,channelId}:Props){
  const jid=contactJid||conversation?.chat_jid||"";
  const account=accountPhone||conversation?.account_phone||"";
  const {hasPermission}=useAuth();
  const contactOnly=Boolean(!conversation&&contactId&&channelId&&account&&isUnifiedHistoryPilotEnabled(organizationId)&&hasPermission("whatsapp.history_import.manage")&&hasPermission("whatsapp.history_import.view"));
  const [tab,setTab]=useState<"general"|"protocols">("general");
  const [page,setPage]=useState(0);
  const [visibleRows,setVisibleRows]=useState<TimelineEntry[]>([]);
  const [hasMore,setHasMore]=useState(false);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [revision,setRevision]=useState(0);
  const cache=useRef<SourceCache>(emptySources());
  useEffect(()=>{
    if(tab!=="general")return;
    let cancelled=false;
    setLoading(true);setError("");
    const load=async()=>{
      const state={...cache.current};
      const readMessages=async()=>{
        if(!conversation&&!contactOnly){state.messageLoaded=true;state.messageMore=false;return;}
        const result=conversation
          ?await listUnionWhatsAppMessages(organizationId,conversation.id,conversation.channel_id,conversation.account_phone,null,state.cursor)
          :await listContactOnlyHistoricalMessages(organizationId,contactId!,channelId!,account,state.cursor);
        if(result.historyUnavailable)throw Error("Não foi possível consultar todas as mensagens anteriores.");
        if(result.hasMore&&(!result.nextCursor||result.nextCursor.id===state.cursor?.id))throw Error("Cursor de mensagens indisponível.");
        state.items=Array.from(new Map([...state.items,...result.items].map(item=>[item.id,item])).values());
        state.cursor=result.nextCursor;state.messageMore=result.hasMore;state.messageLoaded=true;
      };
      const readChanges=async()=>{
        if(!jid||!account){state.changeLoaded=true;state.changeMore=false;return;}
        const next=state.changeLoaded?state.changesPage+1:0;
        const result=await operateUnionWhatsAppInbox(organizationId,conversation?.id||crypto.randomUUID(),"contacts_history",{chat_jid:jid,account_phone:account,page:next});
        if(result.has_more&&!result.history?.length)throw Error("Página de alterações indisponível.");
        state.changes=Array.from(new Map([...state.changes,...(result.history||[])].map(change=>[change.id,change])).values());
        state.changesPage=next;state.changeMore=Boolean(result.has_more);state.changeLoaded=true;
      };
      await Promise.all([!state.messageLoaded?readMessages():undefined,!state.changeLoaded?readChanges():undefined]);
      const needed=(page+1)*GENERAL_PAGE_SIZE;
      while(!cancelled){
        const {items,changes}=state;
        const timeline:TimelineEntry[]=[
          ...items.map(item=>({key:"message:"+item.id,at:item.sent_at,message:item})),
          ...changes.map(change=>({key:"change:"+change.id,at:change.created_at,change})),
        ];
        timeline.sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)||b.key.localeCompare(a.key));
        const m=state.messageMore?Date.parse(state.cursor!.sent_at):-Infinity;
        const c=state.changeMore?changes.reduce((old,row)=>Math.min(old,Date.parse(row.created_at)),Infinity):-Infinity;
        const cutoff=Math.max(m,c);
        if(Number.isNaN(cutoff))throw Error("Data de paginação inválida.");
        // Equal timestamps at an unfinished boundary are deferred until all
        // ties are loaded, so a later request cannot shift a displayed page.
        const safe=timeline.filter(row=>Date.parse(row.at)>cutoff);
        const remaining=state.messageMore||state.changeMore;
        if(safe.length>=needed||!remaining){
          if(cancelled)return;
          cache.current=state;
          setVisibleRows(safe.slice(page*GENERAL_PAGE_SIZE,needed));
          setHasMore(safe.length>needed||remaining);
          return;
        }
        await Promise.all([state.messageMore&&m===cutoff?readMessages():undefined,state.changeMore&&c===cutoff?readChanges():undefined]);
      }
    };
    void load().catch(reason=>{if(!cancelled)setError(systemErrorMessage(reason,"Não foi possível consultar o histórico geral."));})
      .finally(()=>{if(!cancelled)setLoading(false);});
    return()=>{cancelled=true;};
  },[tab,page,revision,organizationId,conversation?.id,conversation?.channel_id,conversation?.account_phone,contactOnly,contactId,channelId,account,jid]);
  return <div aria-label="Histórico geral do contato" className="space-y-3">
    {(conversation||contactOnly)&&<div role="tablist" aria-label="Tipo de histórico" className="flex gap-1 rounded-lg bg-muted/60 p-1">
      <button type="button" role="tab" aria-selected={tab==="general"} onClick={()=>setTab("general")}
        className={"flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-2 text-xs font-semibold "+(tab==="general"?"bg-card text-primary shadow-sm":"text-muted-foreground hover:text-foreground")}>
        <History size={15}/> Geral
      </button>
      <button type="button" role="tab" aria-selected={tab==="protocols"} onClick={()=>setTab("protocols")}
        className={"flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-2 text-xs font-semibold "+(tab==="protocols"?"bg-card text-primary shadow-sm":"text-muted-foreground hover:text-foreground")}>
        <FileText size={15}/> Protocolos
      </button>
    </div>}
    {tab==="protocols"&&(conversation||contactOnly)?<UnionWhatsAppProtocolHistory
      organizationId={organizationId} conversation={conversation} contactId={contactId} channelId={channelId} accountPhone={account}/>:
      <div className="overflow-hidden rounded-lg border border-border">
        <div className="divide-y divide-border">
        {loading?<div role="status" className="flex items-center justify-center gap-2 py-5 text-xs text-muted-foreground"><LoaderCircle size={16} className="animate-spin"/> Consultando histórico geral...</div>:
          error?<p role="alert" className="p-3 text-center text-xs text-destructive">{error} <button type="button" onClick={()=>setRevision(v=>v+1)} className="font-semibold underline">Tentar novamente</button></p>:
          !visibleRows.length?<p className="py-5 text-center text-xs text-muted-foreground">Nenhuma interação ou alteração registrada para este contato.</p>:null}
        {!loading&&!error&&
          <div className="divide-y divide-border">
        {visibleRows.map(entry=>entry.change?<ChangeCard key={entry.key} change={entry.change}/>:
          entry.message?<div key={entry.key}
            className="flex items-start gap-3 px-3 py-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <IconForMessage item={entry.message}/>
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-1">
                <strong className="text-xs text-foreground">{messageLabel(entry.message)}</strong>
                <span className="text-[10px] text-muted-foreground">{formatWhen(entry.message.sent_at)}</span>
              </div>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {entry.message.historical_system?"Registro de atendimento":entry.message.direction==="incoming"?"Recebido":"Enviado"}
                {entry.message.sender_name?" · "+entry.message.sender_name:""}
              </p>
              {entry.message.read_only?<HistoricalMessageBody message={entry.message}/>:<p className="mt-1 break-words text-xs text-foreground/85">{description(entry.message)}</p>}
            </div>
          </div>:null)}
          </div>}
        </div>
        <HistoryPager page={page} pageSize={GENERAL_PAGE_SIZE} count={loading||error?0:visibleRows.length} hasMore={hasMore} busy={loading||Boolean(error)}
          onPrevious={()=>setPage(v=>Math.max(0,v-1))} onNext={()=>setPage(v=>v+1)}/>
      </div>}
  </div>;
}
