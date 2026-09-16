import { createClient } from "npm:@supabase/supabase-js@2.112.3";
import {
  canonicalStringify,
  decryptSecret,
  encryptSecret,
  hmacHex,
  maskDocument,
  normalizeDocument,
  randomToken,
  randomVerificationCode,
  sha256Hex,
} from "./signature-crypto.mjs";
import { renderFrozenSnapshotHtml, sanitizeFrozenSnapshot } from "./signature-snapshot.mjs";

const PLATFORM_ORGANIZATION_ID = "00000000-0000-4000-8000-000000000001";
const CONSENT_TEXT = "Li e concordo com o conteúdo deste documento e reconheço esta assinatura eletrônica.";
const MAX_SNAPSHOT_BYTES = 1_000_000;
const ACTIVE_STATUSES = new Set(["pending", "viewed"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SUMMARY_SELECT = [
  "id", "organization_id", "service_order_id", "print_template_id", "status", "verification_code",
  "expires_at", "created_at", "first_viewed_at", "signed_at", "cancelled_at", "last_email_sent_at",
  "require_external_signature", "require_employee_signature", "external_signer_type", "external_signer_name",
  "external_signer_email", "external_signer_phone", "external_document_masked", "employee_entity_id",
  "template_name_snapshot", "order_number_snapshot",
].join(",");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json" },
});

