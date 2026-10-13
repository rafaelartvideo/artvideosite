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
