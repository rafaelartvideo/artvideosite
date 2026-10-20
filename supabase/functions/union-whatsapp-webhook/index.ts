import { createClient } from "npm:@supabase/supabase-js@2.112.3";

// Public WuzAPI webhook. Per-channel HMAC-SHA256 signatures are preferred;
// existing high-entropy session-token digests are a temporary compatibility
// fallback while the VPS bridge is updated. Never accept unsigned events
// without a verified token or leak provider tokens via URL/logs.
const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
const uuid = (value: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const str = (value: unknown, max = 4000) => typeof value === "string" ? value.slice(0, max) : "";
const obj = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value)
  ? value as Record<string, unknown> : {};
const get = (value: Record<string, unknown>, ...keys: string[]) =>
  keys.map(key => value[key]).find(item => item !== undefined && item !== null);
const digest = async (value: string) => Array.from(new Uint8Array(
  await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
)).map(byte => byte.toString(16).padStart(2, "0")).join("");
const hmacHex = async (key: Uint8Array<ArrayBuffer> | string, value: string) => {
  const encoder = new TextEncoder();
  const bytes = typeof key === "string" ? encoder.encode(key) : key;
  const imported = await crypto.subtle.importKey("raw", bytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", imported, encoder.encode(value))))
    .map(byte => byte.toString(16).padStart(2, "0")).join("");
};
const constantTimeHexEqual = (left: string, right: string) => {
  if (!/^[a-f0-9]{64}$/i.test(left) || !/^[a-f0-9]{64}$/i.test(right)) return false;
  let diff = 0;
  for (let i = 0; i < 64; i++) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
};
// Go's url.Values.Encode sorts form keys before producing the HMAC input.
const canonicalForm = (input: string) => {
  // Go net/url.QueryEscape keeps ~ literal; URLSearchParams.toString() does
  // not. Exact byte equivalence matters for signatures on customer messages.
  const encoder = new TextEncoder();
  const encode = (value: string) => Array.from(encoder.encode(value)).map(byte =>
    (byte >= 65 && byte <= 90) || (byte >= 97 && byte <= 122)
      || (byte >= 48 && byte <= 57) || [45, 46, 95, 126].includes(byte)
      ? String.fromCharCode(byte)
      : byte === 32 ? "+" : "%" + byte.toString(16).toUpperCase().padStart(2, "0")
  ).join("");
  const entries = [...new URLSearchParams(input).entries()];
  entries.sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0);
  return entries.map(([key, value]) => encode(key) + "=" + encode(value)).join("&");
};
const dateOf = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    const d = new Date(value < 1e11 ? value * 1000 : value);
    return Number.isFinite(d.getTime()) ? d.toISOString() : new Date().toISOString();
  }
  if (typeof value === "string" && value.length < 64) {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 1000000000) return dateOf(numeric);
    const d = new Date(value);
    if (Number.isFinite(d.getTime())) return d.toISOString();
  }
  return new Date().toISOString();
};

