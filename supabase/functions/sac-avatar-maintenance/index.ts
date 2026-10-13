import { createClient } from "npm:@supabase/supabase-js@2.112.3";

// Manual, admin-only maintenance. Uses the SAC worker's private bearer secret.
// No customer data is exposed by this endpoint.
const DEFAULT_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="85" height="85" viewBox="0 0 85 85"><rect width="85" height="85" fill="#e2e5e9"/><circle cx="42.5" cy="42.5" r="28" fill="#687380"/></svg>';
Deno.serve(async req => {
  if (req.method !== "POST") return Response.json({ success:false },{status:405});
  const url=Deno.env.get("SUPABASE_URL"), key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return Response.json({ success:false },{status:503});
  const admin=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  let allowed=req.headers.get("Authorization") === `Bearer ${key}`;
  if (!allowed) {
    const token=req.headers.get("x-sac-worker-key") || "";
    if (/^[a-f0-9]{64}$/.test(token)) {
      const verified=await admin.rpc("verify_sac_digital_worker_token",{p_token:token});
      allowed=!verified.error && verified.data===true;
    }
  }
  if (!allowed) return Response.json({success:false},{status:401});
  const body=await req.json().catch(()=>({}));
  if (body?.action !== "ensure_default") return Response.json({success:false,error:"Unknown action"},{status:400});
  const path="sac-digital/default-avatar-v1.svg";
  const storage=admin.storage.from("public-assets");
  const uploaded=await storage.upload(path,new TextEncoder().encode(DEFAULT_SVG),{
    contentType:"image/svg+xml",cacheControl:"31536000",upsert:false
  });
  if (uploaded.error && !/already exists|duplicate|resource already exists/i.test(uploaded.error.message || "")) {
    return Response.json({success:false,error:"Could not create shared avatar"},{status:500});
  }
  const {data}=storage.getPublicUrl(path);
  return Response.json({success:true,path,public_url:data.publicUrl,already_exists:!!uploaded.error});
});
