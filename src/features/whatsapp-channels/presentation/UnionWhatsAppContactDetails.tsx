import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, CalendarDays, ExternalLink, FileText, Image as ImageIcon, Link as LinkIcon, LoaderCircle, Music2, Pencil, Play, Video, X } from "lucide-react";
import { WhatsAppContactAvatar, formatWhatsAppPhone } from "./WhatsAppInboxVisuals";
import {
  listUnionWhatsAppSharedItems, operateUnionWhatsAppInbox,
  type UnionWhatsAppConversation, type UnionWhatsAppMessage,
  type UnionWhatsAppSharedTab,
} from "../infrastructure/union-whatsapp-inbox.repository";
import { systemErrorMessage } from "@/shared/domain/error-message";

type Section={items:UnionWhatsAppMessage[];loaded:boolean;loading:boolean;hasMore:boolean;error:string;page:number};
const empty=():Section=>({items:[],loaded:false,loading:false,hasMore:false,error:"",page:0});
const labels:{key:UnionWhatsAppSharedTab;label:string}[]=[
  {key:"media",label:"Mídias"},{key:"documents",label:"Documentos"},{key:"links",label:"Links"},
];

// Signed URLs expire after 120 seconds. Reuse only inside their safe lifetime,
// never persist private media URLs in localStorage or the contact directory.
const urlCache=new Map<string,{url:string|null;until:number}>();
const pending=new Map<string,Promise<string|null>>();
const jobs:Array<()=>void>=[];
let active=0;
function nextJob(){
  if(active>=2)return;
  const job=jobs.shift();
  if(!job)return;
  active++;
  job();
}
function signedMedia(organization:string,conversation:string,messageId:string){
  const key=organization+":"+conversation+":"+messageId;
  const cached=urlCache.get(key);
  if(cached&&cached.until>Date.now())return Promise.resolve(cached.url);
  const previous=pending.get(key);
  if(previous)return previous;
  const job=new Promise<string|null>(resolve=>{
    jobs.push(()=>{
      void operateUnionWhatsAppInbox(organization,conversation,"media_view",{message_id:messageId})
        .then(data=>{
          const url=typeof data.url==="string"&&data.url.startsWith("https://")?data.url:null;
          urlCache.set(key,{url,until:Date.now()+(url?100_000:60_000)});
          if(urlCache.size>160)urlCache.delete(urlCache.keys().next().value||"");
          resolve(url);
        }).catch(()=>{
          urlCache.set(key,{url:null,until:Date.now()+45_000});
          resolve(null);
        }).finally(()=>{
          pending.delete(key);
          active--;
          nextJob();
        });
    });
    nextJob();
  });
  pending.set(key,job);
  return job;
}
function sharedDate(value:string){
  const date=new Date(value);
  return Number.isFinite(date.getTime())?date.toLocaleDateString("pt-BR"):"";
}
function safeLinks(value:string){
  const links=String(value||"").match(/https?:\/\/[^\s<>"']+|www\.[^\s<>"']+/gi)||[];
  return [...new Set(links.map(value=>value.replace(/[),.;!?]+$/g,"")).filter(Boolean))].slice(0,10)
    .map(value=>value.startsWith("www.")?"https://"+value:value)
    .filter(value=>{try{return ["https:","http:"].includes(new URL(value).protocol);}catch{return false;}});
}
function MediaTile({item,organization,conversation,onOpen}:{
  item:UnionWhatsAppMessage;organization:string;conversation:string;onOpen:()=>void;
}){
  const node=useRef<HTMLButtonElement|null>(null);
  const [visible,setVisible]=useState(false);
  const [url,setUrl]=useState<string|null>(null);
  useEffect(()=>{
    if(item.message_type!=="image"&&item.message_type!=="sticker")return;
    const target=node.current;
    if(!target)return;
    if(typeof IntersectionObserver==="undefined"){setVisible(true);return;}
    const observer=new IntersectionObserver(([entry])=>setVisible(Boolean(entry?.isIntersecting)),
      {rootMargin:"80px",threshold:0});
    observer.observe(target);
    return()=>observer.disconnect();
  },[item.id,item.message_type]);
  useEffect(()=>{
    if(!visible)return;
    let cancelled=false;
    void signedMedia(organization,conversation,item.id).then(value=>{if(!cancelled)setUrl(value);});
    return()=>{cancelled=true;};
  },[visible,item.id,organization,conversation]);
  return <button ref={node} type="button" onClick={onOpen}
    aria-label={"Abrir "+(item.media_name||"mídia")+" de "+sharedDate(item.sent_at)}
    className="relative aspect-square min-w-0 overflow-hidden rounded-lg border border-border bg-muted/40 hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
    {url&&(item.message_type==="image"||item.message_type==="sticker")
      ?<img src={url} loading="lazy" alt="" className="h-full w-full object-cover"
        onError={()=>setUrl(null)}/>
      :<span className="flex h-full w-full items-center justify-center text-muted-foreground">
        {item.message_type==="video"?<Video size={25}/>:item.message_type==="audio"?<Music2 size={25}/>:<ImageIcon size={25}/>}
      </span>}
    {item.message_type==="video"&&<Play size={18} className="absolute bottom-2 right-2 text-foreground"/>}
    <span className="absolute bottom-0 inset-x-0 truncate bg-black/55 px-1.5 py-1 text-[10px] text-white">
      {sharedDate(item.sent_at)}
    </span>
  </button>;
}

export function UnionWhatsAppContactDetails({conversation,organizationId,gender,onClose,onEdit}:{
  conversation:UnionWhatsAppConversation;
  organizationId:string;
  gender?:string|null;
  onClose:()=>void;
  onEdit?:()=>void;
}){
  const [tab,setTab]=useState<UnionWhatsAppSharedTab>("media");
  const [sections,setSections]=useState<Record<UnionWhatsAppSharedTab,Section>>({
    media:empty(),documents:empty(),links:empty(),
  });
  const requests=useRef(new Set<UnionWhatsAppSharedTab>());
  const [preview,setPreview]=useState<{url:string;type:string;name:string}|null>(null);
  const [previewError,setPreviewError]=useState("");
  const [previewLoading,setPreviewLoading]=useState(false);
  const name=conversation.contact_name||"Contato WhatsApp";
  const section=sections[tab];

  const fetchPage=useCallback(async(key:UnionWhatsAppSharedTab,page:number)=>{
    if(requests.current.has(key))return;
    requests.current.add(key);
    setSections(current=>({...current,[key]:{...current[key],loading:true,error:""}}));
    try{
      const result=await listUnionWhatsAppSharedItems(organizationId,conversation.id,
        conversation.channel_id,conversation.account_phone,key,page);
      setSections(current=>{
        const stored=current[key];
        const unique=new Map<string,UnionWhatsAppMessage>((page===0?[]:stored.items)
          .map((item):[string,UnionWhatsAppMessage]=>[item.id,item]));
        result.items.forEach(item=>unique.set(item.id,item));
        return {...current,[key]:{items:[...unique.values()],loaded:true,loading:false,
          hasMore:result.hasMore,page,error:""}};
      });
    }catch(error){
      setSections(current=>({...current,[key]:{...current[key],loaded:true,loading:false,
        error:systemErrorMessage(error,"Não foi possível consultar o histórico.")}}));
    }finally{requests.current.delete(key);}
  },[organizationId,conversation.id,conversation.channel_id,conversation.account_phone]);
  useEffect(()=>{
    if(!sections[tab].loaded&&!sections[tab].loading)void fetchPage(tab,0);
  },[tab,sections,fetchPage]);
  useEffect(()=>{
    const onKey=(event:KeyboardEvent)=>{
      if(event.key==="Escape"){event.stopPropagation();if(preview)setPreview(null);else onClose();}
    };
    document.addEventListener("keydown",onKey,true);
    return()=>document.removeEventListener("keydown",onKey,true);
  },[onClose,preview]);

  const openShared=async(item:UnionWhatsAppMessage)=>{
    if(previewLoading)return;
    setPreviewError("");setPreviewLoading(true);
    try{
      const url=await signedMedia(organizationId,conversation.id,item.id);
      if(!url){setPreviewError("Este arquivo não está mais disponível.");return;}
      setPreview({url,type:item.message_type,
        name:item.media_name||({image:"Imagem",audio:"Áudio",video:"Vídeo",sticker:"Figurinha"} as Record<string,string>)[item.message_type]||"Documento"});
    }finally{setPreviewLoading(false);}
  };
  return <div className="absolute inset-0 z-[40] flex justify-end bg-black/25" role="presentation"
    onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}>
    <aside role="dialog" aria-modal="true" aria-label={"Detalhes do contato "+name}
      className="flex h-full min-h-0 w-full max-w-[420px] flex-col border-l border-border bg-card text-foreground shadow-xl">
      <div className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4">
        <button type="button" aria-label="Voltar à conversa" onClick={onClose}
          className="rounded-lg p-1.5 hover:bg-muted"><ArrowLeft size={20}/></button>
        <h2 className="min-w-0 flex-1 truncate text-base font-bold">Dados do contato</h2>
        {onEdit&&<button type="button" onClick={onEdit} aria-label="Editar contato" title="Editar contato"
          className="rounded-lg p-1.5 hover:bg-muted"><Pencil size={17}/></button>}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="flex flex-col items-center gap-2 border-b border-border px-5 py-6 text-center">
          <div className="rounded-full ring-4 ring-primary/10">
            <WhatsAppContactAvatar name={name} size="detail"
              identity={{organizationId,accountPhone:conversation.account_phone,
                chatJid:conversation.chat_jid,conversationId:conversation.id}} gender={gender}/>
          </div>
          <h3 className="max-w-full break-words text-lg font-bold">{name}</h3>
          <p className="text-sm text-muted-foreground">{formatWhatsAppPhone(conversation.contact_phone)}</p>
          <p className="text-xs text-muted-foreground">WhatsApp · Histórico desta conversa</p>
        </div>
        <div className="border-b border-border px-4 py-4">
          <div className="flex items-center gap-2 text-sm font-bold">
            <ImageIcon size={17} className="text-muted-foreground"/> Mídias, documentos e links
          </div>
          <div role="tablist" aria-label="Arquivos compartilhados" className="mt-3 grid grid-cols-3 gap-1 rounded-lg bg-muted/50 p-1">
            {labels.map(item=><button key={item.key} type="button" role="tab"
              aria-selected={tab===item.key} onClick={()=>setTab(item.key)}
              className={"rounded-md px-2 py-2 text-xs font-semibold transition-colors "+
                (tab===item.key?"bg-card text-primary shadow-sm":"text-muted-foreground hover:text-foreground")}>
              {item.label}
            </button>)}
          </div>
          <div className="mt-3 min-h-32">
            {section.loading&&section.items.length===0?<div role="status" aria-label="Carregando arquivos"
              className="grid grid-cols-3 gap-2">
              {[0,1,2,3,4,5].map(n=><div key={n} className="aspect-square animate-pulse rounded-lg bg-muted"/>)}
            </div> : section.error&&section.items.length===0 ?
              <div role="alert" className="py-5 text-center text-xs text-destructive">
                {section.error}
                <button type="button" onClick={()=>void fetchPage(tab,0)}
                  className="ml-2 font-semibold text-primary underline">Tentar novamente</button>
              </div> : section.items.length===0 ?
              <p className="py-8 text-center text-xs text-muted-foreground">
                {tab==="media"?"Nenhuma mídia compartilhada.":tab==="documents"?"Nenhum documento compartilhado.":"Nenhum link compartilhado."}
              </p> : tab==="media" ?
              <div className="grid grid-cols-3 gap-2">
                {section.items.map(item=><MediaTile key={item.id} item={item}
                  organization={organizationId} conversation={conversation.id}
                  onOpen={()=>void openShared(item)}/>)}
              </div> : tab==="documents" ?
              <div className="divide-y divide-border">
                {section.items.map(item=><button key={item.id} type="button" onClick={()=>void openShared(item)}
                  className="flex w-full items-center gap-3 py-3 text-left hover:bg-muted/40">
                  <span className="rounded-lg bg-primary/10 p-2 text-primary"><FileText size={19}/></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold">{item.media_name||"Documento"}</span>
                    <span className="text-[11px] text-muted-foreground">{sharedDate(item.sent_at)}</span>
                  </span><ExternalLink size={15} className="text-muted-foreground"/>
                </button>)}
              </div> : <div className="divide-y divide-border">
                {section.items.flatMap(item=>safeLinks(item.body_text).map(url=>(
                  <a key={item.id+url} href={url} target="_blank" rel="noopener noreferrer"
                    className="flex min-w-0 items-center gap-3 py-3 hover:bg-muted/40">
                    <span className="rounded-lg bg-primary/10 p-2 text-primary"><LinkIcon size={18}/></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold text-primary">{url}</span>
                      <span className="text-[11px] text-muted-foreground">{sharedDate(item.sent_at)}</span>
                    </span><ExternalLink size={15} className="shrink-0 text-muted-foreground"/>
                  </a>
                )))}
              </div>}
            {section.hasMore&&<button type="button" disabled={section.loading}
              onClick={()=>void fetchPage(tab,section.page+1)}
              className="mt-3 w-full rounded-lg border border-border px-3 py-2 text-xs font-semibold text-primary hover:bg-muted disabled:opacity-50">
              {section.loading?"Carregando...":"Mostrar mais"}
            </button>}
          </div>
        </div>
        <div className="px-4 py-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-2"><CalendarDays size={15}/>
            Conversa iniciada em {sharedDate(conversation.created_at)}</div>
          <p className="mt-2">As mídias e documentos usam o histórico desta conversa e respeitam as permissões do CRM.</p>
        </div>
      </div>
    </aside>
    {previewLoading&&<div role="status"
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/55">
      <LoaderCircle size={27} className="animate-spin text-white"/>
    </div>}
    {preview&&<div role="dialog" aria-modal="true" aria-label="Visualizar arquivo"
      className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/90 p-4">
      <button type="button" onClick={()=>setPreview(null)} aria-label="Fechar visualização"
        className="absolute right-4 top-4 rounded-full bg-white/15 p-2 text-white hover:bg-white/25">
        <X size={23}/>
      </button>
      {preview.type==="image"||preview.type==="sticker"
        ?<img src={preview.url} alt={preview.name} className="max-h-[78%] max-w-full object-contain"/>
        :preview.type==="video"
          ?<video controls autoPlay={false} src={preview.url} className="max-h-[75%] max-w-full"/>
          :preview.type==="audio"
            ?<audio controls src={preview.url} className="w-full max-w-sm"/>
            :<FileText size={54} className="text-white"/>}
      <div className="flex max-w-full items-center gap-3">
        <span className="min-w-0 truncate text-sm text-white">{preview.name}</span>
        <a href={preview.url} target="_blank" rel="noopener noreferrer"
          className="shrink-0 rounded-md bg-white px-3 py-2 text-xs font-bold text-gray-900">Abrir arquivo</a>
      </div>
    </div>}
    {previewError&&<div role="alert" className="absolute bottom-4 left-4 right-4 z-50 rounded-lg border border-destructive/30 bg-card p-3 text-xs text-destructive">
      {previewError}
      <button type="button" className="ml-3 font-semibold underline"
        onClick={()=>setPreviewError("")}>Fechar</button>
    </div>}
  </div>;
}
