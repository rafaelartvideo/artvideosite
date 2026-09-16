import { supabase } from "@/lib/supabase";
import type { EmployeeSignature } from "../domain/employee-signature";

const BUCKET = "employee-signatures";
const MAX_SIGNATURE_BYTES = 1024 * 1024;

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Blob(blob: Blob) {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return bytesToHex(new Uint8Array(digest));
}

export async function getActiveEmployeeSignature(organizationId: string, entityId: string) {
  const { data, error } = await (supabase as any)
    .from("employee_signatures")
    .select("id,organization_id,entity_id,version,is_active,storage_path,signature_hash,created_by,created_at,deactivated_at")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw error;
  return (data || null) as EmployeeSignature | null;
}

export async function createEmployeeSignaturePreviewUrl(storagePath: string, expiresInSeconds = 600) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, expiresInSeconds);
  if (error) throw error;
  return data.signedUrl;
}

export async function saveEmployeeSignature({
  organizationId,
  entityId,
  blob,
}: {
  organizationId: string;
  entityId: string;
  blob: Blob;
}) {
  if (blob.type !== "image/png") throw new Error("A assinatura precisa ser salva em PNG.");
  if (blob.size <= 0) throw new Error("Faça sua assinatura antes de salvar.");
  if (blob.size > MAX_SIGNATURE_BYTES) throw new Error("A assinatura excede o limite de 1 MB.");

  const objectId = crypto.randomUUID();
  const storagePath = `${organizationId}/${entityId}/${objectId}.png`;
  const signatureHash = await sha256Blob(blob);

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, blob, { contentType: "image/png", upsert: false, cacheControl: "3600" });
  if (uploadError) throw uploadError;

  const { data, error } = await (supabase as any).rpc("save_employee_signature", {
    p_organization_id: organizationId,
    p_entity_id: entityId,
    p_storage_path: storagePath,
    p_signature_hash: signatureHash,
  });
  if (error) throw error;

  return data as EmployeeSignature;
}
