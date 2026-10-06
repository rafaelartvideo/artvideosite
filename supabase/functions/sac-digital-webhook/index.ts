import { createClient } from "npm:@supabase/supabase-js@2.112.3";

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

function eventType(payload: Record<string, unknown>) {
  const candidates = [
    payload.event,
    payload.event_type,
    payload.type,
    payload.evento,
    payload.name,
  ];
  const found = candidates.find(value => typeof value === "string" && value.trim());
  return found ? String(found).trim().slice(0, 120) : "unknown";
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
    .select("organization_id,enabled")
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

  const type = eventType(payload);
  const payloadHash = await sha256(raw);

  const { error: eventError } = await admin
    .from("sac_digital_webhook_events")
    .upsert({
      organization_id: integration.organization_id,
      event_type: type,
      payload_hash: payloadHash,
      payload,
      received_at: new Date().toISOString(),
    }, {
      onConflict: "organization_id,payload_hash",
      ignoreDuplicates: true,
    });

  if (eventError) {
    console.error("[SAC DIGITAL WEBHOOK] event insert failed", eventError.code);
    await admin
      .from("sac_digital_integrations")
      .update({
        connection_status: "error",
        last_error: "Falha ao registrar o último evento recebido.",
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", integration.organization_id);
    return json({ success: false, error: "Não foi possível registrar o evento." }, 500);
  }

  const now = new Date().toISOString();
  const { error: updateError } = await admin
    .from("sac_digital_integrations")
    .update({
      connection_status: "receiving",
      last_webhook_at: now,
      last_event_type: type,
      last_error: null,
      updated_at: now,
    })
    .eq("organization_id", integration.organization_id);

  if (updateError) {
    console.error("[SAC DIGITAL WEBHOOK] status update failed", updateError.code);
  }

  return json({ status: true });
});
