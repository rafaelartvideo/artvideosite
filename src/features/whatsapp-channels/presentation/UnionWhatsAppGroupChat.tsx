import { useEffect, useRef, useState } from "react";
import { ImagePlus, LoaderCircle, RefreshCw, Send, X } from "lucide-react";
import { operateUnionWhatsAppInbox, type UnionWhatsAppGroupMessage } from "../infrastructure/union-whatsapp-inbox.repository";
import { systemErrorMessage } from "@/shared/domain/error-message";

const btn="rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-muted disabled:opacity-50";
export function UnionWhatsAppGroupChat({organizationId,accountPhone,groupJid,canSend}:{
  organizationId:string;accountPhone:string;groupJid:string;canSend:boolean;
}){
  const [messages,setMessages]=useState<UnionWhatsAppGroupMessage[]>([]);
  const [localSent,setLocalSent]=useState<UnionWhatsAppGroupMessage[]>([]);
  const [loading,setLoading]=useState(false);
  const [loadingOlder,setLoadingOlder]=useState(false);
  const [sending,setSending]=useState(false);
  const [available,setAvailable]=useState<boolean|null>(null);
  const [hasMore,setHasMore]=useState(false);
  const [before,setBefore]=useState<number|null>(null);
  const [draft,setDraft]=useState("");
  const [image,setImage]=useState<string|null>(null);
  const [error,setError]=useState("");
  const [revision,setRevision]=useState(0);
  const fileRef=useRef<HTMLInputElement|null>(null);
  const requestRef=useRef(0);
  const clientId=useRef(crypto.randomUUID());

  useEffect(()=>{
    setMessages([]);setLocalSent([]);setAvailable(null);setHasMore(false);setBefore(null);
    setDraft("");setImage(null);setError("");setRevision(value=>value+1);
    clientId.current=crypto.randomUUID();
  },[groupJid,organizationId,accountPhone]);

  useEffect(()=>{
    let cancelled=false;
    const request=++requestRef.current;
    setLoading(true);setError("");
    void operateUnionWhatsAppInbox(organizationId,crypto.randomUUID(),"contacts_groups_manage",{
      account_phone:accountPhone,group_command:"history",group_jid:groupJid,
    }).then(result=>{
      if(cancelled||request!==requestRef.current)return;
      setAvailable(result.history_available===true);
      setMessages([...(result.messages||[])].reverse());
      setHasMore(result.has_more===true);setBefore(result.next_before??null);
      setLocalSent([]);
    }).catch(reason=>{
      if(cancelled||request!==requestRef.current)return;
      setError(systemErrorMessage(reason,"Não foi possível consultar o histórico."));
      setAvailable(false);
    }).finally(()=>{if(!cancelled&&request===requestRef.current)setLoading(false);});
    return()=>{cancelled=true;};
  },[organizationId,accountPhone,groupJid,revision]);

  const loadOlder=async()=>{
    if(loadingOlder||!hasMore||!before)return;
    setLoadingOlder(true);setError("");
    try{
      const result=await operateUnionWhatsAppInbox(organizationId,crypto.randomUUID(),"contacts_groups_manage",{
        account_phone:accountPhone,group_command:"history",group_jid:groupJid,group_before:before,
      });
      const older=[...(result.messages||[])].reverse();
      setMessages(current=>[...older.filter(message=>!current.some(existing=>existing.id===message.id)),...current]);
      setHasMore(result.has_more===true);setBefore(result.next_before??null);
    }catch(reason){setError(systemErrorMessage(reason,"Não foi possível consultar mensagens antigas."));}
    finally{setLoadingOlder(false);}
  };
  const chooseImage=async(file:File|null)=>{
    if(!file)return;
    if(!["image/jpeg","image/png","image/webp"].includes(file.type)||file.size>8*1024*1024){
      setError("Escolha JPG, PNG ou WebP de até 8 MB.");return;
    }
    setError("");
    try{
      const bitmap=await createImageBitmap(file);
      try{
        const square=Math.min(bitmap.width,bitmap.height);
        const size=Math.min(560,square);
        const canvas=document.createElement("canvas");
        canvas.width=size;canvas.height=size;
        const context=canvas.getContext("2d");
        if(!context)throw new Error("Não foi possível preparar a imagem.");
        context.drawImage(bitmap,(bitmap.width-square)/2,(bitmap.height-square)/2,square,square,
          0,0,size,size);
        let result="";
        for(const quality of [0.82,0.7,0.56,0.42]){
          result=canvas.toDataURL("image/jpeg",quality);
          if(result.length<140000)break;
        }
        if(result.length>=140000)throw new Error("Não foi possível compactar a imagem para envio.");
        setImage(result);
      }finally{bitmap.close();}
    }catch(reason){setError(systemErrorMessage(reason,"Imagem inválida."));}
    finally{if(fileRef.current)fileRef.current.value="";}
  };
  const send=async()=>{
    const content=draft.trim();
    if(sending||!canSend||(!content&&!image))return;
    setSending(true);setError("");
    const id=clientId.current;
    try{
      const result=await operateUnionWhatsAppInbox(organizationId,crypto.randomUUID(),"contacts_groups_manage",{
        account_phone:accountPhone,group_jid:groupJid,
        group_command:image?"send_image":"send",
        group_message:content,group_photo:image||undefined,client_message_id:id,
      });
      if(!result.provider_message_id)throw new Error("Envio não confirmado pelo WhatsApp.");
      setLocalSent(current=>[...current,{id:Date.now(),sender_jid:accountPhone,
        sent_at:new Date().toISOString(),message_type:image?"image":"text",
        text:content||"Imagem enviada"}]);
      setDraft("");setImage(null);clientId.current=crypto.randomUUID();
    }catch(reason){
      // Keep exactly the same client message ID for retry; provider deduplicates sends.
      setError(systemErrorMessage(reason,"Não foi possível enviar esta mensagem."));
    }finally{setSending(false);}
  };
  const timeline=[...messages,...localSent];
  const dateLabel=(value:string)=>{
    const date=new Date(value);
    return Number.isNaN(date.getTime())?"Data indisponível":
      date.toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"});
  };
  return <section aria-label="Mensagens do grupo" className="space-y-3 rounded-xl border border-border p-3 sm:p-4">
    <div className="flex items-center justify-between gap-2">
      <h4 className="text-sm font-bold">Mensagens do grupo</h4>
      <button type="button" className={btn} disabled={loading||sending} onClick={()=>setRevision(v=>v+1)}>
        <RefreshCw size={13} className="mr-1 inline"/>Atualizar
      </button>
    </div>
    {error&&<p role="alert" className="rounded-lg border border-destructive/30 p-2 text-xs text-destructive">{error}</p>}
    {available===false&&<p className="text-xs text-muted-foreground">
      O histórico local de grupos não está disponível nesta versão ou configuração do WuzAPI.
      O envio continua disponível quando autorizado.
    </p>}
    {loading&&<p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
      <LoaderCircle size={14} className="animate-spin"/>Buscando mensagens...
    </p>}
    {available&&hasMore&&<button type="button" className={btn+" w-full"} disabled={loadingOlder}
      onClick={()=>void loadOlder()}>{loadingOlder?"Carregando...":"Carregar mensagens anteriores"}</button>}
    <div className="max-h-96 min-h-32 space-y-2 overflow-y-auto rounded-lg bg-muted/30 p-3">
      {!loading&&!timeline.length&&<p className="py-6 text-center text-xs text-muted-foreground">Nenhuma mensagem disponível.</p>}
      {timeline.map(message=>{
        const own=localSent.includes(message)||message.sender_jid.replace(/\D/g,"")===accountPhone;
        return <div key={message.id} className={"flex "+(own?"justify-end":"justify-start")}>
          <div className={"min-w-0 max-w-[90%] rounded-xl border px-3 py-2 text-xs "+(own?"border-primary/20 bg-primary/10":"border-border bg-card")}>
            <p className="mb-1 break-all text-[10px] font-semibold text-muted-foreground">{own?"Você":message.sender_jid||"Participante"}</p>
            <p className="whitespace-pre-wrap break-words">{message.text||({"image":"Imagem","video":"Vídeo","audio":"Áudio","document":"Documento"} as Record<string,string>)[message.message_type]||"Mídia ou evento do grupo"}</p>
            <p className="mt-1 text-right text-[10px] text-muted-foreground">{dateLabel(message.sent_at)}</p>
          </div>
        </div>;
      })}
    </div>
    {canSend&&<div className="space-y-2">
      {image&&<div className="relative inline-block">
        <img src={image} alt="Imagem pronta para envio" className="h-20 w-20 rounded-lg border border-border object-cover"/>
        <button type="button" aria-label="Remover anexo" className="absolute -right-2 -top-2 rounded-full bg-card p-1 shadow"
          onClick={()=>setImage(null)}><X size={14}/></button>
      </div>}
      <div className="flex items-end gap-2">
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
          aria-label="Anexar imagem ao grupo" onChange={event=>void chooseImage(event.target.files?.[0]||null)}/>
        <button type="button" disabled={sending} className={btn} title="Enviar imagem" aria-label="Enviar imagem"
          onClick={()=>fileRef.current?.click()}><ImagePlus size={17}/></button>
        <textarea aria-label="Escrever mensagem para o grupo" value={draft} maxLength={4000}
          onChange={event=>{setDraft(event.target.value);clientId.current=crypto.randomUUID();}}
          rows={2} placeholder="Escrever mensagem..."
          className="min-w-0 flex-1 resize-none rounded-lg border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary"/>
        <button type="button" className="rounded-lg bg-primary px-3 py-2 text-primary-foreground disabled:opacity-50"
          aria-label="Enviar mensagem ao grupo" disabled={sending||(!draft.trim()&&!image)} onClick={()=>void send()}>
          {sending?<LoaderCircle size={17} className="animate-spin"/>:<Send size={17}/>}
        </button>
      </div>
      <p className="text-[11px] text-muted-foreground">Texto e imagens JPEG otimizadas. A atualização do histórico é manual para reduzir consultas.</p>
    </div>}
  </section>;
}
