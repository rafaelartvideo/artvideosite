import { supabase } from "@/lib/supabase";
import { prepareFileForUpload } from "@/shared/application/upload-file-optimizer";
import type { FinancialAttachment, FinancialAttachmentType } from "../domain/finance.types";

const ATTACHMENT_COLUMNS = "id,organization_id,financial_entry_id,financial_settlement_id,attachment_type,file_name,storage_path,mime_type,size_bytes,created_by,created_at,archived_at,archived_by,archive_reason";

function requiredOrganizationId(organizationId: string) {
  const normalized = String(organizationId || "").trim();
  if (!normalized) throw new Error("Empresa ativa não encontrada.");
  return normalized;
}

function safeFileName(value: string) {
  return String(value || "arquivo")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "arquivo";
}

export async function listFinancialAttachments(organizationId: string, entryId: string): Promise<FinancialAttachment[]> {
  const org = requiredOrganizationId(organizationId);
  const { data, error } = await supabase
    .from("financial_attachments")
    .select(ATTACHMENT_COLUMNS)
    .eq("organization_id", org)
    .eq("financial_entry_id", entryId)
    .is("archived_at", null)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []) as FinancialAttachment[];
}

export async function uploadFinancialAttachment(
  organizationId: string,
  entryId: string,
  file: File,
  attachmentType: FinancialAttachmentType,
  settlementId?: string | null,
): Promise<string> {
  const org = requiredOrganizationId(organizationId);
  if (!file) throw new Error("Selecione um arquivo.");
  if (file.size > 20 * 1024 * 1024) throw new Error("O arquivo deve ter no máximo 20 MB.");

  const preparedFile = await prepareFileForUpload(file, "document-image");
  const path = `${org}/${entryId}/${crypto.randomUUID()}-${safeFileName(preparedFile.name)}`;
  const { error: uploadError } = await supabase.storage
    .from("financial-documents")
    .upload(path, preparedFile, { contentType: preparedFile.type || undefined, upsert: false });
  if (uploadError) throw uploadError;

  const { data, error } = await supabase.rpc("register_financial_attachment", {
    p_organization_id: org,
    p_entry_id: entryId,
    p_settlement_id: settlementId || null,
    p_attachment_type: attachmentType,
    p_file_name: preparedFile.name,
    p_storage_path: path,
    p_mime_type: preparedFile.type || null,
    p_size_bytes: preparedFile.size,
  });

  if (error) {
    await supabase.storage.from("financial-documents").remove([path]).catch(() => undefined);
    throw error;
  }
  return String(data);
}

export async function createFinancialAttachmentSignedUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage.from("financial-documents").createSignedUrl(storagePath, 300);
  if (error) throw error;
  if (!data?.signedUrl) throw new Error("Não foi possível gerar o link do documento.");
  return data.signedUrl;
}

export async function archiveFinancialAttachment(
  organizationId: string,
  attachmentId: string,
  reason: string,
): Promise<string> {
  const org = requiredOrganizationId(organizationId);
  const normalized = String(reason || "").trim();
  if (!normalized) throw new Error("Informe o motivo do arquivamento.");
  const { data, error } = await supabase.rpc("archive_financial_attachment", {
    p_organization_id: org,
    p_attachment_id: attachmentId,
    p_reason: normalized,
  });
  if (error) throw error;
  return String(data);
}
