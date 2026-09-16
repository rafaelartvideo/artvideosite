import { supabase } from "@/lib/supabase";
import type {
  CreateDocumentSignatureRequestInput,
  DocumentSignatureAuditEvent,
  DocumentSignatureRequestSummary,
} from "../domain/document-signature";

const FUNCTION_NAME = "document-signature-admin";

async function invokeSignatureAdmin<T>(action: string, payload: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, {
    body: { action, ...payload },
  });
  if (error) throw error;
  if (!data || data.success !== true) throw new Error(String(data?.error || "Não foi possível concluir a operação de assinatura."));
  return data as T & { success: true };
}

export async function createSignatureRequest(input: CreateDocumentSignatureRequestInput) {
  return invokeSignatureAdmin<{
    request: DocumentSignatureRequestSummary;
    link?: string | null;
    email_warning?: string | null;
  }>("create", input as unknown as Record<string, unknown>);
}

export async function listOrderSignatureRequests(organizationId: string, serviceOrderId: string) {
  const result = await invokeSignatureAdmin<{ requests: DocumentSignatureRequestSummary[] }>("list", {
    organization_id: organizationId,
    service_order_id: serviceOrderId,
  });
  return result.requests || [];
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
