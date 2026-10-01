import { supabase } from "@/lib/supabase";

export type OrganizationTermType = "usage" | "responsibility";

export type OrganizationTerm = {
  id: string;
  organization_id: string;
  term_type: OrganizationTermType;
  title: string;
  content: string;
  version: number;
  is_active: boolean;
  updated_at: string;
};

export type PendingOrganizationTerm = {
  id: string;
  term_type: OrganizationTermType;
  title: string;
  content: string;
  version: number;
  organization_name: string;
};

export async function listOrganizationTerms(organizationId: string): Promise<OrganizationTerm[]> {
  const { data, error } = await supabase.rpc("list_organization_terms_v1", {
    p_organization_id: organizationId,
  });
  if (error) throw error;
  return (data || []) as OrganizationTerm[];
}

export async function saveOrganizationTerm({
  organizationId,
  termType,
  title,
  content,
  isActive,
}: {
  organizationId: string;
  termType: OrganizationTermType;
  title: string;
  content: string;
  isActive: boolean;
}) {
  const { data, error } = await supabase.rpc("save_organization_term_v1", {
    p_organization_id: organizationId,
    p_term_type: termType,
    p_title: title,
    p_content: content,
    p_is_active: isActive,
  });
  if (error) throw error;
  return data as OrganizationTerm;
}

export async function getPendingOrganizationTerms(organizationId: string): Promise<PendingOrganizationTerm[]> {
  const { data, error } = await supabase.rpc("get_pending_organization_terms_v1", {
    p_organization_id: organizationId,
  });
  if (error) throw error;
  return (data || []) as PendingOrganizationTerm[];
}

export async function acceptOrganizationTerm(
  organizationId: string,
  termId: string,
  termVersion: number,
) {
  const { error } = await supabase.rpc("accept_organization_term_v1", {
    p_organization_id: organizationId,
    p_term_id: termId,
    p_term_version: termVersion,
  });
  if (error) throw error;
}
