import { createClient } from "npm:@supabase/supabase-js@2.112.3";
import { normalizeEmployeeIds, normalizeTechnicalValues, sanitizeMobileOrderPatch } from "./order-mobile-edit-policy.mjs";

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
  purpose: "capture" | "order_edit";
  service_order_id: string | null;
  order_updated_at: string | null;
  equipment_type_id: string | null;
};

function text(value: unknown, max = 500) {
  return String(value ?? "").trim().slice(0, max);
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
  if (!member?.role_id) return false;
  const { data, error } = await admin.from("role_permissions").select("permission:permissions!inner(key)")
    .eq("role_id", member.role_id).eq("permission.key", permissionKey).limit(1);
  if (error) throw error;
  return Boolean(data?.length);
}

async function orderById(admin: AdminClient, organizationId: string, orderId: string) {
  const { data, error } = await admin.from("service_orders").select(
    "id,organization_id,os_number,customer_id,created_at,updated_at,is_solved,completed_at,cancelled_at,serial_number,general_service_id,service_type_id,status_id,situation_id,equipment_type_id,equipment_brand_id,equipment_model_id,model,accessories,equipment_condition,priority,scheduled_at,started_at,internal_notes,customer_notes,estimated_price,order_type,service_state,service_city,service_street,service_zip_code,service_neighborhood,service_number,service_complement,external_os_number,customer:customers(id,full_name,document,phone,whatsapp,email)"
  ).eq("organization_id", organizationId).eq("id", orderId).maybeSingle();
  if (error) throw error;
  if (!data) throw Object.assign(new Error("OS não encontrada."), { status: 404 });
  return data as any;
}

function assertEditableOrder(order: any) {
  if (order?.is_solved || order?.completed_at || order?.cancelled_at) {
    throw Object.assign(new Error("Esta OS não pode mais ser editada por esta conexão móvel."), { status: 409 });
  }
}

async function sessionByToken(admin: AdminClient, sessionId: unknown, rawToken: unknown) {
  const id = requireUuid(sessionId, "Sessão");
  const token = text(rawToken, 512);
  if (!token) return null;
  let query = admin.from("device_capture_sessions").select(SESSION_SELECT).eq("id", id).eq("purpose", "order_edit");
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
    .eq("id", id).eq("created_by", userId).eq("purpose", "order_edit").maybeSingle();
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

async function scopedId(admin: AdminClient, table: string, organizationId: string, id: unknown, extra?: { column: string; value: string }) {
  const value = text(id, 64);
  if (!value) return null;
  let query = admin.from(table).select("id").eq("organization_id", organizationId).eq("id", value);
  if (extra) query = query.eq(extra.column, extra.value);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) throw Object.assign(new Error("Uma opção selecionada não pertence à empresa ou não está mais disponível."), { status: 400 });
  return value;
}

async function employeeIds(admin: AdminClient, organizationId: string, ids: string[]) {
  if (!ids.length) return [];
  const { data, error } = await admin.from("employees").select("id").eq("organization_id", organizationId).eq("is_active", true).in("id", ids);
  if (error) throw error;
  const found = new Set((data || []).map(item => String(item.id)));
  if (ids.some(id => !found.has(id))) throw Object.assign(new Error("Um funcionário selecionado não está disponível."), { status: 400 });
  return ids;
}

