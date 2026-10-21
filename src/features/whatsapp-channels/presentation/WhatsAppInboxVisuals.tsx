import { useEffect, useState, type ReactNode } from "react";
import { LoaderCircle } from "lucide-react";

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
export function waitingClasses(minutes: number): string {
  if (minutes>=15) return "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300";
  if (minutes>=5) return "border-orange-500/40 bg-orange-500/10 text-orange-700 dark:text-orange-300";
  return "border-amber-500/35 bg-amber-500/10 text-amber-700 dark:text-amber-300";
}

export function WhatsAppContactAvatar({name,src,selected=false,size="list",onError}:{
  name:string;src:string|null|undefined;selected?:boolean;size?:"list"|"header"|"detail";onError?:()=>void;
}) {
  const [imageReady,setImageReady]=useState(false);
  useEffect(()=>setImageReady(false),[src]);
  const parts=name.trim().split(/\s+/).filter(Boolean);
  const initials=(parts.length>1 ? parts[0][0]+parts[parts.length-1][0] :
    (parts[0]||"?").slice(0,2)).toUpperCase();
  const loading=src===undefined || Boolean(src && !imageReady);
  return <span className={`relative flex ${size==="detail"?"h-16 w-16":size==="list"?"h-11 w-11":"h-10 w-10"} shrink-0 items-center justify-center overflow-hidden rounded-full text-xs font-black
    ${selected?"bg-primary text-primary-foreground":"bg-muted text-muted-foreground"}`}>
    {src && <img src={src} alt="" referrerPolicy="no-referrer"
      loading="lazy" onLoad={()=>setImageReady(true)} onError={onError}
      className={`absolute inset-0 h-full w-full object-cover ${imageReady?"":"opacity-0"}`}/>}
    {loading
      ? <LoaderCircle size={17} className="animate-spin opacity-70 motion-reduce:animate-none" aria-label="Carregando foto"/>
      : !src ? initials : null}
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
