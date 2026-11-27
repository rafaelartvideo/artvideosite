import {useEffect,useRef,useState} from "react";
import {Download,FileText,Image as ImageIcon,Loader2,Play} from "lucide-react";
import {supabase} from "@/lib/supabase";
import {privateMediaCache,privateMediaKey} from "@/shared/application/private-media-cache";

type Attachment={id:string;attachment_path:string|null;attachment_mime:string|null;body:string};
export async function loadChatAttachment(org:string,uid:string,path:string){
 return privateMediaCache.get<Blob>(privateMediaKey("internal-chat",org,uid,path),120000,async()=>{
  const {data,error}=await supabase.storage.from("internal-chat-files").download(path);
  if(error||!data)throw error??new Error("Arquivo indisponível.");
  return data;
 },false,b=>b.size);
}
export function ChatAttachment({org,uid,message,onPreview,onDownload}:{org:string;uid:string;message:Attachment;onPreview:(url:string,mime:string,name:string)=>void;onDownload:()=>void}){
 const ref=useRef<HTMLDivElement>(null);
 const [visible,setVisible]=useState(false);
 const [url,setUrl]=useState<string|null>(null);
 const [failed,setFailed]=useState(false);
 const [retry,setRetry]=useState(0);
 const mime=message.attachment_mime??(/\.(jpe?g|png|webp|gif)$/i.test(message.body)?"image/legacy":/\.(webm|ogg|mp3|wav|m4a)$/i.test(message.body)?"audio/legacy":"");
 const isImage=mime.startsWith("image/"),isAudio=mime.startsWith("audio/");
 const path=message.attachment_path;
 useEffect(()=>{
  const node=ref.current;if(!node||(!isImage&&!isAudio))return;
  if(typeof IntersectionObserver==="undefined"){setVisible(true);return;}
  const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){setVisible(true);observer.disconnect();}},{rootMargin:"80px"});
  observer.observe(node);return()=>observer.disconnect();
 },[path,isImage,isAudio]);
 useEffect(()=>{
  if(!visible||!path||(!isImage&&!isAudio))return;
  let alive=true,objectUrl:string|null=null;setFailed(false);setUrl(null);
  loadChatAttachment(org,uid,path).then(blob=>{
   if(!alive)return;if(isImage&&!/^image\/(jpeg|png|gif|webp)$/i.test(blob.type)&&blob.type!=="application/octet-stream")throw Error("Formato de imagem inválido.");objectUrl=URL.createObjectURL(blob);setUrl(objectUrl);
  }).catch(()=>{if(alive)setFailed(true);});
  return()=>{alive=false;if(objectUrl)URL.revokeObjectURL(objectUrl);};
 },[org,uid,path,visible,isImage,isAudio,retry]);
 return <div ref={ref} className="min-w-0 max-w-full">
  {isImage?<div className="w-[220px] max-w-full">
   {url?<button type="button" title="Ampliar imagem" aria-label="Ampliar imagem" className="block w-full overflow-hidden rounded-md bg-muted/40" onClick={()=>onPreview(url,mime,message.body)}><img src={url} alt={message.body} className="block max-h-52 w-full object-contain" draggable={false}/></button>:<div className="flex h-28 items-center justify-center rounded-md bg-muted/50 text-muted-foreground">{failed?<button type="button" className="text-xs underline" onClick={()=>setRetry(v=>v+1)}>Tentar carregar novamente</button>:visible?<Loader2 size={20} className="animate-spin"/>:<ImageIcon size={22}/>}</div>}
  </div>:isAudio?<div className="w-[220px] max-w-full">{url?<audio controls preload="metadata" src={url} className="h-9 w-full"/>:failed?<button type="button" className="text-xs underline" onClick={()=>setRetry(v=>v+1)}>Tentar novamente</button>:<span className="flex h-9 items-center gap-2 text-xs"><Play size={15}/>Carregando áudio…</span>}</div>:<button type="button" className="flex max-w-full min-w-0 items-center gap-1.5 text-left" title={message.body} onClick={onDownload}><FileText size={16} className="shrink-0 text-primary"/><span className="min-w-0 break-all text-xs font-medium underline">{message.body}</span><Download size={14} className="shrink-0 text-muted-foreground"/></button>}
 </div>;
}
