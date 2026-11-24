import { useEffect, useState } from "react";
import { LoaderCircle } from "lucide-react";
import {
  listUnionWhatsAppProtocols, unionWhatsAppProtocolLabel,
  type UnionWhatsAppConversation, type UnionWhatsAppProtocol, type UnionWhatsAppMessageCursor,
} from "../infrastructure/union-whatsapp-inbox.repository";
import { systemErrorMessage } from "@/shared/domain/error-message";

const statusName=(status:UnionWhatsAppProtocol["status"])=>({
  waiting:"Aguardando",in_att:"Em atendimento",finished:"Finalizado",abandoned:"Cancelado",
})[status]||status;

export function UnionWhatsAppProtocolHistory({conversation,organizationId}:{
  conversation:UnionWhatsAppConversation;
  organizationId:string;
}){
  const [items,setItems]=useState<UnionWhatsAppProtocol[]>([]);
  const [loading,setLoading]=useState(true);
  const [moreLoading,setMoreLoading]=useState(false);
  const [hasMore,setHasMore]=useState(false);
  const [page,setPage]=useState(0);
  const [cursor,setCursor]=useState<UnionWhatsAppMessageCursor|null>(null);
  const [error,setError]=useState("");
  const [revision,setRevision]=useState(0);

  useEffect(()=>{
    let cancelled=false;
    setItems([]);setPage(0);setCursor(null);setHasMore(false);setError("");setLoading(true);
    void listUnionWhatsAppProtocols(organizationId,conversation.id,conversation.channel_id,conversation.account_phone)
      .then(result=>{
        if(cancelled)return;
        setItems(result.items);setHasMore(result.hasMore);setCursor(result.nextCursor||null);
      })
      .catch(reason=>{
        if(!cancelled)setError(systemErrorMessage(reason,"Não foi possível carregar os protocolos."));
      })
      .finally(()=>{if(!cancelled)setLoading(false);});
    return()=>{cancelled=true;};
  },[organizationId,conversation.id,conversation.channel_id,conversation.account_phone,revision]);

  const loadMore=async()=>{
    if(!hasMore||moreLoading||loading)return;
    setMoreLoading(true);
    try{
      const next=page+1;
      const result=await listUnionWhatsAppProtocols(organizationId,conversation.id,
        conversation.channel_id,conversation.account_phone,next,cursor);
      setItems(current=>{
        const unique=new Map(current.map(item=>[item.id,item]));
        for(const item of result.items)unique.set(item.id,item);
        return [...unique.values()];
      });
      setPage(next);setHasMore(result.hasMore);setCursor(result.nextCursor||null);setError("");
    }catch(reason){setError(systemErrorMessage(reason,"Não foi possível carregar os protocolos anteriores."));}
    finally{setMoreLoading(false);}
  };

  return <div aria-label="Histórico de atendimentos e protocolos" className="space-y-2">
    {loading?<div role="status" className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
      <LoaderCircle size={16} className="animate-spin"/> Consultando protocolos...
    </div>:items.length===0&&!error?<p className="py-5 text-center text-xs text-muted-foreground">
      Nenhum atendimento registrado para este contato.
    </p>:items.map(item=>{
      const duration=item.closed_at&&!item.unknown_date?Math.max(0,Math.round(
        (Date.parse(item.closed_at)-Date.parse(item.opened_at))/60000)):null;
      return <div key={item.id} className="rounded-lg border border-border px-3 py-3 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <strong className="text-sm text-foreground">{unionWhatsAppProtocolLabel(item.protocol_number)}</strong>
          <span className="font-medium text-muted-foreground">{item.read_only?(item.closed_at?"Finalizado":"Encerramento não registrado"):statusName(item.status)}</span>
        </div>
        <p className="mt-1.5 text-muted-foreground">Abertura: {item.unknown_date?"Data não registrada":new Date(item.opened_at).toLocaleString("pt-BR")}</p>
        <p className="mt-0.5 text-muted-foreground">
          {item.closed_at?"Encerramento: "+new Date(item.closed_at).toLocaleString("pt-BR"):item.read_only?"Encerramento não registrado":"Em aberto"}
        </p>
        <p className="mt-1.5 text-muted-foreground">
          {item.message_count} mensagem(ns){duration!==null?" · "+duration+" min":""}
        </p>
      </div>;
    })}
    {error&&<div role="alert" className="py-3 text-center text-xs text-destructive">
      {error} <button type="button" className="font-semibold underline"
        onClick={()=>setRevision(value=>value+1)}>Tentar novamente</button>
    </div>}
    {hasMore&&<button type="button" disabled={loading||moreLoading}
      onClick={()=>void loadMore()}
      className="w-full rounded-lg border border-border px-3 py-2 text-xs font-semibold text-primary hover:bg-muted disabled:opacity-50">
      {moreLoading?"Carregando...":"Mostrar mais protocolos"}
    </button>}
  </div>;
}