async function loadMobileEditor(admin: AdminClient, session: MobileSession) {
  const order = await orderById(admin, session.organization_id, session.service_order_id!);
  assertEditableOrder(order);
  const organizationId = session.organization_id;
  const equipmentTypeId = order.equipment_type_id || null;

  const [statuses, situations, serviceTypes, generalServices, equipmentTypes, equipmentBrands, equipmentModels, employees, technicians, sellers, technicalValues, technicalFields] = await Promise.all([
    admin.from("order_statuses").select("id,name,color,sort_order").eq("organization_id", organizationId).order("sort_order"),
    admin.from("os_situations").select("id,name,color,hours,sort_order,is_active").eq("organization_id", organizationId).eq("is_active", true).order("sort_order"),
    admin.from("service_types").select("id,title,sort_order,is_active").eq("organization_id", organizationId).eq("is_active", true).order("sort_order").order("title"),
    admin.from("general_services").select("id,name,price,sort_order,is_active").eq("organization_id", organizationId).eq("is_active", true).order("sort_order").order("name"),
    admin.from("equipment_types").select("id,name,sort_order,is_active").eq("organization_id", organizationId).eq("is_active", true).order("sort_order").order("name"),
    admin.from("equipment_brands").select("id,name,equipment_type_id,sort_order,is_active").eq("organization_id", organizationId).eq("is_active", true).order("sort_order").order("name"),
    admin.from("equipment_models").select("id,name,equipment_brand_id,sort_order,is_active").eq("organization_id", organizationId).eq("is_active", true).order("sort_order").order("name"),
    admin.from("employees").select("id,full_name,is_active").eq("organization_id", organizationId).eq("is_active", true).order("full_name"),
    admin.from("service_order_technicians").select("employee_id").eq("organization_id", organizationId).eq("service_order_id", order.id),
    admin.from("service_order_sellers").select("employee_id").eq("organization_id", organizationId).eq("service_order_id", order.id),
    admin.from("service_order_technical_values").select("technical_field_id,field_key_snapshot,label_snapshot,field_type_snapshot,value_text,value_number").eq("organization_id", organizationId).eq("service_order_id", order.id),
    equipmentTypeId
      ? admin.from("equipment_type_technical_fields").select("technical_field_id,required,sort_order,technical_field:technical_fields(id,field_key,label,field_type,is_active,sort_order)").eq("organization_id", organizationId).eq("equipment_type_id", equipmentTypeId).order("sort_order")
      : Promise.resolve({ data: [], error: null }),
  ]);

  for (const result of [statuses, situations, serviceTypes, generalServices, equipmentTypes, equipmentBrands, equipmentModels, employees, technicians, sellers, technicalValues, technicalFields]) {
    if (result.error) throw result.error;
  }

  return {
    order,
    options: {
      statuses: statuses.data || [],
      situations: situations.data || [],
      service_types: serviceTypes.data || [],
      general_services: generalServices.data || [],
      equipment_types: equipmentTypes.data || [],
      equipment_brands: equipmentBrands.data || [],
      equipment_models: equipmentModels.data || [],
      employees: employees.data || [],
    },
    technician_ids: (technicians.data || []).map(item => String(item.employee_id)),
    seller_ids: (sellers.data || []).map(item => String(item.employee_id)),
    technical_values: Object.fromEntries((technicalValues.data || []).map((item: any) => [String(item.technical_field_id), item.field_type_snapshot === "number" ? String(item.value_number ?? "") : String(item.value_text ?? "")])),
    technical_fields: technicalFields.data || [],
  };
}

async function saveTechnicalValues(admin: AdminClient, session: MobileSession, equipmentTypeId: string | null, valuesInput: unknown) {
  const values = normalizeTechnicalValues(valuesInput);
  const ids = Object.keys(values);
  if (!equipmentTypeId || !ids.length) return;
  const { data: links, error } = await admin.from("equipment_type_technical_fields")
    .select("technical_field_id,technical_field:technical_fields(id,field_key,label,field_type,is_active)")
    .eq("organization_id", session.organization_id).eq("equipment_type_id", equipmentTypeId).in("technical_field_id", ids);
  if (error) throw error;
  const byId = new Map((links || []).map((link: any) => [String(link.technical_field_id), link.technical_field]));
  if (ids.some(id => !byId.has(id))) throw Object.assign(new Error("Um campo técnico não pertence ao equipamento selecionado."), { status: 400 });
  const rows = ids.map(fieldId => {
    const field: any = byId.get(fieldId);
    const raw = values[fieldId] || "";
    return {
      organization_id: session.organization_id,
      service_order_id: session.service_order_id,
      technical_field_id: fieldId,
      field_key_snapshot: String(field.field_key || fieldId),
      label_snapshot: String(field.label || "Campo técnico"),
      field_type_snapshot: String(field.field_type || "text"),
      value_text: field.field_type === "number" ? null : raw || null,
      value_number: field.field_type === "number" && raw !== "" && Number.isFinite(Number(raw.replace(",", "."))) ? Number(raw.replace(",", ".")) : null,
      updated_at: new Date().toISOString(),
    };
  });
  const { error: upsertError } = await admin.from("service_order_technical_values").upsert(rows, { onConflict: "service_order_id,technical_field_id" });
  if (upsertError) throw upsertError;
}

