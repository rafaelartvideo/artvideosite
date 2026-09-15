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

function normalizeError(error: unknown) {
  if (!error) return null;
  return error instanceof Error ? error : new Error(supabaseErrorMessage(error));
}

export async function listRegistrationRecords(organizationId: string, entityId: string) {
  const result = await supabase
    .from("entity_records")
    .select("id,organization_id,entity_id,created_by,record_type,title,content,created_at")
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false });

  if (result.error) {
    return { data: [] as RegistrationRecord[], error: normalizeError(result.error) };
  }

  const rows = (result.data || []) as Array<Omit<RegistrationRecord, "author_name">>;
  const authorIds = Array.from(new Set(rows.map(row => row.created_by).filter(Boolean))) as string[];
  const authorNames = new Map<string, string>();

  if (authorIds.length) {
    const profiles = await supabase
      .from("profiles")
      .select("id,full_name,email")
      .in("id", authorIds);
    if (!profiles.error) {
      (profiles.data || []).forEach((profile: any) => {
        authorNames.set(String(profile.id), String(profile.full_name || profile.email || "Usuário"));
      });
    }
  }

  return {
    data: rows.map(row => ({
      ...row,
      author_name: row.created_by ? authorNames.get(row.created_by) || "Usuário" : "Sistema",
    })),
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
    .select("id,organization_id,entity_id,created_by,record_type,title,content,created_at")
    .single();
  return {
    data: result.data,
    error: result.error ? normalizeError(result.error) : null,
  };
}
