import { supabase } from "@/lib/supabase";

export type TenantTechnicalTemplate = {
  id: string;
  field_key: string;
  label: string;
  field_type: "text" | "number";
  required: boolean;
  sort_order: number;
  applied: boolean;
};
export type TenantChecklistTemplate = {
  id: string;
  stage_code: string;
  title: string;
  response_type: string;
  is_required: boolean;
  applied: boolean;
  can_apply: boolean;
};
export type TenantCatalogTemplates = {
  technical: TenantTechnicalTemplate[];
  checklists: TenantChecklistTemplate[];
};
export type CatalogNameUpdate = {
  id: string;
  equipment_id?: string;
  official_name: string;
  previous_name: string | null;
  local_name: string;
};
export type CatalogNameUpdates = {
  equipment: CatalogNameUpdate[];
  brands: CatalogNameUpdate[];
};

export async function loadTenantCatalogTemplates(organizationId: string, equipmentCatalogId: string): Promise<TenantCatalogTemplates> {
  const { data, error } = await supabase.rpc("load_company_catalog_templates_v1", {
    p_organization_id: organizationId, p_catalog_equipment_id: equipmentCatalogId,
  });
  if (error) throw error;
  const raw = (data ?? {}) as Partial<TenantCatalogTemplates>;
  return {
    technical: Array.isArray(raw.technical) ? raw.technical : [],
    checklists: Array.isArray(raw.checklists) ? raw.checklists : [],
  };
}

export async function addTenantCatalogTechnicalField(organizationId: string, equipmentCatalogId: string, templateId: string) {
  const { error } = await supabase.rpc("adopt_company_catalog_technical_field_v1", {
    p_organization_id: organizationId,
    p_catalog_equipment_id: equipmentCatalogId,
    p_template_id: templateId,
  });
  if (error) throw error;
}

export async function loadTenantCatalogNameUpdates(organizationId: string): Promise<CatalogNameUpdates> {
  const { data, error } = await supabase.rpc("load_company_catalog_name_updates_v1", {
    p_organization_id: organizationId,
  });
  if (error) throw error;
  const raw = (data ?? {}) as Partial<CatalogNameUpdates>;
  return {
    equipment: Array.isArray(raw.equipment) ? raw.equipment : [],
    brands: Array.isArray(raw.brands) ? raw.brands : [],
  };
}

export async function reviewTenantCatalogNameUpdate(
  organizationId: string,
  kind: "equipment" | "brand",
  catalogId: string,
  equipmentCatalogId: string | null,
  action: "apply" | "keep",
) {
  const { error } = await supabase.rpc("review_company_catalog_name_update_v1", {
    p_organization_id: organizationId,
    p_kind: kind,
    p_catalog_id: catalogId,
    p_equipment_catalog_id: equipmentCatalogId,
    p_action: action,
  });
  if (error) throw error;
}

export async function addTenantCatalogChecklistItem(
  organizationId: string, equipmentCatalogId: string, templateId: string,
) {
  const { error } = await supabase.rpc("adopt_company_catalog_checklist_item_v1", {
    p_organization_id: organizationId,
    p_catalog_equipment_id: equipmentCatalogId,
    p_catalog_template_id: templateId,
  });
  if (error) throw error;
}
