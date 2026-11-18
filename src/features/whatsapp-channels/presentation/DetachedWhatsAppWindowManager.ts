import { systemErrorMessage } from "@/shared/domain/error-message";
import type { WhatsAppModalContext } from "./WhatsAppConversationModal";

type OrderContext = WhatsAppModalContext & {
  source: Extract<WhatsAppModalContext["source"],{kind:"order"}>;
};
type Session = { popup:Window; context:OrderContext; ready:boolean };

// This module survives route transitions between OS screens. The original
// useWhatsAppConversationModal hook does not: it can unmount with its OS page.
let session:Session|null=null;
let installed=false;
const popupName="union_whatsapp_detached_"+crypto.randomUUID().replace(/-/g,"");
export function detachedWhatsAppPopupName():string { return popupName; }
const REATTACH_EVENT="union-whatsapp-detached-reattach";

function isOrderContext(context:WhatsAppModalContext):context is OrderContext {
  return context.source.kind==="order";
}

function activeSession():Session|null {
  if(!session)return null;
  try{
    if(session.popup.closed){session=null;return null;}
    // The popup may have been used to open another CRM page after "Ver
    // atendimentos". Never send a switch message to an unrelated page.
    if(session.ready &&
       !/^\/admin\/whatsapp-destacado\/[0-9a-f-]{36}$/i.test(session.popup.location.pathname)){
      session=null;
      return null;
    }
  }catch{
    session=null;
    return null;
  }
  return session;
}

export function detachedWhatsAppOrderUrl(context:OrderContext):string {
  const url=new URL("/admin/whatsapp-destacado/"+encodeURIComponent(context.source.orderId),
    window.location.origin);
  url.searchParams.set("org",context.organizationId);
  return url.toString();
}

function sendMessage(target:Window,context:OrderContext,body:Record<string,unknown>){
  if(!target.closed)target.postMessage({
    ...body,organizationId:context.organizationId,orderId:context.source.orderId,
  },window.location.origin);
}

function sanitizeRecipient(value:unknown):OrderContext["source"]["preferredRecipient"] {
  if(!value||typeof value!=="object")return;
  const candidate=value as Record<string,unknown>;
  if((candidate.kind!=="registered"&&candidate.kind!=="linked") ||
     typeof candidate.phone!=="string" || !/^[0-9]{10,14}$/.test(candidate.phone))return;
  return {
    kind:candidate.kind,phone:candidate.phone,
    field:candidate.field==="whatsapp"||candidate.field==="phone"?candidate.field:undefined,
    conversation_id:typeof candidate.conversation_id==="string"?candidate.conversation_id:undefined,
  };
}

function handleMessage(event:MessageEvent){
  const current=activeSession();
  if(!current || event.origin!==window.location.origin ||
     event.source!==current.popup || !event.data ||
     typeof event.data!=="object")return;
  const message=event.data as Record<string,unknown>;
  const {context,popup}=current;
  if(message.organizationId!==context.organizationId)return;
  if(message.type==="union-whatsapp-detached-ready")current.ready=true;
  if(message.type==="union-whatsapp-detached-ready" &&
     message.orderId!==context.source.orderId){
    // The popup finished loading an older OS while the operator clicked a
    // newer one. Switch it to the latest selected OS without opening another.
    sendMessage(popup,context,{type:"union-whatsapp-detached-switch"});
    return;
  }
  if(message.orderId!==context.source.orderId)return;

  if(message.type==="union-whatsapp-detached-ready"){
    sendMessage(popup,context,{type:"union-whatsapp-detached-context",
      documentOptions:context.source.documentOptions||[]});
  }else if(message.type==="union-whatsapp-detached-document"){
    if(typeof message.requestId!=="string" ||
       !/^[0-9a-f-]{36}$/i.test(message.requestId) ||
       typeof message.templateId!=="string")return;
    const allowed=context.source.documentOptions?.some(item=>item.id===message.templateId);
    if(!allowed||!context.source.prepareDocument){
      sendMessage(popup,context,{type:"union-whatsapp-detached-document-result",
        requestId:message.requestId,error:"Documento indisponível nesta OS."});
      return;
    }
    void context.source.prepareDocument(message.templateId)
      .then(file=>{
        if(session!==current)return;
        sendMessage(popup,context,{type:"union-whatsapp-detached-document-result",
          requestId:message.requestId,file});
      }).catch(error=>{
        if(session!==current)return;
        sendMessage(popup,context,{type:"union-whatsapp-detached-document-result",
          requestId:message.requestId,
          error:systemErrorMessage(error,"Não foi possível preparar o documento.")});
      });
  }else if(message.type==="union-whatsapp-detached-reintegrate"){
    const preferredRecipient=sanitizeRecipient(message.recipient);
    const toReattach:OrderContext={
      ...context,source:{...context.source,preferredRecipient},
    };
    session=null;
    // Any currently mounted OS modal hook can consume the event. We do not
    // close the actual WhatsApp attendance; only the detached browser window.
    window.dispatchEvent(new CustomEvent(REATTACH_EVENT,{detail:toReattach}));
    sendMessage(popup,context,{type:"union-whatsapp-detached-reattached"});
  }
}

function ensureListening(){
  if(installed)return;
  installed=true;
  window.addEventListener("message",handleMessage);
}

export function registerDetachedWhatsAppWindow(popup:Window,context:WhatsAppModalContext){
  if(!isOrderContext(context))return;
  ensureListening();
  session={popup,context,ready:false};
}

export function reuseDetachedWhatsAppWindow(context:WhatsAppModalContext):boolean {
  if(!isOrderContext(context))return false;
  const current=activeSession();
  if(!current)return false;
  ensureListening();
  const previousOrganization=current.context.organizationId;
  current.context=context;
  if(previousOrganization!==context.organizationId){
    // A company change must load the protected route again, never carry
    // conversation state across organizations.
    current.popup.location.assign(detachedWhatsAppOrderUrl(context));
  }else{
    sendMessage(current.popup,context,{type:"union-whatsapp-detached-switch"});
  }
  current.popup.focus();
  return true;
}

export function addDetachedReattachListener(listener:(context:WhatsAppModalContext)=>void){
  const onEvent=(event:Event)=>{
    const detail=(event as CustomEvent<WhatsAppModalContext>).detail;
    if(detail && isOrderContext(detail))listener(detail);
  };
  window.addEventListener(REATTACH_EVENT,onEvent);
  return ()=>window.removeEventListener(REATTACH_EVENT,onEvent);
}
