import { projectId, publicAnonKey } from "../../../../utils/supabase/info";

const FUNCTION_NAME = "document-signature-public";
const FUNCTION_URL = `https://${projectId}.supabase.co/functions/v1/${FUNCTION_NAME}`;

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
  external_signature_captured: boolean;
  captured_at: string | null;
};

export type PublicSignatureDocument = {
  snapshot: any;
  consent_text: string;
  signer_name: string;
  signer_document_masked: string;
  expires_at: string;
  verification_code: string;
};

async function invokePublicSignature<T>(action: string, payload: Record<string, unknown>) {
  const response = await fetch(FUNCTION_URL, {
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
      {
        code: data?.code || null,
        retryAfterSeconds: Number(data?.retry_after_seconds || response.headers.get("Retry-After")) || 0,
      },
    );
  }
  return data as T & { success: true };
}

export async function inspectPublicSignature(token: string) {
  return invokePublicSignature<PublicSignatureInspection>("inspect", { token });
}

export async function requestPublicSignatureOtp(token: string, document: string) {
  return invokePublicSignature<{
    challenge_id?: string;
    destination?: string;
    expires_in_seconds?: number;
    retry_after_seconds?: number;
    already_captured?: boolean;
  }>("request_otp", { token, document });
}

export async function verifyPublicSignatureOtp(token: string, challengeId: string, code: string) {
  return invokePublicSignature<{
    proof?: string;
    expires_in_seconds?: number;
    already_captured?: boolean;
  }>("verify_otp", { token, challenge_id: challengeId, code });
}

export async function loadPublicSignatureDocument(token: string, proof: string) {
  const result = await invokePublicSignature<{ document: PublicSignatureDocument }>("document", { token, proof });
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
  return invokePublicSignature<{
    captured: boolean;
    captured_at: string;
    verification_code: string;
  }>("complete", {
    token,
    proof,
    consent_accepted: true,
    signature_data_url: signatureDataUrl,
  });
}
