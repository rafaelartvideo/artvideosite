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

const SESSION_MINUTES = 20;
const PAIRING_CODE_DIGITS = 8;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const SESSION_SELECT = "id,organization_id,created_by,token_hash,pairing_code_hash,status,expires_at,connected_at,last_seen_at,purpose,service_order_id,order_updated_at,equipment_type_id";

type AdminClient = ReturnType<typeof createClient>;
type MobileSession = {
  id: string;
  organization_id: string;
  created_by: string;
  token_hash: string;
  pairing_code_hash: string | null;
  status: "active" | "closed" | "expired";
  expires_at: string;
  connected_at: string | null;
  last_seen_at: string | null;
  purpose: "order_checklist";
  service_order_id: string | null;
  order_updated_at: string | null;
  equipment_type_id: string | null;
};

function text(value: unknown, max = 1000) {
  return String(value ?? "").trim().slice(0, max);
}

function nullableText(value: unknown, max = 5000) {
  const normalized = text(value, max);
  return normalized || null;
}

function requireUuid(value: unknown, label: string) {
  const normalized = text(value, 64);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)) {
    throw Object.assign(new Error(`${label} inválido.`), { status: 400 });
  }
  return normalized;
}

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function randomPairingCode() {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return String(values[0] % (10 ** PAIRING_CODE_DIGITS)).padStart(PAIRING_CODE_DIGITS, "0");
}

function normalizePairingCode(value: unknown) {
  const digits = text(value, 30).replace(/\D/g, "").slice(0, PAIRING_CODE_DIGITS);
  return digits.length === PAIRING_CODE_DIGITS ? digits : "";
}

async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, "0")).join("");
}

async function pairingCodeHash(code: string) {
  return sha256(`pairing:${code}`);
}

function safeFileName(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 100) || `foto-${Date.now()}.jpg`;
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
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser();
  return error ? null : data.user || null;
}

async function activeMember(admin: AdminClient, organizationId: string, userId: string) {
  const { data, error } = await admin.from("organization_members").select("id,role_id,status")
    .eq("organization_id", organizationId).eq("user_id", userId).eq("status", "active").maybeSingle();
  if (error) throw error;
  return data;
}

async function memberHasPermission(admin: AdminClient, organizationId: string, userId: string, permissionKey: string) {
  const member = await activeMember(admin, organizationId, userId);
  if (!member) return false;

  const [roleResult, overrideResult] = await Promise.all([
    member.role_id
      ? admin.from("role_permissions").select("permission:permissions!inner(key)")
          .eq("role_id", member.role_id).eq("permission.key", permissionKey).limit(1)
      : Promise.resolve({ data: [], error: null }),
    admin.from("user_permission_overrides").select("permission:permissions!inner(key)")
      .eq("organization_id", organizationId).eq("user_id", userId)
      .eq("permission.key", permissionKey).limit(1),
  ]);
  if (roleResult.error) throw roleResult.error;
  if (overrideResult.error) throw overrideResult.error;
  return Boolean(roleResult.data?.length || overrideResult.data?.length);
}

async function moduleEnabled(admin: AdminClient, organizationId: string, moduleKey: string) {
  const { data, error } = await admin.from("organization_modules").select("is_enabled")
    .eq("organization_id", organizationId).eq("module_key", moduleKey).maybeSingle();
  if (error) throw error;
  return data?.is_enabled === true;
}

async function requireSessionPermission(admin: AdminClient, session: MobileSession, permissionKey: string, message: string) {
  if (!(await moduleEnabled(admin, session.organization_id, "orders"))) {
    throw Object.assign(new Error("O módulo de Ordens de Serviço não está disponível para esta empresa."), { status: 403 });
  }
  if (!(await memberHasPermission(admin, session.organization_id, session.created_by, permissionKey))) {
    throw Object.assign(new Error(message), { status: 403 });
  }
}

async function orderById(admin: AdminClient, organizationId: string, orderId: string) {
  const { data, error } = await admin.from("service_orders")
    .select("id,organization_id,os_number,equipment_type_id")
    .eq("organization_id", organizationId).eq("id", orderId).maybeSingle();
  if (error) throw error;
  if (!data) throw Object.assign(new Error("OS não encontrada."), { status: 404 });
  return data as any;
}

