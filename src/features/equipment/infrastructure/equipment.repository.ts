import { supabase } from "@/lib/supabase";
import { getActiveOrganizationId } from "@/lib/active-organization";
import { generateUniqueSlug } from "@/shared/infrastructure/unique-slug.repository";
import { saveEquipmentChecklistConfiguration } from "@/features/checklists/infrastructure/checklists.repository";
import type { EquipmentCatalog, EquipmentDraft } from "../domain/equipment";

type CatalogWriteError = {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
};

function toCatalogError(error: unknown, fallback: string): Error {
  const typed = (error ?? {}) as CatalogWriteError;
  const raw = [typed.message, typed.details, typed.hint].filter(Boolean).join(" ");

  if (typed.code === "23505") {
    if (raw.includes("equipment_types_organization_name_uidx")) return new Error("Já existe um equipamento com este nome nesta empresa.");
    if (raw.includes("equipment_brands_type_name_uidx")) return new Error("Já existe uma marca com este nome neste equipamento.");
    if (raw.includes("equipment_models_brand_name_uidx")) return new Error("Já existe um modelo com este nome nesta marca.");
    return new Error("Já existe um cadastro com este nome.");
  }

  if (error instanceof Error) return error;
  return new Error(raw || fallback);
}

export async function loadEquipmentCatalog(): Promise<EquipmentCatalog> {
  const organizationId = await getActiveOrganizationId();
  const [typesResult, brandsResult, modelsResult, fieldsResult, linksResult, checklistProfilesResult, checklistStagesResult, checklistItemsResult] = await Promise.all([
    supabase.from("equipment_types").select("*").eq("organization_id", organizationId).order("sort_order").order("name"),
    supabase.from("equipment_brands").select("*").eq("organization_id", organizationId).order("sort_order").order("name"),
    supabase.from("equipment_models").select("*").eq("organization_id", organizationId).order("sort_order").order("name"),
    supabase.from("technical_fields").select("*").eq("organization_id", organizationId).order("sort_order").order("label"),
    supabase.from("equipment_type_technical_fields").select("*").eq("organization_id", organizationId).order("sort_order"),
    supabase.from("checklist_profiles").select("id,name,version,is_active").eq("organization_id", organizationId).order("name"),
    supabase.from("checklist_profile_stages").select("id,profile_id,code,name,stage_type,sort_order,is_active").eq("organization_id", organizationId).eq("is_active", true).order("sort_order"),
    supabase.from("equipment_checklist_items").select("*").eq("organization_id", organizationId).order("sort_order"),
  ]);

  const error = typesResult.error || brandsResult.error || modelsResult.error || fieldsResult.error || linksResult.error || checklistProfilesResult.error || checklistStagesResult.error || checklistItemsResult.error;
  if (error) throw error;

  return {
    types: typesResult.data ?? [],
    brands: brandsResult.data ?? [],
    models: modelsResult.data ?? [],
    technicalFields: fieldsResult.data ?? [],
    technicalFieldLinks: linksResult.data ?? [],
    checklistProfiles: checklistProfilesResult.data ?? [],
    checklistStages: checklistStagesResult.data ?? [],
    equipmentChecklistItems: checklistItemsResult.data ?? [],
  } as EquipmentCatalog;
}

export async function listServiceOrderTechnicalValues(serviceOrderId: string) {
  const organizationId = await getActiveOrganizationId();
  const result = await supabase.from("service_order_technical_values").select("*").eq("organization_id", organizationId).eq("service_order_id", serviceOrderId).order("created_at");
  if (result.error) throw result.error;
  return result.data ?? [];
}

export async function saveTechnicalField(field: { id?: string; label: string; field_key?: string; field_type: "text" | "number"; is_active: boolean; sort_order: number; }) {
  const organizationId = await getActiveOrganizationId();
  const payload = { ...(field.id ? {} : { field_key: field.field_key, organization_id: organizationId }), label: field.label.trim(), field_type: field.field_type, is_active: field.is_active, sort_order: field.sort_order };
  const query = field.id ? supabase.from("technical_fields").update(payload).eq("id", field.id).eq("organization_id", organizationId) : supabase.from("technical_fields").insert(payload);
  const result = await query.select("*").single();
  if (result.error) throw result.error;
  return result.data;
}

