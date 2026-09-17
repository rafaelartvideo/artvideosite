import { createClient } from "npm:@supabase/supabase-js@2.112.3";
import { PDFDocument } from "npm:pdf-lib@1.17.1";
import { basePdfPath, isPdfBytes, normalizeSignatureSlots } from "./base-pdf-policy.mjs";
import { applySignaturesToFrozenPdf, type SignatureEvidence } from "./pdf-overlay.ts";

const BUCKET = "signed-documents";
const ACTIVE_STATUSES = new Set(["pending", "viewed"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_SIGNATURE_BYTES = 2 * 1024 * 1024;

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

function createClients(request: Request) {
  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceRole) throw new Error("Supabase da assinatura não configurado.");
  const authorization = request.headers.get("Authorization") || "";
  return {
    url,
    anonKey,
    authClient: createClient(url, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false },
    }),
    adminClient: createClient(url, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } }),
  };
}

async function authenticatedUser(authClient: any, request: Request) {
  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const { data, error } = await authClient.auth.getUser(token);
  return error ? null : data.user || null;
}

async function requireSendPermission(authClient: any, organizationId: string) {
  const { data, error } = await authClient.rpc("can_document_signature_action", {
    p_organization_id: organizationId,
    p_permission_key: "documents.signatures.send",
  });
  if (error) throw error;
  if (data !== true) throw Object.assign(new Error("Você não possui permissão para enviar documentos para assinatura."), { status: 403 });
}

async function ensureOrderVisible(authClient: any, row: any) {
  const { data, error } = await authClient
    .from("service_orders")
    .select("id")
    .eq("id", row.service_order_id)
    .eq("organization_id", row.organization_id)
    .maybeSingle();
  if (error || !data) throw Object.assign(new Error("OS não encontrada ou sem permissão de acesso."), { status: 403 });
}

async function requestById(adminClient: any, organizationId: string, requestId: string) {
  const { data, error } = await adminClient
    .from("document_signature_requests")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("id", requestId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw Object.assign(new Error("Solicitação de assinatura não encontrada."), { status: 404 });
  return data;
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256BytesHex(bytes: Uint8Array) {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return bytesToHex(new Uint8Array(digest));
}

async function sha256Text(value: string) {
  return sha256BytesHex(new TextEncoder().encode(value));
}

async function requestByToken(adminClient: any, rawToken: unknown) {
  const token = text(rawToken, 512);
  if (!token || token.length < 32) throw Object.assign(new Error("Link de assinatura inválido ou indisponível."), { status: 404 });
  const tokenHash = await sha256Text(token);
  const { data, error } = await adminClient
    .from("document_signature_requests")
    .select("*")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.require_external_signature !== true) throw Object.assign(new Error("Link de assinatura inválido ou indisponível."), { status: 404 });
  return data;
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

function userAgent(request: Request) {
  return text(request.headers.get("user-agent"), 500) || null;
}

async function recordEvent(adminClient: any, request: Request, row: any, eventType: string, actorType: "admin" | "external" | "system", actorUserId: string | null, metadata: Record<string, unknown> = {}) {
  const payload = {
    request_id: row.id,
    organization_id: row.organization_id,
    event_type: eventType,
    actor_type: actorType,
    actor_user_id: actorUserId,
    ip_address: clientIp(request),
    user_agent: userAgent(request),
    metadata,
  };
  const { error } = await adminClient.from("document_signature_events").insert(payload);
  if (!error) return;
  if (payload.ip_address) await adminClient.from("document_signature_events").insert({ ...payload, ip_address: null });
}

function publicBaseUrl(request: Request) {
  const configured = text(Deno.env.get("SIGNATURE_PUBLIC_BASE_URL") || Deno.env.get("SITE_URL") || Deno.env.get("APP_URL"), 500);
  const fallback = text(request.headers.get("origin"), 500);
  const value = (configured || fallback).replace(/\/+$/, "");
  return /^https?:\/\//i.test(value) ? value : null;
}

async function authorizeExistingPublicProof(url: string, anonKey: string, token: unknown, proof: unknown) {
  const response = await fetch(`${url}/functions/v1/document-signature-public`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: anonKey },
    body: JSON.stringify({ action: "document", token, proof }),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.success !== true) {
    throw Object.assign(new Error(String(payload?.error || "Validação expirada ou inválida.")), { status: response.status || 401, code: payload?.code || null });
  }
}

function proofMethod(rawProof: unknown): "cpf_cnpj" | "email_otp" {
  try {
    const encoded = text(rawProof, 4000).split(".")[0];
    const padded = encoded.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - encoded.length % 4) % 4);
    const payload = JSON.parse(atob(padded));
    return payload?.method === "cpf_cnpj" ? "cpf_cnpj" : "email_otp";
  } catch {
    return "email_otp";
  }
}

