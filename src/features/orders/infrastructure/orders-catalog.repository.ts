import { supabase } from "@/lib/supabase";

export const findEquipmentTypeByName = (name: string) =>
  supabase.from("equipment_types").select("*").ilike("name", name).maybeSingle();

export const createEquipmentType = (payload: Record<string, unknown>) =>
  supabase.from("equipment_types").insert(payload).select("*").single();

export const findEquipmentBrandByName = (equipmentTypeId: string, name: string) =>
  supabase
    .from("equipment_brands")
    .select("*")
    .eq("equipment_type_id", equipmentTypeId)
    .ilike("name", name)
    .maybeSingle();

export const createEquipmentBrand = (payload: Record<string, unknown>) =>
  supabase.from("equipment_brands").insert(payload).select("*").single();

export const findEquipmentModelByName = (equipmentBrandId: string, name: string) =>
  supabase
    .from("equipment_models")
    .select("*")
    .eq("equipment_brand_id", equipmentBrandId)
    .ilike("name", name)
    .maybeSingle();

export const createEquipmentModel = (payload: Record<string, unknown>) =>
  supabase.from("equipment_models").insert(payload).select("*").single();

export const createServiceType = (payload: Record<string, unknown>) =>
  supabase
    .from("service_types")
    .insert(payload)
    .select("id,title,description,forecast_days,is_active,sort_order")
    .single();