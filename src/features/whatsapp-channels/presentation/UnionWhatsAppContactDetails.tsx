import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { ArrowLeft, CalendarDays, History, ExternalLink, FileText, Image as ImageIcon, Link as LinkIcon, LoaderCircle, Music2, Pencil, Play, Video } from "lucide-react";
import { WhatsAppContactAvatar, formatWhatsAppPhone } from "./WhatsAppInboxVisuals";
import {
  listUnionWhatsAppSharedItems, listContactOnlyHistoricalSharedItems, operateUnionWhatsAppInbox, getHistoricalWhatsAppMedia,
  type UnionWhatsAppConversation, type UnionWhatsAppMessage,
  type UnionWhatsAppSharedTab, type UnionWhatsAppMessageCursor,
} from "../infrastructure/union-whatsapp-inbox.repository";
import { systemErrorMessage } from "@/shared/domain/error-message";
import { UnionWhatsAppContactHistory } from "./UnionWhatsAppContactHistory";
import { UnionWhatsAppMediaViewer } from "./UnionWhatsAppMediaViewer";
import { FutureOpportunityContactSection } from "./FutureOpportunities";

type Section={items:UnionWhatsAppMessage[];loaded:boolean;loading:boolean;hasMore:boolean;error:string;nextCursor:UnionWhatsAppMessageCursor|null};
const empty=():Section=>({items:[],loaded:false,loading:false,hasMore:false,error:"",nextCursor:null});
const labels:{key:UnionWhatsAppSharedTab;label:string}[]=[
  {key:"media",label:"Mídias"},{key:"documents",label:"Documentos"},{key:"links",label:"Links"},
];

