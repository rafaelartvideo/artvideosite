import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ImagePlus, LoaderCircle, Send, X } from "lucide-react";
import { operateUnionWhatsAppInbox, type UnionWhatsAppGroupMessage } from "../infrastructure/union-whatsapp-inbox.repository";
import { systemErrorMessage } from "@/shared/domain/error-message";

export function UnionWhatsAppGroupChat({organizationId,accountPhone,groupJid,canSend,layout="embedded"}:{
  organizationId:string;accountPhone:string;groupJid:string;canSend:boolean;layout?:"embedded"|"conversation";
}){
  // O WhatsApp nao disponibiliza historico retroativo de grupos.
  // Nao consultar /chat/messages e nao manter polling desnecessario.
  const [localSent,setLocalSent]=useState<UnionWhatsAppGroupMessage[]>([]);
  const [sending,setSending]=useState(false);
  const [draft,setDraft]=useState("");
  const [image,setImage]=useState<string|null>(null);
  const [error,setError]=useState("");
  const fileRef=useRef<HTMLInputElement|null>(null);
  const chatScrollRef=useRef<HTMLDivElement|null>(null);
  const clientId=useRef(crypto.randomUUID());
  useEffect(()=>{
    setLocalSent([]);setDraft("");setImage(null);setError("");
    clientId.current=crypto.randomUUID();
  },[groupJid,organizationId,accountPhone]);

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
  const timeline=localSent;
  // Open at the latest message like the individual attendance conversations,
  // but never scroll away from history when older pages are prepended.
  useLayoutEffect(()=>{
    const pane=chatScrollRef.current;
    if(!pane)return;
    pane.scrollTop=pane.scrollHeight;
  },[groupJid,localSent.length]);
  const dateLabel=(value:string)=>{
    const date=new Date(value);
    return Number.isNaN(date.getTime())?"Data indisponível":
      date.toLocaleString("pt-BR",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"});
  };
  const calendarDay=(value:string)=>{
    const date=new Date(value);
    return Number.isNaN(date.getTime())?"":date.toLocaleDateString("pt-BR");
  };
  const inbox=layout==="conversation";
  return <section aria-label="Mensagens do grupo" className={inbox
      ?"flex min-h-0 flex-1 flex-col overflow-hidden bg-card"
      :"space-y-3 rounded-xl border border-border p-3 sm:p-4"}>
    {error&&<p role="alert" className="mx-3 mt-2 rounded-lg border border-destructive/30 p-2 text-xs text-destructive">{error}</p>}
    <div ref={chatScrollRef} className={inbox?"min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain bg-muted/25 px-3 py-4 sm:px-5":"max-h-96 min-h-32 space-y-2 overflow-y-auto rounded-lg bg-muted/30 p-3"}
      style={{backgroundImage:"url('/assets/crm/whatsapp-chat-pattern.svg')",backgroundRepeat:"repeat",backgroundSize:"270px 270px"}}>

      <div className="mx-auto flex max-w-4xl flex-col gap-2">{timeline.map((message,index)=>{
        const own=localSent.includes(message)||message.sender_jid.replace(/\D/g,"")===accountPhone.replace(/\D/g,"");
        return <Fragment key={message.id}>
          {(index===0||calendarDay(message.sent_at)!==calendarDay(timeline[index-1].sent_at))&&
            <div className="my-3 flex justify-center" role="separator">
              <span className="rounded-lg border border-border/60 bg-card/90 px-3 py-1 text-[11px] font-medium text-muted-foreground shadow-sm">
                {calendarDay(message.sent_at)||"Data indisponível"}
              </span>
            </div>}
          <div className={"flex "+(own?"justify-end":"justify-start")}>
          <div className={"min-w-0 max-w-[88%] rounded-lg px-3 py-2 text-xs shadow-sm sm:max-w-[72%] "+(own?"bg-emerald-100 text-emerald-950 dark:bg-emerald-950/55 dark:text-emerald-50":"border border-border bg-card text-foreground")}>
            <p className="mb-1 break-all text-[10px] font-semibold text-muted-foreground">{own?"Você":message.sender_jid||"Participante"}</p>
            <p className="whitespace-pre-wrap break-words text-sm leading-5">{message.text||({"image":"Imagem","video":"Vídeo","audio":"Áudio","document":"Documento"} as Record<string,string>)[message.message_type]||"Mídia ou evento do grupo"}</p>
            <p className="mt-1 text-right text-[10px] text-muted-foreground">{dateLabel(message.sent_at)}</p>
          </div>
        </div></Fragment>;
      })}</div>
    </div>
    {canSend&&<footer className={inbox?"shrink-0 border-t border-border bg-card px-2 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-3 sm:pb-3":"space-y-2"}>
      {image&&<div className="relative inline-block">
        <img src={image} alt="Imagem pronta para envio" className="h-20 w-20 rounded-lg border border-border object-cover"/>
        <button type="button" aria-label="Remover anexo" className="absolute -right-2 -top-2 rounded-full bg-card p-1 shadow"
          onClick={()=>setImage(null)}><X size={14}/></button>
      </div>}
      <div className="mx-auto flex max-w-4xl items-end gap-2 rounded-xl border border-border bg-card">
        <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
          aria-label="Anexar imagem ao grupo" onChange={event=>void chooseImage(event.target.files?.[0]||null)}/>
        <button type="button" disabled={sending} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-l-xl hover:bg-muted disabled:opacity-50" title="Anexar imagem" aria-label="Anexar imagem"
          onClick={()=>fileRef.current?.click()}><ImagePlus size={17}/></button>
        <textarea aria-label="Escrever mensagem para o grupo" value={draft} maxLength={4000}
          onChange={event=>{setDraft(event.target.value);clientId.current=crypto.randomUUID();}}
          rows={1} placeholder="Digite uma mensagem..." lang="pt-BR" spellCheck={true} autoCapitalize="sentences"
          onKeyDown={event=>{if(event.key==="Enter"&&!event.shiftKey&&!event.nativeEvent.isComposing){event.preventDefault();void send();}}}
          className="min-h-12 min-w-0 flex-1 resize-none bg-transparent px-3 py-3 text-base leading-6 outline-none placeholder:text-muted-foreground/65 xl:text-sm"/>
        <button type="button" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-r-xl border-l border-primary/20 bg-primary text-primary-foreground disabled:opacity-50"
          aria-label="Enviar mensagem ao grupo" disabled={sending||(!draft.trim()&&!image)} onClick={()=>void send()}>
          {sending?<LoaderCircle size={17} className="animate-spin"/>:<Send size={17}/>}
        </button>
      </div>
      {!inbox&&<p className="mt-2 text-[11px] text-muted-foreground">Texto e imagens JPEG otimizadas.</p>}
    </footer>}
  </section>;
}