function decodeSignature(raw: unknown) {
  const dataUrl = text(raw, 3_000_000);
  const prefix = "data:image/png;base64,";
  if (!dataUrl.startsWith(prefix)) throw new Error("A assinatura deve ser enviada em PNG.");
  const binary = atob(dataUrl.slice(prefix.length));
  if (!binary.length || binary.length > MAX_SIGNATURE_BYTES) throw new Error("A assinatura possui tamanho inválido.");
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  if (bytes.length < 8 || bytes[0] !== 0x89 || bytes[1] !== 0x50 || bytes[2] !== 0x4e || bytes[3] !== 0x47) throw new Error("Arquivo de assinatura inválido.");
  return bytes;
}

async function frozenPdfBytes(adminClient: any, row: any) {
  if (!row.base_pdf_storage_path || !row.base_pdf_hash) throw Object.assign(new Error("O PDF original ainda está sendo preparado. Tente novamente em instantes."), { status: 409 });
  const { data, error } = await adminClient.storage.from(BUCKET).download(row.base_pdf_storage_path);
  if (error || !data) throw error || new Error("Não foi possível carregar o PDF original.");
  const bytes = new Uint8Array(await data.arrayBuffer());
  if (!isPdfBytes(bytes)) throw new Error("O PDF original armazenado é inválido.");
  const hash = await sha256BytesHex(bytes);
  if (hash !== row.base_pdf_hash) throw new Error("A integridade do PDF original não pôde ser confirmada.");
  return bytes;
}

async function signatureRowsWithImages(adminClient: any, row: any) {
  const { data, error } = await adminClient
    .from("document_signatures")
    .select("id,signer_type,signer_name,signer_document_masked,validation_method,signed_at,signature_storage_path,signature_hash")
    .eq("organization_id", row.organization_id)
    .eq("request_id", row.id)
    .order("signed_at", { ascending: true });
  if (error) throw error;
  const result: SignatureEvidence[] = [];
  for (const signature of data || []) {
    let imageBytes: Uint8Array | null = null;
    if (signature.signature_storage_path) {
      const { data: blob, error: downloadError } = await adminClient.storage.from(BUCKET).download(signature.signature_storage_path);
      if (downloadError || !blob) throw downloadError || new Error("Não foi possível carregar uma assinatura congelada.");
      imageBytes = new Uint8Array(await blob.arrayBuffer());
    }
    result.push({ ...signature, image_bytes: imageBytes } as SignatureEvidence);
  }
  return result;
}

function requiredEvidence(row: any, signatures: SignatureEvidence[]) {
  if (row.require_employee_signature === true && !signatures.some(item => item.signer_type === "employee")) throw new Error("A assinatura do funcionário ainda não está disponível.");
  if (row.require_external_signature === true && !signatures.some(item => item.signer_type === "external")) throw new Error("A assinatura do cliente/responsável ainda não está disponível.");
}

