import { createClient } from "npm:@supabase/supabase-js@2.112.3";
import { createFiscontroleProvider } from "../_shared/fiscal/fiscontrole-provider.mjs";
const url=Deno.env.get("SUPABASE_URL")||"";
const anon=Deno.env.get("SUPABASE_ANON_KEY")||"";
const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const options={persistSession:false,autoRefreshToken:false};
const headers={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type, x-supabase-api-version","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json","Cache-Control":"no-store"};
const reply=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers});

Deno.serve(async (request:Request)=>{
  if(request.method==="OPTIONS")return new Response(null,{status:204,headers});
  if(request.method!=="POST")return reply(405,{error:"METHOD_NOT_ALLOWED"});
  if(Deno.env.get("FISCAL_ADMIN_API_ENABLED")!=="true"||!url||!anon||!service)return reply(503,{error:"FISCAL_ADMIN_UNAVAILABLE"});
  const bearer=request.headers.get("Authorization")?.match(/^Bearer ([^\s]+)$/i)?.[1];
  if(!bearer)return reply(401,{error:"UNAUTHENTICATED"});
  try{
    const acting=createClient(url,anon,{auth:options,global:{headers:{Authorization:"Bearer "+bearer}}});
    const auth=await acting.auth.getUser(bearer);
    if(auth.error||!auth.data.user)return reply(401,{error:"INVALID_SESSION"});
    const admin=createClient(url,service,{auth:options});
    const platform=await acting.rpc("platform_operator_organization_id");
    if(platform.error||typeof platform.data!=="string")return reply(403,{error:"FISCAL_ADMIN_DENIED"});
    const platformId=platform.data;
    const [member,profile,organization,permissions]=await Promise.all([
      admin.from("organization_members").select("id").eq("organization_id",platformId).eq("user_id",auth.data.user.id).eq("status","active").limit(1).maybeSingle(),
      admin.from("profiles").select("id").eq("id",auth.data.user.id).eq("is_active",true).maybeSingle(),
      admin.from("organizations").select("settings").eq("id",platformId).eq("status","active").maybeSingle(),
      acting.rpc("my_organization_permissions",{p_organization_id:platformId})
    ]);
    if([member,profile,organization,permissions].some(r=>r.error))return reply(503,{error:"FISCAL_ADMIN_UNAVAILABLE"});
    if(!member.data||!profile.data||organization.data?.settings?.is_platform_operator!==true||
      !Array.isArray(permissions.data)||!permissions.data.some((p:{permission_key:string})=>p.permission_key==="platform.management.manage")||
      !permissions.data.some((p:{permission_key:string})=>p.permission_key==="organizations.modules.manage"))return reply(403,{error:"FISCAL_ADMIN_DENIED"});
    const raw=await request.text();
    if(new TextEncoder().encode(raw).byteLength>4096)return reply(413,{error:"REQUEST_TOO_LARGE"});
    let body;
    try{body=JSON.parse(raw);}catch{return reply(400,{error:"INVALID_REQUEST"});}
    if(!body||Array.isArray(body)||typeof body!=="object"||!["status","test"].includes(body.action)||
      !Object.keys(body).every(k=>["action","accountId"].includes(k)))return reply(400,{error:"INVALID_REQUEST"});
    if(body.action==="status"){
      const accounts=await admin.from("fiscal_provider_accounts").select("id,provider,label,cnpj_limit,is_active,inventory_verified_at").order("label").limit(100);
      if(accounts.error)return reply(503,{error:"FISCAL_ADMIN_UNAVAILABLE"});
      const ids=(accounts.data||[]).map(a=>a.id);
      const inventory=ids.length?await admin.from("fiscal_account_cnpjs").select("account_id,cnpj,slot_number,verified_at").in("account_id",ids):{data:[],error:null};
      if(inventory.error)return reply(503,{error:"FISCAL_ADMIN_UNAVAILABLE"});
      return reply(200,{data:(accounts.data||[]).map(a=>({...a,used:(inventory.data||[]).filter(i=>i.account_id===a.id).length}))});
    }
    if(typeof body.accountId!=="string"||!/^[0-9a-f-]{36}$/i.test(body.accountId))return reply(400,{error:"INVALID_ACCOUNT"});
    const account=await admin.from("fiscal_provider_accounts").select("id,provider,credential_ref").eq("id",body.accountId).eq("provider","fiscontrole").maybeSingle();
    if(account.error||!account.data)return reply(404,{error:"ACCOUNT_NOT_FOUND"});
    // Read token exclusively from a dedicated server-side secret. Do not accept
    // credentials or arbitrary environment-variable names from the browser.
    const ref=account.data.credential_ref;
    if(typeof ref!=="string"||!/^FISCAL_FISCONTROLE_TOKEN_[A-Z0-9_]{1,64}$/.test(ref))return reply(409,{error:"ACCOUNT_SECRET_NOT_CONFIGURED"});
    const token=Deno.env.get(ref);
    if(!token)return reply(409,{error:"ACCOUNT_SECRET_NOT_CONFIGURED"});
    const provider=createFiscontroleProvider({token});
    const response=await provider.listCompanies();
    if(!Array.isArray(response.empresas))return reply(502,{error:"INVALID_PROVIDER_RESPONSE"});
    const companies=response.empresas.map((c:Record<string,unknown>)=>({name:typeof c.nome==="string"?c.nome.slice(0,200):"",cnpj:typeof c.cnpj==="string"?c.cnpj.replace(/\D/g,""):""}));
    if(companies.some((c:{cnpj:string})=>!/^\d{14}$/.test(c.cnpj)))return reply(502,{error:"INVALID_PROVIDER_RESPONSE"});
    // This is a diagnostic only. The documented list does not contain numeric
    // emission company IDs; do not guess bindings or mark inventory verified.
    return reply(200,{data:{companies,inventoryVerified:false}});
  }catch{return reply(503,{error:"FISCAL_ADMIN_UNAVAILABLE"});}
});
