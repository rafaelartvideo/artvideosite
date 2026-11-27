import {useLayoutEffect,useRef,useState,type PointerEvent as ReactPointerEvent} from "react";
type Position={x:number;y:number};
const margin=10, snap=22;
export function constrainChatPosition(p:Position,w:number,h:number,vw:number,vh:number,magnetic=false):Position{
 const maxX=Math.max(margin,vw-w-margin),maxY=Math.max(margin,vh-h-margin);
 let x=Math.max(margin,Math.min(maxX,p.x)),y=Math.max(margin,Math.min(maxY,p.y));
 if(magnetic){if(x-margin<snap)x=margin;else if(maxX-x<snap)x=maxX;if(y-margin<snap)y=margin;else if(maxY-y<snap)y=maxY;}
 return {x,y};
}
function load(key:string):Position|null{try{const p=JSON.parse(localStorage.getItem(key)??"null");return p&&Number.isFinite(p.x)&&Number.isFinite(p.y)?p:null;}catch{return null;}}
export function useChatDock(open:boolean,anchors:HTMLElement[],key:string){
 const panel=useRef<HTMLElement|null>(null);
 const [saved,setSaved]=useState<Position|null>(()=>load(key));
 const [position,setPosition]=useState<Position>({x:10,y:70});
 const [arrow,setArrow]=useState<{left:number;bottom:boolean}|null>(null);
 const [dragging,setDragging]=useState(false);
 const live=useRef(position);
 const drag=useRef<{id:number;startX:number;startY:number;origin:Position;moved:boolean}|null>(null);
 const activeAnchor=()=>anchors.find(a=>a.getBoundingClientRect().width>0&&a.getBoundingClientRect().height>0);
 function store(p:Position|null){setSaved(p);try{if(p)localStorage.setItem(key,JSON.stringify(p));else localStorage.removeItem(key);}catch{/* Optional browser storage. */}}
 function place(p:Position){live.current=p;setPosition(p);}
 useLayoutEffect(()=>{
  if(!open||!panel.current)return;
  function layout(){
   const el=panel.current;if(!el||drag.current)return;
   const w=el.offsetWidth,h=el.offsetHeight,a=activeAnchor()?.getBoundingClientRect();
   if(saved){place(constrainChatPosition(saved,w,h,innerWidth,innerHeight));setArrow(null);return;}
   if(!a){place(constrainChatPosition({x:innerWidth-w-margin,y:70},w,h,innerWidth,innerHeight));setArrow(null);return;}
   const below=a.bottom+10,above=a.top-h-10;
   const bottom=below+h>innerHeight-margin&&above>=margin;
   const p=constrainChatPosition({x:a.right-w+16,y:bottom?above:below},w,h,innerWidth,innerHeight);
   place(p);const left=a.left+a.width/2-p.x;
   setArrow(left>=10&&left<=w-10&&Math.abs((bottom?p.y+h:p.y)-(bottom?a.top-10:a.bottom+10))<2?{left,bottom}:null);
  }
  layout();window.addEventListener("resize",layout);window.addEventListener("scroll",layout,true);
  const observer=new ResizeObserver(layout);observer.observe(panel.current);anchors.forEach(a=>observer.observe(a));
  return()=>{window.removeEventListener("resize",layout);window.removeEventListener("scroll",layout,true);observer.disconnect();};
 },[open,anchors,saved]);
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
   const home=a&&Math.abs(p.y-(a.bottom+10))<28&&Math.abs(p.x-Math.max(margin,Math.min(innerWidth-el.offsetWidth-margin,a.right-el.offsetWidth+16)))<28;
   if(home)store(null);else store(constrainChatPosition(p,el.offsetWidth,el.offsetHeight,innerWidth,innerHeight,true));
  }
 }
 return {panel,position,arrow,dragging,reset:()=>store(null),handlers:{onPointerDown:pointerDown,onPointerMove:pointerMove,onPointerUp:finish,onPointerCancel:finish,onLostPointerCapture:finish}};
}
