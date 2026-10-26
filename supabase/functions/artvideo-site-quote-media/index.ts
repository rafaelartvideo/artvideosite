import { createClient } from "npm:@supabase/supabase-js@2.112.3";

const HEADERS={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS",
  "Content-Type":"application/json; charset=utf-8",
  "Cache-Control":"no-store",
};
const respond=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:HEADERS});
const validUUID=(s:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

Deno.serve(async req=>{
  if(req.method==="OPTIONS")return new Response(null,{headers:HEADERS});
  if(req.method!=="POST")return respond({error:"Método inválido."},405);
  if(Number(req.headers.get("content-length")||0)>18*1024*1024)
    return respond({error:"Os anexos excedem 18 MB."},413);
  try{
    const input=await req.formData();
    const protocol=String(input.get("protocol")||"").trim();
    const secret=String(input.get("secret")||"").trim();
    if(!/^ORC-\d{1,12}$/.test(protocol)||!validUUID(secret))
      return respond({error:"Identificação dos anexos inválida."},400);
    const items=["equipment","label","site"].map(kind=>({kind,file:input.get(kind)}))
      .filter(item=>item.file instanceof File) as {kind:string;file:File}[];
    if(!items.length)return respond({success:true,uploaded:0});
    for(const {file} of items){
      if(!["image/jpeg","image/png","image/webp"].includes(file.type)||file.size>6*1024*1024||file.size===0)
        return respond({error:"Envie somente fotos JPG, PNG ou WebP de até 6 MB cada."},400);
    }
    const supabase=createClient(Deno.env.get("SUPABASE_URL")!,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,{
      auth:{persistSession:false,autoRefreshToken:false},
    });
    const org="00000000-0000-4000-8000-000000000001";
    const {data:quote,error:quoteError}=await supabase.from("quote_requests")
      .select("id,organization_id,origin,service_address,created_at")
      .eq("protocol",protocol).eq("organization_id",org).eq("origin","site").maybeSingle();
    if(quoteError)return respond({error:"Não foi possível validar a solicitação."},503);
    if(!quote)return respond({error:"Solicitação indisponível."},404);
    const hash=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",
      new TextEncoder().encode(secret))),b=>b.toString(16).padStart(2,"0")).join("");
    const expected=String(quote.service_address?.media_token_hash||"");
    const age=Date.now()-new Date(quote.created_at).getTime();
    if(!expected||expected!==hash||age<0||age>2*60*60*1000)
      return respond({error:"A autorização dos anexos expirou ou é inválida."},403);
    let uploaded=0;
    for(const {kind,file} of items){
      const ext=file.type==="image/png"?"png":file.type==="image/webp"?"webp":"jpg";
      const objectPath=`quotes/${org}/${quote.id}/public-${kind}.${ext}`;
      const {error:uploadError}=await supabase.storage.from("quote-images")
        .upload(objectPath,file,{contentType:file.type,upsert:true,cacheControl:"3600"});
      if(uploadError)throw new Error("Falha ao guardar a foto de "+kind+".");
      const {error:metaError}=await supabase.from("quote_media")
        .upsert({quote_request_id:quote.id,organization_id:org,
          bucket_id:"quote-images",storage_path:objectPath,
          file_name:file.name.slice(0,120),kind},
          {onConflict:"storage_path"});
      if(metaError)throw new Error("Falha ao registrar a foto de "+kind+".");
      uploaded++;
    }
    return respond({success:true,uploaded});
  }catch(error){
    console.error("[site-quote-media]",error instanceof Error?error.message:"Upload failed");
    return respond({error:"Não foi possível guardar todas as fotos. Tente novamente."},503);
  }
});
