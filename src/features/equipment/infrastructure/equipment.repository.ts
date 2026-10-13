import { supabase } from "@/lib/supabase";
import { getActiveOrganizationId } from "@/lib/active-organization";
import { slugify } from "@/shared/domain/formatters";
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
  const { data, error } = await supabase.rpc("load_equipment_catalog_v1", {
    p_organization_id: organizationId,
  });
  if (error) throw error;

  const catalog = (data || {}) as Record<string, unknown>;
  return {
    types: Array.isArray(catalog.types) ? catalog.types : [],
    brands: Array.isArray(catalog.brands) ? catalog.brands : [],
    models: Array.isArray(catalog.models) ? catalog.models : [],
    technicalFields: Array.isArray(catalog.technicalFields) ? catalog.technicalFields : [],
    technicalFieldLinks: Array.isArray(catalog.technicalFieldLinks) ? catalog.technicalFieldLinks : [],
    checklistProfiles: Array.isArray(catalog.checklistProfiles) ? catalog.checklistProfiles : [],
    checklistStages: Array.isArray(catalog.checklistStages) ? catalog.checklistStages : [],
    equipmentChecklistItems: Array.isArray(catalog.equipmentChecklistItems) ? catalog.equipmentChecklistItems : [],
  } as EquipmentCatalog;
}

export type EquipmentBrandDirectoryEntry = { name: string };

/**
 * Central brands are read through the existing permission-checked catalog RPCs.
 * Partners see published brands for their segments; the platform sees its own
 * central directory. Company brands always come from the tenant catalog.
 */
export async function loadEquipmentBrandDirectory(
  isPlatformOperator: boolean,
  canViewUnionCatalog: boolean,
): Promise<string[]> {
  const organizationId = await getActiveOrganizationId();
  // Prefer the complete, publication-aware directory. Older databases keep
  // working with the existing segment-scoped suggestion RPC as fallback.
  if (!isPlatformOperator || canViewUnionCatalog) {
    const { data: names, error: directoryError } = await supabase.rpc(
      "load_equipment_brand_directory_v1", { p_organization_id: organizationId },
    );
    if (!directoryError) return Array.isArray(names) ? names.filter((name): name is string => typeof name === "string") : [];
    if (!["PGRST202", "42883"].includes(directoryError.code || "")) throw directoryError;
  }
  if (isPlatformOperator) {
    if (!canViewUnionCatalog) return [];
    const { data, error } = await supabase.rpc("load_union_catalog_admin_v1");
    if (error) throw error;
    const raw = (data || {}) as { brands?: Array<{ name: string; is_active: boolean }> };
    return (raw.brands || []).filter(item => item.is_active).map(item => item.name);
  }
  const { data, error } = await supabase.rpc("load_company_catalog_suggestions_v1", {
    p_organization_id: organizationId,
  });
  if (error) throw error;
  const raw = (data || {}) as { brands?: Array<{ name: string }> };
  return (raw.brands || []).map(item => item.name);
}

/** Cria registros de uma marca apenas para os equipamentos selecionados. */
export async function createEquipmentBrandForTypes(
  name: string, equipmentTypeIds: string[], catalog: EquipmentCatalog,
): Promise<void> {
  const organizationId = await getActiveOrganizationId();
  const cleanName = name.trim().replace(/\s+/g, " ");
  const typeIds = [...new Set(equipmentTypeIds)];
  if (!cleanName || cleanName.length > 120) throw new Error("Informe uma marca com até 120 caracteres.");
  if (!typeIds.length) throw new Error("Selecione ao menos um equipamento.");
  if (typeIds.some(id => !catalog.types.some(type => type.id === id && type.is_active))) {
    throw new Error("Selecione apenas equipamentos ativos desta empresa.");
  }
  const normalize = (value: string) => value.trim().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
  if (catalog.brands.some(brand => normalize(brand.name) === normalize(cleanName))) {
    throw new Error("Esta marca já está cadastrada. Selecione-a no cadastro do equipamento.");
  }
  const usedSlugs = new Set(catalog.brands.map(item => (item as { slug?: string }).slug).filter(Boolean));
  const base = slugify(cleanName) || "marca";
  const payload = typeIds.map(equipmentTypeId => {
    let slug = base;
    let n = 2;
    while (usedSlugs.has(slug)) slug = `${base}-${n++}`;
    usedSlugs.add(slug);
    return { organization_id: organizationId, equipment_type_id: equipmentTypeId,
      name: cleanName, slug, is_active: true, sort_order: 0 };
  });
  const { error } = await supabase.from("equipment_brands").insert(payload);
  if (error) throw toCatalogError(error, "Não foi possível cadastrar a marca.");
}

