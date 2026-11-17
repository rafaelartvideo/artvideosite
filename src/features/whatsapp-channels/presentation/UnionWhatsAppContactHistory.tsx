import { useEffect, useState } from "react";
import { FileText, History, Image, Link as LinkIcon, LoaderCircle, MessageCircle, Mic, Video } from "lucide-react";
import {
  listUnionWhatsAppMessages, type UnionWhatsAppConversation, type UnionWhatsAppMessage,
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

// O histórico pertence ao contato e reúne todos os protocolos da conversa:
// nunca filtramos mensagens por protocol_id, nem as copiamos para a agenda.
export function UnionWhatsAppContactHistory({conversation,organizationId}:{
  conversation:UnionWhatsAppConversation;
  organizationId:string;
}){
  const [tab,setTab]=useState<"general"|"protocols">("general");
  const [items,setItems]=useState<UnionWhatsAppMessage[]>([]);
  const [cursor,setCursor]=useState<UnionWhatsAppMessageCursor|null>(null);
  const [hasMore,setHasMore]=useState(false);
  const [loading,setLoading]=useState(true);
  const [olderLoading,setOlderLoading]=useState(false);
  const [error,setError]=useState("");
  const [revision,setRevision]=useState(0);

  useEffect(()=>{
    let cancelled=false;
    setItems([]);setCursor(null);setHasMore(false);setError("");setLoading(true);
    void listUnionWhatsAppMessages(organizationId,conversation.id,
      conversation.channel_id,conversation.account_phone)
      .then(result=>{
        if(cancelled)return;
        setItems(result.items.slice().reverse());
        setCursor(result.nextCursor);
        setHasMore(result.hasMore);
      })
      .catch(reason=>{
        if(!cancelled)setError(systemErrorMessage(reason,"Não foi possível consultar o histórico do contato."));
      })
      .finally(()=>{if(!cancelled)setLoading(false);});
    return()=>{cancelled=true;};
  },[organizationId,conversation.id,conversation.channel_id,conversation.account_phone,revision]);

  const loadOlder=async()=>{
    if(!cursor||loading||olderLoading||!hasMore)return;
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
    }catch(reason){setError(systemErrorMessage(reason,"Não foi possível carregar registros anteriores."));}
    finally{setOlderLoading(false);}
  };

  return <div aria-label="Histórico geral do contato" className="space-y-3">
    <div role="tablist" aria-label="Tipo de histórico" className="flex gap-1 rounded-lg bg-muted/60 p-1">
      <button type="button" role="tab" aria-selected={tab==="general"}
        onClick={()=>setTab("general")}
        className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-2 text-xs font-semibold
          ${tab==="general"?"bg-card text-primary shadow-sm":"text-muted-foreground hover:text-foreground"}`}>
        <History size={15}/> Geral
      </button>
      <button type="button" role="tab" aria-selected={tab==="protocols"}
        onClick={()=>setTab("protocols")}
        className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-2 text-xs font-semibold
          ${tab==="protocols"?"bg-card text-primary shadow-sm":"text-muted-foreground hover:text-foreground"}`}>
        <FileText size={15}/> Protocolos
      </button>
    </div>
    {tab==="protocols"?<UnionWhatsAppProtocolHistory
      organizationId={organizationId} conversation={conversation}/>:
      <div className="space-y-2">
        <p className="text-xs leading-5 text-muted-foreground">
          Mensagens, arquivos e interações de todos os atendimentos deste contato,
          inclusive protocolos encerrados. Os registros permanecem vinculados à agenda.
        </p>
        {loading?<div role="status" className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
          <LoaderCircle size={16} className="animate-spin"/> Consultando histórico geral...
        </div>:items.length===0&&!error?<p className="py-5 text-center text-xs text-muted-foreground">
          Nenhuma interação registrada para este contato.
        </p>:items.map(item=><div key={item.id}
          className="flex items-start gap-3 rounded-lg border border-border px-3 py-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <IconForMessage item={item}/>
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center justify-between gap-1">
              <strong className="text-xs text-foreground">{messageLabel(item)}</strong>
              <span className="text-[10px] text-muted-foreground">{formatWhen(item.sent_at)}</span>
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {item.direction==="incoming"?"Recebido":"Enviado"}
              {item.sender_name?" · "+item.sender_name:""}
            </p>
            <p className="mt-1 break-words text-xs text-foreground/85">{description(item)}</p>
          </div>
        </div>)}
        {error&&<p role="alert" className="py-2 text-center text-xs text-destructive">
          {error} <button type="button" onClick={()=>setRevision(value=>value+1)}
            className="font-semibold underline">Tentar novamente</button>
        </p>}
        {hasMore&&<button type="button" disabled={loading||olderLoading}
          onClick={()=>void loadOlder()}
          className="w-full rounded-lg border border-border px-3 py-2 text-xs font-semibold text-primary hover:bg-muted disabled:opacity-40">
          {olderLoading?"Carregando...":"Carregar interações anteriores"}
        </button>}
      </div>}
  </div>;
}