async function activeChecklistBase(admin: AdminClient, session: MobileSession) {
  const { data, error } = await admin.from("service_order_checklists")
    .select("id,organization_id,service_order_id,profile_name_snapshot,profile_version_snapshot,status,completed_at")
    .eq("organization_id", session.organization_id)
    .eq("service_order_id", session.service_order_id!)
    .neq("status", "superseded")
    .maybeSingle();
  if (error) throw error;
  return data as any | null;
}

async function sessionByToken(admin: AdminClient, sessionId: unknown, rawToken: unknown) {
  const id = requireUuid(sessionId, "Sessão");
  const token = text(rawToken, 512);
  if (!token) return null;

  let query = admin.from("device_capture_sessions").select(SESSION_SELECT).eq("id", id).eq("purpose", "order_checklist");
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

  const session = data as MobileSession;
  if (session.status !== "active" || !session.service_order_id) return null;
  if (new Date(session.expires_at).getTime() <= Date.now()) {
    await admin.from("device_capture_sessions").update({ status: "expired", updated_at: new Date().toISOString() }).eq("id", session.id);
    return null;
  }
  return session;
}

async function ownedSession(admin: AdminClient, sessionId: unknown, userId: string) {
  const id = requireUuid(sessionId, "Sessão");
  const { data, error } = await admin.from("device_capture_sessions").select(SESSION_SELECT)
    .eq("id", id).eq("created_by", userId).eq("purpose", "order_checklist").maybeSingle();
  if (error) throw error;
  return data as MobileSession | null;
}

async function touchSession(admin: AdminClient, session: MobileSession, extra: Record<string, unknown> = {}) {
  const now = new Date().toISOString();
  const { error } = await admin.from("device_capture_sessions").update({
    connected_at: session.connected_at || now,
    last_seen_at: now,
    updated_at: now,
    ...extra,
  }).eq("id", session.id);
  if (error) throw error;
  return now;
}

async function loadChecklist(admin: AdminClient, session: MobileSession) {
  const order = await orderById(admin, session.organization_id, session.service_order_id!);
  const checklist = await activeChecklistBase(admin, session);
  if (!checklist) return { order, checklist: null };

  const stagesResult = await admin.from("service_order_checklist_stages")
    .select("id,name_snapshot,stage_type_snapshot,situation_name_snapshot,sort_order,status,completed_at,reopened_at")
    .eq("organization_id", session.organization_id)
    .eq("checklist_id", checklist.id)
    .order("sort_order");
  if (stagesResult.error) throw stagesResult.error;

  const stages = stagesResult.data || [];
  const stageIds = stages.map((stage: any) => String(stage.id));
  const itemsResult = stageIds.length
    ? await admin.from("service_order_checklist_items")
        .select("id,organization_id,stage_id,title_snapshot,description_snapshot,response_type_snapshot,allow_na_snapshot,is_required_snapshot,photo_requirement_snapshot,observation_requirement_snapshot,sort_order,response_code,response_text,response_number,observation,answered_at")
        .eq("organization_id", session.organization_id)
        .in("stage_id", stageIds)
        .order("sort_order")
    : { data: [], error: null };
  if (itemsResult.error) throw itemsResult.error;

  const items = itemsResult.data || [];
  const itemIds = items.map((item: any) => String(item.id));
  const mediaResult = itemIds.length
    ? await admin.from("service_order_checklist_item_media")
        .select("item_id")
        .eq("organization_id", session.organization_id)
        .in("item_id", itemIds)
    : { data: [], error: null };
  if (mediaResult.error) throw mediaResult.error;

  const mediaCount = new Map<string, number>();
  for (const row of mediaResult.data || []) {
    const itemId = String((row as any).item_id);
    mediaCount.set(itemId, (mediaCount.get(itemId) || 0) + 1);
  }

  return {
    order,
    checklist: {
      ...checklist,
      stages: stages.map((stage: any) => ({
        ...stage,
        items: items
          .filter((item: any) => item.stage_id === stage.id)
          .map((item: any) => ({ ...item, media_count: mediaCount.get(String(item.id)) || 0 })),
      })),
    },
  };
}

