import { useEffect, useRef, useState } from "react";
import { Users } from "lucide-react";
import { operateUnionWhatsAppInbox } from "../infrastructure/union-whatsapp-inbox.repository";
const cache=new Map<string,{url:string|null;expires:number}>();
const pending=new Map<string,Promise<string|null>>();
export function UnionWhatsAppGroupAvatar({organizationId,accountPhone,groupJid,size="md"}:{
  organizationId:string;accountPhone:string;groupJid:string;size?:"md"|"lg";
}){
  const ref=useRef<HTMLSpanElement|null>(null);
  const [url,setUrl]=useState<string|null>(null);
  const [revision,setRevision]=useState(0);
  const key=organizationId+":"+accountPhone+":"+groupJid;
  useEffect(()=>{
    const invalidate=(event:Event)=>{
      if((event as CustomEvent<{jid:string}>).detail?.jid!==groupJid)return;
      cache.delete(key);setRevision(v=>v+1);
    };
    window.addEventListener("union:whatsapp-group-photo-changed",invalidate);
    return()=>window.removeEventListener("union:whatsapp-group-photo-changed",invalidate);
  },[key,groupJid]);
  useEffect(()=>{
    let cancelled=false;
    const existing=cache.get(key);
    if(existing&&existing.expires>Date.now()){setUrl(existing.url);return;}
    setUrl(null);
    const load=()=>{
      let request=pending.get(key);
      if(!request){
        request=operateUnionWhatsAppInbox(organizationId,crypto.randomUUID(),"contacts_groups_avatar",{
          account_phone:accountPhone,group_jid:groupJid,
        }).then(result=>{
          const value=result.avatar_url||null;
          cache.set(key,{url:value,expires:Date.now()+(value?90*60_000:10*60_000)});
          if(cache.size>150)cache.delete(cache.keys().next().value!);
          return value;
        }).catch(()=>null).finally(()=>pending.delete(key));
        pending.set(key,request);
      }
      void request.then(value=>{if(!cancelled)setUrl(value);});
    };
    const element=ref.current;
    if(!element||typeof IntersectionObserver==="undefined")load();
    else {
      const observer=new IntersectionObserver(entries=>{
        if(entries.some(entry=>entry.isIntersecting)){observer.disconnect();load();}
      },{rootMargin:"100px"});
      observer.observe(element);
      return()=>{cancelled=true;observer.disconnect();};
    }
    return()=>{cancelled=true;};
  },[key,groupJid,accountPhone,organizationId,revision]);
  const large=size==="lg";
  return <span ref={ref} className={"flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10 text-primary "+
    (large?"h-12 w-12":"h-11 w-11")}>
    {url?<img src={url} alt="Foto do grupo" loading="lazy" decoding="async" className="h-full w-full object-cover"
      onError={()=>{cache.delete(key);setUrl(null);}}/>:<Users size={large?23:21}/>}
  </span>;
}
