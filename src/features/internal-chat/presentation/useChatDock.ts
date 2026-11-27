import {useLayoutEffect,useRef,useState,type PointerEvent as ReactPointerEvent} from "react";
type Position={x:number;y:number};
type EdgeDock={side:"left"|"right"|"top"|"bottom";progress:number};
const margin=10, snap=22;
export function constrainChatPosition(p:Position,w:number,h:number,vw:number,vh:number,magnetic=false):Position{
 const maxX=Math.max(margin,vw-w-margin),maxY=Math.max(margin,vh-h-margin);
 let x=Math.max(margin,Math.min(maxX,p.x)),y=Math.max(margin,Math.min(maxY,p.y));
 if(magnetic){if(x-margin<snap)x=margin;else if(maxX-x<snap)x=maxX;if(y-margin<snap)y=margin;else if(maxY-y<snap)y=maxY;}
 return {x,y};
}
function load(key:string):EdgeDock|null{try{const p=JSON.parse(localStorage.getItem(key)??"null");return p&&["left","right","top","bottom"].includes(p.side)&&Number.isFinite(p.progress)&&p.progress>=0&&p.progress<=1?p:null;}catch{return null;}}
function dockPosition(d:EdgeDock,w:number,h:number,vw:number,vh:number):Position{
 const maxX=Math.max(margin,vw-w-margin),maxY=Math.max(margin,vh-h-margin);
 return {x:d.side==="left"?margin:d.side==="right"?maxX:margin+(maxX-margin)*d.progress,y:d.side==="top"?margin:d.side==="bottom"?maxY:margin+(maxY-margin)*d.progress};
}
function nearestEdge(p:Position,w:number,h:number,vw:number,vh:number):EdgeDock{
 const maxX=Math.max(margin,vw-w-margin),maxY=Math.max(margin,vh-h-margin);
 const q=constrainChatPosition(p,w,h,vw,vh);
 const edges:[EdgeDock["side"],number][]=[["left",q.x-margin],["right",maxX-q.x],["top",q.y-margin],["bottom",maxY-q.y]];
 const side=edges.sort((a,b)=>a[1]-b[1])[0][0];
 const horizontal=side==="top"||side==="bottom";
 return {side,progress:Math.max(0,Math.min(1,horizontal?(q.x-margin)/Math.max(1,maxX-margin):(q.y-margin)/Math.max(1,maxY-margin)))};
}
function homePosition(a:DOMRect,w:number,h:number,vw:number,vh:number){
 const below=a.bottom+10,above=a.top-h-10;
 const bottom=below+h>vh-margin&&above>=margin;
 const p=constrainChatPosition({x:a.left+a.width/2-w/2,y:bottom?above:below},w,h,vw,vh);
 return {p,bottom,arrowLeft:a.left+a.width/2-p.x};
}
export function useChatDock(open:boolean,anchors:HTMLElement[],key:string,expanded:boolean){
 const panel=useRef<HTMLElement|null>(null);
 const [saved,setSaved]=useState<EdgeDock|null>(()=>load(key));
 const [position,setPosition]=useState<Position>({x:10,y:70});
 const [arrow,setArrow]=useState<{left:number;bottom:boolean}|null>(null);
 const [dragging,setDragging]=useState(false);
 const [maxHeight,setMaxHeight]=useState<number|undefined>(undefined);
 const live=useRef(position);
 const drag=useRef<{id:number;startX:number;startY:number;origin:Position;moved:boolean}|null>(null);
 const clicked=useRef<HTMLElement|null>(null);
 const visible=(a:HTMLElement)=>{const r=a.getBoundingClientRect(),css=getComputedStyle(a);return r.width>0&&r.height>0&&r.right>0&&r.left<innerWidth&&r.bottom>0&&r.top<innerHeight&&css.visibility!=="hidden"&&css.display!=="none";};
 const activeAnchor=()=>clicked.current&&visible(clicked.current)?clicked.current:anchors.map(a=>a.querySelector<HTMLElement>("button")??a).find(visible);
 function store(p:EdgeDock|null){setSaved(p);try{if(p)localStorage.setItem(key,JSON.stringify(p));else localStorage.removeItem(key);}catch{/* Optional browser storage. */}}
 function place(p:Position){live.current=p;setPosition(prev=>prev.x===p.x&&prev.y===p.y?prev:p);}
 function pointArrow(a:{left:number;bottom:boolean}|null){setArrow(prev=>prev?.left===a?.left&&prev?.bottom===a?.bottom?prev:a);}
 useLayoutEffect(()=>{
  if(!open||!panel.current)return;
  function layout(){
   const el=panel.current;if(!el||drag.current)return;
   const w=el.offsetWidth,h=el.offsetHeight,a=activeAnchor()?.getBoundingClientRect();
   if(saved){setMaxHeight(undefined);place(dockPosition(saved,w,h,innerWidth,innerHeight));pointArrow(null);return;}
   if(!a){setMaxHeight(undefined);place(constrainChatPosition({x:(innerWidth-w)/2,y:(innerHeight-h)/2},w,h,innerWidth,innerHeight));pointArrow(null);return;}
   const roomBelow=Math.max(0,innerHeight-margin-a.bottom-10),roomAbove=Math.max(0,a.top-margin-10);
   const available=Math.max(roomBelow,roomAbove);
   const cap=available>=100?available:undefined;
   setMaxHeight(cap);
   const fittedHeight=cap===undefined?h:Math.min(h,cap);
   const {p,bottom,arrowLeft}=homePosition(a,w,fittedHeight,innerWidth,innerHeight);
   place(p);pointArrow(Math.abs((bottom?p.y+fittedHeight:p.y)-(bottom?a.top-10:a.bottom+10))<2?{left:Math.max(10,Math.min(w-10,arrowLeft)),bottom}:null);
  }
  layout();window.addEventListener("resize",layout);window.addEventListener("scroll",layout,true);
  const observer=typeof ResizeObserver==="undefined"?null:new ResizeObserver(layout);observer?.observe(panel.current);anchors.forEach(a=>observer?.observe(a));
  return()=>{window.removeEventListener("resize",layout);window.removeEventListener("scroll",layout,true);observer?.disconnect();};
 },[open,anchors,saved,expanded]);
 function pointerDown(e:ReactPointerEvent<HTMLElement>){
  if(e.button!==0||(e.target as HTMLElement).closest("button,input,select,a,[role=button]"))return;
  drag.current={id:e.pointerId,startX:e.clientX,startY:e.clientY,origin:live.current,moved:false};e.currentTarget.setPointerCapture(e.pointerId);
 }
 function pointerMove(e:ReactPointerEvent<HTMLElement>){
  const d=drag.current,el=panel.current;if(!d||d.id!==e.pointerId||!el)return;
  const dx=e.clientX-d.startX,dy=e.clientY-d.startY;if(!d.moved&&Math.hypot(dx,dy)<5)return;
  d.moved=true;setDragging(true);setArrow(null);place(constrainChatPosition({x:d.origin.x+dx,y:d.origin.y+dy},el.offsetWidth,el.offsetHeight,innerWidth,innerHeight));
 }
 function finish(e:ReactPointerEvent<HTMLElement>){
  const d=drag.current,el=panel.current;if(!d||d.id!==e.pointerId)return;drag.current=null;setDragging(false);
  if(d.moved&&el){const a=activeAnchor()?.getBoundingClientRect(),p=live.current;
   const home=a?homePosition(a,el.offsetWidth,el.offsetHeight,innerWidth,innerHeight).p:null;
   if(home&&a&&Math.hypot(p.x-home.x,p.y-home.y)<28){const h=homePosition(a,el.offsetWidth,el.offsetHeight,innerWidth,innerHeight);place(h.p);pointArrow({left:Math.max(10,Math.min(el.offsetWidth-10,h.arrowLeft)),bottom:h.bottom});store(null);}else {const next=nearestEdge(p,el.offsetWidth,el.offsetHeight,innerWidth,innerHeight);place(dockPosition(next,el.offsetWidth,el.offsetHeight,innerWidth,innerHeight));store(next);}
  }
 }
 return {panel,position,arrow,dragging,maxHeight,isDocked:!!saved,anchor:(node:HTMLElement)=>{clicked.current=node;},reset:()=>store(null),handlers:{onPointerDown:pointerDown,onPointerMove:pointerMove,onPointerUp:finish,onPointerCancel:finish,onLostPointerCapture:finish}};
}
