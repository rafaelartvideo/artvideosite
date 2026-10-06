import { createClient } from "npm:@supabase/supabase-js@2.112.3";

const SAC_API_BASE_URL = "https://api.sac.digital/v2/client";
const SAC_SCOPES = ["protocol", "contact", "channel", "department", "operator", "inbox", "send"];
const SAC_OUTBOX_BUCKET = "sac-digital-outbox";
const SAC_OUTBOX_MAX_BYTES = 25 * 1024 * 1024;
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

function bearerToken(request: Request) {
  return request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "").trim() || "";
}

function isUuid(value: unknown) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
}

function validProtocol(value: unknown) {
  return /^[A-Za-z0-9_-]{3,80}$/.test(String(value || "").trim());
}

async function fetchJson(url: string, init: RequestInit, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const raw = await response.text();
    let body: Record<string, unknown> = {};
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) body = parsed;
      } catch {
        body = {};
      }
    }
    return { response, body, raw };
  } finally {
    clearTimeout(timer);
  }
}

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ success: false, error: "Método não permitido." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json({ success: false, error: "Integração SAC Digital indisponível." }, 503);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const ensureOutboxBucket = async () => {
    const existing = await admin.storage.getBucket(SAC_OUTBOX_BUCKET);
    if (!existing.error && existing.data) return;
    const created = await admin.storage.createBucket(SAC_OUTBOX_BUCKET, {
      public: false,
      fileSizeLimit: SAC_OUTBOX_MAX_BYTES,
    });
    if (created.error && !/already exists/i.test(created.error.message || "")) {
      throw new Error("Não foi possível preparar o envio de anexos.");
    }
  };

  const cleanupOutbox = async (organizationId: string) => {
    try {
      const { data } = await admin.storage
        .from(SAC_OUTBOX_BUCKET)
        .list(organizationId, {
          limit: 100,
          sortBy: { column: "created_at", order: "asc" },
        });
      const cutoff = Date.now() - 24 * 60 * 60 * 1000;
      const stale = (data || [])
        .filter(item => {
          const value = String((item as any).created_at || (item as any).updated_at || "");
          const time = new Date(value).getTime();
          return Number.isFinite(time) && time < cutoff;
        })
        .map(item => `${organizationId}/${item.name}`);
      if (stale.length) await admin.storage.from(SAC_OUTBOX_BUCKET).remove(stale);
    } catch (error) {
      console.warn("[SAC DIGITAL API] outbox cleanup skipped", error instanceof Error ? error.message : error);
    }
  };

  const loadCredentials = async (organizationId: string) => {
    const { data, error } = await admin.rpc("sac_digital_service_credentials", {
      p_organization_id: organizationId,
    });
    if (error) throw new Error("Não foi possível carregar as credenciais SAC Digital.");
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new Error("Credenciais SAC Digital não configuradas.");
    }
    const row = data as Record<string, unknown>;
    const clientId = String(row.client_id || "").trim();
    const clientSecret = String(row.client_secret || "").trim();
    if (!clientId || !clientSecret) throw new Error("Client ID ou Client Secret não configurado.");
    return {
      enabled: row.enabled === true,
      clientId,
      clientSecret,
    };
  };

  const login = async (
    organizationId: string,
    credentials: { clientId: string; clientSecret: string },
    force = false,
  ) => {
    const cached = tokenCache.get(organizationId);
    if (!force && cached && cached.expiresAt > Date.now() + 60_000) return cached;

    const { response, body } = await fetchJson(
      `${SAC_API_BASE_URL}/auth2/login`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          client: credentials.clientId,
          password: credentials.clientSecret,
          scopes: SAC_SCOPES,
        }),
      },
    );

    const token = typeof body.token === "string" ? body.token.trim() : "";
    if (!response.ok || body.success === false || !token) {
      console.error("[SAC DIGITAL API] login failed", {
        organization_id: organizationId,
        status: response.status,
        request_id: body.request_id,
      });
      throw new Error(response.status === 401 || response.status === 403
        ? "Credenciais SAC Digital recusadas pela API."
        : "Não foi possível autenticar na API SAC Digital.");
    }

    const expiresIn = Number(body.expires_in || 3600);
    const safeExpiresIn = Number.isFinite(expiresIn) && expiresIn > 60 ? expiresIn : 3600;
    const session = {
      token,
      expiresAt: Date.now() + safeExpiresIn * 1000,
    };
    tokenCache.set(organizationId, session);
    return session;
  };

  const apiRequest = async (
    organizationId: string,
    credentials: { clientId: string; clientSecret: string },
    path: string,
    init: RequestInit = {},
  ) => {
    let session = await login(organizationId, credentials);
    const execute = (token: string) => fetchJson(
      `${SAC_API_BASE_URL}${path}`,
      {
        ...init,
        headers: {
          Accept: "application/json",
          ...(init.body ? { "Content-Type": "application/json" } : {}),
          ...(init.headers || {}),
          Authorization: `Bearer ${token}`,
        },
      },
    );

    let result = await execute(session.token);
    if (result.response.status === 401) {
      tokenCache.delete(organizationId);
      session = await login(organizationId, credentials, true);
      result = await execute(session.token);
    }
    return result;
  };

  const enrichProtocol = async (organizationId: string, protocol: string) => {
    const credentials = await loadCredentials(organizationId);
    if (!credentials.enabled) throw new Error("Integração SAC Digital está desativada.");

    const { response, body } = await apiRequest(
      organizationId,
      credentials,
      `/protocol/info?protocol=${encodeURIComponent(protocol)}`,
      { method: "GET" },
    );

    if (!response.ok || body.status === false || !body.info) {
      console.error("[SAC DIGITAL API] protocol lookup failed", {
        organization_id: organizationId,
        protocol,
        status: response.status,
        request_id: body.request_id,
      });
      throw new Error(response.status === 404
        ? "Protocolo não encontrado na SAC Digital."
        : "Não foi possível consultar o protocolo na SAC Digital.");
    }

    const { data: applied, error: applyError } = await admin.rpc("apply_sac_digital_protocol_info", {
      p_organization_id: organizationId,
      p_protocol: protocol,
      p_payload: body,
    });
    if (applyError) {
      console.error("[SAC DIGITAL API] protocol apply failed", {
        organization_id: organizationId,
        protocol,
        code: applyError.code,
      });
      throw new Error("Não foi possível vincular os dados do protocolo ao CRM.");
    }

    return applied && typeof applied === "object" ? applied as Record<string, unknown> : {};
  };


  const sha256 = async (value: string) => {
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return Array.from(new Uint8Array(hash))
      .map(byte => byte.toString(16).padStart(2, "0"))
      .join("");
  };

  const sacDateIso = (value: unknown) => {
    const text = String(value || "").trim();
    if (!text) return new Date().toISOString();
    const normalized = text.includes("T") ? text : text.replace(" ", "T");
    const withZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized)
      ? normalized
      : `${normalized}-03:00`;
    const date = new Date(withZone);
    return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
  };

  const historyMessageShape = (entry: Record<string, unknown>) => {
    const text = String(entry.text || "").trim();
    const image = String(entry.image || "").trim();
    const video = String(entry.video || "").trim();
    const audio = String(entry.audio || "").trim();
    const file = String(entry.file || "").trim();
    const place = String(entry.place || "").trim();
    const lat = entry.lat == null ? "" : String(entry.lat);
    const lon = entry.lon == null ? "" : String(entry.lon);
    const vcardName = String(entry.vcard_name || entry.v_name || "").trim();
    const vcardPhone = String(entry.vcard_phone || entry.v_number || "").trim();

    const messageType = image ? "image"
      : video ? "video"
      : audio ? "audio"
      : file ? "file"
      : place || lat || lon ? "location"
      : vcardName || vcardPhone ? "vcard"
      : text ? "text"
      : "unknown";

    const mediaUrl = image || video || audio || file || null;
    return { text: text || null, image, video, audio, file, place, lat, lon, vcardName, vcardPhone, messageType, mediaUrl };
  };

  const syncProtocolHistory = async (organizationId: string, protocol: string) => {
    const credentials = await loadCredentials(organizationId);
    if (!credentials.enabled) throw new Error("Integração SAC Digital está desativada.");

    const { response, body } = await apiRequest(
      organizationId,
      credentials,
      `/protocol/messages?protocol=${encodeURIComponent(protocol)}`,
      { method: "GET" },
    );

    const history = Array.isArray(body.historic)
      ? body.historic.filter(item => item && typeof item === "object" && !Array.isArray(item)) as Record<string, unknown>[]
      : [];

    if (!response.ok || body.status === false || !Array.isArray(body.historic)) {
      console.error("[SAC DIGITAL API] protocol history failed", {
        organization_id: organizationId,
        protocol,
        status: response.status,
        request_id: body.request_id,
      });
      throw new Error("Não foi possível sincronizar o histórico da conversa.");
    }

    const { data: protocolRow, error: protocolError } = await admin
      .from("sac_digital_protocols")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("external_protocol_id", protocol)
      .maybeSingle();

    if (protocolError || !protocolRow?.id) {
      throw new Error("Protocolo não encontrado na Union.");
    }

    const { data: localRows, error: localError } = await admin
      .from("sac_digital_messages")
      .select("id,direction,message_type,body_text,media_url,sent_at,external_message_id,raw_metadata")
      .eq("organization_id", organizationId)
      .eq("protocol_id", protocolRow.id)
      .order("sent_at", { ascending: true });

    if (localError) throw new Error("Não foi possível comparar o histórico local.");

    const localMessages = [...(localRows || [])] as Array<Record<string, any>>;
    let imported = 0;
    let matched = 0;
    let latestAt: string | null = null;

    for (const entry of history) {
      const shape = historyMessageShape(entry);
      const sentAt = sacDateIso(entry.created_at || (entry.status as Record<string, unknown> | undefined)?.sended_at);
      if (!latestAt || new Date(sentAt).getTime() > new Date(latestAt).getTime()) latestAt = sentAt;

      const fingerprint = await sha256(JSON.stringify({
        protocol,
        created_at: String(entry.created_at || ""),
        by: String(entry.by || ""),
        operator: String(entry.operator || ""),
        text: shape.text || "",
        image: shape.image,
        video: shape.video,
        audio: shape.audio,
        file: shape.file,
        place: shape.place,
        lat: shape.lat,
        lon: shape.lon,
        vcard_name: shape.vcardName,
        vcard_phone: shape.vcardPhone,
      }));
      const historyId = `sac-history:${fingerprint}`;

      const alreadyIndexed = localMessages.find(row => row.external_message_id === historyId);
      if (alreadyIndexed) {
        matched += 1;
        continue;
      }

      const targetTime = new Date(sentAt).getTime();
      const candidate = localMessages
        .map(row => {
          const localTime = new Date(String(row.sent_at || "")).getTime();
          return { row, diff: Number.isFinite(localTime) ? Math.abs(localTime - targetTime) : Number.POSITIVE_INFINITY };
        })
        .filter(({ row, diff }) => {
          if (diff > 180_000) return false;
          const sameText = String(row.body_text || "").trim() === String(shape.text || "").trim();
          if (!sameText) return false;
          if (shape.mediaUrl) {
            return String(row.message_type || "") === shape.messageType || Boolean(row.media_url);
          }
          return !row.media_url;
        })
        .sort((left, right) => left.diff - right.diff)[0]?.row;

      if (candidate) {
        const previousMetadata = candidate.raw_metadata && typeof candidate.raw_metadata === "object"
          ? candidate.raw_metadata
          : {};
        const nextMetadata: Record<string, unknown> = {
          ...previousMetadata,
          sac_history: entry,
          history_synced: true,
        };
        const patch: Record<string, unknown> = { raw_metadata: nextMetadata };
        if (!candidate.external_message_id) patch.external_message_id = historyId;
        if (shape.mediaUrl) {
          patch.media_url = shape.mediaUrl;
          patch.message_type = shape.messageType;
          const tempPath = String((previousMetadata as any).temp_storage_path || "");
          if (tempPath) {
            const removed = await admin.storage.from(SAC_OUTBOX_BUCKET).remove([tempPath]);
            if (!removed.error) nextMetadata.temp_storage_removed_at = new Date().toISOString();
          }
        }
        const { error: updateError } = await admin
          .from("sac_digital_messages")
          .update(patch)
          .eq("id", candidate.id);
        if (!updateError) {
          if (!candidate.external_message_id) candidate.external_message_id = historyId;
          if (shape.mediaUrl) {
            candidate.media_url = shape.mediaUrl;
            candidate.message_type = shape.messageType;
          }
          candidate.raw_metadata = nextMetadata;
          matched += 1;
        }
        continue;
      }

      const direction = String(entry.by || "").toLowerCase() === "operator" ? "outgoing" : "incoming";
      const row = {
        organization_id: organizationId,
        protocol_id: protocolRow.id,
        external_message_id: historyId,
        direction,
        message_type: shape.messageType,
        body_text: shape.text,
        media_url: shape.mediaUrl,
        sender_id: null,
        sender_name: null,
        sent_at: sentAt,
        raw_metadata: {
          history_synced: true,
          sac_history: entry,
        },
      };

      const { data: inserted, error: insertError } = await admin
        .from("sac_digital_messages")
        .insert(row)
        .select("id,direction,message_type,body_text,media_url,sent_at,external_message_id,raw_metadata")
        .maybeSingle();

      if (!insertError && inserted) {
        localMessages.push(inserted);
        imported += 1;
      } else if (insertError?.code !== "23505") {
        console.error("[SAC DIGITAL API] history insert failed", {
          organization_id: organizationId,
          protocol,
          code: insertError?.code,
        });
      }
    }

    if (latestAt) {
      await admin
        .from("sac_digital_protocols")
        .update({ last_message_at: latestAt, updated_at: new Date().toISOString() })
        .eq("id", protocolRow.id);
    }

    return {
      total: history.length,
      imported,
      matched,
    };
  };

  try {
    let uploadFile: File | null = null;
    let body: Record<string, unknown> = {};
    const contentType = request.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      body = {
        action: form.get("action"),
        organization_id: form.get("organization_id"),
        protocol: form.get("protocol"),
        text: form.get("text"),
      };
      const candidate = form.get("file");
      uploadFile = candidate instanceof File ? candidate : null;
    } else {
      body = await request.json().catch(() => ({} as Record<string, unknown>));
    }
    const action = String(body.action || "").trim();
    const organizationId = String(body.organization_id || "").trim();
    if (!isUuid(organizationId)) return json({ success: false, error: "Empresa inválida." }, 400);

    const authorization = bearerToken(request);
    const internalRequest = authorization.length > 0 && authorization === serviceRoleKey;

    if (action === "enrich_protocol") {
      if (!internalRequest) return json({ success: false, error: "Acesso interno negado." }, 403);
      const protocol = String(body.protocol || "").trim();
      if (!validProtocol(protocol)) return json({ success: false, error: "Protocolo inválido." }, 400);
      const applied = await enrichProtocol(organizationId, protocol);
      const history = await syncProtocolHistory(organizationId, protocol);
      EdgeRuntime.waitUntil(cleanupOutbox(organizationId));
      return json({
        success: true,
        protocol,
        contact_found: applied.contact_found === true,
        customer_linked: applied.customer_linked === true,
        history_total: history.total,
        history_imported: history.imported,
        history_matched: history.matched,
      });
    }

    if (!authorization) return json({ success: false, error: "Usuário não autenticado." }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${authorization}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    if (userError || !userData.user) return json({ success: false, error: "Sessão inválida ou expirada." }, 401);

    const requirePermission = async (permissionKey: string) => {
      const { data: allowed, error } = await userClient.rpc("has_sac_digital_permission", {
        p_organization_id: organizationId,
        p_permission_key: permissionKey,
      });
      return !error && allowed === true;
    };

    if (action === "test_connection") {
      if (!(await requirePermission("sac_digital.settings.manage"))) {
        return json({ success: false, error: "Sem permissão para gerenciar a integração SAC Digital." }, 403);
      }

      const credentials = await loadCredentials(organizationId);
      const session = await login(organizationId, credentials, true);
      return json({
        success: true,
        api: SAC_API_BASE_URL,
        expires_in: Math.max(0, Math.round((session.expiresAt - Date.now()) / 1000)),
      });
    }

    if (action === "refresh_protocol") {
      if (!(await requirePermission("sac_digital.messages.view"))) {
        return json({ success: false, error: "Sem permissão para visualizar conversas do SAC Digital." }, 403);
      }
      const protocol = String(body.protocol || "").trim();
      if (!validProtocol(protocol)) return json({ success: false, error: "Protocolo inválido." }, 400);
      const applied = await enrichProtocol(organizationId, protocol);
      const history = await syncProtocolHistory(organizationId, protocol);
      EdgeRuntime.waitUntil(cleanupOutbox(organizationId));
      return json({
        success: true,
        protocol,
        contact_found: applied.contact_found === true,
        customer_linked: applied.customer_linked === true,
        history_total: history.total,
        history_imported: history.imported,
        history_matched: history.matched,
      });
    }

    if (action === "send_media") {
      if (!(await requirePermission("sac_digital.messages.send"))) {
        return json({ success: false, error: "Sem permissão para enviar anexos pelo SAC Digital." }, 403);
      }

      const protocol = String(body.protocol || "").trim();
      const text = String(body.text || "").trim();
      if (!validProtocol(protocol)) return json({ success: false, error: "Protocolo inválido." }, 400);
      if (!uploadFile || uploadFile.size <= 0) return json({ success: false, error: "Selecione um arquivo para enviar." }, 400);
      if (uploadFile.size > SAC_OUTBOX_MAX_BYTES) return json({ success: false, error: "O anexo deve ter no máximo 25 MB." }, 400);
      if (text.length > 5000) return json({ success: false, error: "A legenda é muito longa." }, 400);

      const credentials = await loadCredentials(organizationId);
      if (!credentials.enabled) return json({ success: false, error: "Integração SAC Digital está desativada." }, 400);

      const mediaType = uploadFile.type.startsWith("image/") ? "image"
        : uploadFile.type.startsWith("video/") ? "video"
        : uploadFile.type.startsWith("audio/") ? "audio"
        : "file";

      await ensureOutboxBucket();
      EdgeRuntime.waitUntil(cleanupOutbox(organizationId));

      const safeName = (uploadFile.name || "arquivo")
        .normalize("NFKD")
        .replace(/[^A-Za-z0-9._-]+/g, "-")
        .replace(/-+/g, "-")
        .slice(-120) || "arquivo";
      const publicFileName = `${crypto.randomUUID()}-${safeName}`;
      const storagePath = `${organizationId}/${publicFileName}`;

      const uploaded = await admin.storage
        .from(SAC_OUTBOX_BUCKET)
        .upload(storagePath, uploadFile, {
          contentType: uploadFile.type || "application/octet-stream",
          cacheControl: "3600",
          upsert: false,
        });
      if (uploaded.error) {
        console.error("[SAC DIGITAL API] media upload failed", {
          organization_id: organizationId,
          code: (uploaded.error as any).statusCode,
        });
        return json({ success: false, error: "Não foi possível preparar o anexo para envio." });
      }

      const proxyUrl = `${supabaseUrl}/functions/v1/sac-digital-media/${organizationId}/${encodeURIComponent(publicFileName)}`;

      const apiPayload: Record<string, unknown> = {
        protocol,
        type: mediaType,
        url: proxyUrl,
      };
      if (text) apiPayload.text = text;

      const { response, body: apiBody } = await apiRequest(
        organizationId,
        credentials,
        "/protocol/send",
        {
          method: "POST",
          body: JSON.stringify(apiPayload),
        },
      );

      if (!response.ok || apiBody.status === false || apiBody.success === false) {
        await admin.storage.from(SAC_OUTBOX_BUCKET).remove([storagePath]);
        console.error("[SAC DIGITAL API] send media failed", {
          organization_id: organizationId,
          protocol,
          status: response.status,
          request_id: apiBody.request_id,
        });
        console.error("[SAC DIGITAL API] SAC media response", {
          organization_id: organizationId,
          protocol,
          status: response.status,
          response: apiBody,
        });
        return json({
          success: false,
          error: typeof apiBody.message === "string" && apiBody.message.trim()
            ? `SAC Digital: ${apiBody.message.trim()}`
            : "A SAC Digital não conseguiu enviar o anexo.",
        });
      }

      const { data: protocolRow } = await admin
        .from("sac_digital_protocols")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("external_protocol_id", protocol)
        .maybeSingle();

      if (protocolRow?.id) {
        const sentAt = new Date().toISOString();
        const externalIdValue = apiBody.id ?? apiBody.message_id ?? apiBody.request_id;
        const externalMessageId = typeof externalIdValue === "string" || typeof externalIdValue === "number"
          ? `sac:${String(externalIdValue)}`
          : null;
        const { data: profile } = await admin
          .from("profiles")
          .select("full_name")
          .eq("id", userData.user.id)
          .maybeSingle();

        const localMessage = {
          organization_id: organizationId,
          protocol_id: protocolRow.id,
          external_message_id: externalMessageId,
          direction: "outgoing",
          message_type: mediaType,
          body_text: text || null,
          media_url: proxyUrl,
          sender_id: userData.user.id,
          sender_name: profile?.full_name || null,
          sent_at: sentAt,
          raw_metadata: {
            sent_via_union: true,
            temp_storage_bucket: SAC_OUTBOX_BUCKET,
            temp_storage_path: storagePath,
            api_response: apiBody,
          },
        };

        let inserted = await admin.from("sac_digital_messages").insert(localMessage);
        if (inserted.error?.code === "23505") {
          inserted = await admin.from("sac_digital_messages").insert({
            ...localMessage,
            external_message_id: null,
            raw_metadata: {
              ...localMessage.raw_metadata,
              external_id_conflict: true,
            },
          });
        }

        if (!inserted.error) {
          await admin
            .from("sac_digital_protocols")
            .update({ last_message_at: sentAt, updated_at: sentAt })
            .eq("id", protocolRow.id);
        }
      }

      EdgeRuntime.waitUntil((async () => {
        await new Promise(resolve => setTimeout(resolve, 1500));
        try {
          await syncProtocolHistory(organizationId, protocol);
        } catch (error) {
          console.warn("[SAC DIGITAL API] post-send history sync skipped", error instanceof Error ? error.message : error);
        }
      })());

      return json({
        success: true,
        protocol,
        type: mediaType,
        request_id: typeof apiBody.request_id === "string" ? apiBody.request_id : null,
      });
    }

    if (action === "send_message") {
      if (!(await requirePermission("sac_digital.messages.send"))) {
        return json({ success: false, error: "Sem permissão para enviar mensagens pelo SAC Digital." }, 403);
      }

      const protocol = String(body.protocol || "").trim();
      const text = String(body.text || "").trim();
      if (!validProtocol(protocol)) return json({ success: false, error: "Protocolo inválido." }, 400);
      if (!text) return json({ success: false, error: "Digite uma mensagem para enviar." }, 400);
      if (text.length > 5000) return json({ success: false, error: "A mensagem é muito longa." }, 400);

      const credentials = await loadCredentials(organizationId);
      if (!credentials.enabled) return json({ success: false, error: "Integração SAC Digital está desativada." }, 400);

      const { response, body: apiBody } = await apiRequest(
        organizationId,
        credentials,
        "/protocol/send",
        {
          method: "POST",
          body: JSON.stringify({
            protocol,
            type: "text",
            text,
          }),
        },
      );

      if (!response.ok || apiBody.status === false || apiBody.success === false) {
        console.error("[SAC DIGITAL API] send message failed", {
          organization_id: organizationId,
          protocol,
          status: response.status,
          request_id: apiBody.request_id,
        });
        return json({
          success: false,
          error: "A SAC Digital não conseguiu enviar a mensagem.",
        }, response.status >= 400 && response.status < 600 ? response.status : 502);
      }

      const { data: protocolRow, error: protocolError } = await admin
        .from("sac_digital_protocols")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("external_protocol_id", protocol)
        .maybeSingle();

      if (protocolError || !protocolRow?.id) {
        console.error("[SAC DIGITAL API] local protocol not found after send", {
          organization_id: organizationId,
          protocol,
          code: protocolError?.code,
        });
      } else {
        const sentAt = new Date().toISOString();
        const externalMessageIdCandidate = apiBody.id ?? apiBody.message_id ?? apiBody.request_id;
        const externalMessageId = typeof externalMessageIdCandidate === "string"
          || typeof externalMessageIdCandidate === "number"
          ? `sac:${String(externalMessageIdCandidate)}`
          : null;

        const { data: profile } = await admin
          .from("profiles")
          .select("full_name")
          .eq("id", userData.user.id)
          .maybeSingle();

        const localMessage = {
          organization_id: organizationId,
          protocol_id: protocolRow.id,
          external_message_id: externalMessageId,
          direction: "outgoing",
          message_type: "text",
          body_text: text,
          sender_id: userData.user.id,
          sender_name: profile?.full_name || null,
          sent_at: sentAt,
          raw_metadata: {
            sent_via_union: true,
            api_response: apiBody,
          },
        };

        let { error: messageError } = await admin
          .from("sac_digital_messages")
          .insert(localMessage);

        if (messageError?.code === "23505") {
          const fallback = await admin
            .from("sac_digital_messages")
            .insert({
              ...localMessage,
              external_message_id: null,
              raw_metadata: {
                ...localMessage.raw_metadata,
                external_id_conflict: true,
              },
            });
          messageError = fallback.error;
        }

        if (messageError) {
          console.error("[SAC DIGITAL API] local sent message insert failed", {
            organization_id: organizationId,
            protocol,
            code: messageError.code,
          });
        } else {
          await admin
            .from("sac_digital_protocols")
            .update({ last_message_at: sentAt, updated_at: sentAt })
            .eq("id", protocolRow.id);
        }
      }

      return json({
        success: true,
        protocol,
        request_id: typeof apiBody.request_id === "string" ? apiBody.request_id : null,
      });
    }

    return json({ success: false, error: "Ação não suportada." }, 400);
  } catch (error) {
    console.error("[SAC DIGITAL API] unexpected error", error instanceof Error ? error.message : error);
    return json({
      success: false,
      error: error instanceof Error ? error.message : "Falha inesperada na integração SAC Digital.",
    }, 502);
  }
});
