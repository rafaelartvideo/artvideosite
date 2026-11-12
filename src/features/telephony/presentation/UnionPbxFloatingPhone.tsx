import { useEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { ChevronDown, ChevronUp, CornerDownRight, ExternalLink, GripHorizontal, LoaderCircle, PhoneIncoming, PhoneCall } from "lucide-react";

type CallState = "idle" | "dialing" | "incoming" | "active";
type Connection = "offline" | "connecting" | "registered" | "error";
type Point = { x: number; y: number };
type DragState = { id: number; startX: number; startY: number; x: number; y: number; moved: boolean };

const MARGIN = 12;
const DEFAULT_MARGIN = 20;
function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, Math.max(min, max)));
}
function bounds(node: HTMLElement) {
  const box = node.getBoundingClientRect();
  return { width: box.width, height: box.height,
    maxX: Math.max(MARGIN, window.innerWidth - box.width - MARGIN),
    maxY: Math.max(MARGIN, window.innerHeight - box.height - MARGIN) };
}
function snapToEdge(point: Point, node: HTMLElement): Point {
  const { maxX, maxY } = bounds(node);
  const x = clamp(point.x, MARGIN, maxX);
  const y = clamp(point.y, MARGIN, maxY);
  const distances = [
    { edge: "left", distance: x },
    { edge: "right", distance: maxX - x },
    { edge: "top", distance: y },
    { edge: "bottom", distance: maxY - y },
  ].sort((a,b)=>a.distance-b.distance);
  switch(distances[0].edge) {
    case "left": return {x:MARGIN,y};
    case "right": return {x:maxX,y};
    case "top": return {x,y:MARGIN};
    default: return {x,y:maxY};
  }
}