async function renderAndStoreFinalPdf(adminClient: any, request: Request, row: any, signatures: SignatureEvidence[], signedAt: string) {
  requiredEvidence(row, signatures);
  const baseBytes = await frozenPdfBytes(adminClient, row);
  const baseUrl = publicBaseUrl(request);
  if (!baseUrl) throw new Error("Configure SIGNATURE_PUBLIC_BASE_URL para gerar o QR de autenticidade.");
  const verificationUrl = `${baseUrl}/verificar-documento/${encodeURIComponent(row.verification_code)}`;
  const finalBytes = await applySignaturesToFrozenPdf({
    base_pdf_bytes: baseBytes,
    base_pdf_hash: row.base_pdf_hash,
    snapshot_hash: row.snapshot_hash,
    verification_code: row.verification_code,
    verification_url: verificationUrl,
    signed_at: signedAt,
    signatures,
    signature_slots: Array.isArray(row.base_pdf_signature_slots) ? row.base_pdf_signature_slots : [],
  });
  const finalPath = `${row.organization_id}/${row.service_order_id}/${row.id}/signed.pdf`;
  const { error: uploadError } = await adminClient.storage
    .from(BUCKET)
    .upload(finalPath, new Blob([finalBytes], { type: "application/pdf" }), { contentType: "application/pdf", cacheControl: "3600", upsert: true });
  if (uploadError) throw uploadError;
  return { finalBytes, finalPath, finalHash: await sha256BytesHex(finalBytes), verificationUrl };
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  return btoa(binary);
}

function safeFileName(value: unknown) {
  return text(value, 120).replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "documento-assinado";
}

async function sendFinalCopyEmail(adminClient: any, request: Request, row: any, pdfBytes: Uint8Array, verificationUrl: string) {
  if (!row.external_signer_email) return;
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("DOCUMENT_SIGNATURE_EMAIL_FROM") || Deno.env.get("ORDER_DOCUMENT_EMAIL_FROM");
  if (!apiKey || !from) return;
  const { data: company } = await adminClient.from("organization_company_settings").select("name,legal_name").eq("organization_id", row.organization_id).maybeSingle();
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [row.external_signer_email],
      subject: `${text(row.template_name_snapshot, 180)} assinado - OS ${text(row.order_number_snapshot, 80)}`,
      html: `<div style="font-family:Arial,sans-serif;color:#172536;line-height:1.55"><h2>${text(company?.name || company?.legal_name || "Empresa", 220)}</h2><p>Seu documento <strong>${text(row.template_name_snapshot, 220)}</strong> foi assinado eletronicamente.</p><p>Código de autenticidade: <strong>${text(row.verification_code, 100)}</strong></p><p><a href="${verificationUrl}">Verificar autenticidade</a></p></div>`,
      attachments: [{ filename: `${safeFileName(row.template_name_snapshot)}-OS-${safeFileName(row.order_number_snapshot)}.pdf`, content: bytesToBase64(pdfBytes) }],
    }),
  });
  if (!response.ok) console.error("[DOCUMENT SIGNATURE PDF EMAIL]", await response.text().catch(() => "send_failed"));
}

async function signedAccess(adminClient: any, request: Request, row: any) {
  if (row.status !== "signed" || !row.final_pdf_storage_path || !row.final_pdf_hash) throw Object.assign(new Error("O PDF final ainda não está disponível."), { status: 409 });
  const { data, error } = await adminClient.storage.from(BUCKET).createSignedUrl(row.final_pdf_storage_path, 10 * 60);
  if (error || !data?.signedUrl) throw error || new Error("Não foi possível preparar o download do PDF.");
  const baseUrl = publicBaseUrl(request);
  return {
    signed: true,
    signed_at: row.signed_at,
    verification_code: row.verification_code,
    verification_url: baseUrl ? `${baseUrl}/verificar-documento/${encodeURIComponent(row.verification_code)}` : `/verificar-documento/${encodeURIComponent(row.verification_code)}`,
    download_url: data.signedUrl,
    base_pdf_hash: row.base_pdf_hash,
    final_pdf_hash: row.final_pdf_hash,
    snapshot_hash: row.snapshot_hash,
  };
}

