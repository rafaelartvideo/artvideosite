import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Download, ExternalLink, FileText, LoaderCircle, PanelTop, RotateCcw, RotateCw, Scan, X, ZoomIn, ZoomOut } from "lucide-react";
import { createPortal } from "react-dom";
import { useDetachedMediaWindow } from "./useDetachedMediaWindow";
import { downloadMediaWebp } from "../application/download-media-webp";
import { mediaViewerFitScale, mediaViewerPanBounds, normalizeMediaRotation } from "../domain/media-viewer-rotation";

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
  const isPhoto=type==="image";
  const {detached,detach,reintegrate,error:windowError}=useDetachedMediaWindow(name);
  const [downloadBusy,setDownloadBusy]=useState(false);
  const [downloadError,setDownloadError]=useState("");
  const [corsFailedUrl,setCorsFailedUrl]=useState<string|null>(null);
  const downloadGate=useRef(false);
  const [zoom,setZoom]=useState(1);
  const [rotation,setRotation]=useState(0);
  const [fitScale,setFitScale]=useState(1);
  const [pan,setPan]=useState<Point>({x:0,y:0});
  const zoomRef=useRef(1);
  const rotationRef=useRef(0);
  const fitScaleRef=useRef(1);
  const viewportRef=useRef<HTMLDivElement|null>(null);
  const imageRef=useRef<HTMLImageElement|null>(null);
  const pointersRef=useRef(new Map<number,Point>());
  const dragRef=useRef<{pointerId:number;start:Point;pan:Point}|null>(null);
  const pinchRef=useRef<{distance:number;zoom:number}|null>(null);

  const clampPan=(x:number,y:number,level:number):Point=>{
    const viewport=viewportRef.current;
    const image=imageRef.current;
    if(!viewport||!image)return {x:0,y:0};
    const {maxX,maxY}=mediaViewerPanBounds({
      imageWidth:image.offsetWidth,imageHeight:image.offsetHeight,
      viewportWidth:viewport.clientWidth,viewportHeight:viewport.clientHeight,
      zoom:level,rotation:rotationRef.current,fitScale:fitScaleRef.current,
    });
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
  const rotateImage=(delta:-90|90)=>{
    const next=normalizeMediaRotation(rotationRef.current+delta);
    rotationRef.current=next;
    setRotation(next);
    // Após girar, centraliza sem perder o nível de zoom escolhido.
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
    const ownerDocument=detached?.host.ownerDocument||document;
    ownerDocument.addEventListener("keydown",onEscape,true);
    return()=>ownerDocument.removeEventListener("keydown",onEscape,true);
  },[onClose,detached]);
  useEffect(()=>{
    zoomRef.current=1;
    setZoom(1);
    rotationRef.current=0;
    setRotation(0);
    fitScaleRef.current=1;
    setFitScale(1);
    setPan({x:0,y:0});
    pointersRef.current.clear();
    dragRef.current=null;
    pinchRef.current=null;
  },[url,type]);
  useLayoutEffect(()=>{
    if(!isImage)return;
    const viewport=viewportRef.current;
    const image=imageRef.current;
    if(!viewport||!image)return;
    const syncDimensions=()=>{
      const fit=mediaViewerFitScale(
        image.offsetWidth,image.offsetHeight,
        viewport.clientWidth,viewport.clientHeight,rotationRef.current,
      );
      fitScaleRef.current=fit;
      setFitScale(current=>current===fit?current:fit);
      setPan(current=>{
        const next=clampPan(current.x,current.y,zoomRef.current);
        return next.x===current.x&&next.y===current.y?current:next;
      });
    };
    syncDimensions();
    // A imagem e o modal podem mudar de tamanho após carregar ou redimensionar.
    const observer=typeof ResizeObserver!=="undefined"?new ResizeObserver(syncDimensions):null;
    observer?.observe(viewport);
    observer?.observe(image);
    const ownerWindow=viewport.ownerDocument.defaultView||window;
    ownerWindow.addEventListener("resize",syncDimensions);
    return()=>{
      observer?.disconnect();
      ownerWindow.removeEventListener("resize",syncDimensions);
    };
  },[isImage,url,rotation,detached]);
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
  },[isImage,detached]);

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

  const downloadPhoto=async()=>{
    if(downloadGate.current)return;
    downloadGate.current=true;
    setDownloadBusy(true);
    setDownloadError("");
    try{
      await downloadMediaWebp(imageRef.current,url,name,detached?.host.ownerDocument||document);
    }catch{
      setDownloadError("Não foi possível baixar a imagem em WebP. Reabra a foto e tente novamente.");
    }finally{
      downloadGate.current=false;
      setDownloadBusy(false);
    }
  };
  const viewer=<div role="dialog" aria-modal={!detached} aria-label="Visualizar arquivo"
    onClick={event=>{if(!detached&&event.target===event.currentTarget)onClose();}}
    className={`${detached?"relative h-dvh w-full bg-background":placement==="drawer"?"pointer-events-auto absolute inset-0 z-50 bg-black/55":"fixed inset-0 z-[200] bg-black/55"} flex flex-col items-center gap-3 p-4`}>
    <button type="button" onClick={onClose} aria-label="Fechar visualização"
      className="absolute right-4 top-4 z-10 rounded-full border border-white/30 bg-black/65 p-2 text-white hover:bg-black/80">
      <X size={23}/>
    </button>
    <div ref={viewportRef} className="flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden"
      onClick={event=>{if(!detached&&event.target===event.currentTarget)onClose();}}
      aria-label={isImage?"Visualização da imagem — use a roda do mouse, dois dedos ou os botões para ampliar":undefined}>
      {isImage
        ?<img ref={imageRef} crossOrigin={isPhoto&&corsFailedUrl!==url?"anonymous":undefined} src={url} alt={name} draggable={false}
          onError={()=>{if(isPhoto&&corsFailedUrl!==url)setCorsFailedUrl(url);}}
          onDragStart={event=>event.preventDefault()}
          onPointerDown={onPointerDown} onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd}
          onDoubleClick={()=>zoom>1?resetZoom():changeZoom(2)}
          style={{transform:"translate3d("+pan.x+"px,"+pan.y+"px,0) rotate("+rotation+"deg) scale("+(zoom*fitScale)+")",
            touchAction:"none",cursor:zoom>1?"grab":"zoom-in"}}
          className="max-h-full max-w-full select-none rounded-lg object-contain shadow-xl"/>
        :type==="video"
          ?<video controls autoPlay={false} src={url} className="max-h-full max-w-full"/>
          :type==="audio"
            ?<audio controls src={url} className="w-full max-w-sm"/>
            :<FileText size={54} className="text-white"/>}
    </div>
    {isImage&&<div role="group" aria-label="Controles da imagem"
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
        <Scan size={16}/>
      </button>
      <button type="button" onClick={()=>rotateImage(-90)}
        aria-label="Girar imagem 90 graus à esquerda" title="Girar 90° à esquerda"
        className="rounded-md border-l border-white/20 p-2 hover:bg-white/15">
        <RotateCcw size={17}/>
      </button>
      <button type="button" onClick={()=>rotateImage(90)}
        aria-label="Girar imagem 90 graus à direita" title="Girar 90° à direita"
        className="rounded-md p-2 hover:bg-white/15">
        <RotateCw size={17}/>
      </button>
    </div>}
    <div className="flex max-w-full shrink-0 flex-wrap items-center justify-center gap-3 rounded-lg bg-black/65 px-3 py-2">
      <span className="min-w-0 max-w-[60vw] truncate text-sm font-semibold text-white">{name}</span>
      {isPhoto ? <>
        <button type="button" onClick={detached?reintegrate:detach} title={detached?"Reintegrar ao CRM":"Abrir arquivo em janela destacada"}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-xs font-bold text-card-foreground shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground">
          {detached?<PanelTop size={14}/>:<ExternalLink size={14}/>}
          {detached?"Reintegrar ao CRM":"Destacar janela"}
        </button>
        <button type="button" onClick={()=>void downloadPhoto()} disabled={downloadBusy}
          aria-label="Baixar imagem em WebP" title="Baixar imagem em WebP"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-card px-3 py-2 text-xs font-bold text-card-foreground shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground disabled:opacity-50">
          {downloadBusy?<LoaderCircle size={14} className="animate-spin"/>:<Download size={14}/>}
          {downloadBusy?"Baixando...":"Baixar"}
        </button>
      </> : <a href={url} target="_blank" rel="noopener noreferrer"
        className="shrink-0 rounded-md border border-border bg-card px-3 py-2 text-xs font-bold text-card-foreground shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground">
        Abrir arquivo
      </a>}
      {type==="file" && <a href={downloadUrl||url} target="_blank" rel="noopener noreferrer"
        download={name} className="shrink-0 rounded-md border border-border bg-card px-3 py-2 text-xs font-bold text-card-foreground shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground">
        Baixar
      </a>}
    </div>
    {(windowError||downloadError)&&<p role="alert" className="max-w-full rounded-md bg-black/80 px-3 py-2 text-xs text-white">{windowError||downloadError}</p>}
  </div>;
  return detached?createPortal(viewer,detached.host):viewer;
}
