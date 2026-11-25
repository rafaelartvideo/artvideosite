import { privateMediaCache,privateMediaKey } from "@/shared/application/private-media-cache";
import { operateUnionWhatsAppInbox } from "../infrastructure/union-whatsapp-inbox.repository";
import { DOCUMENT_LINK_SAFE_MS, fetchDocumentBlob } from "./document-access";
export const whatsappMediaKey=(organization:string,conversation:string,messageId:string)=>privateMediaKey("whatsapp-media",organization,conversation,messageId);
export function getWhatsAppMediaLinks(organization:string,conversation:string,messageId:string,force=false){
  return privateMediaCache.get(whatsappMediaKey(organization,conversation,messageId),DOCUMENT_LINK_SAFE_MS,async()=>{
    const controller=new AbortController();
    const timeout=setTimeout(()=>controller.abort(),75000);
    try{
      const data=await operateUnionWhatsAppInbox(organization,conversation,"media_view",{message_id:messageId},controller.signal);
      if(!data.url||!data.url.startsWith("https://"))throw Error("Arquivo indisponível.");
      return {url:data.url,downloadUrl:data.download_url||null,filename:data.filename,mime:data.mime};
    }finally{clearTimeout(timeout);}
  },force);
}
export function getWhatsAppDocument(organization:string,conversation:string,messageId:string,name?:string|null,mime?:string|null){
  return privateMediaCache.get(privateMediaKey("whatsapp-document",organization,conversation,messageId),DOCUMENT_LINK_SAFE_MS,
    ()=>fetchDocumentBlob(force=>getWhatsAppMediaLinks(organization,conversation,messageId,force),name,mime),
    false,value=>value.blob.size);
}
