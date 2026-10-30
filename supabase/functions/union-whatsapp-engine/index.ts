import { createClient } from "npm:@supabase/supabase-js@2.112.3";

// Controle GLOBAL de infraestrutura. Nunca executa Docker, shell ou logout.
// Autenticação e autorização validadas no servidor ANTES de consultar a VPS.
const cors={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization,apikey,x-client-info,content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS",
};
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{
  status,headers:{...cors,"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"},
});
const uuid=(value:unknown)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value||""));
const bytes=new TextEncoder();
const hex=(buffer:ArrayBuffer)=>Array.from(new Uint8Array(buffer)).map(b=>b.toString(16).padStart(2,"0")).join("");
function envKey(legacy:string,modern:string) {
  const key=Deno.env.get(legacy);
  if(key)return key;
  try {
    const keys=JSON.parse(Deno.env.get(modern)||"{}");
    return String(keys.default||Object.values(keys)[0]||"");
  }catch{return "";}
}
type BridgeStatus={
  reachable:boolean; engine_reachable:boolean|null; version:string|null;
  image:string|null; image_id:string|null; observed_at:string|null;
};
async function bridgeInfo():Promise<BridgeStatus> {
  const bridge=Deno.env.get("UNION_WUZAPI_BRIDGE_URL")?.trim()||"";
  const secret=Deno.env.get("UNION_WUZAPI_BRIDGE_SECRET")?.trim()||"";
  let url:URL;
  try{url=new URL(bridge);}catch{return {reachable:false,engine_reachable:null,version:null,image:null,image_id:null,observed_at:null};}
  if(url.protocol!=="https:"||url.username||url.password||secret.length<32) {
    return {reachable:false,engine_reachable:null,version:null,image:null,image_id:null,observed_at:null};
  }
  const body=JSON.stringify({action:"engine_info"});
  const timestamp=String(Date.now()),nonce=crypto.randomUUID();
  const key=await crypto.subtle.importKey("raw",bytes.encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const sig=hex(await crypto.subtle.sign("HMAC",key,bytes.encode(timestamp+"."+nonce+"."+body)));
  try {
    const result=await fetch(url,{
      method:"POST",headers:{"Content-Type":"application/json","X-Union-Timestamp":timestamp,"X-Union-Nonce":nonce,"X-Union-Signature":sig},
      body,signal:AbortSignal.timeout(6000),
    });
    if(!result.ok)return {reachable:false,engine_reachable:null,version:null,image:null,image_id:null,observed_at:null};
    const data=await result.json() as Record<string,unknown>;
    if(data.ok!==true||data.action!=="engine_info")throw new Error("invalid_info");
    const version=typeof data.version==="string"&&/^v?[0-9]+\.[0-9]+\.[0-9]+$/.test(data.version)?data.version:null;
    const image=typeof data.image==="string"&&data.image.length<180?data.image:null;
    const imageId=typeof data.image_id==="string"&&/^sha256:[0-9a-f]{64}$/.test(data.image_id)?data.image_id:null;
    const observed=typeof data.observed_at==="string"&&!Number.isNaN(Date.parse(data.observed_at))?data.observed_at:null;
    return {reachable:true,engine_reachable:data.engine_reachable===true?true:data.engine_reachable===false?false:null,
      version,image,image_id:imageId,observed_at:observed};
  }catch{return {reachable:false,engine_reachable:null,version:null,image:null,image_id:null,observed_at:null};}
}
async function latestRelease(){
  try{
    const response=await fetch("https://api.github.com/repos/asternic/wuzapi/releases/latest",{
      headers:{"Accept":"application/vnd.github+json","User-Agent":"UnionWorld-EngineMonitor"},
      signal:AbortSignal.timeout(6000),
    });
    if(!response.ok)throw new Error("release_unavailable");
    const data=await response.json() as Record<string,unknown>;
    const version=typeof data.tag_name==="string"&&/^v?[0-9]+\.[0-9]+\.[0-9]+$/.test(data.tag_name)?data.tag_name:null;
    if(!version)throw new Error("release_invalid");
    return {tag:version,published_at:typeof data.published_at==="string"?data.published_at:null,
      url:"https://github.com/asternic/wuzapi/releases"};
  }catch{return {tag:null,published_at:null,url:"https://github.com/asternic/wuzapi/releases"};}
}
function compareVersions(installed:string|null,latest:string|null):boolean|null{
  if(!installed||!latest)return null;
  const a=installed.replace(/^v/,"").split(".").map(Number);
  const b=latest.replace(/^v/,"").split(".").map(Number);
  for(let i=0;i<3;i++){if(b[i]>a[i])return true;if(b[i]<a[i])return false;}
  return false;
}
Deno.serve(async req=>{
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:cors});
  if(req.method!=="POST")return json({success:false,error:"Método não permitido."},405);
  const bearer=req.headers.get("Authorization")||"";
  if(!bearer.startsWith("Bearer "))return json({success:false,error:"Sessão necessária."},401);
  const url=Deno.env.get("SUPABASE_URL")||"";
  const publicKey=envKey("SUPABASE_ANON_KEY","SUPABASE_PUBLISHABLE_KEYS");
  const serviceKey=envKey("SUPABASE_SERVICE_ROLE_KEY","SUPABASE_SECRET_KEYS");
  if(!url||!publicKey||!serviceKey)return json({success:false,error:"Configuração indisponível."},503);
  try{
    const input=await req.json() as Record<string,unknown>;
    const action=String(input.action||"");
    const org=String(input.organization_id||"");
    if(action!=="check"||!uuid(org))return json({success:false,error:"Operação inválida."},400);
    const scoped=createClient(url,publicKey,{global:{headers:{Authorization:bearer}},
      auth:{persistSession:false,autoRefreshToken:false}});
    const admin=createClient(url,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data:auth,error:authError}=await scoped.auth.getUser();
    if(authError||!auth.user)return json({success:false,error:"Sessão expirada."},401);
    // O escopo de plataforma é definido pela função SQL do banco, não pelo cliente.
    const {data:operator,error:operatorError}=await admin.rpc("platform_operator_organization_id");
    if(operatorError||!operator||operator!==org)return json({success:false,error:"Acesso reservado à Union."},403);
    const {data:permissions,error:permissionError}=await scoped.rpc("my_organization_permissions",{p_organization_id:org});
    const allowed=!permissionError&&Array.isArray(permissions)&&permissions.some(
      (row:Record<string,unknown>)=>row.permission_key==="platform.management.manage");
    if(!allowed)return json({success:false,error:"Sem permissão de administração da Union."},403);
    const [release,bridge]=await Promise.all([latestRelease(),bridgeInfo()]);
    return json({success:true,scope:"platform",checked_at:new Date().toISOString(),
      latest:release,bridge,update_available:compareVersions(bridge.version,release.tag),
      maintenance_enabled:false,
      notice:"Atualizações de produção são globais e exigem backup, ensaio e validação na VPS."});
  }catch(error){
    console.error("union-whatsapp-engine",error instanceof Error?error.name:"unknown");
    return json({success:false,error:"Não foi possível verificar o motor."},500);
  }
});
