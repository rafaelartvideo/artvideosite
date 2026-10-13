import { supabase } from "@/lib/supabase";

export type UnionSegment = {
  id: string;
  code: string;
  name: string;
  description: string;
  icon_name: string;
  sort_order: number;
  is_active: boolean;
};
export type UnionEquipmentType = {
  id: string;
  code: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  is_published: boolean;
};
export type UnionBrand = {
  id: string;
  name: string;
  is_active: boolean;
  is_published: boolean;
};
export type UnionCatalogData = {
  revision: number;
  segments: UnionSegment[];
  equipmentTypes: UnionEquipmentType[];
  brands: UnionBrand[];
  segmentEquipment: Array<{ segment_id: string; equipment_type_id: string }>;
  equipmentBrands: Array<{ equipment_type_id: string; brand_id: string }>;
};
export type UnionCatalogKind = "segment" | "equipment" | "brand";
export type UnionCatalogLinkKind = "segment_equipment" | "equipment_brand";

export async function loadUnionCatalogAdmin(): Promise<UnionCatalogData> {
  const { data, error } = await supabase.rpc("load_union_catalog_admin_v1");
  if (error) throw error;
  const raw = (data ?? {}) as Partial<UnionCatalogData>;
  return {
    revision: typeof raw.revision === "number" ? raw.revision : 0,
    segments: Array.isArray(raw.segments) ? raw.segments : [],
    equipmentTypes: Array.isArray(raw.equipmentTypes) ? raw.equipmentTypes : [],
    brands: Array.isArray(raw.brands) ? raw.brands : [],
    segmentEquipment: Array.isArray(raw.segmentEquipment) ? raw.segmentEquipment : [],
    equipmentBrands: Array.isArray(raw.equipmentBrands) ? raw.equipmentBrands : [],
  };
}

export async function saveUnionCatalogItem(
  kind: UnionCatalogKind,
  id: string | null,
  payload: Record<string, string | number | boolean>,
): Promise<string> {
  const { data, error } = await supabase.rpc("save_union_catalog_item_v1", {
    p_kind: kind,
    p_id: id,
    p_payload: payload,
  });
  if (error) throw error;
  if (typeof data !== "string") throw new Error("Não foi possível confirmar o cadastro.");
  return data;
}

export async function setUnionCatalogLink(
  kind: UnionCatalogLinkKind,
  leftId: string,
  rightId: string,
  enabled: boolean,
): Promise<void> {
  const { error } = await supabase.rpc("set_union_catalog_link_v1", {
    p_kind: kind,
    p_left_id: leftId,
    p_right_id: rightId,
    p_enabled: enabled,
  });
  if (error) throw error;
}