async function replaceEmployees(admin: AdminClient, session: MobileSession, technicianInput: unknown, sellerInput: unknown) {
  const technicians = await employeeIds(admin, session.organization_id, normalizeEmployeeIds(technicianInput));
  const sellers = await employeeIds(admin, session.organization_id, normalizeEmployeeIds(sellerInput));
  const { error: technicianDeleteError } = await admin.from("service_order_technicians").delete().eq("organization_id", session.organization_id).eq("service_order_id", session.service_order_id!);
  if (technicianDeleteError) throw technicianDeleteError;
  const { error: sellerDeleteError } = await admin.from("service_order_sellers").delete().eq("organization_id", session.organization_id).eq("service_order_id", session.service_order_id!);
  if (sellerDeleteError) throw sellerDeleteError;
  if (technicians.length) {
    const { error } = await admin.from("service_order_technicians").insert(technicians.map(employeeId => ({ organization_id: session.organization_id, service_order_id: session.service_order_id, employee_id: employeeId })));
    if (error) throw error;
  }
  if (sellers.length) {
    const { error } = await admin.from("service_order_sellers").insert(sellers.map(employeeId => ({ organization_id: session.organization_id, service_order_id: session.service_order_id, employee_id: employeeId })));
    if (error) throw error;
  }
  return { technicians, sellers };
}

async function createSession(context: any) {
  const { request, input, admin, supabaseUrl, anonKey } = context;
  const user = await authenticatedUser(request, supabaseUrl, anonKey);
  if (!user) throw Object.assign(new Error("Usuário não autenticado."), { status: 401 });
  const organizationId = requireUuid(input.organization_id, "Empresa");
  const orderId = requireUuid(input.service_order_id, "OS");
  if (!(await memberHasPermission(admin, organizationId, user.id, "orders.edit"))) {
    throw Object.assign(new Error("Você não possui permissão para editar esta OS."), { status: 403 });
  }
  const order = await orderById(admin, organizationId, orderId);
  assertEditableOrder(order);
  const now = new Date();
  await admin.from("device_capture_sessions").update({ status: "closed", updated_at: now.toISOString() })
    .eq("created_by", user.id).eq("organization_id", organizationId).eq("service_order_id", orderId).eq("purpose", "order_edit").eq("status", "active");

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
      purpose: "order_edit",
      service_order_id: orderId,
      equipment_type_id: order.equipment_type_id || null,
      expires_at: expiresAt,
    }).select(SESSION_SELECT).single();
    if (!error && data) created = data;
    else if (error?.code !== "23505") throw error;
  }
  if (!created || !pairingCode) throw new Error("Não foi possível gerar uma conexão móvel única.");
  return { success: true, session: { id: created.id, token, pairing_code: pairingCode, expires_at: created.expires_at, service_order_id: orderId, os_number: order.os_number } };
}

async function pairCode(context: any) {
  const { input, admin } = context;
  const code = normalizePairingCode(input.code);
  if (!code) throw Object.assign(new Error("Digite os 8 números do código de conexão."), { status: 400 });
  const { data, error } = await admin.from("device_capture_sessions").select(SESSION_SELECT)
    .eq("purpose", "order_edit").eq("pairing_code_hash", await pairingCodeHash(code)).eq("status", "active").gt("expires_at", new Date().toISOString()).maybeSingle();
  if (error) throw error;
  if (!data?.service_order_id) throw Object.assign(new Error("Código inválido ou expirado."), { status: 404 });
  return { success: true, session: { id: data.id, token: `code:${code}`, expires_at: data.expires_at, service_order_id: data.service_order_id } };
}

async function publicStatus(context: any) {
  const { input, admin } = context;
  const session = await sessionByToken(admin, input.session_id, input.token);
  if (!session) throw Object.assign(new Error("A conexão expirou ou foi encerrada."), { status: 401 });
  await touchSession(admin, session);
  const order = await orderById(admin, session.organization_id, session.service_order_id!);
  assertEditableOrder(order);
  return { success: true, expires_at: session.expires_at, service_order_id: session.service_order_id, os_number: order.os_number, order_updated_at: session.order_updated_at };
}