async function itemContext(admin: AdminClient, session: MobileSession, itemIdInput: unknown) {
  const itemId = requireUuid(itemIdInput, "Item");
  const { data: item, error: itemError } = await admin.from("service_order_checklist_items")
    .select("*").eq("organization_id", session.organization_id).eq("id", itemId).maybeSingle();
  if (itemError) throw itemError;
  if (!item) throw Object.assign(new Error("Item de checklist não encontrado."), { status: 404 });

  const { data: stage, error: stageError } = await admin.from("service_order_checklist_stages")
    .select("*").eq("organization_id", session.organization_id).eq("id", item.stage_id).maybeSingle();
  if (stageError) throw stageError;
  if (!stage) throw Object.assign(new Error("Etapa de checklist não encontrada."), { status: 404 });

  const { data: checklist, error: checklistError } = await admin.from("service_order_checklists")
    .select("*").eq("organization_id", session.organization_id).eq("id", stage.checklist_id).maybeSingle();
  if (checklistError) throw checklistError;
  if (!checklist || checklist.status === "superseded" || checklist.service_order_id !== session.service_order_id) {
    throw Object.assign(new Error("Este item não pertence ao checklist desta OS."), { status: 403 });
  }

  return { item, stage, checklist };
}

async function stageContext(admin: AdminClient, session: MobileSession, stageIdInput: unknown) {
  const stageId = requireUuid(stageIdInput, "Etapa");
  const { data: stage, error: stageError } = await admin.from("service_order_checklist_stages")
    .select("*").eq("organization_id", session.organization_id).eq("id", stageId).maybeSingle();
  if (stageError) throw stageError;
  if (!stage) throw Object.assign(new Error("Etapa de checklist não encontrada."), { status: 404 });

  const { data: checklist, error: checklistError } = await admin.from("service_order_checklists")
    .select("*").eq("organization_id", session.organization_id).eq("id", stage.checklist_id).maybeSingle();
  if (checklistError) throw checklistError;
  if (!checklist || checklist.status === "superseded" || checklist.service_order_id !== session.service_order_id) {
    throw Object.assign(new Error("Esta etapa não pertence ao checklist desta OS."), { status: 403 });
  }

  return { stage, checklist };
}

async function orderedStages(admin: AdminClient, organizationId: string, checklistId: string) {
  const { data, error } = await admin.from("service_order_checklist_stages")
    .select("id,status,sort_order")
    .eq("organization_id", organizationId)
    .eq("checklist_id", checklistId)
    .order("sort_order");
  if (error) throw error;
  return data || [];
}

async function requireCurrentStage(admin: AdminClient, session: MobileSession, checklistId: string, stageId: string) {
  const stages = await orderedStages(admin, session.organization_id, checklistId);
  const current = stages.find((stage: any) => stage.status !== "completed");
  if (!current || current.id !== stageId) {
    throw Object.assign(new Error("Somente a etapa atual pode ser preenchida pelo celular."), { status: 409 });
  }
  return stages;
}

function hasChecklistAnswer(item: any) {
  if (item.response_code === "na") return Boolean(item.allow_na_snapshot);
  if (item.response_type_snapshot === "conformity") return item.response_code === "ok" || item.response_code === "not_ok";
  if (item.response_type_snapshot === "yes_no") return item.response_code === "yes" || item.response_code === "no";
  if (item.response_type_snapshot === "confirmation") return item.response_code === "confirmed";
  if (item.response_type_snapshot === "text") return Boolean(text(item.response_text, 5000));
  if (item.response_type_snapshot === "number") return item.response_number !== null && item.response_number !== undefined;
  return false;
}

function isChecklistFailure(item: any) {
  return (item.response_type_snapshot === "conformity" && item.response_code === "not_ok")
    || (item.response_type_snapshot === "yes_no" && item.response_code === "no");
}

async function mediaCounts(admin: AdminClient, organizationId: string, itemIds: string[]) {
  if (!itemIds.length) return new Map<string, number>();
  const { data, error } = await admin.from("service_order_checklist_item_media")
    .select("item_id").eq("organization_id", organizationId).in("item_id", itemIds);
  if (error) throw error;
  const counts = new Map<string, number>();
  for (const row of data || []) {
    const id = String((row as any).item_id);
    counts.set(id, (counts.get(id) || 0) + 1);
  }
  return counts;
}

