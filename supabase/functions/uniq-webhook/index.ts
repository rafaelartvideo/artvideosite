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
    "event",
    "eventType",
    "event_type",
    "type",
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

  return json({ ok: true, event_id: data.id });
});