async function ownerPoll(context: any) {
  const { request, input, admin, supabaseUrl, anonKey } = context;
  const user = await authenticatedUser(request, supabaseUrl, anonKey);
  if (!user) throw Object.assign(new Error("Usuário não autenticado."), { status: 401 });
  const session = await ownedSession(admin, input.session_id, user.id);
  if (!session) throw Object.assign(new Error("Sessão móvel não encontrada."), { status: 404 });
  const expired = new Date(session.expires_at).getTime() <= Date.now();
  if (expired && session.status === "active") await admin.from("device_capture_sessions").update({ status: "expired", updated_at: new Date().toISOString() }).eq("id", session.id);
  const lastSeen = session.last_seen_at ? new Date(session.last_seen_at).getTime() : 0;
  return { success: true, status: expired ? "expired" : session.status, connected: Boolean(session.connected_at) && Date.now() - lastSeen < 35_000 && !expired && session.status === "active", expires_at: session.expires_at, order_updated_at: session.order_updated_at };
}

async function closeSession(context: any) {
  const { request, input, admin, supabaseUrl, anonKey } = context;
  const user = await authenticatedUser(request, supabaseUrl, anonKey);
  if (!user) throw Object.assign(new Error("Usuário não autenticado."), { status: 401 });
  const session = await ownedSession(admin, input.session_id, user.id);
  if (!session) return { success: true };
  const { error } = await admin.from("device_capture_sessions").update({ status: "closed", updated_at: new Date().toISOString() }).eq("id", session.id);
  if (error) throw error;
  return { success: true };
}

async function getEditor(context: any) {
  const { input, admin } = context;
  const session = await sessionByToken(admin, input.session_id, input.token);
  if (!session) throw Object.assign(new Error("A conexão expirou ou foi encerrada."), { status: 401 });
  await touchSession(admin, session);
  return { success: true, expires_at: session.expires_at, ...(await loadMobileEditor(admin, session)) };
}

async function saveEditor(context: any) {
  const { input, admin } = context;
  const session = await sessionByToken(admin, input.session_id, input.token);
  if (!session) throw Object.assign(new Error("A conexão expirou ou foi encerrada."), { status: 401 });
  const order = await orderById(admin, session.organization_id, session.service_order_id!);
  assertEditableOrder(order);
  const patch: Record<string, any> = sanitizeMobileOrderPatch(input.patch);

  await scopedId(admin, "order_statuses", session.organization_id, patch.status_id);
  await scopedId(admin, "os_situations", session.organization_id, patch.situation_id);
  await scopedId(admin, "service_types", session.organization_id, patch.service_type_id);
  await scopedId(admin, "general_services", session.organization_id, patch.general_service_id);
  await scopedId(admin, "equipment_types", session.organization_id, patch.equipment_type_id);
  if (patch.equipment_brand_id) await scopedId(admin, "equipment_brands", session.organization_id, patch.equipment_brand_id, patch.equipment_type_id ? { column: "equipment_type_id", value: patch.equipment_type_id } : undefined);
  if (patch.equipment_model_id) await scopedId(admin, "equipment_models", session.organization_id, patch.equipment_model_id, patch.equipment_brand_id ? { column: "equipment_brand_id", value: patch.equipment_brand_id } : undefined);

  if (patch.order_type === "internal") {
    Object.assign(patch, {
      service_state: null,
      service_city: null,
      service_street: null,
      service_zip_code: null,
      service_neighborhood: null,
      service_number: null,
      service_complement: null,
      service_customer_address_id: null,
    });
  }

  const relations = await replaceEmployees(admin, session, input.technician_ids, input.seller_ids);
  patch.technician_id = relations.technicians[0] || null;
  patch.seller_id = relations.sellers[0] || null;
  patch.updated_at = new Date().toISOString();
  const { data: updated, error } = await admin.from("service_orders").update(patch)
    .eq("organization_id", session.organization_id).eq("id", session.service_order_id!).select("id,updated_at,equipment_type_id").single();
  if (error) throw error;
  await saveTechnicalValues(admin, session, updated.equipment_type_id || null, input.technical_values);
  const savedAt = new Date().toISOString();
  await touchSession(admin, session, { order_updated_at: savedAt, equipment_type_id: updated.equipment_type_id || null });
  return { success: true, saved_at: savedAt, order_updated_at: updated.updated_at };
}