async function createSession(context: any) {
  const { request, input, admin, supabaseUrl, anonKey } = context;
  const user = await authenticatedUser(request, supabaseUrl, anonKey);
  if (!user) throw Object.assign(new Error("Usuário não autenticado."), { status: 401 });

  const organizationId = requireUuid(input.organization_id, "Empresa");
  const orderId = requireUuid(input.service_order_id, "OS");

  if (!(await moduleEnabled(admin, organizationId, "orders"))
      || !(await memberHasPermission(admin, organizationId, user.id, "orders.checklists.manage"))) {
    throw Object.assign(new Error("Você não possui permissão para preencher checklists desta OS."), { status: 403 });
  }

  const order = await orderById(admin, organizationId, orderId);
  const { data: checklist, error: checklistError } = await admin.from("service_order_checklists")
    .select("id").eq("organization_id", organizationId).eq("service_order_id", orderId).neq("status", "superseded").maybeSingle();
  if (checklistError) throw checklistError;
  if (!checklist) throw Object.assign(new Error("Esta OS não possui checklist disponível."), { status: 409 });

  const now = new Date();
  await admin.from("device_capture_sessions").update({ status: "closed", updated_at: now.toISOString() })
    .eq("created_by", user.id)
    .eq("organization_id", organizationId)
    .eq("service_order_id", orderId)
    .eq("purpose", "order_checklist")
    .eq("status", "active");

  const token = randomToken();
  const expiresAt = new Date(now.getTime() + SESSION_MINUTES * 60_000).toISOString();
  let created: any = null;
  let pairingCode = "";

  for (let attempt = 0; attempt < 5 && !created; attempt += 1) {
    pairingCode = randomPairingCode();
    const { data, error } = await admin.from("device_capture_sessions").insert({
      organization_id: organizationId,
      created_by: user.id,
      token_hash: await sha256(token),
      pairing_code_hash: await pairingCodeHash(pairingCode),
      purpose: "order_checklist",
      service_order_id: orderId,
      equipment_type_id: order.equipment_type_id || null,
      expires_at: expiresAt,
    }).select(SESSION_SELECT).single();

    if (!error && data) created = data;
    else if (error?.code !== "23505") throw error;
  }

  if (!created || !pairingCode) throw new Error("Não foi possível gerar uma conexão móvel única.");

  return {
    success: true,
    session: {
      id: created.id,
      token,
      pairing_code: pairingCode,
      expires_at: created.expires_at,
      service_order_id: orderId,
      os_number: order.os_number,
    },
  };
}

async function pairCode(context: any) {
  const { input, admin } = context;
  const code = normalizePairingCode(input.code);
  if (!code) throw Object.assign(new Error("Digite os 8 números do código de conexão."), { status: 400 });

  const { data, error } = await admin.from("device_capture_sessions").select(SESSION_SELECT)
    .eq("purpose", "order_checklist")
    .eq("pairing_code_hash", await pairingCodeHash(code))
    .eq("status", "active")
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error) throw error;
  if (!data?.service_order_id) throw Object.assign(new Error("Código inválido ou expirado."), { status: 404 });

  return {
    success: true,
    session: {
      id: data.id,
      token: `code:${code}`,
      expires_at: data.expires_at,
      service_order_id: data.service_order_id,
    },
  };
}

async function publicStatus(context: any) {
  const { input, admin } = context;
  const session = await sessionByToken(admin, input.session_id, input.token);
  if (!session) throw Object.assign(new Error("A conexão expirou ou foi encerrada."), { status: 401 });

  await requireSessionPermission(admin, session, "orders.checklists.manage", "Seu acesso para preencher checklists foi removido.");
  await touchSession(admin, session);
  const order = await orderById(admin, session.organization_id, session.service_order_id!);

  return {
    success: true,
    expires_at: session.expires_at,
    service_order_id: session.service_order_id,
    os_number: order.os_number,
    checklist_updated_at: session.order_updated_at,
  };
}

