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

export type EquipmentCatalog = {
  types: EquipmentTypeRow[];
  brands: EquipmentBrandRow[];
  models: EquipmentModelRow[];
};

export function equipmentSlug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
