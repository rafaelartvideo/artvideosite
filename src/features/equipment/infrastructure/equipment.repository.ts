import { supabase } from "@/lib/supabase";
import { generateUniqueSlug } from "@/shared/infrastructure/unique-slug.repository";
import type { EquipmentCatalog, EquipmentDraft } from "../domain/equipment";

export async function loadEquipmentCatalog(): Promise<EquipmentCatalog> {
  const [typesResult, brandsResult, modelsResult, fieldsResult, linksResult] = await Promise.all([
    supabase.from("equipment_types").select("*").order("sort_order").order("name"),
    supabase.from("equipment_brands").select("*").order("sort_order").order("name"),
    supabase.from("equipment_models").select("*").order("sort_order").order("name"),
    supabase.from("technical_fields").select("*").order("sort_order").order("label"),
    supabase.from("equipment_type_technical_fields").select("*").order("sort_order"),
  ]);

  const error = typesResult.error || brandsResult.error || modelsResult.error || fieldsResult.error || linksResult.error;
  if (error) throw error;

  return {
    types: typesResult.data ?? [],
    brands: brandsResult.data ?? [],
    models: modelsResult.data ?? [],
    technicalFields: fieldsResult.data ?? [],
    technicalFieldLinks: linksResult.data ?? [],
  };
}

export async function listServiceOrderTechnicalValues(serviceOrderId: string) {
  const result = await supabase.from("service_order_technical_values").select("*").eq("service_order_id", serviceOrderId).order("created_at");
  if (result.error) throw result.error;
  return result.data ?? [];
}

export async function saveTechnicalField(field: { id?: string; label: string; field_key?: string; field_type: "text" | "number"; is_active: boolean; sort_order: number; }) {
  const payload = { ...(field.id ? {} : { field_key: field.field_key }), label: field.label.trim(), field_type: field.field_type, is_active: field.is_active, sort_order: field.sort_order };
  const query = field.id ? supabase.from("technical_fields").update(payload).eq("id", field.id) : supabase.from("technical_fields").insert(payload);
  const result = await query.select("*").single();
  if (result.error) throw result.error;
  return result.data;
}

export async function saveEquipmentTypeTechnicalFields(equipmentTypeId: string, links: Array<{ technical_field_id: string; required: boolean; sort_order: number }>) {
  const current = await supabase.from("equipment_type_technical_fields").select("technical_field_id").eq("equipment_type_id", equipmentTypeId);
  if (current.error) throw current.error;

  const nextIds = new Set(links.map(link => link.technical_field_id));
  const removedIds = (current.data ?? []).map(link => link.technical_field_id).filter(fieldId => !nextIds.has(fieldId));
  if (removedIds.length) {
    const removed = await supabase.from("equipment_type_technical_fields").delete().eq("equipment_type_id", equipmentTypeId).in("technical_field_id", removedIds);
    if (removed.error) throw removed.error;
  }

  if (!links.length) return;
  const result = await supabase.from("equipment_type_technical_fields").upsert(links.map(link => ({ equipment_type_id: equipmentTypeId, ...link })), { onConflict: "equipment_type_id,technical_field_id" });
  if (result.error) throw result.error;
}

export async function saveServiceOrderTechnicalValues(serviceOrderId: string, values: Array<{ technical_field_id: string; field_key_snapshot: string; label_snapshot: string; field_type_snapshot: "text" | "number"; value_text?: string | null; value_number?: number | null; }>) {
  if (!values.length) return;
  const result = await supabase.from("service_order_technical_values").upsert(values.map(value => ({ service_order_id: serviceOrderId, ...value })), { onConflict: "service_order_id,technical_field_id" });
  if (result.error) throw result.error;
}

async function saveAndGetId(table: string, payload: Record<string, unknown>, id: string | undefined, errorMessage: string): Promise<string> {
  const query = id ? supabase.from(table).update(payload).eq("id", id) : supabase.from(table).insert(payload);
  const { data, error } = await query.select("id").single();
  if (error || !data?.id) throw error ?? new Error(errorMessage);
  return data.id;
}

export async function saveEquipmentHierarchy(drafts: EquipmentDraft[], catalog: EquipmentCatalog): Promise<void> {
  for (const type of drafts) {
    const originalType = type.id ? catalog.types.find(item => item.id === type.id) : undefined;
    const originalBrands = originalType ? catalog.brands.filter(item => item.equipment_type_id === originalType.id) : [];
    const typeSlug = await generateUniqueSlug("equipment_types", type.name, type.id);

    const typeId = await saveAndGetId("equipment_types", { name: type.name.trim(), slug: typeSlug, is_active: type.is_active, sort_order: 0 }, type.id, "Tipo de equipamento não foi salvo.");
    await saveEquipmentTypeTechnicalFields(typeId, type.technicalFields);

    for (const brand of type.brands) {
      const originalBrand = brand.id ? originalBrands.find(item => item.id === brand.id) : undefined;
      const originalModels = originalBrand ? catalog.models.filter(item => item.equipment_brand_id === originalBrand.id) : [];
      const brandSlug = await generateUniqueSlug("equipment_brands", brand.name, brand.id);

      const brandId = await saveAndGetId("equipment_brands", { name: brand.name.trim(), slug: brandSlug, equipment_type_id: typeId, is_active: brand.is_active, sort_order: 0 }, brand.id, "Marca técnica não foi salva.");

      for (const model of brand.models) {
        const modelSlug = await generateUniqueSlug("equipment_models", model.name, model.id);
        const payload = { name: model.name.trim(), slug: modelSlug, equipment_brand_id: brandId, is_active: model.is_active, sort_order: 0 };
        const { error } = model.id ? await supabase.from("equipment_models").update(payload).eq("id", model.id) : await supabase.from("equipment_models").insert(payload);
        if (error) throw error;
      }

      for (const oldModel of originalModels.filter(item => !brand.models.some(model => model.id === item.id))) {
        const { error } = await supabase.from("equipment_models").delete().eq("id", oldModel.id);
        if (error) throw error;
      }
    }

    for (const oldBrand of originalBrands.filter(item => !type.brands.some(brand => brand.id === item.id))) {
      const { error: modelsError } = await supabase.from("equipment_models").delete().eq("equipment_brand_id", oldBrand.id);
      if (modelsError) throw modelsError;
      const { error: brandError } = await supabase.from("equipment_brands").delete().eq("id", oldBrand.id);
      if (brandError) throw brandError;
    }
  }
}
