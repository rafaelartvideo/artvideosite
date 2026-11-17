import { operateUnionWhatsAppInbox } from "../infrastructure/union-whatsapp-inbox.repository";

/**
 * Índice único de foto por empresa + conta + identidade do WhatsApp.
 * Os bytes ficam no bucket PRIVADO existente; guardamos somente a URL
 * assinada, que é reutilizada enquanto válida e nunca vai para localStorage.
 */
export type SharedAvatarIdentity={
  organizationId:string;
  accountPhone:string;
  chatJid:string;
  conversationId?:string|null;
};

type Entry={url:string|null;expiresAt:number;error:boolean};
const FOUND_TTL=85*60_000; // abaixo dos 120 minutos da URL assinada do backend
const MISSING_TTL=60*60_000;
const ERROR_BACKOFF=3*60_000;
const MAX_ENTRIES=160;
const MAX_CONCURRENT=3;
const cache=new Map<string,Entry>();
const pending=new Map<string,Promise<string|null>>();
const watchers=new Map<string,Set<()=>void>>();
const queue:Array<()=>void>=[];
let running=0;

export function sharedAvatarKey(identity:SharedAvatarIdentity):string{
  if(!identity.organizationId||!identity.accountPhone||!identity.chatJid)return "";
  return identity.organizationId+":"+identity.accountPhone+":"+identity.chatJid;
}
function notify(key:string){
  watchers.get(key)?.forEach(callback=>callback());
}
export function subscribeSharedAvatar(key:string,callback:()=>void):()=>void{
  if(!key)return ()=>{};
  let subscribers=watchers.get(key);
  if(!subscribers){subscribers=new Set();watchers.set(key,subscribers);}
  subscribers.add(callback);
  return ()=>{
    subscribers?.delete(callback);
    if(!subscribers?.size)watchers.delete(key);
  };
}
export function peekSharedAvatar(key:string):string|null|undefined{
  if(!key)return null;
  const item=cache.get(key);
  if(!item||Date.now()>=item.expiresAt)return undefined;
  // LRU: URLs iguais são reutilizadas entre mini, inbox, agenda e edição.
  cache.delete(key);
  cache.set(key,item);
  return item.url;
}
function remember(key:string,url:string|null,ttl:number,error=false){
  cache.delete(key);
  cache.set(key,{url,expiresAt:Date.now()+ttl,error});
  while(cache.size>MAX_ENTRIES){
    const oldest=cache.keys().next().value;
    if(!oldest)break;
    cache.delete(oldest);
    notify(oldest);
  }
  notify(key);
}
function runNext(){
  if(running>=MAX_CONCURRENT)return;
  const task=queue.shift();
  if(!task)return;
  running++;
  task();
}
export function fetchSharedAvatar(identity:SharedAvatarIdentity):Promise<string|null>{
  const key=sharedAvatarKey(identity);
  if(!key)return Promise.resolve(null);
  const stored=peekSharedAvatar(key);
  if(stored!==undefined)return Promise.resolve(stored);
  const previous=pending.get(key);
  if(previous)return previous;
  const task=new Promise<string|null>(resolve=>{
    queue.push(()=>{
      const args=identity.conversationId
        ? {id:identity.conversationId,action:"contact_avatar" as const,body:undefined}
        : {id:crypto.randomUUID(),action:"contacts_avatar" as const,body:{chat_jid:identity.chatJid}};
      void operateUnionWhatsAppInbox(identity.organizationId,args.id,args.action,args.body)
        .then(data=>{
          const url=typeof data.avatar_url==="string"&&data.avatar_url.startsWith("https://")
            ?data.avatar_url:null;
          remember(key,url,url?FOUND_TTL:MISSING_TTL);
          resolve(url);
        })
        .catch(()=>{
          remember(key,null,ERROR_BACKOFF,true);
          resolve(null);
        })
        .finally(()=>{
          pending.delete(key);
          running--;
          runNext();
        });
    });
    runNext();
  });
  pending.set(key,task);
  return task;
}
/** Uma URL assinada quebrada nunca mantém o loading girando nem cria retry em loop. */
export function markSharedAvatarBroken(key:string,url:string){
  if(!key)return;
  const entry=cache.get(key);
  if(entry?.url===url || !entry){
    remember(key,null,ERROR_BACKOFF,true);
  }
}
/** Chamado ao trocar de empresa ou sair da sessão; nenhuma foto passa entre empresas. */
export function clearSharedAvatarCache(){
  cache.clear();
  watchers.forEach(subscribers=>subscribers.forEach(callback=>callback()));
}
