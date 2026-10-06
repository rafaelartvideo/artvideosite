import { createClient } from "npm:@supabase/supabase-js@2.112.3";

const SAC_API_BASE_URL = "https://api.sac.digital/v2/client";
const SAC_SCOPES = ["protocol", "contact", "channel", "department", "operator", "inbox", "send"];
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

  try {
    const body = await request.json().catch(() => ({} as Record<string, unknown>));
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
      return json({
        success: true,
        protocol,
        contact_found: applied.contact_found === true,
        customer_linked: applied.customer_linked === true,
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
      return json({
        success: true,
        protocol,
        contact_found: applied.contact_found === true,
        customer_linked: applied.customer_linked === true,
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
        const externalMessageIdCandidate = apiBody.id ?? apiBody.message_id ?? apiBody.message;
        const externalMessageId = typeof externalMessageIdCandidate === "string"
          || typeof externalMessageIdCandidate === "number"
          ? String(externalMessageIdCandidate)
          : null;

        const { data: profile } = await admin
          .from("profiles")
          .select("full_name")
          .eq("id", userData.user.id)
          .maybeSingle();

        const { error: messageError } = await admin
          .from("sac_digital_messages")
          .insert({
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
          });

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
