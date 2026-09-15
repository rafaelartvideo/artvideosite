import { supabase } from "@/lib/supabase";
import { supabaseErrorMessage } from "@/shared/infrastructure/media.repository";

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
  };
}

export async function listRegistrationRecords(organizationId: string, entityId: string) {
  const result = await supabase
    .from("entity_records")
    .select(RECORD_SELECT)
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false });

  return {
    data: result.error ? [] as RegistrationRecord[] : (result.data || []).map(mapRegistrationRecord),
    error: result.error ? normalizeError(result.error) : null,
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
