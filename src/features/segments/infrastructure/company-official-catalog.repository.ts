import { supabase } from "@/lib/supabase";

export type OfficialEquipmentSuggestion = {
  id: string;
  code: string;
  name: string;
  local_equipment_type_id: string | null;
  local_name: string | null;
  local_is_active: boolean | null;
};

export type OfficialBrandSuggestion = {
  id: string;
  equipment_type_id: string;
  name: string;
  local_equipment_brand_id: string | null;
  local_name: string | null;
  local_is_active: boolean | null;
};

export type CompanyOfficialCatalog = {
  revision: number;
  hasSegments: boolean;
  equipmentTypes: OfficialEquipmentSuggestion[];
  brands: OfficialBrandSuggestion[];
};

export async function loadCompanyOfficialCatalog(organizationId: string): Promise<CompanyOfficialCatalog> {
  const { data, error } = await supabase.rpc("load_company_catalog_suggestions_v1", {
    p_organization_id: organizationId,
  });
  if (error) throw error;
  const result = (data || {}) as Partial<CompanyOfficialCatalog>;
  return {
    revision: typeof result.revision === "number" ? result.revision : 0,
    hasSegments: result.hasSegments === true,
    equipmentTypes: Array.isArray(result.equipmentTypes) ? result.equipmentTypes : [],
    brands: Array.isArray(result.brands) ? result.brands : [],
  };
}

