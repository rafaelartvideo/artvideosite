import { supabase } from "@/lib/supabase";
import {
  createStorageSignedUrl,
  supabaseErrorMessage,
  uploadRegistrationRecordMediaFile,
} from "@/shared/infrastructure/media.repository";

export type RegistrationRecordAttachment = {
  id: string;
  media_id: string;
  file_name: string;
  mime_type: string | null;
  file_size: number | null;
  bucket_id: string;
  storage_path: string;
};

export type RegistrationRecord = {
  id: string;
  organization_id: string;
  entity_id: string;
  created_by: string | null;
  record_type: string;
  title: string;
  content: string;
  created_at: string;
  author_name: string;
  attachments: RegistrationRecordAttachment[];
};

const RECORD_SELECT = `
  id,organization_id,entity_id,created_by,record_type,title,content,created_at,
  created_by_profile:profiles!entity_records_created_by_fkey(id,full_name,email)
`;

function normalizeError(error: unknown) {
  if (!error) return null;
  return error instanceof Error ? error : new Error(supabaseErrorMessage(error));
}

function mapRegistrationRecord(row: any): RegistrationRecord {
  const profile = Array.isArray(row?.created_by_profile)
    ? row.created_by_profile[0]
    : row?.created_by_profile;
  return {
    id: String(row.id),
    organization_id: String(row.organization_id),
    entity_id: String(row.entity_id),
    created_by: row.created_by ? String(row.created_by) : null,
    record_type: String(row.record_type || "note"),
    title: String(row.title || "Registro"),
    content: String(row.content || ""),
    created_at: String(row.created_at),
    author_name: row.created_by
      ? String(profile?.full_name || profile?.email || "Usuário")
      : "Sistema",
    attachments: [],
  };
}

function mapAttachment(row: any): RegistrationRecordAttachment | null {
  const media = Array.isArray(row?.media) ? row.media[0] : row?.media;
  if (!media?.id) return null;
  return {
    id: String(row.id),
    media_id: String(media.id),
    file_name: String(media.file_name || "Arquivo"),
    mime_type: media.mime_type ? String(media.mime_type) : null,
    file_size: media.file_size == null ? null : Number(media.file_size),
    bucket_id: String(media.bucket_id || "registration-files"),
    storage_path: String(media.storage_path || ""),
  };
}

export async function listRegistrationRecords(organizationId: string, entityId: string) {
  const recordsResult = await supabase
    .from("entity_records")
    .select(RECORD_SELECT)
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false });

  if (recordsResult.error) {
    return { data: [] as RegistrationRecord[], error: normalizeError(recordsResult.error) };
  }

  const records = (recordsResult.data || []).map(mapRegistrationRecord);
  if (!records.length) return { data: records, error: null };

  const attachmentsResult = await supabase
    .from("entity_record_media")
    .select("id,record_id,media_id,created_at,media:media(id,bucket_id,storage_path,file_name,mime_type,file_size)")
    .eq("organization_id", organizationId)
    .in("record_id", records.map(record => record.id))
    .order("created_at", { ascending: true });

  if (attachmentsResult.error) {
    return { data: records, error: normalizeError(attachmentsResult.error) };
  }

  const byRecord = new Map<string, RegistrationRecordAttachment[]>();
  for (const row of attachmentsResult.data || []) {
    const attachment = mapAttachment(row);
    if (!attachment) continue;
    const recordId = String((row as any).record_id);
    const current = byRecord.get(recordId) || [];
    current.push(attachment);
    byRecord.set(recordId, current);
  }

  return {
    data: records.map(record => ({ ...record, attachments: byRecord.get(record.id) || [] })),
    error: null,
  };
}

export async function createRegistrationRecord(
  organizationId: string,
  entityId: string,
  content: string,
  title = "Registro",
) {
  const result = await supabase
    .from("entity_records")
    .insert({
      organization_id: organizationId,
      entity_id: entityId,
      record_type: "note",
      title: title.trim() || "Registro",
      content: content.trim(),
    })
    .select(RECORD_SELECT)
    .single();
  return {
    data: result.data ? mapRegistrationRecord(result.data) : null,
    error: result.error ? normalizeError(result.error) : null,
  };
}

export async function addRegistrationRecordAttachments(
  organizationId: string,
  entityId: string,
  recordId: string,
  files: File[],
) {
  let uploaded = 0;
  for (const file of files) {
    try {
      const mediaId = await uploadRegistrationRecordMediaFile(organizationId, entityId, recordId, file);
      const { error } = await supabase.from("entity_record_media").insert({
        organization_id: organizationId,
        record_id: recordId,
        media_id: mediaId,
      });
      if (error) throw error;
      uploaded += 1;
    } catch (error) {
      return { uploaded, error: normalizeError(error) };
    }
  }
  return { uploaded, error: null };
}

export async function getRegistrationRecordAttachmentUrl(
  attachment: RegistrationRecordAttachment,
  download = false,
) {
  try {
    const url = await createStorageSignedUrl(
      attachment.bucket_id as "registration-files",
      attachment.storage_path,
      300,
      download ? attachment.file_name : undefined,
    );
    return { url, error: null };
  } catch (error) {
    return { url: "", error: normalizeError(error) };
  }
}