async function uploadPhoto(context: any) {
  const { input, admin } = context;
  const session = await sessionByToken(admin, input.session_id, input.token);
  if (!session) throw Object.assign(new Error("A conexão expirou ou foi encerrada."), { status: 401 });
  const order = await orderById(admin, session.organization_id, session.service_order_id!);
  assertEditableOrder(order);
  const kind = text(input.kind, 20);
  if (kind !== "label" && kind !== "equipment") throw Object.assign(new Error("Tipo de foto inválido."), { status: 400 });
  const file = input.file;
  if (!(file instanceof File)) throw Object.assign(new Error("Nenhuma foto recebida."), { status: 400 });
  if (!ACCEPTED_IMAGE_TYPES.has(file.type) || file.size <= 0 || file.size > MAX_IMAGE_BYTES) throw Object.assign(new Error("Use JPG, PNG ou WebP com até 10 MB."), { status: 400 });

  const extension = extensionFor(file);
  const storagePath = `orders/${session.organization_id}/${session.service_order_id}/mobile/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await admin.storage.from("service-images").upload(storagePath, file, { contentType: file.type, cacheControl: "3600", upsert: false });
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

    const { data: links, error: linksError } = await admin.from("service_order_media").select("sort_order").eq("organization_id", session.organization_id).eq("service_order_id", session.service_order_id!);
    if (linksError) throw linksError;
    const base = kind === "label" ? 500 : 0;
    const ceiling = kind === "label" ? 1000 : 500;
    const used = (links || []).map(item => Number(item.sort_order)).filter(value => value >= base && value < ceiling);
    const sortOrder = used.length ? Math.max(...used) + 1 : base;
    if (sortOrder >= ceiling) throw new Error("Limite de imagens desta categoria atingido.");
    const { error: linkError } = await admin.from("service_order_media").insert({ organization_id: session.organization_id, service_order_id: session.service_order_id, media_id: mediaId, sort_order: sortOrder });
    if (linkError) throw linkError;

    const savedAt = new Date().toISOString();
    await touchSession(admin, session, { order_updated_at: savedAt });
    return { success: true, media_id: mediaId, kind, saved_at: savedAt };
  } catch (error) {
    if (mediaId) await admin.from("media").delete().eq("id", mediaId).catch(() => undefined);
    await admin.storage.from("service-images").remove([storagePath]).catch(() => undefined);
    throw error;
  }
}

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ success: false, error: "Método não permitido." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return json({ success: false, error: "Edição móvel não configurada no servidor." }, 500);

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const isMultipart = request.headers.get("content-type")?.includes("multipart/form-data") === true;
    const input: Record<string, any> = isMultipart ? Object.fromEntries((await request.formData()).entries()) : await request.json().catch(() => ({}));
    const context = { request, input, admin, supabaseUrl, anonKey };
    const action = text(input.action, 50);
    if (action === "create_session") return json(await createSession(context));
    if (action === "pair_code") return json(await pairCode(context));
    if (action === "status") return json(await publicStatus(context));
    if (action === "poll_session") return json(await ownerPoll(context));
    if (action === "close_session") return json(await closeSession(context));
    if (action === "get") return json(await getEditor(context));
    if (action === "save") return json(await saveEditor(context));
    if (action === "upload_photo") return json(await uploadPhoto(context));
    return json({ success: false, error: "Ação de edição móvel inválida." }, 400);
  } catch (error) {
    const status = Number((error as any)?.status) || 400;
    console.error("[ORDER MOBILE EDIT]", error instanceof Error ? error.message : error);
    return json({ success: false, error: error instanceof Error ? error.message : "Não foi possível editar a OS pelo celular." }, status >= 400 && status < 600 ? status : 400);
  }
});
