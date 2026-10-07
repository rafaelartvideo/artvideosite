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

  const type = eventType(payload);
  const payloadHash = await sha256(raw);

  const { data: insertedEvent, error: eventError } = await admin
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
    })
    .select("id")
    .maybeSingle();

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
    return json({ status: false, error: "Não foi possível registrar o evento." }, 500);
  }

  let eventId = insertedEvent?.id ?? null;
  if (!eventId) {
    const { data: existingEvent, error: existingEventError } = await admin
      .from("sac_digital_webhook_events")
      .select("id")
      .eq("organization_id", integration.organization_id)
      .eq("payload_hash", payloadHash)
      .maybeSingle();

    if (existingEventError) {
      console.error("[SAC DIGITAL WEBHOOK] duplicate lookup failed", existingEventError.code);
    } else {
      eventId = existingEvent?.id ?? null;
    }
  }

  if (!eventId) {
    console.error("[SAC DIGITAL WEBHOOK] event missing after upsert", {
      organization_id: integration.organization_id,
    });
    await admin.from("sac_digital_integrations")
      .update({
        connection_status: "error",
        last_error: "O evento chegou, mas não foi localizado para processamento.",
        last_event_type: type,
        last_webhook_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", integration.organization_id);
    return json({ status: false, error: "Não foi possível localizar o evento recebido." }, 503);
  }

  const { error: projectionError } = await admin.rpc("project_sac_digital_webhook_event", {
    p_event_id: eventId,
  });
  if (projectionError) {
    const now = new Date().toISOString();
    const safeCode = String(projectionError.code || "UNKNOWN").slice(0, 32);
    console.error("[SAC DIGITAL WEBHOOK] projection failed", {
      event_id: eventId,
      code: safeCode,
    });
    // A função SQL pode ter revertido a atualização de erro ao lançar exceção.
    // Registrar o erro numa operação separada garante que o painel o enxergue.
    const { error: logError } = await admin.from("sac_digital_webhook_events")
      .update({ processing_error: `Falha de projeção (código ${safeCode})` })
      .eq("id", eventId)
      .eq("organization_id", integration.organization_id)
      .is("processed_at", null);
    if (logError) {
      console.error("[SAC DIGITAL WEBHOOK] projection error persistence failed", logError.code);
    }
    await admin.from("sac_digital_integrations")
      .update({
        connection_status: "error",
        last_error: `Falha ao processar evento da SAC Digital (código ${safeCode}).`,
        last_webhook_at: now,
        last_event_type: type,
        updated_at: now,
      })
      .eq("organization_id", integration.organization_id);
    // Resposta não-2xx permite reentrega pela SAC caso ela ofereça retry.
    return json({ status: false, error: "Não foi possível processar o evento recebido." }, 503);
  }

  const protocol = typeof payload.protocol === "string" ? payload.protocol.trim() : "";
  let shouldEnrich = Boolean(protocol) && [
    "protocol_opened",
    "protocol_in_att",
    "protocol_forward",
  ].includes(type);

  if (protocol && !shouldEnrich && ["protocol_new_message", "protocol_new_inbox"].includes(type)) {
    const { data: projectedProtocol } = await admin
      .from("sac_digital_protocols")
      .select("contact_id")
      .eq("organization_id", integration.organization_id)
      .eq("external_protocol_id", protocol)
      .maybeSingle();
    shouldEnrich = !projectedProtocol?.contact_id;
  }

  if (protocol && shouldEnrich) {
    const enrichment = fetch(`${supabaseUrl}/functions/v1/sac-digital-api`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "enrich_protocol",
        organization_id: integration.organization_id,
        protocol,
      }),
    }).then(async response => {
      if (!response.ok) {
        console.error("[SAC DIGITAL WEBHOOK] background enrichment failed", {
          protocol,
          status: response.status,
        });
      }
    }).catch(error => {
      console.error("[SAC DIGITAL WEBHOOK] background enrichment error", {
        protocol,
        error: error instanceof Error ? error.message : String(error),
      });
    });
    EdgeRuntime.waitUntil(enrichment);
  }

  // Se houve falha anterior, um novo webhook bem-sucedido nao pode
  // ocultar eventos que ainda aguardam recuperacao. So consultar falhas
  // quando a integracao ja estiver em erro (sem count em todo evento).
  let stillHasUnresolvedFailures = false;
  if (integration.connection_status === "error") {
    const { count, error: failureCheckError } = await admin
      .from("sac_digital_webhook_events")
      .select("id", { head: true, count: "exact" })
      .eq("organization_id", integration.organization_id)
      .not("processing_error", "is", null);
    stillHasUnresolvedFailures = Boolean(failureCheckError) || Number(count || 0) > 0;
  }

  const now = new Date().toISOString();
  const { error: updateError } = await admin
    .from("sac_digital_integrations")
    .update({
      connection_status: stillHasUnresolvedFailures ? "error" : "receiving",
      last_webhook_at: now,
      last_event_type: type,
      last_error: stillHasUnresolvedFailures
        ? integration.last_error || "Há eventos da SAC Digital com falha de processamento."
        : null,
      updated_at: now,
    })
    .eq("organization_id", integration.organization_id);

  if (updateError) {
    console.error("[SAC DIGITAL WEBHOOK] status update failed", updateError.code);
  }

  return json({ status: true });
});