export function UnionPbxFloatingPhone({
  registration, callState, extension, caller, children, onOpenFull,
}:{
  registration: Connection;
  callState: CallState;
  extension: number | null;
  caller?: string;
  children: ReactNode;
  onOpenFull: () => void;
}) {
  const [expanded,setExpanded]=useState(false);
  const [position,setPosition]=useState<Point|null>(null);
  const nodeRef=useRef<HTMLElement|null>(null);
  const drag=useRef<DragState|null>(null);
  const lastCallState=useRef<CallState>("idle");

  useEffect(()=>{
    if (callState!=="idle" && (lastCallState.current==="idle" || lastCallState.current!==callState)) {
      setExpanded(true);
    }
    lastCallState.current=callState;
  },[callState]);
  useEffect(()=>{
    if(!position)return;
    const sync=()=>{
      const node=nodeRef.current;
      if(!node)return;
      setPosition(current=>current?{
        x:clamp(current.x,MARGIN,bounds(node).maxX),
        y:clamp(current.y,MARGIN,bounds(node).maxY),
      }:null);
    };
    window.addEventListener("resize",sync);
    return()=>window.removeEventListener("resize",sync);
  },[position!==null]);
  useEffect(()=>{
    if(!position)return;
    const node=nodeRef.current;
    if(!node)return;
    const raf=requestAnimationFrame(()=>{
      setPosition(current=>{
        if(!current)return current;
        const {maxX,maxY}=bounds(node);
        const next={x:clamp(current.x,MARGIN,maxX),y:clamp(current.y,MARGIN,maxY)};
        return next.x===current.x && next.y===current.y?current:next;
      });
    });
    return()=>cancelAnimationFrame(raf);
  },[expanded]);

  const pointerDown=(event:ReactPointerEvent<HTMLDivElement>)=>{
    if(event.button!==0)return;
    const node=nodeRef.current;
    if(!node)return;
    const box=node.getBoundingClientRect();
    const state={id:event.pointerId,startX:event.clientX,startY:event.clientY,
      x:box.left,y:box.top,moved:false};
    drag.current=state;
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };
  const pointerMove=(event:ReactPointerEvent<HTMLDivElement>)=>{
    const state=drag.current;
    const node=nodeRef.current;
    if(!state||state.id!==event.pointerId||!node)return;
    const dx=event.clientX-state.startX;
    const dy=event.clientY-state.startY;
    if(!state.moved && Math.abs(dx)+Math.abs(dy)<4)return;
    state.moved=true;
    const {maxX,maxY}=bounds(node);
    setPosition({x:clamp(state.x+dx,MARGIN,maxX),y:clamp(state.y+dy,MARGIN,maxY)});
  };
  const pointerUp=(event:ReactPointerEvent<HTMLDivElement>)=>{
    const state=drag.current;
    drag.current=null;
    if(event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    if(!state?.moved||!nodeRef.current)return;
    const {maxX,maxY}=bounds(nodeRef.current);
    const point={x:clamp(state.x+event.clientX-state.startX,MARGIN,maxX),
      y:clamp(state.y+event.clientY-state.startY,MARGIN,maxY)};
    setPosition(snapToEdge(point,nodeRef.current));
  };
  const reset=()=>setPosition(null);
  const status=callState==="incoming"?"Chamada recebida":
    callState==="dialing"?"Chamando...":callState==="active"?"Em ligação":
    registration==="registered"?"Conectado":registration==="connecting"?"Conectando...":"Desconectado";
  const tone=callState==="incoming"?"bg-amber-500":registration==="registered"?"bg-emerald-500":
    registration==="connecting"?"bg-amber-500":"bg-red-500";
  const style:CSSProperties=position?{
    left:position.x,top:position.y,right:"auto",bottom:"auto",
  }:{right:DEFAULT_MARGIN,bottom:DEFAULT_MARGIN};
  const keyboardMove=(event:React.KeyboardEvent<HTMLDivElement>)=>{
    if(!["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Home"].includes(event.key))return;
    event.preventDefault();
    if(event.key==="Home"){reset();return;}
    const node=nodeRef.current;
    if(!node)return;
    const box=node.getBoundingClientRect();
    const delta=event.shiftKey?40:16;
    const x=box.left+(event.key==="ArrowLeft"?-delta:event.key==="ArrowRight"?delta:0);
    const y=box.top+(event.key==="ArrowUp"?-delta:event.key==="ArrowDown"?delta:0);
    const {maxX,maxY}=bounds(node);
    setPosition({x:clamp(x,MARGIN,maxX),y:clamp(y,MARGIN,maxY)});
  };

  return <section
    ref={nodeRef}
    role={callState==="incoming"?"alert":"region"}
    aria-label="Mini-PABX Union"
    data-pbx-floating="true"
    data-pbx-expanded={expanded?"true":"false"}
    style={style}
    className={`fixed z-[105] flex max-h-[calc(100dvh-1.5rem)] flex-col overflow-hidden rounded-2xl border border-border bg-card text-foreground shadow-[0_16px_52px_rgba(0,0,0,0.19)] ${expanded?"w-[min(390px,calc(100vw-1.5rem))]":"w-[min(295px,calc(100vw-1.5rem))]"}`}
  >
    <div className="flex shrink-0 items-center gap-1 border-b border-border px-2 py-2">
      <div role="button" tabIndex={0} aria-label="Arrastar mini-PABX; use as setas para mover e Home para reposicionar"
        title="Arraste para mover o mini-PABX" onKeyDown={keyboardMove}
        onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp}
        onPointerCancel={pointerUp} className="flex min-w-0 flex-1 touch-none select-none items-center gap-2 rounded-lg px-1 py-1.5 outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-primary/50"
        style={{cursor:"grab"}}>
        <GripHorizontal size={17} className="shrink-0 text-muted-foreground"/>
        <span className="relative flex h-2.5 w-2.5 shrink-0">
          <span className={`absolute inset-0 animate-ping rounded-full opacity-30 ${tone}`}/>
          <span className={`relative h-2.5 w-2.5 rounded-full ${tone}`}/>
        </span>
        <span className="min-w-0">
          <span className="block truncate text-xs font-bold">PABX Union · {extension?"Ramal "+extension:"Ramal"}</span>
          <span className="block truncate text-[11px] text-muted-foreground">{status}{caller && callState!=="idle"?" · "+caller:""}</span>
        </span>
      </div>
      <button type="button" title="Alinhar no canto inicial" aria-label="Restaurar posição do mini-PABX"
        onClick={reset} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-primary">
        <CornerDownRight size={17}/>
      </button>
      <button type="button" title="Abrir módulo completo" aria-label="Abrir PABX completo" onClick={onOpenFull}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-primary">
        <ExternalLink size={16}/>
      </button>
      <button type="button" aria-expanded={expanded} aria-label={expanded?"Recolher mini-PABX":"Expandir discador"}
        title={expanded?"Recolher":"Expandir discador"} onClick={()=>setExpanded(v=>!v)}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-primary hover:bg-primary/10">
        {expanded?<ChevronDown size={19}/>:<ChevronUp size={19}/>}
      </button>
    </div>
    {expanded&&<div className="min-h-0 overflow-y-auto overscroll-contain px-3 pb-3 pt-3" style={{scrollbarGutter:"stable"}}>
      {children}
    </div>}
    {!expanded&&callState==="incoming"&&<p className="flex items-center gap-2 px-3 pb-2 text-xs text-amber-700">
      <PhoneIncoming size={14}/> Nova chamada
    </p>}
    {!expanded&&callState==="active"&&<p className="flex items-center gap-2 px-3 pb-2 text-xs text-emerald-700">
      <PhoneCall size={14}/> Chamada em andamento
    </p>}
  </section>;
}
