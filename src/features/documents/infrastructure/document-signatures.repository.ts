import { supabase } from "@/lib/supabase";
import type {
  CreateDocumentSignatureRequestInput,
  DocumentSignatureAuditEvent,
  DocumentSignatureRequestSummary,
} from "../domain/document-signature";
import type { FrozenOrderPrintPdf } from "../domain/order-print-pdf-freeze";

const FUNCTION_NAME = "document-signature-admin";
const PDF_FUNCTION_NAME = "document-signature-pdf";
const SIGNED_DOCUMENTS_BUCKET = "signed-documents";

export type DocumentSignatureEmployeeCandidate = {
  entity_id: string;
  employee_name: string;
  signature_version: number;
};

export type SignedDocumentAccess = {
  download_url: string;
  verification_url: string;
  verification_code: string;
  final_pdf_hash: string;
  snapshot_hash: string;
  signed_at: string;
};

async function invokeSignatureAdmin<T>(action: string, payload: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, {
    body: { action, ...payload },
  });
  if (error) throw error;
  if (!data || data.success !== true) throw new Error(String(data?.error || "Não foi possível concluir a operação de assinatura."));
  return data as T & { success: true };
}

async function invokeSignaturePdf<T>(action: string, payload: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke(PDF_FUNCTION_NAME, {
    body: { action, ...payload },
  });
  if (error) throw error;
  if (!data || data.success !== true) throw new Error(String(data?.error || "Não foi possível preparar o PDF para assinatura."));
  return data as T & { success: true };
}

export async function createSignatureRequest(input: CreateDocumentSignatureRequestInput) {
  return invokeSignatureAdmin<{
    request: DocumentSignatureRequestSummary;
    link?: string | null;
    email_warning?: string | null;
    finalization_warning?: string | null;
  }>("create", input as unknown as Record<string, unknown>);
}

export async function attachFrozenPrintPdf(
  organizationId: string,
  requestId: string,
  frozenPdf: FrozenOrderPrintPdf,
) {
  const prepared = await invokeSignaturePdf<{ storage_path: string; upload_token: string }>("prepare_upload", {
    organization_id: organizationId,
    request_id: requestId,
  });
  const { error: uploadError } = await supabase.storage
    .from(SIGNED_DOCUMENTS_BUCKET)
    .uploadToSignedUrl(prepared.storage_path, prepared.upload_token, frozenPdf.blob, {
      contentType: "application/pdf",
      cacheControl: "3600",
    });
  if (uploadError) throw uploadError;
  return invokeSignaturePdf<{ base_pdf_hash: string; page_count: number; final_pdf_hash?: string | null }>("commit_base_pdf", {
    organization_id: organizationId,
    request_id: requestId,
    page_count: frozenPdf.page_count,
    signature_slots: frozenPdf.signature_slots,
  });
}

export async function listOrderSignatureRequests(organizationId: string, serviceOrderId: string) {
  const result = await invokeSignatureAdmin<{ requests: DocumentSignatureRequestSummary[] }>("list", {
    organization_id: organizationId,
    service_order_id: serviceOrderId,
  });
  return result.requests || [];
}

export async function listDocumentSignatureEmployeeCandidates(organizationId: string) {
  const { data, error } = await (supabase as any).rpc("list_document_signature_employee_candidates", {
    p_organization_id: organizationId,
  });
  if (error) throw error;
  return (data || []) as DocumentSignatureEmployeeCandidate[];
}

export async function getSignatureAdminLink(organizationId: string, requestId: string) {
  const result = await invokeSignatureAdmin<{ link: string }>("link", {
    organization_id: organizationId,
    request_id: requestId,
  });
  return result.link;
}

export async function resendSignatureEmail(organizationId: string, requestId: string) {
  return invokeSignatureAdmin<{ recipient: string; email_warning?: string | null }>("resend_email", {
    organization_id: organizationId,
    request_id: requestId,
  });
}

export async function cancelSignatureRequest(organizationId: string, requestId: string) {
  const result = await invokeSignatureAdmin<{ request: DocumentSignatureRequestSummary }>("cancel", {
    organization_id: organizationId,
    request_id: requestId,
  });
  return result.request;
}

export async function getSignatureAudit(organizationId: string, requestId: string) {
  const result = await invokeSignatureAdmin<{ events: DocumentSignatureAuditEvent[] }>("audit", {
    organization_id: organizationId,
    request_id: requestId,
  });
  return result.events || [];
}

export async function getSignedSignatureDocument(organizationId: string, requestId: string) {
  return invokeSignatureAdmin<SignedDocumentAccess>("signed_document", {
    organization_id: organizationId,
    request_id: requestId,
  });
}
