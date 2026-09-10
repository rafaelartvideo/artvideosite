import { createClient } from "npm:@supabase/supabase-js@2.112.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const SESSION_MINUTES = 20;
const PAIRING_CODE_DIGITS = 8;
const MAX_PHOTOS = 5;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

type AdminClient = ReturnType<typeof createClient>;

type CaptureSession = {
  id: string;
  organization_id: string;
  created_by: string;
  token_hash: string;
  pairing_code_hash: string | null;
  status: "active" | "closed" | "expired";
  expires_at: string;
  connected_at: string | null;
  last_seen_at: string | null;
};

const SESSION_SELECT = "id,organization_id,created_by,token_hash,pairing_code_hash,status,expires_at,connected_at,last_seen_at";

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function randomPairingCode() {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return String(values[0] % (10 ** PAIRING_CODE_DIGITS)).padStart(PAIRING_CODE_DIGITS, "0");
}

function normalizePairingCode(value: unknown) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, PAIRING_CODE_DIGITS);
  return digits.length === PAIRING_CODE_DIGITS ? digits : "";
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, "0")).join("");
}

async function pairingCodeHash(code: string) {
  return sha256(`pairing:${code}`);
}

function cleanSerial(value: unknown) {
  return String(value || "").trim().slice(0, 160);
}

function safeFileName(value: string) {
  const cleaned = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100);
  return cleaned || `foto-${Date.now()}.jpg`;
}

function extensionFor(file: File) {
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpg";
}

async function authenticatedUser(request: Request, supabaseUrl: string, anonKey: string) {
  const authorization = request.headers.get("Authorization");
  if (!authorization) return null;
  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  });
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
}

