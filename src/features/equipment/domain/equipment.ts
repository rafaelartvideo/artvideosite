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
  technicalFields: Array<{ technical_field_id: string; required: boolean; sort_order: number }>;
  brands: EquipmentDraftBrand[];
};

export type EquipmentTypeRow = {
  id: string;
  name: string;
  is_active: boolean;
};

export type EquipmentBrandRow = {
  id: string;
  name: string;
  is_active: boolean;
  equipment_type_id: string;
};

export type EquipmentModelRow = {
  id: string;
  name: string;
  is_active: boolean;
  equipment_brand_id: string;
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
};