async function ownerPoll(context: any) {
  const { request, input, admin, supabaseUrl, anonKey } = context;
  const user = await authenticatedUser(request, supabaseUrl, anonKey);
  if (!user) throw Object.assign(new Error("Usuário não autenticado."), { status: 401 });

  const session = await ownedSession(admin, input.session_id, user.id);
  if (!session) throw Object.assign(new Error("Sessão móvel não encontrada."), { status: 404 });

  const expired = new Date(session.expires_at).getTime() <= Date.now();
  if (expired && session.status === "active") {
    await admin.from("device_capture_sessions").update({ status: "expired", updated_at: new Date().toISOString() }).eq("id", session.id);
  }

  const lastSeen = session.last_seen_at ? new Date(session.last_seen_at).getTime() : 0;
  return {
    success: true,
    status: expired ? "expired" : session.status,
    connected: Boolean(session.connected_at) && Date.now() - lastSeen < 35_000 && !expired && session.status === "active",
    expires_at: session.expires_at,
    checklist_updated_at: session.order_updated_at,
  };
}

async function closeSession(context: any) {
  const { request, input, admin, supabaseUrl, anonKey } = context;
  const user = await authenticatedUser(request, supabaseUrl, anonKey);
  if (!user) throw Object.assign(new Error("Usuário não autenticado."), { status: 401 });

  const session = await ownedSession(admin, input.session_id, user.id);
  if (!session) return { success: true };

  const { error } = await admin.from("device_capture_sessions")
    .update({ status: "closed", updated_at: new Date().toISOString() })
    .eq("id", session.id);
  if (error) throw error;
  return { success: true };
}

async function getChecklist(context: any) {
  const { input, admin } = context;
  const session = await sessionByToken(admin, input.session_id, input.token);
  if (!session) throw Object.assign(new Error("A conexão expirou ou foi encerrada."), { status: 401 });

  await requireSessionPermission(admin, session, "orders.checklists.manage", "Seu acesso para preencher checklists foi removido.");
  await touchSession(admin, session);
  const payload = await loadChecklist(admin, session);
  const canReopen = await memberHasPermission(admin, session.organization_id, session.created_by, "orders.checklists.reopen");

  return {
    success: true,
    expires_at: session.expires_at,
    ...payload,
    can_reopen: canReopen,
  };
}

