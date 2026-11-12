import { createClient } from "npm:@supabase/supabase-js@2.112.3";

// Read ONLY names and photo files already saved in the CRM/Supabase.
// Never request a WhatsApp photo, contact lookup, status or presence from WuzAPI.
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization,apikey,x-client-info,content-type",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};
const respond = (data: unknown, status=200) => new Response(JSON.stringify(data), {
  status, headers:{...cors,"content-type":"application/json","cache-control":"private, no-store"},
});
const uuid = (value: unknown):value is string =>
  typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
function envKey(legacy:string, modern:string) {
  const value=Deno.env.get(legacy);
  if(value)return value;
  try {const keys=JSON.parse(Deno.env.get(modern)||"{}");return String(keys.default||Object.values(keys)[0]||"");}
  catch {return "";}
}
type IdentityRow={number:string;display_name:string|null;avatar_path:string|null};
Deno.serve(async req => {
  if (req.method==="OPTIONS") return new Response(null,{status:204,headers:cors});
  if (req.method!=="POST") return respond({success:false,error:"Método inválido."},405);
  const base=Deno.env.get("SUPABASE_URL")||"";
  const publicKey=envKey("SUPABASE_ANON_KEY","SUPABASE_PUBLISHABLE_KEYS");
  const serviceKey=envKey("SUPABASE_SERVICE_ROLE_KEY","SUPABASE_SECRET_KEYS");
  const bearer=req.headers.get("authorization")||"";
  if(!base||!publicKey||!serviceKey||!bearer.startsWith("Bearer "))return respond({success:false,error:"Sessão indisponível."},401);
  try {
    const body=await req.json() as Record<string,unknown>;
    const organization_id=body.organization_id;
    const raw=body.numbers;
    if(!uuid(organization_id)||!Array.isArray(raw)||raw.length<1||raw.length>12||
      raw.some(v=>typeof v!=="string"||v.length>32||!/^[+()0-9\s-]{10,32}$/.test(v)))
      return respond({success:false,error:"Parâmetros inválidos."},400);
    const numbers=[...new Set(raw as string[])];
    const scoped=createClient(base,publicKey,{
      global:{headers:{Authorization:bearer}},auth:{persistSession:false,autoRefreshToken:false},
    });
    const {data:user,error:authError}=await scoped.auth.getUser();
    if(authError||!user.user)return respond({success:false,error:"Sessão expirada."},401);
    // The same tenant/module/active membership/pbx.view guard used by call-history RLS.
    const {data:allowed,error:accessError}=await scoped.rpc("pbx_contact_access_v1",{p_organization_id:organization_id});
    if(accessError||allowed!==true)return respond({success:false,error:"Acesso negado."},403);

    const admin=createClient(base,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data:rows,error:lookupError}=await admin.rpc("pbx_resolve_cached_contacts_v1",{
      p_organization_id:organization_id,p_numbers:numbers,
    });
    if(lookupError)throw lookupError;
    const candidates=(Array.isArray(rows)?rows:[]) as IdentityRow[];
    const result=await Promise.all(candidates.slice(0,12).map(async row=>{
      // Never expose Storage paths or return WhatsApp CDN URLs.
      const path=row.avatar_path;
      let avatar_url:string|null=null;
      if(path&&path.startsWith(organization_id+"/")&&
        /^[-\w/]+\/[-\w/]+\/avatars\/[-a-f0-9]+$/.test(path)) {
        const {data:link,error}=await admin.storage.from("union-whatsapp-media")
          .createSignedUrl(path,3600);
        if(!error&&link?.signedUrl)avatar_url=link.signedUrl;
      }
      return {number:row.number,name:row.display_name||null,avatar_url};
    }));
    return respond({success:true,contacts:result});
  } catch {
    return respond({success:false,error:"Não foi possível consultar os contatos salvos."},503);
  }
});