async function prepareUploadAction(context: any) {
  const { request, body, authClient, adminClient, user } = context;
  const organizationId = requireUuid(body.organization_id, "Empresa");
  const requestId = requireUuid(body.request_id, "Solicitação");
  await requireSendPermission(authClient, organizationId);
  const row = await requestById(adminClient, organizationId, requestId);
  await ensureOrderVisible(authClient, row);
  if (!ACTIVE_STATUSES.has(String(row.status)) && row.status !== "signed") throw new Error("Esta solicitação não aceita mais o congelamento do PDF.");
  if (row.base_pdf_storage_path && row.base_pdf_hash) throw new Error("O PDF original desta solicitação já foi congelado.");
  const path = basePdfPath(row);
  const { data, error } = await adminClient.storage.from(BUCKET).createSignedUploadUrl(path, { upsert: true });
  if (error || !data?.token) throw error || new Error("Não foi possível preparar o envio do PDF original.");
  await recordEvent(adminClient, request, row, "base_pdf_upload_prepared", "admin", user.id);
  return { success: true, storage_path: path, upload_token: data.token };
}

async function rebuildEmployeeOnlyIfNeeded(adminClient: any, request: Request, row: any) {
  if (row.status !== "signed" || row.require_external_signature === true) return row;
  const signatures = await signatureRowsWithImages(adminClient, row);
  const signedAt = row.signed_at || signatures[signatures.length - 1]?.signed_at || new Date().toISOString();
  const final = await renderAndStoreFinalPdf(adminClient, request, row, signatures, signedAt);
  const { data, error } = await adminClient
    .from("document_signature_requests")
    .update({ final_pdf_storage_path: final.finalPath, final_pdf_hash: final.finalHash })
    .eq("id", row.id)
    .eq("organization_id", row.organization_id)
    .select("*")
    .single();
  if (error) throw error;
  await recordEvent(adminClient, request, data, "pdf_generated", "system", null, { source: "frozen_print_pdf", final_pdf_hash: final.finalHash });
  return data;
}

async function commitBasePdfAction(context: any) {
  const { request, body, authClient, adminClient, user } = context;
  const organizationId = requireUuid(body.organization_id, "Empresa");
  const requestId = requireUuid(body.request_id, "Solicitação");
  await requireSendPermission(authClient, organizationId);
  let row = await requestById(adminClient, organizationId, requestId);
  await ensureOrderVisible(authClient, row);
  if (row.base_pdf_storage_path && row.base_pdf_hash) return { success: true, base_pdf_hash: row.base_pdf_hash, page_count: row.base_pdf_page_count };

  const path = basePdfPath(row);
  const { data: blob, error: downloadError } = await adminClient.storage.from(BUCKET).download(path);
  if (downloadError || !blob) throw downloadError || new Error("O PDF original enviado não foi encontrado.");
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (!isPdfBytes(bytes)) throw new Error("O arquivo enviado não é um PDF válido ou excede o limite permitido.");
  let pageCount = 0;
  try { pageCount = (await PDFDocument.load(bytes, { updateMetadata: false })).getPageCount(); }
  catch { throw new Error("O PDF original não pôde ser validado."); }
  if (Number(body.page_count) !== pageCount) throw new Error("A quantidade de páginas do PDF não corresponde ao documento congelado.");
  const slots = normalizeSignatureSlots(body.signature_slots, pageCount);
  if (row.require_external_signature === true && !slots.some((slot: any) => slot.signer_type === "external")) throw new Error("O modelo precisa conter o campo de assinatura do cliente.");
  if (row.require_employee_signature === true && !slots.some((slot: any) => slot.signer_type === "employee")) throw new Error("O modelo precisa conter o campo de assinatura do funcionário.");
  const baseHash = await sha256BytesHex(bytes);
  const frozenAt = new Date().toISOString();
  const { data: updated, error } = await adminClient
    .from("document_signature_requests")
    .update({
      base_pdf_storage_path: path,
      base_pdf_hash: baseHash,
      base_pdf_signature_slots: slots,
      base_pdf_page_count: pageCount,
      base_pdf_created_at: frozenAt,
    })
    .eq("id", row.id)
    .eq("organization_id", organizationId)
    .is("base_pdf_storage_path", null)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  row = updated || await requestById(adminClient, organizationId, requestId);
  if (row.base_pdf_hash !== baseHash) throw new Error("Outra operação congelou um PDF diferente para esta solicitação.");
  await recordEvent(adminClient, request, row, "base_pdf_frozen", "admin", user.id, { base_pdf_hash: baseHash, page_count: pageCount });
  row = await rebuildEmployeeOnlyIfNeeded(adminClient, request, row);
  return { success: true, base_pdf_hash: row.base_pdf_hash, page_count: row.base_pdf_page_count, final_pdf_hash: row.final_pdf_hash || null };
}

