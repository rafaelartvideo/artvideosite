import { useEffect } from "react";
import { FileText, X } from "lucide-react";

type WhatsAppMediaViewerProps = {
  url:string;
  downloadUrl?:string|null;
  type:string;
  name:string;
  onClose:()=>void;
  placement?:"drawer"|"viewport";
};

// A mesma visualização para imagens da conversa e arquivos do perfil do contato.
// "Abrir arquivo" continua opcional; tocar na imagem nunca abre outra guia.
export function UnionWhatsAppMediaViewer({
  url,downloadUrl,type,name,onClose,placement="viewport",
}:WhatsAppMediaViewerProps){
  useEffect(()=>{
    const onEscape=(event:KeyboardEvent)=>{
      if(event.key==="Escape"){event.stopPropagation();onClose();}
    };
    document.addEventListener("keydown",onEscape,true);
    return()=>document.removeEventListener("keydown",onEscape,true);
  },[onClose]);
  return <div role="dialog" aria-modal="true" aria-label="Visualizar arquivo"
    onClick={event=>{if(event.target===event.currentTarget)onClose();}}
    className={`${placement==="drawer"?"pointer-events-auto absolute inset-0 z-50":"fixed inset-0 z-[200]"}
      flex flex-col items-center justify-center gap-3 bg-black/55 p-4`}>
    <button type="button" onClick={onClose} aria-label="Fechar visualização"
      className="absolute right-4 top-4 rounded-full border border-white/30 bg-black/50 p-2 text-white hover:bg-black/65">
      <X size={23}/>
    </button>
    {type==="image"||type==="sticker"
      ?<img src={url} alt={name} className="max-h-[78%] max-w-full rounded-lg object-contain shadow-xl"/>
      :type==="video"
        ?<video controls autoPlay={false} src={url} className="max-h-[75%] max-w-full"/>
        :type==="audio"
          ?<audio controls src={url} className="w-full max-w-sm"/>
          :<FileText size={54} className="text-white"/>}
    <div className="flex max-w-full flex-wrap items-center justify-center gap-3 rounded-lg bg-black/45 px-3 py-2">
      <span className="min-w-0 max-w-[60vw] truncate text-sm font-semibold text-white">{name}</span>
      <a href={url} target="_blank" rel="noopener noreferrer"
        className="shrink-0 rounded-md bg-white px-3 py-2 text-xs font-bold text-gray-900">
        Abrir arquivo
      </a>
      {type==="file" && <a href={downloadUrl||url} target="_blank" rel="noopener noreferrer"
        download={name} className="shrink-0 rounded-md bg-white px-3 py-2 text-xs font-bold text-gray-900">
        Baixar
      </a>}
    </div>
  </div>;
}