async function activeMember(admin: AdminClient, organizationId: string, userId: string) {
  const { data, error } = await admin
    .from("organization_members")
    .select("id,role_id,status")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function memberCanCreateOrders(admin: AdminClient, organizationId: string, userId: string) {
  const member = await activeMember(admin, organizationId, userId);
  if (!member?.role_id) return false;
  const { data, error } = await admin
    .from("role_permissions")
    .select("permission:permissions!inner(key)")
    .eq("role_id", member.role_id)
    .eq("permission.key", "orders.create")
    .limit(1);
  if (error) throw error;
  return Boolean(data?.length);
}

async function sessionByToken(admin: AdminClient, sessionId: string, token: string) {
  if (!sessionId || !token) return null;

  let query = admin.from("device_capture_sessions").select(SESSION_SELECT).eq("id", sessionId);
  if (token.startsWith("code:")) {
    const code = normalizePairingCode(token.slice(5));
    if (!code) return null;
    query = query.eq("pairing_code_hash", await pairingCodeHash(code));
  } else {
    query = query.eq("token_hash", await sha256(token));
  }

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const session = data as CaptureSession;
  if (session.status !== "active") return null;
  if (new Date(session.expires_at).getTime() <= Date.now()) {
    await admin.from("device_capture_sessions").update({ status: "expired", updated_at: new Date().toISOString() }).eq("id", session.id);
    return null;
  }
  return session;
}

async function ownedSession(admin: AdminClient, sessionId: string, userId: string) {
  const { data, error } = await admin
    .from("device_capture_sessions")
    .select(SESSION_SELECT)
    .eq("id", sessionId)
    .eq("created_by", userId)
    .maybeSingle();
  if (error) throw error;
  return data as CaptureSession | null;
}

async function removeSessionPhotos(admin: AdminClient, sessionId: string) {
  const { data } = await admin
    .from("device_capture_events")
    .select("storage_path")
    .eq("session_id", sessionId)
    .eq("event_type", "photo");
  const paths = (data || []).map(item => String(item.storage_path || "")).filter(Boolean);
  if (paths.length) {
    const { error } = await admin.storage.from("service-images").remove(paths);
    if (error) console.error("[DEVICE CAPTURE] temp photo cleanup", error);
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ success: false, error: "Método não permitido." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json({ success: false, error: "Captura por celular não configurada no servidor." }, 500);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const isMultipart = request.headers.get("content-type")?.includes("multipart/form-data") === true;
    const input: Record<string, unknown> = isMultipart
      ? Object.fromEntries((await request.formData()).entries())
      : await request.json().catch(() => ({}));
    const action = String(input.action || "").trim();

    if (action === "create") {
      const user = await authenticatedUser(request, supabaseUrl, anonKey);
      if (!user) return json({ success: false, error: "Usuário não autenticado." });
      const organizationId = String(input.organization_id || "").trim();
      if (!organizationId) return json({ success: false, error: "Empresa ativa não informada." });
      if (!(await memberCanCreateOrders(admin, organizationId, user.id))) {
        return json({ success: false, error: "Você não possui permissão para iniciar a captura desta OS." });
      }

      const now = new Date();
      await admin
        .from("device_capture_sessions")
        .update({ status: "expired", updated_at: now.toISOString() })
        .eq("created_by", user.id)
        .eq("organization_id", organizationId)
        .eq("status", "active")
        .lt("expires_at", now.toISOString());

      const token = randomToken();
      const tokenHash = await sha256(token);
      const expiresAt = new Date(now.getTime() + SESSION_MINUTES * 60_000).toISOString();
      let createdSession: { id: string; expires_at: string } | null = null;
      let pairingCode = "";

      for (let attempt = 0; attempt < 5 && !createdSession; attempt += 1) {
        pairingCode = randomPairingCode();
        const { data, error } = await admin
          .from("device_capture_sessions")
          .insert({
            organization_id: organizationId,
            created_by: user.id,
            token_hash: tokenHash,
            pairing_code_hash: await pairingCodeHash(pairingCode),
            expires_at: expiresAt,
          })
          .select("id,expires_at")
          .single();

        if (!error && data) {
          createdSession = data;
          break;
        }
        if (error?.code !== "23505") throw error;
      }

      if (!createdSession || !pairingCode) {
        throw new Error("Não foi possível gerar um código de conexão único.");
      }

      return json({
        success: true,
        session: {
          id: createdSession.id,
          token,
          pairing_code: pairingCode,
          expires_at: createdSession.expires_at,
        },
      });
    }

    if (action === "pair_code") {
      const code = normalizePairingCode(input.code);
      if (!code) {
        return json({ success: false, error: "Digite os 8 números do código de conexão." });
      }

      const now = new Date().toISOString();
      const { data, error } = await admin
        .from("device_capture_sessions")
        .select(SESSION_SELECT)
        .eq("pairing_code_hash", await pairingCodeHash(code))
        .eq("status", "active")
        .gt("expires_at", now)
        .maybeSingle();
      if (error) throw error;
      if (!data) {
        return json({ success: false, error: "Código inválido ou expirado. Confira o código exibido no computador." });
      }

      const session = data as CaptureSession;
      return json({
        success: true,
        session: {
          id: session.id,
          token: `code:${code}`,
          expires_at: session.expires_at,
        },
      });
    }

    if (action === "poll") {
      const user = await authenticatedUser(request, supabaseUrl, anonKey);
      if (!user) return json({ success: false, error: "Usuário não autenticado." });
      const sessionId = String(input.session_id || "").trim();
      const session = await ownedSession(admin, sessionId, user.id);
      if (!session) return json({ success: false, error: "Sessão de captura não encontrada." });
      if (!(await activeMember(admin, session.organization_id, user.id))) {
        return json({ success: false, error: "Acesso à empresa não permitido." });
      }

      const isExpired = new Date(session.expires_at).getTime() <= Date.now();
      if (isExpired && session.status === "active") {
        await admin.from("device_capture_sessions").update({ status: "expired", updated_at: new Date().toISOString() }).eq("id", session.id);
      }

      const lastEventId = Math.max(0, Number(input.last_event_id || 0) || 0);
      const { data: events, error } = await admin
        .from("device_capture_events")
        .select("id,event_type,serial_value,photo_kind,storage_path,file_name,mime_type,size_bytes,created_at")
        .eq("session_id", session.id)
        .gt("id", lastEventId)
        .order("id", { ascending: true });
      if (error) throw error;

      const outputEvents: Record<string, unknown>[] = [];
      for (const event of events || []) {
        if (event.event_type === "serial") {
          outputEvents.push({ id: event.id, type: "serial", value: event.serial_value, created_at: event.created_at });
          continue;
        }
        if (event.storage_path) {
          const { data: signed, error: signedError } = await admin.storage
            .from("service-images")
            .createSignedUrl(event.storage_path, 300);
          if (signedError || !signed?.signedUrl) {
            console.error("[DEVICE CAPTURE] signed url", signedError);
            continue;
          }
          outputEvents.push({
            id: event.id,
            type: "photo",
            kind: event.photo_kind,
            signed_url: signed.signedUrl,
            file_name: event.file_name,
            mime_type: event.mime_type,
            size_bytes: event.size_bytes,
            created_at: event.created_at,
          });
        }
      }

      const lastSeen = session.last_seen_at ? new Date(session.last_seen_at).getTime() : 0;
      const connected = Boolean(session.connected_at) && Date.now() - lastSeen < 35_000 && !isExpired && session.status === "active";
      return json({
        success: true,
        status: isExpired ? "expired" : session.status,
        connected,
        expires_at: session.expires_at,
        events: outputEvents,
      });
    }

    if (action === "close") {
      const user = await authenticatedUser(request, supabaseUrl, anonKey);
      if (!user) return json({ success: false, error: "Usuário não autenticado." });
      const sessionId = String(input.session_id || "").trim();
      const session = await ownedSession(admin, sessionId, user.id);
      if (!session) return json({ success: true });
      await removeSessionPhotos(admin, session.id);
      await admin
        .from("device_capture_sessions")
        .update({ status: "closed", updated_at: new Date().toISOString() })
        .eq("id", session.id);
      return json({ success: true });
    }

    if (action === "status") {
      const sessionId = String(input.session_id || "").trim();
      const token = String(input.token || "").trim();
      const session = await sessionByToken(admin, sessionId, token);
      if (!session) return json({ success: false, error: "A conexão expirou ou foi encerrada." });
      const now = new Date().toISOString();
      await admin
        .from("device_capture_sessions")
        .update({ connected_at: session.connected_at || now, last_seen_at: now, updated_at: now })
        .eq("id", session.id);
      const { count } = await admin
        .from("device_capture_events")
        .select("id", { count: "exact", head: true })
        .eq("session_id", session.id)
        .eq("event_type", "photo");
      return json({ success: true, expires_at: session.expires_at, photo_count: count || 0 });
    }

    if (action === "send_serial") {
      const sessionId = String(input.session_id || "").trim();
      const token = String(input.token || "").trim();
      const session = await sessionByToken(admin, sessionId, token);
      if (!session) return json({ success: false, error: "A conexão expirou ou foi encerrada." });
      const serial = cleanSerial(input.serial);
      if (!serial) return json({ success: false, error: "Número de série vazio." });
      const { error } = await admin.from("device_capture_events").insert({
        session_id: session.id,
        event_type: "serial",
        serial_value: serial,
      });
      if (error) throw error;
      await admin.from("device_capture_sessions").update({ last_seen_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", session.id);
      return json({ success: true, serial });
    }

    if (action === "upload_photo") {
      const sessionId = String(input.session_id || "").trim();
      const token = String(input.token || "").trim();
      const kind = String(input.kind || "").trim();
      const file = input.file;
      const session = await sessionByToken(admin, sessionId, token);
      if (!session) return json({ success: false, error: "A conexão expirou ou foi encerrada." });
      if (kind !== "label" && kind !== "equipment") {
        return json({ success: false, error: "Tipo de foto inválido." });
      }
      if (!(file instanceof File)) return json({ success: false, error: "Nenhuma foto recebida." });
      if (!ACCEPTED_IMAGE_TYPES.has(file.type)) {
        return json({ success: false, error: "Formato não suportado. Use JPG, PNG ou WebP." });
      }
      if (file.size <= 0 || file.size > MAX_IMAGE_BYTES) {
        return json({ success: false, error: "A foto deve ter no máximo 10 MB." });
      }

      const { count } = await admin
        .from("device_capture_events")
        .select("id", { count: "exact", head: true })
        .eq("session_id", session.id)
        .eq("event_type", "photo");
      if ((count || 0) >= MAX_PHOTOS) {
        return json({ success: false, error: "Limite de 5 fotos atingido nesta captura." });
      }

      const name = safeFileName(file.name || `foto.${extensionFor(file)}`);
      const path = `capture/${session.organization_id}/${session.id}/${crypto.randomUUID()}.${extensionFor(file)}`;
      const { error: uploadError } = await admin.storage.from("service-images").upload(path, file, {
        contentType: file.type,
        cacheControl: "3600",
        upsert: false,
      });
      if (uploadError) throw uploadError;

      const { error: eventError } = await admin.from("device_capture_events").insert({
        session_id: session.id,
        event_type: "photo",
        photo_kind: kind,
        storage_path: path,
        file_name: name,
        mime_type: file.type,
        size_bytes: file.size,
      });
      if (eventError) {
        await admin.storage.from("service-images").remove([path]);
        throw eventError;
      }
      const now = new Date().toISOString();
      await admin.from("device_capture_sessions").update({ last_seen_at: now, updated_at: now }).eq("id", session.id);
      return json({ success: true, photo_count: (count || 0) + 1 });
    }

    return json({ success: false, error: "Ação de captura inválida." });
  } catch (error) {
    console.error("[DEVICE CAPTURE]", error);
    return json({
      success: false,
      error: error instanceof Error ? error.message : "Erro inesperado na captura por celular.",
    }, 500);
  }
});