async function previewAction(context: any) {
  const { request, body, adminClient, url, anonKey } = context;
  await authorizeExistingPublicProof(url, anonKey, body.token, body.proof);
  const row = await requestByToken(adminClient, body.token);
  if (!row.base_pdf_storage_path || !row.base_pdf_hash) throw Object.assign(new Error("O documento ainda está sendo preparado. Tente novamente em instantes."), { status: 409 });
  const { data, error } = await adminClient.storage.from(BUCKET).createSignedUrl(row.base_pdf_storage_path, 10 * 60);
  if (error || !data?.signedUrl) throw error || new Error("Não foi possível abrir o PDF original.");
  return {
    success: true,
    document: {
      preview_url: data.signedUrl,
      base_pdf_hash: row.base_pdf_hash,
      consent_text: row.consent_text_snapshot,
      signer_name: row.external_signer_name,
      signer_document_masked: row.external_document_masked,
      expires_at: row.expires_at,
      verification_code: row.verification_code,
    },
  };
}

async function completeExistingSignature(adminClient: any, request: Request, row: any) {
  const signatures = await signatureRowsWithImages(adminClient, row);
  requiredEvidence(row, signatures);
  const signedAt = signatures.map(item => Date.parse(item.signed_at)).filter(Number.isFinite).sort((a, b) => b - a)[0];
  const timestamp = new Date(signedAt || Date.now()).toISOString();
  const final = await renderAndStoreFinalPdf(adminClient, request, row, signatures, timestamp);
  const { data: updated, error } = await adminClient
    .from("document_signature_requests")
    .update({ status: "signed", signed_at: timestamp, final_pdf_storage_path: final.finalPath, final_pdf_hash: final.finalHash })
    .eq("id", row.id)
    .eq("organization_id", row.organization_id)
    .in("status", ["pending", "viewed"])
    .select("*")
    .maybeSingle();
  if (error) throw error;
  const current = updated || await requestById(adminClient, row.organization_id, row.id);
  return { row: current, final };
}

