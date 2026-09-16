import { createClient } from "npm:@supabase/supabase-js@2.112.3";
import {
  buildOtpProof,
  constantTimeEqualHex,
  decodePngDataUrl,
  isOtpFormat,
  normalizeOtp,
  otpSendPolicy,
  publicRequestState,
  verifyOtpProof,
} from "./public-signature-policy.mjs";
import {
  hmacHex,
  maskEmail,
  normalizeDocument,
  randomOtp,
  sha256BytesHex,
  sha256Hex,
} from "./public-signature-crypto.mjs";

const ACTIVE_STATUSES = new Set(["pending", "viewed"]);
const MAX_TOKEN_LENGTH = 512;
const PROOF_TTL_MS = 15 * 60 * 1000;
const OTP_TTL_MS = 10 * 60 * 1000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-client-info, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200, extraHeaders: Record<string, string> = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { ...corsHeaders, "Content-Type": "application/json", ...extraHeaders },
});

function text(value: unknown, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function clientIp(request: Request) {
  const raw = request.headers.get("cf-connecting-ip")
    || request.headers.get("x-real-ip")
    || request.headers.get("x-forwarded-for")?.split(",")[0]
    || "";
  const value = text(raw, 80);
  return value || null;
}

function userAgent(request: Request) {
  return text(request.headers.get("user-agent"), 500) || null;
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function adminClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRole) throw new Error("Supabase da assinatura pública não configurado.");
  return createClient(url, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function recordEvent(client: any, request: Request, row: any, eventType: string, metadata: Record<string, unknown> = {}) {
  const payload = {
    request_id: row.id,
    organization_id: row.organization_id,
    event_type: eventType,
    actor_type: "external",
    actor_user_id: null,
    ip_address: clientIp(request),
    user_agent: userAgent(request),
    metadata,
  };
  const { error } = await client.from("document_signature_events").insert(payload);
  if (!error) return;
  if (payload.ip_address) {
    const { error: retryError } = await client.from("document_signature_events").insert({ ...payload, ip_address: null });
    if (!retryError) return;
  }
  console.error("[DOCUMENT SIGNATURE PUBLIC EVENT]", eventType, error.message);
}

async function loadCompanyName(client: any, organizationId: string) {
  const { data, error } = await client
    .from("organization_company_settings")
    .select("name,legal_name")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw error;
  return data?.name || data?.legal_name || "Empresa";
}

async function externalSignature(client: any, row: any) {
  const { data, error } = await client
    .from("document_signatures")
    .select("id,signed_at,signature_hash,signature_storage_path")
    .eq("organization_id", row.organization_id)
    .eq("request_id", row.id)
    .eq("signer_type", "external")
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

async function expireIfNeeded(client: any, request: Request, row: any) {
  const state = publicRequestState(row);
  if (state !== "expired" || row.status === "expired") return row;
  if (!ACTIVE_STATUSES.has(String(row.status))) return row;
  const { data, error } = await client
    .from("document_signature_requests")
    .update({ status: "expired" })
    .eq("id", row.id)
    .eq("organization_id", row.organization_id)
    .in("status", ["pending", "viewed"])
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (data) {
    await recordEvent(client, request, data, "expired");
    return data;
  }
  return { ...row, status: "expired" };
}

async function markViewed(client: any, request: Request, row: any) {
  if (row.status !== "pending") return row;
  const now = new Date().toISOString();
  const { data, error } = await client
    .from("document_signature_requests")
    .update({ status: "viewed", first_viewed_at: row.first_viewed_at || now })
    .eq("id", row.id)
    .eq("organization_id", row.organization_id)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();
  if (error) throw error;
  if (data) {
    await recordEvent(client, request, data, "link_viewed");
    return data;
  }
  return row;
}

async function requestFromToken(client: any, request: Request, rawToken: unknown, { markView = false } = {}) {
  const token = text(rawToken, MAX_TOKEN_LENGTH);
  if (!token || token.length < 32) throw Object.assign(new Error("Link de assinatura inválido ou indisponível."), { status: 404 });
  const tokenHash = await sha256Hex(token);
  const { data, error } = await client
    .from("document_signature_requests")
    .select("*")
    .eq("token_hash", tokenHash)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.require_external_signature !== true) {
    throw Object.assign(new Error("Link de assinatura inválido ou indisponível."), { status: 404 });
  }
  let row = await expireIfNeeded(client, request, data);
  if (markView && ACTIVE_STATUSES.has(String(row.status))) row = await markViewed(client, request, row);
  return { row, tokenHash };
}

function assertCanValidate(row: any) {
  const state = publicRequestState(row);
  if (state === "expired") throw Object.assign(new Error("Este link de assinatura expirou."), { status: 410, code: "expired" });
  if (state === "cancelled") throw Object.assign(new Error("Esta solicitação de assinatura foi cancelada."), { status: 410, code: "cancelled" });
  if (state === "signed") throw Object.assign(new Error("Este documento já foi assinado e finalizado."), { status: 409, code: "signed" });
  if (!ACTIVE_STATUSES.has(state)) throw Object.assign(new Error("Esta solicitação não aceita mais assinatura."), { status: 409 });
}

async function sendOtpEmail({ recipient, code, companyName, documentName, orderNumber }: {
  recipient: string;
  code: string;
  companyName: string;
  documentName: string;
  orderNumber: string;
}) {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("DOCUMENT_SIGNATURE_EMAIL_FROM") || Deno.env.get("ORDER_DOCUMENT_EMAIL_FROM");
  if (!apiKey || !from) throw new Error("Envio do código de validação não configurado.");
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to: [recipient],
      subject: `Código de assinatura — ${documentName} — OS ${orderNumber}`,
      html: `<div style="font-family:Arial,sans-serif;color:#172536;line-height:1.55"><h2>${escapeHtml(companyName)}</h2><p>Use o código abaixo para validar sua identidade e acessar o documento <strong>${escapeHtml(documentName)}</strong>.</p><div style="font-size:28px;font-weight:800;letter-spacing:6px;margin:18px 0">${escapeHtml(code)}</div><p style="font-size:12px;color:#526174">O código expira em 10 minutos. Não compartilhe este código com terceiros.</p></div>`,
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(String(result?.message || "Não foi possível enviar o código por e-mail."));
  return result?.id || null;
}

async function verifiedProof(client: any, row: any, tokenHash: string, rawProof: unknown, tokenKey: string) {
  const proof = text(rawProof, 4000);
  const payload = await verifyOtpProof(tokenKey, proof, { requestId: row.id, tokenHash });
  const { data: challenge, error } = await client
    .from("document_signature_otp_challenges")
    .select("id,request_id,organization_id,verified_at")
    .eq("id", payload.challengeId)
    .eq("request_id", row.id)
    .eq("organization_id", row.organization_id)
    .maybeSingle();
  if (error) throw error;
  if (!challenge?.verified_at) throw Object.assign(new Error("Validação expirada. Confirme o código novamente."), { status: 401 });
  return payload;
}

async function inspectAction(client: any, request: Request, body: any) {
  const { row } = await requestFromToken(client, request, body.token, { markView: true });
  const companyName = await loadCompanyName(client, row.organization_id);
  const signature = await externalSignature(client, row);
  const state = publicRequestState(row);
  return {
    success: true,
    state,
    company_name: companyName,
    document_name: row.template_name_snapshot,
    order_number: row.order_number_snapshot,
    signer_name: row.external_signer_name,
    signer_document_masked: row.external_document_masked,
    signer_email_masked: maskEmail(row.external_signer_email || ""),
    expires_at: row.expires_at,
    verification_code: row.status === "signed" ? row.verification_code : null,
    external_signature_captured: Boolean(signature),
    captured_at: signature?.signed_at || null,
  };
}

async function requestOtpAction(client: any, request: Request, body: any, identityPepper: string) {
  const { row } = await requestFromToken(client, request, body.token, { markView: true });
  assertCanValidate(row);
  if (await externalSignature(client, row)) return { success: true, already_captured: true };

  const document = normalizeDocument(body.document);
  if (![11, 14].includes(document.length)) {
    await recordEvent(client, request, row, "identity_failed");
    throw Object.assign(new Error("Não foi possível validar os dados informados."), { status: 401 });
  }
  const calculated = await hmacHex(identityPepper, document);
  if (!constantTimeEqualHex(calculated, row.external_document_hmac || "")) {
    await recordEvent(client, request, row, "identity_failed");
    throw Object.assign(new Error("Não foi possível validar os dados informados."), { status: 401 });
  }

  const ip = clientIp(request);
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  let eventCountQuery = client
    .from("document_signature_events")
    .select("id", { count: "exact", head: true })
    .eq("request_id", row.id)
    .eq("organization_id", row.organization_id)
    .eq("event_type", "otp_sent")
    .gte("created_at", hourAgo);
  if (ip) eventCountQuery = eventCountQuery.eq("ip_address", ip);
  const [{ data: latestRows, error: latestError }, countResult] = await Promise.all([
    client
      .from("document_signature_otp_challenges")
      .select("last_sent_at")
      .eq("request_id", row.id)
      .eq("organization_id", row.organization_id)
      .order("last_sent_at", { ascending: false })
      .limit(1),
    eventCountQuery,
  ]);
  if (latestError) throw latestError;
  if (countResult.error) throw countResult.error;
  const sendPolicy = otpSendPolicy({
    now: Date.now(),
    lastSentAt: latestRows?.[0]?.last_sent_at || null,
    sendsLastHour: countResult.count || 0,
  });
  if (!sendPolicy.allowed) {
    const message = sendPolicy.reason === "hourly_limit"
      ? "Limite de códigos atingido. Tente novamente mais tarde."
      : `Aguarde ${sendPolicy.retryAfterSeconds} segundos antes de solicitar outro código.`;
    throw Object.assign(new Error(message), { status: 429, retryAfterSeconds: sendPolicy.retryAfterSeconds });
  }

  const challengeId = crypto.randomUUID();
  const code = randomOtp();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + OTP_TTL_MS).toISOString();
  const codeHmac = await hmacHex(identityPepper, `otp:${row.id}:${challengeId}:${code}`);
  const { error: insertError } = await client.from("document_signature_otp_challenges").insert({
    id: challengeId,
    request_id: row.id,
    organization_id: row.organization_id,
    code_hmac: codeHmac,
    expires_at: expiresAt,
    attempts: 0,
    send_count: 1,
    window_started_at: now.toISOString(),
    last_sent_at: now.toISOString(),
  });
  if (insertError) throw insertError;

  try {
    const companyName = await loadCompanyName(client, row.organization_id);
    await sendOtpEmail({
      recipient: row.external_signer_email,
      code,
      companyName,
      documentName: row.template_name_snapshot,
      orderNumber: row.order_number_snapshot,
    });
  } catch (emailError) {
    await client.from("document_signature_otp_challenges").delete().eq("id", challengeId).eq("request_id", row.id);
    await recordEvent(client, request, row, "otp_email_failed", { recipient: maskEmail(row.external_signer_email || "") });
    throw Object.assign(emailError instanceof Error ? emailError : new Error("Não foi possível enviar o código por e-mail."), { status: 502 });
  }

  await recordEvent(client, request, row, "identity_verified");
  await recordEvent(client, request, row, "otp_sent", { recipient: maskEmail(row.external_signer_email || ""), challenge_id: challengeId });
  return {
    success: true,
    challenge_id: challengeId,
    destination: maskEmail(row.external_signer_email || ""),
    expires_in_seconds: Math.floor(OTP_TTL_MS / 1000),
    retry_after_seconds: 60,
  };
}

async function verifyOtpAction(client: any, request: Request, body: any, identityPepper: string, tokenKey: string) {
  const { row, tokenHash } = await requestFromToken(client, request, body.token, { markView: true });
  assertCanValidate(row);
  if (await externalSignature(client, row)) return { success: true, already_captured: true };
  const challengeId = text(body.challenge_id, 64);
  const code = normalizeOtp(body.code);
  if (!challengeId || !isOtpFormat(code)) throw Object.assign(new Error("Código inválido ou expirado."), { status: 401 });

  const { data: challenge, error: challengeError } = await client
    .from("document_signature_otp_challenges")
    .select("id,request_id,organization_id,code_hmac,expires_at,attempts,verified_at")
    .eq("id", challengeId)
    .eq("request_id", row.id)
    .eq("organization_id", row.organization_id)
    .maybeSingle();
  if (challengeError) throw challengeError;
  if (!challenge || challenge.verified_at || Number(challenge.attempts) >= 5 || Date.parse(challenge.expires_at) <= Date.now()) {
    throw Object.assign(new Error("Código inválido ou expirado."), { status: 401 });
  }

  const nextAttempts = Number(challenge.attempts) + 1;
  const { data: consumed, error: consumeError } = await client
    .from("document_signature_otp_challenges")
    .update({ attempts: nextAttempts })
    .eq("id", challenge.id)
    .eq("request_id", row.id)
    .eq("attempts", challenge.attempts)
    .is("verified_at", null)
    .gt("expires_at", new Date().toISOString())
    .select("id,code_hmac,attempts")
    .maybeSingle();
  if (consumeError) throw consumeError;
  if (!consumed) throw Object.assign(new Error("Código inválido ou expirado. Tente novamente."), { status: 409 });

  const candidateHmac = await hmacHex(identityPepper, `otp:${row.id}:${challenge.id}:${code}`);
  if (!constantTimeEqualHex(candidateHmac, consumed.code_hmac)) {
    await recordEvent(client, request, row, "otp_failed", { attempt: consumed.attempts });
    throw Object.assign(new Error(consumed.attempts >= 5 ? "Código inválido e limite de tentativas atingido." : "Código inválido ou expirado."), { status: 401 });
  }

  const verifiedAt = new Date().toISOString();
  const { error: verifyError } = await client
    .from("document_signature_otp_challenges")
    .update({ verified_at: verifiedAt })
    .eq("id", challenge.id)
    .eq("request_id", row.id)
    .is("verified_at", null);
  if (verifyError) throw verifyError;
  const proof = await buildOtpProof(tokenKey, { requestId: row.id, tokenHash, challengeId: challenge.id }, Date.now(), PROOF_TTL_MS);
  await recordEvent(client, request, row, "otp_verified", { challenge_id: challenge.id });
  return { success: true, proof, expires_in_seconds: Math.floor(PROOF_TTL_MS / 1000) };
}

async function documentAction(client: any, request: Request, body: any, tokenKey: string) {
  const { row, tokenHash } = await requestFromToken(client, request, body.token, { markView: true });
  assertCanValidate(row);
  await verifiedProof(client, row, tokenHash, body.proof, tokenKey);
  return {
    success: true,
    document: {
      snapshot: row.document_snapshot,
      consent_text: row.consent_text_snapshot,
      signer_name: row.external_signer_name,
      signer_document_masked: row.external_document_masked,
      expires_at: row.expires_at,
      verification_code: row.verification_code,
    },
  };
}

async function completeAction(client: any, request: Request, body: any, tokenKey: string) {
  const { row, tokenHash } = await requestFromToken(client, request, body.token, { markView: true });
  assertCanValidate(row);
  await verifiedProof(client, row, tokenHash, body.proof, tokenKey);
  const existing = await externalSignature(client, row);
  if (existing) {
    return { success: true, captured: true, captured_at: existing.signed_at, verification_code: row.verification_code };
  }
  if (body.consent_accepted !== true) throw new Error("Confirme o aceite do documento antes de assinar.");
  const bytes = decodePngDataUrl(body.signature_data_url);
  const signatureHash = await sha256BytesHex(bytes);
  const signatureId = crypto.randomUUID();
  const storagePath = `${row.organization_id}/${row.service_order_id}/${row.id}/external-signature-${signatureId}.png`;
  const signedAt = new Date().toISOString();
  const { error: uploadError } = await client.storage
    .from("signed-documents")
    .upload(storagePath, new Blob([bytes], { type: "image/png" }), { contentType: "image/png", upsert: false, cacheControl: "3600" });
  if (uploadError) throw uploadError;

  const { data: inserted, error: insertError } = await client
    .from("document_signatures")
    .insert({
      id: signatureId,
      organization_id: row.organization_id,
      request_id: row.id,
      signer_type: "external",
      signer_name: row.external_signer_name,
      signer_document_masked: row.external_document_masked,
      employee_entity_id: null,
      employee_signature_version: null,
      signature_storage_path: storagePath,
      signature_hash: signatureHash,
      validation_method: "email_otp",
      consent_accepted: true,
      consent_text_snapshot: row.consent_text_snapshot,
      signed_at: signedAt,
    })
    .select("id,signed_at")
    .maybeSingle();

  if (insertError) {
    await client.storage.from("signed-documents").remove([storagePath]);
    const concurrent = await externalSignature(client, row);
    if (concurrent) return { success: true, captured: true, captured_at: concurrent.signed_at, verification_code: row.verification_code };
    throw insertError;
  }

  await recordEvent(client, request, row, "consent_accepted", { consent_text: row.consent_text_snapshot });
  await recordEvent(client, request, row, "signature_captured", { signature_id: inserted?.id || signatureId, validation_method: "email_otp" });
  return { success: true, captured: true, captured_at: inserted?.signed_at || signedAt, verification_code: row.verification_code };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return json({ success: false, error: "Método não permitido." }, 405);
  try {
    const identityPepper = Deno.env.get("SIGNATURE_IDENTITY_PEPPER");
    const tokenKey = Deno.env.get("SIGNATURE_TOKEN_KEY");
    if (!identityPepper || identityPepper.length < 16 || !tokenKey || tokenKey.length < 16) {
      return json({ success: false, error: "Assinatura eletrônica não configurada no servidor." }, 503);
    }
    const body = await request.json().catch(() => ({}));
    const action = text(body?.action, 40);
    const client = adminClient();
    if (action === "inspect") return json(await inspectAction(client, request, body));
    if (action === "request_otp") return json(await requestOtpAction(client, request, body, identityPepper));
    if (action === "verify_otp") return json(await verifyOtpAction(client, request, body, identityPepper, tokenKey));
    if (action === "document") return json(await documentAction(client, request, body, tokenKey));
    if (action === "complete") return json(await completeAction(client, request, body, tokenKey));
    return json({ success: false, error: "Ação inválida." }, 400);
  } catch (error) {
    const status = Number((error as any)?.status) || 400;
    const retryAfterSeconds = Number((error as any)?.retryAfterSeconds) || 0;
    console.error("[DOCUMENT SIGNATURE PUBLIC]", error instanceof Error ? error.message : "Erro inesperado");
    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Não foi possível concluir a assinatura eletrônica.",
        code: (error as any)?.code || null,
        retry_after_seconds: retryAfterSeconds || undefined,
      },
      status >= 400 && status < 600 ? status : 400,
      retryAfterSeconds ? { "Retry-After": String(retryAfterSeconds) } : {},
    );
  }
});