async function saveItem(context: any) {
  const { input, admin } = context;
  const session = await sessionByToken(admin, input.session_id, input.token);
  if (!session) throw Object.assign(new Error("A conexão expirou ou foi encerrada."), { status: 401 });

  await requireSessionPermission(admin, session, "orders.checklists.manage", "Seu acesso para preencher checklists foi removido.");
  const { item, stage, checklist } = await itemContext(admin, session, input.item_id);
  if (stage.status === "completed") throw Object.assign(new Error("Reabra a etapa antes de alterar suas respostas."), { status: 409 });
  await requireCurrentStage(admin, session, checklist.id, stage.id);

  const responseCode = nullableText(input.response_code, 30)?.toLowerCase() || null;
  const responseText = nullableText(input.response_text, 5000);
  const observation = nullableText(input.observation, 5000);
  let responseNumber: number | null = null;

  if (input.response_number !== null && input.response_number !== undefined && input.response_number !== "") {
    responseNumber = Number(input.response_number);
    if (!Number.isFinite(responseNumber)) throw Object.assign(new Error("Informe um valor numérico válido."), { status: 400 });
  }

  if (responseCode === "na" && !item.allow_na_snapshot) {
    throw Object.assign(new Error("Este item não permite Não se aplica."), { status: 400 });
  }

  if (responseCode !== "na") {
    if (item.response_type_snapshot === "conformity" && responseCode && !["ok", "not_ok"].includes(responseCode)) {
      throw Object.assign(new Error("Resposta de conformidade inválida."), { status: 400 });
    }
    if (item.response_type_snapshot === "yes_no" && responseCode && !["yes", "no"].includes(responseCode)) {
      throw Object.assign(new Error("Resposta Sim/Não inválida."), { status: 400 });
    }
    if (item.response_type_snapshot === "confirmation" && responseCode && responseCode !== "confirmed") {
      throw Object.assign(new Error("Resposta de confirmação inválida."), { status: 400 });
    }
  }

  if (["text", "number"].includes(item.response_type_snapshot) && responseCode && responseCode !== "na") {
    throw Object.assign(new Error("Código de resposta inválido para este tipo de item."), { status: 400 });
  }

  const hasAnyValue = Boolean(responseCode || responseText || responseNumber !== null || observation);
  const now = new Date().toISOString();
  const { error: updateError } = await admin.from("service_order_checklist_items").update({
    response_code: responseCode,
    response_text: responseCode === "na" ? null : responseText,
    response_number: responseCode === "na" ? null : responseNumber,
    observation,
    answered_by: hasAnyValue ? session.created_by : null,
    answered_at: hasAnyValue ? now : null,
    updated_at: now,
  }).eq("organization_id", session.organization_id).eq("id", item.id);
  if (updateError) throw updateError;

  if (hasAnyValue && ["pending", "reopened"].includes(stage.status)) {
    const { error } = await admin.from("service_order_checklist_stages")
      .update({ status: "in_progress" }).eq("organization_id", session.organization_id).eq("id", stage.id);
    if (error) throw error;
  }

  if (hasAnyValue && checklist.status === "pending") {
    const { error } = await admin.from("service_order_checklists")
      .update({ status: "in_progress" }).eq("organization_id", session.organization_id).eq("id", checklist.id);
    if (error) throw error;
  }

  const { error: eventError } = await admin.from("service_order_checklist_events").insert({
    organization_id: session.organization_id,
    checklist_id: checklist.id,
    service_order_id: session.service_order_id,
    stage_id: stage.id,
    item_id: item.id,
    event_type: "item_changed",
    payload: { response_code: responseCode },
    created_by: session.created_by,
  });
  if (eventError) throw eventError;

  const savedAt = await touchSession(admin, session, { order_updated_at: now });
  return { success: true, saved_at: savedAt };
}

async function completeStage(context: any) {
  const { input, admin } = context;
  const session = await sessionByToken(admin, input.session_id, input.token);
  if (!session) throw Object.assign(new Error("A conexão expirou ou foi encerrada."), { status: 401 });

  await requireSessionPermission(admin, session, "orders.checklists.manage", "Seu acesso para preencher checklists foi removido.");
  const { stage, checklist } = await stageContext(admin, session, input.stage_id);
  if (stage.status === "completed") return { success: true };
  await requireCurrentStage(admin, session, checklist.id, stage.id);

  const { data: items, error: itemsError } = await admin.from("service_order_checklist_items")
    .select("*").eq("organization_id", session.organization_id).eq("stage_id", stage.id).order("sort_order");
  if (itemsError) throw itemsError;

  const counts = await mediaCounts(admin, session.organization_id, (items || []).map((item: any) => String(item.id)));

  for (const item of items || []) {
    const hasAnswer = hasChecklistAnswer(item);
    if (item.is_required_snapshot && !hasAnswer) {
      throw Object.assign(new Error(`Responda “${item.title_snapshot}” antes de concluir a etapa.`), { status: 409 });
    }
    if (!hasAnswer) continue;

    const failure = isChecklistFailure(item);
    const requiresPhoto = item.photo_requirement_snapshot === "required"
      || (item.photo_requirement_snapshot === "required_on_failure" && failure);
    if (requiresPhoto && (counts.get(String(item.id)) || 0) === 0) {
      throw Object.assign(new Error(`Adicione a imagem obrigatória em “${item.title_snapshot}” antes de concluir a etapa.`), { status: 409 });
    }

    const requiresObservation = item.observation_requirement_snapshot === "required"
      || (item.observation_requirement_snapshot === "required_on_failure" && failure);
    if (requiresObservation && !text(item.observation, 5000)) {
      throw Object.assign(new Error(`Preencha a observação obrigatória em “${item.title_snapshot}” antes de concluir a etapa.`), { status: 409 });
    }
  }

  const now = new Date().toISOString();
  const { error: stageError } = await admin.from("service_order_checklist_stages").update({
    status: "completed",
    completed_by: session.created_by,
    completed_at: now,
  }).eq("organization_id", session.organization_id).eq("id", stage.id);
  if (stageError) throw stageError;

  const { data: remaining, error: remainingError } = await admin.from("service_order_checklist_stages")
    .select("id").eq("organization_id", session.organization_id).eq("checklist_id", checklist.id).neq("status", "completed").limit(1);
  if (remainingError) throw remainingError;

  const checklistPatch = remaining?.length
    ? { status: "in_progress", completed_by: null, completed_at: null }
    : { status: "completed", completed_by: session.created_by, completed_at: now };
  const { error: checklistError } = await admin.from("service_order_checklists")
    .update(checklistPatch).eq("organization_id", session.organization_id).eq("id", checklist.id);
  if (checklistError) throw checklistError;

  const { error: eventError } = await admin.from("service_order_checklist_events").insert({
    organization_id: session.organization_id,
    checklist_id: checklist.id,
    service_order_id: session.service_order_id,
    stage_id: stage.id,
    event_type: "stage_completed",
    payload: {},
    created_by: session.created_by,
  });
  if (eventError) throw eventError;

  await touchSession(admin, session, { order_updated_at: now });
  return { success: true, completed_at: now };
}