Deno.serve(async request => {
  if (request.method !== "POST") return json({ ok: false }, 405);
  const channelId = new URL(request.url).searchParams.get("channel") || "";
  if (!uuid(channelId)) return json({ ok: false }, 404);
  let adminKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!adminKey) {
    try {
      const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
      adminKey = String(keys.default || Object.values(keys)[0] || "");
    } catch { /* Leave unconfigured rather than trust an invalid key. */ }
  }
  const url = Deno.env.get("SUPABASE_URL");
  if (!url || !adminKey) return json({ ok: false }, 503);
  const admin = createClient(url, adminKey, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const raw = await request.text();
    if (raw.length > 1024 * 1024) return json({ ok: true, ignored: "size" }, 202);
    let payload: Record<string, unknown>;
    let token = "";
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("application/x-www-form-urlencoded")) {
      const form = new URLSearchParams(raw);
      token = form.get("token") || "";
      payload = obj(JSON.parse(form.get("jsonData") || "{}"));
    } else if (contentType.includes("application/json")) {
      payload = obj(JSON.parse(raw));
      token = str(payload.token, 256);
    } else return json({ ok: false }, 415);

    const providerSignature = str(request.headers.get("x-hmac-signature"), 128);
    let authenticated = false;
    if (providerSignature) {
      // Signed callbacks: don't permit fallback to weaker credentials on an
      // invalid signature. The same shared secret is already installed in
      // both the bridge service and the Supabase Edge Functions environment.
      const shared = Deno.env.get("UNION_WUZAPI_BRIDGE_SECRET")?.trim() || "";
      if (shared.length < 32 || !/^[a-f0-9]{64}$/i.test(providerSignature)) {
        return json({ ok: false }, 401);
      }
      const derivedKey = await hmacHex(shared, "union-whatsapp-webhook:v1:" + channelId);
      const signable = contentType.includes("application/x-www-form-urlencoded") ? canonicalForm(raw) : raw;
      const expected = await hmacHex(derivedKey, signable);
      authenticated = constantTimeHexEqual(expected, providerSignature);
      if (!authenticated) return json({ ok: false }, 401);
    } else if (/^[a-f0-9]{64}$/i.test(token)) {
      // Backwards-compatible signed-in session format. Existing probes and
      // current form callbacks remain supported without moving any secrets.
      const hash = await digest(token);
      const { data: registered, error: keyError } = await admin
        .from("union_whatsapp_webhook_keys").select("token_sha256")
        .eq("channel_id", channelId).maybeSingle();
      if (keyError || !registered) return json({ ok: false }, 401);
      authenticated = constantTimeHexEqual(registered.token_sha256, hash);
    }
    if (!authenticated) return json({ ok: false }, 401);

    const { data: channel, error: channelError } = await admin
      .from("whatsapp_channel_connections").select("organization_id").eq("id", channelId).eq("provider", "wuzapi").maybeSingle();
    if (channelError || !channel) return json({ ok: false }, 404);
    // Non-writing authenticated probe for verifying VPS-to-Supabase delivery.
    // It NEVER inserts a conversation or stores a test message.
    if (payload.type === "UnionProbe") return json({ ok: true, probe: "authenticated" });
    const eventType = str(get(payload, "type", "Type", "event"), 60);
    if (eventType !== "Message" && eventType !== "events.Message") return json({ ok: true, ignored: "event_type" });

    // WuzAPI versions expose either {type:"Message",event:{Info,Message}}
    // or {event:"Message",data:{id,chat,message,...}}.
    const event = obj(get(payload, "event", "Event"));
    const compact = obj(get(payload, "data", "Data"));
    const info = Object.keys(compact).length > 0 ? compact : obj(get(event, "Info", "info"));
    const message = Object.keys(compact).length > 0
      ? obj(get(compact, "message", "Message"))
      : obj(get(event, "Message", "message"));
    const providerMessageId = str(get(info, "ID", "Id", "id"), 180);
    // Whatsmeow may serialize the JID either as a string or a {User,Server}
    // object, and some WuzAPI versions use RemoteJid rather than Chat.
    const chatValue = get(info, "Chat", "chat", "RemoteJid", "RemoteJID", "remoteJid", "remoteJID");
    const chatObj = obj(chatValue);
    const chatJid = str(chatValue, 160) || (
      str(get(chatObj, "User", "user"), 30) && str(get(chatObj, "Server", "server"), 40)
        ? str(get(chatObj, "User", "user"), 30) + "@" + str(get(chatObj, "Server", "server"), 40)
        : ""
    );
    // First stage is direct conversations only; do not misclassify groups,
    // statuses, broadcasts or WhatsApp newsletter traffic.
    if (!providerMessageId || !/^\d{5,20}@(s\.whatsapp\.net|lid)$/.test(chatJid)) {
      return json({ ok: true, ignored: "unsupported_chat" });
    }
    const isFromMe = get(info, "IsFromMe", "isFromMe", "fromMe") === true;
    const typeHint = message.imageMessage || message.ImageMessage ? "image"
      : message.videoMessage || message.VideoMessage ? "video"
      : message.audioMessage || message.AudioMessage ? "audio"
      : message.documentMessage || message.DocumentMessage ? "file"
      : message.locationMessage || message.LocationMessage ? "location"
      : message.contactMessage || message.ContactMessage ? "contact" : "text";
    const extended = obj(get(message, "extendedTextMessage", "ExtendedTextMessage"));
    const media = obj(get(message, "imageMessage", "ImageMessage", "videoMessage", "VideoMessage", "documentMessage", "DocumentMessage"));
    const body = str(get(message, "conversation", "Conversation") ?? get(extended, "text", "Text") ?? get(media, "caption", "Caption"), 4000);
    // WuzAPI can emit a sent/echo envelope without an actual message body.
    // These blank "text" events previously created a phantom contact and
    // made one incoming message look like two separate conversations.
    if (typeHint === "text" && !body.trim()) {
      return json({ ok: true, ignored: "empty_text_event" });
    }
    const displayText = body || ({ image: "Imagem", video: "Vídeo", audio: "Áudio", file: "Documento", location: "Localização", contact: "Contato" }[typeHint] || "Mensagem");
    const name = str(get(info, "PushName", "pushName") || "", 160).trim();
    const phone = chatJid.endsWith("@s.whatsapp.net") ? chatJid.split("@")[0] : null;
    const org = channel.organization_id;
    const timestamp = dateOf(get(info, "Timestamp", "timestamp"));

    const { error: ensureError } = await admin.from("union_whatsapp_conversations")
      .upsert({
        organization_id: org, channel_id: channelId, chat_jid: chatJid,
        contact_name: name || (phone || "Contato WhatsApp"),
        contact_phone: phone,
      }, { onConflict: "channel_id,chat_jid", ignoreDuplicates: true });
    if (ensureError) throw ensureError;

    const { data: thread, error: threadError } = await admin.from("union_whatsapp_conversations")
      .select("id,last_message_at,unread_count,contact_name,status")
      .eq("channel_id", channelId).eq("organization_id", org).eq("chat_jid", chatJid).single();
    if (threadError || !thread) throw threadError || Error("conversation_missing");

    const { data: inserted, error: messageError } = await admin.from("union_whatsapp_messages")
      .upsert({
        organization_id: org, channel_id: channelId, conversation_id: thread.id,
        provider_message_id: providerMessageId, direction: isFromMe ? "outgoing" : "incoming",
        message_type: typeHint, body_text: body, sender_name: name || null, sent_at: timestamp,
      }, { onConflict: "channel_id,provider_message_id", ignoreDuplicates: true })
      .select("id").maybeSingle();
    if (messageError) throw messageError;
    if (inserted) {
      // Do not let delayed historical events replace the latest preview.
      const later = !thread.last_message_at || new Date(timestamp) >= new Date(thread.last_message_at);
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (later) { patch.last_message = displayText; patch.last_message_at = timestamp; }
      if (!isFromMe) {
        patch.unread_count = Math.min(Number(thread.unread_count || 0) + 1, 2147483647);
        // A new customer reply automatically reopens a completed/abandoned
        // conversation, matching the existing SAC queue behavior.
        if (thread.status === "finished" || thread.status === "abandoned") {
          patch.status = "waiting";
          patch.assigned_to = null;
        }
      }
      if (name && thread.contact_name === (phone || "Contato WhatsApp")) patch.contact_name = name;
      const { error: updateError } = await admin.from("union_whatsapp_conversations")
        .update(patch).eq("id", thread.id).eq("organization_id", org);
      if (updateError) throw updateError;
    }
    return json({ ok: true });
  } catch (error) {
    console.error("union-whatsapp-webhook:", error instanceof SyntaxError ? "invalid_json" : "processing_failed");
    return json({ ok: false }, 500);
  }
});
