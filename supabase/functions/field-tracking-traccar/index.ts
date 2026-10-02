import { createClient } from "npm:@supabase/supabase-js@2.112.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

const ok = () => new Response("OK", {
  status: 200,
  headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8" },
});

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

function text(value: unknown, max = 512) {
  return String(value ?? "").trim().slice(0, max);
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function booleanOrNull(value: unknown) {
  if (typeof value === "boolean") return value;
  const normalized = text(value, 12).toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  return null;
}

function timestampOrNow(value: unknown) {
  if (value === null || value === undefined || value === "") return new Date().toISOString();

  if (typeof value === "number" || /^\d+$/.test(String(value))) {
    const raw = Number(value);
    if (Number.isFinite(raw)) {
      const milliseconds = raw < 10_000_000_000 ? raw * 1000 : raw;
      const parsed = new Date(milliseconds);
      if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
    }
  }

  const parsed = new Date(String(value));
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  return new Date().toISOString();
}

function bounded(value: number | null, min: number, max: number) {
  return value !== null && value >= min && value <= max ? value : null;
}

function queryParams(request: Request) {
  return new URLSearchParams(new URL(request.url).search);
}

async function requestPayload(request: Request) {
  const params = queryParams(request);
  if (request.method === "GET") return { params, jsonBody: null as any };

  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    const jsonBody = await request.json().catch(() => null);
    return { params, jsonBody };
  }

  const bodyText = await request.text().catch(() => "");
  if (bodyText) {
    const bodyParams = new URLSearchParams(bodyText);
    for (const [key, value] of bodyParams.entries()) params.set(key, value);
  }
  return { params, jsonBody: null as any };
}

function extractDirectPosition(params: URLSearchParams) {
  const location = text(params.get("location"), 80);
  const locationParts = location ? location.split(",").map(part => Number(part.trim())) : [];
  const latitude = numberOrNull(params.get("lat")) ?? (Number.isFinite(locationParts[0]) ? locationParts[0] : null);
  const longitude = numberOrNull(params.get("lon")) ?? (Number.isFinite(locationParts[1]) ? locationParts[1] : null);

  return {
    uniqueId: text(params.get("id") || params.get("deviceid"), 180),
    latitude,
    longitude,
    accuracy: numberOrNull(params.get("accuracy")),
    speedKnots: numberOrNull(params.get("speed")),
    heading: numberOrNull(params.get("bearing") || params.get("heading")),
    altitude: numberOrNull(params.get("altitude")),
    battery: numberOrNull(params.get("batt") || params.get("battery") || params.get("batteryLevel")),
    charging: booleanOrNull(params.get("charge") || params.get("charging")),
    recordedAt: timestampOrNow(params.get("timestamp")),
    protocol: "osmand",
    providerStatus: "online",
  };
}

function extractForwardedPosition(body: any) {
  const position = body?.position ?? body ?? {};
  const device = body?.device ?? {};
  const attributes = position?.attributes ?? {};

  return {
    uniqueId: text(device?.uniqueId ?? body?.uniqueId ?? position?.uniqueId, 180),
    latitude: numberOrNull(position?.latitude ?? body?.latitude),
    longitude: numberOrNull(position?.longitude ?? body?.longitude),
    accuracy: numberOrNull(position?.accuracy ?? body?.accuracy),
    speedKnots: numberOrNull(position?.speed ?? body?.speed),
    heading: numberOrNull(position?.course ?? position?.bearing ?? body?.course ?? body?.bearing),
    altitude: numberOrNull(position?.altitude ?? body?.altitude),
    battery: numberOrNull(
      attributes?.batteryLevel ??
      attributes?.battery ??
      attributes?.batt ??
      position?.batteryLevel ??
      body?.batteryLevel
    ),
    charging: booleanOrNull(
      attributes?.charge ??
      attributes?.charging ??
      position?.charging ??
      body?.charging
    ),
    recordedAt: timestampOrNow(
      position?.fixTime ??
      position?.deviceTime ??
      position?.serverTime ??
      body?.fixTime ??
      body?.timestamp
    ),
    protocol: text(position?.protocol ?? body?.protocol, 80) || "traccar",
    providerStatus: text(device?.status ?? body?.status, 40) || "online",
  };
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!["GET", "POST"].includes(request.method)) return json({ success: false, error: "Método não permitido." }, 405);

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 131_072) return json({ success: false, error: "Requisição muito grande." }, 413);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ success: false, error: "Integração de rastreamento não configurada." }, 500);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const { params, jsonBody } = await requestPayload(request);
    const authorization = text(request.headers.get("authorization"), 512);
    const bearer = authorization.toLowerCase().startsWith("bearer ")
      ? authorization.slice(7).trim()
      : "";

    let integrationOrganizationId: string | null = null;

    if (bearer) {
      const tokenHash = await sha256(bearer);
      const { data: integration, error: integrationError } = await admin
        .from("field_tracking_integrations")
        .select("id,organization_id")
        .eq("provider", "traccar_server")
        .eq("token_hash", tokenHash)
        .eq("is_active", true)
        .maybeSingle();

      if (integrationError) throw integrationError;
      if (!integration) return json({ success: false, error: "Token da integração Traccar inválido." }, 401);
      integrationOrganizationId = String(integration.organization_id);
    }

    const incoming = jsonBody
      ? extractForwardedPosition(jsonBody)
      : extractDirectPosition(params);

    if (!incoming.uniqueId) {
      return json({ success: false, error: "Identificador do dispositivo não informado." }, 400);
    }
    if (incoming.latitude === null || incoming.longitude === null) {
      return json({ success: false, error: "Coordenadas não informadas." }, 400);
    }
    if (incoming.latitude < -90 || incoming.latitude > 90 || incoming.longitude < -180 || incoming.longitude > 180) {
      return json({ success: false, error: "Coordenadas inválidas." }, 400);
    }

    const speedMps = incoming.speedKnots === null ? null : Math.max(0, incoming.speedKnots * 0.514444);
    const accuracy = incoming.accuracy === null ? null : Math.max(0, incoming.accuracy);
    const battery = bounded(incoming.battery, 0, 100);
    const heading = bounded(incoming.heading, 0, 360);
    const uniqueHash = await sha256("traccar:" + incoming.uniqueId);

    const { error } = await admin.rpc("ingest_traccar_position_internal_v1", {
      p_unique_id_hash: uniqueHash,
      p_latitude: incoming.latitude,
      p_longitude: incoming.longitude,
      p_accuracy_m: accuracy,
      p_speed_mps: speedMps,
      p_heading: heading,
      p_altitude_m: incoming.altitude,
      p_battery_level: battery,
      p_charging: incoming.charging,
      p_recorded_at: incoming.recordedAt,
      p_protocol: incoming.protocol,
      p_provider_status: incoming.providerStatus,
      p_organization_id: integrationOrganizationId,
    });

    if (error) {
      if (error.code === "P0002") {
        return json({
          success: false,
          error: "Dispositivo não cadastrado no Mapa de Campo.",
          identifier_hint: incoming.uniqueId.slice(-6),
        }, 404);
      }
      throw error;
    }

    if (integrationOrganizationId) {
      await admin
        .from("field_tracking_integrations")
        .update({ last_received_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("organization_id", integrationOrganizationId)
        .eq("provider", "traccar_server");
    }

    return ok();
  } catch (error) {
    console.error("field-tracking-traccar", error);
    return json({
      success: false,
      error: error instanceof Error ? error.message : "Falha ao processar a posição.",
    }, 500);
  }
});