async function reopenStage(context: any) {
  const { input, admin } = context;
  const session = await sessionByToken(admin, input.session_id, input.token);
  if (!session) throw Object.assign(new Error("A conexão expirou ou foi encerrada."), { status: 401 });

  await requireSessionPermission(admin, session, "orders.checklists.reopen", "Você não possui permissão para reabrir etapas do checklist.");
  const { stage, checklist } = await stageContext(admin, session, input.stage_id);
  if (stage.status !== "completed") return { success: true };

  const stages = await orderedStages(admin, session.organization_id, checklist.id);
  const firstPendingIndex = stages.findIndex((item: any) => item.status !== "completed");
  const reopenableIndex = firstPendingIndex < 0 ? stages.length - 1 : firstPendingIndex - 1;
  if (reopenableIndex < 0 || stages[reopenableIndex]?.id !== stage.id) {
    throw Object.assign(new Error("Somente a última etapa concluída pode ser reaberta."), { status: 409 });
  }

  const now = new Date().toISOString();
  const { error: stageError } = await admin.from("service_order_checklist_stages").update({
    status: "reopened",
    completed_by: null,
    completed_at: null,
    reopened_by: session.created_by,
    reopened_at: now,
  }).eq("organization_id", session.organization_id).eq("id", stage.id);
  if (stageError) throw stageError;

  const { error: checklistError } = await admin.from("service_order_checklists").update({
    status: "in_progress",
    completed_by: null,
    completed_at: null,
  }).eq("organization_id", session.organization_id).eq("id", checklist.id);
  if (checklistError) throw checklistError;

  const { error: eventError } = await admin.from("service_order_checklist_events").insert({
    organization_id: session.organization_id,
    checklist_id: checklist.id,
    service_order_id: session.service_order_id,
    stage_id: stage.id,
    event_type: "stage_reopened",
    payload: {},
    created_by: session.created_by,
  });
  if (eventError) throw eventError;

  await touchSession(admin, session, { order_updated_at: now });
  return { success: true, reopened_at: now };
}

