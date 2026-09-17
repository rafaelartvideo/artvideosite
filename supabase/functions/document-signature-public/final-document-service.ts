import { buildVerificationPath, minimalVerificationPayload, requiredSignatureKinds } from "./final-document-policy.mjs";
import {
  applySignatureEvidenceToBasePdf,
  renderBaseDocumentPdf,
  renderSignedDocumentPdf,
} from "./final-document-pdf.ts";
import { previewPdfPath, requestBasePdfPath } from "./base-pdf-policy.mjs";
import { maskEmail, sha256BytesHex } from "./public-signature-crypto.mjs";

function text(value: unknown, max = 500) {
  return String(value ?? "").trim().slice(0, max);
}

function escapeHtml(value: unknown) {
  return text(value, 1000)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function clientIp(request: Request) {
  const raw = request.headers.get("cf-connecting-ip")
    || request.headers.get("x-real-ip")
    || request.headers.get("x-forwarded-for")?.split(",")[0]
    || "";
  return text(raw, 80) || null;
}

function userAgent(request: Request) {
  return text(request.headers.get("user-agent"), 500) || null;
}

function publicBaseUrl(request: Request) {
  const configured = text(Deno.env.get("SIGNATURE_PUBLIC_BASE_URL") || Deno.env.get("SITE_URL") || Deno.env.get("APP_URL"), 500);
  const fallback = text(request.headers.get("origin"), 500);
  const value = (configured || fallback).replace(/\/+$/, "");
  return /^https?:\/\//i.test(value) ? value : null;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function safeFileName(value: unknown) {
  return text(value, 120).replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "documento-assinado";
}

async function recordSystemEvent(client: any, request: Request, row: any, eventType: string, metadata: Record<string, unknown> = {}) {
  const payload = {
    request_id: row.id,
    organization_id: row.organization_id,
    event_type: eventType,
    actor_type: "system",
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
  console.error("[DOCUMENT SIGNATURE FINAL EVENT]", eventType, error.message);
}

async function companySettings(client: any, organizationId: string) {
  const { data, error } = await client
    .from("organization_company_settings")
    .select("name,legal_name")
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw error;
  return data || { name: "Empresa", legal_name: null };
}

async function loadSignatureEvidence(client: any, row: any) {
  const { data, error } = await client
    .from("document_signatures")
    .select("id,signer_type,signer_name,signer_document_masked,validation_method,signed_at,signature_storage_path,signature_hash")
    .eq("organization_id", row.organization_id)
    .eq("request_id", row.id)
    .order("signed_at", { ascending: true });
  if (error) throw error;
  const signatures = data || [];
  const required = requiredSignatureKinds(row);
  for (const kind of required) {
    if (!signatures.some((signature: any) => signature.signer_type === kind)) {
      throw new Error(kind === "employee" ? "A assinatura do funcionário ainda não está disponível." : "A assinatura do cliente/responsável ainda não está disponível.");
    }
  }
  return signatures;
}

async function signatureImageBytes(client: any, signature: any) {
  if (!signature?.signature_storage_path) return null;
  const { data, error } = await client.storage.from("signed-documents").download(signature.signature_storage_path);
  if (error || !data) throw error || new Error("Não foi possível carregar uma assinatura congelada.");
  return new Uint8Array(await data.arrayBuffer());
}

function snapshotChecklistMediaIds(snapshot: any) {
  const ids = new Set<string>();
  for (const stage of Array.isArray(snapshot?.checklists) ? snapshot.checklists : []) {
    for (const item of Array.isArray(stage?.items) ? stage.items : []) {
      for (const media of Array.isArray(item?.media) ? item.media : []) {
        const id = text(media?.media_id, 64);
        if (id) ids.add(id);
      }
    }
  }
  return [...ids].slice(0, 40);
}

async function allowedChecklistMedia(client: any, row: any) {
  const requestedIds = snapshotChecklistMediaIds(row.document_snapshot);
  if (!requestedIds.length) return {};

  const { data: checklists, error: checklistError } = await client
    .from("service_order_checklists")
    .select("id")
    .eq("service_order_id", row.service_order_id)
    .eq("organization_id", row.organization_id);
  if (checklistError) throw checklistError;
  const checklistIds = (checklists || []).map((item: any) => item.id);
  if (!checklistIds.length) return {};

  const { data: stages, error: stageError } = await client.from("service_order_checklist_stages").select("id").in("checklist_id", checklistIds);
  if (stageError) throw stageError;
  const stageIds = (stages || []).map((item: any) => item.id);
  if (!stageIds.length) return {};

  const { data: items, error: itemError } = await client.from("service_order_checklist_items").select("id").in("stage_id", stageIds);
  if (itemError) throw itemError;
  const itemIds = (items || []).map((item: any) => item.id);
  if (!itemIds.length) return {};

  const { data: links, error: linkError } = await client
    .from("service_order_checklist_item_media")
    .select("media_id")
    .in("item_id", itemIds)
    .in("media_id", requestedIds);
  if (linkError) throw linkError;
  const allowedIds = [...new Set((links || []).map((item: any) => item.media_id).filter(Boolean))];
  if (!allowedIds.length) return {};

  const { data: mediaRows, error: mediaError } = await client
    .from("media")
    .select("id,bucket_id,storage_path,mime_type,file_size")
    .in("id", allowedIds);
  if (mediaError) throw mediaError;

  const result: Record<string, { mime_type?: string | null; bytes: Uint8Array }> = {};
  for (const media of mediaRows || []) {
    const mime = String(media.mime_type || "").toLowerCase();
    if (!mime.startsWith("image/") || Number(media.file_size || 0) > 8 * 1024 * 1024) continue;
    const { data: blob, error } = await client.storage.from(media.bucket_id).download(media.storage_path);
    if (error || !blob) continue;
    result[media.id] = { mime_type: media.mime_type || null, bytes: new Uint8Array(await blob.arrayBuffer()) };
  }
  return result;
}

async function companyLogoMedia(client: any, snapshot: any) {
  const mediaId = text(snapshot?.company?.logo_media_id, 64);
  if (!mediaId) return null;
  const { data: media, error } = await client
    .from("media")
    .select("id,bucket_id,storage_path,mime_type,file_size")
    .eq("id", mediaId)
    .maybeSingle();
  if (error || !media) return null;
  if (!String(media.mime_type || "").toLowerCase().startsWith("image/") || Number(media.file_size || 0) > 8 * 1024 * 1024) return null;
  const { data: blob, error: downloadError } = await client.storage.from(media.bucket_id).download(media.storage_path);
  if (downloadError || !blob) return null;
  return { mime_type: media.mime_type || null, bytes: new Uint8Array(await blob.arrayBuffer()) };
}

async function getRequest(client: any, requestId: string) {
  const { data, error } = await client.from("document_signature_requests").select("*").eq("id", requestId).maybeSingle();
  if (error) throw error;
  if (!data) throw Object.assign(new Error("Solicitação de assinatura não encontrada."), { status: 404 });
  return data;
}

async function existingPdfBytes(client: any, path: string) {
  const { data, error } = await client.storage.from("signed-documents").download(path);
  if (error || !data) return null;
  return new Uint8Array(await data.arrayBuffer());
}

async function signedUrlForPath(client: any, path: string, expiresIn = 10 * 60) {
  const { data, error } = await client.storage.from("signed-documents").createSignedUrl(path, expiresIn);
  if (error || !data?.signedUrl) throw error || new Error("Não foi possível preparar o PDF.");
  return data.signedUrl;
}

export async function prepareSignatureBasePdf(client: any, request: Request, requestId: string) {
  let row = await getRequest(client, requestId);
  if (row.base_pdf_storage_path && row.base_pdf_hash) {
    const existing = await existingPdfBytes(client, row.base_pdf_storage_path);
    if (existing) {
      return {
        row,
        preview_url: await signedUrlForPath(client, row.base_pdf_storage_path),
        base_pdf_hash: row.base_pdf_hash,
      };
    }
  }

  const [checklistMedia, logo] = await Promise.all([
    allowedChecklistMedia(client, row),
    companyLogoMedia(client, row.document_snapshot),
  ]);
  const rendered = await renderBaseDocumentPdf({ snapshot: row.document_snapshot, checklistMedia, companyLogo: logo });
  const path = requestBasePdfPath(row);
  const hash = await sha256BytesHex(rendered.pdfBytes);
  const { error: uploadError } = await client.storage
    .from("signed-documents")
    .upload(path, new Blob([rendered.pdfBytes], { type: "application/pdf" }), { contentType: "application/pdf", upsert: true, cacheControl: "3600" });
  if (uploadError) throw uploadError;

  const { data: updated, error: updateError } = await client
    .from("document_signature_requests")
    .update({
      base_pdf_storage_path: path,
      base_pdf_hash: hash,
      base_pdf_signature_slots: rendered.signatureSlots,
      base_pdf_created_at: new Date().toISOString(),
    })
    .eq("id", row.id)
    .eq("organization_id", row.organization_id)
    .select("*")
    .maybeSingle();
  if (updateError || !updated) {
    await client.storage.from("signed-documents").remove([path]);
    throw updateError || new Error("Não foi possível congelar o PDF-base da assinatura.");
  }
  row = updated;
  await recordSystemEvent(client, request, row, "base_pdf_generated", { base_pdf_hash: hash, path });
  return {
    row,
    preview_url: await signedUrlForPath(client, path),
    base_pdf_hash: hash,
  };
}

export async function createBaseDocumentAccess(client: any, row: any) {
  if (!row?.base_pdf_storage_path || !row?.base_pdf_hash) {
    throw Object.assign(new Error("O PDF-base deste documento ainda não está disponível."), { status: 409 });
  }
  return {
    preview_url: await signedUrlForPath(client, row.base_pdf_storage_path),
    base_pdf_hash: row.base_pdf_hash,
  };
}

export async function renderPrintPreviewPdf(client: any, request: Request, input: {
  organizationId: string;
  serviceOrderId: string;
  templateId: string;
  snapshotHash: string;
  snapshot: any;
}) {
  const rowLike = {
    organization_id: input.organizationId,
    service_order_id: input.serviceOrderId,
    document_snapshot: input.snapshot,
  };
  const [checklistMedia, logo] = await Promise.all([
    allowedChecklistMedia(client, rowLike),
    companyLogoMedia(client, input.snapshot),
  ]);
  const rendered = await renderBaseDocumentPdf({ snapshot: input.snapshot, checklistMedia, companyLogo: logo });
  const hash = await sha256BytesHex(rendered.pdfBytes);
  const path = previewPdfPath({
    organizationId: input.organizationId,
    serviceOrderId: input.serviceOrderId,
    templateId: input.templateId,
    snapshotHash: input.snapshotHash,
  });
  const { error: uploadError } = await client.storage
    .from("signed-documents")
    .upload(path, new Blob([rendered.pdfBytes], { type: "application/pdf" }), { contentType: "application/pdf", upsert: true, cacheControl: "300" });
  if (uploadError) throw uploadError;

  const folder = `${input.organizationId}/${input.serviceOrderId}/print-previews/${input.templateId}`;
  const { data: siblings } = await client.storage.from("signed-documents").list(folder, { limit: 100 });
  const keepName = `${input.snapshotHash}.pdf`;
  const stale = (siblings || []).filter((item: any) => item?.name && item.name !== keepName).map((item: any) => `${folder}/${item.name}`);
  if (stale.length) await client.storage.from("signed-documents").remove(stale);

  return {
    preview_url: await signedUrlForPath(client, path),
    pdf_hash: hash,
    signature_slots: rendered.signatureSlots,
  };
}

async function sendFinalCopyEmail(client: any, request: Request, row: any, pdfBytes: Uint8Array, verificationUrl: string) {
  if (!row.require_external_signature || !row.external_signer_email) return;
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("DOCUMENT_SIGNATURE_EMAIL_FROM") || Deno.env.get("ORDER_DOCUMENT_EMAIL_FROM");
  if (!apiKey || !from) {
    await recordSystemEvent(client, request, row, "final_copy_email_failed", { recipient: maskEmail(row.external_signer_email), reason: "provider_not_configured" });
    return;
  }
  const company = await companySettings(client, row.organization_id);
  const safeCompany = escapeHtml(company.name || company.legal_name || "Empresa");
  const safeSigner = escapeHtml(row.external_signer_name || "Cliente");
  const safeDocument = escapeHtml(row.template_name_snapshot || "Documento");
  const safeCode = escapeHtml(row.verification_code);
  const safeVerificationUrl = escapeHtml(verificationUrl);
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [row.external_signer_email],
        subject: `${text(row.template_name_snapshot, 180)} assinado - OS ${text(row.order_number_snapshot, 80)}`,
        html: `<div style="font-family:Arial,sans-serif;color:#172536;line-height:1.55"><h2>${safeCompany}</h2><p>Olá, ${safeSigner}.</p><p>Seu documento <strong>${safeDocument}</strong> foi assinado eletronicamente e está anexado a este e-mail.</p><p>Código de autenticidade: <strong>${safeCode}</strong></p><p><a href="${safeVerificationUrl}">Verificar autenticidade</a></p></div>`,
        attachments: [{ filename: `${safeFileName(row.template_name_snapshot)}-OS-${safeFileName(row.order_number_snapshot)}.pdf`, content: bytesToBase64(pdfBytes) }],
      }),
    });
    const responseBody = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(String(responseBody?.message || "Provedor recusou a cópia final."));
    await recordSystemEvent(client, request, row, "final_copy_emailed", { recipient: maskEmail(row.external_signer_email) });
  } catch (error) {
    await recordSystemEvent(client, request, row, "final_copy_email_failed", { recipient: maskEmail(row.external_signer_email), reason: error instanceof Error ? error.message.slice(0, 180) : "send_failed" });
  }
}