async function completeAction(context: any) {
  const { request, body, adminClient, url, anonKey } = context;
  await authorizeExistingPublicProof(url, anonKey, body.token, body.proof);
  let row = await requestByToken(adminClient, body.token);
  if (row.status === "signed") return { success: true, ...(await signedAccess(adminClient, request, row)) };
  if (!ACTIVE_STATUSES.has(String(row.status))) throw Object.assign(new Error("Esta solicitação não aceita mais assinatura."), { status: 409 });
  if (!row.base_pdf_storage_path || !row.base_pdf_hash) throw Object.assign(new Error("O documento ainda está sendo preparado. Tente novamente em instantes."), { status: 409 });
  const { data: existing, error: existingError } = await adminClient
    .from("document_signatures")
    .select("id")
    .eq("organization_id", row.organization_id)
    .eq("request_id", row.id)
    .eq("signer_type", "external")
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) {
    const finished = await completeExistingSignature(adminClient, request, row);
    return { success: true, ...(await signedAccess(adminClient, request, finished.row)) };
  }
  if (body.consent_accepted !== true) throw new Error("Confirme o aceite do documento antes de assinar.");

  const signatureBytes = decodeSignature(body.signature_data_url);
  const signatureHash = await sha256BytesHex(signatureBytes);
  const signatureId = crypto.randomUUID();
  const signaturePath = `${row.organization_id}/${row.service_order_id}/${row.id}/external-signature-${signatureId}.png`;
  const signedAt = new Date().toISOString();
  const validationMethod = proofMethod(body.proof);
  const { error: signatureUploadError } = await adminClient.storage
    .from(BUCKET)
    .upload(signaturePath, new Blob([signatureBytes], { type: "image/png" }), { contentType: "image/png", cacheControl: "3600", upsert: false });
  if (signatureUploadError) throw signatureUploadError;

  try {
    const storedSignatures = await signatureRowsWithImages(adminClient, row);
    const externalEvidence: SignatureEvidence = {
      signer_type: "external",
      signer_name: row.external_signer_name,
      signer_document_masked: row.external_document_masked,
      validation_method: validationMethod,
      signed_at: signedAt,
      image_bytes: signatureBytes,
    };
    const signatures = [...storedSignatures.filter(item => item.signer_type !== "external"), externalEvidence];
    const final = await renderAndStoreFinalPdf(adminClient, request, row, signatures, signedAt);

    const { error: insertError } = await adminClient.from("document_signatures").insert({
      id: signatureId,
      organization_id: row.organization_id,
      request_id: row.id,
      signer_type: "external",
      signer_name: row.external_signer_name,
      signer_document_masked: row.external_document_masked,
      employee_entity_id: null,
      employee_signature_version: null,
      signature_storage_path: signaturePath,
      signature_hash: signatureHash,
      validation_method: validationMethod,
      consent_accepted: true,
      consent_text_snapshot: row.consent_text_snapshot,
      signed_at: signedAt,
    });
    if (insertError) throw insertError;

    const { data: updated, error: updateError } = await adminClient
      .from("document_signature_requests")
      .update({ status: "signed", signed_at: signedAt, final_pdf_storage_path: final.finalPath, final_pdf_hash: final.finalHash })
      .eq("id", row.id)
      .eq("organization_id", row.organization_id)
      .in("status", ["pending", "viewed"])
      .select("*")
      .maybeSingle();
    if (updateError) throw updateError;
    row = updated || await requestById(adminClient, row.organization_id, row.id);
    if (row.status !== "signed") throw Object.assign(new Error("Outra operação alterou esta solicitação. Atualize e tente novamente."), { status: 409 });

    await recordEvent(adminClient, request, row, "consent_accepted", "external", null, { consent_text: row.consent_text_snapshot });
    await recordEvent(adminClient, request, row, "signature_captured", "external", null, { signature_id: signatureId, validation_method: validationMethod });
    await recordEvent(adminClient, request, row, "pdf_generated", "system", null, { source: "frozen_print_pdf", base_pdf_hash: row.base_pdf_hash, final_pdf_hash: final.finalHash });
    await recordEvent(adminClient, request, row, "signed", "system", null, { verification_code: row.verification_code, final_pdf_hash: final.finalHash });
    await sendFinalCopyEmail(adminClient, request, row, final.finalBytes, final.verificationUrl);
    return { success: true, captured: true, captured_at: signedAt, ...(await signedAccess(adminClient, request, row)) };
  } catch (error) {
    const { data: concurrent } = await adminClient
      .from("document_signatures")
      .select("id")
      .eq("organization_id", row.organization_id)
      .eq("request_id", row.id)
      .eq("signer_type", "external")
      .maybeSingle();
    if (!concurrent) await adminClient.storage.from(BUCKET).remove([signaturePath]).catch(() => undefined);
    throw error;
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ success: false, error: "Método não permitido." }, 405);
  try {
    const body = await request.json().catch(() => ({}));
    const action = text(body?.action, 50);
    const { url, anonKey, authClient, adminClient } = createClients(request);
    let user: any = null;
    if (["prepare_upload", "commit_base_pdf"].includes(action)) {
      user = await authenticatedUser(authClient, request);
      if (!user) return json({ success: false, error: "Usuário não autenticado." }, 401);
    }
    const context = { request, body, url, anonKey, authClient, adminClient, user };
    if (action === "prepare_upload") return json(await prepareUploadAction(context));
    if (action === "commit_base_pdf") return json(await commitBasePdfAction(context));
    if (action === "preview") return json(await previewAction(context));
    if (action === "complete") return json(await completeAction(context));
    return json({ success: false, error: "Ação inválida." }, 400);
  } catch (error) {
    const status = Number((error as any)?.status) || 400;
    console.error("[DOCUMENT SIGNATURE PDF]", error instanceof Error ? error.message : error);
    return json({ success: false, error: error instanceof Error ? error.message : "Não foi possível processar o PDF da assinatura.", code: (error as any)?.code || null }, status >= 400 && status < 600 ? status : 400);
  }
});
