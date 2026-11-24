import { useEffect, useState } from "react";
import { notifyAdmin } from "@/shared/ui/admin/AdminFeedback";

type DetachedEditor = { popup: Window; host: HTMLDivElement };
function syncTheme(target:Document){
  target.documentElement.className=document.documentElement.className;
  target.documentElement.style.cssText=document.documentElement.style.cssText;
  target.documentElement.lang=document.documentElement.lang||"pt-BR";
  target.body.className=document.body.className;
  target.body.classList.add("admin-crm");
  const theme=document.querySelector<HTMLElement>("[data-admin-shell]")?.dataset.theme || (document.documentElement.classList.contains("dark")?"dark":"light");
  target.body.dataset.theme=theme;
  target.body.classList.toggle("dark",theme==="dark");
}
export function useDetachedOrderEditor(windowTitle="Nova OS"){
  const [detached,setDetached]=useState<DetachedEditor|null>(null);
  const detach=()=>{
    if(detached){detached.popup.focus();return;}
    const popup=window.open("","_blank","popup=yes,width=980,height=850,resizable=yes,scrollbars=yes");
    if(!popup){notifyAdmin("Permita pop-ups da Union World para destacar a janela.","error");return;}
    try{
      const target=popup.document;
      popup.opener=null;
      target.title=windowTitle+" • Union World";
      for(const source of document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')){
        const link=source.cloneNode(true) as HTMLLinkElement;
        link.href=source.href;
        target.head.appendChild(link);
      }
      for(const source of document.querySelectorAll("style"))target.head.appendChild(source.cloneNode(true));
      syncTheme(target);
      target.body.style.margin="0";
      const host=target.createElement("div");
      host.id="union-detached-order-editor";
      target.body.replaceChildren(host);
      setDetached({popup,host});popup.focus();
    }catch(error){popup.close();notifyAdmin("Não foi possível destacar a janela.","error");}
  };
  const reintegrate=()=>{setDetached(null);window.focus();};
  useEffect(()=>{
    if(!detached)return;
    const {popup,host}=detached;
    const target=host.ownerDocument;
    const observer=new MutationObserver(()=>{if(!popup.closed)syncTheme(target);});
    observer.observe(document.documentElement,{attributes:true,attributeFilter:["class","style","lang"]});
    observer.observe(document.body,{attributes:true,attributeFilter:["class"]});
    const shell=document.querySelector("[data-admin-shell]");
    if(shell)observer.observe(shell,{attributes:true,attributeFilter:["class","data-theme"]});
    const close=()=>{if(!popup.closed)popup.close();};
    window.addEventListener("pagehide",close);
    // Closing the external window restores the very same draft in the CRM.
    const timer=window.setInterval(()=>{
      let unavailable=popup.closed;
      if(!unavailable){try{unavailable=popup.document!==target;}catch{unavailable=true;}}
      if(unavailable)setDetached(current=>current===detached?null:current);
    },500);
    return ()=>{observer.disconnect();window.clearInterval(timer);window.removeEventListener("pagehide",close);close();};
  },[detached]);
  return {detached,detach,reintegrate};
}
