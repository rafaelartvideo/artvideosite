import { createClient } from "npm:@supabase/supabase-js@2.112.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("");
}

function text(value: unknown, max = 512) {
  return String(value ?? "").trim().slice(0, max);
}

function normalizePairingCode(value: unknown) {
  const normalized = text(value, 40).replace(/[^a-z0-9]/gi, "").toUpperCase();
  return normalized.length === 12 ? normalized : "";
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function requireCoordinate(value: unknown, min: number, max: number, label: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw Object.assign(new Error(`${label} inválida.`), { status: 400 });
  }
  return parsed;
}

function safeRecordedAt(value: unknown) {
  const raw = text(value, 80);
  if (!raw) return new Date().toISOString();
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  const now = Date.now();
  if (date.getTime() > now + 5 * 60_000) return new Date(now).toISOString();
  return date.toISOString();
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ success: false, error: "Método não permitido." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ success: false, error: "Rastreamento não configurado no servidor." }, 500);
  }

  const contentLength = Number(request.headers.get("content-length") || 0);
  if (contentLength > 16_384) return json({ success: false, error: "Requisição muito grande." }, 413);

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const body = await request.json().catch(() => ({}));
    const action = text(body?.action, 30);

    if (action === "redeem") {
      const pairingToken = text(body?.pairing_token, 256);
      const pairingCode = normalizePairingCode(body?.pairing_code);
      if (!pairingToken && !pairingCode) {
        return json({ success: false, error: "Informe o QR ou código de pareamento." }, 400);
      }

      const trackerToken = randomToken();
      const trackerTokenHash = await sha256(trackerToken);
      const pairingTokenHash = pairingToken ? await sha256(pairingToken) : null;
      const pairingCodeHash = pairingCode ? await sha256(`pairing-code:${pairingCode}`) : null;
      const deviceLabel = text(body?.device_label, 120) || null;

      const { data, error } = await admin.rpc("redeem_field_tracking_pairing_internal_v1", {
        p_pairing_token_hash: pairingTokenHash,
        p_pairing_code_hash: pairingCodeHash,
        p_tracker_token_hash: trackerTokenHash,
        p_device_label: deviceLabel,
      });
      if (error) {
        const status = error.code === "P0002" ? 404 : 400;
        return json({ success: false, error: error.message || "Não foi possível parear este rastreador." }, status);
      }

      const unit = Array.isArray(data) ? data[0] : data;
      if (!unit) return json({ success: false, error: "Pareamento não encontrado ou expirado." }, 404);

      return json({
        success: true,
        tracker_token: trackerToken,
        unit: {
          id: unit.unit_id,
          organization_id: unit.organization_id,
          name: unit.unit_name,
          unit_type: unit.unit_type,
          identifier_type: unit.identifier_type,
          identifier_value: unit.identifier_value,
        },
      });
    }

    if (action === "update") {
      const trackerToken = text(body?.tracker_token, 256);
      if (trackerToken.length < 32) return json({ success: false, error: "Rastreador não autorizado." }, 401);

      const latitude = requireCoordinate(body?.latitude, -90, 90, "Latitude");
      const longitude = requireCoordinate(body?.longitude, -180, 180, "Longitude");
      const accuracy = numberOrNull(body?.accuracy_m);
      const speed = numberOrNull(body?.speed_mps);
      const heading = numberOrNull(body?.heading);

      if (accuracy !== null && (accuracy < 0 || accuracy > 100_000)) {
        return json({ success: false, error: "Precisão inválida." }, 400);
      }
      if (speed !== null && (speed < 0 || speed > 300)) {
        return json({ success: false, error: "Velocidade inválida." }, 400);
      }
      if (heading !== null && (heading < 0 || heading > 360)) {
        return json({ success: false, error: "Direção inválida." }, 400);
      }

      const { data, error } = await admin.rpc("update_paired_field_location_internal_v1", {
        p_tracker_token_hash: await sha256(trackerToken),
        p_latitude: latitude,
        p_longitude: longitude,
        p_accuracy_m: accuracy,
        p_speed_mps: speed,
        p_heading: heading,
        p_recorded_at: safeRecordedAt(body?.recorded_at),
        p_device_label: text(body?.device_label, 120) || null,
      });
      if (error) {
        const status = error.code === "42501" ? 401 : 400;
        return json({ success: false, error: error.message || "Não foi possível registrar a posição." }, status);
      }

      const unit = Array.isArray(data) ? data[0] : data;
      return json({
        success: true,
        unit: unit ? { id: unit.unit_id, organization_id: unit.organization_id, name: unit.unit_name } : null,
        server_time: new Date().toISOString(),
      });
    }

    if (action === "stop") {
      const trackerToken = text(body?.tracker_token, 256);
      if (trackerToken.length < 32) return json({ success: false, error: "Rastreador não autorizado." }, 401);

      const { data, error } = await admin.rpc("stop_paired_field_tracking_internal_v1", {
        p_tracker_token_hash: await sha256(trackerToken),
      });
      if (error) return json({ success: false, error: error.message || "Não foi possível pausar o rastreador." }, 400);
      if (data !== true) return json({ success: false, error: "Rastreador não autorizado." }, 401);
      return json({ success: true });
    }

    return json({ success: false, error: "Ação inválida." }, 400);
  } catch (error) {
    const status = Number((error as { status?: number })?.status || 500);
    const message = error instanceof Error ? error.message : "Falha inesperada no rastreamento.";
    return json({ success: false, error: message }, status);
  }
});
