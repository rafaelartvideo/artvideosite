declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };
import { createClient } from "npm:@supabase/supabase-js@2.112.3";

import { ingestEvent } from "../_shared/sac-events.mjs";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}


Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ success: false, error: "Método não permitido." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ success: false, error: "Webhook indisponível." }, 503);
  }

  const token = new URL(request.url).searchParams.get("token")?.trim() || "";
  if (!/^[0-9a-f-]{36}$/i.test(token)) {
    return json({ success: false, error: "Webhook inválido." }, 401);
  }

  const raw = await request.text();
  if (!raw.trim()) return json({ success: false, error: "Payload vazio." }, 400);
  if (raw.length > 2_000_000) return json({ success: false, error: "Payload muito grande." }, 413);

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return json({ success: false, error: "JSON inválido." }, 400);
  }

  const payload = parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : { data: parsed };

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: integration, error: integrationError } = await admin
    .from("sac_digital_integrations")
    .select("organization_id,enabled,connection_status,last_error")
    .eq("webhook_token", token)
    .maybeSingle();

  if (integrationError) {
    console.error("[SAC DIGITAL WEBHOOK] integration lookup failed", integrationError.code);
    return json({ success: false, error: "Não foi possível validar o webhook." }, 500);
  }
  if (!integration?.organization_id || integration.enabled !== true) {
    return json({ success: false, error: "Webhook não está ativo." }, 403);
  }

  const { data: moduleAccess, error: moduleError } = await admin
    .from("organization_modules")
    .select("module_key")
    .eq("organization_id", integration.organization_id)
    .eq("module_key", "sac_digital")
    .eq("is_enabled", true)
    .maybeSingle();

  if (moduleError) {
    console.error("[SAC DIGITAL WEBHOOK] module lookup failed", moduleError.code);
    return json({ success: false, error: "Não foi possível validar o módulo." }, 500);
  }
  if (!moduleAccess) return json({ success: false, error: "Módulo SAC Digital desabilitado." }, 403);

  try {
    await ingestEvent({payload, organizationId: integration.organization_id, hash: sha256,
      persist: async (args: Record<string, unknown>) => {
        const {data,error}=await admin.rpc("ingest_sac_digital_webhook_event",args);
        if(error) throw error;
        return data;
      },
      accelerate: async () => {
        await fetch(`${supabaseUrl}/functions/v1/sac-digital-worker`, {
          method:"POST",headers:{Authorization:`Bearer ${serviceRoleKey}`,"Content-Type":"application/json"},body:JSON.stringify({limit:10}),signal:AbortSignal.timeout(15000)
        });
      },
      waitUntil: (promise: Promise<unknown>) => EdgeRuntime.waitUntil(promise),
    });
    return json({status:true});
  } catch {
    return json({status:false,error:"Não foi possível registrar o evento."},503);
  }
});
