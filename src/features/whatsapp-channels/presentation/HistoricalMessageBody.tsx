import { useEffect,useRef,useState } from "react";
import { Download,FileText,Image as ImageIcon,LoaderCircle,MapPin,Mic,Video } from "lucide-react";
import { getHistoricalWhatsAppMedia,type UnionWhatsAppMessage,type UnionWhatsAppHistoricalAttachment } from "../infrastructure/union-whatsapp-inbox.repository";
import { parseWhatsAppLocation } from "../domain/whatsapp-location";
import { WhatsAppFormattedText } from "./WhatsAppInboxVisuals";
import { UnionWhatsAppMediaViewer } from "./UnionWhatsAppMediaViewer";
import { actOnSharedDocument } from "../application/private-media-access";

const kindOf=(asset:UnionWhatsAppHistoricalAttachment)=>{
 const mime=asset.mime.toLowerCase();
 if(mime.startsWith("image/")&&mime!=="image/svg+xml")return asset.kind==="sticker"?"sticker":"image";
 if(mime.startsWith("audio/"))return "audio";
 if(mime.startsWith("video/"))return "video";
 return "file";
};
function Attachment({message,asset}:{message:UnionWhatsAppMessage;asset:UnionWhatsAppHistoricalAttachment}){
 const [url,setUrl]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState(""),[viewer,setViewer]=useState(false);

 const active=useRef(true),gate=useRef(false);
 useEffect(()=>{active.current=true;return()=>{active.current=false}},[]);
 const kind=kindOf(asset),label=kind==="image"?"Imagem":kind==="sticker"?"Figurinha":kind==="audio"?"Áudio":kind==="video"?"Vídeo":"Documento";
 const Icon=kind==="image"||kind==="sticker"?ImageIcon:kind==="audio"?Mic:kind==="video"?Video:FileText;
 const open=async()=>{
   if(gate.current||!asset.available)return;
   gate.current=true;setBusy(true);setError("");
   try{
     const result=await getHistoricalWhatsAppMedia(message,asset.id);
     if(!active.current)return;
     setUrl(result.url);if(kind==="file")setViewer(true);
   }catch{if(active.current)setError("Não foi possível abrir o arquivo. Tente novamente.")}
   finally{gate.current=false;if(active.current)setBusy(false)}
 };
 const fileAction=async(action:"open"|"download",owner:Window)=>{
   await actOnSharedDocument(action,owner,async()=>{const result=await getHistoricalWhatsAppMedia(message,asset.id,action==="download");return {url:result.url,downloadUrl:result.url};});
 };
 const failed=()=>{setUrl("");setViewer(false);setError("Arquivo indisponível. Tente novamente.")};
 return <div className="mt-1.5 space-y-1.5 rounded-md border border-border/60 bg-background/35 p-2">
   {!asset.available?<span className="flex items-center gap-2 text-xs text-muted-foreground"><Icon size={16}/>{label} indisponível</span>:<>
     {!url&&<button type="button" disabled={busy} onClick={()=>void open()} className="flex min-h-8 items-center gap-2 text-xs font-medium hover:underline disabled:opacity-50">
       {busy?<LoaderCircle size={16} className="animate-spin"/>:<Icon size={16}/>} {busy?"Carregando…":label+" · Abrir"}
     </button>}
     {url&&(kind==="image"||kind==="sticker")&&<button type="button" onClick={()=>setViewer(true)} aria-label="Ampliar imagem"><img src={url} referrerPolicy="no-referrer" onError={failed} alt={label} className="max-h-56 max-w-full rounded-md object-contain"/></button>}
     {url&&kind==="audio"&&<audio controls src={url} preload="metadata" onError={failed} className="max-w-full"/>}
     {url&&kind==="video"&&<video controls src={url} preload="metadata" onError={failed} className="max-h-64 max-w-full rounded-md"/>}
     {url&&kind==="file"&&<button type="button" className="text-xs font-medium underline" onClick={()=>setViewer(true)}>{label} · Abrir arquivo</button>}
     <div className="flex flex-wrap gap-2">
       <button type="button" disabled={busy} className="flex items-center gap-1 text-[11px] hover:underline" onClick={event=>{const owner=event.currentTarget.ownerDocument.defaultView||window;setBusy(true);setError("");void fileAction("download",owner).catch(()=>setError("Não foi possível baixar o arquivo.")).finally(()=>setBusy(false));}}><Download size={13}/> Baixar arquivo</button>
     </div>
     {error&&<p role="alert" className="text-[11px] text-muted-foreground">{error}</p>}
     {viewer&&url&&<UnionWhatsAppMediaViewer url={url} type={kind} name={label} onDocumentAction={kind==="file"?fileAction:undefined} onClose={()=>setViewer(false)}/>}
   </>}
 </div>;
}
export function HistoricalMessageBody({message}:{message:UnionWhatsAppMessage}){
 const location=message.message_type==="location"?parseWhatsAppLocation(message.body_text):null;
 return <div className="space-y-1">
   {location?<a href={location.mapsUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-md border border-border/60 p-2 text-xs font-medium"><MapPin size={17}/> {location.name||"Ver localização"}</a>:
     message.body_text&&<p className="text-sm leading-5"><WhatsAppFormattedText text={message.body_text}/></p>}
   {message.historical_attachments?.map((asset,index)=><Attachment key={asset.id+":"+index} message={message} asset={asset}/>)}
   {!message.body_text&&!message.historical_attachments?.length&&<p className="text-sm text-muted-foreground">Mensagem</p>}
 </div>;
}
