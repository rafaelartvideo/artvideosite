import { privateMediaCache,privateMediaKey } from "@/shared/application/private-media-cache";
import { operateUnionWhatsAppInbox } from "../infrastructure/union-whatsapp-inbox.repository";
import { DOCUMENT_LINK_SAFE_MS, fetchDocumentBlob, saveDocumentBlob } from "./document-access";
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


// The viewer invokes this from a real click so popup blockers do not intercept it.
export async function actOnSharedDocument(action:"open"|"download",owner:Window,
  getLinks:()=>Promise<{url:string;downloadUrl?:string|null}>,
  getDocument?:()=>Promise<{blob:Blob;name:string}>){
  const popup=action==="open"?owner.open("","_blank"):null;
  if(action==="open"&&!popup)throw Error("Permita pop-ups para abrir o documento.");
  if(popup){popup.opener=null;popup.document.body.textContent="Abrindo documento...";}
  try{
    if(action==="download"&&getDocument){
      const file=await getDocument();
      saveDocumentBlob(file.blob,file.name,owner);
      return;
    }
    const links=await getLinks();
    if(popup){if(!popup.closed)popup.location.replace(links.url);}
    else{
      const anchor=owner.document.createElement("a");
      anchor.href=links.downloadUrl||links.url;anchor.target="_blank";anchor.rel="noopener noreferrer";
      owner.document.body.appendChild(anchor);try{anchor.click();}finally{anchor.remove();}
    }
  }catch(error){if(popup&&!popup.closed)popup.close();throw error;}
}
