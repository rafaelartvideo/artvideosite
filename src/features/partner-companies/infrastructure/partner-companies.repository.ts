import { supabase } from "@/lib/supabase";

export const PLATFORM_ORGANIZATION_ID = "00000000-0000-4000-8000-000000000001";

export type PartnerCompanyInput = {
  name: string;
  legal_name: string | null;
  document: string | null;
  slug: string;
  status: "active" | "suspended" | "cancelled";
};

export function listPartnerCompanies() {
  return supabase
    .from("organizations")
    .select("id,name,legal_name,document,slug,status,created_at,updated_at")
    .neq("id", PLATFORM_ORGANIZATION_ID)
    .order("name");
}

export function createPartnerCompany(payload: PartnerCompanyInput) {
  return supabase
    .from("organizations")
    .insert({ ...payload, organization_type: "partner", parent_organization_id: null })
    .select("id,name,legal_name,document,slug,status,created_at,updated_at")
    .single();
}

export function updatePartnerCompany(id: string, payload: PartnerCompanyInput) {
  return supabase
    .from("organizations")
    .update({ ...payload, parent_organization_id: null, organization_type: "partner" })
    .eq("id", id)
    .select("id,name,legal_name,document,slug,status,created_at,updated_at")
    .single();
}

export function listPartnerMembers(organizationId?: string | null) {
  let query = supabase
    .from("organization_members")
    .select("id,organization_id,user_id,role_id,status,is_owner,joined_at,created_at,organization:organizations(id,name),profile:profiles!organization_members_user_id_fkey(id,full_name),role:roles(id,name)")
    .neq("organization_id", PLATFORM_ORGANIZATION_ID)
    .order("created_at", { ascending: false });
  if (organizationId) query = query.eq("organization_id", organizationId);
  return query;
}

export function listSystemModules() {
  return supabase
    .from("system_modules")
    .select("key,name,description,category,sort_order,is_active")
    .eq("is_active", true)
    .order("category")
    .order("sort_order");
}

export function listOrganizationModules(organizationId: string) {
  return supabase
    .from("organization_modules")
    .select("organization_id,module_key,is_enabled,limits,settings,updated_at")
    .eq("organization_id", organizationId);
}

export function setOrganizationModuleEnabled(organizationId: string, moduleKey: string, enabled: boolean, userId?: string | null) {
  return supabase
    .from("organization_modules")
    .upsert({
      organization_id: organizationId,
      module_key: moduleKey,
      is_enabled: enabled,
      enabled_by: userId || null,
      enabled_at: enabled ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }, { onConflict: "organization_id,module_key" });
}

export function listPartnerShares(organizationId?: string | null) {
  let query = supabase
    .from("organization_data_shares")
    .select("id,parent_organization_id,child_organization_id,resource_key,access_level,updated_at,owner:organizations!organization_data_shares_child_organization_id_fkey(id,name)")
    .eq("parent_organization_id", PLATFORM_ORGANIZATION_ID)
    .order("resource_key");
  if (organizationId) query = query.eq("child_organization_id", organizationId);
  return query;
}
