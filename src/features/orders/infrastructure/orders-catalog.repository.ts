import { supabase } from "@/lib/supabase";
import { getActiveOrganizationId } from "@/lib/active-organization";

export async function findEquipmentTypeByName(name: string) {
  const organizationId = await getActiveOrganizationId();
  return supabase
    .from("equipment_types")
    .select("*")
    .eq("organization_id", organizationId)
    .ilike("name", name)
    .maybeSingle();
}

export async function createEquipmentType(payload: Record<string, unknown>) {
  const organizationId = await getActiveOrganizationId();
  return supabase
    .from("equipment_types")
    .insert({ ...payload, organization_id: organizationId })
    .select("*")
    .single();
}

export async function findEquipmentBrandByName(equipmentTypeId: string, name: string) {
  const organizationId = await getActiveOrganizationId();
  return supabase
    .from("equipment_brands")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("equipment_type_id", equipmentTypeId)
    .ilike("name", name)
    .maybeSingle();
}

export async function createEquipmentBrand(payload: Record<string, unknown>) {
  const organizationId = await getActiveOrganizationId();
  return supabase
    .from("equipment_brands")
    .insert({ ...payload, organization_id: organizationId })
    .select("*")
    .single();
}

export async function findEquipmentModelByName(equipmentBrandId: string, name: string) {
  const organizationId = await getActiveOrganizationId();
  return supabase
    .from("equipment_models")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("equipment_brand_id", equipmentBrandId)
    .ilike("name", name)
    .maybeSingle();
}

export async function createEquipmentModel(payload: Record<string, unknown>) {
  const organizationId = await getActiveOrganizationId();
  return supabase
    .from("equipment_models")
    .insert({ ...payload, organization_id: organizationId })
    .select("*")
    .single();
}

export async function createServiceType(payload: Record<string, unknown>) {
  const organizationId = await getActiveOrganizationId();
  return supabase
    .from("service_types")
    .insert({ ...payload, organization_id: organizationId })
    .select("id,title,description,forecast_days,is_active,sort_order")
    .single();
}