export async function saveEquipmentTypeTechnicalFields(equipmentTypeId: string, links: Array<{ technical_field_id: string; required: boolean; sort_order: number }>) {
  const organizationId = await getActiveOrganizationId();
  const current = await supabase.from("equipment_type_technical_fields").select("technical_field_id").eq("organization_id", organizationId).eq("equipment_type_id", equipmentTypeId);
  if (current.error) throw current.error;
  const nextIds = new Set(links.map(link => link.technical_field_id));
  const removedIds = (current.data ?? []).map(link => link.technical_field_id).filter(fieldId => !nextIds.has(fieldId));
  if (removedIds.length) {
    const removed = await supabase.from("equipment_type_technical_fields").delete().eq("organization_id", organizationId).eq("equipment_type_id", equipmentTypeId).in("technical_field_id", removedIds);
    if (removed.error) throw removed.error;
  }
  if (!links.length) return;
  const result = await supabase.from("equipment_type_technical_fields").upsert(links.map(link => ({ organization_id: organizationId, equipment_type_id: equipmentTypeId, ...link })), { onConflict: "equipment_type_id,technical_field_id" });
  if (result.error) throw result.error;
}

export async function saveServiceOrderTechnicalValues(serviceOrderId: string, values: Array<{ technical_field_id: string; field_key_snapshot: string; label_snapshot: string; field_type_snapshot: "text" | "number"; value_text?: string | null; value_number?: number | null; }>) {
  if (!values.length) return;
  const organizationId = await getActiveOrganizationId();
  const result = await supabase.from("service_order_technical_values").upsert(values.map(value => ({ organization_id: organizationId, service_order_id: serviceOrderId, ...value })), { onConflict: "service_order_id,technical_field_id" });
  if (result.error) throw result.error;
}

async function saveAndGetId(table: string, payload: Record<string, unknown>, id: string | undefined, organizationId: string, errorMessage: string): Promise<string> {
  const query = id ? supabase.from(table).update(payload).eq("id", id).eq("organization_id", organizationId) : supabase.from(table).insert({ ...payload, organization_id: organizationId });
  const { data, error } = await query.select("id").single();
  if (error) throw toCatalogError(error, errorMessage);
  if (!data?.id) throw new Error(errorMessage);
  return data.id;
}

export async function saveEquipmentHierarchy(drafts: EquipmentDraft[], catalog: EquipmentCatalog): Promise<void> {
  const organizationId = await getActiveOrganizationId();

  for (const type of drafts) {
    const originalType = type.id ? catalog.types.find(item => item.id === type.id) : undefined;
    const originalBrands = originalType ? catalog.brands.filter(item => item.equipment_type_id === originalType.id) : [];
    const typeSlug = await generateUniqueSlug("equipment_types", type.name, type.id);
    const typeId = await saveAndGetId("equipment_types", { name: type.name.trim(), slug: typeSlug, is_active: type.is_active, sort_order: 0 }, type.id, organizationId, "Tipo de equipamento não foi salvo.");

    await saveEquipmentTypeTechnicalFields(typeId, type.technicalFields);
    await saveEquipmentChecklistConfiguration(typeId, type.checklist_profile_id, type.checklistItems);

    for (const brand of type.brands) {
      const originalBrand = brand.id ? originalBrands.find(item => item.id === brand.id) : undefined;
      const originalModels = originalBrand ? catalog.models.filter(item => item.equipment_brand_id === originalBrand.id) : [];
      const brandSlug = await generateUniqueSlug("equipment_brands", brand.name, brand.id);
      const brandId = await saveAndGetId("equipment_brands", { name: brand.name.trim(), slug: brandSlug, equipment_type_id: typeId, is_active: brand.is_active, sort_order: 0 }, brand.id, organizationId, "Marca técnica não foi salva.");

      for (const model of brand.models) {
        const modelSlug = await generateUniqueSlug("equipment_models", model.name, model.id);
        const payload = { name: model.name.trim(), slug: modelSlug, equipment_brand_id: brandId, is_active: model.is_active, sort_order: 0 };
        const { error } = model.id ? await supabase.from("equipment_models").update(payload).eq("id", model.id).eq("organization_id", organizationId) : await supabase.from("equipment_models").insert({ ...payload, organization_id: organizationId });
        if (error) throw toCatalogError(error, "Modelo não foi salvo.");
      }
      for (const oldModel of originalModels.filter(item => !brand.models.some(model => model.id === item.id))) {
        const { error } = await supabase.from("equipment_models").delete().eq("id", oldModel.id).eq("organization_id", organizationId);
        if (error) throw error;
      }
    }

    for (const oldBrand of originalBrands.filter(item => !type.brands.some(brand => brand.id === item.id))) {
      const { error: modelsError } = await supabase.from("equipment_models").delete().eq("equipment_brand_id", oldBrand.id).eq("organization_id", organizationId);
      if (modelsError) throw modelsError;
      const { error: brandError } = await supabase.from("equipment_brands").delete().eq("id", oldBrand.id).eq("organization_id", organizationId);
      if (brandError) throw brandError;
    }
  }
}