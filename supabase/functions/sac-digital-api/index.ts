import { authorizationUrl, returnPath, stateHash } from '../_shared/sac-oauth.mjs';
import { providerDelivery, submissionCanMatchHistory } from '../_shared/sac-delivery.mjs';
import { formatSacOutgoingText } from '../_shared/sac-message-label.mjs';
import { createSacClientSessions } from '../_shared/sac-client-session.mjs';
import { authorizedOperatorToken } from '../_shared/sac-oauth-session.ts';
import { actionEnabled, conversationOwnership } from "../_shared/sac-runtime.mjs";
declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };
import { SAC_ENDPOINTS, buildSacRequest, mediaLimit } from "../_shared/sac-contracts.mjs";
import { executeSacOperation, operationPermission, parsePagination, operatorScopes, importPhoneCandidates, mayTryImportVariant, routeProtocolOperation, channelCapabilityError, responseEnvelope, ownMediaStoragePath, chooseImportChannel, operatorTokenError, newConversationRoute } from "../_shared/sac-gateway.ts";

import { createClient } from "npm:@supabase/supabase-js@2.112.3";

const SAC_API_BASE_URL = "https://api.sac.digital/v2/client";
const SAC_SCOPES = ["protocol", "contact", "channel", "department", "operator", "inbox", "send", "write", "import", "remove", "notification", "manager"];
const SAC_OUTBOX_BUCKET = "sac-digital-attachments";
const SAC_OUTBOX_MAX_BYTES = 5 * 1024 * 1024;
const operatorNameCache = new Map<string, { names: Map<string, string>; expiresAt: number }>();

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: Record<string, unknown>, status = 200) {
  const envelope={data:null,outcome:body.success === true ? 'accepted' : 'rejected',has_more:false,next_page:null,...body};
  return new Response(JSON.stringify(envelope), {
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

function normalizeSacPhone(value: unknown) {
  let digits = String(value || "").replace(/\D/g, "");
  if ((digits.length === 10 || digits.length === 11) && !digits.startsWith("55")) {
    digits = `55${digits}`;
  }
  return digits;
}

function sacPhoneKey(value: unknown) {
  const digits = normalizeSacPhone(value);
  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    return digits.slice(2);
  }
  return digits;
}

// Brasil: a SAC pode reconhecer o WhatsApp com ou sem o nono dígito.
// Nunca modificar o telefone cadastrado no CRM: são apenas variantes de consulta/importação.
function sacPhoneVariants(value: unknown) {
  const phone = normalizeSacPhone(value);
  const variants = [phone];
  if (phone.startsWith("55") && phone.length === 13 && phone[4] === "9") {
    variants.push(phone.slice(0, 4) + phone.slice(5));
  } else if (phone.startsWith("55") && phone.length === 12 && /^[6-9]$/.test(phone[4])) {
    variants.push(phone.slice(0, 4) + "9" + phone.slice(4));
  }
  return [...new Set(variants.filter(Boolean))];
}

function sacPhoneMatches(value: unknown, expected: unknown) {
  const keys = new Set(sacPhoneVariants(expected).map(sacPhoneKey));
  return sacPhoneVariants(value).some(candidate => keys.has(sacPhoneKey(candidate)));
}

function sacWhatsAppValidationInconclusive(message: unknown, type?: unknown) {
  if (String(type || "").trim().toLowerCase() === "error_valid_wpp") return true;
  return /(?:n[aã]o conseguimos validar|n[aã]o foi poss[ií]vel validar).*?(?:whatsapp|n[uú]mero)|(?:whatsapp|n[uú]mero).*?(?:n[aã]o conseguimos validar|n[aã]o foi poss[ií]vel validar)/i.test(String(message || ""));
}

function sacImportPhoneVariants(value: unknown) {
  const normalized = normalizeSacPhone(value);
  return importPhoneCandidates(normalized);
}

function sacContactImportError(message: unknown, fallback: string) {
  const detail = String(message || "").trim();
  if (/validar se este n[uú]mero possui whatsapp/i.test(detail)) {
    return "A SAC Digital não conseguiu confirmar se este número possui WhatsApp neste momento. Isso não significa que o número não tenha WhatsApp. Verifique o status do canal da SAC Digital e tente novamente.";
  }
  return detail ? `SAC Digital: ${detail}` : fallback;
}

function safeSearchText(value: unknown) {
  return String(value || "").trim().replace(/[%(),]/g, " ").replace(/\s+/g, " ").slice(0, 120);
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
        else throw new Error('Resposta JSON deve ser um objeto.');
      } catch {
        throw new Error("Resposta JSON inválida da SAC Digital.");
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
    if (!existing.error && existing.data) {
      if(existing.data.public) throw new Error("O bucket de anexos deve ser privado. Verifique a configuração de armazenamento.");
      return;
    }
    const created = await admin.storage.createBucket(SAC_OUTBOX_BUCKET, {
      public: false,
      fileSizeLimit: SAC_OUTBOX_MAX_BYTES,
    });
    if (created.error && !/already exists/i.test(created.error.message || "")) {
      throw new Error("Não foi possível preparar o envio de anexos.");
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

  const clientSessions = createSacClientSessions({rpc:async (name,args)=>{
    const {data,error}=await admin.rpc(name,args);if(error)throw error;return data;
  }});
  const login = async (
    organizationId: string,
    credentials: {clientId:string;clientSecret:string},
    _force = false,
    scopes = SAC_SCOPES,
  ) => clientSessions.get({organizationId,credentials,scopes});

  let resourceDispatch: ((path:string,init:RequestInit)=>Promise<any>) | null = null;
  const apiRequest = async (
    organizationId: string,
    credentials: { clientId: string; clientSecret: string },
    path: string,
    init: RequestInit = {},
  ) => {
    if(resourceDispatch && String(init.method || "GET").toUpperCase() !== "GET") return resourceDispatch(path,init);
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
    if (result.response.status === 401 && String(init.method || "GET").toUpperCase() === "GET") {
      await clientSessions.invalidate({organizationId,credentials,scopes:SAC_SCOPES},session.token);
      session = await login(organizationId, credentials, true);
      result = await execute(session.token);
    }

    if (!result.response.ok || result.body.status === false || result.body.success === false) {
      // Auditoria tecnica por empresa, sem corpo da resposta, mensagem,
      // token, telefone, query string ou qualquer credencial sensivel.
      const endpoint = path.split("?")[0].slice(0, 120);
      const requestId = typeof result.body.request_id === "string"
        ? result.body.request_id.slice(0, 120) : null;
      const apiErrorType = typeof result.body.type === "string"
        ? result.body.type.slice(0, 80) : null;
      try {
        const { error: auditError } = await admin.from("organization_audit_logs").insert({
          organization_id: organizationId,
          actor_user_id: null,
          action: "sac_digital.api.error",
          operation: "insert",
          entity_type: "sac_digital_api_error",
          entity_id: null,
          module_key: "sac_digital",
          source: "edge_function",
          context_type: "integration",
          metadata: {
            endpoint,
            method: String(init.method || "GET").toUpperCase().slice(0, 12),
            http_status: result.response.status,
            request_id: requestId,
            api_error_type: apiErrorType,
          },
          changed_fields: {},
          row_snapshot: null,
        });
        if (auditError) {
          console.warn("[SAC DIGITAL API] API failure audit write skipped", auditError.code);
        }
      } catch (auditError) {
        console.warn("[SAC DIGITAL API] API failure audit unavailable",
          auditError instanceof Error ? auditError.message : auditError);
      }
    }
    return result;
  };

  const importSacContact = async (
    organizationId: string,
    credentials: { clientId: string; clientSecret: string },
    phone: string,
    name: string,
    primaryChannel: Record<string, unknown> | null,
  ) => {
    const channelId = String(primaryChannel?.id || "").trim();

    if (!channelId) throw new Error("Selecione um canal ativo antes de importar o contato.");
    for (const candidatePhone of sacImportPhoneVariants(phone)) {
      const attempt = await apiRequest(organizationId, credentials, "/contact/import", {
        method: "POST", body: JSON.stringify({number:candidatePhone,name,channel:channelId}),
      });
      if(attempt.response.ok && attempt.body.status !== false && attempt.body.success !== false)
        return {result:attempt,phone:normalizeSacPhone(candidatePhone),channelId,failure:null};
      if(mayTryImportVariant(attempt.body,attempt.response.status)) continue;
      return {result:null,phone:normalizeSacPhone(candidatePhone),channelId,failure:attempt};
    }

    return {
      result: null,
      phone,
      channelId: null,
      failure: null,
    };
  };

  const paginatedSacList = async (organizationId:string,credentials:any,path:string) => {
    const list:any[]=[];
    for(let page=1;page<=100;page++) {
      const result = await apiRequest(organizationId,credentials,`${path}?p=${page}`,{method:'GET'});
      if(!result.response.ok || result.body.status === false || !Array.isArray(result.body.list)) throw new Error('Não foi possível carregar o catálogo SAC paginado.');
      list.push(...result.body.list);
      const pagination=parsePagination(result.body,page);
      if(!pagination.has_more) return list;
      if(pagination.next_page !== page+1) throw new Error("Paginação SAC não sequencial; sincronize pelo cursor de recurso.");
    }
    throw new Error('Catálogo SAC excedeu o limite de páginas; retome a sincronização.');
  };
  const loadSacOperatorNames = async (
    organizationId: string,
    credentials: { clientId: string; clientSecret: string },
  ) => {
    const cached = operatorNameCache.get(organizationId);
    if (cached && cached.expiresAt > Date.now()) return cached.names;

    const result = {response:new Response('{}'),body:{list:await paginatedSacList(organizationId,credentials,'/operator/all'),status:true}};
    if (!result.response.ok || result.body.status === false || !Array.isArray(result.body.list)) {
      return new Map<string, string>();
    }

    const names = new Map<string, string>();
    for (const item of result.body.list) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const row = item as Record<string, unknown>;
      const id = String(row.id || "").trim();
      const name = String(row.name || "").trim();
      if (id && name) names.set(id, name);
    }
    operatorNameCache.set(organizationId, {
      names,
      expiresAt: Date.now() + 10 * 60 * 1000,
    });
    return names;
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

    // /protocol/info nem sempre traz o cadastro completo do contato.
    // Quando o avatar ainda não existe, consultar /contact/info uma vez
    // e guardar o resultado por 24h para não repetir chamadas desnecessárias.
    const protocolInfo = body.info && typeof body.info === "object" && !Array.isArray(body.info)
      ? body.info as Record<string, unknown>
      : {};
    const protocolContact = protocolInfo.contact && typeof protocolInfo.contact === "object"
      && !Array.isArray(protocolInfo.contact)
      ? protocolInfo.contact as Record<string, unknown>
      : null;
    const externalContactId = String(protocolContact?.id || "").trim();

    if (externalContactId) {
      const { data: localContact } = await admin
        .from("sac_digital_contacts")
        .select("id,avatar_url,raw_metadata")
        .eq("organization_id", organizationId)
        .eq("external_contact_id", externalContactId)
        .maybeSingle();

      const localMetadata = localContact?.raw_metadata && typeof localContact.raw_metadata === "object"
        && !Array.isArray(localContact.raw_metadata)
        ? localContact.raw_metadata as Record<string, unknown>
        : {};
      const directAvatar = String(protocolContact?.avatar || "").trim();
      const checkedAt = new Date(String(localMetadata.avatar_checked_at || "")).getTime();
      const checkedRecently = Number.isFinite(checkedAt) && Date.now() - checkedAt < 24 * 60 * 60 * 1000;

      let hydratedContact = protocolContact;
      if (!localContact?.avatar_url && !directAvatar && !checkedRecently) {
        const contactResult = await apiRequest(
          organizationId,
          credentials,
          `/contact/info?id=${encodeURIComponent(externalContactId)}`,
          { method: "GET" },
        );
        if (contactResult.response.ok && contactResult.body.status !== false
          && contactResult.body.info && typeof contactResult.body.info === "object"
          && !Array.isArray(contactResult.body.info)) {
          hydratedContact = {
            ...protocolContact,
            ...(contactResult.body.info as Record<string, unknown>),
            id: externalContactId,
          };
        }
      }

      const avatar = String(hydratedContact?.avatar || directAvatar || "").trim();
      const contactName = String(hydratedContact?.name || protocolContact?.name || "").trim();
      const contactPhone = normalizeSacPhone(hydratedContact?.number || protocolContact?.number);
      const nextMetadata = {
        ...localMetadata,
        ...(hydratedContact || {}),
        avatar_checked_at: new Date().toISOString(),
      };
      const contactPatch: Record<string, unknown> = {
        raw_metadata: nextMetadata,
        updated_at: new Date().toISOString(),
      };
      if (avatar) contactPatch.avatar_url = avatar;
      if (contactName) contactPatch.name = contactName;
      if (contactPhone) contactPatch.phone = contactPhone;

      const { error: avatarUpdateError } = await admin
        .from("sac_digital_contacts")
        .update(contactPatch)
        .eq("organization_id", organizationId)
        .eq("external_contact_id", externalContactId);
      if (avatarUpdateError) {
        console.warn("[SAC DIGITAL API] contact avatar refresh skipped", avatarUpdateError.code);
      }
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
      .select("id,last_message_at,operator_id,operator_name")
      .eq("organization_id", organizationId)
      .eq("external_protocol_id", protocol)
      .maybeSingle();

    if (protocolError || !protocolRow?.id) {
      throw new Error("Protocolo não encontrado na Union.");
    }

    const { data: localRows, error: localError } = await admin
      .from("sac_digital_messages")
      .select("id,direction,message_type,body_text,media_url,sender_name,sent_at,external_message_id,source_event_hash,raw_metadata")
      .eq("organization_id", organizationId)
      .eq("protocol_id", protocolRow.id)
      .order("sent_at", { ascending: true });

    if (localError) throw new Error("Não foi possível comparar o histórico local.");

    const localMessages = [...(localRows || [])] as Array<Record<string, any>>;
    const historyHasOperatorMessages = history.some(entry => String(entry.by || "").toLowerCase() === "operator");
    const operatorNames = historyHasOperatorMessages
      ? await loadSacOperatorNames(organizationId, credentials)
      : new Map<string, string>();
    let imported = 0;
    let matched = 0;
    let latestAt: string | null = null;
    const reconciledRowIds = new Set<string>();

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
      const realHistoryId = entry.message_id ?? entry.id;
      const historyId = typeof realHistoryId === 'string' || typeof realHistoryId === 'number' ? `sac:${String(realHistoryId)}` : `sac-history:${fingerprint}`;
      if(realHistoryId != null) {
        const status:any=entry.status || {};
        const state=status.readed_at || status.read_at ? 'read' : status.delivered_at ? 'delivered' : status.sended_at || status.sent_at ? 'sent' : null;
        if(state) {
          const rank:any={unknown:0,accepted:0,queued:1,sent:2,delivered:3,read:4};
          const attempts=await admin.from('sac_digital_delivery_attempts').select('id,state').eq('organization_id',organizationId).eq('message_id',String(realHistoryId));
          if(attempts.error) throw attempts.error;
          for(const attempt of attempts.data || []) if(rank[state] >= (rank[attempt.state] ?? 0)) {
            const updated=await admin.from('sac_digital_delivery_attempts').update({state,checked_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',attempt.id);
            if(updated.error) throw updated.error;
          }
        }
      }


      const historyBy = String(entry.by || "").toLowerCase();
      const operatorId = String(entry.operator || "").trim();
      const direction = historyBy === "operator" || historyBy === "channel"
        ? "outgoing"
        : "incoming";
      const operatorName = historyBy === "channel"
        ? "Automação SAC Digital"
        : historyBy === "operator"
          ? operatorNames.get(operatorId)
            || (operatorId && String(protocolRow.operator_id || "") === operatorId
              ? String(protocolRow.operator_name || "").trim() : "")
            || null
          : null;
      const targetTime = new Date(sentAt).getTime();

      const alreadyIndexed = localMessages.find(row => row.external_message_id === historyId || row.external_message_id === `sac-history:${fingerprint}`);
      if (alreadyIndexed) {
        const previousMetadata = alreadyIndexed.raw_metadata && typeof alreadyIndexed.raw_metadata === "object"
          ? alreadyIndexed.raw_metadata : {};
        const sentViaUnion = previousMetadata.sent_via_union === true;
        const previousStatus:any = previousMetadata.sac_history?.status || {};
        const incomingStatus:any = entry.status || {};
        const mergedStatus = {...previousStatus,...incomingStatus};
        for(const key of ['sended_at','delivered_at','readed_at']) if(previousStatus[key] && (!incomingStatus[key] || new Date(previousStatus[key]).getTime()>new Date(incomingStatus[key]).getTime())) mergedStatus[key]=previousStatus[key];
        const indexedPatch: Record<string, unknown> = {raw_metadata:{...previousMetadata,sac_history:{...entry,status:mergedStatus},history_synced:true},...(realHistoryId != null ? {external_message_id:historyId}:{})};
        if (!sentViaUnion && alreadyIndexed.direction !== direction) indexedPatch.direction = direction;
        if (!sentViaUnion && direction === "outgoing" && operatorName && !alreadyIndexed.sender_name) {
          indexedPatch.sender_name = operatorName;
        }
        if (Object.keys(indexedPatch).length) {
          const patched = await admin.from("sac_digital_messages")
            .update(indexedPatch)
            .eq("id", alreadyIndexed.id);
          if (!patched.error) Object.assign(alreadyIndexed, indexedPatch);
        }

        const duplicate = localMessages
          .filter(row => row.id !== alreadyIndexed.id && !reconciledRowIds.has(String(row.id)))
          .map(row => {
            const metadata = row.raw_metadata && typeof row.raw_metadata === "object" ? row.raw_metadata : {};
            const localTime = new Date(String(row.sent_at || "")).getTime();
            const diff = Number.isFinite(localTime) ? Math.abs(localTime - targetTime) : Number.POSITIVE_INFINITY;
            return { row, metadata, diff };
          })
          .find(({ row, metadata, diff }) => {
            if (diff > 15_000 || metadata.sent_via_union === true) return false;
            if (!["protocol_new_message", "protocol_new_inbox"].includes(String(metadata.event || ""))) return false;
            if (!row.source_event_hash) return false;
            if (String(row.body_text || "").trim() !== String(shape.text || "").trim()) return false;
            return shape.mediaUrl
              ? String(row.message_type || "") === shape.messageType || Boolean(row.media_url)
              : !row.media_url;
          });
        if (duplicate) {
          const removed = await admin.from("sac_digital_messages")
            .delete()
            .eq("id", duplicate.row.id);
          if (!removed.error) {
            const index = localMessages.findIndex(row => row.id === duplicate.row.id);
            if (index >= 0) localMessages.splice(index, 1);
          }
        }

        reconciledRowIds.add(String(alreadyIndexed.id));
        matched += 1;
        continue;
      }

      const candidate = localMessages
        .filter(row => {
          if (reconciledRowIds.has(String(row.id))) return false;
          if (row.direction === direction) return true;
          const metadata = row.raw_metadata && typeof row.raw_metadata === "object" ? row.raw_metadata : {};
          const localTime = new Date(String(row.sent_at || "")).getTime();
          const diff = Number.isFinite(localTime) ? Math.abs(localTime - targetTime) : Number.POSITIVE_INFINITY;
          return metadata.sent_via_union !== true
            && ["protocol_new_message", "protocol_new_inbox"].includes(String(metadata.event || ""))
            && diff <= 15_000;
        })
        .map(row => {
          const localTime = new Date(String(row.sent_at || "")).getTime();
          return { row, diff: Number.isFinite(localTime) ? Math.abs(localTime - targetTime) : Number.POSITIVE_INFINITY };
        })
        .filter(({ row, diff }) => {
          if (diff > 180_000 || !submissionCanMatchHistory(row.raw_metadata,targetTime,row.external_message_id,historyId)) return false;
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
        const sentViaUnion = previousMetadata.sent_via_union === true;
        const patch: Record<string, unknown> = { raw_metadata: nextMetadata };
        if (!candidate.external_message_id) patch.external_message_id = historyId;
        if (!sentViaUnion && candidate.direction !== direction) patch.direction = direction;
        if (!sentViaUnion && direction === "outgoing" && operatorName && !candidate.sender_name) {
          patch.sender_name = operatorName;
        }
        if (shape.mediaUrl) {
          patch.media_url = shape.mediaUrl;
          patch.message_type = shape.messageType;

        }
        const { error: updateError } = await admin
          .from("sac_digital_messages")
          .update(patch)
          .eq("id", candidate.id);
        if (!updateError) {
          if (!candidate.external_message_id) candidate.external_message_id = historyId;
          if (patch.direction) candidate.direction = patch.direction;
          if (patch.sender_name) candidate.sender_name = patch.sender_name;
          if (shape.mediaUrl) {
            candidate.media_url = shape.mediaUrl;
            candidate.message_type = shape.messageType;
          }
          candidate.raw_metadata = nextMetadata;
          reconciledRowIds.add(String(candidate.id));
          matched += 1;
        }
        continue;
      }

      const row = {
        organization_id: organizationId,
        protocol_id: protocolRow.id,
        external_message_id: historyId,
        direction,
        message_type: shape.messageType,
        body_text: shape.text,
        media_url: shape.mediaUrl,
        sender_id: operatorId || null,
        sender_name: operatorName,
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
      const currentTime = new Date(String(protocolRow.last_message_at || "")).getTime();
      const newestAt = Number.isFinite(currentTime) && currentTime > new Date(latestAt).getTime()
        ? protocolRow.last_message_at
        : latestAt;
      await admin
        .from("sac_digital_protocols")
        .update({ last_message_at: newestAt, updated_at: new Date().toISOString() })
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
        order_id: form.get("order_id"),
        external_contact_id: form.get("external_contact_id"),
        intent_key: form.get("intent_key"),
        client_request_id: form.get("client_request_id"),
      };
      const candidate = form.get("file");
      uploadFile = candidate instanceof File ? candidate : null;
    } else {
      try { body = await request.json(); } catch { return json({success:false,error:"JSON inválido."},400); }
      if (!body || typeof body !== "object" || Array.isArray(body)) return json({success:false,error:"Objeto JSON obrigatório."},400);
    }
    const action = String(body.action || "").trim();
    const organizationId = String(body.organization_id || "").trim();
    if (!isUuid(organizationId)) return json({ success: false, error: "Empresa inválida." }, 400);

    if (!actionEnabled(action, body.endpoint_id)) {
      return json({success:false,error:"Este recurso está desativado na Union. Utilize o painel da SAC Digital."},410);
    }
    const authorization = bearerToken(request);
    const internalRequest = authorization.length > 0 && authorization === serviceRoleKey;

    if (action === "sync_protocol_history") {
      if (!internalRequest) return json({ success: false, error: "Acesso interno negado." }, 403);
      const protocol = String(body.protocol || "").trim();
      if (!validProtocol(protocol)) return json({ success: false, error: "Protocolo inválido." }, 400);
      const history = await syncProtocolHistory(organizationId, protocol);
      return json({
        success: true,
        protocol,
        history_total: history.total,
        history_imported: history.imported,
        history_matched: history.matched,
      });
    }

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

    const permissionChecks=new Map<string,Promise<boolean>>();
    const requirePermission = (permissionKey: string):Promise<boolean> => {
      if(permissionChecks.has(permissionKey)) return permissionChecks.get(permissionKey)!;
      const pending=(async()=>{
      const { data: allowed, error } = await userClient.rpc("has_sac_digital_permission", {
        p_organization_id: organizationId,
        p_permission_key: permissionKey,
      });
      return !error && allowed === true;
      })();permissionChecks.set(permissionKey,pending);return pending;
    };


    const hasOrganizationPermission = async (permissionKey: string) => {
      const { data, error } = await userClient.rpc("my_organization_permissions", {
        p_organization_id: organizationId,
      });
      if (error || !Array.isArray(data)) return false;
      return data.some((row: Record<string, unknown>) => String(row.permission_key || "") === permissionKey);
    };

    let auditActorName: string | null | undefined;
    const writeSacAudit = async ({
      action,
      operation,
      entityType,
      entityId,
      contextType,
      contextId,
      metadata = {},
      changedFields = {},
    }: {
      action: string;
      operation: string;
      entityType: string;
      entityId?: string | null;
      contextType?: string | null;
      contextId?: string | null;
      metadata?: Record<string, unknown>;
      changedFields?: Record<string, unknown>;
    }) => {
      try {
        if (auditActorName === undefined) {
          const { data: profile } = await admin
            .from("profiles")
            .select("full_name")
            .eq("id", userData.user.id)
            .maybeSingle();
          auditActorName = String(profile?.full_name || "").trim() || null;
        }

        // O log geral aceita somente insert/update/delete no campo
        // operation. A operação de negocio fica preservada no metadata.
        const storedOperation = operation === "send" || operation === "start"
          ? "insert"
          : operation === "unlink" || operation === "remove" ? "delete"
            : operation === "insert" || operation === "delete" ? operation : "update";
        const { error: auditInsertError } = await admin.from("organization_audit_logs").insert({
          organization_id: organizationId,
          actor_user_id: userData.user.id,
          action,
          operation: storedOperation,
          entity_type: entityType,
          entity_id: entityId || null,
          module_key: "sac_digital",
          context_type: contextType || null,
          context_id: contextId || null,
          actor_name_snapshot: auditActorName,
          source: "edge_function",
          metadata: {
            ...metadata,
            ...(storedOperation !== operation ? { sac_operation: operation } : {}),
          },
          changed_fields: changedFields,
          row_snapshot: null,
        });
        if (auditInsertError) {
          console.warn("[SAC DIGITAL API] audit insert failed", {
            code: auditInsertError.code,
            action,
          });
        }
      } catch (auditError) {
        console.warn(
          "[SAC DIGITAL API] audit write skipped",
          auditError instanceof Error ? auditError.message : auditError,
        );
      }
    };


    const beginLocalSubmission = async (protocolId:string,fields:Record<string,unknown>) => {
      const clientRequestId=body.client_request_id == null ? crypto.randomUUID() : String(body.client_request_id);
      if(!isUuid(clientRequestId)) throw Object.assign(new Error('Identificador do envio inválido.'),{outcome:'rejected'});
      const existing=await admin.from('sac_digital_messages').select('*').or(`id.eq.${clientRequestId},raw_metadata->>client_request_id.eq.${clientRequestId}`).eq('organization_id',organizationId).eq('protocol_id',protocolId).eq('sender_id',userData.user.id).maybeSingle();
      if(existing.error) throw Object.assign(new Error('Não foi possível consultar esta tentativa.'),{outcome:'rejected'});
      if(existing.data) {
        if(existing.data.body_text !== (fields.body_text || null) || existing.data.message_type !== fields.message_type) throw Object.assign(new Error('Esta tentativa pertence a outra mensagem.'),{outcome:'rejected'});
        return {row:existing.data,duplicate:true};
      }
      const started=new Date().toISOString();
      const {data:profile}=await admin.from('profiles').select('full_name').eq('id',userData.user.id).maybeSingle();
      const {data:row,error}=await admin.from('sac_digital_messages').insert({id:clientRequestId,organization_id:organizationId,protocol_id:protocolId,direction:'outgoing',sender_id:userData.user.id,sender_name:profile?.full_name || null,sent_at:started,...fields,raw_metadata:{...(fields.raw_metadata as object || {}),sent_via_union:true,client_request_id:clientRequestId,submission_started_at:started,delivery_status:'preparing'}}).select('*').single();
      if(error || !row) throw Object.assign(new Error('Não foi possível preparar o registro da mensagem. Nenhum envio foi realizado.'),{outcome:'rejected'});
      return {row,duplicate:false};
    };
    const finishLocalSubmission = async (row:any,result:any,apiBody:any) => {
      const {data:current}=await admin.from('sac_digital_messages').select('*').eq('organization_id',organizationId).eq('id',row.id).maybeSingle();
      const evidence=providerDelivery(apiBody);
      const patch:any={raw_metadata:{...(current?.raw_metadata || row.raw_metadata),api_response:apiBody,delivery_status:result.success ? evidence.state : result.outcome==='unknown' ? 'unknown' : 'rejected',submission_finished_at:new Date().toISOString()}};
      if(evidence.externalMessageId && !current?.external_message_id) patch.external_message_id=evidence.externalMessageId;
      let saved=await admin.from('sac_digital_messages').update(patch).eq('organization_id',organizationId).eq('id',row.id).select('*').maybeSingle();
      if(saved.error?.code==='23505' && evidence.externalMessageId) {
        const canonical=await admin.from('sac_digital_messages').select('*').eq('organization_id',organizationId).eq('protocol_id',row.protocol_id).eq('external_message_id',evidence.externalMessageId).maybeSingle();
        if(canonical.data) {
          saved=await admin.from('sac_digital_messages').update({sender_id:row.sender_id,sender_name:row.sender_name,raw_metadata:{...patch.raw_metadata,...canonical.data.raw_metadata,client_request_id:row.raw_metadata.client_request_id}}).eq('id',canonical.data.id).eq('organization_id',organizationId).select('*').single();
          if(!saved.error) await admin.from('sac_digital_messages').delete().eq('id',row.id).eq('organization_id',organizationId);
        }
      }
      if(result.success) await admin.from('sac_digital_protocols').update({last_message_at:row.sent_at,updated_at:new Date().toISOString()}).eq('organization_id',organizationId).eq('id',row.protocol_id);
      return saved.data || {...row,...patch};
    };
    const sendLocalSubmission = async (submission:any,endpoint:number,values:Record<string,unknown>,intent?:string) => {
      let result:any;
      try {result=await runResourceOperation(endpoint,values,intent);}
      catch(error) {result={success:false,outcome:(error as any)?.outcome || 'unknown',type:(error as any)?.code || 'send_outcome_unverified',error:error instanceof Error ? error.message : 'Não foi possível confirmar o envio.'};}
      let settled:any;
      try {settled=await finishLocalSubmission(submission.row,result,result.data || {});}
      catch {settled={...submission.row,raw_metadata:{...submission.row.raw_metadata,api_response:result.data || {},delivery_status:result.success ? providerDelivery(result.data || {}).state : result.outcome==='unknown' ? 'unknown' : 'rejected'}};}
      if(result.success || result.outcome==='unknown') EdgeRuntime.waitUntil(syncProtocolHistory(organizationId, String(values.protocol)).catch(()=>{}));
      return {result,settled};
    };
    const submissionResponse = (row:any,protocol:string) => {
      const state=row.raw_metadata?.delivery_status || 'unknown';
      const success=['accepted','queued','sent','delivered','read'].includes(state);
      return json({success,protocol,local_message_id:row.id,external_message_id:row.external_message_id || null,client_request_id:row.raw_metadata?.client_request_id,delivery_status:state,outcome:success ? state==='queued'?'queued':'accepted' : state==='rejected'?'rejected':'unknown',...(!success ? {error:state==='rejected'?'O envio foi recusado.':'Esta tentativa ainda aguarda confirmação. Não repita o envio.'}: {})},success ? 200 : state==='rejected'?409:502);
    };

    const loadSacOperators = async () => {
      const credentials = await loadCredentials(organizationId);
      if (!credentials.enabled) throw new Error("Integração SAC Digital está desativada.");
      const result = {response:new Response('{}'),body:{list:await paginatedSacList(organizationId,credentials,'/operator/all'),status:true}};
      if (!result.response.ok || result.body.status === false) {
        throw new Error("Não foi possível carregar os operadores da SAC Digital.");
      }
      const list = Array.isArray(result.body.list) ? result.body.list : [];
      return list
        .filter(item => item && typeof item === "object" && !Array.isArray(item))
        .map(item => {
          const row = item as Record<string, unknown>;
          return {
            id: String(row.id || "").trim(),
            name: String(row.name || "").trim(),
            email: String(row.email || "").trim(),
            online: row.online === true,
          };
        })
        .filter(item => item.id && item.name);
    };

    const resolveMySacAccessBinding = async () => {
      const { data: linked, error: linkedError } = await admin
        .from("sac_digital_operator_links")
        .select("access_mode,external_operator_id,operator_name,updated_at")
        .eq("organization_id", organizationId)
        .eq("user_id", userData.user.id)
        .maybeSingle();

      if (linkedError) throw Object.assign(new Error("Não foi possível consultar o perfil SAC vinculado."),{code:'operator_session_unavailable'});
      if (!linked) return null;

      const accessMode = linked.access_mode === "manager" ? "manager" : "operator";
      return {
        accessMode,
        id: accessMode === "operator" ? String(linked.external_operator_id || "") : "",
        name: accessMode === "operator" ? String(linked.operator_name || "") : "Gestor SAC",
        version: String(linked.updated_at || ""),
      };
    };

    const resolveMyOperatorBinding = async () => {
      const linked = await resolveMySacAccessBinding();
      if (!linked || linked.accessMode !== "operator" || !linked.id) return null;
      return linked;
    };

    const authenticateSacOperator = async (credentials: { clientId: string; clientSecret: string },operatorId: string,_scopes: string[]) => {
      const binding=await resolveMyOperatorBinding();
      if(!binding || binding.id!==operatorId) throw Object.assign(new Error('Vincule seu perfil de Operador nas configurações SAC.'),{code:'operator_authorization_required'});
      const token=await authorizedOperatorToken(admin,{organizationId,userId:userData.user.id,operatorId,bindingVersion:binding.version},credentials);
      if(operatorTokenError(token)) throw Object.assign(new Error('Clique em Autorizar Operador para conectar sua conta SAC.'),{code:'operator_authorization_required'});
      // This Vault grant was saved only after the callback verified the
      // provider profile. The getter rechecks this user's active membership,
      // Operator binding/version, Client and enabled integration on every call.
      // SAC still validates this same Bearer for selection and the operation.
      return {token};
    };

    if(action === 'begin_operator_authorization') {
      if(!(await requirePermission('sac_digital.messages.view')) && !(await requirePermission('sac_digital.view'))) return json({success:false,error:'Sem permissão para acessar o SAC Digital.'},403);
      const binding=await resolveMyOperatorBinding();
      if(!binding) return json({success:false,error:'Vincule seu perfil de Operador em Configurações > SAC Digital > Operadores.'},409);
      const credentials=await loadCredentials(organizationId);
      if(!credentials.enabled) return json({success:false,error:'Integração SAC desativada.'},409);
      const target=returnPath(body.return_path);
      const state=[...crypto.getRandomValues(new Uint8Array(32))].map(byte=>byte.toString(16).padStart(2,'0')).join('');
      // Starting again invalidates this user's previous pending links, not other users.
      const cleared=await admin.from('sac_digital_oauth_states').delete().eq('organization_id',organizationId).eq('user_id',userData.user.id);
      if(cleared.error) throw new Error('Não foi possível preparar a autorização SAC.');
      const inserted=await admin.from('sac_digital_oauth_states').insert({state_hash:await stateHash(state),organization_id:organizationId,user_id:userData.user.id,operator_id:binding.id,binding_version:binding.version,client_id:credentials.clientId,return_path:target});
      if(inserted.error) throw new Error('Não foi possível iniciar a autorização SAC.');
      return json({success:true,url:authorizationUrl(credentials.clientId,state)});
    }

    const recordConfirmedOperation = async (protocol:string,patch:Record<string,unknown>) => {
      const {error}=await admin.from('sac_digital_protocols').update({...patch,updated_at:new Date().toISOString()}).eq('organization_id',organizationId).eq('external_protocol_id',protocol);
      if(error) console.warn('[SAC DIGITAL API] confirmed operation projection deferred',{code:error.code});
      EdgeRuntime.waitUntil(enrichProtocol(organizationId,protocol).catch(()=>{}));
    };
    const runResourceOperation = async (endpointId: number, values: Record<string, unknown>, intentKey?: string, options: {protocolInfo?:Record<string,unknown>;returnToCurrentDepartment?:boolean;routingOptions?:boolean} = {}) => {
      const requested=SAC_ENDPOINTS.find(item=>item.id===endpointId);
      if(!requested) return {success:false,data:null,has_more:false,next_page:null,outcome:'rejected',type:'invalid_contract',error:'Operação desconhecida.'};
      const permission=operationPermission(requested);
      if(!(await requirePermission(permission)) && !(permission==='sac_digital.messages.view' && await requirePermission('sac_digital.view'))) return {success:false,data:null,has_more:false,next_page:null,outcome:'rejected',type:'permission_denied',error:'Sem permissão para esta operação.'};
      if([1,61].includes(endpointId)) return {success:false,data:null,outcome:'rejected',has_more:false,next_page:null,type:'private_authentication',error:'A autenticação é privada e resolvida pelo servidor.'};
      let operation: any;
      let protocolInfo: Record<string, unknown> | null = options.protocolInfo || null;
      const credentials = await loadCredentials(organizationId);
      if(!credentials.enabled) throw new Error('Integração SAC Digital está desativada.');
      if([36,37,38].includes(endpointId)) {
        const permission=endpointId === 36 ? 'sac_digital.messages.send' : 'sac_digital.protocols.manage';
        if(!await requirePermission(permission)) return {success:false,data:null,outcome:'rejected',has_more:false,next_page:null,type:'permission_denied',error:'Sem permissão para esta operação.'};
        if(!validProtocol(values.protocol)) return {success:false,data:null,outcome:'rejected',has_more:false,next_page:null,type:'invalid_contract',error:'Protocolo inválido.'};
        const check=protocolInfo ? {response:new Response('{}'),body:{status:true,info:protocolInfo}} : await apiRequest(organizationId,credentials,`/protocol/info?protocol=${encodeURIComponent(String(values.protocol))}`,{method:'GET'});
        if(!check.response.ok || check.body.status === false || !check.body.info || typeof check.body.info !== 'object' || Array.isArray(check.body.info)) return {success:false,data:null,outcome:'rejected',has_more:false,next_page:null,type:'protocol_state_unverified',error:'Não foi possível confirmar o estado externo do protocolo.'};
        protocolInfo = check.body.info as Record<string, unknown>;
        try { const routed=routeProtocolOperation(endpointId,values,protocolInfo);endpointId=routed.endpointId;values=routed.values; }
        catch(error) {return {success:false,data:null,outcome:'rejected',has_more:false,next_page:null,type:'protocol_state_conflict',error:error instanceof Error ? error.message : 'Estado incompatível.'};}
      }
      if([73,78,90,92].includes(endpointId) && !protocolInfo) {
        const state=await apiRequest(organizationId,credentials,`/protocol/info?protocol=${encodeURIComponent(String(values.protocol || ''))}`,{method:'GET'});
        if(!state.response.ok || state.body.status === false || !state.body.info || typeof state.body.info !== 'object' || Array.isArray(state.body.info)) return {success:false,data:null,outcome:'rejected',has_more:false,next_page:null,type:'protocol_state_unverified',error:'Não foi possível confirmar o estado externo do protocolo.'};
        protocolInfo=state.body.info as Record<string,unknown>;
        if(protocolInfo.is_open !== true || protocolInfo.closed_at || protocolInfo.finished_at) return {success:false,data:null,outcome:'rejected',has_more:false,next_page:null,type:'protocol_finished',error:'Este atendimento não está aberto na SAC Digital.'};
        if(protocolInfo.is_att !== true) return {success:false,data:null,outcome:'rejected',has_more:false,next_page:null,type:'protocol_state_conflict',error:'Este protocolo não é um atendimento operacional.'};
      }
      try { operation = buildSacRequest(endpointId, values); }
      catch(error) { return {success:false,data:null,outcome:'rejected',has_more:false,next_page:null,type:'invalid_contract',error:error instanceof Error ? error.message : 'Contrato inválido.'}; }
      if([10,40].includes(endpointId)) {
        const channels=await apiRequest(organizationId,credentials,'/channel/all',{method:'GET'});
        if(!channels.response.ok || channels.body.status === false || !Array.isArray(channels.body.list)) return {success:false,data:null,outcome:'rejected',has_more:false,next_page:null,type:'channel_unavailable',error:'Não foi possível confirmar o canal.'};
        const channel:any=channels.body.list.find((item:any)=>String(item.id) === String(values.channel));
        const capabilityError=channelCapabilityError(channel,values);
        if(capabilityError) return {success:false,data:null,outcome:'rejected',has_more:false,next_page:null,type:'channel_capability_unverified',error:capabilityError};
      }
      const binding = operation.mode === 'operator' ? await resolveMyOperatorBinding() : null;
      if (operation.mode === 'operator' && binding && protocolInfo) {
        const assigned = protocolInfo.operator && typeof protocolInfo.operator === 'object'
          ? protocolInfo.operator as Record<string,unknown> : {};
        const assignedId = String(assigned.id || protocolInfo.operator_id || '').trim();
        if(assignedId && assignedId !== binding.id) return {success:false,data:null,outcome:'rejected',has_more:false,next_page:null,type:'protocol_owned_by_other_operator',error:'Este atendimento pertence a outro Operador SAC.'};
      }
      const ownerId = crypto.randomUUID();
      let operatorToken = '';
      let selectedDepartmentId: string | null = null;
      const refreshOperatorSession = async () => {
        if(!binding)throw new Error('Operador SAC não vinculado.');
        const scopes = operatorScopes(operation.scopes,Boolean(values.protocol) && !/\/select\//.test(operation.path));
        const session = await authenticateSacOperator(credentials,binding.id,scopes);
        operatorToken=session.token;
      };
      const result: Awaited<ReturnType<typeof executeSacOperation>> & { pending_start_id?: string; mode?: string } = await executeSacOperation({...operation, protocol: values.protocol}, {
        authorize: async (permission:string) => await requirePermission(permission) || (permission === 'sac_digital.messages.view' && await requirePermission('sac_digital.view')),
        operator: binding ? async () => {
          await refreshOperatorSession();
        } : null,
        lease: async () => {
          const {data,error} = await admin.rpc('sac_digital_acquire_operator_lease',{p_organization_id:organizationId,p_operator_id:binding!.id,p_owner_id:ownerId});
          if(error) throw new Error('Não foi possível reservar a sessão operacional.');return data === true;
        },
        release: async () => {await admin.rpc('sac_digital_release_operator_lease',{p_organization_id:organizationId,p_operator_id:binding!.id,p_owner_id:ownerId});},
        begin: async () => {
          const key = intentKey || crypto.randomUUID();
          const {data,error} = await admin.from('sac_digital_delivery_attempts').insert({organization_id:organizationId,user_id:userData.user.id,intent_key:key,endpoint_path:operation.path.split('?')[0],protocol:values.protocol || null,mode:operation.mode}).select('id,state').single();
          if(error?.code === '23505') {
            const previous = await admin.from('sac_digital_delivery_attempts').select('id,state').eq('organization_id',organizationId).eq('intent_key',key).single();
            if(previous.error) throw previous.error;return {...previous.data,created:false};
          }
          if(error) throw error;return {...data,created:true};
        },
        record: async (id: string,state: string,response: Record<string,unknown>) => {
          const {error} = await admin.from('sac_digital_delivery_attempts').update({state,message_id:response.message_id || (!operation.path.includes('/notification/') ? response.id : null) || null,notification_id:response.notification_id || null,request_id:response.request_id || null,error_type:response.type || null,updated_at:new Date().toISOString()}).eq('id',id);
          if(error) throw error;
        },
        prepare: options.returnToCurrentDepartment ? async (op:any) => {
          const current=await fetchJson(`https://api.sac.digital/v2/operator/att/info/${encodeURIComponent(String(values.protocol))}`,{method:'GET',headers:{Authorization:`Bearer ${operatorToken}`,Accept:'application/json'}});
          const info:any=current.body.info;
          const department=String(info?.department?.id || '').trim();
          if(!responseEnvelope(current.body,current.response.status).success || !department) return {success:false,data:null,outcome:'rejected',has_more:false,next_page:null,type:'department_not_confirmed',error:'A SAC não confirmou o departamento operacional atual. Nenhum encaminhamento foi enviado.'};
          selectedDepartmentId=department;
          return {...op,body:{to:'department',department}};
        } : undefined,
        transport: async (op: any) => {
          if(op.mode === 'client') {
            // Scope-specific cache isolation prevents a broader cached session replacing minimum scopes.
            const session = await login(organizationId,credentials,false,op.scopes || []);
            return fetchJson(`https://api.sac.digital/v2${op.path}`,{method:op.method,headers:{Authorization:`Bearer ${session.token}`,Accept:'application/json',...(op.body ? {'Content-Type':'application/json'}:{})},...(op.body ? {body:JSON.stringify(op.body)}:{})});
          }
          if(options.routingOptions && op.path === operation.path) {
            const paths=[op.path,`/operator/att/departments/${encodeURIComponent(String(values.protocol))}/all`];
            const [operators,departments]=await Promise.all(paths.map(path=>fetchJson(`https://api.sac.digital/v2${path}`,{method:'GET',headers:{Authorization:`Bearer ${operatorToken}`,Accept:'application/json'}})));
            if(!responseEnvelope(operators.body,operators.response.status).success) return operators;
            const departmentAccess=responseEnvelope(departments.body,departments.response.status).success;
            return {...operators,body:{...operators.body,departments:departmentAccess ? departments.body.list : [],department_authorization_required:!departmentAccess && departments.body.type==='permission_route'}};
          }
          // One authorized identity for select + mutation. Never renew and replay a
          // mutation after auth failure: renewal loses the selected protocol.
          return fetchJson(`https://api.sac.digital/v2${op.path}`, {
            method:op.method,
            headers:{Authorization:`Bearer ${operatorToken}`,Accept:'application/json','Content-Type':'application/json'},
            ...(op.body ? {body:JSON.stringify(op.body)} : {}),
          });
        },
      });
      if(result.success && selectedDepartmentId) Object.assign(result,{department_id:selectedDepartmentId});
      if(operation.mode === 'operator' && !result.success && String(result.type || '').toLowerCase() === 'invalid_auth') {
        result.type='operator_session_rejected';
        result.error='A SAC Digital recusou a sessão operacional deste atendimento. A Union autenticou o Operador, mas a operação foi recusada pela SAC Digital.';
      }
      if(operation.method === 'GET') Object.assign(result,parsePagination(result.data || {},Number(values.p)||1));
      if([39,40].includes(endpointId) && (result.success || result.outcome === 'unknown')) {
        const phone=normalizeSacPhone(values.number);
        const externalId=String(result.data?.contact_id || values.contact || `pending:${phone}`);
        let localContact:any;
        const lookup=await admin.from('sac_digital_contacts').select('id').eq('organization_id',organizationId).eq('external_contact_id',externalId).maybeSingle();
        localContact=lookup.data;
        if(!localContact && phone) {
          const inserted=await admin.from('sac_digital_contacts').upsert({organization_id:organizationId,external_contact_id:externalId,name:values.name || phone,phone,raw_metadata:{pending_notification:true}},{onConflict:'organization_id,external_contact_id'}).select('id').single();
          if(inserted.error) throw new Error('O resultado externo foi registrado; o contato pendente não pôde ser exibido. Não repita o envio.');localContact=inserted.data;
        }
        if(localContact?.id) {
          const pending=await admin.from('sac_digital_outbound_starts').upsert({organization_id:organizationId,contact_id:localContact.id,external_contact_id:externalId,message_text:String(values.text || `Template: ${values.template || ''}`).slice(0,5000),sender_id:userData.user.id,sent_at:new Date().toISOString(),updated_at:new Date().toISOString(),notification_id:result.data?.notification_id || null,delivery_state:result.outcome},{onConflict:'organization_id,external_contact_id'}).select('id').single();
          if(!pending.error) result.pending_start_id=pending.data.id;
        }
        result.mode='notification';
      }
      return result;
    };

    resourceDispatch = async (path,init) => {
      const parsed = new URL(`https://api.sac.digital/v2/client${path}`);
      const values:any = {...Object.fromEntries(parsed.searchParams),...(init.body ? JSON.parse(String(init.body)) : {})};
      let endpoint = SAC_ENDPOINTS.find((item:any)=>item.path.split('?')[0] === `/client${path.split('?')[0]}` && item.method === init.method);
      if(values.protocol && ['/protocol/send','/protocol/finish','/protocol/to_inbox'].includes(path.split('?')[0])) {
        const check = await apiRequest(organizationId,await loadCredentials(organizationId),`/protocol/info?protocol=${encodeURIComponent(values.protocol)}`,{method:'GET'});
        if(!check.response.ok || check.body.status === false || !check.body.info) throw new Error('Não foi possível confirmar o estado externo do protocolo.');
        const info:any = check.body.info;
        if(info.is_closed || info.finished_at || info.closed_at) throw new Error('Protocolo encerrado. Inicie um novo atendimento.');
        if(info.is_att === true) {
          if(path.split('?')[0] === '/protocol/to_inbox') throw new Error('Atendimento operacional não pode ser devolvido pelo contrato de autoatendimento.');
          endpoint = SAC_ENDPOINTS.find((item:any)=>item.id === (path.split('?')[0] === '/protocol/send' ? 78 : 92));
          if(values.url && values.text) {values.caption=values.text;delete values.text;}
          delete values.notify_contact;
          if(endpoint?.id === 92 && values.vote == null) throw new Error('A finalização operacional requer votação conforme contrato da SAC Digital.');
        }
      }
      // New-contact routing remains Client; active attendance forwarding uses
      // the dedicated Operator action and never passes through this dispatcher.
      if(!endpoint) throw new Error('Contrato de operação não identificado.');
      const result = await runResourceOperation(endpoint.id,values,typeof body.intent_key === 'string' ? `${userData.user.id}:${body.intent_key.slice(0,160)}` : undefined);
      if(result.outcome === 'unknown') {const error:any=new Error(result.error);error.outcome='unknown';error.type=result.type;throw error;}
      return {response:new Response(JSON.stringify(result.data || {}),{status:result.success ? 200 : 409}),body:result.success ? result.data : {status:false,success:false,message:result.error,type:result.type,outcome:result.outcome},raw:''};
    };
    if(action === 'media_urls') {
      if(!(await requirePermission('sac_digital.messages.view'))) return json({success:false,error:'Sem permissão para visualizar mensagens.'},403);
      const ids=body.message_ids;
      if(!Array.isArray(ids) || ids.length>50 || ids.some(id=>!isUuid(id))) return json({success:false,error:'Informe até 50 identificadores válidos de mensagem.'},400);
      if(!ids.length) return json({success:true,urls:{}});
      const selected=await admin.from('sac_digital_messages').select('id,media_url,raw_metadata').eq('organization_id',organizationId).in('id',[...new Set(ids)]);
      if(selected.error) throw new Error('Não foi possível consultar os anexos desta empresa.');
      const urls:Record<string,string>={};
      for(const message of selected.data || []) {
        const path=ownMediaStoragePath(message,organizationId);
        if(!path) continue;
        const signed=await admin.storage.from(SAC_OUTBOX_BUCKET).createSignedUrl(path,3600);
        if(signed.error || !signed.data?.signedUrl) continue;
        urls[String(message.id)]=signed.data.signedUrl;
      }
      return json({success:true,urls});
    }
    if(action === 'delivery_history' || action === 'sms_replies') {
      if(!(await requirePermission('sac_digital.messages.view'))) return json({success:false,error:'Sem permissão para visualizar registros.'},403);
      const page=Number(body.page || 1);
      if(!Number.isInteger(page)||page<1||page>100000) return json({success:false,error:'Página inválida.'},400);
      const deliveries=action==='delivery_history';
      const {data,error,count}=await admin.from(deliveries?'sac_digital_delivery_attempts':'sac_digital_sms_replies')
        .select(deliveries?'id,protocol,mode,state,message_id,notification_id,error_type,created_at,updated_at':'source_event_hash,payload,received_at',{count:'exact'})
        .eq('organization_id',organizationId).order(deliveries?'created_at':'received_at',{ascending:false}).range((page-1)*50,page*50-1);
      if(error) throw error;
      const more=(count || 0)>page*50;
      return json({success:true,data:{list:data || []},outcome:'accepted',has_more:more,next_page:more?page+1:null});
    }
    if(action === 'health' || action === 'resource_health') {
      if(!(await requirePermission('sac_digital.settings.manage'))) return json({success:false,error:'Sem permissão.'},403);
      const {data,error}=await admin.rpc('sac_digital_jobs_health',{p_organization_id:organizationId});
      if(error) throw error;return json({success:true,data,outcome:'accepted',has_more:false,next_page:null});
    }
    if(action === 'reconcile_outbound') {
      if(!(await requirePermission('sac_digital.messages.view'))) return json({success:false,error:'Sem permissão.'},403);
      const pending=await admin.from('sac_digital_delivery_attempts').select('id,notification_id,state,protocol').eq('organization_id',organizationId).in('state',['accepted','queued','unknown','sent','delivered']).order('checked_at',{nullsFirst:true}).limit(5);
      if(pending.error) throw pending.error;
      let reconciled=0;
      for(const attempt of pending.data || []) {
        await admin.from('sac_digital_delivery_attempts').update({checked_at:new Date().toISOString()}).eq('id',attempt.id);
        if(attempt.notification_id) {
          const status=await apiRequest(organizationId,await loadCredentials(organizationId),`/notification/status?id=${encodeURIComponent(attempt.notification_id)}`,{method:'GET'});
          if(!status.response.ok || status.body.status === false || status.body.success === false) continue;
          const evidence:any=status.body.info || status.body;
          const next=evidence.readed_at || evidence.read_at ? 'read' : evidence.delivered_at ? 'delivered' : evidence.sended_at || evidence.sent_at ? 'sent' : evidence.failed_at ? 'rejected' : null;
          const rank:any={unknown:0,accepted:0,queued:1,sent:2,delivered:3,read:4};
          if(next && (next === 'rejected' ? rank[attempt.state]<3 : rank[next]>=rank[attempt.state])) {
            await admin.from('sac_digital_delivery_attempts').update({state:next,updated_at:new Date().toISOString()}).eq('id',attempt.id);
            await admin.from('sac_digital_outbound_starts').update({delivery_state:next,updated_at:new Date().toISOString()}).eq('organization_id',organizationId).eq('notification_id',attempt.notification_id);
            reconciled++;
          }
        }
        if(attempt.protocol) await syncProtocolHistory(organizationId,attempt.protocol);
      }
      return json({success:true,data:{reconciled},outcome:'accepted',has_more:(pending.data || []).length === 5,next_page:null});
    }
    if(action === 'process_jobs') {
      if(!(await requirePermission('sac_digital.messages.view'))) return json({success:false,error:'Sem permissão.'},403);
      const result=await fetchJson(`${supabaseUrl}/functions/v1/sac-digital-worker`,{method:'POST',headers:{Authorization:`Bearer ${serviceRoleKey}`,'Content-Type':'application/json'},body:JSON.stringify({organization_id:organizationId,limit:3})},20000);
      return json({success:result.response.ok && result.body.success !== false,data:result.body,outcome:'accepted',has_more:false,next_page:null});
    }
    if(action === 'resource_operation') {
      if([1,61].includes(Number(body.endpoint_id))) return json({success:false,error:'A autenticação é privada e resolvida pelo servidor.'},400);
      if(!Number.isInteger(body.endpoint_id) || !body.values || typeof body.values !== 'object' || Array.isArray(body.values)) return json({success:false,error:'Recurso e campos inválidos.'},400);

      return json(await runResourceOperation(Number(body.endpoint_id),body.values as Record<string,unknown>,typeof body.intent_key === 'string' ? `${userData.user.id}:${body.intent_key.slice(0,160)}` : undefined));
    }
    if(action === 'sync_resource' || action === 'bootstrap') {
      if(!(await requirePermission('sac_digital.messages.view'))) return json({success:false,error:'Sem permissão para sincronizar.'},403);

      // O bootstrap histórico é complementar ao webhook/worker. Várias abas ou
      // usuários não podem importar a mesma empresa em paralelo e competir com
      // o CRM por CPU/IO. O sync_resource manual continua sem cooldown.
      if(action === 'bootstrap') {
        const claim = await admin.rpc('claim_sac_digital_bootstrap', {
          p_organization_id: organizationId,
          p_cooldown_seconds: 900,
        });
        if(claim.error) throw claim.error;
        if(claim.data !== true) {
          return json({
            success:true,
            data:[],
            outcome:'accepted',
            has_more:true,
            next_page:null,
            skipped:true,
            reason:'bootstrap_cooldown',
            retry_after_seconds:900,
          });
        }
      }

      const resources = action === 'bootstrap' ? SAC_ENDPOINTS.filter((item:any)=>item.method === 'GET' && /\/(contact|protocol)\/all(?:\?|$)/.test(item.path)) : SAC_ENDPOINTS.filter((item:any)=>item.id === Number(body.endpoint_id) && item.method === 'GET');
      if(!resources.length) return json({success:false,error:'Recurso de sincronização inválido.'},400);
      const pages=[];
      for(const resource of resources.slice(0,2)) {
        const cursor = await admin.from('sac_digital_sync_cursors').select('next_page,complete').eq('organization_id',organizationId).eq('resource',String(resource.id)).maybeSingle();
        if(cursor.error) throw cursor.error;
        const page = body.restart === true || cursor.data?.complete ? 1 : cursor.data?.next_page || 1;
        const result = await runResourceOperation(resource.id,{p:page});
        if(!result.success) return json(result);
        const rows = Array.isArray(result.data?.list) ? result.data.list : [];
        for(const row of rows) {
          if(!row || typeof row !== 'object') continue;
          if(resource.path.includes('/contact/all')) {
            const id=String(row.id || '');if(!id) continue;
            const {error}=await admin.from('sac_digital_contacts').upsert({organization_id:organizationId,external_contact_id:id,name:row.name || null,phone:normalizeSacPhone(row.number),raw_metadata:row,updated_at:new Date().toISOString()},{onConflict:'organization_id,external_contact_id'});if(error) throw error;
          } else {
            const protocol=String(row.protocol || row.id || '');if(!validProtocol(protocol)) continue;
            const existing=await admin.from('sac_digital_protocols').select('status,closed_at').eq('organization_id',organizationId).eq('external_protocol_id',protocol).maybeSingle();
            if(existing.error) throw existing.error;
            if(existing.data?.status === 'finished' || existing.data?.closed_at) continue;
            const {error}=await admin.rpc('apply_sac_digital_protocol_info',{p_organization_id:organizationId,p_protocol:protocol,p_payload:{info:row}});if(error) throw error;
          }
        }
        const {error}=await admin.from('sac_digital_sync_cursors').upsert({organization_id:organizationId,resource:String(resource.id),next_page:result.has_more ? Number(result.next_page || page+1) : page,complete:!result.has_more,updated_at:new Date().toISOString()});
        if(error) throw error;
        pages.push({endpoint_id:resource.id,page,...result});
      }
      return json({success:true,data:pages,outcome:'accepted',has_more:pages.some(item=>item.has_more),next_page:null});
    }
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

    if (action === "retry_webhook_event") {
      if (!(await requirePermission("sac_digital.settings.manage"))) {
        return json({ success: false, error: "Sem permissão para reprocessar webhooks do SAC Digital." }, 403);
      }

      const eventId = String(body.event_id || "").trim();
      if (!/^[1-9][0-9]{0,17}$/.test(eventId)) {
        return json({ success: false, error: "Identificador de evento inválido." }, 400);
      }
      const { data: event, error: eventError } = await admin
        .from("sac_digital_webhook_events")
        .select("id,event_type,processed_at,processing_error,payload")
        .eq("organization_id", organizationId)
        .eq("id", eventId)
        .maybeSingle();
      if (eventError || !event) {
        return json({ success: false, error: "Evento não encontrado nesta empresa." }, 404);
      }
      if (event.processed_at && !event.processing_error) {
        return json({ success: true, already_processed: true });
      }
      if (!event.payload || typeof event.payload !== "object"
        || Array.isArray(event.payload) || Object.keys(event.payload).length === 0) {
        return json({ success: false, error: "Este evento não possui mais payload para reprocessamento." }, 409);
      }

      const { error: projectionError } = await admin.rpc("project_sac_digital_webhook_event", {
        p_event_id: eventId,
      });
      if (projectionError) {
        const safeCode = String(projectionError.code || "UNKNOWN").slice(0, 32);
        const { error: persistError } = await admin.from("sac_digital_webhook_events")
          .update({ processing_error: `Falha de projeção (código ${safeCode})` })
          .eq("id", eventId)
          .eq("organization_id", organizationId)
          .is("processed_at", null);
        if (persistError) {
          console.warn("[SAC DIGITAL API] retry error persistence failed", persistError.code);
        }
        return json({
          success: false,
          error: "O evento ainda não pôde ser processado. Confira o diagnóstico do webhook.",
        }, 409);
      }

      await writeSacAudit({
        action: "sac_digital.webhook.reprocess",
        operation: "update",
        entityType: "sac_digital_webhook_event",
        entityId: eventId,
        metadata: { event_type: String(event.event_type || "unknown") },
      });

      const { count: failedCount, error: countError } = await admin
        .from("sac_digital_webhook_events")
        .select("id", { head: true, count: "exact" })
        .eq("organization_id", organizationId)
        .not("processing_error", "is", null);
      if (!countError && failedCount === 0) {
        await admin.from("sac_digital_integrations")
          .update({ connection_status: "receiving", last_error: null, updated_at: new Date().toISOString() })
          .eq("organization_id", organizationId);
      }
      return json({ success: true, reprocessed: true });
    }

    if (action === "refresh_protocol") {
      if (!(await requirePermission("sac_digital.messages.view"))) {
        return json({ success: false, error: "Sem permissão para visualizar conversas do SAC Digital." }, 403);
      }
      const protocol = String(body.protocol || "").trim();
      if (!validProtocol(protocol)) return json({ success: false, error: "Protocolo inválido." }, 400);
      const applied = await enrichProtocol(organizationId, protocol);
      const history = await syncProtocolHistory(organizationId, protocol);
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

    if (action === "link_customer") {
      if (!(await requirePermission("sac_digital.messages.view"))) {
        return json({ success: false, error: "Sem permissão para visualizar conversas do SAC Digital." }, 403);
      }
      if (!(await hasOrganizationPermission("customers.view"))) {
        return json({ success: false, error: "Sem permissão para acessar clientes desta empresa." }, 403);
      }

      const contactId = String(body.contact_id || "").trim();
      const customerId = String(body.customer_id || "").trim();
      if (!isUuid(contactId)) return json({ success: false, error: "Contato SAC inválido." }, 400);
      if (!isUuid(customerId)) return json({ success: false, error: "Cliente inválido." }, 400);

      const { data: contact, error: contactError } = await admin
        .from("sac_digital_contacts")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("id", contactId)
        .maybeSingle();
      if (contactError || !contact?.id) {
        return json({ success: false, error: "Contato SAC não encontrado nesta empresa." }, 404);
      }

      const { data: customer, error: customerError } = await admin
        .from("customers")
        .select("id,full_name,trade_name,legal_name,phone,whatsapp")
        .eq("organization_id", organizationId)
        .eq("id", customerId)
        .maybeSingle();
      if (customerError || !customer?.id) {
        return json({ success: false, error: "Cliente não encontrado nesta empresa." }, 404);
      }

      const { error: updateError } = await admin
        .from("sac_digital_contacts")
        .update({
          customer_id: customer.id,
          updated_at: new Date().toISOString(),
        })
        .eq("organization_id", organizationId)
        .eq("id", contactId);
      if (updateError) throw new Error("Não foi possível vincular o cliente ao contato SAC.");

      await writeSacAudit({
        action: "sac_digital.contact.link_customer",
        operation: "link",
        entityType: "sac_digital_contact",
        entityId: contactId,
        contextType: "customer",
        contextId: customerId,
        metadata: { source: "sac_inbox" },
        changedFields: { customer_id: customerId },
      });

      return json({
        success: true,
        customer: {
          id: String(customer.id),
          name: String(customer.trade_name || customer.full_name || customer.legal_name || "Cliente"),
          phone: String(customer.whatsapp || customer.phone || ""),
        },
      });
    }

    if (action === "new_conversation_search") {
      if (!(await requirePermission("sac_digital.messages.send"))) {
        return json({ success: false, error: "Sem permissão para iniciar conversas pelo SAC Digital." }, 403);
      }

      const search = safeSearchText(body.search);
      const searchDigits = String(body.search || "").replace(/\D/g, "");
      const apiSearch = searchDigits.length >= 6 ? normalizeSacPhone(searchDigits) : search;
      if (search.length < 2 && apiSearch.length < 6) {
        return json({ success: true, contacts: [], customers: [] });
      }

      const credentials = await loadCredentials(organizationId);
      if (!credentials.enabled) {
        return json({ success: false, error: "Integração SAC Digital está desativada." }, 400);
      }

      const searchPhones = searchDigits.length >= 6 ? sacPhoneVariants(apiSearch) : [apiSearch];
      const [contactResults, channelsResult] = await Promise.all([
        Promise.all(searchPhones.map(candidate => apiRequest(
          organizationId,
          credentials,
          `/contact/search?p=1&filter=1&search=${encodeURIComponent(candidate)}`,
          { method: "GET" },
        ))),
        apiRequest(organizationId, credentials, "/channel/all", { method: "GET" }),
      ]);

      if (contactResults.every(result => !result.response.ok || result.body.status === false)) {
        return json({ success: false, error: "Não foi possível pesquisar os contatos da SAC Digital." });
      }

      const activeChannelIds = new Set(
        (Array.isArray(channelsResult.body.list) ? channelsResult.body.list : [])
          .filter(item => item && typeof item === "object" && !Array.isArray(item))
          .filter(item => (item as Record<string, unknown>).actived !== false)
          .map(item => String((item as Record<string, unknown>).id || "").trim())
          .filter(Boolean),
      );

      const seenSacContactIds = new Set<string>();
      const sacRows = contactResults
        .filter(result => result.response.ok && result.body.status !== false)
        .flatMap(result => Array.isArray(result.body.list) ? result.body.list : [])
        .filter(item => item && typeof item === "object" && !Array.isArray(item))
        .map(item => item as Record<string, unknown>)
        .filter(item => {
          const id = String(item.id || "");
          if (!id || seenSacContactIds.has(id)) return false;
          seenSacContactIds.add(id);
          return true;
        })
        .slice(0, 20);

      const externalIds = sacRows.map(row => String(row.id || "").trim()).filter(Boolean);
      const { data: localContactRows } = externalIds.length
        ? await admin
            .from("sac_digital_contacts")
            .select("external_contact_id,customer_id")
            .eq("organization_id", organizationId)
            .in("external_contact_id", externalIds)
        : { data: [] as Array<{ external_contact_id: string; customer_id: string | null }> };

      const localContactByExternalId = new Map<string, Record<string, any>>(
        (localContactRows || []).map(row => [String(row.external_contact_id || ""), row]),
      );

      const contacts = sacRows
        .map(row => {
          const channel = row.channel && typeof row.channel === "object" && !Array.isArray(row.channel)
            ? row.channel as Record<string, unknown>
            : null;
          const externalId = String(row.id || "").trim();
          const channelId = String(channel?.id || "").trim();
          const local = localContactByExternalId.get(externalId);
          return {
            source: "sac",
            external_contact_id: externalId,
            customer_id: local?.customer_id || null,
            name: String(row.name || "").trim(),
            phone: normalizeSacPhone(row.number),
            channel_id: channelId || null,
            channel_number: normalizeSacPhone(channel?.number),
            whatsapp_available: Boolean(channelId && activeChannelIds.has(channelId)),
            blocked: row.blocked === true,
          };
        })
        .filter(contact => contact.external_contact_id && contact.phone);

      let customers: Array<Record<string, unknown>> = [];
      if (await hasOrganizationPermission("customers.view")) {
        const digits = String(search).replace(/\D/g, "");
        const safe = safeSearchText(search);
        let customerQuery = admin
          .from("customers")
          .select("id,customer_type,full_name,trade_name,legal_name,phone,whatsapp")
          .eq("organization_id", organizationId);

        if (digits.length >= 6) {
          const tail = digits.slice(-11);
          customerQuery = customerQuery.or(`phone.ilike.%${tail}%,whatsapp.ilike.%${tail}%`);
        } else {
          customerQuery = customerQuery.or(
            `full_name.ilike.%${safe}%,trade_name.ilike.%${safe}%,legal_name.ilike.%${safe}%`,
          );
        }

        const { data: customerRows, error: customerError } = await customerQuery.limit(20);
        if (!customerError) {
          const exactSacByPhone = new Map<string, typeof contacts[number]>();
          for (const contact of contacts) {
            for (const variant of sacPhoneVariants(contact.phone)) {
              const key = sacPhoneKey(variant);
              if (!exactSacByPhone.has(key)) exactSacByPhone.set(key, contact);
            }
          }
          customers = (customerRows || []).map(customer => {
            const phone = normalizeSacPhone(customer.whatsapp || customer.phone);
            const sacContact = exactSacByPhone.get(sacPhoneKey(phone));
            return {
              source: "customer",
              customer_id: String(customer.id),
              external_contact_id: sacContact?.external_contact_id || null,
              name: String(customer.trade_name || customer.full_name || customer.legal_name || "Cliente"),
              phone,
              whatsapp_available: sacContact?.whatsapp_available === true,
              customer_type: customer.customer_type || null,
            };
          }).filter(customer => Boolean(customer.phone));
        }
      }

      return json({
        success: true,
        contacts,
        customers,
      });
    }

    if (action === "prepare_new_conversation_contact") {
      if (!(await requirePermission("sac_digital.messages.send"))) {
        return json({ success: false, error: "Sem permissão para iniciar conversas pelo SAC Digital." }, 403);
      }

      const credentials = await loadCredentials(organizationId);
      if (!credentials.enabled) {
        return json({ success: false, error: "Integração SAC Digital está desativada." }, 400);
      }

      const requestedExternalId = String(body.external_contact_id || "").trim();
      const customerId = String(body.customer_id || "").trim();
      let name = safeSearchText(body.name);
      let phone = normalizeSacPhone(body.phone);

      if (customerId) {
        if (!isUuid(customerId)) return json({ success: false, error: "Cliente inválido." }, 400);
        if (!(await hasOrganizationPermission("customers.view"))) {
          return json({ success: false, error: "Sem permissão para acessar clientes desta empresa." }, 403);
        }

        const { data: customer, error: customerError } = await admin
          .from("customers")
          .select("id,full_name,trade_name,legal_name,phone,whatsapp")
          .eq("organization_id", organizationId)
          .eq("id", customerId)
          .maybeSingle();
        if (customerError || !customer?.id) {
          return json({ success: false, error: "Cliente não encontrado nesta empresa." }, 404);
        }

        name = name || String(customer.trade_name || customer.full_name || customer.legal_name || "Cliente").trim();
        phone = phone || normalizeSacPhone(customer.whatsapp || customer.phone);
      }

      if (phone && (phone.length < 10 || phone.length > 15)) {
        return json({
          success: true,
          prepared: false,
          whatsapp_available: false,
          error: "Número de telefone inválido.",
        });
      }

      const loadChannels = async () => {
        const result = await apiRequest(organizationId, credentials, "/channel/all", { method: "GET" });
        const list = Array.isArray(result.body.list)
          ? result.body.list.filter(item => item && typeof item === "object" && !Array.isArray(item)) as Record<string, unknown>[]
          : [];
        return list;
      };

      const channels = await loadChannels();
      const activeChannels = channels.filter(channel => channel.actived !== false && String(channel.id || "").trim());
      const primaryChannel = chooseImportChannel(activeChannels);
      const activeChannelIds = new Set(activeChannels.map(channel => String(channel.id || "").trim()));

      let contact: Record<string, unknown> | null = null;
      let imported = false;
      let importedPhone = phone;
      let importedChannelId: string | null = null;

      if (requestedExternalId) {
        const infoResult = await apiRequest(
          organizationId,
          credentials,
          `/contact/info?id=${encodeURIComponent(requestedExternalId)}`,
          { method: "GET" },
        );
        if (infoResult.response.ok && infoResult.body.status !== false && infoResult.body.info) {
          contact = infoResult.body.info as Record<string, unknown>;
          contact.id = requestedExternalId;
        }
      }

      if (!contact && phone) {
        for (const candidatePhone of sacPhoneVariants(phone)) {
          const searchResult = await apiRequest(
            organizationId,
            credentials,
            `/contact/search?p=1&filter=1&search=${encodeURIComponent(candidatePhone)}`,
            { method: "GET" },
          );
          const list = Array.isArray(searchResult.body.list)
            ? searchResult.body.list.filter(item => item && typeof item === "object" && !Array.isArray(item)) as Record<string, unknown>[]
            : [];
          contact = list.find(item => sacPhoneKey(item.number) === sacPhoneKey(candidatePhone)) || null;
          if (contact) break;
        }
      }

      if (!contact) {
        if (!phone) {
          return json({
            success: true,
            prepared: false,
            whatsapp_available: false,
            error: "Informe um número para iniciar a conversa.",
          });
        }

        const fallbackName = name || `Contato ${phone.slice(-4)}`;
        const importAttempt = await importSacContact(
          organizationId,
          credentials,
          phone,
          fallbackName,
          primaryChannel,
        );
        const importResult = importAttempt.result;

        if (!importResult) {
          if (importAttempt.failure) {
            return json({
              success: true,
              prepared: false,
              whatsapp_available: false,
              error: sacContactImportError(
                importAttempt.failure.body.message,
                "A SAC Digital não conseguiu preparar este número para uma nova conversa.",
              ),
            });
          }
          return json({
            success: true,
            prepared: false,
            whatsapp_available: false,
            error: "A SAC Digital não conseguiu preparar este número para uma nova conversa. O contato não precisa estar previamente cadastrado; confira a conexão do canal e tente novamente.",
          });
        }

        imported = true;
        importedPhone = importAttempt.phone;
        importedChannelId = importAttempt.channelId;

        const importedObject = importResult.body;
        const importedContact = importedObject.contact && typeof importedObject.contact === "object"
          ? importedObject.contact as Record<string, unknown>
          : null;
        const importedInfo = importedObject.info && typeof importedObject.info === "object"
          ? importedObject.info as Record<string, unknown>
          : null;
        const importedData = importedObject.data && typeof importedObject.data === "object"
          && !Array.isArray(importedObject.data)
          ? importedObject.data as Record<string, unknown>
          : null;
        const nestedDataContact = importedData?.contact && typeof importedData.contact === "object"
          && !Array.isArray(importedData.contact)
          ? importedData.contact as Record<string, unknown>
          : null;
        const importedId = String(
          importedContact?.id
          || importedInfo?.id
          || nestedDataContact?.id
          || importedData?.id
          || importedObject.id
          || importedObject.contact_id
          || "",
        ).trim();

        if (importedId) {
          const infoResult = await apiRequest(
            organizationId,
            credentials,
            `/contact/info?id=${encodeURIComponent(importedId)}`,
            { method: "GET" },
          );
          if (infoResult.response.ok && infoResult.body.status !== false && infoResult.body.info) {
            contact = infoResult.body.info as Record<string, unknown>;
            contact.id = importedId;
          } else {
            // A importação foi aceita e devolveu um ID. A busca pode demorar a indexar;
            // não exigir que o contato recém-criado apareça imediatamente na pesquisa.
            contact = {
              id: importedId,
              number: importedPhone,
              name: fallbackName,
              channel: importedChannelId
                ? { id: importedChannelId, number: String(primaryChannel?.number || "") }
                : null,
              imported: true,
            };
          }
        }

        if (!contact) {
          // A SAC pode confirmar a importação antes de indexar o contato na busca.
          // Reconciliar somente por leitura e não repetir importação/mensagem.
          for (let retry = 0; retry < 4 && !contact; retry += 1) {
            await new Promise(resolve => setTimeout(resolve, 300 * (retry + 1)));
            for (const candidatePhone of sacPhoneVariants(importedPhone)) {
              const searchResult = await apiRequest(
                organizationId,
                credentials,
                `/contact/search?p=1&filter=1&search=${encodeURIComponent(candidatePhone)}`,
                { method: "GET" },
              );
              const list = Array.isArray(searchResult.body.list)
                ? searchResult.body.list.filter(item => item && typeof item === "object" && !Array.isArray(item)) as Record<string, unknown>[]
                : [];
              contact = list.find(item => sacPhoneKey(item.number) === sacPhoneKey(candidatePhone)) || null;
              if (contact) break;
            }
          }
        }
      }

      const externalContactId = String(contact?.id || "").trim();
      const resolvedPhone = normalizeSacPhone(contact?.number || importedPhone || phone);
      const resolvedName = String(contact?.name || name || `Contato ${resolvedPhone.slice(-4)}`).trim();
      const channel = contact?.channel && typeof contact.channel === "object" && !Array.isArray(contact.channel)
        ? contact.channel as Record<string, unknown>
        : null;
      const channelId = String(channel?.id || primaryChannel?.id || "").trim();
      const whatsappAvailable = Boolean(externalContactId && channelId && activeChannelIds.has(channelId));

      if (!externalContactId) {
        return json({
          success: true,
          prepared: false,
          whatsapp_available: false,
          error: "O contato foi processado, mas a SAC Digital não retornou um identificador válido.",
        });
      }

      const now = new Date().toISOString();
      const { error: cacheError } = await admin
        .from("sac_digital_contacts")
        .upsert({
          organization_id: organizationId,
          external_contact_id: externalContactId,
          customer_id: customerId || null,
          name: resolvedName || null,
          phone: resolvedPhone || null,
          avatar_url: String(contact?.avatar || "").trim() || null,
          raw_metadata: contact || {},
          updated_at: now,
        }, { onConflict: "organization_id,external_contact_id" });

      if (cacheError) {
        console.warn("[SAC DIGITAL API] new conversation contact cache skipped", {
          organization_id: organizationId,
          code: cacheError.code,
        });
      }

      if (imported) {
        await writeSacAudit({
          action: "sac_digital.contact.import",
          operation: "insert",
          entityType: "sac_digital_contact",
          entityId: externalContactId,
          contextType: customerId ? "customer" : "contact",
          contextId: customerId || externalContactId,
          metadata: {
            source: "new_conversation",
            channel_id: channelId || null,
          },
        });
      }

      return json({
        success: true,
        prepared: true,
        imported,
        whatsapp_available: whatsappAvailable,
        contact: {
          external_contact_id: externalContactId,
          customer_id: customerId || null,
          name: resolvedName,
          phone: resolvedPhone,
          channel_id: channelId || null,
          blocked: contact?.blocked === true,
        },
      });
    }

    if (action === "start_new_conversation") {
      if (!(await requirePermission("sac_digital.messages.send"))) {
        return json({ success: false, error: "Sem permissão para iniciar conversas pelo SAC Digital." }, 403);
      }

      const externalContactId = String(body.external_contact_id || "").trim();
      const selectedChannelId = String(body.channel || "").trim();
      let text = String(body.text || "").trim();
      if (!externalContactId || externalContactId.length > 120) {
        return json({ success: false, error: "Contato SAC inválido." }, 400);
      }
      if (!text) return json({ success: false, error: "Digite a primeira mensagem." }, 400);
      if (text.length > 5000) return json({ success: false, error: "A mensagem é muito longa." }, 400);

      const credentials = await loadCredentials(organizationId);
      if (!credentials.enabled) {
        return json({ success: false, error: "Integração SAC Digital está desativada." }, 400);
      }

      // Um contato importado agora pode não aparecer imediatamente em /contact/info.
      // Validar pelo cadastro desta empresa e deixar o envio oficial da SAC decidir
      // se o destino já está disponível, sem descartar uma importação aceita.
      const { data: localContact, error: localError } = await admin
        .from("sac_digital_contacts")
        .select("id,external_contact_id,phone")
        .eq("organization_id", organizationId)
        .eq("external_contact_id", externalContactId)
        .maybeSingle();
      if (localError) throw new Error("Não foi possível validar o contato desta empresa.");

      let foundInSac = false;
      for (let attempt = 0; attempt < 3 && !foundInSac; attempt += 1) {
        if (attempt > 0) await new Promise(resolve => setTimeout(resolve, 350));
        const infoResult = await apiRequest(
          organizationId,
          credentials,
          `/contact/info?id=${encodeURIComponent(externalContactId)}`,
          { method: "GET" },
        );
        foundInSac = infoResult.response.ok
          && infoResult.body.status !== false
          && Boolean(infoResult.body.info);
      }

      if (!foundInSac && !localContact?.id) {
        return json({
          success: false,
          error: "A SAC Digital ainda não disponibilizou o contato. Verifique o número e tente novamente.",
        }, 404);
      }

      type OpenProtocolState = {
        protocol: string;
        operatorId: string;
        operatorName: string;
        isAtt: boolean;
      };

      const findOpenProtocol = async (): Promise<OpenProtocolState | null> => {
        const result = await apiRequest(
          organizationId,
          credentials,
          `/contact/info/protocols?p=1&id=${encodeURIComponent(externalContactId)}`,
          { method: "GET" },
        );
        if(!result.response.ok || result.body.status === false || !Array.isArray(result.body.list)) throw new Error('Não foi possível confirmar os protocolos deste contato na SAC Digital.');
        const list = Array.isArray(result.body.list)
          ? result.body.list.filter(item => item && typeof item === "object" && !Array.isArray(item)) as Record<string, unknown>[]
          : [];
        for (const item of list) {
          if (item.is_open !== true || Boolean(item.closed_at)) continue;
          const protocolId = String(item.protocol || "").trim();
          if (!validProtocol(protocolId)) continue;
          const check = await apiRequest(
            organizationId,
            credentials,
            `/protocol/info?protocol=${encodeURIComponent(protocolId)}`,
            { method: "GET" },
          );
          if (!check.response.ok || check.body.status === false) continue;
          const info = check.body.info && typeof check.body.info === "object"
            && !Array.isArray(check.body.info)
            ? check.body.info as Record<string, unknown>
            : null;
          if (info?.is_open === true && !String(info.closed_at || "").trim()) {
            const operator = info.operator && typeof info.operator === "object"
              && !Array.isArray(info.operator)
              ? info.operator as Record<string, unknown>
              : {};
            return {
              protocol: protocolId,
              isAtt: info.is_att === true,
              operatorId: String(operator.id || info.operator_id || "").trim(),
              operatorName: String(operator.name || info.operator_name || "").trim(),
            };
          }
          if (info && (info.is_open === false || Boolean(info.closed_at))) {
            try {
              await enrichProtocol(organizationId, protocolId);
            } catch {
              // O protocolo fechado nunca deve receber mensagem nova.
            }
          }
        }
        return null;
      };

      const accessBinding = await resolveMySacAccessBinding();
      if (!accessBinding) {
        return json({
          success: false,
          type: "sac_profile_not_linked",
          error: "Seu usuário não possui Perfil SAC Digital vinculado. Peça a um administrador para configurar Gestor SAC ou Operador SAC.",
        }, 409);
      }

      const conflictResponse = (state: OpenProtocolState) => json({
        success: false,
        type: "protocol_owned_by_other_operator",
        protocol: state.protocol,
        operator_id: state.operatorId || null,
        operator_name: state.operatorName || null,
        error: `Este contato já está em atendimento com ${state.operatorName || "outro Operador SAC"}. Você não pode iniciar outra conversa enquanto esse atendimento estiver aberto.`,
      }, 409);

      const openProtocol = await findOpenProtocol();
      if (accessBinding.accessMode === 'operator' && openProtocol?.operatorId
        && openProtocol.operatorId !== accessBinding.id) return conflictResponse(openProtocol);
      const conversationRoute = newConversationRoute(accessBinding.accessMode,openProtocol);
      // O horário é apresentado pelo WhatsApp; a identificação vem da sessão SAC.
      text = formatSacOutgoingText(text, accessBinding.accessMode === 'operator' ? accessBinding.name : 'Sistema');
      if (text.length > 5000) return json({success:false,error:'A mensagem excede 5000 caracteres após a identificação do remetente.'},400);

      const protocol = String(openProtocol?.protocol || "").trim();

      if (conversationRoute !== "notification" && protocol && validProtocol(protocol)) {
        try {
          await enrichProtocol(organizationId, protocol);
        } catch {
          // A mensagem ainda pode ser enviada; webhook/refresh completa a projeção local.
        }

        let apiBody: Record<string, unknown> = {};
        if (conversationRoute === "operator") {
          const operationalSend = await runResourceOperation(
            36,
            { protocol, type: "text", text },
            typeof body.intent_key === "string" ? `${userData.user.id}:${body.intent_key.slice(0,160)}` : undefined,
          );
          if (!operationalSend.success) {
            return json({
              success: false,
              type: operationalSend.type || "provider_rejected",
              error: operationalSend.error || "A SAC Digital não conseguiu iniciar a conversa pelo Operador.",
            }, operationalSend.outcome === "unknown" ? 502 : 409);
          }
          apiBody = operationalSend.data && typeof operationalSend.data === "object"
            && !Array.isArray(operationalSend.data)
            ? operationalSend.data as Record<string, unknown>
            : {};
        } else {
          const companySession = await login(organizationId, credentials);
          const sendResult = await fetchJson(
            `${SAC_API_BASE_URL}/protocol/send`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${companySession.token}`,
                Accept: "application/json",
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                protocol,
                type: "text",
                text,
              }),
            },
          );

          if (!sendResult.response.ok || sendResult.body.status === false || sendResult.body.success === false) {
            return json({
              success: false,
              error: typeof sendResult.body.message === "string" && sendResult.body.message.trim()
                ? `SAC Digital: ${sendResult.body.message.trim()}`
                : "A SAC Digital não conseguiu iniciar a conversa.",
            }, 409);
          }
          apiBody = sendResult.body;
        }

        const { data: protocolRow } = await admin
          .from("sac_digital_protocols")
          .select("id")
          .eq("organization_id", organizationId)
          .eq("external_protocol_id", protocol)
          .maybeSingle();

        if (protocolRow?.id) {
          const sentAt = new Date().toISOString();
          const externalCandidate = apiBody.id ?? apiBody.message_id;
          const externalMessageId = typeof externalCandidate === "string" || typeof externalCandidate === "number"
            ? `sac:${String(externalCandidate)}`
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
              started_via_union: true,
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

        await writeSacAudit({
          action: "sac_digital.conversation.start",
          operation: "send",
          entityType: "sac_digital_protocol",
          entityId: protocol,
          contextType: "protocol",
          contextId: protocol,
          metadata: {
            external_contact_id: externalContactId,
            transport: "protocol",
            message_length: text.length,
          },
        });

        EdgeRuntime.waitUntil((async () => {
          await new Promise(resolve => setTimeout(resolve, 1200));
          try {
            await syncProtocolHistory(organizationId, protocol);
          } catch {
            // Próximo webhook/refresh reconcilia o histórico.
          }
        })());

        return json({
          success: true,
          mode: "protocol",
          protocol,
          external_contact_id: externalContactId,
        });
      }

      const notification = await apiRequest(
        organizationId,
        credentials,
        "/notification/contact",
        {
          method: "POST",
          body: JSON.stringify({
            contact: externalContactId,
            ...(selectedChannelId ? { channel: selectedChannelId } : {}),
            type: "text",
            text,
          }),
        },
      );

      if (!notification.response.ok || notification.body.status === false || notification.body.success === false) {
        const apiMessage = typeof notification.body.message === "string"
          ? notification.body.message.trim()
          : "";
        const looksUnavailable = /whatsapp|n[uú]mero|telefone|contato inv[aá]lido|invalid/i.test(apiMessage);
        return json({
          success: false,
          error: apiMessage
            ? `SAC Digital: ${apiMessage}`
            : "A SAC Digital não conseguiu iniciar a conversa com este número.",
          whatsapp_available: looksUnavailable ? false : null,
        });
      }

      // Notificacoes a contato podem ser aceitas sem abrir protocolo.
      // Persistir o envio como pendente para exibir na caixa de conversas;
      // uma falha na gravacao NAO desfaz o envio nem deve sugerir reenvio.
      let pendingStartId: string | null = null;
      if (localContact?.id) {
        const sentAt = new Date().toISOString();
        const { data: pendingStart, error: pendingError } = await admin
          .from("sac_digital_outbound_starts")
          .upsert({
            organization_id: organizationId,
            contact_id: localContact.id,
            external_contact_id: externalContactId,
            message_text: text,
            sender_id: userData.user.id,
            sent_at: sentAt,
            updated_at: sentAt,
            notification_id: notification.body.notification_id || notification.body.id || null,
            delivery_state: "accepted",
          }, { onConflict: "organization_id,external_contact_id" })
          .select("id")
          .maybeSingle();
        if (pendingError) {
          console.error("[SAC DIGITAL API] pending conversation registration failed", {
            organization_id: organizationId,
            code: pendingError.code,
          });
        } else {
          pendingStartId = String(pendingStart?.id || "") || null;
        }
      }

      await writeSacAudit({
        action: "sac_digital.conversation.start",
        operation: "send",
        entityType: "sac_digital_contact",
        entityId: externalContactId,
        contextType: "contact",
        contextId: externalContactId,
        metadata: {
          transport: "notification",
          message_length: text.length,
        },
      });

      return json({
        success: true,
        mode: "notification",
        protocol: null,
        pending_start_id: pendingStartId,
        external_contact_id: externalContactId,
      });
    }

    if (action === "my_operator_binding") {
      if (!(await requirePermission("sac_digital.messages.view"))) {
        return json({ success: false, error: "Sem permissão para visualizar atendimentos do SAC Digital." }, 403);
      }
      const binding = await resolveMySacAccessBinding();
      return json({
        success: true,
        linked: Boolean(binding),
        access_mode: binding?.accessMode || null,
        operator: binding?.accessMode === "operator"
          ? { id: binding.id, name: binding.name }
          : null,
      });
    }

    if (action === "operator_bindings_admin") {
      if (!(await requirePermission("sac_digital.settings.manage"))) {
        return json({ success: false, error: "Sem permissão para configurar operadores do SAC Digital." }, 403);
      }

      const operators = await loadSacOperators();

      const { data: members, error: membersError } = await admin
        .from("organization_members")
        .select("user_id,is_owner,status")
        .eq("organization_id", organizationId)
        .eq("status", "active");
      if (membersError) throw new Error("Não foi possível carregar os funcionários desta empresa.");

      const userIds = (members || [])
        .map(member => String(member.user_id || ""))
        .filter(Boolean);

      let profiles: Array<Record<string, unknown>> = [];
      if (userIds.length) {
        const { data: profileRows, error: profilesError } = await admin
          .from("profiles")
          .select("id,full_name,email,is_active")
          .in("id", userIds)
          .eq("is_active", true);
        if (profilesError) throw new Error("Não foi possível carregar os funcionários desta empresa.");
        profiles = (profileRows || []) as Array<Record<string, unknown>>;
      }

      const { data: links, error: linksError } = await admin
        .from("sac_digital_operator_links")
        .select("user_id,access_mode,external_operator_id,operator_name")
        .eq("organization_id", organizationId);
      if (linksError) throw new Error("Não foi possível carregar os vínculos de operadores.");

      const memberByUser = new Map<string, Record<string, any>>(
        (members || []).map(member => [String(member.user_id || ""), member]),
      );
      const linkByUser = new Map<string, Record<string, any>>(
        (links || []).map(link => [String(link.user_id || ""), link]),
      );

      const employees = profiles
        .map(profile => {
          const userId = String(profile.id || "");
          const member = memberByUser.get(userId);
          const link = linkByUser.get(userId);
          return {
            user_id: userId,
            full_name: String(profile.full_name || profile.email || "Usuário"),
            email: String(profile.email || ""),
            is_owner: member?.is_owner === true,
            access_mode: link?.access_mode === "manager"
              ? "manager"
              : link?.external_operator_id ? "operator" : null,
            operator: link?.access_mode !== "manager" && link?.external_operator_id
              ? {
                  id: String(link.external_operator_id),
                  name: String(link.operator_name || ""),
                }
              : null,
          };
        })
        .sort((left, right) => left.full_name.localeCompare(right.full_name, "pt-BR"));

      return json({
        success: true,
        employees,
        operators: operators.map(operator => ({
          id: operator.id,
          name: operator.name,
          email: operator.email,
          online: operator.online,
        })),
      });
    }

    if (action === "set_operator_binding_admin") {
      if (!(await requirePermission("sac_digital.settings.manage"))) {
        return json({ success: false, error: "Sem permissão para configurar operadores do SAC Digital." }, 403);
      }

      const targetUserId = String(body.user_id || "").trim();
      const operatorId = String(body.operator_id || "").trim();
      const requestedAccessMode = String(body.access_mode || (operatorId ? "operator" : "")).trim().toLowerCase();
      if (!isUuid(targetUserId)) return json({ success: false, error: "Funcionário inválido." }, 400);
      if (requestedAccessMode && !["manager","operator"].includes(requestedAccessMode)) {
        return json({ success: false, error: "Perfil SAC Digital inválido." }, 400);
      }

      const { data: member, error: memberError } = await admin
        .from("organization_members")
        .select("user_id,status")
        .eq("organization_id", organizationId)
        .eq("user_id", targetUserId)
        .eq("status", "active")
        .maybeSingle();
      if (memberError || !member) {
        return json({ success: false, error: "O funcionário não pertence à empresa ativa." }, 400);
      }

      if (!requestedAccessMode) {
        const { error: deleteError } = await admin
          .from("sac_digital_operator_links")
          .delete()
          .eq("organization_id", organizationId)
          .eq("user_id", targetUserId);
        if (deleteError) throw new Error("Não foi possível remover o perfil SAC Digital.");
        await writeSacAudit({
          action: "sac_digital.operator_binding.remove",
          operation: "unlink",
          entityType: "sac_digital_operator_binding",
          entityId: targetUserId,
          contextType: "user",
          contextId: targetUserId,
          metadata: { managed_by: "settings" },
        });
        return json({ success: true, linked: false, access_mode: null, operator: null });
      }

      if (requestedAccessMode === "manager") {
        const { error: managerUpsertError } = await admin
          .from("sac_digital_operator_links")
          .upsert({
            organization_id: organizationId,
            user_id: targetUserId,
            access_mode: "manager",
            external_operator_id: null,
            operator_name: null,
            updated_at: new Date().toISOString(),
          }, { onConflict: "organization_id,user_id" });
        if (managerUpsertError) throw new Error("Não foi possível salvar o perfil Gestor SAC.");

        await writeSacAudit({
          action: "sac_digital.operator_binding.set",
          operation: "update",
          entityType: "sac_digital_operator_binding",
          entityId: targetUserId,
          contextType: "user",
          contextId: targetUserId,
          metadata: { managed_by: "settings", access_mode: "manager" },
          changedFields: { access_mode: "manager" },
        });

        return json({
          success: true,
          linked: true,
          access_mode: "manager",
          operator: null,
        });
      }

      if (!operatorId || operatorId.length > 80) {
        return json({ success: false, error: "Selecione um Operador SAC Digital." }, 400);
      }

      const operators = await loadSacOperators();
      const operator = operators.find(item => item.id === operatorId);
      if (!operator) return json({ success: false, error: "Operador SAC não encontrado." }, 400);

      const credentials = await loadCredentials(organizationId);
      if (!credentials.enabled) {
        return json({ success: false, error: "Integração SAC Digital está desativada." }, 409);
      }
      // Saving the binding does not authenticate on behalf of the employee.
      // The employee authorizes their own Operator through OAuth consent.

      const { data: usedByOther, error: usedError } = await admin
        .from("sac_digital_operator_links")
        .select("user_id")
        .eq("organization_id", organizationId)
        .eq("external_operator_id", operator.id)
        .neq("user_id", targetUserId)
        .maybeSingle();
      if (usedError) throw new Error("Não foi possível validar o vínculo do operador.");
      if (usedByOther?.user_id) {
        return json({
          success: false,
          error: "Este operador SAC já está vinculado a outro funcionário da Union.",
        });
      }

      const { error: upsertError } = await admin
        .from("sac_digital_operator_links")
        .upsert({
          organization_id: organizationId,
          user_id: targetUserId,
          access_mode: "operator",
          external_operator_id: operator.id,
          operator_name: operator.name,
          updated_at: new Date().toISOString(),
        }, { onConflict: "organization_id,user_id" });
      if (upsertError) {
        if (upsertError.code === "23505") {
          return json({
            success: false,
            error: "Este operador SAC já está vinculado a outro funcionário da Union.",
          });
        }
        throw new Error("Não foi possível salvar o vínculo do operador.");
      }

      await writeSacAudit({
        action: "sac_digital.operator_binding.set",
        operation: "update",
        entityType: "sac_digital_operator_binding",
        entityId: targetUserId,
        contextType: "user",
        contextId: targetUserId,
        metadata: {
          managed_by: "settings",
          access_mode: "operator",
          operator_id: operator.id,
          operator_name: operator.name,
        },
        changedFields: { external_operator_id: operator.id },
      });

      return json({
        success: true,
        linked: true,
        access_mode: "operator",
        operator: { id: operator.id, name: operator.name },
      });
    }

    if (action === "assume_protocol") {
      if (!(await requirePermission("sac_digital.protocols.manage"))) {
        return json({ success: false, error: "Sem permissão para assumir atendimentos do SAC Digital." }, 403);
      }

      const protocol = String(body.protocol || "").trim();
      if (!validProtocol(protocol)) return json({ success: false, error: "Protocolo inválido." }, 400);

      const binding = await resolveMyOperatorBinding();
      if (!binding) {
        return json({
          success: false,
          error: "Seu usuário precisa estar vinculado a um Operador SAC de atendimento. Conta Gestor e Operador são acessos diferentes.",
          needs_operator_binding: true,
        }, 409);
      }

      const intentKey = typeof body.intent_key === "string"
        ? `${userData.user.id}:${body.intent_key.slice(0,160)}`
        : undefined;
      const selected = await runResourceOperation(73, { protocol }, intentKey);
      if (!selected.success) {
        return json({
          success: false,
          error: selected.error || "Não foi possível selecionar o atendimento.",
          outcome: selected.outcome,
          type: selected.type,
        }, selected.outcome === "unknown" ? 502 : 409);
      }

      await recordConfirmedOperation(protocol,{status:'in_att',operator_id:binding.id,operator_name:binding.name});

      await writeSacAudit({
        action: "sac_digital.protocol.assume",
        operation: "assume",
        entityType: "sac_digital_protocol",
        entityId: protocol,
        contextType: "protocol",
        contextId: protocol,
        metadata: {
          operator_id: binding.id,
          operator_name: binding.name,
          transport: "operator_select",
        },
      });

      return json({
        success: true,
        protocol,
        operator: { id: binding.id, name: binding.name },
      });
    }

    if (action === "routing_options") {
      if (!(await requirePermission("sac_digital.protocols.manage"))) return json({success:false,error:"Sem permissão para gerenciar atendimentos."},403);
      const protocol=String(body.protocol || '').trim();
      if(!validProtocol(protocol)) return json({success:false,error:"Protocolo inválido."},400);
      const options=await runResourceOperation(88,{protocol},undefined,{routingOptions:true});
      if(!options.success) return json(options as Record<string,unknown>,409);
      const rows=(value:unknown)=>Array.isArray(value) ? value.filter(item=>item && typeof item==='object' && !Array.isArray(item)) as Record<string,unknown>[] : [];
      const operators=rows(options.data?.list).map(row=>({id:String(row.id || ''),name:String(row.name || ''),online:row.online !== false})).filter(row=>row.id && row.name);
      const departments=rows(options.data?.departments).map(row=>({id:String(row.id || ''),name:String(row.name || ''),active:row.active !== false})).filter(row=>row.id && row.name);
      return json({success:true,operators,departments,department_authorization_required:options.data?.department_authorization_required===true});
    }

    if (action === "forward_protocol") {
      if (!(await requirePermission("sac_digital.protocols.manage"))) {
        return json({ success: false, error: "Sem permissão para encaminhar atendimentos do SAC Digital." }, 403);
      }

      const protocol = String(body.protocol || "").trim();
      const departmentId = String(body.department_id || "").trim();
      const operatorId = String(body.operator_id || "").trim();
      if (!validProtocol(protocol)) return json({ success: false, error: "Protocolo inválido." }, 400);
      if (!departmentId && !operatorId) return json({ success: false, error: "Escolha um departamento ou operador." }, 400);
      if (departmentId && operatorId) return json({ success:false,error:"Escolha somente um destino: departamento ou Operador." },400);

      const accessBinding = await resolveMySacAccessBinding();
      if (!accessBinding) {
        return json({ success: false, type: "sac_profile_not_linked", error: "Seu usuário não possui Perfil SAC Digital vinculado." }, 409);
      }
      if (accessBinding.accessMode !== "operator" || !accessBinding.id) {
        return json({
          success: false,
          type: "operator_required",
          error: "Encaminhar um atendimento ativo exige o Operador SAC responsável. O Gestor SAC pode acompanhar todos os atendimentos, mas não assume a sessão operacional do operador.",
        }, 409);
      }

      const credentials = await loadCredentials(organizationId);
      if (!credentials.enabled) return json({ success: false, error: "Integração SAC Digital está desativada." }, 400);
      const state = await apiRequest(
        organizationId,
        credentials,
        `/protocol/info?protocol=${encodeURIComponent(protocol)}`,
        { method: "GET" },
      );
      if (!state.response.ok || state.body.status === false || !state.body.info || typeof state.body.info !== "object") {
        return json({ success: false, error: "Não foi possível confirmar o atendimento na SAC Digital." }, 409);
      }
      const info = state.body.info as Record<string, unknown>;
      if (info.is_open === false || Boolean(info.closed_at) || Boolean(info.finished_at)) {
        return json({ success: false, error: "Este atendimento já está finalizado." }, 409);
      }

      const assigned = info.operator && typeof info.operator === "object" && !Array.isArray(info.operator)
        ? info.operator as Record<string, unknown>
        : {};
      const assignedOperatorId = String(assigned.id || info.operator_id || "").trim();
      const assignedOperatorName = String(assigned.name || info.operator_name || "").trim();
      const ownership = conversationOwnership({
        accessMode: "operator",
        boundOperatorId: accessBinding.id,
        assignedOperatorId,
        assignedOperatorName,
      });
      if (!ownership.allowed || ownership.needsAssignment) {
        return json({
          success: false,
          type: "protocol_owned_by_other_operator",
          operator_id: assignedOperatorId || null,
          operator_name: assignedOperatorName || null,
          error: assignedOperatorId
            ? `Este atendimento pertence a ${assignedOperatorName || "outro Operador SAC"}.`
            : "Este atendimento ainda não está atribuído ao seu Operador SAC.",
        }, 409);
      }

      const result = await runResourceOperation(
        90,
        {
          protocol,
          to: operatorId ? "operator" : "department",
          ...(operatorId ? { operator: operatorId } : { department: departmentId }),
        },
        typeof body.intent_key === "string"
          ? `${userData.user.id}:${body.intent_key.slice(0,160)}`
          : undefined,
        {protocolInfo:info},
      );

      if (!result.success) return json(result as Record<string, unknown>, result.outcome === "unknown" ? 502 : 409);

      try { await enrichProtocol(organizationId, protocol); } catch {}

      await writeSacAudit({
        action: "sac_digital.protocol.forward",
        operation: "forward",
        entityType: "sac_digital_protocol",
        entityId: protocol,
        contextType: "protocol",
        contextId: protocol,
        metadata: {
          department_id: departmentId || null,
          operator_id: operatorId || null,
          sac_access_mode: "operator",
          transport: "operator_att_forward",
        },
      });

      return json({ success: true, protocol, data: result.data });
    }

    if (action === "return_to_inbox" || action === "return_to_queue") {
      if (!(await requirePermission("sac_digital.protocols.manage"))) {
        return json({ success: false, error: "Sem permissão para devolver atendimentos à fila do SAC Digital." }, 403);
      }

      const protocol = String(body.protocol || "").trim();
      if (!validProtocol(protocol)) return json({ success: false, error: "Protocolo inválido." }, 400);

      const accessBinding = await resolveMySacAccessBinding();
      if (!accessBinding) {
        return json({ success: false, type: "sac_profile_not_linked", error: "Seu usuário não possui Perfil SAC Digital vinculado." }, 409);
      }
      if (accessBinding.accessMode !== "operator" || !accessBinding.id) {
        return json({
          success: false,
          type: "operator_required",
          error: "Devolver um atendimento ativo à fila exige o Operador SAC responsável.",
        }, 409);
      }

      const credentials = await loadCredentials(organizationId);
      if (!credentials.enabled) return json({ success: false, error: "Integração SAC Digital está desativada." }, 400);

      const state = await apiRequest(
        organizationId,
        credentials,
        `/protocol/info?protocol=${encodeURIComponent(protocol)}`,
        { method: "GET" },
      );
      if (!state.response.ok || state.body.status === false || !state.body.info || typeof state.body.info !== "object") {
        return json({ success: false, error: "Não foi possível confirmar o atendimento na SAC Digital." }, 409);
      }
      const info = state.body.info as Record<string, unknown>;
      if (info.is_open === false || Boolean(info.closed_at) || Boolean(info.finished_at)) {
        return json({ success: false, error: "Este atendimento já está finalizado." }, 409);
      }

      const assigned = info.operator && typeof info.operator === "object" && !Array.isArray(info.operator)
        ? info.operator as Record<string, unknown>
        : {};
      const assignedOperatorId = String(assigned.id || info.operator_id || "").trim();
      const assignedOperatorName = String(assigned.name || info.operator_name || "").trim();
      const ownership = conversationOwnership({
        accessMode: "operator",
        boundOperatorId: accessBinding.id,
        assignedOperatorId,
        assignedOperatorName,
      });
      if (!ownership.allowed || ownership.needsAssignment) {
        return json({
          success: false,
          type: "protocol_owned_by_other_operator",
          operator_id: assignedOperatorId || null,
          operator_name: assignedOperatorName || null,
          error: assignedOperatorId
            ? `Este atendimento pertence a ${assignedOperatorName || "outro Operador SAC"}.`
            : "Este atendimento ainda não está atribuído ao seu Operador SAC.",
        }, 409);
      }

      const departmentId='current'; // Resolved under the selected Operator before transport.

      const result = await runResourceOperation(
        90,
        { protocol, to: "department", department: departmentId },
        typeof body.intent_key === "string"
          ? `${userData.user.id}:${body.intent_key.slice(0,160)}`
          : undefined,
        {protocolInfo:info,returnToCurrentDepartment:true},
      );

      if (!result.success) return json(result as Record<string, unknown>, result.outcome === "unknown" ? 502 : 409);

      await recordConfirmedOperation(protocol,{status:'inbox',operator_id:null,operator_name:null,sector_id:(result as any).department_id});

      await writeSacAudit({
        action: "sac_digital.protocol.return_to_queue",
        operation: "forward_department",
        entityType: "sac_digital_protocol",
        entityId: protocol,
        contextType: "protocol",
        contextId: protocol,
        metadata: {
          department_id: (result as any).department_id,
          sac_access_mode: "operator",
          transport: "operator_att_forward",
        },
      });

      return json({ success: true, protocol, returned_to_queue: true, data: result.data });
    }

    if (action === "finish_protocol") {
      if (!(await requirePermission("sac_digital.protocols.manage"))) {
        return json({ success: false, error: "Sem permissão para finalizar atendimentos do SAC Digital." }, 403);
      }

      const protocol = String(body.protocol || "").trim();
      if (!validProtocol(protocol)) return json({ success: false, error: "Protocolo inválido." }, 400);
      const vote = Number(body.vote);
      if (!Number.isFinite(vote)) return json({ success: false, error: "Informe a votação para finalizar o atendimento." }, 400);

      if(!await resolveMySacAccessBinding()) return json({success:false,type:'sac_profile_not_linked',error:'Seu usuário não possui Perfil SAC Digital vinculado.'},409);

      const intentKey = typeof body.intent_key === "string"
        ? `${userData.user.id}:${body.intent_key.slice(0,160)}`
        : undefined;
      const finished = await runResourceOperation(38, { protocol, vote, notify_contact: false }, intentKey);
      if (!finished.success) return json(finished as Record<string, unknown>,finished.outcome==='unknown'?502:409);

      await recordConfirmedOperation(protocol,{status:'finished',closed_at:new Date().toISOString()});

      await writeSacAudit({
        action: "sac_digital.protocol.finish",
        operation: "finish",
        entityType: "sac_digital_protocol",
        entityId: protocol,
        contextType: "protocol",
        contextId: protocol,
      });

      return json({ success: true, protocol, finished: true });
    }

    if (action === "send_media") {
      if (!(await requirePermission("sac_digital.messages.send"))) {
        return json({ success: false, error: "Sem permissão para enviar anexos pelo SAC Digital." }, 403);
      }

      let protocol = String(body.protocol || "").trim();
      let localMediaProtocolId: string | null = null;
      const orderId = String(body.order_id || "").trim();
      const requestedExternalContactId = String(body.external_contact_id || "").trim();
      let text = String(body.text || "").trim();
      if (!uploadFile || uploadFile.size <= 0) return json({ success: false, error: "Selecione um arquivo para enviar." }, 400);
      if (uploadFile.type.startsWith("image/") && uploadFile.size > 1024 * 1024) {
        return json({ success: false, error: "A SAC Digital aceita imagens de no máximo 1 MB." });
      }
      if (uploadFile.size > mediaLimit(uploadFile.type.startsWith("audio/") ? "audio" : uploadFile.type.startsWith("image/") ? "image" : "file")) return json({success:false,error:"O anexo excede o limite deste tipo de mídia."},400);
      if (text.length > 5000) return json({ success: false, error: "A legenda é muito longa." }, 400);

      const credentials = await loadCredentials(organizationId);
      if (!credentials.enabled) return json({ success: false, error: "Integração SAC Digital está desativada." }, 400);

      let fromOrder = false;
      let orderExternalContactId = "";
      let orderContactLocalId = "";

      if (orderId) {
        if (!isUuid(orderId)) return json({ success: false, error: "OS inválida." }, 400);
        const canViewOrder = await hasOrganizationPermission("orders.view")
          || await hasOrganizationPermission("orders.details.view");
        if (!canViewOrder) return json({ success: false, error: "Sem permissão para acessar esta OS." }, 403);

        const { data: sourceOrder, error: sourceOrderError } = await admin
          .from("service_orders")
          .select("id,customer_id")
          .eq("organization_id", organizationId)
          .eq("id", orderId)
          .maybeSingle();
        if (sourceOrderError || !sourceOrder?.id || !sourceOrder.customer_id) {
          return json({ success: false, error: "OS ou cliente não encontrado nesta empresa." }, 404);
        }
        fromOrder = true;

        // Envio originado na OS é institucional, pela conta Client/Gestor da
        // empresa. Não vincular, transferir nem autenticar como Operador SAC.
        // Isso mantém o mesmo comportamento do envio de texto da OS e evita
        // invalid_auth quando o protocolo está atribuído a outro atendente.
        if (!protocol) {
          if (!requestedExternalContactId || requestedExternalContactId.length > 120) {
            return json({ success: false, error: "Contato SAC inválido para esta OS." }, 400);
          }

          const { data: orderContact, error: orderContactError } = await admin
            .from("sac_digital_contacts")
            .select("id,external_contact_id,customer_id")
            .eq("organization_id", organizationId)
            .eq("external_contact_id", requestedExternalContactId)
            .eq("customer_id", sourceOrder.customer_id)
            .maybeSingle();
          if (orderContactError || !orderContact?.external_contact_id) {
            return json({
              success: false,
              error: "O contato SAC preparado não corresponde ao cliente desta OS.",
            }, 409);
          }
          orderExternalContactId = String(orderContact.external_contact_id);
          orderContactLocalId = String(orderContact.id || "");

          const lookup = await apiRequest(
            organizationId,
            credentials,
            `/contact/info/protocols?p=1&id=${encodeURIComponent(requestedExternalContactId)}`,
            { method: "GET" },
          );
          const rows = lookup.response.ok && lookup.body.status !== false && Array.isArray(lookup.body.list)
            ? lookup.body.list.filter(row => row && typeof row === "object" && !Array.isArray(row)) as Record<string, unknown>[]
            : [];

          for (const row of rows) {
            if (row.is_open !== true || Boolean(row.closed_at)) continue;
            const candidate = String(row.protocol || "").trim();
            if (!validProtocol(candidate)) continue;

            const detail = await apiRequest(
              organizationId,
              credentials,
              `/protocol/info?protocol=${encodeURIComponent(candidate)}`,
              { method: "GET" },
            );
            if (!detail.response.ok || detail.body.status === false) continue;
            const info = detail.body.info && typeof detail.body.info === "object"
              && !Array.isArray(detail.body.info)
              ? detail.body.info as Record<string, unknown>
              : null;
            if (info?.is_open === true && !String(info.closed_at || "").trim()) {
              protocol = candidate;
              break;
            }
          }

        }
      }

      if (text) {
        const sender = fromOrder ? 'Sistema' : (await resolveMyOperatorBinding())?.name || 'Sistema';
        text = formatSacOutgoingText(text, sender);
        if (text.length > 5000) return json({success:false,error:'A legenda excede 5000 caracteres após a identificação do remetente.'},400);
      }
      if (protocol && !validProtocol(protocol)) {
        return json({ success: false, error: "Protocolo inválido para o envio." }, 409);
      }
      if (!protocol && !fromOrder) {
        return json({ success: false, error: "Não foi possível determinar um protocolo ativo para o envio." }, 409);
      }

      if (protocol) {
        try {
          if(fromOrder) await enrichProtocol(organizationId, protocol);
        } catch {
          // O protocolo externo confirmado ainda pode estar aguardando projeção local.
        }

        const { data: mediaProtocol, error: mediaProtocolError } = await admin
          .from("sac_digital_protocols")
          .select("id,status,closed_at")
          .eq("organization_id", organizationId)
          .eq("external_protocol_id", protocol)
          .maybeSingle();
        if (mediaProtocolError || !mediaProtocol?.id) {
          return json({ success: false, error: "Protocolo não encontrado nesta empresa." }, 404);
        }
        localMediaProtocolId = mediaProtocol.id;
        if (mediaProtocol.status === "finished" || mediaProtocol.closed_at) {
          return json({ success: false, error: "Não é possível enviar anexos a um protocolo finalizado." }, 409);
        }
      }

      const mediaType = uploadFile.type.startsWith("image/") ? "image"
        : uploadFile.type.startsWith("video/") ? "video"
        : uploadFile.type.startsWith("audio/") ? "audio"
        : "file";

      await ensureOutboxBucket();

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

      const {data: publicUrlData,error: signedError} = await admin.storage.from(SAC_OUTBOX_BUCKET).createSignedUrl(storagePath,7*24*3600);
      if(signedError || !publicUrlData?.signedUrl) return json({success:false,error:"Não foi possível criar a URL temporária."},503);
      const publicUrl = publicUrlData.signedUrl;
      // A SAC valida o arquivo pela URL informada. URLs assinadas do Storage
      // carregam query string e nem sempre são aceitas pelo validador de mídia.
      // Usar o proxy próprio mantém um caminho limpo com extensão, MIME e
      // Content-Length corretos, sem tornar o bucket público.
      const providerUrl = `${supabaseUrl}/functions/v1/sac-digital-media/${organizationId}/${encodeURIComponent(publicFileName)}`;

      try {
        const mediaCheck = await fetch(providerUrl, { method: "HEAD" });
        const mediaContentType = mediaCheck.headers.get("content-type") || "";
        const mediaContentLength = mediaCheck.headers.get("content-length") || "";
        console.log("[SAC DIGITAL API] media preflight", {
          organization_id: organizationId,
          protocol,
          type: mediaType,
          status: mediaCheck.status,
          content_type: mediaContentType,
          content_length: mediaContentLength,
        });
        if (!mediaCheck.ok) {
          await admin.storage.from(SAC_OUTBOX_BUCKET).remove([storagePath]);
          return json({ success: false, error: "A imagem foi preparada, mas a URL temporária não ficou acessível." });
        }
        if (mediaType === "image" && !mediaContentType.toLowerCase().startsWith("image/")) {
          await admin.storage.from(SAC_OUTBOX_BUCKET).remove([storagePath]);
          return json({ success: false, error: "A imagem foi enviada com um formato que a SAC Digital não reconhece." });
        }
      } catch (error) {
        await admin.storage.from(SAC_OUTBOX_BUCKET).remove([storagePath]);
        console.error("[SAC DIGITAL API] media preflight failed", error instanceof Error ? error.message : error);
        return json({ success: false, error: "Não foi possível validar a URL temporária do anexo." });
      }

      const apiPayload: Record<string, unknown> = {
        type: mediaType,
        url: providerUrl,
      };
      if (protocol) apiPayload.protocol = protocol;
      if (text) apiPayload.text = text;

      if(!fromOrder && localMediaProtocolId) {
        const submission=await beginLocalSubmission(localMediaProtocolId,{message_type:mediaType,body_text:text || null,media_url:publicUrl,raw_metadata:{temp_storage_bucket:SAC_OUTBOX_BUCKET,temp_storage_path:storagePath,send_transport:'operator-routed',local_file_name:uploadFile.name}});
        if(submission.duplicate) {await admin.storage.from(SAC_OUTBOX_BUCKET).remove([storagePath]);return submissionResponse(submission.row,protocol);}
        const intent=typeof body.intent_key==='string' ? `${userData.user.id}:${body.intent_key.slice(0,160)}` : undefined;
        const {result,settled}=await sendLocalSubmission(submission,36,apiPayload,intent);
        if(!result.success) {
          if(result.outcome==='rejected') await admin.storage.from(SAC_OUTBOX_BUCKET).remove([storagePath]);
          return json({success:false,error:result.error,outcome:result.outcome,type:result.type,local_message_id:settled.id,client_request_id:settled.raw_metadata.client_request_id},result.outcome==='unknown'?502:409);
        }
        await writeSacAudit({action:'sac_digital.protocol.send_media',operation:'send',entityType:'sac_digital_protocol',entityId:protocol,contextType:'protocol',contextId:protocol,metadata:{media_type:mediaType,file_size_bytes:uploadFile.size,outcome:result.outcome}});
        return submissionResponse(settled,protocol);
      }

      let mediaTransport = fromOrder ? "manager-client" : "url";
      let response: Response;
      let apiBody: Record<string, unknown>;

      if (fromOrder) {
        if (protocol) {
          const companySession = await login(organizationId, credentials);
          const apiResult = await fetchJson(
            `${SAC_API_BASE_URL}/protocol/send`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${companySession.token}`,
                Accept: "application/json",
                "Content-Type": "application/json",
              },
              body: JSON.stringify(apiPayload),
            },
          );
          response = apiResult.response;
          apiBody = apiResult.body;
          mediaTransport = "manager-client-protocol";
        } else {
          const notificationPayload: Record<string, unknown> = {
            contact: orderExternalContactId,
            type: mediaType,
            url: providerUrl,
          };
          if (text) notificationPayload.text = text;
          const apiResult = await apiRequest(
            organizationId,
            credentials,
            "/notification/contact",
            { method: "POST", body: JSON.stringify(notificationPayload) },
          );
          response = apiResult.response;
          apiBody = apiResult.body;
          mediaTransport = "manager-client-notification";
        }
      } else {
        const apiResult = await apiRequest(
          organizationId,
          credentials,
          "/protocol/send",
          {
            method: "POST",
            body: JSON.stringify(apiPayload),
          },
        );
        response = apiResult.response;
        apiBody = apiResult.body;
      }

      if (!response.ok || apiBody.status === false || apiBody.success === false) {
        await admin.storage.from(SAC_OUTBOX_BUCKET).remove([storagePath]);
        console.error("[SAC DIGITAL API] send media failed", {
          organization_id: organizationId,
          protocol,
          status: response.status,
          request_id: apiBody.request_id,
          transport: mediaTransport,
        });
        return json({
          success: false,
          error: typeof apiBody.message === "string" && apiBody.message.trim()
            ? `SAC Digital: ${apiBody.message.trim()}`
            : "A SAC Digital não conseguiu enviar o anexo.",
        });
      }

      if (fromOrder && !protocol && orderContactLocalId) {
        const sentAt = new Date().toISOString();
        await admin
          .from("sac_digital_outbound_starts")
          .upsert({
            organization_id: organizationId,
            contact_id: orderContactLocalId,
            external_contact_id: orderExternalContactId,
            message_text: text || `[Arquivo] ${uploadFile.name || "documento"}`,
            sender_id: userData.user.id,
            sent_at: sentAt,
            updated_at: sentAt,
            notification_id: apiBody.notification_id || apiBody.id || null,
            delivery_state: "accepted",
          }, { onConflict: "organization_id,external_contact_id" });
      }

      const { data: protocolRow } = protocol
        ? await admin
            .from("sac_digital_protocols")
            .select("id")
            .eq("organization_id", organizationId)
            .eq("external_protocol_id", protocol)
            .maybeSingle()
        : { data: null };

      if (protocolRow?.id) {
        const sentAt = new Date().toISOString();
        const externalIdValue = apiBody.id ?? apiBody.message_id;
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
          media_url: publicUrl,
          sender_id: userData.user.id,
          sender_name: profile?.full_name || null,
          sent_at: sentAt,
          raw_metadata: {
            sent_via_union: true,
            temp_storage_bucket: SAC_OUTBOX_BUCKET,
            temp_storage_path: storagePath,
            send_transport: mediaTransport,
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

      await writeSacAudit({
        action: "sac_digital.protocol.send_media",
        operation: "send",
        entityType: "sac_digital_protocol",
        entityId: protocol,
        contextType: "protocol",
        contextId: protocol,
        metadata: {
          media_type: mediaType,
          file_size_bytes: uploadFile.size,
          transport: mediaTransport,
        },
      });

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

    if (action === "send_signature_invite") {
      if (!(await requirePermission("sac_digital.messages.send"))) {
        return json({ success: false, error: "Sem permissão para enviar mensagens pelo SAC Digital." }, 403);
      }
      if (!(await hasOrganizationPermission("documents.signatures.send"))) {
        return json({ success: false, error: "Sem permissão para enviar documentos para assinatura." }, 403);
      }

      const requestId = String(body.request_id || "").trim();
      const orderId = String(body.order_id || "").trim();
      const link = String(body.link || "").trim();
      if (!isUuid(requestId)) return json({ success: false, error: "Solicitação de assinatura inválida." }, 400);
      if (!isUuid(orderId)) return json({ success: false, error: "OS inválida." }, 400);

      let linkUrl: URL;
      try { linkUrl = new URL(link); }
      catch { return json({ success: false, error: "Link de assinatura inválido." }, 400); }
      if (linkUrl.protocol !== "https:" || !/\/assinatura\//.test(linkUrl.pathname)) {
        return json({ success: false, error: "Link de assinatura inválido." }, 400);
      }
      const configuredSignatureBase = String(
        Deno.env.get("SIGNATURE_PUBLIC_BASE_URL")
        || Deno.env.get("SITE_URL")
        || Deno.env.get("APP_URL")
        || "",
      ).trim().replace(/\/+$/, "");
      if (configuredSignatureBase) {
        let configuredOrigin = "";
        try { configuredOrigin = new URL(configuredSignatureBase).origin; } catch { /* validated by signature service */ }
        if (configuredOrigin && linkUrl.origin !== configuredOrigin) {
          return json({ success: false, error: "O link de assinatura não pertence a esta instalação." }, 400);
        }
      }

      const { data: signatureRequest, error: signatureRequestError } = await admin
        .from("document_signature_requests")
        .select("id,service_order_id,status,require_external_signature,external_signer_name,external_signer_phone,template_name_snapshot,expires_at")
        .eq("organization_id", organizationId)
        .eq("id", requestId)
        .eq("service_order_id", orderId)
        .maybeSingle();
      if (signatureRequestError || !signatureRequest?.id) {
        return json({ success: false, error: "Solicitação de assinatura não encontrada nesta empresa." }, 404);
      }
      if (!["pending", "viewed"].includes(String(signatureRequest.status || ""))) {
        return json({ success: false, error: "Esta solicitação de assinatura não está mais ativa." }, 409);
      }
      if (signatureRequest.require_external_signature !== true) {
        return json({ success: false, error: "Esta solicitação não possui assinante externo." }, 409);
      }

      const phone = normalizeSacPhone(signatureRequest.external_signer_phone);
      if (!phone) {
        return json({ success: false, error: "O assinante não possui WhatsApp/telefone informado." }, 400);
      }

      const credentials = await loadCredentials(organizationId);
      if (!credentials.enabled) {
        return json({ success: false, error: "Integração SAC Digital está desativada." }, 400);
      }

      let externalContactId = "";
      let matchedPhone = phone;
      let matchedContact: Record<string, unknown> | null = null;

      for (const candidatePhone of sacPhoneVariants(phone)) {
        const searchResult = await apiRequest(
          organizationId,
          credentials,
          `/contact/search?p=1&filter=1&search=${encodeURIComponent(candidatePhone)}`,
          { method: "GET" },
        );
        if (!searchResult.response.ok || searchResult.body.status === false) continue;
        const rows = Array.isArray(searchResult.body.list)
          ? searchResult.body.list.filter(item => item && typeof item === "object" && !Array.isArray(item)) as Record<string, unknown>[]
          : [];
        matchedContact = rows.find(item => sacPhoneKey(item.number) === sacPhoneKey(candidatePhone)) || null;
        if (matchedContact) {
          matchedPhone = candidatePhone;
          externalContactId = String(matchedContact.id || "").trim();
          if (externalContactId) break;
        }
      }

      if (!externalContactId) {
        const channelsResult = await apiRequest(
          organizationId,
          credentials,
          "/channel/all",
          { method: "GET" },
        );
        const channels = Array.isArray(channelsResult.body.list)
          ? channelsResult.body.list.filter(item => item && typeof item === "object" && !Array.isArray(item)) as Record<string, unknown>[]
          : [];
        const activeChannels = channels.filter(channel =>
          channel.actived !== false && String(channel.id || "").trim()
        );
        const primaryChannel = chooseImportChannel(activeChannels);
        const signerName = String(signatureRequest.external_signer_name || `Assinante ${phone.slice(-4)}`).trim();

        const importAttempt = await importSacContact(
          organizationId,
          credentials,
          phone,
          signerName,
          primaryChannel,
        );
        if (!importAttempt.result) {
          return json({
            success: false,
            error: importAttempt.failure
              ? sacContactImportError(importAttempt.failure.body.message, "A SAC Digital não conseguiu preparar o WhatsApp do assinante.")
              : "A SAC Digital não conseguiu preparar o WhatsApp do assinante.",
          }, 400);
        }
        matchedPhone = importAttempt.phone;
        externalContactId = String(
          importAttempt.result.body.id
          || (importAttempt.result.body.contact && typeof importAttempt.result.body.contact === "object"
            ? (importAttempt.result.body.contact as Record<string, unknown>).id
            : "")
          || "",
        ).trim();

        if (!externalContactId) {
          await new Promise(resolve => setTimeout(resolve, 250));
          for (const candidatePhone of sacPhoneVariants(matchedPhone)) {
            const retrySearch = await apiRequest(
              organizationId,
              credentials,
              `/contact/search?p=1&filter=1&search=${encodeURIComponent(candidatePhone)}`,
              { method: "GET" },
            );
            const retryRows = Array.isArray(retrySearch.body.list)
              ? retrySearch.body.list.filter(item => item && typeof item === "object" && !Array.isArray(item)) as Record<string, unknown>[]
              : [];
            const match = retryRows.find(item => sacPhoneKey(item.number) === sacPhoneKey(candidatePhone));
            if (match?.id) {
              externalContactId = String(match.id);
              break;
            }
          }
        }
      }

      if (!externalContactId) {
        return json({
          success: false,
          error: "A SAC Digital preparou o número, mas ainda não retornou o contato. Tente novamente em alguns segundos.",
        }, 409);
      }

      const { data: company } = await admin
        .from("organization_company_settings")
        .select("name")
        .eq("organization_id", organizationId)
        .maybeSingle();
      const signerFirstName = String(signatureRequest.external_signer_name || "").trim().split(/\s+/)[0] || "cliente";
      const companyName = String(company?.name || "Empresa").trim();
      const documentName = String(signatureRequest.template_name_snapshot || "Documento").trim();
      const expiresAt = signatureRequest.expires_at
        ? new Date(signatureRequest.expires_at).toLocaleString("pt-BR", {
            timeZone: "America/Sao_Paulo",
            dateStyle: "short",
            timeStyle: "short",
          })
        : "";
      const inviteText = formatSacOutgoingText([
        `Olá, ${signerFirstName}! ${companyName} enviou o documento “${documentName}” para sua assinatura eletrônica.`,
        expiresAt ? `O link é válido até ${expiresAt}.` : "",
        `Acesse para revisar e assinar: ${link}`,
      ].filter(Boolean).join("\n\n"), "Sistema");

      const notification = await apiRequest(
        organizationId,
        credentials,
        "/notification/contact",
        {
          method: "POST",
          body: JSON.stringify({
            contact: externalContactId,
            type: "text",
            text: inviteText,
          }),
        },
      );
      if (!notification.response.ok || notification.body.status === false || notification.body.success === false) {
        return json({
          success: false,
          error: typeof notification.body.message === "string" && notification.body.message.trim()
            ? `SAC Digital: ${notification.body.message.trim()}`
            : "A SAC Digital não conseguiu enviar o link de assinatura pelo WhatsApp.",
        }, 409);
      }

      await writeSacAudit({
        action: "sac_digital.signature.send_invite",
        operation: "send",
        entityType: "document_signature_request",
        entityId: requestId,
        contextType: "service_order",
        contextId: orderId,
        metadata: {
          transport: "notification_contact",
          external_contact_id: externalContactId,
          variant_used: matchedPhone === phone ? "registered" : "alternate",
        },
      });

      return json({
        success: true,
        request_id: requestId,
        notification_id: notification.body.notification_id || notification.body.id || null,
      });
    }

    if (action === "send_order_message") {
      if (!(await requirePermission("sac_digital.messages.send"))) {
        return json({ success: false, error: "Sem permissão para enviar mensagens pelo SAC Digital." }, 403);
      }

      const canViewOrder = await hasOrganizationPermission("orders.view")
        || await hasOrganizationPermission("orders.details.view");
      if (!canViewOrder) {
        return json({ success: false, error: "Sem permissão para acessar esta OS." }, 403);
      }

      const orderId = String(body.order_id || "").trim();
      let text = String(body.text || "").trim();
      if (!isUuid(orderId)) return json({ success: false, error: "OS inválida." }, 400);
      if (!text) return json({ success: false, error: "Digite uma mensagem para enviar." }, 400);
      if (text.length > 5000) return json({ success: false, error: "A mensagem é muito longa." }, 400);
      text = formatSacOutgoingText(text, "Sistema");
      if (text.length > 5000) return json({success:false,error:'A mensagem excede 5000 caracteres após a identificação do remetente.'},400);

      const { data: order, error: orderError } = await admin
        .from("service_orders")
        .select("id,os_number,customer_id,customer:customers(id,full_name,trade_name,legal_name,phone,whatsapp)")
        .eq("organization_id", organizationId)
        .eq("id", orderId)
        .maybeSingle();

      if (orderError || !order?.id || !order.customer_id) {
        return json({ success: false, error: "OS ou cliente não encontrado nesta empresa." }, 404);
      }

      const customerRaw = Array.isArray((order as any).customer)
        ? (order as any).customer[0]
        : (order as any).customer;
      const customer = customerRaw && typeof customerRaw === "object"
        ? customerRaw as Record<string, unknown>
        : {};
      const customerId = String(order.customer_id);
      const rawPhone = String(customer.whatsapp || customer.phone || "").replace(/\D/g, "");
      const phone = rawPhone && !rawPhone.startsWith("55") && (rawPhone.length === 10 || rawPhone.length === 11)
        ? `55${rawPhone}`
        : rawPhone;
      if (!phone) return json({ success: false, error: "O cliente não possui WhatsApp ou telefone cadastrado." }, 400);

      const credentials = await loadCredentials(organizationId);
      if (!credentials.enabled) {
        return json({ success: false, error: "Integração SAC Digital está desativada.", integration_disabled: true }, 400);
      }

      const { data: localContacts, error: contactsError } = await admin
        .from("sac_digital_contacts")
        .select("id,external_contact_id,name,phone,updated_at")
        .eq("organization_id", organizationId)
        .eq("customer_id", customerId)
        .order("updated_at", { ascending: false })
        .limit(20);
      if (contactsError) throw new Error("Não foi possível localizar o contato SAC do cliente.");

      const contactRows = (localContacts || []) as Array<Record<string, unknown>>;
      // A lista local pode estar defasada após a finalização do atendimento.
      // Nunca enviar diretamente com base apenas em status salvo no CRM.
      // O protocolo será consultado na SAC Digital antes de qualquer envio.

      let externalContactId = contactRows
        .map(row => String(row.external_contact_id || "").trim())
        .find(Boolean) || "";

      if (!externalContactId) {
        let match: Record<string, unknown> | null = null;
        let matchedPhone = phone;

        // Procurar primeiro o telefone cadastrado e depois sua variante brasileira
        // (com/sem nono dígito). Nunca escolher resultado não correspondente.
        for (const candidatePhone of sacPhoneVariants(phone)) {
          const searchResult = await apiRequest(
            organizationId,
            credentials,
            `/contact/search?p=1&filter=1&search=${encodeURIComponent(candidatePhone)}`,
            { method: "GET" },
          );
          if (!searchResult.response.ok || searchResult.body.status === false) continue;
          const list = Array.isArray(searchResult.body.list)
            ? searchResult.body.list.filter(item => item && typeof item === "object" && !Array.isArray(item)) as Record<string, unknown>[]
            : [];
          match = list.find(item => sacPhoneKey(item.number) === sacPhoneKey(candidatePhone)) || null;
          if (match) {
            matchedPhone = candidatePhone;
            break;
          }
        }

        if (!match) {
          const channelsResult = await apiRequest(
            organizationId,
            credentials,
            "/channel/all",
            { method: "GET" },
          );
          const channels = Array.isArray(channelsResult.body.list)
            ? channelsResult.body.list.filter(item => item && typeof item === "object" && !Array.isArray(item)) as Record<string, unknown>[]
            : [];
          const activeChannels = channels.filter(channel =>
            channel.actived !== false && String(channel.id || "").trim()
          );
          const primaryChannel = chooseImportChannel(activeChannels);

          const customerName = String(
            customer.trade_name
            || customer.full_name
            || customer.legal_name
            || `Contato ${phone.slice(-4)}`
          ).trim();

          const importAttempt = await importSacContact(
            organizationId,
            credentials,
            phone,
            customerName,
            primaryChannel,
          );
          const importResult = importAttempt.result;

          if (!importResult) {
            if (importAttempt.failure) {
              return json({
                success: false,
                error: sacContactImportError(
                  importAttempt.failure.body.message,
                  "A SAC Digital não conseguiu preparar este número para envio.",
                ),
              }, 400);
            }
            return json({
              success: false,
              error: "A SAC Digital não conseguiu preparar este número para envio. O contato não precisa estar previamente cadastrado; confira a conexão do canal e tente novamente.",
            }, 400);
          }

          matchedPhone = importAttempt.phone;

          const importedId = String(
            importResult.body.id
            || (importResult.body.contact && typeof importResult.body.contact === "object"
              ? (importResult.body.contact as Record<string, unknown>).id
              : "")
            || "",
          ).trim();

          if (importedId) {
            match = {
              id: importedId,
              name: customerName,
              number: matchedPhone,
              imported: true,
            };
          } else {
            await new Promise(resolve => setTimeout(resolve, 250));
            for (const candidatePhone of sacPhoneVariants(matchedPhone)) {
              const retrySearch = await apiRequest(
                organizationId,
                credentials,
                `/contact/search?p=1&filter=1&search=${encodeURIComponent(candidatePhone)}`,
                { method: "GET" },
              );
              const retryList = Array.isArray(retrySearch.body.list)
                ? retrySearch.body.list.filter(item => item && typeof item === "object" && !Array.isArray(item)) as Record<string, unknown>[]
                : [];
              match = retryList.find(item => sacPhoneKey(item.number) === sacPhoneKey(candidatePhone)) || null;
              if (match) break;
            }
          }

          if (!match?.id) {
            return json({
              success: false,
              error: "A SAC Digital preparou o número, mas ainda não retornou o contato. Tente novamente em alguns segundos.",
              contact_not_found: true,
            }, 409);
          }

          await writeSacAudit({
            action: "sac_digital.contact.import",
            operation: "insert",
            entityType: "sac_digital_contact",
            entityId: String(match.id),
            contextType: "customer",
            contextId: customerId,
            metadata: {
              source: "service_order",
              channel_id: importAttempt.channelId,
              variant_used: matchedPhone === phone ? "registered" : "alternate",
            },
          });
        }

        externalContactId = String(match.id);
        const now = new Date().toISOString();
        const { error: upsertContactError } = await admin
          .from("sac_digital_contacts")
          .upsert({
            organization_id: organizationId,
            external_contact_id: externalContactId,
            customer_id: customerId,
            name: String(match.name || customer.full_name || customer.trade_name || customer.legal_name || ""),
            phone: String(match.number || matchedPhone),
            avatar_url: String(match.avatar || "") || null,
            raw_metadata: match,
            updated_at: now,
          }, { onConflict: "organization_id,external_contact_id" });

        if (upsertContactError) {
          console.warn("[SAC DIGITAL API] contact cache upsert skipped", {
            organization_id: organizationId,
            code: upsertContactError.code,
          });
        }
      }

      // Envio iniciado pela OS segue a mesma propriedade do atendimento da tela:
      // Operador SAC nunca envia silenciosamente dentro de uma conversa de outro operador.
      type OrderOpenProtocolState = {
        protocol: string;
        operatorId: string;
        operatorName: string;
      };

      const findSacOpenProtocol = async (): Promise<OrderOpenProtocolState | null> => {
        const lookup = await apiRequest(
          organizationId,
          credentials,
          `/contact/info/protocols?p=1&id=${encodeURIComponent(externalContactId)}`,
          { method: "GET" },
        );
        if (!lookup.response.ok || lookup.body.status === false) return null;
        const rows = Array.isArray(lookup.body.list)
          ? lookup.body.list.filter(row => row && typeof row === "object" && !Array.isArray(row)) as Record<string, unknown>[]
          : [];
        for (const row of rows) {
          if (row.is_open !== true || Boolean(row.closed_at)) continue;
          const candidate = String(row.protocol || "").trim();
          if (!validProtocol(candidate)) continue;

          const detail = await apiRequest(
            organizationId,
            credentials,
            `/protocol/info?protocol=${encodeURIComponent(candidate)}`,
            { method: "GET" },
          );
          if (!detail.response.ok || detail.body.status === false) continue;
          const info = detail.body.info && typeof detail.body.info === "object"
            && !Array.isArray(detail.body.info)
            ? detail.body.info as Record<string, unknown>
            : null;
          if (info?.is_open === true && !String(info.closed_at || "").trim()) {
            const operator = info.operator && typeof info.operator === "object"
              && !Array.isArray(info.operator)
              ? info.operator as Record<string, unknown>
              : {};
            return {
              protocol: candidate,
              operatorId: String(operator.id || info.operator_id || "").trim(),
              operatorName: String(operator.name || info.operator_name || "").trim(),
            };
          }

          if (info && (info.is_open === false || Boolean(info.closed_at))) {
            try {
              await enrichProtocol(organizationId, candidate);
            } catch {
              // A ausência de projeção local não autoriza enviar em protocolo fechado.
            }
          }
        }
        return null;
      };

      const openProtocol = await findSacOpenProtocol();

      if (openProtocol) {
        const openedProtocol = openProtocol.protocol;
        try {
          await enrichProtocol(organizationId, openedProtocol);
        } catch {
          // Pode haver atraso até o protocolo ser projetado; reconciliar no webhook.
        }

        const companySession = await login(organizationId, credentials);
        const outgoing = await fetchJson(
          `${SAC_API_BASE_URL}/protocol/send`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${companySession.token}`,
              Accept: "application/json",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ protocol: openedProtocol, type: "text", text }),
          },
        );
        if (!outgoing.response.ok || outgoing.body.status === false || outgoing.body.success === false) {
          return json({
            success: false,
            error: typeof outgoing.body.message === "string" && outgoing.body.message.trim()
              ? `SAC Digital: ${outgoing.body.message.trim()}`
              : "A SAC Digital não conseguiu enviar a mensagem pelo atendimento.",
          }, 409);
        }
        const outgoingBody = outgoing.body;

        const { data: protocolRow } = await admin
          .from("sac_digital_protocols")
          .select("id")
          .eq("organization_id", organizationId)
          .eq("external_protocol_id", openedProtocol)
          .maybeSingle();

        if (protocolRow?.id) {
          const sentAt = new Date().toISOString();
          const externalCandidate = outgoingBody.id ?? outgoingBody.message_id;
          const externalMessageId = typeof externalCandidate === "string" || typeof externalCandidate === "number"
            ? `sac:${String(externalCandidate)}`
            : null;
          const { data: profile } = await admin
            .from("profiles")
            .select("full_name")
            .eq("id", userData.user.id)
            .maybeSingle();

          const payload = {
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
              sent_from_service_order: orderId,
              api_response: outgoingBody,
            },
          };
          const { error: insertedError } = await admin.from("sac_digital_messages").insert(payload);
          if (insertedError?.code === "23505") {
            await admin.from("sac_digital_messages").insert({
              ...payload,
              external_message_id: null,
              raw_metadata: {
                ...payload.raw_metadata,
                external_id_conflict: true,
              },
            });
          }

          await admin
            .from("sac_digital_protocols")
            .update({ last_message_at: sentAt, updated_at: sentAt })
            .eq("id", protocolRow.id);
        }

        await writeSacAudit({
          action: "sac_digital.order.send_message",
          operation: "send",
          entityType: "service_order",
          entityId: orderId,
          contextType: "service_order",
          contextId: orderId,
          metadata: {
            transport: "protocol",
            protocol: openedProtocol,
            message_length: text.length,
          },
        });

        EdgeRuntime.waitUntil((async () => {
          await new Promise(resolve => setTimeout(resolve, 1200));
          try {
            await enrichProtocol(organizationId, openedProtocol);
            await syncProtocolHistory(organizationId, openedProtocol);
          } catch {
            // Webhook/Realtime concluirá o histórico caso o SAC ainda esteja processando.
          }
        })());

        return json({
          success: true,
          mode: "protocol",
          protocol: openedProtocol,
        });
      }

      const notification = await apiRequest(
        organizationId,
        credentials,
        "/notification/contact",
        {
          method: "POST",
          body: JSON.stringify({
            contact: externalContactId,
            type: "text",
            text,
          }),
        },
      );

      if (!notification.response.ok || notification.body.status === false || notification.body.success === false) {
        return json({
          success: false,
          error: typeof notification.body.message === "string" && notification.body.message.trim()
            ? `SAC Digital: ${notification.body.message.trim()}`
            : "A SAC Digital não conseguiu enviar a mensagem ao cliente.",
        });
      }

      // A SAC pode aceitar a mensagem da OS sem abrir um protocolo.
      // Guardar o envio confirmado para aparecer na caixa de entrada como
      // "Aguardando protocolo", sem inventar atendimento nem repetir envio.
      let pendingStartId: string | null = null;
      const { data: pendingContact, error: pendingContactError } = await admin
        .from("sac_digital_contacts")
        .select("id")
        .eq("organization_id", organizationId)
        .eq("external_contact_id", externalContactId)
        .maybeSingle();
      if (pendingContactError) {
        console.warn("[SAC DIGITAL API] order pending contact lookup failed", {
          organization_id: organizationId,
          code: pendingContactError.code,
        });
      }
      if (pendingContact?.id) {
        const sentAt = new Date().toISOString();
        const { data: pendingStart, error: pendingError } = await admin
          .from("sac_digital_outbound_starts")
          .upsert({
            organization_id: organizationId,
            contact_id: pendingContact.id,
            external_contact_id: externalContactId,
            message_text: text,
            sender_id: userData.user.id,
            sent_at: sentAt,
            updated_at: sentAt,
            notification_id: notification.body.notification_id || notification.body.id || null,
            delivery_state: "accepted",
          }, { onConflict: "organization_id,external_contact_id" })
          .select("id")
          .maybeSingle();
        if (pendingError) {
          console.warn("[SAC DIGITAL API] order pending start insert failed", {
            organization_id: organizationId,
            code: pendingError.code,
          });
        } else {
          pendingStartId = String(pendingStart?.id || "") || null;
        }
      }

      await writeSacAudit({
        action: "sac_digital.order.send_message",
        operation: "send",
        entityType: "service_order",
        entityId: orderId,
        contextType: "service_order",
        contextId: orderId,
        metadata: {
          transport: "notification",
          pending_start_id: pendingStartId,
          notification_id: notification.body.notification_id || notification.body.id || null,
          message_length: text.length,
        },
      });

      return json({
        success: true,
        mode: "notification",
        pending_start_id: pendingStartId,
        notification_id: notification.body.notification_id || notification.body.id || null,
        request_id: typeof notification.body.request_id === "string" ? notification.body.request_id : null,
      });
    }

    if (action === "send_message") {
      if (!(await requirePermission("sac_digital.messages.send"))) return json({success:false,error:"Sem permissão para enviar mensagens."},403);
      const protocol=String(body.protocol || '').trim();
      let text=String(body.text || '').trim();
      if(!validProtocol(protocol)) return json({success:false,error:"Protocolo inválido."},400);
      if(!text || text.length>5000) return json({success:false,error:"Digite uma mensagem de até 5000 caracteres."},400);
      const {data:messageProtocol,error}=await admin.from('sac_digital_protocols').select('id,status,closed_at').eq('organization_id',organizationId).eq('external_protocol_id',protocol).maybeSingle();
      if(error || !messageProtocol) return json({success:false,error:"Protocolo não encontrado nesta empresa."},404);
      if(messageProtocol.status==='finished' || messageProtocol.closed_at) return json({success:false,error:"Não é possível enviar a um protocolo finalizado."},409);
      const senderBinding = await resolveMyOperatorBinding();
      text = formatSacOutgoingText(text, senderBinding?.name || 'Sistema');
      if(text.length > 5000) return json({success:false,error:'A mensagem excede 5000 caracteres após a identificação do remetente.'},400);
      const submission=await beginLocalSubmission(messageProtocol.id,{message_type:'text',body_text:text});
      if(submission.duplicate) return submissionResponse(submission.row,protocol);
      const key=typeof body.intent_key==='string' ? `${userData.user.id}:${body.intent_key.slice(0,160)}` : undefined;
      const {result,settled}=await sendLocalSubmission(submission,36,{protocol,type:'text',text},key);
      if(!result.success) return json({success:false,error:result.error || 'Não foi possível confirmar o envio.',outcome:result.outcome,type:result.type,local_message_id:settled.id,client_request_id:settled.raw_metadata.client_request_id},result.outcome==='unknown'?502:409);
      await writeSacAudit({action:'sac_digital.protocol.send_message',operation:'send',entityType:'sac_digital_protocol',entityId:protocol,contextType:'protocol',contextId:protocol,metadata:{message_length:text.length,outcome:result.outcome}});
      return submissionResponse(settled,protocol);
    }

    return json({ success: false, error: "Ação não suportada." }, 400);
  } catch (error) {
    console.error("[SAC DIGITAL API] unexpected error", {type:(error as any)?.type || "integration_failure"});
    return json({
      success: false,
      error: error instanceof Error ? error.message : "Falha inesperada na integração SAC Digital.",
      outcome: (error as any)?.outcome || "rejected",
      type: (error as any)?.type || "integration_failure",
    }, 502);
  }
});

