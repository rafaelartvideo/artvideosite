import { createClient } from "npm:@supabase/supabase-js@2.112.3";

const respond = (data: Record<string, unknown>, status=200) =>
  new Response(JSON.stringify(data), {status, headers: {"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
const decode=(s:string)=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));

Deno.serve(async request=>{
  if(request.method!=="POST") return respond({error:"Método não permitido"},405);
  if((request.headers.get("content-type")||"").split(";")[0]!=="application/json") return respond({error:"Content-Type inválido"},415);
  if(Number(request.headers.get("content-length")||"0")>6000) return respond({error:"Tamanho inválido"},413);
  const raw=await request.text();
  if(raw.length>6000) return respond({error:"Tamanho inválido"},413);
  const url=Deno.env.get("SUPABASE_URL");
  const key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!key) return respond({error:"Ponte não configurada"},503);
  const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const id=request.headers.get("X-Pbx-Agent")||"";
  const time=request.headers.get("X-Pbx-Time")||"";
  const seqRaw=request.headers.get("X-Pbx-Sequence")||"";
  const signature=request.headers.get("X-Pbx-Signature")||"";
  const seq=Number(seqRaw);
  if(!uuid.test(id)||!/^[0-9]{13}$/.test(time)||!/^[1-9][0-9]{0,13}$/.test(seqRaw)||
     !Number.isSafeInteger(seq)||Math.abs(Date.now()-Number(time))>120000||
     !/^[A-Za-z0-9+/]{86}==$/.test(signature)) return respond({error:"Identificação inválida"},401);
  try {
    const {data:agent,error:lookupError}=await admin.from("pbx_agents")
      .select("id,organization_id,public_key,enabled,last_sequence").eq("id",id).maybeSingle();
    if(lookupError||!agent?.enabled||seq<=Number(agent.last_sequence)) return respond({error:"Agente não autorizado"},401);
    const publicKey=await crypto.subtle.importKey("raw",decode(agent.public_key) as BufferSource,{name:"Ed25519"},false,["verify"]);
    const signedText=time+"\n"+seqRaw+"\n"+raw;
    const verified=await crypto.subtle.verify("Ed25519",publicKey,decode(signature) as BufferSource,new TextEncoder().encode(signedText));
    if(!verified) return respond({error:"Assinatura inválida"},401);
    const {data:advanced,error:advanceError}=await admin.from("pbx_agents")
      .update({last_sequence:seq,last_seen_at:new Date().toISOString()})
      .eq("id",agent.id).eq("enabled",true).lt("last_sequence",seq).select("id").maybeSingle();
    if(advanceError||!advanced) return respond({error:"Requisição repetida ou agente revogado"},409);
    let body:Record<string,unknown>;
    try {
      body=JSON.parse(raw);
      if(!body||typeof body!=="object"||Array.isArray(body)) throw Error();
    } catch {return respond({error:"JSON inválido"},400)}
    if(body.action==="poll"){
      const {data,error}=await admin.from("pbx_extensions")
        .select("id,organization_id,number,endpoint_name,desired_enabled,updated_at")
        .eq("organization_id",agent.organization_id).eq("is_managed",true)
        .eq("provisioning_status","pending").order("updated_at").limit(10);
      if(error) return respond({error:"Erro ao consultar ramais"},503);
      return respond({jobs:data||[]});
    }
    if(body.action==="report"){
      const jobId=String(body.id||""),version=String(body.version||""),status=String(body.status||"");
      if(!uuid.test(jobId)||!/^\d{4}-\d\d-\d\dT[\d:.]+(?:Z|[+-]\d\d:\d\d)$/.test(version)||
        !["applied","failed"].includes(status)) return respond({error:"Confirmação inválida"},400);
      const errorText=status==="failed"?String(body.error||"Falha na VPS").slice(0,240):null;
      const {data,error}=await admin.from("pbx_extensions")
        .update({provisioning_status:status,last_error:errorText})
        .eq("id",jobId).eq("organization_id",agent.organization_id)
        .eq("is_managed",true).eq("provisioning_status","pending")
        .eq("updated_at",version).select("id").maybeSingle();
      if(error) return respond({error:"Erro ao confirmar operação"},503);
      return respond({accepted:Boolean(data),stale:!data});
    }
    return respond({error:"Ação desconhecida"},400);
  } catch(error){
    console.error("PBX bridge error",error instanceof Error?error.name:"unknown");
    return respond({error:"Falha temporária da ponte"},503);
  }
});
