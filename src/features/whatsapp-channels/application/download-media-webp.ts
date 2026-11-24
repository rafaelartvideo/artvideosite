/** Encode the displayed original at its natural resolution, not the CSS zoom or rotation. */
async function encodeWebp(source:CanvasImageSource,width:number,height:number,doc:Document){
  if(width<=0 || height<=0)throw new Error("Imagem ainda não carregada.");
  const canvas=doc.createElement("canvas");
  canvas.width=width;
  canvas.height=height;
  try{
    const context=canvas.getContext("2d");
    if(!context)throw new Error("Conversão de imagem indisponível.");
    context.drawImage(source,0,0,width,height);
    const blob=await new Promise<Blob|null>(resolve=>canvas.toBlob(resolve,"image/webp",0.94));
    if(!blob || blob.type!=="image/webp")throw new Error("O navegador não conseguiu gerar WebP.");
    return blob;
  }finally{canvas.width=0;canvas.height=0;}
}

export async function downloadMediaWebp(image:HTMLImageElement|null,url:string,name:string,doc:Document){
  let blob:Blob|undefined;
  if(image?.complete && image.naturalWidth && image.naturalHeight){
    try{
      // Reuse decoded pixels: no new request for a CORS-readable, already loaded image.
      blob=await encodeWebp(image,image.naturalWidth,image.naturalHeight,doc);
    }catch(error){
      // Canvas exceptions may come from the detached window realm.
      if(!error || typeof error!=="object" || !("name" in error) || error.name!=="SecurityError")throw error;
    }
  }
  if(!blob){
    // Only a user-initiated fallback if the decoded image is not readable by canvas.
    const response=await fetch(url,{cache:"force-cache",credentials:"omit"});
    if(!response.ok)throw new Error("Não foi possível acessar a imagem original.");
    const original=await response.blob();
    if(original.type==="image/webp")blob=original;
    else{
      const bitmap=await createImageBitmap(original);
      try{blob=await encodeWebp(bitmap,bitmap.width,bitmap.height,doc);}
      finally{bitmap.close();}
    }
  }
  const base=(name||"Imagem").replace(/\.[a-z0-9]{2,5}$/i,"").replace(/[\\/:*?"<>|\u0000-\u001f]/g,"-").trim()||"Imagem";
  const objectUrl=URL.createObjectURL(blob);
  const anchor=doc.createElement("a");
  try{
    anchor.href=objectUrl;
    anchor.download=base+".webp";
    doc.body.appendChild(anchor);
    anchor.click();
  }finally{
    anchor.remove();
    window.setTimeout(()=>URL.revokeObjectURL(objectUrl),1000);
  }
}