export async function createSignedDocumentAccess(client: any, request: Request, row: any) {
  if (row.status !== "signed" || !row.final_pdf_storage_path || !row.final_pdf_hash) {
    throw Object.assign(new Error("O PDF final ainda não está disponível."), { status: 409 });
  }
  const baseUrl = publicBaseUrl(request);
  const verificationPath = buildVerificationPath(row.verification_code);
  return {
    download_url: await signedUrlForPath(client, row.final_pdf_storage_path),
    verification_url: baseUrl ? `${baseUrl}${verificationPath}` : verificationPath,
    verification_code: row.verification_code,
    final_pdf_hash: row.final_pdf_hash,
    base_pdf_hash: row.base_pdf_hash || null,
    snapshot_hash: row.snapshot_hash,
    signed_at: row.signed_at,
  };
}

export async function finalizeSignatureRequest(client: any, request: Request, sourceRow: any) {
  let row = sourceRow?.id ? await getRequest(client, sourceRow.id) : sourceRow;
  if (row.status === "signed") return { row, ...(await createSignedDocumentAccess(client, request, row)) };
  if (!["pending", "viewed"].includes(String(row.status))) throw Object.assign(new Error("Esta solicitação não pode mais ser finalizada."), { status: 409 });

  const signatures = await loadSignatureEvidence(client, row);
  const withImages = [];
  for (const signature of signatures) withImages.push({ ...signature, image_bytes: await signatureImageBytes(client, signature) });
  const latestSignedAt = signatures.map((signature: any) => Date.parse(signature.signed_at)).filter(Number.isFinite).sort((a: number, b: number) => b - a)[0];
  const signedAt = new Date(latestSignedAt || Date.now()).toISOString();
  const baseUrl = publicBaseUrl(request);
  if (!baseUrl) throw new Error("Configure SIGNATURE_PUBLIC_BASE_URL/SITE_URL para gerar o QR de autenticidade.");
  const verificationUrl = `${baseUrl}${buildVerificationPath(row.verification_code)}`;
  const finalPath = `${row.organization_id}/${row.service_order_id}/${row.id}/signed.pdf`;

  let pdfBytes = await existingPdfBytes(client, finalPath);
  let newlyGenerated = false;
  if (!pdfBytes) {
    const basePdfBytes = row.base_pdf_storage_path ? await existingPdfBytes(client, row.base_pdf_storage_path) : null;
    if (basePdfBytes && row.base_pdf_hash) {
      const actualBaseHash = await sha256BytesHex(basePdfBytes);
      if (actualBaseHash !== row.base_pdf_hash) throw new Error("O PDF-base congelado não passou na verificação de integridade.");
      pdfBytes = await applySignatureEvidenceToBasePdf({
        basePdfBytes,
        basePdfHash: row.base_pdf_hash,
        snapshotHash: row.snapshot_hash,
        verificationCode: row.verification_code,
        verificationUrl,
        signedAt,
        signatures: withImages,
        signatureSlots: Array.isArray(row.base_pdf_signature_slots) ? row.base_pdf_signature_slots : [],
      });
    } else {
      const [checklistMedia, logo] = await Promise.all([
        allowedChecklistMedia(client, row),
        companyLogoMedia(client, row.document_snapshot),
      ]);
      pdfBytes = await renderSignedDocumentPdf({
        snapshot: row.document_snapshot,
        snapshotHash: row.snapshot_hash,
        verificationCode: row.verification_code,
        verificationUrl,
        signedAt,
        signatures: withImages,
        checklistMedia,
        companyLogo: logo,
      });
    }

    const { error: uploadError } = await client.storage
      .from("signed-documents")
      .upload(finalPath, new Blob([pdfBytes], { type: "application/pdf" }), { contentType: "application/pdf", upsert: false, cacheControl: "3600" });
    if (uploadError) {
      const concurrentBytes = await existingPdfBytes(client, finalPath);
      if (!concurrentBytes) throw uploadError;
      pdfBytes = concurrentBytes;
    } else {
      newlyGenerated = true;
    }
  }

  const finalHash = await sha256BytesHex(pdfBytes);
  const { data: updated, error: updateError } = await client
    .from("document_signature_requests")
    .update({ status: "signed", signed_at: signedAt, final_pdf_storage_path: finalPath, final_pdf_hash: finalHash })
    .eq("id", row.id)
    .eq("organization_id", row.organization_id)
    .in("status", ["pending", "viewed"])
    .select("*")
    .maybeSingle();
  if (updateError) throw updateError;
  if (!updated) {
    row = await getRequest(client, row.id);
    if (row.status !== "signed") {
      if (newlyGenerated) await client.storage.from("signed-documents").remove([finalPath]);
      throw Object.assign(new Error("Outra operação alterou esta solicitação. Atualize e tente novamente."), { status: 409 });
    }
    return { row, ...(await createSignedDocumentAccess(client, request, row)) };
  }

  row = updated;
  if (newlyGenerated) await recordSystemEvent(client, request, row, "pdf_generated", { final_pdf_hash: finalHash, base_pdf_hash: row.base_pdf_hash || null });
  await recordSystemEvent(client, request, row, "signed", { verification_code: row.verification_code, final_pdf_hash: finalHash, base_pdf_hash: row.base_pdf_hash || null });
  await sendFinalCopyEmail(client, request, row, pdfBytes, verificationUrl);
  return { row, ...(await createSignedDocumentAccess(client, request, row)) };
}

