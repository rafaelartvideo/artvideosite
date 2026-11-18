import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { useAuth } from "@/lib/auth";
import { UnionWhatsAppActivityProvider } from "./UnionWhatsAppActivityProvider";
import { WhatsAppConversationModal, type WhatsAppModalContext } from "./WhatsAppConversationModal";

type Recipient={kind:"registered"|"linked";name:string;phone:string;field?:"whatsapp"|"phone";
  conversation_id?:string;account_phone?:string;chat_jid?:string};
type DocumentRequest={resolve:(file:File)=>void;reject:(error:Error)=>void;timeout:number};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Dedicated authenticated browser window, not a second WhatsApp channel or OS. */
export function DetachedWhatsAppOrderPage({
  orderId,expectedOrganizationId,
}:{
  orderId:string;expectedOrganizationId:string;
}){
  const {activeOrganizationId,hasPermission}=useAuth();
  const navigate=useNavigate();
  // The standalone route skips AdminLayout, so explicitly inherit the
  // persisted admin theme and listen for changes from the main CRM window.
  const [darkTheme,setDarkTheme]=useState(()=>typeof window!=="undefined" &&
    window.localStorage.getItem("unionworld.admin.theme")==="dark");
  const [documentOptions,setDocumentOptions]=useState<Array<{id:string;label:string}>>([]);
  const requests=useRef(new Map<string,DocumentRequest>());
  const valid=uuid.test(orderId)&&uuid.test(expectedOrganizationId) &&
    activeOrganizationId===expectedOrganizationId && hasPermission("whatsapp.inbox.view");

  useEffect(()=>{document.title="Union World — Atendimento WhatsApp";},[]);
  useEffect(()=>{
    const update=()=>setDarkTheme(window.localStorage.getItem("unionworld.admin.theme")==="dark");
    window.addEventListener("storage",update);
    update();
    return()=>window.removeEventListener("storage",update);
  },[]);
  useEffect(()=>{
    document.documentElement.classList.toggle("dark",darkTheme);
    document.documentElement.dataset.adminTheme=darkTheme?"dark":"light";
    return()=>{
      document.documentElement.classList.remove("dark");
      delete document.documentElement.dataset.adminTheme;
    };
  },[darkTheme]);

  useEffect(()=>{
    if(!valid)return;
    const opener=window.opener;
    if(!opener || opener.closed)return;
    const send=(message:Record<string,unknown>)=>opener.postMessage({
      ...message,organizationId:expectedOrganizationId,orderId,
    },window.location.origin);
    const onMessage=(event:MessageEvent)=>{
      if(event.origin!==window.location.origin || event.source!==opener ||
        !event.data || typeof event.data!=="object")return;
      const message=event.data as Record<string,unknown>;
      if(message.organizationId!==expectedOrganizationId || message.orderId!==orderId)return;
      if(message.type==="union-whatsapp-detached-context"){
        const options=Array.isArray(message.documentOptions)?message.documentOptions:[];
        setDocumentOptions(options.filter((item:unknown)=>{
          if(!item||typeof item!=="object")return false;
          const option=item as Record<string,unknown>;
          return typeof option.id==="string"&&typeof option.label==="string";
        }).slice(0,100));
      }else if(message.type==="union-whatsapp-detached-document-result"){
        const request=typeof message.requestId==="string"
          ? requests.current.get(message.requestId):undefined;
        if(!request)return;
        window.clearTimeout(request.timeout);
        requests.current.delete(message.requestId as string);
        if(message.file instanceof File)request.resolve(message.file);
        else request.reject(new Error(typeof message.error==="string"
          ? message.error:"Não foi possível receber o documento da OS."));
      }else if(message.type==="union-whatsapp-detached-reattached"){
        window.close();
        if(!window.closed)navigate("/admin/orders/"+orderId,{replace:true});
      }
    };
    window.addEventListener("message",onMessage);
    send({type:"union-whatsapp-detached-ready"});
    return()=>{
      window.removeEventListener("message",onMessage);
      for(const request of requests.current.values()){
        window.clearTimeout(request.timeout);
        request.reject(new Error("A janela do atendimento foi fechada."));
      }
      requests.current.clear();
    };
  },[valid,expectedOrganizationId,orderId,navigate]);

  const prepareDocument=useCallback((templateId:string):Promise<File>=>{
    const opener=window.opener;
    if(!valid||!opener||opener.closed||
       !documentOptions.some(item=>item.id===templateId))
      return Promise.reject(new Error("O documento não está disponível nesta janela."));
    return new Promise<File>((resolve,reject)=>{
      const requestId=crypto.randomUUID();
      const timeout=window.setTimeout(()=>{
        requests.current.delete(requestId);
        reject(new Error("A janela principal não respondeu à solicitação do documento."));
      },30000);
      requests.current.set(requestId,{resolve,reject,timeout});
      opener.postMessage({type:"union-whatsapp-detached-document",
        organizationId:expectedOrganizationId,orderId,templateId,requestId},window.location.origin);
    });
  },[valid,expectedOrganizationId,orderId,documentOptions]);

  const reintegrate=useCallback((recipient:Recipient|null)=>{
    const opener=window.opener;
    if(!opener || opener.closed){
      navigate("/admin/orders/"+orderId,{replace:true});
      return;
    }
    opener.postMessage({type:"union-whatsapp-detached-reintegrate",
      organizationId:expectedOrganizationId,orderId,
      recipient:recipient ? {
        kind:recipient.kind,phone:recipient.phone,field:recipient.field,
        conversation_id:recipient.conversation_id,
      }:null},window.location.origin);
  },[expectedOrganizationId,orderId,navigate]);

  if(!valid){
    return <main className={`admin-crm ${darkTheme ? "dark" : ""} flex h-dvh items-center justify-center bg-background p-5`}>
      <div role="alert" className="max-w-md rounded-xl border border-border bg-card p-6 text-center text-sm text-foreground">
        <h1 className="text-base font-bold">Não foi possível abrir o atendimento.</h1>
        <p className="mt-2 text-muted-foreground">
          Confira a empresa ativa, o acesso ao WhatsApp e a OS selecionada.
        </p>
        <button type="button" onClick={()=>navigate("/admin")}
          className="mt-4 rounded-lg bg-primary px-4 py-2 font-bold text-primary-foreground">
          Voltar ao CRM
        </button>
      </div>
    </main>;
  }

  const context:WhatsAppModalContext={
    organizationId:expectedOrganizationId,
    source:{
      kind:"order",orderId,phone:"",customerName:"",
      documentOptions,
      prepareDocument:documentOptions.length>0?prepareDocument:undefined,
    },
  };
  return <UnionWhatsAppActivityProvider
    enabled={hasPermission("whatsapp.inbox.view")}
    isPageOpen
    onOpenFull={()=>navigate("/admin/tools/union-whatsapp")}
  >
    <div className={`admin-crm ${darkTheme ? "dark" : ""} h-dvh overflow-hidden bg-background text-foreground`}>
      <WhatsAppConversationModal
        open detached context={context}
        onClose={()=>window.close()}
        onReintegrate={reintegrate}
      />
    </div>
  </UnionWhatsAppActivityProvider>;
}