export type EquipmentServiceSettings = {
  services: Array<{ id: string; name: string; is_active: boolean }>;
  links: Array<{ equipment_type_id: string; general_service_id: string }>;
};

/** Read an organization's service catalog and links in one scoped request. */
export async function loadEquipmentServiceSettings(): Promise<EquipmentServiceSettings> {
  const organizationId = await getActiveOrganizationId();
  const { data, error } = await supabase.rpc("load_equipment_service_settings_v1", {
    p_organization_id: organizationId,
  });
  if (error) throw error;
  const payload = (data || {}) as Partial<EquipmentServiceSettings>;
  return {
    services: Array.isArray(payload.services) ? payload.services : [],
    links: Array.isArray(payload.links) ? payload.links : [],
  };
}

async function saveEquipmentServiceLinks(equipmentTypeId: string, serviceIds: string[], organizationId: string) {
  const { error } = await supabase.rpc("save_equipment_service_links_v1", {
    p_organization_id: organizationId,
    p_equipment_type_id: equipmentTypeId,
    p_service_ids: [...new Set(serviceIds)],
  });
  if (error) throw error;
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

export async function setEquipmentTypeActive(equipmentTypeId: string, isActive: boolean) {
  const organizationId = await getActiveOrganizationId();
  const result = await supabase
    .from("equipment_types")
    .update({ is_active: isActive })
    .eq("organization_id", organizationId)
    .eq("id", equipmentTypeId)
    .select("id,name,is_active")
    .single();

  if (result.error) throw toCatalogError(result.error, isActive ? "Equipamento não foi ativado." : "Equipamento não foi inativado.");
  return result.data;
}

export async function saveEquipmentTypeTechnicalFields(
  equipmentTypeId: string,
  links: Array<{ technical_field_id: string; required: boolean; sort_order: number }>,
  previousLinks?: Array<{ technical_field_id: string; required: boolean; sort_order: number }>,
  organizationIdOverride?: string,
) {
  const organizationId = organizationIdOverride ?? await getActiveOrganizationId();
  // Ao editar a estrutura, a versão já carregada do catálogo permite calcular
  // apenas os vínculos alterados. Não é necessário um SELECT adicional por equipamento.
  let existing = previousLinks;
  if (!existing) {
    const current = await supabase.from("equipment_type_technical_fields")
      .select("technical_field_id,required,sort_order")
      .eq("organization_id", organizationId)
      .eq("equipment_type_id", equipmentTypeId);
    if (current.error) throw current.error;
    existing = current.data ?? [];
  }

  const existingById = new Map(existing.map(link => [link.technical_field_id, link]));
  const nextIds = new Set(links.map(link => link.technical_field_id));
  const removedIds = existing.map(link => link.technical_field_id).filter(fieldId => !nextIds.has(fieldId));
  const changedLinks = links.filter(link => {
    const previous = existingById.get(link.technical_field_id);
    return !previous || previous.required !== link.required || Number(previous.sort_order) !== Number(link.sort_order);
  });

  if (removedIds.length) {
    const { error } = await supabase.from("equipment_type_technical_fields").delete()
      .eq("organization_id", organizationId)
      .eq("equipment_type_id", equipmentTypeId)
      .in("technical_field_id", removedIds);
    if (error) throw error;
  }
  if (!changedLinks.length) return;

  const { error } = await supabase.from("equipment_type_technical_fields").upsert(
    changedLinks.map(link => ({ organization_id: organizationId, equipment_type_id: equipmentTypeId, ...link })),
    { onConflict: "equipment_type_id,technical_field_id" },
  );
  if (error) throw error;
}

export async function saveServiceOrderTechnicalValues(serviceOrderId: string, values: Array<{ technical_field_id: string; field_key_snapshot: string; label_snapshot: string; field_type_snapshot: "text" | "number"; value_text?: string | null; value_number?: number | null; }>) {
  if (!values.length) return;
  const organizationId = await getActiveOrganizationId();
  const result = await supabase.from("service_order_technical_values").upsert(values.map(value => ({ organization_id: organizationId, service_order_id: serviceOrderId, ...value })), { onConflict: "service_order_id,technical_field_id" });
  if (result.error) throw result.error;
}

async function saveAndGetId(table: string, payload: Record<string, unknown>, id: string | undefined, organizationId: string, errorMessage: string): Promise<string> {
  if (id) {
    const { error } = await supabase.from(table).update(payload).eq("id", id).eq("organization_id", organizationId);
    if (error) throw toCatalogError(error, errorMessage);
    return id;
  }
  const { data, error } = await supabase.from(table).insert({ ...payload, organization_id: organizationId }).select("id").single();
  if (error) throw toCatalogError(error, errorMessage);
  if (!data?.id) throw new Error(errorMessage);
  return data.id;
}

export async function saveEquipmentHierarchy(drafts: EquipmentDraft[], catalog: EquipmentCatalog): Promise<void> {
  const organizationId = await getActiveOrganizationId();

  // Slugs existentes já vêm em load_equipment_catalog_v1. Evita um GET de toda
  // a tabela para cada marca/modelo. A unique constraint continua protegendo
  // gravações concorrentes.
  type CatalogSlug = { id: string; slug?: string | null };
  const slugSets = {
    types: new Set((catalog.types as CatalogSlug[]).map(item => item.slug).filter((slug): slug is string => Boolean(slug))),
    brands: new Set((catalog.brands as CatalogSlug[]).map(item => item.slug).filter((slug): slug is string => Boolean(slug))),
    models: new Set((catalog.models as CatalogSlug[]).map(item => item.slug).filter((slug): slug is string => Boolean(slug))),
  };
  const chooseSlug = (group: keyof typeof slugSets, name: string, previous?: CatalogSlug) => {
    const used = slugSets[group];
    // Um slug anterior só pertence ao item em edição.
    if (previous?.slug) used.delete(previous.slug);
    const base = slugify(name) || "item";
    let slug = base;
    for (let number = 2; used.has(slug); number += 1) slug = `${base}-${number}`;
    used.add(slug);
    return slug;
  };

  for (const type of drafts) {
    const originalType = type.id ? catalog.types.find(item => item.id === type.id) : undefined;
    const originalBrands = originalType ? catalog.brands.filter(item => item.equipment_type_id === originalType.id) : [];
    const trimmedTypeName = type.name.trim();
    const typeNameChanged = !originalType || trimmedTypeName !== originalType.name;
    const typeChanges: Record<string, unknown> = {};
    if (typeNameChanged) {
      typeChanges.name = trimmedTypeName;
      typeChanges.slug = chooseSlug("types", trimmedTypeName, originalType);
    }
    if (!originalType || type.is_active !== originalType.is_active) typeChanges.is_active = type.is_active;
    if (!originalType) typeChanges.sort_order = 0;

    const typeId = originalType && !Object.keys(typeChanges).length ? originalType.id :
      await saveAndGetId("equipment_types", typeChanges, type.id, organizationId, "Tipo de equipamento não foi salvo.");

    const previousLinks = (catalog.technicalFieldLinks ?? []).filter(link => link.equipment_type_id === type.id);
    const previousLinksById = new Map(previousLinks.map(link => [link.technical_field_id, link]));
    const technicalFieldsChanged = previousLinks.length !== type.technicalFields.length || type.technicalFields.some(link => {
      const original = previousLinksById.get(link.technical_field_id);
      return !original || original.required !== link.required || Number(original.sort_order) !== Number(link.sort_order);
    });
    if (technicalFieldsChanged) {
      await saveEquipmentTypeTechnicalFields(typeId, type.technicalFields, previousLinks, organizationId);
    }

    // Unedited or unavailable catalog links must never be removed accidentally.
    if (type.serviceIds !== undefined) {
      await saveEquipmentServiceLinks(typeId, type.serviceIds, organizationId);
    }

    const previousChecklistItems = (catalog.equipmentChecklistItems ?? []).filter(item => item.equipment_type_id === type.id);
    const checklistChanged =
      (originalType?.checklist_profile_id ?? null) !== (type.checklist_profile_id ?? null)
      || JSON.stringify(previousChecklistItems) !== JSON.stringify(type.checklistItems);
    if (checklistChanged) {
      await saveEquipmentChecklistConfiguration(typeId, type.checklist_profile_id, type.checklistItems, organizationId);
    }

    for (const brand of type.brands) {
      const originalBrand = brand.id ? originalBrands.find(item => item.id === brand.id) : undefined;
      const originalModels = originalBrand ? catalog.models.filter(item => item.equipment_brand_id === originalBrand.id) : [];
      const trimmedBrandName = brand.name.trim();
      const brandNameChanged = !originalBrand || trimmedBrandName !== originalBrand.name;
      const brandChanges: Record<string, unknown> = {};
      if (brandNameChanged) {
        brandChanges.name = trimmedBrandName;
        brandChanges.slug = chooseSlug("brands", trimmedBrandName, originalBrand);
      }
      if (!originalBrand || brand.is_active !== originalBrand.is_active) brandChanges.is_active = brand.is_active;
      if (!originalBrand) {
        brandChanges.equipment_type_id = typeId;
        brandChanges.sort_order = 0;
      }
      const brandId = originalBrand && !Object.keys(brandChanges).length ? originalBrand.id :
        await saveAndGetId("equipment_brands", brandChanges, brand.id, organizationId, "Marca técnica não foi salva.");

      const newModels: Array<Record<string, unknown>> = [];
      for (const model of brand.models) {
        const originalModel = model.id ? originalModels.find(item => item.id === model.id) : undefined;
        const trimmedModelName = model.name.trim().toLocaleUpperCase("pt-BR");
        const modelNameChanged = !originalModel || trimmedModelName !== originalModel.name;
        const modelChanges: Record<string, unknown> = {};
        if (modelNameChanged) {
          modelChanges.name = trimmedModelName;
          modelChanges.slug = chooseSlug("models", trimmedModelName, originalModel);
        }
        if (!originalModel || model.is_active !== originalModel.is_active) modelChanges.is_active = model.is_active;
        if (!originalModel) {
          modelChanges.equipment_brand_id = brandId;
          modelChanges.sort_order = 0;
        }
        if (originalModel && !Object.keys(modelChanges).length) continue;
        if (model.id) {
          const { error } = await supabase.from("equipment_models").update(modelChanges).eq("id", model.id).eq("organization_id", organizationId);
          if (error) throw toCatalogError(error, "Modelo não foi salvo.");
        } else {
          newModels.push({ ...modelChanges, organization_id: organizationId });
        }
      }
      // Vários modelos novos da mesma marca são enviados num único INSERT.
      if (newModels.length) {
        const { error } = await supabase.from("equipment_models").insert(newModels);
        if (error) throw toCatalogError(error, "Modelos não foram salvos.");
      }
      const removedModelIds = originalModels.filter(item => !brand.models.some(model => model.id === item.id)).map(item => item.id);
      if (removedModelIds.length) {
        const { error } = await supabase.from("equipment_models").delete().in("id", removedModelIds).eq("organization_id", organizationId);
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
