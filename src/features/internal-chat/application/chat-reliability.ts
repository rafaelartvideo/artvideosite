import { supabase } from "@/lib/supabase";
export type ChatSettings={enabled:boolean;calls_enabled:boolean;groups_enabled:boolean;attachments_enabled:boolean;audio_enabled:boolean;pbx_enabled:boolean;desktop_notifications:boolean;max_file_bytes:number;quota_bytes:number};
export const defaultChatSettings:ChatSettings={enabled:true,calls_enabled:true,groups_enabled:true,attachments_enabled:true,audio_enabled:true,pbx_enabled:true,desktop_notifications:false,max_file_bytes:10485760,quota_bytes:1073741824};
export type PendingText={token:string;peer:string|null;group:string|null;body:string;reply:string|null;mentions?:string[]};
export function readSession<T>(key:string,fallback:T):T{try{return JSON.parse(sessionStorage.getItem(key)??"null")??fallback;}catch{return fallback;}}
export function writeSession(key:string,value:unknown){try{sessionStorage.setItem(key,JSON.stringify(value));}catch{/* Storage disabled. */}}
export async function sendPendingText(org:string,uid:string,item:PendingText){
 const {error}=await supabase.from("internal_chat_messages").insert({organization_id:org,sender_id:uid,recipient_id:item.group?null:item.peer,group_id:item.group,kind:"text",body:item.body,client_token:item.token,reply_to:item.reply,mentions:item.mentions??[]});
 if(!error)return;
 if(error.code==="23505"){
   const {data,error:lookupError}=await supabase.from("internal_chat_messages").select("id").eq("organization_id",org).eq("sender_id",uid).eq("client_token",item.token).maybeSingle();
   if(!lookupError&&data)return;
 }
 throw error;
}
export async function notifyOnce(key:string,callback:()=>void){
 const run=()=>{try{if(localStorage.getItem(key))return;localStorage.setItem(key,String(Date.now()));}catch{/* Browser storage may be unavailable. */}callback();};
 if(navigator.locks){await navigator.locks.request(key,run);return;}
 run();
}
export function pruneNotices(prefix:string){
 try{const now=Date.now();for(let i=localStorage.length-1;i>=0;i--){const k=localStorage.key(i);if(k?.startsWith(prefix)&&now-Number(localStorage.getItem(k))>7*86400000)localStorage.removeItem(k);}}catch{/* Optional. */}
}
export async function compressChatImage(file:File):Promise<File>{
 if(!["image/jpeg","image/png","image/webp"].includes(file.type)||file.size<350000)return file;
 try{
  const bitmap=await createImageBitmap(file);
  const scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));
  const canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
  const ctx=canvas.getContext("2d");if(!ctx){bitmap.close();return file;}
  ctx.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
  const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,"image/webp",.82));
  if(!blob||blob.size>=file.size)return file;
  return new File([blob],file.name.replace(/\.[^.]+$/,"")+".webp",{type:"image/webp"});
 }catch{return file;}
}
