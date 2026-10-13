import { supabase } from "@/lib/supabase";

export type CatalogTechnicalTemplate = {
  id: string;
  equipment_type_id: string;
  field_key: string;
  label: string;
  field_type: "text" | "number";
  required: boolean;
  sort_order: number;
  is_active: boolean;
};
export type CatalogChecklistTemplate = {
  id: string;
  equipment_type_id: string;
  stage_code: string;
  title: string;
  description: string | null;
  response_type: "conformity" | "yes_no" | "confirmation" | "text" | "number";
  allow_na: boolean;
  is_required: boolean;
  photo_requirement: "none" | "optional" | "required" | "required_on_failure";
  observation_requirement: "none" | "optional" | "required" | "required_on_failure";
  sort_order: number;
  is_active: boolean;
};
export type OfficialTemplates = {
  technical: CatalogTechnicalTemplate[];
  checklists: CatalogChecklistTemplate[];
};

export async function loadUnionCatalogTemplates(equipmentId: string): Promise<OfficialTemplates> {
  const { data, error } = await supabase.rpc("list_union_catalog_templates_v1", {
    p_catalog_equipment_id: equipmentId,
  });
  if (error) throw error;
  const raw = (data ?? {}) as Partial<OfficialTemplates>;
  return {
    technical: Array.isArray(raw.technical) ? raw.technical : [],
    checklists: Array.isArray(raw.checklists) ? raw.checklists : [],
  };
}

export async function saveUnionCatalogTemplate(
  kind: "technical" | "checklist", equipmentId: string, id: string | null,
  payload: Record<string, string | number | boolean | null>,
): Promise<string> {
  const { data, error } = await supabase.rpc("save_union_catalog_template_v1", {
    p_kind: kind,
    p_id: id,
    p_catalog_equipment_id: equipmentId,
    p_payload: payload,
  });
  if (error) throw error;
  if (typeof data !== "string") throw new Error("A Union não confirmou o salvamento do template.");
  return data;
}
