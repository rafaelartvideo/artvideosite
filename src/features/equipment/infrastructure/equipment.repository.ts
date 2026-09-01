import { supabase } from "@/lib/supabase";
import {
  equipmentSlug,
  type EquipmentCatalog,
  type EquipmentDraft,
} from "../domain/equipment";

export async function loadEquipmentCatalog(): Promise<EquipmentCatalog> {
  const [typesResult, brandsResult, modelsResult] = await Promise.all([
    supabase.from("equipment_types").select("*").order("sort_order").order("name"),
    supabase.from("equipment_brands").select("*").order("sort_order").order("name"),
    supabase.from("equipment_models").select("*").order("sort_order").order("name"),
  ]);

  const error = typesResult.error || brandsResult.error || modelsResult.error;
  if (error) throw error;

  return {
    types: typesResult.data ?? [],
    brands: brandsResult.data ?? [],
    models: modelsResult.data ?? [],
  };
}

async function saveAndGetId(
  table: string,
  payload: Record<string, unknown>,
  id: string | undefined,
  errorMessage: string,
): Promise<string> {
  const query = id
    ? supabase.from(table).update(payload).eq("id", id)
    : supabase.from(table).insert(payload);

  const { data, error } = await query.select("id").single();
  if (error || !data?.id) throw error ?? new Error(errorMessage);
  return data.id;
}

export async function saveEquipmentHierarchy(
  drafts: EquipmentDraft[],
  catalog: EquipmentCatalog,
): Promise<void> {
  for (const type of drafts) {
    const originalType = type.id
      ? catalog.types.find((item) => item.id === type.id)
      : undefined;
    const originalBrands = originalType
      ? catalog.brands.filter((item) => item.equipment_type_id === originalType.id)
      : [];

    const typeId = await saveAndGetId(
      "equipment_types",
      {
        name: type.name.trim(),
        slug: equipmentSlug(type.name),
        is_active: type.is_active,
        sort_order: 0,
      },
      type.id,
      "Tipo de equipamento não foi salvo.",
    );

    for (const brand of type.brands) {
      const originalBrand = brand.id
        ? originalBrands.find((item) => item.id === brand.id)
        : undefined;
      const originalModels = originalBrand
        ? catalog.models.filter((item) => item.equipment_brand_id === originalBrand.id)
        : [];

      const brandId = await saveAndGetId(
        "equipment_brands",
        {
          name: brand.name.trim(),
          slug: equipmentSlug(brand.name),
          equipment_type_id: typeId,
          is_active: brand.is_active,
          sort_order: 0,
        },
        brand.id,
        "Marca técnica não foi salva.",
      );

      for (const model of brand.models) {
        const payload = {
          name: model.name.trim(),
          slug: equipmentSlug(model.name),
          equipment_brand_id: brandId,
          is_active: model.is_active,
          sort_order: 0,
        };

        const { error } = model.id
          ? await supabase.from("equipment_models").update(payload).eq("id", model.id)
          : await supabase.from("equipment_models").insert(payload);

        if (error) throw error;
      }

      for (const oldModel of originalModels.filter(
        (item) => !brand.models.some((model) => model.id === item.id),
      )) {
        const { error } = await supabase
          .from("equipment_models")
          .delete()
          .eq("id", oldModel.id);

        if (error) throw error;
      }
    }

    for (const oldBrand of originalBrands.filter(
      (item) => !type.brands.some((brand) => brand.id === item.id),
    )) {
      const { error: modelsError } = await supabase
        .from("equipment_models")
        .delete()
        .eq("equipment_brand_id", oldBrand.id);

      if (modelsError) throw modelsError;

      const { error: brandError } = await supabase
        .from("equipment_brands")
        .delete()
        .eq("id", oldBrand.id);

      if (brandError) throw brandError;
    }
  }
}
