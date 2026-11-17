import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  fetchSharedAvatar, markSharedAvatarBroken, peekSharedAvatar,
  peekSharedAvatarGender, rememberSharedAvatarGender,
  sharedAvatarKey, subscribeSharedAvatar, type SharedAvatarIdentity,
} from "../application/shared-whatsapp-avatar-cache";
import maleAvatar from "./assets/avatar-masculino.svg";
import femaleAvatar from "./assets/avatar-feminino.svg";

export function formatWhatsAppPhone(raw: string | null | undefined): string {
  if (!raw) return "Contato WhatsApp";
  const digits=raw.split("@")[0].replace(/\D/g,"");
  const number=digits.startsWith("55") && (digits.length===12 || digits.length===13)
    ?digits.slice(2):digits;
  if (number.length===11) return `+55 (${number.slice(0,2)}) ${number.slice(2,3)} ${number.slice(3,7)}-${number.slice(7)}`;
  if (number.length===10) return `+55 (${number.slice(0,2)}) ${number.slice(2,6)}-${number.slice(6)}`;
  return digits ? "+"+digits : "Contato WhatsApp";
}

export function waitingMinutes(since: string | null | undefined, now: number): number {
  const started=since ? Date.parse(since) : NaN;
  return Number.isFinite(started) ? Math.max(0,Math.floor((now-started)/60000)) : 0;
}
export function waitingLabel(minutes: number): string {
  if (minutes===0) return "há menos de 1 min";
  if (minutes<60) return `há ${minutes} min`;
  const hours=Math.floor(minutes/60);
  return `há ${hours} h${minutes%60 ? ` ${minutes%60} min`:""}`;
}
export function waitingClasses(minutes: number,warning=5,critical=15): string {
  if (minutes>=critical) return "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300";
  if (minutes>=warning) return "border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300";
  return "border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300";
}

export function WhatsAppContactAvatar({name,src,selected=false,size="list",onError,identity,gender}:{
  name:string;
  src?:string|null;
  selected?:boolean;
  size?:"list"|"header"|"detail";
  onError?:()=>void;
  identity?:SharedAvatarIdentity|null;
  gender?:string|null;
}) {
  const key=identity?sharedAvatarKey(identity):"";
  const node=useRef<HTMLSpanElement|null>(null);
  const [visible,setVisible]=useState(false);
  const [sharedUrl,setSharedUrl]=useState<string|null|undefined>(()=>peekSharedAvatar(key));
  const [knownGender,setKnownGender]=useState<string|null>(()=>peekSharedAvatarGender(key));
  const [brokenUrl,setBrokenUrl]=useState<string|null>(null);
  const [imageReady,setImageReady]=useState(false);

  // O mesmo índice assinado alimenta a inbox, mini, agenda e edição.
  useEffect(()=>{
    setSharedUrl(peekSharedAvatar(key));
    setKnownGender(peekSharedAvatarGender(key));
    if(!key)return;
    return subscribeSharedAvatar(key,()=>{
      setSharedUrl(peekSharedAvatar(key));
      setKnownGender(peekSharedAvatarGender(key));
    });
  },[key]);
  useEffect(()=>{
    if(key&&gender)rememberSharedAvatarGender(key,gender);
  },[key,gender]);
  useEffect(()=>{
    const element=node.current;
    if(!element || !key){setVisible(false);return;}
    if(typeof IntersectionObserver==="undefined"){setVisible(true);return;}
    const observer=new IntersectionObserver(([entry])=>{
      setVisible(Boolean(entry?.isIntersecting));
    },{rootMargin:"120px 0px",threshold:0});
    observer.observe(element);
    return()=>observer.disconnect();
  },[key]);
  // Somente fotos dentro da área visível entram na fila global (3 por vez).
  useEffect(()=>{
    if(!visible||!key||!identity||sharedUrl!==undefined)return;
    void fetchSharedAvatar(identity);
  },[visible,key,identity?.organizationId,identity?.accountPhone,
    identity?.chatJid,identity?.conversationId,sharedUrl]);

  const candidate=key ? sharedUrl===undefined?(src||null):sharedUrl : src||null;
  const imageUrl=candidate&&candidate!==brokenUrl?candidate:null;
  useEffect(()=>setImageReady(false),[imageUrl]);
  const parts=name.trim().split(/\s+/).filter(Boolean);
  const initials=(parts.length>1 ? parts[0][0]+parts[parts.length-1][0] :
    (parts[0]||"?").slice(0,2)).toUpperCase();
  const genderValue=gender||knownGender;
  const fallback=genderValue==="M"||genderValue==="masculino" ? maleAvatar :
    genderValue==="F"||genderValue==="feminino" ? femaleAvatar : null;
  return <span ref={node} className={`relative flex ${size==="detail"?"h-16 w-16":size==="list"?"h-11 w-11":"h-10 w-10"} shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-black
    ${selected?"bg-primary text-primary-foreground":"bg-muted text-muted-foreground"}`}>
    {/* Nunca travar em spinner: as iniciais ou o desenho padrão ficam visíveis
        enquanto a imagem assíncrona é carregada, ou se ela falhar. */}
    {fallback ? <img src={fallback} alt="" className="absolute inset-0 h-full w-full object-cover"/> :
      <span aria-hidden="true">{initials}</span>}
    {imageUrl && <img src={imageUrl} alt="" referrerPolicy="no-referrer"
      loading="eager" decoding="async"
      onLoad={()=>setImageReady(true)}
      onError={()=>{
        setImageReady(false);
        setBrokenUrl(imageUrl);
        if(key)markSharedAvatarBroken(key,imageUrl);
        onError?.();
      }}
      className={`absolute inset-0 h-full w-full object-cover ${imageReady?"":"opacity-0"}`}/>}
  </span>;
}

function formattedInline(source: string): ReactNode[] {
  const tokens=/(```[\s\S]+?```|\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~|`[^`\n]+`)/g;
  const items: ReactNode[]=[];
  let index=0;
  for(const match of source.matchAll(tokens)){
    const start=match.index ?? index;
    if(start>index)items.push(source.slice(index,start));
    const token=match[0];
    const content=token.startsWith("```")?token.slice(3,-3):token.slice(1,-1);
    if(token.startsWith("```"))items.push(<code key={start} className="rounded bg-black/5 px-1 font-mono text-[0.92em] dark:bg-white/10">{content}</code>);
    else if(token[0]==="*")items.push(<strong key={start} className="font-bold">{content}</strong>);
    else if(token[0]==="_")items.push(<em key={start}>{content}</em>);
    else if(token[0]==="~")items.push(<s key={start}>{content}</s>);
    else items.push(<code key={start} className="rounded bg-black/5 px-1 font-mono text-[0.92em] dark:bg-white/10">{content}</code>);
    index=start+token.length;
  }
  if(index<source.length)items.push(source.slice(index));
  return items;
}

export function WhatsAppFormattedText({text}:{text:string}) {
  return <span className="whitespace-pre-wrap break-words">{formattedInline(text)}</span>;
}
