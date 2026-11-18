import { useEffect, useState } from "react";
import { FileText, History, Image, Link as LinkIcon, LoaderCircle, MessageCircle, Mic, Pencil, Video } from "lucide-react";
import {
  listUnionWhatsAppMessages, operateUnionWhatsAppInbox,
  type UnionWhatsAppContactChange, type UnionWhatsAppConversation, type UnionWhatsAppMessage,
  type UnionWhatsAppMessageCursor,
} from "../infrastructure/union-whatsapp-inbox.repository";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { UnionWhatsAppProtocolHistory } from "./UnionWhatsAppProtocolHistory";

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
  if(change.action==="created")return "Contato salvo na Union";
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
        {change.action==="created"?"Salvo por: ":"Alterado por: "}
        <span className="font-semibold text-foreground">{change.actor_name_snapshot||"Responsável não identificado"}</span>
      </p>
      <div className="mt-2 space-y-2">
        {Object.entries(change.changed_fields||{}).map(([key,values])=>
          <div key={key} className="rounded-md bg-muted/60 p-2 text-[11px]">
            <p className="mb-1 font-semibold text-foreground">{fieldLabels[key]||key}</p>
            <p className="break-words text-muted-foreground">
              <span className="font-medium">Anterior: </span>{fieldValue(values?.before,key)}
            </p>
            <p className="mt-0.5 break-words text-foreground">
              <span className="font-medium">Novo: </span>{fieldValue(values?.after,key)}
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

// Histórico único do contato, independente do número de protocolos.
// A auditoria é solicitada sob demanda, nunca junto à carga da caixa de entrada.
export function UnionWhatsAppContactHistory({conversation,organizationId,contactJid,accountPhone}:{ 
  conversation?:UnionWhatsAppConversation|null;
  organizationId:string;
  contactJid?:string;
  accountPhone?:string;
}){
  const jid=contactJid||conversation?.chat_jid||"";
  const account=accountPhone||conversation?.account_phone||"";
  const [tab,setTab]=useState<"general"|"protocols">("general");
  const [items,setItems]=useState<UnionWhatsAppMessage[]>([]);
  const [cursor,setCursor]=useState<UnionWhatsAppMessageCursor|null>(null);
  const [hasMore,setHasMore]=useState(false);
  const [loading,setLoading]=useState(Boolean(conversation));
  const [olderLoading,setOlderLoading]=useState(false);
  const [error,setError]=useState("");
  const [changes,setChanges]=useState<UnionWhatsAppContactChange[]>([]);
  const [changesLoading,setChangesLoading]=useState(true);
  const [changesError,setChangesError]=useState("");
  const [changesPage,setChangesPage]=useState(0);
  const [hasMoreChanges,setHasMoreChanges]=useState(false);
  const [olderChangesLoading,setOlderChangesLoading]=useState(false);
  const [revision,setRevision]=useState(0);

  useEffect(()=>{
    let cancelled=false;
    setItems([]);setCursor(null);setHasMore(false);setError("");
    setLoading(Boolean(conversation));
    if(!conversation)return;
    void listUnionWhatsAppMessages(organizationId,conversation.id,
      conversation.channel_id,conversation.account_phone)
      .then(result=>{
        if(cancelled)return;
        setItems(result.items.slice().reverse());
        setCursor(result.nextCursor);
        setHasMore(result.hasMore);
      })
      .catch(reason=>{
        if(!cancelled)setError(systemErrorMessage(reason,"Não foi possível consultar as mensagens anteriores."));
      })
      .finally(()=>{if(!cancelled)setLoading(false);});
    return()=>{cancelled=true;};
  },[organizationId,conversation?.id,conversation?.channel_id,conversation?.account_phone,revision]);

  useEffect(()=>{
    let cancelled=false;
    setChanges([]);setChangesError("");setChangesLoading(Boolean(jid&&account));
    setChangesPage(0);setHasMoreChanges(false);
    if(!jid||!account)return;
    void operateUnionWhatsAppInbox(organizationId,conversation?.id||crypto.randomUUID(),
      "contacts_history",{chat_jid:jid,account_phone:account,page:0})
      .then(result=>{
        if(cancelled)return;
        setChanges(result.history||[]);
        setHasMoreChanges(Boolean(result.has_more));
      })
      .catch(reason=>{
        if(!cancelled)setChangesError(systemErrorMessage(reason,"Não foi possível consultar as alterações cadastrais."));
      })
      .finally(()=>{if(!cancelled)setChangesLoading(false);});
    return()=>{cancelled=true;};
  },[organizationId,conversation?.id,conversation?.contact_name,jid,account,revision]);

  const loadOlder=async()=>{
    if(!conversation||!cursor||loading||olderLoading||!hasMore)return;
    setOlderLoading(true);
    try{
      const result=await listUnionWhatsAppMessages(organizationId,conversation.id,
        conversation.channel_id,conversation.account_phone,null,cursor);
      setItems(current=>{
        const unique=new Map(current.map(item=>[item.id,item]));
        for(const item of result.items)unique.set(item.id,item);
        return [...unique.values()].sort((a,b)=>
          Date.parse(b.sent_at)-Date.parse(a.sent_at)||b.id.localeCompare(a.id));
      });
      setCursor(result.nextCursor);setHasMore(result.hasMore);setError("");
    }catch(reason){setError(systemErrorMessage(reason,"Não foi possível carregar interações anteriores."));}
    finally{setOlderLoading(false);}
  };
  const loadOlderChanges=async()=>{
    if(!jid||!account||changesLoading||olderChangesLoading||!hasMoreChanges)return;
    setOlderChangesLoading(true);
    try{
      const nextPage=changesPage+1;
      const result=await operateUnionWhatsAppInbox(organizationId,conversation?.id||crypto.randomUUID(),
        "contacts_history",{chat_jid:jid,account_phone:account,page:nextPage});
      setChanges(current=>{
        const unique=new Map(current.map(item=>[item.id,item]));
        for(const change of result.history||[])unique.set(change.id,change);
        return [...unique.values()];
      });
      setChangesPage(nextPage);setHasMoreChanges(Boolean(result.has_more));setChangesError("");
    }catch(reason){setChangesError(systemErrorMessage(reason,"Não foi possível carregar alterações anteriores."));}
    finally{setOlderChangesLoading(false);}
  };
  const timeline:TimelineEntry[]=[
    ...items.map(item=>({key:"message:"+item.id,at:item.sent_at,message:item})),
    ...changes.map(change=>({key:"change:"+change.id,at:change.created_at,change})),
  ];
  timeline.sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)||b.key.localeCompare(a.key));

  return <div aria-label="Histórico geral do contato" className="space-y-3">
    {conversation&&<div role="tablist" aria-label="Tipo de histórico" className="flex gap-1 rounded-lg bg-muted/60 p-1">
      <button type="button" role="tab" aria-selected={tab==="general"}
        onClick={()=>setTab("general")}
        className={"flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-2 text-xs font-semibold "+
          (tab==="general"?"bg-card text-primary shadow-sm":"text-muted-foreground hover:text-foreground")}>
        <History size={15}/> Geral
      </button>
      <button type="button" role="tab" aria-selected={tab==="protocols"}
        onClick={()=>setTab("protocols")}
        className={"flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-2 text-xs font-semibold "+
          (tab==="protocols"?"bg-card text-primary shadow-sm":"text-muted-foreground hover:text-foreground")}>
        <FileText size={15}/> Protocolos
      </button>
    </div>}
    {tab==="protocols"&&conversation?<UnionWhatsAppProtocolHistory
      organizationId={organizationId} conversation={conversation}/>:
      <div className="space-y-2">
        <p className="text-xs leading-5 text-muted-foreground">
          Mensagens, arquivos e alterações do cadastro, em ordem cronológica,
          incluindo atendimentos encerrados. Alterações anteriores à ativação da auditoria
          podem não estar disponíveis.
        </p>
        {(loading||changesLoading)&&<div role="status"
          className="flex items-center justify-center gap-2 py-4 text-xs text-muted-foreground">
          <LoaderCircle size={16} className="animate-spin"/> Consultando histórico geral...
        </div>}
        {!loading&&!changesLoading&&timeline.length===0&&!error&&!changesError&&
          <p className="py-5 text-center text-xs text-muted-foreground">
            Nenhuma interação ou alteração registrada para este contato.
          </p>}
        {timeline.map(entry=>entry.change?<ChangeCard key={entry.key} change={entry.change}/>:
          entry.message?<div key={entry.key}
            className="flex items-start gap-3 rounded-lg border border-border px-3 py-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <IconForMessage item={entry.message}/>
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center justify-between gap-1">
                <strong className="text-xs text-foreground">{messageLabel(entry.message)}</strong>
                <span className="text-[10px] text-muted-foreground">{formatWhen(entry.message.sent_at)}</span>
              </div>
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {entry.message.direction==="incoming"?"Recebido":"Enviado"}
                {entry.message.sender_name?" · "+entry.message.sender_name:""}
              </p>
              <p className="mt-1 break-words text-xs text-foreground/85">{description(entry.message)}</p>
            </div>
          </div>:null)}
        {(error||changesError)&&<p role="alert" className="py-2 text-center text-xs text-destructive">
          {[error,changesError].filter(Boolean).join(" ")}
          <button type="button" onClick={()=>setRevision(value=>value+1)}
            className="ml-1 font-semibold underline">Tentar novamente</button>
        </p>}
        {hasMore&&<button type="button" disabled={loading||olderLoading}
          onClick={()=>void loadOlder()}
          className="w-full rounded-lg border border-border px-3 py-2 text-xs font-semibold text-primary hover:bg-muted disabled:opacity-40">
          {olderLoading?"Carregando...":"Carregar interações anteriores"}
        </button>}
        {hasMoreChanges&&<button type="button" disabled={changesLoading||olderChangesLoading}
          onClick={()=>void loadOlderChanges()}
          className="w-full rounded-lg border border-border px-3 py-2 text-xs font-semibold text-primary hover:bg-muted disabled:opacity-40">
          {olderChangesLoading?"Carregando...":"Carregar alterações anteriores"}
        </button>}
      </div>}
  </div>;
}
