// In-memory, bounded cache. Authorization always originates at Storage or the
// authorized endpoint; never persist tokens, signed URLs or file bytes.
type Entry={value:unknown;until:number;bytes:number};
export function createPrivateMediaCache(now=Date.now){
  let scope:string|null=null,generation=0,totalBytes=0;
  const entries=new Map<string,Entry>(),pending=new Map<string,Promise<unknown>>();
  const releases=new Set<()=>void>();
  const remove=(key:string)=>{const entry=entries.get(key);if(entry){totalBytes-=entry.bytes;entries.delete(key);}};
  function clear(){generation++;entries.clear();pending.clear();totalBytes=0;for(const release of releases){try{release();}catch{}}releases.clear();}
  function setScope(next:string|null){if(next!==scope){clear();scope=next;}}
  async function get<T>(key:string,ttl:number,load:()=>Promise<T>,force=false,size:(value:T)=>number=()=>0):Promise<T>{
    const started=now(),epoch=generation;
    if(!scope){const value=await load();if(epoch!==generation)throw Error("Sessão alterada.");return value;}
    if(force)remove(key);
    const cached=entries.get(key);
    if(cached&&cached.until>started){entries.delete(key);entries.set(key,cached);return cached.value as T;}
    remove(key);
    const existing=pending.get(key);if(existing)return existing as Promise<T>;
    const job=Promise.resolve().then(load).then(value=>{
      if(epoch!==generation)throw Error("Sessão alterada.");
      const bytes=size(value);
      if(bytes<=32*1024*1024&&started+ttl>now()){
        entries.set(key,{value,until:started+ttl,bytes});totalBytes+=bytes;
        while(entries.size>250||totalBytes>32*1024*1024)remove(entries.keys().next().value!);
      }
      return value;
    }).finally(()=>{if(pending.get(key)===job)pending.delete(key);});
    pending.set(key,job);return job;
  }
  function trackRelease(release:()=>void){if(scope)releases.add(release);return ()=>{releases.delete(release);release();};}
  return {get,clear,setScope,invalidate:remove,trackRelease,scopeVersion:()=>generation};
}
export const privateMediaCache=createPrivateMediaCache();
export const privateMediaKey=(...parts:unknown[])=>JSON.stringify(parts);
export function signedUrlSafeMs(seconds:number){return Math.max(0,seconds*1000-Math.min(120_000,seconds*250));}
