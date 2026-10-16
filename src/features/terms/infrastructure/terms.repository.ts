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

export type AcceptedOrganizationTerm = {
  id: string;
  term_type: OrganizationTermType;
  title: string;
  content: string;
  version: number;
  accepted_version: number;
  accepted_at: string;
};

/** Consulta apenas os aceites do usuário da sessão e os termos da empresa ativa. */
export async function listMyAcceptedOrganizationTerms(
  organizationId: string,
  userId: string,
): Promise<AcceptedOrganizationTerm[]> {
  if (!organizationId || !userId) return [];
  const { data: acceptances, error: acceptanceError } = await supabase
    .from("organization_term_acceptances")
    .select("term_id,term_version,accepted_at")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .order("accepted_at", { ascending: false });
  if (acceptanceError) throw acceptanceError;
  const latest = new Map<string, { term_version: number; accepted_at: string }>();
  for (const item of acceptances ?? []) {
    if (!latest.has(item.term_id)) latest.set(item.term_id, {
      term_version: item.term_version, accepted_at: item.accepted_at,
    });
  }
  if (!latest.size) return [];
  const { data: terms, error: termError } = await supabase
    .from("organization_terms")
    .select("id,term_type,title,content,version")
    .eq("organization_id", organizationId)
    .in("id", [...latest.keys()]);
  if (termError) throw termError;
  return (terms ?? []).filter(term => term.term_type === "usage" || term.term_type === "responsibility")
    .map(term => ({
      id: term.id,
      term_type: term.term_type as OrganizationTermType,
      title: term.title,
      content: term.content,
      version: term.version,
      accepted_version: latest.get(term.id)!.term_version,
      accepted_at: latest.get(term.id)!.accepted_at,
    }))
    .sort((a, b) => a.term_type.localeCompare(b.term_type, "pt-BR"));
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

export type ServiceWarrantyTermRow = {
  general_service_id: string;
  service_name: string;
  service_is_active: boolean;
  warranty_id: string | null;
  title: string | null;
  content: string | null;
  warranty_days: number | null;
  version: number;
  is_active: boolean;
  updated_at: string | null;
};

export async function listServiceWarrantyTerms(organizationId: string): Promise<ServiceWarrantyTermRow[]> {
  const { data, error } = await supabase.rpc("list_service_warranty_terms_v1", {
    p_organization_id: organizationId,
  });
  if (error) throw error;
  return (data || []) as ServiceWarrantyTermRow[];
}

export async function saveServiceWarrantyTerm({
  organizationId,
  generalServiceId,
  title,
  content,
  warrantyDays,
  isActive,
}: {
  organizationId: string;
  generalServiceId: string;
  title: string;
  content: string;
  warrantyDays: number;
  isActive: boolean;
}) {
  const { data, error } = await supabase.rpc("save_service_warranty_term_v1", {
    p_organization_id: organizationId,
    p_general_service_id: generalServiceId,
    p_title: title,
    p_content: content,
    p_warranty_days: warrantyDays,
    p_is_active: isActive,
  });
  if (error) throw error;
  return data;
}

