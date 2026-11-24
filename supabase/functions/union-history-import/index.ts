import { createClient } from "npm:@supabase/supabase-js@2.112.3";
const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,apikey,x-client-info,content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{...cors,"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"}});
const uuid=(v:unknown)=>typeof v==="string"&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);
const packageKey=(v:unknown)=>typeof v==="string"&&/^[a-f0-9]{20}$/.test(v);
const phone=(v:unknown)=>typeof v==="string"&&/^[1-9][0-9]{9,14}$/.test(v);
const key=(legacy:string,modern:string)=>{
  const value=Deno.env.get(legacy);if(value)return value;
  try{const keys=JSON.parse(Deno.env.get(modern)||"{}");return String(keys.default||Object.values(keys)[0]||"")}catch{return ""}
};
async function bridge(input:Record<string,unknown>){
  const endpoint=new URL(Deno.env.get("UNION_HISTORY_GATEWAY_URL")||"");
  const secret=Deno.env.get("UNION_HISTORY_GATEWAY_SECRET")||"";
  if(endpoint.protocol!=="https:"||endpoint.username||endpoint.password||endpoint.pathname!=="/history-import"||secret.length<32)throw Error("Gateway indisponível.");
  const body=JSON.stringify(input),ts=String(Date.now()),nonce=crypto.randomUUID(),encoder=new TextEncoder();
  const hmac=await crypto.subtle.importKey("raw",encoder.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const sig=Array.from(new Uint8Array(await crypto.subtle.sign("HMAC",hmac,encoder.encode(ts+"."+nonce+"."+body)))).map(v=>v.toString(16).padStart(2,"0")).join("");
  const response=await fetch(endpoint,{method:"POST",redirect:"error",headers:{"Content-Type":"application/json","X-Union-Timestamp":ts,"X-Union-Nonce":nonce,"X-Union-Signature":sig},body,signal:AbortSignal.timeout(90000)});
  if(!response.ok)throw Error("Gateway indisponível ou operação recusada.");
  const data=await response.json();
  if(data.success!==true)throw Error("Operação não confirmada.");
  return data.result;
}
Deno.serve(async req=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
  if(req.method!=="POST")return json({success:false,error:"Método inválido."},405);
  const bearer=req.headers.get("Authorization")||"";
  if(!bearer.startsWith("Bearer "))return json({success:false,error:"Sessão necessária."},401);
  try{
    const raw=await req.text();
    if(raw.length>8192)return json({success:false,error:"Requisição inválida."},413);
    const b=JSON.parse(raw),org=b.organization_id;
    if(!uuid(org))return json({success:false,error:"Empresa inválida."},400);
    const url=Deno.env.get("SUPABASE_URL")||"";
    const scoped=createClient(url,key("SUPABASE_ANON_KEY","SUPABASE_PUBLISHABLE_KEYS"),{global:{headers:{Authorization:bearer}},auth:{persistSession:false,autoRefreshToken:false}});
    const admin=createClient(url,key("SUPABASE_SERVICE_ROLE_KEY","SUPABASE_SECRET_KEYS"),{auth:{persistSession:false,autoRefreshToken:false}});
    const {data:auth,error:authError}=await scoped.auth.getUser();
    if(authError||!auth.user)return json({success:false,error:"Sessão expirada."},401);
    const {data:permissions,error:permissionError}=await scoped.rpc("my_organization_permissions",{p_organization_id:org});
    const has=(permission:string)=>!permissionError&&Array.isArray(permissions)&&permissions.some((r:Record<string,unknown>)=>r.permission_key===permission);
    const actor=auth.user.id;
    if(b.action==="grant"){
      const {data:platform,error}=await admin.rpc("platform_operator_organization_id");
      if(error||platform!==org||!has("platform.management.manage"))return json({success:false,error:"Acesso reservado à administração Union."},403);
      if(!uuid(b.target_organization_id)||!packageKey(b.package_id)||b.target_organization_id===org)return json({success:false,error:"Destino ou pacote inválido."},400);
      const {data:target,error:targetError}=await admin.from("organizations").select("id").eq("id",b.target_organization_id).maybeSingle();
      if(targetError||!target)return json({success:false,error:"Empresa indisponível."},404);
      return json({success:true,result:await bridge({action:"grant",organizationId:target.id,packageId:b.package_id,actor})});
    }
    const prefix="whatsapp.history_import.";
    if(!has(prefix+"view"))return json({success:false,error:"Sem permissão de visualizar importações."},403);
    if(b.action==="list"){
      const {data:channels,error}=await admin.from("whatsapp_channel_connections").select("id,display_name,phone,state").eq("organization_id",org).eq("provider","wuzapi").eq("state","connected").limit(100);
      if(error)throw Error("Canais indisponíveis.");
      return json({success:true,result:{...(await bridge({action:"list",organizationId:org})),accounts:(channels||[]).filter(r=>phone(r.phone))}});
    }
    if(b.action==="prepare"){
      if(!has(prefix+"start"))return json({success:false,error:"Sem permissão de iniciar importações."},403);
      if(!uuid(b.channel_id)||!packageKey(b.package_id))return json({success:false,error:"Selecione o pacote e a conta."},400);
      const {data:channel,error}=await admin.from("whatsapp_channel_connections").select("id,phone,state").eq("organization_id",org).eq("provider","wuzapi").eq("id",b.channel_id).eq("state","connected").maybeSingle();
      if(error||!channel||!phone(channel.phone))return json({success:false,error:"Conta de destino não confirmada."},409);
      return json({success:true,result:await bridge({action:"prepare",organizationId:org,packageId:b.package_id,accountPhone:channel.phone,actor})});
    }
    if(!uuid(b.id))return json({success:false,error:"Importação inválida."},400);
    if(["status","events"].includes(b.action))return json({success:true,result:await bridge({action:b.action,id:b.id,organizationId:org})});
    if(b.action==="control"){
      const required=b.command==="start"?"start":b.command==="rollback"?"rollback":["pause","resume","cancel"].includes(b.command)?"manage":null;
      if(!required||!has(prefix+required))return json({success:false,error:"Operação não autorizada."},403);
      // Recheck that the original destination remains connected before starting or resuming.
      if(["start","resume"].includes(b.command)){
        const j=await bridge({action:"status",id:b.id,organizationId:org});
        const {data:channel,error}=await admin.from("whatsapp_channel_connections").select("id").eq("organization_id",org).eq("provider","wuzapi").eq("state","connected").eq("phone",j.account_phone).limit(1);
        if(error||!channel?.length)return json({success:false,error:"Reconecte o número original."},409);
      }
      return json({success:true,result:await bridge({action:"control",id:b.id,organizationId:org,command:b.command,actor})});
    }
    return json({success:false,error:"Operação inválida."},400);
  }catch{
    return json({success:false,error:"Serviço de importação indisponível. Nenhuma conclusão pode ser confirmada."},503);
  }
});