function text(value: unknown, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function requireUuid(value: unknown, label: string) {
  const normalized = text(value, 64);
  if (!UUID_PATTERN.test(normalized)) throw new Error(`${label} inválido.`);
  return normalized;
}

function clientIp(request: Request) {
  return text(
    request.headers.get("cf-connecting-ip")
      || request.headers.get("x-real-ip")
      || request.headers.get("x-forwarded-for")?.split(",")[0]
      || "",
    80,
  ) || null;
}

function requestUserAgent(request: Request) {
  return text(request.headers.get("user-agent"), 500) || null;
}

function publicBaseUrl(request: Request) {
  const configured = text(
    Deno.env.get("SIGNATURE_PUBLIC_BASE_URL") || Deno.env.get("SITE_URL") || Deno.env.get("APP_URL"),
    500,
  );
  const fallback = text(request.headers.get("origin"), 500);
  const value = (configured || fallback).replace(/\/+$/, "");
  return /^https?:\/\//i.test(value) ? value : null;
}

function maskEmail(value: string) {
  const [local, domain] = value.split("@");
  if (!domain) return "***";
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}${"*".repeat(Math.max(1, local.length - visible.length))}@${domain}`;
}

function createClients(request: Request) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) throw new Error("Supabase da assinatura não configurado.");
  const authorization = request.headers.get("Authorization") || "";
  return {
    authClient: createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    }),
    adminClient: createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
  };
}

async function authenticatedUser(authClient: any, request: Request) {
  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await authClient.auth.getUser(token);
  if (error) return null;
  return data.user || null;
}

async function roleHasPermission(adminClient: any, roleId: string | null, permissionKey: string) {
  if (!roleId) return false;
  const { data, error } = await adminClient
    .from("role_permissions")
    .select("permission_id,permissions!inner(key)")
    .eq("role_id", roleId)
    .eq("permissions.key", permissionKey)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

async function userHasOverride(adminClient: any, organizationId: string, userId: string, permissionKey: string) {
  const { data, error } = await adminClient
    .from("user_permission_overrides")
    .select("permission_id,permissions!inner(key)")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .eq("permissions.key", permissionKey)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

async function membershipPermission(adminClient: any, userId: string, organizationId: string, permissionKey: string) {
  const { data: membership, error } = await adminClient
    .from("organization_members")
    .select("role_id,status")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!membership || membership.status !== "active") return false;
  return await roleHasPermission(adminClient, membership.role_id, permissionKey)
    || await userHasOverride(adminClient, organizationId, userId, permissionKey);
}

async function hasEffectivePermission(adminClient: any, userId: string, organizationId: string, permissionKey: string) {
  const { data: organization, error } = await adminClient
    .from("organizations")
    .select("id,status")
    .eq("id", organizationId)
    .maybeSingle();
  if (error) throw error;
  if (!organization || organization.status !== "active") return false;
  if (await membershipPermission(adminClient, userId, organizationId, permissionKey)) return true;
  if (organizationId === PLATFORM_ORGANIZATION_ID) return false;
  return membershipPermission(adminClient, userId, PLATFORM_ORGANIZATION_ID, permissionKey);
}

async function requirePermission(adminClient: any, userId: string, organizationId: string, key: string) {
  if (!await hasEffectivePermission(adminClient, userId, organizationId, key)) {
    throw Object.assign(new Error("Você não possui permissão para esta ação."), { status: 403 });
  }
}

async function ensureOrderVisible(authClient: any, organizationId: string, serviceOrderId: string) {
  const { data, error } = await authClient
    .from("service_orders")
    .select("id")
    .eq("id", serviceOrderId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error || !data) throw Object.assign(new Error("OS não encontrada ou sem permissão de acesso."), { status: 403 });
}

async function loadOrder(adminClient: any, organizationId: string, serviceOrderId: string) {
  const { data, error } = await adminClient
    .from("service_orders")
    .select("id,organization_id,os_number,external_os_number,customer_id,assigned_to,technician_id,completed_by")
    .eq("organization_id", organizationId)
    .eq("id", serviceOrderId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Ordem de Serviço não encontrada.");
  return data;
}

async function loadCustomer(adminClient: any, organizationId: string, customerId: string | null) {
  if (!customerId) return null;
  const { data, error } = await adminClient
    .from("customers")
    .select("id,full_name,legal_name,trade_name,document,cnpj,email,phone,whatsapp")
    .eq("organization_id", organizationId)
    .eq("id", customerId)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function loadTemplate(adminClient: any, organizationId: string, templateId: string) {
  const { data, error } = await adminClient
    .from("print_templates")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("id", templateId)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.is_active === false || data.allow_online_signature !== true) {
    throw new Error("Este modelo não está disponível para assinatura online.");
  }
  return data;
}

function normalizeFieldKey(key: string) {
  return key === "signatures.technician" ? "signatures.employee" : key;
}

async function loadTemplateFieldKeys(adminClient: any, organizationId: string, templateId: string) {
  const { data: sections, error: sectionError } = await adminClient
    .from("print_template_sections")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("template_id", templateId)
    .eq("is_enabled", true)
    .order("sort_order", { ascending: true });
  if (sectionError) throw sectionError;
  const sectionIds = (sections || []).map((section: any) => section.id);
  if (!sectionIds.length) return [];
  const { data: fields, error: fieldError } = await adminClient
    .from("print_template_fields")
    .select("field_key,sort_order,template_section_id")
    .in("template_section_id", sectionIds)
    .eq("is_enabled", true)
    .order("sort_order", { ascending: true });
  if (fieldError) throw fieldError;
  return (fields || []).map((field: any) => normalizeFieldKey(text(field.field_key, 150))).filter(Boolean);
}

async function loadCompanySnapshot(adminClient: any, organizationId: string) {
  const { data, error } = await adminClient
    .from("organization_company_settings")
    .select("name,legal_name,document,phone,email,zip_code,street,number,complement,neighborhood,city,state")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw error;
  const settings = data || {};
  const address = [
    [settings.street, settings.number].filter(Boolean).join(", "),
    settings.complement,
    settings.neighborhood,
    [settings.city, settings.state].filter(Boolean).join(" - "),
    settings.zip_code ? `CEP ${settings.zip_code}` : "",
  ].filter(Boolean).join(" · ");
  return {
    name: settings.name || "Empresa",
    subtitle: settings.legal_name || "",
    document: settings.document || "",
    phone: settings.phone || "",
    email: settings.email || "",
    address,
  };
}

async function ensureEmployeeEntity(adminClient: any, organizationId: string, entityId: string) {
  const { data: entity, error } = await adminClient
    .from("entities")
    .select("id,organization_id,name,legal_name,trade_name,document,is_active")
    .eq("id", entityId)
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw error;
  if (!entity || entity.is_active === false) throw new Error("Funcionário não encontrado ou inativo.");
  const { data: role, error: roleError } = await adminClient
    .from("entity_roles")
    .select("entity_id")
    .eq("entity_id", entityId)
    .eq("role", "employee")
    .eq("is_active", true)
    .maybeSingle();
  if (roleError) throw roleError;
  if (!role) throw new Error("O cadastro selecionado não possui vínculo Funcionário ativo.");
  return entity;
}

async function entityIdForProfile(adminClient: any, organizationId: string, profileId: string | null) {
  if (!profileId) return null;
  const { data: details, error } = await adminClient
    .from("entity_employee_details")
    .select("entity_id")
    .eq("profile_id", profileId)
    .limit(5);
  if (error) throw error;
  const candidates: string[] = [];
  for (const detail of details || []) {
    const { data: entity } = await adminClient
      .from("entities")
      .select("id")
      .eq("id", detail.entity_id)
      .eq("organization_id", organizationId)
      .maybeSingle();
    if (entity?.id) candidates.push(entity.id);
  }
  if (candidates.length > 1) throw new Error("Há mais de um funcionário vinculado ao mesmo usuário. Selecione manualmente.");
  return candidates[0] || null;
}

async function entityIdForLegacyEmployee(adminClient: any, organizationId: string, employeeId: string | null) {
  if (!employeeId) return null;
  const { data, error } = await adminClient
    .from("entities")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("legacy_employee_id", employeeId)
    .maybeSingle();
  if (error) throw error;
  return data?.id || null;
}

async function resolveEmployeeEntity(adminClient: any, organizationId: string, order: any, template: any, manualEntityId: string | null) {
  if (template.require_employee_signature !== true) return null;
  const source = text(template.employee_signature_source, 40);
  let entityId: string | null = null;
  if (source === "manual") {
    if (!manualEntityId) throw new Error("Selecione o funcionário que assinará o documento.");
    entityId = requireUuid(manualEntityId, "Funcionário");
  } else if (source === "responsible") {
    entityId = await entityIdForProfile(adminClient, organizationId, order.assigned_to || null);
    if (!entityId) throw new Error("O responsável pela OS não possui cadastro de funcionário vinculado.");
  } else if (source === "completed_by") {
    entityId = await entityIdForProfile(adminClient, organizationId, order.completed_by || null);
    if (!entityId) throw new Error("O usuário que concluiu a OS não possui cadastro de funcionário vinculado.");
  } else if (source === "technician") {
    const technicianIds = new Set<string>();
    if (order.technician_id) technicianIds.add(String(order.technician_id));
    const { data: links, error } = await adminClient
      .from("service_order_technicians")
      .select("employee_id")
      .eq("organization_id", organizationId)
      .eq("service_order_id", order.id);
    if (error) throw error;
    for (const link of links || []) if (link.employee_id) technicianIds.add(String(link.employee_id));
    if (technicianIds.size === 0) throw new Error("A OS não possui técnico definido para assinatura.");
    if (technicianIds.size > 1) throw new Error("A OS possui mais de um técnico. Use um modelo com seleção manual do funcionário.");
    entityId = await entityIdForLegacyEmployee(adminClient, organizationId, [...technicianIds][0]);
    if (!entityId) throw new Error("O técnico da OS não possui cadastro unificado de funcionário.");
  } else {
    throw new Error("A origem da assinatura do funcionário não está configurada no modelo.");
  }
  return ensureEmployeeEntity(adminClient, organizationId, entityId);
}

async function loadActiveEmployeeSignature(adminClient: any, organizationId: string, entityId: string) {
  const { data, error } = await adminClient
    .from("employee_signatures")
    .select("id,organization_id,entity_id,version,storage_path,signature_hash,created_at")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Cadastre a assinatura deste funcionário antes de enviar o documento.");
  return data;
}

async function resolveExternalSigner(adminClient: any, organizationId: string, order: any, template: any, input: any) {
  if (template.require_external_signature !== true) return null;
  const signerType = text(input?.type, 20);
  const customer = await loadCustomer(adminClient, organizationId, order.customer_id || null);
  if (signerType === "customer") {
    if (!customer) throw new Error("A OS não possui cliente válido para assinatura.");
    return {
      type: "customer",
      name: text(customer.full_name || customer.trade_name || customer.legal_name, 220),
      document: normalizeDocument(customer.cnpj || customer.document),
      email: text(customer.email, 320).toLowerCase(),
      phone: text(customer.whatsapp || customer.phone, 80) || null,
    };
  }
  if (signerType !== "contact") throw new Error("Selecione quem assinará o documento.");
  let contact: any = null;
  const contactId = text(input?.contact_id, 64);
  if (contactId && customer) {
    const { data: entity, error: entityError } = await adminClient
      .from("entities")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("legacy_customer_id", customer.id)
      .maybeSingle();
    if (entityError) throw entityError;
    if (entity?.id) {
      const { data, error } = await adminClient
        .from("entity_contacts")
        .select("id,name,email,phone,whatsapp,is_active")
        .eq("organization_id", organizationId)
        .eq("entity_id", entity.id)
        .eq("id", contactId)
        .eq("is_active", true)
        .maybeSingle();
      if (error) throw error;
      contact = data || null;
    }
    if (!contact) throw new Error("O contato selecionado não pertence ao cliente desta OS ou está inativo.");
  }
  return {
    type: "contact",
    name: text(contact?.name || input?.name, 220),
    document: normalizeDocument(input?.document),
    email: text(contact?.email || input?.email, 320).toLowerCase(),
    phone: text(contact?.whatsapp || contact?.phone || input?.phone, 80) || null,
  };
}

function validateExternalSigner(signer: any) {
  if (!signer?.name) throw new Error("Informe o nome do assinante.");
  if (![11, 14].includes(String(signer.document || "").length)) throw new Error("Informe um CPF ou CNPJ válido para confirmação da assinatura.");
  if (!EMAIL_PATTERN.test(String(signer.email || ""))) throw new Error("Informe um e-mail válido para o assinante.");
}

async function sendInviteEmail({ recipient, signerName, documentName, orderNumber, expiresAt, link, companyName }: any) {
  const resendApiKey = Deno.env.get("RESEND_API_KEY");
  const emailFrom = Deno.env.get("DOCUMENT_SIGNATURE_EMAIL_FROM") || Deno.env.get("ORDER_DOCUMENT_EMAIL_FROM");
  if (!resendApiKey || !emailFrom) {
    throw new Error("Configure RESEND_API_KEY e DOCUMENT_SIGNATURE_EMAIL_FROM/ORDER_DOCUMENT_EMAIL_FROM na Edge Function.");
  }
  const expiration = new Date(expiresAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const safeCompany = text(companyName, 220).replace(/[<>]/g, "");
  const safeSigner = text(signerName, 220).replace(/[<>]/g, "");
  const safeDocument = text(documentName, 220).replace(/[<>]/g, "");
  const safeOrder = text(orderNumber, 100).replace(/[<>]/g, "");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${resendApiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: emailFrom,
      to: [recipient],
      subject: `${safeDocument} — assinatura eletrônica — OS ${safeOrder}`,
      html: `<div style="font-family:Arial,sans-serif;color:#172536;line-height:1.55"><h2 style="margin:0 0 12px">${safeCompany}</h2><p>Olá, ${safeSigner}.</p><p>Você recebeu o documento <strong>${safeDocument}</strong>, referente à OS <strong>${safeOrder}</strong>, para assinatura eletrônica.</p><p><a href="${link}" style="display:inline-block;background:#0057e7;color:white;text-decoration:none;padding:12px 18px;border-radius:8px;font-weight:700">Abrir documento para assinatura</a></p><p style="font-size:12px;color:#526174">Este link expira em ${expiration}. Para sua segurança, o documento só será exibido após confirmação de identidade e código enviado por e-mail.</p></div>`,
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(result?.message || "O provedor recusou o envio do e-mail."));
  return result?.id || null;
}

async function recordEvent(
  adminClient: any,
  request: Request,
  row: { id: string; organization_id: string },
  eventType: string,
  actorType: "admin" | "external" | "system",
  actorUserId: string | null,
  metadata: Record<string, unknown> = {},
) {
  const { error } = await adminClient.from("document_signature_events").insert({
    request_id: row.id,
    organization_id: row.organization_id,
    event_type: eventType,
    actor_type: actorType,
    actor_user_id: actorUserId,
    ip_address: clientIp(request),
    user_agent: requestUserAgent(request),
    metadata,
  });
  if (error) console.error("[DOCUMENT SIGNATURE EVENT]", eventType, error.message);
}

async function enrichRequests(adminClient: any, rows: any[]) {
  const ids = [...new Set(rows.map(row => row.employee_entity_id).filter(Boolean))];
  const names = new Map<string, string>();
  if (ids.length) {
    const { data, error } = await adminClient.from("entities").select("id,name,trade_name,legal_name").in("id", ids);
    if (error) throw error;
    for (const entity of data || []) names.set(entity.id, entity.name || entity.trade_name || entity.legal_name || "Funcionário");
  }
  return rows.map(row => ({ ...row, employee_name: row.employee_entity_id ? names.get(row.employee_entity_id) || null : null }));
}

async function expireIfNeeded(adminClient: any, request: Request, row: any) {
  if (!ACTIVE_STATUSES.has(row.status) || new Date(row.expires_at).getTime() > Date.now()) return row;
  const { data, error } = await adminClient
    .from("document_signature_requests")
    .update({ status: "expired" })
    .eq("id", row.id)
    .eq("organization_id", row.organization_id)
    .in("status", ["pending", "viewed"])
    .select(SUMMARY_SELECT)
    .maybeSingle();
  if (error) throw error;
  if (data) {
    await recordEvent(adminClient, request, data, "expired", "system", null);
    return data;
  }
  return row;
}

async function getRequest(adminClient: any, organizationId: string, requestId: string) {
  const { data, error } = await adminClient
    .from("document_signature_requests")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("id", requestId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Solicitação de assinatura não encontrada.");
  return data;
}

async function createAction(context: any) {
  const { request, body, user, authClient, adminClient, tokenKey, identityPepper } = context;
  const organizationId = requireUuid(body.organization_id, "Empresa");
  const serviceOrderId = requireUuid(body.service_order_id, "OS");
  const templateId = requireUuid(body.print_template_id, "Modelo");
  await requirePermission(adminClient, user.id, organizationId, "documents.signatures.send");
  await ensureOrderVisible(authClient, organizationId, serviceOrderId);
  const [order, template, fieldKeys, company] = await Promise.all([
    loadOrder(adminClient, organizationId, serviceOrderId),
    loadTemplate(adminClient, organizationId, templateId),
    loadTemplateFieldKeys(adminClient, organizationId, templateId),
    loadCompanySnapshot(adminClient, organizationId),
  ]);

  const { data: activeRows, error: activeError } = await adminClient
    .from("document_signature_requests")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("service_order_id", serviceOrderId)
    .eq("print_template_id", templateId)
    .in("status", ["pending", "viewed"])
    .order("created_at", { ascending: false });
  if (activeError) throw activeError;
  for (const row of activeRows || []) {
    const current = await expireIfNeeded(adminClient, request, row);
    if (ACTIVE_STATUSES.has(current.status)) throw new Error("Já existe uma solicitação ativa deste modelo para esta OS.");
  }

  const rawSnapshot = body.snapshot;
  if (!rawSnapshot || Number(rawSnapshot.schema_version) !== 1) throw new Error("Snapshot do documento inválido.");
  if (text(rawSnapshot?.order?.id, 64) !== order.id || text(rawSnapshot?.template?.id, 64) !== template.id) {
    throw new Error("O snapshot não corresponde à OS e ao modelo selecionados.");
  }
  const currentFields = [...new Set(fieldKeys.map(normalizeFieldKey))];
  const snapshotFields = Array.isArray(rawSnapshot?.template?.selected_fields)
    ? [...new Set(rawSnapshot.template.selected_fields.map((key: unknown) => normalizeFieldKey(text(key, 150))).filter(Boolean))]
    : [];
  if (currentFields.slice().sort().join("|") !== snapshotFields.slice().sort().join("|")) {
    throw new Error("O modelo foi alterado. Reabra o envio para gerar um novo snapshot.");
  }

  const safeSnapshot = sanitizeFrozenSnapshot(rawSnapshot, new Set(currentFields), {
    template: {
      id: template.id,
      name: template.name,
      description: template.description || "",
      document_type: template.document_type,
      paper_size: template.paper_size,
      orientation: template.orientation,
      margin_top: template.margin_top,
      margin_right: template.margin_right,
      margin_bottom: template.margin_bottom,
      margin_left: template.margin_left,
      show_logo: template.show_logo,
      show_company_info: template.show_company_info,
      show_page_number: template.show_page_number,
      show_printed_at: template.show_printed_at,
      header_text: template.header_text || "",
      footer_text: template.footer_text || "",
      layout: template.settings || {},
      selected_fields: currentFields,
    },
    company,
    order: {
      id: order.id,
      organization_id: order.organization_id,
      os_number: String(order.os_number || ""),
      external_os_number: order.external_os_number || "",
    },
  });
  const canonicalSnapshot = canonicalStringify(safeSnapshot);
  if (new TextEncoder().encode(canonicalSnapshot).byteLength > MAX_SNAPSHOT_BYTES) {
    throw new Error("O documento excede o tamanho permitido para assinatura online.");
  }

  const externalSigner = await resolveExternalSigner(adminClient, organizationId, order, template, body.external_signer || null);
  if (externalSigner) validateExternalSigner(externalSigner);
  const employeeEntity = await resolveEmployeeEntity(adminClient, organizationId, order, template, body.manual_employee_entity_id || null);
  const employeeSignature = employeeEntity ? await loadActiveEmployeeSignature(adminClient, organizationId, employeeEntity.id) : null;

  const requestId = crypto.randomUUID();
  const token = randomToken(32);
  const tokenHash = await sha256Hex(token);
  const encrypted = await encryptSecret(tokenKey, token);
  const verificationCode = randomVerificationCode();
  const ttlHours = Math.max(1, Math.min(720, Number(template.signature_link_ttl_hours) || 72));
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000).toISOString();
  const snapshotHash = await sha256Hex(canonicalSnapshot);
  const basePath = `${organizationId}/${order.id}/${requestId}`;
  const snapshotPath = `${basePath}/snapshot.html`;
  const employeeSignaturePath = employeeSignature ? `${basePath}/employee-signature.png` : null;
  const uploadedPaths: string[] = [];

  try {
    const htmlBlob = new Blob([renderFrozenSnapshotHtml(safeSnapshot)], { type: "text/html; charset=utf-8" });
    const { error: snapshotUploadError } = await adminClient.storage
      .from("signed-documents")
      .upload(snapshotPath, htmlBlob, { contentType: "text/html; charset=utf-8", upsert: false, cacheControl: "3600" });
    if (snapshotUploadError) throw snapshotUploadError;
    uploadedPaths.push(snapshotPath);

    if (employeeSignature && employeeSignaturePath) {
      const { data: signatureBlob, error: downloadError } = await adminClient.storage
        .from("employee-signatures")
        .download(employeeSignature.storage_path);
      if (downloadError || !signatureBlob) throw downloadError || new Error("Não foi possível congelar a assinatura do funcionário.");
      const { error: copyError } = await adminClient.storage
        .from("signed-documents")
        .upload(employeeSignaturePath, signatureBlob, { contentType: "image/png", upsert: false, cacheControl: "3600" });
      if (copyError) throw copyError;
      uploadedPaths.push(employeeSignaturePath);
    }

    const { data: previousRows, error: previousError } = await adminClient
      .from("document_signature_requests")
      .select("id")
      .eq("organization_id", organizationId)
      .eq("service_order_id", order.id)
      .eq("print_template_id", template.id)
      .in("status", ["signed", "expired", "cancelled"])
      .order("created_at", { ascending: false })
      .limit(1);
    if (previousError) throw previousError;
    const previousId = previousRows?.[0]?.id || null;
    const externalDocument = externalSigner ? normalizeDocument(externalSigner.document) : "";

    const requestRow = {
      id: requestId,
      organization_id: organizationId,
      service_order_id: order.id,
      print_template_id: template.id,
      status: "pending",
      token_hash: tokenHash,
      token_ciphertext: encrypted.ciphertext,
      token_iv: encrypted.iv,
      verification_code: verificationCode,
      expires_at: expiresAt,
      created_by: user.id,
      supersedes_request_id: previousId,
      require_external_signature: template.require_external_signature === true,
      require_employee_signature: template.require_employee_signature === true,
      external_signer_type: externalSigner?.type || null,
      external_signer_name: externalSigner?.name || null,
      external_signer_email: externalSigner?.email || null,
      external_signer_phone: externalSigner?.phone || null,
      external_document_hmac: externalSigner ? await hmacHex(identityPepper, externalDocument) : null,
      external_document_masked: externalSigner ? maskDocument(externalDocument) : null,
      employee_entity_id: employeeEntity?.id || null,
      employee_signature_id: employeeSignature?.id || null,
      template_name_snapshot: template.name,
      order_number_snapshot: String(order.os_number || ""),
      document_snapshot: safeSnapshot,
      snapshot_hash: snapshotHash,
      snapshot_html_storage_path: snapshotPath,
      employee_signature_storage_path: employeeSignaturePath,
      consent_text_snapshot: CONSENT_TEXT,
    };
    const { data: inserted, error: insertError } = await adminClient
      .from("document_signature_requests")
      .insert(requestRow)
      .select(SUMMARY_SELECT)
      .single();
    if (insertError) throw insertError;

    if (employeeSignature && employeeEntity && employeeSignaturePath) {
      const employeeName = employeeEntity.name || employeeEntity.trade_name || employeeEntity.legal_name || "Funcionário";
      const { error: evidenceError } = await adminClient.from("document_signatures").insert({
        organization_id: organizationId,
        request_id: requestId,
        signer_type: "employee",
        signer_name: employeeName,
        signer_document_masked: employeeEntity.document ? maskDocument(employeeEntity.document) : null,
        employee_entity_id: employeeEntity.id,
        employee_signature_version: employeeSignature.version,
        signature_storage_path: employeeSignaturePath,
        signature_hash: employeeSignature.signature_hash,
        validation_method: "stored_employee_signature",
        consent_accepted: false,
        consent_text_snapshot: null,
      });
      if (evidenceError) console.error("[DOCUMENT SIGNATURE EMPLOYEE EVIDENCE]", evidenceError.message);
    }

    await recordEvent(adminClient, request, inserted, "created", "admin", user.id, {
      template_id: template.id,
      require_external_signature: template.require_external_signature === true,
      require_employee_signature: template.require_employee_signature === true,
      supersedes_request_id: previousId,
    });

    let link: string | null = null;
    let emailWarning: string | null = null;
    if (externalSigner) {
      const baseUrl = publicBaseUrl(request);
      if (!baseUrl) {
        emailWarning = "A URL pública da assinatura não está configurada. Configure SIGNATURE_PUBLIC_BASE_URL.";
      } else {
        link = `${baseUrl}/assinatura/${encodeURIComponent(token)}`;
        try {
          await sendInviteEmail({
            recipient: externalSigner.email,
            signerName: externalSigner.name,
            documentName: template.name,
            orderNumber: String(order.os_number || ""),
            expiresAt,
            link,
            companyName: company.name,
          });
          const sentAt = new Date().toISOString();
          await adminClient.from("document_signature_requests").update({ last_email_sent_at: sentAt }).eq("id", requestId).eq("organization_id", organizationId);
          inserted.last_email_sent_at = sentAt;
          await recordEvent(adminClient, request, inserted, "email_sent", "admin", user.id, { recipient: maskEmail(externalSigner.email) });
        } catch (emailError) {
          emailWarning = emailError instanceof Error ? emailError.message : String(emailError);
          await recordEvent(adminClient, request, inserted, "email_failed", "admin", user.id, { recipient: maskEmail(externalSigner.email) });
        }
      }
    }

    const [summary] = await enrichRequests(adminClient, [inserted]);
    return { success: true, request: summary, link, email_warning: emailWarning };
  } catch (error) {
    if (uploadedPaths.length) {
      try { await adminClient.storage.from("signed-documents").remove(uploadedPaths); } catch { /* best effort cleanup */ }
    }
    throw error;
  }
}

async function listAction(context: any) {
  const { request, body, user, authClient, adminClient } = context;
  const organizationId = requireUuid(body.organization_id, "Empresa");
  const serviceOrderId = requireUuid(body.service_order_id, "OS");
  await requirePermission(adminClient, user.id, organizationId, "documents.signatures.view");
  await ensureOrderVisible(authClient, organizationId, serviceOrderId);
  const { data, error } = await adminClient
    .from("document_signature_requests")
    .select(SUMMARY_SELECT)
    .eq("organization_id", organizationId)
    .eq("service_order_id", serviceOrderId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = [];
  for (const row of data || []) rows.push(await expireIfNeeded(adminClient, request, row));
  return { success: true, requests: await enrichRequests(adminClient, rows) };
}

async function linkAction(context: any) {
  const { request, body, user, authClient, adminClient, tokenKey } = context;
  const organizationId = requireUuid(body.organization_id, "Empresa");
  const requestId = requireUuid(body.request_id, "Solicitação");
  await requirePermission(adminClient, user.id, organizationId, "documents.signatures.view");
  let row = await getRequest(adminClient, organizationId, requestId);
  await ensureOrderVisible(authClient, organizationId, row.service_order_id);
  row = await expireIfNeeded(adminClient, request, row);
  if (!ACTIVE_STATUSES.has(row.status)) throw new Error(row.status === "expired" ? "Este link expirou." : "Esta solicitação não aceita mais assinatura.");
  if (!row.require_external_signature) throw new Error("Este documento não possui assinante externo.");
  const baseUrl = publicBaseUrl(request);
  if (!baseUrl) throw new Error("Configure SIGNATURE_PUBLIC_BASE_URL para gerar o link público.");
  const token = await decryptSecret(tokenKey, row.token_ciphertext, row.token_iv);
  return { success: true, link: `${baseUrl}/assinatura/${encodeURIComponent(token)}` };
}

async function resendEmailAction(context: any) {
  const { request, body, user, authClient, adminClient, tokenKey } = context;
  const organizationId = requireUuid(body.organization_id, "Empresa");
  const requestId = requireUuid(body.request_id, "Solicitação");
  await requirePermission(adminClient, user.id, organizationId, "documents.signatures.resend");
  let row = await getRequest(adminClient, organizationId, requestId);
  await ensureOrderVisible(authClient, organizationId, row.service_order_id);
  row = await expireIfNeeded(adminClient, request, row);
  if (!ACTIVE_STATUSES.has(row.status)) throw new Error(row.status === "expired" ? "Este link expirou. Gere uma nova solicitação." : "Esta solicitação não pode ser reenviada.");
  if (!row.require_external_signature || !row.external_signer_email) throw new Error("Esta solicitação não possui assinante externo com e-mail.");
  const baseUrl = publicBaseUrl(request);
  if (!baseUrl) throw new Error("Configure SIGNATURE_PUBLIC_BASE_URL para reenviar o convite.");
  const token = await decryptSecret(tokenKey, row.token_ciphertext, row.token_iv);
  const link = `${baseUrl}/assinatura/${encodeURIComponent(token)}`;
  const { data: company } = await adminClient.from("organization_company_settings").select("name").eq("organization_id", organizationId).maybeSingle();
  await sendInviteEmail({
    recipient: row.external_signer_email,
    signerName: row.external_signer_name,
    documentName: row.template_name_snapshot,
    orderNumber: row.order_number_snapshot,
    expiresAt: row.expires_at,
    link,
    companyName: company?.name || "Empresa",
  });
  const sentAt = new Date().toISOString();
  const { error } = await adminClient
    .from("document_signature_requests")
    .update({ last_email_sent_at: sentAt })
    .eq("id", row.id)
    .eq("organization_id", organizationId);
  if (error) throw error;
  await recordEvent(adminClient, request, row, "email_resent", "admin", user.id, { recipient: maskEmail(row.external_signer_email) });
  return { success: true, recipient: row.external_signer_email };
}

async function cancelAction(context: any) {
  const { request, body, user, authClient, adminClient } = context;
  const organizationId = requireUuid(body.organization_id, "Empresa");
  const requestId = requireUuid(body.request_id, "Solicitação");
  await requirePermission(adminClient, user.id, organizationId, "documents.signatures.cancel");
  let row = await getRequest(adminClient, organizationId, requestId);
  await ensureOrderVisible(authClient, organizationId, row.service_order_id);
  row = await expireIfNeeded(adminClient, request, row);
  if (!ACTIVE_STATUSES.has(row.status)) throw new Error("Somente solicitações pendentes ou visualizadas podem ser canceladas.");
  const { data, error } = await adminClient
    .from("document_signature_requests")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString(), cancelled_by: user.id })
    .eq("id", row.id)
    .eq("organization_id", organizationId)
    .in("status", ["pending", "viewed"])
    .select(SUMMARY_SELECT)
    .single();
  if (error) throw error;
  await recordEvent(adminClient, request, data, "cancelled", "admin", user.id);
  const [summary] = await enrichRequests(adminClient, [data]);
  return { success: true, request: summary };
}

async function auditAction(context: any) {
  const { body, user, authClient, adminClient } = context;
  const organizationId = requireUuid(body.organization_id, "Empresa");
  const requestId = requireUuid(body.request_id, "Solicitação");
  await requirePermission(adminClient, user.id, organizationId, "documents.signatures.audit");
  const row = await getRequest(adminClient, organizationId, requestId);
  await ensureOrderVisible(authClient, organizationId, row.service_order_id);
  const { data, error } = await adminClient
    .from("document_signature_events")
    .select("id,event_type,actor_type,actor_user_id,ip_address,user_agent,metadata,created_at")
    .eq("organization_id", organizationId)
    .eq("request_id", requestId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return { success: true, events: data || [] };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ success: false, error: "Método não permitido." }, 405);
  try {
    const tokenKey = Deno.env.get("SIGNATURE_TOKEN_KEY");
    const identityPepper = Deno.env.get("SIGNATURE_IDENTITY_PEPPER");
    if (!tokenKey || tokenKey.length < 16) return json({ success: false, error: "Configure SIGNATURE_TOKEN_KEY com uma chave secreta forte." }, 500);
    if (!identityPepper || identityPepper.length < 16) return json({ success: false, error: "Configure SIGNATURE_IDENTITY_PEPPER com um segredo forte." }, 500);
    const { authClient, adminClient } = createClients(request);
    const user = await authenticatedUser(authClient, request);
    if (!user) return json({ success: false, error: "Usuário não autenticado." }, 401);
    const body = await request.json().catch(() => ({}));
    const action = text(body?.action, 40);
    const context = { request, body, user, authClient, adminClient, tokenKey, identityPepper };
    if (action === "create") return json(await createAction(context));
    if (action === "list") return json(await listAction(context));
    if (action === "link") return json(await linkAction(context));
    if (action === "resend_email") return json(await resendEmailAction(context));
    if (action === "cancel") return json(await cancelAction(context));
    if (action === "audit") return json(await auditAction(context));
    return json({ success: false, error: "Ação inválida." }, 400);
  } catch (error) {
    console.error("[DOCUMENT SIGNATURE ADMIN]", error instanceof Error ? error.message : error);
    const status = Number((error as any)?.status) || 400;
    return json({ success: false, error: error instanceof Error ? error.message : "Erro inesperado na assinatura eletrônica." }, status >= 400 && status < 600 ? status : 400);
  }
});
