import { useEffect, useRef, useState } from "react";
import { FileText, RotateCcw, X, ZoomIn, ZoomOut } from "lucide-react";

type WhatsAppMediaViewerProps = {
  url:string;
  downloadUrl?:string|null;
  type:string;
  name:string;
  onClose:()=>void;
  placement?:"drawer"|"viewport";
};

type Point = {x:number;y:number};
const MIN_ZOOM=1;
const MAX_ZOOM=5;
const clampZoom=(value:number)=>Math.min(MAX_ZOOM,Math.max(MIN_ZOOM,value));

// A mesma visualização para imagens da conversa e arquivos do perfil do contato.
// Tocar na imagem nunca abre outra guia: zoom, movimento e abertura do arquivo são ações separadas.
export function UnionWhatsAppMediaViewer({
  url,downloadUrl,type,name,onClose,placement="viewport",
}:WhatsAppMediaViewerProps){
  const isImage=type==="image"||type==="sticker";
  const [zoom,setZoom]=useState(1);
  const [pan,setPan]=useState<Point>({x:0,y:0});
  const zoomRef=useRef(1);
  const viewportRef=useRef<HTMLDivElement|null>(null);
  const imageRef=useRef<HTMLImageElement|null>(null);
  const pointersRef=useRef(new Map<number,Point>());
  const dragRef=useRef<{pointerId:number;start:Point;pan:Point}|null>(null);
  const pinchRef=useRef<{distance:number;zoom:number}|null>(null);

  const clampPan=(x:number,y:number,level:number):Point=>{
    const viewport=viewportRef.current;
    const image=imageRef.current;
    if(!viewport||!image||level<=1)return {x:0,y:0};
    const maxX=Math.max(0,(image.offsetWidth*level-viewport.clientWidth)/2);
    const maxY=Math.max(0,(image.offsetHeight*level-viewport.clientHeight)/2);
    return {x:Math.max(-maxX,Math.min(maxX,x)),y:Math.max(-maxY,Math.min(maxY,y))};
  };
  const changeZoom=(value:number)=>{
    const next=clampZoom(value);
    zoomRef.current=next;
    setZoom(next);
    setPan(current=>clampPan(current.x,current.y,next));
  };
  const resetZoom=()=>{
    zoomRef.current=1;
    setZoom(1);
    setPan({x:0,y:0});
    pointersRef.current.clear();
    dragRef.current=null;
    pinchRef.current=null;
  };
  const pointerDistance=()=>{
    const [a,b]=Array.from(pointersRef.current.values());
    return a&&b?Math.hypot(a.x-b.x,a.y-b.y):0;
  };

  useEffect(()=>{
    const onEscape=(event:KeyboardEvent)=>{
      if(event.key==="Escape"){event.stopPropagation();onClose();}
    };
    document.addEventListener("keydown",onEscape,true);
    return()=>document.removeEventListener("keydown",onEscape,true);
  },[onClose]);
  useEffect(()=>{
    zoomRef.current=1;
    setZoom(1);
    setPan({x:0,y:0});
    pointersRef.current.clear();
    dragRef.current=null;
    pinchRef.current=null;
  },[url,type]);
  useEffect(()=>{
    if(!isImage)return;
    const viewport=viewportRef.current;
    if(!viewport)return;
    const onWheel=(event:WheelEvent)=>{
      event.preventDefault();
      changeZoom(zoomRef.current*(event.deltaY<0?1.2:1/1.2));
    };
    // Non-passive para o scroll ampliar a imagem sem rolar a tela que está atrás.
    viewport.addEventListener("wheel",onWheel,{passive:false});
    return()=>viewport.removeEventListener("wheel",onWheel);
  },[isImage]);

  const onPointerDown=(event:React.PointerEvent<HTMLImageElement>)=>{
    if(event.pointerType==="mouse"&&event.button!==0)return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointersRef.current.set(event.pointerId,{x:event.clientX,y:event.clientY});
    if(pointersRef.current.size===2){
      dragRef.current=null;
      pinchRef.current={distance:pointerDistance(),zoom:zoomRef.current};
    }else if(zoomRef.current>1){
      dragRef.current={
        pointerId:event.pointerId,
        start:{x:event.clientX,y:event.clientY},
        pan,
      };
    }
  };
  const onPointerMove=(event:React.PointerEvent<HTMLImageElement>)=>{
    if(!pointersRef.current.has(event.pointerId))return;
    pointersRef.current.set(event.pointerId,{x:event.clientX,y:event.clientY});
    if(pointersRef.current.size===2&&pinchRef.current){
      const nextDistance=pointerDistance();
      if(pinchRef.current.distance>0){
        changeZoom(pinchRef.current.zoom*nextDistance/pinchRef.current.distance);
      }
      return;
    }
    const drag=dragRef.current;
    if(drag?.pointerId===event.pointerId&&zoomRef.current>1){
      setPan(clampPan(
        drag.pan.x+event.clientX-drag.start.x,
        drag.pan.y+event.clientY-drag.start.y,
        zoomRef.current,
      ));
    }
  };
  const onPointerEnd=(event:React.PointerEvent<HTMLImageElement>)=>{
    pointersRef.current.delete(event.pointerId);
    if(dragRef.current?.pointerId===event.pointerId)dragRef.current=null;
    if(pointersRef.current.size<2)pinchRef.current=null;
    if(event.currentTarget.hasPointerCapture(event.pointerId)){
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return <div role="dialog" aria-modal="true" aria-label="Visualizar arquivo"
    onClick={event=>{if(event.target===event.currentTarget)onClose();}}
    className={String.raw`${placement==="drawer"?"pointer-events-auto absolute inset-0 z-50":"fixed inset-0 z-[200]"} flex flex-col items-center gap-3 bg-black/55 p-4`}>
    <button type="button" onClick={onClose} aria-label="Fechar visualização"
      className="absolute right-4 top-4 z-10 rounded-full border border-white/30 bg-black/65 p-2 text-white hover:bg-black/80">
      <X size={23}/>
    </button>
    <div ref={viewportRef} className="flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden"
      aria-label={isImage?"Visualização da imagem — use a roda do mouse, dois dedos ou os botões para ampliar":undefined}>
      {isImage
        ?<img ref={imageRef} src={url} alt={name} draggable={false}
          onDragStart={event=>event.preventDefault()}
          onPointerDown={onPointerDown} onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd}
          onDoubleClick={()=>zoom>1?resetZoom():changeZoom(2)}
          style={{transform:"translate3d("+pan.x+"px,"+pan.y+"px,0) scale("+zoom+")",
            touchAction:"none",cursor:zoom>1?"grab":"zoom-in"}}
          className="max-h-full max-w-full select-none rounded-lg object-contain shadow-xl"/>
        :type==="video"
          ?<video controls autoPlay={false} src={url} className="max-h-full max-w-full"/>
          :type==="audio"
            ?<audio controls src={url} className="w-full max-w-sm"/>
            :<FileText size={54} className="text-white"/>}
    </div>
    {isImage&&<div role="group" aria-label="Controles de zoom"
      className="flex shrink-0 items-center gap-1 rounded-lg border border-white/20 bg-black/65 p-1 text-white">
      <button type="button" onClick={()=>changeZoom(zoomRef.current/1.25)} disabled={zoom<=MIN_ZOOM}
        aria-label="Reduzir zoom" title="Reduzir zoom"
        className="rounded-md p-2 hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-35">
        <ZoomOut size={17}/>
      </button>
      <span className="min-w-12 text-center text-xs font-semibold tabular-nums">{Math.round(zoom*100)}%</span>
      <button type="button" onClick={()=>changeZoom(zoomRef.current*1.25)} disabled={zoom>=MAX_ZOOM}
        aria-label="Ampliar zoom" title="Ampliar zoom"
        className="rounded-md p-2 hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-35">
        <ZoomIn size={17}/>
      </button>
      <button type="button" onClick={resetZoom} disabled={zoom===MIN_ZOOM}
        aria-label="Restaurar zoom" title="Restaurar zoom"
        className="rounded-md border-l border-white/20 p-2 hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-35">
        <RotateCcw size={16}/>
      </button>
    </div>}
    <div className="flex max-w-full shrink-0 flex-wrap items-center justify-center gap-3 rounded-lg bg-black/65 px-3 py-2">
      <span className="min-w-0 max-w-[60vw] truncate text-sm font-semibold text-white">{name}</span>
      <a href={url} target="_blank" rel="noopener noreferrer"
        className="shrink-0 rounded-md border border-border bg-card px-3 py-2 text-xs font-bold text-card-foreground shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground">
        Abrir arquivo
      </a>
      {type==="file" && <a href={downloadUrl||url} target="_blank" rel="noopener noreferrer"
        download={name} className="shrink-0 rounded-md border border-border bg-card px-3 py-2 text-xs font-bold text-card-foreground shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground">
        Baixar
      </a>}
    </div>
  </div>;
}
