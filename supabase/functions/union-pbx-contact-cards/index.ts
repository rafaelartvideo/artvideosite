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
type IdentityRow={number:string;display_name:string|null;source:string|null;avatar_path:string|null};
function phoneKey(value:string):string {
  const digits=String(value||"").replace(/\D/g,"");
  if (/^55[1-9][0-9]{9,10}$/.test(digits)) return digits;
  if (/^[1-9][0-9]{9,10}$/.test(digits)) return "55"+digits;
  return "";
}
type DirectoryEntry={number:string;name:string;source:"crm"|"pbx"|"whatsapp"};

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
    const action=String(body.action||"lookup");
    if(!uuid(organization_id)||!["lookup","list","save"].includes(action))
      return respond({success:false,error:"Parâmetros inválidos."},400);
    const raw=body.numbers;
    if(action==="lookup" && (!Array.isArray(raw)||raw.length<1||raw.length>12||
      raw.some(v=>typeof v!=="string"||v.length>32||!/^[+()0-9\s-]{10,32}$/.test(v))))
      return respond({success:false,error:"Números inválidos."},400);
    const numbers=action==="lookup" ? [...new Set(raw as string[])] : [];
    const scoped=createClient(base,publicKey,{
      global:{headers:{Authorization:bearer}},auth:{persistSession:false,autoRefreshToken:false},
    });
    const {data:user,error:authError}=await scoped.auth.getUser();
    if(authError||!user.user)return respond({success:false,error:"Sessão expirada."},401);
    // The same tenant/module/active membership/pbx.view guard used by call-history RLS.
    const {data:allowed,error:accessError}=await scoped.rpc("pbx_contact_access_v1",{p_organization_id:organization_id});
    if(accessError||allowed!==true)return respond({success:false,error:"Acesso negado."},403);

    const admin=createClient(base,serviceKey,{auth:{persistSession:false,autoRefreshToken:false}});

    if(action==="save") {
      const phone=String(body.phone||"").trim();
      const name=String(body.name||"").trim();
      const notes=String(body.notes||"").trim();
      const canonical=phoneKey(phone);
      if(!canonical||!/^[-+()0-9\s]{10,32}$/.test(phone)||name.length<2||name.length>160||notes.length>500)
        return respond({success:false,error:"Informe nome e telefone válidos com DDD."},400);
      const {data:known,error:knownError}=await admin.rpc("pbx_resolve_cached_contacts_v2",{
        p_organization_id:organization_id,p_numbers:[canonical],
      });
      if(knownError)throw knownError;
      if(known?.[0]?.source==="crm")
        return respond({success:false,error:"Número já cadastrado no CRM. Edite o cadastro do cliente para manter os dados unificados.",code:"already_crm"},409);
      const {data:saved,error:writeError}=await admin.from("pbx_contacts").upsert({
        organization_id,phone:canonical,display_name:name,notes:notes||null,updated_at:new Date().toISOString(),
      },{onConflict:"organization_id,phone_key"}).select("id,phone,display_name,notes").single();
      if(writeError)throw writeError;
      return respond({success:true,contact:saved});
    }
    if(action==="list") {
      const query=String(body.search||"").trim().replace(/[^\p{L}\p{N} ]/gu,"").slice(0,45);
      const safe=query.replace(/\s+/g," ").trim();
      let crm=admin.from("customers").select("full_name,phone,whatsapp").eq("organization_id",organization_id)
        .order("updated_at",{ascending:false}).limit(65);
      let pbx=admin.from("pbx_contacts").select("display_name,phone").eq("organization_id",organization_id)
        .order("updated_at",{ascending:false}).limit(65);
      let wa=admin.from("union_whatsapp_contacts").select("display_name,imported_name,device_name,profile_name,contact_phone")
        .eq("organization_id",organization_id).order("updated_at",{ascending:false}).limit(65);
      if(safe) {
        const fragment=safe.replace(/[%_]/g,"");
        crm=crm.or(`full_name.ilike.%${fragment}%,phone.ilike.%${fragment}%,whatsapp.ilike.%${fragment}%`);
        pbx=pbx.or(`display_name.ilike.%${fragment}%,phone.ilike.%${fragment}%`);
        wa=wa.or(`display_name.ilike.%${fragment}%,contact_phone.ilike.%${fragment}%`);
      }
      const [c,p,w]=await Promise.all([crm,pbx,wa]);
      if(c.error||p.error||w.error)throw c.error||p.error||w.error;
      const map=new Map<string,DirectoryEntry>();
      const add=(phone:string|undefined|null,name:string|undefined|null,source:DirectoryEntry["source"])=>{
        const number=phoneKey(phone||"");
        if(number && name?.trim() && !map.has(number))map.set(number,{number,name:name.trim(),source});
      };
      for(const row of c.data||[]) {add(row.whatsapp,row.full_name,"crm");add(row.phone,row.full_name,"crm");}
      for(const row of p.data||[]) add(row.phone,row.display_name,"pbx");
      for(const row of w.data||[]) add(row.contact_phone,row.display_name||row.device_name||row.imported_name||row.profile_name,"whatsapp");
      return respond({success:true,contacts:Array.from(map.values()).slice(0,100)});
    }
    const {data:rows,error:lookupError}=await admin.rpc("pbx_resolve_cached_contacts_v2",{
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
      return {number:row.number,name:row.display_name||null,source:row.source||null,avatar_url};
    }));
    return respond({success:true,contacts:result});
  } catch {
    return respond({success:false,error:"Não foi possível consultar os contatos salvos."},503);
  }
});
