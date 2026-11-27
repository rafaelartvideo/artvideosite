import { createClient } from "npm:@supabase/supabase-js@2.112.3";
import { createFiscontroleProvider } from "../_shared/fiscal/fiscontrole-provider.mjs";
import { summarizeEmissionBootstrap } from "../_shared/fiscal/emission-diagnostics.mjs";
const url=Deno.env.get("SUPABASE_URL")||"";
const anon=Deno.env.get("SUPABASE_ANON_KEY")||"";
const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const options={persistSession:false,autoRefreshToken:false};
const headers={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type, x-supabase-api-version","Access-Control-Allow-Methods":"POST, OPTIONS","Content-Type":"application/json","Cache-Control":"no-store"};
const reply=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers});

Deno.serve(async (request:Request)=>{
  if(request.method==="OPTIONS")return new Response(null,{status:204,headers});
  if(request.method!=="POST")return reply(405,{error:"METHOD_NOT_ALLOWED"});
  if(Deno.env.get("FISCAL_ADMIN_API_ENABLED")==="false"||!url||!anon||!service)return reply(503,{error:"FISCAL_ADMIN_UNAVAILABLE"});
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
    if(!body||Array.isArray(body)||typeof body!=="object"||!["status","test","connect","bind_read","emission_diagnosis"].includes(body.action)||
      !Object.keys(body).every(k=>["action","accountId","label","cnpjLimit","email","password","organizationId","confirm","emitterId"].includes(k)))return reply(400,{error:"INVALID_REQUEST"});
    if(body.action==="status"){
      const accounts=await admin.from("fiscal_provider_accounts").select("id,provider,label,cnpj_limit,is_active,inventory_verified_at").order("label").limit(100);
      if(accounts.error)return reply(503,{error:"FISCAL_ADMIN_UNAVAILABLE"});
      const ids=(accounts.data||[]).map(a=>a.id);
      const inventory=ids.length?await admin.from("fiscal_account_cnpjs").select("account_id,cnpj,slot_number,verified_at").in("account_id",ids):{data:[],error:null};
      if(inventory.error)return reply(503,{error:"FISCAL_ADMIN_UNAVAILABLE"});
      return reply(200,{data:(accounts.data||[]).map(a=>({...a,used:(inventory.data||[]).filter(i=>i.account_id===a.id).length}))});
    }
    if(body.action==="connect"){
      const {accountId=null,label,cnpjLimit,email,password}=body;
      if((accountId!==null&&(typeof accountId!=="string"||!/^[0-9a-f-]{36}$/i.test(accountId)))||
        typeof label!=="string"||label.trim().length<1||label.trim().length>120||
        !Number.isSafeInteger(cnpjLimit)||cnpjLimit<1||cnpjLimit>10000||
        typeof email!=="string"||email.length>254||!/^\S+@\S+\.\S+$/.test(email)||
        typeof password!=="string"||password.length<1||password.length>512)return reply(400,{error:"INVALID_CONFIGURATION"});
      // SHA-1 is the documented Fiscontrole session protocol, not local
      // password storage. The password and digest are never persisted.
      const bytes=new Uint8Array(await crypto.subtle.digest("SHA-1",new TextEncoder().encode(password)));
      const digest=Array.from(bytes,b=>b.toString(16).padStart(2,"0")).join("");
      const login=await fetch("https://www.fiscontrole.com.br/app/api/v1/sessao",{
        method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({usuario:email,senha:digest}),redirect:"error",signal:AbortSignal.timeout(15000)
      });
      if(!login.ok)return reply(422,{error:"PROVIDER_LOGIN_FAILED"});
      const session=await login.json();
      if(typeof session?.token!=="string"||session.token.length<1||session.token.length>8192||/\s/.test(session.token))return reply(502,{error:"INVALID_PROVIDER_SESSION"});
      const provider=createFiscontroleProvider({token:session.token});
      const response=await provider.listCompanies();
      if(!Array.isArray(response.empresas))return reply(502,{error:"INVALID_PROVIDER_RESPONSE"});
      const companies=response.empresas.map((c:Record<string,unknown>)=>({name:typeof c.nome==="string"?c.nome.slice(0,200):"",cnpj:typeof c.cnpj==="string"?c.cnpj.replace(/\D/g,""):""}));
      if(companies.some((c:{cnpj:string})=>!/^\d{14}$/.test(c.cnpj))||
         new Set(companies.map((c:{cnpj:string})=>c.cnpj)).size>cnpjLimit)return reply(422,{error:"PROVIDER_INVENTORY_MISMATCH"});
      const saved=await admin.rpc("fiscal_store_provider_session",{p_account:accountId,p_label:label.trim(),p_limit:cnpjLimit,p_token:session.token,p_actor:auth.data.user.id});
      if(saved.error||!saved.data)return reply(409,{error:"ACCOUNT_SAVE_FAILED"});
      return reply(200,{data:{accountId:saved.data,companies,inventoryVerified:false}});
    }
    if(typeof body.accountId!=="string"||!/^[0-9a-f-]{36}$/i.test(body.accountId))return reply(400,{error:"INVALID_ACCOUNT"});
    const account=await admin.from("fiscal_provider_accounts").select("id,provider,credential_ref,session_revision").eq("id",body.accountId).eq("provider","fiscontrole").maybeSingle();
    if(account.error||!account.data)return reply(404,{error:"ACCOUNT_NOT_FOUND"});
    // Read token exclusively from a dedicated server-side secret. Do not accept
    // credentials or arbitrary environment-variable names from the browser.
    const ref=account.data.credential_ref;
    let token:string|undefined;
    if(typeof ref==="string"&&/^vault_[0-9a-f-]{36}$/.test(ref)){
      const secret=await admin.rpc("fiscal_read_provider_session",{p_account:account.data.id});
      if(secret.error||typeof secret.data!=="string")return reply(409,{error:"ACCOUNT_SECRET_NOT_CONFIGURED"});
      token=secret.data;
    }else if(typeof ref==="string"&&/^FISCAL_FISCONTROLE_TOKEN_[A-Z0-9_]{1,64}$/.test(ref))token=Deno.env.get(ref);
    if(!token)return reply(409,{error:"ACCOUNT_SECRET_NOT_CONFIGURED"});
    const provider=createFiscontroleProvider({token});
    const response=await provider.listCompanies();
    if(!Array.isArray(response.empresas))return reply(502,{error:"INVALID_PROVIDER_RESPONSE"});
    const companies=response.empresas.map((c:Record<string,unknown>)=>({name:typeof c.nome==="string"?c.nome.slice(0,200):"",cnpj:typeof c.cnpj==="string"?c.cnpj.replace(/\D/g,""):""}));
    if(companies.some((c:{cnpj:string})=>!/^\d{14}$/.test(c.cnpj)))return reply(502,{error:"INVALID_PROVIDER_RESPONSE"});
    if(body.action==="emission_diagnosis"){
      if(typeof body.organizationId!=="string"||!/^[0-9a-f-]{36}$/i.test(body.organizationId))return reply(400,{error:"INVALID_ORGANIZATION"});
      const binding=await admin.from("fiscal_organization_bindings")
        .select("cnpj,external_company_id").eq("organization_id",body.organizationId).eq("account_id",account.data.id).eq("is_enabled",true).maybeSingle();
      const org=await admin.from("organizations").select("document").eq("id",body.organizationId).eq("status","active").maybeSingle();
      if(binding.error||org.error||!binding.data||!org.data||typeof org.data.document!=="string"||org.data.document.replace(/\D/g,"")!==binding.data.cnpj)return reply(403,{error:"FISCAL_BINDING_REQUIRED"});
      const matched=response.empresas.filter((item:Record<string,unknown>)=>typeof item.cnpj==="string"&&item.cnpj.replace(/\D/g,"")===binding.data.cnpj);
      if(matched.length!==1)return reply(409,{error:"CNPJ_NOT_AUTHORIZED_BY_PROVIDER"});
      const listedId=Number(matched[0].id);
      const listed=Number.isSafeInteger(listedId)&&listedId>0?listedId:null;
      const configured=binding.data.external_company_id;
      const requested=body.emitterId;
      if(requested!==undefined&&(!Number.isSafeInteger(requested)||requested<1))return reply(400,{error:"INVALID_EMITTER_ID"});
      const companyId=requested??configured??listed;
      if(!companyId)return reply(409,{error:"EMITTER_ID_REQUIRED"});
      if((configured&&configured!==companyId)||(listed&&listed!==companyId))return reply(409,{error:"EMITTER_ID_MISMATCH"});
      // Read-only bootstrap, fixed homologation environment; no writes, no
      // binding changes and no fiscal transmissions are possible here.
      try{
        const data=await createFiscontroleProvider({token,timeoutMs:30000}).emission({operation:"bootstrap",company:companyId,environment:2});
        const diagnosis=summarizeEmissionBootstrap(data,binding.data.cnpj,companyId);
        if(diagnosis.identity==="mismatch")return reply(409,{error:"EMITTER_ID_MISMATCH"});
        return reply(200,{data:{emitterId:companyId,environment:2,identity:diagnosis.identity,models:diagnosis.models,profileCount:diagnosis.profileCount,productionEnabled:false}});
      }catch(error){
        const status=error instanceof Error&&error.name==="FiscalProviderError"?(error as {status?:number}).status:undefined;
        const code=error instanceof Error&&error.message==="FISCAL_BOOTSTRAP_SCHEMA_UNRECOGNIZED"?"FISCAL_BOOTSTRAP_SCHEMA_UNRECOGNIZED":"EMISSION_DIAGNOSIS_FAILED";
        console.warn(JSON.stringify({event:"fiscal_emission_diagnosis",code,providerStatus:status??0}));
        return reply(424,{error:code,...(status?{providerStatus:status}:{})});
      }
    }
    if(body.action==="bind_read"){
      if(body.confirm!==true||typeof body.organizationId!=="string"||!/^[0-9a-f-]{36}$/i.test(body.organizationId))return reply(400,{error:"BINDING_CONFIRMATION_REQUIRED"});
      const org=await admin.from("organizations").select("id,document").eq("id",body.organizationId).eq("status","active").maybeSingle();
      if(org.error||!org.data)return reply(404,{error:"ORGANIZATION_NOT_FOUND"});
      const cnpj=typeof org.data.document==="string"?org.data.document.replace(/\D/g,""):"";
      if(!companies.some((c:{cnpj:string})=>c.cnpj===cnpj))return reply(409,{error:"CNPJ_NOT_AUTHORIZED_BY_PROVIDER"});
      const activated=await admin.rpc("fiscal_enable_read_binding",{
        p_account:account.data.id,p_org:org.data.id,p_actor:auth.data.user.id,
        p_expected_revision:account.data.session_revision,p_visible_cnpjs:companies.map((c:{cnpj:string})=>c.cnpj)
      });
      if(activated.error||!activated.data)return reply(409,{error:"FISCAL_BINDING_NOT_ACTIVATED"});
      return reply(200,{data:{bindingId:activated.data,cnpj,readEnabled:true,productionEnabled:false}});
    }
    // This is a diagnostic only. The documented list does not contain numeric
    // emission company IDs; do not guess bindings or mark inventory verified.
    return reply(200,{data:{companies,inventoryVerified:false}});
  }catch{return reply(503,{error:"FISCAL_ADMIN_UNAVAILABLE"});}
});