// Signed URLs expire after 120 seconds. Reuse only inside their safe lifetime,
// never persist private media URLs in localStorage or the contact directory.
type SharedMediaLinks={url:string;downloadUrl:string|null};
const urlCache=new Map<string,{links:SharedMediaLinks|null;until:number}>();
const pending=new Map<string,Promise<SharedMediaLinks|null>>();
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
  if(cached&&cached.until>Date.now())return Promise.resolve(cached.links);
  const previous=pending.get(key);
  if(previous)return previous;
  const job=new Promise<SharedMediaLinks|null>(resolve=>{
    jobs.push(()=>{
      void operateUnionWhatsAppInbox(organization,conversation,"media_view",{message_id:messageId})
        .then(data=>{
          const url=typeof data.url==="string"&&data.url.startsWith("https://")?data.url:null;
          const links=url?{url,downloadUrl:typeof data.download_url==="string" &&
            data.download_url.startsWith("https://")?data.download_url:null}:null;
          urlCache.set(key,{links,until:Date.now()+(links?100_000:60_000)});
          if(urlCache.size>160)urlCache.delete(urlCache.keys().next().value||"");
          resolve(links);
        }).catch(()=>{
          urlCache.set(key,{links:null,until:Date.now()+45_000});
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
    if(!visible||item.read_only)return;
    let cancelled=false;
    void signedMedia(organization,conversation,item.id).then(value=>{if(!cancelled)setUrl(value?.url||null);});
    return()=>{cancelled=true;};
  },[visible,item.id,organization,conversation]);
  return <button ref={node} type="button" onClick={onOpen}
    aria-label={"Abrir "+(item.media_name||"mídia")+" de "+(item.unknown_date?"Data não registrada":sharedDate(item.sent_at))}
    className="relative aspect-square min-w-0 overflow-hidden rounded-lg border border-border bg-muted/40 hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
    {url&&(item.message_type==="image"||item.message_type==="sticker")
      ?<img src={url} loading="lazy" alt="" className="h-full w-full object-cover"
        onError={()=>setUrl(null)}/>
      :<span className="flex h-full w-full items-center justify-center text-muted-foreground">
        {item.message_type==="video"?<Video size={25}/>:item.message_type==="audio"?<Music2 size={25}/>:<ImageIcon size={25}/>}
      </span>}
    {item.message_type==="video"&&<Play size={18} className="absolute bottom-2 right-2 text-foreground"/>}
    <span className="absolute bottom-0 inset-x-0 truncate bg-black/55 px-1.5 py-1 text-[10px] text-white">
      {(item.unknown_date?"Data não registrada":sharedDate(item.sent_at))}
    </span>
  </button>;
}

type ContactDetailsProps={
  conversation?:UnionWhatsAppConversation;
  archiveContact?:{id:string;channelId:string;accountPhone:string;name:string};
  organizationId:string;
  gender?:string|null;
  onClose:()=>void;
  onEdit?:()=>void;
  inline?:boolean;
  canRecordOpportunity?:boolean;
};
export function UnionWhatsAppContactDetails(props:ContactDetailsProps){
  const scope=[props.organizationId,props.conversation?.id||props.archiveContact?.id,props.conversation?.channel_id||props.archiveContact?.channelId,props.conversation?.account_phone||props.archiveContact?.accountPhone,props.conversation?"conversation":"archive"].join(":");
  return <ContactDetailsContent key={scope} {...props}/>;
}
function ContactDetailsContent({conversation,archiveContact,organizationId,gender,onClose,onEdit,inline=false,canRecordOpportunity=true}:ContactDetailsProps){
  const [tab,setTab]=useState<UnionWhatsAppSharedTab>("media");
  const [historyOpen,setHistoryOpen]=useState(false);
  const [sections,setSections]=useState<Record<UnionWhatsAppSharedTab,Section>>({
    media:empty(),documents:empty(),links:empty(),
  });
  const requests=useRef(new Set<UnionWhatsAppSharedTab>());
  const drawerRef=useRef<HTMLElement|null>(null);
  const [preview,setPreview]=useState<{url:string;downloadUrl:string|null;type:string;name:string}|null>(null);
  const [previewError,setPreviewError]=useState("");
  const [previewLoading,setPreviewLoading]=useState(false);
  const name=conversation?.contact_name||archiveContact?.name||"Contato WhatsApp";
  const scopeId=conversation?.id||archiveContact?.id||"";
  const section=sections[tab];

  const fetchPage=useCallback(async(key:UnionWhatsAppSharedTab,before:UnionWhatsAppMessageCursor|null)=>{
    if(requests.current.has(key))return;
    requests.current.add(key);
    setSections(current=>({...current,[key]:{...current[key],loading:true,error:""}}));
    try{
      const result=conversation
        ?await listUnionWhatsAppSharedItems(organizationId,conversation.id,
          conversation.channel_id,conversation.account_phone,key,before)
        :archiveContact
          ?await listContactOnlyHistoricalSharedItems(organizationId,archiveContact.id,archiveContact.channelId,archiveContact.accountPhone,key,before)
          :{items:[],hasMore:false,nextCursor:null};
      setSections(current=>{
        const stored=current[key];
        const unique=new Map<string,UnionWhatsAppMessage>((!before?[]:stored.items)
          .map((item):[string,UnionWhatsAppMessage]=>[item.id,item]));
        result.items.forEach(item=>unique.set(item.id,item));
        return {...current,[key]:{items:[...unique.values()],loaded:true,loading:false,
          hasMore:result.hasMore,nextCursor:result.nextCursor,error:""}};
      });
    }catch(error){
      setSections(current=>({...current,[key]:{...current[key],loaded:true,loading:false,
        error:systemErrorMessage(error,"Não foi possível consultar o histórico.")}}));
    }finally{requests.current.delete(key);}
  },[organizationId,conversation?.id,conversation?.channel_id,conversation?.account_phone,archiveContact?.id,archiveContact?.channelId,archiveContact?.accountPhone]);
  useEffect(()=>{
    if(!sections[tab].loaded&&!sections[tab].loading)void fetchPage(tab,null);
  },[tab,sections,fetchPage]);
  const requestClose=useCallback((event:ReactMouseEvent<HTMLButtonElement>|KeyboardEvent)=>{
    // Close on the completed click, never between pointerdown and click.
    event.preventDefault();
    event.stopPropagation();
    onClose();
  },[onClose]);
  useEffect(()=>{
    if(inline||preview)return;
    const onKey=(event:KeyboardEvent)=>{
      if(event.key!=="Escape"||event.defaultPrevented)return;
      const target=event.target instanceof Element?event.target:null;
      const activeDialog=target?.closest('[role="dialog"],[role="alertdialog"]');
      // A child editor/media modal owns its own Escape; an ancestor conversation does not.
      if(activeDialog && activeDialog!==drawerRef.current &&
          !activeDialog.contains(drawerRef.current))return;
      requestClose(event);
    };
    window.addEventListener("keydown",onKey,true);
    return()=>window.removeEventListener("keydown",onKey,true);
  },[requestClose,preview,inline]);

  const openShared=async(item:UnionWhatsAppMessage)=>{
    if(previewLoading)return;
    setPreviewError("");setPreviewLoading(true);
    try{
      const asset=item.historical_attachments?.[0];
      const links=item.read_only?(asset?.available?{url:(await getHistoricalWhatsAppMedia(item,asset.id)).url,downloadUrl:null}:null):conversation?await signedMedia(organizationId,conversation.id,item.id):null;
      if(!links){setPreviewError("Este arquivo não está mais disponível.");return;}
      setPreview({url:links.url,downloadUrl:links.downloadUrl,type:item.message_type,
        name:item.media_name||({image:"Imagem",audio:"Áudio",video:"Vídeo",sticker:"Figurinha"} as Record<string,string>)[item.message_type]||"Documento"});
    }catch{setPreviewError("Não foi possível abrir este arquivo. Tente novamente.");}finally{setPreviewLoading(false);}
  };
  return <div data-contact-details-root="true" className={inline?"relative w-full":"absolute inset-0 z-[40] flex justify-end"} role="presentation">
    {!inline&&<button type="button" aria-label="Fechar detalhes ao clicar fora"
      onClick={requestClose}
      className="fixed inset-0 cursor-default bg-transparent"/>}
    <aside ref={drawerRef} role={inline?undefined:"dialog"} aria-modal={inline?undefined:false} aria-label={"Detalhes do contato "+name}
      className={inline
        ?"relative flex w-full min-h-[230px] flex-col overflow-hidden rounded-xl border border-border bg-card text-foreground"
        :"relative z-10 flex h-full min-h-0 w-full max-w-[420px] flex-col border-l border-border bg-card text-foreground"}>
      {!inline&&<div className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-4">
        <button type="button" aria-label="Voltar à conversa"
          onClick={requestClose}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border bg-card text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"><ArrowLeft size={20}/></button>
        <h2 className="min-w-0 flex-1 truncate text-base font-bold">Dados do contato</h2>
        <button type="button" onClick={()=>setHistoryOpen(value=>!value)}
          aria-expanded={historyOpen} aria-label="Histórico geral do contato" title="Histórico geral do contato"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-foreground hover:bg-muted"><History size={18}/></button>
        {onEdit&&<button type="button" onClick={onEdit} aria-label="Editar contato" title="Editar contato"
          className="admin-action-blue-outline inline-flex h-9 w-9 items-center justify-center rounded-lg border"><Pencil size={17}/></button>}
      </div>}
      <div className={inline?"w-full":"min-h-0 flex-1 overflow-y-auto overscroll-contain"}>
        {!inline&&conversation&&<div className="flex flex-col items-center gap-2 border-b border-border px-5 py-6 text-center">
          <div className="rounded-full ring-4 ring-primary/10">
            <WhatsAppContactAvatar name={name} size="detail"
              identity={{organizationId,accountPhone:conversation.account_phone,
                chatJid:conversation.chat_jid,conversationId:conversation.id}} gender={gender}/>
          </div>
          <h3 className="max-w-full break-words text-lg font-bold">{name}</h3>
          <p className="text-sm text-muted-foreground">{formatWhatsAppPhone(conversation.contact_phone)}</p>
          <p className="text-xs text-muted-foreground">WhatsApp · Histórico desta conversa</p>
        </div>}
        {conversation&&<FutureOpportunityContactSection identity={{
          organization_id:organizationId,channel_id:conversation.channel_id,
          account_phone:conversation.account_phone,chat_jid:conversation.chat_jid,
          conversation_id:conversation.id,contact_name:conversation.contact_name,
          contact_phone:conversation.contact_phone,
        }} canEdit={canRecordOpportunity}/> }
        {historyOpen&&conversation&&<div className="border-b border-border px-4 py-4">
          <h3 className="mb-3 text-sm font-bold">Histórico geral do contato</h3>
          <UnionWhatsAppContactHistory organizationId={organizationId} conversation={conversation}/>
        </div>}
        <div className={inline?"px-4 py-4":"border-b border-border px-4 py-4"}>
          <div className="flex items-center gap-2 text-sm font-bold">
            <ImageIcon size={17} className="text-muted-foreground"/> Mídias, documentos e links
          </div>
          <div role="tablist" aria-label="Arquivos compartilhados" className="mt-3 grid grid-cols-3 gap-1 rounded-lg bg-muted/50 p-1">
            {labels.map(item=><button key={item.key} type="button" role="tab"
              aria-selected={tab===item.key} onClick={()=>setTab(item.key)}
              className={"min-h-9 rounded-md border px-2 py-2 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 "+
                (tab===item.key
                  ?"border-primary/35 bg-primary/10 text-primary shadow-sm dark:border-[#899dff]/50 dark:bg-[#1e2d58] dark:text-[#c3ceff]"
                  :"border-transparent text-muted-foreground hover:border-border hover:bg-card hover:text-foreground")}>
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
                <button type="button" onClick={()=>void fetchPage(tab,null)}
                  className="ml-2 font-semibold text-primary underline">Tentar novamente</button>
              </div> : section.items.length===0 ?
              <p className="py-8 text-center text-xs text-muted-foreground">
                {tab==="media"?"Nenhuma mídia compartilhada.":tab==="documents"?"Nenhum documento compartilhado.":"Nenhum link compartilhado."}
              </p> : tab==="media" ?
              <div className="grid grid-cols-3 gap-2">
                {section.items.map(item=><MediaTile key={item.id} item={item}
                  organization={organizationId} conversation={scopeId}
                  onOpen={()=>void openShared(item)}/>)}
              </div> : tab==="documents" ?
              <div className="divide-y divide-border">
                {section.items.map(item=><button key={item.id} type="button" onClick={()=>void openShared(item)}
                  className="flex w-full items-center gap-3 py-3 text-left hover:bg-muted/40">
                  <span className="rounded-lg bg-primary/10 p-2 text-primary"><FileText size={19}/></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold">{item.media_name||"Documento"}</span>
                    <span className="text-[11px] text-muted-foreground">{(item.unknown_date?"Data não registrada":sharedDate(item.sent_at))}</span>
                  </span><ExternalLink size={15} className="text-muted-foreground"/>
                </button>)}
              </div> : <div className="divide-y divide-border">
                {section.items.flatMap(item=>safeLinks(item.body_text).map(url=>(
                  <a key={item.id+url} href={url} target="_blank" rel="noopener noreferrer"
                    className="flex min-w-0 items-center gap-3 py-3 hover:bg-muted/40">
                    <span className="rounded-lg bg-primary/10 p-2 text-primary"><LinkIcon size={18}/></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold text-primary">{url}</span>
                      <span className="text-[11px] text-muted-foreground">{(item.unknown_date?"Data não registrada":sharedDate(item.sent_at))}</span>
                    </span><ExternalLink size={15} className="shrink-0 text-muted-foreground"/>
                  </a>
                )))}
              </div>}
            {section.hasMore&&<button type="button" disabled={section.loading}
              onClick={()=>void fetchPage(tab,section.nextCursor)}
              className="mt-3 w-full rounded-lg border border-border px-3 py-2 text-xs font-semibold text-primary hover:bg-muted disabled:opacity-50">
              {section.loading?"Carregando...":"Mostrar mais"}
            </button>}
          </div>
        </div>
        {!inline&&conversation&&<div className="px-4 py-4 text-xs text-muted-foreground">
          <div className="flex items-center gap-2"><CalendarDays size={15}/>
            Conversa iniciada em {sharedDate(conversation.created_at)}</div>
          <p className="mt-2">As mídias e documentos usam o histórico desta conversa e respeitam as permissões do CRM.</p>
        </div>}
      </div>
    </aside>
    {previewLoading&&<div role="status"
      className={inline?"pointer-events-auto fixed inset-0 z-[80] flex items-center justify-center bg-black/55":"pointer-events-auto absolute inset-0 z-50 flex items-center justify-center bg-black/55"}>
      <LoaderCircle size={27} className="animate-spin text-white"/>
    </div>}
    {preview&&<UnionWhatsAppMediaViewer url={preview.url} downloadUrl={preview.downloadUrl} type={preview.type}
      name={preview.name} placement={inline?"viewport":"drawer"}
      onClose={()=>setPreview(null)}/>}
    {previewError&&<div role="alert" className={inline?"fixed bottom-4 left-4 right-4 z-[80] rounded-lg border border-destructive/30 bg-card p-3 text-xs text-destructive":"pointer-events-auto absolute bottom-4 left-4 right-4 z-50 rounded-lg border border-destructive/30 bg-card p-3 text-xs text-destructive"}>
      {previewError}
      <button type="button" className="ml-3 font-semibold underline"
        onClick={()=>setPreviewError("")}>Fechar</button>
    </div>}
  </div>;
}
