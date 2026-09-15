import { supabase } from "@/lib/supabase";
import { supabaseErrorMessage } from "@/shared/infrastructure/media.repository";

export type RegistrationContact = {
  id: string;
  organization_id: string;
  entity_id: string;
  name: string;
  job_title: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  is_primary: boolean;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type RegistrationContactPayload = {
  name: string;
  job_title?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
};

const CONTACT_SELECT = "id,organization_id,entity_id,name,job_title,phone,whatsapp,email,is_primary,is_active,created_by,created_at,updated_at";

function normalizeError(error: unknown) {
  if (!error) return null;
  return error instanceof Error ? error : new Error(supabaseErrorMessage(error));
}

function clean(value?: string | null) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

export async function listRegistrationContacts(organizationId: string, entityId: string) {
  const result = await supabase
    .from("entity_contacts")
    .select(CONTACT_SELECT)
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .order("is_primary", { ascending: false })
    .order("is_active", { ascending: false })
    .order("name", { ascending: true });
  return {
    data: (result.data || []) as RegistrationContact[],
    error: result.error ? normalizeError(result.error) : null,
  };
}

export async function createRegistrationContact(
  organizationId: string,
  entityId: string,
  payload: RegistrationContactPayload,
) {
  const result = await supabase
    .from("entity_contacts")
    .insert({
      organization_id: organizationId,
      entity_id: entityId,
      name: payload.name.trim(),
      job_title: clean(payload.job_title),
      phone: clean(payload.phone),
      whatsapp: clean(payload.whatsapp),
      email: clean(payload.email)?.toLowerCase() || null,
      is_primary: false,
      is_active: true,
    })
    .select(CONTACT_SELECT)
    .single();
  return {
    data: result.data as RegistrationContact | null,
    error: result.error ? normalizeError(result.error) : null,
  };
}

export async function updateRegistrationContact(
  organizationId: string,
  entityId: string,
  contactId: string,
  payload: RegistrationContactPayload,
) {
  const result = await supabase
    .from("entity_contacts")
    .update({
      name: payload.name.trim(),
      job_title: clean(payload.job_title),
      phone: clean(payload.phone),
      whatsapp: clean(payload.whatsapp),
      email: clean(payload.email)?.toLowerCase() || null,
    })
    .eq("id", contactId)
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .select(CONTACT_SELECT)
    .single();
  return {
    data: result.data as RegistrationContact | null,
    error: result.error ? normalizeError(result.error) : null,
  };
}

export async function setRegistrationContactActive(
  organizationId: string,
  entityId: string,
  contactId: string,
  isActive: boolean,
) {
  const result = await supabase
    .from("entity_contacts")
    .update({ is_active: isActive })
    .eq("id", contactId)
    .eq("organization_id", organizationId)
    .eq("entity_id", entityId)
    .select(CONTACT_SELECT)
    .single();
  return {
    data: result.data as RegistrationContact | null,
    error: result.error ? normalizeError(result.error) : null,
  };
}
