import type { EquipmentChecklistItem } from "@/features/checklists/domain/checklist";

export type EquipmentDraftModel = {
  id?: string;
  name: string;
  is_active: boolean;
};

export type EquipmentDraftBrand = {
  id?: string;
  name: string;
  is_active: boolean;
  models: EquipmentDraftModel[];
};

export type EquipmentDraft = {
  id?: string;
  name: string;
  is_active: boolean;
  checklist_profile_id: string | null;
  checklistItems: EquipmentChecklistItem[];
  technicalFields: Array<{ technical_field_id: string; required: boolean; sort_order: number }>;
  brands: EquipmentDraftBrand[];
};

export type EquipmentTypeRow = {
  id: string;
  name: string;
  is_active: boolean;
  checklist_profile_id: string | null;
  source_artvideo_id?: string | null;
};

export type EquipmentBrandRow = {
  id: string;
  name: string;
  is_active: boolean;
  equipment_type_id: string;
  source_artvideo_id?: string | null;
};

export type EquipmentModelRow = {
  id: string;
  name: string;
  is_active: boolean;
  equipment_brand_id: string;
  source_artvideo_id?: string | null;
};

export type TechnicalFieldType = "text" | "number";

export type TechnicalField = {
  id: string;
  field_key: string;
  label: string;
  field_type: TechnicalFieldType;
  is_active: boolean;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
  source_artvideo_id?: string | null;
};

export type EquipmentTypeTechnicalField = {
  equipment_type_id: string;
  technical_field_id: string;
  required: boolean;
  sort_order: number;
  technical_field?: TechnicalField;
};

export type ServiceOrderTechnicalValue = {
  id?: string;
  service_order_id: string;
  technical_field_id: string;
  field_key_snapshot: string;
  label_snapshot: string;
  field_type_snapshot: TechnicalFieldType;
  value_text: string | null;
  value_number: number | null;
  created_at?: string;
  updated_at?: string;
};

export type EquipmentCatalog = {
  types: EquipmentTypeRow[];
  brands: EquipmentBrandRow[];
  models: EquipmentModelRow[];
  technicalFields: TechnicalField[];
  technicalFieldLinks: EquipmentTypeTechnicalField[];
  checklistProfiles: Array<{ id: string; name: string; version: number; is_active: boolean }>;
  checklistStages: Array<{ id: string; profile_id: string; code: string; name: string; stage_type: string; sort_order: number; is_active: boolean }>;
  equipmentChecklistItems: EquipmentChecklistItem[];
};
