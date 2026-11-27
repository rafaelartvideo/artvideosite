import { createClient } from "npm:@supabase/supabase-js@2.112.3";
import { createSupabaseFiscalSync } from "../_shared/fiscal/supabase-sync.mjs";

const url = Deno.env.get("SUPABASE_URL") || "";
const anon = Deno.env.get("SUPABASE_ANON_KEY") || "";
const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const types = new Set(["nfe","nfce","cte","nfse","eventonfe","eventocte"]);
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-api-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};
const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers });
const denied = () => reply(403, { error: "FISCAL_ACCESS_DENIED" });
const unavailable = () => reply(503, { error: "FISCAL_UNAVAILABLE" });
const digits = (s: unknown) => typeof s === "string" ? s.replace(/\D/g, "") : "";
const authOptions = { persistSession: false, autoRefreshToken: false };

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "POST") return reply(405, {error:"METHOD_NOT_ALLOWED"});
  // Optional emergency kill switch; tenant access still requires verified entitlement and binding.
  if (Deno.env.get("FISCAL_READ_API_ENABLED") === "false" || !url || !anon || !service) return unavailable();
  const bearer = request.headers.get("Authorization")?.match(/^Bearer ([^\s]+)$/i)?.[1];
  if (!bearer) return reply(401, {error:"UNAUTHENTICATED"});
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 16384) return reply(413, {error:"REQUEST_TOO_LARGE"});
    let body;
    try { body = JSON.parse(raw); } catch { return reply(400,{error:"INVALID_REQUEST"}); }
    if (!body || typeof body !== "object" || Array.isArray(body) || !uuid.test(body.organizationId || "") ||
      !["status","list","sync","download"].includes(body.action)) return reply(400,{error:"INVALID_REQUEST"});
    if (!Object.keys(body).every(k => ["organizationId","action","type","page","limit","documentId"].includes(k))) return reply(400,{error:"INVALID_REQUEST"});
    const organizationId: string = body.organizationId;
    const acting = createClient(url, anon, { auth: authOptions, global: {headers:{Authorization:"Bearer "+bearer}} });
    const userResult = await acting.auth.getUser(bearer);
    const user = userResult.data.user;
    if (userResult.error || !user) return reply(401, {error:"INVALID_SESSION"});
    const admin = createClient(url,service,{auth:authOptions});
    // Explicit membership is intentionally stricter than platform-wide org viewing.
    // Platform administration will require a dedicated endpoint and authorization.
    const [membership, profile, organization, module, permissions] = await Promise.all([
      admin.from("organization_members").select("id").eq("organization_id",organizationId).eq("user_id",user.id).eq("status","active").limit(1).maybeSingle(),
      admin.from("profiles").select("id").eq("id",user.id).eq("is_active",true).maybeSingle(),
      admin.from("organizations").select("id,document").eq("id",organizationId).eq("status","active").maybeSingle(),
      admin.from("organization_modules").select("module_key").eq("organization_id",organizationId).eq("module_key","fiscal").eq("is_enabled",true).maybeSingle(),
      acting.rpc("my_organization_permissions",{p_organization_id:organizationId}),
    ]);
    if ([membership,profile,organization,module,permissions].some(r=>r.error)) return unavailable();
    if (!membership.data || !profile.data || !organization.data || !module.data ||
        !Array.isArray(permissions.data) || !permissions.data.some((p: {permission_key:string}) => p.permission_key==="fiscal.documents.view")) return denied();
    const cnpj = digits(organization.data.document);
    if (!/^[0-9]{14}$/.test(cnpj)) return denied();
    const binding = await admin.from("fiscal_organization_bindings")
      .select("id,organization_id,account_id,cnpj,external_company_id,is_enabled,sync_enabled,production_enabled")
      .eq("organization_id",organizationId).eq("cnpj",cnpj).eq("is_enabled",true).maybeSingle();
    if (binding.error) return unavailable();
    if (!binding.data) return denied();
    const b = binding.data;
    const bindingId = b.id;
    const [account, inventory] = await Promise.all([
      admin.from("fiscal_provider_accounts").select("provider,is_active,inventory_verified_at").eq("id",b.account_id).eq("is_active",true).maybeSingle(),
      admin.from("fiscal_account_cnpjs").select("cnpj,verified_at").eq("account_id",b.account_id).eq("cnpj",b.cnpj).maybeSingle(),
    ]);
    if (account.error || inventory.error) return unavailable();
    if (!account.data?.inventory_verified_at || !inventory.data?.verified_at) return denied();
    if (body.action==="status") return reply(200,{data:{provider:account.data.provider,cnpj:b.cnpj,syncEnabled:b.sync_enabled,productionEnabled:false}});
    const permitted = (key:string) => permissions.data.some((p:{permission_key:string})=>p.permission_key===key);
    if(body.action==="sync"){
      if(!permitted("fiscal.sync.manage")||!b.sync_enabled)return denied();
      if(Deno.env.get("FISCAL_SYNC_ENABLED")==="false")return unavailable();
      if(!types.has(body.type))return reply(400,{error:"INVALID_FILTER"});
      const sync=createSupabaseFiscalSync({admin,resolveSecret:async ({accountId,credentialRef}:{accountId:string;credentialRef:string})=>{
        if(/^vault_[0-9a-f-]{36}$/.test(credentialRef)){
          const r=await admin.rpc("fiscal_read_provider_session",{p_account:accountId});
          if(r.error||typeof r.data!=="string")throw new Error("FISCAL_SECRET_UNAVAILABLE");
          return r.data;
        }
        if(/^FISCAL_FISCONTROLE_TOKEN_[A-Z0-9_]{1,64}$/.test(credentialRef)){
          const token=Deno.env.get(credentialRef);
          if(token)return token;
        }
        throw new Error("FISCAL_SECRET_UNAVAILABLE");
      }});
      // Manual, bounded import only; no automatic scheduler or emissions.
      const result=await sync({bindingId,type:body.type,limit:5});
      return reply(200,{data:result});
    }
    if(body.action==="download"){
      if(!permitted("fiscal.documents.download"))return denied();
      if(typeof body.documentId!=="string"||!uuid.test(body.documentId))return reply(400,{error:"INVALID_DOCUMENT"});
      const row=await admin.from("fiscal_captured_documents").select("storage_key,document_type,provider_id")
        .eq("id",body.documentId).eq("organization_id",organizationId).eq("binding_id",bindingId)
        .eq("account_id",b.account_id).eq("cnpj",b.cnpj).maybeSingle();
      if(row.error)return unavailable();
      if(!row.data)return reply(404,{error:"DOCUMENT_NOT_FOUND"});
      const result=await admin.storage.from("fiscal-originals").createSignedUrl(row.data.storage_key,60,
        {download:row.data.document_type+"-"+row.data.provider_id+".xml"});
      if(result.error||!result.data?.signedUrl)return unavailable();
      return reply(200,{data:{url:result.data.signedUrl}});
    }
    const page = body.page ?? 1, limit = body.limit ?? 25;
    if (!Number.isSafeInteger(page) || page<1 || page>4000 || !Number.isSafeInteger(limit) || limit<1 || limit>100 ||
      (page-1)*limit>100000 || (body.type!==undefined && !types.has(body.type))) return reply(400,{error:"INVALID_FILTER"});
    let query = admin.from("fiscal_captured_documents")
      .select("id,document_type,fiscal_key,issued_at_raw,captured_at")
      .eq("organization_id",organizationId).eq("binding_id",bindingId).eq("account_id",b.account_id).eq("cnpj",b.cnpj);
    if (body.type!==undefined) query=query.eq("document_type",body.type);
    const start=(page-1)*limit;
    const result=await query.order("captured_at",{ascending:false}).order("id",{ascending:false}).range(start,start+limit);
    if (result.error || !Array.isArray(result.data)) return unavailable();
    return reply(200,{data:result.data.slice(0,limit),pagination:{page,limit,hasMore:result.data.length>limit}});
  } catch {
    // Never expose credentials, SQL errors or remote fiscal data to clients.
    return unavailable();
  }
});
