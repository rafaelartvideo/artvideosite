import { createClient } from "npm:@supabase/supabase-js@2.112.3";

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
  // Independent deployment kill switch. Nothing is enabled by adding this file.
  if (Deno.env.get("FISCAL_READ_API_ENABLED") !== "true" || !url || !anon || !service) return unavailable();
  const bearer = request.headers.get("Authorization")?.match(/^Bearer ([^\s]+)$/i)?.[1];
  if (!bearer) return reply(401, {error:"UNAUTHENTICATED"});
  try {
    const raw = await request.text();
    if (new TextEncoder().encode(raw).byteLength > 16384) return reply(413, {error:"REQUEST_TOO_LARGE"});
    let body;
    try { body = JSON.parse(raw); } catch { return reply(400,{error:"INVALID_REQUEST"}); }
    if (!body || typeof body !== "object" || Array.isArray(body) || !uuid.test(body.organizationId || "") ||
      !uuid.test(body.bindingId || "") || !["status","list"].includes(body.action)) return reply(400,{error:"INVALID_REQUEST"});
    if (!Object.keys(body).every(k => ["organizationId","bindingId","action","type","page","limit"].includes(k))) return reply(400,{error:"INVALID_REQUEST"});
    const organizationId: string = body.organizationId;
    const bindingId: string = body.bindingId;
    const acting = createClient(url, anon, { auth: authOptions, global: {headers:{Authorization:"Bearer "+bearer}} });
    const userResult = await acting.auth.getUser(bearer);
    const user = userResult.data.user;
    if (userResult.error || !user) return reply(401, {error:"INVALID_SESSION"});
    const admin = createClient(url,service,{auth:authOptions});
    // Explicit membership is intentionally stricter than platform-wide org viewing.
    // Platform administration will require a dedicated endpoint and authorization.
    const [membership, profile, organization, module, permissions, binding] = await Promise.all([
      admin.from("organization_members").select("id").eq("organization_id",organizationId).eq("user_id",user.id).eq("status","active").limit(1).maybeSingle(),
      admin.from("profiles").select("id").eq("id",user.id).eq("is_active",true).maybeSingle(),
      admin.from("organizations").select("id,document").eq("id",organizationId).eq("status","active").maybeSingle(),
      admin.from("organization_modules").select("module_key").eq("organization_id",organizationId).eq("module_key","fiscal").eq("is_enabled",true).maybeSingle(),
      acting.rpc("my_organization_permissions",{p_organization_id:organizationId}),
      admin.from("fiscal_organization_bindings").select("id,organization_id,account_id,cnpj,external_company_id,is_enabled,sync_enabled,production_enabled").eq("id",bindingId).eq("organization_id",organizationId).eq("is_enabled",true).maybeSingle(),
    ]);
    if ([membership,profile,organization,module,permissions,binding].some(r=>r.error)) return unavailable();
    if (!membership.data || !profile.data || !organization.data || !module.data || !binding.data ||
        !Array.isArray(permissions.data) || !permissions.data.some((p: {permission_key:string}) => p.permission_key==="fiscal.documents.view")) return denied();
    const b = binding.data;
    if (digits(organization.data.document) !== b.cnpj) return denied();
    const [account, inventory] = await Promise.all([
      admin.from("fiscal_provider_accounts").select("provider,is_active,inventory_verified_at").eq("id",b.account_id).eq("is_active",true).maybeSingle(),
      admin.from("fiscal_account_cnpjs").select("cnpj,verified_at").eq("account_id",b.account_id).eq("cnpj",b.cnpj).eq("external_company_id",b.external_company_id).maybeSingle(),
    ]);
    if (account.error || inventory.error) return unavailable();
    if (!account.data?.inventory_verified_at || !inventory.data?.verified_at) return denied();
    if (body.action==="status") return reply(200,{data:{provider:account.data.provider,cnpj:b.cnpj,syncEnabled:b.sync_enabled,productionEnabled:false}});
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
