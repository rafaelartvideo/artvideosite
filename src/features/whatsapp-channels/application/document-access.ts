// Private attachments: keep signatures only for their safe lifetime and
// never save a Storage error response as a document.
export type DocumentLinks={url:string;filename?:string|null;mime?:string|null};
export const DOCUMENT_LINK_SAFE_MS=90_000;
export function documentName(name:string|null|undefined,mime:string|null|undefined,fallback?:string|null){
  const clean=(value:string|null|undefined)=>String(value||"").split(/[\\/]/).pop()!
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/g,"").trim();
  const original=clean(name)||clean(fallback)||"Documento";
  const type=String(mime||"").split(";")[0].trim().toLowerCase();
  const extension:Record<string,string>={
    "application/pdf":"pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document":"docx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":"xlsx",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation":"pptx",
    "application/msword":"doc","application/vnd.ms-excel":"xls",
    "application/vnd.ms-powerpoint":"ppt","text/plain":"txt","text/csv":"csv",
    "application/zip":"zip","application/json":"json",
  };
  const ext=extension[type];
  if(ext&&!original.toLowerCase().endsWith("."+ext)){
    return original.replace(/\.[a-z0-9]{1,8}$/i,"")+"."+ext;
  }
  return original;
}
export async function fetchDocumentBlob(getLinks:(force:boolean)=>Promise<DocumentLinks>,name?:string|null,mime?:string|null){
  for(let attempt=0;attempt<2;attempt++){
    const links=await getLinks(attempt===1);
    const response=await fetch(links.url,{referrerPolicy:"no-referrer"});
    if(!response.ok){
      if(attempt===0&&[400,401,403].includes(response.status))continue;
      throw new Error("Não foi possível acessar o arquivo. Tente novamente.");
    }
    let blob=await response.blob();
    if(!blob.size)throw new Error("O arquivo está vazio.");
    const type=String(mime||links.mime||blob.type||"").split(";")[0].trim().toLowerCase();
    const originalName=name||links.filename;
    const isPdf=type==="application/pdf"||/\.pdf$/i.test(originalName||"");
    if(isPdf){
      const header=await blob.slice(0,1024).text();
      if(!header.includes("%PDF-"))throw new Error("O arquivo recebido não é um PDF válido.");
      if(blob.type!=="application/pdf")blob=new Blob([blob],{type:"application/pdf"});
    }
    return {blob,name:documentName(name,isPdf?"application/pdf":type,links.filename)};
  }
  throw new Error("Não foi possível abrir o arquivo.");
}
export function saveDocumentBlob(blob:Blob,name:string,owner:Window){
  const url=URL.createObjectURL(blob);
  const anchor=owner.document.createElement("a");
  anchor.href=url;anchor.download=name;anchor.style.display="none";
  owner.document.body.appendChild(anchor);
  try{anchor.click();}finally{anchor.remove();owner.setTimeout(()=>URL.revokeObjectURL(url),60_000);}
}
