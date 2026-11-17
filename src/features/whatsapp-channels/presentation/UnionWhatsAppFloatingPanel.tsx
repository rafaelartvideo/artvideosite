import { useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { ChevronDown, ChevronUp, CornerDownRight, ExternalLink, GripHorizontal, MessageCircle, X } from "lucide-react";
import type { UnionWhatsAppConversation, UnionWhatsAppConversationCounts } from "../infrastructure/union-whatsapp-inbox.repository";

type Filter="in_att"|"waiting";
type Point={x:number;y:number};
type Dock={side:"left"|"right"|"top"|"bottom"; progress:number};
type Drag={id:number;clientX:number;clientY:number;x:number;y:number;moved:boolean};
export type FloatingWhatsAppAlert={id:string;messageId:string;name:string;preview:string};

const EDGE=12;
const clamp=(value:number,min:number,max:number)=>Math.max(min,Math.min(value,Math.max(min,max)));
function dimensions(node:HTMLElement){
  const rect=node.getBoundingClientRect();
  return {maxX:Math.max(EDGE,window.innerWidth-rect.width-EDGE),
    maxY:Math.max(EDGE,window.innerHeight-rect.height-EDGE)};
}
function positionForDock(dock:Dock,node:HTMLElement):Point{
  const {maxX,maxY}=dimensions(node);
  const x=EDGE+(maxX-EDGE)*dock.progress;
  const y=EDGE+(maxY-EDGE)*dock.progress;
  if(dock.side==="left")return {x:EDGE,y};
  if(dock.side==="right")return {x:maxX,y};
  if(dock.side==="top")return {x,y:EDGE};
  return {x,y:maxY};
}
function snapToEdge(point:Point,node:HTMLElement):{point:Point;dock:Dock}{
  const {maxX,maxY}=dimensions(node);
  const x=clamp(point.x,EDGE,maxX),y=clamp(point.y,EDGE,maxY);
  const side=([
    {side:"left" as const,distance:x-EDGE},
    {side:"right" as const,distance:maxX-x},
    {side:"top" as const,distance:y-EDGE},
    {side:"bottom" as const,distance:maxY-y},
  ].sort((a,b)=>a.distance-b.distance))[0].side;
  const horizontal=side==="top"||side==="bottom";
  const progress=clamp(horizontal?(maxX-EDGE<24?1:(x-EDGE)/(maxX-EDGE))
    :(maxY-EDGE<24?1:(y-EDGE)/(maxY-EDGE)),0,1);
  const dock={side,progress};
  return {point:positionForDock(dock,node),dock};
}
function previewDate(value:string|null){
  if(!value)return "";
  const date=new Date(value);
  if(!Number.isFinite(date.getTime()))return "";
  return date.toLocaleTimeString("pt-BR",{hour:"2-digit",minute:"2-digit"});
}
function safeCount(value:number){return value>99?"99+":String(Math.max(0,value));}

export function UnionWhatsAppFloatingPanel({
  expanded,onToggle,counts,filter,onFilter,rows,loading,onSelect,onOpenFull,alert,onDismissAlert,
}:{
  expanded:boolean;
  onToggle:()=>void;
  counts:UnionWhatsAppConversationCounts;
  filter:Filter;
  onFilter:(value:Filter)=>void;
  rows:UnionWhatsAppConversation[];
  loading:boolean;
  onSelect:(id:string)=>void;
  onOpenFull:()=>void;
  alert:FloatingWhatsAppAlert|null;
  onDismissAlert:()=>void;
}){
  const [position,setPosition]=useState<Point|null>(null);
  const nodeRef=useRef<HTMLElement|null>(null);
  const dragRef=useRef<Drag|null>(null);
  const dockRef=useRef<Dock|null>(null);

  useLayoutEffect(()=>{
    const node=nodeRef.current;
    if(!node)return;
    let frame=0;
    const update=()=>{
      cancelAnimationFrame(frame);
      frame=requestAnimationFrame(()=>{
        if(!dockRef.current)return;
        const next=positionForDock(dockRef.current,node);
        setPosition(previous=>previous?.x===next.x&&previous.y===next.y?previous:next);
      });
    };
    const observer=typeof ResizeObserver==="undefined"?null:new ResizeObserver(update);
    observer?.observe(node);
    window.addEventListener("resize",update);
    return()=>{observer?.disconnect();window.removeEventListener("resize",update);cancelAnimationFrame(frame);};
  },[]);
  const reset=()=>{dockRef.current=null;setPosition(null);};
  const pointerDown=(event:PointerEvent<HTMLDivElement>)=>{
    if(event.button!==0 || !nodeRef.current)return;
    const rect=nodeRef.current.getBoundingClientRect();
    dragRef.current={id:event.pointerId,clientX:event.clientX,clientY:event.clientY,
      x:rect.left,y:rect.top,moved:false};
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };
  const pointerMove=(event:PointerEvent<HTMLDivElement>)=>{
    const drag=dragRef.current, node=nodeRef.current;
    if(!drag||drag.id!==event.pointerId||!node)return;
    const dx=event.clientX-drag.clientX,dy=event.clientY-drag.clientY;
    if(!drag.moved&&Math.abs(dx)+Math.abs(dy)<4)return;
    if(!drag.moved)dockRef.current=null;
    drag.moved=true;
    const {maxX,maxY}=dimensions(node);
    setPosition({x:clamp(drag.x+dx,EDGE,maxX),y:clamp(drag.y+dy,EDGE,maxY)});
  };
  const pointerUp=(event:PointerEvent<HTMLDivElement>)=>{
    const drag=dragRef.current;
    dragRef.current=null;
    if(event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    if(!drag?.moved||!nodeRef.current)return;
    const result=snapToEdge({x:drag.x+event.clientX-drag.clientX,
      y:drag.y+event.clientY-drag.clientY},nodeRef.current);
    dockRef.current=result.dock;
    setPosition(result.point);
  };
  const keyboardMove=(event:KeyboardEvent<HTMLDivElement>)=>{
    if(!["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Home"].includes(event.key))return;
    event.preventDefault();
    if(event.key==="Home"){reset();return;}
    const node=nodeRef.current;
    if(!node)return;
    const rect=node.getBoundingClientRect(),delta=event.shiftKey?40:16;
    const {maxX,maxY}=dimensions(node);
    dockRef.current=null;
    setPosition({
      x:clamp(rect.left+(event.key==="ArrowLeft"?-delta:event.key==="ArrowRight"?delta:0),EDGE,maxX),
      y:clamp(rect.top+(event.key==="ArrowUp"?-delta:event.key==="ArrowDown"?delta:0),EDGE,maxY),
    });
  };
  const style:CSSProperties=position
    ? {left:position.x,top:position.y,right:"auto",bottom:"auto"}
    : {right:16,bottom:"calc(7rem + env(safe-area-inset-bottom,0px))"};
  const hasAlert=Boolean(alert)&&!expanded;
  return <>
    {hasAlert&&alert&&<div role="status" aria-live="polite"
      className="admin-crm fixed bottom-[calc(11.5rem+env(safe-area-inset-bottom,0px))] right-4 z-[104] flex max-w-[min(360px,calc(100vw-2rem))] items-start gap-2 rounded-xl border border-primary/30 bg-card p-3 text-foreground shadow-xl">
      <button type="button" onClick={()=>onSelect(alert.id)}
        className="min-w-0 flex-1 text-left">
        <p className="truncate text-xs font-bold text-primary">{alert.name}</p>
        <p className="mt-1 line-clamp-2 text-xs text-foreground">{alert.preview}</p>
      </button>
      <button type="button" aria-label="Dispensar aviso de mensagem" onClick={onDismissAlert}
        className="rounded p-1 text-muted-foreground hover:bg-muted"><X size={15}/></button>
    </div>}
    <section ref={nodeRef} role="region" aria-label="Mini-Atendimentos Union"
      data-whatsapp-floating="true" data-whatsapp-expanded={expanded?"true":"false"}
      style={style}
      className={"admin-crm fixed z-[104] flex max-h-[calc(100dvh-1.5rem)] flex-col overflow-hidden rounded-2xl border border-border bg-card text-foreground shadow-[0_16px_52px_rgba(0,0,0,0.19)] " +
        (expanded?"w-[min(420px,calc(100vw-1rem))]":"w-[min(320px,calc(100vw-1rem))]")}>
      <div className="flex shrink-0 items-center gap-1 border-b border-border px-2 py-2">
        <div role="button" tabIndex={0}
          aria-label="Arrastar mini-Atendimentos; use as setas para mover e Home para reposicionar"
          title="Arraste para mover o mini-Atendimentos" onKeyDown={keyboardMove}
          onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp}
          onPointerCancel={pointerUp}
          className="flex min-w-0 flex-1 touch-none select-none items-center gap-2 rounded-lg px-1 py-1.5 outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-primary/50"
          style={{cursor:"grab"}}>
          <GripHorizontal size={16} className="shrink-0 text-muted-foreground"/>
          <span className="relative shrink-0">
            <MessageCircle size={18} className="text-primary"/>
            {counts.unread>0&&<span aria-hidden="true"
              className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-emerald-500"/>}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-bold">Atendimentos Union</span>
            <span className="block truncate text-[11px] text-muted-foreground">
              {counts.waiting} aguardando · {counts.in_att} em atendimento
            </span>
          </span>
          {counts.unread>0&&<span aria-label={String(counts.unread)+" mensagens não lidas"}
            className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
            {safeCount(counts.unread)}
          </span>}
        </div>
        <button type="button" title="Alinhar no canto inicial" aria-label="Restaurar posição do mini-Atendimentos"
          onClick={reset} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-primary">
          <CornerDownRight size={17}/>
        </button>
        <button type="button" title="Abrir módulo completo" aria-label="Abrir Atendimentos completo"
          onClick={onOpenFull} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-primary">
          <ExternalLink size={16}/>
        </button>
        <button type="button" aria-expanded={expanded} aria-label={expanded?"Recolher mini-Atendimentos":"Expandir atendimentos"}
          title={expanded?"Recolher":"Expandir"} onClick={onToggle}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-primary hover:bg-primary/10">
          {expanded?<ChevronDown size={19}/>:<ChevronUp size={19}/>}
        </button>
      </div>
      {expanded&&<div className="min-h-0 overflow-y-auto overscroll-contain px-3 pb-3 pt-3"
        style={{scrollbarGutter:"stable"}}>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={()=>onFilter("in_att")} aria-pressed={filter==="in_att"}
            className={"rounded-lg border px-3 py-2 text-left text-xs font-semibold " +
              (filter==="in_att"?"border-primary bg-primary/10 text-primary":"border-border hover:bg-muted")}>
            Em atendimento <strong className="float-right">{safeCount(counts.in_att)}</strong>
          </button>
          <button type="button" onClick={()=>onFilter("waiting")} aria-pressed={filter==="waiting"}
            className={"rounded-lg border px-3 py-2 text-left text-xs font-semibold " +
              (filter==="waiting"?"border-primary bg-primary/10 text-primary":"border-border hover:bg-muted")}>
            Aguardando <strong className="float-right">{safeCount(counts.waiting)}</strong>
          </button>
        </div>
        <div className="mt-3 max-h-[min(45dvh,420px)] min-h-20 overflow-y-auto rounded-lg border border-border">
          {loading&&rows.length===0?<div role="status" className="p-5 text-center text-xs text-muted-foreground">
            Consultando conversas...
          </div>:rows.length===0?<p className="p-5 text-center text-xs text-muted-foreground">
            Nenhuma conversa nesta lista.
          </p>:rows.map(item=><button key={item.id} type="button"
            onClick={()=>onSelect(item.id)}
            className="flex w-full items-start gap-3 border-b border-border px-3 py-3 text-left last:border-b-0 hover:bg-muted/55">
            <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-bold text-foreground">
              {(item.contact_name||item.contact_phone||"?").slice(0,1).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex min-w-0 items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-xs font-bold">{item.contact_name||item.contact_phone||"Contato"}</span>
                <span className="text-[10px] text-muted-foreground">{previewDate(item.last_message_at)}</span>
              </span>
              <span className="mt-1 block truncate text-xs text-muted-foreground">{item.last_message||"Conversa recebida"}</span>
            </span>
            {item.unread_count>0&&<span className="rounded-full bg-emerald-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
              {safeCount(item.unread_count)}
            </span>}
          </button>)}
        </div>
        <p className="mt-2 text-center text-[11px] text-muted-foreground">
          {filter==="waiting"?"Ordem da fila de chegada":"Ordenadas pela mensagem mais recente"} · até 8 conversas
        </p>
      </div>}
    </section>
  </>;
}