export async function verifySignedDocumentByCode(client: any, rawCode: unknown) {
  const code = text(rawCode, 160);
  if (!code || code.length < 8) throw Object.assign(new Error("Documento assinado não encontrado."), { status: 404 });
  const { data: row, error } = await client
    .from("document_signature_requests")
    .select("id,verification_code,organization_id,template_name_snapshot,order_number_snapshot,signed_at,snapshot_hash,base_pdf_hash,final_pdf_hash,status")
    .eq("verification_code", code)
    .eq("status", "signed")
    .maybeSingle();
  if (error) throw error;
  if (!row?.id || !row?.final_pdf_hash || !row?.signed_at) throw Object.assign(new Error("Documento assinado não encontrado."), { status: 404 });
  const [{ data: signatures, error: signatureError }, company] = await Promise.all([
    client
      .from("document_signatures")
      .select("signer_type,signer_name,signer_document_masked,validation_method,signed_at")
      .eq("organization_id", row.organization_id)
      .eq("request_id", row.id)
      .order("signed_at", { ascending: true }),
    companySettings(client, row.organization_id),
  ]);
  if (signatureError) throw signatureError;
  return { ...minimalVerificationPayload(row, signatures || [], company), base_pdf_hash: row.base_pdf_hash || null };
}

export async function signedRequestById(client: any, requestId: string) {
  return getRequest(client, requestId);
}
