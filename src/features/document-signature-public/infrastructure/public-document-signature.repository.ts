import { projectId, publicAnonKey } from "../../../../utils/supabase/info";

const FUNCTION_NAME = "document-signature-public";
const PDF_FUNCTION_NAME = "document-signature-pdf";
const FUNCTION_URL = `https://${projectId}.supabase.co/functions/v1/${FUNCTION_NAME}`;
const PDF_FUNCTION_URL = `https://${projectId}.supabase.co/functions/v1/${PDF_FUNCTION_NAME}`;

export type PublicSignatureInspection = {
  state: "pending" | "viewed" | "signed" | "expired" | "cancelled";
  company_name: string;
  document_name: string;
  order_number: string;
  signer_name: string | null;
  signer_document_masked: string | null;
  signer_email_masked: string | null;
  expires_at: string;
  verification_code: string | null;
  final_pdf_hash: string | null;
  snapshot_hash: string | null;
  signed_at: string | null;
  external_signature_captured: boolean;
  captured_at: string | null;
};

export type PublicSignatureDocument = {
  preview_url: string;
  base_pdf_hash: string;
  consent_text: string;
  signer_name: string;
  signer_document_masked: string;
  expires_at: string;
  verification_code: string;
};

export type PublicSignedDocumentAccess = {
  download_url: string;
  verification_url: string;
  verification_code: string;
  final_pdf_hash: string;
  snapshot_hash: string;
  signed_at: string;
};

export type PublicDocumentVerification = {
  valid: true;
  company_name: string;
  document_name: string;
  order_number: string;
  signed_at: string;
  verification_code: string;
  snapshot_hash: string;
  final_pdf_hash: string;
  signers: Array<{
    signer_type: "employee" | "external";
    signer_name: string;
    signer_document_masked: string | null;
    validation_method: "stored_employee_signature" | "cpf_cnpj" | "email_otp";
    signed_at: string | null;
  }>;
};

async function invokeAt<T>(url: string, action: string, payload: Record<string, unknown>) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: publicAnonKey,
    },
    body: JSON.stringify({ action, ...payload }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data || data.success !== true) {
    throw Object.assign(
      new Error(String(data?.error || "Não foi possível acessar a assinatura eletrônica.")),
      { code: data?.code || null },
    );
  }
  return data as T & { success: true };
}

async function invokePublicSignature<T>(action: string, payload: Record<string, unknown>) {
  return invokeAt<T>(FUNCTION_URL, action, payload);
}

async function invokePublicSignaturePdf<T>(action: string, payload: Record<string, unknown>) {
  return invokeAt<T>(PDF_FUNCTION_URL, action, payload);
}

export async function inspectPublicSignature(token: string) {
  return invokePublicSignature<PublicSignatureInspection>("inspect", { token });
}

export async function validatePublicSignatureIdentity(token: string, document: string) {
  return invokePublicSignature<{
    proof?: string;
    expires_in_seconds?: number;
    already_captured?: boolean;
    signed?: boolean;
    signed_at?: string;
    verification_code?: string;
    verification_url?: string;
    download_url?: string;
  }>("validate_identity", { token, document });
}

export async function loadPublicSignatureDocument(token: string, proof: string) {
  const result = await invokePublicSignaturePdf<{ document: PublicSignatureDocument }>("preview", { token, proof });
  return result.document;
}

export async function completePublicSignature({
  token,
  proof,
  signatureDataUrl,
}: {
  token: string;
  proof: string;
  signatureDataUrl: string;
}) {
  return invokePublicSignaturePdf<{
    captured?: boolean;
    captured_at?: string;
    signed: boolean;
    signed_at: string;
    verification_code: string;
    verification_url: string;
    download_url: string;
    base_pdf_hash?: string | null;
    final_pdf_hash: string;
    snapshot_hash: string;
  }>("complete", {
    token,
    proof,
    consent_accepted: true,
    signature_data_url: signatureDataUrl,
  });
}

export async function getPublicSignedDocument(token: string) {
  return invokePublicSignature<PublicSignedDocumentAccess>("signed_document", { token });
}

export async function verifyPublicSignedDocument(verificationCode: string) {
  const result = await invokePublicSignature<{ document: PublicDocumentVerification }>("verify_document", {
    verification_code: verificationCode,
  });
  return result.document;
}