async function uploadPhoto(context: any) {
  const { input, admin } = context;
  const session = await sessionByToken(admin, input.session_id, input.token);
  if (!session) throw Object.assign(new Error("A conexão expirou ou foi encerrada."), { status: 401 });

  await requireSessionPermission(admin, session, "orders.checklists.manage", "Seu acesso para preencher checklists foi removido.");
  const { item, stage, checklist } = await itemContext(admin, session, input.item_id);
  if (stage.status === "completed") throw Object.assign(new Error("Reabra a etapa antes de anexar novas fotos."), { status: 409 });
  await requireCurrentStage(admin, session, checklist.id, stage.id);

  const file = input.file;
  if (!(file instanceof File)) throw Object.assign(new Error("Nenhuma foto recebida."), { status: 400 });
  if (!ACCEPTED_IMAGE_TYPES.has(file.type) || file.size <= 0 || file.size > MAX_IMAGE_BYTES) {
    throw Object.assign(new Error("Use JPG, PNG ou WebP com até 10 MB."), { status: 400 });
  }

  const extension = extensionFor(file);
  const storagePath = `orders/${session.organization_id}/${session.service_order_id}/checklists/${checklist.id}/${item.id}/mobile/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await admin.storage.from("service-images")
    .upload(storagePath, file, { contentType: file.type, cacheControl: "3600", upsert: false });
  if (uploadError) throw uploadError;

  let mediaId = "";
  try {
    const { data: media, error: mediaError } = await admin.from("media").insert({
      organization_id: session.organization_id,
      bucket_id: "service-images",
      storage_path: storagePath,
      file_name: safeFileName(file.name || `foto.${extension}`),
      mime_type: file.type,
      file_size: file.size,
      uploaded_by: session.created_by,
    }).select("id").single();
    if (mediaError) throw mediaError;
    mediaId = String(media.id);

    const { error: linkError } = await admin.from("service_order_checklist_item_media").insert({
      organization_id: session.organization_id,
      item_id: item.id,
      media_id: mediaId,
      created_by: session.created_by,
    });
    if (linkError) throw linkError;

    const { error: orderMediaError } = await admin.from("service_order_media").upsert({
      organization_id: session.organization_id,
      service_order_id: session.service_order_id,
      media_id: mediaId,
      sort_order: 500,
    }, { onConflict: "service_order_id,media_id", ignoreDuplicates: true });
    if (orderMediaError) throw orderMediaError;

    if (stage.situation_id_snapshot) {
      const { error: situationMediaError } = await admin.from("service_order_situation_media").upsert({
        organization_id: session.organization_id,
        service_order_id: session.service_order_id,
        situation_id: stage.situation_id_snapshot,
        media_id: mediaId,
        uploaded_by: session.created_by,
      }, { onConflict: "service_order_id,situation_id,media_id", ignoreDuplicates: true });
      if (situationMediaError) throw situationMediaError;
    }

    const { error: eventError } = await admin.from("service_order_checklist_events").insert({
      organization_id: session.organization_id,
      checklist_id: checklist.id,
      service_order_id: session.service_order_id,
      stage_id: stage.id,
      item_id: item.id,
      event_type: "media_attached",
      payload: { media_id: mediaId },
      created_by: session.created_by,
    });
    if (eventError) throw eventError;

    const now = new Date().toISOString();
    await touchSession(admin, session, { order_updated_at: now });
    return { success: true, media_id: mediaId, saved_at: now };
  } catch (error) {
    if (mediaId) {
      try { await admin.from("media").delete().eq("id", mediaId); } catch { /* noop */ }
    }
    try { await admin.storage.from("service-images").remove([storagePath]); } catch { /* noop */ }
    throw error;
  }
}

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ success: false, error: "Método não permitido." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return json({ success: false, error: "Checklist móvel não configurado no servidor." }, 500);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const isMultipart = request.headers.get("content-type")?.includes("multipart/form-data") === true;
    const input: Record<string, any> = isMultipart
      ? Object.fromEntries((await request.formData()).entries())
      : await request.json().catch(() => ({}));
    const context = { request, input, admin, supabaseUrl, anonKey };
    const action = text(input.action, 50);

    if (action === "create_session") return json(await createSession(context));
    if (action === "pair_code") return json(await pairCode(context));
    if (action === "status") return json(await publicStatus(context));
    if (action === "poll_session") return json(await ownerPoll(context));
    if (action === "close_session") return json(await closeSession(context));
    if (action === "get") return json(await getChecklist(context));
    if (action === "save_item") return json(await saveItem(context));
    if (action === "complete_stage") return json(await completeStage(context));
    if (action === "reopen_stage") return json(await reopenStage(context));
    if (action === "upload_photo") return json(await uploadPhoto(context));

    return json({ success: false, error: "Ação de checklist móvel inválida." }, 400);
  } catch (error) {
    const status = Number((error as any)?.status) || 400;
    console.error("[ORDER MOBILE CHECKLIST]", error instanceof Error ? error.message : error);
    return json(
      { success: false, error: error instanceof Error ? error.message : "Não foi possível usar o checklist pelo celular." },
      status >= 400 && status < 600 ? status : 400,
    );
  }
});
