import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const webhookToken = Deno.env.get("UNIQ_WEBHOOK_TOKEN") ?? "";
const PLATFORM_ORGANIZATION_ID = "00000000-0000-4000-8000-000000000001";
const MAX_BODY_BYTES = 1_000_000;

const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function constantTimeEqual(left: string, right: string) {
  const a = new TextEncoder().encode(left);
  const b = new TextEncoder().encode(right);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= a[index] ^ b[index];
  return diff === 0;
}

function requestToken(request: Request) {
  const url = new URL(request.url);
  return (
    url.searchParams.get("token") ??
    request.headers.get("x-uniq-webhook-token") ??
    ""
  ).trim();
}

function sanitizedHeaders(request: Request) {
  const sensitive = new Set(["authorization", "cookie", "set-cookie", "apikey", "x-api-key"]);
  return Object.fromEntries(
    [...request.headers.entries()].map(([key, value]) => [
      key,
      sensitive.has(key.toLowerCase()) ? "[redacted]" : value,
    ]),
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readPath(value: unknown, path: string) {
  let current: unknown = value;
  for (const part of path.split(".")) {
    const record = asRecord(current);
    if (!record || !(part in record)) return undefined;
    current = record[part];
  }
  return current;
}

function firstText(payload: unknown, paths: string[]) {
  for (const path of paths) {
    const value = readPath(payload, path);
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function firstNumber(payload: unknown, paths: string[]) {
  for (const path of paths) {
    const value = readPath(payload, path);
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return null;
}

function firstBoolean(payload: unknown, paths: string[]) {
  for (const path of paths) {
    const value = readPath(payload, path);
    if (typeof value === "boolean") return value;
    if (value === "true") return true;
    if (value === "false") return false;
  }
  return null;
}

function epochMillisecondsToIso(value: number | null) {
  if (!value || value <= 0) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeRemotePhone(remoteUri: string | null) {
  if (!remoteUri) return { phone: null, digits: null };
  const phone = remoteUri.replace(/^tel:/i, "").trim() || null;
  const digits = phone?.replace(/\D/g, "") || null;
  return { phone, digits };
}

function parsePayload(rawBody: string, contentType: string) {
  if (!rawBody.trim()) return null;
  try {
    return JSON.parse(rawBody);
  } catch {
    if (contentType.includes("application/x-www-form-urlencoded")) {
      return Object.fromEntries(new URLSearchParams(rawBody).entries());
    }
    return { raw: rawBody };
  }
}

async function normalizeCallEvent(payload: unknown, eventId: string) {
  const eventKey = firstText(payload, ["type", "event", "eventType", "event_type"]);
  const callId = firstText(payload, [
    "payload.call",
    "callId",
    "call_id",
    "call.id",
    "call.uuid",
    "data.callId",
    "data.call_id",
    "data.call.id",
    "data.id",
    "uuid",
  ]);

  if (eventKey !== "CALL-EVENT" || !callId) return { normalized: false, callId };

  const remoteUri = firstText(payload, ["payload.remote"]);
  const { phone: remotePhone, digits: remotePhoneDigits } = normalizeRemotePhone(remoteUri);
  const setup = firstNumber(payload, ["payload.setup"]);
  const start = firstNumber(payload, ["payload.start"]);
  const stop = firstNumber(payload, ["payload.stop"]);
  const duration = firstNumber(payload, ["payload.duration"]);
  const releaseCause = firstNumber(payload, ["payload.releaseCause"]);
  const callPayload = asRecord(readPath(payload, "payload"));

  const { error } = await adminClient
    .from("uniq_calls")
    .upsert({
      organization_id: PLATFORM_ORGANIZATION_ID,
      uniq_call_id: callId,
      uniq_event_id: firstText(payload, ["payload.id"]),
      uniq_room_id: firstText(payload, ["payload.room"]),
      uniq_subscriber_id: firstText(payload, ["payload.subscriber"]),
      uniq_organization_id: firstText(payload, ["payload.organization", "organization"]),
      event_type: firstText(payload, ["payload.eventType"]),
      media_type: firstText(payload, ["payload.type"]),
      direction: firstText(payload, ["payload.direction"]),
      state: firstText(payload, ["payload.state"]),
      remote_uri: remoteUri,
      remote_phone: remotePhone,
      remote_phone_digits: remotePhoneDigits,
      setup_at: epochMillisecondsToIso(setup),
      answered_at: epochMillisecondsToIso(start),
      ended_at: epochMillisecondsToIso(stop),
      duration_seconds: Math.max(0, Math.trunc(duration ?? 0)),
      release_cause: releaseCause === null ? null : Math.trunc(releaseCause),
      recording_audit: firstBoolean(payload, ["payload.recAudit"]),
      recording_on_demand: firstBoolean(payload, ["payload.recOnDemand"]),
      last_event_id: eventId,
      raw_last_payload: callPayload,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: "organization_id,uniq_call_id",
    });

  if (error) throw error;
  return { normalized: true, callId };
}

Deno.serve(async (request) => {
  if (request.method === "GET") {
    return json({ ok: true, service: "uniq-webhook", mode: "capture" });
  }

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  if (!webhookToken) {
    console.error("UNIQ_WEBHOOK_TOKEN is not configured.");
    return json({ error: "Webhook receiver is not configured" }, 503);
  }

  const suppliedToken = requestToken(request);
  if (!suppliedToken || !constantTimeEqual(suppliedToken, webhookToken)) {
    return json({ error: "Unauthorized" }, 401);
  }

  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > MAX_BODY_BYTES) {
    return json({ error: "Payload too large" }, 413);
  }

  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
    return json({ error: "Payload too large" }, 413);
  }

  const contentType = request.headers.get("content-type") ?? "";
  const payload = parsePayload(rawBody, contentType);
  const eventKey = firstText(payload, [
    "type",
    "event",
    "eventType",
    "event_type",
    "name",
    "action",
    "status",
    "data.event",
    "data.eventType",
    "data.event_type",
    "data.type",
    "data.status",
  ]);
  const callId = firstText(payload, [
    "payload.call",
    "callId",
    "call_id",
    "call.id",
    "call.uuid",
    "data.callId",
    "data.call_id",
    "data.call.id",
    "data.id",
    "uuid",
  ]);
  const direction = firstText(payload, [
    "payload.direction",
    "direction",
    "call.direction",
    "data.direction",
    "data.call.direction",
  ]);

  const { data, error } = await adminClient
    .from("uniq_webhook_events")
    .insert({
      organization_id: PLATFORM_ORGANIZATION_ID,
      event_key: eventKey,
      call_id: callId,
      direction,
      content_type: contentType || null,
      headers: sanitizedHeaders(request),
      payload,
      raw_body: rawBody,
    })
    .select("id")
    .single();

  if (error) {
    console.error("Failed to persist Uniq webhook event", error);
    return json({ error: "Could not persist event" }, 500);
  }

  try {
    const normalized = await normalizeCallEvent(payload, data.id);
    await adminClient
      .from("uniq_webhook_events")
      .update({ processed_at: new Date().toISOString(), processing_error: null })
      .eq("id", data.id);
    return json({ ok: true, event_id: data.id, ...normalized });
  } catch (normalizationError) {
    const message = normalizationError instanceof Error
      ? normalizationError.message
      : String(normalizationError);
    console.error("Failed to normalize Uniq call event", normalizationError);
    await adminClient
      .from("uniq_webhook_events")
      .update({ processing_error: message })
      .eq("id", data.id);

    // O evento bruto já foi preservado. Retornamos 200 para evitar que a Uniq
    // repita indefinidamente o mesmo webhook enquanto ajustamos o normalizador.
    return json({ ok: true, event_id: data.id, normalized: false });
  }
});
