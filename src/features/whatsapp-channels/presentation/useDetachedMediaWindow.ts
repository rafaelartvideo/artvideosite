import { useEffect, useRef, useState } from "react";

type DetachedMediaWindow = {popup:Window;host:HTMLDivElement};
export function useDetachedMediaWindow(name:string){
  const [detached,setDetached]=useState<DetachedMediaWindow|null>(null);
  const active=useRef<DetachedMediaWindow|null>(null);
  const [error,setError]=useState("");
  const syncTheme=(target:Document)=>{
    target.documentElement.className=document.documentElement.className;
    target.documentElement.style.cssText=document.documentElement.style.cssText;
    target.body.className=document.body.className;
    target.body.classList.add("admin-crm");
    const theme=document.querySelector<HTMLElement>("[data-admin-shell]")?.dataset.theme ||
      (document.documentElement.classList.contains("dark")?"dark":"light");
    target.body.dataset.theme=theme;
    target.body.classList.toggle("dark",theme==="dark");
  };
  const detach=()=>{
    if(active.current && !active.current.popup.closed){active.current.popup.focus();return;}
    setError("");
    const popup=window.open("","_blank","popup=yes,width=1120,height=850,resizable=yes,scrollbars=yes");
    if(!popup){setError("Permita pop-ups da Union World para destacar a imagem.");return;}
    try{
      const target=popup.document;
      popup.opener=null;
      target.title=name+" • Union World";
      for(const source of document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')){
        const link=source.cloneNode(true) as HTMLLinkElement;
        link.href=source.href;
        target.head.appendChild(link);
      }
      for(const source of document.querySelectorAll("style"))target.head.appendChild(source.cloneNode(true));
      syncTheme(target);
      target.body.style.margin="0";
      const host=target.createElement("div");
      host.id="union-detached-media-viewer";
      target.body.replaceChildren(host);
      active.current={popup,host};
      setDetached(active.current);
      popup.focus();
    }catch{
      popup.close();
      setError("Não foi possível destacar a imagem.");
    }
  };
  const reintegrate=()=>{
    active.current=null;
    setDetached(null);
    window.focus();
  };
  useEffect(()=>{
    if(!detached)return;
    const {popup,host}=detached;
    const target=host.ownerDocument;
    const observer=new MutationObserver(()=>{if(!popup.closed)syncTheme(target);});
    observer.observe(document.documentElement,{attributes:true,attributeFilter:["class","style"]});
    observer.observe(document.body,{attributes:true,attributeFilter:["class"]});
    const shell=document.querySelector("[data-admin-shell]");
    if(shell)observer.observe(shell,{attributes:true,attributeFilter:["class","data-theme"]});
    const close=()=>{if(!popup.closed)popup.close();};
    window.addEventListener("pagehide",close);
    const timer=window.setInterval(()=>{
      let unavailable=popup.closed;
      if(!unavailable){try{unavailable=popup.document!==target;}catch{unavailable=true;}}
      if(unavailable){
        if(active.current===detached)active.current=null;
        setDetached(current=>current===detached?null:current);
      }
    },500);
    return()=>{
      observer.disconnect();
      window.clearInterval(timer);
      window.removeEventListener("pagehide",close);
      close();
      if(active.current===detached)active.current=null;
    };
  },[detached]);
  useEffect(()=>{
    if(detached&&!detached.popup.closed)detached.host.ownerDocument.title=name+" • Union World";
  },[detached,name]);
  return {detached,detach,reintegrate,error};
}
